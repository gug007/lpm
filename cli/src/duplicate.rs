//! `lpm duplicate [project] ...` — clone N throwaway copies via the running app,
//! optionally grouping them and queueing an action/command on each. Streams a
//! `created <name> (i/N)` line per copy as the app reports progress.

use crate::config::{self, Ctx};
use crate::control;
use crate::error::{resolve_or_infer, RunError};
use crate::statussock::{self, quote_arg};
use serde_json::{json, Value};

#[allow(clippy::too_many_arguments)]
pub fn run(
    ctx: &Ctx,
    project: Option<&str>,
    count: u32,
    group: Option<&str>,
    run_action: Option<&str>,
    run_command: Option<&str>,
    prompt: Option<&str>,
    exclude_uncommitted: bool,
    reinstall_deps: bool,
    no_pull: bool,
    as_json: bool,
) -> Result<(), RunError> {
    if prompt.is_some() && run_action.is_none() && run_command.is_none() {
        return Err(RunError::NotFound(
            "--prompt needs --run <action> or --command <cmd>".into(),
        ));
    }
    control::require_app(ctx)?;
    let file_name = resolve_or_infer(ctx, project)?;

    let mut line = format!(
        "duplicate_project {} --count={count}",
        quote_arg(&file_name)
    );
    if let Some(g) = group.filter(|g| !g.is_empty()) {
        line.push_str(&format!(" --group={}", quote_arg(g)));
    }
    if exclude_uncommitted {
        line.push_str(" --exclude-uncommitted=true");
    }
    if reinstall_deps {
        line.push_str(" --reinstall-deps=true");
    }
    if no_pull {
        line.push_str(" --pull-latest=false");
    }
    if let Some(a) = run_action {
        line.push_str(&format!(" --run-action={}", quote_arg(a)));
    }
    if let Some(c) = run_command {
        line.push_str(&format!(" --run-command={}", quote_arg(c)));
    }
    if let Some(p) = prompt {
        line.push_str(&format!(" --prompt={}", quote_arg(p)));
    }

    let final_line = statussock::request_lines(&ctx.socket_path(), &line, |payload| {
        if as_json {
            return;
        }
        // payload == "<done> <total> <name>"
        let mut it = payload.splitn(3, ' ');
        let done = it.next().unwrap_or("?");
        let _total = it.next();
        let name = it.next().unwrap_or("");
        println!("created {name} ({done}/{count})");
    })
    .map_err(RunError::Internal)?;

    let parsed: Value = serde_json::from_str(&final_line)
        .map_err(|e| RunError::Internal(format!("unexpected reply from app: {e}: {final_line}")))?;
    let ok = parsed.get("ok").and_then(Value::as_bool).unwrap_or(false);
    if !ok {
        let msg = parsed
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("duplicate failed");
        return Err(RunError::Internal(msg.to_string()));
    }
    let names: Vec<String> = parsed
        .get("names")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();
    let warning = parsed.get("warning").and_then(Value::as_str);

    let copies = build_copies(&names, |name| {
        config::resolve_project(ctx, name)
            .ok()
            .map(|p| p.root)
            .filter(|root| !root.is_empty())
    });

    if as_json {
        crate::util::print_json(&json!({
            "ok": true,
            "project": file_name,
            "names": names,
            "copies": copies
                .iter()
                .map(|(name, path)| json!({ "name": name, "path": path }))
                .collect::<Vec<_>>(),
            "group": group,
            "task": task_echo(run_action, run_command, prompt),
            "warning": warning,
        }));
    } else {
        println!(
            "duplicated {file_name} -> {}",
            if names.is_empty() {
                "(none)".to_string()
            } else {
                names.join(", ")
            }
        );
        for (name, path) in &copies {
            match path {
                Some(p) => println!("  {name}  {p}"),
                None => println!("  {name}"),
            }
        }
        if let Some(g) = group.filter(|g| !g.is_empty()) {
            println!("grouped under {g}");
        }
        if let Some(a) = run_action {
            println!("queued action {a} on each copy");
        } else if let Some(c) = run_command {
            println!("queued command {c:?} on each copy");
        }
    }

    // A warning means partial success (or copies made but no window to run on):
    // still exit 0, but surface it on stderr.
    if let Some(w) = warning {
        eprintln!("lpm: {w}");
    }
    Ok(())
}

fn task_echo(action: Option<&str>, command: Option<&str>, prompt: Option<&str>) -> Value {
    if let Some(a) = action {
        json!({ "kind": "action", "action": a, "prompt": prompt })
    } else if let Some(c) = command {
        json!({ "kind": "command", "command": c, "prompt": prompt })
    } else {
        Value::Null
    }
}

/// Pair each copy name with its resolved root directory (or `None` when the copy
/// can't be resolved). Pure: `resolve` isolates the config lookup for testing.
fn build_copies(
    names: &[String],
    resolve: impl Fn(&str) -> Option<String>,
) -> Vec<(String, Option<String>)> {
    names
        .iter()
        .map(|n| (n.clone(), resolve(n)))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_copies_pairs_names_with_resolved_paths() {
        let names = vec!["copyA".to_string(), "copyB".to_string()];
        let copies = build_copies(&names, |n| match n {
            "copyA" => Some("/root/a".to_string()),
            _ => None,
        });
        assert_eq!(
            copies,
            vec![
                ("copyA".to_string(), Some("/root/a".to_string())),
                ("copyB".to_string(), None),
            ]
        );
    }
}
