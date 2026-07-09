// Mobile remote-control server.
//
// A phone (the lpm mobile app) pairs with this Mac and gets a live, co-
// interactive mirror of the desktop's terminals plus project start/stop and
// status — the detached-window experience over the network. All execution stays
// on the Mac; the phone is a display/input client, exactly like the SSH clients
// and companion apps (Happy, Omnara) already on the App Store.
//
// Design mirrors socketsrv.rs: a fire-and-forget std::thread server (no tokio),
// one blocking WebSocket per connection. It is intentionally self-contained on
// the Rust side and never touches the frontend event bus for the core flow:
//   - terminal output is teed at pty::flush() into a bounded per-terminal ring
//     (so a joining phone is seeded with recent scrollback, no owner-window
//     round-trip and no dependency on the main window being open),
//   - input/resize call the pty::remote_* accessors,
//   - project control calls the existing services commands,
//   - status/projects changes are forwarded from the Rust event bus (app.listen
//     receives the Rust-emitted `status-changed` / `projects-changed` events),
//     with an explicit request/response pull as a fallback.
//
// Security posture (v1): a per-device bearer token established by a single-use
// pairing code (shown as a QR in Settings); token hashes are stored in
// ~/.lpm/remote.json (0600). The transport is plaintext WebSocket, so the server
// binds to loopback by default and LAN exposure is an explicit opt-in — run it
// over a Tailscale tailnet (encrypted) for away-from-home access. Native TLS
// (rcgen + rustls, both already in the dependency graph) is a tracked follow-up.
use crate::status::StatusStore;
use crate::{config, pty, services};
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet, VecDeque};
use std::net::{TcpListener, TcpStream};
use std::os::unix::fs::PermissionsExt;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, SyncSender, TryRecvError};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Listener, Manager, State};
use tungstenite::{accept, Error as WsError, Message, WebSocket};

const DEFAULT_PORT: u16 = 8765;
const RING_CAP: usize = 96 * 1024; // recent scrollback seeded to a joining phone
const POLL: Duration = Duration::from_millis(25); // read-timeout / outbound-drain cadence
const AUTH_TIMEOUT: Duration = Duration::from_secs(20);
const OUT_QUEUE: usize = 1024; // per-client outbound depth; overflow drops (phone re-seeds)

// --- persisted config (~/.lpm/remote.json) -----------------------------------

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(default)]
struct Device {
    id: String,
    name: String,
    token_hash: String, // sha256(token) hex — the raw token lives only on the phone
    created_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(default)]
struct RemoteConfig {
    enabled: bool,
    lan: bool,  // bind 0.0.0.0 (reachable on LAN/tailnet) vs 127.0.0.1 (loopback only)
    port: u16,  // 0 => DEFAULT_PORT
    pairing_code: String, // non-empty while an unused pairing code is outstanding
    tailscale: bool, // advertise this Mac's Tailscale address in the pairing QR
    devices: Vec<Device>,
}

impl Default for RemoteConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            lan: false,
            port: 0,
            pairing_code: String::new(),
            tailscale: true, // away-from-home works out of the box; the toggle opts out
            devices: Vec::new(),
        }
    }
}

fn effective_port(p: u16) -> u16 {
    if p == 0 {
        DEFAULT_PORT
    } else {
        p
    }
}

// Test-only override so a test exercising the real pair path (which persists on
// success) writes to a temp file instead of the user's ~/.lpm/remote.json. A
// static (not an env var) avoids the data race of mutating the process
// environment while other test threads run.
#[cfg(test)]
static TEST_CONFIG_PATH: Mutex<Option<std::path::PathBuf>> = Mutex::new(None);

fn config_path() -> std::path::PathBuf {
    #[cfg(test)]
    if let Some(p) = TEST_CONFIG_PATH.lock().unwrap().clone() {
        return p;
    }
    config::lpm_dir().join("remote.json")
}

fn load_config() -> RemoteConfig {
    match std::fs::read(config_path()) {
        Ok(b) => serde_json::from_slice(&b).unwrap_or_default(),
        Err(_) => RemoteConfig::default(),
    }
}

fn save_config(cfg: &RemoteConfig) -> Result<(), String> {
    std::fs::create_dir_all(config::lpm_dir()).map_err(|e| e.to_string())?;
    let data = serde_json::to_vec_pretty(cfg).map_err(|e| e.to_string())?;
    std::fs::write(config_path(), &data).map_err(|e| e.to_string())?;
    let _ = std::fs::set_permissions(config_path(), std::fs::Permissions::from_mode(0o600));
    Ok(())
}

// --- shared state ------------------------------------------------------------

struct Client {
    tx: SyncSender<String>,
    subs: Arc<Mutex<HashSet<String>>>,
    device_id: String,
}

#[derive(Default)]
struct HubInner {
    clients: Mutex<HashMap<u64, Client>>,
    rings: Mutex<HashMap<String, VecDeque<u8>>>,
    // Live terminal id -> display label, pushed from the frontend (which owns the
    // tab tree). terminals.json persists labels but strips the ephemeral pty id,
    // so the frontend is the only source of the id->label mapping. Upsert-only:
    // dead ids linger harmlessly since only live sessions are ever reported.
    labels: Mutex<HashMap<String, String>>,
    // Live terminal id -> AI CLI ("claude"/"codex"/…), detected by the frontend
    // from the terminal's launch command; empty/absent for plain shells. Drives
    // the mobile composer's slash-command autocomplete.
    clis: Mutex<HashMap<String, String>>,
    // Live terminal id -> pinned, pushed from the frontend tab tree so the phone
    // can show the pin state and offer Pin/Unpin in the tab menu.
    pinned: Mutex<HashMap<String, bool>>,
    // Live terminal id -> tab emoji (from the frontend tab tree), so the phone can
    // show the same per-terminal tab icon the desktop does. Empty when unset.
    emojis: Mutex<HashMap<String, String>>,
    // project -> the ORDERED terminal ids in that project's tab tree (desktop tab
    // order), replaced on each frontend push. The phone's terminal list is emitted
    // in this order and scoped to it (intersected with live PTYs), so it matches
    // the desktop's tab order and orphaned/leaked PTYs — live sessions no longer in
    // any tab tree — never appear. Unlike labels (upsert-only), this is
    // authoritative membership + order.
    tree_ids: Mutex<HashMap<String, Vec<String>>>,
    // Queued phone requests to run an action / open a terminal. The frontend
    // drains this via remote_take_run_actions — the emitted event is only a
    // wake-up, so a request survives arriving before the main window's
    // listener is mounted (app just launched, window re-created).
    pending_run_actions: Mutex<Vec<Value>>,
    config: Mutex<RemoteConfig>,
    next_id: AtomicU64,
    generation: AtomicU64, // bumped on every (re)start to retire old accept/conn threads
    enabled: AtomicBool,   // mirror of config.enabled, checked on the pty flush hot path
    running: AtomicBool,   // a listener is currently bound
}

#[derive(Clone, Default)]
pub struct RemoteHub {
    inner: Arc<HubInner>,
}

impl RemoteHub {
    fn config(&self) -> RemoteConfig {
        self.inner.config.lock().unwrap().clone()
    }

    fn device_exists(&self, id: &str) -> bool {
        self.inner.config.lock().unwrap().devices.iter().any(|d| d.id == id)
    }

    /// Recent scrollback for a terminal, dropping a partial leading line when the
    /// ring is full so the seed starts on a clean row.
    fn ring_text(&self, id: &str) -> String {
        let rings = self.inner.rings.lock().unwrap();
        let Some(r) = rings.get(id) else {
            return String::new();
        };
        let full = r.len() >= RING_CAP;
        let bytes: Vec<u8> = r.iter().copied().collect();
        let s = String::from_utf8_lossy(&bytes).into_owned();
        match (full, s.find('\n')) {
            (true, Some(i)) => s[i + 1..].to_string(),
            _ => s,
        }
    }

    fn drop_ring(&self, id: &str) {
        self.inner.rings.lock().unwrap().remove(id);
    }

    /// A paired device's friendly name (for the "Active on <name>" placeholder),
    /// falling back to a generic label.
    fn device_name(&self, id: &str) -> String {
        self.inner
            .config
            .lock()
            .unwrap()
            .devices
            .iter()
            .find(|d| d.id == id)
            .map(|d| d.name.clone())
            .filter(|n| !n.is_empty())
            .unwrap_or_else(|| "iPhone".to_string())
    }
}

// --- output tee (called from pty::flush / exit) ------------------------------

/// Append a PTY output chunk to its ring and fan it out to subscribed phones.
/// A no-op when the server is disabled. Never blocks the reader: the ring append
/// is a bounded copy and client sends are non-blocking (drop on a full queue).
pub fn tee_output(app: &AppHandle, id: &str, _project: &str, text: &str) {
    let Some(hub) = app.try_state::<RemoteHub>() else {
        return;
    };
    if !hub.inner.enabled.load(Ordering::Relaxed) {
        return;
    }
    {
        let mut rings = hub.inner.rings.lock().unwrap();
        let ring = rings.entry(id.to_string()).or_default();
        ring.extend(text.as_bytes());
        let over = ring.len().saturating_sub(RING_CAP);
        if over > 0 {
            ring.drain(..over);
        }
    }
    let payload = json!({ "t": "o", "id": id, "d": text }).to_string();
    let clients = hub.inner.clients.lock().unwrap();
    for c in clients.values() {
        if c.subs.lock().unwrap().contains(id) {
            let _ = c.tx.try_send(payload.clone());
        }
    }
}

/// Tell subscribed phones a terminal exited and free its ring.
pub fn tee_exit(app: &AppHandle, id: &str, code: i32) {
    let Some(hub) = app.try_state::<RemoteHub>() else {
        return;
    };
    if !hub.inner.enabled.load(Ordering::Relaxed) {
        return;
    }
    let payload = json!({ "t": "exit", "id": id, "code": code }).to_string();
    {
        let clients = hub.inner.clients.lock().unwrap();
        for c in clients.values() {
            if c.subs.lock().unwrap().contains(id) {
                let _ = c.tx.try_send(payload.clone());
            }
        }
    }
    hub.drop_ring(id);
}

fn broadcast(hub: &RemoteHub, val: Value) {
    let payload = val.to_string();
    let clients = hub.inner.clients.lock().unwrap();
    for c in clients.values() {
        let _ = c.tx.try_send(payload.clone());
    }
}

/// Fan out a terminal's new control owner to paired phones. Called from
/// `control::broadcast` alongside the desktop `app.emit`. No-op when the server
/// is disabled (no clients to notify).
pub fn push_control(app: &AppHandle, id: &str, owner: &Option<crate::control::Owner>) {
    let Some(hub) = app.try_state::<RemoteHub>() else {
        return;
    };
    if !hub.inner.enabled.load(Ordering::Relaxed) {
        return;
    }
    let owner = crate::control::owner_json(owner);
    broadcast(hub.inner(), json!({ "t": "control", "id": id, "owner": owner }));
}

/// The control surface for a paired phone.
fn mobile_owner(hub: &RemoteHub, device_id: &str) -> crate::control::Owner {
    crate::control::Owner::new("mobile", device_id, hub.device_name(device_id))
}

// --- lifecycle ---------------------------------------------------------------

/// Load persisted config, install event forwarders, and start the server if
/// enabled. Called once from lib.rs setup (mirrors socketsrv::start).
pub fn start(hub: RemoteHub, app: AppHandle) {
    *hub.inner.config.lock().unwrap() = load_config();
    install_forwarders(&hub, &app);
    apply(&hub, &app);
}

/// (Re)start or stop the listener to match the current config. Bumping the
/// generation retires any previous accept loop and connection threads.
fn apply(hub: &RemoteHub, app: &AppHandle) {
    let generation = hub.inner.generation.fetch_add(1, Ordering::SeqCst) + 1;
    let cfg = hub.config();
    hub.inner.enabled.store(cfg.enabled, Ordering::Relaxed);
    if !cfg.enabled {
        hub.inner.running.store(false, Ordering::Relaxed);
        return;
    }
    let bind = if cfg.lan { "0.0.0.0" } else { "127.0.0.1" };
    let addr = format!("{bind}:{}", effective_port(cfg.port));
    // Bind on a background thread so the invoking command never blocks the UI,
    // and retry: the previous generation's accept loop may still hold the port
    // (it only notices the generation bump on its next ≤200ms tick), so a fresh
    // bind can transiently hit EADDRINUSE. Retrying rides over that window
    // instead of leaving nothing listening.
    let (hub, app) = (hub.clone(), app.clone());
    std::thread::spawn(move || {
        let mut bound = None;
        for _ in 0..25 {
            if hub.inner.generation.load(Ordering::SeqCst) != generation {
                return; // superseded by a newer apply() — let that one bind
            }
            match TcpListener::bind(&addr) {
                Ok(l) => {
                    bound = Some(l);
                    break;
                }
                Err(_) => std::thread::sleep(Duration::from_millis(100)),
            }
        }
        let Some(listener) = bound else {
            eprintln!("warning: mobile remote server could not bind {addr}");
            hub.inner.running.store(false, Ordering::Relaxed);
            return;
        };
        let _ = listener.set_nonblocking(true);
        hub.inner.running.store(true, Ordering::Relaxed);
        accept_loop(listener, hub, app, generation);
    });
}

/// Signal a clean shutdown (app exit). Retires threads and drops clients.
pub fn stop(hub: &RemoteHub) {
    hub.inner.generation.fetch_add(1, Ordering::SeqCst);
    hub.inner.enabled.store(false, Ordering::Relaxed);
    hub.inner.running.store(false, Ordering::Relaxed);
    hub.inner.clients.lock().unwrap().clear();
}

fn accept_loop(listener: TcpListener, hub: RemoteHub, app: AppHandle, generation: u64) {
    loop {
        if hub.inner.generation.load(Ordering::SeqCst) != generation {
            return; // retired by a config change or shutdown
        }
        match listener.accept() {
            Ok((stream, _)) => {
                // The listener is non-blocking (so accept() can poll the
                // generation), and on macOS the accepted socket inherits that
                // flag. A non-blocking socket ignores set_read_timeout — reads
                // return WouldBlock instantly — which would make authenticate's
                // first read fail and the whole handler busy-spin. Force it back
                // to blocking so the read timeouts we set actually apply.
                let _ = stream.set_nonblocking(false);
                let (hub, app) = (hub.clone(), app.clone());
                std::thread::spawn(move || handle_conn(stream, hub, app, generation));
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(200));
            }
            Err(_) => std::thread::sleep(Duration::from_millis(200)),
        }
    }
}

fn accept_ws(stream: TcpStream) -> Option<WebSocket<TcpStream>> {
    let _ = stream.set_nodelay(true);
    let _ = stream.set_read_timeout(Some(AUTH_TIMEOUT));
    accept(stream).ok()
}

fn handle_conn(stream: TcpStream, hub: RemoteHub, app: AppHandle, generation: u64) {
    let Some(mut ws) = accept_ws(stream) else {
        return;
    };
    let device_id = match authenticate(&mut ws, &hub) {
        Some(outcome) => {
            if outcome.is_new_pairing() {
                // A phone just paired — nudge any open Settings pane to refetch its
                // device list instead of waiting for the pane to remount.
                let _ = app.emit("remote-devices-changed", ());
            }
            outcome.into_device_id()
        }
        None => {
            let _ = ws.close(None);
            let _ = ws.flush();
            return;
        }
    };

    let (tx, rx) = mpsc::sync_channel::<String>(OUT_QUEUE);
    let subs = Arc::new(Mutex::new(HashSet::new()));
    let conn_id = hub.inner.next_id.fetch_add(1, Ordering::SeqCst) + 1;
    hub.inner.clients.lock().unwrap().insert(
        conn_id,
        Client {
            tx,
            subs: subs.clone(),
            device_id: device_id.clone(),
        },
    );
    let _ = ws.get_ref().set_read_timeout(Some(POLL));

    'main: loop {
        // Retire on server restart or when this device is revoked.
        if hub.inner.generation.load(Ordering::SeqCst) != generation || !hub.device_exists(&device_id) {
            break;
        }
        // Flush any queued output/broadcasts to the socket.
        loop {
            match rx.try_recv() {
                Ok(s) => {
                    if ws.write(Message::text(s)).is_err() {
                        break 'main;
                    }
                }
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Disconnected) => break 'main,
            }
        }
        let _ = ws.flush();
        // Read one inbound message (bounded by the POLL read timeout).
        match ws.read() {
            Ok(msg) => {
                if msg.is_close() {
                    break;
                }
                if msg.is_text() {
                    if let Ok(txt) = msg.to_text() {
                        let txt = txt.to_string();
                        if handle_msg(&mut ws, &txt, &hub, &app, &subs, &device_id).is_err() {
                            break;
                        }
                    }
                }
            }
            Err(WsError::Io(ref e))
                if e.kind() == std::io::ErrorKind::WouldBlock
                    || e.kind() == std::io::ErrorKind::TimedOut => {}
            Err(WsError::ConnectionClosed) | Err(WsError::AlreadyClosed) => break,
            Err(_) => break,
        }
    }

    hub.inner.clients.lock().unwrap().remove(&conn_id);
    // Release any terminal control this phone held so ownership transfers back to
    // a desktop window (or another presenter) instead of stranding on a gone
    // client.
    let owner = mobile_owner(&hub, &device_id);
    for (id, new_owner) in app.state::<crate::control::ControlState>().drop_surface(&owner) {
        crate::control::broadcast(&app, &id, &new_owner);
    }
    let _ = ws.close(None);
    let _ = ws.flush();
}

// --- auth / pairing ----------------------------------------------------------

enum AuthOutcome {
    Paired(String),
    Resumed(String),
}

impl AuthOutcome {
    fn is_new_pairing(&self) -> bool {
        matches!(self, AuthOutcome::Paired(_))
    }

    fn into_device_id(self) -> String {
        match self {
            AuthOutcome::Paired(id) | AuthOutcome::Resumed(id) => id,
        }
    }
}

fn authenticate(ws: &mut WebSocket<TcpStream>, hub: &RemoteHub) -> Option<AuthOutcome> {
    let txt = loop {
        match ws.read() {
            Ok(m) if m.is_text() => break m.to_text().ok()?.to_string(),
            Ok(m) if m.is_close() => return None,
            Ok(_) => continue, // ping/pong/binary during handshake — keep waiting
            Err(_) => return None,
        }
    };
    let v: Value = serde_json::from_str(&txt).ok()?;
    match v.get("t").and_then(Value::as_str) {
        Some("pair") => {
            let code = v.get("code").and_then(Value::as_str).unwrap_or_default();
            let name = v.get("name").and_then(Value::as_str).unwrap_or("device");
            match pair_device(hub, code, name) {
                Some((id, token)) => {
                    let _ = ws.send(Message::text(
                        json!({ "t": "paired", "deviceId": id, "token": token }).to_string(),
                    ));
                    Some(AuthOutcome::Paired(id))
                }
                None => {
                    let _ = ws.send(Message::text(
                        json!({ "t": "error", "error": "pairing rejected" }).to_string(),
                    ));
                    None
                }
            }
        }
        Some("auth") => {
            let id = v.get("deviceId").and_then(Value::as_str).unwrap_or_default();
            let token = v.get("token").and_then(Value::as_str).unwrap_or_default();
            if check_device(hub, id, token) {
                let _ = ws.send(Message::text(json!({ "t": "ready" }).to_string()));
                Some(AuthOutcome::Resumed(id.to_string()))
            } else {
                let _ = ws.send(Message::text(
                    json!({ "t": "error", "error": "unauthorized" }).to_string(),
                ));
                None
            }
        }
        _ => None,
    }
}

fn normalize_code(s: &str) -> String {
    s.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_uppercase()
}

fn pair_device(hub: &RemoteHub, code: &str, name: &str) -> Option<(String, String)> {
    let mut cfg = hub.inner.config.lock().unwrap();
    let expected = normalize_code(&cfg.pairing_code);
    if expected.is_empty() || !ct_eq(expected.as_bytes(), normalize_code(code).as_bytes()) {
        return None;
    }
    let token = gen_token();
    let device = Device {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.chars().take(64).collect(),
        token_hash: sha256_hex(token.as_bytes()),
        created_at: crate::status::now_millis(),
    };
    let id = device.id.clone();
    cfg.devices.push(device);
    cfg.pairing_code.clear(); // single use — the next device needs a fresh code
    let snapshot = cfg.clone();
    drop(cfg);
    let _ = save_config(&snapshot);
    Some((id, token))
}

fn check_device(hub: &RemoteHub, id: &str, token: &str) -> bool {
    if id.is_empty() || token.is_empty() {
        return false;
    }
    let want = sha256_hex(token.as_bytes());
    hub.inner
        .config
        .lock()
        .unwrap()
        .devices
        .iter()
        .any(|d| d.id == id && ct_eq(d.token_hash.as_bytes(), want.as_bytes()))
}

// --- request dispatch --------------------------------------------------------

fn send(ws: &mut WebSocket<TcpStream>, val: Value) -> Result<(), ()> {
    ws.send(Message::text(val.to_string())).map_err(|_| ())
}

fn result_reply(kind: &str, r: Result<(), String>) -> Value {
    match r {
        Ok(()) => json!({ "t": kind, "ok": true }),
        Err(e) => json!({ "t": kind, "ok": false, "error": e }),
    }
}

/// Queue a phone run-action/new-terminal request and wake the main window's
/// listener. Delivery is pull-based (remote_take_run_actions) so a request
/// that lands before the listener is mounted is picked up on mount instead of
/// being lost with a fire-and-forget emit.
fn queue_run_action(hub: &RemoteHub, app: &AppHandle, req: Value) {
    hub.inner.pending_run_actions.lock().unwrap().push(req);
    let _ = app.emit("remote-run-action", ());
}

fn handle_msg(
    ws: &mut WebSocket<TcpStream>,
    txt: &str,
    hub: &RemoteHub,
    app: &AppHandle,
    subs: &Arc<Mutex<HashSet<String>>>,
    device_id: &str,
) -> Result<(), ()> {
    let v: Value = match serde_json::from_str(txt) {
        Ok(v) => v,
        Err(_) => return Ok(()),
    };
    let t = v.get("t").and_then(Value::as_str).unwrap_or_default();
    let str_field = |k: &str| v.get(k).and_then(Value::as_str).map(str::to_string);

    match t {
        "ping" => send(ws, json!({ "t": "pong" }))?,
        "projects" => send(ws, json!({ "t": "projects", "projects": list_projects_json(app) }))?,
        "sidebar" => {
            let sb = sidebar_json();
            send(ws, json!({ "t": "sidebar", "order": sb.0, "groups": sb.1 }))?;
        }
        "terminals" => {
            let project = str_field("project").unwrap_or_default();
            let terms = pty::remote_terminals(&app.state::<pty::PtyState>(), &project);
            // Emit in the desktop's tab-tree order and scope to it, so the phone's
            // list matches the desktop tabs (and reordering sticks) and orphaned/
            // leaked PTYs — live sessions no longer in any tree — don't show. Fall
            // back to all live sessions (id order) when the frontend hasn't
            // registered a set yet (older client, or the project's window isn't open).
            let terms: Vec<pty::RemoteTerminal> =
                match hub.inner.tree_ids.lock().unwrap().get(&project) {
                    Some(order) => {
                        let live: HashMap<&str, &pty::RemoteTerminal> =
                            terms.iter().map(|t| (t.id.as_str(), t)).collect();
                        order
                            .iter()
                            .filter_map(|id| live.get(id.as_str()).map(|t| (*t).clone()))
                            .collect()
                    }
                    None => terms,
                };
            // Attach the desktop's tab label to each terminal (falling back to the
            // id when the frontend hasn't registered one, e.g. an unopened project).
            let labels = hub.inner.labels.lock().unwrap();
            let pinned = hub.inner.pinned.lock().unwrap();
            let emojis = hub.inner.emojis.lock().unwrap();
            let terms: Vec<Value> = terms
                .iter()
                .map(|t| {
                    let mut o = serde_json::to_value(t).unwrap_or_else(|_| json!({}));
                    let label = labels.get(&t.id).cloned().unwrap_or_else(|| t.id.clone());
                    if let Some(m) = o.as_object_mut() {
                        m.insert("label".into(), json!(label));
                        m.insert("pinned".into(), json!(pinned.get(&t.id).copied().unwrap_or(false)));
                        m.insert("emoji".into(), json!(emojis.get(&t.id).cloned().unwrap_or_default()));
                    }
                    o
                })
                .collect();
            drop(labels);
            drop(pinned);
            drop(emojis);
            send(ws, json!({ "t": "terminals", "project": project, "terminals": terms }))?;
        }
        "slash" => {
            // Slash-command autocomplete for a terminal: the frontend registered
            // which AI CLI the terminal runs (detected from its launch command);
            // scan that CLI's built-ins + the project's custom commands.
            let id = str_field("id").unwrap_or_default();
            let project = str_field("project").unwrap_or_default();
            let cli = hub.inner.clis.lock().unwrap().get(&id).cloned().unwrap_or_default();
            let commands = if cli.is_empty() {
                json!([])
            } else {
                let cwd = config::project_root(&project).map(|(r, _)| r).unwrap_or_default();
                match crate::aigen::list_agent_commands(cli, cwd) {
                    Ok(cmds) => serde_json::to_value(cmds).unwrap_or_else(|_| json!([])),
                    Err(_) => json!([]),
                }
            };
            send(ws, json!({ "t": "slash", "id": id, "commands": commands }))?;
        }
        "mentions" => {
            // @-mention autocomplete: the project's files/dirs (relative paths the
            // agent resolves), with git working-tree changes flagged and surfaced
            // first. The phone fetches once and filters locally.
            let project = str_field("project").unwrap_or_default();
            let cwd = config::project_root(&project).map(|(r, _)| r).unwrap_or_default();
            let changed: HashSet<String> = if cwd.is_empty() {
                HashSet::new()
            } else {
                crate::git::git_changed_files(cwd.clone())
                    .into_iter()
                    .map(|c| c.path)
                    .collect()
            };
            let files = if cwd.is_empty() {
                Vec::new()
            } else {
                crate::files::list_dir_files(cwd).unwrap_or_default()
            };
            let mut seen = HashSet::new();
            let mut entries: Vec<Value> = Vec::new();
            for f in &files {
                seen.insert(f.path.clone());
                let ch = changed.contains(&f.path);
                entries.push(json!({ "path": f.path, "dir": f.is_dir, "changed": ch }));
            }
            // Changed files the walk skipped (e.g. inside an ignored dir) still count.
            for p in &changed {
                if !seen.contains(p) {
                    entries.push(json!({ "path": p, "dir": false, "changed": true }));
                }
            }
            send(ws, json!({ "t": "mentions", "project": project, "entries": entries }))?;
        }
        "history" => {
            // Recall: recent sent prompts for this project (scoped by project, not
            // terminal, because the desktop records under a stable historyKey the
            // phone doesn't have — the ephemeral pty id wouldn't match).
            let project = str_field("project").unwrap_or_default();
            let input = crate::message_history::QueryInput {
                scope: "project".into(),
                terminal_id: String::new(),
                project_name: project.clone(),
                terminal_label: String::new(),
                collection: String::new(),
                search: str_field("q").unwrap_or_default(),
                cursor_at: None,
                cursor_seq: None,
                limit: 100,
            };
            let rows = crate::message_history::message_history_query(
                app.state::<crate::message_history::MessageHistoryState>(),
                input,
            )
            .unwrap_or_default();
            let rows = serde_json::to_value(rows).unwrap_or_else(|_| json!([]));
            send(ws, json!({ "t": "history", "project": project, "rows": rows }))?;
        }
        "historyAdd" => {
            // Record a prompt the phone sent so it joins the shared history (and
            // shows up on the desktop too).
            let text = str_field("text").unwrap_or_default();
            if !text.trim().is_empty() {
                let input = crate::message_history::AddInput {
                    text,
                    project_name: str_field("project").unwrap_or_default(),
                    terminal_id: str_field("id").unwrap_or_default(),
                    terminal_label: str_field("label").unwrap_or_default(),
                    images: Default::default(),
                };
                let _ = crate::message_history::message_history_add(
                    app.state::<crate::message_history::MessageHistoryState>(),
                    input,
                );
            }
        }
        "upload" => {
            // The phone sends a base64 image; save it to a temp file on the Mac and
            // return its path (paste-quoted, scp'd first for a remote pane). The
            // phone drops the path into the composer, which pastes it so an agent
            // like Claude Code loads the image.
            let id = str_field("id").unwrap_or_default();
            let data = str_field("data").unwrap_or_default();
            let mime = str_field("mime").unwrap_or_else(|| "image/png".to_string());
            let res = crate::upload::upload_clipboard_image_for_terminal(
                app.state::<pty::PtyState>(),
                id.clone(),
                data,
                mime,
            );
            match res {
                Ok(path) => send(ws, json!({ "t": "upload", "id": id, "ok": true, "path": path }))?,
                Err(e) => send(ws, json!({ "t": "upload", "id": id, "ok": false, "error": e }))?,
            }
        }
        "status" => {
            let project = str_field("project").unwrap_or_default();
            let list = app.state::<Arc<StatusStore>>().list(&project);
            send(ws, json!({ "t": "status", "project": project, "status": list }))?;
        }
        "sub" => {
            if let Some(id) = str_field("id") {
                subs.lock().unwrap().insert(id.clone());
                // Opening a terminal screen on the phone takes control of it (the
                // surface the user just opened should be where it's live). The
                // previous owner is pushed a `control` frame and flips to its
                // placeholder. `owner` in the seed confirms this phone owns it.
                let (owner, changed) = app
                    .state::<crate::control::ControlState>()
                    .claim(&id, mobile_owner(hub, device_id));
                if changed {
                    crate::control::broadcast(app, &id, &Some(owner.clone()));
                }
                let (cols, rows) =
                    pty::remote_dims(&app.state::<pty::PtyState>(), &id).unwrap_or((80, 24));
                send(
                    ws,
                    json!({ "t": "seed", "id": id, "cols": cols, "rows": rows, "data": hub.ring_text(&id), "owner": crate::control::owner_json(&Some(owner)) }),
                )?;
            }
        }
        "unsub" => {
            if let Some(id) = str_field("id") {
                subs.lock().unwrap().remove(&id);
                let (owner, changed) = app
                    .state::<crate::control::ControlState>()
                    .unpresent(&id, &mobile_owner(hub, device_id));
                if changed {
                    crate::control::broadcast(app, &id, &owner);
                }
            }
        }
        "claim" => {
            if let Some(id) = str_field("id") {
                let (owner, changed) = app
                    .state::<crate::control::ControlState>()
                    .claim(&id, mobile_owner(hub, device_id));
                if changed {
                    crate::control::broadcast(app, &id, &Some(owner));
                }
            }
        }
        "in" => {
            if let (Some(id), Some(d)) = (str_field("id"), str_field("d")) {
                let _ = pty::remote_write(&app.state::<pty::PtyState>(), &id, &d);
            }
        }
        "resize" => {
            let id = str_field("id").unwrap_or_default();
            let cols = v.get("cols").and_then(Value::as_u64).unwrap_or(0) as u16;
            let rows = v.get("rows").and_then(Value::as_u64).unwrap_or(0) as u16;
            // Only the current owner may drive the single shared PTY geometry —
            // a non-owning phone must not fight the desktop over it. Absent an
            // owner (nobody claimed yet) the resize is allowed.
            let ctrl = app.state::<crate::control::ControlState>();
            let may_resize = match ctrl.owner_of(&id) {
                None => true,
                Some(o) => o.kind == "mobile" && o.id == device_id,
            };
            if !id.is_empty() && cols > 0 && rows > 0 && may_resize {
                let _ = pty::remote_resize(&app.state::<pty::PtyState>(), &id, cols, rows);
            }
        }
        "start" => {
            let name = str_field("name").unwrap_or_default();
            let profile = str_field("profile").unwrap_or_default();
            let r = services::start_project(
                app.clone(),
                app.state::<services::ServiceState>(),
                name,
                profile,
            );
            send(ws, result_reply("start", r))?;
        }
        "stop" => {
            let name = str_field("name").unwrap_or_default();
            let r = services::stop_project_internal(app, &app.state::<services::ServiceState>(), &name);
            send(ws, result_reply("stop", r))?;
        }
        "toggleService" => {
            let name = str_field("name").unwrap_or_default();
            let service = str_field("service").unwrap_or_default();
            let r = services::toggle_project_service(
                app.clone(),
                app.state::<services::ServiceState>(),
                name,
                service,
            );
            send(ws, result_reply("toggleService", r))?;
        }
        // Duplicate a project, mirroring the desktop modal. Rust creates the copies
        // one at a time (a pure config + disk clone, like start/stop — works with no
        // main window open), streaming a `duplicateProgress` frame per copy so the
        // phone can show progress, then optionally groups them under a sidebar
        // folder. A run task (action/command + prompt) is frontend-owned — Rust
        // can't drive a terminal — so each copy's task is relayed to the main
        // window's spawnTasks via `remote-run-task`; that part needs the window
        // open (else the reply carries a `warning`, the copies still exist).
        "duplicate" => {
            let name = str_field("name").unwrap_or_default();
            let count = v
                .get("count")
                .and_then(Value::as_u64)
                .unwrap_or(1)
                .clamp(1, 50) as u32;
            let labels: Vec<String> = v
                .get("labels")
                .and_then(Value::as_array)
                .map(|a| a.iter().map(|x| x.as_str().unwrap_or_default().to_string()).collect())
                .unwrap_or_default();
            let exclude_uncommitted =
                v.get("excludeUncommitted").and_then(Value::as_bool).unwrap_or(false);
            let reinstall_deps =
                v.get("reinstallDeps").and_then(Value::as_bool).unwrap_or(false);
            let pull_latest = v.get("pullLatest").and_then(Value::as_bool).unwrap_or(false);
            let group_name = str_field("groupName").unwrap_or_default();
            let run_mode = str_field("runMode").unwrap_or_default();

            // Create copies one at a time, streaming progress; stop at the first
            // failure and return the copies made so far (matches desktop behavior).
            let mut created: Vec<String> = Vec::new();
            let mut err: Option<String> = None;
            for i in 0..count as usize {
                let label = labels.get(i).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
                match crate::projects_crud::duplicate_project(
                    app.clone(),
                    name.clone(),
                    label,
                    exclude_uncommitted,
                    reinstall_deps,
                    pull_latest,
                ) {
                    Ok(n) => {
                        created.push(n.clone());
                        send(ws, json!({ "t": "duplicateProgress",
                            "done": created.len(), "total": count, "name": n }))?;
                    }
                    Err(e) => { err = Some(e); break; }
                }
            }

            if created.is_empty() {
                send(ws, json!({ "t": "duplicate", "ok": false,
                    "error": err.unwrap_or_else(|| "Couldn't duplicate the project.".into()) }))?;
            } else {
                if !group_name.trim().is_empty() {
                    let _ = group_copies_into_folder(&name, group_name.trim(), &created);
                    let _ = app.emit("projects-changed", ());
                }
                let mut warning: Option<String> = None;
                if run_mode == "action" || run_mode == "command" {
                    if app.get_webview_window("main").is_some() {
                        let prompt = str_field("prompt").filter(|p| !p.trim().is_empty());
                        let task = if run_mode == "action" {
                            json!({ "kind": "action", "actionName": str_field("action").unwrap_or_default(), "prompt": prompt })
                        } else {
                            json!({ "kind": "command", "command": str_field("command").unwrap_or_default(), "prompt": prompt })
                        };
                        for copy in &created {
                            let _ = app.emit("remote-run-task", json!({ "project": copy, "task": task }));
                        }
                    } else {
                        warning = Some(
                            "Copies created, but open the lpm app on your Mac to run the task on them.".to_string(),
                        );
                    }
                }
                if let Some(e) = err {
                    warning = Some(format!("Stopped after {} — {}", created.len(), e));
                }
                let mut reply = json!({ "t": "duplicate", "ok": true,
                    "name": created.first().cloned().unwrap_or_default(),
                    "names": created });
                if let Some(w) = warning {
                    reply["warning"] = json!(w);
                }
                send(ws, reply)?;
            }
        }
        // The desktop duplicate modal seeds its toggles from persisted settings;
        // the phone fetches the same values so its modal opens with matching
        // defaults. Fallbacks mirror BulkDuplicateDialog (pullLatest defaults on).
        "duplicateDefaults" => {
            let s = config::load_settings();
            let b = |k: &str, d: bool| s.get(k).and_then(Value::as_bool).unwrap_or(d);
            send(ws, json!({
                "t": "duplicateDefaults",
                "excludeUncommitted": b("duplicateExcludeUncommitted", false),
                "reinstallDeps": b("duplicateReinstallDeps", false),
                "pullLatest": b("duplicatePullLatest", true),
            }))?;
        }
        // Remove a project (the phone only offers this for duplicates, whose
        // folders are deleted from disk). Also a direct config/disk op;
        // remove_project refuses to delete an original that still has duplicates.
        "remove" => {
            let name = str_field("name").unwrap_or_default();
            let r = crate::projects_crud::remove_project(app.clone(), name);
            send(ws, result_reply("remove", r))?;
        }
        // Run an action / open a new terminal. A terminal is a frontend pane-tree +
        // command-injection concept, not a raw pty op — spawning one from Rust would
        // orphan it (no tab, label, or command typed in). So relay to the owner
        // window, which runs its normal create-terminal flow; the new terminal then
        // reaches the phone via the label push + output tee (re-request `terminals`).
        "runAction" => {
            let project = str_field("project").unwrap_or_default();
            let action = str_field("action").unwrap_or_default();
            if app.get_webview_window("main").is_none() {
                send(ws, json!({ "t": "runAction", "ok": false, "project": project,
                    "error": "Open the lpm app on your Mac to run actions." }))?;
            } else {
                if !project.is_empty() && !action.is_empty() {
                    queue_run_action(hub, app, json!({ "project": project, "action": action }));
                }
                send(ws, json!({ "t": "runAction", "ok": true }))?;
            }
        }
        "newTerminal" => {
            let project = str_field("project").unwrap_or_default();
            if app.get_webview_window("main").is_none() {
                send(ws, json!({ "t": "newTerminal", "ok": false, "project": project,
                    "error": "Open the lpm app on your Mac to open a new terminal." }))?;
            } else {
                if !project.is_empty() {
                    queue_run_action(hub, app, json!({ "project": project }));
                }
                send(ws, json!({ "t": "newTerminal", "ok": true }))?;
            }
        }
        // Terminal tab ops (close / rename / pin) are also frontend pane-tree edits,
        // so they take the same owner-window relay: emit an event the mounted
        // ProjectDetail resolves back to its tab id and runs the normal handler.
        "closeTerminal" | "renameTerminal" | "pinTerminal" => {
            let project = str_field("project").unwrap_or_default();
            let id = str_field("id").unwrap_or_default();
            let op = match t {
                "closeTerminal" => "close",
                "renameTerminal" => "rename",
                _ => "pin",
            };
            if !project.is_empty() && !id.is_empty() {
                let _ = app.emit(
                    "remote-terminal-op",
                    json!({
                        "project": project,
                        "op": op,
                        "id": id,
                        "label": str_field("label").unwrap_or_default(),
                    }),
                );
            }
            send(ws, json!({ "t": t, "ok": true }))?;
        }
        // Reorder a project's terminal tabs — same owner-window relay, but carries
        // the full new id order instead of a single id.
        "reorderTerminals" => {
            let project = str_field("project").unwrap_or_default();
            let order: Vec<String> = v
                .get("order")
                .and_then(Value::as_array)
                .map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect())
                .unwrap_or_default();
            if !project.is_empty() && !order.is_empty() {
                let _ = app.emit(
                    "remote-terminal-op",
                    json!({ "project": project, "op": "reorder", "id": "", "label": "", "order": order }),
                );
            }
            send(ws, json!({ "t": t, "ok": true }))?;
        }
        _ => {}
    }
    Ok(())
}

fn list_projects_json(app: &AppHandle) -> Value {
    let svc = app.state::<services::ServiceState>();
    let status = app.state::<Arc<StatusStore>>();
    let mut projects = config::list_projects(&svc.snapshot()).unwrap_or_default();
    for p in &mut projects {
        let name = p.get("name").and_then(Value::as_str).map(str::to_string);
        if let (Some(name), Some(obj)) = (name, p.as_object_mut()) {
            let entries = serde_json::to_value(status.list(&name)).unwrap_or_else(|_| json!([]));
            obj.insert("statusEntries".to_string(), entries);
        }
    }
    Value::Array(projects)
}

/// The sidebar layout so the phone can render folders like the desktop:
/// (order, groups). `order` is settings.json's sidebarOrder — an interleaved list
/// of project names and "group:<id>" tokens; `groups` is groups.json's group defs
/// ({id, name, collapsed, members}). Both default to empty/absent gracefully.
fn sidebar_json() -> (Value, Value) {
    let order = config::load_settings()
        .get("sidebarOrder")
        .cloned()
        .unwrap_or_else(|| json!([]));
    let groups = std::fs::read(config::lpm_dir().join("groups.json"))
        .ok()
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
        .and_then(|v| v.get("groups").cloned())
        .unwrap_or_else(|| json!([]));
    (order, groups)
}

/// Group freshly-created duplicate copies under a sidebar folder, replicating the
/// desktop's applySidebarLayout: match an existing folder by name (exact, then
/// case-insensitive) or create one just below the parent, append the copies to its
/// members, and persist groups.json + settings.json (sidebarOrder/projectOrder).
fn group_copies_into_folder(parent: &str, group_name: &str, copies: &[String]) -> Result<(), String> {
    if group_name.is_empty() || copies.is_empty() {
        return Ok(());
    }
    let mut order: Vec<Value> = config::load_settings()
        .get("sidebarOrder")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut wrap = crate::commands_real::load_groups();
    let groups = wrap
        .get_mut("groups")
        .and_then(Value::as_array_mut)
        .ok_or("groups.json malformed")?;

    let name_matches = |g: &Value, ci: bool| {
        g.get("name").and_then(Value::as_str).map(|n| {
            let n = n.trim();
            if ci { n.eq_ignore_ascii_case(group_name) } else { n == group_name }
        }).unwrap_or(false)
    };
    let existing = groups
        .iter()
        .position(|g| name_matches(g, false))
        .or_else(|| groups.iter().position(|g| name_matches(g, true)));
    let group_id = match existing {
        Some(i) => groups[i].get("id").and_then(Value::as_str).unwrap_or_default().to_string(),
        None => {
            let id = uuid::Uuid::new_v4().to_string();
            groups.push(json!({ "id": id, "name": group_name, "members": [] }));
            let token = format!("group:{}", id);
            let at = (top_level_index_of(&order, groups, parent) + 1).min(order.len());
            order.insert(at, Value::String(token));
            id
        }
    };

    // Detach each copy from wherever it currently sits, then append to the folder.
    for copy in copies {
        order.retain(|t| t.as_str() != Some(copy.as_str()));
        for g in groups.iter_mut() {
            if let Some(m) = g.get_mut("members").and_then(Value::as_array_mut) {
                m.retain(|x| x.as_str() != Some(copy.as_str()));
            }
        }
        if let Some(g) = groups
            .iter_mut()
            .find(|g| g.get("id").and_then(Value::as_str) == Some(group_id.as_str()))
        {
            if let Some(m) = g.get_mut("members").and_then(Value::as_array_mut) {
                m.push(Value::String(copy.clone()));
            }
        }
    }

    let project_order = flatten_order(&order, groups.as_slice());
    crate::commands_real::save_groups(wrap.clone())?;
    config::merge_settings(json!({ "sidebarOrder": order, "projectOrder": project_order }))?;
    Ok(())
}

/// The top-level slot of a project: its own loose index, else its folder's token
/// index, else the end of the order. Mirrors sidebarLayout.ts topLevelIndexOfProject.
fn top_level_index_of(order: &[Value], groups: &[Value], name: &str) -> usize {
    if let Some(i) = order.iter().position(|t| t.as_str() == Some(name)) {
        return i;
    }
    if let Some(g) = groups.iter().find(|g| {
        g.get("members")
            .and_then(Value::as_array)
            .map(|m| m.iter().any(|x| x.as_str() == Some(name)))
            .unwrap_or(false)
    }) {
        if let Some(id) = g.get("id").and_then(Value::as_str) {
            let token = format!("group:{}", id);
            if let Some(i) = order.iter().position(|t| t.as_str() == Some(token.as_str())) {
                return i;
            }
        }
    }
    order.len()
}

/// Flatten the token order into a flat project name list, expanding each
/// "group:<id>" token into its members. Mirrors sidebarLayout.ts flattenForProjectOrder.
fn flatten_order(order: &[Value], groups: &[Value]) -> Vec<String> {
    let mut out = Vec::new();
    for token in order {
        let Some(s) = token.as_str() else { continue };
        if let Some(id) = s.strip_prefix("group:") {
            if let Some(g) = groups.iter().find(|g| g.get("id").and_then(Value::as_str) == Some(id)) {
                if let Some(members) = g.get("members").and_then(Value::as_array) {
                    for m in members {
                        if let Some(ms) = m.as_str() {
                            out.push(ms.to_string());
                        }
                    }
                }
            }
        } else {
            out.push(s.to_string());
        }
    }
    out
}

fn install_forwarders(hub: &RemoteHub, app: &AppHandle) {
    let h = hub.clone();
    app.listen("projects-changed", move |_| {
        broadcast(&h, json!({ "t": "projects-changed" }));
    });
    let h = hub.clone();
    app.listen("status-changed", move |e| {
        let project = serde_json::from_str::<String>(e.payload()).unwrap_or_default();
        broadcast(&h, json!({ "t": "status-changed", "project": project }));
    });
}

// --- crypto / net helpers ----------------------------------------------------

fn gen_token() -> String {
    let mut b = [0u8; 32];
    getrandom::getrandom(&mut b).expect("csprng");
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(b)
}

fn gen_pairing_code() -> String {
    let mut b = [0u8; 4];
    let _ = getrandom::getrandom(&mut b);
    let n = u32::from_be_bytes(b);
    format!("{:04X}-{:04X}", (n >> 16) & 0xFFFF, n & 0xFFFF)
}

fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

/// Length-independent constant-time comparison (both inputs are fixed-shape here).
fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for i in 0..a.len() {
        diff |= a[i] ^ b[i];
    }
    diff == 0
}

/// The Mac's primary LAN IP, found by asking the OS which local address would
/// route outbound — no packets are sent (UDP connect only sets the peer).
fn primary_lan_ip() -> Option<String> {
    let sock = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    sock.connect("192.0.2.1:80").ok()?; // TEST-NET-1: guaranteed non-routable, never leaves the host
    sock.local_addr().ok().map(|a| a.ip().to_string())
}

/// This Mac's Tailscale IPv4, if a tailnet interface is up. Tailscale assigns
/// addresses from the 100.64.0.0/10 CGNAT range, so we scan the interface list
/// for one — no dependency on the `tailscale` CLI being in PATH. Advertising it
/// in the pairing QR lets the phone reach this Mac from anywhere it shares the
/// tailnet (cellular, another network), not just the local Wi-Fi.
fn tailscale_ip() -> Option<String> {
    let mut ifap: *mut libc::ifaddrs = std::ptr::null_mut();
    if unsafe { libc::getifaddrs(&mut ifap) } != 0 {
        return None;
    }
    let mut result = None;
    let mut cur = ifap;
    while !cur.is_null() {
        let addr = unsafe { (*cur).ifa_addr };
        if !addr.is_null() && unsafe { (*addr).sa_family } as i32 == libc::AF_INET {
            let sin = addr as *const libc::sockaddr_in;
            let ip = std::net::Ipv4Addr::from(u32::from_be(unsafe { (*sin).sin_addr.s_addr }));
            let o = ip.octets();
            if o[0] == 100 && (64..=127).contains(&o[1]) {
                result = Some(ip.to_string());
                break;
            }
        }
        cur = unsafe { (*cur).ifa_next };
    }
    unsafe { libc::freeifaddrs(ifap) };
    result
}

/// Addresses to advertise for pairing, most-preferred first: the LAN IP (lowest
/// latency at home) then the Tailscale IP (reachable away from home, when the
/// away-from-home toggle is on). The phone probes them and keeps whichever it
/// can reach.
fn candidate_hosts(include_tailscale: bool) -> Vec<String> {
    let mut hosts = Vec::new();
    if let Some(ip) = primary_lan_ip() {
        hosts.push(ip);
    }
    if include_tailscale {
        if let Some(ip) = tailscale_ip() {
            if !hosts.contains(&ip) {
                hosts.push(ip);
            }
        }
    }
    if hosts.is_empty() {
        hosts.push("127.0.0.1".to_string());
    }
    hosts
}

fn pairing_qr_svg(payload: &str) -> Option<String> {
    let code = qrcode::QrCode::new(payload.as_bytes()).ok()?;
    Some(
        code.render::<qrcode::render::svg::Color>()
            .min_dimensions(220, 220)
            .quiet_zone(true)
            .build(),
    )
}

fn state_value(hub: &RemoteHub) -> Value {
    let cfg = hub.config();
    let devices: Vec<Value> = cfg
        .devices
        .iter()
        .map(|d| json!({ "id": d.id, "name": d.name, "createdAt": d.created_at }))
        .collect();
    json!({
        "enabled": cfg.enabled,
        "lan": cfg.lan,
        "port": effective_port(cfg.port),
        "tailscale": cfg.tailscale,
        "running": hub.inner.running.load(Ordering::Relaxed),
        "host": primary_lan_ip(),
        "tailscaleHost": tailscale_ip(),
        "hasPendingCode": !cfg.pairing_code.is_empty(),
        "devices": devices,
    })
}

// --- frontend commands (Settings → Mobile devices pane) ----------------------

#[tauri::command]
pub fn remote_state(hub: State<'_, RemoteHub>) -> Value {
    state_value(&hub)
}

/// Register the current terminal id -> {label, cli, pinned} mapping (from a
/// project's frontend tab tree) so remote clients show the same names/pins and
/// offer the right slash commands. Labels/clis/pins are upsert-only (dead ids
/// linger harmlessly); the id SET is authoritative per project — it scopes the
/// phone's list to the actual tab tree so orphaned PTYs don't show. An empty push
/// (e.g. a mirror window before it has adopted the tree) is ignored for the set,
/// since a genuinely-empty project simply has no live PTYs to list.
/// Drain the queued phone run-action/new-terminal requests (oldest first).
/// Called by the main window on mount and on each `remote-run-action` wake-up;
/// take-and-clear so a request is executed exactly once.
#[tauri::command]
pub fn remote_take_run_actions(hub: State<'_, RemoteHub>) -> Vec<Value> {
    std::mem::take(&mut *hub.inner.pending_run_actions.lock().unwrap())
}

#[tauri::command]
pub fn remote_set_terminal_labels(hub: State<'_, RemoteHub>, project: String, labels: Vec<Value>) {
    let mut label_map = hub.inner.labels.lock().unwrap();
    let mut cli_map = hub.inner.clis.lock().unwrap();
    let mut pin_map = hub.inner.pinned.lock().unwrap();
    let mut emoji_map = hub.inner.emojis.lock().unwrap();
    let mut ids: Vec<String> = Vec::new();
    for item in &labels {
        let id = item.get("id").and_then(Value::as_str).unwrap_or("");
        if id.is_empty() {
            continue;
        }
        ids.push(id.to_string());
        let label = item.get("label").and_then(Value::as_str).unwrap_or("");
        if !label.is_empty() {
            label_map.insert(id.to_string(), label.to_string());
        }
        let cli = item.get("cli").and_then(Value::as_str).unwrap_or("");
        if !cli.is_empty() {
            cli_map.insert(id.to_string(), cli.to_string());
        }
        pin_map.insert(
            id.to_string(),
            item.get("pinned").and_then(Value::as_bool).unwrap_or(false),
        );
        emoji_map.insert(
            id.to_string(),
            item.get("emoji").and_then(Value::as_str).unwrap_or("").to_string(),
        );
    }
    if !project.is_empty() && !ids.is_empty() {
        hub.inner.tree_ids.lock().unwrap().insert(project, ids);
    }
}

#[tauri::command]
pub fn remote_set_config(
    app: AppHandle,
    hub: State<'_, RemoteHub>,
    enabled: bool,
    lan: bool,
    port: u16,
    tailscale: bool,
) -> Result<Value, String> {
    {
        let mut cfg = hub.inner.config.lock().unwrap();
        cfg.enabled = enabled;
        cfg.lan = lan;
        cfg.port = port;
        cfg.tailscale = tailscale;
        let snapshot = cfg.clone();
        drop(cfg);
        save_config(&snapshot)?;
    }
    apply(&hub, &app);
    Ok(state_value(&hub))
}

/// Start (or refresh) a single-use pairing code, auto-enabling the server, and
/// return the QR payload the phone scans.
#[tauri::command]
pub fn remote_start_pairing(app: AppHandle, hub: State<'_, RemoteHub>) -> Result<Value, String> {
    let code = gen_pairing_code();
    let (hosts, port) = {
        let mut cfg = hub.inner.config.lock().unwrap();
        cfg.pairing_code = code.clone();
        cfg.enabled = true;
        // The QR advertises this Mac's addresses, so the server must bind every
        // interface (0.0.0.0) or the phone hits a loopback-only port and gets
        // connection-refused. Pairing a device inherently means network access;
        // the Settings toggle reflects this and can turn it back off afterward.
        cfg.lan = true;
        let port = effective_port(cfg.port);
        let snapshot = cfg.clone();
        drop(cfg);
        save_config(&snapshot)?;
        (candidate_hosts(snapshot.tailscale), port)
    };
    apply(&hub, &app); // ensure the listener is up so the phone can connect
    // Every candidate address as a repeated `h=` param; the phone tries each and
    // keeps the one it can reach (LAN at home, Tailscale away from home).
    let host_params: String = hosts.iter().map(|h| format!("&h={h}")).collect();
    let url = format!("lpm://pair?p={port}&c={code}{host_params}");
    Ok(json!({
        "code": code,
        "url": url,
        "svg": pairing_qr_svg(&url),
        "host": hosts[0],
        "hosts": hosts,
        "port": port,
    }))
}

#[tauri::command]
pub fn remote_revoke_device(hub: State<'_, RemoteHub>, id: String) -> Result<Value, String> {
    {
        let mut cfg = hub.inner.config.lock().unwrap();
        cfg.devices.retain(|d| d.id != id);
        let snapshot = cfg.clone();
        drop(cfg);
        save_config(&snapshot)?;
    }
    // Drop any live connection for the revoked device (the poll loop also self-
    // exits on its next tick via device_exists).
    hub.inner.clients.lock().unwrap().retain(|_, c| c.device_id != id);
    Ok(state_value(&hub))
}

#[cfg(test)]
mod tests {
    use super::*;

    // Regression for the non-blocking-accept bug: a socket accepted from a
    // non-blocking listener (as accept_loop uses) inherits O_NONBLOCK on macOS,
    // which makes set_read_timeout a no-op and breaks authenticate's read. The
    // fix is set_nonblocking(false) on the accepted stream; this test reproduces
    // the full accept path and asserts a real WS client still pairs.
    #[test]
    fn pairs_through_nonblocking_listener() {
        let tmp = std::env::temp_dir().join(format!("lpm-remote-test-{}.json", std::process::id()));
        *TEST_CONFIG_PATH.lock().unwrap() = Some(tmp.clone());

        let hub = RemoteHub::default();
        hub.inner.config.lock().unwrap().pairing_code = "AAAA-BBBB".to_string();
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap(); // reproduce accept_loop
        let addr = listener.local_addr().unwrap();

        let hub2 = hub.clone();
        let server = std::thread::spawn(move || loop {
            match listener.accept() {
                Ok((stream, _)) => {
                    let _ = stream.set_nonblocking(false); // THE FIX under test
                    let mut ws = accept_ws(stream).expect("server handshake");
                    return authenticate(&mut ws, &hub2);
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(10));
                }
                Err(_) => return None,
            }
        });

        let (mut c, _) = tungstenite::connect(format!("ws://{addr}/")).expect("client connect");
        c.send(Message::text(
            json!({ "t": "pair", "code": "AAAA-BBBB", "name": "t" }).to_string(),
        ))
        .unwrap();
        let reply = c.read().expect("no reply frame");
        let auth = server.join().unwrap();

        *TEST_CONFIG_PATH.lock().unwrap() = None;
        let _ = std::fs::remove_file(&tmp);

        assert!(auth.is_some(), "authenticate returned None through a non-blocking listener");
        assert!(reply.to_text().unwrap().contains("paired"), "expected paired, got: {reply:?}");
    }

    #[test]
    fn ct_eq_matches_only_identical() {
        assert!(ct_eq(b"abc", b"abc"));
        assert!(!ct_eq(b"abc", b"abd"));
        assert!(!ct_eq(b"abc", b"ab"));
    }


    #[test]
    fn code_normalization_ignores_dashes_and_case() {
        assert_eq!(normalize_code("ab12-CD34"), "AB12CD34");
        assert_eq!(normalize_code(" a b "), "AB");
        assert_eq!(normalize_code("AB12CD34"), normalize_code("ab12-cd34"));
    }

    #[test]
    fn sha256_hex_is_stable_and_hex() {
        let h = sha256_hex(b"token");
        assert_eq!(h.len(), 64);
        assert!(h.chars().all(|c| c.is_ascii_hexdigit()));
        assert_eq!(h, sha256_hex(b"token"));
        assert_ne!(h, sha256_hex(b"token2"));
    }

    #[test]
    fn token_is_random_and_nonempty() {
        assert_ne!(gen_token(), gen_token());
        assert!(!gen_token().is_empty());
    }

    #[test]
    fn effective_port_defaults_zero() {
        assert_eq!(effective_port(0), DEFAULT_PORT);
        assert_eq!(effective_port(9000), 9000);
    }

    #[test]
    fn config_roundtrips_through_json() {
        let cfg = RemoteConfig {
            enabled: true,
            lan: true,
            port: 9000,
            pairing_code: "AB12-CD34".into(),
            tailscale: true,
            devices: vec![Device {
                id: "d1".into(),
                name: "iPhone".into(),
                token_hash: sha256_hex(b"t"),
                created_at: 42,
            }],
        };
        let s = serde_json::to_string(&cfg).unwrap();
        let back: RemoteConfig = serde_json::from_str(&s).unwrap();
        assert_eq!(back.port, 9000);
        assert!(back.enabled && back.lan);
        assert_eq!(back.devices.len(), 1);
        assert_eq!(back.devices[0].id, "d1");
    }
}
