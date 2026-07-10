//! `lpm project <name>` — gather and render everything about one project.

use crate::config::{self, Ctx, ResolvedAction, ResolvedProject};
use crate::statussock::{self, StatusEntry};
use crate::terminals::{self, HistoryEntry};
use crate::tmux::{self, Pane};
use serde_json::{json, Value};
use std::io::IsTerminal;
use std::net::TcpListener;
use std::time::{SystemTime, UNIX_EPOCH};

const HISTORY_LIMIT: usize = 10;

/// Exit-coded error for the CLI. `NotFound`/usage -> 2, everything else -> 1.
pub enum RunError {
    NotFound(String),
    Internal(String),
}

impl RunError {
    pub fn code(&self) -> i32 {
        match self {
            RunError::NotFound(_) => 2,
            RunError::Internal(_) => 1,
        }
    }
    pub fn message(&self) -> &str {
        match self {
            RunError::NotFound(m) | RunError::Internal(m) => m,
        }
    }
}

/// Whether something is currently listening on a local TCP port. Mirrors the
/// app's `ports::can_bind` probe: a failed bind means the port is taken.
fn port_listening(port: i64) -> Option<bool> {
    if port <= 0 || port > 65535 {
        return None;
    }
    Some(TcpListener::bind(("127.0.0.1", port as u16)).is_err())
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Human relative time for a past unix-millis timestamp, e.g. "3m ago".
fn relative(ts_ms: i64, now_ms: i64) -> String {
    if ts_ms <= 0 {
        return "unknown".into();
    }
    let secs = (now_ms - ts_ms) / 1000;
    if secs < 0 {
        return "in the future".into();
    }
    if secs < 10 {
        return "just now".into();
    }
    let (n, unit) = if secs < 60 {
        (secs, "s")
    } else if secs < 3600 {
        (secs / 60, "m")
    } else if secs < 86_400 {
        (secs / 3600, "h")
    } else if secs < 2_592_000 {
        (secs / 86_400, "d")
    } else if secs < 31_536_000 {
        (secs / 2_592_000, "mo")
    } else {
        (secs / 31_536_000, "y")
    };
    format!("{n}{unit} ago")
}

/// Running verdict for one service.
struct ServiceStatus {
    running: bool,
    /// "port" (from a listen probe), "session" (portless, inferred from the
    /// tmux session), or "stopped".
    source: &'static str,
    port_listening: Option<bool>,
}

fn service_status(port: i64, session_running: bool) -> ServiceStatus {
    match port_listening(port) {
        Some(listening) => ServiceStatus {
            running: listening,
            source: "port",
            port_listening: Some(listening),
        },
        None => ServiceStatus {
            running: session_running,
            source: if session_running {
                "session"
            } else {
                "stopped"
            },
            port_listening: None,
        },
    }
}

// ---- ANSI helpers -----------------------------------------------------------

struct Style {
    on: bool,
}

impl Style {
    fn paint(&self, code: &str, s: &str) -> String {
        if self.on {
            format!("\x1b[{code}m{s}\x1b[0m")
        } else {
            s.to_string()
        }
    }
    fn bold(&self, s: &str) -> String {
        self.paint("1", s)
    }
    fn dim(&self, s: &str) -> String {
        self.paint("2", s)
    }
    fn green(&self, s: &str) -> String {
        self.paint("32", s)
    }
    fn red(&self, s: &str) -> String {
        self.paint("31", s)
    }
    fn cyan(&self, s: &str) -> String {
        self.paint("36", s)
    }
    fn yellow(&self, s: &str) -> String {
        self.paint("33", s)
    }
}

// ---- entrypoint -------------------------------------------------------------

pub fn run(ctx: &Ctx, name: &str, as_json: bool) -> Result<(), RunError> {
    let file_name = match config::resolve_project_name(ctx, name) {
        Ok(f) => f,
        Err(config::ResolveError::NotFound { query, available }) => {
            let list = if available.is_empty() {
                "no projects found in ~/.lpm/projects".to_string()
            } else {
                format!("available projects: {}", available.join(", "))
            };
            return Err(RunError::NotFound(format!(
                "no project matches {query:?}\n{list}"
            )));
        }
        Err(config::ResolveError::Ambiguous { query, candidates }) => {
            return Err(RunError::NotFound(format!(
                "{query:?} is ambiguous — matches: {}",
                candidates.join(", ")
            )));
        }
    };

    let project = config::resolve_project(ctx, &file_name).map_err(RunError::Internal)?;

    // Live state.
    let session_running = tmux::session_exists(&project.session);
    let panes = if session_running {
        tmux::list_panes(&project.session)
    } else {
        Vec::new()
    };
    let hist = terminals::history(&ctx.terminals_path(), &project.file_name, HISTORY_LIMIT);
    // Status is keyed by LPM_PROJECT_NAME == the project file-name stem.
    let status = statussock::list_status(&ctx.socket_path(), &project.file_name);

    if as_json {
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
            render_human(
                &style,
                &project,
                session_running,
                &panes,
                &hist,
                status.as_deref()
            )
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
    hist: &[HistoryEntry],
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
    if !hist.is_empty() {
        o.push_str(&format!("  {}\n", s.dim("recent history:")));
        for h in hist {
            let label = if h.label.is_empty() {
                h.action_name.clone()
            } else {
                h.label.clone()
            };
            o.push_str(&format!(
                "    {}  {}  {}\n",
                s.yellow(&label),
                s.dim(&format!("[{}]", h.action_name)),
                s.dim(&relative(h.closed_at, now)),
            ));
            if !h.resume_cmd.is_empty() {
                o.push_str(&format!("      {} {}\n", s.dim("resume"), h.resume_cmd));
            }
        }
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
    fn relative_buckets() {
        let now = 1_000_000_000;
        assert_eq!(relative(now, now), "just now");
        assert_eq!(relative(now - 30_000, now), "30s ago");
        assert_eq!(relative(now - 5 * 60_000, now), "5m ago");
        assert_eq!(relative(now - 3 * 3_600_000, now), "3h ago");
        assert_eq!(relative(now - 2 * 86_400_000, now), "2d ago");
        assert_eq!(relative(0, now), "unknown");
    }

    #[test]
    fn portless_service_follows_session() {
        assert!(service_status(0, true).running);
        assert!(!service_status(0, false).running);
        assert_eq!(service_status(0, true).source, "session");
    }
}
