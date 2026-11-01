//! `lpm awake [agents|on|off|<time>|+<time>] [--then <time>] [--json]` — keep
//! this machine awake through the running app, as its Keep awake menu does:
//! while agents work and for a while after the last one finishes, for a set
//! time, or until turned off. `+<time>` adds to the time left. With no argument
//! it says what is on now.

use crate::config::Ctx;
use crate::control;
use crate::error::RunError;
use crate::style::Style;
use crate::util::print_json;
use serde_json::Value;
use std::io::IsTerminal;

pub fn run(
    ctx: &Ctx,
    what: Option<&str>,
    then: Option<&str>,
    as_json: bool,
) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let line = command_line(what, then)?;
    let state = control::parse_json(&control::send_command(ctx, &line)?)?;
    if as_json {
        print_json(&state);
    } else {
        let style = Style {
            on: std::io::stdout().is_terminal(),
        };
        println!("{}", describe(&style, &state));
    }
    Ok(())
}

fn command_line(what: Option<&str>, then: Option<&str>) -> Result<String, RunError> {
    let mut line = match what {
        None => "keep_awake".to_string(),
        Some("agents") => "keep_awake agents".to_string(),
        Some("on") => "keep_awake always".to_string(),
        Some("off") => "keep_awake off".to_string(),
        Some(time) => match time.strip_prefix('+') {
            Some(more) => format!("keep_awake extend {}", minutes(more)?),
            None => format!("keep_awake timed {}", minutes(time)?),
        },
    };
    if let Some(then) = then {
        line.push_str(&format!(" --tail {}", minutes_or_zero(then)?));
    }
    Ok(line)
}

/// `90`, `90m`, `2h`, `1h30m` → minutes.
fn minutes(text: &str) -> Result<u64, RunError> {
    let total = minutes_or_zero(text)?;
    if total == 0 {
        return Err(usage(text));
    }
    Ok(total)
}

fn minutes_or_zero(text: &str) -> Result<u64, RunError> {
    let text = text.trim().to_ascii_lowercase();
    if let Ok(bare) = text.parse::<u64>() {
        return Ok(bare);
    }
    let (hours, rest) = match text.split_once('h') {
        Some((h, rest)) => (h.parse::<u64>().map_err(|_| usage(&text))?, rest),
        None => (0, text.as_str()),
    };
    let mins = match rest.strip_suffix('m') {
        Some(m) if !m.is_empty() => m.parse::<u64>().map_err(|_| usage(&text))?,
        None if rest.is_empty() => 0,
        _ => return Err(usage(&text)),
    };
    Ok(hours * 60 + mins)
}

fn usage(text: &str) -> RunError {
    RunError::NotFound(format!(
        "\"{text}\" isn't a time — use agents, on, off, a time such as 45m, 2h or 1h30m, or +1h to add an hour"
    ))
}

fn span(ms: i64) -> String {
    let mins = (ms.max(0) + 59_999) / 60_000;
    match (mins / 60, mins % 60) {
        (0, m) => format!("{m} min"),
        (h, 0) => format!("{h} h"),
        (h, m) => format!("{h} h {m} min"),
    }
}

fn describe(style: &Style, state: &Value) -> String {
    let text = |k: &str| state.get(k).and_then(Value::as_str).unwrap_or_default();
    let num = |k: &str| state.get(k).and_then(Value::as_i64).unwrap_or(0);
    if state.get("supported").and_then(Value::as_bool) == Some(false) {
        return "Keep awake isn't available on this computer.".into();
    }
    let ends_in = state.get("endsIn").and_then(Value::as_i64);
    let agents = num("agents");
    let while_agents = style.green("Awake while agents work:");
    let line = match text("mode") {
        "agents" if agents > 0 => format!(
            "{} {agents} agent{} working, then {} more.",
            while_agents,
            if agents == 1 { "" } else { "s" },
            span(num("tailMinutes") * 60_000)
        ),
        "agents" => match ends_in {
            Some(ms) => format!(
                "{} agents finished; it can sleep in {}.",
                while_agents,
                span(ms)
            ),
            None => format!(
                "{} no agent is working now.",
                style.bold("Keep awake while agents work:")
            ),
        },
        "timed" => format!(
            "{} {} left.",
            style.green("Awake for a set time:"),
            span(ends_in.unwrap_or(0))
        ),
        "always" => style.green("Awake until turned off.").to_string(),
        _ => format!(
            "{} it sleeps on its usual schedule.",
            style.bold("Keep awake is off:")
        ),
    };
    let note = match text("power") {
        "battery" => Some("On battery, so it isn't held awake right now.".to_string()),
        "low" => Some(format!(
            "The battery is at {}% or below, so it isn't held awake right now.",
            num("floor")
        )),
        "failed" => Some("The system wouldn't stay awake. Turn it off and on to try again.".into()),
        _ => None,
    };
    match note {
        Some(note) => format!("{line}\n{}", style.yellow(&note)),
        None => line,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn times_read_as_minutes() {
        assert_eq!(minutes("45").unwrap(), 45);
        assert_eq!(minutes("45m").unwrap(), 45);
        assert_eq!(minutes("2h").unwrap(), 120);
        assert_eq!(minutes("1h30m").unwrap(), 90);
        assert_eq!(minutes("1H30M").unwrap(), 90);
        assert!(minutes("0").is_err());
        assert!(minutes("soon").is_err());
        assert!(minutes("1h30").is_err());
        assert!(minutes("h").is_err());
    }

    #[test]
    fn each_choice_becomes_one_socket_line() {
        assert_eq!(command_line(None, None).unwrap(), "keep_awake");
        assert_eq!(
            command_line(Some("agents"), Some("10m")).unwrap(),
            "keep_awake agents --tail 10"
        );
        assert_eq!(command_line(Some("on"), None).unwrap(), "keep_awake always");
        assert_eq!(command_line(Some("off"), None).unwrap(), "keep_awake off");
        assert_eq!(
            command_line(Some("1h30m"), None).unwrap(),
            "keep_awake timed 90"
        );
        assert_eq!(
            command_line(None, Some("0")).unwrap(),
            "keep_awake --tail 0"
        );
        assert_eq!(
            command_line(Some("+1h"), None).unwrap(),
            "keep_awake extend 60"
        );
        assert!(command_line(Some("+"), None).is_err());
    }

    #[test]
    fn describes_each_mode() {
        let style = Style { on: false };
        let working = json!({"supported": true, "mode": "agents", "agents": 2, "tailMinutes": 5, "power": "awake"});
        assert_eq!(
            describe(&style, &working),
            "Awake while agents work: 2 agents working, then 5 min more."
        );
        let tail = json!({"supported": true, "mode": "agents", "agents": 0, "endsIn": 239_000, "power": "awake"});
        assert_eq!(
            describe(&style, &tail),
            "Awake while agents work: agents finished; it can sleep in 4 min."
        );
        let timed =
            json!({"supported": true, "mode": "timed", "endsIn": 82 * 60_000, "power": "awake"});
        assert_eq!(
            describe(&style, &timed),
            "Awake for a set time: 1 h 22 min left."
        );
        let low = json!({"supported": true, "mode": "always", "power": "low", "floor": 20});
        assert_eq!(
            describe(&style, &low),
            "Awake until turned off.\nThe battery is at 20% or below, so it isn't held awake right now."
        );
        let off = json!({"supported": true, "mode": "off", "power": "idle"});
        assert_eq!(
            describe(&style, &off),
            "Keep awake is off: it sleeps on its usual schedule."
        );
    }
}
