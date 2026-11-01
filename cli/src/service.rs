//! Shared running-state inference for a single service, matching the app: it is
//! stopped unless its project's session runs, then a listen probe decides when
//! a port is declared, otherwise the session's liveness. Another project on the
//! same port — a duplicate, say — doesn't make this one's service running.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, TcpListener, TcpStream};
use std::time::Duration;

const CONNECT_TIMEOUT: Duration = Duration::from_millis(250);

/// Whether a loopback connect to `port` succeeds, over IPv4 or IPv6.
pub fn port_accepts(port: u16) -> bool {
    let accepts = |ip: IpAddr| TcpStream::connect_timeout(&SocketAddr::new(ip, port), CONNECT_TIMEOUT).is_ok();
    accepts(Ipv4Addr::LOCALHOST.into()) || accepts(Ipv6Addr::LOCALHOST.into())
}

/// Whether something is currently listening on a local TCP port. A loopback
/// connect comes first: a bind probe alone misses the usual dev server, which
/// listens on `[::]:port` — std sets SO_REUSEADDR, so a 127.0.0.1 bind beside it
/// succeeds on macOS. The bind probe (the app's `ports::can_bind`) still catches
/// a listener off loopback, but only an `AddrInUse` failure counts: a bind
/// refused for another reason (e.g. `PermissionDenied` on a privileged port
/// like 1, which `lpm wait --port` may be handed) reads as not-listening.
pub fn port_listening(port: i64) -> Option<bool> {
    if port <= 0 || port > 65535 {
        return None;
    }
    let port = port as u16;
    if port_accepts(port) {
        return Some(true);
    }
    match TcpListener::bind((Ipv4Addr::LOCALHOST, port)) {
        Ok(_) => Some(false),
        Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => Some(true),
        Err(_) => Some(false),
    }
}

/// Running verdict for one service.
pub struct ServiceStatus {
    pub running: bool,
    /// "port" (from a listen probe), "session" (portless, inferred from the
    /// session), or "stopped" (no session).
    pub source: &'static str,
    pub port_listening: Option<bool>,
}

pub fn service_status(port: i64, session_running: bool) -> ServiceStatus {
    let listening = port_listening(port);
    let (running, source) = match (session_running, listening) {
        (false, _) => (false, "stopped"),
        (true, Some(listening)) => (listening, "port"),
        (true, None) => (true, "session"),
    };
    ServiceStatus {
        running,
        source,
        port_listening: listening,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn portless_service_follows_session() {
        assert!(service_status(0, true).running);
        assert!(!service_status(0, false).running);
        assert_eq!(service_status(0, true).source, "session");
    }

    #[test]
    fn listener_on_ipv6_wildcard_counts_as_listening() {
        let Ok(listener) = TcpListener::bind((Ipv6Addr::UNSPECIFIED, 0)) else {
            return; // no IPv6 on this machine
        };
        let port = listener.local_addr().unwrap().port() as i64;
        assert_eq!(port_listening(port), Some(true));
        let status = service_status(port, true);
        assert!(status.running);
        assert_eq!(status.source, "port");
    }

    #[test]
    fn a_port_held_without_the_session_is_not_this_service() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port() as i64;
        let status = service_status(port, false);
        assert!(!status.running);
        assert_eq!(status.source, "stopped");
        assert_eq!(status.port_listening, Some(true));
    }

    #[test]
    fn listener_on_ipv4_loopback_counts_as_listening() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port() as i64;
        assert_eq!(port_listening(port), Some(true));
    }

    #[test]
    fn closed_port_is_not_listening() {
        let port = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap().local_addr().unwrap().port() as i64;
        assert_eq!(port_listening(port), Some(false));
    }
}
