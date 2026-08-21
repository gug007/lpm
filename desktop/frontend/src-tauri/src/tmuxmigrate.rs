// One-time handover from the tmux era.
//
// Services used to run as panes of a tmux session named after the project. An
// lpm that updates while those sessions are up would simply stop seeing them:
// the dev servers keep running, keep holding their ports, and nothing in the app
// can stop them any more — the user is left to find them with `tmux` by hand.
//
// So on the first launch after the change, adopt the ending: tear down exactly
// the sessions that were lpm's (a configured project's session name, nothing
// else) and reap their process trees, so a following start finds its ports free.
// A marker file retires this for good, and everything here is skipped outright
// when tmux isn't installed — this is lpm's last tmux call, not a dependency.
use std::process::Command;

const MARKER: &str = ".tmux-handover-done";

pub fn run_once() {
    let marker = crate::config::lpm_dir().join(MARKER);
    if marker.exists() || !crate::sys::which("tmux") {
        return;
    }
    for session in lpm_sessions() {
        let roots: Vec<i32> = pane_pids(&session);
        // Snapshot before the kill: tmux hangs up the pane shell and its
        // children reparent to launchd, out of reach of any later walk.
        let victims = crate::proctree::trees(&roots);
        let _ = Command::new("tmux")
            .args(["kill-session", "-t", &format!("={session}")])
            .output();
        crate::proctree::kill_pids(&victims);
    }
    let _ = std::fs::create_dir_all(crate::config::lpm_dir());
    let _ = std::fs::write(&marker, b"");
}

/// Live tmux sessions whose name matches a configured project's session name.
/// A session the user started by hand is not lpm's to end, even if lpm's own
/// naming would have produced the same one.
fn lpm_sessions() -> Vec<String> {
    let out = Command::new("tmux")
        .args(["list-sessions", "-F", "#{session_name}"])
        .output();
    let Ok(out) = out else { return Vec::new() };
    if !out.status.success() {
        return Vec::new(); // no server running: nothing was left behind
    }
    let live: Vec<String> = String::from_utf8_lossy(&out.stdout)
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    let ours: std::collections::HashSet<String> = crate::config::project_names()
        .into_iter()
        .filter_map(|name| crate::config::spawn_info(&name).ok())
        .map(|info| info.session)
        .collect();
    live.into_iter().filter(|s| ours.contains(s)).collect()
}

fn pane_pids(session: &str) -> Vec<i32> {
    let out = Command::new("tmux")
        .args(["list-panes", "-t", &format!("={session}:"), "-F", "#{pane_pid}"])
        .output();
    match out {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout)
            .lines()
            .filter_map(|l| l.trim().parse().ok())
            .collect(),
        _ => Vec::new(),
    }
}
