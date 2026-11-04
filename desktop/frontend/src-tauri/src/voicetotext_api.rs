// Client for VoiceToText's local app API: newline-delimited JSON over a Unix
// socket in its Application Support folder (see INTEGRATION.md in the
// voice-to-text repo). lpm keeps one connection, sends start/stop/cancel, and
// forwards every event to the webview, which draws its own recorder.
use crate::ipc::UnixStream;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

pub const EVENT: &str = "voice-to-text";

// Release first: with both copies installed, the one the user downloaded wins.
const APPS: [&str; 2] = [
    "/Applications/VoiceToText.app",
    "/Applications/VoiceToText-Dev.app",
];
const SOCKETS: [&str; 2] = ["api.sock", "api-dev.sock"];
// Info.plist key a copy that speaks the API carries. A byte search finds it in
// both XML and binary plists, without launching anything.
const API_MARKER: &[u8] = b"VoiceToTextAPIVersion";
// And the one a copy carries that transcribes audio sent to it (`startStream`).
const AUDIO_MARKER: &[u8] = b"VoiceToTextAudioInput";
const LAUNCH_TIMEOUT: Duration = Duration::from_secs(15);
const STARTING_GRACE: Duration = Duration::from_secs(2);

pub enum Unavailable {
    NotInstalled,
    // Only a copy from before the API is installed or running: drive it through
    // its URL scheme instead.
    Legacy,
    Failed(String),
}

struct Connection {
    stream: UnixStream,
    next_id: u64,
    pending: Arc<Mutex<HashMap<u64, &'static str>>>,
    alive: Arc<AtomicBool>,
}

static CONNECTION: Mutex<Option<Connection>> = Mutex::new(None);

pub fn send(app: &AppHandle, method: &'static str) -> Result<(), Unavailable> {
    let mut guard = CONNECTION.lock().unwrap_or_else(|e| e.into_inner());
    if !guard.as_ref().is_some_and(|c| c.alive.load(Ordering::SeqCst)) {
        *guard = Some(connect(app)?);
    }
    let conn = guard.as_mut().expect("connected above");
    conn.next_id += 1;
    let id = conn.next_id;
    let line = json!({ "id": id, "method": method, "params": { "client": "lpm" } });
    conn.pending.lock().unwrap_or_else(|e| e.into_inner()).insert(id, method);
    if let Err(e) = writeln!(conn.stream, "{line}") {
        conn.alive.store(false, Ordering::SeqCst);
        return Err(Unavailable::Failed(format!("could not reach VoiceToText: {e}")));
    }
    Ok(())
}

// Sends `method` only over a connection that is already open: stopping or
// cancelling never launches VoiceToText.
pub fn send_if_connected(method: &'static str) -> bool {
    let mut guard = CONNECTION.lock().unwrap_or_else(|e| e.into_inner());
    let Some(conn) = guard.as_mut().filter(|c| c.alive.load(Ordering::SeqCst)) else {
        return false;
    };
    conn.next_id += 1;
    let id = conn.next_id;
    conn.pending.lock().unwrap_or_else(|e| e.into_inner()).insert(id, method);
    writeln!(conn.stream, "{}", json!({ "id": id, "method": method })).is_ok()
}

/// A socket of the caller's own, launching VoiceToText if it has to.
pub fn open() -> Result<UnixStream, Unavailable> {
    dial().map_or_else(launch_and_dial, Ok)
}

/// Whether an installed copy can transcribe audio from somewhere other than this
/// Mac's microphone.
pub fn takes_audio() -> bool {
    APPS.iter()
        .filter_map(|app| installed(app))
        .any(|bundle| declares(&bundle, AUDIO_MARKER))
}

fn connect(app: &AppHandle) -> Result<Connection, Unavailable> {
    let stream = open()?;
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
    let reader = stream
        .try_clone()
        .map_err(|e| Unavailable::Failed(e.to_string()))?;
    let pending = Arc::new(Mutex::new(HashMap::new()));
    let alive = Arc::new(AtomicBool::new(true));
    spawn_reader(app.clone(), reader, pending.clone(), alive.clone());
    Ok(Connection {
        stream,
        next_id: 0,
        pending,
        alive,
    })
}

fn spawn_reader(
    app: AppHandle,
    stream: UnixStream,
    pending: Arc<Mutex<HashMap<u64, &'static str>>>,
    alive: Arc<AtomicBool>,
) {
    std::thread::spawn(move || {
        for line in BufReader::new(stream).lines() {
            let Ok(line) = line else { break };
            let Ok(msg) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            let method = msg
                .get("id")
                .and_then(Value::as_u64)
                .and_then(|id| pending.lock().unwrap_or_else(|e| e.into_inner()).remove(&id));
            if let Some(event) = translate(&msg, method) {
                let _ = app.emit(EVENT, event);
            }
        }
        alive.store(false, Ordering::SeqCst);
        let _ = app.emit(EVENT, json!({ "event": "disconnected" }));
    });
}

// Events pass through as VoiceToText sent them. A response becomes an event
// only when it says something the recorder shows: `start` succeeding, or any
// request failing — except a `cancelled` start, which the user asked for.
pub fn translate(msg: &Value, method: Option<&'static str>) -> Option<Value> {
    if msg.get("event").is_some() {
        return Some(msg.clone());
    }
    let ok = msg.get("ok").and_then(Value::as_bool).unwrap_or(false);
    if ok {
        return (method == Some("start"))
            .then(|| json!({ "event": "started", "model": msg["result"]["model"] }));
    }
    let code = msg["error"]["code"].as_str().unwrap_or("failed");
    if code == "cancelled" {
        return None;
    }
    Some(json!({
        "event": "error",
        "code": code,
        "message": msg["error"]["message"].as_str().unwrap_or("VoiceToText could not do that."),
    }))
}

fn socket_paths() -> Vec<PathBuf> {
    let dir = dirs::home_dir()
        .unwrap_or_default()
        .join("Library/Application Support/VoiceToText");
    SOCKETS.iter().map(|name| dir.join(name)).collect()
}

fn dial() -> Option<UnixStream> {
    socket_paths()
        .iter()
        .find_map(|path| UnixStream::connect(path).ok())
}

fn installed(app: &str) -> Option<String> {
    crate::openin::detect_by_paths(&[app])
}

fn speaks_api(bundle: &str) -> bool {
    declares(bundle, API_MARKER)
}

fn declares(bundle: &str, marker: &[u8]) -> bool {
    std::fs::read(format!("{bundle}/Contents/Info.plist"))
        .is_ok_and(|plist| plist.windows(marker.len()).any(|w| w == marker))
}

fn is_running(bundle: &str) -> bool {
    Command::new("pgrep")
        .args(["-f", &format!("{bundle}/Contents/MacOS/")])
        .output()
        .is_ok_and(|out| out.status.success())
}

fn launch_and_dial() -> Result<UnixStream, Unavailable> {
    let bundles: Vec<String> = APPS.iter().filter_map(|app| installed(app)).collect();
    if bundles.is_empty() {
        return Err(Unavailable::NotInstalled);
    }
    if let Some(running) = bundles.iter().find(|b| is_running(b)) {
        if !speaks_api(running) {
            return Err(Unavailable::Legacy);
        }
        // Running and API-capable, yet not listening: still starting up, or
        // the user turned the API off.
        return poll(STARTING_GRACE).ok_or_else(|| {
            Unavailable::Failed(
                "Turn on “Allow other apps to dictate” in VoiceToText → General.".into(),
            )
        });
    }
    let Some(bundle) = bundles.iter().find(|b| speaks_api(b)) else {
        return Err(Unavailable::Legacy);
    };
    // `-g` keeps lpm frontmost; `--background` keeps VoiceToText's window shut.
    Command::new("open")
        .args(["-g", "-a", bundle, "--args", "--background"])
        .status()
        .map_err(|e| Unavailable::Failed(format!("could not launch VoiceToText: {e}")))?;
    poll(LAUNCH_TIMEOUT)
        .ok_or_else(|| Unavailable::Failed("VoiceToText didn't start in time.".into()))
}

fn poll(timeout: Duration) -> Option<UnixStream> {
    let deadline = Instant::now() + timeout;
    loop {
        if let Some(stream) = dial() {
            return Some(stream);
        }
        if Instant::now() >= deadline {
            return None;
        }
        std::thread::sleep(Duration::from_millis(150));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn events_pass_through_unchanged() {
        let msg = json!({ "event": "level", "level": 0.4 });
        assert_eq!(translate(&msg, None), Some(msg));
    }

    #[test]
    fn a_started_recording_becomes_a_started_event() {
        let msg = json!({ "id": 1, "ok": true, "result": { "model": { "name": "Parakeet" } } });
        assert_eq!(
            translate(&msg, Some("start")),
            Some(json!({ "event": "started", "model": { "name": "Parakeet" } }))
        );
    }

    #[test]
    fn other_acknowledgements_are_dropped() {
        let msg = json!({ "id": 2, "ok": true, "result": {} });
        assert_eq!(translate(&msg, Some("stop")), None);
        assert_eq!(translate(&msg, Some("cancel")), None);
    }

    #[test]
    fn failures_become_error_events_except_a_cancelled_start() {
        let busy = json!({ "id": 3, "ok": false, "error": { "code": "busy", "message": "Busy." } });
        assert_eq!(
            translate(&busy, Some("start")),
            Some(json!({ "event": "error", "code": "busy", "message": "Busy." }))
        );
        let cancelled = json!({ "id": 4, "ok": false, "error": { "code": "cancelled", "message": "Cancelled." } });
        assert_eq!(translate(&cancelled, Some("start")), None);
    }

    #[test]
    fn the_api_marker_is_found_in_a_plist() {
        let dir = tempfile::tempdir().unwrap();
        let contents = dir.path().join("New.app/Contents");
        std::fs::create_dir_all(&contents).unwrap();
        std::fs::write(
            contents.join("Info.plist"),
            "<dict><key>VoiceToTextAPIVersion</key><integer>1</integer></dict>",
        )
        .unwrap();
        let old = dir.path().join("Old.app/Contents");
        std::fs::create_dir_all(&old).unwrap();
        std::fs::write(old.join("Info.plist"), "<dict></dict>").unwrap();
        assert!(speaks_api(&dir.path().join("New.app").to_string_lossy()));
        assert!(!speaks_api(&dir.path().join("Old.app").to_string_lossy()));
        assert!(!declares(&dir.path().join("New.app").to_string_lossy(), AUDIO_MARKER));
    }
}
