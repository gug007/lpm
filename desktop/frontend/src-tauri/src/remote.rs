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
// Security posture: a per-device bearer token established by a single-use
// pairing code (shown as a QR in Settings); token hashes are stored in
// ~/.lpm/remote.json (0600). Current clients speak wss:// (see remotetls.rs):
// each connection is wrapped in a rustls server session presenting a persisted,
// self-signed leaf (ECDSA P-256, CN "lpm") before the WebSocket handshake. The
// phone pins the leaf's SHA-256 on first pair/auth (TOFU); the pairing QR carries
// that fingerprint (`f=`) so a QR pair can verify the leaf up front. As a
// transitional measure the acceptor also accepts legacy plaintext ws:// clients
// (the pre-TLS mobile app still on the App Store), chosen per connection by
// sniffing the first byte; that branch can be dropped once the pinned app ships.
// When enabled the server binds every interface (0.0.0.0) so a paired phone can
// reach it over the LAN or tailnet.
use crate::status::{StatusStore, STATUS_DONE, STATUS_ERROR, STATUS_WAITING};
use crate::{config, pty, services};
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet, VecDeque};
use std::io::{self, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::mpsc::{self, SyncSender, TryRecvError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Listener, Manager, State};
use tungstenite::{accept, Error as WsError, Message, WebSocket};

// One phone connection's transport. The acceptor handles both this build's
// TLS-wrapped clients (remotetls.rs) and, transitionally, the plaintext clients
// of the pre-TLS mobile app — picked per connection by sniffing the first byte.
// Everything above the stream (WebSocket handshake, Origin refusal, auth, frames)
// is identical on both; a single concrete type keeps `WebSocket<T>` monomorphic.
enum RemoteStream {
    Plain(TcpStream),
    Tls(Box<rustls::StreamOwned<rustls::ServerConnection, TcpStream>>),
}

impl RemoteStream {
    /// The underlying TCP socket — for read-timeout tuning on either variant.
    fn tcp(&self) -> &TcpStream {
        match self {
            RemoteStream::Plain(s) => s,
            RemoteStream::Tls(t) => t.get_ref(),
        }
    }
}

impl Read for RemoteStream {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        match self {
            RemoteStream::Plain(s) => s.read(buf),
            RemoteStream::Tls(t) => t.read(buf),
        }
    }
}

impl Write for RemoteStream {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        match self {
            RemoteStream::Plain(s) => s.write(buf),
            RemoteStream::Tls(t) => t.write(buf),
        }
    }
    fn flush(&mut self) -> io::Result<()> {
        match self {
            RemoteStream::Plain(s) => s.flush(),
            RemoteStream::Tls(t) => t.flush(),
        }
    }
}

type ClientWs = WebSocket<RemoteStream>;

const DEFAULT_PORT: u16 = 8765;
const RING_CAP: usize = 96 * 1024; // recent scrollback seeded to a joining phone
const POLL: Duration = Duration::from_millis(25); // read-timeout / outbound-drain cadence
const AUTH_TIMEOUT: Duration = Duration::from_secs(20);
const OUT_QUEUE: usize = 1024; // per-client outbound depth; overflow drops (phone re-seeds)
const DEFAULT_PUSH_RELAY: &str = "https://lpm.cx/api/push"; // APNs relay (holds the signing key)
const PAIR_APPROVE_WINDOW: Duration = Duration::from_secs(30); // approve-on-Mac decision deadline
const PAIR_MIN_GAP_MS: i64 = 5000; // min spacing between approve-on-Mac dialogs (anti-nag)

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
    // Per-device notification prefs (from the phone's `notify` object). Agent
    // prefs default on for older records; automation prefs default off.
    #[serde(default = "default_true")]
    push_waiting: bool,
    #[serde(default = "default_true")]
    push_done: bool,
    #[serde(default = "default_true")]
    push_error: bool,
    push_automation_started: bool,
    push_automation_done: bool,
    push_automation_error: bool,
    // The flavor-aware server id of the instance that completed this pairing (dev
    // vs prod). None on legacy entries — treated as prod — so the dev instance
    // never pushes to them and their pushes keep flowing. Scopes push delivery so a
    // phone paired with only one flavor gets no phantom pushes from the other.
    #[serde(default)]
    paired_server_id: Option<String>,
}

// Manual Default (not derived) so `..Default::default()` agrees with serde: agent
// prefs start true, but a derived Default would make them false.
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
            push_automation_started: false,
            push_automation_done: false,
            push_automation_error: false,
            paired_server_id: None,
        }
    }
}

#[derive(Clone, Copy)]
struct PushPreferences {
    waiting: bool,
    done: bool,
    error: bool,
    automation_started: bool,
    automation_done: bool,
    automation_error: bool,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(default)]
struct RemoteConfig {
    enabled: bool,
    port: u16, // 0 => DEFAULT_PORT
    pairing_code: String, // non-empty while an unused pairing code is outstanding
    tailscale: bool, // advertise this Mac's Tailscale address in the pairing QR
    push_relay: String, // override for the APNs relay URL (empty => DEFAULT_PUSH_RELAY)
    // Stable identity of this Mac, minted on first run and persisted. Sent to the
    // phone so it can distinguish and label multiple paired Macs, and mixed into
    // the push collapse id so same-named projects on different Macs don't collide.
    server_id: Option<String>,
    // The dev instance's own stable id, so a dev and a prod build sharing this
    // config present as two distinct Macs to the phone. Prod uses `server_id`,
    // dev uses this; each mints its own lazily. Absent in legacy configs.
    #[serde(default)]
    dev_server_id: Option<String>,
    devices: Vec<Device>,
}

impl Default for RemoteConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            port: 0,
            pairing_code: String::new(),
            tailscale: true, // away-from-home works out of the box; the toggle opts out
            push_relay: String::new(),
            server_id: None,
            dev_server_id: None,
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

    /// Fill in this flavor's stable server id if absent, returning whether one was
    /// minted (so the caller knows to persist). Dev mints/owns `dev_server_id`,
    /// prod mints/owns `server_id`, so both coexist under one shared config.
    fn ensure_server_id(&mut self) -> bool {
        let slot = if is_dev_instance() {
            &mut self.dev_server_id
        } else {
            &mut self.server_id
        };
        if slot.as_deref().unwrap_or_default().is_empty() {
            *slot = Some(uuid::Uuid::new_v4().to_string());
            true
        } else {
            false
        }
    }

    /// This flavor's server id (may be empty until `ensure_server_id` mints one).
    /// Every wire/push use of the server id must go through this, never the raw
    /// field, so dev and prod stay distinguishable.
    fn flavor_server_id(&self) -> String {
        if is_dev_instance() {
            self.dev_server_id.clone().unwrap_or_default()
        } else {
            self.server_id.clone().unwrap_or_default()
        }
    }

    /// The prod (non-dev) server id — the default owner assumed for legacy device
    /// records that predate per-flavor push scoping.
    fn prod_server_id(&self) -> String {
        self.server_id.clone().unwrap_or_default()
    }
}

/// This Mac's user-visible name, resolved once per process. Prefers the Sharing
/// pane's ComputerName, falling back to the local hostname, then a literal.
fn server_name() -> String {
    static NAME: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    NAME.get_or_init(|| {
        let mut base = "Mac".to_string();
        for key in ["ComputerName", "LocalHostName"] {
            if let Ok(out) = std::process::Command::new("scutil")
                .arg("--get")
                .arg(key)
                .output()
            {
                if out.status.success() {
                    let name = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    if !name.is_empty() {
                        base = name;
                        break;
                    }
                }
            }
        }
        // Suffix the dev build so the phone's switcher shows two distinct entries
        // when a dev and a prod instance run on the same Mac.
        if is_dev_instance() {
            base.push_str(" (dev)");
        }
        base
    })
    .clone()
}

// Dev/prod discriminator for coexisting on one Mac with a shared ~/.lpm: the
// `npm run tauri dev` build compiles a debug binary; the shipped app is release.
// This drives the per-flavor port, server id, name suffix, and push scoping so a
// dev and a prod instance never fight over the same identity or port.
fn is_dev_instance() -> bool {
    cfg!(debug_assertions)
}

/// The listen port for a configured value and flavor. The dev instance sits at the
/// prod effective port + 2 (8766 is the Mac-to-Mac peer host) so the two instances
/// can never collide through the shared remote.json, including a user-set port.
fn effective_port_for(p: u16, dev: bool) -> u16 {
    let base = if p == 0 { DEFAULT_PORT } else { p };
    if dev {
        base + 2
    } else {
        base
    }
}

fn effective_port(p: u16) -> u16 {
    effective_port_for(p, is_dev_instance())
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
    // remote.json holds device token hashes and push keys — Exact(0o600) so the
    // temp never exists at a wider mode and the file stays 0600 on first creation.
    crate::fsatomic::write(&config_path(), &data, crate::fsatomic::Mode::Exact(0o600))
        .map_err(|e| e.to_string())
}

// --- shared state ------------------------------------------------------------

struct Client {
    tx: SyncSender<String>,
    subs: Arc<Mutex<HashSet<String>>>,
    device_id: String,
}

// The plain text of a terminal composer's active input, mirrored between the
// desktop and paired phones. `rev` is the globally monotonic revision the entry
// was last written at (see `draft_rev`), so a stale frame is dropped and a
// re-created draft never appears older than a prior clear.
struct DraftEntry {
    text: String,
    rev: u64,
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
    // Live terminal id -> the composer's active-input draft text, synced both ways
    // between the desktop composer and paired phones. Cleared when the text goes
    // empty; the seed carries the stored draft so a reconnecting/opening phone
    // restores it.
    drafts: Mutex<HashMap<String, DraftEntry>>,
    // Monotonic revision stamped on every draft write (desktop or phone). Global
    // rather than per-terminal so a draft that was cleared and later re-typed still
    // gets a strictly larger rev than the clear, keeping last-writer-wins ordering
    // even though the cleared entry was removed from the map.
    draft_rev: AtomicU64,
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
    // The one in-flight approve-on-Mac pairing request (a phone that discovered
    // this Mac and asked to pair without a code). One at a time; the connection
    // thread parks on its decision channel while the user sees the dialog.
    pending_pair: Mutex<Option<PendingPair>>,
    // Millis of the last approve-on-Mac dialog presented, to space prompts out
    // (anti-nag / rate limit) even across separate connections.
    last_pair_prompt: Mutex<i64>,
    next_id: AtomicU64,
    generation: AtomicU64, // bumped on every (re)start to retire old accept/conn threads
    enabled: AtomicBool,   // mirror of config.enabled, checked on the pty flush hot path
    running: AtomicBool,   // a listener is currently bound
}

/// An outstanding approve-on-Mac pairing request. The connection thread owns the
/// receiving half of `decision`; `remote_respond_pair_request` sends the user's
/// Allow/Deny through it (matched by `request_id`).
struct PendingPair {
    request_id: String,
    decision: SyncSender<bool>,
}

#[derive(Clone, Default)]
pub struct RemoteHub {
    inner: Arc<HubInner>,
}

impl RemoteHub {
    fn config(&self) -> RemoteConfig {
        self.inner.config.lock().unwrap().clone()
    }

    /// This Mac's stable id, minting and persisting one if it is somehow still
    /// unset (start() normally does this at load time).
    fn server_id(&self) -> String {
        let mut cfg = self.inner.config.lock().unwrap();
        if cfg.ensure_server_id() {
            let snapshot = cfg.clone();
            drop(cfg);
            let _ = save_config(&snapshot);
            return snapshot.flavor_server_id();
        }
        cfg.flavor_server_id()
    }

    /// Register a new approve-on-Mac pairing request, returning its id, the
    /// human-verified match code, and the receiver the connection thread parks
    /// on. `None` when one is already pending or the anti-nag gap hasn't elapsed
    /// (caller replies `pairDenied`/`busy`).
    fn begin_pair_request(&self) -> Option<(String, String, mpsc::Receiver<bool>)> {
        let mut pending = self.inner.pending_pair.lock().unwrap();
        if pending.is_some() {
            return None; // one dialog at a time
        }
        let now = crate::status::now_millis();
        {
            let mut last = self.inner.last_pair_prompt.lock().unwrap();
            if now - *last < PAIR_MIN_GAP_MS {
                return None; // presented one too recently
            }
            *last = now;
        }
        let request_id = uuid::Uuid::new_v4().to_string();
        let match_code = gen_match_code();
        let (tx, rx) = mpsc::sync_channel::<bool>(1);
        *pending = Some(PendingPair {
            request_id: request_id.clone(),
            decision: tx,
        });
        Some((request_id, match_code, rx))
    }

    /// Deliver the user's Allow/Deny to the waiting connection thread and clear
    /// the pending slot. No-op if the request already resolved (timeout/hang-up).
    fn respond_pair_request(&self, request_id: &str, allow: bool) {
        let mut pending = self.inner.pending_pair.lock().unwrap();
        if pending.as_ref().is_some_and(|p| p.request_id == request_id) {
            if let Some(p) = pending.take() {
                let _ = p.decision.try_send(allow);
            }
        }
    }

    /// Drop the pending request if it is still this one (idempotent teardown for
    /// the timeout / phone-disconnect endings).
    fn clear_pair_request(&self, request_id: &str) {
        let mut pending = self.inner.pending_pair.lock().unwrap();
        if pending.as_ref().is_some_and(|p| p.request_id == request_id) {
            *pending = None;
        }
    }

    fn device_exists(&self, id: &str) -> bool {
        self.inner
            .config
            .lock()
            .unwrap()
            .devices
            .iter()
            .any(|d| d.id == id)
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

/// Record a composer draft for a terminal and return the revision to broadcast.
/// Non-empty text is stored; empty text clears the entry (and returns `None` when
/// there was nothing to clear, so callers skip a pointless broadcast). Every real
/// write consumes a fresh global revision.
fn record_draft(hub: &RemoteHub, id: &str, text: &str) -> Option<u64> {
    let mut map = hub.inner.drafts.lock().unwrap();
    if text.is_empty() && map.remove(id).is_none() {
        return None;
    }
    let rev = hub.inner.draft_rev.fetch_add(1, Ordering::Relaxed) + 1;
    if !text.is_empty() {
        map.insert(
            id.to_string(),
            DraftEntry {
                text: text.to_string(),
                rev,
            },
        );
    }
    Some(rev)
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
    broadcast(
        hub.inner(),
        json!({ "t": "control", "id": id, "owner": owner }),
    );
}

/// The control surface for a paired phone.
fn mobile_owner(hub: &RemoteHub, device_id: &str) -> crate::control::Owner {
    crate::control::Owner::new("mobile", device_id, hub.device_name(device_id))
}

// --- lifecycle ---------------------------------------------------------------

/// Load persisted config, install event forwarders, and start the server if
/// enabled. Called once from lib.rs setup (mirrors socketsrv::start).
pub fn start(hub: RemoteHub, app: AppHandle) {
    let mut cfg = load_config();
    if cfg.ensure_server_id() {
        let _ = save_config(&cfg);
    }
    *hub.inner.config.lock().unwrap() = cfg;
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
        crate::mdns::withdraw();
        return;
    }
    let port = effective_port(cfg.port);
    let addr = format!("0.0.0.0:{port}");
    let server_id = hub.server_id();
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
            crate::mdns::withdraw();
            return;
        };
        // A newer apply() may have superseded us between binding and here; that
        // apply() has already run its own withdraw()/advertise(), so if we went on
        // we'd re-advertise a record the accept_loop below abandons on its first
        // generation check — a Bonjour entry pointing at nothing. Drop the listener
        // (freeing the port for the winning apply()) and bail without advertising.
        if hub.inner.generation.load(Ordering::SeqCst) != generation {
            return;
        }
        let _ = listener.set_nonblocking(true);
        hub.inner.running.store(true, Ordering::Relaxed);
        crate::mdns::advertise(crate::mdns::AdParams {
            server_id,
            server_name: server_name(),
            port,
            dev: is_dev_instance(),
        });
        accept_loop(listener, hub, app, generation);
    });
}

/// Signal a clean shutdown (app exit). Retires threads and drops clients.
pub fn stop(hub: &RemoteHub) {
    hub.inner.generation.fetch_add(1, Ordering::SeqCst);
    hub.inner.enabled.store(false, Ordering::Relaxed);
    hub.inner.running.store(false, Ordering::Relaxed);
    hub.inner.clients.lock().unwrap().clear();
    crate::mdns::withdraw();
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

fn accept_ws(stream: TcpStream) -> Option<ClientWs> {
    let peer = stream
        .peer_addr()
        .map(|p| p.to_string())
        .unwrap_or_else(|_| "unknown".into());
    let _ = stream.set_nodelay(true);
    let _ = stream.set_read_timeout(Some(AUTH_TIMEOUT));
    // Peek one byte to choose the transport: 0x16 is a TLS ClientHello (current
    // clients); anything else is a legacy plaintext WebSocket upgrade (`GET …`).
    // The byte stays buffered in the socket for the handshake that follows.
    let mut first = [0u8; 1];
    match stream.peek(&mut first) {
        Ok(0) | Err(_) => None,
        Ok(_) if crate::peertls::sniff_is_tls(first[0]) => {
            // Wrap the raw socket in a rustls server session before the WebSocket
            // handshake; the TLS handshake itself runs lazily inside accept()'s
            // first reads/writes, bounded by the read timeout just set above.
            let conn = rustls::ServerConnection::new(crate::remotetls::server_config()).ok()?;
            let tls = RemoteStream::Tls(Box::new(rustls::StreamOwned::new(conn, stream)));
            match accept(tls) {
                Ok(ws) => Some(ws),
                Err(e) => {
                    // A failed handshake is the one moment the phone can't tell us
                    // what went wrong (its screen just says the secure connection
                    // failed), so record who tried and why here — both for the dev
                    // console and for support, next to the rest of the remote state.
                    log_handshake_failure(&peer, &e.to_string());
                    None
                }
            }
        }
        // Transitional plaintext branch for the pre-TLS mobile app still on the
        // App Store: run the WebSocket handshake directly on the plain socket.
        // This can be dropped once the pinned (wss-only) app is live in the store.
        Ok(_) => accept(RemoteStream::Plain(stream)).ok(),
    }
}

fn log_handshake_failure(peer: &str, reason: &str) {
    let line = format!(
        "{} secure handshake with {peer} failed: {reason}\n",
        time::OffsetDateTime::now_utc()
    );
    eprint!("remote: {line}");
    let path = crate::config::lpm_dir().join("remote-handshake.log");
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        use std::io::Write;
        let _ = f.write_all(line.as_bytes());
    }
}

fn handle_conn(stream: TcpStream, hub: RemoteHub, app: AppHandle, generation: u64) {
    let Some(mut ws) = accept_ws(stream) else {
        return;
    };
    let outcome = match authenticate(&mut ws, &hub) {
        FirstFrame::Done(outcome) => outcome,
        // Approve-on-Mac: drive the dialog here, where the AppHandle lives.
        FirstFrame::PairRequest(name) => handle_pair_request(&mut ws, &hub, &app, &name),
    };
    let device_id = match outcome {
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
    let _ = ws.get_ref().tcp().set_read_timeout(Some(POLL));

    // Per-connection working-tree watchers (project -> watcher). Local to this
    // connection so they stop deterministically on teardown below, which also
    // covers device revocation (the loop self-exits, then this scope drops).
    let mut watches: HashMap<String, RemoteWatch> = HashMap::new();

    'main: loop {
        // Retire on server restart or when this device is revoked.
        if hub.inner.generation.load(Ordering::SeqCst) != generation
            || !hub.device_exists(&device_id)
        {
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
                        if handle_msg(
                            &mut ws,
                            &txt,
                            &hub,
                            &app,
                            &subs,
                            &device_id,
                            &out,
                            &mut watches,
                        )
                        .is_err()
                        {
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
    for (id, new_owner) in app
        .state::<crate::control::ControlState>()
        .drop_surface(&owner)
    {
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

/// The result of reading the first frame. `pair`/`auth` resolve inline (reply
/// already sent). `PairRequest` needs the AppHandle to drive the on-Mac approval
/// dialog, so it's handed back to `handle_conn` (which owns `app`) — keeping
/// `authenticate` itself free of any window/event dependency.
enum FirstFrame {
    Done(Option<AuthOutcome>),
    PairRequest(String), // the phone's device name
}

fn authenticate(ws: &mut ClientWs, hub: &RemoteHub) -> FirstFrame {
    let txt = loop {
        match ws.read() {
            Ok(m) if m.is_text() => match m.to_text() {
                Ok(t) => break t.to_string(),
                Err(_) => return FirstFrame::Done(None),
            },
            Ok(m) if m.is_close() => return FirstFrame::Done(None),
            Ok(_) => continue, // ping/pong/binary during handshake — keep waiting
            Err(_) => return FirstFrame::Done(None),
        }
    };
    let Ok(v) = serde_json::from_str::<Value>(&txt) else {
        return FirstFrame::Done(None);
    };
    match v.get("t").and_then(Value::as_str) {
        Some("pairRequest") => {
            let name = v.get("name").and_then(Value::as_str).unwrap_or("iPhone");
            FirstFrame::PairRequest(name.to_string())
        }
        Some("pair") => {
            let code = v.get("code").and_then(Value::as_str).unwrap_or_default();
            let name = v.get("name").and_then(Value::as_str).unwrap_or("device");
            match pair_device(hub, code, name) {
                Some((id, token)) => {
                    let _ = ws.send(Message::text(
                        json!({
                            "t": "paired",
                            "deviceId": id,
                            "token": token,
                            "serverId": hub.server_id(),
                            "serverName": server_name(),
                        })
                        .to_string(),
                    ));
                    FirstFrame::Done(Some(AuthOutcome::Paired(id)))
                }
                None => {
                    let _ = ws.send(Message::text(
                        json!({ "t": "error", "error": "pairing rejected" }).to_string(),
                    ));
                    FirstFrame::Done(None)
                }
            }
        }
        Some("auth") => {
            let id = v
                .get("deviceId")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let token = v.get("token").and_then(Value::as_str).unwrap_or_default();
            if check_device(hub, id, token) {
                let _ = ws.send(Message::text(
                    json!({
                        "t": "ready",
                        "serverId": hub.server_id(),
                        "serverName": server_name(),
                    })
                    .to_string(),
                ));
                FirstFrame::Done(Some(AuthOutcome::Resumed(id.to_string())))
            } else {
                let _ = ws.send(Message::text(
                    json!({ "t": "error", "error": "unauthorized" }).to_string(),
                ));
                FirstFrame::Done(None)
            }
        }
        _ => FirstFrame::Done(None),
    }
}

/// How an approve-on-Mac request ended, driving the reply frame.
enum PairOutcome {
    Allow,
    Deny,
    Timeout,
    Gone, // the phone hung up before the user decided
}

/// Drive one approve-on-Mac pairing: show the dialog on the Mac, wait up to
/// `PAIR_APPROVE_WINDOW` for the user's decision (cancelling if the phone drops),
/// and reply per the resolution. On Allow this mints a device exactly as the
/// code-based pair path does (shared `mint_device`), so the post-`paired`
/// connection behaves identically.
fn handle_pair_request(
    ws: &mut ClientWs,
    hub: &RemoteHub,
    app: &AppHandle,
    name: &str,
) -> Option<AuthOutcome> {
    let Some((request_id, match_code, rx)) = hub.begin_pair_request() else {
        let _ = ws.send(Message::text(
            json!({ "t": "pairDenied", "reason": "busy" }).to_string(),
        ));
        return None;
    };
    let _ = ws.send(Message::text(
        json!({ "t": "pairPending", "matchCode": match_code }).to_string(),
    ));
    // Surface the approval dialog and pull the window forward so the user sees it.
    let _ = app.emit(
        "remote-pair-request",
        json!({ "requestId": request_id, "name": name, "matchCode": match_code }),
    );
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }

    // Poll the decision channel and the socket together: a short read timeout lets
    // us notice the phone hanging up (so the dialog dismisses) without missing the
    // user's Allow/Deny.
    let _ = ws
        .get_ref()
        .tcp()
        .set_read_timeout(Some(Duration::from_millis(250)));
    let deadline = Instant::now() + PAIR_APPROVE_WINDOW;
    let outcome = loop {
        match rx.try_recv() {
            Ok(true) => break PairOutcome::Allow,
            Ok(false) => break PairOutcome::Deny,
            Err(TryRecvError::Disconnected) => break PairOutcome::Gone,
            Err(TryRecvError::Empty) => {}
        }
        if Instant::now() >= deadline {
            break PairOutcome::Timeout;
        }
        match ws.read() {
            Ok(m) if m.is_close() => break PairOutcome::Gone,
            Ok(_) => {}
            Err(WsError::Io(ref e))
                if e.kind() == std::io::ErrorKind::WouldBlock
                    || e.kind() == std::io::ErrorKind::TimedOut => {}
            Err(WsError::ConnectionClosed) | Err(WsError::AlreadyClosed) => {
                break PairOutcome::Gone
            }
            Err(_) => break PairOutcome::Gone,
        }
    };

    // Settle the request (idempotent if the command already took it) and let the
    // dialog close itself on the phone-side / timeout endings.
    hub.clear_pair_request(&request_id);
    let _ = app.emit(
        "remote-pair-request-resolved",
        json!({ "requestId": request_id }),
    );

    match outcome {
        PairOutcome::Allow => {
            let (id, token) = mint_device_persisted(hub, name);
            let _ = ws.send(Message::text(
                json!({
                    "t": "paired",
                    "deviceId": id,
                    "token": token,
                    "serverId": hub.server_id(),
                    "serverName": server_name(),
                })
                .to_string(),
            ));
            Some(AuthOutcome::Paired(id))
        }
        PairOutcome::Deny => {
            let _ = ws.send(Message::text(
                json!({ "t": "pairDenied", "reason": "declined" }).to_string(),
            ));
            None
        }
        PairOutcome::Timeout => {
            let _ = ws.send(Message::text(
                json!({ "t": "pairDenied", "reason": "timeout" }).to_string(),
            ));
            None
        }
        PairOutcome::Gone => None,
    }
}

fn normalize_code(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>()
        .to_uppercase()
}

/// Mint a device record (token + id) for a newly paired phone, pushing it onto
/// the config. The single token-issuing path shared by the code-based pair flow
/// and approve-on-Mac; the caller persists the config.
fn mint_device(cfg: &mut RemoteConfig, name: &str) -> (String, String) {
    let token = gen_token();
    // Stamp the pairing flavor's server id so push scoping later routes only this
    // flavor's alerts to this device; ensure the id exists first (start() normally
    // minted it, but be robust if pairing races startup).
    cfg.ensure_server_id();
    let paired_server_id = Some(cfg.flavor_server_id());
    let device = Device {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.chars().take(64).collect(),
        token_hash: sha256_hex(token.as_bytes()),
        created_at: crate::status::now_millis(),
        paired_server_id,
        ..Default::default()
    };
    let id = device.id.clone();
    cfg.devices.push(device);
    (id, token)
}

/// Mint and persist a device outside the pairing-code flow (approve-on-Mac).
fn mint_device_persisted(hub: &RemoteHub, name: &str) -> (String, String) {
    let mut cfg = hub.inner.config.lock().unwrap();
    let pair = mint_device(&mut cfg, name);
    let snapshot = cfg.clone();
    drop(cfg);
    let _ = save_config(&snapshot);
    pair
}

fn pair_device(hub: &RemoteHub, code: &str, name: &str) -> Option<(String, String)> {
    let mut cfg = hub.inner.config.lock().unwrap();
    let expected = normalize_code(&cfg.pairing_code);
    if expected.is_empty() || !ct_eq(expected.as_bytes(), normalize_code(code).as_bytes()) {
        return None;
    }
    let pair = mint_device(&mut cfg, name);
    cfg.pairing_code.clear(); // single use — the next device needs a fresh code
    let snapshot = cfg.clone();
    drop(cfg);
    let _ = save_config(&snapshot);
    Some(pair)
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

fn send(ws: &mut ClientWs, val: Value) -> Result<(), ()> {
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
    let model = s
        .get("aiModel")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let effort = s
        .get("aiEffort")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let fast = s.get("aiFast").and_then(Value::as_bool).unwrap_or(false);
    (cli, model, effort, fast)
}

/// A persisted git-options object (e.g. `gitPull`/`gitFetch`/`gitPush`), or an
/// empty object when unset — the base for the flag builders below, which mirror
/// the desktop's gitOptions.ts so the phone's Pull/Fetch/Push behave identically.
fn git_settings(key: &str) -> Value {
    config::load_settings()
        .get(key)
        .cloned()
        .unwrap_or_else(|| json!({}))
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
fn start_git_watch(
    cwd: &str,
    project: &str,
    out: &SyncSender<String>,
) -> Result<RemoteWatch, String> {
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

/// Build the `readConfig` reply for one layer. Project/global missing files read
/// as empty (blank canvas, `available:true`); the repo layer is unavailable for
/// SSH/rootless projects (`available:false`). Mirrors config_cmds' read logic.
fn read_config_reply(project: &str, layer: &str) -> Value {
    let ok = |content: String, available: bool| {
        json!({ "t": "readConfig", "ok": true, "project": project, "layer": layer,
        "content": content, "available": available })
    };
    let err = |e: String| {
        json!({ "t": "readConfig", "ok": false, "project": project, "layer": layer, "error": e })
    };
    let read = |path: std::path::PathBuf| match std::fs::read_to_string(&path) {
        Ok(s) => ok(s, true),
        Err(ref e) if e.kind() == std::io::ErrorKind::NotFound => ok(String::new(), true),
        Err(e) => err(e.to_string()),
    };
    match layer {
        "project" => {
            let target = config::peek_parent(project).unwrap_or_else(|| project.to_string());
            read(config::project_path(&target))
        }
        "repo" => match crate::config_cmds::repo_config_path(project) {
            Ok(path) => read(path),
            Err(_) => ok(String::new(), false),
        },
        "global" => read(config::global_path()),
        _ => err("unknown config layer".into()),
    }
}

/// Persist one raw YAML layer via the shared config_cmds writers (same
/// duplicate-parent + rename routing the desktop uses; those emit
/// `projects-changed` on success). `name` echoes the possibly-renamed project
/// for the project layer, else the input project.
fn save_config_reply(app: &AppHandle, project: &str, layer: &str, content: String) -> Value {
    let result: Result<String, String> = match layer {
        "project" => crate::config_cmds::write_project_config(app, project.to_string(), content),
        "repo" => crate::config_cmds::write_repo_config(app, project, &content)
            .map(|()| project.to_string()),
        "global" => {
            crate::config_cmds::write_global_config(app, &content).map(|()| project.to_string())
        }
        _ => Err("unknown config layer".into()),
    };
    match result {
        Ok(name) => json!({ "t": "saveConfig", "ok": true, "project": project,
        "layer": layer, "name": name }),
        Err(e) => json!({ "t": "saveConfig", "ok": false, "project": project,
        "layer": layer, "name": project, "error": e }),
    }
}

fn handle_msg(
    ws: &mut ClientWs,
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
        "projects" => send(
            ws,
            json!({ "t": "projects", "projects": list_projects_json(app) }),
        )?,
        "sidebar" => {
            let sb = sidebar_json();
            send(ws, json!({ "t": "sidebar", "order": sb.0, "groups": sb.1 }))?;
        }
        // Sidebar folder management, mirroring the desktop's applySidebarLayout
        // (groups.json + settings.json sidebarOrder/projectOrder). Each op writes
        // both files, emits `projects-changed` so the desktop webview refreshes
        // (same as the duplicate flow's group write), and replies the fresh sidebar
        // so the requesting phone re-renders. Local config ops — no main window
        // needed. `sidebarCreateFolder`/`RenameFolder`/`DeleteFolder`/`MoveProject`.
        "sidebarCreateFolder" | "sidebarRenameFolder" | "sidebarDeleteFolder"
        | "sidebarMoveProject" => {
            let r = match t {
                "sidebarCreateFolder" => sidebar_create_folder(&str_field("name").unwrap_or_default()),
                "sidebarRenameFolder" => sidebar_rename_folder(
                    &str_field("name").unwrap_or_default(),
                    &str_field("newName").unwrap_or_default(),
                ),
                "sidebarDeleteFolder" => {
                    sidebar_delete_folder(&str_field("name").unwrap_or_default())
                }
                _ => sidebar_move_project(
                    &str_field("project").unwrap_or_default(),
                    str_field("folder").as_deref(),
                ),
            };
            match r {
                Ok(()) => {
                    let _ = app.emit("projects-changed", ());
                    let sb = sidebar_json();
                    send(
                        ws,
                        json!({ "t": t, "ok": true, "order": sb.0, "groups": sb.1 }),
                    )?;
                }
                Err(e) => send(ws, json!({ "t": t, "ok": false, "error": e }))?,
            }
        }
        // Read a project file's text for the phone's file viewer. Confined to the
        // project root (traversal/symlinks resolving outside are rejected), capped at
        // ~1MB with a `truncated` flag, and refused for non-UTF-8 (binary) content.
        // fs work runs on a worker thread and replies via the out-queue.
        "readFile" => {
            let project = str_field("project").unwrap_or_default();
            let path = str_field("path").unwrap_or_default();
            match config::project_root(&project) {
                Ok((cwd, _)) => {
                    let out = out.clone();
                    std::thread::spawn(move || {
                        let _ = out.try_send(read_project_file(&cwd, &project, &path).to_string());
                    });
                }
                Err(e) => send(
                    ws,
                    json!({ "t": "file", "project": project, "path": path, "ok": false, "error": e }),
                )?,
            }
        }
        "stats" => {
            // Local agent token-usage stats (the desktop Stats page). Scanning the
            // Claude/Codex history files is slow, so run it off the read loop and
            // reply through the async out-queue rather than blocking this socket.
            let days = v.get("days").and_then(Value::as_i64).unwrap_or(30);
            let out = out.clone();
            std::thread::spawn(move || {
                let reply = match crate::agent_usage::agent_usage_stats(days) {
                    Ok(stats) => match serde_json::to_value(&stats) {
                        Ok(value) => json!({ "t": "stats", "ok": true, "stats": value }),
                        Err(e) => json!({ "t": "stats", "ok": false, "error": e.to_string() }),
                    },
                    Err(e) => json!({ "t": "stats", "ok": false, "error": e }),
                };
                let _ = out.try_send(reply.to_string());
            });
        }
        "jobs" => match crate::jobs::list_all_jobs() {
            Ok(jobs) => send(ws, json!({ "t": "jobs", "ok": true, "jobs": jobs }))?,
            Err(e) => send(ws, json!({ "t": "jobs", "ok": false, "error": e }))?,
        },
        "jobHistory" => {
            let project = str_field("project").unwrap_or_default();
            let job_id = str_field("jobId").unwrap_or_default();
            match crate::jobs::job_history(project.clone(), job_id.clone()) {
                Ok(entries) => send(
                    ws,
                    json!({ "t": "jobHistory", "project": project,
                    "jobId": job_id, "ok": true, "entries": entries }),
                )?,
                Err(e) => send(
                    ws,
                    json!({ "t": "jobHistory", "project": project,
                    "jobId": job_id, "ok": false, "error": e }),
                )?,
            }
        }
        "jobLiveOutput" => {
            let project = str_field("project").unwrap_or_default();
            let job_id = str_field("jobId").unwrap_or_default();
            match crate::jobs::job_live_output(project.clone(), job_id.clone()) {
                Ok(live) => send(
                    ws,
                    json!({ "t": "jobLiveOutput", "project": project,
                    "jobId": job_id, "ok": true, "live": live }),
                )?,
                Err(e) => send(
                    ws,
                    json!({ "t": "jobLiveOutput", "project": project,
                    "jobId": job_id, "ok": false, "error": e }),
                )?,
            }
        }
        "runJob" => {
            let project = str_field("project").unwrap_or_default();
            let job_id = str_field("jobId").unwrap_or_default();
            let r = crate::jobs::run_job_now(app.clone(), project.clone(), job_id.clone());
            let mut reply = result_reply("runJob", r);
            reply["project"] = json!(project);
            reply["jobId"] = json!(job_id);
            send(ws, reply)?;
        }
        "stopJob" => {
            let project = str_field("project").unwrap_or_default();
            let job_id = str_field("jobId").unwrap_or_default();
            let r = crate::jobs::stop_job_run(project.clone(), job_id.clone());
            let mut reply = result_reply("stopJob", r);
            reply["project"] = json!(project);
            reply["jobId"] = json!(job_id);
            send(ws, reply)?;
        }
        "setJobEnabled" => {
            let project = str_field("project").unwrap_or_default();
            let job_id = str_field("jobId").unwrap_or_default();
            let enabled = v.get("enabled").and_then(Value::as_bool).unwrap_or(false);
            let r = crate::jobs::set_job_enabled(project.clone(), job_id.clone(), enabled);
            let mut reply = result_reply("setJobEnabled", r);
            reply["project"] = json!(project);
            reply["jobId"] = json!(job_id);
            send(ws, reply)?;
        }
        "sendJobFollowup" => {
            let project = str_field("project").unwrap_or_default();
            let job_id = str_field("jobId").unwrap_or_default();
            let at = v.get("at").and_then(Value::as_u64).unwrap_or_default();
            let message = str_field("message").unwrap_or_default();
            let agent = str_field("agent").unwrap_or_default();
            let model = str_field("model").unwrap_or_default();
            let effort = str_field("effort").unwrap_or_default();
            let r = crate::jobs::send_job_followup(
                app.clone(),
                project.clone(),
                job_id.clone(),
                at,
                message,
                agent,
                model,
                effort,
            );
            let mut reply = result_reply("sendJobFollowup", r);
            reply["project"] = json!(project);
            reply["jobId"] = json!(job_id);
            send(ws, reply)?;
        }
        // The raw YAML body of one job, so the phone editor can seed an edit from
        // the exact stored config (the desktop reads it from the layer file too).
        "jobConfig" => {
            let project = str_field("project").unwrap_or_default();
            let job_id = str_field("jobId").unwrap_or_default();
            let source = str_field("source").unwrap_or_else(|| "project".into());
            let mut reply = json!({ "t": "jobConfig", "project": project, "jobId": job_id });
            match crate::jobs::read_job_body(project.clone(), source, job_id.clone()) {
                Ok(job) => {
                    reply["ok"] = json!(true);
                    reply["job"] = job;
                }
                Err(e) => {
                    reply["ok"] = json!(false);
                    reply["error"] = json!(e);
                }
            }
            send(ws, reply)?;
        }
        // Create or edit a job from the phone. Carries the full job body; `id` is
        // present when editing, empty to create. The write reflows the layer file,
        // so it runs off the read loop and replies through the out-queue. On
        // success a `job-status` emit refreshes the desktop's Jobs views and (via
        // the hub's job-status listener) rebroadcasts `jobs-changed` to phones.
        "saveJob" => {
            let source = str_field("source").unwrap_or_else(|| "global".into());
            let project = str_field("project").unwrap_or_default();
            let id = str_field("id").unwrap_or_default();
            let job = v.get("job").cloned().unwrap_or(Value::Null);
            let out = out.clone();
            let app = app.clone();
            std::thread::spawn(move || {
                let r = crate::jobs::save_job_body(source, project.clone(), id.clone(), job);
                let reply = match &r {
                    Ok(()) => {
                        let _ = app.emit("job-status", json!({ "project": project }));
                        json!({ "t": "saveJob", "ok": true, "id": id })
                    }
                    Err(e) => json!({ "t": "saveJob", "ok": false, "id": id, "error": e }),
                };
                let _ = out.try_send(reply.to_string());
            });
        }
        // Delete a job's config and forget its saved state; `deleteCopies` also
        // tears down the duplicates its runs left behind (a slow path), so this
        // runs off the read loop and replies through the out-queue.
        "deleteJob" => {
            let source = str_field("source").unwrap_or_else(|| "global".into());
            let project = str_field("project").unwrap_or_default();
            let id = str_field("id").unwrap_or_default();
            let delete_copies = v
                .get("deleteCopies")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let out = out.clone();
            let app = app.clone();
            std::thread::spawn(move || {
                let r = crate::jobs::delete_job_body(
                    app.clone(),
                    source,
                    project.clone(),
                    id.clone(),
                    delete_copies,
                );
                let reply = match &r {
                    Ok(()) => {
                        let _ = app.emit("job-status", json!({ "project": project }));
                        json!({ "t": "deleteJob", "ok": true, "id": id })
                    }
                    Err(e) => json!({ "t": "deleteJob", "ok": false, "id": id, "error": e }),
                };
                let _ = out.try_send(reply.to_string());
            });
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
                        m.insert(
                            "pinned".into(),
                            json!(pinned.get(&t.id).copied().unwrap_or(false)),
                        );
                        m.insert(
                            "emoji".into(),
                            json!(emojis.get(&t.id).cloned().unwrap_or_default()),
                        );
                        m.insert(
                            "cli".into(),
                            json!(clis.get(&t.id).cloned().unwrap_or_default()),
                        );
                    }
                    o
                })
                .collect();
            drop(labels);
            drop(pinned);
            drop(emojis);
            drop(clis);
            send(
                ws,
                json!({ "t": "terminals", "project": project, "terminals": terms }),
            )?;
        }
        "slash" => {
            // Slash-command autocomplete for a terminal: the frontend registered
            // which AI CLI the terminal runs (detected from its launch command);
            // scan that CLI's built-ins + the project's custom commands.
            let id = str_field("id").unwrap_or_default();
            let project = str_field("project").unwrap_or_default();
            let cli = hub
                .inner
                .clis
                .lock()
                .unwrap()
                .get(&id)
                .cloned()
                .unwrap_or_default();
            let commands = if cli.is_empty() {
                json!([])
            } else {
                let cwd = config::project_root(&project)
                    .map(|(r, _)| r)
                    .unwrap_or_default();
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
            let cwd = config::project_root(&project)
                .map(|(r, _)| r)
                .unwrap_or_default();
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
            send(
                ws,
                json!({ "t": "mentions", "project": project, "entries": entries }),
            )?;
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
            send(
                ws,
                json!({ "t": "history", "project": project, "rows": rows }),
            )?;
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
            send(
                ws,
                json!({ "t": "status", "project": project, "status": list }),
            )?;
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
            let pref = |name: &str, fallback: bool| {
                notify
                    .and_then(|n| n.get(name))
                    .and_then(|v| v.as_bool())
                    .unwrap_or(fallback)
            };
            let prefs = PushPreferences {
                waiting: pref("waiting", true),
                done: pref("done", true),
                error: pref("error", true),
                automation_started: pref("automationStarted", false),
                automation_done: pref("automationDone", false),
                automation_error: pref("automationError", false),
            };
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
                let mut seed = json!({ "t": "seed", "id": id, "cols": cols, "rows": rows, "data": hub.ring_text(&id), "owner": crate::control::owner_json(&Some(owner)) });
                if let Some(d) = hub.inner.drafts.lock().unwrap().get(&id) {
                    seed["draft"] = json!({ "text": d.text, "rev": d.rev });
                }
                send(ws, seed)?;
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
            let r =
                services::stop_project_internal(app, &app.state::<services::ServiceState>(), &name);
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
                .map(|a| {
                    a.iter()
                        .map(|x| x.as_str().unwrap_or_default().to_string())
                        .collect()
                })
                .unwrap_or_default();
            let exclude_uncommitted = v
                .get("excludeUncommitted")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let reinstall_deps = v
                .get("reinstallDeps")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let pull_latest = v
                .get("pullLatest")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let worktree = v
                .get("worktree")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let group_name = str_field("groupName").unwrap_or_default();
            let run_mode = str_field("runMode").unwrap_or_default();

            // Create copies one at a time, streaming progress; stop at the first
            // failure and return the copies made so far (matches desktop behavior).
            let mut created: Vec<String> = Vec::new();
            let mut err: Option<String> = None;
            for i in 0..count as usize {
                let label = labels
                    .get(i)
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty());
                let result = if worktree {
                    crate::projects_crud::duplicate_worktree_project(
                        app.clone(),
                        name.clone(),
                        label,
                        reinstall_deps,
                    )
                } else {
                    crate::projects_crud::duplicate_project(
                        app.clone(),
                        name.clone(),
                        label,
                        exclude_uncommitted,
                        reinstall_deps,
                        pull_latest,
                    )
                };
                match result {
                    Ok(n) => {
                        created.push(n.clone());
                        send(
                            ws,
                            json!({ "t": "duplicateProgress",
                            "done": created.len(), "total": count, "name": n }),
                        )?;
                    }
                    Err(e) => {
                        err = Some(e);
                        break;
                    }
                }
            }

            if created.is_empty() {
                send(
                    ws,
                    json!({ "t": "duplicate", "ok": false,
                    "error": err.unwrap_or_else(|| "Couldn't duplicate the project.".into()) }),
                )?;
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
                            let _ = app
                                .emit("remote-run-task", json!({ "project": copy, "task": task }));
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
            send(
                ws,
                json!({
                    "t": "duplicateDefaults",
                    "excludeUncommitted": b("duplicateExcludeUncommitted", false),
                    "reinstallDeps": b("duplicateReinstallDeps", false),
                    "pullLatest": b("duplicatePullLatest", true),
                    "worktree": s.get("duplicateMode").and_then(Value::as_str) == Some("worktree"),
                }),
            )?;
        }
        // Remove a project (the phone only offers this for duplicates, whose
        // folders are deleted from disk). Also a direct config/disk op;
        // remove_project refuses to delete an original that still has duplicates.
        "remove" => {
            let name = str_field("name").unwrap_or_default();
            let r = crate::projects_crud::remove_project(app.clone(), name);
            send(ws, result_reply("remove", r))?;
        }
        // Rename a project's display label, reusing the desktop's set_project_label
        // (writes the project's own YAML, emits `projects-changed` so the desktop
        // webview and paired phones both refresh). A local config op — works with no
        // main window open.
        "renameProject" => {
            let project = str_field("project").unwrap_or_default();
            let name = str_field("name").unwrap_or_default();
            let r = crate::commands_real::set_project_label(app.clone(), project.clone(), name);
            send(ws, git_result_reply("renameProject", &project, r))?;
        }
        // Run an action / open a new terminal. A terminal is a frontend pane-tree +
        // command-injection concept, not a raw pty op — spawning one from Rust would
        // orphan it (no tab, label, or command typed in). So relay to the owner
        // window, which runs its normal create-terminal flow; the new terminal then
        // reaches the phone via the label push + output tee (re-request `terminals`).
        "runAction" => {
            let project = str_field("project").unwrap_or_default();
            let action = str_field("action").unwrap_or_default();
            // The phone owns the confirm + inputs gauntlet now, so it relays the
            // collected input values and `confirmed:true` to tell the owner window
            // to run the action directly rather than re-prompting on the Mac.
            let confirmed = v.get("confirmed").and_then(Value::as_bool).unwrap_or(false);
            let input_values = v.get("inputValues").cloned().unwrap_or_else(|| json!({}));
            if app.get_webview_window("main").is_none() {
                send(
                    ws,
                    json!({ "t": "runAction", "ok": false, "project": project,
                    "error": "Open the lpm app on your Mac to run actions." }),
                )?;
            } else {
                if !project.is_empty() && !action.is_empty() {
                    queue_run_action(
                        hub,
                        app,
                        json!({ "project": project, "action": action,
                            "inputValues": input_values, "confirmed": confirmed }),
                    );
                }
                send(ws, json!({ "t": "runAction", "ok": true }))?;
            }
        }
        // Run a non-terminal action headlessly, driven entirely from Rust so it works
        // even with the Mac's main window closed. The run streams into the background
        // registry; the phone polls `actionBgOutput` for its output + status. The
        // caller-supplied `runId` keys the run for polling and cancellation.
        "runActionBackground" => {
            let project = str_field("project").unwrap_or_default();
            let action = str_field("action").unwrap_or_default();
            let run_id = str_field("runId").unwrap_or_default();
            let input_values: HashMap<String, String> = v
                .get("inputValues")
                .and_then(Value::as_object)
                .map(|m| {
                    m.iter()
                        .filter_map(|(k, val)| val.as_str().map(|s| (k.clone(), s.to_string())))
                        .collect()
                })
                .unwrap_or_default();
            if project.is_empty() || action.is_empty() || run_id.is_empty() {
                send(
                    ws,
                    json!({ "t": "runActionBackground", "ok": false, "runId": run_id,
                    "error": "Missing project, action, or runId." }),
                )?;
            } else {
                let app2 = app.clone();
                std::thread::spawn(move || {
                    let _ = crate::actions::run_action_background(
                        app2,
                        project,
                        action,
                        input_values,
                        run_id,
                    );
                });
                send(ws, json!({ "t": "runActionBackground", "ok": true }))?;
            }
        }
        // Poll one background run's accumulated output + terminal status. `found` is
        // false once the run has been reaped (or never existed).
        "actionBgOutput" => {
            let run_id = str_field("runId").unwrap_or_default();
            let reply = match crate::actions::background_run_output(&run_id) {
                Some(s) => json!({ "t": "actionBgOutput", "ok": true, "found": true,
                    "runId": s.run_id, "project": s.project, "label": s.label,
                    "startedAt": s.started_at, "text": s.text, "running": s.running,
                    "success": s.success, "error": s.error }),
                None => {
                    json!({ "t": "actionBgOutput", "ok": true, "found": false, "runId": run_id })
                }
            };
            send(ws, reply)?;
        }
        // Cancel a running background action (reaps its process tree). A no-op if the
        // run already finished or is unknown.
        "cancelActionBackground" => {
            let run_id = str_field("runId").unwrap_or_default();
            let _ = crate::actions::cancel_action_background(run_id.clone());
            send(ws, json!({ "t": "cancelActionBackground", "ok": true, "runId": run_id }))?;
        }
        // List a project's background runs (running + recently finished) so a
        // reconnecting phone can re-attach to a run it started before relaunch.
        "backgroundRuns" => {
            let project = str_field("project").unwrap_or_default();
            let runs: Vec<Value> = crate::actions::list_background_runs(&project)
                .into_iter()
                .map(|s| {
                    json!({ "runId": s.run_id, "label": s.label, "startedAt": s.started_at,
                        "running": s.running, "success": s.success, "error": s.error })
                })
                .collect();
            send(
                ws,
                json!({ "t": "backgroundRuns", "ok": true, "project": project, "runs": runs }),
            )?;
        }
        "newTerminal" => {
            let project = str_field("project").unwrap_or_default();
            if app.get_webview_window("main").is_none() {
                send(
                    ws,
                    json!({ "t": "newTerminal", "ok": false, "project": project,
                    "error": "Open the lpm app on your Mac to open a new terminal." }),
                )?;
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
                .map(|a| {
                    a.iter()
                        .filter_map(|x| x.as_str().map(str::to_string))
                        .collect()
                })
                .unwrap_or_default();
            if !project.is_empty() && !order.is_empty() {
                let _ = app.emit(
                    "remote-terminal-op",
                    json!({ "project": project, "op": "reorder", "id": "", "label": "", "order": order }),
                );
            }
            send(ws, json!({ "t": t, "ok": true }))?;
        }
        // The phone typed into a terminal's composer. Store it, fan it out to the
        // other clients (tagged with this device's id so the sender drops its own
        // echo), and emit for the desktop composer via `remote-composer-draft`.
        "composerDraft" => {
            if let Some(id) = str_field("id") {
                let text = str_field("text").unwrap_or_default();
                if let Some(rev) = record_draft(hub, &id, &text) {
                    broadcast(
                        hub,
                        json!({ "t": "composerDraft", "id": id, "text": text, "rev": rev, "origin": device_id }),
                    );
                    let _ = app.emit(
                        "remote-composer-draft",
                        json!({ "id": id, "text": text, "rev": rev }),
                    );
                }
            }
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
                // A big-repo status scan can take a while, so run it on a worker
                // and reply through the out-queue rather than stalling this
                // client's live terminal I/O (project_root already resolved).
                Ok((cwd, _)) => {
                    let out = out.clone();
                    std::thread::spawn(move || {
                        // One porcelain scan yields both the branch header and the
                        // expanded changed-file list (replacing the former
                        // git_status + git_changed_files double scan).
                        let (st, changed) = crate::git::git_status_and_files(&cwd);
                        let reply = if !st.is_git_repo {
                            json!({ "t": "git", "project": project, "ok": true, "isRepo": false,
                            "branch": "", "detached": false, "hasUpstream": false, "ahead": 0, "behind": 0,
                            "defaultBranch": "", "ghCli": false, "files": [] })
                        } else {
                            // Enrich each ChangedFile with a `stamp` (a working-tree
                            // fingerprint) so the phone can skip refetching diffs of
                            // files that didn't change between `git-changed` snapshots.
                            let files: Vec<Value> = changed
                                .iter()
                                .map(|f| {
                                    let mut o =
                                        serde_json::to_value(f).unwrap_or_else(|_| json!({}));
                                    if let Some(m) = o.as_object_mut() {
                                        m.insert("stamp".into(), json!(file_stamp(&cwd, &f.path)));
                                    }
                                    o
                                })
                                .collect();
                            json!({ "t": "git", "project": project, "ok": true, "isRepo": true,
                            "branch": st.branch, "detached": st.detached, "hasUpstream": st.has_upstream,
                            "ahead": st.ahead, "behind": st.behind,
                            "defaultBranch": crate::git::git_default_branch(cwd.clone()),
                            "ghCli": crate::git::check_ghcli(), "files": files })
                        };
                        let _ = out.try_send(reply.to_string());
                    });
                }
                Err(e) => send(
                    ws,
                    json!({ "t": "git", "project": project, "ok": false, "error": e }),
                )?,
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
                        let binary = diff.lines().any(|l| {
                            l.starts_with("Binary files ") || l.starts_with("GIT binary patch")
                        });
                        if binary {
                            send(
                                ws,
                                json!({ "t": "gitDiff", "project": project, "path": path,
                                "ok": true, "diff": "", "binary": true, "truncated": false }),
                            )?;
                        } else {
                            let (diff, truncated) = cap_git_diff(&diff);
                            send(
                                ws,
                                json!({ "t": "gitDiff", "project": project, "path": path,
                                "ok": true, "diff": diff, "binary": false, "truncated": truncated }),
                            )?;
                        }
                    }
                    Err(e) => send(
                        ws,
                        json!({ "t": "gitDiff", "project": project, "path": path, "ok": false, "error": e }),
                    )?,
                },
                Err(e) => send(
                    ws,
                    json!({ "t": "gitDiff", "project": project, "path": path, "ok": false, "error": e }),
                )?,
            }
        }
        // Batch diff: fetch many files' diffs in one round trip (the phone
        // coalesces its lazy per-file requests). Slow on a big repo, so run on a
        // worker and reply through the out-queue. Each file gets the same binary
        // detection + size cap as the single `gitDiff` above; a per-file failure
        // surfaces as an `error` on that entry without sinking the batch.
        "gitDiffs" => {
            let project = str_field("project").unwrap_or_default();
            let paths: Vec<String> = v
                .get("paths")
                .and_then(Value::as_array)
                .map(|a| {
                    a.iter()
                        .filter_map(|x| x.as_str().map(str::to_string))
                        .collect()
                })
                .unwrap_or_default();
            match config::project_root(&project) {
                Ok((cwd, _)) => {
                    let out = out.clone();
                    std::thread::spawn(move || {
                        let files: Vec<Value> = crate::git::git_diffs(&cwd, &paths)
                            .into_iter()
                            .map(|e| {
                                if let Some(err) = e.error {
                                    return json!({ "path": e.path, "error": err });
                                }
                                let binary = e.diff.lines().any(|l| {
                                    l.starts_with("Binary files ")
                                        || l.starts_with("GIT binary patch")
                                });
                                if binary {
                                    json!({ "path": e.path, "diff": "", "binary": true, "truncated": false })
                                } else {
                                    let (diff, truncated) = cap_git_diff(&e.diff);
                                    json!({ "path": e.path, "diff": diff, "binary": false, "truncated": truncated })
                                }
                            })
                            .collect();
                        let _ = out.try_send(
                            json!({ "t": "gitDiffs", "project": project, "ok": true, "files": files })
                                .to_string(),
                        );
                    });
                }
                Err(e) => send(
                    ws,
                    json!({ "t": "gitDiffs", "project": project, "ok": false, "error": e }),
                )?,
            }
        }
        "gitCommit" => {
            let project = str_field("project").unwrap_or_default();
            let message = str_field("message").unwrap_or_default();
            let files: Vec<String> = v
                .get("files")
                .and_then(Value::as_array)
                .map(|a| {
                    a.iter()
                        .filter_map(|x| x.as_str().map(str::to_string))
                        .collect()
                })
                .unwrap_or_default();
            match config::project_root(&project) {
                Ok((cwd, _)) => {
                    let r = crate::git::git_commit(cwd, message, files);
                    send(ws, git_result_reply("gitCommit", &project, r))?;
                }
                Err(e) => send(
                    ws,
                    json!({ "t": "gitCommit", "project": project, "ok": false, "error": e }),
                )?,
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
                Err(e) => send(
                    ws,
                    json!({ "t": "gitPush", "project": project, "ok": false, "error": e }),
                )?,
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
                Err(e) => send(
                    ws,
                    json!({ "t": "gitPull", "project": project, "ok": false, "error": e }),
                )?,
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
                Err(e) => send(
                    ws,
                    json!({ "t": "gitFetch", "project": project, "ok": false, "error": e }),
                )?,
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
                        let branches =
                            serde_json::to_value(&branches).unwrap_or_else(|_| json!([]));
                        let current = crate::git::git_status(cwd).branch;
                        send(
                            ws,
                            json!({ "t": "gitBranches", "project": project, "ok": true,
                            "current": current, "branches": branches }),
                        )?;
                    }
                    Err(e) => send(
                        ws,
                        json!({ "t": "gitBranches", "project": project, "ok": false, "error": e }),
                    )?,
                },
                Err(e) => send(
                    ws,
                    json!({ "t": "gitBranches", "project": project, "ok": false, "error": e }),
                )?,
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
                Err(e) => send(
                    ws,
                    json!({ "t": "gitCheckout", "project": project, "ok": false, "error": e }),
                )?,
            }
        }
        // Create a new branch off HEAD and check it out (reuses the desktop's
        // create_branch, which does `branch` + checkout, falling back to
        // `switch -c`). Inline like gitCheckout; on success the phone refreshes its
        // branch list + snapshot, so the new current branch shows.
        "gitCreateBranch" => {
            let project = str_field("project").unwrap_or_default();
            let name = str_field("name").unwrap_or_default();
            match config::project_root(&project) {
                Ok((cwd, _)) => {
                    let r = crate::git::create_branch(cwd, name);
                    send(ws, git_result_reply("gitCreateBranch", &project, r))?;
                }
                Err(e) => send(
                    ws,
                    json!({ "t": "gitCreateBranch", "project": project, "ok": false, "error": e }),
                )?,
            }
        }
        "gitDiscardAll" => {
            let project = str_field("project").unwrap_or_default();
            match config::project_root(&project) {
                Ok((cwd, _)) => {
                    let r = crate::git::git_discard_all(cwd);
                    send(ws, git_result_reply("gitDiscardAll", &project, r))?;
                }
                Err(e) => send(
                    ws,
                    json!({ "t": "gitDiscardAll", "project": project, "ok": false, "error": e }),
                )?,
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
                send(
                    ws,
                    json!({ "t": "gitWatch", "project": project, "ok": true }),
                )?;
            } else {
                match config::project_root(&project) {
                    Ok((cwd, _)) => match start_git_watch(&cwd, &project, out) {
                        Ok(w) => {
                            watches.insert(project.clone(), w);
                            send(
                                ws,
                                json!({ "t": "gitWatch", "project": project, "ok": true }),
                            )?;
                        }
                        Err(e) => send(
                            ws,
                            json!({ "t": "gitWatch", "project": project, "ok": false, "error": e }),
                        )?,
                    },
                    Err(e) => send(
                        ws,
                        json!({ "t": "gitWatch", "project": project, "ok": false, "error": e }),
                    )?,
                }
            }
        }
        "gitUnwatch" => {
            let project = str_field("project").unwrap_or_default();
            if let Some(w) = watches.remove(&project) {
                w.stop.store(true, Ordering::SeqCst);
            }
            send(
                ws,
                json!({ "t": "gitUnwatch", "project": project, "ok": true }),
            )?;
        }
        "gitGenMessage" => {
            let project = str_field("project").unwrap_or_default();
            let files: Vec<String> = v
                .get("files")
                .and_then(Value::as_array)
                .map(|a| {
                    a.iter()
                        .filter_map(|x| x.as_str().map(str::to_string))
                        .collect()
                })
                .unwrap_or_default();
            match config::project_root(&project) {
                Ok((cwd, _)) => {
                    let (cli, model, effort, fast) = git_ai_opts();
                    let (app, out) = (app.clone(), out.clone());
                    std::thread::spawn(move || {
                        let reply = match crate::aigen::generate_commit_message(
                            app,
                            project.clone(),
                            cwd,
                            cli,
                            model,
                            effort,
                            fast,
                            files,
                            String::new(),
                            String::new(),
                        ) {
                            Ok(message) => {
                                json!({ "t": "gitGenMessage", "project": project, "ok": true, "message": message })
                            }
                            Err(e) => {
                                json!({ "t": "gitGenMessage", "project": project, "ok": false, "error": e })
                            }
                        };
                        let _ = out.try_send(reply.to_string());
                    });
                }
                Err(e) => send(
                    ws,
                    json!({ "t": "gitGenMessage", "project": project, "ok": false, "error": e }),
                )?,
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
                            app.clone(),
                            project.clone(),
                            cwd.clone(),
                            cli.clone(),
                            model.clone(),
                            effort.clone(),
                            fast,
                            base.clone(),
                            String::new(),
                        ) {
                            Ok(title) => match crate::aigen::generate_pr_description(
                                app,
                                project.clone(),
                                cwd,
                                cli,
                                model,
                                effort,
                                fast,
                                base,
                                String::new(),
                            ) {
                                Ok(body) => {
                                    json!({ "t": "gitGenPr", "project": project, "ok": true, "title": title, "body": body })
                                }
                                Err(e) => {
                                    json!({ "t": "gitGenPr", "project": project, "ok": false, "error": e })
                                }
                            },
                            Err(e) => {
                                json!({ "t": "gitGenPr", "project": project, "ok": false, "error": e })
                            }
                        };
                        let _ = out.try_send(reply.to_string());
                    });
                }
                Err(e) => send(
                    ws,
                    json!({ "t": "gitGenPr", "project": project, "ok": false, "error": e }),
                )?,
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
                            Ok(url) => {
                                json!({ "t": "gitCreatePr", "project": project, "ok": true, "url": url })
                            }
                            Err(e) => {
                                json!({ "t": "gitCreatePr", "project": project, "ok": false, "error": e })
                            }
                        };
                        let _ = out.try_send(reply.to_string());
                    });
                }
                Err(e) => send(
                    ws,
                    json!({ "t": "gitCreatePr", "project": project, "ok": false, "error": e }),
                )?,
            }
        }
        // The user's enabled composer AI actions (~/.lpm/composer-actions.json),
        // so the phone can offer the same rewrite buttons the desktop composer does.
        "composerActions" => {
            send(
                ws,
                json!({ "t": "composerActions", "actions": composer_actions_enabled() }),
            )?;
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
            let variants = v
                .get("variants")
                .and_then(Value::as_u64)
                .unwrap_or(1)
                .clamp(1, 5) as usize;
            match config::project_root(&project) {
                Ok((cwd, _)) => {
                    let (cli, model, effort, fast) = git_ai_opts();
                    let project_opt = if project.is_empty() {
                        None
                    } else {
                        Some(project.clone())
                    };
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
                        let (text, project_opt, req_id) =
                            (text.clone(), project_opt.clone(), req_id.clone());
                        let (remaining, any_ok) = (remaining.clone(), any_ok.clone());
                        std::thread::spawn(move || {
                            let reply = match crate::aigen::transform_text(
                                app,
                                project_opt,
                                cwd,
                                cli,
                                model,
                                effort,
                                fast,
                                instr,
                                text,
                                String::new(),
                            ) {
                                Ok(t) => {
                                    any_ok.store(true, Ordering::SeqCst);
                                    json!({ "t": "transform", "reqId": req_id, "idx": idx, "ok": true, "text": t })
                                }
                                Err(e) => {
                                    json!({ "t": "transform", "reqId": req_id, "idx": idx, "ok": false, "error": e })
                                }
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
                    send(
                        ws,
                        json!({ "t": "transform", "reqId": req_id, "idx": 0, "ok": false, "error": e }),
                    )?;
                    send(
                        ws,
                        json!({ "t": "transformDone", "reqId": req_id, "ok": false }),
                    )?;
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
                        let run_state = if running {
                            services::run_state_from_tmux(&info.session, info.services.keys())
                                .unwrap_or(run_state)
                        } else {
                            run_state
                        };
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
                    Err(e) => {
                        json!({ "t": "services", "project": project, "ok": false, "error": e })
                    }
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
            let lines = v
                .get("lines")
                .and_then(Value::as_i64)
                .unwrap_or(200)
                .clamp(1, 200);
            let out = out.clone();
            std::thread::spawn(move || {
                let reply = match crate::log_streaming::get_service_logs(
                    project.clone(),
                    pane_index,
                    lines,
                ) {
                    Ok(text) => {
                        json!({ "t": "serviceLogs", "project": project, "paneIndex": pane_index,
                        "ok": true, "text": text })
                    }
                    Err(e) => {
                        json!({ "t": "serviceLogs", "project": project, "paneIndex": pane_index,
                        "ok": false, "error": e })
                    }
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
            let favorites_only = v
                .get("favoritesOnly")
                .and_then(Value::as_bool)
                .unwrap_or(false);
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
            send(
                ws,
                json!({ "t": "historyQuery", "items": items, "hasMore": has_more }),
            )?;
        }
        // Save the composer's current text as an unsent draft (kept in shared
        // history, badged as a draft). `message` is the draft text; project/id/label/
        // images are optional context.
        "historySaveDraft" => {
            let text = str_field("message")
                .or_else(|| {
                    v.get("message")
                        .and_then(|m| m.get("text"))
                        .and_then(Value::as_str)
                        .map(str::to_string)
                })
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
                Ok(fav) => send(
                    ws,
                    json!({ "t": "historyToggleFavorite", "id": id, "ok": true, "favorite": fav }),
                )?,
                Err(e) => send(
                    ws,
                    json!({ "t": "historyToggleFavorite", "id": id, "ok": false, "error": e }),
                )?,
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
                Ok(f) => send(
                    ws,
                    json!({ "t": "historyCreateFolder", "ok": true,
                    "folder": serde_json::to_value(f).unwrap_or_else(|_| json!({})) }),
                )?,
                Err(e) => send(
                    ws,
                    json!({ "t": "historyCreateFolder", "ok": false, "error": e }),
                )?,
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
                None => send(
                    ws,
                    json!({ "t": "historyDeleteFolder", "ok": false, "error": "folder not found" }),
                )?,
            }
        }
        // ---- Add / import / clone projects ----------------------------------
        // Browse the Mac's folders so the phone can pick a root for a new or
        // imported project without a native dialog. Fast, inline.
        "listDirs" => {
            let path = str_field("path").unwrap_or_default();
            let reply = match crate::files::list_dirs(path) {
                Ok(d) => json!({ "t": "listDirs", "ok": true, "path": d.path,
                "parent": d.parent, "dirs": d.dirs }),
                Err(e) => json!({ "t": "listDirs", "ok": false, "error": e }),
            };
            send(ws, reply)?;
        }
        // The Mac's ~/.ssh/config Host aliases, for the Add-SSH-project picker.
        "listSshHosts" => {
            let reply = match crate::sshconfig::list_ssh_hosts() {
                Ok(hosts) => json!({ "t": "listSshHosts", "ok": true, "hosts": hosts }),
                Err(e) => json!({ "t": "listSshHosts", "ok": false, "error": e }),
            };
            send(ws, reply)?;
        }
        // Create a new empty project OR register an existing folder. create_dir_all
        // + a config write is fast, so inline; create_project emits projects-changed.
        "createProject" => {
            let name = str_field("name").unwrap_or_default();
            let root = str_field("root").unwrap_or_default();
            let r = crate::projects_crud::create_project(app.clone(), name.clone(), root);
            let mut reply = result_reply("createProject", r);
            reply["name"] = json!(name);
            send(ws, reply)?;
        }
        // Add an SSH (remote) project. Inline — writes a config file, no network.
        "createSshProject" => {
            let name = str_field("name").unwrap_or_default();
            match serde_json::from_value::<crate::projects_crud::SshConfig>(
                v.get("ssh").cloned().unwrap_or_else(|| json!({})),
            ) {
                Ok(ssh) => {
                    let r = crate::projects_crud::create_ssh_project(app.clone(), name.clone(), ssh);
                    let mut reply = result_reply("createSshProject", r);
                    reply["name"] = json!(name);
                    send(ws, reply)?;
                }
                Err(e) => send(
                    ws,
                    json!({ "t": "createSshProject", "ok": false, "name": name, "error": e.to_string() }),
                )?,
            }
        }
        // Clone a git repo into a new project. The clone is network-blocking, so
        // run it on a worker thread and reply through the out-queue (mirrors
        // saveJob). create_project_from_clone validates synchronously inside and
        // emits projects-changed on success.
        "cloneProject" => {
            let name = str_field("name").unwrap_or_default();
            let url = str_field("url").unwrap_or_default();
            let branch = str_field("branch").unwrap_or_default();
            let dest_parent = str_field("destParent").unwrap_or_default();
            let (app, out) = (app.clone(), out.clone());
            std::thread::spawn(move || {
                let r = crate::projects_crud::create_project_from_clone(
                    app,
                    name.clone(),
                    url,
                    branch,
                    dest_parent,
                );
                let mut reply = result_reply("cloneProject", r);
                reply["name"] = json!(name);
                let _ = out.try_send(reply.to_string());
            });
        }
        // ---- Raw YAML config (comment-preserving) ---------------------------
        // Read a config layer's exact text so the phone's YAML editor round-trips
        // it verbatim. Fast, inline.
        "readConfig" => {
            let project = str_field("project").unwrap_or_default();
            let layer = str_field("layer").unwrap_or_default();
            send(ws, read_config_reply(&project, &layer))?;
        }
        // Write a config layer's exact text back (comments preserved). Goes
        // through the shared config_cmds writers (duplicate-parent + rename
        // routing, which emit projects-changed), on a worker thread.
        "saveConfig" => {
            let project = str_field("project").unwrap_or_default();
            let layer = str_field("layer").unwrap_or_default();
            let content = str_field("content").unwrap_or_default();
            let (app, out) = (app.clone(), out.clone());
            std::thread::spawn(move || {
                let reply = save_config_reply(&app, &project, &layer, content);
                let _ = out.try_send(reply.to_string());
            });
        }
        // ---- Structured config reads (seed the phone's edit forms) ----------
        "serviceBody" => {
            let project = str_field("project").unwrap_or_default();
            let key = str_field("key").unwrap_or_default();
            let reply = match crate::config_edit::service_body(&project, &key) {
                Ok((body, source)) => json!({ "t": "serviceBody", "ok": true,
                "project": project, "key": key, "body": body, "source": source }),
                Err(e) => json!({ "t": "serviceBody", "ok": false,
                "project": project, "key": key, "error": e }),
            };
            send(ws, reply)?;
        }
        "actionBody" => {
            let project = str_field("project").unwrap_or_default();
            let key = str_field("key").unwrap_or_default();
            let reply = match crate::config_edit::action_body(&project, &key) {
                Ok((body, section, source)) => json!({ "t": "actionBody", "ok": true,
                "project": project, "key": key, "body": body, "section": section, "source": source }),
                Err(e) => json!({ "t": "actionBody", "ok": false,
                "project": project, "key": key, "error": e }),
            };
            send(ws, reply)?;
        }
        // ---- Structured config writes ---------------------------------------
        // serde_yaml surgical edits (DATA preserved, comments reflow — the same
        // tradeoff as saveJob). Each runs on a worker thread, emits
        // projects-changed on success, and replies through the out-queue.
        "saveService" => {
            let project = str_field("project").unwrap_or_default();
            let key = str_field("key").unwrap_or_default();
            let payload = v.get("payload").cloned().unwrap_or_else(|| json!({}));
            let previous_key = str_field("previousKey");
            let (app, out) = (app.clone(), out.clone());
            std::thread::spawn(move || {
                let r = crate::config_edit::save_service(
                    &project,
                    &key,
                    &payload,
                    previous_key.as_deref(),
                );
                let reply = match &r {
                    Ok(()) => {
                        let _ = app.emit("projects-changed", ());
                        json!({ "t": "saveService", "ok": true, "project": project, "key": key })
                    }
                    Err(e) => {
                        json!({ "t": "saveService", "ok": false, "project": project, "key": key, "error": e })
                    }
                };
                let _ = out.try_send(reply.to_string());
            });
        }
        "deleteService" => {
            let project = str_field("project").unwrap_or_default();
            let key = str_field("key").unwrap_or_default();
            let (app, out) = (app.clone(), out.clone());
            std::thread::spawn(move || {
                let r = crate::config_edit::delete_service(&project, &key);
                let reply = match &r {
                    Ok(()) => {
                        let _ = app.emit("projects-changed", ());
                        json!({ "t": "deleteService", "ok": true, "project": project, "key": key })
                    }
                    Err(e) => {
                        json!({ "t": "deleteService", "ok": false, "project": project, "key": key, "error": e })
                    }
                };
                let _ = out.try_send(reply.to_string());
            });
        }
        "saveProfile" => {
            let project = str_field("project").unwrap_or_default();
            let name = str_field("name").unwrap_or_default();
            let services: Vec<String> = v
                .get("services")
                .and_then(Value::as_array)
                .map(|a| {
                    a.iter()
                        .filter_map(|x| x.as_str().map(str::to_string))
                        .collect()
                })
                .unwrap_or_default();
            let previous_name = str_field("previousName");
            let (app, out) = (app.clone(), out.clone());
            std::thread::spawn(move || {
                let r = crate::config_edit::save_profile(
                    &project,
                    &name,
                    &services,
                    previous_name.as_deref(),
                );
                let reply = match &r {
                    Ok(()) => {
                        let _ = app.emit("projects-changed", ());
                        json!({ "t": "saveProfile", "ok": true, "project": project, "name": name })
                    }
                    Err(e) => {
                        json!({ "t": "saveProfile", "ok": false, "project": project, "name": name, "error": e })
                    }
                };
                let _ = out.try_send(reply.to_string());
            });
        }
        "deleteProfile" => {
            let project = str_field("project").unwrap_or_default();
            let name = str_field("name").unwrap_or_default();
            let (app, out) = (app.clone(), out.clone());
            std::thread::spawn(move || {
                let r = crate::config_edit::delete_profile(&project, &name);
                let reply = match &r {
                    Ok(()) => {
                        let _ = app.emit("projects-changed", ());
                        json!({ "t": "deleteProfile", "ok": true, "project": project, "name": name })
                    }
                    Err(e) => {
                        json!({ "t": "deleteProfile", "ok": false, "project": project, "name": name, "error": e })
                    }
                };
                let _ = out.try_send(reply.to_string());
            });
        }
        "saveAction" => {
            let project = str_field("project").unwrap_or_default();
            let key = str_field("key").unwrap_or_default();
            let payload = v.get("payload").cloned().unwrap_or_else(|| json!({}));
            let previous_key = str_field("previousKey");
            let section = str_field("section");
            let (app, out) = (app.clone(), out.clone());
            std::thread::spawn(move || {
                let r = crate::config_edit::save_action(
                    &project,
                    &key,
                    &payload,
                    previous_key.as_deref(),
                    section.as_deref(),
                );
                let reply = match &r {
                    Ok(()) => {
                        let _ = app.emit("projects-changed", ());
                        json!({ "t": "saveAction", "ok": true, "project": project, "key": key })
                    }
                    Err(e) => {
                        json!({ "t": "saveAction", "ok": false, "project": project, "key": key, "error": e })
                    }
                };
                let _ = out.try_send(reply.to_string());
            });
        }
        "deleteAction" => {
            let project = str_field("project").unwrap_or_default();
            let key = str_field("key").unwrap_or_default();
            let (app, out) = (app.clone(), out.clone());
            std::thread::spawn(move || {
                let r = crate::config_edit::delete_action(&project, &key);
                let reply = match &r {
                    Ok(()) => {
                        let _ = app.emit("projects-changed", ());
                        json!({ "t": "deleteAction", "ok": true, "project": project, "key": key })
                    }
                    Err(e) => {
                        json!({ "t": "deleteAction", "ok": false, "project": project, "key": key, "error": e })
                    }
                };
                let _ = out.try_send(reply.to_string());
            });
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
            let id = a
                .get("id")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())?;
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
        g.get("name")
            .and_then(Value::as_str)
            .map(|n| {
                let n = n.trim();
                if ci {
                    n.eq_ignore_ascii_case(group_name)
                } else {
                    n == group_name
                }
            })
            .unwrap_or(false)
    };
    let existing = groups
        .iter()
        .position(|g| name_matches(g, false))
        .or_else(|| groups.iter().position(|g| name_matches(g, true)));
    let group_id = match existing {
        Some(i) => groups[i]
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
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
            if let Some(i) = order
                .iter()
                .position(|t| t.as_str() == Some(token.as_str()))
            {
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
            if let Some(g) = groups
                .iter()
                .find(|g| g.get("id").and_then(Value::as_str) == Some(id))
            {
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

// --- sidebar folder management (mirrors sidebarLayout.ts) ---------------------

/// The current sidebar layout for mutation: the `sidebarOrder` token list and the
/// groups.json wrapper (`{ "groups": [...] }`), matching group_copies_into_folder.
fn load_sidebar_layout() -> (Vec<Value>, Value) {
    let order: Vec<Value> = config::load_settings()
        .get("sidebarOrder")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    (order, crate::commands_real::load_groups())
}

/// Persist a mutated layout: rewrite groups.json and the settings sidebarOrder +
/// flattened projectOrder, exactly like group_copies_into_folder's tail.
fn persist_sidebar_layout(order: Vec<Value>, wrap: Value) -> Result<(), String> {
    let groups = wrap
        .get("groups")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let project_order = flatten_order(&order, &groups);
    crate::commands_real::save_groups(wrap)?;
    config::merge_settings(json!({ "sidebarOrder": order, "projectOrder": project_order }))?;
    Ok(())
}

/// Index of the folder named `name` (exact match, then case-insensitive), matching
/// group_copies_into_folder's lookup.
fn group_index_by_name(groups: &[Value], name: &str) -> Option<usize> {
    let name = name.trim();
    let matches = |g: &Value, ci: bool| {
        g.get("name")
            .and_then(Value::as_str)
            .map(|n| {
                let n = n.trim();
                if ci {
                    n.eq_ignore_ascii_case(name)
                } else {
                    n == name
                }
            })
            .unwrap_or(false)
    };
    groups
        .iter()
        .position(|g| matches(g, false))
        .or_else(|| groups.iter().position(|g| matches(g, true)))
}

/// Create an empty folder and append its token to the top-level order (mirrors
/// addGroup). A duplicate name is allowed — the desktop permits it too.
fn sidebar_create_folder(name: &str) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Folder name required.".into());
    }
    let (mut order, mut wrap) = load_sidebar_layout();
    let groups = wrap
        .get_mut("groups")
        .and_then(Value::as_array_mut)
        .ok_or("groups.json malformed")?;
    let id = uuid::Uuid::new_v4().to_string();
    groups.push(json!({ "id": id, "name": name, "members": [] }));
    order.push(Value::String(format!("group:{}", id)));
    persist_sidebar_layout(order, wrap)
}

/// Rename a folder matched by its current name (mirrors renameGroup).
fn sidebar_rename_folder(name: &str, new_name: &str) -> Result<(), String> {
    let new_name = new_name.trim();
    if new_name.is_empty() {
        return Err("Folder name required.".into());
    }
    let (order, mut wrap) = load_sidebar_layout();
    let groups = wrap
        .get_mut("groups")
        .and_then(Value::as_array_mut)
        .ok_or("groups.json malformed")?;
    let idx = group_index_by_name(groups, name).ok_or("Folder not found.")?;
    if let Some(m) = groups[idx].as_object_mut() {
        m.insert("name".into(), json!(new_name));
    }
    persist_sidebar_layout(order, wrap)
}

/// Delete a folder; its members spill back into the top-level order at the
/// folder's former slot, then the folder is dropped (mirrors removeGroup).
fn sidebar_delete_folder(name: &str) -> Result<(), String> {
    let (mut order, mut wrap) = load_sidebar_layout();
    let groups = wrap
        .get_mut("groups")
        .and_then(Value::as_array_mut)
        .ok_or("groups.json malformed")?;
    let idx = group_index_by_name(groups, name).ok_or("Folder not found.")?;
    let id = groups[idx]
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let members: Vec<Value> = groups[idx]
        .get("members")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    groups.remove(idx);
    let token = format!("group:{}", id);
    match order.iter().position(|t| t.as_str() == Some(token.as_str())) {
        Some(pos) => {
            order.splice(pos..=pos, members);
        }
        None => order.extend(members),
    }
    persist_sidebar_layout(order, wrap)
}

/// Move a project into a folder (matched by name, created if absent) or, when
/// `folder` is None, back out to the top level. Detaches from its current slot
/// first (mirrors moveIntoGroup / moveOutOfGroup).
fn sidebar_move_project(project: &str, folder: Option<&str>) -> Result<(), String> {
    if project.trim().is_empty() {
        return Err("Project required.".into());
    }
    let (mut order, mut wrap) = load_sidebar_layout();
    let groups = wrap
        .get_mut("groups")
        .and_then(Value::as_array_mut)
        .ok_or("groups.json malformed")?;

    order.retain(|t| t.as_str() != Some(project));
    for g in groups.iter_mut() {
        if let Some(m) = g.get_mut("members").and_then(Value::as_array_mut) {
            m.retain(|x| x.as_str() != Some(project));
        }
    }

    match folder.map(str::trim).filter(|f| !f.is_empty()) {
        Some(folder_name) => {
            let idx = match group_index_by_name(groups, folder_name) {
                Some(i) => i,
                None => {
                    let id = uuid::Uuid::new_v4().to_string();
                    groups.push(json!({ "id": id, "name": folder_name, "members": [] }));
                    order.push(Value::String(format!("group:{}", id)));
                    groups.len() - 1
                }
            };
            if let Some(m) = groups[idx].get_mut("members").and_then(Value::as_array_mut) {
                m.push(Value::String(project.to_string()));
            }
        }
        None => order.push(Value::String(project.to_string())),
    }
    persist_sidebar_layout(order, wrap)
}

// --- project file read (phone file viewer) -----------------------------------

/// Read a project file's text, confined to the project root and refusing binary
/// content. Returns the typed `file` reply (ok true/false). `cap` caps the read at
/// ~1MB; a longer file is truncated with `truncated: true`.
fn read_project_file(cwd: &str, project: &str, path: &str) -> Value {
    const CAP: usize = 1024 * 1024;
    let err = |msg: &str| {
        json!({ "t": "file", "project": project, "path": path, "ok": false, "error": msg })
    };

    let root = match std::fs::canonicalize(cwd) {
        Ok(p) => p,
        Err(_) => return err("This project's folder no longer exists."),
    };
    // Resolve the target through symlinks and confine it to the root, so `..` or a
    // symlink escaping the project is rejected.
    let full = match std::fs::canonicalize(root.join(path)) {
        Ok(p) => p,
        Err(_) => return err("File not found."),
    };
    if !full.starts_with(&root) {
        return err("That file is outside the project.");
    }
    let size = match std::fs::metadata(&full) {
        Ok(m) if m.is_dir() => return err("That path is a folder, not a file."),
        Ok(m) => m.len(),
        Err(_) => return err("File not found."),
    };
    // Read at most CAP bytes so previewing a huge file doesn't balloon memory.
    let mut bytes = Vec::new();
    match std::fs::File::open(&full).map(|f| {
        use std::io::Read;
        f.take(CAP as u64 + 1).read_to_end(&mut bytes)
    }) {
        Ok(Ok(_)) => {}
        Ok(Err(e)) => return err(&e.to_string()),
        Err(e) => return err(&e.to_string()),
    }
    let truncated = size > CAP as u64 || bytes.len() > CAP;
    let slice = if bytes.len() > CAP { &bytes[..CAP] } else { &bytes[..] };
    let content = match std::str::from_utf8(slice) {
        Ok(s) => s.to_string(),
        // A truncation can split a multibyte char at the cap; keep the valid prefix
        // only when the invalid tail is that small (else it's genuinely binary).
        Err(e) if truncated && slice.len() - e.valid_up_to() <= 3 => {
            String::from_utf8_lossy(&slice[..e.valid_up_to()]).into_owned()
        }
        Err(_) => return err("This file isn't text."),
    };
    json!({ "t": "file", "project": project, "path": path, "ok": true,
        "content": content, "truncated": truncated })
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
    prefs: PushPreferences,
) -> bool {
    if !devices.iter().any(|d| d.id == device_id) {
        return false;
    }
    for d in devices.iter_mut() {
        if d.id == device_id {
            d.apns_token = token.to_string();
            d.apns_env = env.to_string();
            d.push_key = key.to_string();
            d.push_waiting = prefs.waiting;
            d.push_done = prefs.done;
            d.push_error = prefs.error;
            d.push_automation_started = prefs.automation_started;
            d.push_automation_done = prefs.automation_done;
            d.push_automation_error = prefs.automation_error;
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
    prefs: PushPreferences,
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
/// `"<server_id>|<project>|<key>"` truncated to 60 chars, so a later transition on
/// the same pane replaces the shown notification instead of stacking a new one.
/// The server id keeps two Macs with same-named projects from collapsing each
/// other's notifications on a phone paired with both.
fn push_collapse_id(server_id: &str, project: &str, key: &str) -> String {
    let mut id = sha256_hex(format!("{server_id}|{project}|{key}").as_bytes());
    id.truncate(60);
    id
}

/// Seal a notification plaintext with AES-256-GCM under the device push key,
/// encoded as `nonce(12) || ciphertext || tag(16)` in standard base64 — the
/// CryptoKit `AES.GCM.SealedBox(combined:)` format the phone's extension opens.
fn seal_push(key: &[u8; 32], plaintext: &[u8]) -> Option<String> {
    let cipher = Aes256Gcm::new_from_slice(key).ok()?;
    let mut nonce = [0u8; 12];
    getrandom::fill(&mut nonce).ok()?;
    let sealed = cipher
        .encrypt(&Nonce::try_from(nonce.as_slice()).ok()?, plaintext)
        .ok()?;
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
    push_automation_started: bool,
    push_automation_done: bool,
    push_automation_error: bool,
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

    fn wants_automation(&self, result: &str) -> bool {
        match result {
            "found-work" | "pending-window" => self.push_automation_started,
            "completed" => self.push_automation_done,
            "error" | "timed-out" => self.push_automation_error,
            _ => false,
        }
    }

    fn wants_any_alert(&self) -> bool {
        self.push_waiting
            || self.push_done
            || self.push_error
            || self.push_automation_started
            || self.push_automation_done
            || self.push_automation_error
    }
}

/// One notification to seal + send: the resolved terminal label, status value,
/// the entry's timestamp, its status `key` (so a later clear can find it), and
/// the `apns-collapse-id` derived from (project, key).
struct PushJob {
    terminal: String,
    terminal_id: String,
    value: String,
    ts: i64,
    key: String,
    collapse_id: String,
}

/// The sealed plaintext for an alert push: the status entry plus this Mac's
/// `serverId`, which the phone uses to scope notification matching so a same-named
/// project on another paired Mac isn't confused with this one.
fn alert_payload(server_id: &str, project: &str, job: &PushJob) -> String {
    json!({
        "serverId": server_id,
        "project": project,
        "target": "terminal",
        "terminal": job.terminal,
        "terminalId": job.terminal_id,
        "status": job.value,
        "ts": job.ts,
        "key": job.key,
    })
    .to_string()
}

fn automation_alert_payload(
    server_id: &str,
    project: &str,
    job_id: &str,
    status: &str,
    ts: i64,
) -> String {
    json!({
        "serverId": server_id,
        "project": project,
        "target": "automation",
        "terminal": job_id,
        "automationId": job_id,
        "status": status,
        "ts": ts,
        "key": format!("automation:{job_id}"),
    })
    .to_string()
}

/// The sealed plaintext for a withdrawal (silent) push: the vanished entry keys
/// plus this Mac's `serverId`, scoping which delivered notifications the phone
/// removes so it can't clear another paired Mac's notifications.
fn clear_payload(server_id: &str, project: &str, keys: &[String]) -> String {
    json!({
        "serverId": server_id,
        "clear": keys
            .iter()
            .map(|k| json!({ "project": project, "key": k }))
            .collect::<Vec<_>>(),
    })
    .to_string()
}

/// Decode a device into a `PushDevice`, or None when its push key isn't a valid
/// 32-byte AES key (so nothing could be sealed to it anyway).
fn make_push_device(d: &Device) -> Option<PushDevice> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&d.push_key)
        .ok()?;
    let key: [u8; 32] = bytes.try_into().ok()?;
    Some(PushDevice {
        id: d.id.clone(),
        token: d.apns_token.clone(),
        env: d.apns_env.clone(),
        key,
        push_waiting: d.push_waiting,
        push_done: d.push_done,
        push_error: d.push_error,
        push_automation_started: d.push_automation_started,
        push_automation_done: d.push_automation_done,
        push_automation_error: d.push_automation_error,
    })
}

/// Whether a device is in this flavor's push scope. `paired_server_id` is the id
/// of the instance that paired the device; None/empty (legacy, pre-scoping) counts
/// as prod. So the dev instance pushes only to devices it paired, and prod pushes
/// to its own plus all legacy devices — no phantom pushes across flavors.
fn device_in_push_scope(paired_server_id: Option<&str>, instance_id: &str, prod_id: &str) -> bool {
    let owner = match paired_server_id {
        Some(id) if !id.is_empty() => id,
        _ => prod_id,
    };
    owner == instance_id
}

/// This flavor's push recipients from the shared devices list: those whose
/// `paired_server_id` scopes to this instance (see `device_in_push_scope`).
fn scoped_devices(cfg: &RemoteConfig) -> Vec<Device> {
    let instance_id = cfg.flavor_server_id();
    let prod_id = cfg.prod_server_id();
    cfg.devices
        .iter()
        .filter(|d| device_in_push_scope(d.paired_server_id.as_deref(), &instance_id, &prod_id))
        .cloned()
        .collect()
}

/// Devices eligible for alerts: a registered token, not currently connected,
/// opted in to at least one alert kind, and a valid push key.
fn alert_recipients(devices: &[Device], connected: &HashSet<String>) -> Vec<PushDevice> {
    devices
        .iter()
        .filter(|d| !d.apns_token.is_empty() && !connected.contains(&d.id))
        .filter_map(make_push_device)
        .filter(PushDevice::wants_any_alert)
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
        .filter(|e| {
            matches!(
                e.value.as_str(),
                STATUS_WAITING | STATUS_DONE | STATUS_ERROR
            )
        })
        .map(|e| (e.key, e.value, e.timestamp, e.pane_id))
        .collect();
    let pane_of: HashMap<String, String> = entries
        .iter()
        .map(|(k, _, _, p)| (k.clone(), p.clone()))
        .collect();
    let plain: Vec<(String, String, i64)> = entries
        .iter()
        .map(|(k, v, t, _)| (k.clone(), v.clone(), *t))
        .collect();

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
        hub.inner
            .clients
            .lock()
            .unwrap()
            .values()
            .map(|c| c.device_id.clone())
            .collect()
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
    let server_id = cfg.flavor_server_id();
    let scoped = scoped_devices(&cfg);
    let recipients: Vec<PushDevice> = if want_alert {
        alert_recipients(&scoped, &connected)
            .into_iter()
            .filter(|device| deltas.iter().any(|(_, value, _)| device.wants(value)))
            .collect()
    } else {
        Vec::new()
    };
    let clear_recipients: Vec<PushDevice> = if want_clear {
        clear_recipients(&scoped)
    } else {
        Vec::new()
    };
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
                let collapse_id = push_collapse_id(&server_id, project, &key);
                PushJob {
                    terminal,
                    terminal_id: pane_of.get(&key).cloned().unwrap_or_default(),
                    value,
                    ts,
                    key,
                    collapse_id,
                }
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
                let plaintext = alert_payload(&server_id, &project, job);
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
            let clear_plaintext = clear_payload(&server_id, &project, &vanished_keys);
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

fn push_automation_notification(hub: &RemoteHub, project: &str, job_id: &str, result: &str) {
    if !hub.inner.enabled.load(Ordering::Relaxed) || !hub.inner.running.load(Ordering::Relaxed) {
        return;
    }
    if project.is_empty() || job_id.is_empty() {
        return;
    }

    let status = match result {
        "found-work" => "Automation started",
        "pending-window" => "Automation found work — open lpm to start it",
        "completed" => "Automation finished",
        "error" => "Automation failed",
        "timed-out" => "Automation timed out",
        _ => return,
    };

    let connected: HashSet<String> = hub
        .inner
        .clients
        .lock()
        .unwrap()
        .values()
        .map(|c| c.device_id.clone())
        .collect();
    let cfg = load_config();
    let relay = cfg.effective_relay();
    let server_id = cfg.flavor_server_id();
    let recipients: Vec<PushDevice> = alert_recipients(&scoped_devices(&cfg), &connected)
        .into_iter()
        .filter(|device| device.wants_automation(result))
        .collect();
    if recipients.is_empty() {
        return;
    }

    let key = format!("automation:{job_id}");
    let collapse_id = push_collapse_id(&server_id, project, &key);
    let plaintext = automation_alert_payload(
        &server_id,
        project,
        job_id,
        status,
        crate::status::now_millis(),
    );

    let hub = (*hub).clone();
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
        for dev in &recipients {
            let Some(blob) = seal_push(&dev.key, plaintext.as_bytes()) else {
                continue;
            };
            let body = json!({
                "token": dev.token,
                "env": dev.env,
                "blob": blob,
                "collapseId": collapse_id,
            })
            .to_string();
            post_push(&client, &relay, &hub, &dev.id, body);
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
    let h = hub.clone();
    app.listen("job-status", move |event| {
        broadcast(&h, json!({ "t": "jobs-changed" }));
        let Ok(payload) = serde_json::from_str::<Value>(event.payload()) else {
            return;
        };
        let project = payload
            .get("project")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let job_id = payload
            .get("jobId")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let result = payload
            .get("result")
            .and_then(Value::as_str)
            .unwrap_or_default();
        push_automation_notification(&h, project, job_id, result);
    });
}

// --- crypto / net helpers ----------------------------------------------------

fn gen_token() -> String {
    let mut b = [0u8; 32];
    getrandom::fill(&mut b).expect("csprng");
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(b)
}

fn gen_pairing_code() -> String {
    let mut b = [0u8; 4];
    let _ = getrandom::fill(&mut b);
    let n = u32::from_be_bytes(b);
    format!("{:04X}-{:04X}", (n >> 16) & 0xFFFF, n & 0xFFFF)
}

/// 4 random digits the user reads off the Mac dialog and confirms against the
/// phone's screen. Never sent by the phone — a human compares it, so it only has
/// to be short and unguessable enough for that check.
fn gen_match_code() -> String {
    let mut b = [0u8; 2];
    let _ = getrandom::fill(&mut b);
    format!("{:04}", u16::from_be_bytes(b) % 10000)
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
        "port": effective_port(cfg.port),
        "tailscale": cfg.tailscale,
        "running": hub.inner.running.load(Ordering::Relaxed),
        "host": primary_lan_ip(),
        "tailscaleHost": tailscale_ip(),
        "identityRotated": cfg.enabled && crate::remotetls::identity_rotated(),
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
            item.get("emoji")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
        );
    }
    if !project.is_empty() && !ids.is_empty() {
        hub.inner.tree_ids.lock().unwrap().insert(project, ids);
    }
}

/// The desktop composer pushes its active-input text here (debounced) so paired
/// phones mirror it. Stores the draft, then broadcasts it to every client tagged
/// `origin: "mac"` so the phone knows the change is not its own echo.
#[tauri::command]
pub fn remote_set_composer_draft(hub: State<'_, RemoteHub>, id: String, text: String) {
    if id.is_empty() {
        return;
    }
    if let Some(rev) = record_draft(&hub, &id, &text) {
        broadcast(
            &hub,
            json!({ "t": "composerDraft", "id": id, "text": text, "rev": rev, "origin": "mac" }),
        );
    }
}

#[tauri::command]
pub fn remote_set_config(
    app: AppHandle,
    hub: State<'_, RemoteHub>,
    enabled: bool,
    port: u16,
    tailscale: bool,
) -> Result<Value, String> {
    {
        let mut cfg = hub.inner.config.lock().unwrap();
        cfg.enabled = enabled;
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
    // `f=` is the wss:// leaf-cert fingerprint (lowercase hex sha256 of the DER)
    // so a QR pair can verify the certificate it pins.
    let fingerprint = crate::remotetls::fingerprint();
    let url = format!("lpm://pair?p={port}&c={code}{host_params}&f={fingerprint}");
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
    hub.inner
        .clients
        .lock()
        .unwrap()
        .retain(|_, c| c.device_id != id);
    Ok(state_value(&hub))
}

/// Resolve the pending approve-on-Mac request from the dialog's Allow/Deny.
/// Async so it never runs on (and blocks) the UI thread; the work is just a
/// short lock + channel send that wakes the waiting connection thread.
#[tauri::command(async)]
pub fn remote_respond_pair_request(hub: State<'_, RemoteHub>, request_id: String, allow: bool) {
    hub.respond_pair_request(&request_id, allow);
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
                Err(_) => return FirstFrame::Done(None),
            }
        });

        let tcp = TcpStream::connect(addr).expect("tcp connect");
        let server_name = rustls::pki_types::ServerName::try_from("lpm").unwrap();
        let conn = rustls::ClientConnection::new(crate::remotetls::test_client_config(), server_name)
            .expect("client tls session");
        let tls = rustls::StreamOwned::new(conn, tcp);
        let (mut c, _) =
            tungstenite::client(format!("ws://{addr}/"), tls).expect("client connect");
        c.send(Message::text(
            json!({ "t": "pair", "code": "AAAA-BBBB", "name": "t" }).to_string(),
        ))
        .unwrap();
        let reply = c.read().expect("no reply frame");
        let auth = server.join().unwrap();

        *TEST_CONFIG_PATH.lock().unwrap() = None;
        let _ = std::fs::remove_file(&tmp);

        assert!(
            matches!(auth, FirstFrame::Done(Some(_))),
            "authenticate did not pair through a non-blocking listener"
        );
        assert!(
            reply.to_text().unwrap().contains("paired"),
            "expected paired, got: {reply:?}"
        );
    }

    // Transitional plaintext path: the pre-TLS mobile app connects over ws://
    // (no TLS ClientHello) and must still pair through the same acceptor, which
    // sniffs the first byte and takes the plaintext branch. Drop this test when
    // the plaintext branch in accept_ws is removed.
    #[test]
    fn legacy_plaintext_client_still_pairs() {
        let tmp = std::env::temp_dir()
            .join(format!("lpm-remote-plain-test-{}.json", std::process::id()));
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
                    let _ = stream.set_nonblocking(false);
                    let mut ws = accept_ws(stream).expect("server handshake");
                    return authenticate(&mut ws, &hub2);
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(10));
                }
                Err(_) => return FirstFrame::Done(None),
            }
        });

        let tcp = TcpStream::connect(addr).expect("tcp connect");
        let (mut c, _) =
            tungstenite::client(format!("ws://{addr}/"), tcp).expect("client connect");
        c.send(Message::text(
            json!({ "t": "pair", "code": "AAAA-BBBB", "name": "t" }).to_string(),
        ))
        .unwrap();
        let reply = c.read().expect("no reply frame");
        let auth = server.join().unwrap();

        *TEST_CONFIG_PATH.lock().unwrap() = None;
        let _ = std::fs::remove_file(&tmp);

        assert!(
            matches!(auth, FirstFrame::Done(Some(_))),
            "authenticate did not pair a legacy plaintext client"
        );
        assert!(
            reply.to_text().unwrap().contains("paired"),
            "expected paired, got: {reply:?}"
        );
    }

    #[test]
    fn ct_eq_matches_only_identical() {
        assert!(ct_eq(b"abc", b"abc"));
        assert!(!ct_eq(b"abc", b"abd"));
        assert!(!ct_eq(b"abc", b"ab"));
    }

    #[test]
    fn match_code_is_four_digits() {
        for _ in 0..64 {
            let c = gen_match_code();
            assert_eq!(c.len(), 4);
            assert!(c.chars().all(|ch| ch.is_ascii_digit()));
        }
    }

    #[test]
    fn pair_request_is_one_at_a_time_and_delivers_decision() {
        let hub = RemoteHub::default();
        let (id, code, rx) = hub.begin_pair_request().expect("first request registers");
        assert_eq!(code.len(), 4);

        // A second request while one is pending is refused (caller replies busy).
        assert!(hub.begin_pair_request().is_none(), "expected one-at-a-time");

        // The Allow/Deny from the command reaches the waiting connection thread.
        hub.respond_pair_request(&id, true);
        assert_eq!(rx.try_recv(), Ok(true));

        // Responding again is a no-op (the slot was cleared on resolve).
        hub.respond_pair_request(&id, false);
        assert_eq!(rx.try_recv(), Err(TryRecvError::Disconnected));
    }

    #[test]
    fn clear_pair_request_only_matches_its_own_id() {
        let hub = RemoteHub::default();
        let (id, _code, _rx) = hub.begin_pair_request().expect("request registers");
        hub.clear_pair_request("some-other-id");
        assert!(
            hub.inner.pending_pair.lock().unwrap().is_some(),
            "a mismatched id must not clear the pending request"
        );
        hub.clear_pair_request(&id);
        assert!(hub.inner.pending_pair.lock().unwrap().is_none());
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
        // Explicit non-dev flavor so the test doesn't depend on the compile profile
        // (unit tests build in debug, where is_dev_instance() is true).
        assert_eq!(effective_port_for(0, false), DEFAULT_PORT);
        assert_eq!(effective_port_for(9000, false), 9000);
    }

    #[test]
    fn effective_port_dev_offset() {
        // Dev sits at prod + 2 (8766 is the Mac-to-Mac peer host) for any base.
        assert_eq!(effective_port_for(0, true), DEFAULT_PORT + 2);
        assert_eq!(effective_port_for(9000, true), 9002);
        assert_ne!(effective_port_for(0, true), 8766);
    }

    #[test]
    fn device_push_scope_matches_flavor() {
        // Legacy entry (None/empty paired id) belongs to prod.
        assert!(device_in_push_scope(None, "prod", "prod"));
        assert!(!device_in_push_scope(None, "dev", "prod"));
        assert!(device_in_push_scope(Some(""), "prod", "prod"));
        assert!(!device_in_push_scope(Some(""), "dev", "prod"));
        // Explicitly paired entries match only their own instance.
        assert!(device_in_push_scope(Some("dev"), "dev", "prod"));
        assert!(!device_in_push_scope(Some("dev"), "prod", "prod"));
        assert!(device_in_push_scope(Some("prod"), "prod", "prod"));
        assert!(!device_in_push_scope(Some("prod"), "dev", "prod"));
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
            Device {
                id: "new".into(),
                ..Default::default()
            },
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
        let prefs = PushPreferences {
            waiting: true,
            done: false,
            error: true,
            automation_started: true,
            automation_done: false,
            automation_error: true,
        };
        assert!(apply_apns_token(
            &mut devices,
            "new",
            "deadbeef",
            "sandbox",
            &key,
            prefs
        ));

        let new = devices.iter().find(|d| d.id == "new").unwrap();
        assert_eq!(new.apns_token, "deadbeef");
        assert_eq!(new.apns_env, "sandbox");
        assert_eq!(new.push_key, key);
        assert_eq!(
            (new.push_waiting, new.push_done, new.push_error),
            (true, false, true)
        );
        assert_eq!(
            (
                new.push_automation_started,
                new.push_automation_done,
                new.push_automation_error,
            ),
            (true, false, true)
        );

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
        assert!(!apply_apns_token(
            &mut devices,
            "ghost",
            "deadbeef",
            "sandbox",
            &key,
            prefs
        ));
        let new = devices.iter().find(|d| d.id == "new").unwrap();
        assert_eq!(new.apns_token, "deadbeef");
        assert_eq!(
            (new.push_waiting, new.push_done, new.push_error),
            (true, false, true)
        );
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

        let mut automation = dev("automation", "ee", b64([6u8; 32]), (false, false, false));
        automation.push_automation_done = true;
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
            automation,
        ];

        let connected: HashSet<String> = ["connected".to_string()].into_iter().collect();

        let alert_ids: Vec<String> = alert_recipients(&devices, &connected)
            .into_iter()
            .map(|d| d.id)
            .collect();
        assert_eq!(
            alert_ids,
            vec!["opted".to_string(), "automation".to_string()]
        );

        let mut clear_ids: Vec<String> = clear_recipients(&devices)
            .into_iter()
            .map(|d| d.id)
            .collect();
        clear_ids.sort();
        assert_eq!(
            clear_ids,
            vec![
                "automation".to_string(),
                "connected".to_string(),
                "muted".to_string(),
                "opted".to_string(),
            ]
        );
    }

    #[test]
    fn config_roundtrips_through_json() {
        let cfg = RemoteConfig {
            enabled: true,
            port: 9000,
            pairing_code: "AB12-CD34".into(),
            tailscale: true,
            push_relay: "http://localhost:3000/api/push".into(),
            server_id: Some("srv-1".into()),
            dev_server_id: Some("dev-1".into()),
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
                push_automation_started: false,
                push_automation_done: true,
                push_automation_error: false,
                paired_server_id: Some("srv-1".into()),
            }],
        };
        let s = serde_json::to_string(&cfg).unwrap();
        let back: RemoteConfig = serde_json::from_str(&s).unwrap();
        assert_eq!(back.port, 9000);
        assert!(back.enabled);
        assert_eq!(back.server_id.as_deref(), Some("srv-1"));
        assert_eq!(back.dev_server_id.as_deref(), Some("dev-1"));
        assert_eq!(back.devices[0].paired_server_id.as_deref(), Some("srv-1"));
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
        assert!(!back.devices[0].push_automation_started);
        assert!(back.devices[0].push_automation_done);
        assert!(!back.devices[0].push_automation_error);
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
        assert!(cfg.server_id.is_none());
        // Per-flavor fields added later must default in from a legacy config.
        assert!(cfg.dev_server_id.is_none());
        assert_eq!(cfg.effective_relay(), DEFAULT_PUSH_RELAY);
        assert_eq!(cfg.devices.len(), 1);
        assert!(cfg.devices[0].paired_server_id.is_none());
        assert!(cfg.devices[0].apns_token.is_empty());
        assert!(cfg.devices[0].apns_env.is_empty());
        assert!(cfg.devices[0].push_key.is_empty());
        assert!(cfg.devices[0].push_waiting);
        assert!(cfg.devices[0].push_done);
        assert!(cfg.devices[0].push_error);
        assert!(!cfg.devices[0].push_automation_started);
        assert!(!cfg.devices[0].push_automation_done);
        assert!(!cfg.devices[0].push_automation_error);
    }

    #[test]
    fn validate_apns_enforces_shape() {
        let key = base64::engine::general_purpose::STANDARD.encode([1u8; 32]);
        assert!(validate_apns("abc123", "production", &key).is_ok());
        assert!(validate_apns("ABCDEF", "sandbox", &key).is_ok());
        assert!(
            validate_apns("", "production", &key).is_err(),
            "empty token"
        );
        assert!(
            validate_apns("xyz", "production", &key).is_err(),
            "non-hex token"
        );
        assert!(
            validate_apns(&"a".repeat(201), "production", &key).is_err(),
            "over-long token"
        );
        assert!(validate_apns("ab", "staging", &key).is_err(), "bad env");
        let short = base64::engine::general_purpose::STANDARD.encode([1u8; 16]);
        assert!(
            validate_apns("ab", "production", &short).is_err(),
            "16-byte key"
        );
        assert!(
            validate_apns("ab", "production", "not base64!!").is_err(),
            "bad base64"
        );
    }

    #[test]
    fn dedup_pushes_new_and_changed_only() {
        let mut seen = HashMap::new();
        let e = |k: &str, v: &str, ts: i64| (k.to_string(), v.to_string(), ts);

        // First sighting of both -> both push, nothing vanished yet.
        let (out, vanished) = dedup_status_pushes(
            &mut seen,
            "proj",
            &[e("a", "Waiting", 1), e("b", "Done", 1)],
        );
        assert_eq!(out.len(), 2);
        assert!(vanished.is_empty());

        // Identical re-report -> nothing.
        let (out, vanished) = dedup_status_pushes(
            &mut seen,
            "proj",
            &[e("a", "Waiting", 2), e("b", "Done", 2)],
        );
        assert!(out.is_empty(), "unchanged values dedup");
        assert!(vanished.is_empty());

        // a's value changed -> only a pushes.
        let (out, vanished) =
            dedup_status_pushes(&mut seen, "proj", &[e("a", "Error", 3), e("b", "Done", 3)]);
        assert_eq!(out, vec![e("a", "Error", 3)]);
        assert!(vanished.is_empty());

        // b vanished from the store -> reported once (for withdrawal), and its map
        // entry is dropped so if it reappears it counts as new again.
        let (out, vanished) = dedup_status_pushes(&mut seen, "proj", &[e("a", "Error", 4)]);
        assert!(out.is_empty());
        assert_eq!(vanished, vec!["b".to_string()], "b's vanish reported once");
        let (out, vanished) =
            dedup_status_pushes(&mut seen, "proj", &[e("a", "Error", 5), e("b", "Done", 5)]);
        assert_eq!(
            out,
            vec![e("b", "Done", 5)],
            "b re-notifies after vanishing"
        );
        assert!(
            vanished.is_empty(),
            "b's vanish not re-reported on the next event"
        );

        // A different project's key with the same name is independent.
        let (out, vanished) = dedup_status_pushes(&mut seen, "other", &[e("a", "Error", 6)]);
        assert_eq!(out, vec![e("a", "Error", 6)]);
        assert!(vanished.is_empty());
    }

    #[test]
    fn collapse_id_is_deterministic_hex_60() {
        let id = push_collapse_id("srv-a", "web-app", "pane-1");
        assert_eq!(id.len(), 60);
        assert!(id.chars().all(|c| c.is_ascii_hexdigit()));
        assert_eq!(
            id,
            push_collapse_id("srv-a", "web-app", "pane-1"),
            "deterministic"
        );
        assert_ne!(
            id,
            push_collapse_id("srv-a", "web-app", "pane-2"),
            "key participates"
        );
        assert_ne!(
            id,
            push_collapse_id("srv-a", "other", "pane-1"),
            "project participates"
        );
        assert_ne!(
            id,
            push_collapse_id("srv-b", "web-app", "pane-1"),
            "server participates"
        );
    }

    #[test]
    fn ensure_server_id_mints_once_and_is_stable() {
        // Flavor-agnostic: ensure_server_id mints this build's flavor slot
        // (dev_server_id under test's debug profile, server_id in release), so the
        // test asserts through flavor_server_id() rather than a specific field.
        let mut cfg = RemoteConfig::default();
        assert!(cfg.flavor_server_id().is_empty());
        assert!(cfg.ensure_server_id(), "first call mints");
        let first = cfg.flavor_server_id();
        assert!(!first.is_empty());
        assert!(!cfg.ensure_server_id(), "second call is a no-op");
        assert_eq!(cfg.flavor_server_id(), first, "stable across calls");
    }

    #[test]
    fn alert_payload_carries_server_id_and_fields() {
        let job = PushJob {
            terminal: "Ultracode".into(),
            terminal_id: "term-42".into(),
            value: STATUS_WAITING.into(),
            ts: 123,
            key: "pane-1".into(),
            collapse_id: "ignored".into(),
        };
        let v: Value = serde_json::from_str(&alert_payload("srv-a", "web-app", &job)).unwrap();
        assert_eq!(v["serverId"], "srv-a");
        assert_eq!(v["project"], "web-app");
        assert_eq!(v["target"], "terminal");
        assert_eq!(v["terminal"], "Ultracode");
        assert_eq!(v["terminalId"], "term-42");
        assert_eq!(v["status"], STATUS_WAITING);
        assert_eq!(v["ts"], 123);
        assert_eq!(v["key"], "pane-1");
    }

    #[test]
    fn clear_payload_carries_server_id_and_keys() {
        let keys = vec!["pane-1".to_string(), "pane-2".to_string()];
        let v: Value = serde_json::from_str(&clear_payload("srv-a", "web-app", &keys)).unwrap();
        assert_eq!(v["serverId"], "srv-a");
        let cleared = v["clear"].as_array().unwrap();
        assert_eq!(cleared.len(), 2);
        assert_eq!(cleared[0]["project"], "web-app");
        assert_eq!(cleared[0]["key"], "pane-1");
        assert_eq!(cleared[1]["key"], "pane-2");
    }

    #[test]
    fn automation_payload_carries_exact_job_target() {
        let v: Value = serde_json::from_str(&automation_alert_payload(
            "srv-a",
            "web-app",
            "daily-review",
            "Automation finished",
            456,
        ))
        .unwrap();
        assert_eq!(v["serverId"], "srv-a");
        assert_eq!(v["project"], "web-app");
        assert_eq!(v["target"], "automation");
        assert_eq!(v["automationId"], "daily-review");
        assert_eq!(v["status"], "Automation finished");
        assert_eq!(v["ts"], 456);
        assert_eq!(v["key"], "automation:daily-review");
    }

    #[test]
    fn seal_push_roundtrips() {
        let key = [9u8; 32];
        let plaintext = br#"{"project":"web","terminal":"Ultracode","status":"Waiting","ts":123}"#;
        let blob = seal_push(&key, plaintext).expect("seal");

        // Decrypt the combined SealedBox exactly as the phone's extension would.
        let raw = base64::engine::general_purpose::STANDARD
            .decode(&blob)
            .unwrap();
        assert!(raw.len() > 12 + 16, "nonce + ciphertext + tag");
        let (nonce, sealed) = raw.split_at(12);
        let cipher = Aes256Gcm::new_from_slice(&key).unwrap();
        let opened = cipher
            .decrypt(&Nonce::try_from(nonce).expect("nonce is 12 bytes"), sealed)
            .expect("open");
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
            push_automation_started: false,
            push_automation_done: false,
            push_automation_error: false,
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

    #[test]
    fn push_device_wants_automation_filters_by_prefs() {
        let dev = PushDevice {
            id: "d".into(),
            token: "t".into(),
            env: "sandbox".into(),
            key: [0u8; 32],
            push_waiting: false,
            push_done: false,
            push_error: false,
            push_automation_started: true,
            push_automation_done: false,
            push_automation_error: true,
        };

        assert!(dev.wants_automation("found-work"));
        assert!(dev.wants_automation("pending-window"));
        assert!(!dev.wants_automation("completed"));
        assert!(dev.wants_automation("error"));
        assert!(dev.wants_automation("timed-out"));
        assert!(!dev.wants_automation("running"));
    }
}
