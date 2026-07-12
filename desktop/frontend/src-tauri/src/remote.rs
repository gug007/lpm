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
use crate::status::{StatusStore, STATUS_DONE, STATUS_ERROR, STATUS_WAITING};
use crate::{config, pty, services};
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet, VecDeque};
use std::net::{TcpListener, TcpStream};
use std::os::unix::fs::PermissionsExt;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
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
const DEFAULT_PUSH_RELAY: &str = "https://lpm.cx/api/push"; // APNs relay (holds the signing key)

// --- persisted config (~/.lpm/remote.json) -----------------------------------

fn default_true() -> bool {
    true
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(default)]
struct Device {
    id: String,
    name: String,
    token_hash: String, // sha256(token) hex — the raw token lives only on the phone
    created_at: i64,
    // Push identity (registered via `apnsToken` after each auth). apns_token is the
    // hex APNs device token; apns_env is "production"|"sandbox"; push_key is the
    // phone's base64 AES-256 key the notification payload is sealed under.
    apns_token: String,
    apns_env: String,
    push_key: String,
    // Per-device notification prefs (from the phone's `notify` object). Absent on
    // older records/frames, so each defaults to enabled.
    #[serde(default = "default_true")]
    push_waiting: bool,
    #[serde(default = "default_true")]
    push_done: bool,
    #[serde(default = "default_true")]
    push_error: bool,
}

// Manual Default (not derived) so `..Default::default()` agrees with serde: the
// three prefs must start true, but a derived Default would make them false.
impl Default for Device {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            token_hash: String::new(),
            created_at: 0,
            apns_token: String::new(),
            apns_env: String::new(),
            push_key: String::new(),
            push_waiting: true,
            push_done: true,
            push_error: true,
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(default)]
struct RemoteConfig {
    enabled: bool,
    lan: bool,  // bind 0.0.0.0 (reachable on LAN/tailnet) vs 127.0.0.1 (loopback only)
    port: u16,  // 0 => DEFAULT_PORT
    pairing_code: String, // non-empty while an unused pairing code is outstanding
    tailscale: bool, // advertise this Mac's Tailscale address in the pairing QR
    push_relay: String, // override for the APNs relay URL (empty => DEFAULT_PUSH_RELAY)
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
            push_relay: String::new(),
            devices: Vec::new(),
        }
    }
}

impl RemoteConfig {
    /// The APNs relay URL to POST sealed notifications to: the configured override
    /// when set, else the lpm website's default endpoint.
    fn effective_relay(&self) -> String {
        if self.push_relay.trim().is_empty() {
            DEFAULT_PUSH_RELAY.to_string()
        } else {
            self.push_relay.clone()
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
    // (project, status key) -> last (value, ts) pushed as an APNs notification, so a
    // re-reported identical status never re-notifies. Connection-independent (a push
    // is a transition fact, not per-device); recomputed on every status-changed.
    push_dedup: Mutex<HashMap<(String, String), (String, i64)>>,
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
    // A clone of this client's outbound queue for slow handlers (network/AI git
    // ops) to reply through from a worker thread, so they never block this loop.
    let out = tx.clone();
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

    // Per-connection working-tree watchers (project -> watcher). Local to this
    // connection so they stop deterministically on teardown below, which also
    // covers device revocation (the loop self-exits, then this scope drops).
    let mut watches: HashMap<String, RemoteWatch> = HashMap::new();

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
                        if handle_msg(&mut ws, &txt, &hub, &app, &subs, &device_id, &out, &mut watches).is_err() {
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
    // Stop this connection's working-tree watchers (dropping the map would also
    // end their threads, but flag them first to short-circuit any in-flight debounce).
    for (_, w) in watches.drain() {
        w.stop.store(true, Ordering::SeqCst);
    }
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
                    // `name` (this Mac's ComputerName) lets a pairing peer Mac label
                    // the connection; older clients (the phone) ignore unknown fields.
                    let _ = ws.send(Message::text(
                        json!({ "t": "paired", "deviceId": id, "token": token, "name": crate::sys::computer_name() }).to_string(),
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
        ..Default::default()
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

/// Like `result_reply` but echoes the `project` the phone addressed, so a reply
/// can be matched to its request even with several projects in flight.
fn git_result_reply(kind: &str, project: &str, r: Result<(), String>) -> Value {
    match r {
        Ok(()) => json!({ "t": kind, "project": project, "ok": true }),
        Err(e) => json!({ "t": kind, "project": project, "ok": false, "error": e }),
    }
}

const GIT_DIFF_CAP: usize = 400 * 1024; // per-file diff byte cap sent to the phone

/// Cap a diff at ~400 KB, truncating at a line boundary so the phone never
/// receives a half-line. Returns (text, truncated).
fn cap_git_diff(diff: &str) -> (String, bool) {
    if diff.len() <= GIT_DIFF_CAP {
        return (diff.to_string(), false);
    }
    let bytes = diff.as_bytes();
    let mut cut = GIT_DIFF_CAP.min(bytes.len());
    while cut > 0 && bytes[cut - 1] != b'\n' {
        cut -= 1;
    }
    if cut == 0 {
        // A single line longer than the cap: fall back to the nearest char boundary.
        cut = GIT_DIFF_CAP.min(bytes.len());
        while cut > 0 && !diff.is_char_boundary(cut) {
            cut -= 1;
        }
    }
    (diff[..cut].to_string(), true)
}

/// AI generation options (CLI, model, effort, fast) from persisted settings,
/// mirroring the desktop's git panel: `aiCli` defaults to "claude", the rest empty.
fn git_ai_opts() -> (String, String, String, bool) {
    let s = config::load_settings();
    let cli = s
        .get("aiCli")
        .and_then(Value::as_str)
        .filter(|c| !c.is_empty())
        .unwrap_or("claude")
        .to_string();
    let model = s.get("aiModel").and_then(Value::as_str).unwrap_or("").to_string();
    let effort = s.get("aiEffort").and_then(Value::as_str).unwrap_or("").to_string();
    let fast = s.get("aiFast").and_then(Value::as_bool).unwrap_or(false);
    (cli, model, effort, fast)
}

/// A persisted git-options object (e.g. `gitPull`/`gitFetch`/`gitPush`), or an
/// empty object when unset — the base for the flag builders below, which mirror
/// the desktop's gitOptions.ts so the phone's Pull/Fetch/Push behave identically.
fn git_settings(key: &str) -> Value {
    config::load_settings().get(key).cloned().unwrap_or_else(|| json!({}))
}

/// Pull strategy + flags from `gitPull`, mirroring normalizeGitPull/pullFlags:
/// strategy defaults to "ff" (valid: ff | ff-only | rebase), `--autostash` and
/// `--no-verify` per their bools.
fn git_pull_opts() -> (String, Vec<String>) {
    let o = git_settings("gitPull");
    let strategy = match o.get("strategy").and_then(Value::as_str) {
        Some(s @ ("ff" | "ff-only" | "rebase")) => s.to_string(),
        _ => "ff".to_string(),
    };
    let mut flags = Vec::new();
    if o.get("autostash").and_then(Value::as_bool).unwrap_or(false) {
        flags.push("--autostash".to_string());
    }
    if o.get("noVerify").and_then(Value::as_bool).unwrap_or(false) {
        flags.push("--no-verify".to_string());
    }
    (strategy, flags)
}

/// Fetch flags from `gitFetch`, mirroring fetchFlags: `--all`/`--prune` default
/// on, `--prune-tags`/`--tags` default off.
fn git_fetch_flags() -> Vec<String> {
    let o = git_settings("gitFetch");
    let b = |k: &str, d: bool| o.get(k).and_then(Value::as_bool).unwrap_or(d);
    let mut flags = Vec::new();
    if b("all", true) {
        flags.push("--all".to_string());
    }
    if b("prune", true) {
        flags.push("--prune".to_string());
    }
    if b("pruneTags", false) {
        flags.push("--prune-tags".to_string());
    }
    if b("tags", false) {
        flags.push("--tags".to_string());
    }
    flags
}

/// Push flags from `gitPush`, mirroring pushFlags: `--force-with-lease` when
/// mode is "force-with-lease" (default "default"), `--no-verify`/`--tags` off.
fn git_push_flags() -> Vec<String> {
    let o = git_settings("gitPush");
    let mut flags = Vec::new();
    if o.get("mode").and_then(Value::as_str) == Some("force-with-lease") {
        flags.push("--force-with-lease".to_string());
    }
    if o.get("noVerify").and_then(Value::as_bool).unwrap_or(false) {
        flags.push("--no-verify".to_string());
    }
    if o.get("tags").and_then(Value::as_bool).unwrap_or(false) {
        flags.push("--tags".to_string());
    }
    flags
}

/// A cheap working-tree fingerprint for a changed file, so the phone can tell
/// whether a file's diff is stale between snapshots without refetching it:
/// `"<size>-<mtime_nanos>"` for a file on disk, `"gone"` for a missing path (a
/// deleted file), `"0"` on any other metadata error (the phone treats an
/// unknown/changed stamp as stale, so always-refetch is the safe degradation).
fn file_stamp(cwd: &str, path: &str) -> String {
    match std::fs::metadata(std::path::Path::new(cwd).join(path)) {
        Ok(m) => {
            let nanos = m
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            format!("{}-{}", m.len(), nanos)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => "gone".to_string(),
        Err(_) => "0".to_string(),
    }
}

// --- live working-tree watch (per connection) --------------------------------

/// One project's filesystem watcher for a single phone connection. Dropping it
/// closes the notify channel, which ends the debounce thread; the `stop` flag is
/// an explicit belt-and-suspenders for the mid-debounce window.
struct RemoteWatch {
    stop: Arc<AtomicBool>,
    _watcher: notify::RecommendedWatcher,
}

/// Watch a project's working tree for this connection and push a debounced
/// `git-changed` frame to the client's outbound queue on each burst of changes,
/// so the phone's review screen refreshes while an agent edits. Mirrors git.rs's
/// start_watching_project (same should_ignore filter + DEBOUNCE coalescing), but
/// delivers over the wire instead of the app event bus. The push carries no
/// payload beyond the project — the phone re-requests `git` + the diffs it wants.
fn start_git_watch(cwd: &str, project: &str, out: &SyncSender<String>) -> Result<RemoteWatch, String> {
    use notify::{RecursiveMode, Watcher};

    // FSEvents delivers canonical paths; canonicalize so should_ignore's strip_prefix matches.
    let path = std::fs::canonicalize(cwd)
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| cwd.to_string());

    let stop = Arc::new(AtomicBool::new(false));
    let (tx, rx) = mpsc::channel::<()>();
    let root = path.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(ev) = res {
            for p in &ev.paths {
                let full = p.to_string_lossy();
                if !crate::git::should_ignore(&root, &full) {
                    let _ = tx.send(());
                    break;
                }
            }
        }
    })
    .map_err(|e| e.to_string())?;
    watcher
        .watch(std::path::Path::new(&path), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    let (project, out, thread_stop) = (project.to_string(), out.clone(), stop.clone());
    std::thread::spawn(move || loop {
        if rx.recv().is_err() {
            return; // watcher dropped (connection torn down / unwatched)
        }
        if thread_stop.load(Ordering::SeqCst) {
            return;
        }
        // Coalesce a burst of edits into one push after DEBOUNCE of quiet.
        loop {
            match rx.recv_timeout(crate::git::DEBOUNCE) {
                Ok(_) => continue,
                Err(mpsc::RecvTimeoutError::Timeout) => break,
                Err(mpsc::RecvTimeoutError::Disconnected) => return,
            }
        }
        if thread_stop.load(Ordering::SeqCst) {
            return;
        }
        // Overflow-drop like the rest of the outbound path: a full queue means the
        // phone is behind and will re-seed; the next burst pushes again.
        let _ = out.try_send(json!({ "t": "git-changed", "project": project }).to_string());
    });

    Ok(RemoteWatch {
        stop,
        _watcher: watcher,
    })
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
    out: &SyncSender<String>,
    watches: &mut HashMap<String, RemoteWatch>,
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
            let clis = hub.inner.clis.lock().unwrap();
            let terms: Vec<Value> = terms
                .iter()
                .map(|t| {
                    let mut o = serde_json::to_value(t).unwrap_or_else(|_| json!({}));
                    let label = labels.get(&t.id).cloned().unwrap_or_else(|| t.id.clone());
                    if let Some(m) = o.as_object_mut() {
                        m.insert("label".into(), json!(label));
                        m.insert("pinned".into(), json!(pinned.get(&t.id).copied().unwrap_or(false)));
                        m.insert("emoji".into(), json!(emojis.get(&t.id).cloned().unwrap_or_default()));
                        m.insert("cli".into(), json!(clis.get(&t.id).cloned().unwrap_or_default()));
                    }
                    o
                })
                .collect();
            drop(labels);
            drop(pinned);
            drop(emojis);
            drop(clis);
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
            // The phone sends a base64 blob; save it to a temp file on the Mac and
            // return its path (paste-quoted, scp'd first for a remote pane). The
            // phone drops the path into the composer, which pastes it so an agent
            // like Claude Code loads it. With `name` the original filename is
            // preserved for any mime (arbitrary file); without it, an image keyed by
            // `mime` — so existing image-only callers keep working. Now that
            // arbitrary (potentially large) files are accepted, the base64 decode +
            // fs write + possible scp runs on a worker thread and replies via the
            // out-queue, so it never stalls keystrokes/resizes on this connection.
            // The optional `reqId` is echoed verbatim so the phone correlates the
            // reply by id instead of FIFO (which desyncs on a dropped reply); absent
            // reqId → reply omits it (unchanged for older phones).
            let id = str_field("id").unwrap_or_default();
            let data = str_field("data").unwrap_or_default();
            let mime = str_field("mime").unwrap_or_else(|| "image/png".to_string());
            let name = str_field("name");
            let req_id = v.get("reqId").cloned().unwrap_or(Value::Null);
            let (app, out) = (app.clone(), out.clone());
            std::thread::spawn(move || {
                let res = crate::upload::upload_file_for_terminal(
                    app.state::<pty::PtyState>(),
                    id.clone(),
                    data,
                    mime,
                    name,
                );
                let mut reply = match res {
                    Ok(path) => json!({ "t": "upload", "id": id, "ok": true, "path": path }),
                    Err(e) => json!({ "t": "upload", "id": id, "ok": false, "error": e }),
                };
                if !req_id.is_null() {
                    reply["reqId"] = req_id;
                }
                let _ = out.try_send(reply.to_string());
            });
        }
        "status" => {
            let project = str_field("project").unwrap_or_default();
            let list = app.state::<Arc<StatusStore>>().list(&project);
            send(ws, json!({ "t": "status", "project": project, "status": list }))?;
        }
        // Register (or refresh) this device's push identity: the APNs device token,
        // its environment, and the phone's AES key the sealed payload is encrypted
        // under. Sent after every successful auth (the token can rotate). Persisted
        // on the device record so a later status transition can push while the phone
        // is backgrounded and its socket is gone.
        "apnsToken" => {
            let token = str_field("token").unwrap_or_default();
            let env = str_field("env").unwrap_or_default();
            let key = str_field("key").unwrap_or_default();
            // Per-device notification prefs: a missing `notify` object or any missing
            // field means that class stays enabled.
            let notify = v.get("notify");
            let pref = |name: &str| {
                notify
                    .and_then(|n| n.get(name))
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true)
            };
            let prefs = (pref("waiting"), pref("done"), pref("error"));
            match validate_apns(&token, &env, &key) {
                Ok(()) => {
                    set_apns_token(hub, device_id, &token, &env, &key, prefs);
                    send(ws, json!({ "t": "apnsToken", "ok": true }))?;
                }
                Err(e) => send(ws, json!({ "t": "apnsToken", "ok": false, "error": e }))?,
            }
        }
        "sub" => {
            if let Some(id) = str_field("id") {
                subs.lock().unwrap().insert(id.clone());
                let ctrl = app.state::<crate::control::ControlState>();
                // A desktop peer viewing read-only sends `view:true`: subscribe to
                // output without taking control, so the controlled Mac keeps
                // ownership and the peer's mirror stays view-only until it claims.
                // A phone (no flag) claims as before — opening its terminal screen
                // takes control, flipping the previous owner to its placeholder.
                let owner = if v.get("view").and_then(Value::as_bool).unwrap_or(false) {
                    ctrl.owner_of(&id)
                } else {
                    let (owner, changed) = ctrl.claim(&id, mobile_owner(hub, device_id));
                    if changed {
                        crate::control::broadcast(app, &id, &Some(owner.clone()));
                    }
                    Some(owner)
                };
                let (cols, rows) =
                    pty::remote_dims(&app.state::<pty::PtyState>(), &id).unwrap_or((80, 24));
                send(
                    ws,
                    json!({ "t": "seed", "id": id, "cols": cols, "rows": rows, "data": hub.ring_text(&id), "owner": crate::control::owner_json(&owner) }),
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
        // Git review & ship. Fast, local ops (status, per-file diff, commit, branch
        // list, checkout, discard-all) reply inline like the handlers above. The
        // slow ops — pull/push/fetch and PR creation (network) and the AI
        // message/title/body generators — must NOT block this client's loop or its
        // live terminal I/O stalls, so each runs on a worker thread and delivers its
        // typed reply through the client's outbound queue (`out`), consistent with
        // the overflow-drop policy. Pull/push/fetch flags mirror the desktop's git
        // options (gitOptions.ts) via the persisted settings helpers. project_root
        // is resolved inline first: a bad project is a cheap synchronous failure, so
        // it replies `ok:false` here rather than spawning.
        "git" => {
            let project = str_field("project").unwrap_or_default();
            match config::project_root(&project) {
                Ok((cwd, _)) => {
                    let st = crate::git::git_status(cwd.clone());
                    if !st.is_git_repo {
                        send(ws, json!({ "t": "git", "project": project, "ok": true, "isRepo": false,
                            "branch": "", "detached": false, "hasUpstream": false, "ahead": 0, "behind": 0,
                            "defaultBranch": "", "ghCli": false, "files": [] }))?;
                    } else {
                        // Enrich each ChangedFile with a `stamp` (a working-tree
                        // fingerprint) so the phone can skip refetching diffs of
                        // files that didn't change between `git-changed` snapshots.
                        let files: Vec<Value> = crate::git::git_changed_files(cwd.clone())
                            .iter()
                            .map(|f| {
                                let mut o = serde_json::to_value(f).unwrap_or_else(|_| json!({}));
                                if let Some(m) = o.as_object_mut() {
                                    m.insert("stamp".into(), json!(file_stamp(&cwd, &f.path)));
                                }
                                o
                            })
                            .collect();
                        send(ws, json!({ "t": "git", "project": project, "ok": true, "isRepo": true,
                            "branch": st.branch, "detached": st.detached, "hasUpstream": st.has_upstream,
                            "ahead": st.ahead, "behind": st.behind,
                            "defaultBranch": crate::git::git_default_branch(cwd),
                            "ghCli": crate::git::check_ghcli(), "files": files }))?;
                    }
                }
                Err(e) => send(ws, json!({ "t": "git", "project": project, "ok": false, "error": e }))?,
            }
        }
        "gitDiff" => {
            let project = str_field("project").unwrap_or_default();
            let path = str_field("path").unwrap_or_default();
            match config::project_root(&project) {
                Ok((cwd, _)) => match crate::git::git_diff(cwd, vec![path.clone()]) {
                    Ok(diff) => {
                        // git renders a binary change as a `Binary files … differ`
                        // / `GIT binary patch` line rather than hunks — surface it
                        // as binary with no diff body instead of shipping the marker.
                        let binary = diff
                            .lines()
                            .any(|l| l.starts_with("Binary files ") || l.starts_with("GIT binary patch"));
                        if binary {
                            send(ws, json!({ "t": "gitDiff", "project": project, "path": path,
                                "ok": true, "diff": "", "binary": true, "truncated": false }))?;
                        } else {
                            let (diff, truncated) = cap_git_diff(&diff);
                            send(ws, json!({ "t": "gitDiff", "project": project, "path": path,
                                "ok": true, "diff": diff, "binary": false, "truncated": truncated }))?;
                        }
                    }
                    Err(e) => send(ws, json!({ "t": "gitDiff", "project": project, "path": path, "ok": false, "error": e }))?,
                },
                Err(e) => send(ws, json!({ "t": "gitDiff", "project": project, "path": path, "ok": false, "error": e }))?,
            }
        }
        // Batched full original/modified contents for a set of files, so a desktop
        // peer can render the diff in its local Monaco review pane (which diffs two
        // full buffers) — unlike `gitDiff`, which returns a unified string for the
        // phone. Reuses the same cat-file batch the local review command uses.
        // `reqId` is echoed so the client can correlate concurrent requests.
        "gitDiffs" => {
            let project = str_field("project").unwrap_or_default();
            let req_id = v.get("reqId").cloned().unwrap_or(Value::Null);
            let files: Vec<crate::git::FileDiffRequest> = v
                .get("files")
                .and_then(|f| serde_json::from_value(f.clone()).ok())
                .unwrap_or_default();
            let mut reply = match config::project_root(&project) {
                Ok((cwd, _)) => match crate::git::git_file_diffs(cwd, files, "working".to_string(), String::new()) {
                    Ok(map) => json!({ "t": "gitDiffs", "project": project, "ok": true, "diffs": map }),
                    Err(e) => json!({ "t": "gitDiffs", "project": project, "ok": false, "error": e }),
                },
                Err(e) => json!({ "t": "gitDiffs", "project": project, "ok": false, "error": e }),
            };
            if !req_id.is_null() {
                reply["reqId"] = req_id;
            }
            send(ws, reply)?;
        }
        "gitCommit" => {
            let project = str_field("project").unwrap_or_default();
            let message = str_field("message").unwrap_or_default();
            let files: Vec<String> = v
                .get("files")
                .and_then(Value::as_array)
                .map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect())
                .unwrap_or_default();
            match config::project_root(&project) {
                Ok((cwd, _)) => {
                    let r = crate::git::git_commit(cwd, message, files);
                    send(ws, git_result_reply("gitCommit", &project, r))?;
                }
                Err(e) => send(ws, json!({ "t": "gitCommit", "project": project, "ok": false, "error": e }))?,
            }
        }
        "gitPush" => {
            let project = str_field("project").unwrap_or_default();
            match config::project_root(&project) {
                Ok((cwd, _)) => {
                    let flags = git_push_flags();
                    let out = out.clone();
                    std::thread::spawn(move || {
                        let r = crate::git::git_push(cwd, flags);
                        let _ = out.try_send(git_result_reply("gitPush", &project, r).to_string());
                    });
                }
                Err(e) => send(ws, json!({ "t": "gitPush", "project": project, "ok": false, "error": e }))?,
            }
        }
        "gitPull" => {
            let project = str_field("project").unwrap_or_default();
            match config::project_root(&project) {
                Ok((cwd, _)) => {
                    let (strategy, flags) = git_pull_opts();
                    let out = out.clone();
                    std::thread::spawn(move || {
                        let r = crate::git::pull_branch(cwd, strategy, flags);
                        let _ = out.try_send(git_result_reply("gitPull", &project, r).to_string());
                    });
                }
                Err(e) => send(ws, json!({ "t": "gitPull", "project": project, "ok": false, "error": e }))?,
            }
        }
        "gitFetch" => {
            let project = str_field("project").unwrap_or_default();
            match config::project_root(&project) {
                Ok((cwd, _)) => {
                    let flags = git_fetch_flags();
                    let out = out.clone();
                    std::thread::spawn(move || {
                        let r = crate::git::git_fetch_all(cwd, flags);
                        let _ = out.try_send(git_result_reply("gitFetch", &project, r).to_string());
                    });
                }
                Err(e) => send(ws, json!({ "t": "gitFetch", "project": project, "ok": false, "error": e }))?,
            }
        }
        "gitBranches" => {
            let project = str_field("project").unwrap_or_default();
            match config::project_root(&project) {
                Ok((cwd, _)) => match crate::git::list_branches(cwd.clone()) {
                    Ok(branches) => {
                        // `Branch` serializes camelCase and omits `remote` when empty
                        // (serde skip_serializing_if), so a local branch carries no
                        // `remote` field at all.
                        let branches = serde_json::to_value(&branches).unwrap_or_else(|_| json!([]));
                        let current = crate::git::git_status(cwd).branch;
                        send(ws, json!({ "t": "gitBranches", "project": project, "ok": true,
                            "current": current, "branches": branches }))?;
                    }
                    Err(e) => send(ws, json!({ "t": "gitBranches", "project": project, "ok": false, "error": e }))?,
                },
                Err(e) => send(ws, json!({ "t": "gitBranches", "project": project, "ok": false, "error": e }))?,
            }
        }
        "gitCheckout" => {
            let project = str_field("project").unwrap_or_default();
            let branch = str_field("branch").unwrap_or_default();
            let remote = str_field("remote").unwrap_or_default();
            match config::project_root(&project) {
                Ok((cwd, _)) => {
                    let r = crate::git::checkout_branch(cwd, branch, remote);
                    send(ws, git_result_reply("gitCheckout", &project, r))?;
                }
                Err(e) => send(ws, json!({ "t": "gitCheckout", "project": project, "ok": false, "error": e }))?,
            }
        }
        "gitDiscardAll" => {
            let project = str_field("project").unwrap_or_default();
            match config::project_root(&project) {
                Ok((cwd, _)) => {
                    let r = crate::git::git_discard_all(cwd);
                    send(ws, git_result_reply("gitDiscardAll", &project, r))?;
                }
                Err(e) => send(ws, json!({ "t": "gitDiscardAll", "project": project, "ok": false, "error": e }))?,
            }
        }
        // Live review: watch a project's working tree for this connection and push a
        // debounced `git-changed` when files change, so the phone's review screen
        // self-refreshes while an agent edits. Watchers are per-connection (held in
        // `watches`) and torn down on gitUnwatch, connection close, and revocation
        // (the map drops with the connection). Watching an already-watched project
        // is a no-op.
        "gitWatch" => {
            let project = str_field("project").unwrap_or_default();
            if watches.contains_key(&project) {
                send(ws, json!({ "t": "gitWatch", "project": project, "ok": true }))?;
            } else {
                match config::project_root(&project) {
                    Ok((cwd, _)) => match start_git_watch(&cwd, &project, out) {
                        Ok(w) => {
                            watches.insert(project.clone(), w);
                            send(ws, json!({ "t": "gitWatch", "project": project, "ok": true }))?;
                        }
                        Err(e) => send(ws, json!({ "t": "gitWatch", "project": project, "ok": false, "error": e }))?,
                    },
                    Err(e) => send(ws, json!({ "t": "gitWatch", "project": project, "ok": false, "error": e }))?,
                }
            }
        }
        "gitUnwatch" => {
            let project = str_field("project").unwrap_or_default();
            if let Some(w) = watches.remove(&project) {
                w.stop.store(true, Ordering::SeqCst);
            }
            send(ws, json!({ "t": "gitUnwatch", "project": project, "ok": true }))?;
        }
        "gitGenMessage" => {
            let project = str_field("project").unwrap_or_default();
            let files: Vec<String> = v
                .get("files")
                .and_then(Value::as_array)
                .map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect())
                .unwrap_or_default();
            match config::project_root(&project) {
                Ok((cwd, _)) => {
                    let (cli, model, effort, fast) = git_ai_opts();
                    let (app, out) = (app.clone(), out.clone());
                    std::thread::spawn(move || {
                        let reply = match crate::aigen::generate_commit_message(
                            app, project.clone(), cwd, cli, model, effort, fast, files, String::new(),
                        ) {
                            Ok(message) => json!({ "t": "gitGenMessage", "project": project, "ok": true, "message": message }),
                            Err(e) => json!({ "t": "gitGenMessage", "project": project, "ok": false, "error": e }),
                        };
                        let _ = out.try_send(reply.to_string());
                    });
                }
                Err(e) => send(ws, json!({ "t": "gitGenMessage", "project": project, "ok": false, "error": e }))?,
            }
        }
        "gitGenPr" => {
            let project = str_field("project").unwrap_or_default();
            match config::project_root(&project) {
                Ok((cwd, _)) => {
                    let (cli, model, effort, fast) = git_ai_opts();
                    let (app, out) = (app.clone(), out.clone());
                    std::thread::spawn(move || {
                        let base = crate::git::git_default_branch(cwd.clone());
                        let reply = match crate::aigen::generate_pr_title(
                            app.clone(), project.clone(), cwd.clone(), cli.clone(), model.clone(), effort.clone(), fast, base.clone(),
                        ) {
                            Ok(title) => match crate::aigen::generate_pr_description(
                                app, project.clone(), cwd, cli, model, effort, fast, base,
                            ) {
                                Ok(body) => json!({ "t": "gitGenPr", "project": project, "ok": true, "title": title, "body": body }),
                                Err(e) => json!({ "t": "gitGenPr", "project": project, "ok": false, "error": e }),
                            },
                            Err(e) => json!({ "t": "gitGenPr", "project": project, "ok": false, "error": e }),
                        };
                        let _ = out.try_send(reply.to_string());
                    });
                }
                Err(e) => send(ws, json!({ "t": "gitGenPr", "project": project, "ok": false, "error": e }))?,
            }
        }
        "gitCreatePr" => {
            let project = str_field("project").unwrap_or_default();
            let title = str_field("title").unwrap_or_default();
            let body = str_field("body").unwrap_or_default();
            match config::project_root(&project) {
                Ok((cwd, _)) => {
                    let out = out.clone();
                    std::thread::spawn(move || {
                        let base = crate::git::git_default_branch(cwd.clone());
                        let reply = match crate::git::create_pull_request(cwd, title, body, base) {
                            Ok(url) => json!({ "t": "gitCreatePr", "project": project, "ok": true, "url": url }),
                            Err(e) => json!({ "t": "gitCreatePr", "project": project, "ok": false, "error": e }),
                        };
                        let _ = out.try_send(reply.to_string());
                    });
                }
                Err(e) => send(ws, json!({ "t": "gitCreatePr", "project": project, "ok": false, "error": e }))?,
            }
        }
        // The user's enabled composer AI actions (~/.lpm/composer-actions.json),
        // so the phone can offer the same rewrite buttons the desktop composer does.
        "composerActions" => {
            send(ws, json!({ "t": "composerActions", "actions": composer_actions_enabled() }))?;
        }
        // Headless AI rewrite of the composer text, mirroring desktop's
        // transform_text. `variants` (1..=5) fan out as parallel worker-thread runs;
        // each replies a `transform` frame as it settles, then one `transformDone`
        // once all have. AI params come from persisted settings (git_ai_opts), the
        // same source the git AI generators use. A failed variant is ok:false but
        // doesn't fail the batch unless every variant fails.
        "transform" => {
            let req_id = v.get("reqId").cloned().unwrap_or(Value::Null);
            let project = str_field("project").unwrap_or_default();
            let instruction = str_field("instruction").unwrap_or_default();
            let text = str_field("text").unwrap_or_default();
            let variants = v.get("variants").and_then(Value::as_u64).unwrap_or(1).clamp(1, 5) as usize;
            match config::project_root(&project) {
                Ok((cwd, _)) => {
                    let (cli, model, effort, fast) = git_ai_opts();
                    let project_opt = if project.is_empty() { None } else { Some(project.clone()) };
                    let remaining = Arc::new(AtomicUsize::new(variants));
                    let any_ok = Arc::new(AtomicBool::new(false));
                    for idx in 0..variants {
                        let instr = if variants == 1 {
                            instruction.clone()
                        } else {
                            variant_instruction(&instruction, idx, variants)
                        };
                        let (app, out) = (app.clone(), out.clone());
                        let (cwd, cli, model, effort) =
                            (cwd.clone(), cli.clone(), model.clone(), effort.clone());
                        let (text, project_opt, req_id) = (text.clone(), project_opt.clone(), req_id.clone());
                        let (remaining, any_ok) = (remaining.clone(), any_ok.clone());
                        std::thread::spawn(move || {
                            let reply = match crate::aigen::transform_text(
                                app, project_opt, cwd, cli, model, effort, fast, instr, text,
                            ) {
                                Ok(t) => {
                                    any_ok.store(true, Ordering::SeqCst);
                                    json!({ "t": "transform", "reqId": req_id, "idx": idx, "ok": true, "text": t })
                                }
                                Err(e) => json!({ "t": "transform", "reqId": req_id, "idx": idx, "ok": false, "error": e }),
                            };
                            let _ = out.try_send(reply.to_string());
                            if remaining.fetch_sub(1, Ordering::SeqCst) == 1 {
                                let _ = out.try_send(
                                    json!({ "t": "transformDone", "reqId": req_id, "ok": any_ok.load(Ordering::SeqCst) })
                                        .to_string(),
                                );
                            }
                        });
                    }
                }
                Err(e) => {
                    send(ws, json!({ "t": "transform", "reqId": req_id, "idx": 0, "ok": false, "error": e }))?;
                    send(ws, json!({ "t": "transformDone", "reqId": req_id, "ok": false }))?;
                }
            }
        }
        // Service discovery: the project's services with their pane index (for
        // serviceLogs) and running state. Runs on a worker thread — spawn_info +
        // tmux session listing are subprocess work. When the project isn't running,
        // every declared service is reported with running:false and no pane index.
        "services" => {
            let project = str_field("project").unwrap_or_default();
            let run_state = app.state::<services::ServiceState>().get(&project);
            let out = out.clone();
            std::thread::spawn(move || {
                let reply = match config::spawn_info(&project) {
                    Ok(info) => {
                        let running = crate::tmux::running_sessions().contains(&info.session);
                        let svc = |name: &str, pane: Option<usize>, run: bool| {
                            let s = info.services.get(name).cloned().unwrap_or_default();
                            json!({ "name": name, "paneIndex": pane, "running": run,
                                "cmd": s.cmd, "port": s.port })
                        };
                        let services: Vec<Value> = if running {
                            config::resolve_running_services(&info, &run_state)
                                .iter()
                                .enumerate()
                                .map(|(i, n)| svc(n, Some(i), true))
                                .collect()
                        } else {
                            info.services.keys().map(|n| svc(n, None, false)).collect()
                        };
                        json!({ "t": "services", "project": project, "ok": true,
                            "running": running, "services": services })
                    }
                    Err(e) => json!({ "t": "services", "project": project, "ok": false, "error": e }),
                };
                let _ = out.try_send(reply.to_string());
            });
        }
        // Capture a running service pane's recent output, reusing get_service_logs
        // (tmux pane capture). Subprocess work, so it runs on a worker thread and
        // replies via the outbound queue. Lines are capped at 200.
        "serviceLogs" => {
            let project = str_field("project").unwrap_or_default();
            let pane_index = v.get("paneIndex").and_then(Value::as_i64).unwrap_or(0);
            let lines = v.get("lines").and_then(Value::as_i64).unwrap_or(200).clamp(1, 200);
            let out = out.clone();
            std::thread::spawn(move || {
                let reply = match crate::log_streaming::get_service_logs(project.clone(), pane_index, lines) {
                    Ok(text) => json!({ "t": "serviceLogs", "project": project, "paneIndex": pane_index,
                        "ok": true, "text": text }),
                    Err(e) => json!({ "t": "serviceLogs", "project": project, "paneIndex": pane_index,
                        "ok": false, "error": e }),
                };
                let _ = out.try_send(reply.to_string());
            });
        }
        // Paginated history query (keyset, page 60), mirroring the desktop popover.
        // `project` scopes to that project (else all); `favoritesOnly`/`folder`
        // select a collection; `before` = the previous page's last {at, seq} cursor.
        // Items carry the cursor fields (at, seq) so the phone can request the next
        // page. SQLite is local/fast, so this replies inline like `history`.
        "historyQuery" => {
            let project = str_field("project").unwrap_or_default();
            let (scope, project_name) = if project.is_empty() {
                ("all".to_string(), String::new())
            } else {
                ("project".to_string(), project.clone())
            };
            let favorites_only = v.get("favoritesOnly").and_then(Value::as_bool).unwrap_or(false);
            let folder = str_field("folder").unwrap_or_default();
            let collection = if favorites_only {
                "favorites".to_string()
            } else if !folder.is_empty() {
                folder
            } else {
                String::new()
            };
            let before = v.get("before");
            let cursor_at = before.and_then(|b| b.get("at")).and_then(Value::as_i64);
            let cursor_seq = before.and_then(|b| b.get("seq")).and_then(Value::as_i64);
            const PAGE: i64 = 60;
            let input = crate::message_history::QueryInput {
                scope,
                terminal_id: String::new(),
                project_name,
                terminal_label: String::new(),
                collection,
                search: str_field("search").unwrap_or_default(),
                cursor_at,
                cursor_seq,
                limit: PAGE + 1,
            };
            let rows = crate::message_history::message_history_query(
                app.state::<crate::message_history::MessageHistoryState>(),
                input,
            )
            .unwrap_or_default();
            let has_more = rows.len() as i64 > PAGE;
            let items: Vec<Value> = rows
                .iter()
                .take(PAGE as usize)
                .map(|r| {
                    json!({
                        "id": r.id, "text": r.text, "images": r.images, "timestamp": r.at,
                        "favorite": r.favorite, "folder": r.folder_id,
                        "kind": if r.is_draft { "draft" } else { "sent" },
                        "project": r.project_name, "at": r.at, "seq": r.seq,
                    })
                })
                .collect();
            send(ws, json!({ "t": "historyQuery", "items": items, "hasMore": has_more }))?;
        }
        // Save the composer's current text as an unsent draft (kept in shared
        // history, badged as a draft). `message` is the draft text; project/id/label/
        // images are optional context.
        "historySaveDraft" => {
            let text = str_field("message")
                .or_else(|| v.get("message").and_then(|m| m.get("text")).and_then(Value::as_str).map(str::to_string))
                .unwrap_or_default();
            if !text.trim().is_empty() {
                let images = v
                    .get("images")
                    .and_then(Value::as_object)
                    .map(|o| {
                        o.iter()
                            .filter_map(|(k, val)| val.as_str().map(|s| (k.clone(), s.to_string())))
                            .collect()
                    })
                    .unwrap_or_default();
                let input = crate::message_history::AddInput {
                    text,
                    project_name: str_field("project").unwrap_or_default(),
                    terminal_id: str_field("id").unwrap_or_default(),
                    terminal_label: str_field("label").unwrap_or_default(),
                    images,
                };
                let _ = crate::message_history::message_history_save_draft(
                    app.state::<crate::message_history::MessageHistoryState>(),
                    input,
                );
            }
            send(ws, json!({ "t": "historySaveDraft", "ok": true }))?;
        }
        "historyToggleFavorite" => {
            let id = str_field("id").unwrap_or_default();
            match crate::message_history::toggle_favorite_state(
                app.state::<crate::message_history::MessageHistoryState>(),
                &id,
            ) {
                Ok(fav) => send(ws, json!({ "t": "historyToggleFavorite", "id": id, "ok": true, "favorite": fav }))?,
                Err(e) => send(ws, json!({ "t": "historyToggleFavorite", "id": id, "ok": false, "error": e }))?,
            }
        }
        // Move a message into a folder, or omit `folder` to remove it from its folder.
        "historySetFolder" => {
            let id = str_field("id").unwrap_or_default();
            let folder = str_field("folder");
            let r = crate::message_history::message_history_set_folder(
                app.state::<crate::message_history::MessageHistoryState>(),
                id,
                folder,
            );
            send(ws, result_reply("historySetFolder", r))?;
        }
        "historyDelete" => {
            let id = str_field("id").unwrap_or_default();
            let r = crate::message_history::message_history_delete(
                app.state::<crate::message_history::MessageHistoryState>(),
                id,
            );
            send(ws, result_reply("historyDelete", r))?;
        }
        "historyFolders" => {
            let folders = crate::message_history::message_history_folders(
                app.state::<crate::message_history::MessageHistoryState>(),
            )
            .unwrap_or_default();
            let folders = serde_json::to_value(folders).unwrap_or_else(|_| json!([]));
            send(ws, json!({ "t": "historyFolders", "folders": folders }))?;
        }
        "historyCreateFolder" => {
            let name = str_field("name").unwrap_or_default();
            match crate::message_history::message_history_create_folder(
                app.state::<crate::message_history::MessageHistoryState>(),
                name,
            ) {
                Ok(f) => send(ws, json!({ "t": "historyCreateFolder", "ok": true,
                    "folder": serde_json::to_value(f).unwrap_or_else(|_| json!({})) }))?,
                Err(e) => send(ws, json!({ "t": "historyCreateFolder", "ok": false, "error": e }))?,
            }
        }
        // Delete a folder (its messages are un-filed, not deleted). Accepts the
        // folder `id`, or resolves a `name` to its id.
        "historyDeleteFolder" => {
            let id = match str_field("id").filter(|s| !s.is_empty()) {
                Some(id) => Some(id),
                None => {
                    let name = str_field("name").unwrap_or_default();
                    crate::message_history::message_history_folders(
                        app.state::<crate::message_history::MessageHistoryState>(),
                    )
                    .unwrap_or_default()
                    .into_iter()
                    .find(|f| f.name == name)
                    .map(|f| f.id)
                }
            };
            match id {
                Some(id) => {
                    let r = crate::message_history::message_history_delete_folder(
                        app.state::<crate::message_history::MessageHistoryState>(),
                        id,
                    );
                    send(ws, result_reply("historyDeleteFolder", r))?;
                }
                None => send(ws, json!({ "t": "historyDeleteFolder", "ok": false, "error": "folder not found" }))?,
            }
        }
        _ => {}
    }
    Ok(())
}

/// The composer AI actions the phone should surface: the user's enabled actions
/// from ~/.lpm/composer-actions.json, or the seeded defaults when the file is
/// absent (mirrors DEFAULT_COMPOSER_ACTIONS in composerActions.ts — the two
/// everyday rewrites ship enabled). Each carries a stable id, icon, label, and
/// instruction, matching the desktop store's JSON shape.
fn composer_actions_enabled() -> Vec<Value> {
    let raw = crate::commands_real::load_composer_actions();
    let list = match &raw {
        Value::Array(a) => Some(a.clone()),
        Value::Object(o) => o.get("actions").and_then(Value::as_array).cloned(),
        _ => None,
    };
    let Some(list) = list else {
        return default_composer_actions();
    };
    list.iter()
        .filter(|a| a.get("enabled").and_then(Value::as_bool).unwrap_or(false))
        .filter_map(|a| {
            let id = a.get("id").and_then(Value::as_str).filter(|s| !s.is_empty())?;
            Some(json!({
                "id": id,
                "icon": a.get("icon").and_then(Value::as_str).unwrap_or("sparkles"),
                "label": a.get("label").and_then(Value::as_str).unwrap_or(""),
                "instruction": a.get("instruction").and_then(Value::as_str).unwrap_or(""),
            }))
        })
        .collect()
}

/// The enabled seed actions when no composer-actions.json exists yet, verbatim
/// from DEFAULT_COMPOSER_ACTIONS in composerActions.ts (the two everyday rewrites
/// that ship enabled), so a fresh install still offers the same defaults desktop
/// shows.
fn default_composer_actions() -> Vec<Value> {
    vec![
        json!({ "id": "improve", "icon": "sparkles", "label": "Improve prompt",
            "instruction": "Rewrite this into a clearer, more specific, well-structured prompt for an AI coding agent. Resolve ambiguous pronouns and references, remove vagueness, and fill in obvious missing context that is already implied. Keep the original intent and do not add new requirements the user didn't imply." }),
        json!({ "id": "concise", "icon": "minimize", "label": "Make concise",
            "instruction": "Rewrite this to be as concise and direct as possible while preserving all meaning, intent, and every requirement or constraint. Cut filler and repetition but keep all specifics, file names, and acceptance criteria intact." }),
    ]
}

/// Nudge a parallel transform run toward a distinct rewrite, mirroring
/// composerVariants.ts's variantInstruction so the phone's variant picker isn't
/// several near-identical outputs — the instruction still leads.
fn variant_instruction(instruction: &str, index: usize, total: usize) -> String {
    format!(
        "{instruction}\n\nGenerate variation {} of {total}: produce a distinct rewrite that differs meaningfully from the other variations in wording, structure, and emphasis, while fully following the instruction above.",
        index + 1
    )
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
pub(crate) fn group_copies_into_folder(
    parent: &str,
    group_name: &str,
    copies: &[String],
) -> Result<(), String> {
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

// --- APNs push notifications -------------------------------------------------

/// Validate an `apnsToken` registration: token is non-empty hex ≤200 chars, env
/// is one of the two APNs environments, and key base64-decodes to 32 bytes.
fn validate_apns(token: &str, env: &str, key: &str) -> Result<(), String> {
    if token.is_empty() || token.len() > 200 || !token.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("invalid token".into());
    }
    if env != "production" && env != "sandbox" {
        return Err("invalid env".into());
    }
    match base64::engine::general_purpose::STANDARD.decode(key) {
        Ok(k) if k.len() == 32 => Ok(()),
        _ => Err("invalid key".into()),
    }
}

/// Register `token`/`env`/`key`/`prefs` on the device with `device_id`, and strip
/// the push identity from every OTHER record still holding the same `apns_token`.
/// An APNs token uniquely identifies a physical device+app install, so any other
/// record carrying it is a stale pairing (phone reinstalled / re-scanned the QR)
/// that would otherwise keep receiving pushes under its old, fail-open prefs.
/// Stale records stay paired — only their push identity is cleared. Returns false
/// when `device_id` isn't paired.
fn apply_apns_token(
    devices: &mut [Device],
    device_id: &str,
    token: &str,
    env: &str,
    key: &str,
    prefs: (bool, bool, bool),
) -> bool {
    if !devices.iter().any(|d| d.id == device_id) {
        return false;
    }
    for d in devices.iter_mut() {
        if d.id == device_id {
            d.apns_token = token.to_string();
            d.apns_env = env.to_string();
            d.push_key = key.to_string();
            (d.push_waiting, d.push_done, d.push_error) = prefs;
        } else if d.apns_token == token {
            d.apns_token.clear();
            d.apns_env.clear();
            d.push_key.clear();
        }
    }
    true
}

/// Persist a device's push identity on its config record. Returns false when the
/// device id isn't paired (a stale/forged connection).
fn set_apns_token(
    hub: &RemoteHub,
    device_id: &str,
    token: &str,
    env: &str,
    key: &str,
    prefs: (bool, bool, bool),
) -> bool {
    let mut cfg = hub.inner.config.lock().unwrap();
    if !apply_apns_token(&mut cfg.devices, device_id, token, env, key, prefs) {
        return false;
    }
    let snapshot = cfg.clone();
    drop(cfg);
    let _ = save_config(&snapshot);
    true
}

/// Clear a device's stored APNs token (kept paired) after the relay reports it
/// dead (HTTP 410 / Unregistered), so a stale install stops generating traffic.
fn clear_apns_token(hub: &RemoteHub, device_id: &str) {
    let mut cfg = hub.inner.config.lock().unwrap();
    let mut changed = false;
    if let Some(d) = cfg.devices.iter_mut().find(|d| d.id == device_id) {
        if !d.apns_token.is_empty() {
            d.apns_token.clear();
            changed = true;
        }
    }
    if changed {
        let snapshot = cfg.clone();
        drop(cfg);
        let _ = save_config(&snapshot);
    }
}

/// Given the connection-independent dedup map (per (project, status key) → last
/// pushed (value, ts)) and a project's current pushable entries, return the
/// entries whose value is new or changed — worth a push — plus the keys that
/// vanished from this project since the last event (their previously-pushed
/// notifications need withdrawing). Updates the map in place: this project's
/// vanished keys are dropped, other projects untouched.
fn dedup_status_pushes(
    seen: &mut HashMap<(String, String), (String, i64)>,
    project: &str,
    entries: &[(String, String, i64)],
) -> (Vec<(String, String, i64)>, Vec<String>) {
    let current: HashSet<&str> = entries.iter().map(|(k, _, _)| k.as_str()).collect();
    let vanished: Vec<String> = seen
        .keys()
        .filter(|(p, k)| p == project && !current.contains(k.as_str()))
        .map(|(_, k)| k.clone())
        .collect();
    seen.retain(|(p, k), _| p != project || current.contains(k.as_str()));
    let mut push = Vec::new();
    for (key, value, ts) in entries {
        let mk = (project.to_string(), key.clone());
        let changed = seen.get(&mk).map(|(v, _)| v != value).unwrap_or(true);
        if changed {
            seen.insert(mk, (value.clone(), *ts));
            push.push((key.clone(), value.clone(), *ts));
        }
    }
    (push, vanished)
}

/// The `apns-collapse-id` for an alert about a status entry: sha-256 hex of
/// `"<project>|<key>"` truncated to 60 chars, so a later transition on the same
/// pane replaces the shown notification instead of stacking a new one.
fn push_collapse_id(project: &str, key: &str) -> String {
    let mut id = sha256_hex(format!("{project}|{key}").as_bytes());
    id.truncate(60);
    id
}

/// Seal a notification plaintext with AES-256-GCM under the device push key,
/// encoded as `nonce(12) || ciphertext || tag(16)` in standard base64 — the
/// CryptoKit `AES.GCM.SealedBox(combined:)` format the phone's extension opens.
fn seal_push(key: &[u8; 32], plaintext: &[u8]) -> Option<String> {
    let cipher = Aes256Gcm::new_from_slice(key).ok()?;
    let mut nonce = [0u8; 12];
    getrandom::getrandom(&mut nonce).ok()?;
    let sealed = cipher.encrypt(Nonce::from_slice(&nonce), plaintext).ok()?;
    let mut out = Vec::with_capacity(nonce.len() + sealed.len());
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&sealed);
    Some(base64::engine::general_purpose::STANDARD.encode(out))
}

/// A single device to notify: its id (for a 410 cleanup), the relay routing
/// fields, the decoded 32-byte push key, and its per-status delivery prefs.
struct PushDevice {
    id: String,
    token: String,
    env: String,
    key: [u8; 32],
    push_waiting: bool,
    push_done: bool,
    push_error: bool,
}

impl PushDevice {
    /// Whether this device opted in to notifications for the given status value.
    fn wants(&self, status: &str) -> bool {
        match status {
            STATUS_WAITING => self.push_waiting,
            STATUS_DONE => self.push_done,
            STATUS_ERROR => self.push_error,
            _ => false,
        }
    }
}

/// One notification to seal + send: the resolved terminal label, status value,
/// the entry's timestamp, its status `key` (so a later clear can find it), and
/// the `apns-collapse-id` derived from (project, key).
struct PushJob {
    terminal: String,
    value: String,
    ts: i64,
    key: String,
    collapse_id: String,
}

/// Decode a device into a `PushDevice`, or None when its push key isn't a valid
/// 32-byte AES key (so nothing could be sealed to it anyway).
fn make_push_device(d: &Device) -> Option<PushDevice> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(&d.push_key).ok()?;
    let key: [u8; 32] = bytes.try_into().ok()?;
    Some(PushDevice {
        id: d.id.clone(),
        token: d.apns_token.clone(),
        env: d.apns_env.clone(),
        key,
        push_waiting: d.push_waiting,
        push_done: d.push_done,
        push_error: d.push_error,
    })
}

/// Devices to alert on a new/changed status: a registered token, not currently
/// connected, opted in to at least one status kind, and a valid push key. The
/// per-status filter is applied later via `PushDevice::wants`.
fn alert_recipients(devices: &[Device], connected: &HashSet<String>) -> Vec<PushDevice> {
    devices
        .iter()
        .filter(|d| {
            !d.apns_token.is_empty()
                && !connected.contains(&d.id)
                && (d.push_waiting || d.push_done || d.push_error)
        })
        .filter_map(make_push_device)
        .collect()
}

/// Devices to send a withdrawal to: any registered token with a valid push key,
/// ignoring notify prefs and the connected exclusion (a clear only removes, so
/// it's idempotent/harmless).
fn clear_recipients(devices: &[Device]) -> Vec<PushDevice> {
    devices
        .iter()
        .filter(|d| !d.apns_token.is_empty())
        .filter_map(make_push_device)
        .collect()
}

/// On an agent status transition, push an APNs notification to every registered
/// device that isn't currently holding a live socket (a live socket means the app
/// is foregrounded and already got the `status-changed` frame). Never blocks the
/// event listener: all the network work runs on a spawned thread.
fn push_notifications(hub: &RemoteHub, app: &AppHandle, project: &str) {
    // Only the instance actually running the remote server can tell which phones
    // hold a live socket; an unbound instance sees an empty client map and would
    // treat every phone as away and push everything. Gate on both flags and
    // behave as if push doesn't exist here. The dedup map is irrelevant while
    // gated — re-pushing the outstanding statuses after a later re-enable is fine.
    if !hub.inner.enabled.load(Ordering::Relaxed) || !hub.inner.running.load(Ordering::Relaxed) {
        return;
    }
    if project.is_empty() {
        return;
    }

    // The project's pushable entries (Waiting/Done/Error), with pane id for label
    // resolution. Non-pushable statuses (Running) never notify.
    let store = app.state::<Arc<StatusStore>>();
    let entries: Vec<(String, String, i64, String)> = store
        .list(project)
        .into_iter()
        .filter(|e| matches!(e.value.as_str(), STATUS_WAITING | STATUS_DONE | STATUS_ERROR))
        .map(|e| (e.key, e.value, e.timestamp, e.pane_id))
        .collect();
    let pane_of: HashMap<String, String> =
        entries.iter().map(|(k, _, _, p)| (k.clone(), p.clone())).collect();
    let plain: Vec<(String, String, i64)> =
        entries.iter().map(|(k, v, t, _)| (k.clone(), v.clone(), *t)).collect();

    // Update the dedup map on every event (a transition fact, independent of who's
    // connected): the new/changed entries to alert on, and the keys that vanished
    // and whose delivered notifications now need withdrawing.
    let (deltas, vanished_keys) = {
        let mut seen = hub.inner.push_dedup.lock().unwrap();
        dedup_status_pushes(&mut seen, project, &plain)
    };
    if deltas.is_empty() && vanished_keys.is_empty() {
        return;
    }
    let want_alert = !deltas.is_empty();
    let want_clear = !vanished_keys.is_empty();

    // Alerts skip devices holding a live socket (the app is foregrounded and
    // already got the `status-changed` frame); clears don't, since a foregrounded
    // phone's already-delivered notifications still need pruning.
    let connected: HashSet<String> = if want_alert {
        hub.inner.clients.lock().unwrap().values().map(|c| c.device_id.clone()).collect()
    } else {
        HashSet::new()
    };
    // Read prefs/registrations from disk, not this instance's startup snapshot:
    // the config is rewritten on every pref or registration change (possibly by a
    // second lpm instance), so disk is authoritative at send time. Used locally
    // only — never written back into hub.inner.config — to avoid clobbering a
    // concurrent in-memory registration.
    let cfg = load_config();
    let relay = cfg.effective_relay();
    let recipients: Vec<PushDevice> = if want_alert {
        alert_recipients(&cfg.devices, &connected)
    } else {
        Vec::new()
    };
    let clear_recipients: Vec<PushDevice> =
        if want_clear { clear_recipients(&cfg.devices) } else { Vec::new() };
    if recipients.is_empty() && clear_recipients.is_empty() {
        return;
    }

    // Resolve terminal labels best-effort (empty when the pane id is unknown).
    let jobs: Vec<PushJob> = if recipients.is_empty() {
        Vec::new()
    } else {
        let labels = hub.inner.labels.lock().unwrap();
        deltas
            .into_iter()
            .map(|(key, value, ts)| {
                let terminal = pane_of
                    .get(&key)
                    .and_then(|pane| labels.get(pane).cloned())
                    .unwrap_or_default();
                let collapse_id = push_collapse_id(project, &key);
                PushJob { terminal, value, ts, key, collapse_id }
            })
            .collect()
    };

    let (hub, project) = (hub.clone(), project.to_string());
    std::thread::spawn(move || {
        let client = match reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
        {
            Ok(c) => c,
            Err(e) => {
                eprintln!("warning: push relay client init failed: {e}");
                return;
            }
        };

        // Alert pushes, one per (device, wanted job).
        for dev in &recipients {
            for job in jobs.iter().filter(|j| dev.wants(&j.value)) {
                let plaintext = json!({
                    "project": project,
                    "terminal": job.terminal,
                    "status": job.value,
                    "ts": job.ts,
                    "key": job.key,
                })
                .to_string();
                let Some(blob) = seal_push(&dev.key, plaintext.as_bytes()) else {
                    continue;
                };
                let body = json!({
                    "token": dev.token,
                    "env": dev.env,
                    "blob": blob,
                    "collapseId": job.collapse_id,
                })
                .to_string();
                if post_push(&client, &relay, &hub, &dev.id, body) {
                    break;
                }
            }
        }

        // Withdrawal: one batched background push per registered device.
        if !clear_recipients.is_empty() {
            let clear_plaintext = json!({
                "clear": vanished_keys
                    .iter()
                    .map(|k| json!({ "project": project, "key": k }))
                    .collect::<Vec<_>>(),
            })
            .to_string();
            for dev in &clear_recipients {
                let Some(blob) = seal_push(&dev.key, clear_plaintext.as_bytes()) else {
                    continue;
                };
                let body = json!({
                    "token": dev.token,
                    "env": dev.env,
                    "blob": blob,
                    "type": "background",
                })
                .to_string();
                post_push(&client, &relay, &hub, &dev.id, body);
            }
        }
    });
}

/// POST one sealed push body to the relay. Returns true when the relay reported
/// the device token dead (HTTP 410 / Unregistered) and cleared it, so the caller
/// stops pushing to that device.
fn post_push(
    client: &reqwest::blocking::Client,
    relay: &str,
    hub: &RemoteHub,
    device_id: &str,
    body: String,
) -> bool {
    match client
        .post(relay)
        .header("content-type", "application/json")
        .body(body)
        .send()
    {
        Ok(resp) => {
            let status = resp.status().as_u16();
            if status == 410 {
                clear_apns_token(hub, device_id);
                return true;
            }
            if !(200..300).contains(&status) {
                eprintln!("warning: push relay returned {status}");
            }
        }
        Err(e) => eprintln!("warning: push relay POST failed: {e}"),
    }
    false
}

fn install_forwarders(hub: &RemoteHub, app: &AppHandle) {
    let h = hub.clone();
    app.listen("projects-changed", move |_| {
        broadcast(&h, json!({ "t": "projects-changed" }));
    });
    let h = hub.clone();
    let a = app.clone();
    app.listen("status-changed", move |e| {
        let project = serde_json::from_str::<String>(e.payload()).unwrap_or_default();
        broadcast(&h, json!({ "t": "status-changed", "project": project }));
        push_notifications(&h, &a, &project);
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

// Test-only surface used by peer.rs's integration test to drive the *real*
// server code (handshake + pairing + device store) without a full Tauri app.
#[cfg(test)]
pub(crate) mod test_support {
    use super::*;

    pub fn set_config_path(p: std::path::PathBuf) {
        *TEST_CONFIG_PATH.lock().unwrap() = Some(p);
    }

    pub fn clear_config_path() {
        *TEST_CONFIG_PATH.lock().unwrap() = None;
    }

    pub fn new_hub_with_code(code: &str) -> RemoteHub {
        let hub = RemoteHub::default();
        hub.inner.config.lock().unwrap().pairing_code = code.to_string();
        hub
    }

    pub fn device_count(hub: &RemoteHub) -> usize {
        hub.inner.config.lock().unwrap().devices.len()
    }

    /// A minimal accept loop that runs the genuine `authenticate` handshake per
    /// connection, then holds the socket answering `ping` with `pong` — enough to
    /// exercise pair, auth, and the supervisor's keepalive without pulling in the
    /// full app-stateful `handle_conn`.
    pub fn serve(listener: TcpListener, hub: RemoteHub, stop: Arc<AtomicBool>) {
        let _ = listener.set_nonblocking(true);
        while !stop.load(Ordering::SeqCst) {
            match listener.accept() {
                Ok((stream, _)) => {
                    let _ = stream.set_nonblocking(false);
                    let hub = hub.clone();
                    std::thread::spawn(move || serve_conn(stream, hub));
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(20));
                }
                Err(_) => break,
            }
        }
    }

    fn serve_conn(stream: TcpStream, hub: RemoteHub) {
        let Some(mut ws) = accept_ws(stream) else {
            return;
        };
        if authenticate(&mut ws, &hub).is_none() {
            let _ = ws.close(None);
            return;
        }
        let _ = ws.get_ref().set_read_timeout(Some(POLL));
        loop {
            match ws.read() {
                Ok(m) if m.is_close() => break,
                Ok(m) if m.is_text() => {
                    if let Ok(v) = serde_json::from_str::<Value>(m.to_text().unwrap_or_default()) {
                        for reply in canned_replies(&v) {
                            let _ = ws.send(Message::text(reply.to_string()));
                        }
                    }
                }
                Ok(_) => {}
                Err(WsError::Io(ref e))
                    if e.kind() == std::io::ErrorKind::WouldBlock
                        || e.kind() == std::io::ErrorKind::TimedOut => {}
                Err(_) => break,
            }
        }
    }

    /// Canned responses for the requests peer.rs exercises, so the integration
    /// test drives a realistic request→push round-trip.
    fn canned_replies(v: &Value) -> Vec<Value> {
        match v.get("t").and_then(Value::as_str) {
            Some("ping") => vec![json!({ "t": "pong" })],
            Some("projects") => vec![json!({ "t": "projects", "projects": [
                { "name": "web-app", "label": "web-app", "running": true }
            ] })],
            Some("terminals") => {
                let project = v.get("project").and_then(Value::as_str).unwrap_or_default();
                vec![json!({ "t": "terminals", "project": project, "terminals": [
                    { "id": "web-app-1", "label": "Claude", "project": project, "cols": 80, "rows": 24 }
                ] })]
            }
            Some("sub") => {
                let id = v.get("id").and_then(Value::as_str).unwrap_or_default();
                vec![
                    json!({ "t": "seed", "id": id, "cols": 80, "rows": 24, "data": "hello", "owner": null }),
                    json!({ "t": "o", "id": id, "d": "world" }),
                ]
            }
            // "Take control": grant a control frame owned by this (mobile-kind) device.
            Some("claim") => {
                let id = v.get("id").and_then(Value::as_str).unwrap_or_default();
                vec![json!({ "t": "control", "id": id, "owner": { "kind": "mobile", "id": "self", "label": "peer" } })]
            }
            // Echo input/resize so the test can verify the frame transited verbatim
            // (the real server has no reply for these).
            Some("in") => {
                let id = v.get("id").and_then(Value::as_str).unwrap_or_default();
                let d = v.get("d").and_then(Value::as_str).unwrap_or_default();
                vec![json!({ "t": "in-echo", "id": id, "d": d })]
            }
            Some("resize") => {
                let id = v.get("id").and_then(Value::as_str).unwrap_or_default();
                vec![json!({ "t": "resize-echo", "id": id,
                    "cols": v.get("cols").cloned().unwrap_or(Value::Null),
                    "rows": v.get("rows").cloned().unwrap_or(Value::Null) })]
            }
            // Project control: start also pushes a status-changed (as the real
            // server does), so the client's status refetch path is exercised.
            Some("start") => {
                let name = v.get("name").and_then(Value::as_str).unwrap_or_default();
                vec![
                    json!({ "t": "start", "ok": true }),
                    json!({ "t": "status-changed", "project": name }),
                ]
            }
            Some("stop") => vec![json!({ "t": "stop", "ok": true })],
            Some("toggleService") => vec![json!({ "t": "toggleService", "ok": true })],
            // action "fail" exercises the relay error path (main window closed);
            // anything else succeeds.
            Some("runAction") => {
                if v.get("action").and_then(Value::as_str) == Some("fail") {
                    vec![json!({ "t": "runAction", "ok": false, "error": "Open the lpm app on your Mac to run actions." })]
                } else {
                    vec![json!({ "t": "runAction", "ok": true })]
                }
            }
            Some("newTerminal") => vec![json!({ "t": "newTerminal", "ok": true })],
            Some("status") => {
                let project = v.get("project").and_then(Value::as_str).unwrap_or_default();
                vec![json!({ "t": "status", "project": project, "status": [
                    { "key": "k", "value": "Waiting", "paneID": "web-app-1", "priority": 1 }
                ] })]
            }
            // Recent prompts for the remote composer's up-arrow recall.
            Some("history") => {
                let project = v.get("project").and_then(Value::as_str).unwrap_or_default();
                vec![json!({ "t": "history", "project": project, "rows": [{ "text": "npm test" }] })]
            }
            Some("gitBranches") => {
                let project = v.get("project").and_then(Value::as_str).unwrap_or_default();
                vec![json!({ "t": "gitBranches", "project": project, "ok": true, "current": "main",
                    "branches": [{ "name": "main" }, { "name": "dev", "committerDate": 1 }] })]
            }
            Some("gitCheckout") => {
                let project = v.get("project").and_then(Value::as_str).unwrap_or_default();
                vec![json!({ "t": "gitCheckout", "project": project, "ok": true })]
            }
            Some("services") => {
                let project = v.get("project").and_then(Value::as_str).unwrap_or_default();
                vec![json!({ "t": "services", "project": project, "ok": true, "running": true,
                    "services": [{ "name": "dev", "paneIndex": 0, "running": true, "cmd": "npm run dev", "port": 9245 }] })]
            }
            Some("serviceLogs") => {
                let project = v.get("project").and_then(Value::as_str).unwrap_or_default();
                let pane = v.get("paneIndex").cloned().unwrap_or(Value::Null);
                vec![json!({ "t": "serviceLogs", "project": project, "paneIndex": pane, "ok": true, "text": "listening on :9245\n" })]
            }
            // Git review + ship.
            Some("git") => {
                let project = v.get("project").and_then(Value::as_str).unwrap_or_default();
                vec![json!({ "t": "git", "project": project, "ok": true, "isRepo": true,
                    "branch": "main", "detached": false, "hasUpstream": true, "ahead": 1, "behind": 0,
                    "defaultBranch": "main", "ghCli": true,
                    "files": [{ "path": "a.txt", "status": "modified", "staged": false, "stamp": "1" }] })]
            }
            Some("gitDiffs") => {
                let project = v.get("project").and_then(Value::as_str).unwrap_or_default();
                let diffs: serde_json::Map<String, Value> = v
                    .get("files")
                    .and_then(Value::as_array)
                    .map(|a| {
                        a.iter()
                            .filter_map(|f| f.get("path").and_then(Value::as_str))
                            .map(|p| (p.to_string(), json!({ "original": "old\n", "modified": "new\n", "binary": false, "tooLarge": false })))
                            .collect()
                    })
                    .unwrap_or_default();
                let mut reply = json!({ "t": "gitDiffs", "project": project, "ok": true, "diffs": diffs });
                if let Some(rid) = v.get("reqId") {
                    reply["reqId"] = rid.clone();
                }
                vec![reply]
            }
            Some("gitWatch") | Some("gitUnwatch") => {
                let project = v.get("project").and_then(Value::as_str).unwrap_or_default();
                let t = v.get("t").and_then(Value::as_str).unwrap_or_default();
                vec![json!({ "t": t, "project": project, "ok": true })]
            }
            // message "fail" exercises the error path; success also pushes a
            // git-changed (as a live watch would after a commit).
            Some("gitCommit") => {
                let project = v.get("project").and_then(Value::as_str).unwrap_or_default();
                if v.get("message").and_then(Value::as_str) == Some("fail") {
                    vec![json!({ "t": "gitCommit", "project": project, "ok": false, "error": "Nothing to commit." })]
                } else {
                    vec![
                        json!({ "t": "gitCommit", "project": project, "ok": true }),
                        json!({ "t": "git-changed", "project": project }),
                    ]
                }
            }
            _ => Vec::new(),
        }
    }
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
    fn apply_apns_token_clears_stale_duplicate_records() {
        let b64 = |b: [u8; 32]| base64::engine::general_purpose::STANDARD.encode(b);
        let mut devices = vec![
            // A stale pairing for the same physical phone, still holding "deadbeef"
            // with fail-open prefs.
            Device {
                id: "old".into(),
                apns_token: "deadbeef".into(),
                apns_env: "production".into(),
                push_key: b64([1u8; 32]),
                ..Default::default()
            },
            // The freshly re-paired record that now registers "deadbeef".
            Device { id: "new".into(), ..Default::default() },
            // A different physical device — must be left untouched.
            Device {
                id: "other".into(),
                apns_token: "cafe".into(),
                apns_env: "production".into(),
                push_key: b64([2u8; 32]),
                ..Default::default()
            },
        ];

        let key = b64([9u8; 32]);
        assert!(apply_apns_token(&mut devices, "new", "deadbeef", "sandbox", &key, (true, false, true)));

        let new = devices.iter().find(|d| d.id == "new").unwrap();
        assert_eq!(new.apns_token, "deadbeef");
        assert_eq!(new.apns_env, "sandbox");
        assert_eq!(new.push_key, key);
        assert_eq!((new.push_waiting, new.push_done, new.push_error), (true, false, true));

        // The stale record survives but loses its push identity, so it stops pushing.
        let old = devices.iter().find(|d| d.id == "old").unwrap();
        assert!(old.apns_token.is_empty());
        assert!(old.apns_env.is_empty());
        assert!(old.push_key.is_empty());

        // A device with a different token keeps everything.
        let other = devices.iter().find(|d| d.id == "other").unwrap();
        assert_eq!(other.apns_token, "cafe");
        assert_eq!(other.apns_env, "production");
        assert_eq!(other.push_key, b64([2u8; 32]));

        assert_eq!(devices.len(), 3);

        // An unknown device id reports not-paired and mutates nothing — not even
        // other records holding the same token.
        assert!(!apply_apns_token(&mut devices, "ghost", "deadbeef", "sandbox", &key, (true, true, true)));
        let new = devices.iter().find(|d| d.id == "new").unwrap();
        assert_eq!(new.apns_token, "deadbeef");
        assert_eq!((new.push_waiting, new.push_done, new.push_error), (true, false, true));
    }

    #[test]
    fn recipient_selection_honors_prefs_token_key_and_connection() {
        let b64 = |b: [u8; 32]| base64::engine::general_purpose::STANDARD.encode(b);
        let dev = |id: &str, token: &str, key: String, prefs: (bool, bool, bool)| Device {
            id: id.into(),
            apns_token: token.into(),
            apns_env: "production".into(),
            push_key: key,
            push_waiting: prefs.0,
            push_done: prefs.1,
            push_error: prefs.2,
            ..Default::default()
        };

        let devices = vec![
            // Opted in with a valid key: an alert recipient and a clear recipient.
            dev("opted", "aa", b64([1u8; 32]), (true, false, false)),
            // All prefs off: excluded from alerts, still a clear recipient.
            dev("muted", "bb", b64([2u8; 32]), (false, false, false)),
            // Connected: excluded from alerts, still a clear recipient.
            dev("connected", "cc", b64([3u8; 32]), (true, true, true)),
            // No token: excluded from both.
            dev("notoken", "", b64([4u8; 32]), (true, true, true)),
            // Wrong-length push key: excluded from both.
            dev(
                "badkey",
                "dd",
                base64::engine::general_purpose::STANDARD.encode([5u8; 16]),
                (true, true, true),
            ),
        ];

        let connected: HashSet<String> = ["connected".to_string()].into_iter().collect();

        let alert_ids: Vec<String> =
            alert_recipients(&devices, &connected).into_iter().map(|d| d.id).collect();
        assert_eq!(alert_ids, vec!["opted".to_string()]);

        let mut clear_ids: Vec<String> =
            clear_recipients(&devices).into_iter().map(|d| d.id).collect();
        clear_ids.sort();
        assert_eq!(
            clear_ids,
            vec!["connected".to_string(), "muted".to_string(), "opted".to_string()]
        );
    }

    #[test]
    fn config_roundtrips_through_json() {
        let cfg = RemoteConfig {
            enabled: true,
            lan: true,
            port: 9000,
            pairing_code: "AB12-CD34".into(),
            tailscale: true,
            push_relay: "http://localhost:3000/api/push".into(),
            devices: vec![Device {
                id: "d1".into(),
                name: "iPhone".into(),
                token_hash: sha256_hex(b"t"),
                created_at: 42,
                apns_token: "deadbeef".into(),
                apns_env: "sandbox".into(),
                push_key: base64::engine::general_purpose::STANDARD.encode([7u8; 32]),
                push_waiting: true,
                push_done: false,
                push_error: true,
            }],
        };
        let s = serde_json::to_string(&cfg).unwrap();
        let back: RemoteConfig = serde_json::from_str(&s).unwrap();
        assert_eq!(back.port, 9000);
        assert!(back.enabled && back.lan);
        assert_eq!(back.push_relay, "http://localhost:3000/api/push");
        assert_eq!(back.effective_relay(), "http://localhost:3000/api/push");
        assert_eq!(back.devices.len(), 1);
        assert_eq!(back.devices[0].id, "d1");
        assert_eq!(back.devices[0].apns_token, "deadbeef");
        assert_eq!(back.devices[0].apns_env, "sandbox");
        assert_eq!(
            back.devices[0].push_key,
            base64::engine::general_purpose::STANDARD.encode([7u8; 32])
        );
        assert!(back.devices[0].push_waiting);
        assert!(!back.devices[0].push_done);
        assert!(back.devices[0].push_error);
    }

    // Old remote.json (written before push support) has neither the device push
    // fields nor push_relay; #[serde(default)] must load it with empty defaults and
    // the effective relay must fall back to the built-in endpoint. The per-status
    // notification prefs are absent too and must default to enabled, not false.
    #[test]
    fn old_json_loads_with_default_push_fields() {
        let json = r#"{
            "enabled": true, "lan": false, "port": 0, "pairing_code": "",
            "tailscale": true,
            "devices": [{ "id": "d1", "name": "iPhone",
                          "token_hash": "abc", "created_at": 1 }]
        }"#;
        let cfg: RemoteConfig = serde_json::from_str(json).unwrap();
        assert!(cfg.push_relay.is_empty());
        assert_eq!(cfg.effective_relay(), DEFAULT_PUSH_RELAY);
        assert_eq!(cfg.devices.len(), 1);
        assert!(cfg.devices[0].apns_token.is_empty());
        assert!(cfg.devices[0].apns_env.is_empty());
        assert!(cfg.devices[0].push_key.is_empty());
        assert!(cfg.devices[0].push_waiting);
        assert!(cfg.devices[0].push_done);
        assert!(cfg.devices[0].push_error);
    }

    #[test]
    fn validate_apns_enforces_shape() {
        let key = base64::engine::general_purpose::STANDARD.encode([1u8; 32]);
        assert!(validate_apns("abc123", "production", &key).is_ok());
        assert!(validate_apns("ABCDEF", "sandbox", &key).is_ok());
        assert!(validate_apns("", "production", &key).is_err(), "empty token");
        assert!(validate_apns("xyz", "production", &key).is_err(), "non-hex token");
        assert!(validate_apns(&"a".repeat(201), "production", &key).is_err(), "over-long token");
        assert!(validate_apns("ab", "staging", &key).is_err(), "bad env");
        let short = base64::engine::general_purpose::STANDARD.encode([1u8; 16]);
        assert!(validate_apns("ab", "production", &short).is_err(), "16-byte key");
        assert!(validate_apns("ab", "production", "not base64!!").is_err(), "bad base64");
    }

    #[test]
    fn dedup_pushes_new_and_changed_only() {
        let mut seen = HashMap::new();
        let e = |k: &str, v: &str, ts: i64| (k.to_string(), v.to_string(), ts);

        // First sighting of both -> both push, nothing vanished yet.
        let (out, vanished) = dedup_status_pushes(&mut seen, "proj", &[e("a", "Waiting", 1), e("b", "Done", 1)]);
        assert_eq!(out.len(), 2);
        assert!(vanished.is_empty());

        // Identical re-report -> nothing.
        let (out, vanished) = dedup_status_pushes(&mut seen, "proj", &[e("a", "Waiting", 2), e("b", "Done", 2)]);
        assert!(out.is_empty(), "unchanged values dedup");
        assert!(vanished.is_empty());

        // a's value changed -> only a pushes.
        let (out, vanished) = dedup_status_pushes(&mut seen, "proj", &[e("a", "Error", 3), e("b", "Done", 3)]);
        assert_eq!(out, vec![e("a", "Error", 3)]);
        assert!(vanished.is_empty());

        // b vanished from the store -> reported once (for withdrawal), and its map
        // entry is dropped so if it reappears it counts as new again.
        let (out, vanished) = dedup_status_pushes(&mut seen, "proj", &[e("a", "Error", 4)]);
        assert!(out.is_empty());
        assert_eq!(vanished, vec!["b".to_string()], "b's vanish reported once");
        let (out, vanished) = dedup_status_pushes(&mut seen, "proj", &[e("a", "Error", 5), e("b", "Done", 5)]);
        assert_eq!(out, vec![e("b", "Done", 5)], "b re-notifies after vanishing");
        assert!(vanished.is_empty(), "b's vanish not re-reported on the next event");

        // A different project's key with the same name is independent.
        let (out, vanished) = dedup_status_pushes(&mut seen, "other", &[e("a", "Error", 6)]);
        assert_eq!(out, vec![e("a", "Error", 6)]);
        assert!(vanished.is_empty());
    }

    #[test]
    fn collapse_id_is_deterministic_hex_60() {
        let id = push_collapse_id("web-app", "pane-1");
        assert_eq!(id.len(), 60);
        assert!(id.chars().all(|c| c.is_ascii_hexdigit()));
        assert_eq!(id, push_collapse_id("web-app", "pane-1"), "deterministic");
        assert_ne!(id, push_collapse_id("web-app", "pane-2"), "key participates");
        assert_ne!(id, push_collapse_id("other", "pane-1"), "project participates");
    }

    #[test]
    fn seal_push_roundtrips() {
        let key = [9u8; 32];
        let plaintext = br#"{"project":"web","terminal":"Ultracode","status":"Waiting","ts":123}"#;
        let blob = seal_push(&key, plaintext).expect("seal");

        // Decrypt the combined SealedBox exactly as the phone's extension would.
        let raw = base64::engine::general_purpose::STANDARD.decode(&blob).unwrap();
        assert!(raw.len() > 12 + 16, "nonce + ciphertext + tag");
        let (nonce, sealed) = raw.split_at(12);
        let cipher = Aes256Gcm::new_from_slice(&key).unwrap();
        let opened = cipher.decrypt(Nonce::from_slice(nonce), sealed).expect("open");
        assert_eq!(opened, plaintext);

        // A fresh seal uses a fresh random nonce -> different ciphertext.
        let blob2 = seal_push(&key, plaintext).unwrap();
        assert_ne!(blob, blob2, "random nonce per seal");
    }

    #[test]
    fn push_device_wants_filters_by_prefs() {
        let dev = |w: bool, d: bool, e: bool| PushDevice {
            id: "d".into(),
            token: "t".into(),
            env: "sandbox".into(),
            key: [0u8; 32],
            push_waiting: w,
            push_done: d,
            push_error: e,
        };
        let jobs = [STATUS_WAITING, STATUS_DONE, STATUS_ERROR];

        // Only Done enabled -> only the Done job survives.
        let only_done = dev(false, true, false);
        let kept: Vec<_> = jobs.iter().filter(|s| only_done.wants(s)).collect();
        assert_eq!(kept, vec![&STATUS_DONE]);

        // All enabled -> all survive; an unknown status is never wanted.
        let all = dev(true, true, true);
        assert!(jobs.iter().all(|s| all.wants(s)));
        assert!(!all.wants("Running"));

        // All disabled -> nothing survives (such a device is dropped upstream).
        let none = dev(false, false, false);
        assert!(!jobs.iter().any(|s| none.wants(s)));
    }
}
