// tmux orchestration — port of internal/tmux/tmux.go. Pane-per-service layout
// in one window: service N == the Nth pane id from `list-panes`. All argv is
// verbatim from the Go code. Local-only for now (remote services rejected at
// the command layer, like PTY).
use crate::config;
use std::collections::{BTreeMap, HashSet};
use std::path::Path;
use std::process::Command;

const SERVICE_OPTION: &str = "@lpm_service";

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ServicePane {
    pub id: String,
    pub service: String,
}

fn tmux_command() -> Command {
    #[cfg(not(test))]
    {
        Command::new("tmux")
    }
    #[cfg(test)]
    {
        use std::sync::OnceLock;
        static SOCKET: OnceLock<String> = OnceLock::new();
        let mut command = Command::new("tmux");
        let socket = SOCKET.get_or_init(|| format!("lpm-tests-{}", std::process::id()));
        command.args(["-L", socket]);
        command
    }
}

/// Set of live tmux session names (`tmux list-sessions -F '#{session_name}'`).
/// Empty when no server is running or tmux is absent — both are non-errors.
pub fn running_sessions() -> HashSet<String> {
    let output = tmux_command()
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
    let out = tmux_command()
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
    tmux_command()
        .args(["has-session", "-t", name])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// One field per pane for a session in creation order. Empty lines and errors
/// drop out, so callers get a clean list aligned to pane order. Empty on error.
fn list_pane_field(session: &str, field: &str) -> Vec<String> {
    match run(&["list-panes", "-t", session, "-F", field]) {
        Ok(out) => out
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect(),
        Err(_) => Vec::new(),
    }
}

/// Pane ids for a session in creation order (`%0`, `%1`, …). Empty on error.
pub fn list_pane_ids(session: &str) -> Vec<String> {
    list_pane_field(session, "#{pane_id}")
}

fn parse_service_panes(output: &str) -> Option<Vec<ServicePane>> {
    let panes: Option<Vec<ServicePane>> = output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| {
            let (id, service) = line.split_once('\t')?;
            if id.is_empty() || service.is_empty() {
                return None;
            }
            Some(ServicePane {
                id: id.to_string(),
                service: service.to_string(),
            })
        })
        .collect();
    panes.filter(|panes| !panes.is_empty())
}

pub fn list_service_panes(session: &str) -> Option<Vec<ServicePane>> {
    let output = run(&[
        "list-panes",
        "-t",
        session,
        "-F",
        "#{pane_id}\t#{@lpm_service}",
    ])
    .ok()?;
    parse_service_panes(&output)
}

/// Pane shell pids for a session in creation order — aligned with list_pane_ids
/// so the Nth entry is the Nth service's pane. Empty on error.
pub fn list_pane_pids(session: &str) -> Vec<i64> {
    list_pane_field(session, "#{pane_pid}")
        .iter()
        .filter_map(|s| s.parse().ok())
        .collect()
}

pub fn capture_pane(pane_id: &str, lines: i64) -> Result<String, String> {
    let from = format!("-{lines}");
    let out = run(&["capture-pane", "-t", pane_id, "-p", "-J", "-S", &from])?;
    Ok(out.trim_end_matches('\n').to_string())
}

fn pane_pid(pane_id: &str) -> Option<i32> {
    run(&["display-message", "-p", "-t", pane_id, "#{pane_pid}"])
        .ok()
        .and_then(|s| s.trim().parse().ok())
}

pub fn kill_session(name: &str) -> Result<(), String> {
    // Snapshot every pane's process tree BEFORE the panes go away: tmux only hangs
    // up the pane shell, leaving detached dev-server/agent grandchildren orphaned.
    // Capture first, kill-session, then reap the trees in the background.
    let roots: Vec<i32> = list_pane_pids(name).into_iter().map(|p| p as i32).collect();
    let victims = crate::proctree::trees(&roots);
    let r = run(&["kill-session", "-t", name]);
    crate::proctree::kill_pids_async(victims);
    r.map(|_| ())
}

pub fn kill_pane(pane_id: &str) -> Result<(), String> {
    let roots: Vec<i32> = pane_pid(pane_id).into_iter().collect();
    let victims = crate::proctree::trees(&roots);
    let r = run(&["kill-pane", "-t", pane_id]);
    crate::proctree::kill_pids_async(victims);
    r.map(|_| ())
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

/// A service to launch: (name, cmd, cwd, env). Order is the resolved running order.
pub type ServiceTuple = (String, String, String, BTreeMap<String, String>);

fn set_pane_service(pane_id: &str, service: &str) -> Result<(), String> {
    run(&["set-option", "-p", "-t", pane_id, SERVICE_OPTION, service]).map(|_| ())
}

fn rollback_error(error: String, rollback: Result<(), String>) -> String {
    match rollback {
        Ok(()) => error,
        Err(rollback_error) => format!("{error}; rollback failed: {rollback_error}"),
    }
}

fn rollback_panes(panes: Vec<String>, error: String) -> String {
    let rollback_errors: Vec<String> = panes
        .into_iter()
        .rev()
        .filter_map(|pane| kill_pane(&pane).err())
        .collect();
    if rollback_errors.is_empty() {
        error
    } else {
        format!("{error}; rollback failed: {}", rollback_errors.join("; "))
    }
}

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
    let Some((name0, cmd0, cwd0, env0)) = services.first() else {
        return Err("no services to start".into());
    };

    let dir0 = pane_spawn_dir(root, cwd0, ssh);
    let first_pane = new_session_in(session, &dir0)?;
    let launch = (|| {
        set_pane_service(&first_pane, name0)?;
        send_keys(&first_pane, &build_command(root, cwd0, env0, cmd0, ssh))?;

        for (i, (name, cmd, cwd, env)) in services[1..].iter().enumerate() {
            let split = if i > 0 { "-v" } else { "-h" };
            let dir = pane_spawn_dir(root, cwd, ssh);
            let pane = split_window_in(split, session, &dir)?;
            set_pane_service(&pane, name)?;
            send_keys(&pane, &build_command(root, cwd, env, cmd, ssh))?;
        }
        Ok(())
    })();
    if let Err(error) = launch {
        return Err(rollback_error(error, kill_session(session)));
    }
    Ok(())
}

/// Split one more pane into a running session (port SplitSessionPane). Returns
/// the new pane id.
pub fn split_session_pane(
    session: &str,
    root: &str,
    service: &str,
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
    if let Err(error) = set_pane_service(&pane, service)
        .and_then(|_| send_keys(&pane, &build_command(root, cwd, env, cmd, ssh)))
    {
        return Err(rollback_error(error, kill_pane(&pane)));
    }
    let _ = run(&["select-layout", "-t", session, "tiled"]);
    Ok(pane)
}

pub fn split_session_services(
    session: &str,
    root: &str,
    services: &[ServiceTuple],
    ssh: Option<&config::SshSettings>,
) -> Result<Vec<String>, String> {
    let mut panes = Vec::new();
    for (name, cmd, cwd, env) in services {
        match split_session_pane(session, root, name, cmd, cwd, env, ssh) {
            Ok(pane) => panes.push(pane),
            Err(error) => return Err(rollback_panes(panes, error)),
        }
    }
    Ok(panes)
}

fn new_session_in(session: &str, dir: &str) -> Result<String, String> {
    let out = tmux_command()
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
    let out = tmux_command()
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct SessionGuard(String);

    impl SessionGuard {
        fn new() -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            Self(format!("lpm-test-{}-{nonce}", std::process::id()))
        }
    }

    impl Drop for SessionGuard {
        fn drop(&mut self) {
            let _ = kill_session(&self.0);
        }
    }

    fn service(name: &str, command: String) -> ServiceTuple {
        (name.to_string(), command, String::new(), BTreeMap::new())
    }

    #[test]
    fn parses_complete_service_identity() {
        assert_eq!(
            parse_service_panes("%3\tdb\n%7\tweb\n"),
            Some(vec![
                ServicePane {
                    id: "%3".into(),
                    service: "db".into()
                },
                ServicePane {
                    id: "%7".into(),
                    service: "web".into()
                },
            ])
        );
    }

    #[test]
    fn rejects_partial_or_empty_service_identity() {
        assert_eq!(parse_service_panes("%3\tdb\n%7\t\n"), None);
        assert_eq!(parse_service_panes(""), None);
    }

    #[test]
    fn stores_service_identity_on_each_pane() {
        let session = SessionGuard::new();
        let services = vec![
            service("db", "sleep 30".into()),
            service("web", "sleep 30".into()),
        ];
        start_project_services(&session.0, ".", &services, None).unwrap();
        let names: Vec<String> = list_service_panes(&session.0)
            .unwrap()
            .into_iter()
            .map(|pane| pane.service)
            .collect();
        assert_eq!(names, ["db", "web"]);
        let configured = vec!["api".to_string(), "db".to_string(), "web".to_string()];
        let recovered =
            crate::services::run_state_from_tmux(&session.0, configured.iter()).unwrap();
        assert_eq!(recovered.services, ["db", "web"]);
        let incomplete_config = vec!["db".to_string()];
        assert!(
            crate::services::run_state_from_tmux(&session.0, incomplete_config.iter()).is_none()
        );
    }

    #[test]
    fn failed_multi_service_start_removes_the_session() {
        let session = SessionGuard::new();
        let services = vec![
            service("db", "sleep 30".into()),
            service("web", "x".repeat(4 * 1024 * 1024)),
        ];
        assert!(start_project_services(&session.0, ".", &services, None).is_err());
        assert!(!running_sessions().contains(&session.0));
    }

    #[test]
    fn failed_multi_service_split_keeps_the_original_panes() {
        let session = SessionGuard::new();
        start_project_services(&session.0, ".", &[service("db", "sleep 30".into())], None).unwrap();
        let additions = vec![
            service("cache", "sleep 30".into()),
            service("web", "x".repeat(4 * 1024 * 1024)),
        ];
        assert!(split_session_services(&session.0, ".", &additions, None).is_err());
        let names: Vec<String> = list_service_panes(&session.0)
            .unwrap()
            .into_iter()
            .map(|pane| pane.service)
            .collect();
        assert_eq!(names, ["db"]);
    }
}
