//! `lpm project <name>` — gather and render everything about one project.

use crate::config::{self, Ctx, ResolvedAction, ResolvedProject};
use crate::error::{resolve_or_infer, RunError};
use crate::service::service_status;
use crate::statussock::{self, StatusEntry};
use crate::style::Style;
use crate::terminals::{self, HistoryEntry};
use crate::tmux::{self, Pane};
use crate::util::{now_millis, relative};
use serde_json::{json, Value};
use std::io::IsTerminal;

const HISTORY_LIMIT: usize = 10;

// ---- entrypoint -------------------------------------------------------------

pub fn run(ctx: &Ctx, name: Option<&str>, as_json: bool) -> Result<(), RunError> {
    let file_name = resolve_or_infer(ctx, name)?;

    let project = config::resolve_project(ctx, &file_name).map_err(RunError::Internal)?;

    // Live state.
    let session_running = tmux::session_exists(&project.session);
    let panes = if session_running {
        tmux::list_panes(&project.session)
    } else {
        Vec::new()
    };
    // Status is keyed by LPM_PROJECT_NAME == the project file-name stem.
    let status = statussock::list_status(&ctx.socket_path(), &project.file_name);

    if as_json {
        let hist = terminals::history(&ctx.terminals_path(), &project.file_name, HISTORY_LIMIT);
        print!(
            "{}",
            render_json(&project, session_running, &panes, &hist, status.as_deref())
        );
    } else {
        let style = Style {
            on: std::io::stdout().is_terminal(),
        };
        print!(
            "{}",
            render_human(&style, &project, session_running, &panes, status.as_deref())
        );
    }
    Ok(())
}

// ---- JSON rendering ---------------------------------------------------------

fn action_json(a: &ResolvedAction) -> Value {
    json!({
        "name": a.name,
        "label": a.label,
        "emoji": a.emoji,
        "shortcut": a.shortcut,
        "cmd": a.cmd,
        "cwd": a.cwd,
        "ports": a.ports,
        "type": a.kind,
        "display": a.display,
        "confirm": a.confirm,
        "reuse": a.reuse,
        "position": a.position,
        "env": a.env,
        "children": a.children.iter().map(action_json).collect::<Vec<_>>(),
    })
}

fn render_json(
    p: &ResolvedProject,
    session_running: bool,
    panes: &[Pane],
    hist: &[HistoryEntry],
    status: Option<&[StatusEntry]>,
) -> String {
    let now = now_millis();

    let services: Vec<Value> = p
        .services
        .iter()
        .map(|s| {
            let st = service_status(s.port, session_running);
            json!({
                "name": s.name,
                "cmd": s.cmd,
                "cwd": s.cwd,
                "cwdResolved": config::resolve_cwd(&p.root, &s.cwd),
                "port": s.port,
                "portConflict": s.port_conflict,
                "env": s.env,
                "running": st.running,
                "runningSource": st.source,
                "portListening": st.port_listening,
            })
        })
        .collect();

    let panes_json: Vec<Value> = panes
        .iter()
        .map(|pane| {
            json!({
                "id": pane.id,
                "pid": pane.pid,
                "currentCommand": pane.current_command,
                "currentPath": pane.current_path,
                "title": pane.title,
            })
        })
        .collect();

    let history_json: Vec<Value> = hist
        .iter()
        .map(|h| {
            json!({
                "actionName": h.action_name,
                "label": h.label,
                "closedAt": h.closed_at,
                "closedRelative": relative(h.closed_at, now),
                "resumeCmd": h.resume_cmd,
                "startCmd": h.start_cmd,
            })
        })
        .collect();

    let agent_status = match status {
        None => Value::Null,
        Some(entries) => Value::Array(
            entries
                .iter()
                .map(|e| {
                    json!({
                        "key": e.key,
                        "value": e.value,
                        "icon": e.icon,
                        "color": e.color,
                        "priority": e.priority,
                        "timestamp": e.timestamp,
                        "timestampRelative": relative(e.timestamp, now),
                        "agentPID": e.agent_pid,
                        "paneID": e.pane_id,
                    })
                })
                .collect(),
        ),
    };

    let out = json!({
        "name": p.file_name,
        "session": p.session,
        "label": p.label,
        "root": p.root,
        "isRemote": p.is_remote,
        "parentName": p.parent_name,
        "running": session_running,
        "panes": panes_json,
        "services": services,
        "profiles": p.profiles.iter().map(|(k, v)| json!({"name": k, "services": v})).collect::<Vec<_>>(),
        "terminals": p.terminals.iter().map(action_json).collect::<Vec<_>>(),
        "terminalHistory": history_json,
        "actions": p.actions.iter().map(action_json).collect::<Vec<_>>(),
        "agentStatus": agent_status,
    });
    format!(
        "{}\n",
        serde_json::to_string_pretty(&out).unwrap_or_else(|_| "{}".into())
    )
}

// ---- human rendering --------------------------------------------------------

fn render_human(
    s: &Style,
    p: &ResolvedProject,
    session_running: bool,
    panes: &[Pane],
    status: Option<&[StatusEntry]>,
) -> String {
    let now = now_millis();
    let mut o = String::new();

    // ---- header ----
    let title = if p.label.is_empty() {
        p.file_name.clone()
    } else {
        format!("{} ({})", p.label, p.file_name)
    };
    o.push_str(&format!("{}\n", s.bold(&title)));
    if p.session != p.file_name {
        o.push_str(&format!("  {}   {}\n", s.dim("session"), p.session));
    }
    o.push_str(&format!(
        "  {}      {}\n",
        s.dim("root"),
        if p.root.is_empty() { "—" } else { &p.root }
    ));
    if p.is_remote {
        o.push_str(&format!("  {}    {}\n", s.dim("remote"), "yes"));
    }
    if !p.parent_name.is_empty() {
        o.push_str(&format!("  {}   {}\n", s.dim("parent"), p.parent_name));
    }
    let run_label = if session_running {
        s.green(&format!(
            "running ({} pane{})",
            panes.len(),
            if panes.len() == 1 { "" } else { "s" }
        ))
    } else {
        s.dim("stopped")
    };
    o.push_str(&format!("  {}   {}\n", s.dim("status"), run_label));
    for pane in panes {
        let cmd = if pane.current_command.is_empty() {
            "—"
        } else {
            &pane.current_command
        };
        o.push_str(&format!(
            "    {} {}  {}\n",
            s.cyan(&pane.id),
            s.dim(&format!("pid {}", pane.pid)),
            cmd,
        ));
    }

    // ---- services ----
    o.push_str(&format!("\n{}\n", s.bold("Services")));
    if p.services.is_empty() {
        o.push_str(&format!("  {}\n", s.dim("(none)")));
    }
    for svc in &p.services {
        let st = service_status(svc.port, session_running);
        let badge = if st.running {
            s.green("● running")
        } else {
            s.red("○ stopped")
        };
        let port = if svc.port > 0 {
            format!(":{}", svc.port)
        } else {
            String::new()
        };
        o.push_str(&format!(
            "  {} {}{}\n",
            badge,
            s.bold(&svc.name),
            s.dim(&port)
        ));
        if !svc.cmd.is_empty() {
            o.push_str(&format!("      {} {}\n", s.dim("cmd"), svc.cmd));
        }
        let cwd = config::resolve_cwd(&p.root, &svc.cwd);
        if !cwd.is_empty() {
            o.push_str(&format!("      {} {}\n", s.dim("cwd"), cwd));
        }
        if st.source == "session" {
            o.push_str(&format!(
                "      {}\n",
                s.dim("(no port declared — inferred from tmux session)")
            ));
        }
    }

    // ---- terminals ----
    o.push_str(&format!("\n{}\n", s.bold("Terminals")));
    if p.terminals.is_empty() {
        o.push_str(&format!("  {}\n", s.dim("(none configured)")));
    }
    for t in &p.terminals {
        render_action_line(s, &mut o, t, 1);
    }

    // ---- actions ----
    o.push_str(&format!("\n{}\n", s.bold("Actions")));
    if p.actions.is_empty() {
        o.push_str(&format!("  {}\n", s.dim("(none configured)")));
    }
    for a in &p.actions {
        render_action_line(s, &mut o, a, 1);
    }

    // ---- agent status ----
    o.push_str(&format!("\n{}\n", s.bold("Agent status")));
    match status {
        None => o.push_str(&format!(
            "  {}\n",
            s.dim("app not running — no live status")
        )),
        Some([]) => o.push_str(&format!("  {}\n", s.dim("(no active agents)"))),
        Some(entries) => {
            for e in entries {
                o.push_str(&format!(
                    "  {} {}  {}  {}\n",
                    status_badge(s, &e.value),
                    s.bold(&e.key),
                    if e.pane_id.is_empty() {
                        String::new()
                    } else {
                        s.dim(&format!("[{}]", e.pane_id))
                    },
                    s.dim(&relative(e.timestamp, now)),
                ));
            }
        }
    }

    o
}

fn status_badge(s: &Style, value: &str) -> String {
    match value {
        "Running" => s.cyan("● Running"),
        "Done" => s.green("● Done"),
        "Waiting" => s.yellow("● Waiting"),
        "Error" => s.red("● Error"),
        other => other.to_string(),
    }
}

fn render_action_line(s: &Style, o: &mut String, a: &ResolvedAction, depth: usize) {
    let indent = "  ".repeat(depth);
    let mut meta: Vec<String> = Vec::new();
    if !a.kind.is_empty() {
        meta.push(a.kind.clone());
    }
    if !a.display.is_empty() {
        meta.push(a.display.clone());
    }
    if let Some(pos) = a.position {
        meta.push(format!("pos {}", trim_float(pos)));
    }
    if !a.ports.is_empty() {
        meta.push(format!(
            "port {}",
            a.ports
                .iter()
                .map(|p| p.to_string())
                .collect::<Vec<_>>()
                .join(",")
        ));
    }
    let head = if a.emoji.is_empty() {
        a.label.clone()
    } else {
        format!("{} {}", a.emoji, a.label)
    };
    let meta_str = if meta.is_empty() {
        String::new()
    } else {
        format!("  {}", s.dim(&format!("({})", meta.join(", "))))
    };
    o.push_str(&format!("{}{}{}\n", indent, s.bold(&head), meta_str));
    if !a.cmd.is_empty() {
        o.push_str(&format!("{}  {} {}\n", indent, s.dim("cmd"), a.cmd));
    }
    for c in &a.children {
        render_action_line(s, o, c, depth + 1);
    }
}

fn trim_float(f: f64) -> String {
    if f.fract() == 0.0 {
        format!("{}", f as i64)
    } else {
        format!("{f}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn human_output_omits_recent_history() {
        let project = ResolvedProject {
            file_name: "lpm".into(),
            session: "lpm".into(),
            root: "/tmp/lpm".into(),
            label: String::new(),
            is_remote: false,
            parent_name: String::new(),
            services: Vec::new(),
            profiles: Default::default(),
            terminals: Vec::new(),
            actions: Vec::new(),
        };

        let output = render_human(&Style { on: false }, &project, false, &[], None);

        assert!(!output.contains("recent history:"));
    }
}
