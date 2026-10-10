// Phone-side "machines": the `machines` and `machinePair` verbs that hand a
// phone the other machines this Mac connects to — its Linux hosts and other
// Macs — so the phone pairs with each one directly instead of someone scanning
// a code per machine. The phone then talks to them on its own, so a server stays
// reachable from the phone while this Mac is asleep.
//
// Each machine arms its own pairing (the `remotePair` peer frame): its
// certificate and phone port are the ones the phone must pin and dial. This Mac
// adds the one thing the machine can't know about itself — the address it is
// actually reached at, which for a server behind NAT or an SSH forward is not
// any address the server sees on its own interfaces.
//
// Each connected machine's projects ride along, so the phone's list can show
// them in the machine's sidebar slot just as this Mac's sidebar does.
use crate::peer::PeerEntry;
use crate::peerclient::{PeerClientHub, PhoneMachine};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::SyncSender;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

/// How long a list waits on one machine. One that stopped answering would
/// otherwise hold back every machine's news, and blank its own section.
const PROJECTS_TIMEOUT: Duration = Duration::from_secs(4);
/// A machine's last list stands in for it while it doesn't answer; its agents'
/// states only while they can still be current.
const STATUS_FRESH: Duration = Duration::from_secs(15);
const PUSH_DELAY: Duration = Duration::from_millis(800);
static PUSH_PENDING: AtomicBool = AtomicBool::new(false);

/// Each machine's last answered list, and when it came.
type LastLists = Mutex<HashMap<String, (Instant, Vec<Value>)>>;

fn last_lists() -> &'static LastLists {
    static LISTS: OnceLock<LastLists> = OnceLock::new();
    LISTS.get_or_init(Default::default)
}

/// One push at a time, so a slow one can't land after the one that followed it.
fn push_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(Default::default)
}

pub fn handle(app: &AppHandle, out: &SyncSender<String>, t: &str, v: &Value) {
    let Some(hub) = app.try_state::<PeerClientHub>() else {
        return;
    };
    let hub = hub.inner().clone();
    match t {
        "machines" => {
            let out = out.clone();
            // Asks every connected machine for its projects, so off the read loop.
            std::thread::spawn(move || {
                let _ = out.try_send(machines_frame(&hub).to_string());
            });
        }
        "machinePair" => {
            let slug = v
                .get("slug")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let out = out.clone();
            // Blocks on a round trip to the machine (up to its pairing timeout),
            // so it must stay off the connection's read loop.
            std::thread::spawn(move || {
                let _ = out.try_send(pair_reply(&hub, &slug).to_string());
            });
        }
        _ => {}
    }
}

/// A machine connected, dropped, or changed its projects: send every phone the
/// fresh list. A burst of changes becomes one push.
pub(crate) fn notify_changed(app: &AppHandle) {
    if !crate::remote::phones_connected(app) || PUSH_PENDING.swap(true, Ordering::AcqRel) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(PUSH_DELAY);
        let _one_at_a_time = push_lock().lock().unwrap();
        PUSH_PENDING.store(false, Ordering::Release);
        if let Some(hub) = app.try_state::<PeerClientHub>() {
            crate::remote::broadcast_frame(&app, machines_frame(hub.inner()));
        }
    });
}

fn machines_frame(hub: &PeerClientHub) -> Value {
    let machines = hub.phone_machines();
    let projects: Vec<Option<Vec<Value>>> = std::thread::scope(|s| {
        let asks: Vec<_> = machines
            .iter()
            .map(|m| s.spawn(|| machine_projects(hub, m)))
            .collect();
        asks.into_iter()
            .map(|ask| ask.join().ok().flatten())
            .collect()
    });
    let settings = crate::config::load_settings();
    let list: Vec<Value> = machines
        .iter()
        .zip(projects)
        .map(|(m, projects)| {
            let mut v = machine_json(m);
            if let Some(projects) = projects {
                let order = settings
                    .get("peerProjectOrder")
                    .and_then(|o| o.get(&m.entry.slug));
                v["projects"] = Value::Array(order_projects(projects, order));
            }
            v
        })
        .collect();
    json!({ "t": "machines", "machines": list })
}

/// The machine's own project list, as it answers `list_projects` to this Mac's
/// sidebar — or, while it doesn't answer, the last one it gave. None when it
/// isn't connected or never answered.
fn machine_projects(hub: &PeerClientHub, m: &PhoneMachine) -> Option<Vec<Value>> {
    if !m.connected {
        return None;
    }
    let slug = &m.entry.slug;
    match hub.invoke_within(slug, "list_projects", json!({}), PROJECTS_TIMEOUT) {
        Ok(Value::Array(projects)) => {
            last_lists()
                .lock()
                .unwrap()
                .insert(slug.clone(), (Instant::now(), projects.clone()));
            Some(projects)
        }
        _ => last_lists()
            .lock()
            .unwrap()
            .get(slug)
            .map(|(at, projects)| last_known(projects, at.elapsed())),
    }
}

/// A machine's last list as it can still be shown `age` later: its projects
/// stay, its agents' states only while recent.
fn last_known(projects: &[Value], age: Duration) -> Vec<Value> {
    if age < STATUS_FRESH {
        return projects.to_vec();
    }
    projects
        .iter()
        .map(|p| {
            let mut p = p.clone();
            p["statusEntries"] = json!([]);
            p
        })
        .collect()
}

/// The row order this Mac's sidebar keeps for the machine's section
/// (`peerProjectOrder`, as peerRowOrder.ts applies it): listed names first in
/// that order, the rest after them in the machine's own order.
fn order_projects(mut projects: Vec<Value>, order: Option<&Value>) -> Vec<Value> {
    let Some(order) = order.and_then(Value::as_array) else {
        return projects;
    };
    let rank = |p: &Value| {
        let name = p.get("name").and_then(Value::as_str);
        order
            .iter()
            .position(|n| n.as_str().is_some() && n.as_str() == name)
            .unwrap_or(order.len())
    };
    projects.sort_by_key(rank);
    projects
}

fn machine_json(m: &PhoneMachine) -> Value {
    json!({
        "slug": m.entry.slug,
        "name": display_name(&m.entry),
        "platform": m.entry.platform,
        "serverId": m.entry.phone_server_id,
        "state": machine_state(m),
    })
}

/// `ready` — can be paired now; `offline` — this Mac isn't connected to it;
/// `update` — connected, but its lpm predates arming a pairing on request.
fn machine_state(m: &PhoneMachine) -> &'static str {
    if !m.connected {
        "offline"
    } else if !m.supports_remote_pair {
        "update"
    } else {
        "ready"
    }
}

pub(crate) fn display_name(entry: &PeerEntry) -> String {
    let alias = entry.alias.trim();
    if alias.is_empty() {
        entry.host.clone()
    } else {
        alias.to_string()
    }
}

fn pair_reply(hub: &PeerClientHub, slug: &str) -> Value {
    let fail = |e: String| json!({ "t": "machinePair", "slug": slug, "ok": false, "error": e });
    let Some(entry) = hub
        .phone_machines()
        .into_iter()
        .map(|m| m.entry)
        .find(|e| e.slug == slug)
    else {
        return fail("This machine is no longer connected to this Mac.".into());
    };
    let payload = match hub.remote_pair_blocking(slug) {
        Ok(p) => p,
        Err(e) => return fail(e),
    };
    let str_of = |k: &str| payload.get(k).and_then(Value::as_str).unwrap_or_default();
    let code = str_of("code");
    if code.is_empty() {
        return fail("The machine didn't return a pairing code.".into());
    }
    let own_hosts: Vec<String> = payload
        .get("hosts")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    let fingerprint = match str_of("fingerprint") {
        "" => url_param(str_of("url"), "f").unwrap_or_default(),
        f => f.to_string(),
    };
    let server_id = match str_of("serverId") {
        "" => entry.phone_server_id.clone(),
        id => id.to_string(),
    };
    json!({
        "t": "machinePair",
        "slug": slug,
        "ok": true,
        "code": code,
        "hosts": phone_hosts(&route_host(&entry), &own_hosts),
        "port": payload.get("port").and_then(Value::as_u64).unwrap_or(0),
        "fingerprint": fingerprint,
        "serverId": server_id,
        "name": display_name(&entry),
        "platform": entry.platform,
    })
}

/// The address this Mac reaches the machine at. For an SSH-forwarded peer the
/// dialled address is this Mac's own loopback, so the SSH destination's real
/// hostname stands in — an `~/.ssh/config` alias means nothing to a phone.
fn route_host(entry: &PeerEntry) -> String {
    if entry.ssh.is_set() {
        let alias = entry.ssh.host.trim();
        return ssh_hostname(alias).unwrap_or_else(|| alias.to_string());
    }
    entry.host.trim().to_string()
}

/// What `ssh -G` resolves a destination to. Only reads the local ssh config; it
/// never connects.
fn ssh_hostname(alias: &str) -> Option<String> {
    let out = crate::osproc::command("ssh")
        .args(["-G", alias])
        .stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    parse_ssh_hostname(&String::from_utf8_lossy(&out.stdout))
}

fn parse_ssh_hostname(config: &str) -> Option<String> {
    config.lines().find_map(|line| {
        let (key, value) = line.split_once(' ')?;
        let value = value.trim();
        (key.eq_ignore_ascii_case("hostname") && !value.is_empty()).then(|| value.to_string())
    })
}

/// Candidate addresses for the phone, the route this Mac uses first, then the
/// machine's own view of itself. Loopback is dropped — it names the phone.
fn phone_hosts(route: &str, own: &[String]) -> Vec<String> {
    let mut hosts: Vec<String> = Vec::new();
    for h in std::iter::once(route).chain(own.iter().map(String::as_str)) {
        let h = h.trim();
        if h.is_empty() || is_loopback(h) || hosts.iter().any(|x| x.eq_ignore_ascii_case(h)) {
            continue;
        }
        hosts.push(h.to_string());
    }
    hosts
}

fn is_loopback(host: &str) -> bool {
    host.eq_ignore_ascii_case("localhost")
        || host
            .parse::<std::net::IpAddr>()
            .is_ok_and(|ip| ip.is_loopback() || ip.is_unspecified())
}

/// One query parameter from a pairing URL — for a machine whose lpm predates the
/// `fingerprint` field and only carries it in the QR URL's `f=`.
fn url_param(url: &str, key: &str) -> Option<String> {
    let query = url.split_once('?')?.1;
    query.split('&').find_map(|pair| {
        let (k, v) = pair.split_once('=')?;
        (k == key && !v.is_empty()).then(|| v.to_string())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_machine_that_stops_answering_keeps_its_projects_but_not_old_states() {
        let projects = vec![json!({ "name": "api", "statusEntries": [{ "key": "k", "value": "Running" }] })];
        assert_eq!(last_known(&projects, Duration::from_secs(1)), projects);
        let stale = last_known(&projects, Duration::from_secs(60));
        assert_eq!(stale[0]["name"], "api");
        assert_eq!(stale[0]["statusEntries"], json!([]));
    }

    fn machine(connected: bool, supports_remote_pair: bool) -> PhoneMachine {
        PhoneMachine {
            entry: PeerEntry::default(),
            connected,
            supports_remote_pair,
        }
    }

    #[test]
    fn state_says_why_a_machine_cannot_be_paired() {
        assert_eq!(machine_state(&machine(true, true)), "ready");
        assert_eq!(machine_state(&machine(false, true)), "offline");
        assert_eq!(machine_state(&machine(true, false)), "update");
    }

    // The server's own interfaces often show only a private or NAT address; the
    // route this Mac actually uses must come first and never be lost.
    #[test]
    fn phone_hosts_lead_with_the_route_and_drop_loopback() {
        let own = vec![
            "10.0.0.5".to_string(),
            "203.0.113.7".to_string(),
            "127.0.0.1".to_string(),
        ];
        assert_eq!(
            phone_hosts("203.0.113.7", &own),
            vec!["203.0.113.7", "10.0.0.5"]
        );
        assert_eq!(
            phone_hosts("127.0.0.1", &own),
            vec!["10.0.0.5", "203.0.113.7"]
        );
        assert_eq!(phone_hosts("localhost", &[]), Vec::<String>::new());
        assert_eq!(phone_hosts("", &["::1".to_string()]), Vec::<String>::new());
    }

    #[test]
    fn a_forwarded_peer_is_routed_by_its_ssh_host() {
        let mut entry = PeerEntry {
            host: "127.0.0.1".into(),
            ..Default::default()
        };
        assert_eq!(route_host(&entry), "127.0.0.1");
        entry.ssh.host = "203.0.113.9".into();
        assert_ne!(route_host(&entry), "127.0.0.1");
    }

    #[test]
    fn parses_the_resolved_hostname_from_ssh_g() {
        let out = "user root\nhostname box.example.com\nport 22\n";
        assert_eq!(parse_ssh_hostname(out).as_deref(), Some("box.example.com"));
        assert_eq!(parse_ssh_hostname("user root\n"), None);
    }

    #[test]
    fn reads_the_fingerprint_from_an_older_pairing_url() {
        let url = "lpm://pair?p=8765&c=AB12-CD34&h=10.0.0.5&h=100.64.0.2&f=deadbeef";
        assert_eq!(url_param(url, "f").as_deref(), Some("deadbeef"));
        assert_eq!(url_param(url, "c").as_deref(), Some("AB12-CD34"));
        assert_eq!(url_param("lpm://pair?p=1&f=", "f"), None);
        assert_eq!(url_param("no-query", "f"), None);
    }

    #[test]
    fn projects_follow_the_sidebar_order_then_the_machines_own() {
        let projects = ["c", "a", "new", "b"]
            .iter()
            .map(|n| json!({ "name": n }))
            .collect();
        let names = |v: Vec<Value>| -> Vec<String> {
            v.iter()
                .map(|p| p["name"].as_str().unwrap().to_string())
                .collect()
        };
        let order = json!(["b", "gone", "a", "c"]);
        assert_eq!(
            names(order_projects(projects, Some(&order))),
            vec!["b", "a", "c", "new"]
        );
        let unordered = vec![json!({ "name": "z" }), json!({ "name": "y" })];
        assert_eq!(names(order_projects(unordered, None)), vec!["z", "y"]);
    }

    #[test]
    fn a_blank_alias_falls_back_to_the_address() {
        let entry = PeerEntry {
            alias: "  ".into(),
            host: "203.0.113.7".into(),
            ..Default::default()
        };
        assert_eq!(display_name(&entry), "203.0.113.7");
    }
}
