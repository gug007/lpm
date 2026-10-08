// Built-in Tailscale. Runs the bundled lpm-tailnet node (tailnet/ at the repo
// root, a tsnet program) as a child process, so this machine joins the user's
// tailnet as a device of its own and a phone or another machine reaches it from
// anywhere with no Tailscale app installed here. The node answers on the phone
// and peer ports by connecting through to the local listeners, and carries this
// app's own connections to tailnet addresses (see tailnet_dial.rs).
//
// The switch (tailnet_cmds.rs) lives in ~/.lpm/tailnet.json; the node's keys live in
// ~/.lpm/tailnet/ (tailnet-dev/ for a debug build, which is a separate device).
// The child exits when its stdin closes, so it never outlives the app.
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Stdio};
use std::sync::{Arc, Condvar, LazyLock, Mutex, MutexGuard};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const BIN: &str = if cfg!(windows) {
    "lpm-tailnet.exe"
} else {
    "lpm-tailnet"
};
const CHANGED_EVENT: &str = "tailnet-changed";
const STOP_GRACE: Duration = Duration::from_secs(3);
const RESPAWN_DELAYS: [u64; 5] = [1, 2, 5, 10, 30];
const HEALTHY_RUN: Duration = Duration::from_secs(60);
const STDERR_TAIL: usize = 2048;

pub(crate) const STATE_RUNNING: &str = "running";
const STATE_OFF: &str = "off";

/// A tailnet port and the loopback port of lpm's own listener it leads to.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) struct Forward {
    pub tailnet: u16,
    pub local: u16,
}

/// Which local server a tailnet port leads to.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) enum Service {
    Phone,
    Peer,
}

#[derive(Clone, Default, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub(crate) struct NodeStatus {
    pub state: String,
    #[serde(rename = "authURL")]
    pub auth_url: String,
    pub ip: String,
    pub dns_name: String,
    pub account: String,
    pub tailnet: String,
    pub error: String,
}

#[derive(Default)]
pub(crate) struct State {
    pub(crate) enabled: bool,
    pub(crate) generation: u64,
    pub(crate) stdin: Option<ChildStdin>,
    pub(crate) child: Option<SharedChild>,
    pub(crate) status: NodeStatus,
    pub(crate) dial: Option<(u16, String)>,
    pub(crate) failure: Option<String>,
    pub(crate) done: HashMap<u64, String>,
    pub(crate) next_id: u64,
    pub(crate) forwards: BTreeMap<Service, Forward>,
    pub(crate) respawns: usize,
    pub(crate) exiting: Option<SharedChild>,
}

/// The node process, shared by the thread that reaps it and whoever stops it.
/// Killing through `Child` rather than a bare pid can never hit a process that
/// reused the pid: once reaped, `Child::kill` does nothing.
pub(crate) type SharedChild = Arc<Mutex<Child>>;

const REAP_POLL: Duration = Duration::from_millis(50);

struct Hub {
    state: Mutex<State>,
    changed: Condvar,
    app: Mutex<Option<AppHandle>>,
}

static HUB: LazyLock<Hub> = LazyLock::new(|| Hub {
    state: Mutex::new(State::default()),
    changed: Condvar::new(),
    app: Mutex::new(None),
});

pub(crate) fn lock() -> MutexGuard<'static, State> {
    HUB.state.lock().unwrap()
}

/// Park until the node reports something, or `timeout` passes.
pub(crate) fn wait_changed(
    st: MutexGuard<'static, State>,
    timeout: Duration,
) -> MutexGuard<'static, State> {
    HUB.changed.wait_timeout(st, timeout).unwrap().0
}

/// The folders under ~/.lpm holding a node's keys (release, debug build).
pub(crate) const STATE_DIRS: [&str; 2] = ["tailnet", "tailnet-dev"];

fn state_dir() -> PathBuf {
    let name = STATE_DIRS[usize::from(cfg!(debug_assertions))];
    crate::config::lpm_dir().join(name)
}

/// Why built-in Tailscale can't run on this machine, if it can't. The node is
/// built with Go 1.26, which needs macOS 12 or later.
pub(crate) fn unsupported_reason() -> Option<&'static str> {
    #[cfg(target_os = "macos")]
    if crate::sys::macos_major().is_some_and(|v| v < 12) {
        return Some("Needs macOS 12 or later.");
    }
    if binary_path().is_none() {
        return Some("Not included in this build of lpm.");
    }
    None
}

pub(crate) fn binary_path() -> Option<PathBuf> {
    static PATH: LazyLock<Option<PathBuf>> = LazyLock::new(|| {
        let exe = std::env::current_exe().ok()?;
        let bin = exe.parent()?.join(BIN);
        bin.exists().then_some(bin)
    });
    PATH.clone()
}

/// The name this machine shows in the tailnet's device list.
pub(crate) fn device_name() -> String {
    static NAME: LazyLock<String> = LazyLock::new(slug_device_name);
    NAME.clone()
}

fn slug_device_name() -> String {
    let mut slug = String::new();
    for c in crate::sys::machine_name().chars() {
        if c.is_ascii_alphanumeric() {
            slug.push(c.to_ascii_lowercase());
        } else if !slug.ends_with('-') {
            slug.push('-');
        }
    }
    let slug: String = slug.trim_matches('-').chars().take(40).collect();
    let prefix = if cfg!(debug_assertions) {
        "lpm-dev"
    } else {
        "lpm"
    };
    if slug.is_empty() {
        prefix.to_string()
    } else {
        format!("{prefix}-{}", slug.trim_end_matches('-'))
    }
}

/// Load the switch and bring the node up if it is on. Called once from setup.
pub fn start(app: &AppHandle) {
    *HUB.app.lock().unwrap() = Some(app.clone());
    let enabled = crate::tailnet_cmds::load_enabled();
    let mut st = lock();
    st.enabled = enabled;
    if enabled {
        spawn_node(&mut st);
    }
}

/// Take the node down on app exit.
pub fn stop() {
    let mut st = lock();
    stop_node(&mut st);
}

fn notify(st: &State) {
    HUB.changed.notify_all();
    let payload = state_value_of(st);
    if let Some(app) = HUB.app.lock().unwrap().as_ref() {
        let _ = app.emit(CHANGED_EVENT, payload);
    }
}

pub(crate) fn spawn_node(st: &mut State) {
    // A node switched off a moment ago may still be shutting down; two at once
    // would sign in with the same keys.
    if let Some(old) = st.exiting.take() {
        let _ = old.lock().unwrap().kill();
    }
    st.generation += 1;
    let generation = st.generation;
    st.failure = None;
    st.status = NodeStatus {
        state: "starting".into(),
        ..Default::default()
    };
    let (Some(bin), None) = (binary_path(), unsupported_reason()) else {
        st.status = NodeStatus::default();
        st.failure = unsupported_reason().map(String::from);
        notify(st);
        return;
    };
    let dir = state_dir();
    let spawned = crate::osproc::command(&bin)
        .arg("-dir")
        .arg(&dir)
        .arg("-hostname")
        .arg(device_name())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();
    let mut child = match spawned {
        Ok(c) => c,
        Err(e) => {
            st.status = NodeStatus::default();
            st.failure = Some(format!("Built-in Tailscale couldn't start: {e}"));
            notify(st);
            return;
        }
    };
    st.stdin = child.stdin.take();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let child: SharedChild = Arc::new(Mutex::new(child));
    st.child = Some(child.clone());
    send_forwards(st);
    notify(st);

    let tail = Arc::new(Mutex::new(Vec::<u8>::new()));
    if let Some(mut err) = stderr {
        let tail = tail.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 1024];
            while let Ok(n) = err.read(&mut buf) {
                if n == 0 {
                    break;
                }
                let mut t = tail.lock().unwrap();
                t.extend_from_slice(&buf[..n]);
                let excess = t.len().saturating_sub(STDERR_TAIL);
                t.drain(..excess);
            }
        });
    }
    let started = Instant::now();
    std::thread::spawn(move || {
        if let Some(out) = stdout {
            for line in BufReader::new(out).lines() {
                let Ok(line) = line else { break };
                handle_line(generation, &line);
            }
        }
        while matches!(child.lock().unwrap().try_wait(), Ok(None)) {
            std::thread::sleep(REAP_POLL);
        }
        let reason = String::from_utf8_lossy(&tail.lock().unwrap())
            .trim()
            .lines()
            .last()
            .unwrap_or_default()
            .to_string();
        node_exited(generation, started.elapsed(), reason);
    });
}

fn handle_line(generation: u64, line: &str) {
    let Ok(msg) = serde_json::from_str::<Value>(line) else {
        return;
    };
    let mut st = lock();
    if st.generation != generation {
        return;
    }
    match msg.get("t").and_then(Value::as_str) {
        Some("hello") => {
            let port = msg.get("dialPort").and_then(Value::as_u64).unwrap_or(0);
            let token = msg.get("token").and_then(Value::as_str).unwrap_or("");
            if port > 0 && port <= u16::MAX as u64 && !token.is_empty() {
                st.dial = Some((port as u16, token.to_string()));
            }
        }
        Some("status") => {
            let status: NodeStatus =
                serde_json::from_value(msg.get("status").cloned().unwrap_or_default())
                    .unwrap_or_default();
            if status == st.status {
                return;
            }
            st.status = status;
        }
        Some("done") => {
            let id = msg.get("id").and_then(Value::as_u64).unwrap_or(0);
            let error = msg.get("error").and_then(Value::as_str).unwrap_or("");
            st.done.insert(id, error.to_string());
            HUB.changed.notify_all();
            return;
        }
        _ => return,
    }
    notify(&st);
}

fn node_exited(generation: u64, ran: Duration, reason: String) {
    let mut st = lock();
    if st.generation != generation {
        return;
    }
    st.stdin = None;
    st.child = None;
    st.dial = None;
    st.status = NodeStatus::default();
    st.failure = Some(if reason.is_empty() {
        "Built-in Tailscale stopped unexpectedly.".into()
    } else {
        format!("Built-in Tailscale stopped: {reason}")
    });
    if ran >= HEALTHY_RUN {
        st.respawns = 0;
    }
    // A node that keeps dying straight away (an OS too old for it, a broken
    // install) would otherwise restart forever; the pane offers Try again.
    let Some(&delay) = RESPAWN_DELAYS.get(st.respawns) else {
        notify(&st);
        return;
    };
    st.respawns += 1;
    notify(&st);
    drop(st);
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(delay));
        let mut st = lock();
        if st.generation == generation && st.enabled {
            spawn_node(&mut st);
        }
    });
}

pub(crate) fn stop_node(st: &mut State) {
    st.generation += 1;
    st.stdin = None;
    st.dial = None;
    st.status = NodeStatus::default();
    st.failure = None;
    st.respawns = 0;
    if let Some(child) = st.child.take() {
        st.exiting = Some(child.clone());
        std::thread::spawn(move || {
            std::thread::sleep(STOP_GRACE);
            let _ = child.lock().unwrap().kill();
        });
    }
    notify(st);
}

pub(crate) fn send(st: &mut State, msg: Value) -> Result<(), String> {
    let stdin = st
        .stdin
        .as_mut()
        .ok_or_else(|| "Built-in Tailscale isn't running.".to_string())?;
    let mut line = msg.to_string();
    line.push('\n');
    stdin
        .write_all(line.as_bytes())
        .and_then(|_| stdin.flush())
        .map_err(|e| format!("Built-in Tailscale isn't responding: {e}"))
}

fn send_forwards(st: &mut State) {
    let ports: BTreeMap<String, String> = st
        .forwards
        .values()
        .map(|f| (f.tailnet.to_string(), format!("127.0.0.1:{}", f.local)))
        .collect();
    let _ = send(st, json!({ "cmd": "forward", "ports": ports }));
}

/// Point a tailnet port at a local server, or drop it (`None`). Called whenever
/// that server starts, stops or moves.
pub(crate) fn set_forward(service: Service, forward: Option<Forward>) {
    let mut st = lock();
    let changed = match forward {
        Some(f) => st.forwards.insert(service, f) != Some(f),
        None => st.forwards.remove(&service).is_some(),
    };
    if changed {
        send_forwards(&mut st);
    }
}

/// A loopback listener on a free port for the node to forward a server's
/// tailnet port to. Forwarding to `127.0.0.1:<server port>` would reach
/// whichever app bound that address first, which need not be lpm.
pub(crate) fn forward_listener() -> Option<(TcpListener, u16)> {
    let listener = TcpListener::bind("127.0.0.1:0").ok()?;
    let port = listener.local_addr().ok()?.port();
    listener.set_nonblocking(true).ok()?;
    Some((listener, port))
}

/// This machine's address on the tailnet while the built-in node is connected.
pub(crate) fn ip() -> Option<String> {
    let st = lock();
    (st.status.state == STATE_RUNNING && !st.status.ip.is_empty()).then(|| st.status.ip.clone())
}

pub(crate) fn state_value_of(st: &State) -> Value {
    let s = &st.status;
    let state = if s.state.is_empty() {
        STATE_OFF
    } else {
        &s.state
    };
    let unsupported = unsupported_reason();
    let error = if let Some(reason) = unsupported {
        Some(reason.to_string())
    } else if s.error.is_empty() {
        st.failure.clone()
    } else {
        Some(s.error.clone())
    };
    json!({
        "available": unsupported.is_none(),
        "enabled": st.enabled,
        "state": state,
        "authUrl": (!s.auth_url.is_empty()).then(|| s.auth_url.clone()),
        "ip": (!s.ip.is_empty()).then(|| s.ip.clone()),
        "dnsName": (!s.dns_name.is_empty()).then(|| s.dns_name.clone()),
        "account": (!s.account.is_empty()).then(|| s.account.clone()),
        "tailnet": (!s.tailnet.is_empty()).then(|| s.tailnet.clone()),
        "error": error,
        "deviceName": device_name(),
        "systemIp": crate::netif::tailscale_ip(),
    })
}
