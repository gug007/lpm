//! `lpm ports [--computers] [--json]` — every TCP port this machine listens
//! on, with the lpm project and service holding it, as the app's Ports view
//! shows them. `--computers` adds each connected paired computer's ports.

use crate::config::Ctx;
use crate::control;
use crate::error::RunError;
use crate::style::Style;
use crate::util::{now_millis, print_json};
use serde_json::Value;
use std::io::IsTerminal;

pub fn run(ctx: &Ctx, computers: bool, as_json: bool) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let line = if computers {
        "list_ports --computers"
    } else {
        "list_ports"
    };
    let value = control::parse_json(&control::send_command(ctx, line)?)?;
    if as_json {
        print_json(&value);
    } else {
        let style = Style {
            on: std::io::stdout().is_terminal(),
        };
        print!("{}", render(&style, &value, now_millis() / 1000, computers));
    }
    Ok(())
}

fn text<'a>(row: &'a Value, key: &str) -> &'a str {
    row.get(key).and_then(Value::as_str).unwrap_or_default()
}

fn num(row: &Value, key: &str) -> i64 {
    row.get(key).and_then(Value::as_i64).unwrap_or(0)
}

fn uptime(started: i64, now: i64) -> String {
    if started <= 0 {
        return String::new();
    }
    let secs = (now - started).max(0);
    match secs {
        s if s < 60 => "now".into(),
        s if s < 3600 => format!("{}m", s / 60),
        s if s < 86_400 => format!("{}h", s / 3600),
        s => format!("{}d", s / 86_400),
    }
}

/// Who holds the port: the service, the terminal tab, lpm, or the process.
fn holder(row: &Value) -> String {
    let project = text(row, "project");
    if row.get("own").and_then(Value::as_bool).unwrap_or(false) {
        return "lpm".into();
    }
    for key in ["service", "terminal", "process"] {
        let value = text(row, key);
        if !value.is_empty() && (key != "process" || project.is_empty()) {
            return value.to_string();
        }
    }
    if project.is_empty() { "unknown" } else { "terminal" }.into()
}

fn owner(s: &Style, row: &Value) -> String {
    if row.get("own").and_then(Value::as_bool).unwrap_or(false) {
        return s.dim("lpm itself");
    }
    let project = text(row, "project");
    if project.is_empty() {
        return s.yellow(&format!("outside lpm · PID {}", num(row, "pid")));
    }
    let label = text(row, "projectLabel");
    let mut out = if label.is_empty() { project } else { label }.to_string();
    if !text(row, "parent").is_empty() {
        out.push_str(&s.dim(" (copy)"));
    }
    out
}

fn render(s: &Style, value: &Value, now: i64, computers: bool) -> String {
    let rows = value
        .get("ports")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut o = String::new();
    if rows.is_empty() {
        o.push_str(&format!("{}\n", s.dim("nothing is listening on a TCP port")));
    }
    let holders: Vec<String> = rows.iter().map(holder).collect();
    let width = holders.iter().map(|h| h.chars().count()).max().unwrap_or(0).max(7);
    for (row, held_by) in rows.iter().zip(&holders) {
        let dot = if text(row, "project").is_empty() {
            s.dim("○")
        } else {
            s.green("●")
        };
        let mut line = format!(
            "{dot} {:>5}  {held_by:<width$}  {}",
            num(row, "port"),
            owner(s, row)
        );
        if computers {
            line.push_str(&s.dim(&format!("  on {}", text(row, "machineName"))));
        }
        let up = uptime(num(row, "startedAt"), now);
        if !up.is_empty() {
            line.push_str(&s.dim(&format!("  up {up}")));
        }
        o.push_str(&line);
        o.push('\n');
    }
    for machine in value
        .get("machines")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let error = text(machine, "error");
        if !error.is_empty() {
            o.push_str(&s.yellow(&format!("{}: {error}\n", text(machine, "name"))));
        }
    }
    o
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const PLAIN: Style = Style { on: false };

    #[test]
    fn rows_name_the_service_project_copy_and_outside_holders() {
        let value = json!({
            "ports": [
                { "port": 3001, "pid": 7, "process": "node", "project": "shop-2",
                  "projectLabel": "shop", "parent": "shop", "service": "web", "startedAt": 1000 },
                { "port": 5432, "pid": 812, "process": "postgres", "startedAt": 0 },
                { "port": 8080, "pid": 9, "process": "node", "project": "shop", "terminal": "npm run dev" },
                { "port": 57893, "pid": 1, "process": "lpm-desktop", "own": true },
            ],
            "machines": [{ "id": "a1b2c3d4", "name": "mac-mini", "error": "not connected" }],
        });
        let out = render(&PLAIN, &value, 1000 + 2 * 3600, false);
        let lines: Vec<&str> = out.lines().collect();
        assert!(lines[0].contains(" 3001  web") && lines[0].contains("shop (copy)"), "{}", lines[0]);
        assert!(lines[0].ends_with("up 2h"), "{}", lines[0]);
        assert!(lines[1].contains("postgres") && lines[1].contains("outside lpm · PID 812"), "{}", lines[1]);
        assert!(lines[2].contains("npm run dev"), "{}", lines[2]);
        assert!(lines[3].contains("lpm itself"), "{}", lines[3]);
        assert_eq!(lines[4], "mac-mini: not connected");
    }

    #[test]
    fn computers_add_the_machine_name() {
        let value = json!({ "ports": [{ "port": 3000, "project": "shop", "service": "web",
            "machineName": "mac-mini" }] });
        assert!(render(&PLAIN, &value, 0, true).contains("on mac-mini"));
    }

    #[test]
    fn an_empty_listing_says_so() {
        assert!(render(&PLAIN, &json!({ "ports": [] }), 0, false).contains("nothing is listening"));
    }

    #[test]
    fn uptime_uses_the_largest_whole_unit() {
        assert_eq!(uptime(0, 100), "");
        assert_eq!(uptime(100, 130), "now");
        assert_eq!(uptime(1, 1 + 41 * 60), "41m");
        assert_eq!(uptime(1, 1 + 3 * 86_400), "3d");
    }
}
