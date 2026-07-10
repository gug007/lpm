//! `lpm service <service> <start|stop|restart> [-p <project>]` — drive one
//! service via the running app. The service name is passed through verbatim:
//! the app owns matching, so there is no client-side prefix matching. When the
//! app reports an unknown service, the declared service list is appended.

use crate::config::{self, Ctx};
use crate::control;
use crate::error::{resolve_or_infer, RunError};
use crate::statussock::quote_arg;
use serde_json::json;

#[derive(clap::ValueEnum, Clone, Copy)]
pub enum Op {
    Start,
    Stop,
    Restart,
}

impl Op {
    fn verb(self) -> &'static str {
        match self {
            Op::Start => "start_service",
            Op::Stop => "stop_service",
            Op::Restart => "restart_service",
        }
    }
    fn past(self) -> &'static str {
        match self {
            Op::Start => "started",
            Op::Stop => "stopped",
            Op::Restart => "restarted",
        }
    }
    fn word(self) -> &'static str {
        match self {
            Op::Start => "start",
            Op::Stop => "stop",
            Op::Restart => "restart",
        }
    }
}

pub fn run(
    ctx: &Ctx,
    service: &str,
    op: Op,
    project: Option<&str>,
    as_json: bool,
) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let file_name = resolve_or_infer(ctx, project)?;

    let line = format!("{} {} {}", op.verb(), quote_arg(&file_name), quote_arg(service));
    match control::send_command(ctx, &line) {
        Ok(_) => {
            if as_json {
                crate::util::print_json(&json!({
                    "ok": true,
                    "project": file_name,
                    "service": service,
                    "op": op.word(),
                }));
            } else {
                println!("{} {service} in {file_name}", op.past());
            }
            Ok(())
        }
        // An "unknown service" reply is more useful with the declared list; other
        // failures (e.g. "not running") pass straight through.
        Err(RunError::Internal(msg)) if msg.contains("not found") => {
            Err(RunError::Internal(format!(
                "{msg}\n{}",
                declared_services_hint(ctx, &file_name)
            )))
        }
        Err(e) => Err(e),
    }
}

fn declared_services_hint(ctx: &Ctx, file_name: &str) -> String {
    match config::resolve_project(ctx, file_name) {
        Ok(p) if !p.services.is_empty() => {
            let names: Vec<&str> = p.services.iter().map(|s| s.name.as_str()).collect();
            format!("declared services: {}", names.join(", "))
        }
        _ => "this project declares no services".to_string(),
    }
}
