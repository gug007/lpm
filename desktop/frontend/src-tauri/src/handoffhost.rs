//! Host half of "Continue on": a paired computer hands a session to this one,
//! or takes one back. Handing over, it sends the objects this repository is
//! missing and the Claude conversation in pieces, then asks for them to land
//! (handoffland.rs). Taking back, it has this computer stop the tab, then
//! reads the work through the bring-changes verbs and the conversation as a
//! file.
//!
//! Frames are JSON text, so bytes travel base64'd. Every verb runs on its own
//! thread and replies through the connection's out-queue.
use crate::gitbringapply as ga;
use crate::handoffland::{self, Handed};
use crate::ignoredhost::str_arg;
use crate::pty::PtyState;
use crate::sys::MACHINE;
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::mpsc::SyncSender;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager};

pub const HANDOFF_FEATURE: &str = "handoff";

pub(crate) const CHUNK_BYTES: u64 = 1024 * 1024;
pub(crate) const MAX_PACK_BYTES: u64 = 1024 * 1024 * 1024;
pub(crate) const MAX_SESSION_BYTES: u64 = 512 * 1024 * 1024;
const TTL_MS: i64 = 10 * 60 * 1000;

/// Files arriving for a project, kept in a folder of their own until they land.
#[derive(Clone)]
struct Incoming {
    name: String,
    root: String,
    dir: PathBuf,
    touched_at: i64,
}

fn registry() -> &'static Mutex<HashMap<String, Incoming>> {
    static REG: OnceLock<Mutex<HashMap<String, Incoming>>> = OnceLock::new();
    REG.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn handle(app: &AppHandle, out: &SyncSender<String>, t: &str, v: &Value) {
    let req_id = v.get("reqId").cloned().unwrap_or(Value::Null);
    let (app, out, verb, v) = (app.clone(), out.clone(), t.to_string(), v.clone());
    std::thread::spawn(move || {
        let res = match verb.as_str() {
            "handoffOpen" => open(&v),
            "handoffPut" => put(&v),
            "handoffLand" => land(&v),
            "handoffStop" => stop(&app, &v),
            "handoffSession" => session(&v),
            "handoffAnchor" => anchor(&v),
            "handoffClose" => close(&v),
            _ => Err(format!("unknown handoff request: {verb}")),
        };
        let frame = match res {
            Ok(value) => crate::peer::result_frame(&req_id, true, value),
            Err(e) => crate::peer::result_frame(&req_id, false, Value::String(e)),
        };
        let _ = out.try_send(frame);
    });
}

fn opt_arg<'v>(v: &'v Value, key: &str) -> Option<&'v str> {
    Some(str_arg(v, key)).filter(|s| !s.is_empty())
}

/// The asking computer names the folder, so it has to be a Git project this
/// one manages; the name it goes by here comes back with it.
fn project(v: &Value) -> Result<(String, String), String> {
    let cwd = str_arg(v, "cwd").to_string();
    let name = crate::adopt::project_at_root(&cwd)
        .filter(|_| Path::new(&cwd).is_dir())
        .ok_or_else(|| format!("that project isn't on the other {MACHINE}"))?;
    crate::gitworkstate::head_sha(&cwd)
        .map_err(|_| format!("{name} has no commits yet on the other {MACHINE}"))?;
    Ok((name, cwd))
}

fn open(v: &Value) -> Result<Value, String> {
    reap_expired();
    let (name, root) = project(v)?;
    handoffland::ensure_can_take(&name, &root)?;
    let id = uuid::Uuid::new_v4().to_string();
    let dir = std::env::temp_dir().join(format!("lpm-handoff-{id}"));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let have = ga::have_list(&root);
    registry().lock().unwrap().insert(
        id.clone(),
        Incoming {
            name,
            root,
            dir,
            touched_at: crate::status::now_millis(),
        },
    );
    Ok(json!({ "id": id, "have": have }))
}

fn incoming(id: &str) -> Result<Incoming, String> {
    let mut reg = registry().lock().unwrap();
    let transfer = reg
        .get_mut(id)
        .ok_or("that transfer expired. Start it again")?;
    transfer.touched_at = crate::status::now_millis();
    Ok(transfer.clone())
}

fn put(v: &Value) -> Result<Value, String> {
    let transfer = incoming(str_arg(v, "id"))?;
    let part = str_arg(v, "part");
    let cap = match part {
        "pack" => MAX_PACK_BYTES,
        "session" => MAX_SESSION_BYTES,
        _ => return Err("unknown part".into()),
    };
    let bytes = B64
        .decode(str_arg(v, "b64"))
        .map_err(|e| format!("damaged transfer: {e}"))?;
    let path = transfer.dir.join(part);
    let held = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    if bytes.len() as u64 > CHUNK_BYTES || held + bytes.len() as u64 > cap {
        return Err("that is too large to move".into());
    }
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .and_then(|mut file| file.write_all(&bytes))
        .map_err(|e| e.to_string())?;
    Ok(json!({}))
}

fn land(v: &Value) -> Result<Value, String> {
    let id = str_arg(v, "id");
    let Incoming {
        name, root, dir, ..
    } = incoming(id)?;
    let pack = Some(dir.join("pack")).filter(|p| p.is_file());
    let handed = Handed {
        head: str_arg(v, "head"),
        snapshot: opt_arg(v, "snapshot"),
        branch: opt_arg(v, "branch"),
    };
    let landed = handoffland::land(&name, &root, pack.as_deref(), &handed).and_then(|branch| {
        let session = dir.join("session");
        if session.is_file() {
            handoffland::install_session(&name, &root, str_arg(v, "sessionId"), &session)?;
        }
        Ok(branch)
    });
    release(id);
    Ok(json!({ "branch": landed? }))
}

/// Stop the terminal whose session is leaving, the way a move between
/// accounts does: a turn in progress is interrupted and gets to save where it
/// stopped. Its tab stays, for the session to resume in if the move fails.
fn stop(app: &AppHandle, v: &Value) -> Result<Value, String> {
    let (name, root) = project(v)?;
    let terminal_id = str_arg(v, "terminalId");
    let transcript = crate::claude_dirs::find_transcript(&root, str_arg(v, "sessionId"));
    let carries_on = crate::claude_session_move::interrupt_turn(
        app,
        &name,
        terminal_id,
        transcript.as_ref().map(|(_, path)| path.as_path()),
    );
    crate::pty::stop_terminal_and_wait(app, &app.state::<PtyState>(), terminal_id);
    Ok(json!({ "carriesOn": carries_on }))
}

fn session(v: &Value) -> Result<Value, String> {
    let (_, root) = project(v)?;
    let (_, path) = crate::claude_dirs::find_transcript(&root, str_arg(v, "sessionId"))
        .ok_or_else(|| format!("that conversation has nothing saved on the other {MACHINE}"))?;
    Ok(json!({ "path": path }))
}

/// The asking computer took this folder's state as `sha`, so that is what the
/// folder holds as far as the next handoff is concerned.
fn anchor(v: &Value) -> Result<Value, String> {
    let (_, root) = project(v)?;
    handoffland::anchor(&root, str_arg(v, "sha"))?;
    Ok(json!({}))
}

fn close(v: &Value) -> Result<Value, String> {
    release(str_arg(v, "id"));
    Ok(json!({}))
}

fn release(id: &str) {
    if let Some(transfer) = registry().lock().unwrap().remove(id) {
        let _ = std::fs::remove_dir_all(transfer.dir);
    }
}

fn reap_expired() {
    let now = crate::status::now_millis();
    let stale: Vec<String> = registry()
        .lock()
        .unwrap()
        .iter()
        .filter(|(_, t)| now - t.touched_at > TTL_MS)
        .map(|(id, _)| id.clone())
        .collect();
    for id in stale {
        release(&id);
    }
}
