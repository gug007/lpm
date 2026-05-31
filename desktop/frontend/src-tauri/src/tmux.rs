// tmux orchestration — port of internal/tmux/tmux.go. Pane-per-service layout
// in one window: service N == the Nth pane id from `list-panes`. All argv is
// verbatim from the Go code. Local-only for now (remote services rejected at
// the command layer, like PTY).
use crate::config;
use std::collections::{BTreeMap, HashSet};
use std::path::Path;
use std::process::Command;

/// Set of live tmux session names (`tmux list-sessions -F '#{session_name}'`).
/// Empty when no server is running or tmux is absent — both are non-errors.
pub fn running_sessions() -> HashSet<String> {
    let output = Command::new("tmux")
        .args(["list-sessions", "-F", "#{session_name}"])
        .output();
    match output {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout)
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect(),
        _ => HashSet::new(),
    }
}

/// Run tmux with args, returning trimmed stdout. Errors include stderr.
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

pub fn session_exists(name: &str) -> bool {
    Command::new("tmux")
        .args(["has-session", "-t", name])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Pane ids for a session in creation order (`%0`, `%1`, …). Empty on error.
pub fn list_pane_ids(session: &str) -> Vec<String> {
    match run(&["list-panes", "-t", session, "-F", "#{pane_id}"]) {
        Ok(out) => out
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect(),
        Err(_) => Vec::new(),
    }
}

pub fn capture_pane(pane_id: &str, lines: i64) -> Result<String, String> {
    let from = format!("-{lines}");
    let out = run(&["capture-pane", "-t", pane_id, "-p", "-J", "-S", &from])?;
    Ok(out.trim_end_matches('\n').to_string())
}

pub fn kill_session(name: &str) -> Result<(), String> {
    run(&["kill-session", "-t", name]).map(|_| ())
}

pub fn kill_pane(pane_id: &str) -> Result<(), String> {
    run(&["kill-pane", "-t", pane_id]).map(|_| ())
}

/// Ctrl-C the service, then best-effort clear the pane + scrollback (pane stays
/// open for restart). Mirrors tmux.go StopServicePane.
pub fn stop_service_pane(pane_id: &str) -> Result<(), String> {
    run(&["send-keys", "-t", pane_id, "C-c"]).map(|_| ())?;
    let _ = run(&["send-keys", "-R", "-t", pane_id, "C-l"]);
    let _ = run(&["clear-history", "-t", pane_id]);
    Ok(())
}

pub fn send_keys(target: &str, command: &str) -> Result<(), String> {
    run(&["send-keys", "-t", target, command, "Enter"]).map(|_| ())
}

/// Re-run a service's command in an existing (stopped) pane. Port of
/// tmux.go StartServicePane.
pub fn restart_service_pane(
    pane_id: &str,
    root: &str,
    cwd: &str,
    env: &BTreeMap<String, String>,
    cmd: &str,
    ssh: Option<&config::SshSettings>,
) -> Result<(), String> {
    send_keys(pane_id, &build_command(root, cwd, env, cmd, ssh))
}

/// tmux.go buildCommand. Local: `cd <cwd> && export K=V && … && cmd`. Remote:
/// the whole `ssh … bash -ilc '…'` line (one send-keys line, ssh per pane).
fn build_command(
    root: &str,
    cwd_raw: &str,
    env: &BTreeMap<String, String>,
    cmd: &str,
    ssh: Option<&config::SshSettings>,
) -> String {
    match ssh {
        Some(ssh) => config::ssh_command_line(ssh, cwd_raw, env, cmd),
        None => {
            let cwd = config::resolve_cwd(root, cwd_raw);
            let mut parts = vec![format!("cd {}", config::shell_quote(&cwd))];
            for (k, v) in env {
                parts.push(format!("export {k}={}", config::shell_quote(v)));
            }
            parts.push(cmd.to_string());
            parts.join(" && ")
        }
    }
}

fn pane_spawn_dir(root: &str, cwd_raw: &str, ssh: Option<&config::SshSettings>) -> String {
    if ssh.is_some() {
        config::remote_local_spawn_dir(root) // local cwd for the ssh client
    } else {
        config::resolve_cwd(root, cwd_raw)
    }
}

/// A service to launch: (cmd, cwd, env). Order is the resolved running order.
pub type ServiceTuple = (String, String, BTreeMap<String, String>);

/// Create a session with one pane per service (port StartProjectServices).
/// Kills any existing session of the same name first. For remote projects each
/// pane runs its own ssh invocation.
pub fn start_project_services(
    session: &str,
    root: &str,
    services: &[ServiceTuple],
    ssh: Option<&config::SshSettings>,
) -> Result<(), String> {
    if ssh.is_some() {
        config::ensure_ssh_control_dir()?;
    }
    let _ = kill_session(session); // ignore — matches Go
    let Some((cmd0, cwd0, env0)) = services.first() else {
        return Err("no services to start".into());
    };

    let dir0 = pane_spawn_dir(root, cwd0, ssh);
    let first_pane = new_session_in(session, &dir0)?;
    send_keys(&first_pane, &build_command(root, cwd0, env0, cmd0, ssh))?;

    for (i, (cmd, cwd, env)) in services[1..].iter().enumerate() {
        let split = if i > 0 { "-v" } else { "-h" }; // 2nd: -h, 3rd+: -v
        let dir = pane_spawn_dir(root, cwd, ssh);
        let pane = split_window_in(split, session, &dir)?;
        send_keys(&pane, &build_command(root, cwd, env, cmd, ssh))?;
    }
    Ok(())
}

/// Split one more pane into a running session (port SplitSessionPane). Returns
/// the new pane id.
pub fn split_session_pane(
    session: &str,
    root: &str,
    cmd: &str,
    cwd: &str,
    env: &BTreeMap<String, String>,
    ssh: Option<&config::SshSettings>,
) -> Result<String, String> {
    if ssh.is_some() {
        config::ensure_ssh_control_dir()?;
    }
    let dir = pane_spawn_dir(root, cwd, ssh);
    let pane = split_window_in("", session, &dir)?;
    send_keys(&pane, &build_command(root, cwd, env, cmd, ssh))?;
    let _ = run(&["select-layout", "-t", session, "tiled"]);
    Ok(pane)
}

fn new_session_in(session: &str, dir: &str) -> Result<String, String> {
    let out = Command::new("tmux")
        .args(["new-session", "-d", "-s", session, "-P", "-F", "#{pane_id}"])
        .current_dir(spawn_dir_or_root(dir))
        .output()
        .map_err(|e| format!("failed to create tmux session: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "failed to create tmux session: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn split_window_in(split: &str, session: &str, dir: &str) -> Result<String, String> {
    let mut args = vec!["split-window"];
    if !split.is_empty() {
        args.push(split);
    }
    args.extend_from_slice(&["-t", session, "-P", "-F", "#{pane_id}"]);
    let out = Command::new("tmux")
        .args(&args)
        .current_dir(spawn_dir_or_root(dir))
        .output()
        .map_err(|e| format!("split-window: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "split-window: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// tmux refuses a non-existent cwd; fall back to "." so session creation still
/// succeeds (the cd inside the pane command is the real working-dir set).
fn spawn_dir_or_root(dir: &str) -> &str {
    if !dir.is_empty() && Path::new(dir).is_dir() {
        dir
    } else {
        "."
    }
}
