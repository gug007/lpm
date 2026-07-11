//! `lpm status [project] [--json]` — live agent status across projects. A `ping`
//! to the app's status socket distinguishes "app not running" from "app running,
//! no active agents", which `list_status` alone cannot.

use crate::config::{self, Ctx};
use crate::error::{resolve_error, RunError};
use crate::statussock::{self, StatusEntry};
use crate::style::{status_value, Style};
use crate::util::{now_millis, print_json, relative};
use serde_json::{json, Value};
use std::io::IsTerminal;

pub fn run(ctx: &Ctx, project: Option<&str>, as_json: bool) -> Result<(), RunError> {
    if !statussock::ping(&ctx.socket_path()) {
        if as_json {
            print_json(&json!({ "appReachable": false, "projects": [] }));
        } else {
            println!("lpm app is not running — no live status.");
        }
        return Ok(());
    }

    let single = project.is_some();
    let requested = match project {
        Some(q) => vec![config::resolve_project_name(ctx, q).map_err(resolve_error)?],
        None => config::project_names(ctx),
    };

    let mut groups: Vec<(String, Vec<StatusEntry>)> = Vec::new();
    for name in &requested {
        let entries = statussock::list_status(&ctx.socket_path(), name).unwrap_or_default();
        if entries.is_empty() && !single {
            continue;
        }
        groups.push((name.clone(), entries));
    }

    if as_json {
        print_json(&render_json(&groups));
        return Ok(());
    }

    let style = Style {
        on: std::io::stdout().is_terminal(),
    };

    if single && groups[0].1.is_empty() {
        println!("no live status for {}", groups[0].0);
        return Ok(());
    }
    if groups.is_empty() {
        println!("no live status.");
        return Ok(());
    }
    print!("{}", render_human(&style, &groups));
    Ok(())
}

fn render_json(groups: &[(String, Vec<StatusEntry>)]) -> Value {
    let now = now_millis();
    let projects: Vec<Value> = groups
        .iter()
        .map(|(name, entries)| {
            json!({
                "name": name,
                "statuses": entries.iter().map(|e| json!({
                    "key": e.key,
                    "value": e.value,
                    "icon": e.icon,
                    "color": e.color,
                    "priority": e.priority,
                    "timestamp": e.timestamp,
                    "timestampRelative": relative(e.timestamp, now),
                    "paneID": e.pane_id,
                })).collect::<Vec<_>>(),
            })
        })
        .collect();
    json!({ "appReachable": true, "projects": projects })
}

fn render_human(s: &Style, groups: &[(String, Vec<StatusEntry>)]) -> String {
    let now = now_millis();
    let mut o = String::new();
    for (name, entries) in groups {
        o.push_str(&format!("{}\n", s.bold(name)));
        if entries.is_empty() {
            o.push_str(&format!("  {}\n", s.dim("(no active agents)")));
            continue;
        }
        for e in entries {
            let pane = if e.pane_id.is_empty() {
                String::new()
            } else {
                s.dim(&format!("[{}]", e.pane_id))
            };
            o.push_str(&format!(
                "  {} {}  {}  {}\n",
                status_value(s, &e.value),
                s.bold(&e.key),
                pane,
                s.dim(&relative(e.timestamp, now)),
            ));
        }
    }
    o
}
