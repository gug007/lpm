//! `lpm run [action] [--command CMD] [--prompt TEXT] [-p project]` — queue an
//! action or command in a new terminal in the running app. Fire-and-forget: the
//! CLI can't await terminal output; observe it with `lpm logs` / `lpm status`.

use crate::config::{self, Ctx};
use crate::control;
use crate::error::{resolve_or_infer, RunError};
use crate::statussock::quote_arg;
use serde_json::json;

/// Resolve an action name against the project's declared actions: exact match,
/// else unambiguous prefix (mirrors the logs service selector). Returns the
/// resolved exact name; unknown/ambiguous is a usage message.
fn select_action(names: &[String], query: &str) -> Result<String, String> {
    if names.iter().any(|n| n == query) {
        return Ok(query.to_string());
    }
    let cands: Vec<&String> = names.iter().filter(|n| n.starts_with(query)).collect();
    match cands.len() {
        1 => Ok(cands[0].clone()),
        0 => Err(format!(
            "no action matches {query:?}\ndeclared actions: {}",
            if names.is_empty() {
                "(none)".to_string()
            } else {
                names.join(", ")
            }
        )),
        _ => Err(format!(
            "{query:?} is ambiguous — matches: {}",
            cands.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(", ")
        )),
    }
}

pub fn run(
    ctx: &Ctx,
    action: Option<&str>,
    command: Option<&str>,
    prompt: Option<&str>,
    project: Option<&str>,
    as_json: bool,
) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let file_name = resolve_or_infer(ctx, project)?;
    let p = config::resolve_project(ctx, &file_name).map_err(RunError::Internal)?;

    let mut line = format!("run_task {}", quote_arg(&file_name));
    let mut action_name: Option<String> = None;
    let mut command_str: Option<String> = None;
    match (action, command) {
        (Some(_), Some(_)) => {
            return Err(RunError::NotFound(
                "run takes exactly one of <action> / --command".into(),
            ))
        }
        (None, None) => {
            return Err(RunError::NotFound(
                "run needs an action name or --command <cmd>".into(),
            ))
        }
        (Some(a), None) => {
            let names: Vec<String> = p.actions.iter().map(|x| x.name.clone()).collect();
            let resolved = select_action(&names, a).map_err(RunError::NotFound)?;
            line.push_str(&format!(" --action={}", quote_arg(&resolved)));
            action_name = Some(resolved);
        }
        (None, Some(c)) => {
            line.push_str(&format!(" --command={}", quote_arg(c)));
            command_str = Some(c.to_string());
        }
    }
    if let Some(pr) = prompt.filter(|p| !p.trim().is_empty()) {
        line.push_str(&format!(" --prompt={}", quote_arg(pr)));
    }

    control::send_command(ctx, &line)?;

    if as_json {
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({
                "ok": true,
                "project": file_name,
                "action": action_name,
                "command": command_str,
                "prompt": prompt,
            }))
            .unwrap_or_else(|_| "{}".into())
        );
    } else {
        let what = action_name
            .as_deref()
            .map(|a| format!("action {a}"))
            .or_else(|| command_str.as_deref().map(|c| format!("command {c:?}")))
            .unwrap_or_default();
        println!("queued {what} in {file_name}");
        eprintln!(
            "note: fire-and-forget — the task runs in a new terminal in the app; \
watch it with `lpm logs` / `lpm status`"
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn selects_action_exact_then_prefix() {
        let a = names(&["release", "run-website", "mobile"]);
        assert_eq!(select_action(&a, "release").unwrap(), "release");
        assert_eq!(select_action(&a, "run-w").unwrap(), "run-website");
    }

    #[test]
    fn unknown_and_ambiguous_are_errors() {
        let a = names(&["build", "build-fast"]);
        assert!(select_action(&a, "zzz").is_err());
        assert!(select_action(&a, "build-f").is_ok()); // unambiguous prefix
        assert!(select_action(&a, "build").is_ok()); // exact wins over prefix
        assert!(select_action(&a, "bui").is_err()); // ambiguous
    }
}
