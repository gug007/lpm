//! `lpm mobile` — pair the iOS companion with this machine, and manage the
//! phones already paired.
//!
//! The headless counterpart to Settings → Mobile devices. Scanning is the only
//! way a phone pairs — the app has no field to type a code into — so the invite
//! has to reach a camera, and on a server the only screen in the room is the SSH
//! session. That is why the QR is drawn here rather than described.

use crate::control;
use crate::config::Ctx;
use crate::error::RunError;
use crate::statussock::quote_arg;
use crate::util::{now_millis, relative};
use clap::Subcommand;
use qrcode::render::unicode::Dense1x2;
use qrcode::QrCode;
use serde_json::Value;
use std::io::IsTerminal;

#[derive(Subcommand)]
pub enum Command {
    #[command(about = "Mint a single-use invite for the iOS app to scan")]
    Pair {
        #[arg(long, help = "Withdraw the outstanding invite instead of minting one")]
        cancel: bool,
        #[arg(long, help = "Emit machine-readable JSON")]
        json: bool,
    },
    #[command(about = "List the phones paired with this machine", alias = "list")]
    Devices {
        #[arg(long, help = "Emit machine-readable JSON")]
        json: bool,
    },
    #[command(about = "Unpair a phone, by the id `lpm mobile devices` prints")]
    Revoke {
        #[arg(value_name = "DEVICE_ID")]
        id: String,
        #[arg(long, help = "Emit machine-readable JSON")]
        json: bool,
    },
}

pub fn run(ctx: &Ctx, command: Command) -> Result<(), RunError> {
    match command {
        Command::Pair { cancel, json } => pair(ctx, cancel, json),
        Command::Devices { json } => devices(ctx, json),
        Command::Revoke { id, json } => revoke(ctx, &id, json),
    }
}

/// Mint a single-use invite (or withdraw the outstanding one). Drawing the QR is
/// the whole point: it carries addresses, port, code, and the TLS fingerprint the
/// phone pins, and the phone has no other way to take them in.
fn pair(ctx: &Ctx, cancel: bool, json: bool) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let verb = if cancel { "remote_pair --cancel" } else { "remote_pair" };
    let value = control::parse_json(&control::send_command(ctx, verb)?)?;

    if json {
        println!("{value}");
        return Ok(());
    }
    if cancel {
        println!("Pairing code withdrawn.");
        return Ok(());
    }

    let code = value.get("code").and_then(Value::as_str).unwrap_or("");
    let url = value.get("url").and_then(Value::as_str).unwrap_or("");
    let port = value.get("port").and_then(Value::as_u64).unwrap_or(0);
    let hosts: Vec<&str> = value
        .get("hosts")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();

    match render_qr(url, std::io::stdout().is_terminal()) {
        Some(qr) => println!("{qr}"),
        None => println!("This invite is too long to draw as a QR code."),
    }
    println!();
    println!("Scan that with lpm Link on your iPhone or iPad. It can only be used once.");
    println!();
    println!("  code       {code}");
    println!("  port       {port}");
    println!("  addresses  {}", hosts.join(", "));
    println!("  url        {url}");
    if hosts.is_empty() {
        println!();
        println!("No reachable address was found, so the invite names none and the phone will");
        println!("have nowhere to connect. Bring this machine onto a network the phone can");
        println!("reach — a tailnet is the usual answer — and mint the invite again.");
    }
    Ok(())
}

/// The phones paired with this machine, and whether anything is listening for
/// them — the Mobile devices pane as text.
fn devices(ctx: &Ctx, json: bool) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let value = control::parse_json(&control::send_command(ctx, "remote_state")?)?;

    if json {
        println!("{value}");
        return Ok(());
    }

    println!("Serving phones: {}", serving_line(&value));
    if let Some(ts) = text(&value, "tailscaleHost") {
        if value.get("running").and_then(Value::as_bool).unwrap_or(false) {
            println!("  also on {ts} (Tailscale)");
        }
    }
    // A server has no pane to show these in, so they only ever surface here.
    for key in ["bindError", "configError"] {
        if let Some(err) = text(&value, key) {
            println!("  {err}");
        }
    }
    if value
        .get("hasPendingCode")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        println!("  an invite is outstanding — `lpm mobile pair --cancel` withdraws it");
    }

    let devices = device_list(&value);
    println!();
    if devices.is_empty() {
        println!("No phones are paired with this machine.");
        return Ok(());
    }
    println!("Paired phones:");
    let now = now_millis();
    for d in &devices {
        let created = d.get("createdAt").and_then(Value::as_i64).unwrap_or(0);
        println!("  {} — paired {}", device_name(d), relative(created, now));
        println!("    {}", device_id(d));
    }
    if value
        .get("identityRotated")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        println!();
        println!("This machine's security identity was reset. Phones paired before the reset");
        println!("can't connect until they trust it again — accept the new identity on each");
        println!("phone when it prompts, or pair it again.");
    }
    Ok(())
}

/// Unpair one phone. The id is checked against the paired list first: the app
/// drops whatever matches and reports success either way, so a mistyped id would
/// otherwise read as a revocation that never happened.
fn revoke(ctx: &Ctx, id: &str, json: bool) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let state = control::parse_json(&control::send_command(ctx, "remote_state")?)?;
    if !device_list(&state).iter().any(|d| device_id(d) == id) {
        return Err(RunError::NotFound(format!(
            "no phone is paired under id {id:?}\n{}",
            paired_hint(&state)
        )));
    }

    let line = format!("remote_revoke {}", quote_arg(id));
    let value = control::parse_json(&control::send_command(ctx, &line)?)?;
    if json {
        println!("{value}");
        return Ok(());
    }
    println!("Unpaired {id}.");
    Ok(())
}

/// A QR the terminal can draw and a camera can read. Dense1x2 packs two module
/// rows into one glyph, so polarity comes from the glyphs and not from the
/// background — which on a dark terminal renders the code inverted, and a phone
/// won't read an inverted code. Painting the light modules instead, over an
/// explicit white-on-black run, makes it scan whatever theme the terminal is set
/// to. Redirected output has no colors to lean on, so it gets the plain form.
fn render_qr(payload: &str, color: bool) -> Option<String> {
    let code = QrCode::new(payload.as_bytes()).ok()?;
    let mut renderer = code.render::<Dense1x2>();
    let renderer = renderer.quiet_zone(true);
    if !color {
        return Some(renderer.build().trim_end().to_string());
    }
    let image = renderer
        .dark_color(Dense1x2::Light)
        .light_color(Dense1x2::Dark)
        .build();
    Some(
        image
            .lines()
            .map(|line| format!("\x1b[97;40m{line}\x1b[0m"))
            .collect::<Vec<_>>()
            .join("\n"),
    )
}

/// Where a phone connects, or why it can't. "Enabled but not listening" is the
/// ambiguous one — it is either still binding or it failed, and the bind error
/// printed under this line is what tells them apart.
fn serving_line(state: &Value) -> String {
    let port = state.get("port").and_then(Value::as_u64).unwrap_or(0);
    if state.get("running").and_then(Value::as_bool).unwrap_or(false) {
        return match text(state, "host") {
            Some(host) => format!("on, {host}:{port}"),
            None => format!("on, port {port}"),
        };
    }
    if state.get("enabled").and_then(Value::as_bool).unwrap_or(false) {
        return "on, not listening yet".to_string();
    }
    "off".to_string()
}

/// What a revoke that matched nothing should point at.
fn paired_hint(state: &Value) -> String {
    let devices = device_list(state);
    if devices.is_empty() {
        return "no phones are paired with this machine".to_string();
    }
    let rows: Vec<String> = devices
        .iter()
        .map(|d| format!("{} ({})", device_name(d), device_id(d)))
        .collect();
    format!("paired phones: {}", rows.join(", "))
}

fn device_list(state: &Value) -> Vec<Value> {
    state
        .get("devices")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

fn device_id(device: &Value) -> &str {
    device.get("id").and_then(Value::as_str).unwrap_or("")
}

/// A phone that paired without offering a name still has to be listable, and
/// revocable — so it gets a placeholder rather than a blank line.
fn device_name(device: &Value) -> &str {
    match text(device, "name") {
        Some(name) => name,
        None => "unnamed phone",
    }
}

/// A string field, treating absent and empty alike — the app writes "" for
/// "nothing to report" in several of these.
fn text<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value
        .get(key)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn serving_line_separates_binding_from_failed() {
        assert_eq!(
            serving_line(&json!({"enabled": true, "running": true, "host": "10.0.0.2", "port": 8765})),
            "on, 10.0.0.2:8765"
        );
        // Listening with no address to advertise still beats reading as "off".
        assert_eq!(
            serving_line(&json!({"enabled": true, "running": true, "host": null, "port": 8765})),
            "on, port 8765"
        );
        assert_eq!(
            serving_line(&json!({"enabled": true, "running": false, "port": 8765})),
            "on, not listening yet"
        );
        assert_eq!(serving_line(&json!({"enabled": false, "running": false})), "off");
    }

    #[test]
    fn empty_strings_read_as_absent() {
        assert_eq!(text(&json!({"host": ""}), "host"), None);
        assert_eq!(text(&json!({}), "host"), None);
        assert_eq!(text(&json!({"host": "10.0.0.2"}), "host"), Some("10.0.0.2"));
    }

    #[test]
    fn a_nameless_phone_still_lists_and_revokes() {
        let device = json!({"id": "abc", "name": ""});
        assert_eq!(device_name(&device), "unnamed phone");
        assert_eq!(device_id(&device), "abc");
    }

    #[test]
    fn paired_hint_names_what_the_id_could_have_been() {
        let state = json!({"devices": [{"id": "abc", "name": "iPhone"}]});
        assert_eq!(paired_hint(&state), "paired phones: iPhone (abc)");
        assert_eq!(
            paired_hint(&json!({"devices": []})),
            "no phones are paired with this machine"
        );
        assert_eq!(
            paired_hint(&json!({})),
            "no phones are paired with this machine"
        );
    }

    /// The colored form is what a phone actually scans, so its polarity is the
    /// thing worth pinning: the light modules carry the paint, and every row is
    /// wrapped so no terminal theme shows through.
    #[test]
    fn the_scannable_qr_paints_light_modules_on_black() {
        let qr = render_qr("lpm://pair?p=8765&c=AB12-CD34&h=10.0.0.2&f=ab", true).unwrap();
        assert!(qr.lines().count() > 8);
        assert!(qr.lines().all(|l| l.starts_with("\x1b[97;40m") && l.ends_with("\x1b[0m")));
        // The quiet zone is light, so the first row is solid paint.
        let first = qr.lines().next().unwrap();
        assert!(first.contains('█') && !first.contains('▀'));
    }

    #[test]
    fn redirected_output_gets_the_plain_qr() {
        let qr = render_qr("lpm://pair?p=8765&c=AB12-CD34", false).unwrap();
        assert!(!qr.contains('\x1b'));
        assert!(!qr.ends_with('\n'));
        assert!(qr.contains('█'));
    }

    /// QR codes top out around 3kB; the invite never gets there, but a caller
    /// that hands over something absurd must print a line, not panic.
    #[test]
    fn an_unencodable_payload_is_none_not_a_panic() {
        assert!(render_qr(&"x".repeat(8000), false).is_none());
    }
}
