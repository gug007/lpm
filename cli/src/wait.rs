//! `lpm wait [project] [--service <name>] [--port <n>] [--agent] [--timeout <secs>]` —
//! block until a project / service / port is ready, or (with `--agent`) until the
//! project's AI agents settle. The port/service/ready modes poll client-side
//! (250ms) and never touch the app; `--agent` instead polls the running app's
//! status socket (1s), so it requires the app to be reachable.

use crate::config::{self, Ctx};
use crate::control;
use crate::error::{resolve_or_infer, RunError};
use crate::service::{port_listening, service_status};
use crate::statussock::{self, StatusEntry};
use crate::style::{status_value, Style};
use crate::tmux;
use serde_json::{json, Value};
use std::io::IsTerminal;
use std::time::{Duration, Instant};

const POLL_INTERVAL: Duration = Duration::from_millis(250);
/// Polling the app socket is more expensive than a local port check, so the
/// agent mode uses a gentler cadence.
const AGENT_POLL_INTERVAL: Duration = Duration::from_secs(1);
const MAX_TIMEOUT: i64 = 3600;

/// What the poll loop watches. Built once, then probed each tick.
#[derive(Debug, PartialEq)]
enum Target {
    /// A specific TCP port must be listening.
    Port(i64),
    /// The session must exist and — if the service has a port — that port must
    /// listen (portless services follow the session, per `service_status`).
    Service {
        name: String,
        session: String,
        port: i64,
    },
    /// The session must exist and every declared port must be listening.
    Ready { session: String, ports: Vec<i64> },
}

impl Target {
    fn describe(&self) -> String {
        match self {
            Target::Port(p) => format!("port {p} to listen"),
            Target::Service { name, .. } => format!("service {name:?} to be running"),
            Target::Ready { session, .. } => format!("project {session:?} to be ready"),
        }
    }

    fn satisfied(&self) -> bool {
        match self {
            Target::Port(p) => port_listening(*p).unwrap_or(false),
            Target::Service { session, port, .. } => {
                service_status(*port, tmux::session_exists(session)).running
            }
            Target::Ready { session, ports } => {
                tmux::session_exists(session)
                    && ports.iter().all(|p| port_listening(*p).unwrap_or(false))
            }
        }
    }
}

/// Decide what to wait on from the flags + the resolved project. Pure: takes
/// already-resolved data so it is unit-testable without tmux or a socket.
/// `services` is the declared (name, port) list in declaration order.
fn select_target(
    port: Option<i64>,
    service: Option<&str>,
    session: &str,
    services: &[(String, i64)],
) -> Result<Target, String> {
    if let Some(p) = port {
        return Ok(Target::Port(p));
    }
    if let Some(name) = service {
        return match services.iter().find(|(n, _)| n == name) {
            Some((n, p)) => Ok(Target::Service {
                name: n.clone(),
                session: session.to_string(),
                port: *p,
            }),
            None => {
                let names: Vec<&str> = services.iter().map(|(n, _)| n.as_str()).collect();
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
    let ports: Vec<i64> = services
        .iter()
        .filter(|(_, p)| *p > 0)
        .map(|(_, p)| *p)
        .collect();
    Ok(Target::Ready {
        session: session.to_string(),
        ports,
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
        return run_agent(ctx, project, timeout, as_json);
    }

    // A bare `--port` wait needs no project; other modes resolve one.
    let (session, services): (String, Vec<(String, i64)>) = if port.is_some() {
        (String::new(), Vec::new())
    } else {
        let file_name = resolve_or_infer(ctx, project)?;
        let p = config::resolve_project(ctx, &file_name).map_err(RunError::Internal)?;
        let session = p.session.clone();
        let services = p
            .services
            .iter()
            .map(|s| (s.name.clone(), s.port))
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

/// Whether the project's agents have settled: at least one status has reported
/// and none is still `Running`. An empty list means the queued agent hasn't
/// started/reported yet, so it is not yet settled. Pure and unit-tested.
fn agents_settled(entries: &[StatusEntry]) -> bool {
    !entries.is_empty() && entries.iter().all(|e| e.value != "Running")
}

/// Compact per-entry JSON for the agent-mode success/timeout payloads.
fn statuses_json(entries: &[StatusEntry]) -> Vec<Value> {
    entries
        .iter()
        .map(|e| {
            json!({
                "key": e.key,
                "value": e.value,
                "paneID": e.pane_id,
                "timestamp": e.timestamp,
            })
        })
        .collect()
}

/// `--agent`: block until the project's AI agents settle. Unlike the other
/// modes, agent statuses live only in the app, so this requires the app running
/// and polls its status socket.
fn run_agent(
    ctx: &Ctx,
    project: Option<&str>,
    timeout: i64,
    as_json: bool,
) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let file_name = resolve_or_infer(ctx, project)?;
    let socket = ctx.socket_path();
    let deadline = Duration::from_secs(timeout as u64);
    let start = Instant::now();

    loop {
        // A transient socket failure (None) reads as "not settled yet" — keep
        // polling rather than giving up early.
        let entries = statussock::list_status(&socket, &file_name).unwrap_or_default();
        if agents_settled(&entries) {
            let ms = start.elapsed().as_millis() as u64;
            if as_json {
                crate::util::print_json(&json!({
                    "ok": true,
                    "elapsedMs": ms,
                    "statuses": statuses_json(&entries),
                }));
            } else {
                println!("agents settled after {:.1}s", start.elapsed().as_secs_f64());
                let style = Style {
                    on: std::io::stdout().is_terminal(),
                };
                for e in &entries {
                    println!(
                        "  {}  {}",
                        style.bold(&e.key),
                        status_value(&style, &e.value)
                    );
                }
            }
            return Ok(());
        }
        if start.elapsed() >= deadline {
            let ms = start.elapsed().as_millis() as u64;
            let waiting_for = format!("agents in {file_name:?} to settle");
            if as_json {
                crate::util::print_json(&json!({
                    "ok": false,
                    "elapsedMs": ms,
                    "waitingFor": waiting_for,
                    "statuses": statuses_json(&entries),
                }));
            }
            return Err(RunError::Internal(format!(
                "timed out after {timeout}s waiting for {waiting_for}"
            )));
        }
        std::thread::sleep(AGENT_POLL_INTERVAL);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(value: &str) -> StatusEntry {
        StatusEntry {
            key: "k".into(),
            value: value.into(),
            icon: String::new(),
            color: String::new(),
            priority: 0,
            timestamp: 0,
            agent_pid: 0,
            pane_id: String::new(),
        }
    }

    #[test]
    fn agents_not_settled_when_empty() {
        assert!(!agents_settled(&[]));
    }

    #[test]
    fn agents_not_settled_while_any_running() {
        let entries = [entry("Done"), entry("Running"), entry("Waiting")];
        assert!(!agents_settled(&entries));
    }

    #[test]
    fn agents_settled_when_all_terminal_or_waiting() {
        assert!(agents_settled(&[entry("Done")]));
        assert!(agents_settled(&[entry("Waiting"), entry("Error")]));
        assert!(agents_settled(&[entry("Done"), entry("Done")]));
    }

    fn svcs() -> Vec<(String, i64)> {
        vec![
            ("web".to_string(), 3000),
            ("worker".to_string(), 0),
            ("db".to_string(), 5432),
        ]
    }

    #[test]
    fn port_flag_wins_and_ignores_project() {
        let t = select_target(Some(8080), None, "sess", &svcs()).unwrap();
        assert_eq!(t, Target::Port(8080));
    }

    #[test]
    fn service_flag_selects_that_service_port() {
        let t = select_target(None, Some("db"), "sess", &svcs()).unwrap();
        assert_eq!(
            t,
            Target::Service {
                name: "db".to_string(),
                session: "sess".to_string(),
                port: 5432,
            }
        );
    }

    #[test]
    fn unknown_service_lists_declared() {
        let err = select_target(None, Some("ghost"), "sess", &svcs()).unwrap_err();
        assert!(err.contains("web") && err.contains("db"));
    }

    #[test]
    fn default_waits_on_session_and_ported_services_only() {
        let t = select_target(None, None, "sess", &svcs()).unwrap();
        assert_eq!(
            t,
            Target::Ready {
                session: "sess".to_string(),
                ports: vec![3000, 5432],
            }
        );
    }
}
