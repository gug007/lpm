//! "Continue on": move a Claude tab's session to a paired computer, or take
//! one back from it. The work goes as git objects the other side is missing,
//! committed and uncommitted alike, and the conversation as its transcript;
//! the receiving side lands both (handoffland.rs) and the tab resumes there.
//!
//! This computer drives both directions over the connection it opened: it
//! pushes through the handoff verbs (handoffhost.rs), and pulls the work
//! through the bring-changes ones and the conversation as a file.
use crate::gitbringapply as ga;
use crate::gitbringhost as packing;
use crate::gitbringrun::string_of;
use crate::handoffhost::{CHUNK_BYTES, MAX_PACK_BYTES, MAX_SESSION_BYTES};
use crate::handoffland::{self, Handed};
use crate::peerclient::PeerClientHub;
use crate::pty::PtyState;
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde::Serialize;
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::path::Path;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tempfile::TempPath;

const QUICK_TIMEOUT: Duration = Duration::from_secs(30);
const CHUNK_TIMEOUT: Duration = Duration::from_secs(60);
// Packing or checking out a large repository is slow.
const WORK_TIMEOUT: Duration = Duration::from_secs(180);
const PROGRESS_EVENT: &str = "handoff-progress";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Progress<'a> {
    terminal_id: &'a str,
    phase: &'a str,
    done: u64,
    total: u64,
}

/// What became of a session once its tab's terminal was stopped.
#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Moved {
    /// Why it didn't move. The tab resumes where it was.
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    branch: String,
    /// A turn was cut short by the move, for the tab to carry on.
    carries_on: bool,
}

impl Moved {
    fn from(moved: Result<String, String>, carries_on: bool) -> Self {
        match moved {
            Ok(branch) => Moved {
                branch,
                carries_on,
                error: None,
            },
            Err(error) => Moved {
                error: Some(error),
                ..Default::default()
            },
        }
    }
}

/// One move with the paired computer `slug`, for the tab `terminal_id`.
struct Job<'a> {
    app: &'a AppHandle,
    hub: PeerClientHub,
    slug: &'a str,
    terminal_id: &'a str,
}

impl<'a> Job<'a> {
    fn new(
        app: &'a AppHandle,
        slug: &'a str,
        terminal_id: &'a str,
        session_id: &str,
    ) -> Result<Self, String> {
        if !crate::socketsrv::valid_session_id(session_id) {
            return Err("invalid session id".into());
        }
        let hub = app.state::<PeerClientHub>().inner().clone();
        hub.require_handoff(slug)?;
        Ok(Job {
            app,
            hub,
            slug,
            terminal_id,
        })
    }

    fn ask(&self, timeout: Duration, frame: Value) -> Result<Value, String> {
        self.hub.peer_request(self.slug, timeout, frame)
    }

    fn progress(&self, phase: &str, done: u64, total: u64) {
        let _ = self.app.emit(
            PROGRESS_EVENT,
            Progress {
                terminal_id: self.terminal_id,
                phase,
                done,
                total,
            },
        );
    }
}

fn local_repo(project: &str) -> Result<String, String> {
    let root = crate::gitbring::local_root(project)?;
    crate::gitworkstate::head_sha(&root)
        .map_err(|_| format!("{project} isn't a Git repository with a commit yet"))?;
    Ok(root)
}

/// Move a Claude tab's session to the paired computer `slug`, into its
/// project at `target_root`. An error means nothing was touched; once the
/// tab's terminal is stopped the outcome comes back as `Moved`.
#[tauri::command(async)]
pub fn handoff_send(
    app: AppHandle,
    state: State<'_, PtyState>,
    project_name: String,
    terminal_id: String,
    session_id: String,
    slug: String,
    target_root: String,
) -> Result<Moved, String> {
    let job = Job::new(&app, &slug, &terminal_id, &session_id)?;
    let target_root = crate::gitbring::unmark(target_root.trim());
    let root = local_repo(&project_name)?;
    let (_, transcript) = crate::claude_dirs::find_transcript(&root, &session_id)
        .ok_or("there is no saved conversation yet. Send this tab a message, then move it")?;
    let opened = job.ask(
        QUICK_TIMEOUT,
        json!({ "t": "handoffOpen", "cwd": target_root }),
    )?;
    let id = string_of(&opened, "id");

    job.progress("stopping", 0, 0);
    let carries_on = crate::claude_session_move::interrupt_turn(
        &app,
        &project_name,
        &terminal_id,
        Some(&transcript),
    );
    crate::pty::stop_terminal_and_wait(&app, &state, &terminal_id);

    let sent = send(&job, &root, &transcript, &session_id, &id, &opened);
    if sent.is_err() {
        let _ = job.ask(QUICK_TIMEOUT, json!({ "t": "handoffClose", "id": id }));
    }
    Ok(Moved::from(sent, carries_on))
}

fn send(
    job: &Job,
    root: &str,
    transcript: &Path,
    session_id: &str,
    id: &str,
    opened: &Value,
) -> Result<String, String> {
    job.progress("packing", 0, 0);
    // Read now that nothing here is writing to the folder.
    let head = crate::gitworkstate::head_sha(root)?;
    let snapshot = packing::snapshot(root, &head)?.sha;
    let branch = packing::branch_of(root);
    let handed = Handed {
        head: &head,
        snapshot: snapshot.as_deref(),
        branch: branch.as_deref(),
    };
    let haves = packing::filter_haves(root, opened.get("have"));
    let pack = TempPath::try_from_path(packing::pack(root, handed.target(), &haves)?)
        .map_err(|e| e.to_string())?;
    upload(job, id, "pack", &pack, MAX_PACK_BYTES)?;
    upload(job, id, "session", transcript, MAX_SESSION_BYTES)?;
    drop(pack);

    job.progress("landing", 0, 0);
    let landed = job.ask(
        WORK_TIMEOUT,
        json!({
            "t": "handoffLand",
            "id": id,
            "head": handed.head,
            "snapshot": handed.snapshot,
            "branch": handed.branch,
            "sessionId": session_id,
        }),
    )?;
    // What stays in this folder is what was sent, so taking the session back
    // may replace it.
    let _ = handoffland::anchor(root, handed.target());
    Ok(string_of(&landed, "branch"))
}

fn upload(job: &Job, id: &str, part: &str, path: &Path, cap: u64) -> Result<(), String> {
    let mut file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let total = file.metadata().map(|m| m.len()).unwrap_or(0);
    if total > cap {
        return Err(format!(
            "that is too large to move ({} MB)",
            total / (1024 * 1024)
        ));
    }
    let mut buf = vec![0u8; CHUNK_BYTES as usize];
    let mut done = 0u64;
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            return Ok(());
        }
        job.ask(
            CHUNK_TIMEOUT,
            json!({ "t": "handoffPut", "id": id, "part": part, "b64": B64.encode(&buf[..n]) }),
        )?;
        done += n as u64;
        job.progress("sending", done, total);
    }
}

/// Take a Claude session from the paired computer `slug`'s project at
/// `source_root` into `project_name` here. An error means nothing was touched;
/// once the tab's terminal there is stopped the outcome comes back as `Moved`.
#[tauri::command(async)]
pub fn handoff_take(
    app: AppHandle,
    project_name: String,
    terminal_id: String,
    session_id: String,
    slug: String,
    source_root: String,
) -> Result<Moved, String> {
    let job = Job::new(&app, &slug, &terminal_id, &session_id)?;
    job.hub.require_git_bring(&slug)?;
    let source_root = crate::gitbring::unmark(source_root.trim());
    let root = local_repo(&project_name)?;
    handoffland::ensure_can_take(&project_name, &root)?;

    job.progress("stopping", 0, 0);
    let stopped = job.ask(
        QUICK_TIMEOUT,
        json!({
            "t": "handoffStop",
            "cwd": source_root,
            "terminalId": crate::gitbring::unmark(&terminal_id),
            "sessionId": session_id,
        }),
    )?;
    let carries_on = stopped["carriesOn"].as_bool().unwrap_or(false);

    let taken = take_work(&job, &project_name, &root, source_root).and_then(|branch| {
        take_session(&job, &project_name, &root, source_root, &session_id)?;
        Ok(branch)
    });
    let _ = app.emit("projects-changed", ());
    Ok(Moved::from(taken, carries_on))
}

fn take_work(job: &Job, project: &str, root: &str, source_root: &str) -> Result<String, String> {
    job.progress("packing", 0, 0);
    let prepared = job.ask(
        WORK_TIMEOUT,
        json!({ "t": "gitBringPrepare", "cwd": source_root, "have": ga::have_list(root) }),
    )?;
    let transfer_id = string_of(&prepared, "transferId");
    let head = string_of(&prepared, "head");
    let handed = Handed {
        head: &head,
        snapshot: prepared.get("snapshot").and_then(Value::as_str),
        branch: prepared.get("branch").and_then(Value::as_str),
    };
    let landed = download_pack(job, &transfer_id, &prepared).and_then(|pack| {
        job.progress("landing", 0, 0);
        handoffland::land(project, root, Some(&*pack), &handed)
    });
    let _ = job.ask(
        QUICK_TIMEOUT,
        json!({ "t": "gitBringDone", "transferId": transfer_id }),
    );
    let branch = landed?;
    // The other folder still holds what came from it, so sending the session
    // there again may replace it.
    let _ = job.ask(
        QUICK_TIMEOUT,
        json!({ "t": "handoffAnchor", "cwd": source_root, "sha": handed.target() }),
    );
    Ok(branch)
}

fn download_pack(job: &Job, transfer_id: &str, prepared: &Value) -> Result<TempPath, String> {
    let total = prepared.get("bytes").and_then(Value::as_u64).unwrap_or(0);
    let chunk = prepared.get("chunk").and_then(Value::as_u64).unwrap_or(0);
    into_temp_file(|file| {
        let mut received = 0u64;
        while let Some((offset, len)) = ga::next_chunk(received, total, chunk) {
            let reply = job.ask(
                CHUNK_TIMEOUT,
                json!({ "t": "gitBringChunk", "transferId": transfer_id, "offset": offset, "len": len }),
            )?;
            let bytes = B64
                .decode(string_of(&reply, "b64"))
                .map_err(|e| format!("damaged transfer: {e}"))?;
            if bytes.is_empty() {
                return Err(format!("the other {} stopped sending", crate::sys::MACHINE));
            }
            file.write_all(&bytes).map_err(|e| e.to_string())?;
            received += bytes.len() as u64;
            job.progress("receiving", received, total);
        }
        Ok(())
    })
}

fn take_session(
    job: &Job,
    project: &str,
    root: &str,
    source_root: &str,
    session_id: &str,
) -> Result<(), String> {
    let found = job.ask(
        QUICK_TIMEOUT,
        json!({ "t": "handoffSession", "cwd": source_root, "sessionId": session_id }),
    )?;
    let file = into_temp_file(|file| {
        crate::peerread::fetch(
            &job.hub,
            job.slug,
            &string_of(&found, "path"),
            &job.hub.peer_alias(job.slug),
            MAX_SESSION_BYTES,
            |piece| file.write_all(piece).map_err(|e| e.to_string()),
            |done, total| job.progress("receiving", done, total),
        )
    })?;
    handoffland::install_session(project, root, session_id, &file)
}

/// A temp file `fill` wrote, removed once dropped.
fn into_temp_file(
    fill: impl FnOnce(&mut std::fs::File) -> Result<(), String>,
) -> Result<TempPath, String> {
    let mut file = tempfile::Builder::new()
        .prefix("lpm-handoff-in-")
        .tempfile()
        .map_err(|e| e.to_string())?;
    fill(file.as_file_mut())?;
    file.as_file_mut().flush().map_err(|e| e.to_string())?;
    Ok(file.into_temp_path())
}
