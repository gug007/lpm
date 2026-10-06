//! A file on a paired machine read from this Mac a chunk per request, so its
//! size isn't held to what one frame of the peer connection carries. A host too
//! old to answer chunks is read the old way, in one frame.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::time::UNIX_EPOCH;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde_json::{json, Value};

use crate::peerclient::{
    PeerClientHub, PEER_DISCONNECTED, PEER_NOT_CONNECTED, PEER_REQUEST_TIMED_OUT,
};
use crate::peeruploadrun::LEGACY_MAX_BYTES;

/// Advertised in `ready` by a host that answers `FILE_RANGE_CMD`.
pub(crate) const FILE_RANGE_FEATURE: &str = "fileRange";
pub(crate) const FILE_RANGE_CMD: &str = "file_read_range";

/// One reply's worth, as for uploads: terminal output shares the connection
/// and never waits long behind a frame this size.
const CHUNK: u64 = 1024 * 1024;

fn name_of(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string())
}

/// Host side: up to a chunk of the file from `offset`, never past the size it
/// reports, with its size and modification time.
pub(crate) fn serve_host(args: &Value) -> Result<Value, String> {
    let path = args
        .get("path")
        .and_then(Value::as_str)
        .ok_or_else(|| "missing path".to_string())?;
    let offset = args.get("offset").and_then(Value::as_u64).unwrap_or(0);
    let expanded = crate::config::expand_home(path);
    let name = name_of(path);
    // Checked before opening: opening a FIFO waits for a writer that may never come.
    let meta = std::fs::metadata(&expanded).map_err(|e| format!("can't read {name}: {e}"))?;
    if !meta.is_file() {
        return Err(format!("{name} isn't a file"));
    }
    let size = meta.len();
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_millis() as u64);
    let want = size.saturating_sub(offset).min(CHUNK);
    let mut data = Vec::with_capacity(want as usize);
    File::open(&expanded)
        .and_then(|mut file| {
            file.seek(SeekFrom::Start(offset.min(size)))?;
            file.take(want).read_to_end(&mut data)
        })
        .map_err(|e| format!("can't read {name}: {e}"))?;
    Ok(json!({ "size": size, "mtime": mtime, "data": B64.encode(&data) }))
}

/// Reads all of a file on `slug`, at most `max` bytes, handing each piece to
/// `sink` as it arrives and `(received, total)` to `progress`.
pub(crate) fn fetch(
    hub: &PeerClientHub,
    slug: &str,
    host_path: &str,
    host_name: &str,
    max: u64,
    sink: impl FnMut(&[u8]) -> Result<(), String>,
    progress: impl FnMut(u64, u64),
) -> Result<(), String> {
    let request = |cmd: &str, args: Value| {
        hub.invoke_in_run(slug, cmd, args)
            .map_err(|e| match e.as_str() {
                PEER_NOT_CONNECTED => format!("can't reach {host_name}"),
                PEER_DISCONNECTED => format!("lost the connection to {host_name}"),
                PEER_REQUEST_TIMED_OUT => format!("{host_name} took too long to answer"),
                _ => e,
            })
    };
    let read = HostFile {
        host_path,
        host_name,
        max,
    };
    if hub.supports_file_range(slug) {
        read.in_chunks(request, sink, progress)
    } else {
        read.in_one_frame(request, sink, progress)
    }
}

/// All of a file on `slug`, at most `max` bytes, with its name.
pub(crate) fn read_whole(
    hub: &PeerClientHub,
    slug: &str,
    host_path: &str,
    max: u64,
) -> Result<(String, Vec<u8>), String> {
    let host_name = hub
        .peer_entry(slug)
        .map(|e| crate::remote_machines::display_name(&e))
        .ok_or_else(|| "that machine is no longer paired".to_string())?;
    let mut data = Vec::new();
    fetch(
        hub,
        slug,
        host_path,
        &host_name,
        max,
        |piece| {
            data.extend_from_slice(piece);
            Ok(())
        },
        |_, _| {},
    )?;
    Ok((name_of(host_path), data))
}

fn limit_text(bytes: u64) -> String {
    const GB: u64 = 1024 * 1024 * 1024;
    if bytes >= GB && bytes % GB == 0 {
        format!("{}GB", bytes / GB)
    } else {
        format!("{}MB", bytes / (1024 * 1024))
    }
}

struct HostFile<'a> {
    host_path: &'a str,
    host_name: &'a str,
    max: u64,
}

impl HostFile<'_> {
    fn too_big(&self) -> String {
        format!(
            "{} exceeds {} limit",
            name_of(self.host_path),
            limit_text(self.max)
        )
    }

    fn in_chunks(
        &self,
        mut request: impl FnMut(&str, Value) -> Result<Value, String>,
        mut sink: impl FnMut(&[u8]) -> Result<(), String>,
        mut progress: impl FnMut(u64, u64),
    ) -> Result<(), String> {
        let mut offset = 0u64;
        let mut first = None;
        loop {
            let reply = request(
                FILE_RANGE_CMD,
                json!({ "path": self.host_path, "offset": offset }),
            )?;
            let size = reply.get("size").and_then(Value::as_u64);
            let mtime = reply.get("mtime").and_then(Value::as_u64);
            let data = reply
                .get("data")
                .and_then(Value::as_str)
                .and_then(|b| B64.decode(b).ok());
            let (Some(size), Some(data)) = (size, data) else {
                return Err(format!("{} sent back an unreadable file", self.host_name));
            };
            let (want, stamp) = *first.get_or_insert((size, mtime));
            if want > self.max {
                return Err(self.too_big());
            }
            // A file that grew (a log being written) is read as it was when the
            // read began; one that shrank or was rewritten in place is not.
            let rewritten = size == want && mtime != stamp;
            if size < want || rewritten || (data.is_empty() && offset < want) {
                return Err(format!(
                    "{} changed while it was being read",
                    name_of(self.host_path)
                ));
            }
            let take = data.len().min((want - offset) as usize);
            sink(&data[..take])?;
            offset += take as u64;
            progress(offset, want);
            if offset >= want {
                return Ok(());
            }
        }
    }

    fn in_one_frame(
        &self,
        mut request: impl FnMut(&str, Value) -> Result<Value, String>,
        mut sink: impl FnMut(&[u8]) -> Result<(), String>,
        mut progress: impl FnMut(u64, u64),
    ) -> Result<(), String> {
        let cap = self.max.min(LEGACY_MAX_BYTES);
        let reply = request(
            "notes_read_file_as_input",
            json!({ "path": self.host_path, "maxBytes": cap }),
        )
        .map_err(|e| {
            if cap < self.max && (e.ends_with("MB limit") || e.ends_with("byte limit")) {
                format!(
                    "{} is over {}MB; update lpm on {} to open it here",
                    name_of(self.host_path),
                    cap / (1024 * 1024),
                    self.host_name
                )
            } else {
                e
            }
        })?;
        let data = reply
            .get("data")
            .and_then(Value::as_str)
            .and_then(|b| B64.decode(b).ok())
            .ok_or_else(|| format!("{} sent back an unreadable file", self.host_name))?;
        sink(&data)?;
        progress(data.len() as u64, data.len() as u64);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MB: u64 = 1024 * 1024;

    fn read(max: u64) -> HostFile<'static> {
        HostFile {
            host_path: "/srv/scans/book.pdf",
            host_name: "box",
            max,
        }
    }

    // A host that answers chunks from `file`, as serve_host would.
    fn host(file: Vec<u8>) -> impl FnMut(&str, Value) -> Result<Value, String> {
        move |cmd, args| {
            assert_eq!(cmd, FILE_RANGE_CMD);
            let offset = args["offset"].as_u64().unwrap() as usize;
            let end = (offset + CHUNK as usize).min(file.len());
            Ok(json!({ "size": file.len(), "data": B64.encode(&file[offset..end]) }))
        }
    }

    #[test]
    fn a_file_larger_than_one_frame_arrives_whole_in_chunks() {
        let file: Vec<u8> = (0..(20 * MB + 123)).map(|i| (i % 251) as u8).collect();
        let (mut got, mut seen) = (Vec::new(), Vec::new());
        read(64 * MB)
            .in_chunks(
                host(file.clone()),
                |p| {
                    got.extend_from_slice(p);
                    Ok(())
                },
                |r, t| seen.push((r, t)),
            )
            .unwrap();
        assert_eq!(got, file);
        assert_eq!(seen.len(), 21);
        assert_eq!(seen.last(), Some(&(file.len() as u64, file.len() as u64)));
    }

    #[test]
    fn an_empty_file_is_one_request() {
        let mut calls = 0;
        read(MB)
            .in_chunks(
                |_, _| {
                    calls += 1;
                    Ok(json!({ "size": 0, "data": "" }))
                },
                |_| Ok(()),
                |_, _| {},
            )
            .unwrap();
        assert_eq!(calls, 1);
    }

    #[test]
    fn a_file_over_the_limit_stops_at_the_first_reply() {
        let err = read(MB)
            .in_chunks(host(vec![0; 2 * MB as usize]), |_| Ok(()), |_, _| {})
            .unwrap_err();
        assert_eq!(err, "book.pdf exceeds 1MB limit");
    }

    // A host whose file is `size` bytes with modification time `mtime` at the
    // n-th request.
    fn changing(
        state: impl Fn(usize) -> (u64, u64),
    ) -> impl FnMut(&str, Value) -> Result<Value, String> {
        let mut n = 0;
        move |_, args| {
            let (size, mtime) = state(n);
            n += 1;
            let offset = args["offset"].as_u64().unwrap();
            let len = CHUNK.min(size.saturating_sub(offset));
            Ok(json!({ "size": size, "mtime": mtime, "data": B64.encode(vec![1u8; len as usize]) }))
        }
    }

    #[test]
    fn a_file_still_being_written_is_read_as_it_was_when_the_read_began() {
        let mut got = 0u64;
        read(64 * MB)
            .in_chunks(
                changing(|n| (3 * MB + n as u64 * 4096, 100 + n as u64)),
                |p| {
                    got += p.len() as u64;
                    Ok(())
                },
                |_, total| assert_eq!(total, 3 * MB),
            )
            .unwrap();
        assert_eq!(got, 3 * MB);
    }

    #[test]
    fn a_file_that_shrinks_or_is_rewritten_mid_read_is_refused() {
        let shrunk = read(64 * MB)
            .in_chunks(
                changing(|n| (3 * MB - n as u64, 100)),
                |_| Ok(()),
                |_, _| {},
            )
            .unwrap_err();
        assert_eq!(shrunk, "book.pdf changed while it was being read");
        let rewritten = read(64 * MB)
            .in_chunks(
                changing(|n| (3 * MB, 100 + n as u64)),
                |_| Ok(()),
                |_, _| {},
            )
            .unwrap_err();
        assert_eq!(rewritten, "book.pdf changed while it was being read");
    }

    #[test]
    fn limits_read_in_the_unit_they_were_set_in() {
        assert_eq!(limit_text(64 * MB), "64MB");
        assert_eq!(limit_text(1024 * MB), "1GB");
    }

    #[test]
    fn an_old_host_is_read_in_one_frame_and_asked_to_update_past_it() {
        let mut got = Vec::new();
        read(64 * MB)
            .in_one_frame(
                |cmd, args| {
                    assert_eq!(cmd, "notes_read_file_as_input");
                    assert_eq!(args["maxBytes"], json!(LEGACY_MAX_BYTES));
                    Ok(json!({ "name": "book.pdf", "data": B64.encode(b"%PDF") }))
                },
                |p| {
                    got.extend_from_slice(p);
                    Ok(())
                },
                |_, _| {},
            )
            .unwrap();
        assert_eq!(got, b"%PDF");

        let err = read(64 * MB)
            .in_one_frame(
                |_, _| Err("book.pdf exceeds 8MB limit".into()),
                |_| Ok(()),
                |_, _| {},
            )
            .unwrap_err();
        assert_eq!(
            err,
            "book.pdf is over 8MB; update lpm on box to open it here"
        );
    }

    #[cfg(unix)]
    #[test]
    fn the_host_refuses_a_fifo_without_waiting_on_it() {
        let dir = tempfile::tempdir().unwrap();
        let fifo = dir.path().join("pipe");
        let c = std::ffi::CString::new(fifo.to_string_lossy().as_bytes()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(c.as_ptr(), 0o600) }, 0);
        assert_eq!(
            serve_host(&json!({ "path": fifo.to_string_lossy() })).unwrap_err(),
            "pipe isn't a file"
        );
    }

    #[test]
    fn the_host_serves_a_chunk_and_the_size() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("big.bin");
        std::fs::write(&path, vec![7u8; (CHUNK + 10) as usize]).unwrap();
        let path = path.to_string_lossy();
        let first = serve_host(&json!({ "path": path, "offset": 0 })).unwrap();
        assert_eq!(first["size"], json!(CHUNK + 10));
        assert!(first["mtime"].as_u64().unwrap() > 0);
        assert_eq!(
            B64.decode(first["data"].as_str().unwrap()).unwrap().len() as u64,
            CHUNK
        );
        let last = serve_host(&json!({ "path": path, "offset": CHUNK })).unwrap();
        assert_eq!(
            B64.decode(last["data"].as_str().unwrap()).unwrap(),
            vec![7u8; 10]
        );
        let past = serve_host(&json!({ "path": path, "offset": CHUNK * 9 })).unwrap();
        assert_eq!(past["data"], json!(""));
    }

    #[test]
    fn the_host_refuses_what_isnt_a_readable_file() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().to_string_lossy();
        assert!(serve_host(&json!({ "path": folder }))
            .unwrap_err()
            .ends_with("isn't a file"));
        let missing = dir.path().join("gone.pdf");
        assert!(serve_host(&json!({ "path": missing.to_string_lossy() }))
            .unwrap_err()
            .starts_with("can't read gone.pdf: "));
    }
}
