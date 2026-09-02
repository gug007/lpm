// Host half of a peer file attach: the Mac a terminal runs on takes the file in
// 1 MiB pieces instead of one base64 frame, so what can be attached is bounded by
// disk rather than by the WebSocket's max frame.
//
// Four verbs — begin, chunk, done, abort — over the same dedicated-frame plumbing
// as "bring changes": each runs on its own thread and answers through the
// connection's out-queue, because a blocking handler would stall that
// connection's reads. Chunks are strictly in order and appended as they land, so
// nothing bigger than one chunk is ever held in memory here either.
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use std::sync::mpsc::SyncSender;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager};

/// Advertised in `ready`. A client only streams to a host it has seen this from;
/// anything older still gets the one-frame upload command.
pub const FILE_UPLOAD_FEATURE: &str = "fileUpload";

const CHUNK_BYTES: u64 = 1024 * 1024;
const MAX_UPLOAD_BYTES: u64 = 1024 * 1024 * 1024;
const UPLOAD_TTL_MS: i64 = 10 * 60 * 1000;

const EXPIRED: &str = "that upload expired — start it again";

struct Incoming {
    path: PathBuf,
    file: File,
    bytes: u64,
    received: u64,
    touched_at: i64,
}

fn registry() -> &'static Mutex<HashMap<String, Incoming>> {
    static REG: OnceLock<Mutex<HashMap<String, Incoming>>> = OnceLock::new();
    REG.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Answer one upload request. The caller has already matched the verb.
pub fn handle(app: &AppHandle, out: &SyncSender<String>, t: &str, v: &Value) {
    let req_id = v.get("reqId").cloned().unwrap_or(Value::Null);
    let (app, out, verb, v) = (app.clone(), out.clone(), t.to_string(), v.clone());
    std::thread::spawn(move || {
        let res = match verb.as_str() {
            "uploadBegin" => begin(&v),
            "uploadChunk" => chunk(&v),
            // The ssh hop for a remote-backed pane happens here rather than in
            // `finish` so the state machine itself stays testable without an app.
            "uploadDone" => finish(&v).and_then(|local| {
                crate::upload::host_path_for_terminal(
                    &app.state::<crate::pty::PtyState>(),
                    &str_arg(&v, "terminalId"),
                    local,
                )
                .map(|path| json!({ "path": path }))
            }),
            "uploadAbort" => abort(&v),
            _ => Err(format!("unknown upload request: {verb}")),
        };
        // An abort is fire-and-forget from the client, which sends it on a path
        // that has already failed and is waiting on nothing.
        if req_id.is_null() {
            return;
        }
        let frame = match res {
            Ok(value) => crate::peer::result_frame(&req_id, true, value),
            Err(e) => crate::peer::result_frame(&req_id, false, Value::String(e)),
        };
        let _ = out.try_send(frame);
    });
}

fn str_arg(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

/// The name is chosen by the other Mac, so it is reduced to a basename before it
/// ever reaches the filesystem: only the temp folder made for this one upload may
/// be written to, never a path the sender picked.
fn safe_basename(name: &str) -> String {
    std::path::Path::new(name.trim())
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "file".to_string())
}

fn begin(v: &Value) -> Result<Value, String> {
    reap_expired();
    let bytes = v.get("bytes").and_then(Value::as_u64).unwrap_or(0);
    if bytes > MAX_UPLOAD_BYTES {
        return Err(format!(
            "that file is too large to send ({} MB)",
            bytes / (1024 * 1024)
        ));
    }
    let mut rb = [0u8; 4];
    let _ = getrandom::fill(&mut rb);
    let dir = std::env::temp_dir().join(format!("lpm-upload-{}", hex::encode(rb)));
    std::fs::create_dir_all(&dir).map_err(|e| format!("create upload dir: {e}"))?;
    let path = dir.join(safe_basename(&str_arg(v, "name")));
    let file = File::create(&path).map_err(|e| format!("write file: {e}"))?;

    let upload_id = uuid::Uuid::new_v4().to_string();
    registry().lock().unwrap().insert(
        upload_id.clone(),
        Incoming {
            path,
            file,
            bytes,
            received: 0,
            touched_at: crate::status::now_millis(),
        },
    );
    Ok(json!({ "uploadId": upload_id, "chunk": CHUNK_BYTES }))
}

fn chunk(v: &Value) -> Result<Value, String> {
    let id = str_arg(v, "uploadId");
    let offset = v.get("offset").and_then(Value::as_u64).unwrap_or(0);
    let bytes = B64
        .decode(str_arg(v, "b64"))
        .map_err(|e| format!("damaged transfer: {e}"))?;

    let mut reg = registry().lock().unwrap();
    let up = reg.get_mut(&id).ok_or_else(|| EXPIRED.to_string())?;
    // Appending is the whole write path, so a piece that is not the next one
    // would land at the wrong place with nothing to detect it later.
    if offset != up.received {
        return Err("that upload arrived out of order — start it again".into());
    }
    if up.received + bytes.len() as u64 > up.bytes {
        return Err("that upload sent more than it said it would".into());
    }
    up.file
        .write_all(&bytes)
        .map_err(|e| format!("write file: {e}"))?;
    up.received += bytes.len() as u64;
    up.touched_at = crate::status::now_millis();
    Ok(json!({ "received": up.received }))
}

/// Close the file and hand back the local path it was written to. An incomplete
/// upload is left registered so the sender can carry on rather than start over.
fn finish(v: &Value) -> Result<String, String> {
    let id = str_arg(v, "uploadId");
    let mut reg = registry().lock().unwrap();
    let Some(up) = reg.remove(&id) else {
        return Err(EXPIRED.to_string());
    };
    if up.received != up.bytes {
        reg.insert(id, up);
        return Err("that file did not arrive in full".into());
    }
    Ok(up.path.to_string_lossy().into_owned())
}

fn abort(v: &Value) -> Result<Value, String> {
    let entry = registry().lock().unwrap().remove(&str_arg(v, "uploadId"));
    if let Some(up) = entry {
        discard(up);
    }
    Ok(json!({}))
}

/// Close the handle before unlinking, and take the folder made for this upload
/// with it — it holds nothing else.
fn discard(up: Incoming) {
    let path = up.path.clone();
    drop(up);
    let _ = std::fs::remove_file(&path);
    if let Some(dir) = path.parent() {
        let _ = std::fs::remove_dir(dir);
    }
}

fn reap_expired() {
    let now = crate::status::now_millis();
    let stale: Vec<Incoming> = {
        let mut reg = registry().lock().unwrap();
        let ids: Vec<String> = reg
            .iter()
            .filter(|(_, u)| now - u.touched_at > UPLOAD_TTL_MS)
            .map(|(id, _)| id.clone())
            .collect();
        ids.iter().filter_map(|id| reg.remove(id)).collect()
    };
    for up in stale {
        discard(up);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn begun(name: &str, bytes: u64) -> (String, Value) {
        let reply = begin(&json!({ "name": name, "bytes": bytes })).unwrap();
        let id = reply
            .get("uploadId")
            .and_then(Value::as_str)
            .unwrap()
            .to_string();
        (id, reply)
    }

    fn send(id: &str, offset: u64, data: &[u8]) -> Result<Value, String> {
        chunk(&json!({ "uploadId": id, "offset": offset, "b64": B64.encode(data) }))
    }

    fn path_of(id: &str) -> PathBuf {
        registry().lock().unwrap().get(id).unwrap().path.clone()
    }

    #[test]
    fn a_file_arrives_byte_for_byte() {
        let body: Vec<u8> = (0u8..=255).cycle().take(3000).collect();
        let (id, reply) = begun("report.pdf", body.len() as u64);
        assert_eq!(
            reply.get("chunk").and_then(Value::as_u64),
            Some(CHUNK_BYTES)
        );

        let mut sent = 0usize;
        for piece in body.chunks(512) {
            let ack = send(&id, sent as u64, piece).unwrap();
            sent += piece.len();
            assert_eq!(
                ack.get("received").and_then(Value::as_u64),
                Some(sent as u64)
            );
        }
        let path = finish(&json!({ "uploadId": id })).unwrap();
        assert!(path.ends_with("/report.pdf"), "{path}");
        assert_eq!(std::fs::read(&path).unwrap(), body);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn an_empty_file_needs_no_chunks() {
        let (id, _) = begun("empty.txt", 0);
        let path = finish(&json!({ "uploadId": id })).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), Vec::<u8>::new());
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn a_chunk_out_of_order_is_refused() {
        let (id, _) = begun("a.bin", 8);
        send(&id, 0, b"aaaa").unwrap();
        let err = send(&id, 6, b"bb").unwrap_err();
        assert!(err.contains("out of order"), "{err}");
        // Nothing was written, so the next in-order piece still fits.
        send(&id, 4, b"bbbb").unwrap();
        let path = finish(&json!({ "uploadId": id })).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"aaaabbbb");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn a_chunk_past_the_declared_size_is_refused() {
        let (id, _) = begun("a.bin", 4);
        let err = send(&id, 0, b"aaaaaa").unwrap_err();
        assert!(err.contains("more than it said"), "{err}");
        assert_eq!(std::fs::read(path_of(&id)).unwrap(), Vec::<u8>::new());
        abort(&json!({ "uploadId": id })).unwrap();
    }

    #[test]
    fn finishing_early_is_refused_and_the_upload_survives() {
        let (id, _) = begun("a.bin", 4);
        send(&id, 0, b"aa").unwrap();
        let err = finish(&json!({ "uploadId": id })).unwrap_err();
        assert!(err.contains("in full"), "{err}");
        send(&id, 2, b"bb").unwrap();
        let path = finish(&json!({ "uploadId": id })).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"aabb");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn an_unknown_upload_is_refused_by_every_verb() {
        let id = uuid::Uuid::new_v4().to_string();
        assert_eq!(send(&id, 0, b"x").unwrap_err(), EXPIRED);
        assert_eq!(finish(&json!({ "uploadId": id })).unwrap_err(), EXPIRED);
        // Aborting one twice, or one that never existed, is not an error.
        assert!(abort(&json!({ "uploadId": id })).is_ok());
    }

    #[test]
    fn an_oversize_upload_is_refused_before_any_bytes() {
        let err = begin(&json!({ "name": "huge.zip", "bytes": MAX_UPLOAD_BYTES + 1 })).unwrap_err();
        assert!(err.contains("too large"), "{err}");
    }

    /// The sender picks the name, so a path in it must not become a path here.
    #[test]
    fn a_name_is_reduced_to_its_basename() {
        for (name, want) in [
            ("../../etc/passwd", "passwd"),
            ("/tmp/absolute.txt", "absolute.txt"),
            ("plain.txt", "plain.txt"),
            ("", "file"),
            ("   ", "file"),
        ] {
            let (id, _) = begun(name, 0);
            let path = finish(&json!({ "uploadId": id })).unwrap();
            assert_eq!(
                std::path::Path::new(&path).file_name().unwrap(),
                std::ffi::OsStr::new(want),
                "{name}"
            );
            assert!(
                path.contains("lpm-upload-"),
                "{name} escaped its upload folder: {path}"
            );
            let _ = std::fs::remove_file(&path);
        }
    }

    #[test]
    fn abort_removes_the_partial_file_and_its_folder() {
        let (id, _) = begun("half.bin", 8);
        send(&id, 0, b"aaaa").unwrap();
        let path = path_of(&id);
        abort(&json!({ "uploadId": id })).unwrap();
        assert!(!path.exists());
        assert!(!path.parent().unwrap().exists());
        assert_eq!(send(&id, 4, b"bbbb").unwrap_err(), EXPIRED);
    }

    #[test]
    fn a_stale_upload_is_reaped() {
        let (id, _) = begun("stale.bin", 8);
        let path = path_of(&id);
        registry().lock().unwrap().get_mut(&id).unwrap().touched_at =
            crate::status::now_millis() - UPLOAD_TTL_MS - 1;
        reap_expired();
        assert!(!path.exists());
        assert!(!registry().lock().unwrap().contains_key(&id));
    }
}
