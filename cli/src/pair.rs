//! `lpm pair` and `lpm connections` — bring a machine online as a host that
//! another machine can drive, and inspect what it's connected to.
//!
//! This is the headless path. On a Mac you do it under + above your projects →
//! Another computer; a Linux host running under Xvfb has the same app and the
//! same screen, just nobody to click it. Both routes call the app's one pairing
//! primitive, so the invite, the single-use code, and the pinned TLS identity are
//! minted identically.

use crate::config::Ctx;
use crate::control;
use crate::error::RunError;
use crate::statussock::quote_arg;
use serde_json::Value;

/// Mint a single-use invite (or withdraw the outstanding one). Printing the
/// invite string is the whole point: it carries address, port, code, and the TLS
/// fingerprint as one token to paste into the other machine's Another computer
/// screen.
pub fn run(
    ctx: &Ctx,
    cancel: bool,
    lan: bool,
    bind: Option<&str>,
    json: bool,
) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let command = if cancel {
        "peer_pair --cancel".to_string()
    } else if let Some(addr) = bind {
        format!("peer_pair --bind={}", quote_arg(addr))
    } else if lan {
        "peer_pair --lan".to_string()
    } else {
        "peer_pair".to_string()
    };
    let reply = control::send_command(ctx, &command)?;
    let value = control::parse_json(&reply)?;

    if json {
        println!("{value}");
        return Ok(());
    }
    if cancel {
        println!("Pairing code withdrawn.");
        return Ok(());
    }

    let invite = value.get("invite").and_then(Value::as_str).unwrap_or("");
    let code = value.get("code").and_then(Value::as_str).unwrap_or("");
    let port = value.get("port").and_then(Value::as_u64).unwrap_or(0);
    let hosts: Vec<&str> = value
        .get("hosts")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();

    println!("{invite}");
    println!();
    println!("Paste that into lpm on the machine that will drive this one:");
    println!("click + above your projects, then Another computer.");
    println!("It can only be used once.");
    match bind {
        Some(addr) => {
            println!();
            println!("Listening on {addr} only.");
        }
        None if !lan => {
            println!();
            println!("Listening on this machine only. If the other machine reaches you over a");
            println!("tunnel, that is what you want. Otherwise pass --bind <address> to listen");
            println!("on one interface, or --lan for every interface — on a public IP, check");
            println!("the firewall before you do.");
        }
        None => {}
    }
    println!();
    println!("  code       {code}");
    println!("  port       {port}");
    println!("  addresses  {}", hosts.join(", "));
    if hosts.is_empty() {
        println!();
        println!("No reachable address was found. If this machine is only reachable over a");
        println!("tunnel or a private network, pair over that address instead.");
    }
    Ok(())
}

/// What this machine hosts and what it connects to — the Another computer and
/// Server screens as text.
pub fn run_connections(ctx: &Ctx, json: bool) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let value = control::parse_json(&control::send_command(ctx, "peer_state")?)?;

    if json {
        println!("{value}");
        return Ok(());
    }

    let host = value.get("host").cloned().unwrap_or(Value::Null);
    println!("Hosting: {}", hosting_line(&host));

    let devices = host
        .get("devices")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if devices.is_empty() {
        println!("  no machines are paired with this one");
    } else {
        for d in &devices {
            let name = d.get("name").and_then(Value::as_str).unwrap_or("?");
            println!("  {name}{}", platform_suffix(d));
        }
    }

    let peers = value
        .get("peers")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    println!();
    if peers.is_empty() {
        println!("Connected to: nothing");
        return Ok(());
    }
    println!("Connected to:");
    for p in &peers {
        let alias = p.get("alias").and_then(Value::as_str).unwrap_or("?");
        let connected = p.get("connected").and_then(Value::as_bool).unwrap_or(false);
        let state = if connected { "connected" } else { "offline" };
        let version = p.get("version").and_then(Value::as_str).unwrap_or("");
        let version = if version.is_empty() {
            String::new()
        } else {
            format!(" · lpm {version}")
        };
        println!("  {alias}{} — {state}{version}", platform_suffix(p));
        if let Some(err) = p.get("lastError").and_then(Value::as_str) {
            if !err.is_empty() && !connected {
                println!("    {err}");
            }
        }
        if let Some(line) = agent_files_line(p) {
            println!("    {line}");
        }
    }
    Ok(())
}

/// What a connected computer lets this one's agents copy there (`lpm cp`).
fn agent_files_line(row: &Value) -> Option<String> {
    let flag = |k: &str| row.get(k).and_then(Value::as_bool).unwrap_or(false);
    if !flag("connected") || !flag("supportsAgentFiles") {
        return None;
    }
    let text = |k: &str| row.get(k).and_then(Value::as_str).unwrap_or("");
    let what = match text("agentFiles") {
        "read" => "copy files from it",
        "write" => "copy files to and from it",
        _ => return Some("agents here can't copy files there".to_string()),
    };
    let place = if text("agentScope") == "home" {
        "its home folder and lpm projects"
    } else {
        "its lpm projects"
    };
    Some(format!("agents here may {what}, in {place} (lpm cp)"))
}

/// `lpm connections --activity`: the latest copies agents made between computers.
pub fn run_activity(ctx: &Ctx, json: bool) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let value = control::parse_json(&control::send_command(ctx, "agent_files_log --count=20")?)?;
    if json {
        println!("{value}");
        return Ok(());
    }
    let rows = value.as_array().cloned().unwrap_or_default();
    if rows.is_empty() {
        println!("No agent has copied files between computers yet.");
        return Ok(());
    }
    for row in &rows {
        println!("{}", activity_line(row));
    }
    Ok(())
}

fn activity_line(row: &Value) -> String {
    let text = |k: &str| row.get(k).and_then(Value::as_str).unwrap_or("");
    let count = crate::util::files_count(row.get("files").and_then(Value::as_u64).unwrap_or(0));
    let when = row
        .get("at")
        .and_then(Value::as_i64)
        .map(|ms| crate::util::relative(ms, crate::util::now_millis()))
        .unwrap_or_default();
    let machine = text("machine");
    let what = match (text("side"), text("op")) {
        ("host", "read") => format!("{machine}'s agent copied {count} from here: {}", text("path")),
        ("host", _) => format!("{machine}'s agent copied {count} here: {}", text("path")),
        _ => {
            let who = match (text("agent"), text("project")) {
                ("", "") => "A program outside lpm's terminals".to_string(),
                ("", p) => format!("A command in {p}"),
                (a, "") => a.to_string(),
                (a, p) => format!("{a} in {p}"),
            };
            format!("{who} copied {count} from {} to {}", text("from"), text("to"))
        }
    };
    let failed = match row.get("error").and_then(Value::as_str) {
        Some(e) if !e.is_empty() => format!(" — stopped: {e}"),
        _ => String::new(),
    };
    format!("{when:>8}  {what}{failed}")
}

/// Spell out what a bind address means for who can reach this machine — the two
/// that matter are "nobody without a tunnel" and "anyone who can route here".
fn hosting_line(host: &Value) -> String {
    let flag = |k: &str| host.get(k).and_then(Value::as_bool).unwrap_or(false);
    let port = host.get("port").and_then(Value::as_u64).unwrap_or(0);
    // The address matters more than the port on a server: it's the difference
    // between "reachable over the tailnet" and "answering the open internet",
    // and there's no window here to check it in.
    let bind = host
        .get("bindAddress")
        .and_then(Value::as_str)
        .unwrap_or("127.0.0.1");
    let at = format!("{bind}:{port}{}", reach_hint(bind));
    match (flag("running"), flag("guestsOnly")) {
        (false, _) => "off".to_string(),
        (true, true) => format!("off, but guests of a shared tab can join on {at}"),
        (true, false) => format!("on, {at}"),
    }
}

fn reach_hint(bind: &str) -> &'static str {
    match bind {
        "127.0.0.1" | "localhost" => " (this machine only)",
        "0.0.0.0" => " (every network interface)",
        _ => "",
    }
}

/// Only worth showing when it isn't a Mac — a Linux entry is a headless host, and
/// an entry paired before platforms were reported has nothing to show at all.
fn platform_suffix(row: &Value) -> String {
    match row.get("platform").and_then(Value::as_str).unwrap_or("") {
        "linux" => " (Linux)".to_string(),
        "windows" => " (Windows)".to_string(),
        _ => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_connected_computer_says_what_agents_may_copy() {
        let row = |files: &str, scope: &str| {
            serde_json::json!({ "connected": true, "supportsAgentFiles": true,
                "agentFiles": files, "agentScope": scope })
        };
        assert_eq!(
            agent_files_line(&row("off", "projects")).unwrap(),
            "agents here can't copy files there"
        );
        assert_eq!(
            agent_files_line(&row("write", "home")).unwrap(),
            "agents here may copy files to and from it, in its home folder and lpm projects (lpm cp)"
        );
        let old = serde_json::json!({ "connected": true });
        assert!(agent_files_line(&old).is_none());
    }

    #[test]
    fn activity_names_who_copied_what() {
        let asked = serde_json::json!({ "side": "asked", "agent": "Claude", "project": "lpm",
            "files": 1, "from": "mini:/k/a.jks", "to": "/Users/me/keys/a.jks" });
        assert!(activity_line(&asked).ends_with("Claude in lpm copied 1 file from mini:/k/a.jks to /Users/me/keys/a.jks"));
        let outside = serde_json::json!({ "side": "asked", "files": 1, "from": "a", "to": "b" });
        assert!(activity_line(&outside).ends_with("A program outside lpm's terminals copied 1 file from a to b"));
        let served = serde_json::json!({ "side": "host", "op": "write", "machine": "Studio",
            "files": 2, "path": "/x" });
        assert!(activity_line(&served).ends_with("Studio's agent copied 2 files here: /x"));
    }

    #[test]
    fn linux_rows_are_marked_and_macs_are_not() {
        assert_eq!(platform_suffix(&serde_json::json!({"platform": "linux"})), " (Linux)");
        assert_eq!(platform_suffix(&serde_json::json!({"platform": "macos"})), "");
        // Paired before hosts reported a platform: say nothing rather than guess.
        assert_eq!(platform_suffix(&serde_json::json!({})), "");
    }

    // A shared tab keeps the listener up with control off; saying "on" would
    // claim paired machines can connect.
    #[test]
    fn a_listener_up_only_for_a_shared_tab_reads_as_off() {
        let host = serde_json::json!({
            "running": true, "guestsOnly": true, "port": 8766, "bindAddress": "0.0.0.0",
        });
        assert_eq!(
            hosting_line(&host),
            "off, but guests of a shared tab can join on 0.0.0.0:8766 (every network interface)"
        );
        let host = serde_json::json!({ "running": true, "port": 8766, "bindAddress": "127.0.0.1" });
        assert_eq!(
            hosting_line(&host),
            "on, 127.0.0.1:8766 (this machine only)"
        );
        assert_eq!(hosting_line(&serde_json::json!({})), "off");
    }

    #[test]
    fn windows_rows_are_marked() {
        assert_eq!(platform_suffix(&serde_json::json!({"platform": "windows"})), " (Windows)");
    }
}
