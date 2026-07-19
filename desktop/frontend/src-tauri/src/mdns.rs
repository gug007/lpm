// Bonjour/mDNS advertising for the mobile remote-control server (remote.rs).
//
// The phone browses for `_lpm._tcp` on the LAN and matches the TXT `id` field to
// re-find a saved Mac whose address changed. Advertising is active only while the
// remote server is running and bound to the LAN (0.0.0.0); a loopback-only server
// is never advertised. `advertise` is idempotent — it drops any prior instance
// and registers with the current port/name — so the remote lifecycle drives it
// directly: advertise after a LAN bind, withdraw on stop or before a rebind.
//
// A single long-lived `ServiceDaemon` (created lazily on the first advertise)
// backs both calls. register/unregister only enqueue a command on the daemon's
// channel and return immediately, so neither call blocks its caller — `withdraw`
// is safe to invoke from a sync #[tauri::command] on the UI thread — and because
// both run through the one daemon's FIFO command queue, a re-registration always
// wins over an earlier instance's goodbye (no stale-record race).
use mdns_sd::{ServiceDaemon, ServiceInfo};
use std::sync::Mutex;

const SERVICE_TYPE: &str = "_lpm._tcp.local.";
const INSTANCE_MAX_BYTES: usize = 63; // DNS-SD instance label limit

pub struct AdParams {
    pub server_id: String,
    pub server_name: String,
    pub port: u16,
    pub dev: bool,
}

struct Advertiser {
    daemon: ServiceDaemon,
    fullname: Option<String>, // the currently-registered instance, if any
}

static STATE: Mutex<Option<Advertiser>> = Mutex::new(None);

/// (Re)publish the service with the given identity/port. Any prior instance is
/// dropped first, so this doubles as the "config changed, rebind" path. Failures
/// are logged, never fatal — the remote server runs regardless. Runs on the bind
/// background thread, so lazily standing up the daemon here never touches the UI.
pub fn advertise(p: AdParams) {
    let mut guard = STATE.lock().unwrap();
    if guard.is_none() {
        match ServiceDaemon::new() {
            Ok(daemon) => {
                *guard = Some(Advertiser {
                    daemon,
                    fullname: None,
                })
            }
            Err(e) => {
                eprintln!("warning: mDNS advertise failed: {e}");
                return;
            }
        }
    }
    let ad = guard.as_mut().unwrap();
    if let Some(old) = ad.fullname.take() {
        let _ = ad.daemon.unregister(&old);
    }
    match register(&ad.daemon, &p) {
        Ok(fullname) => ad.fullname = Some(fullname),
        Err(e) => eprintln!("warning: mDNS advertise failed: {e}"),
    }
}

/// Deregister the service (server stopped or dropped off the LAN). Only enqueues
/// an unregister command, so it never blocks — safe on the UI thread. The daemon
/// stays alive for reuse; it is torn down with the process.
pub fn withdraw() {
    let mut guard = STATE.lock().unwrap();
    if let Some(ad) = guard.as_mut() {
        if let Some(fullname) = ad.fullname.take() {
            let _ = ad.daemon.unregister(&fullname);
        }
    }
}

fn register(daemon: &ServiceDaemon, p: &AdParams) -> Result<String, String> {
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
    let info = ServiceInfo::new(SERVICE_TYPE, &instance, &host, "", p.port, &txt[..])
        .map_err(|e| e.to_string())?
        .enable_addr_auto();
    let fullname = info.get_fullname().to_string();
    daemon.register(info).map_err(|e| e.to_string())?;
    Ok(fullname)
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
