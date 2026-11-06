// Where Claude Code keeps session transcripts, and the fork-into-copy copy.
//
// Claude Code keys session transcripts by cwd: `<config>/projects/<slug>/
// <session-id>.jsonl`, where slug is the absolute path with every
// non-alphanumeric byte replaced by '-'. Forking a session into a duplicated
// project therefore needs the source transcript copied under the copy's slug
// before `claude --resume --fork-session` runs there.
use std::path::PathBuf;

fn home() -> PathBuf {
    dirs::home_dir().unwrap_or_default()
}

pub(crate) fn claude_project_slug(root: &str) -> String {
    // Claude names the dir after its own cwd, which never carries Windows'
    // verbatim `\\?\` prefix (`C:\Users\me\app` -> `C--Users-me-app`).
    let root = if cfg!(windows) {
        root.strip_prefix(r"\\?\").unwrap_or(root)
    } else {
        root
    };
    root.chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect()
}

/// The config dir a project's `claude` actually reads sessions from, matching
/// the env decision `resolve_spawn` applies at pty spawn (pinned account dir,
/// ambient CLAUDE_CONFIG_DIR, or ~/.claude).
pub(crate) fn claude_sessions_root_of(env: crate::config::ClaudeEnv) -> PathBuf {
    match env {
        crate::config::ClaudeEnv::Dir(dir) => PathBuf::from(dir),
        crate::config::ClaudeEnv::Inherit => std::env::var(crate::config::CLAUDE_CONFIG_DIR_ENV)
            .map(PathBuf::from)
            .unwrap_or_else(|_| home().join(".claude")),
        crate::config::ClaudeEnv::Scrub => home().join(".claude"),
    }
}

/// Where claude keeps a project's transcripts — one `<session id>.jsonl` per
/// conversation.
pub(crate) fn claude_sessions_dir(env: crate::config::ClaudeEnv, project_root: &str) -> PathBuf {
    claude_sessions_root_of(env)
        .join("projects")
        .join(claude_project_slug(project_root))
}

/// Where claude keeps one session's transcript. The single builder for this
/// layout — session titles read the same file the fork copy writes.
pub(crate) fn claude_transcript_path(
    env: crate::config::ClaudeEnv,
    project_root: &str,
    session_id: &str,
) -> PathBuf {
    claude_sessions_dir(env, project_root).join(format!("{session_id}.jsonl"))
}

#[tauri::command(async)]
pub fn copy_claude_session_for_fork(
    source_project: String,
    dest_project: String,
    session_id: String,
    account: Option<String>,
) -> Result<(), String> {
    if session_id.is_empty()
        || !session_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err("invalid session id".into());
    }
    let src_root = crate::config::spawn_info(&source_project)?.root;
    let dst_root = crate::config::spawn_info(&dest_project)?.root;
    let file = format!("{session_id}.jsonl");
    // A fork is a new session, so it runs on the account the destination's
    // new sessions use, or the one its tab was moved to; the transcript has to
    // be there for it to resume.
    let (_, src) = crate::claude_dirs::find_transcript(&src_root, &session_id).ok_or(
        "no saved conversation yet — Claude Code saves one only after its first message. \
         Send this tab a message, then fork it.",
    )?;
    let dest_env = match account {
        Some(id) => crate::claude_pool::chosen_spawn_env(&dest_project, &id)?.env,
        None => crate::claude_pool::spawn_env(&dest_project, None, true).env,
    };
    let dst_dir = claude_sessions_dir(dest_env, &dst_root);
    if dst_dir.join(&file) == src {
        return Ok(());
    }
    std::fs::create_dir_all(&dst_dir).map_err(|e| e.to_string())?;
    std::fs::copy(&src, dst_dir.join(&file)).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_project_slug_dashes_every_non_alphanumeric() {
        assert_eq!(
            claude_project_slug("/Users/me/Projects/lpm"),
            "-Users-me-Projects-lpm"
        );
        assert_eq!(
            claude_project_slug("/Users/me/t_e.st dir"),
            "-Users-me-t-e-st-dir"
        );
    }

    #[test]
    fn claude_project_slug_matches_claudes_windows_project_dirs() {
        assert_eq!(
            claude_project_slug(r"C:\Users\dev\my-app"),
            "C--Users-dev-my-app"
        );
        assert_eq!(
            claude_project_slug("C:/Users/dev/my-app"),
            "C--Users-dev-my-app"
        );
    }
}
