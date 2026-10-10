// Reverse-forward the restricted status socket onto each SSH host, so agents
// running remotely can report Running/Done/Waiting back to the Mac. Per host one
// long-lived `ssh -N -R <remote.sock>:<local remote_socket_path>` child, managed
// like portforward.rs's `-L` tunnels (shared ControlMaster mux, SIGKILL on
// teardown). The remote socket path is `$HOME/.lpm/fwd/status-<local-host>.sock`
// — local-hostname-scoped so two Macs forwarding to one host don't collide.
// Windows forwards to a loopback TCP relay instead (statusrelay.rs): Win32-OpenSSH
// can't connect a forward to a local AF_UNIX socket.
use crate::config::{self, SshSettings};
use crate::osproc;
use std::collections::{HashMap, HashSet};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

const RESOLVE_TIMEOUT: Duration = Duration::from_secs(8);
const WATCHDOG_INTERVAL: Duration = Duration::from_secs(20);

#[derive(Default)]
pub struct StatusFwdState {
    // host_key -> `ssh -N -R` child pid.
    forwards: Arc<Mutex<HashMap<String, u32>>>,
    // host_key -> remote $HOME (resolved once per host for the absolute -R path).
    homes: Mutex<HashMap<String, String>>,
    // Serializes forward setup so concurrent spawns to one host don't race two
    // children onto the same remote socket.
    setup: Mutex<()>,
    // host_keys whose pty-vs-exec $HOME mismatch has been probed this app run.
    probed: Mutex<HashSet<String>>,
    // host_keys already warned that their sshd refuses the forward.
    refused: Arc<Mutex<HashSet<String>>>,
    // Loopback port of the status relay the Windows forwards target.
    #[cfg(windows)]
    relay_port: Mutex<Option<u16>>,
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

/// The forwarded socket's name on the host. Fixed for the run, so a hostname
/// that changes mid-run (a new network) can't split the forward from the
/// terminals already pointing at it; unique per lpm instance (Mac, data dir,
/// build), so two instances' forwards to one host never replace each other's;
/// and short, because ssh refuses a forward whose path doesn't fit a socket
/// address (104 bytes on a Mac) and the host's home dir comes on top.
fn socket_basename() -> &'static str {
    static NAME: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    NAME.get_or_init(|| {
        let mac = config::hostname_or_mac();
        let host: String = config::sanitize_host(&mac).chars().take(16).collect();
        let instance = format!(
            "{mac}|{}|{}",
            config::lpm_dir().display(),
            cfg!(debug_assertions)
        );
        let digest = <sha2::Sha256 as sha2::Digest>::digest(instance.as_bytes());
        format!("status-{host}-{}.sock", &hex::encode(digest)[..8])
    })
}

/// LPM_SOCKET_PATH as a shell expression the remote LOGIN shell expands, so a
/// terminal spawn needs no blocking `$HOME` lookup (the spawn runs on the UI
/// thread). Matches the absolute path `ensure_status_forward` binds the -R
/// socket to.
pub fn remote_socket_env_expr() -> String {
    format!("\"$HOME/.lpm/fwd/{}\"", socket_basename())
}

/// Configure the running tmux server so every FUTURE `tmux new`/`attach` from an
/// lpm tab copies THAT tab's LPM_* values into the SESSION environment — which
/// then flows into newly created panes' process env, overriding the single
/// server-global slot the seed above can only set once. Appended after the seed,
/// as its own `;`-terminated statement, so it never gates the caller's `exec`.
///
/// Guarded three ways: tmux must exist; tmux must be >= 3.0 — only there is
/// `update-environment` an ARRAY where each `set-option -ga` appends a SEPARATE
/// entry; on older tmux `-ga` concatenates into the trailing string and would
/// corrupt it, so we skip entirely; and the append is skipped when the option
/// already lists our vars, keeping repeated logins idempotent. All output silenced.
fn tmux_update_environment_seed() -> String {
    String::from(
        "{ command -v tmux >/dev/null 2>&1 && tmux -V 2>/dev/null | grep -qE \"tmux (3|[4-9]|[1-9][0-9])\" && \
         { tmux show-option -gv update-environment 2>/dev/null | grep -q LPM_PANE_ID || \
         tmux set-option -ga update-environment LPM_SOCKET_PATH \\; \
         set-option -ga update-environment LPM_PROJECT_NAME \\; \
         set-option -ga update-environment LPM_PANE_ID; }; } >/dev/null 2>&1; "
    )
}

/// Inner command an SSH terminal's login shell runs: export the absolute remote
/// status-socket path, then best-effort (1) seed a PRE-EXISTING tmux server's
/// GLOBAL environment with the LPM_* vars and (2) extend the server's
/// `update-environment` so future attaches maintain per-session identity, before
/// exec'ing the login shell. Panes in a tmux server that predates this shell
/// inherit the server's env, not ours, so their agent hooks would otherwise see no
/// LPM_* (or a stale one); a server the user starts LATER inherits the exported
/// vars directly. Both tmux steps are guarded by `command -v tmux` and their
/// failure (no tmux, no running server, old tmux) must never block the exec —
/// hence `;` before exec, not `&&`. LPM_PROJECT_NAME/LPM_PANE_ID are exported by
/// the surrounding remote script, so the `"$VAR"` refs resolve.
pub fn remote_inner_cmd() -> String {
    format!(
        "export LPM_SOCKET_PATH={expr} && command -v tmux >/dev/null 2>&1 && \
         tmux setenv -g LPM_SOCKET_PATH \"$LPM_SOCKET_PATH\" \\; \
         setenv -g LPM_PROJECT_NAME \"$LPM_PROJECT_NAME\" \\; \
         setenv -g LPM_PANE_ID \"$LPM_PANE_ID\" >/dev/null 2>&1; \
         {update}exec \"$SHELL\" -l",
        expr = remote_socket_env_expr(),
        update = tmux_update_environment_seed(),
    )
}

fn remote_socket_abs(home: &str) -> String {
    format!(
        "{}/.lpm/fwd/{}",
        home.trim_end_matches('/'),
        socket_basename()
    )
}

/// `ssh -N -R <remote.sock>:<local>` on a DEDICATED connection (ssh_args
/// minus -t, meaningless with -N). Never the shared mux: a mux client only
/// registers the forward in the master and exits 0 immediately, so the child
/// pid stops meaning "forward alive", ExitOnForwardFailure is not honored, and
/// the forward dies with the master. ControlMaster=no + ControlPath=none are
/// prepended so they win over ssh_args' mux options (first -o per keyword
/// wins). ExitOnForwardFailure so a stale remote socket fails fast rather than
/// silently not forwarding. Keepalives follow ssh_args', so a dead link takes
/// the forward down as soon as it takes the terminals.
fn forward_argv(ssh: &SshSettings, remote_sock: &str, local: &str) -> Vec<String> {
    let mut argv = vec![
        "-N".into(),
        "-o".into(),
        "ExitOnForwardFailure=yes".into(),
        "-o".into(),
        "ControlMaster=no".into(),
        "-o".into(),
        "ControlPath=none".into(),
        "-R".into(),
        format!("{remote_sock}:{local}"),
    ];
    argv.extend(config::ssh_batch_opts());
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
    let pid = child.id();
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
            osproc::kill(pid);
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
    let cmd = crate::sshexec::remote_login_script(ssh, "printf %s \"$HOME\"");
    let out = run_with_timeout(cmd, RESOLVE_TIMEOUT)?;
    let home = crate::sshexec::last_path_line(&String::from_utf8_lossy(&out))?;
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
    let cmd = crate::sshexec::remote_login_script(ssh, &script);
    run_with_timeout(cmd, RESOLVE_TIMEOUT).is_some()
}

fn forward_alive(state: &StatusFwdState, ssh: &SshSettings) -> bool {
    if let Some(&pid) = state.forwards.lock().unwrap().get(&host_key(ssh)) {
        return osproc::is_alive(pid);
    }
    false
}

/// `ssh-status-undeliverable`: a host whose agents can't report, and why —
/// "tools" (nothing to send a status with) or "forwarding" (sshd won't carry it).
fn undeliverable(host_label: String, reason: &str) -> serde_json::Value {
    serde_json::json!({ "hostLabel": host_label, "reason": reason })
}

/// What ssh prints when the server won't forward a socket for it
/// (AllowStreamLocalForwarding, DisableForwarding, a `restrict` key).
fn forward_refused(stderr: &str) -> bool {
    stderr.contains("remote port forwarding failed")
}

/// True the first time `key` is seen, false thereafter — one env-mismatch probe
/// per host per app run.
fn mark_probed_once(probed: &Mutex<HashSet<String>>, key: &str) -> bool {
    probed.lock().unwrap().insert(key.to_string())
}

/// Off the setup mutex, the checks that warn the UI when this host's agents
/// can't reach lpm: compare the pty session's `$HOME` against the exec
/// channel's (already resolved), and look for a way to deliver a status at all.
/// Silent on probe failure or when all is well.
fn spawn_env_mismatch_probe(app: &AppHandle, ssh: &SshSettings, exec_home: String) {
    let app = app.clone();
    let ssh = ssh.clone();
    std::thread::spawn(move || {
        if crate::sshprobe::can_deliver_status(&ssh) == Some(false) {
            let host = format!("{}@{}", ssh.user, ssh.host);
            let _ = app.emit("ssh-status-undeliverable", undeliverable(host, "tools"));
        }
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

/// Hosts with at least one live remote pane, deduped. Collected under the lock
/// and returned by value so the caller's blocking ssh work never holds PtyState.
fn live_remote_hosts(app: &AppHandle) -> Vec<SshSettings> {
    let state = app.state::<crate::pty::PtyState>();
    let sessions = state.sessions.lock().unwrap();
    let mut seen = HashSet::new();
    sessions
        .values()
        .filter_map(|s| s.ssh.clone())
        .filter(|ssh| seen.insert(host_key(ssh)))
        .collect()
}

/// The `ssh -N -R` child dies on its own — a network blip, a host reboot, a
/// sleep/wake — and until now nothing rebuilt it: `ensure_status_forward` runs
/// only at terminal spawn and the reaper merely drops the dead pid. Every status
/// frame the remote agent sent after that was lost in silence, since the hook
/// discards its own errors, so the pane's badge and its Done/Waiting chime just
/// stopped for the rest of the session. Poll instead: any host still showing a
/// live pane gets its forward re-established.
pub fn start_watchdog(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(WATCHDOG_INTERVAL);
        for ssh in live_remote_hosts(&app) {
            ensure_forward_blocking(&app, &ssh);
        }
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
    #[cfg(unix)]
    let local = crate::socketsrv::serving(&config::remote_socket_path());
    #[cfg(windows)]
    let Some(local) = relay_port(&state).map(|port| format!("127.0.0.1:{port}")) else {
        return;
    };
    let child = osproc::command("ssh")
        .args(forward_argv(ssh, &remote_sock, &local))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn();
    let mut child = match child {
        Ok(c) => c,
        Err(_) => return,
    };
    #[cfg(windows)]
    crate::sshjob::tie_to_app(&child);
    let pid = child.id();
    state.forwards.lock().unwrap().insert(key.clone(), pid);
    // Reap the child and drop its entry when it dies, so the next spawn re-establishes.
    let forwards = state.forwards.clone();
    let refused = state.refused.clone();
    let reap_key = key.clone();
    let stderr = child.stderr.take();
    let app_for_reap = app.clone();
    let host_label = format!("{}@{}", ssh.user, ssh.host);
    std::thread::spawn(move || {
        let mut said = String::new();
        if let Some(mut stderr) = stderr {
            use std::io::Read;
            let _ = stderr.by_ref().take(16 * 1024).read_to_string(&mut said);
        }
        let _ = child.wait();
        {
            let mut f = forwards.lock().unwrap();
            if f.get(&reap_key) == Some(&pid) {
                f.remove(&reap_key);
            }
        }
        if forward_refused(&said) && refused.lock().unwrap().insert(reap_key) {
            let _ = app_for_reap.emit("ssh-status-undeliverable", undeliverable(host_label, "forwarding"));
        }
    });
    let forwards = state.forwards.clone();
    let alive_key = key.clone();
    crate::fwdspool::replay_when_up(app, ssh, &remote_sock, move || {
        forwards.lock().unwrap().get(&alive_key) == Some(&pid)
    });
    if mark_probed_once(&state.probed, &key) {
        spawn_env_mismatch_probe(app, ssh, home);
    }
}

/// The status relay's port, started on first use. Admits only connections
/// whose far end is one of our `ssh -R` children, or a process a wrapper `ssh`
/// provably launched under one: Windows never reparents an orphan and recycles
/// pids, so a parent pid alone can name a stranger.
#[cfg(windows)]
fn relay_port(state: &StatusFwdState) -> Option<u16> {
    let mut port = state.relay_port.lock().unwrap();
    if port.is_none() {
        let forwards = state.forwards.clone();
        let admit: crate::statusrelay::Admit = Arc::new(move |stream| {
            let Some(owner) = crate::statusrelay::peer_owner_pid(stream) else {
                return false;
            };
            let pids: Vec<u32> = forwards.lock().unwrap().values().copied().collect();
            crate::procwin::is_proven_descendant(owner, &pids)
        });
        let target = std::path::PathBuf::from(crate::socketsrv::serving(&config::remote_socket_path()));
        *port = crate::statusrelay::start(target, admit).ok();
    }
    *port
}

/// Kill every status forward on app exit (mirrors portforward::stop_all_forwards).
pub fn stop_all(app: &AppHandle) {
    let state = app.state::<StatusFwdState>();
    let pids: Vec<u32> = std::mem::take(&mut *state.forwards.lock().unwrap())
        .into_values()
        .collect();
    for pid in pids {
        osproc::kill(pid);
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
    fn a_refused_forward_is_told_apart_from_a_dropped_link() {
        assert!(forward_refused("Warning: remote port forwarding failed for listen path /h/.lpm/fwd/s.sock\n"));
        assert!(!forward_refused("Connection to host closed by remote host.\n"));
    }

    #[test]
    fn the_socket_name_is_short_enough_for_any_ordinary_home() {
        let base = socket_basename();
        assert!(base.len() <= "status-".len() + 16 + 1 + 8 + ".sock".len(), "{base}");
        // ssh rejects a forward whose path won't fit sockaddr_un (104 on macOS).
        assert!(remote_socket_abs("/home/a-rather-long-user-name").len() < 104);
        assert_eq!(socket_basename(), base, "stable for the run");
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
    fn remote_inner_cmd_seeds_tmux_then_execs_unconditionally() {
        let s = remote_inner_cmd();
        assert!(
            s.contains(&format!(
                "export LPM_SOCKET_PATH={}",
                remote_socket_env_expr()
            )),
            "{s}"
        );
        // One guarded seed sets all three vars via `\;` separators.
        assert!(s.contains("command -v tmux >/dev/null 2>&1 && tmux setenv -g"));
        assert_eq!(
            s.matches("tmux setenv -g").count(),
            1,
            "single seed call: {s}"
        );
        for v in ["LPM_SOCKET_PATH", "LPM_PROJECT_NAME", "LPM_PANE_ID"] {
            assert!(s.contains(&format!("setenv -g {v} \"${v}\"")), "{s}");
        }
        // The seed (2) plus the update-environment appends (2) => four `\;`.
        assert_eq!(s.matches(" \\; ").count(), 4, "four `\\;` separators: {s}");
        // Exec is unconditional: `;` before it, never gated on either tmux step.
        assert!(s.ends_with("exec \"$SHELL\" -l"));
        assert!(s.contains(">/dev/null 2>&1; exec \"$SHELL\" -l"), "{s}");
        assert!(
            !s.contains("2>&1 && exec"),
            "tmux steps must not gate exec: {s}"
        );
        // The whole inner command is single-quote-free (re-wrapped on install).
        assert!(!s.contains('\''), "no single quotes allowed: {s}");
    }

    #[test]
    fn remote_inner_cmd_extends_update_environment_guarded() {
        let s = remote_inner_cmd();
        // Version guard: only tmux >= 3.0, where update-environment is an array.
        assert!(
            s.contains("tmux -V 2>/dev/null | grep -qE \"tmux (3|[4-9]|[1-9][0-9])\""),
            "version guard missing: {s}"
        );
        // Duplicate guard: append only when our vars are not already listed.
        assert!(
            s.contains(
                "tmux show-option -gv update-environment 2>/dev/null | grep -q LPM_PANE_ID ||"
            ),
            "duplicate guard missing: {s}"
        );
        // Each var appended as its OWN array entry via `set-option -ga`.
        for v in ["LPM_SOCKET_PATH", "LPM_PROJECT_NAME", "LPM_PANE_ID"] {
            assert!(
                s.contains(&format!("set-option -ga update-environment {v}")),
                "{v} not appended: {s}"
            );
        }
        // The update-environment step is its own silenced statement, before exec.
        assert!(
            s.contains("; }; } >/dev/null 2>&1; exec \"$SHELL\" -l"),
            "{s}"
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
    fn forward_argv_can_target_a_loopback_relay() {
        let argv = forward_argv(&ssh(), "/r/s.sock", "127.0.0.1:4567");
        assert!(argv
            .windows(2)
            .any(|w| w[0] == "-R" && w[1] == "/r/s.sock:127.0.0.1:4567"));
    }

    #[cfg(windows)]
    #[test]
    fn windows_forward_never_multiplexes_or_prompts() {
        let argv = forward_argv(&ssh(), "/r/s.sock", "127.0.0.1:4567");
        assert!(!argv.iter().any(|a| a == "ControlMaster=auto"), "{argv:?}");
        assert!(argv.iter().any(|a| a == "BatchMode=yes"), "{argv:?}");
    }

    #[cfg(unix)]
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
