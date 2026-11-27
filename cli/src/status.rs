//! `lpm status [project] [--json]` — live agent status across projects. A `ping`
//! to the app's status socket distinguishes "app not running" from "app running,
//! no active agents", which `list_status` alone cannot.

use crate::config::{self, Ctx};
use crate::error::{resolve_status_target, RunError};
use crate::statussock::{self, StatusEntry};
use crate::style::{status_value, Style};
use crate::util::{now_millis, print_json, relative};
use serde_json::{json, Value};
use std::io::IsTerminal;

/// How a Running turn that waits on background shells reads: it is idle until
/// one ends, the user prompts, or the user marks it finished in the app.
const PAUSED: &str = "Paused";

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
        Some(q) => vec![resolve_status_target(ctx, Some(q))?],
        None => {
            let mut names = config::project_names(ctx);
            names.push(config::GLOBAL_TERMINALS.to_string());
            names
        }
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
        println!("no live status for {}", config::status_group_label(&groups[0].0));
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
                "statuses": entries.iter().map(|e| {
                    let mut status = json!({
                        "key": e.key,
                        "value": e.value,
                        "icon": e.icon,
                        "color": e.color,
                        "priority": e.priority,
                        "timestamp": e.timestamp,
                        "timestampRelative": relative(e.timestamp, now),
                        "paneID": e.pane_id,
                    });
                    e.add_pause(&mut status);
                    status
                }).collect::<Vec<_>>(),
            })
        })
        .collect();
    json!({ "appReachable": true, "projects": projects })
}

fn render_human(s: &Style, groups: &[(String, Vec<StatusEntry>)]) -> String {
    let now = now_millis();
    let mut o = String::new();
    for (name, entries) in groups {
        o.push_str(&format!("{}\n", s.bold(config::status_group_label(name))));
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
            let (value, since) = if e.paused() {
                (s.magenta(PAUSED), e.paused_at)
            } else {
                (status_value(s, &e.value), e.timestamp)
            };
            o.push_str(&format!(
                "  {} {}  {}  {}\n",
                value,
                s.bold(&e.key),
                pane,
                s.dim(&relative(since, now)),
            ));
            if e.paused() {
                o.push_str(&format!(
                    "    {}\n",
                    s.dim(&format!("waiting on: {}", e.shells.join(" · ")))
                ));
            }
        }
    }
    o
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(value: &str, paused_at: i64, shells: &[&str]) -> StatusEntry {
        StatusEntry {
            key: "claude_code_s1".into(),
            value: value.into(),
            icon: String::new(),
            color: String::new(),
            priority: 0,
            timestamp: now_millis(),
            agent_pid: 0,
            pane_id: "lpm-1".into(),
            paused_at,
            shells: shells.iter().map(|s| s.to_string()).collect(),
        }
    }

    #[test]
    fn a_turn_waiting_on_shells_reads_as_paused_with_what_it_waits_on() {
        let groups = vec![(
            "web".to_string(),
            vec![entry("Running", now_millis(), &["Run the test suite"])],
        )];
        let out = render_human(&Style { on: false }, &groups);
        assert!(out.contains("  Paused claude_code_s1"), "{out}");
        assert!(out.contains("waiting on: Run the test suite"), "{out}");
        let json = render_json(&groups);
        let status = &json["projects"][0]["statuses"][0];
        assert_eq!(status["value"], "Running");
        assert_eq!(status["shells"][0], "Run the test suite");
        assert!(status["pausedAt"].as_i64().unwrap() > 0);
    }

    #[test]
    fn a_working_turn_is_left_as_it_was() {
        let groups = vec![("web".to_string(), vec![entry("Running", 0, &[])])];
        let out = render_human(&Style { on: false }, &groups);
        assert!(out.contains("  Running claude_code_s1"), "{out}");
        assert!(!out.contains("waiting on"));
        let json = render_json(&groups);
        assert!(json["projects"][0]["statuses"][0].get("pausedAt").is_none());
    }
}
