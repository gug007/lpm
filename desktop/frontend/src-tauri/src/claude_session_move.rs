//! Moving one Claude conversation to another of the user's accounts, for a tab
//! switched to that account by hand. The tab's `claude` is stopped first, then
//! the conversation's own files move into the account's config dir, where
//! `claude --resume` looks for them. Their contents are never read or
//! rewritten, and no login, credential or setting in either dir is touched.
use crate::claude_dirs::{find_transcript, modified, AccountDir};
use crate::pty::PtyState;
use crate::status::{StatusStore, STATUS_RUNNING};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State};

/// How long an interrupted turn gets to save where it stopped.
const INTERRUPT_WAIT: Duration = Duration::from_secs(2);
const INTERRUPT_POLL: Duration = Duration::from_millis(50);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TabMove {
    /// A saved conversation moved: Claude Code saves one only after the first
    /// message.
    moved: bool,
    /// A turn was running and was interrupted, for the tab to carry it on.
    interrupted: bool,
}

/// Stop a Claude tab's terminal and move its conversation to `account`, so the
/// tab can resume it there. A turn in progress is interrupted first.
#[tauri::command(async)]
pub fn move_claude_tab_to_account(
    app: AppHandle,
    state: State<'_, PtyState>,
    project_name: String,
    terminal_id: String,
    session_id: Option<String>,
    account: String,
) -> Result<TabMove, String> {
    let session_id = session_id.filter(|s| !s.is_empty());
    if session_id
        .as_deref()
        .is_some_and(|s| !crate::socketsrv::valid_session_id(s))
    {
        return Err("invalid session id".into());
    }
    let spawn = crate::claude_pool::chosen_spawn_env(&project_name, &account)?;
    let dest = crate::claude_transcripts::claude_sessions_root_of(spawn.env);
    let root = crate::config::spawn_info(&project_name)?.root;
    let find = || {
        session_id
            .as_deref()
            .and_then(|sid| find_transcript(&root, sid))
    };
    let found = find();
    let interrupted = interrupt_turn(
        &app,
        &project_name,
        &terminal_id,
        found.as_ref().map(|(_, path)| path.as_path()),
    );
    crate::pty::stop_terminal_and_wait(&app, &state, &terminal_id);
    // Interrupting only makes the copy found newer; one not saved yet may
    // have been saved by the end of the turn.
    let moved = match (found.or_else(find), session_id.as_deref()) {
        (Some(found), Some(sid)) => move_found(found, sid, &dest)?,
        _ => false,
    };
    Ok(TabMove { moved, interrupted })
}

/// Interrupt a turn in progress the way Esc does, so Claude Code ends it itself
/// and saves where it stopped, then wait for that save to reach the transcript.
/// True when a turn was running.
fn interrupt_turn(
    app: &AppHandle,
    project: &str,
    terminal_id: &str,
    transcript: Option<&Path>,
) -> bool {
    let running = app
        .state::<Arc<StatusStore>>()
        .live_agent_entries_on(project, terminal_id)
        .iter()
        .any(|e| e.value == STATUS_RUNNING);
    if !running || crate::pty::remote_write(app, terminal_id, "\x1b").is_err() {
        return false;
    }
    let Some(transcript) = transcript else {
        return true;
    };
    let before = modified(transcript);
    let deadline = Instant::now() + INTERRUPT_WAIT;
    while Instant::now() < deadline && modified(transcript) == before {
        std::thread::sleep(INTERRUPT_POLL);
    }
    true
}

/// Move a conversation from the config dir holding it into `dest`: the folder
/// beside its transcript (subagents, large tool results), its file checkpoints,
/// then the transcript itself, so a failure part way leaves the conversation
/// where it was. A folder `dest` already has is left alone.
fn move_found(
    (from, transcript): (AccountDir, PathBuf),
    session_id: &str,
    dest: &Path,
) -> Result<bool, String> {
    if from.dir == dest {
        return Ok(true);
    }
    let relative = transcript
        .strip_prefix(&from.dir)
        .map_err(|_| "the conversation isn't inside its account's folder".to_string())?;
    let moved_transcript = dest.join(relative);
    let folders = [
        (
            transcript.with_extension(""),
            moved_transcript.with_extension(""),
        ),
        (
            from.dir.join("file-history").join(session_id),
            dest.join("file-history").join(session_id),
        ),
    ];
    for (src, dst) in folders {
        if src.is_dir() && !dst.exists() {
            create_parent(&dst)?;
            crate::projects_crud::move_dir(&src, &dst)?;
        }
    }
    create_parent(&moved_transcript)?;
    move_file(&transcript, &moved_transcript)?;
    Ok(true)
}

fn create_parent(path: &Path) -> Result<(), String> {
    match path.parent() {
        Some(parent) => std::fs::create_dir_all(parent).map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

/// Rename, replacing a copy `to` may hold already (a fork leaves one behind),
/// or copy then delete across volumes.
fn move_file(from: &Path, to: &Path) -> Result<(), String> {
    match std::fs::rename(from, to) {
        Ok(()) => Ok(()),
        Err(e) if crate::projects_crud::crosses_volumes(&e) => {
            std::fs::copy(from, to).map_err(|e| format!("could not move the conversation: {e}"))?;
            std::fs::remove_file(from).map_err(|e| e.to_string())
        }
        Err(e) => Err(format!("could not move the conversation: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::claude_dirs::sessions_dir;

    const SID: &str = "0f8c2a51-6a8e-4c43-9a1e-2b7f3f5d9c10";
    const ROOT: &str = "/Users/me/Projects/app";

    fn held_by(config: &Path, transcript: PathBuf) -> (AccountDir, PathBuf) {
        let dir = AccountDir {
            id: "default".into(),
            dir: config.to_path_buf(),
            kind: crate::claude_dirs::DirKind::Home,
        };
        (dir, transcript)
    }

    fn seed(config: &Path) {
        let sessions = sessions_dir(config, ROOT);
        std::fs::create_dir_all(sessions.join(SID).join("subagents")).unwrap();
        std::fs::write(sessions.join(format!("{SID}.jsonl")), "{}\n").unwrap();
        std::fs::write(sessions.join(SID).join("subagents").join("a.jsonl"), "{}\n").unwrap();
        let history = config.join("file-history").join(SID);
        std::fs::create_dir_all(&history).unwrap();
        std::fs::write(history.join("x@v1"), "v1").unwrap();
    }

    #[test]
    fn moves_the_transcript_its_folder_and_checkpoints() {
        let tmp = tempfile::tempdir().unwrap();
        let from = tmp.path().join("from");
        let dest = tmp.path().join("dest");
        seed(&from);
        let source = sessions_dir(&from, ROOT);
        let target = sessions_dir(&dest, ROOT);

        let moved = move_found(
            held_by(&from, source.join(format!("{SID}.jsonl"))),
            SID,
            &dest,
        )
        .unwrap();

        assert!(moved);
        assert!(target.join(format!("{SID}.jsonl")).is_file());
        assert!(target.join(SID).join("subagents").join("a.jsonl").is_file());
        assert!(dest.join("file-history").join(SID).join("x@v1").is_file());
        assert!(!source.join(format!("{SID}.jsonl")).exists());
        assert!(!source.join(SID).exists());
        assert!(!from.join("file-history").join(SID).exists());
    }

    #[test]
    fn replaces_a_copy_the_destination_already_has() {
        let tmp = tempfile::tempdir().unwrap();
        let from = tmp.path().join("from");
        let dest = tmp.path().join("dest");
        seed(&from);
        let source = sessions_dir(&from, ROOT).join(format!("{SID}.jsonl"));
        std::fs::write(&source, "{}\n{}\n").unwrap();
        let stale = sessions_dir(&dest, ROOT).join(format!("{SID}.jsonl"));
        std::fs::create_dir_all(stale.parent().unwrap()).unwrap();
        std::fs::write(&stale, "{}\n").unwrap();

        move_found(held_by(&from, source), SID, &dest).unwrap();

        assert_eq!(std::fs::read_to_string(&stale).unwrap(), "{}\n{}\n");
    }
}
