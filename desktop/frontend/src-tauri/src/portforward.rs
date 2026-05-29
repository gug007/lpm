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
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

const READY_TIMEOUT: Duration = Duration::from_secs(4);
const DIAL_TIMEOUT: Duration = Duration::from_millis(200);
const POLL_SLEEP: Duration = Duration::from_millis(75);

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
    if !(1..=65535).contains(&remote_port) {
        return Err(format!("invalid remote port: {remote_port}"));
    }
    if !(0..=65535).contains(&local_port) {
        return Err(format!("invalid local port: {local_port}"));
    }
    let info = config::spawn_info(&project).map_err(|e| format!("load project: {e}"))?;
    if !info.is_remote {
        return Err(format!("project {project:?} is not a remote SSH project"));
    }
    let remote_port = remote_port as u16;

    // Idempotency: an existing tunnel for this remote port wins.
    {
        let f = state.forwards.lock().unwrap();
        if let Some(v) = f.get(&project) {
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
        .entry(project.clone())
        .or_default()
        .push(Forward { id, local_port, remote_port, pid });

    // Lifecycle: when the ssh child dies, drop the entry and refetch the UI.
    {
        let (done, forwards, app2, project2) =
            (done.clone(), state.forwards.clone(), app.clone(), project.clone());
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

    mark_port_suggested(&state.suggestions, &project, remote_port);
    let _ = app.emit("ports-changed", &project);
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

/// Stop a project's forwards + wipe its suggestion state (Go stopProjectPortForwards).
pub fn stop_project_forwards(app: &AppHandle, project: &str) {
    let state = app.state::<PortFwdState>();
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

/// Kill every forward across all projects (Go stopAllPortForwards). No emit.
pub fn stop_all_forwards(app: &AppHandle) {
    let state = app.state::<PortFwdState>();
    let all: HashMap<String, Vec<Forward>> = std::mem::take(&mut state.forwards.lock().unwrap());
    for (_, v) in all {
        for e in v {
            unsafe { libc::kill(e.pid, libc::SIGKILL) };
        }
    }
}
