// Desktop-to-desktop remote control — the *controlling* side.
//
// The mirror image of remote.rs: where remote.rs is the WebSocket server a phone
// (or another Mac) connects into, this module is the client that connects *out*
// to another Mac's remote.rs server and holds an authenticated session open. A
// user pairs Mac A (here) with Mac B by pasting the `lpm://pair?...` link Mac B
// copied from its Settings; we probe the advertised hosts, pair to obtain a
// bearer token, persist the peer, and keep a supervised connection alive with
// capped-backoff reconnects.
//
// Phase 1 scope: pairing + a live authenticated connection whose status shows in
// Settings. The read loop parses server push frames and hands them to
// `dispatch_push`, which is the deliberate no-op seam Phase 2 fills in to mirror
// terminals / project state. Blocking network I/O never runs on the UI thread:
// `peer_pair` offloads to `spawn_blocking`, and every connection lives on its own
// std::thread, matching remote.rs's no-tokio design.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::net::{TcpStream, ToSocketAddrs};
use std::os::unix::fs::PermissionsExt;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{sync_channel, Receiver, SyncSender};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tungstenite::{Error as WsError, Message, WebSocket};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(4); // per-host probe / handshake budget
const POLL: Duration = Duration::from_millis(25); // read-timeout / outbound-drain cadence (matches remote.rs)
const KEEPALIVE: Duration = Duration::from_secs(20); // ping after this much inbound silence
const OUT_QUEUE: usize = 1024; // per-peer outbound depth; overflow errors the sender
const BACKOFF_MIN: Duration = Duration::from_secs(1);
const BACKOFF_MAX: Duration = Duration::from_secs(30);

pub const STATUS_CONNECTING: &str = "connecting";
pub const STATUS_CONNECTED: &str = "connected";
pub const STATUS_OFFLINE: &str = "offline";

// --- persisted peers (~/.lpm/peers.json) -------------------------------------

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(default)]
struct Peer {
    // The remote device id the controlled Mac assigned us at pairing — doubles as
    // this record's stable key and the `deviceId` sent on every `auth`.
    id: String,
    name: String,
    hosts: Vec<String>,
    port: u16,
    // The raw bearer token, stored here exactly as the phone stores its own token
    // (same trust model); the controlled Mac keeps only sha256(token).
    token: String,
}

// Test-only override so a test writes peers.json to a temp file instead of the
// user's ~/.lpm/peers.json. A static (not an env var) avoids racing other test
// threads that mutate the process environment.
#[cfg(test)]
static TEST_PEERS_PATH: Mutex<Option<std::path::PathBuf>> = Mutex::new(None);

fn peers_path() -> std::path::PathBuf {
    #[cfg(test)]
    if let Some(p) = TEST_PEERS_PATH.lock().unwrap().clone() {
        return p;
    }
    crate::config::lpm_dir().join("peers.json")
}

fn load_peers() -> Vec<Peer> {
    match std::fs::read(peers_path()) {
        Ok(b) => serde_json::from_slice(&b).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

fn save_peers(peers: &[Peer]) -> Result<(), String> {
    std::fs::create_dir_all(crate::config::lpm_dir()).map_err(|e| e.to_string())?;
    let data = serde_json::to_vec_pretty(peers).map_err(|e| e.to_string())?;
    std::fs::write(peers_path(), &data).map_err(|e| e.to_string())?;
    let _ = std::fs::set_permissions(peers_path(), std::fs::Permissions::from_mode(0o600));
    Ok(())
}

// --- shared state ------------------------------------------------------------

#[derive(Default)]
struct HubInner {
    peers: Mutex<Vec<Peer>>,
    status: Mutex<HashMap<String, String>>, // peer id -> live status
    stops: Mutex<HashMap<String, Arc<AtomicBool>>>, // peer id -> supervisor stop flag
    senders: Mutex<HashMap<String, SyncSender<String>>>, // peer id -> live connection's outbound queue
}

#[derive(Clone, Default)]
pub struct PeerHub {
    inner: Arc<HubInner>,
}

impl PeerHub {
    fn get_peer(&self, id: &str) -> Option<Peer> {
        self.inner.peers.lock().unwrap().iter().find(|p| p.id == id).cloned()
    }

    /// Insert (or replace, if re-paired) a peer and persist. Returns the saved list.
    fn add_peer(&self, peer: Peer) -> Result<(), String> {
        let mut peers = self.inner.peers.lock().unwrap();
        peers.retain(|p| p.id != peer.id);
        peers.push(peer);
        let snapshot = peers.clone();
        drop(peers);
        save_peers(&snapshot)
    }

    /// Stop a peer's supervisor, drop its record + status, and persist.
    fn remove_peer(&self, id: &str) -> Result<(), String> {
        if let Some(flag) = self.inner.stops.lock().unwrap().remove(id) {
            flag.store(true, Ordering::SeqCst);
        }
        self.inner.senders.lock().unwrap().remove(id);
        self.inner.status.lock().unwrap().remove(id);
        let mut peers = self.inner.peers.lock().unwrap();
        peers.retain(|p| p.id != id);
        let snapshot = peers.clone();
        drop(peers);
        save_peers(&snapshot)
    }

    fn status_of(&self, id: &str) -> String {
        self.inner
            .status
            .lock()
            .unwrap()
            .get(id)
            .cloned()
            .unwrap_or_else(|| STATUS_OFFLINE.to_string())
    }

    /// Record a peer's status; returns true when it actually changed.
    fn set_status(&self, id: &str, status: &str) -> bool {
        let mut map = self.inner.status.lock().unwrap();
        if map.get(id).map(String::as_str) == Some(status) {
            return false;
        }
        map.insert(id.to_string(), status.to_string());
        true
    }

    /// Enqueue a JSON frame onto a peer's live connection. Errors when the peer has
    /// no live connection (offline) or its queue is full.
    fn enqueue(&self, id: &str, frame: &Value) -> Result<(), String> {
        let senders = self.inner.senders.lock().unwrap();
        let tx = senders.get(id).ok_or("This Mac isn't connected right now.")?;
        tx.try_send(frame.to_string())
            .map_err(|_| "This Mac isn't keeping up — try again.".to_string())
    }
}

fn peer_summary(peer: &Peer, status: &str) -> Value {
    json!({
        "id": peer.id,
        "name": peer.name,
        "host": peer.hosts.first().cloned().unwrap_or_default(),
        "port": peer.port,
        "status": status,
    })
}

// --- lifecycle ---------------------------------------------------------------

/// Load persisted peers and start a supervisor for each. Called once from lib.rs
/// setup (mirrors remote::start).
pub fn start(hub: PeerHub, app: AppHandle) {
    let peers = load_peers();
    *hub.inner.peers.lock().unwrap() = peers.clone();
    for peer in peers {
        hub.set_status(&peer.id, STATUS_CONNECTING);
        start_supervisor(&hub, &app, peer.id);
    }
}

/// Signal every supervisor to stop (app exit).
pub fn stop(hub: &PeerHub) {
    for flag in hub.inner.stops.lock().unwrap().values() {
        flag.store(true, Ordering::SeqCst);
    }
}

fn start_supervisor(hub: &PeerHub, app: &AppHandle, peer_id: String) {
    let stop = Arc::new(AtomicBool::new(false));
    hub.inner.stops.lock().unwrap().insert(peer_id.clone(), stop.clone());
    let (hub, app) = (hub.clone(), app.clone());
    std::thread::spawn(move || supervise(hub, app, peer_id, stop));
}

/// Keep one peer's connection alive: probe → connect → auth → hold, reconnecting
/// with capped exponential backoff on any drop. Exits when the peer is removed
/// (get_peer returns None) or its stop flag is set. While connected, a per-cycle
/// outbound queue is registered so `peer_send` can push frames to this socket.
fn supervise(hub: PeerHub, app: AppHandle, peer_id: String, stop: Arc<AtomicBool>) {
    let mut backoff = BACKOFF_MIN;
    loop {
        if stop.load(Ordering::SeqCst) {
            return;
        }
        let Some(peer) = hub.get_peer(&peer_id) else {
            return; // removed
        };
        emit_status(&hub, &app, &peer_id, STATUS_CONNECTING);
        match connect_and_auth(&peer, CONNECT_TIMEOUT) {
            Ok(mut ws) => {
                backoff = BACKOFF_MIN;
                emit_status(&hub, &app, &peer_id, STATUS_CONNECTED);

                let (tx, rx) = sync_channel::<String>(OUT_QUEUE);
                hub.inner.senders.lock().unwrap().insert(peer_id.clone(), tx.clone());
                // Prime the UI on (re)connect: the projects list arrives without a
                // user action. Terminals are per-project, so the frontend requests
                // those (and re-subs an open terminal) when it sees us connected.
                let _ = tx.try_send(json!({ "t": "projects" }).to_string());

                let frame_app = app.clone();
                let frame_pid = peer_id.clone();
                run_session(&mut ws, &rx, &stop, || hub.get_peer(&peer_id).is_some(), |frame| {
                    let _ = frame_app.emit("peer-frame", json!({ "peerId": frame_pid, "frame": frame }));
                });

                hub.inner.senders.lock().unwrap().remove(&peer_id);
                let _ = ws.close(None);
                // Guard: a peer removed mid-session must not re-enter the status map.
                if hub.get_peer(&peer_id).is_some() {
                    emit_status(&hub, &app, &peer_id, STATUS_OFFLINE);
                }
            }
            Err(_) => {
                if hub.get_peer(&peer_id).is_some() {
                    emit_status(&hub, &app, &peer_id, STATUS_OFFLINE);
                }
            }
        }
        if stop.load(Ordering::SeqCst) {
            return;
        }
        sleep_with_stop(&stop, backoff);
        backoff = (backoff * 2).min(BACKOFF_MAX);
    }
}

fn emit_status(hub: &PeerHub, app: &AppHandle, id: &str, status: &str) {
    if hub.set_status(id, status) {
        let _ = app.emit("peer-status", json!({ "id": id, "status": status }));
    }
}

/// Hold an authed connection open until it drops: drain the outbound queue to the
/// socket each tick, dispatch inbound push frames via `on_frame`, and keep the
/// link warm with a ping after `KEEPALIVE` of inbound silence. `alive` is polled
/// so a peer removed mid-session tears down promptly. Frame dispatch is injected
/// (not hardcoded) so the round-trip is testable without a Tauri AppHandle.
fn run_session(
    ws: &mut WebSocket<TcpStream>,
    rx: &Receiver<String>,
    stop: &Arc<AtomicBool>,
    alive: impl Fn() -> bool,
    on_frame: impl Fn(&Value),
) {
    let _ = ws.get_ref().set_read_timeout(Some(POLL));
    let keepalive_ticks = (KEEPALIVE.as_millis() / POLL.as_millis()).max(1) as u32;
    let mut idle: u32 = 0;
    loop {
        if stop.load(Ordering::SeqCst) || !alive() {
            return;
        }
        // Flush anything peer_send queued.
        while let Ok(frame) = rx.try_recv() {
            if ws.send(Message::text(frame)).is_err() {
                return;
            }
        }
        let _ = ws.flush();
        match ws.read() {
            Ok(msg) => {
                idle = 0;
                if msg.is_close() {
                    return;
                }
                if msg.is_text() {
                    if let Ok(txt) = msg.to_text() {
                        if let Ok(v) = serde_json::from_str::<Value>(txt) {
                            on_frame(&v);
                        }
                    }
                }
            }
            Err(WsError::Io(ref e))
                if e.kind() == std::io::ErrorKind::WouldBlock
                    || e.kind() == std::io::ErrorKind::TimedOut =>
            {
                idle += 1;
                if idle >= keepalive_ticks {
                    idle = 0;
                    if ws.send(Message::text(json!({ "t": "ping" }).to_string())).is_err() {
                        return;
                    }
                    let _ = ws.flush();
                }
            }
            Err(WsError::ConnectionClosed) | Err(WsError::AlreadyClosed) => return,
            Err(_) => return,
        }
    }
}

fn sleep_with_stop(stop: &Arc<AtomicBool>, dur: Duration) {
    let step = Duration::from_millis(200);
    let mut elapsed = Duration::ZERO;
    while elapsed < dur {
        if stop.load(Ordering::SeqCst) {
            return;
        }
        std::thread::sleep(step);
        elapsed += step;
    }
}

// --- pairing / connection primitives -----------------------------------------

/// Parse `lpm://pair?p=<port>&c=<code>&h=<host>&h=<host>…` into (port, code,
/// hosts). Order-independent; rejects anything missing a field with a message fit
/// to show the user.
fn parse_pair_link(link: &str) -> Result<(u16, String, Vec<String>), String> {
    let query = link
        .trim()
        .strip_prefix("lpm://pair?")
        .ok_or("That doesn't look like an lpm pairing link.")?;
    let mut port: Option<u16> = None;
    let mut code: Option<String> = None;
    let mut hosts: Vec<String> = Vec::new();
    for part in query.split('&') {
        let (k, v) = part
            .split_once('=')
            .ok_or("The pairing link is malformed.")?;
        match k {
            "p" => port = v.parse::<u16>().ok(),
            "c" => code = Some(v.to_string()),
            "h" if !v.is_empty() => hosts.push(v.to_string()),
            _ => {}
        }
    }
    let port = port.filter(|p| *p > 0).ok_or("The pairing link is missing a valid port.")?;
    let code = code.filter(|c| !c.is_empty()).ok_or("The pairing link is missing its code.")?;
    if hosts.is_empty() {
        return Err("The pairing link has no address to connect to.".to_string());
    }
    Ok((port, code, hosts))
}

/// Open a WebSocket to `host:port` with a bounded connect + handshake budget.
fn open_ws(host: &str, port: u16, timeout: Duration) -> Option<WebSocket<TcpStream>> {
    let addr = format!("{host}:{port}").to_socket_addrs().ok()?.next()?;
    let stream = TcpStream::connect_timeout(&addr, timeout).ok()?;
    let _ = stream.set_nodelay(true);
    let _ = stream.set_read_timeout(Some(timeout));
    let _ = stream.set_write_timeout(Some(timeout));
    let (ws, _resp) = tungstenite::client(format!("ws://{host}:{port}/"), stream).ok()?;
    Some(ws)
}

/// Probe the peer's hosts in order and return the first that completes a WS
/// handshake, matching HostProbe's "first reachable wins" behavior (LAN at home,
/// Tailscale away). Sequential with a short per-host budget.
fn connect_any(hosts: &[String], port: u16, timeout: Duration) -> Option<WebSocket<TcpStream>> {
    for host in hosts {
        if let Some(ws) = open_ws(host, port, timeout) {
            return Some(ws);
        }
    }
    None
}

/// Read frames until a JSON text frame arrives (skipping ping/pong), bounded by
/// the socket's read timeout.
fn read_frame(ws: &mut WebSocket<TcpStream>) -> Result<Value, String> {
    loop {
        match ws.read().map_err(|e| e.to_string())? {
            m if m.is_text() => {
                let txt = m.to_text().map_err(|e| e.to_string())?;
                return serde_json::from_str(txt).map_err(|e| e.to_string());
            }
            m if m.is_close() => return Err("The connection closed before a reply.".to_string()),
            _ => continue,
        }
    }
}

/// Returns (deviceId, token, name) — `name` is the controlled Mac's ComputerName
/// when it sends one (newer servers), else empty.
fn do_pair(ws: &mut WebSocket<TcpStream>, code: &str, name: &str) -> Result<(String, String, String), String> {
    ws.send(Message::text(json!({ "t": "pair", "code": code, "name": name }).to_string()))
        .map_err(|e| e.to_string())?;
    let reply = read_frame(ws)?;
    match reply.get("t").and_then(Value::as_str) {
        Some("paired") => {
            let id = reply.get("deviceId").and_then(Value::as_str).unwrap_or_default();
            let token = reply.get("token").and_then(Value::as_str).unwrap_or_default();
            let peer_name = reply.get("name").and_then(Value::as_str).unwrap_or_default();
            if id.is_empty() || token.is_empty() {
                return Err("The other Mac sent an incomplete pairing reply.".to_string());
            }
            Ok((id.to_string(), token.to_string(), peer_name.to_string()))
        }
        Some("error") => Err(friendly_pair_error(
            reply.get("error").and_then(Value::as_str).unwrap_or_default(),
        )),
        _ => Err("The other Mac sent an unexpected pairing reply.".to_string()),
    }
}

fn do_auth(ws: &mut WebSocket<TcpStream>, device_id: &str, token: &str) -> Result<(), String> {
    ws.send(Message::text(
        json!({ "t": "auth", "deviceId": device_id, "token": token }).to_string(),
    ))
    .map_err(|e| e.to_string())?;
    let reply = read_frame(ws)?;
    match reply.get("t").and_then(Value::as_str) {
        Some("ready") => Ok(()),
        _ => Err("This Mac rejected the connection.".to_string()),
    }
}

/// Turn the server's terse error text into user-facing copy.
fn friendly_pair_error(err: &str) -> String {
    if err.contains("rejected") {
        "The pairing link didn't work — it may have already been used or expired. Copy a fresh link on the other Mac.".to_string()
    } else {
        "The other Mac declined pairing.".to_string()
    }
}

/// Connect to a peer and complete an `auth` → `ready` round-trip, returning the
/// live authed socket. This is exactly one supervisor cycle's setup.
fn connect_and_auth(peer: &Peer, timeout: Duration) -> Result<WebSocket<TcpStream>, String> {
    let mut ws = connect_any(&peer.hosts, peer.port, timeout)
        .ok_or("Can't reach this Mac. Check it's on and remote control is enabled.")?;
    do_auth(&mut ws, &peer.id, &peer.token)?;
    Ok(ws)
}

/// The full pairing flow (blocking): parse, pair on a fresh connection, then
/// verify the token with a separate `auth` → `ready` round-trip before returning
/// the peer to persist.
fn pair_and_verify(link: &str, name: &str) -> Result<Peer, String> {
    let (port, code, hosts) = parse_pair_link(link)?;

    let mut ws = connect_any(&hosts, port, CONNECT_TIMEOUT)
        .ok_or("Can't reach this Mac. Check it's on and remote control is enabled.")?;
    let (device_id, token, peer_name) = do_pair(&mut ws, &code, name)?;
    let _ = ws.close(None);
    let _ = ws.flush();

    // Prefer the name the controlled Mac reported; fall back to its address.
    let display_name = if peer_name.trim().is_empty() {
        hosts.first().cloned().unwrap_or_else(|| "Mac".to_string())
    } else {
        peer_name
    };
    let peer = Peer {
        id: device_id,
        name: display_name,
        hosts,
        port,
        token,
    };
    // Verify the persisted token authenticates on a fresh connection.
    let mut verify = connect_and_auth(&peer, CONNECT_TIMEOUT)?;
    let _ = verify.close(None);
    let _ = verify.flush();

    Ok(peer)
}

// --- frontend commands (Settings → Connected Macs) ---------------------------

/// Pair with another Mac from its pasted `lpm://pair?…` link: probe, pair, verify,
/// persist, and start the supervised connection. The blocking network work runs on
/// the blocking pool so the UI thread never stalls.
#[tauri::command]
pub async fn peer_pair(app: AppHandle, hub: State<'_, PeerHub>, link: String) -> Result<Value, String> {
    let hub = hub.inner().clone();
    let peer = tauri::async_runtime::spawn_blocking(move || {
        pair_and_verify(&link, &crate::sys::computer_name())
    })
    .await
    .map_err(|e| e.to_string())??;
    hub.add_peer(peer.clone())?;
    hub.set_status(&peer.id, STATUS_CONNECTING);
    start_supervisor(&hub, &app, peer.id.clone());
    let _ = app.emit("peers-changed", ());
    Ok(peer_summary(&peer, STATUS_CONNECTING))
}

/// The paired Macs with their live connection status.
#[tauri::command]
pub fn peer_list(hub: State<'_, PeerHub>) -> Vec<Value> {
    hub.peers_snapshot()
        .iter()
        .map(|p| peer_summary(p, &hub.status_of(&p.id)))
        .collect()
}

/// Enqueue a JSON frame to a peer's live connection (e.g. `sub`, `terminals`,
/// `projects`). The frontend store drives all remote requests through this.
#[tauri::command]
pub async fn peer_send(hub: State<'_, PeerHub>, id: String, frame: Value) -> Result<(), String> {
    hub.enqueue(&id, &frame)
}

/// Unpair a Mac: stop its supervisor and forget it.
#[tauri::command]
pub fn peer_remove(app: AppHandle, hub: State<'_, PeerHub>, id: String) -> Result<Vec<Value>, String> {
    hub.remove_peer(&id)?;
    let _ = app.emit("peers-changed", ());
    Ok(hub
        .peers_snapshot()
        .iter()
        .map(|p| peer_summary(p, &hub.status_of(&p.id)))
        .collect())
}

impl PeerHub {
    fn peers_snapshot(&self) -> Vec<Peer> {
        self.inner.peers.lock().unwrap().clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_link_valid_single_host() {
        let (port, code, hosts) =
            parse_pair_link("lpm://pair?p=8765&c=AB12-CD34&h=192.168.1.5").unwrap();
        assert_eq!(port, 8765);
        assert_eq!(code, "AB12-CD34");
        assert_eq!(hosts, vec!["192.168.1.5".to_string()]);
    }

    #[test]
    fn parse_link_multiple_hosts_preserves_order() {
        let (_p, _c, hosts) =
            parse_pair_link("lpm://pair?p=8765&c=X&h=192.168.1.5&h=100.92.1.1").unwrap();
        assert_eq!(hosts, vec!["192.168.1.5".to_string(), "100.92.1.1".to_string()]);
    }

    #[test]
    fn parse_link_tolerates_whitespace() {
        assert!(parse_pair_link("  lpm://pair?p=8765&c=X&h=1.2.3.4\n").is_ok());
    }

    #[test]
    fn parse_link_rejects_malformed() {
        assert!(parse_pair_link("https://example.com").is_err(), "wrong scheme");
        assert!(parse_pair_link("lpm://pair?c=X&h=1.2.3.4").is_err(), "no port");
        assert!(parse_pair_link("lpm://pair?p=0&c=X&h=1.2.3.4").is_err(), "zero port");
        assert!(parse_pair_link("lpm://pair?p=8765&h=1.2.3.4").is_err(), "no code");
        assert!(parse_pair_link("lpm://pair?p=8765&c=X").is_err(), "no host");
        assert!(parse_pair_link("lpm://pair?p=notaport&c=X&h=1.2.3.4").is_err(), "bad port");
    }

    #[test]
    fn peers_json_roundtrips() {
        let tmp = std::env::temp_dir().join(format!("lpm-peers-test-{}.json", std::process::id()));
        *TEST_PEERS_PATH.lock().unwrap() = Some(tmp.clone());

        let peers = vec![Peer {
            id: "dev-1".into(),
            name: "Studio Mac".into(),
            hosts: vec!["192.168.1.5".into(), "100.92.1.1".into()],
            port: 8765,
            token: "sekret-token".into(),
        }];
        save_peers(&peers).unwrap();
        let back = load_peers();

        *TEST_PEERS_PATH.lock().unwrap() = None;
        let _ = std::fs::remove_file(&tmp);

        assert_eq!(back.len(), 1);
        assert_eq!(back[0].id, "dev-1");
        assert_eq!(back[0].name, "Studio Mac");
        assert_eq!(back[0].hosts, vec!["192.168.1.5".to_string(), "100.92.1.1".to_string()]);
        assert_eq!(back[0].port, 8765);
        assert_eq!(back[0].token, "sekret-token");
    }

    #[test]
    fn set_status_reports_changes() {
        let hub = PeerHub::default();
        assert!(hub.set_status("a", STATUS_CONNECTING));
        assert!(!hub.set_status("a", STATUS_CONNECTING), "same status is not a change");
        assert!(hub.set_status("a", STATUS_CONNECTED));
        assert_eq!(hub.status_of("a"), STATUS_CONNECTED);
        assert_eq!(hub.status_of("unknown"), STATUS_OFFLINE);
    }

    // End-to-end against the real remote.rs server code: a peer pairs (pair →
    // paired), the controlled side records a Device, and a fresh auth → ready
    // round-trip (one supervisor cycle) succeeds — i.e. the peer would reach
    // `connected`.
    #[test]
    fn pairs_and_authenticates_against_real_server() {
        let cfg_tmp =
            std::env::temp_dir().join(format!("lpm-peer-remote-{}.json", std::process::id()));
        crate::remote::test_support::set_config_path(cfg_tmp.clone());

        let hub = crate::remote::test_support::new_hub_with_code("AAAA-BBBB");
        assert_eq!(crate::remote::test_support::device_count(&hub), 0);

        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let stop = Arc::new(AtomicBool::new(false));
        let server = {
            let (hub, stop) = (hub.clone(), stop.clone());
            std::thread::spawn(move || crate::remote::test_support::serve(listener, hub, stop))
        };

        let link = format!("lpm://pair?p={port}&c=AAAA-BBBB&h=127.0.0.1");
        let peer = pair_and_verify(&link, "Mac A").expect("pairing + verify");

        assert!(!peer.id.is_empty());
        assert!(!peer.token.is_empty());
        assert_eq!(peer.port, port);
        // The controlled side reported its ComputerName in `paired`, so the peer's
        // display name came from the server, not the host-address fallback.
        assert!(!peer.name.is_empty());
        assert_ne!(peer.name, "127.0.0.1", "name should come from the paired reply");
        // The controlled side persisted exactly one Device.
        assert_eq!(crate::remote::test_support::device_count(&hub), 1);

        // A fresh supervisor cycle (connect + auth → ready) reaches connected.
        let mut ws = connect_and_auth(&peer, CONNECT_TIMEOUT).expect("supervisor auth");
        let _ = ws.close(None);

        stop.store(true, Ordering::SeqCst);
        let _ = server.join();
        crate::remote::test_support::clear_config_path();
        let _ = std::fs::remove_file(&cfg_tmp);
    }

    // Full request→push round-trip: a session drives requests through the outbound
    // queue and the injected frame handler receives the server's replies —
    // projects, terminals, and a sub's seed + live output frame.
    #[test]
    fn session_round_trips_frames_through_queue() {
        use std::time::Instant;

        let cfg_tmp =
            std::env::temp_dir().join(format!("lpm-peer-frames-{}.json", std::process::id()));
        crate::remote::test_support::set_config_path(cfg_tmp.clone());
        let hub = crate::remote::test_support::new_hub_with_code("CCCC-DDDD");

        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let srv_stop = Arc::new(AtomicBool::new(false));
        let server = {
            let (hub, stop) = (hub.clone(), srv_stop.clone());
            std::thread::spawn(move || crate::remote::test_support::serve(listener, hub, stop))
        };

        let link = format!("lpm://pair?p={port}&c=CCCC-DDDD&h=127.0.0.1");
        let peer = pair_and_verify(&link, "Mac A").expect("pair");

        let collected = Arc::new(Mutex::new(Vec::<Value>::new()));
        let sess_stop = Arc::new(AtomicBool::new(false));
        let (tx, rx) = sync_channel::<String>(OUT_QUEUE);
        let session = {
            let (peer, collected, sess_stop) = (peer.clone(), collected.clone(), sess_stop.clone());
            std::thread::spawn(move || {
                let mut ws = connect_and_auth(&peer, CONNECT_TIMEOUT).expect("session auth");
                run_session(&mut ws, &rx, &sess_stop, || true, |frame| {
                    collected.lock().unwrap().push(frame.clone());
                });
            })
        };

        tx.send(json!({ "t": "projects" }).to_string()).unwrap();
        tx.send(json!({ "t": "terminals", "project": "web-app" }).to_string()).unwrap();
        tx.send(json!({ "t": "sub", "id": "web-app-1" }).to_string()).unwrap();

        let has = |t: &str| collected.lock().unwrap().iter().any(|f| f["t"] == t);
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            if has("projects") && has("terminals") && has("seed") && has("o") {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        sess_stop.store(true, Ordering::SeqCst);
        let _ = session.join();
        srv_stop.store(true, Ordering::SeqCst);
        let _ = server.join();
        crate::remote::test_support::clear_config_path();
        let _ = std::fs::remove_file(&cfg_tmp);

        let frames = collected.lock().unwrap();
        let find = |t: &str| frames.iter().find(|f| f["t"] == t).cloned();
        assert!(find("projects").is_some(), "projects frame forwarded");
        let terminals = find("terminals").expect("terminals frame");
        assert_eq!(terminals["project"], "web-app");
        let seed = find("seed").expect("seed frame");
        assert_eq!(seed["id"], "web-app-1");
        assert_eq!(seed["data"], "hello");
        let o = find("o").expect("output frame");
        assert_eq!(o["d"], "world");
    }

    // Take-control round-trip: claim yields a control frame, and input/resize
    // frames transit the outbound queue verbatim — including the `\0HEX:` framing
    // the frontend produces for non-UTF-8 input.
    #[test]
    fn control_input_and_resize_round_trip() {
        use std::time::Instant;

        let cfg_tmp =
            std::env::temp_dir().join(format!("lpm-peer-ctrl-{}.json", std::process::id()));
        crate::remote::test_support::set_config_path(cfg_tmp.clone());
        let hub = crate::remote::test_support::new_hub_with_code("EEEE-FFFF");

        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let srv_stop = Arc::new(AtomicBool::new(false));
        let server = {
            let (hub, stop) = (hub.clone(), srv_stop.clone());
            std::thread::spawn(move || crate::remote::test_support::serve(listener, hub, stop))
        };

        let link = format!("lpm://pair?p={port}&c=EEEE-FFFF&h=127.0.0.1");
        let peer = pair_and_verify(&link, "Mac A").expect("pair");

        let collected = Arc::new(Mutex::new(Vec::<Value>::new()));
        let sess_stop = Arc::new(AtomicBool::new(false));
        let (tx, rx) = sync_channel::<String>(OUT_QUEUE);
        let session = {
            let (peer, collected, sess_stop) = (peer.clone(), collected.clone(), sess_stop.clone());
            std::thread::spawn(move || {
                let mut ws = connect_and_auth(&peer, CONNECT_TIMEOUT).expect("session auth");
                run_session(&mut ws, &rx, &sess_stop, || true, |frame| {
                    collected.lock().unwrap().push(frame.clone());
                });
            })
        };

        // ESC + 0xFF, framed exactly as the frontend's encoder produces.
        let hex_input = "\u{0}HEX:1bff";
        tx.send(json!({ "t": "claim", "id": "web-app-1" }).to_string()).unwrap();
        tx.send(json!({ "t": "in", "id": "web-app-1", "d": hex_input }).to_string()).unwrap();
        tx.send(json!({ "t": "resize", "id": "web-app-1", "cols": 120, "rows": 40 }).to_string()).unwrap();

        let has = |t: &str| collected.lock().unwrap().iter().any(|f| f["t"] == t);
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            if has("control") && has("in-echo") && has("resize-echo") {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        sess_stop.store(true, Ordering::SeqCst);
        let _ = session.join();
        srv_stop.store(true, Ordering::SeqCst);
        let _ = server.join();
        crate::remote::test_support::clear_config_path();
        let _ = std::fs::remove_file(&cfg_tmp);

        let frames = collected.lock().unwrap();
        let find = |t: &str| frames.iter().find(|f| f["t"] == t).cloned();
        let control = find("control").expect("control frame from claim");
        assert_eq!(control["owner"]["kind"], "mobile");
        let in_echo = find("in-echo").expect("input echoed");
        assert_eq!(in_echo["d"], hex_input, "HEX-framed input transited verbatim");
        let resize = find("resize-echo").expect("resize echoed");
        assert_eq!(resize["cols"], 120);
        assert_eq!(resize["rows"], 40);
    }
}
