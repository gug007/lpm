//! `lpm wait [project] [--service <name>] [--port <n>] [--agent] [--timeout <secs>]` —
//! block until a project / service / port is ready, or (with `--agent`, see
//! `waitagent`) until the project's AI agents settle. These modes poll
//! client-side (250ms) and never touch the app. A service with a `ready` check
//! is ready when that check passes, the same check the app gates its
//! dependents on; without one, its port listening (or its session) decides.

use crate::config::{self, Ctx};
use crate::error::{resolve_or_infer, RunError};
use crate::ready::{self, ReadyCheck};
use crate::service::{port_listening, service_status};
use crate::sessions;
use serde_json::json;
use std::time::{Duration, Instant};

const POLL_INTERVAL: Duration = Duration::from_millis(250);
const MAX_TIMEOUT: i64 = 3600;

/// A declared service as `wait` sees it.
#[derive(Clone, Debug, PartialEq)]
struct WaitService {
    name: String,
    port: i64,
    cmd: String,
    ready: Option<ReadyCheck>,
}

impl WaitService {
    /// `alive`: whether the project's session exists, asked once per tick.
    fn satisfied(&self, session: &str, alive: bool) -> bool {
        match &self.ready {
            Some(check) => alive && ready::passes(&check.probe, session, &self.name, &self.cmd),
            None => service_status(self.port, alive).running,
        }
    }
}

/// What the poll loop watches. Built once, then probed each tick.
#[derive(Debug, PartialEq)]
enum Target {
    /// A specific TCP port must be listening.
    Port(i64),
    /// The session must exist and the service be ready: its `ready` check
    /// passes, or — without one — its port listens (portless services follow
    /// the session, per `service_status`).
    Service {
        session: String,
        service: WaitService,
    },
    /// The session must exist and every declared service with a `ready` check
    /// or a port be ready.
    Ready {
        session: String,
        services: Vec<WaitService>,
    },
}

impl Target {
    fn describe(&self) -> String {
        match self {
            Target::Port(p) => format!("port {p} to listen"),
            Target::Service { service, .. } => format!("service {:?} to be ready", service.name),
            Target::Ready { session, .. } => format!("project {session:?} to be ready"),
        }
    }

    fn satisfied(&self) -> bool {
        match self {
            Target::Port(p) => port_listening(*p).unwrap_or(false),
            Target::Service { session, service } => {
                service.satisfied(session, sessions::session_exists(session))
            }
            Target::Ready { session, services } => {
                sessions::session_exists(session) && services.iter().all(|s| s.satisfied(session, true))
            }
        }
    }
}

/// Decide what to wait on from the flags + the resolved project. Pure: takes
/// already-resolved data so it is unit-testable without a session daemon or a socket.
/// `services` is the declared list in declaration order.
fn select_target(
    port: Option<i64>,
    service: Option<&str>,
    session: &str,
    services: &[WaitService],
) -> Result<Target, String> {
    if let Some(p) = port {
        return Ok(Target::Port(p));
    }
    if let Some(name) = service {
        return match services.iter().find(|s| s.name == name) {
            Some(s) => Ok(Target::Service {
                session: session.to_string(),
                service: s.clone(),
            }),
            None => {
                let names: Vec<&str> = services.iter().map(|s| s.name.as_str()).collect();
                Err(format!(
                    "no service {name:?} in this project\ndeclared services: {}",
                    if names.is_empty() {
                        "(none)".to_string()
                    } else {
                        names.join(", ")
                    }
                ))
            }
        };
    }
    Ok(Target::Ready {
        session: session.to_string(),
        services: services
            .iter()
            .filter(|s| s.ready.is_some() || s.port > 0)
            .cloned()
            .collect(),
    })
}

#[allow(clippy::too_many_arguments)]
pub fn run(
    ctx: &Ctx,
    project: Option<&str>,
    service: Option<&str>,
    port: Option<i64>,
    agent: bool,
    timeout: i64,
    as_json: bool,
) -> Result<(), RunError> {
    let timeout = timeout.clamp(1, MAX_TIMEOUT);
    if agent {
        return crate::waitagent::run(ctx, project, timeout, as_json);
    }

    // A bare `--port` wait needs no project; other modes resolve one.
    let (session, services): (String, Vec<WaitService>) = if port.is_some() {
        (String::new(), Vec::new())
    } else {
        let file_name = resolve_or_infer(ctx, project)?;
        let p = config::resolve_project(ctx, &file_name).map_err(RunError::Internal)?;
        let session = p.session.clone();
        let services = p
            .services
            .iter()
            .map(|s| WaitService {
                name: s.name.clone(),
                port: s.port,
                cmd: s.cmd.clone(),
                ready: s.ready.as_ref().and_then(|r| r.resolve(s.port).ok()),
            })
            .collect();
        (session, services)
    };

    let target = select_target(port, service, &session, &services).map_err(RunError::NotFound)?;
    let deadline = Duration::from_secs(timeout as u64);
    let start = Instant::now();

    loop {
        if target.satisfied() {
            let ms = start.elapsed().as_millis() as u64;
            if as_json {
                crate::util::print_json(&json!({ "ok": true, "elapsedMs": ms }));
            } else {
                println!("ready after {:.1}s", start.elapsed().as_secs_f64());
            }
            return Ok(());
        }
        if start.elapsed() >= deadline {
            let ms = start.elapsed().as_millis() as u64;
            let waiting_for = target.describe();
            if as_json {
                crate::util::print_json(
                    &json!({ "ok": false, "elapsedMs": ms, "waitingFor": waiting_for }),
                );
            }
            return Err(RunError::Internal(format!(
                "timed out after {timeout}s waiting for {waiting_for}"
            )));
        }
        std::thread::sleep(POLL_INTERVAL);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ready::Probe;

    fn svc(name: &str, port: i64, ready: Option<Probe>) -> WaitService {
        WaitService {
            name: name.to_string(),
            port,
            cmd: String::new(),
            ready: ready.map(|probe| ReadyCheck {
                probe,
                timeout: Duration::from_secs(30),
            }),
        }
    }

    fn svcs() -> Vec<WaitService> {
        vec![
            svc("web", 3000, None),
            svc("worker", 0, None),
            svc("db", 5432, None),
            svc("queue", 0, Some(Probe::Log("ready".into()))),
        ]
    }

    #[test]
    fn port_flag_wins_and_ignores_project() {
        let t = select_target(Some(8080), None, "sess", &svcs()).unwrap();
        assert_eq!(t, Target::Port(8080));
    }

    #[test]
    fn service_flag_selects_that_service_with_its_check() {
        let t = select_target(None, Some("db"), "sess", &svcs()).unwrap();
        assert_eq!(
            t,
            Target::Service {
                session: "sess".to_string(),
                service: svc("db", 5432, None),
            }
        );
        let t = select_target(None, Some("queue"), "sess", &svcs()).unwrap();
        assert!(matches!(t, Target::Service { service, .. } if service.ready.is_some()));
    }

    #[test]
    fn unknown_service_lists_declared() {
        let err = select_target(None, Some("ghost"), "sess", &svcs()).unwrap_err();
        assert!(err.contains("web") && err.contains("db"));
    }

    #[test]
    fn default_waits_on_ported_and_checked_services_only() {
        let t = select_target(None, None, "sess", &svcs()).unwrap();
        let Target::Ready { session, services } = t else {
            panic!("expected a project wait");
        };
        assert_eq!(session, "sess");
        let names: Vec<&str> = services.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, ["web", "db", "queue"]);
    }
}
