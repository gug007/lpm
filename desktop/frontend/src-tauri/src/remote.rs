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
use tauri::{AppHandle, Listener, Manager, State};
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

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(default)]
struct RemoteConfig {
    enabled: bool,
    lan: bool,  // bind 0.0.0.0 (reachable on LAN/tailnet) vs 127.0.0.1 (loopback only)
    port: u16,  // 0 => DEFAULT_PORT
    pairing_code: String, // non-empty while an unused pairing code is outstanding
    devices: Vec<Device>,
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
        Some(id) => id,
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
                        if handle_msg(&mut ws, &txt, &hub, &app, &subs).is_err() {
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
    let _ = ws.close(None);
    let _ = ws.flush();
}

// --- auth / pairing ----------------------------------------------------------

fn authenticate(ws: &mut WebSocket<TcpStream>, hub: &RemoteHub) -> Option<String> {
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
                    Some(id)
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
                Some(id.to_string())
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

fn handle_msg(
    ws: &mut WebSocket<TcpStream>,
    txt: &str,
    hub: &RemoteHub,
    app: &AppHandle,
    subs: &Arc<Mutex<HashSet<String>>>,
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
            send(ws, json!({ "t": "terminals", "project": project, "terminals": terms }))?;
        }
        "status" => {
            let project = str_field("project").unwrap_or_default();
            let list = app.state::<Arc<StatusStore>>().list(&project);
            send(ws, json!({ "t": "status", "project": project, "status": list }))?;
        }
        "sub" => {
            if let Some(id) = str_field("id") {
                subs.lock().unwrap().insert(id.clone());
                let (cols, rows) =
                    pty::remote_dims(&app.state::<pty::PtyState>(), &id).unwrap_or((80, 24));
                send(
                    ws,
                    json!({ "t": "seed", "id": id, "cols": cols, "rows": rows, "data": hub.ring_text(&id) }),
                )?;
            }
        }
        "unsub" => {
            if let Some(id) = str_field("id") {
                subs.lock().unwrap().remove(&id);
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
            if !id.is_empty() && cols > 0 && rows > 0 {
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
        "running": hub.inner.running.load(Ordering::Relaxed),
        "host": primary_lan_ip(),
        "hasPendingCode": !cfg.pairing_code.is_empty(),
        "devices": devices,
    })
}

// --- frontend commands (Settings → Mobile devices pane) ----------------------

#[tauri::command]
pub fn remote_state(hub: State<'_, RemoteHub>) -> Value {
    state_value(&hub)
}

#[tauri::command]
pub fn remote_set_config(
    app: AppHandle,
    hub: State<'_, RemoteHub>,
    enabled: bool,
    lan: bool,
    port: u16,
) -> Result<Value, String> {
    {
        let mut cfg = hub.inner.config.lock().unwrap();
        cfg.enabled = enabled;
        cfg.lan = lan;
        cfg.port = port;
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
    let (host, port) = {
        let mut cfg = hub.inner.config.lock().unwrap();
        cfg.pairing_code = code.clone();
        cfg.enabled = true;
        // The QR advertises this Mac's LAN IP, so the server must bind the LAN
        // interface (0.0.0.0) or the phone hits a loopback-only port and gets
        // connection-refused. Pairing a device inherently means network access;
        // the Settings toggle reflects this and can turn it back off afterward.
        cfg.lan = true;
        let host = primary_lan_ip().unwrap_or_else(|| "127.0.0.1".to_string());
        let port = effective_port(cfg.port);
        let snapshot = cfg.clone();
        drop(cfg);
        save_config(&snapshot)?;
        (host, port)
    };
    apply(&hub, &app); // ensure the listener is up so the phone can connect
    let url = format!("lpm://pair?h={host}&p={port}&c={code}");
    Ok(json!({
        "code": code,
        "url": url,
        "svg": pairing_qr_svg(&url),
        "host": host,
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
