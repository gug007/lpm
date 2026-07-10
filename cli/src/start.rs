//! `lpm start [project] [--profile <name>]` — ask the running app to start a
//! project's services (optionally a named profile's subset).

use crate::config::Ctx;
use crate::control;
use crate::error::{resolve_or_infer, RunError};
use crate::statussock::quote_arg;
use serde_json::json;

pub fn run(
    ctx: &Ctx,
    project: Option<&str>,
    profile: Option<&str>,
    as_json: bool,
) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let file_name = resolve_or_infer(ctx, project)?;

    let mut line = format!("start_project {}", quote_arg(&file_name));
    if let Some(p) = profile.filter(|p| !p.is_empty()) {
        line.push_str(&format!(" --profile={}", quote_arg(p)));
    }
    control::send_command(ctx, &line)?;

    if as_json {
        crate::util::print_json(&json!({
            "ok": true,
            "project": file_name,
            "profile": profile,
        }));
    } else if let Some(p) = profile.filter(|p| !p.is_empty()) {
        println!("started {file_name} (profile {p})");
    } else {
        println!("started {file_name}");
    }
    Ok(())
}
