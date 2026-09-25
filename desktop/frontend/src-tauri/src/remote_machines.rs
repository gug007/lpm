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
use crate::peer::PeerEntry;
use crate::peerclient::{PeerClientHub, PhoneMachine};
use serde_json::{json, Value};
use std::sync::mpsc::SyncSender;
use tauri::{AppHandle, Manager};

pub fn handle(app: &AppHandle, out: &SyncSender<String>, t: &str, v: &Value) {
    let Some(hub) = app.try_state::<PeerClientHub>() else {
        return;
    };
    let hub = hub.inner().clone();
    match t {
        "machines" => {
            let machines: Vec<Value> = hub.phone_machines().iter().map(machine_json).collect();
            let _ = out.try_send(json!({ "t": "machines", "machines": machines }).to_string());
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

fn display_name(entry: &PeerEntry) -> String {
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
    let out = std::process::Command::new("ssh")
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
    fn a_blank_alias_falls_back_to_the_address() {
        let entry = PeerEntry {
            alias: "  ".into(),
            host: "203.0.113.7".into(),
            ..Default::default()
        };
        assert_eq!(display_name(&entry), "203.0.113.7");
    }
}
