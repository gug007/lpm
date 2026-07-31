//! `lpm pair` and `lpm connections` — bring a machine online as a host that
//! another machine can drive, and inspect what it's connected to.
//!
//! This is the headless path. On a Mac you do it in Settings → Connections; a
//! Linux host running under Xvfb has the same app and the same pane, just nobody
//! to click it. Both routes call the app's one pairing primitive, so the invite,
//! the single-use code, and the pinned TLS identity are minted identically.

use crate::config::Ctx;
use crate::control;
use crate::error::RunError;
use serde_json::Value;

fn parse_reply(reply: &str) -> Result<Value, RunError> {
    serde_json::from_str(reply)
        .map_err(|e| RunError::Internal(format!("could not read the app's reply: {e}")))
}

/// Mint a single-use invite (or withdraw the outstanding one). Printing the
/// invite string is the whole point: it carries address, port, code, and the TLS
/// fingerprint as one token to paste into the other machine's Connections pane.
pub fn run(ctx: &Ctx, cancel: bool, lan: bool, json: bool) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let command = if cancel {
        "peer_pair --cancel"
    } else if lan {
        "peer_pair --lan"
    } else {
        "peer_pair"
    };
    let reply = control::send_command(ctx, command)?;
    let value = parse_reply(&reply)?;

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
    println!("Paste that into Settings → Connections on the machine that will drive this one.");
    println!("It can only be used once.");
    if !lan {
        println!();
        println!("Listening on this machine only. If the other machine reaches you over a");
        println!("tunnel, that is what you want; pass --lan to accept connections on every");
        println!("network interface instead.");
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

/// What this machine hosts and what it connects to — the Connections pane as text.
pub fn run_connections(ctx: &Ctx, json: bool) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let value = parse_reply(&control::send_command(ctx, "peer_state")?)?;

    if json {
        println!("{value}");
        return Ok(());
    }

    let host = value.get("host").cloned().unwrap_or(Value::Null);
    let running = host
        .get("running")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let port = host.get("port").and_then(Value::as_u64).unwrap_or(0);
    println!(
        "Hosting: {}",
        if running {
            format!("on, port {port}")
        } else {
            "off".to_string()
        }
    );

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
        println!("  {alias}{} — {state}", platform_suffix(p));
        if let Some(err) = p.get("lastError").and_then(Value::as_str) {
            if !err.is_empty() && !connected {
                println!("    {err}");
            }
        }
    }
    Ok(())
}

/// Only worth showing when it isn't a Mac — a Linux entry is a headless host, and
/// an entry paired before platforms were reported has nothing to show at all.
fn platform_suffix(row: &Value) -> String {
    match row.get("platform").and_then(Value::as_str).unwrap_or("") {
        "linux" => " (Linux)".to_string(),
        _ => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn linux_rows_are_marked_and_macs_are_not() {
        assert_eq!(platform_suffix(&serde_json::json!({"platform": "linux"})), " (Linux)");
        assert_eq!(platform_suffix(&serde_json::json!({"platform": "macos"})), "");
        // Paired before hosts reported a platform: say nothing rather than guess.
        assert_eq!(platform_suffix(&serde_json::json!({})), "");
    }

    #[test]
    fn a_non_json_reply_is_an_error_not_a_panic() {
        assert!(parse_reply("OK").is_err());
    }
}
