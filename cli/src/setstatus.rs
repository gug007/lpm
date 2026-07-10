//! `lpm set-status <key> <value> [...]` and `lpm clear-status <key>` — thin
//! pass-throughs to the app's `set_status` / `clear_status` socket verbs.

use crate::config::Ctx;
use crate::control;
use crate::error::{resolve_or_infer, RunError};
use crate::statussock::quote_arg;

#[allow(clippy::too_many_arguments)]
pub fn run_set(
    ctx: &Ctx,
    key: &str,
    value: &str,
    icon: Option<&str>,
    color: Option<&str>,
    priority: Option<i64>,
    pane: Option<&str>,
    project: Option<&str>,
) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let file_name = resolve_or_infer(ctx, project)?;

    let mut line = format!(
        "set_status {} {} {}",
        quote_arg(&file_name),
        quote_arg(key),
        quote_arg(value)
    );
    if let Some(v) = icon {
        line.push_str(&format!(" --icon={}", quote_arg(v)));
    }
    if let Some(v) = color {
        line.push_str(&format!(" --color={}", quote_arg(v)));
    }
    if let Some(v) = priority {
        line.push_str(&format!(" --priority={v}"));
    }
    if let Some(v) = pane {
        line.push_str(&format!(" --pane={}", quote_arg(v)));
    }

    control::send_command(ctx, &line)?;
    println!("set {key}={value} on {file_name}");
    Ok(())
}

pub fn run_clear(ctx: &Ctx, key: &str, project: Option<&str>) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let file_name = resolve_or_infer(ctx, project)?;

    control::send_command(
        ctx,
        &format!("clear_status {} {}", quote_arg(&file_name), quote_arg(key)),
    )?;
    println!("cleared {key} on {file_name}");
    Ok(())
}
