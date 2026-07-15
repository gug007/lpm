//! `lpm project <name>` — gather and render everything about one project.

use crate::config::{self, Ctx, ResolvedAction, ResolvedProject};
use crate::error::{resolve_or_infer, RunError};
use crate::service::service_status;
use crate::statussock::{self, StatusEntry};
use crate::style::Style;
use crate::terminals::{self, HistoryEntry};
use crate::tmux::{self, Pane};
use crate::util::{now_millis, print_json, relative};
use serde_json::{json, Value};
use std::io::IsTerminal;

const HISTORY_LIMIT: usize = 10;

// ---- entrypoint -------------------------------------------------------------

pub fn run(ctx: &Ctx, name: Option<&str>, as_json: bool, full: bool) -> Result<(), RunError> {
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
        // The heavy terminal history is only fetched (and emitted) for --full.
        let hist = if full {
            terminals::history(&ctx.terminals_path(), &project.file_name, HISTORY_LIMIT)
        } else {
            Vec::new()
        };
        print_json(&render_json(
            &project,
            session_running,
            &panes,
            &hist,
            status.as_deref(),
            full,
        ));
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

/// Full action shape (every resolved field). Used with `--full`.
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

/// Lean action shape: just what an agent needs to identify and run an entry.
fn lean_action_json(a: &ResolvedAction) -> Value {
    json!({
        "name": a.name,
        "label": a.label,
        "type": a.kind,
        "cmd": a.cmd,
        "children": a.children.iter().map(lean_action_json).collect::<Vec<_>>(),
    })
}

fn render_json(
    p: &ResolvedProject,
    session_running: bool,
    panes: &[Pane],
    hist: &[HistoryEntry],
    status: Option<&[StatusEntry]>,
    full: bool,
) -> Value {
    let now = now_millis();

    let services: Vec<Value> = p
        .services
        .iter()
        .map(|s| {
            let st = service_status(s.port, session_running);
            let mut o = json!({
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
            });
            // env is the heaviest per-service field; drop it in the lean view.
            if !full {
                o.as_object_mut().unwrap().remove("env");
            }
            o
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

    let map_action = |a: &ResolvedAction| {
        if full {
            action_json(a)
        } else {
            lean_action_json(a)
        }
    };
    let mut out = json!({
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
        "terminals": p.terminals.iter().map(&map_action).collect::<Vec<_>>(),
        "actions": p.actions.iter().map(&map_action).collect::<Vec<_>>(),
        "agentStatus": agent_status,
    });
    // terminalHistory is a --full-only field.
    if full {
        out.as_object_mut()
            .unwrap()
            .insert("terminalHistory".into(), Value::Array(history_json));
    }
    out
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
        render_action_line(s, &mut o, t, 1, "");
    }

    // ---- actions ----
    o.push_str(&format!("\n{}\n", s.bold("Actions")));
    if p.actions.is_empty() {
        o.push_str(&format!("  {}\n", s.dim("(none configured)")));
    }
    for a in &p.actions {
        render_action_line(s, &mut o, a, 1, "");
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

fn render_action_line(s: &Style, o: &mut String, a: &ResolvedAction, depth: usize, prefix: &str) {
    let indent = "  ".repeat(depth);
    let id = if prefix.is_empty() {
        a.name.clone()
    } else {
        format!("{prefix}:{}", a.name)
    };
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
    o.push_str(&format!(
        "{}{}{}  {}\n",
        indent,
        s.bold(&head),
        meta_str,
        s.dim(&format!("· run: {id}"))
    ));
    if !a.cmd.is_empty() {
        o.push_str(&format!("{}  {} {}\n", indent, s.dim("cmd"), a.cmd));
    }
    for c in &a.children {
        render_action_line(s, o, c, depth + 1, &id);
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

    fn empty_project() -> ResolvedProject {
        ResolvedProject {
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
        }
    }

    #[test]
    fn human_output_omits_recent_history() {
        let output = render_human(&Style { on: false }, &empty_project(), false, &[], None);
        assert!(!output.contains("recent history:"));
    }

    fn sample_action() -> ResolvedAction {
        let child = ResolvedAction {
            name: "child".into(),
            label: "Child".into(),
            emoji: String::new(),
            shortcut: String::new(),
            cmd: "echo child".into(),
            cwd: String::new(),
            ports: Vec::new(),
            kind: "terminal".into(),
            display: "header".into(),
            confirm: false,
            reuse: false,
            position: None,
            env: Default::default(),
            children: Vec::new(),
        };
        ResolvedAction {
            name: "deploy".into(),
            label: "Deploy".into(),
            emoji: "🚀".into(),
            shortcut: "d".into(),
            cmd: "./deploy.sh".into(),
            cwd: "backend".into(),
            ports: vec![3000],
            kind: "background".into(),
            display: "header".into(),
            confirm: true,
            reuse: false,
            position: Some(1.0),
            env: [("K".to_string(), "V".to_string())].into_iter().collect(),
            children: vec![child],
        }
    }

    fn project_with_content() -> ResolvedProject {
        let mut p = empty_project();
        p.services = vec![crate::config::ResolvedService {
            name: "web".into(),
            cmd: "npm run dev".into(),
            cwd: String::new(),
            port: 3000,
            port_conflict: String::new(),
            env: [("SECRET".to_string(), "x".to_string())].into_iter().collect(),
            depends_on: Vec::new(),
        }];
        p.actions = vec![sample_action()];
        p
    }

    fn hist() -> Vec<HistoryEntry> {
        vec![HistoryEntry {
            action_name: "a".into(),
            closed_at: 1,
            label: "A".into(),
            resume_cmd: String::new(),
            start_cmd: String::new(),
        }]
    }

    #[test]
    fn human_output_prints_composite_run_ids() {
        let p = project_with_content();
        let output = render_human(&Style { on: false }, &p, false, &[], None);
        assert!(output.contains("· run: deploy"));
        assert!(output.contains("· run: deploy:child"));
    }

    #[test]
    fn lean_json_drops_env_history_and_uses_lean_actions() {
        let p = project_with_content();
        let v = render_json(&p, false, &[], &hist(), None, false);
        assert!(v.get("terminalHistory").is_none());
        let svc = &v["services"][0];
        assert!(svc.get("env").is_none());
        let act = &v["actions"][0];
        assert_eq!(act["name"], "deploy");
        assert_eq!(act["type"], "background");
        // Lean actions carry only name/label/type/cmd/children.
        assert!(act.get("env").is_none());
        assert!(act.get("emoji").is_none());
        assert!(act.get("ports").is_none());
        assert_eq!(act["children"][0]["name"], "child");
        assert!(act["children"][0].get("env").is_none());
    }

    #[test]
    fn full_json_keeps_env_and_history() {
        let p = project_with_content();
        let v = render_json(&p, false, &[], &hist(), None, true);
        assert!(v.get("terminalHistory").is_some());
        assert!(v["services"][0].get("env").is_some());
        let act = &v["actions"][0];
        assert!(act.get("env").is_some());
        assert_eq!(act["emoji"], "🚀");
        assert_eq!(act["ports"][0], 3000);
    }
}
