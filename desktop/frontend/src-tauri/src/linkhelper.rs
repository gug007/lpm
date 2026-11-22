//! The login helper behind lpm Link's Open lpm. It is this same binary under
//! `--link-helper`, started at login (linkhelper_agent.rs), and it answers paired
//! phones on its own port while lpm is closed. It does one thing: start lpm and
//! say when it's ready.
//!
//! It reads the app's own remote.json and TLS identity on every connection, so
//! only a device the app accepts gets an answer, a revoked one stops at once, and
//! nothing listens while remote control is off. It speaks the app's handshake
//! (`auth`, then `ready`) so a phone's usual client reaches it, then takes a
//! single `launchLpm` and hangs up.
use crate::remotestore::{load_config, Device};
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tungstenite::{Message, WebSocket};

pub const HELPER_ARG: &str = "--link-helper";

/// The helper's port sits this far above the app's, clear of the Mac-to-Mac
/// peer port (+1) and a dev instance (+2).
const PORT_OFFSET: u16 = 10;
pub(crate) const LAUNCH_FEATURE: &str = "launchLpm";

const CONFIG_CHECK: Duration = Duration::from_secs(30);
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(20);
const TICK: Duration = Duration::from_secs(1);
/// How long a cold start may take before the phone hears it failed.
const READY_WAIT: Duration = Duration::from_secs(90);
const REFUSAL_DELAY: Duration = Duration::from_secs(1);
const MAX_CLIENTS: usize = 4;

static CLIENTS: AtomicUsize = AtomicUsize::new(0);
static LAUNCHING: Mutex<()> = Mutex::new(());

/// The TCP socket under a WebSocket's stream. `launch` shortens the read timeout
/// on this one, the socket the WebSocket reads: set through a clone of it, the
/// reads never timed out on Windows.
pub(crate) trait Tcp {
    fn tcp(&self) -> &TcpStream;
}

impl Tcp for TcpStream {
    fn tcp(&self) -> &TcpStream {
        self
    }
}

impl Tcp for rustls::StreamOwned<rustls::ServerConnection, TcpStream> {
    fn tcp(&self) -> &TcpStream {
        self.get_ref()
    }
}

/// Where the helper listens for an app listening on `lpm_port`.
pub(crate) fn launcher_port(lpm_port: u16) -> u16 {
    lpm_port.saturating_add(PORT_OFFSET)
}

/// Runs the helper and never returns. Without remote control it waits; once the
/// settings it listens by change it exits, and launchd starts it again on them.
pub fn run() -> ! {
    loop {
        let cfg = load_config();
        if !cfg.enabled {
            std::thread::sleep(CONFIG_CHECK);
            continue;
        }
        let lpm_port = crate::remote::effective_port(cfg.port);
        let port = launcher_port(lpm_port);
        match TcpListener::bind(("0.0.0.0", port)) {
            Ok(listener) => serve(listener, lpm_port),
            Err(e) => {
                eprintln!("lpm link helper: can't listen on {port}: {e}");
                std::thread::sleep(CONFIG_CHECK);
            }
        }
    }
}

fn serve(listener: TcpListener, lpm_port: u16) -> ! {
    let watched = load_config().port;
    std::thread::spawn(move || loop {
        std::thread::sleep(CONFIG_CHECK);
        let cfg = load_config();
        if !cfg.enabled || cfg.port != watched {
            std::process::exit(0);
        }
    });
    for stream in listener.incoming().flatten() {
        if CLIENTS.fetch_add(1, Ordering::SeqCst) >= MAX_CLIENTS {
            CLIENTS.fetch_sub(1, Ordering::SeqCst);
            continue;
        }
        std::thread::spawn(move || {
            let _ = connection(stream, lpm_port);
            CLIENTS.fetch_sub(1, Ordering::SeqCst);
        });
    }
    std::process::exit(1)
}

fn connection(stream: TcpStream, lpm_port: u16) -> Result<(), String> {
    stream
        .set_read_timeout(Some(HANDSHAKE_TIMEOUT))
        .map_err(|e| e.to_string())?;
    stream
        .set_write_timeout(Some(HANDSHAKE_TIMEOUT))
        .map_err(|e| e.to_string())?;
    let conn = rustls::ServerConnection::new(crate::remotetls::server_config())
        .map_err(|e| e.to_string())?;
    let ws =
        tungstenite::accept(rustls::StreamOwned::new(conn, stream)).map_err(|e| e.to_string())?;
    let cfg = load_config();
    let ready = json!({
        "t": "ready",
        "serverId": cfg.flavor_server_id(),
        "serverName": crate::remote::server_name(),
        "platform": crate::peer::platform_id(),
        "features": [LAUNCH_FEATURE],
    });
    session(
        ws,
        &cfg.devices,
        ready,
        || lpm_answers(lpm_port),
        || open_lpm(),
    )
}

/// One phone: `auth` first, then `launchLpm`. Anything else it sends meanwhile
/// (presence, pings) is ignored, apart from `ping`, which keeps its client's
/// watchdog fed.
pub(crate) fn session<S: Read + Write + Tcp>(
    mut ws: WebSocket<S>,
    devices: &[Device],
    ready: Value,
    up: impl Fn() -> bool,
    open: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    let first = read_json(&mut ws)?;
    if !authorized(&first, devices) {
        std::thread::sleep(REFUSAL_DELAY);
        let _ = send(&mut ws, json!({ "t": "error", "error": "unauthorized" }));
        let _ = ws.close(None);
        return Ok(());
    }
    send(&mut ws, ready)?;
    loop {
        match read_json(&mut ws)?.get("t").and_then(Value::as_str) {
            Some("launchLpm") => break,
            Some("ping") => send(&mut ws, json!({ "t": "pong" }))?,
            _ => {}
        }
    }
    let reply = launch(&mut ws, up, open);
    send(&mut ws, reply)?;
    let _ = ws.close(None);
    Ok(())
}

/// Starts lpm unless it already answers, then waits until it does.
fn launch<S: Read + Write + Tcp>(
    ws: &mut WebSocket<S>,
    up: impl Fn() -> bool,
    open: impl FnOnce() -> Result<(), String>,
) -> Value {
    let _one_at_a_time = LAUNCHING.lock().unwrap_or_else(|e| e.into_inner());
    if up() {
        return json!({ "t": "launchLpm", "ok": true, "already": true });
    }
    if let Err(error) = open() {
        return json!({ "t": "launchLpm", "ok": false, "error": error });
    }
    let _ = ws.get_ref().tcp().set_read_timeout(Some(TICK));
    let deadline = Instant::now() + READY_WAIT;
    while Instant::now() < deadline {
        if up() {
            return json!({ "t": "launchLpm", "ok": true, "already": false });
        }
        match ws.read() {
            Ok(Message::Text(text)) if is_ping(&text) => {
                let _ = send(ws, json!({ "t": "pong" }));
            }
            Ok(Message::Close(_)) => break,
            Ok(_) => {}
            Err(tungstenite::Error::Io(e))
                if matches!(
                    e.kind(),
                    std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                ) => {}
            Err(_) => break,
        }
    }
    json!({ "t": "launchLpm", "ok": false, "error": "lpm didn't start in time. Open it on the Mac." })
}

fn is_ping(text: &str) -> bool {
    serde_json::from_str::<Value>(text).is_ok_and(|v| v["t"] == "ping")
}

/// Whether the first frame is an `auth` from a device remote.json holds.
pub(crate) fn authorized(frame: &Value, devices: &[Device]) -> bool {
    if frame.get("t").and_then(Value::as_str) != Some("auth") {
        return false;
    }
    let field = |k: &str| frame.get(k).and_then(Value::as_str).unwrap_or_default();
    crate::remote::token_ok(devices, field("deviceId"), field("token"))
}

fn read_json<S: Read + Write>(ws: &mut WebSocket<S>) -> Result<Value, String> {
    loop {
        match ws.read().map_err(|e| e.to_string())? {
            Message::Text(text) => {
                return serde_json::from_str(&text).map_err(|e| e.to_string());
            }
            Message::Close(_) => return Err("closed".into()),
            _ => continue,
        }
    }
}

fn send<S: Read + Write>(ws: &mut WebSocket<S>, frame: Value) -> Result<(), String> {
    ws.send(Message::text(frame.to_string()))
        .map_err(|e| e.to_string())
}

fn lpm_answers(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&addr, Duration::from_millis(500)).is_ok()
}

/// The app bundle an executable sits in, when it sits in one.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub(crate) fn bundle_of(exe: &std::path::Path) -> Option<&std::path::Path> {
    exe.ancestors()
        .find(|p| p.extension().is_some_and(|ext| ext == "app"))
}

fn open_lpm() -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| format!("Couldn't find lpm: {e}"))?;
    #[cfg(target_os = "macos")]
    if let Some(bundle) = bundle_of(&exe) {
        let status = crate::osproc::command("/usr/bin/open")
            .arg("-a")
            .arg(bundle)
            .status()
            .map_err(|e| format!("Couldn't open lpm: {e}"))?;
        return if status.success() {
            Ok(())
        } else {
            Err("Couldn't open lpm on the Mac.".into())
        };
    }
    let mut cmd = crate::osproc::command(&exe);
    crate::osproc::detach(&mut cmd);
    cmd.spawn()
        .map(|_| ())
        .map_err(|e| format!("Couldn't open lpm: {e}"))
}

#[cfg(test)]
#[path = "linkhelper_tests.rs"]
mod tests;
