//! `lpm list [--json]` — every project with its running state, service counts,
//! and live agent-status summary. One broken project yml degrades to an error
//! row rather than failing the whole listing.

use crate::config::{self, Ctx};
use crate::error::RunError;
use crate::service::service_status;
use crate::statussock::{self, StatusEntry};
use crate::style::Style;
use crate::tmux;
use crate::util::{print_json, shorten_home};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::io::IsTerminal;

struct Row {
    name: String,
    label: String,
    root: String,
    is_remote: bool,
    parent_name: String,
    running: bool,
    services_running: usize,
    services_total: usize,
    /// value -> count, or None when the status socket is unreachable.
    agents: Option<BTreeMap<String, usize>>,
    error: Option<String>,
}

/// Tally agent-status entries by their value (e.g. {"Running":2,"Waiting":1}).
fn count_by_value(entries: &[StatusEntry]) -> BTreeMap<String, usize> {
    let mut counts = BTreeMap::new();
    for e in entries {
        *counts.entry(e.value.clone()).or_insert(0) += 1;
    }
    counts
}

pub fn run(ctx: &Ctx, as_json: bool) -> Result<(), RunError> {
    let names = config::project_names(ctx);
    let sessions = tmux::running_sessions();

    let mut rows = Vec::with_capacity(names.len());
    for name in &names {
        match config::resolve_project(ctx, name) {
            Ok(p) => {
                let running = sessions.contains(&p.session);
                let services_total = p.services.len();
                let services_running = p
                    .services
                    .iter()
                    .filter(|s| service_status(s.port, running).running)
                    .count();
                let agents = statussock::list_status(&ctx.socket_path(), name)
                    .map(|entries| count_by_value(&entries));
                rows.push(Row {
                    name: name.clone(),
                    label: p.label,
                    root: p.root,
                    is_remote: p.is_remote,
                    parent_name: p.parent_name,
                    running,
                    services_running,
                    services_total,
                    agents,
                    error: None,
                });
            }
            Err(e) => rows.push(Row {
                name: name.clone(),
                label: String::new(),
                root: String::new(),
                is_remote: false,
                parent_name: String::new(),
                running: false,
                services_running: 0,
                services_total: 0,
                agents: None,
                error: Some(e),
            }),
        }
    }

    if as_json {
        print_json(&render_json(&rows));
    } else {
        let style = Style {
            on: std::io::stdout().is_terminal(),
        };
        print!("{}", render_human(&style, &rows));
    }
    Ok(())
}

fn render_json(rows: &[Row]) -> Value {
    let projects: Vec<Value> = rows
        .iter()
        .map(|r| {
            let agents = match &r.agents {
                Some(m) => json!(m),
                None => Value::Null,
            };
            json!({
                "name": r.name,
                "label": r.label,
                "root": r.root,
                "isRemote": r.is_remote,
                "parentName": r.parent_name,
                "running": r.running,
                "servicesRunning": r.services_running,
                "servicesTotal": r.services_total,
                "agents": agents,
                "error": r.error,
            })
        })
        .collect();
    json!({ "projects": projects })
}

fn agent_summary(agents: &BTreeMap<String, usize>) -> String {
    agents
        .iter()
        .map(|(value, n)| format!("{n} {}", value.to_lowercase()))
        .collect::<Vec<_>>()
        .join(", ")
}

fn render_human(s: &Style, rows: &[Row]) -> String {
    if rows.is_empty() {
        return format!("{}\n", s.dim("no projects found in ~/.lpm/projects"));
    }
    let mut o = String::new();
    for r in rows {
        if r.error.is_some() {
            o.push_str(&format!(
                "{} {}  {}\n",
                s.dim("○"),
                s.bold(&r.name),
                s.dim("(config error)")
            ));
            continue;
        }
        let mut parts = vec![
            if r.running { s.green("●") } else { s.dim("○") },
            s.bold(&r.name),
        ];
        if !r.label.is_empty() && r.label != r.name {
            parts.push(s.dim(&r.label));
        }
        if r.services_total > 0 {
            parts.push(format!("{}/{} services", r.services_running, r.services_total));
        }
        if let Some(agents) = &r.agents {
            if !agents.is_empty() {
                parts.push(format!("agents: {}", agent_summary(agents)));
            }
        }
        if r.is_remote {
            parts.push(s.dim("remote"));
        }
        if !r.root.is_empty() {
            parts.push(s.dim(&shorten_home(&r.root)));
        }
        o.push_str(&format!("{}\n", parts.join("  ")));
    }
    o
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(value: &str) -> StatusEntry {
        StatusEntry {
            key: "pane".into(),
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
    fn counts_statuses_by_value() {
        let entries = [entry("Running"), entry("Waiting"), entry("Running")];
        let counts = count_by_value(&entries);
        assert_eq!(counts.get("Running"), Some(&2));
        assert_eq!(counts.get("Waiting"), Some(&1));
        assert_eq!(counts.get("Done"), None);
    }

    #[test]
    fn agent_summary_is_compact_and_sorted() {
        let counts = count_by_value(&[entry("Waiting"), entry("Running"), entry("Running")]);
        assert_eq!(agent_summary(&counts), "2 running, 1 waiting");
    }
}
