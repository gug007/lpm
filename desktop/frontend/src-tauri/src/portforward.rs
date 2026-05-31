// Remote SSH port forwarding + suggestion state — port of desktop/portforward.go.
//
// Scope: manual forwarding (add/remove/list via long-lived `ssh -N -L` children)
// and the suggestion command surface (get/clear/dismiss). The background poller,
// PTY-output sniff, and auto-forward that POPULATE suggestions are deferred — so
// the suggestions list is empty in practice (only a manually-forwarded port is
// "marked", and it's then filtered out as already-forwarding). Manual forwarding
// works end-to-end. Frontend is event-driven: it refetches on "ports-changed".
use crate::{config, ports};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

const READY_TIMEOUT: Duration = Duration::from_secs(4);
const DIAL_TIMEOUT: Duration = Duration::from_millis(200);
const POLL_SLEEP: Duration = Duration::from_millis(75);

// --- poller (port discovery over ssh) + PTY-output sniff --------------------
const POLL_INTERVAL: Duration = Duration::from_secs(3); // portpoller.go portPollInterval
const POLL_TIMEOUT: Duration = Duration::from_secs(6); // portpoller.go portPollTimeout
// ss (preferred) or netstat: list TCP listeners, address in field 4. Header-less.
const LISTING_CMD: &str = "(command -v ss >/dev/null 2>&1 && ss -tlnH) || (command -v netstat >/dev/null 2>&1 && netstat -tln 2>/dev/null | tail -n +3)";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AutoForwarded {
    project: String,
    remote_port: u16,
    local_port: u16,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ForwardFailed {
    project: String,
    remote_port: u16,
    error: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PortForward {
    pub local_port: u16,
    pub remote_port: u16,
}

struct Forward {
    id: u64,
    local_port: u16,
    remote_port: u16,
    pid: i32, // ssh -N -L child; killed (SIGKILL) on teardown
}

#[derive(Default)]
struct SuggestionState {
    suggested: HashMap<String, HashSet<u16>>,
    dismissed: HashMap<String, HashSet<u16>>,
}

#[derive(Default)]
pub struct PortFwdState {
    forwards: Arc<Mutex<HashMap<String, Vec<Forward>>>>,
    suggestions: Arc<Mutex<SuggestionState>>,
    counter: AtomicU64,
    // project -> stop flag for its running poller thread (None == not polling)
    pollers: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

/// `ssh -N -L 127.0.0.1:L:127.0.0.1:R <conn args, minus -t>`. Reuses the shared
/// ControlMaster mux (ssh_args), so killing this `-N` child never tears down the
/// master that terminals/scp use.
fn forward_argv(ssh: &config::SshSettings, local: u16, remote: u16) -> Vec<String> {
    let mut argv = vec![
        "-N".into(),
        "-o".into(),
        "ExitOnForwardFailure=yes".into(),
        "-o".into(),
        "ServerAliveInterval=30".into(),
        "-L".into(),
        format!("127.0.0.1:{local}:127.0.0.1:{remote}"),
    ];
    for a in config::ssh_args(ssh) {
        if a != "-t" {
            argv.push(a); // -t is meaningless with -N (pseudo-terminal warning)
        }
    }
    argv
}

fn pick_free_local_port() -> Result<u16, String> {
    let l = TcpListener::bind(("127.0.0.1", 0)).map_err(|e| format!("pick local port: {e}"))?;
    let p = l.local_addr().map_err(|e| e.to_string())?.port();
    Ok(p) // listener drops here (TOCTOU window accepted, matches Go)
}

#[tauri::command(async)]
pub fn add_port_forward(
    app: AppHandle,
    state: State<'_, PortFwdState>,
    project: String,
    remote_port: i64,
    local_port: i64,
) -> Result<PortForward, String> {
    forward_impl(&app, &state, &project, remote_port, local_port)
}

/// Core forwarding logic shared by the `add_port_forward` command and the
/// auto-forwarder. Spawns a long-lived `ssh -N -L` child, waits for the local
/// listener to come up, and registers the forward (idempotent on remote port).
fn forward_impl(
    app: &AppHandle,
    state: &PortFwdState,
    project: &str,
    remote_port: i64,
    local_port: i64,
) -> Result<PortForward, String> {
    if !(1..=65535).contains(&remote_port) {
        return Err(format!("invalid remote port: {remote_port}"));
    }
    if !(0..=65535).contains(&local_port) {
        return Err(format!("invalid local port: {local_port}"));
    }
    let info = config::spawn_info(project).map_err(|e| format!("load project: {e}"))?;
    if !info.is_remote {
        return Err(format!("project {project:?} is not a remote SSH project"));
    }
    let remote_port = remote_port as u16;

    // Idempotency: an existing tunnel for this remote port wins.
    {
        let f = state.forwards.lock().unwrap();
        if let Some(v) = f.get(project) {
            if let Some(e) = v.iter().find(|e| e.remote_port == remote_port) {
                return Ok(PortForward { local_port: e.local_port, remote_port });
            }
        }
    }

    // Local port: mirror the remote port when free, else an ephemeral one.
    let local_port = if local_port == 0 {
        if ports::can_bind(remote_port as i64) {
            remote_port
        } else {
            pick_free_local_port()?
        }
    } else {
        local_port as u16
    };

    config::ensure_ssh_control_dir()?;
    let mut child = Command::new("ssh")
        .args(forward_argv(&info.ssh, local_port, remote_port))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("start ssh: {e}"))?;
    let pid = child.id() as i32;
    let stderr = child.stderr.take();

    // Single reader thread: drains stderr (last ~512 bytes) + waits the child,
    // then flips `done`. Both the readiness check and the lifecycle thread
    // observe that one signal (wait() is called exactly once).
    let done = Arc::new((Mutex::new(false), Condvar::new()));
    let stderr_buf = Arc::new(Mutex::new(Vec::<u8>::new()));
    {
        let (done, sbuf) = (done.clone(), stderr_buf.clone());
        std::thread::spawn(move || {
            if let Some(mut e) = stderr {
                let mut buf = [0u8; 4096];
                while let Ok(n) = e.read(&mut buf) {
                    if n == 0 {
                        break;
                    }
                    let mut g = sbuf.lock().unwrap();
                    g.extend_from_slice(&buf[..n]);
                    if g.len() > 512 {
                        let drop = g.len() - 512;
                        g.drain(0..drop);
                    }
                }
            }
            let _ = child.wait();
            let (m, c) = &*done;
            *m.lock().unwrap() = true;
            c.notify_all();
        });
    }

    if let Err(err) = wait_for_local_listen(local_port, &done) {
        unsafe { libc::kill(pid, libc::SIGKILL) };
        wait_done(&done);
        let tail = config::trim_tail(&stderr_buf.lock().unwrap(), 200);
        return Err(if tail.is_empty() { err } else { format!("{err}: {tail}") });
    }

    let id = state.counter.fetch_add(1, Ordering::SeqCst);
    state
        .forwards
        .lock()
        .unwrap()
        .entry(project.to_string())
        .or_default()
        .push(Forward { id, local_port, remote_port, pid });

    // Lifecycle: when the ssh child dies, drop the entry and refetch the UI.
    {
        let (done, forwards, app2, project2) =
            (done.clone(), state.forwards.clone(), app.clone(), project.to_string());
        std::thread::spawn(move || {
            wait_done(&done);
            let mut f = forwards.lock().unwrap();
            if let Some(v) = f.get_mut(&project2) {
                v.retain(|e| e.id != id);
                if v.is_empty() {
                    f.remove(&project2);
                }
            }
            drop(f);
            let _ = app2.emit("ports-changed", &project2);
        });
    }

    mark_port_suggested(&state.suggestions, project, remote_port);
    let _ = app.emit("ports-changed", project);
    Ok(PortForward { local_port, remote_port })
}

fn wait_for_local_listen(local: u16, done: &Arc<(Mutex<bool>, Condvar)>) -> Result<(), String> {
    let addr: SocketAddr = format!("127.0.0.1:{local}").parse().unwrap();
    let deadline = Instant::now() + READY_TIMEOUT;
    loop {
        if *done.0.lock().unwrap() {
            return Err("ssh exited before listener was ready".into());
        }
        if Instant::now() >= deadline {
            return Err(format!("timed out waiting for local listener on 127.0.0.1:{local}"));
        }
        if TcpStream::connect_timeout(&addr, DIAL_TIMEOUT).is_ok() {
            return Ok(());
        }
        std::thread::sleep(POLL_SLEEP);
    }
}

fn wait_done(done: &Arc<(Mutex<bool>, Condvar)>) {
    let (m, c) = &**done;
    let mut g = m.lock().unwrap();
    while !*g {
        g = c.wait(g).unwrap();
    }
}

#[tauri::command(async)]
pub fn remove_port_forward(
    app: AppHandle,
    state: State<'_, PortFwdState>,
    project: String,
    local_port: i64,
) -> Result<(), String> {
    let mut killed = None;
    {
        let mut f = state.forwards.lock().unwrap();
        if let Some(v) = f.get_mut(&project) {
            if let Some(pos) = v.iter().position(|e| e.local_port as i64 == local_port) {
                killed = Some(v.remove(pos).pid);
            }
            if v.is_empty() {
                f.remove(&project);
            }
        }
    }
    if let Some(pid) = killed {
        unsafe { libc::kill(pid, libc::SIGKILL) };
    }
    let _ = app.emit("ports-changed", &project);
    Ok(())
}

#[tauri::command(async)]
pub fn list_port_forwards(state: State<'_, PortFwdState>, project: String) -> Vec<PortForward> {
    let f = state.forwards.lock().unwrap();
    let mut out: Vec<PortForward> = f
        .get(&project)
        .map(|v| {
            v.iter()
                .map(|e| PortForward { local_port: e.local_port, remote_port: e.remote_port })
                .collect()
        })
        .unwrap_or_default();
    out.sort_by_key(|p| p.remote_port);
    out
}

// ---- suggestions -----------------------------------------------------------

#[tauri::command(async)]
pub fn get_suggested_ports(state: State<'_, PortFwdState>, project: String) -> Vec<u16> {
    // Snapshot suggested-minus-dismissed, drop the lock, then filter by forwards
    // (disjoint locks, never nested — mirrors Go's pfMu/suggestedMu separation).
    let mut ports: Vec<u16> = {
        let s = state.suggestions.lock().unwrap();
        let suggested = s.suggested.get(&project);
        let dismissed = s.dismissed.get(&project);
        match suggested {
            Some(set) => set
                .iter()
                .filter(|p| !dismissed.map(|d| d.contains(p)).unwrap_or(false))
                .copied()
                .collect(),
            None => Vec::new(),
        }
    };
    {
        let f = state.forwards.lock().unwrap();
        let active: HashSet<u16> = f
            .get(&project)
            .map(|v| v.iter().map(|e| e.remote_port).collect())
            .unwrap_or_default();
        ports.retain(|p| !active.contains(p));
    }
    ports.sort_unstable();
    ports
}

#[tauri::command(async)]
pub fn dismiss_port_suggestion(
    app: AppHandle,
    state: State<'_, PortFwdState>,
    project: String,
    port: i64,
) -> Result<(), String> {
    if (1..=65535).contains(&port) {
        state
            .suggestions
            .lock()
            .unwrap()
            .dismissed
            .entry(project.clone())
            .or_default()
            .insert(port as u16);
    }
    let _ = app.emit("ports-changed", &project);
    Ok(())
}

#[tauri::command(async)]
pub fn clear_port_suggestions(
    app: AppHandle,
    state: State<'_, PortFwdState>,
    project: String,
) -> Result<(), String> {
    {
        let mut s = state.suggestions.lock().unwrap();
        let ports: Vec<u16> = s.suggested.get(&project).map(|set| set.iter().copied().collect()).unwrap_or_default();
        let d = s.dismissed.entry(project.clone()).or_default();
        for p in ports {
            d.insert(p);
        }
    }
    let _ = app.emit("ports-changed", &project);
    Ok(())
}

fn mark_port_suggested(suggestions: &Arc<Mutex<SuggestionState>>, project: &str, port: u16) {
    suggestions
        .lock()
        .unwrap()
        .suggested
        .entry(project.to_string())
        .or_default()
        .insert(port);
}

// ---- lifecycle teardown (called from services.rs / lib.rs via app.state) ----

/// Stop a project's forwards + poller + wipe its suggestion state (Go
/// stopProjectPortForwards + stopPortPoller).
pub fn stop_project_forwards(app: &AppHandle, project: &str) {
    let state = app.state::<PortFwdState>();
    stop_poller(&state, project);
    let pids: Vec<i32> = {
        let mut f = state.forwards.lock().unwrap();
        f.remove(project).map(|v| v.into_iter().map(|e| e.pid).collect()).unwrap_or_default()
    };
    for pid in pids {
        unsafe { libc::kill(pid, libc::SIGKILL) };
    }
    {
        let mut s = state.suggestions.lock().unwrap();
        s.suggested.remove(project);
        s.dismissed.remove(project);
    }
    let _ = app.emit("ports-changed", project);
}

/// Kill every forward + stop every poller across all projects (Go
/// stopAllPortForwards + stopAllPortPollers). No emit.
pub fn stop_all_forwards(app: &AppHandle) {
    let state = app.state::<PortFwdState>();
    for stop in state.pollers.lock().unwrap().drain().map(|(_, s)| s) {
        stop.store(true, Ordering::Relaxed);
    }
    let all: HashMap<String, Vec<Forward>> = std::mem::take(&mut state.forwards.lock().unwrap());
    for (_, v) in all {
        for e in v {
            unsafe { libc::kill(e.pid, libc::SIGKILL) };
        }
    }
}

// ---- port poller + PTY-output sniff + auto-forward -------------------------

fn stop_poller(state: &PortFwdState, project: &str) {
    if let Some(stop) = state.pollers.lock().unwrap().remove(project) {
        stop.store(true, Ordering::Relaxed);
    }
}

/// Begin polling a remote project's listening ports (idempotent, remote-only).
/// Declared service ports auto-forward; undeclared ones surface as suggestions.
pub fn start_port_poller(app: &AppHandle, project: &str) {
    let info = match config::spawn_info(project) {
        Ok(i) if i.is_remote => i,
        _ => return, // local projects / load errors don't poll
    };
    let state = app.state::<PortFwdState>();
    let stop = {
        let mut p = state.pollers.lock().unwrap();
        if p.contains_key(project) {
            return; // already polling
        }
        let stop = Arc::new(AtomicBool::new(false));
        p.insert(project.to_string(), stop.clone());
        stop
    };
    let app = app.clone();
    let project = project.to_string();
    let ssh = info.ssh.clone();
    let declared = config::declared_service_ports_of(&info);
    std::thread::spawn(move || run_poller(app, project, ssh, declared, stop));
}

/// On startup, resume pollers for remote projects whose tmux session is still
/// alive (so suggestions repopulate without a Stop/Start cycle).
pub fn resume_port_pollers(app: &AppHandle) {
    for name in config::project_names() {
        if let Ok(info) = config::spawn_info(&name) {
            if info.is_remote && crate::tmux::session_exists(&info.session) {
                start_port_poller(app, &name);
            }
        }
    }
}

fn run_poller(
    app: AppHandle,
    project: String,
    ssh: config::SshSettings,
    declared: HashSet<u16>,
    stop: Arc<AtomicBool>,
) {
    let mut first = true;
    while !stop.load(Ordering::Relaxed) {
        let ports = fetch_listening_ports(&ssh, &declared);
        if stop.load(Ordering::Relaxed) {
            break;
        }
        let state = app.state::<PortFwdState>();
        // First pass: pre-existing listeners aren't suggested (they were up
        // before we started watching) — except declared ports, which still
        // auto-forward. Steady state: observe everything.
        for &p in &ports {
            if first && !declared.contains(&p) {
                pre_dismiss(&state.suggestions, &project, p);
            } else {
                observe_port(&app, &state, &project, &declared, p);
            }
        }
        first = false;
        prune_suggestions(&app, &state, &project, &ports);
        drop(state);
        // Interruptible sleep so Stop is responsive (checks the flag every 75ms).
        let deadline = Instant::now() + POLL_INTERVAL;
        while Instant::now() < deadline && !stop.load(Ordering::Relaxed) {
            std::thread::sleep(POLL_SLEEP);
        }
    }
}

/// Run the listing command over ssh and parse the local listening ports.
fn fetch_listening_ports(ssh: &config::SshSettings, declared: &HashSet<u16>) -> Vec<u16> {
    if config::ensure_ssh_control_dir().is_err() {
        return Vec::new();
    }
    // ssh connection args minus -t (we're capturing output, not on a tty).
    let mut args: Vec<String> = config::ssh_args(ssh).into_iter().filter(|a| a != "-t").collect();
    args.push("-o".into());
    args.push("ConnectTimeout=6".into());
    args.push(LISTING_CMD.into());

    let mut cmd = Command::new("ssh");
    cmd.args(&args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null());
    match run_with_timeout(cmd, POLL_TIMEOUT) {
        Some(out) => parse_listening_ports(&out, ssh, declared),
        None => Vec::new(),
    }
}

/// Spawn a command, read its stdout, and SIGKILL it if it overruns `timeout`.
fn run_with_timeout(mut cmd: Command, timeout: Duration) -> Option<Vec<u8>> {
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

/// Parse `ss -tlnH` / `netstat -tln` output: local address is whitespace field 4.
fn parse_listening_ports(out: &[u8], ssh: &config::SshSettings, declared: &HashSet<u16>) -> Vec<u16> {
    let text = String::from_utf8_lossy(out);
    let mut seen: HashSet<u16> = HashSet::new();
    let mut ports: Vec<u16> = Vec::new();
    for line in text.lines() {
        let fields: Vec<&str> = line.split_whitespace().collect();
        if fields.len() < 4 {
            continue;
        }
        let Some((host, port)) = split_listen_addr(fields[3]) else { continue };
        if !is_local_listen_addr(&host) {
            continue;
        }
        if !should_suggest_port(port, ssh, declared) {
            continue;
        }
        if seen.insert(port) {
            ports.push(port);
        }
    }
    ports
}

/// Split a listen address into (host, port). Handles `*:p`, `0.0.0.0:p`,
/// `127.0.0.1:p`, `[::]:p`, `:::p`. None if no parseable port.
fn split_listen_addr(addr: &str) -> Option<(String, u16)> {
    let (host, port_str) = addr.rsplit_once(':')?;
    let port: u16 = port_str.parse().ok()?;
    let host = host.trim_start_matches('[').trim_end_matches(']');
    let host = if host.is_empty() || host == "*" { "0.0.0.0" } else { host };
    Some((host.to_string(), port))
}

fn is_local_listen_addr(host: &str) -> bool {
    matches!(host, "0.0.0.0" | "127.0.0.1" | "::" | "::1")
}

/// Skip the ssh port and (unless declared) privileged ports < 1024.
fn should_suggest_port(port: u16, ssh: &config::SshSettings, declared: &HashSet<u16>) -> bool {
    if port == 0 {
        return false;
    }
    let ssh_port = if ssh.port > 0 { ssh.port as u16 } else { 22 };
    if port == ssh_port {
        return false;
    }
    if declared.contains(&port) {
        return true;
    }
    port >= 1024
}

/// Single entry point for poller + sniffer discoveries: forward declared ports
/// silently, surface undeclared ports as suggestions. Deduped + dismiss-aware.
fn observe_port(
    app: &AppHandle,
    state: &PortFwdState,
    project: &str,
    declared: &HashSet<u16>,
    port: u16,
) {
    // Already tunneled? nothing to do. (forward_impl re-loads ssh from config.)
    {
        let f = state.forwards.lock().unwrap();
        if let Some(v) = f.get(project) {
            if v.iter().any(|e| e.remote_port == port) {
                return;
            }
        }
    }
    if !mark_if_new(&state.suggestions, project, port) {
        return; // dismissed, or already suggested
    }
    if declared.contains(&port) {
        auto_forward(app, project, port);
    } else {
        let _ = app.emit("ports-changed", project);
    }
}

/// Forward a declared port automatically; emit success/failure for the toast.
/// Runs on its own thread — forward_impl blocks up to 4s on the listener probe,
/// and the caller (poller / PTY flush thread) must not stall on that.
fn auto_forward(app: &AppHandle, project: &str, remote_port: u16) {
    let app = app.clone();
    let project = project.to_string();
    std::thread::spawn(move || {
        let state = app.state::<PortFwdState>();
        match forward_impl(&app, &state, &project, remote_port as i64, 0) {
            Ok(pf) => {
                let _ = app.emit(
                    "port-auto-forwarded",
                    AutoForwarded { project: project.clone(), remote_port, local_port: pf.local_port },
                );
            }
            Err(e) => {
                let _ = app.emit(
                    "port-forward-failed",
                    ForwardFailed { project: project.clone(), remote_port, error: e },
                );
            }
        }
    });
}

/// Sniff localhost URLs from a remote pane's output and observe their ports.
/// Called from the PTY flush path (remote panes only).
pub fn sniff_pane_output(app: &AppHandle, project: &str, declared: &HashSet<u16>, text: &str) {
    if !text.contains("://") {
        return; // cheap pre-filter — skips the regex on ~all output
    }
    let ports = sniff_ports_from_output(text);
    if ports.is_empty() {
        return;
    }
    let state = app.state::<PortFwdState>();
    for port in ports {
        observe_port(app, &state, project, declared, port);
    }
}

/// Extract ports from `http(s)://localhost|127.0.0.1|0.0.0.0:<port>` in `text`,
/// after stripping ANSI escapes that would otherwise split a URL.
fn sniff_ports_from_output(text: &str) -> Vec<u16> {
    static URL_RE: OnceLock<regex::Regex> = OnceLock::new();
    static ANSI_RE: OnceLock<regex::Regex> = OnceLock::new();
    let url = URL_RE.get_or_init(|| {
        regex::Regex::new(r"https?://(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})\b").unwrap()
    });
    let ansi = ANSI_RE.get_or_init(|| regex::Regex::new(r"\x1b\[[0-9;?]*[ -/]*[@-~]").unwrap());
    let clean = ansi.replace_all(text, "");
    let mut seen: HashSet<u16> = HashSet::new();
    let mut ports = Vec::new();
    for cap in url.captures_iter(&clean) {
        if let Some(p) = cap.get(1).and_then(|m| m.as_str().parse::<u16>().ok()) {
            if p != 0 && seen.insert(p) {
                ports.push(p);
            }
        }
    }
    ports
}

/// Pre-dismiss a baseline port so it's never suggested (poller first pass).
fn pre_dismiss(suggestions: &Arc<Mutex<SuggestionState>>, project: &str, port: u16) {
    suggestions
        .lock()
        .unwrap()
        .dismissed
        .entry(project.to_string())
        .or_default()
        .insert(port);
}

/// Mark a port suggested; returns false if it was dismissed or already present.
fn mark_if_new(suggestions: &Arc<Mutex<SuggestionState>>, project: &str, port: u16) -> bool {
    let mut s = suggestions.lock().unwrap();
    if s.dismissed.get(project).map(|d| d.contains(&port)).unwrap_or(false) {
        return false;
    }
    s.suggested.entry(project.to_string()).or_default().insert(port)
}

/// Drop suggestions for ports that stopped listening (never touches dismissed).
fn prune_suggestions(app: &AppHandle, state: &PortFwdState, project: &str, listening: &[u16]) {
    let live: HashSet<u16> = listening.iter().copied().collect();
    let changed = {
        let mut s = state.suggestions.lock().unwrap();
        match s.suggested.get_mut(project) {
            Some(set) => {
                let before = set.len();
                set.retain(|p| live.contains(p));
                set.len() != before
            }
            None => false,
        }
    };
    if changed {
        let _ = app.emit("ports-changed", project);
    }
}
