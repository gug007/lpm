//! `lpm set-status <key> <value> [...]` and `lpm clear-status <key>` — thin
//! pass-throughs to the app's `set_status` / `clear_status` socket verbs.

use crate::config::Ctx;
use crate::control;
use crate::error::{resolve_or_infer, RunError};
use crate::statussock::{checked_arg, hex_encode, legacy_text, text_opt};

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

    // key/value ride positionally for pre-hex apps (flattened, lossy only
    // across newlines) and as byte-exact hex options that win on current apps.
    let mut line = format!(
        "set_status {} {} {} --key-hex={} --value-hex={}",
        checked_arg("project name", &file_name).map_err(RunError::NotFound)?,
        legacy_text(key),
        legacy_text(value),
        hex_encode(key),
        hex_encode(value)
    );
    if let Some(v) = icon {
        line.push_str(&text_opt("icon", v));
    }
    if let Some(v) = color {
        line.push_str(&format!(
            " --color={}",
            checked_arg("color", v).map_err(RunError::NotFound)?
        ));
    }
    if let Some(v) = priority {
        line.push_str(&format!(" --priority={v}"));
    }
    if let Some(v) = pane {
        line.push_str(&format!(
            " --pane={}",
            checked_arg("pane id", v).map_err(RunError::NotFound)?
        ));
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
        &format!(
            "clear_status {} {} --key-hex={}",
            checked_arg("project name", &file_name).map_err(RunError::NotFound)?,
            legacy_text(key),
            hex_encode(key)
        ),
    )?;
    println!("cleared {key} on {file_name}");
    Ok(())
}
