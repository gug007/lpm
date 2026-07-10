//! Minimal read-only tmux queries, mirroring the conventions in the app's
//! `src-tauri/src/tmux.rs`: the session name equals the project session name,
//! and panes are listed in creation order (pane N == service N).

use std::collections::HashSet;
use std::process::Command;

/// Run tmux with args, returning trimmed stdout; errors carry stderr. Mirrors
/// the app's `tmux::run`.
fn run(args: &[&str]) -> Result<String, String> {
    let out = Command::new("tmux")
        .args(args)
        .output()
        .map_err(|e| format!("tmux: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "tmux {}: {}",
            args.first().copied().unwrap_or(""),
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Set of live tmux session names (`tmux list-sessions -F '#{session_name}'`).
/// Empty when no server is running or tmux is absent — both are non-errors.
/// Mirrors the app's `tmux::running_sessions`.
pub fn running_sessions() -> HashSet<String> {
    match Command::new("tmux")
        .args(["list-sessions", "-F", "#{session_name}"])
        .output()
    {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout)
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect(),
        _ => HashSet::new(),
    }
}

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

/// Recent scrollback for a pane (`capture-pane -p -J -S -<lines>`), trailing
/// newlines trimmed. Mirrors the app's `tmux::capture_pane`.
pub fn capture_pane(pane_id: &str, lines: i64) -> Result<String, String> {
    let from = format!("-{lines}");
    let out = run(&["capture-pane", "-t", pane_id, "-p", "-J", "-S", &from])?;
    Ok(out.trim_end_matches('\n').to_string())
}
