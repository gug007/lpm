//! Minimal read-only tmux queries, mirroring the conventions in the app's
//! `src-tauri/src/tmux.rs`: the session name equals the project session name,
//! and panes are listed in creation order (pane N == service N).

use std::process::Command;

pub fn session_exists(name: &str) -> bool {
    // `.output()` (not `.status()`) so tmux's "can't find session" note on a
    // missing session is captured rather than leaking to our stderr.
    Command::new("tmux")
        .args(["has-session", "-t", name])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// One live pane of a session, in creation order.
pub struct Pane {
    pub id: String,
    pub pid: i64,
    pub current_command: String,
    pub current_path: String,
    pub title: String,
}

/// Panes for a session in creation order. Empty on error / no session.
pub fn list_panes(session: &str) -> Vec<Pane> {
    // Tab-separated so paths/titles with spaces survive.
    let fmt =
        "#{pane_id}\t#{pane_pid}\t#{pane_current_command}\t#{pane_current_path}\t#{pane_title}";
    let out = match Command::new("tmux")
        .args(["list-panes", "-t", session, "-F", fmt])
        .output()
    {
        Ok(o) if o.status.success() => o.stdout,
        _ => return Vec::new(),
    };
    String::from_utf8_lossy(&out)
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|line| {
            let mut f = line.splitn(5, '\t');
            Pane {
                id: f.next().unwrap_or("").to_string(),
                pid: f.next().and_then(|s| s.trim().parse().ok()).unwrap_or(0),
                current_command: f.next().unwrap_or("").to_string(),
                current_path: f.next().unwrap_or("").to_string(),
                title: f.next().unwrap_or("").to_string(),
            }
        })
        .collect()
}
