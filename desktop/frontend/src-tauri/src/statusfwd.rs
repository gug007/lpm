// Reverse-forward the restricted status socket onto each SSH host, so agents
// running remotely can report Running/Done/Waiting back to the Mac. Per host one
// long-lived `ssh -N -R <remote.sock>:<local remote_socket_path>` child, managed
// like portforward.rs's `-L` tunnels (shared ControlMaster mux, SIGKILL on
// teardown). The remote socket path is `$HOME/.lpm/fwd/status-<local-host>.sock`
// — local-hostname-scoped so two Macs forwarding to one host don't collide.
use crate::config::{self, SshSettings};
use std::collections::{HashMap, HashSet};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

const RESOLVE_TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Default)]
pub struct StatusFwdState {
    // host_key -> `ssh -N -R` child pid.
    forwards: Arc<Mutex<HashMap<String, i32>>>,
    // host_key -> remote $HOME (resolved once per host for the absolute -R path).
    homes: Mutex<HashMap<String, String>>,
    // Serializes forward setup so concurrent spawns to one host don't race two
    // children onto the same remote socket.
    setup: Mutex<()>,
    // host_keys whose pty-vs-exec $HOME mismatch has been probed this app run.
    probed: Mutex<HashSet<String>>,
}

/// Emitted once per host when the pty session's `$HOME` differs from the exec
/// channel's, i.e. the forwarded status socket is bound where the terminal can't
/// reach it.
#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SshEnvMismatch {
    host_label: String,
    exec_home: String,
    pty_home: String,
}

fn host_key(ssh: &SshSettings) -> String {
    format!("{}@{}:{}", ssh.user, ssh.host, ssh.port)
}

fn socket_basename() -> String {
    format!(
        "status-{}.sock",
        config::sanitize_host(&config::hostname_or_mac())
    )
}

/// LPM_SOCKET_PATH as a shell expression the remote LOGIN shell expands, so a
/// terminal spawn needs no blocking `$HOME` lookup (the spawn runs on the UI
/// thread). Matches the absolute path `ensure_status_forward` binds the -R
/// socket to.
pub fn remote_socket_env_expr() -> String {
    format!("\"$HOME/.lpm/fwd/{}\"", socket_basename())
}

fn remote_socket_abs(home: &str) -> String {
    format!(
        "{}/.lpm/fwd/{}",
        home.trim_end_matches('/'),
        socket_basename()
    )
}

/// `ssh -N -R <remote.sock>:<local.sock>` on a DEDICATED connection (ssh_args
/// minus -t, meaningless with -N). Never the shared mux: a mux client only
/// registers the forward in the master and exits 0 immediately, so the child
/// pid stops meaning "forward alive", ExitOnForwardFailure is not honored, and
/// the forward dies with the master. ControlMaster=no + ControlPath=none are
/// prepended so they win over ssh_args' mux options (first -o per keyword
/// wins). ExitOnForwardFailure so a stale remote socket fails fast rather than
/// silently not forwarding.
fn forward_argv(ssh: &SshSettings, remote_sock: &str, local_sock: &str) -> Vec<String> {
    let mut argv = vec![
        "-N".into(),
        "-o".into(),
        "ExitOnForwardFailure=yes".into(),
        "-o".into(),
        "ServerAliveInterval=30".into(),
        "-o".into(),
        "ControlMaster=no".into(),
        "-o".into(),
        "ControlPath=none".into(),
        "-R".into(),
        format!("{remote_sock}:{local_sock}"),
    ];
    for a in config::ssh_args(ssh) {
        if a != "-t" {
            argv.push(a);
        }
    }
    argv
}

/// Spawn a command, capture stdout, SIGKILL it if it overruns `timeout`.
pub(crate) fn run_with_timeout(mut cmd: Command, timeout: Duration) -> Option<Vec<u8>> {
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let mut child = cmd.spawn().ok()?;
    let mut stdout = child.stdout.take()?;
    let pid = child.id() as i32;
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = std::io::Read::read_to_end(&mut stdout, &mut buf);
        let _ = tx.send(buf);
    });
    match rx.recv_timeout(timeout) {
        Ok(buf) => {
            let _ = child.wait();
            Some(buf)
        }
        Err(_) => {
            unsafe { libc::kill(pid, libc::SIGKILL) };
            let _ = child.wait();
            None
        }
    }
}

fn remote_home(state: &StatusFwdState, ssh: &SshSettings) -> Option<String> {
    let key = host_key(ssh);
    if let Some(h) = state.homes.lock().unwrap().get(&key) {
        return Some(h.clone());
    }
    let cmd = crate::sshexec::remote_command(ssh, "", "bash", &["-lc", "printf %s \"$HOME\""], &[]);
    let out = run_with_timeout(cmd, RESOLVE_TIMEOUT)?;
    let home = String::from_utf8_lossy(&out).trim().to_string();
    if !home.starts_with('/') {
        return None;
    }
    state.homes.lock().unwrap().insert(key, home.clone());
    Some(home)
}

/// `mkdir -p ~/.lpm/fwd && chmod 700 && rm -f <sock>`: the dir mode contains the
/// socket on multi-user hosts, and the rm clears a stale socket for servers
/// without StreamLocalBindUnlink (else the -R bind fails).
fn prep_remote_dir(ssh: &SshSettings, remote_sock: &str) -> bool {
    let script = format!(
        "mkdir -p \"$HOME/.lpm/fwd\" && chmod 700 \"$HOME/.lpm/fwd\" && rm -f {}",
        config::shell_quote(remote_sock)
    );
    let cmd = crate::sshexec::remote_command(ssh, "", "bash", &["-lc", &script], &[]);
    run_with_timeout(cmd, RESOLVE_TIMEOUT).is_some()
}

fn forward_alive(state: &StatusFwdState, ssh: &SshSettings) -> bool {
    if let Some(&pid) = state.forwards.lock().unwrap().get(&host_key(ssh)) {
        return unsafe { libc::kill(pid, 0) } == 0;
    }
    false
}

/// True the first time `key` is seen, false thereafter — one env-mismatch probe
/// per host per app run.
fn mark_probed_once(probed: &Mutex<HashSet<String>>, key: &str) -> bool {
    probed.lock().unwrap().insert(key.to_string())
}

/// Off the setup mutex: compare the pty session's `$HOME` against the exec
/// channel's (already resolved) and warn the UI if they diverge. Silent on probe
/// failure or a matching home.
fn spawn_env_mismatch_probe(app: &AppHandle, ssh: &SshSettings, exec_home: String) {
    let app = app.clone();
    let ssh = ssh.clone();
    std::thread::spawn(move || {
        let Some(pty_home) = crate::sshprobe::probe_pty_home(&ssh) else {
            return;
        };
        if pty_home == exec_home {
            return;
        }
        let _ = app.emit(
            "ssh-env-mismatch",
            SshEnvMismatch {
                host_label: format!("{}@{}", ssh.user, ssh.host),
                exec_home,
                pty_home,
            },
        );
    });
}

/// Idempotent: ensure a live status forward for `ssh`. The liveness check is
/// cheap and non-blocking (safe on the UI thread); the actual setup — which does
/// blocking ssh round trips — runs on a background thread.
pub fn ensure_status_forward(app: &AppHandle, ssh: &SshSettings) {
    if forward_alive(&app.state::<StatusFwdState>(), ssh) {
        return;
    }
    let app = app.clone();
    let ssh = ssh.clone();
    std::thread::spawn(move || ensure_forward_blocking(&app, &ssh));
}

fn ensure_forward_blocking(app: &AppHandle, ssh: &SshSettings) {
    let state = app.state::<StatusFwdState>();
    let key = host_key(ssh);
    let _setup = state.setup.lock().unwrap();
    if forward_alive(&state, ssh) {
        return;
    }
    let Some(home) = remote_home(&state, ssh) else {
        return;
    };
    let remote_sock = remote_socket_abs(&home);
    if !prep_remote_dir(ssh, &remote_sock) {
        return;
    }
    if config::ensure_ssh_control_dir().is_err() {
        return;
    }
    let local_sock = config::remote_socket_path();
    let child = Command::new("ssh")
        .args(forward_argv(ssh, &remote_sock, &local_sock))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
    let mut child = match child {
        Ok(c) => c,
        Err(_) => return,
    };
    let pid = child.id() as i32;
    state.forwards.lock().unwrap().insert(key.clone(), pid);
    // Reap the child and drop its entry when it dies, so the next spawn re-establishes.
    let forwards = state.forwards.clone();
    let reap_key = key.clone();
    std::thread::spawn(move || {
        let _ = child.wait();
        let mut f = forwards.lock().unwrap();
        if f.get(&reap_key) == Some(&pid) {
            f.remove(&reap_key);
        }
    });
    if mark_probed_once(&state.probed, &key) {
        spawn_env_mismatch_probe(app, ssh, home);
    }
}

/// Kill every status forward on app exit (mirrors portforward::stop_all_forwards).
pub fn stop_all(app: &AppHandle) {
    let state = app.state::<StatusFwdState>();
    let pids: Vec<i32> = std::mem::take(&mut *state.forwards.lock().unwrap())
        .into_values()
        .collect();
    for pid in pids {
        unsafe { libc::kill(pid, libc::SIGKILL) };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ssh() -> SshSettings {
        SshSettings {
            host: "host".into(),
            user: "dev".into(),
            port: 0,
            key: String::new(),
            dir: String::new(),
        }
    }

    #[test]
    fn env_expr_and_abs_share_the_same_basename() {
        let base = socket_basename();
        assert!(base.starts_with("status-") && base.ends_with(".sock"));
        let expr = remote_socket_env_expr();
        assert_eq!(expr, format!("\"$HOME/.lpm/fwd/{base}\""));
        assert_eq!(
            remote_socket_abs("/Users/dev"),
            format!("/Users/dev/.lpm/fwd/{base}")
        );
        // Trailing slash on home doesn't double up.
        assert_eq!(
            remote_socket_abs("/Users/dev/"),
            format!("/Users/dev/.lpm/fwd/{base}")
        );
    }

    #[test]
    fn forward_argv_is_reverse_and_ttyless() {
        let argv = forward_argv(&ssh(), "/r/s.sock", "/l/s.sock");
        assert!(argv.contains(&"-N".to_string()));
        assert!(argv
            .windows(2)
            .any(|w| w[0] == "-R" && w[1] == "/r/s.sock:/l/s.sock"));
        assert!(!argv.iter().any(|a| a == "-t"), "no pty with -N: {argv:?}");
        assert_eq!(argv.last().unwrap(), "dev@host");
    }

    #[test]
    fn forward_argv_overrides_mux_before_ssh_args() {
        // A mux client only registers the forward in the master and exits, so
        // the dedicated-connection overrides must come BEFORE ssh_args' mux
        // options (ssh honors the first -o per keyword).
        let argv = forward_argv(&ssh(), "/r/s.sock", "/l/s.sock");
        let pos = |v: &str| argv.iter().position(|a| a == v);
        let no_mux = pos("ControlMaster=no").expect("ControlMaster=no missing");
        let no_path = pos("ControlPath=none").expect("ControlPath=none missing");
        let auto_mux = pos("ControlMaster=auto").expect("ssh_args mux option missing");
        assert!(no_mux < auto_mux && no_path < auto_mux);
    }

    #[test]
    fn host_key_includes_user_host_port() {
        assert_eq!(host_key(&ssh()), "dev@host:0");
    }

    #[test]
    fn probe_guard_fires_once_per_host() {
        let probed = Mutex::new(HashSet::new());
        assert!(mark_probed_once(&probed, "dev@host:0"));
        assert!(!mark_probed_once(&probed, "dev@host:0"));
        assert!(mark_probed_once(&probed, "dev@other:0"));
    }
}
