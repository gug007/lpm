//! Shared running-state inference for a single service: a listen probe when a
//! port is declared, otherwise the tmux session's liveness.

use std::net::TcpListener;

/// Whether something is currently listening on a local TCP port. Based on the
/// app's `ports::can_bind` probe, but only an `AddrInUse` failure counts as
/// "listening": a bind refused for another reason (e.g. `PermissionDenied` on a
/// privileged port like 1, which `lpm wait --port` may be handed) is not a
/// detectable listener, so it reads as not-listening rather than a false
/// positive.
pub fn port_listening(port: i64) -> Option<bool> {
    if port <= 0 || port > 65535 {
        return None;
    }
    match TcpListener::bind(("127.0.0.1", port as u16)) {
        Ok(_) => Some(false),
        Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => Some(true),
        Err(_) => Some(false),
    }
}

/// Running verdict for one service.
pub struct ServiceStatus {
    pub running: bool,
    /// "port" (from a listen probe), "session" (portless, inferred from the
    /// tmux session), or "stopped".
    pub source: &'static str,
    pub port_listening: Option<bool>,
}

pub fn service_status(port: i64, session_running: bool) -> ServiceStatus {
    match port_listening(port) {
        Some(listening) => ServiceStatus {
            running: listening,
            source: "port",
            port_listening: Some(listening),
        },
        None => ServiceStatus {
            running: session_running,
            source: if session_running {
                "session"
            } else {
                "stopped"
            },
            port_listening: None,
        },
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
}
