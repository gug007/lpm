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
use std::io::{self, Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, SyncSender, TryRecvError};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use tungstenite::{Error as WsError, Message, WebSocket};

const POLL: Duration = Duration::from_millis(25);
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(3); // per-candidate dial cap when pairing
const PAIR_REQUEST_WINDOW: Duration = Duration::from_secs(150); // wait for the other Mac to approve
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
    supports_sync: AtomicBool,  // host advertised the configSync feature in `ready`
    supports_sync2: AtomicBool, // host also advertised configSync2 (revision-aware)
    generation: AtomicU64,      // bump to retire the current connection thread
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
            supports_sync2: AtomicBool::new(false),
            generation: AtomicU64::new(0),
        }
    }

    fn send(&self, frame: String) -> Result<(), String> {
        match self.out.lock().unwrap().as_ref() {
            Some(tx) => tx
                .try_send(frame)
                .map_err(|_| "peer send queue full".to_string()),
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
    pair_gen: AtomicU64, // bumped to cancel an in-flight tap-to-approve request
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
                pair_gen: AtomicU64::new(0),
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
                let connected = conn
                    .map(|c| c.connected.load(Ordering::Relaxed))
                    .unwrap_or(false);
                let supports_sync = conn
                    .map(|c| c.supports_sync.load(Ordering::Relaxed))
                    .unwrap_or(false);
                let last_error = conn
                    .map(|c| c.last_error.lock().unwrap().clone())
                    .unwrap_or_default();
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
        let conn = conns
            .entry(slug.to_string())
            .or_insert_with(|| Arc::new(PeerConn::new(slug)))
            .clone();
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

    fn emit_pair_failed(&self, error: &str) {
        if let Some(app) = self.app() {
            let _ = app.emit("peer-pair-failed", json!({ "error": error }));
        }
    }

    /// Drive a tap-to-approve pairing request against a discovered Mac: dial the
    /// first reachable candidate, send `pairRequest`, surface the SAS via
    /// `peer-pair-pending`, and wait (staying cancellable) for the host's `paired`.
    /// On success persist the peer and open its connection; if the reply asks for
    /// reciprocal pairing, enable our own hosting and hand the requester an invite
    /// so it can dial back. Runs blocking, off the UI thread.
    fn pair_request_blocking(&self, hosts: Vec<String>, port: u16) -> Result<Value, String> {
        let port = if port == 0 { 8766 } else { port };
        // A fresh request supersedes any prior in-flight one (and is itself
        // cancelled when peer_pair_cancel bumps the counter again).
        let generation = self.inner.pair_gen.fetch_add(1, Ordering::SeqCst) + 1;

        let mut chosen: Option<(WebSocket<TcpStream>, String)> = None;
        let mut last_err = "no candidate addresses".to_string();
        for h in &hosts {
            match connect_ws_timeout(h, port, CONNECT_TIMEOUT) {
                Ok(ws) => {
                    chosen = Some((ws, h.clone()));
                    break;
                }
                Err(e) => last_err = e,
            }
        }
        let (mut ws, host) = match chosen {
            Some(v) => v,
            None => {
                let e = format!("could not reach the other Mac: {last_err}");
                self.emit_pair_failed(&e);
                return Err(e);
            }
        };

        if let Err(e) = ws.send(Message::text(
            json!({ "t": "pairRequest", "name": local_name() }).to_string(),
        )) {
            let e = e.to_string();
            self.emit_pair_failed(&e);
            return Err(e);
        }
        let _ = ws.get_ref().set_read_timeout(Some(POLL));

        let deadline = Instant::now() + PAIR_REQUEST_WINDOW;
        loop {
            if self.inner.pair_gen.load(Ordering::SeqCst) != generation {
                let _ = ws.close(None);
                let _ = ws.flush();
                return Err("pairing cancelled".to_string());
            }
            if Instant::now() >= deadline {
                let e = "pairing request timed out".to_string();
                self.emit_pair_failed(&e);
                return Err(e);
            }
            match ws.read() {
                Ok(m) if m.is_close() => {
                    let e = "the other Mac closed the connection".to_string();
                    self.emit_pair_failed(&e);
                    return Err(e);
                }
                Ok(m) if m.is_text() => {
                    let Ok(txt) = m.to_text() else { continue };
                    let Ok(v) = serde_json::from_str::<Value>(txt) else {
                        continue;
                    };
                    match v.get("t").and_then(Value::as_str).unwrap_or_default() {
                        "pairPending" => {
                            let sas = v.get("sas").and_then(Value::as_str).unwrap_or_default();
                            if let Some(app) = self.app() {
                                let _ = app
                                    .emit("peer-pair-pending", json!({ "sas": sas, "host": host }));
                            }
                        }
                        "paired" => {
                            return self.finish_pair_request(&mut ws, &v, &host, port);
                        }
                        "error" => {
                            let e = v
                                .get("error")
                                .and_then(Value::as_str)
                                .unwrap_or("pairing rejected")
                                .to_string();
                            self.emit_pair_failed(&e);
                            return Err(e);
                        }
                        _ => {}
                    }
                }
                Ok(_) => {}
                Err(WsError::Io(ref e))
                    if e.kind() == std::io::ErrorKind::WouldBlock
                        || e.kind() == std::io::ErrorKind::TimedOut => {}
                Err(WsError::ConnectionClosed) | Err(WsError::AlreadyClosed) => {
                    let e = "the other Mac closed the connection".to_string();
                    self.emit_pair_failed(&e);
                    return Err(e);
                }
                Err(e) => {
                    let e = e.to_string();
                    self.emit_pair_failed(&e);
                    return Err(e);
                }
            }
        }
    }

    /// Persist the paired host from a `paired` reply, start its connection, and — if
    /// the host asked for reciprocal pairing — enable our own hosting and send back
    /// a `reciprocalInvite` so the host can dial us. Returns the new slug.
    fn finish_pair_request(
        &self,
        ws: &mut WebSocket<TcpStream>,
        reply: &Value,
        host: &str,
        port: u16,
    ) -> Result<Value, String> {
        let s = |k: &str| {
            reply
                .get(k)
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string()
        };
        let device_id = s("deviceId");
        let token = s("token");
        let slug = s("slug");
        let host_id = s("hostId");
        let host_name = {
            let n = s("hostName");
            if n.is_empty() {
                "Mac".to_string()
            } else {
                n
            }
        };
        if device_id.is_empty() || token.is_empty() || slug.len() != 8 {
            let e = "the other Mac sent an incomplete pairing reply".to_string();
            self.emit_pair_failed(&e);
            return Err(e);
        }
        {
            let mut cfg = self.inner.config.lock().unwrap();
            cfg.peers.retain(|p| p.slug != slug);
            cfg.peers.push(PeerEntry {
                slug: slug.clone(),
                alias: host_name,
                host: host.to_string(),
                port,
                device_id,
                token,
                host_id,
                // Tap-to-approve pairs over the transitional plaintext handshake, so
                // there is no verified leaf yet; the first authed session captures and
                // pins it (pin-after-auth).
                tls_fp: None,
                enabled: true,
                last_sync_at: 0,
            });
            let snapshot = cfg.clone();
            drop(cfg);
            peer::save_config(&snapshot)?;
        }
        self.start_conn(&slug);
        emit_state_changed(self);

        if reply.get("reciprocal").and_then(Value::as_bool) == Some(true) {
            self.offer_reciprocal(ws);
        }
        let _ = ws.close(None);
        let _ = ws.flush();
        Ok(json!({ "slug": slug }))
    }

    /// Enable this Mac's hosting and send the still-open socket a `reciprocalInvite`
    /// so the host can pair back and control this Mac too. Never clobbers a manual
    /// invite already in progress — an outstanding code is reused.
    fn offer_reciprocal(&self, ws: &mut WebSocket<TcpStream>) {
        let Some(app) = self.app() else { return };
        let (code, out_port, out_hosts) = {
            let mut cfg = self.inner.config.lock().unwrap();
            cfg.host.enabled = true;
            cfg.host.lan = true;
            if cfg.host.pairing_code.is_empty() {
                cfg.host.pairing_code = peer::gen_pairing_code();
            }
            let code = cfg.host.pairing_code.clone();
            let out_port = peer::effective_port(cfg.host.port);
            let snapshot = cfg.clone();
            drop(cfg);
            let _ = peer::save_config(&snapshot);
            (code, out_port, peer::candidate_hosts())
        };
        let peer_hub = app.state::<peer::PeerHub>().inner().clone();
        peer::apply(&peer_hub, &app);
        let _ = ws.send(Message::text(
            json!({ "t": "reciprocalInvite", "code": code, "port": out_port, "hosts": out_hosts })
                .to_string(),
        ));
        let _ = ws.flush();
    }

    fn invoke_blocking(&self, slug: &str, cmd: &str, args: Value) -> Result<Value, String> {
        self.request_blocking(
            slug,
            INVOKE_TIMEOUT,
            |req| json!({ "t": "invoke", "reqId": req, "cmd": cmd, "args": args }),
        )
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

    /// Whether the peer's host advertised configSync2 (revision-aware sync).
    fn supports_sync2(&self, slug: &str) -> bool {
        self.inner
            .conns
            .lock()
            .unwrap()
            .get(slug)
            .map(|c| c.supports_sync2.load(Ordering::Relaxed))
            .unwrap_or(false)
    }

    /// Ask the host for its digest map. A configSync2 exchange carries this Mac's
    /// sidecar id and asks for revisions + tombstones; a legacy exchange asks for
    /// the pre-Phase-2 map.
    fn fetch_remote_map(&self, slug: &str, sync2: bool) -> Result<crate::peersync::DigestMap, String> {
        let frame = if sync2 {
            json!({ "t": "syncDigest", "v": 2, "device": crate::syncstate::device_id() })
        } else {
            json!({ "t": "syncDigest", "v": 1 })
        };
        let remote_v = self.request_blocking(slug, SYNC_TIMEOUT, |req| {
            let mut f = frame.clone();
            f["reqId"] = json!(req);
            f
        })?;
        serde_json::from_value(remote_v).map_err(|e| format!("bad digest reply: {e}"))
    }

    /// The plan against a peer: revision-based when both sides speak configSync2 and
    /// the host sent its sidecar id, else the legacy mtime plan.
    fn plan_for(
        &self,
        local: &crate::peersync::DigestMap,
        remote: &crate::peersync::DigestMap,
        sync2: bool,
    ) -> Vec<crate::peersync::SyncItem> {
        if sync2 && !remote.device.is_empty() {
            let bases = crate::syncstate::peer_bases(&remote.device);
            crate::peersync::compute_plan_v2(local, remote, &bases)
        } else {
            crate::peersync::compute_plan(local, remote)
        }
    }

    /// Exchange digests with the peer and return the diff plan plus the persisted
    /// last-sync time.
    fn sync_status(&self, slug: &str) -> Result<Value, String> {
        self.require_sync_peer(slug)?;
        let sync2 = self.supports_sync2(slug);
        let remote = self.fetch_remote_map(slug, sync2)?;
        let local = crate::peersync::local_digest_map();
        let items = self.plan_for(&local, &remote, sync2);
        let last = self.peer_entry(slug).map(|p| p.last_sync_at).unwrap_or(0);
        Ok(json!({ "items": items, "lastSyncAt": last }))
    }

    /// Run the sync both directions. The plan is recomputed here against a fresh
    /// digest exchange (the preview the UI showed is advisory), so a config edit
    /// between preview and run can't apply a stale direction. Pulls are applied
    /// after a local backup; pushes are sent for the host to back up + apply. When
    /// both Macs speak configSync2 the revision sidecar is updated for every unit
    /// synced (and every unit already in sync), keyed by the other Mac's id.
    fn sync_run(&self, slug: &str, _hint: Vec<crate::peersync::SyncItem>) -> Result<Value, String> {
        self.require_sync_peer(slug)?;
        let sync2 = self.supports_sync2(slug);
        let remote = self.fetch_remote_map(slug, sync2)?;
        let local = crate::peersync::local_digest_map();
        let v2 = sync2 && !remote.device.is_empty();
        let self_id = local.device.clone();
        let remote_id = remote.device.clone();
        let plan = self.plan_for(&local, &remote, sync2);
        let (to_local, to_remote): (Vec<_>, Vec<_>) =
            plan.into_iter().partition(|i| i.direction == "toLocal");

        let mut applied = 0u64;
        let mut pushed = 0u64;
        let mut errors: Vec<String> = Vec::new();
        let mut backup_path = String::new();
        let mut item_updates: Vec<(String, crate::syncstate::ItemState)> = Vec::new();
        let mut base_updates: Vec<(String, crate::syncstate::BaseState)> = Vec::new();

        if !to_local.is_empty() {
            let live: Vec<&crate::peersync::SyncItem> =
                to_local.iter().filter(|i| !i.deleted).collect();
            let fetched: Vec<crate::peersync::WireItem> = if live.is_empty() {
                Vec::new()
            } else {
                let req_items: Vec<Value> = live
                    .iter()
                    .map(|i| json!({ "kind": i.kind, "name": i.name }))
                    .collect();
                let resp = self.request_blocking(
                    slug,
                    SYNC_TIMEOUT,
                    |req| json!({ "t": "syncFetch", "v": 1, "reqId": req, "items": req_items }),
                )?;
                serde_json::from_value(resp.get("items").cloned().unwrap_or_else(|| json!([])))
                    .map_err(|e| format!("bad fetch reply: {e}"))?
            };
            match crate::transfer::snapshot_backup() {
                Ok(path) => {
                    backup_path = path;
                    for it in &fetched {
                        let key = crate::peersync::item_key(&it.kind, &it.name);
                        match crate::peersync::apply_item(it) {
                            Ok(ap) => {
                                applied += 1;
                                if v2 {
                                    if let Some(rd) = remote.get(&it.kind, &it.name) {
                                        let local_rev =
                                            local.get(&it.kind, &it.name).map(|d| d.rev).unwrap_or(0);
                                        let (istate, base) = crate::syncstate::received_state(
                                            &rd.hash, rd.rev, &rd.device, false, &ap.stored, local_rev,
                                            &self_id,
                                        );
                                        item_updates.push((key.clone(), istate));
                                        base_updates.push((key, base));
                                    }
                                }
                            }
                            Err(e) => errors.push(format!("{}/{}: {e}", it.kind, it.name)),
                        }
                    }
                    for i in to_local.iter().filter(|i| i.deleted) {
                        let key = crate::peersync::item_key(&i.kind, &i.name);
                        match crate::peersync::delete_global(&i.name) {
                            Ok(()) => {
                                applied += 1;
                                if v2 {
                                    if let Some(rd) = remote.get(&i.kind, &i.name) {
                                        let local_rev =
                                            local.get(&i.kind, &i.name).map(|d| d.rev).unwrap_or(0);
                                        let (istate, base) = crate::syncstate::received_state(
                                            "", rd.rev, &rd.device, true, "", local_rev, &self_id,
                                        );
                                        item_updates.push((key.clone(), istate));
                                        base_updates.push((key, base));
                                    }
                                }
                            }
                            Err(e) => errors.push(format!("{}/{}: {e}", i.kind, i.name)),
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

        // Persist the pull results and the bases of units already in sync BEFORE any
        // push traffic: a push failure below must neither roll these back nor, if the
        // syncApply request errors and returns early, drop sidecar updates for pulls
        // that already reached disk.
        if v2 {
            for (k, b) in crate::peersync::converged_bases(&local, &remote) {
                base_updates.push((k, b));
            }
            commit_sidecar(&remote_id, &item_updates, &base_updates);
        }

        if !to_remote.is_empty() {
            let mut wire: Vec<Value> = Vec::new();
            let mut push_bases: Vec<(String, crate::syncstate::BaseState)> = Vec::new();
            for i in &to_remote {
                let key = crate::peersync::item_key(&i.kind, &i.name);
                let ld = local.get(&i.kind, &i.name);
                if i.deleted {
                    let (rev, device) = ld
                        .map(|d| (d.rev, d.device.clone()))
                        .unwrap_or((0, String::new()));
                    let w = crate::peersync::WireItem {
                        kind: i.kind.clone(),
                        name: i.name.clone(),
                        enc: "text".into(),
                        content: String::new(),
                        mtime: 0,
                        deleted: true,
                        rev,
                        device,
                    };
                    if let Ok(val) = serde_json::to_value(&w) {
                        wire.push(val);
                        if v2 {
                            push_bases.push((
                                key,
                                crate::syncstate::BaseState {
                                    rev,
                                    digest: String::new(),
                                    deleted: true,
                                },
                            ));
                        }
                    }
                } else {
                    match crate::peersync::read_item(&i.kind, &i.name) {
                        Ok(mut w) => {
                            if let Some(d) = ld {
                                w.rev = d.rev;
                                w.device = d.device.clone();
                            }
                            if let Ok(val) = serde_json::to_value(&w) {
                                wire.push(val);
                                if v2 {
                                    if let Some(d) = ld {
                                        push_bases.push((
                                            key,
                                            crate::syncstate::BaseState {
                                                rev: d.rev,
                                                digest: d.hash.clone(),
                                                deleted: false,
                                            },
                                        ));
                                    }
                                }
                            }
                        }
                        Err(e) => errors.push(format!("read {}/{}: {e}", i.kind, i.name)),
                    }
                }
            }
            if !wire.is_empty() {
                let ver = if v2 { 2 } else { 1 };
                let dev = self_id.clone();
                let sent = wire.len();
                let resp = self.request_blocking(slug, SYNC_APPLY_TIMEOUT, |req| {
                    json!({ "t": "syncApply", "v": ver, "reqId": req, "device": dev, "items": wire })
                })?;
                let host_applied = resp.get("applied").and_then(Value::as_u64).unwrap_or(0);
                pushed += host_applied;
                let host_errors = resp.get("errors").and_then(Value::as_array);
                let host_error_count = host_errors.map(|a| a.len()).unwrap_or(0);
                if let Some(errs) = host_errors {
                    for e in errs {
                        if let Some(s) = e.as_str() {
                            errors.push(format!("other Mac: {s}"));
                        }
                    }
                }
                // Record the pushed units' bases only when the host applied ALL of
                // them cleanly. On any partial failure skip every one, so the next
                // run re-plans them as local-moved fast-forwards and cleanly retries
                // the push rather than inferring the wrong direction from a stale
                // host copy.
                if v2 && push_fully_applied(sent, host_applied, host_error_count) {
                    commit_sidecar(&remote_id, &[], &push_bases);
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
        Ok(
            json!({ "applied": applied, "pushed": pushed, "errors": errors, "backupPath": backup_path }),
        )
    }
}

// --- sync sidecar helpers -----------------------------------------------------

/// Whether a syncApply fully succeeded, so the client may record the pushed units'
/// bases. All-or-nothing: any host-side error, or fewer applied than sent, means
/// skip every push base so the next run re-plans and retries the push.
fn push_fully_applied(sent: usize, host_applied: u64, host_error_count: usize) -> bool {
    host_error_count == 0 && host_applied == sent as u64
}

/// Write the given item states and bases (bases keyed under `remote_id`) to the
/// sidecar in one locked read-modify-write. A no-op when there is nothing to store.
fn commit_sidecar(
    remote_id: &str,
    items: &[(String, crate::syncstate::ItemState)],
    bases: &[(String, crate::syncstate::BaseState)],
) {
    if items.is_empty() && bases.is_empty() {
        return;
    }
    crate::syncstate::mutate(|s| {
        for (k, istate) in items {
            s.set_item(k, istate.clone());
        }
        for (k, base) in bases {
            s.set_base(remote_id, k, base.clone());
        }
        (true, ())
    });
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
        conn.supports_sync2.store(false, Ordering::Relaxed);
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

// --- encrypted transport (wss with a pinned self-signed leaf) -----------------
//
// A paired host presents its own long-lived leaf (the same cert the mobile server
// uses — see remotetls.rs). The client pins that leaf by SHA-256: an entry with a
// stored `tls_fp` connects wss-only and verifies it, never downgrading; an entry
// without one (paired before this shipped, or via tap-to-approve) connects wss
// capturing the leaf and pins it after the host proves the shared token, and falls
// back to plaintext only if the TLS layer itself fails — an old host still on the
// transitional plaintext acceptor. `peertls.rs` holds the rustls verifiers.

/// Stable, user-facing markers for a failed pin. Shown verbatim in the peer row's
/// status; deliberately in product terms (no transport jargon).
const IDENTITY_CHANGED: &str = "the other Mac's identity changed — remove it and pair again";
const IDENTITY_UNVERIFIED: &str = "couldn't verify the other Mac's identity — get a fresh invite and try again";

/// One client connection's transport: a raw socket (legacy plaintext host) or a
/// pinned/captured TLS session. One concrete type keeps the session loop monomorphic.
enum ClientStream {
    Plain(TcpStream),
    Tls(Box<rustls::StreamOwned<rustls::ClientConnection, TcpStream>>),
}

impl ClientStream {
    fn tcp(&self) -> &TcpStream {
        match self {
            ClientStream::Plain(s) => s,
            ClientStream::Tls(t) => t.get_ref(),
        }
    }
}

impl Read for ClientStream {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        match self {
            ClientStream::Plain(s) => s.read(buf),
            ClientStream::Tls(t) => t.read(buf),
        }
    }
}

impl Write for ClientStream {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        match self {
            ClientStream::Plain(s) => s.write(buf),
            ClientStream::Tls(t) => t.write(buf),
        }
    }
    fn flush(&mut self) -> io::Result<()> {
        match self {
            ClientStream::Plain(s) => s.flush(),
            ClientStream::Tls(t) => t.flush(),
        }
    }
}

type ClientWs = WebSocket<ClientStream>;

/// Open a socket, optionally capping the TCP connect (per-candidate dials), and set
/// the handshake read timeout. `None` timeout uses the OS default (the persistent
/// reconnect path).
fn tcp_connect(host: &str, port: u16, timeout: Option<Duration>) -> Result<TcpStream, String> {
    let tcp = match timeout {
        Some(t) => {
            let addr = (host, port)
                .to_socket_addrs()
                .map_err(|e| e.to_string())?
                .next()
                .ok_or_else(|| format!("could not resolve {host}"))?;
            TcpStream::connect_timeout(&addr, t).map_err(|e| e.to_string())?
        }
        None => TcpStream::connect((host, port)).map_err(|e| e.to_string())?,
    };
    let _ = tcp.set_nodelay(true);
    let _ = tcp.set_read_timeout(Some(HANDSHAKE_TIMEOUT));
    Ok(tcp)
}

/// Complete the WebSocket handshake over a live TLS session. The TLS handshake has
/// already run (via `complete_io`), so the leaf was verified/captured before this.
fn finish_tls_ws(
    conn: rustls::ClientConnection,
    tcp: TcpStream,
    host: &str,
    port: u16,
) -> Result<ClientWs, String> {
    let tls = rustls::StreamOwned::new(conn, tcp);
    let url = format!("ws://{host}:{port}/");
    let (ws, _) =
        tungstenite::client(url, ClientStream::Tls(Box::new(tls))).map_err(|e| e.to_string())?;
    Ok(ws)
}

/// wss, verifying the host's leaf against `fp`. A TCP-reach failure surfaces as-is;
/// a TLS-handshake failure means the presented leaf did not match the pin and
/// surfaces as `mismatch_err`. Never downgrades to plaintext.
fn dial_pinned(
    host: &str,
    port: u16,
    fp: &str,
    timeout: Option<Duration>,
    mismatch_err: &'static str,
) -> Result<ClientWs, String> {
    let mut tcp = tcp_connect(host, port, timeout)?;
    let mut conn =
        rustls::ClientConnection::new(crate::peertls::pinned_client_config(fp), crate::peertls::server_name())
            .map_err(|e| e.to_string())?;
    conn.complete_io(&mut tcp).map_err(|_| mismatch_err.to_string())?;
    finish_tls_ws(conn, tcp, host, port)
}

/// wss accepting any leaf and recording its fingerprint. Used for an unpinned entry
/// (trust is deferred to the caller, which pins only after the host also proves the
/// shared token). Returns `(ws, capturedFingerprint)`.
fn dial_capture(
    host: &str,
    port: u16,
    timeout: Option<Duration>,
) -> Result<(ClientWs, String), String> {
    let mut tcp = tcp_connect(host, port, timeout)?;
    let slot = Arc::new(Mutex::new(None));
    let mut conn = rustls::ClientConnection::new(
        crate::peertls::capturing_client_config(slot.clone()),
        crate::peertls::server_name(),
    )
    .map_err(|e| e.to_string())?;
    conn.complete_io(&mut tcp).map_err(|e| e.to_string())?;
    let fp = slot
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "no peer certificate captured".to_string())?;
    let ws = finish_tls_ws(conn, tcp, host, port)?;
    Ok((ws, fp))
}

/// Plaintext WebSocket — the transitional path for a host that predates the
/// encrypted channel (its acceptor answers the TLS ClientHello as garbage).
fn dial_plain(host: &str, port: u16, timeout: Option<Duration>) -> Result<ClientWs, String> {
    let tcp = tcp_connect(host, port, timeout)?;
    let url = format!("ws://{host}:{port}/");
    let (ws, _) =
        tungstenite::client(url, ClientStream::Plain(tcp)).map_err(|e| e.to_string())?;
    Ok(ws)
}

/// Dial a persisted peer per its pin state, returning `(ws, wasTls, capturedFp)`.
/// Pinned → wss-only, no fallback. Unpinned → wss capturing the leaf, or plaintext
/// if the TLS layer fails.
fn dial_for_session(entry: &PeerEntry) -> Result<(ClientWs, bool, Option<String>), String> {
    match entry.tls_fp.as_deref() {
        Some(fp) => {
            let ws = dial_pinned(&entry.host, entry.port, fp, None, IDENTITY_CHANGED)?;
            Ok((ws, true, None))
        }
        None => match dial_capture(&entry.host, entry.port, None) {
            Ok((ws, fp)) => Ok((ws, true, Some(fp))),
            Err(_) => {
                let ws = dial_plain(&entry.host, entry.port, None)?;
                Ok((ws, false, None))
            }
        },
    }
}

/// The `tls_fp` to persist after a connection authenticates. An already-pinned entry
/// keeps its pin (`None` = no change); an unpinned entry pins the captured leaf once
/// the host proved the shared token — but never over a plaintext fallback.
fn pin_after_auth(existing: Option<&str>, was_tls: bool, leaf_fp: Option<&str>) -> Option<String> {
    if existing.is_some() || !was_tls {
        return None;
    }
    leaf_fp.map(str::to_string)
}

/// Record a pin-after-auth fingerprint on the peer entry (locked read-modify-write,
/// then persist + notify). A no-op when the entry is gone or already holds it.
fn persist_tls_fp(hub: &PeerClientHub, slug: &str, fp: &str) {
    let mut cfg = hub.inner.config.lock().unwrap();
    let changed = match cfg.peers.iter_mut().find(|p| p.slug == slug) {
        Some(p) if p.tls_fp.as_deref() != Some(fp) => {
            p.tls_fp = Some(fp.to_string());
            true
        }
        _ => false,
    };
    if !changed {
        return;
    }
    let snapshot = cfg.clone();
    drop(cfg);
    let _ = peer::save_config(&snapshot);
    emit_state_changed(hub);
}

/// Cap the TCP connect at `timeout` (via connect_timeout) so a dead candidate
/// address fails fast instead of blocking on the OS default. The plaintext dial for
/// tap-to-approve pairing, where several candidate addresses are tried in turn.
fn connect_ws_timeout(
    host: &str,
    port: u16,
    timeout: Duration,
) -> Result<WebSocket<TcpStream>, String> {
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
    let (mut ws, was_tls, captured_fp) = dial_for_session(entry)?;
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
        let err = rv
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("authentication failed");
        return Err(err.to_string());
    }
    // The host proved the shared token. Pin the leaf we captured if this entry was
    // not already pinned (an unpinned upgrade or a fresh unpinned pairing); a pinned
    // entry took the verifying wss path above and needs no change. Auth failure
    // returned already, so a stranger answering the port is never pinned.
    if let Some(fp) = pin_after_auth(entry.tls_fp.as_deref(), was_tls, captured_fp.as_deref()) {
        persist_tls_fp(hub, &conn.slug, &fp);
    }
    let features = rv.get("features").and_then(Value::as_array);
    let has_feature = |name: &str| {
        features
            .map(|a| a.iter().any(|f| f.as_str() == Some(name)))
            .unwrap_or(false)
    };
    conn.supports_sync
        .store(has_feature(crate::peersync::SYNC_FEATURE), Ordering::Relaxed);
    conn.supports_sync2
        .store(has_feature(crate::peersync::SYNC_FEATURE2), Ordering::Relaxed);

    let (tx, rx) = mpsc::sync_channel::<String>(OUT_QUEUE);
    *conn.out.lock().unwrap() = Some(tx);
    conn.connected.store(true, Ordering::Relaxed);
    conn.last_error.lock().unwrap().clear();
    let _ = ws.get_ref().tcp().set_read_timeout(Some(POLL));
    // Re-subscribe every terminal the frontend currently has open, so a reconnect
    // transparently reseeds them.
    for id in conn.attached.lock().unwrap().iter() {
        let _ = ws.write(Message::text(json!({ "t": "sub", "id": id }).to_string()));
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
            if ws
                .write(Message::text(json!({ "t": "ping" }).to_string()))
                .is_err()
            {
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
                Err(value
                    .as_str()
                    .map(str::to_string)
                    .unwrap_or_else(|| value.to_string()))
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
                let _ = app.emit(
                    &format!("peer-evt-{slug}"),
                    json!({ "name": name, "payload": payload }),
                );
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
    fp: Option<String>,
) -> Result<Value, String> {
    let hub = hub.inner().clone();
    tauri::async_runtime::spawn_blocking(move || add_peer_blocking(&hub, hosts, port, code, alias, fp))
        .await
        .map_err(|e| e.to_string())?
}

/// Ask a discovered Mac to pair via tap-to-approve (no invite). Emits
/// `peer-pair-pending` with the SAS to compare, then `peer-state-changed` on
/// success or `peer-pair-failed` on error/decline/timeout. Off the UI thread.
#[tauri::command]
pub async fn peer_pair_request(
    hub: State<'_, PeerClientHub>,
    hosts: Vec<String>,
    port: u16,
) -> Result<Value, String> {
    let hub = hub.inner().clone();
    tauri::async_runtime::spawn_blocking(move || hub.pair_request_blocking(hosts, port))
        .await
        .map_err(|e| e.to_string())?
}

/// Cancel an in-flight tap-to-approve request; the blocking loop notices on its
/// next poll tick and closes the socket (which the host reads as a hang-up).
#[tauri::command]
pub fn peer_pair_cancel(hub: State<'_, PeerClientHub>) {
    hub.inner.pair_gen.fetch_add(1, Ordering::SeqCst);
}

/// Dial each candidate host in turn, pair with the first that answers, persist the
/// working address + token + slug + host id, and open its connection. Shared by the
/// invite path (`peer_add`) and the reciprocal reverse-dial from peer.rs, so it must
/// stay blocking and self-contained (callers run it off the UI thread).
pub(crate) fn add_peer_blocking(
    hub: &PeerClientHub,
    hosts: Vec<String>,
    port: u16,
    code: String,
    alias: String,
    invite_fp: Option<String>,
) -> Result<Value, String> {
    let port = if port == 0 { 8766 } else { port };
    let (host, device_id, token, slug, host_name, host_id) =
        first_successful(&hosts, |h| dial_pair(h, port, &code, invite_fp.as_deref()))?;
    let alias = if alias.trim().is_empty() {
        host_name
    } else {
        alias
    };
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
            host_id,
            // A pasted invite carrying a fingerprint pins the host up front (its cert
            // was verified during the pairing handshake below). Without one, this stays
            // None and the first authed session pins the captured leaf.
            tls_fp: invite_fp,
            enabled: true,
            last_sync_at: 0,
        });
        let snapshot = cfg.clone();
        drop(cfg);
        peer::save_config(&snapshot)?;
    }
    hub.start_conn(&slug);
    emit_state_changed(hub);
    Ok(json!({ "slug": slug }))
}

/// Try each candidate host in order with `dial`; the first success wins, returning
/// (workingHost, deviceId, token, slug, hostName, hostId). If all fail, the last
/// failure is surfaced. Split out from `peer_add` so the ordering/fallback is
/// unit-testable without real sockets.
fn first_successful<F>(
    hosts: &[String],
    mut dial: F,
) -> Result<(String, String, String, String, String, String), String>
where
    F: FnMut(&str) -> Result<(String, String, String, String, String), String>,
{
    let mut last_err = "no candidate addresses".to_string();
    for host in hosts {
        match dial(host) {
            Ok((device_id, token, slug, host_name, host_id)) => {
                return Ok((host.clone(), device_id, token, slug, host_name, host_id))
            }
            Err(e) => last_err = e,
        }
    }
    Err(format!("could not reach the other Mac: {last_err}"))
}

/// One-shot pairing handshake, returning (deviceId, token, slug, hostName, hostId).
/// An invite fingerprint pins the host during the handshake (wss-only, verified —
/// the token is exchanged over a proven channel); without one the handshake goes
/// over wss unpinned, or plaintext against an old host, and the pin is established on
/// the first authed session instead.
fn dial_pair(
    host: &str,
    port: u16,
    code: &str,
    invite_fp: Option<&str>,
) -> Result<(String, String, String, String, String), String> {
    let mut ws = match invite_fp {
        Some(f) => dial_pinned(host, port, f, Some(CONNECT_TIMEOUT), IDENTITY_UNVERIFIED)?,
        None => match dial_capture(host, port, Some(CONNECT_TIMEOUT)) {
            Ok((ws, _fp)) => ws,
            Err(_) => dial_plain(host, port, Some(CONNECT_TIMEOUT))?,
        },
    };
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
        let err = v
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("pairing rejected");
        return Err(err.to_string());
    }
    let device_id = v
        .get("deviceId")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let token = v
        .get("token")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let slug = v
        .get("slug")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let host_name = v
        .get("hostName")
        .and_then(Value::as_str)
        .unwrap_or("Mac")
        .to_string();
    let host_id = v
        .get("hostId")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    if device_id.is_empty() || token.is_empty() || slug.len() != 8 {
        return Err("host sent an incomplete pairing reply".to_string());
    }
    Ok((device_id, token, slug, host_name, host_id))
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
pub async fn peer_sync_status(
    hub: State<'_, PeerClientHub>,
    slug: String,
) -> Result<Value, String> {
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
        assert!(hub
            .invoke_blocking("nope", "list_projects", json!({}))
            .is_err());
    }

    #[test]
    fn push_bases_recorded_only_when_host_applied_all_cleanly() {
        // Clean response: every sent item applied, no errors -> record the bases.
        assert!(push_fully_applied(3, 3, 0));
        // Host reported an error on some item -> skip all push bases.
        assert!(!push_fully_applied(3, 3, 1));
        // Fewer applied than sent (host dropped one) -> skip all.
        assert!(!push_fully_applied(3, 2, 0));
        assert!(!push_fully_applied(3, 0, 0));
        // Nothing sent (guarded out in practice): vacuously true, commit is a no-op.
        assert!(push_fully_applied(0, 0, 0));
    }

    #[test]
    fn pin_after_auth_only_pins_a_captured_leaf_on_an_unpinned_tls_connect() {
        // Already pinned: keep it, whatever the transport reported.
        assert_eq!(pin_after_auth(Some("aa"), true, Some("bb")), None);
        assert_eq!(pin_after_auth(Some("aa"), false, None), None);
        // Unpinned over TLS: pin the captured leaf (the host proved the token first).
        assert_eq!(pin_after_auth(None, true, Some("cc")), Some("cc".to_string()));
        // Unpinned over TLS but nothing captured (defensive): nothing to pin.
        assert_eq!(pin_after_auth(None, true, None), None);
        // Unpinned over plaintext fallback: never pin, even if a leaf leaked through.
        assert_eq!(pin_after_auth(None, false, None), None);
        assert_eq!(pin_after_auth(None, false, Some("dd")), None);
    }

    fn paired(host_name: &str) -> Result<(String, String, String, String, String), String> {
        Ok((
            "dev".into(),
            "tok".into(),
            "abcd1234".into(),
            host_name.into(),
            "host-id".into(),
        ))
    }

    #[test]
    fn first_successful_picks_earliest_working_host() {
        let hosts = vec![
            "10.0.0.1".to_string(),
            "10.0.0.2".to_string(),
            "10.0.0.3".to_string(),
        ];
        // The first two are dead; the third pairs — so it wins, and its address is
        // the one persisted.
        let (host, _, _, slug, name, host_id) = first_successful(&hosts, |h| {
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
        assert_eq!(host_id, "host-id");
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
            Err::<(String, String, String, String, String), _>(format!("refused {h}"))
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
