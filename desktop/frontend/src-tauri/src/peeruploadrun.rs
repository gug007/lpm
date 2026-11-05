// Client half of a peer file attach: a file dropped on a terminal that runs on
// another Mac exists only here, so its bytes have to travel.
//
// A host that advertises `fileUpload` takes it in pieces — peak memory is one
// chunk, and how big a file may be is the host's disk rather than one WebSocket
// frame. A host on an older lpm only knows the single-frame upload command, which
// that frame caps; past the cap there is nothing to do but say so, naming what
// would fix it. Every step reports through `peer-upload-progress` so a transfer
// long enough to notice can be shown.
use crate::gitbringapply::next_chunk;
use crate::peerclient::PeerClientHub;
use crate::sys::MACHINE;
use crate::upload::basename;
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde::Serialize;
use serde_json::{json, Value};
use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

const BEGIN_TIMEOUT: Duration = Duration::from_secs(15);
const CHUNK_TIMEOUT: Duration = Duration::from_secs(60);
/// The host may still have to scp the finished file on to an ssh-backed pane
/// before it can answer with a path.
const DONE_TIMEOUT: Duration = Duration::from_secs(600);

/// What one base64 JSON frame carries: tungstenite's 16 MiB default max frame,
/// with room for the ~4/3 expansion and the envelope.
pub(crate) const LEGACY_MAX_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Progress<'a> {
    token: &'a str,
    name: &'a str,
    sent: u64,
    total: u64,
}

#[derive(Debug, PartialEq)]
enum Plan {
    Chunked,
    SingleFrame,
    Refuse(String),
}

/// How this file can reach the host, given what that host speaks. The refusal is
/// the only outcome the user has to act on, so it says what to do.
fn plan(size: u64, name: &str, supports_chunks: bool) -> Plan {
    if supports_chunks {
        return Plan::Chunked;
    }
    if size <= LEGACY_MAX_BYTES {
        return Plan::SingleFrame;
    }
    Plan::Refuse(format!(
        "{name} is {} MB — update lpm on the other {MACHINE} to send files over {} MB",
        size.div_ceil(1024 * 1024),
        LEGACY_MAX_BYTES / (1024 * 1024)
    ))
}

/// Send one local file to the Mac `terminal_id` runs on and return the RAW path
/// that machine can read it at. `terminal_id` is the host's own id — the peer
/// marker is stripped by the caller, which also picked the peer.
///
/// `token` stamps every progress event for this transfer so the UI can follow it.
#[tauri::command]
pub async fn peer_upload_file(
    app: AppHandle,
    hub: State<'_, PeerClientHub>,
    slug: String,
    terminal_id: String,
    path: String,
    token: String,
) -> Result<String, String> {
    let hub = hub.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        send(&app, &hub, &slug, &terminal_id, &path, &token)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn send(
    app: &AppHandle,
    hub: &PeerClientHub,
    slug: &str,
    terminal_id: &str,
    path: &str,
    token: &str,
) -> Result<String, String> {
    let local = crate::config::expand_home(path);
    let name = basename(&local);
    let meta = std::fs::metadata(&local).map_err(|e| format!("could not read {name}: {e}"))?;
    if meta.is_dir() {
        return Err(format!("{name} is a directory"));
    }
    match plan(meta.len(), &name, hub.supports_file_upload(slug)) {
        Plan::Refuse(why) => Err(why),
        Plan::SingleFrame => single_frame(hub, slug, terminal_id, &local, &name),
        Plan::Chunked => chunked(app, hub, slug, terminal_id, &local, &name, token),
    }
}

fn single_frame(
    hub: &PeerClientHub,
    slug: &str,
    terminal_id: &str,
    local: &str,
    name: &str,
) -> Result<String, String> {
    let bytes = std::fs::read(local).map_err(|e| format!("could not read {name}: {e}"))?;
    let mime = mime_guess::from_path(local)
        .first()
        .map(|m| m.essence_str().to_string())
        .unwrap_or_else(|| "application/octet-stream".to_string());
    let reply = hub.invoke_blocking(
        slug,
        "upload_file_for_terminal",
        json!({
            "terminalId": terminal_id,
            "b64Data": B64.encode(&bytes),
            "mimeType": mime,
            "name": name,
        }),
    )?;
    saved_path(&reply, name)
}

fn chunked(
    app: &AppHandle,
    hub: &PeerClientHub,
    slug: &str,
    terminal_id: &str,
    local: &str,
    name: &str,
    token: &str,
) -> Result<String, String> {
    let done = send_in_pieces(
        hub,
        slug,
        Path::new(local),
        name,
        json!({ "t": "uploadDone", "terminalId": terminal_id }),
        DONE_TIMEOUT,
        |sent, total| progress(app, token, name, sent, total),
    )?;
    saved_path(done.get("path").unwrap_or(&Value::Null), name)
}

/// Send `local` to a host that advertises `fileUpload` in pieces, then close the
/// upload with `finish`, a frame its id is added to. Answers with the host's
/// reply to that frame. `progress` gets `(sent, total)` as the pieces land.
pub(crate) fn send_in_pieces(
    hub: &PeerClientHub,
    slug: &str,
    local: &Path,
    name: &str,
    mut finish: Value,
    finish_timeout: Duration,
    mut progress: impl FnMut(u64, u64),
) -> Result<Value, String> {
    let mut file = File::open(local).map_err(|e| format!("could not read {name}: {e}"))?;
    let total = file
        .metadata()
        .map_err(|e| format!("could not read {name}: {e}"))?
        .len();
    let begun = hub.peer_request(
        slug,
        BEGIN_TIMEOUT,
        json!({ "t": "uploadBegin", "name": name, "bytes": total }),
    )?;
    let upload_id = begun
        .get("uploadId")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    if upload_id.is_empty() {
        return Err(format!("the other {MACHINE} did not take {name}"));
    }
    let chunk = begun.get("chunk").and_then(Value::as_u64).unwrap_or(0);

    let outcome = stream(
        hub,
        slug,
        &mut file,
        name,
        total,
        &upload_id,
        chunk,
        &mut progress,
    )
    .and_then(|()| {
        finish["uploadId"] = json!(upload_id);
        hub.peer_request(slug, finish_timeout, finish)
    });
    // Best-effort and unanswered: this side has already failed, and the host
    // reaps what it holds anyway — telling it now just frees the disk sooner.
    if outcome.is_err() {
        let _ = hub.notify_peer(slug, json!({ "t": "uploadAbort", "uploadId": upload_id }));
    }
    outcome
}

#[allow(clippy::too_many_arguments)]
fn stream(
    hub: &PeerClientHub,
    slug: &str,
    file: &mut File,
    name: &str,
    total: u64,
    upload_id: &str,
    chunk: u64,
    progress: &mut impl FnMut(u64, u64),
) -> Result<(), String> {
    let mut sent = 0u64;
    progress(0, total);
    while let Some((offset, len)) = next_chunk(sent, total, chunk) {
        let mut buf = vec![0u8; len as usize];
        file.read_exact(&mut buf)
            .map_err(|e| format!("could not read {name}: {e}"))?;
        hub.peer_request(
            slug,
            CHUNK_TIMEOUT,
            json!({
                "t": "uploadChunk",
                "uploadId": upload_id,
                "offset": offset,
                "b64": B64.encode(&buf),
            }),
        )?;
        sent += len;
        progress(sent, total);
    }
    Ok(())
}

fn progress(app: &AppHandle, token: &str, name: &str, sent: u64, total: u64) {
    let _ = app.emit(
        "peer-upload-progress",
        Progress {
            token,
            name,
            sent,
            total,
        },
    );
}

fn saved_path(v: &Value, name: &str) -> Result<String, String> {
    match v.as_str() {
        Some(p) if !p.is_empty() => Ok(p.to_string()),
        _ => Err(format!("the other {MACHINE} did not save {name}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_host_that_takes_chunks_always_gets_them() {
        assert_eq!(plan(0, "a.txt", true), Plan::Chunked);
        assert_eq!(plan(4 * 1024 * 1024 * 1024, "vm.img", true), Plan::Chunked);
    }

    #[test]
    fn an_older_host_gets_one_frame_up_to_the_frame_cap() {
        assert_eq!(plan(0, "a.txt", false), Plan::SingleFrame);
        assert_eq!(plan(LEGACY_MAX_BYTES, "a.zip", false), Plan::SingleFrame);
    }

    /// The message is the only thing the user can act on, so it names the file,
    /// how big it is, and the one thing that would let it through.
    #[test]
    fn an_older_host_refuses_past_the_cap_and_says_why() {
        let Plan::Refuse(why) = plan(20 * 1024 * 1024, "cp4500.zip", false) else {
            panic!("a 20 MB file cannot travel in one frame");
        };
        assert!(why.contains("cp4500.zip"), "{why}");
        assert!(why.contains("20 MB"), "{why}");
        assert!(
            why.contains(&format!("update lpm on the other {MACHINE}")),
            "{why}"
        );
        // Rounded up, so a file just over the cap never reads as being at it.
        let Plan::Refuse(just_over) = plan(LEGACY_MAX_BYTES + 1, "a.zip", false) else {
            panic!("one byte past the cap is still past it");
        };
        assert!(just_over.contains("9 MB"), "{just_over}");
    }

    /// The frontend keys its progress toast on these names.
    #[test]
    fn progress_events_are_camel_case() {
        let json = serde_json::to_value(Progress {
            token: "t-1",
            name: "a.zip",
            sent: 3,
            total: 9,
        })
        .unwrap();
        assert_eq!(
            json,
            json!({ "token": "t-1", "name": "a.zip", "sent": 3, "total": 9 })
        );
    }

    #[test]
    fn an_answer_without_a_path_names_the_file_that_did_not_land() {
        for answer in [Value::Null, json!(""), json!(42)] {
            let err = saved_path(&answer, "notes.txt").unwrap_err();
            assert!(err.contains("notes.txt"), "{err}");
        }
        assert_eq!(
            saved_path(&json!("/host/notes.txt"), "notes.txt"),
            Ok("/host/notes.txt".to_string())
        );
    }
}
