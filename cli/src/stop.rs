//! `lpm stop [project]` — ask the running app to stop a project's services.

use crate::config::Ctx;
use crate::control;
use crate::error::{resolve_or_infer, RunError};
use crate::statussock::quote_arg;
use serde_json::json;

pub fn run(ctx: &Ctx, project: Option<&str>, as_json: bool) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let file_name = resolve_or_infer(ctx, project)?;

    control::send_command(ctx, &format!("stop_project {}", quote_arg(&file_name)))?;

    if as_json {
        crate::util::print_json(&json!({ "ok": true, "project": file_name }));
    } else {
        println!("stopped {file_name}");
    }
    Ok(())
}
