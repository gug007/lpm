// Bonjour/mDNS for the two LAN roles: advertising the mobile remote-control
// server (remote.rs) and the Mac-to-Mac peer host server (peer.rs), plus browsing
// for other Macs' peer servers so the Connect Macs pane can list nearby Macs.
//
// A phone browses for `_lpm._tcp` and matches the TXT `id` to re-find a saved Mac
// whose address changed. A Mac browses for `_lpm-peer._tcp` to discover peers to
// pair with. Advertising is active only while a server is running and bound to the
// LAN (0.0.0.0); a loopback-only server is never advertised. Each `advertise*` is
// idempotent per service type — it drops any prior instance and registers with the
// current port/name — so the server lifecycle drives it directly.
//
// A single long-lived `ServiceDaemon` (created lazily) backs every call. register/
// unregister/browse/stop_browse only enqueue a command on the daemon's channel and
// return immediately, so no call blocks its caller — `withdraw*`/`stop_browse` are
// safe to invoke from a sync #[tauri::command] on the UI thread — and because all
// run through the one daemon's FIFO queue, a re-registration always wins over an
// earlier instance's goodbye (no stale-record race).
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

const SERVICE_TYPE: &str = "_lpm._tcp.local.";
const PEER_SERVICE_TYPE: &str = "_lpm-peer._tcp.local.";
const INSTANCE_MAX_BYTES: usize = 63; // DNS-SD instance label limit

pub struct AdParams {
    pub server_id: String,
    pub server_name: String,
    pub port: u16,
    pub dev: bool,
}

/// A Mac discovered on the LAN advertising its peer host server.
#[derive(Serialize, Clone)]
pub struct DiscoveredPeer {
    pub id: String,
    pub name: String,
    pub hosts: Vec<String>,
    pub port: u16,
    pub dev: bool,
}

struct Advertiser {
    daemon: ServiceDaemon,
    registrations: HashMap<String, String>, // service_type -> currently-registered fullname
}

static STATE: Mutex<Option<Advertiser>> = Mutex::new(None);

/// Get (creating on first use) the shared daemon, run `f` against it. Returns None
/// if the daemon could not be created (logged; callers no-op).
fn with_daemon<T>(f: impl FnOnce(&mut Advertiser) -> T) -> Option<T> {
    let mut guard = STATE.lock().unwrap();
    if guard.is_none() {
        match ServiceDaemon::new() {
            Ok(daemon) => {
                *guard = Some(Advertiser {
                    daemon,
                    registrations: HashMap::new(),
                })
            }
            Err(e) => {
                eprintln!("warning: mDNS daemon init failed: {e}");
                return None;
            }
        }
    }
    Some(f(guard.as_mut().unwrap()))
}

/// (Re)publish the mobile service. See `advertise_on`.
pub fn advertise(p: AdParams) {
    advertise_on(SERVICE_TYPE, p);
}

/// (Re)publish the Mac-to-Mac peer service. See `advertise_on`.
pub fn advertise_peer(p: AdParams) {
    advertise_on(PEER_SERVICE_TYPE, p);
}

/// (Re)publish `service_type` with the given identity/port. Any prior instance of
/// that type is dropped first, so this doubles as the "config changed, rebind"
/// path. Failures are logged, never fatal.
fn advertise_on(service_type: &str, p: AdParams) {
    with_daemon(|ad| {
        if let Some(old) = ad.registrations.remove(service_type) {
            let _ = ad.daemon.unregister(&old);
        }
        match register(&ad.daemon, service_type, &p) {
            Ok(fullname) => {
                ad.registrations.insert(service_type.to_string(), fullname);
            }
            Err(e) => eprintln!("warning: mDNS advertise failed: {e}"),
        }
    });
}

/// Deregister the mobile service. Only enqueues an unregister, so it never blocks.
pub fn withdraw() {
    withdraw_on(SERVICE_TYPE);
}

/// Deregister the peer service. Only enqueues an unregister, so it never blocks.
pub fn withdraw_peer() {
    withdraw_on(PEER_SERVICE_TYPE);
}

fn withdraw_on(service_type: &str) {
    let mut guard = STATE.lock().unwrap();
    if let Some(ad) = guard.as_mut() {
        if let Some(fullname) = ad.registrations.remove(service_type) {
            let _ = ad.daemon.unregister(&fullname);
        }
    }
}

fn register(daemon: &ServiceDaemon, service_type: &str, p: &AdParams) -> Result<String, String> {
    let frag: String = p.server_id.chars().take(6).collect();
    let instance = instance_name(&p.server_name, &frag);
    let host = format!("lpm-{frag}.local.");
    let mut txt = vec![
        ("id", p.server_id.as_str()),
        ("name", p.server_name.as_str()),
        ("v", "1"),
    ];
    if p.dev {
        txt.push(("dev", "1"));
    }
    // Empty address + enable_addr_auto() lets the daemon enumerate the host's IPs
    // and keep them current as interfaces change, instead of pinning one.
    let info = ServiceInfo::new(service_type, &instance, &host, "", p.port, &txt[..])
        .map_err(|e| e.to_string())?
        .enable_addr_auto();
    let fullname = info.get_fullname().to_string();
    daemon.register(info).map_err(|e| e.to_string())?;
    Ok(fullname)
}

// --- browsing (peer discovery) ------------------------------------------------

static BROWSE_GEN: AtomicU64 = AtomicU64::new(0);

/// Start browsing for other Macs' peer servers. `on_change` is invoked with the
/// full current list on every add/remove. Any prior browse is retired first (a
/// `stop_browse` on the daemon wakes its thread with `SearchStopped`), so a second
/// call re-seeds cleanly. Non-blocking: the receiver loop runs on a dedicated
/// thread; the daemon's browse channel is a flume receiver.
pub fn start_browse(on_change: impl Fn(Vec<DiscoveredPeer>) + Send + 'static) {
    let generation = BROWSE_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    // Retire a prior browse before registering the new one. FIFO on the daemon
    // queue means the stop notifies the old listener first, then this browse
    // registers a fresh listener that never sees that SearchStopped.
    let receiver = with_daemon(|ad| {
        let _ = ad.daemon.stop_browse(PEER_SERVICE_TYPE);
        ad.daemon.browse(PEER_SERVICE_TYPE).ok()
    })
    .flatten();
    let Some(receiver) = receiver else {
        return;
    };
    std::thread::spawn(move || {
        let mut found: HashMap<String, DiscoveredPeer> = HashMap::new();
        let emit = |m: &HashMap<String, DiscoveredPeer>| {
            on_change(m.values().cloned().collect());
        };
        loop {
            match receiver.recv() {
                Ok(ServiceEvent::ServiceResolved(info)) => {
                    if let Some(peer) = to_discovered(&info) {
                        found.insert(info.get_fullname().to_string(), peer);
                        emit(&found);
                    }
                }
                Ok(ServiceEvent::ServiceRemoved(_, fullname)) => {
                    if found.remove(&fullname).is_some() {
                        emit(&found);
                    }
                }
                Ok(ServiceEvent::SearchStopped(_)) => return,
                Ok(_) => {}
                Err(_) => return, // daemon dropped the channel
            }
            if BROWSE_GEN.load(Ordering::SeqCst) != generation {
                return; // superseded by a newer start_browse
            }
        }
    });
}

/// Stop browsing. Only enqueues a stop command (which wakes the receiver thread
/// with `SearchStopped`), so it never blocks — safe on the UI thread.
pub fn stop_browse() {
    BROWSE_GEN.fetch_add(1, Ordering::SeqCst);
    let mut guard = STATE.lock().unwrap();
    if let Some(ad) = guard.as_mut() {
        let _ = ad.daemon.stop_browse(PEER_SERVICE_TYPE);
    }
}

fn to_discovered(info: &mdns_sd::ResolvedService) -> Option<DiscoveredPeer> {
    let id = info.get_property_val_str("id")?.to_string();
    if id.is_empty() {
        return None;
    }
    let name = info
        .get_property_val_str("name")
        .filter(|s| !s.is_empty())
        .unwrap_or("Mac")
        .to_string();
    let dev = info.get_property_val_str("dev").is_some();
    let hosts: Vec<String> = info
        .get_addresses_v4()
        .iter()
        .map(|ip| ip.to_string())
        .collect();
    if hosts.is_empty() {
        return None;
    }
    Some(DiscoveredPeer {
        id,
        name,
        hosts,
        port: info.get_port(),
        dev,
    })
}

/// `{serverName} [{frag}]`, sanitized and truncated to the instance-label limit
/// while always preserving the id fragment (uniqueness lives there; the display
/// name comes from the TXT record).
fn instance_name(server_name: &str, frag: &str) -> String {
    let suffix = format!(" [{frag}]");
    let room = INSTANCE_MAX_BYTES.saturating_sub(suffix.len());
    let name = truncate_bytes(&sanitize(server_name), room);
    format!("{name}{suffix}")
}

fn sanitize(s: &str) -> String {
    s.chars()
        .map(|c| if c == '.' || c.is_control() { '-' } else { c })
        .collect()
}

fn truncate_bytes(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    let mut end = max;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    s[..end].to_string()
}
