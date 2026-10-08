// Which paired phones are connected right now, how each came in, and when each
// was last seen: what a phone's row in Settings → Mobile devices says.
use crate::remotestore::{Device, RemoteConfig};
use serde_json::{json, Value};
use std::net::IpAddr;

const NAME_LIMIT: usize = 64;
const SEEN_GAP_MS: i64 = 30_000;

/// How a phone reached this machine.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum Route {
    /// The same local network: home or office Wi-Fi.
    Network,
    /// Tailscale, through the app or lpm's built-in node.
    Tailscale,
    /// A public address, such as a server reached directly.
    Internet,
    /// This machine itself, or a tunnel that ends on it.
    Local,
}

impl Route {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Route::Network => "network",
            Route::Tailscale => "tailscale",
            Route::Internet => "internet",
            Route::Local => "local",
        }
    }

    /// The route of a connection accepted from `peer`. Connections the built-in
    /// Tailscale node hands over arrive from loopback, so they are marked by the
    /// listener that accepted them instead.
    pub(crate) fn of(peer: Option<IpAddr>, through_tailnet: bool) -> Route {
        if through_tailnet {
            return Route::Tailscale;
        }
        peer.map_or(Route::Network, classify)
    }
}

fn classify(ip: IpAddr) -> Route {
    let ip = match ip {
        IpAddr::V6(v6) => v6.to_ipv4_mapped().map_or(IpAddr::V6(v6), IpAddr::V4),
        v4 => v4,
    };
    match ip {
        IpAddr::V4(v4) => {
            let o = v4.octets();
            if v4.is_loopback() {
                Route::Local
            } else if o[0] == 100 && (64..=127).contains(&o[1]) {
                Route::Tailscale
            } else if v4.is_private() || v4.is_link_local() {
                Route::Network
            } else {
                Route::Internet
            }
        }
        IpAddr::V6(v6) => {
            let s = v6.segments();
            if v6.is_loopback() {
                Route::Local
            } else if s[0] == 0xfd7a && s[1] == 0x115c && s[2] == 0xa1e0 {
                Route::Tailscale
            } else if s[0] & 0xfe00 == 0xfc00 || s[0] & 0xffc0 == 0xfe80 {
                Route::Network
            } else {
                Route::Internet
            }
        }
    }
}

/// The name a phone is listed under: the one set here, else its own.
pub(crate) fn display_name(d: &Device) -> &str {
    if d.alias.is_empty() {
        &d.name
    } else {
        &d.alias
    }
}

/// Record that `device_id` connected or disconnected just now over `route`.
/// `None` (nothing to save) when the same route was stamped moments ago: a
/// phone reconnects every time it comes back to the foreground.
pub(crate) fn note_seen(
    cfg: &mut RemoteConfig,
    device_id: &str,
    route: Route,
    now: i64,
) -> Option<()> {
    let d = cfg.devices.iter_mut().find(|d| d.id == device_id)?;
    if d.last_route == route.as_str() && (0..SEEN_GAP_MS).contains(&(now - d.last_seen)) {
        return None;
    }
    d.last_seen = now;
    d.last_route = route.as_str().to_string();
    Some(())
}

/// Name a phone on this machine. An empty name goes back to the phone's own.
pub(crate) fn rename(cfg: &mut RemoteConfig, device_id: &str, name: &str) -> Option<()> {
    let d = cfg.devices.iter_mut().find(|d| d.id == device_id)?;
    let name = name.trim();
    d.alias = if name == d.name {
        String::new()
    } else {
        name.chars().take(NAME_LIMIT).collect()
    };
    Some(())
}

/// A phone as the Settings pane lists it. `live` is the route of its open
/// connection, if it has one.
pub(crate) fn device_json(d: &Device, live: Option<Route>) -> Value {
    json!({
        "id": d.id,
        "name": display_name(d),
        "phoneName": d.name,
        "createdAt": d.created_at,
        "connected": live.is_some(),
        "route": live.map(Route::as_str),
        "lastSeen": d.last_seen,
        "lastRoute": (!d.last_route.is_empty()).then_some(d.last_route.as_str()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn route(ip: &str) -> Route {
        Route::of(Some(ip.parse().unwrap()), false)
    }

    #[test]
    fn routes_follow_the_address_a_phone_came_from() {
        assert_eq!(route("192.168.0.42"), Route::Network);
        assert_eq!(route("10.0.0.7"), Route::Network);
        assert_eq!(route("100.92.155.108"), Route::Tailscale);
        assert_eq!(route("fd7a:115c:a1e0::3"), Route::Tailscale);
        assert_eq!(route("::ffff:192.168.0.42"), Route::Network);
        assert_eq!(route("fe80::1"), Route::Network);
        assert_eq!(route("85.9.204.194"), Route::Internet);
        assert_eq!(route("127.0.0.1"), Route::Local);
    }

    #[test]
    fn the_built_in_node_marks_its_connections_as_tailscale() {
        assert_eq!(
            Route::of(Some("127.0.0.1".parse().unwrap()), true),
            Route::Tailscale
        );
    }

    fn config_with_phone() -> RemoteConfig {
        RemoteConfig {
            devices: vec![Device {
                id: "d1".into(),
                name: "iPhone".into(),
                created_at: 1,
                ..Default::default()
            }],
            ..Default::default()
        }
    }

    #[test]
    fn fields_from_a_newer_build_survive_a_save() {
        let json =
            r#"{"enabled":true,"future":1,"devices":[{"id":"d1","name":"iPhone","later":"x"}]}"#;
        let cfg: RemoteConfig = serde_json::from_str(json).unwrap();
        let back = serde_json::to_value(&cfg).unwrap();
        assert_eq!(back["future"], 1);
        assert_eq!(back["devices"][0]["later"], "x");
        assert_eq!(back["devices"][0]["name"], "iPhone");
    }

    #[test]
    fn a_renamed_phone_lists_under_its_new_name_and_can_go_back() {
        let mut cfg = config_with_phone();
        rename(&mut cfg, "d1", "  Work iPhone ").unwrap();
        assert_eq!(display_name(&cfg.devices[0]), "Work iPhone");
        rename(&mut cfg, "d1", "").unwrap();
        assert_eq!(display_name(&cfg.devices[0]), "iPhone");
        assert!(rename(&mut cfg, "missing", "x").is_none());
    }

    #[test]
    fn a_row_says_whether_the_phone_is_here_and_when_it_was_last_seen() {
        let mut cfg = config_with_phone();
        let idle = device_json(&cfg.devices[0], None);
        assert_eq!(idle["connected"], false);
        assert_eq!(idle["lastSeen"], 0);
        assert!(idle["lastRoute"].is_null());

        note_seen(&mut cfg, "d1", Route::Tailscale, 42).unwrap();
        assert!(note_seen(&mut cfg, "d1", Route::Tailscale, 5_000).is_none());
        assert!(note_seen(&mut cfg, "d1", Route::Network, 6_000).is_some());
        note_seen(&mut cfg, "d1", Route::Tailscale, 42).unwrap();
        let live = device_json(&cfg.devices[0], Some(Route::Tailscale));
        assert_eq!(live["connected"], true);
        assert_eq!(live["route"], "tailscale");
        assert_eq!(live["lastSeen"], 42);
        assert_eq!(live["lastRoute"], "tailscale");
    }
}
