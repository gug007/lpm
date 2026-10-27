// Host half of syncing files between computers: the paired Mac asks this one
// to list a project's ignored files, describe the files a set of paths holds,
// hand some of them over in pieces, take some in, and undo what it took.
//
// Dedicated frames, like Bring changes: plain JSON text, so file bytes travel
// base64'd, a piece at a time. Every verb runs on its own thread and answers
// through the connection's out-queue, so a slow walk never stalls the socket.
use crate::ignoredwrite::{Batch, Piece};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::mpsc::SyncSender;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

pub const IGNORED_SYNC_FEATURE: &str = "ignoredSync";

/// The most one read or write frame carries, before base64.
pub(crate) const FRAME_BYTES: u64 = 1024 * 1024;
const BATCH_TTL_MS: i64 = 10 * 60 * 1000;
/// How long a folder checked to be a project is taken on trust: a copy asks for
/// hundreds of frames, and each check reads every project's config.
const ROOT_TRUST: Duration = Duration::from_secs(30);

fn batches() -> &'static Mutex<HashMap<String, Batch>> {
    static REG: OnceLock<Mutex<HashMap<String, Batch>>> = OnceLock::new();
    REG.get_or_init(|| Mutex::new(HashMap::new()))
}

fn checked_roots() -> &'static Mutex<HashMap<String, Instant>> {
    static ROOTS: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();
    ROOTS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn handle(out: &SyncSender<String>, t: &str, v: &Value) {
    let req_id = v.get("reqId").cloned().unwrap_or(Value::Null);
    let (out, verb, v) = (out.clone(), t.to_string(), v.clone());
    std::thread::spawn(move || {
        let res = match verb.as_str() {
            "ignoredList" => list(&v),
            "ignoredManifest" => manifest(&v),
            "ignoredRead" => read(&v),
            "ignoredWrite" => write(&v),
            "ignoredFinish" => finish(&v),
            "ignoredUndo" => undo(&v),
            "ignoredOrigin" => origin(&v),
            _ => Err(format!("unknown sync request: {verb}")),
        };
        let frame = match res {
            Ok(value) => crate::peer::result_frame(&req_id, true, value),
            Err(e) => crate::peer::result_frame(&req_id, false, Value::String(e)),
        };
        let _ = out.try_send(frame);
    });
}

fn str_arg<'v>(v: &'v Value, key: &str) -> &'v str {
    v[key].as_str().unwrap_or_default()
}

/// The asking Mac names the folder, so it has to be a project this Mac manages:
/// a paired Mac reads and writes inside projects, never anywhere on disk.
fn checked_root(v: &Value) -> Result<PathBuf, String> {
    let cwd = str_arg(v, "cwd");
    let trusted = checked_roots()
        .lock()
        .unwrap()
        .get(cwd)
        .is_some_and(|at| at.elapsed() < ROOT_TRUST);
    if !trusted {
        if cwd.is_empty() || !Path::new(cwd).is_dir() {
            return Err("the project folder is missing on the other computer".into());
        }
        if !crate::gitbringhost::is_known_project_root(cwd) {
            return Err("that folder is not a project on the other computer".into());
        }
        checked_roots()
            .lock()
            .unwrap()
            .insert(cwd.to_string(), Instant::now());
    }
    Ok(PathBuf::from(cwd))
}

fn list(v: &Value) -> Result<Value, String> {
    let root = checked_root(v)?;
    let listing = crate::ignoredscan::list(&root, str_arg(v, "dir"))?;
    serde_json::to_value(listing).map_err(|e| e.to_string())
}

fn manifest(v: &Value) -> Result<Value, String> {
    let root = checked_root(v)?;
    let paths: Vec<String> = Vec::deserialize(&v["paths"]).unwrap_or_default();
    let files = crate::ignoredscan::manifest(&root, &paths)?;
    Ok(json!({ "files": files }))
}

/// `len` bytes of a file from `offset`. Short means the file changed since it
/// was described, and the copy would land wrong.
pub(crate) fn read_piece(
    root: &Path,
    path: &str,
    offset: u64,
    len: u64,
) -> Result<Vec<u8>, String> {
    let abs = crate::ignoredpath::resolve(root, path)?;
    let meta = std::fs::symlink_metadata(&abs).map_err(|_| format!("{path} is gone"))?;
    if !meta.is_file() {
        return Err(format!("{path} isn't a file any more"));
    }
    let mut data = Vec::with_capacity(len as usize);
    File::open(&abs)
        .and_then(|mut f| {
            f.seek(SeekFrom::Start(offset))?;
            f.take(len).read_to_end(&mut data)
        })
        .map_err(|e| format!("{path}: {e}"))?;
    if (data.len() as u64) < len {
        return Err(format!("{path} changed while it was being copied"));
    }
    Ok(data)
}

fn pieces_of(v: &Value) -> &[Value] {
    v["pieces"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default()
}

fn read(v: &Value) -> Result<Value, String> {
    let root = checked_root(v)?;
    let mut budget = FRAME_BYTES;
    let mut pieces = Vec::new();
    for p in pieces_of(v) {
        let (path, offset) = (str_arg(p, "path"), p["offset"].as_u64().unwrap_or(0));
        let len = p["len"].as_u64().unwrap_or(0).min(budget);
        budget -= len;
        let data = read_piece(&root, path, offset, len)?;
        pieces.push(json!({ "path": path, "offset": offset, "data": B64.encode(data) }));
    }
    Ok(json!({ "pieces": pieces }))
}

fn decode_pieces(v: &Value) -> Result<Vec<Piece>, String> {
    pieces_of(v)
        .iter()
        .map(|p| {
            let mut piece = Piece::deserialize(p).map_err(|e| e.to_string())?;
            piece.data = B64
                .decode(str_arg(p, "data"))
                .map_err(|e| format!("damaged transfer: {e}"))?;
            Ok(piece)
        })
        .collect()
}

fn reap_expired() {
    let now = crate::status::now_millis();
    let stale: Vec<Batch> = {
        let mut reg = batches().lock().unwrap();
        let ids: Vec<String> = reg
            .iter()
            .filter(|(_, b)| now - b.touched_at > BATCH_TTL_MS)
            .map(|(id, _)| id.clone())
            .collect();
        ids.iter().filter_map(|id| reg.remove(id)).collect()
    };
    for batch in stale {
        batch.finish();
    }
}

/// A batch's frames come one at a time, so it is taken out of the registry
/// while its pieces are written: other batches never wait on its disk.
fn write(v: &Value) -> Result<Value, String> {
    reap_expired();
    let id = str_arg(v, "batch");
    let pieces = decode_pieces(v)?;
    let taken = batches().lock().unwrap().remove(id);
    let mut batch = match taken {
        Some(batch) => batch,
        None => Batch::new(id, &checked_root(v)?)?,
    };
    let written = pieces.iter().try_for_each(|p| batch.write(p));
    batches().lock().unwrap().insert(id.to_string(), batch);
    written.map(|_| json!({}))
}

fn finish(v: &Value) -> Result<Value, String> {
    let Some(batch) = batches().lock().unwrap().remove(str_arg(v, "batch")) else {
        return Ok(json!({ "added": 0, "replaced": 0 }));
    };
    let (added, replaced) = batch.finish();
    Ok(json!({ "added": added, "replaced": replaced }))
}

fn undo(v: &Value) -> Result<Value, String> {
    let root = checked_root(v)?;
    let restored = crate::ignoredwrite::undo(str_arg(v, "batch"), &root)?;
    Ok(json!({ "restored": restored.len(), "paths": restored }))
}

fn origin(v: &Value) -> Result<Value, String> {
    let root = checked_root(v)?;
    Ok(json!({ "origin": crate::ignoredpath::origin_of(&root) }))
}
