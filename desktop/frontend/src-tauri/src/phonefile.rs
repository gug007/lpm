// Byte-range reads behind the phone's file preview. A path tapped in a terminal
// can point anywhere on this machine (a rendered video under ~/Movies, a build
// artifact) and be any type, so the phone pulls it in slices and previews the
// reassembled file itself. Unlike `readFile` this is not confined to the project:
// a paired phone already drives a shell here, so it grants nothing new.
use base64::Engine as _;
use serde_json::{json, Value};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

pub const MAX_CHUNK: u64 = 1024 * 1024;
// A path read off a terminal can be a guess (a line-wrapped path, rejoined), so
// the phone tries the next reading when a reply says the file isn't there.
const NOT_FOUND: &str = "File not found.";

#[derive(Debug)]
struct Chunk {
    size: u64,
    mtime: u64,
    data: Vec<u8>,
}

/// `~/…` and absolute paths stand alone; anything else is relative to `root`.
fn resolve(root: Option<&str>, raw: &str) -> Result<PathBuf, String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Err("No file to open.".into());
    }
    let expanded = PathBuf::from(crate::config::expand_home(raw));
    if expanded.is_absolute() {
        return Ok(expanded);
    }
    match root.filter(|r| !r.is_empty()) {
        Some(r) => Ok(Path::new(r).join(expanded)),
        None => Err(NOT_FOUND.into()),
    }
}

fn read_chunk(path: &Path, offset: u64, length: u64) -> Result<Chunk, String> {
    let meta = std::fs::metadata(path).map_err(|_| NOT_FOUND.to_string())?;
    if meta.is_dir() {
        return Err("That path is a folder, not a file.".into());
    }
    let size = meta.len();
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let want = length.min(MAX_CHUNK).min(size.saturating_sub(offset));
    let mut data = Vec::with_capacity(want as usize);
    if want > 0 {
        let mut f = std::fs::File::open(path).map_err(|e| e.to_string())?;
        f.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;
        f.take(want)
            .read_to_end(&mut data)
            .map_err(|e| e.to_string())?;
    }
    Ok(Chunk { size, mtime, data })
}

/// The `fileChunk` reply. `project` supplies the folder relative paths resolve
/// against; an SSH project's files live on another machine, so they're refused.
pub fn chunk_reply(project: &str, raw: &str, offset: u64, length: u64, req_id: Value) -> Value {
    let root = if project.is_empty() {
        None
    } else {
        crate::config::project_root(project).ok()
    };
    let result = match &root {
        Some((_, true)) => Err("Files on an SSH server can't be previewed yet.".to_string()),
        _ => resolve(root.as_ref().map(|(r, _)| r.as_str()), raw)
            .and_then(|p| read_chunk(&p, offset, length).map(|c| (p, c))),
    };
    let mut reply = match result {
        Ok((path, c)) => json!({
            "t": "fileChunk",
            "ok": true,
            "path": path.to_string_lossy(),
            "size": c.size,
            "mtime": c.mtime,
            "offset": offset,
            "data": base64::engine::general_purpose::STANDARD.encode(&c.data),
        }),
        Err(e) => json!({ "t": "fileChunk", "ok": false, "missing": e == NOT_FOUND, "error": e }),
    };
    if !req_id.is_null() {
        reply["reqId"] = req_id;
    }
    reply
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_file(bytes: &[u8]) -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("clip.mp4");
        std::fs::write(&path, bytes).unwrap();
        (dir, path)
    }

    #[test]
    fn resolve_keeps_absolute_and_expands_home() {
        assert_eq!(
            resolve(Some("/p"), "/a/b.mp4").unwrap(),
            PathBuf::from("/a/b.mp4")
        );
        let home = dirs::home_dir().unwrap();
        assert_eq!(
            resolve(None, "~/Movies/x.mp4").unwrap(),
            home.join("Movies/x.mp4")
        );
    }

    #[test]
    fn resolve_joins_relative_to_root_and_needs_one() {
        assert_eq!(
            resolve(Some("/proj"), "scripts/beats.js").unwrap(),
            PathBuf::from("/proj/scripts/beats.js")
        );
        assert!(resolve(None, "scripts/beats.js").is_err());
        assert!(resolve(Some(""), "scripts/beats.js").is_err());
        assert!(resolve(Some("/proj"), "  ").is_err());
    }

    #[test]
    fn read_chunk_slices_and_reports_size() {
        let (_d, path) = temp_file(b"0123456789");
        let c = read_chunk(&path, 3, 4).unwrap();
        assert_eq!(c.data, b"3456");
        assert_eq!(c.size, 10);
        assert!(c.mtime > 0);
        assert_eq!(read_chunk(&path, 8, 100).unwrap().data, b"89");
        assert!(read_chunk(&path, 50, 4).unwrap().data.is_empty());
    }

    #[test]
    fn read_chunk_caps_length() {
        let (_d, path) = temp_file(&vec![7u8; (MAX_CHUNK + 10) as usize]);
        assert_eq!(
            read_chunk(&path, 0, u64::MAX).unwrap().data.len() as u64,
            MAX_CHUNK
        );
    }

    #[test]
    fn read_chunk_rejects_missing_and_folders() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read_chunk(dir.path(), 0, 10)
            .unwrap_err()
            .contains("folder"));
        assert!(read_chunk(&dir.path().join("nope.png"), 0, 10).is_err());
    }

    #[test]
    fn reply_echoes_req_id_and_encodes_data() {
        let (_d, path) = temp_file(b"hello");
        let v = chunk_reply("", path.to_str().unwrap(), 1, 3, json!("r1"));
        assert_eq!(v["ok"], true);
        assert_eq!(v["reqId"], "r1");
        assert_eq!(v["size"], 5);
        assert_eq!(v["offset"], 1);
        assert_eq!(v["data"], "ZWxs");
        let missing = chunk_reply("", "relative/x.png", 0, 3, Value::Null);
        assert_eq!(missing["ok"], false);
        assert_eq!(missing["missing"], true);
        assert!(missing.get("reqId").is_none());
        let dir = chunk_reply("", _d.path().to_str().unwrap(), 0, 3, Value::Null);
        assert_eq!(dir["missing"], false);
    }
}
