// Mac-to-Mac peer client connection manager.
//
// The client half of "Connect Macs": for every remote Mac this Mac has paired
// with (persisted in ~/.lpm/peer.json, shared with peer.rs), it keeps one
// WebSocket connection open, auto-reconnecting with backoff while the peer is
// enabled. Commands the frontend router marks for a peer arrive here as
// `peer_invoke` and are forwarded over that connection; the reply is correlated
// by reqId. Terminal output the host streams back is re-emitted locally under the
// prefixed event names the mirrored ProjectDetail already listens on, and
// forwarded global events are re-emitted on a per-peer wrapper channel.
//
// Style matches the rest of the codebase: std::thread + blocking tungstenite, one
// thread per connection, no tokio in the connection path.
use crate::peer::{self, PeerEntry, SharedConfig};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, SyncSender, TryRecvError};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};
use tungstenite::{Error as WsError, Message, WebSocket};

const POLL: Duration = Duration::from_millis(25);
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(3); // per-candidate dial cap when pairing
const INVOKE_TIMEOUT: Duration = Duration::from_secs(35);
const SYNC_TIMEOUT: Duration = Duration::from_secs(60); // digest / fetch round-trip
const SYNC_APPLY_TIMEOUT: Duration = Duration::from_secs(180); // host snapshots ~/.lpm first
const SYNC_UNSUPPORTED: &str = "the other Mac needs to update lpm to sync config";
const PING_INTERVAL: Duration = Duration::from_secs(20);
const BACKOFF_MIN: Duration = Duration::from_secs(1);
const BACKOFF_MAX: Duration = Duration::from_secs(30);
const OUT_QUEUE: usize = 1024;

// --- shared state -------------------------------------------------------------

/// One outstanding `peer_invoke`, resolved when its `result` frame arrives (or the
/// connection drops / the wait times out).
struct Pending {
    done: Mutex<Option<Result<Value, String>>>,
    cv: Condvar,
}

/// Live state for a single paired peer's connection.
struct PeerConn {
    slug: String,
    out: Mutex<Option<SyncSender<String>>>,
    connected: AtomicBool,
    last_error: Mutex<String>,
    attached: Mutex<HashSet<String>>, // raw host terminal ids the frontend has open
    pending: Mutex<HashMap<u64, Arc<Pending>>>,
    enabled: AtomicBool,
    supports_sync: AtomicBool, // host advertised the configSync feature in `ready`
    generation: AtomicU64, // bump to retire the current connection thread
}

impl PeerConn {
    fn new(slug: &str) -> Self {
        PeerConn {
            slug: slug.to_string(),
            out: Mutex::new(None),
            connected: AtomicBool::new(false),
            last_error: Mutex::new(String::new()),
            attached: Mutex::new(HashSet::new()),
            pending: Mutex::new(HashMap::new()),
            enabled: AtomicBool::new(true),
            supports_sync: AtomicBool::new(false),
            generation: AtomicU64::new(0),
        }
    }

    fn send(&self, frame: String) -> Result<(), String> {
        match self.out.lock().unwrap().as_ref() {
            Some(tx) => tx.try_send(frame).map_err(|_| "peer send queue full".to_string()),
            None => Err("peer not connected".to_string()),
        }
    }

    /// Fail every outstanding invoke — called when the connection drops so no
    /// caller hangs to its own timeout.
    fn fail_pending(&self, reason: &str) {
        let mut map = self.pending.lock().unwrap();
        for (_, p) in map.drain() {
            *p.done.lock().unwrap() = Some(Err(reason.to_string()));
            p.cv.notify_all();
        }
    }
}

struct ClientInner {
    config: SharedConfig,
    app: Mutex<Option<AppHandle>>,
    conns: Mutex<HashMap<String, Arc<PeerConn>>>,
    next_req: AtomicU64,
}

#[derive(Clone)]
pub struct PeerClientHub {
    inner: Arc<ClientInner>,
}

impl Default for PeerClientHub {
    fn default() -> Self {
        Self::new(Arc::new(Mutex::new(peer::PeerConfig::default())))
    }
}

impl PeerClientHub {
    pub fn new(config: SharedConfig) -> Self {
        PeerClientHub {
            inner: Arc::new(ClientInner {
                config,
                app: Mutex::new(None),
                conns: Mutex::new(HashMap::new()),
                next_req: AtomicU64::new(0),
            }),
        }
    }

    fn app(&self) -> Option<AppHandle> {
        self.inner.app.lock().unwrap().clone()
    }

    fn peer_entry(&self, slug: &str) -> Option<PeerEntry> {
        self.inner
            .config
            .lock()
            .unwrap()
            .peers
            .iter()
            .find(|p| p.slug == slug)
            .cloned()
    }

    /// Connection status rows for the Settings pane, one per persisted peer.
    pub fn peers_state(&self) -> Value {
        let peers = self.inner.config.lock().unwrap().peers.clone();
        let conns = self.inner.conns.lock().unwrap();
        let rows: Vec<Value> = peers
            .iter()
            .map(|p| {
                let conn = conns.get(&p.slug);
                let connected = conn.map(|c| c.connected.load(Ordering::Relaxed)).unwrap_or(false);
                let supports_sync = conn.map(|c| c.supports_sync.load(Ordering::Relaxed)).unwrap_or(false);
                let last_error = conn.map(|c| c.last_error.lock().unwrap().clone()).unwrap_or_default();
                json!({
                    "slug": p.slug,
                    "alias": p.alias,
                    "host": p.host,
                    "port": p.port,
                    "enabled": p.enabled,
                    "connected": connected,
                    "supportsSync": supports_sync,
                    "lastSyncAt": p.last_sync_at,
                    "lastError": last_error,
                })
            })
            .collect();
        Value::Array(rows)
    }

    /// (Re)start the connection thread for a peer, retiring any current one.
    fn start_conn(&self, slug: &str) {
        let mut conns = self.inner.conns.lock().unwrap();
        let conn = conns.entry(slug.to_string()).or_insert_with(|| Arc::new(PeerConn::new(slug))).clone();
        conn.enabled.store(true, Ordering::SeqCst);
        let generation = conn.generation.fetch_add(1, Ordering::SeqCst) + 1;
        drop(conns);
        let hub = self.clone();
        let conn2 = conn.clone();
        std::thread::spawn(move || run_conn(hub, conn2, generation));
    }

    /// Stop and forget a peer's live connection (config is handled by the caller).
    fn stop_conn(&self, slug: &str) {
        if let Some(conn) = self.inner.conns.lock().unwrap().remove(slug) {
            conn.enabled.store(false, Ordering::SeqCst);
            conn.generation.fetch_add(1, Ordering::SeqCst);
            *conn.out.lock().unwrap() = None;
            conn.connected.store(false, Ordering::Relaxed);
            conn.fail_pending("peer removed");
        }
    }

    fn invoke_blocking(&self, slug: &str, cmd: &str, args: Value) -> Result<Value, String> {
        self.request_blocking(slug, INVOKE_TIMEOUT, |req| {
            json!({ "t": "invoke", "reqId": req, "cmd": cmd, "args": args })
        })
    }

    /// Send one correlated request frame and block on its `result` reply (or a
    /// disconnect / timeout). The frame builder receives the allocated reqId so
    /// callers can shape any frame type — invoke, syncDigest, syncFetch, syncApply
    /// — over the same pending-map machinery.
    fn request_blocking(
        &self,
        slug: &str,
        timeout: Duration,
        make_frame: impl FnOnce(u64) -> Value,
    ) -> Result<Value, String> {
        let conn = self
            .inner
            .conns
            .lock()
            .unwrap()
            .get(slug)
            .cloned()
            .ok_or_else(|| "unknown peer".to_string())?;
        if !conn.connected.load(Ordering::Relaxed) {
            return Err("peer not connected".to_string());
        }
        let req = self.inner.next_req.fetch_add(1, Ordering::SeqCst) + 1;
        let pending = Arc::new(Pending {
            done: Mutex::new(None),
            cv: Condvar::new(),
        });
        conn.pending.lock().unwrap().insert(req, pending.clone());
        let frame = make_frame(req).to_string();
        if let Err(e) = conn.send(frame) {
            conn.pending.lock().unwrap().remove(&req);
            return Err(e);
        }

        let deadline = Instant::now() + timeout;
        let mut guard = pending.done.lock().unwrap();
        while guard.is_none() {
            let Some(remaining) = deadline.checked_duration_since(Instant::now()) else {
                break;
            };
            let (g, to) = pending.cv.wait_timeout(guard, remaining).unwrap();
            guard = g;
            if to.timed_out() {
                break;
            }
        }
        let result = guard.take();
        drop(guard);
        conn.pending.lock().unwrap().remove(&req);
        result.unwrap_or_else(|| Err("peer request timed out".to_string()))
    }

    /// Guard: the peer must be connected and its host must speak config sync.
    fn require_sync_peer(&self, slug: &str) -> Result<(), String> {
        let conn = self
            .inner
            .conns
            .lock()
            .unwrap()
            .get(slug)
            .cloned()
            .ok_or_else(|| "unknown peer".to_string())?;
        if !conn.connected.load(Ordering::Relaxed) {
            return Err("peer not connected".to_string());
        }
        if !conn.supports_sync.load(Ordering::Relaxed) {
            return Err(SYNC_UNSUPPORTED.to_string());
        }
        Ok(())
    }

    /// Exchange digests with the peer and return the diff plan plus the persisted
    /// last-sync time.
    fn sync_status(&self, slug: &str) -> Result<Value, String> {
        self.require_sync_peer(slug)?;
        let remote_v = self.request_blocking(slug, SYNC_TIMEOUT, |req| {
            json!({ "t": "syncDigest", "v": 1, "reqId": req })
        })?;
        let remote: crate::peersync::DigestMap =
            serde_json::from_value(remote_v).map_err(|e| format!("bad digest reply: {e}"))?;
        let local = crate::peersync::local_digest_map();
        let items = crate::peersync::compute_plan(&local, &remote);
        let last = self.peer_entry(slug).map(|p| p.last_sync_at).unwrap_or(0);
        Ok(json!({ "items": items, "lastSyncAt": last }))
    }

    /// Run the sync both directions: pull remote-newer items (local backup first,
    /// then apply) and push local-newer items to the host (it backs up + applies).
    fn sync_run(&self, slug: &str, items: Vec<crate::peersync::SyncItem>) -> Result<Value, String> {
        self.require_sync_peer(slug)?;
        let (to_local, to_remote): (Vec<_>, Vec<_>) =
            items.into_iter().partition(|i| i.direction == "toLocal");
        let mut applied = 0u64;
        let mut pushed = 0u64;
        let mut errors: Vec<String> = Vec::new();

        if !to_local.is_empty() {
            let req_items: Vec<Value> = to_local
                .iter()
                .map(|i| json!({ "kind": i.kind, "name": i.name }))
                .collect();
            let resp = self.request_blocking(slug, SYNC_TIMEOUT, |req| {
                json!({ "t": "syncFetch", "v": 1, "reqId": req, "items": req_items })
            })?;
            let fetched: Vec<crate::peersync::WireItem> =
                serde_json::from_value(resp.get("items").cloned().unwrap_or_else(|| json!([])))
                    .map_err(|e| format!("bad fetch reply: {e}"))?;
            match crate::transfer::snapshot_backup() {
                Ok(_) => {
                    for it in &fetched {
                        match crate::peersync::apply_item(it) {
                            Ok(()) => applied += 1,
                            Err(e) => errors.push(format!("{}/{}: {e}", it.kind, it.name)),
                        }
                    }
                    if let Some(app) = self.app() {
                        let _ = app.emit("projects-changed", ());
                        let _ = app.emit("templates-changed", ());
                    }
                }
                Err(e) => errors.push(format!("local backup failed: {e}")),
            }
        }

        if !to_remote.is_empty() {
            let mut wire: Vec<Value> = Vec::new();
            for i in &to_remote {
                match crate::peersync::read_item(&i.kind, &i.name) {
                    Ok(w) => {
                        if let Ok(val) = serde_json::to_value(w) {
                            wire.push(val);
                        }
                    }
                    Err(e) => errors.push(format!("read {}/{}: {e}", i.kind, i.name)),
                }
            }
            if !wire.is_empty() {
                let resp = self.request_blocking(slug, SYNC_APPLY_TIMEOUT, |req| {
                    json!({ "t": "syncApply", "v": 1, "reqId": req, "items": wire })
                })?;
                pushed += resp.get("applied").and_then(Value::as_u64).unwrap_or(0);
                if let Some(errs) = resp.get("errors").and_then(Value::as_array) {
                    for e in errs {
                        if let Some(s) = e.as_str() {
                            errors.push(format!("other Mac: {s}"));
                        }
                    }
                }
            }
        }

        {
            let mut cfg = self.inner.config.lock().unwrap();
            if let Some(p) = cfg.peers.iter_mut().find(|p| p.slug == slug) {
                p.last_sync_at = crate::status::now_millis();
            }
            let snapshot = cfg.clone();
            drop(cfg);
            let _ = peer::save_config(&snapshot);
        }
        emit_state_changed(self);
        Ok(json!({ "applied": applied, "pushed": pushed, "errors": errors }))
    }
}

// --- lifecycle ----------------------------------------------------------------

/// Store the app handle and open a connection for every enabled peer. Called once
/// from lib.rs setup after the shared config is loaded.
pub fn start(hub: PeerClientHub, app: AppHandle) {
    *hub.inner.app.lock().unwrap() = Some(app);
    let peers = hub.inner.config.lock().unwrap().peers.clone();
    for p in peers {
        if p.enabled {
            hub.start_conn(&p.slug);
        }
    }
}

/// Retire all connection threads on app exit.
pub fn stop(hub: &PeerClientHub) {
    let conns: Vec<Arc<PeerConn>> = hub.inner.conns.lock().unwrap().values().cloned().collect();
    for conn in conns {
        conn.enabled.store(false, Ordering::SeqCst);
        conn.generation.fetch_add(1, Ordering::SeqCst);
        conn.fail_pending("app exiting");
    }
    hub.inner.conns.lock().unwrap().clear();
}

fn emit_state_changed(hub: &PeerClientHub) {
    if let Some(app) = hub.app() {
        let _ = app.emit("peer-state-changed", ());
    }
}

// --- connection thread --------------------------------------------------------

fn run_conn(hub: PeerClientHub, conn: Arc<PeerConn>, generation: u64) {
    let mut backoff = BACKOFF_MIN;
    loop {
        if !conn.enabled.load(Ordering::SeqCst)
            || conn.generation.load(Ordering::SeqCst) != generation
        {
            return;
        }
        let Some(entry) = hub.peer_entry(&conn.slug) else {
            return; // peer was removed from config
        };
        match connect_session(&hub, &conn, generation, &entry) {
            Ok(()) => backoff = BACKOFF_MIN, // clean end after a live session
            Err(e) => {
                *conn.last_error.lock().unwrap() = e;
            }
        }
        conn.connected.store(false, Ordering::Relaxed);
        conn.supports_sync.store(false, Ordering::Relaxed);
        *conn.out.lock().unwrap() = None;
        conn.fail_pending("peer disconnected");
        emit_state_changed(&hub);
        if !conn.enabled.load(Ordering::SeqCst)
            || conn.generation.load(Ordering::SeqCst) != generation
        {
            return;
        }
        std::thread::sleep(backoff);
        backoff = (backoff * 2).min(BACKOFF_MAX);
    }
}

fn connect_ws(host: &str, port: u16) -> Result<WebSocket<TcpStream>, String> {
    let stream = TcpStream::connect((host, port)).map_err(|e| e.to_string())?;
    finish_ws(stream, host, port)
}

/// Like `connect_ws` but caps the TCP connect at `timeout` (via connect_timeout),
/// so a dead candidate address fails fast instead of blocking on the OS default.
/// Used when pairing, where several candidate addresses are tried in turn.
fn connect_ws_timeout(host: &str, port: u16, timeout: Duration) -> Result<WebSocket<TcpStream>, String> {
    let addr = (host, port)
        .to_socket_addrs()
        .map_err(|e| e.to_string())?
        .next()
        .ok_or_else(|| format!("could not resolve {host}"))?;
    let stream = TcpStream::connect_timeout(&addr, timeout).map_err(|e| e.to_string())?;
    finish_ws(stream, host, port)
}

fn finish_ws(stream: TcpStream, host: &str, port: u16) -> Result<WebSocket<TcpStream>, String> {
    let _ = stream.set_nodelay(true);
    let _ = stream.set_read_timeout(Some(HANDSHAKE_TIMEOUT));
    let url = format!("ws://{host}:{port}/");
    let (ws, _) = tungstenite::client(url, stream).map_err(|e| e.to_string())?;
    Ok(ws)
}

/// Dial, authenticate, then run the read/write loop until the socket drops. Ok
/// means a session ran and ended; Err means we never got connected.
fn connect_session(
    hub: &PeerClientHub,
    conn: &Arc<PeerConn>,
    generation: u64,
    entry: &PeerEntry,
) -> Result<(), String> {
    let mut ws = connect_ws(&entry.host, entry.port)?;
    ws.send(Message::text(
        json!({ "t": "auth", "deviceId": entry.device_id, "token": entry.token }).to_string(),
    ))
    .map_err(|e| e.to_string())?;

    // First frame must be `ready`; anything else (or an error) means auth failed.
    let ready = loop {
        match ws.read() {
            Ok(m) if m.is_text() => break m.to_text().unwrap_or_default().to_string(),
            Ok(m) if m.is_close() => return Err("closed during auth".to_string()),
            Ok(_) => continue,
            Err(e) => return Err(e.to_string()),
        }
    };
    let rv: Value = serde_json::from_str(&ready).unwrap_or(Value::Null);
    if rv.get("t").and_then(Value::as_str) != Some("ready") {
        let err = rv.get("error").and_then(Value::as_str).unwrap_or("authentication failed");
        return Err(err.to_string());
    }
    let supports_sync = rv
        .get("features")
        .and_then(Value::as_array)
        .map(|a| a.iter().any(|f| f.as_str() == Some(crate::peersync::SYNC_FEATURE)))
        .unwrap_or(false);
    conn.supports_sync.store(supports_sync, Ordering::Relaxed);

    let (tx, rx) = mpsc::sync_channel::<String>(OUT_QUEUE);
    *conn.out.lock().unwrap() = Some(tx);
    conn.connected.store(true, Ordering::Relaxed);
    conn.last_error.lock().unwrap().clear();
    let _ = ws.get_ref().set_read_timeout(Some(POLL));
    // Re-subscribe every terminal the frontend currently has open, so a reconnect
    // transparently reseeds them.
    for id in conn.attached.lock().unwrap().iter() {
        let _ = ws.write(Message::text(
            json!({ "t": "sub", "id": id }).to_string(),
        ));
    }
    let _ = ws.flush();
    emit_state_changed(hub);

    let app = hub.app();
    let mut last_ping = Instant::now();
    'main: loop {
        if !conn.enabled.load(Ordering::SeqCst)
            || conn.generation.load(Ordering::SeqCst) != generation
        {
            let _ = ws.close(None);
            let _ = ws.flush();
            return Ok(());
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
        if last_ping.elapsed() >= PING_INTERVAL {
            if ws.write(Message::text(json!({ "t": "ping" }).to_string())).is_err() {
                break;
            }
            last_ping = Instant::now();
        }
        let _ = ws.flush();
        match ws.read() {
            Ok(msg) => {
                if msg.is_close() {
                    break;
                }
                if msg.is_text() {
                    if let Ok(txt) = msg.to_text() {
                        handle_frame(conn, app.as_ref(), txt);
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
    Ok(())
}

/// Route one frame the host pushed: terminal output/seed/exit re-emit under the
/// prefixed event names; forwarded global events go on the per-peer wrapper
/// channel; invoke results resolve their waiting caller.
fn handle_frame(conn: &Arc<PeerConn>, app: Option<&AppHandle>, txt: &str) {
    let v: Value = match serde_json::from_str(txt) {
        Ok(v) => v,
        Err(_) => return,
    };
    let slug = &conn.slug;
    match v.get("t").and_then(Value::as_str).unwrap_or_default() {
        "pong" => {}
        "result" => {
            let Some(req) = v.get("reqId").and_then(Value::as_u64) else {
                return;
            };
            let ok = v.get("ok").and_then(Value::as_bool).unwrap_or(false);
            let value = v.get("value").cloned().unwrap_or(Value::Null);
            let result = if ok {
                Ok(value)
            } else {
                Err(value.as_str().map(str::to_string).unwrap_or_else(|| value.to_string()))
            };
            if let Some(p) = conn.pending.lock().unwrap().get(&req).cloned() {
                *p.done.lock().unwrap() = Some(result);
                p.cv.notify_all();
            }
        }
        // Seed replays scrollback as ordinary output before live `o` frames. It is
        // prefixed with a terminal reset (clear screen + scrollback + home) so a
        // reconnect's reseed replaces the pane's contents instead of appending a
        // second copy of the ring; harmless on first attach (the term is empty).
        "seed" => {
            if let (Some(app), Some(id)) = (app, v.get("id").and_then(Value::as_str)) {
                let d = v.get("d").and_then(Value::as_str).unwrap_or_default();
                let chunk = format!("\x1b[2J\x1b[3J\x1b[H{d}");
                let _ = app.emit(&format!("pty-output-peer-{slug}-{id}"), chunk);
            }
        }
        "o" => {
            if let (Some(app), Some(id)) = (app, v.get("id").and_then(Value::as_str)) {
                let d = v.get("d").and_then(Value::as_str).unwrap_or_default();
                let _ = app.emit(&format!("pty-output-peer-{slug}-{id}"), d);
            }
        }
        "exit" => {
            if let (Some(app), Some(id)) = (app, v.get("id").and_then(Value::as_str)) {
                let code = v.get("code").and_then(Value::as_i64).unwrap_or(0) as i32;
                let _ = app.emit(&format!("pty-exit-peer-{slug}-{id}"), code);
            }
        }
        "evt" => {
            if let Some(app) = app {
                let name = v.get("name").and_then(Value::as_str).unwrap_or_default();
                let payload = v.get("payload").cloned().unwrap_or(Value::Null);
                let _ = app.emit(&format!("peer-evt-{slug}"), json!({ "name": name, "payload": payload }));
            }
        }
        _ => {}
    }
}

// --- prefixed-id parsing ------------------------------------------------------

/// Split a peer-prefixed terminal id `peer-{8hex}-{rawId}` into (slug, rawId).
/// Returns None for a malformed id or a non-hex slug.
fn parse_prefixed(id: &str) -> Option<(String, String)> {
    let rest = id.strip_prefix("peer-")?;
    if rest.len() < 9 {
        return None;
    }
    let (slug, tail) = rest.split_at(8);
    if !slug.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    let raw = tail.strip_prefix('-')?;
    if raw.is_empty() {
        return None;
    }
    Some((slug.to_string(), raw.to_string()))
}

// --- frontend commands --------------------------------------------------------

/// Pair with a new host, given one or more candidate addresses (an invite may
/// carry a LAN IP and a Tailscale IP): dial each in order until one pairs, persist
/// that working address with the token + slug, and open its connection. If `alias`
/// is blank the host's own name (from the paired reply) is used.
#[tauri::command]
pub async fn peer_add(
    hub: State<'_, PeerClientHub>,
    hosts: Vec<String>,
    port: u16,
    code: String,
    alias: String,
) -> Result<Value, String> {
    let hub = hub.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let port = if port == 0 { 8766 } else { port };
        let (host, device_id, token, slug, host_name) =
            first_successful(&hosts, |h| dial_pair(h, port, &code))?;
        let alias = if alias.trim().is_empty() { host_name } else { alias };
        {
            let mut cfg = hub.inner.config.lock().unwrap();
            cfg.peers.retain(|p| p.slug != slug);
            cfg.peers.push(PeerEntry {
                slug: slug.clone(),
                alias,
                host,
                port,
                device_id,
                token,
                enabled: true,
                last_sync_at: 0,
            });
            let snapshot = cfg.clone();
            drop(cfg);
            peer::save_config(&snapshot)?;
        }
        hub.start_conn(&slug);
        emit_state_changed(&hub);
        Ok(json!({ "slug": slug }))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Try each candidate host in order with `dial`; the first success wins, returning
/// (workingHost, deviceId, token, slug, hostName). If all fail, the last failure
/// is surfaced. Split out from `peer_add` so the ordering/fallback is unit-testable
/// without real sockets.
fn first_successful<F>(
    hosts: &[String],
    mut dial: F,
) -> Result<(String, String, String, String, String), String>
where
    F: FnMut(&str) -> Result<(String, String, String, String), String>,
{
    let mut last_err = "no candidate addresses".to_string();
    for host in hosts {
        match dial(host) {
            Ok((device_id, token, slug, host_name)) => {
                return Ok((host.clone(), device_id, token, slug, host_name))
            }
            Err(e) => last_err = e,
        }
    }
    Err(format!("could not reach the other Mac: {last_err}"))
}

/// One-shot pairing handshake, returning (deviceId, token, slug, hostName).
fn dial_pair(host: &str, port: u16, code: &str) -> Result<(String, String, String, String), String> {
    let mut ws = connect_ws_timeout(host, port, CONNECT_TIMEOUT)?;
    ws.send(Message::text(
        json!({ "t": "pair", "code": code, "name": local_name() }).to_string(),
    ))
    .map_err(|e| e.to_string())?;
    let reply = loop {
        match ws.read() {
            Ok(m) if m.is_text() => break m.to_text().unwrap_or_default().to_string(),
            Ok(m) if m.is_close() => return Err("host closed the connection".to_string()),
            Ok(_) => continue,
            Err(e) => return Err(e.to_string()),
        }
    };
    let _ = ws.close(None);
    let _ = ws.flush();
    let v: Value = serde_json::from_str(&reply).map_err(|e| e.to_string())?;
    if v.get("t").and_then(Value::as_str) != Some("paired") {
        let err = v.get("error").and_then(Value::as_str).unwrap_or("pairing rejected");
        return Err(err.to_string());
    }
    let device_id = v.get("deviceId").and_then(Value::as_str).unwrap_or_default().to_string();
    let token = v.get("token").and_then(Value::as_str).unwrap_or_default().to_string();
    let slug = v.get("slug").and_then(Value::as_str).unwrap_or_default().to_string();
    let host_name = v.get("hostName").and_then(Value::as_str).unwrap_or("Mac").to_string();
    if device_id.is_empty() || token.is_empty() || slug.len() != 8 {
        return Err("host sent an incomplete pairing reply".to_string());
    }
    Ok((device_id, token, slug, host_name))
}

#[tauri::command]
pub async fn peer_remove(hub: State<'_, PeerClientHub>, slug: String) -> Result<Value, String> {
    hub.stop_conn(&slug);
    {
        let mut cfg = hub.inner.config.lock().unwrap();
        cfg.peers.retain(|p| p.slug != slug);
        let snapshot = cfg.clone();
        drop(cfg);
        peer::save_config(&snapshot)?;
    }
    emit_state_changed(&hub);
    Ok(hub.peers_state())
}

#[tauri::command]
pub async fn peer_set_enabled(
    hub: State<'_, PeerClientHub>,
    slug: String,
    enabled: bool,
) -> Result<Value, String> {
    {
        let mut cfg = hub.inner.config.lock().unwrap();
        if let Some(p) = cfg.peers.iter_mut().find(|p| p.slug == slug) {
            p.enabled = enabled;
        }
        let snapshot = cfg.clone();
        drop(cfg);
        peer::save_config(&snapshot)?;
    }
    if enabled {
        hub.start_conn(&slug);
    } else {
        hub.stop_conn(&slug);
    }
    emit_state_changed(&hub);
    Ok(hub.peers_state())
}

/// Forward a routed command to its peer and block on the reply (off the UI thread
/// via spawn_blocking, per the sync-commands-freeze-the-app convention).
#[tauri::command]
pub async fn peer_invoke(
    hub: State<'_, PeerClientHub>,
    slug: String,
    cmd: String,
    args: Value,
) -> Result<Value, String> {
    let hub = hub.inner().clone();
    tauri::async_runtime::spawn_blocking(move || hub.invoke_blocking(&slug, &cmd, args))
        .await
        .map_err(|e| e.to_string())?
}

/// Compute the config-sync diff against a paired Mac: exchange portable digests
/// and return the items that differ (each with its newest-wins direction) plus
/// the last successful sync time. Off the UI thread — it does blocking WS IO.
#[tauri::command]
pub async fn peer_sync_status(hub: State<'_, PeerClientHub>, slug: String) -> Result<Value, String> {
    let hub = hub.inner().clone();
    tauri::async_runtime::spawn_blocking(move || hub.sync_status(&slug))
        .await
        .map_err(|e| e.to_string())?
}

/// Apply a previously-previewed config-sync plan both directions and record the
/// sync time. Each side that receives changes snapshots ~/.lpm first.
#[tauri::command]
pub async fn peer_sync_run(
    hub: State<'_, PeerClientHub>,
    slug: String,
    items: Vec<crate::peersync::SyncItem>,
) -> Result<Value, String> {
    let hub = hub.inner().clone();
    tauri::async_runtime::spawn_blocking(move || hub.sync_run(&slug, items))
        .await
        .map_err(|e| e.to_string())?
}

/// Track a terminal the frontend opened and subscribe to its host stream (seed +
/// live output). Attachment is remembered so a reconnect re-subscribes.
#[tauri::command]
pub fn peer_term_attach(hub: State<'_, PeerClientHub>, id: String) -> Result<(), String> {
    let (slug, raw) = parse_prefixed(&id).ok_or_else(|| "not a peer terminal id".to_string())?;
    let conn = hub
        .inner
        .conns
        .lock()
        .unwrap()
        .get(&slug)
        .cloned()
        .ok_or_else(|| "unknown peer".to_string())?;
    conn.attached.lock().unwrap().insert(raw.clone());
    let _ = conn.send(json!({ "t": "sub", "id": raw }).to_string());
    Ok(())
}

#[tauri::command]
pub fn peer_term_detach(hub: State<'_, PeerClientHub>, id: String) -> Result<(), String> {
    let Some((slug, raw)) = parse_prefixed(&id) else {
        return Ok(());
    };
    if let Some(conn) = hub.inner.conns.lock().unwrap().get(&slug).cloned() {
        conn.attached.lock().unwrap().remove(&raw);
        let _ = conn.send(json!({ "t": "unsub", "id": raw }).to_string());
    }
    Ok(())
}

/// This Mac's user-facing name, sent to the host at pairing so its device list is
/// readable. Reuses the host module's resolver.
fn local_name() -> String {
    peer::machine_name()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_prefixed_splits_slug_and_raw_id() {
        assert_eq!(
            parse_prefixed("peer-abcd1234-web-3"),
            Some(("abcd1234".to_string(), "web-3".to_string()))
        );
        // Raw ids can themselves contain dashes — only the first 8 chars are the slug.
        assert_eq!(
            parse_prefixed("peer-00ff00ff-My_app-12"),
            Some(("00ff00ff".to_string(), "My_app-12".to_string()))
        );
    }

    #[test]
    fn parse_prefixed_rejects_malformed() {
        assert_eq!(parse_prefixed("web-3"), None); // no peer- prefix
        assert_eq!(parse_prefixed("peer-abcd1234"), None); // no raw id
        assert_eq!(parse_prefixed("peer-abcd1234-"), None); // empty raw id
        assert_eq!(parse_prefixed("peer-zzzz1234-web"), None); // non-hex slug
        assert_eq!(parse_prefixed("peer-abc-web"), None); // slug too short
    }

    #[test]
    fn peers_state_reports_disconnected_for_unstarted_peer() {
        let cfg = Arc::new(Mutex::new(peer::PeerConfig {
            peers: vec![PeerEntry {
                slug: "aabbccdd".into(),
                alias: "Laptop".into(),
                host: "h".into(),
                port: 8766,
                enabled: true,
                ..Default::default()
            }],
            ..Default::default()
        }));
        let hub = PeerClientHub::new(cfg);
        let rows = hub.peers_state();
        let row = &rows.as_array().unwrap()[0];
        assert_eq!(row.get("slug").and_then(Value::as_str), Some("aabbccdd"));
        assert_eq!(row.get("connected").and_then(Value::as_bool), Some(false));
        assert_eq!(row.get("enabled").and_then(Value::as_bool), Some(true));
    }

    #[test]
    fn invoke_on_unknown_peer_errors() {
        let hub = PeerClientHub::default();
        assert!(hub.invoke_blocking("nope", "list_projects", json!({})).is_err());
    }

    fn paired(host_name: &str) -> Result<(String, String, String, String), String> {
        Ok(("dev".into(), "tok".into(), "abcd1234".into(), host_name.into()))
    }

    #[test]
    fn first_successful_picks_earliest_working_host() {
        let hosts = vec!["10.0.0.1".to_string(), "10.0.0.2".to_string(), "10.0.0.3".to_string()];
        // The first two are dead; the third pairs — so it wins, and its address is
        // the one persisted.
        let (host, _, _, slug, name) = first_successful(&hosts, |h| {
            if h == "10.0.0.3" {
                paired("Studio")
            } else {
                Err(format!("dead {h}"))
            }
        })
        .unwrap();
        assert_eq!(host, "10.0.0.3");
        assert_eq!(slug, "abcd1234");
        assert_eq!(name, "Studio"); // hostName passthrough drives the auto-alias
    }

    #[test]
    fn first_successful_prefers_the_first_when_several_work() {
        let hosts = vec!["a".to_string(), "b".to_string()];
        let (host, ..) = first_successful(&hosts, |_| paired("Host")).unwrap();
        assert_eq!(host, "a");
    }

    #[test]
    fn first_successful_all_fail_surfaces_last_error() {
        let hosts = vec!["a".to_string(), "b".to_string()];
        let err = first_successful(&hosts, |h| {
            Err::<(String, String, String, String), _>(format!("refused {h}"))
        })
        .unwrap_err();
        assert!(err.contains("refused b"), "last failure surfaced: {err}");
    }

    #[test]
    fn first_successful_empty_list_errors() {
        let err = first_successful(&[], |_| paired("x")).unwrap_err();
        assert!(err.contains("no candidate addresses"), "{err}");
    }
}
