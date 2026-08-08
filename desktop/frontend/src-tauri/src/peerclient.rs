// Mac-to-Mac peer client connection manager.
//
// The client half of "Connections": for every remote machine this Mac has paired
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
const GIT_BRING_UNSUPPORTED: &str = "the other Mac needs to update lpm to send its changes";
/// A reachability failure rather than a refusal — a follower retries these with
/// backoff instead of pausing.
pub(crate) const PEER_NOT_CONNECTED: &str = "peer not connected";
pub(crate) const PEER_REQUEST_TIMED_OUT: &str = "peer request timed out";
const PING_INTERVAL: Duration = Duration::from_secs(20);
const BACKOFF_MIN: Duration = Duration::from_secs(1);
const BACKOFF_MAX: Duration = Duration::from_secs(30);
/// How long a connect attempt waits for the forward before calling it a failure.
/// Longer than a TCP dial because it includes ssh authenticating to the host.
const TUNNEL_WAIT: Duration = Duration::from_secs(20);
const OUT_QUEUE: usize = 1024;
/// Floor between two loss-triggered replay requests for the same terminal. Bytes
/// go missing because the host drops output frames for a client whose queue is
/// backing up, and a replay is more bytes down that same queue — so a stream that
/// keeps losing must not keep asking.
const RESYNC_MIN_INTERVAL: Duration = Duration::from_secs(2);
/// Prefix for a replay that rebuilds a pane from scratch: leave the alt buffer,
/// DECOM off, DECAWM on, G0 back to ASCII, drop the scroll region, reset SGR, then
/// clear screen + scrollback and home.
///
/// Deliberately NOT a soft reset (`ESC [ ! p`): xterm.js implements DECSTR by
/// resetting the DEC private modes to their defaults, which clears the modes the
/// remote program turned on at startup and will never advertise again — bracketed
/// paste above all, which this app reads off the emulator on its own send path.
/// Those are input-side modes; a replay only has to rebuild the screen.
const SCREEN_RESET: &str = "\x1b[?1049l\x1b[?6l\x1b[?7h\x1b(B\x1b[r\x1b[0m\x1b[2J\x1b[3J\x1b[H";

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
    // Per-terminal stream offset this Mac has already applied. Sent back as `sub`'s
    // `from` so a reconnect resumes with only the missed bytes instead of replaying
    // a mid-escape-sequence slice of the ring onto a half-reset emulator.
    offsets: Mutex<HashMap<String, u64>>,
    // When each terminal last asked the host to replay after detected byte loss.
    last_resync: Mutex<HashMap<String, Instant>>,
    pending: Mutex<HashMap<u64, Arc<Pending>>>,
    enabled: AtomicBool,
    supports_sync: AtomicBool, // host advertised the configSync feature in `ready`
    supports_sync2: AtomicBool, // host also advertised configSync2 (revision-aware)
    supports_git_bring: AtomicBool, // host can hand over its working state as a packfile
    supports_git_follow: AtomicBool, // host can also answer the working-state fingerprint
    supports_git_watch: AtomicBool, // ...and push changes instead of waiting to be asked
    generation: AtomicU64,     // bump to retire the current connection thread
    // Present only for a peer reached over SSH. Owned here so the forward is torn
    // down with the connection rather than outliving it as a stray ssh process.
    tunnel: Mutex<Option<crate::peertunnel::Tunnel>>,
}

/// Where a chunk sits relative to the stream already applied, given the chunk's
/// END offset and its byte length. `Some` is the position to hold after applying
/// it; `None` means bytes were lost and no position can be resumed from.
fn advance_offset(held: u64, end: u64, len: usize) -> Option<u64> {
    let start = end.saturating_sub(len as u64);
    if start > held {
        // The host drops output frames when a client's queue backs up, so a chunk
        // that starts past what we hold is the far side of a hole. Resuming after
        // one would hand back a stream missing those bytes for good, and nothing
        // downstream would ever repair it.
        None
    } else {
        // Starting at or before what we hold is an overlap, not a gap: the host
        // subscribes an id before it reads the ring, so the same bytes can arrive
        // once in the seed and again live. Keep the furthest point applied.
        Some(held.max(end))
    }
}

impl PeerConn {
    fn new(slug: &str) -> Self {
        PeerConn {
            slug: slug.to_string(),
            out: Mutex::new(None),
            connected: AtomicBool::new(false),
            last_error: Mutex::new(String::new()),
            tunnel: Mutex::new(None),
            attached: Mutex::new(HashSet::new()),
            offsets: Mutex::new(HashMap::new()),
            last_resync: Mutex::new(HashMap::new()),
            pending: Mutex::new(HashMap::new()),
            enabled: AtomicBool::new(true),
            supports_sync: AtomicBool::new(false),
            supports_sync2: AtomicBool::new(false),
            supports_git_bring: AtomicBool::new(false),
            supports_git_follow: AtomicBool::new(false),
            supports_git_watch: AtomicBool::new(false),
            generation: AtomicU64::new(0),
        }
    }

    fn send(&self, frame: String) -> Result<(), String> {
        match self.out.lock().unwrap().as_ref() {
            Some(tx) => tx
                .try_send(frame)
                .map_err(|_| "peer send queue full".to_string()),
            None => Err(PEER_NOT_CONNECTED.to_string()),
        }
    }

    /// The `sub` frame for a terminal, carrying `from` only when this Mac still
    /// holds a screen for it. Omitting `from` asks the host for a full reseed,
    /// which is also what an older host does with a `from` it can't honour.
    fn sub_frame(&self, id: &str) -> String {
        match self.offsets.lock().unwrap().get(id) {
            Some(&from) => json!({ "t": "sub", "id": id, "from": from }).to_string(),
            None => json!({ "t": "sub", "id": id }).to_string(),
        }
    }

    /// Subscribe a terminal's host stream and remember it for reconnects.
    ///
    /// `resume` is the caller's word that the emulator these bytes were being
    /// applied to is still on screen. Only the caller can know that: this state
    /// outlives the webview, so after a reload every pane is a blank emulator
    /// while the offsets still point deep into their streams — resuming there
    /// would deliver nothing but the bytes since, onto nothing.
    fn subscribe(&self, id: &str, resume: bool) {
        let already = !self.attached.lock().unwrap().insert(id.to_string());
        if !resume {
            // A blank emulator needs the screen rebuilt whatever the stream is
            // doing, so this always asks — the host answers a `from`-less sub with
            // a reset seed, which overwrites whatever the live stream delivers.
            self.forget_offset(id);
        } else if already && self.connected.load(Ordering::Relaxed) {
            // This id is already subscribed on a live connection, so the host never
            // stopped sending it. Asking again would replay everything since the
            // offset we hold — bytes the emulator took live — straight onto it a
            // second time. Only a subscription that actually stopped needs resuming,
            // and that is either a fresh PeerConn (`attached` empty) or the
            // reconnect path, which re-subscribes from `attached` itself.
            return;
        }
        let _ = self.send(self.sub_frame(id));
    }

    /// Anchor a terminal's stream at the end of a full replay: the screen is being
    /// rebuilt from here, so no earlier position applies. `None` means the host
    /// reported no offset — it predates the resume contract, so forget any offset
    /// for that id and let the next `sub` ask for a full reseed.
    fn anchor_offset(&self, id: &str, off: Option<u64>) {
        let mut map = self.offsets.lock().unwrap();
        match off {
            Some(off) => {
                map.insert(id.to_string(), off);
            }
            None => {
                map.remove(id);
            }
        }
    }

    /// Advance a terminal's stream by a chunk that continues the screen already on
    /// it. Only an id a replay has anchored can advance: once bytes are missing,
    /// every position after them describes a screen with a hole in it and must
    /// never become something to resume from.
    fn extend_offset(&self, id: &str, off: Option<u64>, len: usize) {
        let lost = {
            let mut map = self.offsets.lock().unwrap();
            let (next, lost) = match (off, map.get(id).copied()) {
                (Some(end), Some(held)) => {
                    let next = advance_offset(held, end, len);
                    (next, next.is_none())
                }
                // No offset held is not loss, and a host that reports no offset at
                // all predates the contract — neither has a replay to ask for.
                _ => (None, false),
            };
            match next {
                Some(next) => {
                    map.insert(id.to_string(), next);
                }
                None => {
                    map.remove(id);
                }
            }
            lost
        };
        if lost {
            self.request_resync(id);
        }
    }

    /// Ask the host to rebuild a terminal's screen from scratch after bytes went
    /// missing. The gapped chunk is emitted to the emulator regardless — dropping
    /// it would only widen the hole — so without this the pane keeps a screen with
    /// a hole in it for as long as the connection stays up.
    ///
    /// Two guards keep a losing stream from resubscribing in a loop: the offset was
    /// just dropped, so no further loss is detectable until a reset seed anchors the
    /// stream again, and a request inside `RESYNC_MIN_INTERVAL` of the last one is
    /// skipped in case that seed is itself followed by loss.
    fn request_resync(&self, id: &str) {
        {
            let now = Instant::now();
            let mut last = self.last_resync.lock().unwrap();
            if last
                .get(id)
                .is_some_and(|prev| now.duration_since(*prev) < RESYNC_MIN_INTERVAL)
            {
                return;
            }
            last.insert(id.to_string(), now);
        }
        // Deliberately not `sub_frame`: this must carry no `from` at all, whatever
        // another thread may have anchored in the meantime.
        let _ = self.send(json!({ "t": "sub", "id": id }).to_string());
    }

    fn forget_offset(&self, id: &str) {
        self.offsets.lock().unwrap().remove(id);
        // The stream this paced any repair of is over: a later attach on the same id
        // is a new screen and must be able to repair itself immediately.
        self.last_resync.lock().unwrap().remove(id);
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
                let supports_sync2 = conn
                    .map(|c| c.supports_sync2.load(Ordering::Relaxed))
                    .unwrap_or(false);
                let supports_git_bring = conn
                    .map(|c| c.supports_git_bring.load(Ordering::Relaxed))
                    .unwrap_or(false);
                let supports_git_follow = conn
                    .map(|c| c.supports_git_follow.load(Ordering::Relaxed))
                    .unwrap_or(false);
                let last_error = conn
                    .map(|c| c.last_error.lock().unwrap().clone())
                    .unwrap_or_default();
                // Reported apart from `connected` on purpose: a dead forward and a
                // dead host both leave a peer disconnected, and they have nothing
                // in common to do about them.
                let tunnel = conn
                    .and_then(|c| {
                        c.tunnel
                            .lock()
                            .unwrap()
                            .as_ref()
                            .map(|t| t.state().as_str())
                    })
                    .unwrap_or("");
                json!({
                    "slug": p.slug,
                    "alias": p.alias,
                    "host": p.host,
                    "port": p.port,
                    "enabled": p.enabled,
                    "connected": connected,
                    "supportsSync": supports_sync,
                    "supportsSync2": supports_sync2,
                    "supportsGitBring": supports_git_bring,
                    "supportsGitFollow": supports_git_follow,
                    // Whether the peer's identity is pinned (verified-encrypted). An
                    // auto run refuses an unpinned channel, so the UI hints on it.
                    "pinned": p.tls_fp.is_some(),
                    "lastSyncAt": p.last_sync_at,
                    "lastError": last_error,
                    "autoSync": p.auto_sync,
                    "platform": p.platform,
                    "sshHost": p.ssh.destination(),
                    "version": p.version,
                    "tunnel": tunnel,
                })
            })
            .collect();
        Value::Array(rows)
    }

    /// Record that this peer is reached by forwarding over SSH, and restart its
    /// connection so it comes back up through its own tunnel. `remote_port` is the
    /// port on the HOST — with a forward in play, the entry's port is what the far
    /// side listens on, not anything dialable from here.
    pub(crate) fn set_peer_ssh(
        &self,
        slug: &str,
        target: &crate::peertunnel::SshTarget,
        remote_port: u16,
    ) -> Result<(), String> {
        {
            let mut cfg = self.inner.config.lock().unwrap();
            let entry = cfg
                .peers
                .iter_mut()
                .find(|p| p.slug == slug)
                .ok_or_else(|| "that peer is no longer configured".to_string())?;
            entry.ssh = target.clone();
            entry.host = target.host.trim().to_string();
            entry.port = remote_port;
            let snapshot = cfg.clone();
            drop(cfg);
            peer::save_config(&snapshot)?;
        }
        self.start_conn(slug);
        emit_state_changed(self);
        Ok(())
    }

    /// (Re)start the connection thread for a peer, retiring any current one.
    pub(crate) fn start_conn(&self, slug: &str) {
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
    /// `reason` is what any in-flight request to that peer fails with, so a caller
    /// that is only restarting the connection doesn't report it as a removal.
    fn stop_conn(&self, slug: &str, reason: &str) {
        if let Some(conn) = self.inner.conns.lock().unwrap().remove(slug) {
            if let Some(tunnel) = conn.tunnel.lock().unwrap().take() {
                tunnel.stop();
            }
            conn.enabled.store(false, Ordering::SeqCst);
            conn.generation.fetch_add(1, Ordering::SeqCst);
            *conn.out.lock().unwrap() = None;
            conn.connected.store(false, Ordering::Relaxed);
            // This connection is retired, not merely dropped: its streams end here,
            // so nothing may later resume from an offset into them.
            conn.attached.lock().unwrap().clear();
            conn.offsets.lock().unwrap().clear();
            conn.fail_pending(reason);
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

        let mut chosen: Option<(ClientWs, String, Option<String>)> = None;
        let mut last_err = "no candidate addresses".to_string();
        for h in &hosts {
            match dial_reciprocal(h, port, Some(CONNECT_TIMEOUT)) {
                Ok((ws, fp)) => {
                    chosen = Some((ws, h.clone(), fp));
                    break;
                }
                Err(e) => last_err = e,
            }
        }
        let (mut ws, host, captured_fp) = match chosen {
            Some(v) => v,
            None => {
                let e = format!("could not reach that machine: {last_err}");
                self.emit_pair_failed(&e);
                return Err(e);
            }
        };

        if let Err(e) = ws.send(Message::text(
            json!({ "t": "pairRequest", "name": local_name(),
                "platform": peer::platform_id() })
            .to_string(),
        )) {
            let e = e.to_string();
            self.emit_pair_failed(&e);
            return Err(e);
        }
        let _ = ws.get_ref().tcp().set_read_timeout(Some(POLL));

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
                            return self.finish_pair_request(&mut ws, &v, &host, port, captured_fp);
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
        ws: &mut ClientWs,
        reply: &Value,
        host: &str,
        port: u16,
        captured_fp: Option<String>,
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
                // Pin the leaf captured during the encrypted pairing handshake (Some
                // over wss). None only when we fell back to plaintext against an old
                // host — then the first authed session pins it (pin-after-auth).
                tls_fp: captured_fp,
                enabled: true,
                last_sync_at: 0,
                auto_sync: false,
                platform: s("hostPlatform"),
                version: s("hostVersion"),
                ssh: Default::default(),
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
    fn offer_reciprocal(&self, ws: &mut ClientWs) {
        let Some(app) = self.app() else { return };
        let (code, out_port, out_hosts) = {
            let mut cfg = self.inner.config.lock().unwrap();
            cfg.host.enabled = true;
            // Reciprocal pairing needs the other Mac to reach us, and it arrives
            // over the LAN. An explicit bind_address still wins — someone who
            // pinned the listener to one interface meant it.
            cfg.host.lan = true;
            if cfg.host.pairing_code.is_empty() {
                cfg.host.pairing_code = peer::gen_pairing_code();
            }
            let code = cfg.host.pairing_code.clone();
            let out_port = peer::effective_port(cfg.host.port);
            let snapshot = cfg.clone();
            drop(cfg);
            let _ = peer::save_config(&snapshot);
            (code, out_port, peer::invite_hosts(&snapshot.host))
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
            return Err(PEER_NOT_CONNECTED.to_string());
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
        result.unwrap_or_else(|| Err(PEER_REQUEST_TIMED_OUT.to_string()))
    }

    /// Guard: the peer must be connected and its host must speak "bring changes".
    pub(crate) fn require_git_bring(&self, slug: &str) -> Result<(), String> {
        self.require_feature(slug, |c| c.supports_git_bring.load(Ordering::Relaxed))
    }

    /// Guard: the peer must also answer the working-state fingerprint a followed
    /// project polls for.
    pub(crate) fn require_git_follow(&self, slug: &str) -> Result<(), String> {
        self.require_feature(slug, |c| c.supports_git_follow.load(Ordering::Relaxed))
    }

    /// Whether this peer will tell us when a followed folder changes, which is what
    /// lets the poll drop to a heartbeat. Not a guard: a peer that cannot is polled
    /// at the old cadence rather than refused.
    pub(crate) fn can_push_changes(&self, slug: &str) -> bool {
        self.inner.conns.lock().unwrap().get(slug).is_some_and(|c| {
            c.connected.load(Ordering::Relaxed) && c.supports_git_watch.load(Ordering::Relaxed)
        })
    }

    /// Send one frame with no reply expected. Used to register which folders a
    /// peer should watch for us.
    pub(crate) fn notify_peer(&self, slug: &str, frame: Value) -> Result<(), String> {
        let conn = self
            .inner
            .conns
            .lock()
            .unwrap()
            .get(slug)
            .cloned()
            .ok_or_else(|| "unknown peer".to_string())?;
        conn.send(frame.to_string())
    }

    fn require_feature(&self, slug: &str, has: impl Fn(&PeerConn) -> bool) -> Result<(), String> {
        let conn = self
            .inner
            .conns
            .lock()
            .unwrap()
            .get(slug)
            .cloned()
            .ok_or_else(|| "unknown peer".to_string())?;
        if !conn.connected.load(Ordering::Relaxed) {
            return Err(PEER_NOT_CONNECTED.to_string());
        }
        if !has(&conn) {
            return Err(GIT_BRING_UNSUPPORTED.to_string());
        }
        Ok(())
    }

    /// Send one bring-changes frame and block on its reply. The caller supplies
    /// the whole frame (verb + args); the reqId is filled in here so it shares the
    /// same correlation machinery as invoke and config sync.
    pub(crate) fn bring_request(
        &self,
        slug: &str,
        timeout: Duration,
        frame: Value,
    ) -> Result<Value, String> {
        self.request_blocking(slug, timeout, |req| {
            let mut f = frame;
            f["reqId"] = json!(req);
            f
        })
    }

    /// The display name this Mac knows the peer by — used to name a branch when
    /// the remote HEAD is detached. Read from config, never from the frontend.
    pub(crate) fn peer_alias(&self, slug: &str) -> String {
        self.peer_entry(slug)
            .map(|p| p.alias)
            .filter(|a| !a.trim().is_empty())
            .unwrap_or_else(|| slug.to_string())
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
            return Err(PEER_NOT_CONNECTED.to_string());
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
    fn fetch_remote_map(
        &self,
        slug: &str,
        sync2: bool,
    ) -> Result<crate::peersync::DigestMap, String> {
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
        // Heal a passive host's per-peer bases whenever its UI recomputes status.
        // A host that only ever SERVES syncs never refreshes the base for a unit a
        // client pulled from it, so its own preview can over-report "Both changed"
        // until it runs a sync itself. Committing the converged bases here — facts
        // only (units currently equal on both Macs), no item states — closes that
        // gap cheaply and safely.
        if sync2 && !remote.device.is_empty() {
            let bases = crate::peersync::converged_bases(&local, &remote);
            commit_sidecar(&remote.device, &[], &bases);
        }
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
        // Names of units that resolved as a both-sides change (the newer won, a
        // backup was kept), threaded out so an unattended run can surface them.
        let conflicts: Vec<String> = plan
            .iter()
            .filter(|i| i.conflict)
            .map(|i| i.name.clone())
            .collect();
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
                                        let local_rev = local
                                            .get(&it.kind, &it.name)
                                            .map(|d| d.rev)
                                            .unwrap_or(0);
                                        let (istate, base) = crate::syncstate::received_state(
                                            &rd.hash, rd.rev, &rd.device, false, &ap.stored,
                                            local_rev, &self_id,
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
        Ok(json!({
            "applied": applied,
            "pushed": pushed,
            "errors": errors,
            "conflicts": conflicts,
            "backupPath": backup_path,
        }))
    }
}

// --- auto-sync engine host ----------------------------------------------------

/// The client hub is the auto-sync engine's I/O surface: it knows which peers opted
/// in, their live gating state, and drives the same `sync_run` the manual button
/// uses. See autosync.rs.
impl crate::autosync::AutoSyncHost for PeerClientHub {
    fn auto_slugs(&self) -> Vec<String> {
        self.inner
            .config
            .lock()
            .unwrap()
            .peers
            .iter()
            .filter(|p| p.auto_sync)
            .map(|p| p.slug.clone())
            .collect()
    }

    fn gates(&self, slug: &str) -> crate::autosync::Gates {
        let (auto_sync, enabled, pinned) = self
            .peer_entry(slug)
            .map(|p| (p.auto_sync, p.enabled, p.tls_fp.is_some()))
            .unwrap_or((false, false, false));
        let conns = self.inner.conns.lock().unwrap();
        let conn = conns.get(slug);
        crate::autosync::Gates {
            auto_sync,
            enabled,
            connected: conn
                .map(|c| c.connected.load(Ordering::Relaxed))
                .unwrap_or(false),
            supports_sync2: conn
                .map(|c| c.supports_sync2.load(Ordering::Relaxed))
                .unwrap_or(false),
            pinned,
        }
    }

    fn run_sync(&self, slug: &str) -> Result<crate::autosync::RunReport, String> {
        self.sync_run(slug, Vec::new())
            .map(|v| parse_run_report(&v))
    }

    fn emit_result(&self, slug: &str, report: &crate::autosync::RunReport) {
        if let Some(app) = self.app() {
            let _ = app.emit(
                "peer-autosync-result",
                json!({
                    "slug": slug,
                    "applied": report.applied,
                    "pushed": report.pushed,
                    "errors": report.errors,
                    "conflicts": report.conflicts,
                }),
            );
        }
    }
}

/// Extract the auto-sync report fields from a `sync_run` result JSON. Pure over the
/// value so it can be unit-tested against the exact shape `sync_run` returns.
fn parse_run_report(v: &Value) -> crate::autosync::RunReport {
    let strings = |k: &str| {
        v.get(k)
            .and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .filter_map(|x| x.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default()
    };
    crate::autosync::RunReport {
        applied: v.get("applied").and_then(Value::as_u64).unwrap_or(0),
        pushed: v.get("pushed").and_then(Value::as_u64).unwrap_or(0),
        errors: strings("errors"),
        conflicts: strings("conflicts"),
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
    // Before opening anything: a previous run that was killed rather than quit
    // left its ssh forwards running, and they hold a local port and a session on
    // the server until the machine reboots.
    crate::peertunnel::reap_orphaned_forwards();
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
        // An ssh forward is a CHILD PROCESS, not a thread: retiring the connection
        // that used it leaves it running, re-parented to init, holding a session on
        // the server and a local port for as long as the machine is up. One per
        // launch adds up fast on a dev build.
        if let Some(tunnel) = conn.tunnel.lock().unwrap().take() {
            tunnel.stop();
        }
    }
    hub.inner.conns.lock().unwrap().clear();
}

fn emit_state_changed(hub: &PeerClientHub) {
    if let Some(app) = hub.app() {
        let _ = app.emit("peer-state-changed", ());
    }
}

/// The auto-sync engine, if it has been set up (managed state). A no-op seam
/// before startup and in test/headless contexts without the engine.
fn autosync_engine(app: Option<&AppHandle>) -> Option<crate::autosync::Engine> {
    app?.try_state::<crate::autosync::Engine>()
        .map(|s| s.inner().clone())
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
/// status; deliberately in product terms (no transport jargon), and about a
/// "machine" rather than a Mac — a peer is just as often a Linux host now.
const IDENTITY_CHANGED: &str = "that machine's identity changed — remove it and pair again";
const IDENTITY_UNVERIFIED: &str =
    "couldn't verify that machine's identity — get a fresh invite and try again";
/// The handshake never got as far as a certificate. Named separately because they
/// answer a completely different question than the two above — and the silent one
/// is its own case: a stranger holding the port (a stray file server, say) accepts
/// the connection and then waits for a request line that never comes, so lpm's
/// handshake ends in a read timeout rather than a refusal.
const HANDSHAKE_HUNG_UP: &str =
    "the connection closed before that machine answered — lpm may not be running there";
const HANDSHAKE_SILENT: &str = "something is listening on that port, but it never answered as lpm";

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

/// What a failed pinned handshake actually was.
///
/// rustls reports a rejected leaf and a socket that died through the same
/// `io::Error`, and calling all of them a pin failure is how "the host isn't
/// listening" reached people as "couldn't verify its identity — get a fresh
/// invite". Over an SSH forward the two are especially easy to confuse: ssh
/// accepts on the local port whether or not anything answers on the far end, so a
/// host with no peer port up looks exactly like one that hung up mid-handshake.
/// Only a certificate rejection is an identity problem.
fn handshake_error(e: &io::Error, mismatch_err: &str) -> String {
    let refused_pin = e
        .get_ref()
        .and_then(|inner| inner.downcast_ref::<rustls::Error>())
        .is_some_and(|err| matches!(err, rustls::Error::InvalidCertificate(_)));
    if refused_pin {
        return mismatch_err.to_string();
    }
    match e.kind() {
        io::ErrorKind::UnexpectedEof
        | io::ErrorKind::ConnectionReset
        | io::ErrorKind::ConnectionAborted
        | io::ErrorKind::BrokenPipe => HANDSHAKE_HUNG_UP.to_string(),
        io::ErrorKind::WouldBlock | io::ErrorKind::TimedOut => HANDSHAKE_SILENT.to_string(),
        _ => format!("could not open a secure connection: {e}"),
    }
}

/// wss, verifying the host's leaf against `fp`. A TCP-reach failure surfaces as-is;
/// a handshake failure is classified — `mismatch_err` only when the leaf was
/// actually refused. Never downgrades to plaintext.
fn dial_pinned(
    host: &str,
    port: u16,
    fp: &str,
    timeout: Option<Duration>,
    mismatch_err: &'static str,
) -> Result<ClientWs, String> {
    let mut tcp = tcp_connect(host, port, timeout)?;
    let mut conn = rustls::ClientConnection::new(
        crate::peertls::pinned_client_config(fp),
        crate::peertls::server_name(),
    )
    .map_err(|e| e.to_string())?;
    conn.complete_io(&mut tcp)
        .map_err(|e| handshake_error(&e, mismatch_err))?;
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
    let (ws, _) = tungstenite::client(url, ClientStream::Plain(tcp)).map_err(|e| e.to_string())?;
    Ok(ws)
}

/// Dial a persisted peer per its pin state, returning `(ws, wasTls, capturedFp)`.
/// Pinned → wss-only, no fallback. Unpinned → wss capturing the leaf, or plaintext
/// if the TLS layer fails.
fn dial_for_session(entry: &PeerEntry) -> Result<(ClientWs, bool, Option<String>), String> {
    dial_endpoint(&entry.host, entry.port, entry)
}

/// Bring this peer's SSH forward up (idempotent) and return the local port to
/// dial.
fn ensure_tunnel(conn: &Arc<PeerConn>, entry: &PeerEntry) -> Result<u16, String> {
    let tunnel = {
        let mut slot = conn.tunnel.lock().unwrap();
        let stale = slot
            .as_ref()
            .map(|t| !t.matches(&entry.ssh, entry.port))
            .unwrap_or(true);
        if stale {
            if let Some(old) = slot.take() {
                old.stop();
            }
            *slot = Some(crate::peertunnel::Tunnel::new(
                entry.ssh.clone(),
                entry.port,
            ));
        }
        slot.as_ref().unwrap().clone()
    };
    tunnel.start();
    tunnel.wait_until_up(
        TUNNEL_WAIT,
        "could not open the SSH connection to this host",
    )
}

/// Same dial, against an endpoint the caller resolved — which is the forwarded
/// `127.0.0.1:<local>` when this peer is reached over SSH. The pinned certificate
/// is the host's either way: the tunnel moves bytes, it doesn't terminate TLS, so
/// nothing about identity changes when the address does.
fn dial_endpoint(
    host: &str,
    port: u16,
    entry: &PeerEntry,
) -> Result<(ClientWs, bool, Option<String>), String> {
    match entry.tls_fp.as_deref() {
        Some(fp) => {
            let ws = dial_pinned(host, port, fp, None, IDENTITY_CHANGED)?;
            Ok((ws, true, None))
        }
        None => match dial_capture(host, port, None) {
            Ok((ws, fp)) => Ok((ws, true, Some(fp))),
            Err(_) => {
                let ws = dial_plain(host, port, None)?;
                Ok((ws, false, None))
            }
        },
    }
}

/// The pairing dial for the tap-to-approve flow: `wss` capturing the host's leaf,
/// or plaintext against an old host. Returns the captured fingerprint (`Some` over
/// TLS) so a successful pair can pin it at pair time.
fn dial_reciprocal(
    host: &str,
    port: u16,
    timeout: Option<Duration>,
) -> Result<(ClientWs, Option<String>), String> {
    match dial_capture(host, port, timeout) {
        Ok((ws, fp)) => Ok((ws, Some(fp))),
        Err(_) => Ok((dial_plain(host, port, timeout)?, None)),
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

/// Record what the host said about itself on this auth. Written on every connect,
/// not just pairing, so an entry stored before hosts reported these fills in by
/// itself — and so a host that was updated, or moved to another machine under the
/// same identity, doesn't go on claiming the old values.
///
/// Both fields in one pass because they arrive together: on a first connect after
/// an upgrade they are both new, and saving twice would write the config and wake
/// every listener twice for a single event. An empty value means "not reported",
/// never "cleared".
fn persist_host_report(hub: &PeerClientHub, slug: &str, platform: &str, version: &str) {
    let mut cfg = hub.inner.config.lock().unwrap();
    let changed = match cfg.peers.iter_mut().find(|p| p.slug == slug) {
        Some(p) => [(&mut p.platform, platform), (&mut p.version, version)]
            .into_iter()
            .fold(false, |changed, (field, value)| {
                if value.is_empty() || field.as_str() == value {
                    return changed;
                }
                *field = value.to_string();
                true
            }),
        None => false,
    };
    if !changed {
        return;
    }
    let snapshot = cfg.clone();
    drop(cfg);
    let _ = peer::save_config(&snapshot);
    emit_state_changed(hub);
}

/// Dial, authenticate, then run the read/write loop until the socket drops. Ok
/// means a session ran and ended; Err means we never got connected.
fn connect_session(
    hub: &PeerClientHub,
    conn: &Arc<PeerConn>,
    generation: u64,
    entry: &PeerEntry,
) -> Result<(), String> {
    // An SSH-reached peer is dialled through its forward, not at its own address:
    // the host is bound to loopback on its own machine and has no port we could
    // reach directly. Bringing the tunnel up is part of connecting, and a tunnel
    // that won't come up is reported as itself rather than as "host offline".
    let (mut ws, was_tls, captured_fp) = if entry.ssh.is_set() {
        let port = ensure_tunnel(conn, entry)?;
        dial_endpoint("127.0.0.1", port, entry)?
    } else {
        dial_for_session(entry)?
    };
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
    persist_host_report(
        hub,
        &conn.slug,
        rv.get("hostPlatform").and_then(Value::as_str).unwrap_or(""),
        rv.get("hostVersion").and_then(Value::as_str).unwrap_or(""),
    );
    let features = rv.get("features").and_then(Value::as_array);
    let has_feature = |name: &str| {
        features
            .map(|a| a.iter().any(|f| f.as_str() == Some(name)))
            .unwrap_or(false)
    };
    conn.supports_sync.store(
        has_feature(crate::peersync::SYNC_FEATURE),
        Ordering::Relaxed,
    );
    conn.supports_sync2.store(
        has_feature(crate::peersync::SYNC_FEATURE2),
        Ordering::Relaxed,
    );
    conn.supports_git_bring.store(
        has_feature(crate::gitbringhost::GIT_BRING_FEATURE),
        Ordering::Relaxed,
    );
    conn.supports_git_follow.store(
        has_feature(crate::gitbringhost::GIT_FOLLOW_FEATURE),
        Ordering::Relaxed,
    );
    conn.supports_git_watch.store(
        has_feature(crate::gitwatchhost::GIT_WATCH_FEATURE),
        Ordering::Relaxed,
    );

    let (tx, rx) = mpsc::sync_channel::<String>(OUT_QUEUE);
    *conn.out.lock().unwrap() = Some(tx);
    conn.connected.store(true, Ordering::Relaxed);
    conn.last_error.lock().unwrap().clear();
    let _ = ws.get_ref().tcp().set_read_timeout(Some(POLL));
    // Re-subscribe every terminal the frontend currently has open, so a reconnect
    // transparently resumes them: each `sub` carries the offset already applied,
    // so a pane whose screen survived the drop gets only the bytes it missed.
    let resubscribe: Vec<String> = conn.attached.lock().unwrap().iter().cloned().collect();
    for id in &resubscribe {
        let _ = ws.write(Message::text(conn.sub_frame(id)));
    }
    let _ = ws.flush();
    emit_state_changed(hub);

    let app = hub.app();
    // A reconnect is a sync trigger: the peer just became reachable and its feature
    // flags are stored, so an auto-enabled peer reconciles now (and its backoff
    // resets). Gating still applies — a non-configSync2 or unpinned peer is skipped.
    if let Some(engine) = autosync_engine(app.as_ref()) {
        engine.notify_connected(&conn.slug);
    }
    // Same for followed projects: the Mac is reachable again, so drop any backoff
    // that built up while it was not and check it now. Called outside the conns
    // lock — the follow scheduler reads connection state, so the two must not nest.
    if let Some(engine) = app
        .as_ref()
        .and_then(|a| a.try_state::<crate::gitfollow::Engine>())
    {
        engine.nudge();
    }
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
        // The host says a followed folder moved. It is only a wake-up: the
        // scheduler still asks what the state is before acting on it.
        "gitFollowChanged" => {
            if let (Some(app), Some(cwd)) = (app, v.get("cwd").and_then(Value::as_str)) {
                if let Some(engine) = app.try_state::<crate::gitfollow::Engine>() {
                    engine.note_remote_change(slug, cwd);
                }
            }
        }
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
        // Answer to `sub`, replayed as ordinary output before live `o` frames.
        //
        // `reset: true` — `d` is a fresh replay onto a cleared screen, so it is
        // prefixed with SCREEN_RESET. Anything less leaves the emulator in whatever
        // buffer and margins the previous session had while the replayed slice —
        // which can start mid-escape-sequence — addresses rows absolutely,
        // scattering the output.
        //
        // `reset: false` — `d` is exactly the bytes missed since the `from` we
        // sent, appended to a screen that survived the drop. It must be applied
        // untouched; clearing here would erase the very screen it continues.
        //
        // A host that sends neither field predates the contract: its `d` is always
        // a full replay, so it takes the reset path.
        "seed" => {
            if let (Some(app), Some(id)) = (app, v.get("id").and_then(Value::as_str)) {
                let d = v.get("d").and_then(Value::as_str).unwrap_or_default();
                let off = v.get("off").and_then(Value::as_u64);
                let reset =
                    off.is_none() || v.get("reset").and_then(Value::as_bool).unwrap_or(true);
                let chunk = if reset {
                    conn.anchor_offset(id, off);
                    format!("{SCREEN_RESET}{d}")
                } else {
                    conn.extend_offset(id, off, d.as_bytes().len());
                    d.to_string()
                };
                let _ = app.emit(&format!("pty-output-peer-{slug}-{id}"), chunk);
            }
        }
        "o" => {
            if let (Some(app), Some(id)) = (app, v.get("id").and_then(Value::as_str)) {
                let d = v.get("d").and_then(Value::as_str).unwrap_or_default();
                let off = v.get("off").and_then(Value::as_u64);
                conn.extend_offset(id, off, d.as_bytes().len());
                let _ = app.emit(&format!("pty-output-peer-{slug}-{id}"), d);
            }
        }
        "exit" => {
            if let (Some(app), Some(id)) = (app, v.get("id").and_then(Value::as_str)) {
                let code = v.get("code").and_then(Value::as_i64).unwrap_or(0) as i32;
                // The stream is over: forget the offset so a later terminal reusing
                // this id can never ask to resume from a dead one.
                conn.forget_offset(id);
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
                // A headless host can't chime for its own agents — nobody is at it
                // — so it hands the transition here and this Mac plays it, under
                // this Mac's sound settings. Only hosts that can't play send it, so
                // a peer Mac chiming for itself is never doubled up here.
                //
                // Read both shapes. A later release may want to say which project
                // or pane chimed, and a client that only understood the bare string
                // would answer None and go silent — a mute that looks like the
                // feature was never built. Accepting the object now is what lets
                // that change ship later without a flag day.
                if name == crate::sound::STATUS_SOUND_EVENT {
                    let value = payload
                        .as_str()
                        .or_else(|| payload.get("value").and_then(Value::as_str));
                    // Off this thread: it is the peer's single read loop, and it
                    // also drains outbound frames. Blocking it on a sound would
                    // stall terminal output for the whole connection.
                    //
                    // A banner goes out with it when this Mac isn't in front. The
                    // chime is gone the moment it plays, so on its own it only
                    // reaches someone already at the machine — which is the one
                    // case a headless host's agent doesn't need help reaching.
                    // The payload carries no project or terminal yet, so the
                    // notice names neither.
                    if let Some(value) = value.map(str::to_string) {
                        let app = app.clone();
                        std::thread::spawn(move || {
                            crate::sound::play_status_sound(&value);
                            crate::statusnotify::notify_status(&app, "", &value, "");
                        });
                    }
                }
                // A forwarded config-change event is a remote sync trigger: the
                // other Mac edited its projects/templates or wrote session memory,
                // so an auto-enabled peer reconciles shortly after. Lossy forwarding
                // only ever delays this (the connect + anti-entropy triggers are the
                // safety net).
                if matches!(
                    name,
                    "projects-changed" | "templates-changed" | "memory-changed"
                ) {
                    if let Some(engine) = autosync_engine(Some(app)) {
                        engine.notify_remote_change(slug);
                    }
                }
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
/// Update the lpm on an SSH-reached host: re-run the published installer there.
/// Only meaningful for a host we can reach — a peer we merely dial has no way for
/// us to run anything on it, and saying so beats a confusing failure.
///
/// This RESTARTS lpm on that machine, which ends every agent running on it. The
/// caller is responsible for having said so.
#[tauri::command]
pub async fn peer_update_host(hub: State<'_, PeerClientHub>, slug: String) -> Result<(), String> {
    let hub = hub.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let target = {
            let cfg = hub.inner.config.lock().unwrap();
            cfg.peers
                .iter()
                .find(|p| p.slug == slug)
                .map(|p| p.ssh.clone())
                .ok_or_else(|| "that host is no longer configured".to_string())?
        };
        if !target.is_set() {
            return Err("lpm can only update a host it reaches over SSH".into());
        }
        crate::peerssh::install(&target)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// The other half of "add a Linux host": take lpm off the machine again and stop
/// tracking it here. Adding it was one click and one string, so undoing it cannot
/// be a list of paths to delete by hand — a server someone tried lpm on should be
/// as easy to give back as it was to borrow.
///
/// The host is cleaned up FIRST and the entry dropped only on success: a failed
/// removal that had already forgotten the machine would leave an install nothing
/// here can reach, let alone retry.
///
/// `purge_data` also deletes the host's `~/.lpm` — project config, session memory
/// and its pairing identity. The caller is responsible for having said so.
#[tauri::command]
pub async fn peer_uninstall_host(
    hub: State<'_, PeerClientHub>,
    slug: String,
    purge_data: bool,
) -> Result<Value, String> {
    let hub_state = hub.inner().clone();
    let removal_slug = slug.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let (target, was_enabled) = {
            let cfg = hub_state.inner.config.lock().unwrap();
            cfg.peers
                .iter()
                .find(|p| p.slug == removal_slug)
                .map(|p| (p.ssh.clone(), p.enabled))
                .ok_or_else(|| "that host is no longer configured".to_string())?
        };
        if !target.is_set() {
            return Err("lpm can only remove itself from a host it reaches over SSH".into());
        }
        // Before the ssh: the supervised forward keeps redialling a machine whose
        // app is being stopped, and its retries would race the removal.
        hub_state.stop_conn(&removal_slug, "removing lpm from this host");
        let removed = crate::peerssh::uninstall(&target, purge_data);
        // A removal that failed leaves a host that is still there and still ours
        // to talk to. Without this it would sit disconnected with nothing saying
        // why, and the only way back would be toggling it off and on.
        if removed.is_err() && was_enabled {
            hub_state.start_conn(&removal_slug);
        }
        removed
    })
    .await
    .map_err(|e| e.to_string())??;
    peer_remove(hub, slug).await
}

/// Add a Linux host: reach it over SSH, install lpm if it isn't there, and pair
/// through a forward — the flow that replaces "download a tarball, run three
/// commands, copy a secret out of a terminal".
#[tauri::command]
pub async fn peer_add_ssh_host(
    hub: State<'_, PeerClientHub>,
    target: crate::peertunnel::SshTarget,
    alias: String,
    install: bool,
) -> Result<Value, String> {
    let hub = hub.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::peerssh::add_host(&hub, &target, &alias, install)
    })
    .await
    .map_err(|e| e.to_string())?
}

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
    tauri::async_runtime::spawn_blocking(move || {
        add_peer_blocking(&hub, hosts, port, code, alias, fp)
    })
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
            auto_sync: false,
            // Left for the auth below to fill: `start_conn` runs immediately and
            // every `ready` reports it, so this takes the same back-fill path as
            // an entry paired before hosts sent a platform at all.
            platform: String::new(),
            version: String::new(),
            ssh: Default::default(),
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
    Err(format!("could not reach that machine: {last_err}"))
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
        json!({ "t": "pair", "code": code, "name": local_name(),
            "platform": peer::platform_id() })
        .to_string(),
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
    hub.stop_conn(&slug, "peer removed");
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
        hub.stop_conn(&slug, "peer turned off");
    }
    emit_state_changed(&hub);
    Ok(hub.peers_state())
}

/// Dial a peer again now, without waiting out the backoff.
///
/// Retires the current connection first rather than starting a second thread on
/// the same one: a dial that is still blocked in a TCP timeout would otherwise
/// tear down the connection the retry just made when it finally gives up.
#[tauri::command]
pub async fn peer_reconnect(hub: State<'_, PeerClientHub>, slug: String) -> Result<Value, String> {
    let enabled = hub
        .peer_entry(&slug)
        .map(|p| p.enabled)
        .ok_or_else(|| "no such peer".to_string())?;
    if !enabled {
        return Ok(hub.peers_state());
    }
    hub.stop_conn(&slug, "reconnecting");
    hub.start_conn(&slug);
    emit_state_changed(&hub);
    Ok(hub.peers_state())
}

/// Turn unattended config sync on or off for one peer. Persisted in peer.json; the
/// engine gates on it. Switching on reconciles the peer now (if it's eligible); the
/// engine keeps it in sync thereafter.
#[tauri::command]
pub async fn peer_set_auto_sync(
    app: AppHandle,
    hub: State<'_, PeerClientHub>,
    slug: String,
    enabled: bool,
) -> Result<Value, String> {
    {
        let mut cfg = hub.inner.config.lock().unwrap();
        if let Some(p) = cfg.peers.iter_mut().find(|p| p.slug == slug) {
            p.auto_sync = enabled;
        }
        let snapshot = cfg.clone();
        drop(cfg);
        peer::save_config(&snapshot)?;
    }
    if enabled {
        if let Some(engine) = autosync_engine(Some(&app)) {
            engine.notify_auto_enabled(&slug);
        }
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
///
/// `resume` asks for only the bytes missed since this Mac last applied output —
/// pass it only when the emulator that was applying them is still on screen, which
/// nothing here can tell: this state lives in the app, not the webview, and a
/// reload leaves it holding offsets for panes that no longer exist. With
/// `resume: false` the offset is dropped first, so the host replays in full.
#[tauri::command]
pub fn peer_term_attach(
    hub: State<'_, PeerClientHub>,
    id: String,
    resume: bool,
) -> Result<(), String> {
    let (slug, raw) = parse_prefixed(&id).ok_or_else(|| "not a peer terminal id".to_string())?;
    let conn = hub
        .inner
        .conns
        .lock()
        .unwrap()
        .get(&slug)
        .cloned()
        .ok_or_else(|| "unknown peer".to_string())?;
    conn.subscribe(&raw, resume);
    Ok(())
}

/// Forget a terminal the frontend closed: stop re-subscribing it on reconnect and
/// drop its offset, since its screen is gone and the next attach needs a full
/// reseed. Idempotent — detaching an unknown id or an unconnected peer is a no-op.
#[tauri::command]
pub fn peer_term_detach(hub: State<'_, PeerClientHub>, id: String) -> Result<(), String> {
    let Some((slug, raw)) = parse_prefixed(&id) else {
        return Ok(());
    };
    if let Some(conn) = hub.inner.conns.lock().unwrap().get(&slug).cloned() {
        conn.attached.lock().unwrap().remove(&raw);
        conn.forget_offset(&raw);
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
    fn sub_frame_carries_from_only_once_an_offset_is_known() {
        let conn = PeerConn::new("aabbccdd");
        let parse = |s: String| serde_json::from_str::<Value>(&s).unwrap();

        let fresh = parse(conn.sub_frame("web-3"));
        assert_eq!(fresh.get("t").and_then(Value::as_str), Some("sub"));
        assert_eq!(fresh.get("id").and_then(Value::as_str), Some("web-3"));
        assert!(fresh.get("from").is_none());

        conn.anchor_offset("web-3", Some(4096));
        let resumed = parse(conn.sub_frame("web-3"));
        assert_eq!(resumed.get("from").and_then(Value::as_u64), Some(4096));

        // A host that reports no offset predates the resume contract: forget what we
        // had so the next sub asks for a full reseed rather than a stale resume.
        conn.anchor_offset("web-3", None);
        assert!(parse(conn.sub_frame("web-3")).get("from").is_none());
    }

    #[test]
    fn screen_reset_never_touches_input_side_modes() {
        // A soft reset would take bracketed paste, application cursor keys and
        // application keypad down with it in xterm.js. The remote program advertised
        // those once at startup and never will again, and this app reads bracketed
        // paste off the emulator to decide how to send what the user types.
        assert!(!SCREEN_RESET.contains("\x1b[!p"));
        assert!(!SCREEN_RESET.contains("\x1bc"));
        assert!(SCREEN_RESET.ends_with("\x1b[2J\x1b[3J\x1b[H"));
    }

    fn held_offset(conn: &PeerConn, id: &str) -> Option<u64> {
        conn.offsets.lock().unwrap().get(id).copied()
    }

    #[test]
    fn advance_offset_reads_a_chunks_position_against_what_was_applied() {
        // Contiguous: the chunk starts exactly where we stopped.
        assert_eq!(advance_offset(1000, 1010, 10), Some(1010));
        // Gap: the host dropped frames, so 1000..1005 never arrived.
        assert_eq!(advance_offset(1000, 1015, 10), None);
        // Overlap: bytes we already have, arriving again. Keep the furthest point.
        assert_eq!(advance_offset(1000, 1005, 10), Some(1005));
        assert_eq!(advance_offset(1000, 998, 10), Some(1000));
        // A first chunk on a stream still at zero is contiguous, not a gap.
        assert_eq!(advance_offset(0, 8, 8), Some(8));
    }

    #[test]
    fn extend_offset_forgets_the_position_once_bytes_are_lost() {
        let conn = PeerConn::new("aabbccdd");
        conn.anchor_offset("web-3", Some(100));

        conn.extend_offset("web-3", Some(105), "hello".as_bytes().len());
        assert_eq!(held_offset(&conn, "web-3"), Some(105));

        // Re-delivery of bytes already applied is not loss: stay resumable.
        conn.extend_offset("web-3", Some(103), "hel".as_bytes().len());
        assert_eq!(held_offset(&conn, "web-3"), Some(105));

        // Byte length, not char count: three chars but five bytes, so this chunk
        // starts at 105 and continues the stream.
        conn.extend_offset("web-3", Some(110), "a√b".as_bytes().len());
        assert_eq!(held_offset(&conn, "web-3"), Some(110));

        // A chunk starting past 110 means the bytes between were dropped.
        conn.extend_offset("web-3", Some(200), "gap".as_bytes().len());
        assert_eq!(held_offset(&conn, "web-3"), None);

        // And it stays forgotten: live output applied onto a screen with a hole in
        // it must not re-anchor a position to resume from. Only a replay may.
        conn.extend_offset("web-3", Some(210), "more".as_bytes().len());
        assert_eq!(held_offset(&conn, "web-3"), None);
        conn.anchor_offset("web-3", Some(210));
        assert_eq!(held_offset(&conn, "web-3"), Some(210));

        // A host that reports no offset can't be resumed from at all.
        conn.extend_offset("web-3", None, 4);
        assert_eq!(held_offset(&conn, "web-3"), None);
    }

    #[test]
    fn attaching_without_resume_drops_the_offset_before_subscribing() {
        let parse = |s: String| serde_json::from_str::<Value>(&s).unwrap();
        let conn = PeerConn::new("aabbccdd");
        let (tx, rx) = mpsc::sync_channel(4);
        *conn.out.lock().unwrap() = Some(tx);
        conn.anchor_offset("web-3", Some(4096));

        // The pane's screen survived, so only the missed bytes are wanted.
        conn.subscribe("web-3", true);
        let resumed = parse(rx.recv().unwrap());
        assert_eq!(resumed.get("from").and_then(Value::as_u64), Some(4096));
        assert!(conn.attached.lock().unwrap().contains("web-3"));

        // A reload built a blank emulator: the stored offset describes a screen that
        // no longer exists, so it goes before the sub asks for a full replay.
        conn.subscribe("web-3", false);
        let full = parse(rx.recv().unwrap());
        assert_eq!(full.get("id").and_then(Value::as_str), Some("web-3"));
        assert!(full.get("from").is_none());
        assert_eq!(held_offset(&conn, "web-3"), None);
    }

    fn live_conn() -> (PeerConn, mpsc::Receiver<String>) {
        let conn = PeerConn::new("aabbccdd");
        let (tx, rx) = mpsc::sync_channel(8);
        *conn.out.lock().unwrap() = Some(tx);
        conn.connected.store(true, Ordering::Relaxed);
        (conn, rx)
    }

    #[test]
    fn resubscribing_a_live_stream_never_asks_for_bytes_it_already_took() {
        let parse = |s: String| serde_json::from_str::<Value>(&s).unwrap();
        let (conn, rx) = live_conn();

        conn.subscribe("web-3", true);
        assert_eq!(
            parse(rx.recv().unwrap()).get("t").and_then(Value::as_str),
            Some("sub")
        );

        // The pane remounted (switched away from the project and back) while the
        // subscription stayed up. Everything since the offset already reached the
        // emulator live, so asking to resume would write it all a second time.
        conn.anchor_offset("web-3", Some(4096));
        conn.subscribe("web-3", true);
        assert!(rx.try_recv().is_err());
        assert_eq!(held_offset(&conn, "web-3"), Some(4096));

        // A blank emulator still asks, live subscription or not: only a reset seed
        // can put a screen on it, and it overwrites whatever the stream delivers.
        conn.subscribe("web-3", false);
        let reseed = parse(rx.recv().unwrap());
        assert_eq!(reseed.get("id").and_then(Value::as_str), Some("web-3"));
        assert!(reseed.get("from").is_none());
    }

    #[test]
    fn resubscribing_still_asks_whenever_the_stream_could_have_stopped() {
        let parse = |s: String| serde_json::from_str::<Value>(&s).unwrap();
        // What stop_conn/start_conn mints: a fresh PeerConn attached to nothing, so
        // the pane that was live on the retired connection is subscribed again.
        let (conn, rx) = live_conn();
        conn.subscribe("web-3", true);
        assert_eq!(
            parse(rx.recv().unwrap()).get("id").and_then(Value::as_str),
            Some("web-3")
        );

        // Attached, but the connection is down: the stream did stop, so re-attaching
        // asks to resume it rather than assuming the host is still sending.
        conn.anchor_offset("web-3", Some(64));
        conn.connected.store(false, Ordering::Relaxed);
        conn.subscribe("web-3", true);
        let resumed = parse(rx.recv().unwrap());
        assert_eq!(resumed.get("from").and_then(Value::as_u64), Some(64));
    }

    #[test]
    fn detected_loss_asks_the_host_to_rebuild_the_screen() {
        let parse = |s: String| serde_json::from_str::<Value>(&s).unwrap();
        let (conn, rx) = live_conn();
        conn.subscribe("web-3", true);
        let _ = rx.recv().unwrap();
        conn.anchor_offset("web-3", Some(100));

        // Output that continues the screen repairs nothing.
        conn.extend_offset("web-3", Some(105), 5);
        assert!(rx.try_recv().is_err());

        // A gap: the chunk still reaches the emulator, so the pane is left showing a
        // screen with a hole in it until the host replays from scratch.
        conn.extend_offset("web-3", Some(200), 3);
        let repair = parse(rx.recv().unwrap());
        assert_eq!(repair.get("t").and_then(Value::as_str), Some("sub"));
        assert_eq!(repair.get("id").and_then(Value::as_str), Some("web-3"));
        assert!(repair.get("from").is_none());
        assert_eq!(held_offset(&conn, "web-3"), None);

        // A host that reports no offsets predates the contract — there is no gap to
        // read and nothing it could replay differently.
        conn.anchor_offset("web-3", Some(300));
        conn.extend_offset("web-3", None, 4);
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn loss_repair_is_paced_so_a_losing_stream_cannot_resubscribe_in_a_loop() {
        let (conn, rx) = live_conn();
        conn.anchor_offset("web-3", Some(100));
        conn.extend_offset("web-3", Some(200), 3);
        assert!(rx.try_recv().is_ok());

        // Loss again right after the replay landed: a second full replay down a queue
        // that is already dropping frames is what caused this, so it waits.
        conn.anchor_offset("web-3", Some(300));
        conn.extend_offset("web-3", Some(400), 3);
        assert!(rx.try_recv().is_err());

        // Once the window has passed, a stream that loses bytes repairs again.
        conn.last_resync
            .lock()
            .unwrap()
            .insert("web-3".into(), Instant::now() - RESYNC_MIN_INTERVAL);
        conn.anchor_offset("web-3", Some(500));
        conn.extend_offset("web-3", Some(600), 3);
        assert!(rx.try_recv().is_ok());

        // A detach or an exit ends the stream: the next screen on that id repairs
        // itself immediately instead of inheriting the old one's pacing.
        conn.forget_offset("web-3");
        conn.anchor_offset("web-3", Some(700));
        conn.extend_offset("web-3", Some(800), 3);
        assert!(rx.try_recv().is_ok());
    }

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
    fn parse_run_report_reads_the_sync_run_shape() {
        // The exact JSON sync_run returns: conflicts carried alongside counts/errors.
        let v = json!({
            "applied": 2,
            "pushed": 1,
            "errors": ["web: boom"],
            "conflicts": ["api", "global.yml"],
            "backupPath": "/x",
        });
        let r = parse_run_report(&v);
        assert_eq!(r.applied, 2);
        assert_eq!(r.pushed, 1);
        assert_eq!(r.errors, vec!["web: boom".to_string()]);
        assert_eq!(
            r.conflicts,
            vec!["api".to_string(), "global.yml".to_string()]
        );
        // A clean run: counts zero, no errors, empty conflicts.
        let clean = json!({ "applied": 0, "pushed": 0, "errors": [], "conflicts": [] });
        let r2 = parse_run_report(&clean);
        assert!(r2.errors.is_empty());
        assert!(r2.conflicts.is_empty());
        // Missing fields (defensive) default to zero/empty.
        let empty = parse_run_report(&json!({}));
        assert_eq!((empty.applied, empty.pushed), (0, 0));
        assert!(empty.errors.is_empty() && empty.conflicts.is_empty());
    }

    #[test]
    fn pin_after_auth_only_pins_a_captured_leaf_on_an_unpinned_tls_connect() {
        // Already pinned: keep it, whatever the transport reported.
        assert_eq!(pin_after_auth(Some("aa"), true, Some("bb")), None);
        assert_eq!(pin_after_auth(Some("aa"), false, None), None);
        // Unpinned over TLS: pin the captured leaf (the host proved the token first).
        assert_eq!(
            pin_after_auth(None, true, Some("cc")),
            Some("cc".to_string())
        );
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

    // Only a refused certificate is an identity problem. Everything else the
    // handshake can hit is the connection dying, and reporting that as a bad pin
    // sends people to re-pair a machine whose peer port simply isn't up.
    #[test]
    fn only_a_refused_certificate_reads_as_an_identity_failure() {
        let refused = io::Error::new(
            io::ErrorKind::InvalidData,
            rustls::Error::InvalidCertificate(
                rustls::CertificateError::ApplicationVerificationFailure,
            ),
        );
        assert_eq!(
            handshake_error(&refused, IDENTITY_UNVERIFIED),
            IDENTITY_UNVERIFIED
        );

        for kind in [
            io::ErrorKind::UnexpectedEof,
            io::ErrorKind::ConnectionReset,
            io::ErrorKind::ConnectionAborted,
            io::ErrorKind::BrokenPipe,
        ] {
            let e = handshake_error(&io::Error::from(kind), IDENTITY_UNVERIFIED);
            assert_eq!(e, HANDSHAKE_HUNG_UP, "{kind:?}");
        }
        for kind in [io::ErrorKind::WouldBlock, io::ErrorKind::TimedOut] {
            let e = handshake_error(&io::Error::from(kind), IDENTITY_UNVERIFIED);
            assert_eq!(e, HANDSHAKE_SILENT, "{kind:?}");
        }
        // A TLS-level failure that isn't about the certificate is neither: say what
        // happened rather than picking one of the two wrong answers.
        let other = io::Error::new(
            io::ErrorKind::InvalidData,
            rustls::Error::AlertReceived(rustls::AlertDescription::HandshakeFailure),
        );
        let e = handshake_error(&other, IDENTITY_UNVERIFIED);
        assert!(e.contains("could not open a secure connection"), "{e}");
    }

    // The bug this guards: over an SSH forward ssh accepts locally even when
    // nothing answers on the far end, so a host whose peer port never came up
    // reached the user as "couldn't verify that machine's identity".
    #[test]
    fn a_port_that_accepts_and_hangs_up_is_not_an_identity_failure() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            if let Ok((stream, _)) = listener.accept() {
                drop(stream); // exactly what ssh does when the remote port refuses
            }
        });
        let err = dial_pinned(
            "127.0.0.1",
            port,
            &"ab".repeat(32),
            Some(Duration::from_secs(3)),
            IDENTITY_UNVERIFIED,
        )
        .err()
        .expect("a dial into a hung-up port must fail");
        assert_eq!(err, HANDSHAKE_HUNG_UP, "{err}");
        server.join().unwrap();
    }
}
