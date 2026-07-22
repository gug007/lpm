// Mac-to-Mac peer host server.
//
// Pairs this Mac (the "host") with another lpm Mac (the "client"). The client's
// sidebar then shows this Mac's projects and drives them through the exact same
// ProjectDetail UI as a local project. All execution stays on this Mac; the
// client is a display/input front-end reached over the network.
//
// The design mirrors remote.rs (the mobile server): a fire-and-forget
// std::thread server, one blocking WebSocket per connection, a generation
// lifecycle, per-connection out-queue, and a bounded per-terminal output ring so
// a subscribing client is seeded without a main-window round-trip.
//
// It differs in two ways. First, dispatch is generic: only terminal I/O takes a
// Rust fast path; every other command is run by re-emitting it into the host's
// own main-window webview (`peer-invoke`) and correlating the reply
// (`peer_dispatch_reply`). That is what lets any of lpm's ~220 commands work over
// the wire without per-command server code. Second, config lives in
// ~/.lpm/peer.json (0600) and holds BOTH roles — the host device list here and
// the client peer list used by peerclient.rs — behind one shared in-memory lock.
//
// Security posture (v1) matches mobile: a per-device bearer token established by a
// single-use pairing code, only sha256(token) stored, plaintext WebSocket bound
// to loopback by default (LAN/tailnet is an explicit opt-in).
use crate::{config, pty};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet, VecDeque};
use std::io::{self, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, SyncSender, TryRecvError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Listener, Manager, State};
use tungstenite::handshake::server::{ErrorResponse, Request, Response};
use tungstenite::{accept_hdr, Error as WsError, Message, WebSocket};

const DEFAULT_PORT: u16 = 8766; // mobile owns 8765
const RING_CAP: usize = 96 * 1024; // recent scrollback seeded to a joining peer
const POLL: Duration = Duration::from_millis(25); // read-timeout / outbound-drain cadence
const AUTH_TIMEOUT: Duration = Duration::from_secs(20);
const OUT_QUEUE: usize = 1024; // per-client outbound depth; overflow drops (client re-seeds)
const DISPATCH_TIMEOUT: Duration = Duration::from_secs(30); // webview-dispatch reply deadline

/// Global events forwarded verbatim to every authed peer as `{t:"evt", …}`. The
/// client re-emits each locally (with identifier translation) so the mirrored
/// ProjectDetail refreshes exactly as it would on the host.
const FORWARDED_EVENTS: &[&str] = &[
    "projects-changed",
    "status-changed",
    "git-changed",
    "ports-changed",
    "action-output",
    "action-done",
    "action-bg-output",
    "templates-changed",
    "clone-done",
    "duplicate-done",
];

// --- persisted config (~/.lpm/peer.json, shared with peerclient.rs) -----------

fn default_true() -> bool {
    true
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(default, rename_all = "camelCase")]
pub(crate) struct PeerDevice {
    pub id: String,
    pub name: String,
    pub token_sha256: String, // sha256(token) hex — the raw token lives only on the client
    pub slug_assigned: String,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(default, rename_all = "camelCase")]
pub(crate) struct HostConfig {
    pub enabled: bool,
    pub lan: bool,            // bind 0.0.0.0 (LAN/tailnet) vs 127.0.0.1; no UI — the app always sets true, loopback-only is a manual-config escape hatch
    pub port: u16,            // 0 => DEFAULT_PORT
    pub pairing_code: String, // non-empty while an unused pairing code is outstanding
    pub host_id: String,      // this Mac's stable peer identity, advertised over mDNS; minted on first load
    pub devices: Vec<PeerDevice>,
}

impl Default for HostConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            lan: false,
            port: 0,
            pairing_code: String::new(),
            host_id: String::new(),
            devices: Vec::new(),
        }
    }
}

/// A remote Mac this Mac connects to (client role). Owned by peerclient.rs but
/// persisted here so both roles share one file. The raw `token` lives on the
/// client; the host only ever stores its hash.
#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(default, rename_all = "camelCase")]
pub(crate) struct PeerEntry {
    pub slug: String,
    pub alias: String,
    pub host: String,
    pub port: u16,
    pub device_id: String,
    pub token: String,
    #[serde(default)]
    pub host_id: String, // the remote Mac's stable peer identity, so discovery can hide an already-paired Mac
    #[serde(default)]
    pub tls_fp: Option<String>, // pinned host leaf fingerprint (hex sha256 of cert DER); None until the first authed TLS connect pins it
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub last_sync_at: i64, // millis of the last successful config sync, 0 = never
    #[serde(default)]
    pub auto_sync: bool, // keep config in sync automatically (Phase 4); old peer.json loads as false
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(default)]
pub(crate) struct PeerConfig {
    pub host: HostConfig,
    pub peers: Vec<PeerEntry>,
}

pub(crate) type SharedConfig = Arc<Mutex<PeerConfig>>;

pub(crate) fn effective_port(p: u16) -> u16 {
    if p == 0 {
        DEFAULT_PORT
    } else {
        p
    }
}

#[cfg(test)]
static TEST_CONFIG_PATH: Mutex<Option<std::path::PathBuf>> = Mutex::new(None);

// Serializes tests that share the single TEST_CONFIG_PATH slot (cargo runs tests
// in parallel; save_config writes go to whichever path is currently installed).
#[cfg(test)]
static TEST_CFG_GUARD: Mutex<()> = Mutex::new(());

fn config_path() -> std::path::PathBuf {
    #[cfg(test)]
    if let Some(p) = TEST_CONFIG_PATH.lock().unwrap().clone() {
        return p;
    }
    config::lpm_dir().join("peer.json")
}

pub(crate) fn load_config() -> PeerConfig {
    match std::fs::read(config_path()) {
        Ok(b) => serde_json::from_slice(&b).unwrap_or_default(),
        Err(_) => PeerConfig::default(),
    }
}

pub(crate) fn save_config(cfg: &PeerConfig) -> Result<(), String> {
    std::fs::create_dir_all(config::lpm_dir()).map_err(|e| e.to_string())?;
    let data = serde_json::to_vec_pretty(cfg).map_err(|e| e.to_string())?;
    // peer.json holds raw device tokens — Exact(0o600) so the temp never exists
    // at a wider mode and the file stays 0600 even on first creation.
    crate::fsatomic::write(&config_path(), &data, crate::fsatomic::Mode::Exact(0o600))
        .map_err(|e| e.to_string())
}

// --- shared state -------------------------------------------------------------

struct Conn {
    tx: SyncSender<String>,
    subs: Arc<Mutex<HashSet<String>>>,
    device_id: String,
}

/// A command routed to the host webview, awaiting `peer_dispatch_reply`. Holds the
/// originating connection's out-queue and the client's own reqId so the reply is
/// delivered back to the right client under the id it used.
struct PendingDispatch {
    out: SyncSender<String>,
    client_req: Value,
    deadline: Instant,
}

/// The user's decision on a pending tap-to-approve pairing request.
struct PairDecision {
    accept: bool,
    reciprocal: bool,
}

/// An outstanding tap-to-approve pairing request (a Mac that discovered this one
/// on the LAN and asked to pair without an invite). The connection thread owns the
/// receiving half of `decision`; `peer_host_respond_pairing` sends the user's
/// Accept/Deny + reciprocal choice through it, matched by `id`.
struct PendingPair {
    id: String,
    name: String,
    sas: String, // 6-digit short-authentication string shown on both Macs
    decision: SyncSender<PairDecision>,
}

struct HostInner {
    config: SharedConfig,
    clients: Mutex<HashMap<u64, Conn>>,
    rings: Mutex<HashMap<String, VecDeque<u8>>>,
    pending: Mutex<HashMap<u64, PendingDispatch>>,
    pair_requests: Mutex<Vec<PendingPair>>,
    next_id: AtomicU64,
    next_dispatch: AtomicU64,
    generation: AtomicU64,
    enabled: AtomicBool, // mirror of config.host.enabled, checked on the pty tee hot path
    running: AtomicBool, // a listener is currently bound
}

#[derive(Clone)]
pub struct PeerHub {
    inner: Arc<HostInner>,
}

impl Default for PeerHub {
    fn default() -> Self {
        Self::new(Arc::new(Mutex::new(PeerConfig::default())))
    }
}

impl PeerHub {
    pub fn new(config: SharedConfig) -> Self {
        PeerHub {
            inner: Arc::new(HostInner {
                config,
                clients: Mutex::new(HashMap::new()),
                rings: Mutex::new(HashMap::new()),
                pending: Mutex::new(HashMap::new()),
                pair_requests: Mutex::new(Vec::new()),
                next_id: AtomicU64::new(0),
                next_dispatch: AtomicU64::new(0),
                generation: AtomicU64::new(0),
                enabled: AtomicBool::new(false),
                running: AtomicBool::new(false),
            }),
        }
    }

    /// The shared config lock, so peerclient.rs mutates the same in-memory copy.
    pub fn config_arc(&self) -> SharedConfig {
        self.inner.config.clone()
    }

    fn host_config(&self) -> HostConfig {
        self.inner.config.lock().unwrap().host.clone()
    }

    pub(crate) fn host_id(&self) -> String {
        self.inner.config.lock().unwrap().host.host_id.clone()
    }

    /// Register a new tap-to-approve pairing request, returning its id, the
    /// human-verified SAS, and the receiver the connection thread parks on.
    fn begin_pair_request(&self, name: &str) -> (String, String, mpsc::Receiver<PairDecision>) {
        let id = uuid::Uuid::new_v4().to_string();
        let sas = gen_sas();
        let (tx, rx) = mpsc::sync_channel::<PairDecision>(1);
        self.inner.pair_requests.lock().unwrap().push(PendingPair {
            id: id.clone(),
            name: name.chars().take(64).collect(),
            sas: sas.clone(),
            decision: tx,
        });
        (id, sas, rx)
    }

    /// Deliver the user's decision to the waiting connection thread and clear the
    /// pending slot. No-op if the request already resolved (timeout / hang-up).
    fn resolve_pair_request(&self, id: &str, accept: bool, reciprocal: bool) {
        let mut reqs = self.inner.pair_requests.lock().unwrap();
        if let Some(pos) = reqs.iter().position(|p| p.id == id) {
            let p = reqs.remove(pos);
            let _ = p.decision.try_send(PairDecision { accept, reciprocal });
        }
    }

    /// Drop a pending request (idempotent teardown for the timeout / requester-
    /// disconnect endings).
    fn remove_pair_request(&self, id: &str) {
        self.inner.pair_requests.lock().unwrap().retain(|p| p.id != id);
    }

    fn device_exists(&self, id: &str) -> bool {
        self.inner
            .config
            .lock()
            .unwrap()
            .host
            .devices
            .iter()
            .any(|d| d.id == id)
    }

    fn device_name(&self, id: &str) -> String {
        self.inner
            .config
            .lock()
            .unwrap()
            .host
            .devices
            .iter()
            .find(|d| d.id == id)
            .map(|d| d.name.clone())
            .filter(|n| !n.is_empty())
            .unwrap_or_else(|| "Mac".to_string())
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

// --- output tee (called from pty::flush / exit, alongside the mobile tee) -----

/// Append a PTY output chunk to the peer ring and fan it out to subscribed peers.
/// A no-op when the host server is disabled. Never blocks the reader.
pub fn tee_output(app: &AppHandle, id: &str, _project: &str, text: &str) {
    let Some(hub) = app.try_state::<PeerHub>() else {
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

/// Tell subscribed peers a terminal exited and free its ring.
pub fn tee_exit(app: &AppHandle, id: &str, code: i32) {
    let Some(hub) = app.try_state::<PeerHub>() else {
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

fn broadcast(hub: &PeerHub, val: Value) {
    let payload = val.to_string();
    let clients = hub.inner.clients.lock().unwrap();
    for c in clients.values() {
        let _ = c.tx.try_send(payload.clone());
    }
}

/// The control surface a peer connection presents on the host, so host windows
/// show the "Take control" placeholder while the peer drives. A distinct owner
/// kind ("peer") that never collides with "window"/"mobile".
fn peer_owner(hub: &PeerHub, device_id: &str) -> crate::control::Owner {
    crate::control::Owner::new("peer", device_id, hub.device_name(device_id))
}

// --- lifecycle ----------------------------------------------------------------

/// Install event forwarders and start the server if enabled. The shared config is
/// loaded once by lib.rs before both hubs start.
pub fn start(hub: PeerHub, app: AppHandle) {
    ensure_host_id(&hub);
    install_forwarders(&hub, &app);
    spawn_dispatch_reaper(hub.clone());
    apply(&hub, &app);
}

/// Mint and persist this Mac's stable peer identity on first run (empty on an old
/// peer.json). Lazy: only writes when it actually assigns one.
fn ensure_host_id(hub: &PeerHub) {
    let mut cfg = hub.inner.config.lock().unwrap();
    if cfg.host.host_id.is_empty() {
        cfg.host.host_id = uuid::Uuid::new_v4().to_string();
        let snapshot = cfg.clone();
        drop(cfg);
        let _ = save_config(&snapshot);
    }
}

/// (Re)start or stop the listener to match the current config. Bumping the
/// generation retires any previous accept loop and connection threads.
pub fn apply(hub: &PeerHub, app: &AppHandle) {
    let generation = hub.inner.generation.fetch_add(1, Ordering::SeqCst) + 1;
    let cfg = hub.host_config();
    hub.inner.enabled.store(cfg.enabled, Ordering::Relaxed);
    if !cfg.enabled {
        hub.inner.running.store(false, Ordering::Relaxed);
        crate::mdns::withdraw_peer();
        return;
    }
    let bind = if cfg.lan { "0.0.0.0" } else { "127.0.0.1" };
    let port = effective_port(cfg.port);
    let addr = format!("{bind}:{port}");
    let advertise = cfg.lan;
    let host_id = cfg.host_id.clone();
    let (hub, app) = (hub.clone(), app.clone());
    std::thread::spawn(move || {
        let mut bound = None;
        for _ in 0..25 {
            if hub.inner.generation.load(Ordering::SeqCst) != generation {
                return;
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
            eprintln!("warning: peer host server could not bind {addr}");
            hub.inner.running.store(false, Ordering::Relaxed);
            crate::mdns::withdraw_peer();
            let _ = app.emit("peer-state-changed", ());
            return;
        };
        // A newer apply() may have superseded us between binding and here; it has
        // already run its own advertise/withdraw, so re-advertising now would point
        // a Bonjour record at a listener the accept loop abandons on its first
        // generation check. Bail without touching mDNS.
        if hub.inner.generation.load(Ordering::SeqCst) != generation {
            return;
        }
        let _ = listener.set_nonblocking(true);
        hub.inner.running.store(true, Ordering::Relaxed);
        let _ = app.emit("peer-state-changed", ());
        if advertise {
            crate::mdns::advertise_peer(crate::mdns::AdParams {
                server_id: host_id,
                server_name: machine_name(),
                port,
                dev: cfg!(debug_assertions),
            });
        } else {
            crate::mdns::withdraw_peer();
        }
        accept_loop(listener, hub, app, generation);
    });
}

/// Signal a clean shutdown (app exit). Retires threads and drops clients.
pub fn stop(hub: &PeerHub) {
    hub.inner.generation.fetch_add(1, Ordering::SeqCst);
    hub.inner.enabled.store(false, Ordering::Relaxed);
    hub.inner.running.store(false, Ordering::Relaxed);
    hub.inner.clients.lock().unwrap().clear();
    crate::mdns::withdraw_peer();
}

fn accept_loop(listener: TcpListener, hub: PeerHub, app: AppHandle, generation: u64) {
    loop {
        if hub.inner.generation.load(Ordering::SeqCst) != generation {
            return;
        }
        match listener.accept() {
            Ok((stream, _)) => {
                // The listener is non-blocking so accept() can poll the
                // generation; on macOS the accepted socket inherits O_NONBLOCK,
                // which makes set_read_timeout a no-op. Force it back to blocking.
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

/// One peer connection's transport. The listener accepts both this build's
/// TLS-wrapped clients and, transitionally, the plaintext clients of pre-Phase-3
/// builds — picked per connection by peeking the first byte. Everything above the
/// stream (WebSocket handshake, Origin refusal, auth, frames) is identical on
/// both; a single concrete type keeps `WebSocket<T>` monomorphic per conn thread.
enum PeerStream {
    Plain(TcpStream),
    Tls(Box<rustls::StreamOwned<rustls::ServerConnection, TcpStream>>),
}

impl PeerStream {
    /// The underlying TCP socket — for read-timeout tuning on either variant.
    fn tcp(&self) -> &TcpStream {
        match self {
            PeerStream::Plain(s) => s,
            PeerStream::Tls(t) => t.get_ref(),
        }
    }
}

impl Read for PeerStream {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        match self {
            PeerStream::Plain(s) => s.read(buf),
            PeerStream::Tls(t) => t.read(buf),
        }
    }
}

impl Write for PeerStream {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        match self {
            PeerStream::Plain(s) => s.write(buf),
            PeerStream::Tls(t) => t.write(buf),
        }
    }
    fn flush(&mut self) -> io::Result<()> {
        match self {
            PeerStream::Plain(s) => s.flush(),
            PeerStream::Tls(t) => t.flush(),
        }
    }
}

type ConnWs = WebSocket<PeerStream>;

fn accept_ws(stream: TcpStream) -> Option<ConnWs> {
    let _ = stream.set_nodelay(true);
    let _ = stream.set_read_timeout(Some(AUTH_TIMEOUT));
    // Peek one byte to choose the transport: 0x16 is a TLS ClientHello (this
    // build); anything else is a legacy plaintext WebSocket upgrade (`GET …`). The
    // byte stays buffered in the socket for the handshake that follows. This is the
    // transitional acceptor — a future build can drop the plaintext branch.
    let mut first = [0u8; 1];
    let inner = match stream.peek(&mut first) {
        Ok(0) | Err(_) => return None,
        Ok(_) if crate::peertls::sniff_is_tls(first[0]) => {
            let conn = rustls::ServerConnection::new(crate::remotetls::server_config()).ok()?;
            PeerStream::Tls(Box::new(rustls::StreamOwned::new(conn, stream)))
        }
        Ok(_) => PeerStream::Plain(stream),
    };
    // Refuse any handshake that carries an Origin header. The native peer client
    // never sends one; a browser always does — so this rejects DNS-rebinding /
    // drive-by JavaScript trying to reach the pairing endpoint on a LAN-bound
    // socket, without affecting the real client.
    accept_hdr(inner, |req: &Request, resp: Response| {
        if req.headers().contains_key("origin") {
            let mut deny = ErrorResponse::new(Some("origin not allowed".to_string()));
            *deny.status_mut() = tungstenite::http::StatusCode::FORBIDDEN;
            return Err(deny);
        }
        Ok(resp)
    })
    .ok()
}

fn handle_conn(stream: TcpStream, hub: PeerHub, app: AppHandle, generation: u64) {
    let Some(mut ws) = accept_ws(stream) else {
        return;
    };
    let device_id = match authenticate(&mut ws, &hub, &app) {
        Some(id) => id,
        None => {
            let _ = ws.close(None);
            let _ = ws.flush();
            return;
        }
    };

    let (tx, rx) = mpsc::sync_channel::<String>(OUT_QUEUE);
    let out = tx.clone();
    let subs = Arc::new(Mutex::new(HashSet::new()));
    let conn_id = hub.inner.next_id.fetch_add(1, Ordering::SeqCst) + 1;
    hub.inner.clients.lock().unwrap().insert(
        conn_id,
        Conn {
            tx,
            subs: subs.clone(),
            device_id: device_id.clone(),
        },
    );
    let _ = ws.get_ref().tcp().set_read_timeout(Some(POLL));

    'main: loop {
        if hub.inner.generation.load(Ordering::SeqCst) != generation
            || !hub.device_exists(&device_id)
        {
            break;
        }
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
        match ws.read() {
            Ok(msg) => {
                if msg.is_close() {
                    break;
                }
                if msg.is_text() {
                    if let Ok(txt) = msg.to_text() {
                        let txt = txt.to_string();
                        if handle_msg(&mut ws, &txt, &hub, &app, &subs, &device_id, &out).is_err() {
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
    // Release any terminal control this peer held so ownership transfers back to a
    // host window (or another presenter) instead of stranding on a gone client.
    let owner = peer_owner(&hub, &device_id);
    for (id, new_owner) in app
        .state::<crate::control::ControlState>()
        .drop_surface(&owner)
    {
        crate::control::broadcast(&app, &id, &new_owner);
    }
    let _ = ws.close(None);
    let _ = ws.flush();
}

// --- auth / pairing -----------------------------------------------------------

fn authenticate(ws: &mut ConnWs, hub: &PeerHub, app: &AppHandle) -> Option<String> {
    let txt = loop {
        match ws.read() {
            Ok(m) if m.is_text() => break m.to_text().ok()?.to_string(),
            Ok(m) if m.is_close() => return None,
            Ok(_) => continue,
            Err(_) => return None,
        }
    };
    let v: Value = serde_json::from_str(&txt).ok()?;
    match v.get("t").and_then(Value::as_str) {
        Some("pair") => {
            let code = v.get("code").and_then(Value::as_str).unwrap_or_default();
            let name = v.get("name").and_then(Value::as_str).unwrap_or("Mac");
            match pair_device(hub, code, name) {
                Some((id, token, slug)) => {
                    let _ = ws.send(Message::text(
                        json!({ "t": "paired", "deviceId": id, "token": token,
                            "slug": slug, "hostName": machine_name(), "hostId": hub.host_id() })
                        .to_string(),
                    ));
                    let _ = app.emit("peer-state-changed", ());
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
        Some("pairRequest") => {
            let name = v.get("name").and_then(Value::as_str).unwrap_or("Mac");
            handle_pair_request(ws, hub, app, name)
        }
        Some("auth") => {
            let id = v
                .get("deviceId")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let token = v.get("token").and_then(Value::as_str).unwrap_or_default();
            if check_device(hub, id, token) {
                let _ = ws.send(Message::text(
                    json!({ "t": "ready", "hostName": machine_name(),
                        "features": [crate::peersync::SYNC_FEATURE, crate::peersync::SYNC_FEATURE2] })
                    .to_string(),
                ));
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
    s.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>()
        .to_uppercase()
}

/// Mint and persist a new device (token, slug) for `name`, returning
/// (id, token, slug). Shared by both pairing paths; unlike `pair_device` it never
/// touches `pairing_code` — a tap-to-approve pairing has no code to consume.
fn mint_device(hub: &PeerHub, name: &str) -> (String, String, String) {
    let mut cfg = hub.inner.config.lock().unwrap();
    let token = gen_token();
    let slug = gen_slug(&cfg.host.devices);
    let device = PeerDevice {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.chars().take(64).collect(),
        token_sha256: sha256_hex(token.as_bytes()),
        slug_assigned: slug.clone(),
        created_at: crate::status::now_millis(),
    };
    let id = device.id.clone();
    cfg.host.devices.push(device);
    let snapshot = cfg.clone();
    drop(cfg);
    let _ = save_config(&snapshot);
    (id, token, slug)
}

fn pair_device(hub: &PeerHub, code: &str, name: &str) -> Option<(String, String, String)> {
    {
        let mut cfg = hub.inner.config.lock().unwrap();
        let expected = normalize_code(&cfg.host.pairing_code);
        if expected.is_empty() || !ct_eq(expected.as_bytes(), normalize_code(code).as_bytes()) {
            return None;
        }
        cfg.host.pairing_code.clear(); // single use — the next device needs a fresh code
        let snapshot = cfg.clone();
        drop(cfg);
        let _ = save_config(&snapshot);
    }
    Some(mint_device(hub, name))
}

const PAIR_APPROVE_WINDOW: Duration = Duration::from_secs(120);
const RECIPROCAL_WINDOW: Duration = Duration::from_secs(30);

/// Drive a tap-to-approve pairing request: emit it to the UI, park on the user's
/// decision (staying responsive so a cancelled requester is noticed), and on
/// approval mint the device and reply `paired`. Returns the device id on success
/// so the connection promotes to an authed session, else None.
fn handle_pair_request(
    ws: &mut ConnWs,
    hub: &PeerHub,
    app: &AppHandle,
    name: &str,
) -> Option<String> {
    let (id, sas, rx) = hub.begin_pair_request(name);
    let _ = ws.send(Message::text(
        json!({ "t": "pairPending", "sas": sas }).to_string(),
    ));
    let _ = app.emit("peer-state-changed", ());
    let _ = app.emit(
        "peer-pair-request",
        json!({ "id": id, "name": name, "sas": sas }),
    );
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }

    // Poll the decision channel and the socket together: a short read timeout lets
    // us notice the requester hanging up (so the pending entry is cleaned up)
    // without missing the user's Accept/Deny.
    let _ = ws
        .get_ref()
        .tcp()
        .set_read_timeout(Some(Duration::from_millis(250)));
    let deadline = Instant::now() + PAIR_APPROVE_WINDOW;
    let decision = loop {
        match rx.try_recv() {
            Ok(d) => break Some(d),
            Err(TryRecvError::Disconnected) => break None,
            Err(TryRecvError::Empty) => {}
        }
        if Instant::now() >= deadline {
            break None;
        }
        match ws.read() {
            Ok(m) if m.is_close() => {
                hub.remove_pair_request(&id);
                let _ = app.emit("peer-state-changed", ());
                return None;
            }
            Ok(_) => {}
            Err(WsError::Io(ref e))
                if e.kind() == std::io::ErrorKind::WouldBlock
                    || e.kind() == std::io::ErrorKind::TimedOut => {}
            Err(_) => {
                hub.remove_pair_request(&id);
                let _ = app.emit("peer-state-changed", ());
                return None;
            }
        }
    };
    hub.remove_pair_request(&id);
    let _ = app.emit("peer-state-changed", ());

    match decision {
        Some(d) if d.accept => {
            let (dev_id, token, slug) = mint_device(hub, name);
            let _ = ws.send(Message::text(
                json!({ "t": "paired", "deviceId": dev_id, "token": token, "slug": slug,
                    "hostName": machine_name(), "hostId": hub.host_id(), "reciprocal": d.reciprocal })
                .to_string(),
            ));
            if d.reciprocal {
                wait_reciprocal(ws, app);
            }
            Some(dev_id)
        }
        Some(_) => {
            let _ = ws.send(Message::text(
                json!({ "t": "error", "error": "pairing declined" }).to_string(),
            ));
            None
        }
        None => {
            let _ = ws.send(Message::text(
                json!({ "t": "error", "error": "pairing request timed out" }).to_string(),
            ));
            None
        }
    }
}

/// After approving with the reciprocal option, wait briefly for the requester's
/// `reciprocalInvite` and dial it back so this Mac can also control the requester.
/// The reverse dial is handed to a background thread so the WS handshake never
/// blocks on it (and retries a few times while the requester's host finishes
/// binding).
fn wait_reciprocal(ws: &mut ConnWs, app: &AppHandle) {
    let deadline = Instant::now() + RECIPROCAL_WINDOW;
    loop {
        if Instant::now() >= deadline {
            return;
        }
        match ws.read() {
            Ok(m) if m.is_close() => return,
            Ok(m) if m.is_text() => {
                let Ok(txt) = m.to_text() else { continue };
                let Ok(v) = serde_json::from_str::<Value>(txt) else {
                    continue;
                };
                if v.get("t").and_then(Value::as_str) != Some("reciprocalInvite") {
                    continue;
                }
                let code = v
                    .get("code")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                let port = v.get("port").and_then(Value::as_u64).unwrap_or(0) as u16;
                let hosts: Vec<String> = v
                    .get("hosts")
                    .and_then(Value::as_array)
                    .map(|a| {
                        a.iter()
                            .filter_map(|x| x.as_str().map(str::to_string))
                            .collect()
                    })
                    .unwrap_or_default();
                if !code.is_empty() && !hosts.is_empty() {
                    let app = app.clone();
                    std::thread::spawn(move || {
                        let hub = app.state::<crate::peerclient::PeerClientHub>();
                        for attempt in 0..6 {
                            match crate::peerclient::add_peer_blocking(
                                hub.inner(),
                                hosts.clone(),
                                port,
                                code.clone(),
                                String::new(),
                                None, // reciprocal reverse-dial carries no invite fingerprint; pins on first authed session
                            ) {
                                Ok(_) => return,
                                Err(_) if attempt < 5 => {
                                    std::thread::sleep(Duration::from_millis(400))
                                }
                                Err(_) => return,
                            }
                        }
                    });
                }
                return;
            }
            Ok(_) => {}
            Err(WsError::Io(ref e))
                if e.kind() == std::io::ErrorKind::WouldBlock
                    || e.kind() == std::io::ErrorKind::TimedOut => {}
            Err(_) => return,
        }
    }
}

fn check_device(hub: &PeerHub, id: &str, token: &str) -> bool {
    if id.is_empty() || token.is_empty() {
        return false;
    }
    let want = sha256_hex(token.as_bytes());
    hub.inner
        .config
        .lock()
        .unwrap()
        .host
        .devices
        .iter()
        .any(|d| d.id == id && ct_eq(d.token_sha256.as_bytes(), want.as_bytes()))
}

// --- request dispatch ---------------------------------------------------------

fn send(ws: &mut ConnWs, val: Value) -> Result<(), ()> {
    ws.send(Message::text(val.to_string())).map_err(|_| ())
}

fn handle_msg(
    ws: &mut ConnWs,
    txt: &str,
    hub: &PeerHub,
    app: &AppHandle,
    subs: &Arc<Mutex<HashSet<String>>>,
    device_id: &str,
    out: &SyncSender<String>,
) -> Result<(), ()> {
    let v: Value = match serde_json::from_str(txt) {
        Ok(v) => v,
        Err(_) => return Ok(()),
    };
    let t = v.get("t").and_then(Value::as_str).unwrap_or_default();
    let str_field = |k: &str| v.get(k).and_then(Value::as_str).map(str::to_string);

    match t {
        "ping" => send(ws, json!({ "t": "pong" }))?,
        "pong" => {}
        "sub" => {
            if let Some(id) = str_field("id") {
                subs.lock().unwrap().insert(id.clone());
                // Opening a terminal on the peer takes control of it, so host
                // windows flip to their placeholder. `claim` mirrors mobile.
                let (owner, changed) = app
                    .state::<crate::control::ControlState>()
                    .claim(&id, peer_owner(hub, device_id));
                if changed {
                    crate::control::broadcast(app, &id, &Some(owner));
                }
                send(
                    ws,
                    json!({ "t": "seed", "id": id, "d": hub.ring_text(&id) }),
                )?;
            }
        }
        "unsub" => {
            if let Some(id) = str_field("id") {
                subs.lock().unwrap().remove(&id);
                let (owner, changed) = app
                    .state::<crate::control::ControlState>()
                    .unpresent(&id, &peer_owner(hub, device_id));
                if changed {
                    crate::control::broadcast(app, &id, &owner);
                }
            }
        }
        "invoke" => {
            let req_id = v.get("reqId").cloned().unwrap_or(Value::Null);
            let cmd = str_field("cmd").unwrap_or_default();
            let args = v.get("args").cloned().unwrap_or_else(|| json!({}));
            dispatch_invoke(hub, app, out, req_id, &cmd, args);
        }
        // Config sync — dedicated frames that never touch the generic invoke
        // proxy (nor its denylist). The client only sends these after seeing the
        // configSync feature in `ready`, so an older host simply ignores them.
        "syncDigest" | "syncFetch" | "syncApply" => handle_sync(app, out, t, &v),
        _ => {}
    }
    Ok(())
}

/// Answer one config-sync request from a client. Digest/fetch are read-only;
/// apply snapshots ~/.lpm first, then applies with the shared portable-merge
/// rules and refreshes the host UI. A `v:2` request speaks configSync2 and carries
/// the client's sidecar device id; a legacy (`v:1`) request gets the pre-Phase-2
/// map (no revisions, no tombstones) and applies without touching the sidecar.
fn handle_sync(app: &AppHandle, out: &SyncSender<String>, t: &str, v: &Value) {
    let req_id = v.get("reqId").cloned().unwrap_or(Value::Null);
    let v2 = v.get("v").and_then(Value::as_u64).unwrap_or(1) >= 2;
    match t {
        "syncDigest" => {
            let dm = crate::peersync::local_digest_map();
            let dm = if v2 { dm } else { crate::peersync::legacy_view(dm) };
            let value = serde_json::to_value(dm).unwrap_or(Value::Null);
            let _ = out.try_send(result_frame(&req_id, true, value));
        }
        "syncFetch" => {
            let mut fetched = Vec::new();
            for it in v
                .get("items")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
            {
                let kind = it.get("kind").and_then(Value::as_str).unwrap_or_default();
                let name = it.get("name").and_then(Value::as_str).unwrap_or_default();
                if let Ok(w) = crate::peersync::read_item(kind, name) {
                    if let Ok(val) = serde_json::to_value(w) {
                        fetched.push(val);
                    }
                }
            }
            let _ = out.try_send(result_frame(&req_id, true, json!({ "items": fetched })));
        }
        "syncApply" => {
            let sender = v
                .get("device")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let record = v2 && !sender.is_empty();
            let items: Vec<crate::peersync::WireItem> =
                serde_json::from_value(v.get("items").cloned().unwrap_or_else(|| json!([])))
                    .unwrap_or_default();
            let mut applied = 0u64;
            let mut errors: Vec<String> = Vec::new();
            match crate::transfer::snapshot_backup() {
                Ok(_) => {
                    // Sidecar entries to write after the files land (revisions of the
                    // received units, keyed under the sending Mac's device id).
                    let snap = crate::syncstate::snapshot();
                    let self_id = snap.device.clone();
                    let mut item_updates: Vec<(String, crate::syncstate::ItemState)> = Vec::new();
                    let mut base_updates: Vec<(String, crate::syncstate::BaseState)> = Vec::new();
                    for it in &items {
                        let key = crate::peersync::item_key(&it.kind, &it.name);
                        match crate::peersync::apply_item(it) {
                            Ok(ap) => {
                                applied += 1;
                                if record {
                                    let local_rev =
                                        snap.items.get(&key).map(|i| i.rev).unwrap_or(0);
                                    let (istate, base) = crate::syncstate::received_state(
                                        &ap.incoming,
                                        it.rev,
                                        &it.device,
                                        ap.deleted,
                                        &ap.stored,
                                        local_rev,
                                        &self_id,
                                    );
                                    item_updates.push((key.clone(), istate));
                                    base_updates.push((key, base));
                                }
                            }
                            Err(e) => errors.push(format!("{}/{}: {e}", it.kind, it.name)),
                        }
                    }
                    if record && !(item_updates.is_empty() && base_updates.is_empty()) {
                        crate::syncstate::mutate(|s| {
                            for (k, istate) in &item_updates {
                                s.set_item(k, istate.clone());
                            }
                            for (k, base) in &base_updates {
                                s.set_base(&sender, k, base.clone());
                            }
                            (true, ())
                        });
                    }
                    let _ = app.emit("projects-changed", ());
                    let _ = app.emit("templates-changed", ());
                }
                Err(e) => errors.push(format!("backup failed: {e}")),
            }
            let _ = out.try_send(result_frame(
                &req_id,
                true,
                json!({ "applied": applied, "errors": errors }),
            ));
        }
        _ => {}
    }
}

fn result_frame(req_id: &Value, ok: bool, value: Value) -> String {
    json!({ "t": "result", "reqId": req_id, "ok": ok, "value": value }).to_string()
}

/// Route one client `invoke`. Terminal I/O takes the Rust fast path; a denied
/// command replies with an error; everything else is re-emitted into the host's
/// own main-window webview and answered by `peer_dispatch_reply`.
fn dispatch_invoke(
    hub: &PeerHub,
    app: &AppHandle,
    out: &SyncSender<String>,
    req_id: Value,
    cmd: &str,
    args: Value,
) {
    // A clipboard-image upload carries a multi-MB base64 blob. Run it directly in
    // Rust on a worker thread (the temp-write + a possible scp for an ssh-backed
    // host pane can block) and reply async via the out-queue, instead of
    // round-tripping the whole payload through the host webview. Args arrive with
    // the frontend's camelCase keys on this direct path.
    if cmd == "upload_clipboard_image_for_terminal" {
        let s = |k: &str| {
            args.get(k)
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string()
        };
        let terminal_id = s("terminalId");
        let b64 = s("b64Data");
        let mime = {
            let m = s("mimeType");
            if m.is_empty() {
                "image/png".to_string()
            } else {
                m
            }
        };
        let (app, out) = (app.clone(), out.clone());
        std::thread::spawn(move || {
            let res = crate::upload::upload_clipboard_image_for_terminal(
                app.state::<pty::PtyState>(),
                terminal_id,
                b64,
                mime,
            );
            let frame = match res {
                Ok(path) => result_frame(&req_id, true, Value::String(path)),
                Err(e) => result_frame(&req_id, false, Value::String(e)),
            };
            let _ = out.try_send(frame);
        });
        return;
    }
    if let Some(r) = fast_path(app, cmd, &args) {
        let frame = match r {
            Ok(value) => result_frame(&req_id, true, value),
            Err(e) => result_frame(&req_id, false, Value::String(e)),
        };
        let _ = out.try_send(frame);
        return;
    }
    if is_denied(cmd) {
        let _ = out.try_send(result_frame(
            &req_id,
            false,
            Value::String(format!("command not permitted over peer connection: {cmd}")),
        ));
        return;
    }
    if app.get_webview_window("main").is_none() {
        let _ = out.try_send(result_frame(
            &req_id,
            false,
            Value::String("host UI unavailable — open the lpm app on the host Mac".to_string()),
        ));
        return;
    }
    let did = hub.inner.next_dispatch.fetch_add(1, Ordering::SeqCst) + 1;
    // A single background reaper (spawn_dispatch_reaper) sweeps entries past their
    // deadline, so a dispatch the host webview never answers still fails the
    // client's peer_invoke fast — without parking a thread per request.
    hub.inner.pending.lock().unwrap().insert(
        did,
        PendingDispatch {
            out: out.clone(),
            client_req: req_id.clone(),
            deadline: Instant::now() + DISPATCH_TIMEOUT,
        },
    );
    let _ = app.emit(
        "peer-invoke",
        json!({ "reqId": did, "cmd": cmd, "args": args }),
    );
}

/// One long-lived thread that fails any webview dispatch whose reply never came
/// within DISPATCH_TIMEOUT. Runs for the process lifetime (started once from
/// `start`), scanning on a 1s tick — a reply arriving first removes the entry in
/// `peer_dispatch_reply`, so a live dispatch is never touched here.
fn spawn_dispatch_reaper(hub: PeerHub) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(1));
        let now = Instant::now();
        let expired: Vec<PendingDispatch> = {
            let mut pending = hub.inner.pending.lock().unwrap();
            let ids: Vec<u64> = pending
                .iter()
                .filter(|(_, p)| p.deadline <= now)
                .map(|(k, _)| *k)
                .collect();
            ids.into_iter()
                .filter_map(|id| pending.remove(&id))
                .collect()
        };
        for p in expired {
            let _ = p.out.try_send(result_frame(
                &p.client_req,
                false,
                Value::String("host did not respond".to_string()),
            ));
        }
    });
}

/// Terminal I/O commands executed directly in Rust (no webview round-trip),
/// mirroring the mobile server's use of the pty::remote_* accessors. Returns None
/// for any other command so dispatch falls through to the webview path.
fn fast_path(app: &AppHandle, cmd: &str, args: &Value) -> Option<Result<Value, String>> {
    let state = app.state::<pty::PtyState>();
    let s = |k: &str| {
        args.get(k)
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string()
    };
    let u16f = |k: &str| args.get(k).and_then(Value::as_u64).unwrap_or(0) as u16;
    match cmd {
        "write_terminal" => {
            Some(pty::remote_write(&state, &s("id"), &s("data")).map(|_| Value::Null))
        }
        "resize_terminal" => Some(
            pty::remote_resize(&state, &s("id"), u16f("cols"), u16f("rows")).map(|_| Value::Null),
        ),
        "ack_terminal_data" => {
            // Args arrive with the frontend's camelCase keys — they bypass Tauri's
            // snake_case conversion on this direct path (unlike the webview tier).
            let char_count = args.get("charCount").and_then(Value::as_i64).unwrap_or(0);
            Some(pty::ack_terminal_data(state, s("id"), char_count).map(|_| Value::Null))
        }
        "stop_terminal" => {
            let id = s("id");
            Some(pty::stop_terminal(app.clone(), state, id.clone()).map(|_| {
                // Only wire calls reach this path, so the event means "the peer
                // closed this terminal" — the host UI removes its adopted tab
                // instead of leaving a dead one. Host-local closes never emit it.
                let _ = app.emit("peer-terminal-closed", id);
                Value::Null
            }))
        }
        _ => None,
    }
}

/// Host-side denylist: commands the host refuses to run for a peer. The client
/// router carries the same guard, so this is defense in depth — when in doubt
/// project-scoped ops are allowed and app-meta ops are denied.
fn is_denied(cmd: &str) -> bool {
    if cmd.starts_with("peer_") || cmd.starts_with("remote_") {
        return true;
    }
    matches!(
        cmd,
        // terminal control ownership — a peer only ever claims via `sub` (owner
        // kind "peer"); these would let a client forge/steal ownership under any
        // kind and strand the host's windows.
        "terminal_claim_control"
            | "terminal_present_control"
            | "terminal_unpresent_control"
            // global host mutators (sidebar / project order / composer + generator
            // config / saved terminals / stop-everything) — not project-scoped.
            | "save_groups"
            | "reorder_projects"
            | "save_composer_actions"
            | "save_generators"
            | "save_generator_icon"
            | "save_terminals"
            | "stop_all"
            // window / dock / detached-window focus
            | "focus_main_window"
            | "focus_detached_window"
            | "restore_detached_windows"
            | "list_detached_projects"
            | "detach_project"
            | "attach_project"
            | "save_window_size"
            // app settings + config import/export
            | "save_settings"
            | "save_global_config"
            | "save_repo_config"
            | "import_config"
            | "export_config"
            // updater / installers
            | "check_for_update"
            | "install_update"
            | "install_tmux"
            | "install_kokoro"
            | "uninstall_kokoro"
            | "install_cli"
            | "install_agent_skill"
            // accounts / login
            | "load_claude_accounts"
            | "save_claude_accounts"
            | "remove_claude_account"
            | "claude_accounts_status"
            | "claude_account_usage"
            | "start_claude_login"
            // host-local audio / voice
            | "start_tts"
            | "stop_tts"
            | "pause_tts"
            | "resume_tts"
            | "play_sound_preview"
            | "voice_to_text_toggle"
            // host-local browser overlay
            | "open_browser"
            | "close_browser"
            | "hide_browser"
            | "navigate_browser"
            | "set_browser_bounds"
            | "set_browser_theme"
            | "browser_back"
            | "browser_forward"
            | "browser_reload"
            // vault key material
            | "vault_export_key"
            | "vault_import_key"
    )
}

// --- event forwarding ---------------------------------------------------------

fn install_forwarders(hub: &PeerHub, app: &AppHandle) {
    for name in FORWARDED_EVENTS {
        let h = hub.clone();
        let name = name.to_string();
        app.listen(name.clone(), move |e| {
            // Only forward while the server is live; skip the JSON parse otherwise.
            if !h.inner.enabled.load(Ordering::Relaxed) {
                return;
            }
            let payload: Value = serde_json::from_str(e.payload()).unwrap_or(Value::Null);
            broadcast(&h, json!({ "t": "evt", "name": name, "payload": payload }));
        });
    }
}

// --- frontend commands --------------------------------------------------------

/// Pairing state for the Settings pane: the outstanding code plus the addresses a
/// client can reach this Mac at, or null when no code is pending.
fn pairing_value(cfg: &HostConfig) -> Value {
    if cfg.pairing_code.is_empty() {
        return Value::Null;
    }
    json!({
        "code": cfg.pairing_code,
        "port": effective_port(cfg.port),
        "hosts": candidate_hosts(),
        "fp": crate::remotetls::fingerprint(),
    })
}

fn host_state_value(hub: &PeerHub) -> Value {
    let cfg = hub.host_config();
    let devices: Vec<Value> = cfg
        .devices
        .iter()
        .map(|d| json!({ "id": d.id, "name": d.name }))
        .collect();
    let pair_requests: Vec<Value> = hub
        .inner
        .pair_requests
        .lock()
        .unwrap()
        .iter()
        .map(|p| json!({ "id": p.id, "name": p.name, "sas": p.sas }))
        .collect();
    json!({
        "enabled": cfg.enabled,
        "port": effective_port(cfg.port),
        "lan": cfg.lan,
        "running": hub.inner.running.load(Ordering::Relaxed),
        "hostId": cfg.host_id,
        "pairing": pairing_value(&cfg),
        "devices": devices,
        "pairRequests": pair_requests,
    })
}

/// Combined host+client state for the Connect Macs pane. Client peer rows carry
/// their live connection status from peerclient.rs.
#[tauri::command]
pub fn peer_state(
    hub: State<'_, PeerHub>,
    client: State<'_, crate::peerclient::PeerClientHub>,
) -> Value {
    json!({ "host": host_state_value(&hub), "peers": client.peers_state() })
}

#[tauri::command]
pub async fn peer_host_set_config(
    app: AppHandle,
    hub: State<'_, PeerHub>,
    enabled: bool,
    port: u16,
    lan: bool,
) -> Result<Value, String> {
    {
        let mut cfg = hub.inner.config.lock().unwrap();
        cfg.host.enabled = enabled;
        cfg.host.port = port;
        cfg.host.lan = lan;
        let snapshot = cfg.clone();
        drop(cfg);
        save_config(&snapshot)?;
    }
    apply(&hub, &app);
    let _ = app.emit("peer-state-changed", ());
    Ok(host_state_value(&hub))
}

/// Start (or refresh) a single-use pairing code, force-enabling the server on the
/// LAN so the pairing Mac can reach it, and return the code + candidate addresses.
#[tauri::command]
pub async fn peer_host_start_pairing(
    app: AppHandle,
    hub: State<'_, PeerHub>,
) -> Result<Value, String> {
    let code = gen_pairing_code();
    let (hosts, port) = {
        let mut cfg = hub.inner.config.lock().unwrap();
        cfg.host.pairing_code = code.clone();
        cfg.host.enabled = true;
        cfg.host.lan = true;
        let port = effective_port(cfg.host.port);
        let snapshot = cfg.clone();
        drop(cfg);
        save_config(&snapshot)?;
        (candidate_hosts(), port)
    };
    apply(&hub, &app);
    let _ = app.emit("peer-state-changed", ());
    // The invite carries this Mac's leaf fingerprint so the joining Mac can pin it
    // up front (like the phone's pairing QR). Reading it here also forces the shared
    // identity to exist before the listener starts presenting it.
    Ok(json!({ "code": code, "port": port, "hosts": hosts, "fp": crate::remotetls::fingerprint() }))
}

#[tauri::command]
pub async fn peer_host_cancel_pairing(
    app: AppHandle,
    hub: State<'_, PeerHub>,
) -> Result<Value, String> {
    {
        let mut cfg = hub.inner.config.lock().unwrap();
        cfg.host.pairing_code.clear();
        let snapshot = cfg.clone();
        drop(cfg);
        save_config(&snapshot)?;
    }
    let _ = app.emit("peer-state-changed", ());
    Ok(host_state_value(&hub))
}

#[tauri::command]
pub async fn peer_host_revoke_device(
    app: AppHandle,
    hub: State<'_, PeerHub>,
    id: String,
) -> Result<Value, String> {
    {
        let mut cfg = hub.inner.config.lock().unwrap();
        cfg.host.devices.retain(|d| d.id != id);
        let snapshot = cfg.clone();
        drop(cfg);
        save_config(&snapshot)?;
    }
    // Drop any live connection for the revoked device (the poll loop also self-
    // exits on its next tick via device_exists).
    hub.inner
        .clients
        .lock()
        .unwrap()
        .retain(|_, c| c.device_id != id);
    let _ = app.emit("peer-state-changed", ());
    Ok(host_state_value(&hub))
}

/// Resolve a pending tap-to-approve pairing request with the user's decision.
/// `reciprocal` also pairs the reverse direction (this Mac controls the requester).
#[tauri::command]
pub async fn peer_host_respond_pairing(
    app: AppHandle,
    hub: State<'_, PeerHub>,
    id: String,
    accept: bool,
    reciprocal: bool,
) -> Result<Value, String> {
    hub.resolve_pair_request(&id, accept, reciprocal);
    let _ = app.emit("peer-state-changed", ());
    Ok(host_state_value(&hub))
}

/// Called by the host's main-window dispatcher with the outcome of running a
/// re-emitted command, delivering the result back to the waiting client.
#[tauri::command]
pub fn peer_dispatch_reply(hub: State<'_, PeerHub>, req_id: u64, ok: bool, value: Value) {
    if let Some(p) = hub.inner.pending.lock().unwrap().remove(&req_id) {
        let _ = p.out.try_send(result_frame(&p.client_req, ok, value));
    }
}

// --- crypto / net helpers -----------------------------------------------------

fn gen_token() -> String {
    let mut b = [0u8; 32];
    getrandom::fill(&mut b).expect("csprng");
    base64_url(&b)
}

fn base64_url(b: &[u8]) -> String {
    use base64::Engine as _;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(b)
}

pub(crate) fn gen_pairing_code() -> String {
    let mut b = [0u8; 4];
    let _ = getrandom::fill(&mut b);
    let n = u32::from_be_bytes(b);
    format!("{:04X}-{:04X}", (n >> 16) & 0xFFFF, n & 0xFFFF)
}

/// A 6-digit short-authentication string shown on both Macs for a tap-to-approve
/// pairing. Rejection-sampled to stay uniform over 000000..=999999 (no modulo
/// bias): 32-bit draws land in [0, 4_294_000_000) before the % 1_000_000.
fn gen_sas() -> String {
    const LIMIT: u32 = 4_294_000_000; // largest multiple of 1_000_000 below 2^32
    loop {
        let mut b = [0u8; 4];
        getrandom::fill(&mut b).expect("csprng");
        let n = u32::from_be_bytes(b);
        if n < LIMIT {
            return format!("{:06}", n % 1_000_000);
        }
    }
}

/// An 8-char lowercase-hex slug, unique among already-paired devices.
fn gen_slug(existing: &[PeerDevice]) -> String {
    loop {
        let mut b = [0u8; 4];
        let _ = getrandom::fill(&mut b);
        let s = hex::encode(b);
        if !existing.iter().any(|d| d.slug_assigned == s) {
            return s;
        }
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

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

/// This Mac's user-facing name (System Settings → Sharing), for the client's peer
/// list. Falls back to the network hostname, then a generic label.
pub(crate) fn machine_name() -> String {
    if let Ok(out) = std::process::Command::new("scutil")
        .args(["--get", "ComputerName"])
        .output()
    {
        if out.status.success() {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !s.is_empty() {
                return s;
            }
        }
    }
    let mut buf = [0u8; 256];
    let r = unsafe { libc::gethostname(buf.as_mut_ptr() as *mut libc::c_char, buf.len()) };
    if r == 0 {
        let end = buf.iter().position(|&b| b == 0).unwrap_or(buf.len());
        return String::from_utf8_lossy(&buf[..end]).to_string();
    }
    "Mac".to_string()
}

/// The Mac's primary LAN IP, found by asking the OS which local address would
/// route outbound — no packets are sent (UDP connect only sets the peer).
fn primary_lan_ip() -> Option<String> {
    let sock = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    sock.connect("192.0.2.1:80").ok()?; // TEST-NET-1: non-routable, never leaves the host
    sock.local_addr().ok().map(|a| a.ip().to_string())
}

/// This Mac's Tailscale IPv4 (100.64.0.0/10 CGNAT range), if a tailnet interface
/// is up — reachable from anywhere on the shared tailnet, not just the LAN.
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

/// Addresses to advertise for pairing, most-preferred first: LAN IP then
/// Tailscale IP, falling back to loopback.
pub(crate) fn candidate_hosts() -> Vec<String> {
    let mut hosts = Vec::new();
    if let Some(ip) = primary_lan_ip() {
        hosts.push(ip);
    }
    if let Some(ip) = tailscale_ip() {
        if !hosts.contains(&ip) {
            hosts.push(ip);
        }
    }
    if hosts.is_empty() {
        hosts.push("127.0.0.1".to_string());
    }
    hosts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_roundtrips_both_roles() {
        let cfg = PeerConfig {
            host: HostConfig {
                enabled: true,
                lan: true,
                port: 9100,
                pairing_code: "AB12-CD34".into(),
                host_id: "host-1".into(),
                devices: vec![PeerDevice {
                    id: "d1".into(),
                    name: "Studio".into(),
                    token_sha256: sha256_hex(b"t"),
                    slug_assigned: "abcd1234".into(),
                    created_at: 7,
                }],
            },
            peers: vec![PeerEntry {
                slug: "beefcafe".into(),
                alias: "Laptop".into(),
                host: "100.64.0.5".into(),
                port: 8766,
                device_id: "x".into(),
                token: "secret".into(),
                host_id: "hid".into(),
                tls_fp: Some("deadbeef".into()),
                enabled: true,
                last_sync_at: 0,
                auto_sync: true,
            }],
        };
        let s = serde_json::to_string(&cfg).unwrap();
        let back: PeerConfig = serde_json::from_str(&s).unwrap();
        assert_eq!(back.host.port, 9100);
        assert!(back.host.enabled && back.host.lan);
        assert_eq!(back.host.devices[0].slug_assigned, "abcd1234");
        assert_eq!(back.peers.len(), 1);
        assert_eq!(back.peers[0].slug, "beefcafe");
        assert_eq!(back.peers[0].token, "secret");
        assert_eq!(back.peers[0].tls_fp.as_deref(), Some("deadbeef"));
        assert!(back.peers[0].enabled);
        assert!(back.peers[0].auto_sync);
    }

    // Old peer.json (or a hand-written one) without the peer `enabled` field must
    // default it to true, not false, so a stored peer still connects. A pre-Phase-3
    // file also lacks `tlsFp`, which must load as None (pin on first authed connect).
    // A pre-Phase-4 file lacks `autoSync`, which must load as false (opt-in).
    #[test]
    fn peer_entry_enabled_defaults_true() {
        let json = r#"{ "peers": [{ "slug": "aa", "host": "h", "port": 1 }] }"#;
        let cfg: PeerConfig = serde_json::from_str(json).unwrap();
        assert!(cfg.peers[0].enabled);
        assert!(cfg.peers[0].tls_fp.is_none());
        assert!(!cfg.peers[0].auto_sync);
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
    }

    #[test]
    fn slug_is_8_lowercase_hex_and_unique() {
        let existing = vec![PeerDevice {
            slug_assigned: "00000000".into(),
            ..Default::default()
        }];
        let s = gen_slug(&existing);
        assert_eq!(s.len(), 8);
        assert!(s
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
        assert_ne!(s, "00000000");
    }

    #[test]
    fn effective_port_defaults_to_8766() {
        assert_eq!(effective_port(0), 8766);
        assert_eq!(effective_port(9000), 9000);
    }

    #[test]
    fn denylist_blocks_meta_and_role_commands_allows_project_ops() {
        assert!(is_denied("peer_add"));
        assert!(is_denied("remote_state"));
        assert!(is_denied("save_settings"));
        assert!(is_denied("install_update"));
        assert!(is_denied("open_browser"));
        assert!(is_denied("start_claude_login"));
        // Control-ownership forgery and global host mutators must be blocked.
        assert!(is_denied("terminal_claim_control"));
        assert!(is_denied("terminal_present_control"));
        assert!(is_denied("terminal_unpresent_control"));
        assert!(is_denied("save_groups"));
        assert!(is_denied("reorder_projects"));
        assert!(is_denied("save_composer_actions"));
        assert!(is_denied("save_generators"));
        assert!(is_denied("save_generator_icon"));
        assert!(is_denied("save_terminals"));
        assert!(is_denied("stop_all"));
        // Project-scoped operations flow through to the webview dispatcher.
        assert!(!is_denied("list_projects"));
        assert!(!is_denied("git_status"));
        assert!(!is_denied("start_project"));
        assert!(!is_denied("run_action"));
        assert!(!is_denied("start_terminal"));
    }

    #[test]
    fn pairing_value_is_null_without_a_code() {
        let mut cfg = HostConfig::default();
        assert!(pairing_value(&cfg).is_null());
        cfg.pairing_code = "AB12-CD34".into();
        let v = pairing_value(&cfg);
        assert_eq!(v.get("code").and_then(Value::as_str), Some("AB12-CD34"));
        assert!(v.get("hosts").and_then(Value::as_array).is_some());
    }

    #[test]
    fn pairs_through_nonblocking_listener() {
        let _guard = TEST_CFG_GUARD.lock().unwrap();
        let tmp = std::env::temp_dir().join(format!("lpm-peer-test-{}.json", std::process::id()));
        *TEST_CONFIG_PATH.lock().unwrap() = Some(tmp.clone());

        let hub = PeerHub::default();
        hub.inner.config.lock().unwrap().host.pairing_code = "AAAA-BBBB".to_string();
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap(); // reproduce accept_loop
        let addr = listener.local_addr().unwrap();

        let hub2 = hub.clone();
        let server = std::thread::spawn(move || loop {
            match listener.accept() {
                Ok((stream, _)) => {
                    let _ = stream.set_nonblocking(false); // the macOS O_NONBLOCK fix
                    let mut ws = accept_ws(stream).expect("server handshake");
                    // Drive just the pairing handshake (no AppHandle needed).
                    let txt = loop {
                        match ws.read() {
                            Ok(m) if m.is_text() => break m.to_text().unwrap().to_string(),
                            Ok(_) => continue,
                            Err(_) => return None,
                        }
                    };
                    let v: Value = serde_json::from_str(&txt).unwrap();
                    let code = v.get("code").and_then(Value::as_str).unwrap_or_default();
                    let name = v.get("name").and_then(Value::as_str).unwrap_or("Mac");
                    let paired = pair_device(&hub2, code, name);
                    if let Some((id, token, slug)) = &paired {
                        let _ = ws.send(Message::text(
                            json!({ "t": "paired", "deviceId": id, "token": token, "slug": slug })
                                .to_string(),
                        ));
                    }
                    return paired;
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(10));
                }
                Err(_) => return None,
            }
        });

        let (mut c, _) = tungstenite::connect(format!("ws://{addr}/")).expect("client connect");
        c.send(Message::text(
            json!({ "t": "pair", "code": "AAAA-BBBB", "name": "Laptop" }).to_string(),
        ))
        .unwrap();
        let reply = c.read().expect("no reply frame");
        let paired = server.join().unwrap();

        *TEST_CONFIG_PATH.lock().unwrap() = None;
        let _ = std::fs::remove_file(&tmp);

        assert!(
            paired.is_some(),
            "pair_device returned None through a non-blocking listener"
        );
        let text = reply.to_text().unwrap();
        assert!(text.contains("paired"), "expected paired, got: {text}");
        assert!(text.contains("slug"), "paired reply must carry a slug");
    }

    #[test]
    fn gen_sas_is_six_decimal_digits() {
        for _ in 0..64 {
            let s = gen_sas();
            assert_eq!(s.len(), 6, "sas must be 6 chars: {s}");
            assert!(s.chars().all(|c| c.is_ascii_digit()), "sas must be digits: {s}");
        }
    }

    #[test]
    fn mint_device_keeps_pairing_code_while_pair_device_clears_it() {
        let _guard = TEST_CFG_GUARD.lock().unwrap();
        let tmp = std::env::temp_dir().join(format!("lpm-peer-mint-{}.json", std::process::id()));
        *TEST_CONFIG_PATH.lock().unwrap() = Some(tmp.clone());

        let hub = PeerHub::default();
        {
            let mut cfg = hub.inner.config.lock().unwrap();
            cfg.host.host_id = "host-xyz".into();
            cfg.host.pairing_code = "AAAA-BBBB".into();
        }

        // A tap-to-approve mint never consumes the outstanding code.
        let (id, token, slug) = mint_device(&hub, "Laptop");
        assert!(!id.is_empty() && !token.is_empty() && slug.len() == 8);
        assert_eq!(hub.host_config().pairing_code, "AAAA-BBBB");
        assert_eq!(hub.host_config().devices.len(), 1);

        // A code-based pair still consumes it.
        assert!(pair_device(&hub, "AAAA-BBBB", "Studio").is_some());
        assert!(hub.host_config().pairing_code.is_empty());
        assert_eq!(hub.host_config().devices.len(), 2);

        *TEST_CONFIG_PATH.lock().unwrap() = None;
        let _ = std::fs::remove_file(&tmp);
    }

    #[test]
    fn pair_request_resolve_delivers_decision_and_removes_entry() {
        let hub = PeerHub::default();
        let (id, sas, rx) = hub.begin_pair_request("Laptop");
        assert_eq!(sas.len(), 6);
        assert_eq!(hub.inner.pair_requests.lock().unwrap().len(), 1);
        hub.resolve_pair_request(&id, true, true);
        let decision = rx.recv().expect("decision delivered");
        assert!(decision.accept && decision.reciprocal);
        assert!(hub.inner.pair_requests.lock().unwrap().is_empty());
    }

    #[test]
    fn remove_pair_request_drops_pending_on_requester_disconnect() {
        let hub = PeerHub::default();
        let (id, _sas, _rx) = hub.begin_pair_request("Laptop");
        assert_eq!(hub.inner.pair_requests.lock().unwrap().len(), 1);
        hub.remove_pair_request(&id);
        assert!(hub.inner.pair_requests.lock().unwrap().is_empty());
    }

    // Drive the tap-to-approve wire path over a real socket, exercising the real
    // begin/resolve/mint hub methods (only the AppHandle emit/window glue in
    // handle_pair_request is omitted — it needs a Tauri app). `accept` toggles the
    // approve vs deny branch.
    fn run_pair_request_socket(accept: bool) -> Value {
        let _guard = TEST_CFG_GUARD.lock().unwrap();
        let tmp = std::env::temp_dir().join(format!(
            "lpm-peer-req-{}-{accept}.json",
            std::process::id()
        ));
        *TEST_CONFIG_PATH.lock().unwrap() = Some(tmp.clone());

        let hub = PeerHub::default();
        hub.inner.config.lock().unwrap().host.host_id = "host-xyz".to_string();
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let addr = listener.local_addr().unwrap();

        let hub2 = hub.clone();
        let server = std::thread::spawn(move || loop {
            match listener.accept() {
                Ok((stream, _)) => {
                    let _ = stream.set_nonblocking(false);
                    let mut ws = accept_ws(stream).expect("server handshake");
                    let txt = loop {
                        match ws.read() {
                            Ok(m) if m.is_text() => break m.to_text().unwrap().to_string(),
                            Ok(_) => continue,
                            Err(_) => return,
                        }
                    };
                    let v: Value = serde_json::from_str(&txt).unwrap();
                    let name = v.get("name").and_then(Value::as_str).unwrap_or("Mac");
                    let (id, sas, rx) = hub2.begin_pair_request(name);
                    let _ = ws.send(Message::text(
                        json!({ "t": "pairPending", "sas": sas }).to_string(),
                    ));
                    hub2.resolve_pair_request(&id, accept, false);
                    let decision = rx.recv().expect("decision");
                    hub2.remove_pair_request(&id);
                    if decision.accept {
                        let (dev, token, slug) = mint_device(&hub2, name);
                        let _ = ws.send(Message::text(
                            json!({ "t": "paired", "deviceId": dev, "token": token, "slug": slug,
                                "hostName": machine_name(), "hostId": hub2.host_id(), "reciprocal": false })
                            .to_string(),
                        ));
                    } else {
                        let _ = ws.send(Message::text(
                            json!({ "t": "error", "error": "pairing declined" }).to_string(),
                        ));
                    }
                    return;
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(10));
                }
                Err(_) => return,
            }
        });

        let (mut c, _) = tungstenite::connect(format!("ws://{addr}/")).expect("client connect");
        c.send(Message::text(
            json!({ "t": "pairRequest", "name": "Laptop" }).to_string(),
        ))
        .unwrap();
        let pending: Value = serde_json::from_str(c.read().unwrap().to_text().unwrap()).unwrap();
        assert_eq!(pending.get("t").and_then(Value::as_str), Some("pairPending"));
        assert_eq!(pending.get("sas").and_then(Value::as_str).map(str::len), Some(6));
        let reply: Value = serde_json::from_str(c.read().unwrap().to_text().unwrap()).unwrap();
        server.join().unwrap();

        *TEST_CONFIG_PATH.lock().unwrap() = None;
        let _ = std::fs::remove_file(&tmp);
        reply
    }

    #[test]
    fn pair_request_approve_replies_paired_with_host_id() {
        let reply = run_pair_request_socket(true);
        assert_eq!(reply.get("t").and_then(Value::as_str), Some("paired"));
        assert!(reply.get("deviceId").and_then(Value::as_str).is_some_and(|s| !s.is_empty()));
        assert!(reply.get("token").and_then(Value::as_str).is_some_and(|s| !s.is_empty()));
        assert_eq!(reply.get("slug").and_then(Value::as_str).map(str::len), Some(8));
        assert_eq!(reply.get("hostId").and_then(Value::as_str), Some("host-xyz"));
    }

    #[test]
    fn pair_request_deny_replies_pairing_declined() {
        let reply = run_pair_request_socket(false);
        assert_eq!(reply.get("t").and_then(Value::as_str), Some("error"));
        assert_eq!(
            reply.get("error").and_then(Value::as_str),
            Some("pairing declined")
        );
    }
}
