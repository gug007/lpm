// Copying files between this Mac and a paired one, in either direction. Each
// end of a copy is a `Side`: this Mac's own folder, read and written directly,
// or the project on the other computer, reached through its host verbs
// (ignoredhost.rs). Small files share a frame; a big one goes a piece at a time.
use crate::ignoredhost::{read_piece, FRAME_BYTES};
use crate::ignoredscan::{FileRec, Listing};
use crate::ignoredwrite::{Batch, Piece};
use crate::peerclient::PeerClientHub;
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;

const WALK_TIMEOUT: Duration = Duration::from_secs(180);
const PIECE_TIMEOUT: Duration = Duration::from_secs(60);
/// Pieces one frame carries at most, however small: a frame of many tiny files
/// is mostly their names.
const MAX_PIECES: usize = 512;

/// The project on the other computer, as its host verbs name it.
pub(crate) struct Remote<'a> {
    pub hub: &'a PeerClientHub,
    pub slug: String,
    pub cwd: String,
}

impl Remote<'_> {
    fn ask(&self, timeout: Duration, mut frame: Value) -> Result<Value, String> {
        frame["cwd"] = json!(self.cwd);
        self.hub.peer_request(&self.slug, timeout, frame)
    }
}

pub(crate) enum Side<'a> {
    Here(PathBuf),
    There(Remote<'a>),
}

enum Writer<'w> {
    Here(Batch),
    There { remote: &'w Remote<'w>, id: String },
}

#[derive(Default)]
pub(crate) struct Outcome {
    pub batch: String,
    pub files: u64,
    pub bytes: u64,
    pub added: u64,
    pub replaced: u64,
    pub error: Option<String>,
}

/// `f` on both sides at once: this Mac's disk work overlaps the other
/// computer's answer.
pub(crate) fn on_both<T: Send>(
    here: &Side,
    there: &Side,
    f: impl Fn(&Side) -> Result<T, String> + Sync,
) -> (Result<T, String>, Result<T, String>) {
    std::thread::scope(|s| {
        let local = s.spawn(|| f(here));
        let remote = f(there);
        let local = local
            .join()
            .unwrap_or_else(|_| Err("reading this Mac failed".into()));
        (local, remote)
    })
}

/// `f` on every side at once, the answers in the same order.
pub(crate) fn on_all<T: Send>(
    sides: &[Side],
    f: impl Fn(&Side) -> Result<T, String> + Sync,
) -> Vec<Result<T, String>> {
    std::thread::scope(|s| {
        let running: Vec<_> = sides.iter().map(|side| s.spawn(|| f(side))).collect();
        running
            .into_iter()
            .map(|r| {
                r.join()
                    .unwrap_or_else(|_| Err("reading a computer failed".into()))
            })
            .collect()
    })
}

impl<'a> Side<'a> {
    pub(crate) fn list(&self, dir: &str) -> Result<Listing, String> {
        match self {
            Side::Here(root) => crate::ignoredscan::list(root, dir),
            Side::There(remote) => {
                let reply = remote.ask(WALK_TIMEOUT, json!({ "t": "ignoredList", "dir": dir }))?;
                serde_json::from_value(reply).map_err(|e| e.to_string())
            }
        }
    }

    pub(crate) fn manifest(&self, paths: &[String]) -> Result<Vec<FileRec>, String> {
        match self {
            Side::Here(root) => crate::ignoredscan::manifest(root, paths),
            Side::There(remote) => {
                let mut reply = remote.ask(
                    WALK_TIMEOUT,
                    json!({ "t": "ignoredManifest", "paths": paths }),
                )?;
                serde_json::from_value(reply["files"].take()).map_err(|e| e.to_string())
            }
        }
    }

    /// The bytes of each `(path, offset, len)`, in order.
    fn read(&self, wants: &[(String, u64, u64)]) -> Result<Vec<Vec<u8>>, String> {
        let remote = match self {
            Side::Here(root) => {
                return wants
                    .iter()
                    .map(|(p, o, l)| read_piece(root, p, *o, *l))
                    .collect()
            }
            Side::There(remote) => remote,
        };
        let pieces: Vec<Value> = wants
            .iter()
            .map(|(p, o, l)| json!({ "path": p, "offset": o, "len": l }))
            .collect();
        let reply = remote.ask(
            PIECE_TIMEOUT,
            json!({ "t": "ignoredRead", "pieces": pieces }),
        )?;
        let got = reply["pieces"]
            .as_array()
            .map(Vec::as_slice)
            .unwrap_or_default();
        if got.len() != wants.len() {
            return Err("the other computer sent the files back incomplete".into());
        }
        got.iter()
            .map(|p| {
                B64.decode(p["data"].as_str().unwrap_or_default())
                    .map_err(|e| format!("damaged transfer: {e}"))
            })
            .collect()
    }

    /// A whole small file, at most one frame's worth.
    pub(crate) fn read_whole(&self, path: &str, size: u64) -> Result<Vec<u8>, String> {
        let wants = [(path.to_string(), 0, size.min(FRAME_BYTES))];
        Ok(self.read(&wants)?.into_iter().next().unwrap_or_default())
    }

    fn writer(&self, id: &str) -> Result<Writer<'_>, String> {
        Ok(match self {
            Side::Here(root) => Writer::Here(Batch::new(id, root)?),
            Side::There(remote) => Writer::There {
                remote,
                id: id.to_string(),
            },
        })
    }

    /// Put back what batch `batch` landed on this side; answers the files.
    pub(crate) fn undo(&self, batch: &str) -> Result<Vec<String>, String> {
        match self {
            Side::Here(root) => crate::ignoredwrite::undo(batch, root),
            Side::There(remote) => {
                let mut reply =
                    remote.ask(WALK_TIMEOUT, json!({ "t": "ignoredUndo", "batch": batch }))?;
                serde_json::from_value(reply["paths"].take()).map_err(|e| e.to_string())
            }
        }
    }

    /// The project's `origin` on this side, when it has one.
    pub(crate) fn origin(&self) -> Result<Option<String>, String> {
        match self {
            Side::Here(root) => Ok(crate::ignoredpath::origin_of(root)),
            Side::There(remote) => {
                let mut reply = remote.ask(PIECE_TIMEOUT, json!({ "t": "ignoredOrigin" }))?;
                serde_json::from_value(reply["origin"].take()).map_err(|e| e.to_string())
            }
        }
    }
}

impl Writer<'_> {
    fn write(&mut self, pieces: &[Piece]) -> Result<(), String> {
        match self {
            Writer::Here(batch) => pieces.iter().try_for_each(|p| batch.write(p)),
            Writer::There { remote, id } => {
                let encoded: Vec<Value> = pieces
                    .iter()
                    .map(|p| {
                        let mut v = serde_json::to_value(p).unwrap_or_default();
                        v["data"] = json!(B64.encode(&p.data));
                        v
                    })
                    .collect();
                let frame = json!({ "t": "ignoredWrite", "batch": id, "pieces": encoded });
                remote.ask(PIECE_TIMEOUT, frame).map(|_| ())
            }
        }
    }

    fn finish(self) -> (u64, u64) {
        match self {
            Writer::Here(batch) => batch.finish(),
            Writer::There { remote, id } => remote
                .ask(PIECE_TIMEOUT, json!({ "t": "ignoredFinish", "batch": id }))
                .map(|r| {
                    let n = |k: &str| r[k].as_u64().unwrap_or(0);
                    (n("added"), n("replaced"))
                })
                .unwrap_or((0, 0)),
        }
    }
}

/// The files `src` holds that `dst` doesn't hold the same.
pub(crate) fn changed(src: &[FileRec], dst: &[FileRec]) -> Vec<FileRec> {
    let there: HashMap<&str, &str> = dst
        .iter()
        .map(|f| (f.path.as_str(), f.digest.as_str()))
        .collect();
    src.iter()
        .filter(|f| there.get(f.path.as_str()) != Some(&f.digest.as_str()))
        .cloned()
        .collect()
}

/// Copy `files` from `src` to `dst`, asking `stop` before each frame. Whatever
/// landed before a failure stays landed and stays undoable, so the outcome
/// always names the batch. `progress` gets `(bytes sent, bytes total, files done)`.
pub(crate) fn copy(
    src: &Side,
    dst: &Side,
    files: &[FileRec],
    stop: &dyn Fn() -> Result<(), String>,
    mut progress: impl FnMut(u64, u64, u64),
) -> Outcome {
    let id = uuid::Uuid::new_v4().to_string();
    let mut out = Outcome {
        batch: id.clone(),
        ..Default::default()
    };
    let mut writer = match dst.writer(&id) {
        Ok(w) => w,
        Err(e) => {
            out.error = Some(e);
            return out;
        }
    };
    let mut run = Run {
        src,
        writer: &mut writer,
        stop,
        total: files.iter().map(|f| f.size).sum(),
        out: &mut out,
        progress: &mut progress,
    };
    let result = run.send_all(files);
    out.error = result.err();
    let (added, replaced) = writer.finish();
    out.added = added;
    out.replaced = replaced;
    out
}

struct Run<'r, 'w, P: FnMut(u64, u64, u64)> {
    src: &'r Side<'r>,
    writer: &'r mut Writer<'w>,
    stop: &'r dyn Fn() -> Result<(), String>,
    total: u64,
    out: &'r mut Outcome,
    progress: &'r mut P,
}

impl<P: FnMut(u64, u64, u64)> Run<'_, '_, P> {
    fn send_all(&mut self, files: &[FileRec]) -> Result<(), String> {
        let mut pending: Vec<(Piece, u64)> = Vec::new();
        let mut budget = FRAME_BYTES;
        for f in files {
            let mut offset = 0;
            loop {
                let len = (f.size - offset).min(budget);
                pending.push((
                    Piece {
                        path: f.path.clone(),
                        offset,
                        size: f.size,
                        mtime: f.mtime,
                        exec: f.exec,
                        link: f.link.clone(),
                        data: Vec::new(),
                    },
                    len,
                ));
                offset += len;
                budget -= len;
                if budget == 0 || pending.len() >= MAX_PIECES {
                    self.flush(&mut pending)?;
                    budget = FRAME_BYTES;
                }
                if offset >= f.size {
                    break;
                }
            }
        }
        if !pending.is_empty() {
            self.flush(&mut pending)?;
        }
        Ok(())
    }

    fn flush(&mut self, pending: &mut Vec<(Piece, u64)>) -> Result<(), String> {
        (self.stop)()?;
        let needs_bytes = |p: &Piece, len: u64| p.link.is_none() && len > 0;
        let wants: Vec<(String, u64, u64)> = pending
            .iter()
            .filter(|(p, len)| needs_bytes(p, *len))
            .map(|(p, len)| (p.path.clone(), p.offset, *len))
            .collect();
        let mut data = self.src.read(&wants)?.into_iter();
        let pieces: Vec<Piece> = pending
            .drain(..)
            .map(|(mut p, len)| {
                if needs_bytes(&p, len) {
                    p.data = data.next().unwrap_or_default();
                }
                p
            })
            .collect();
        self.writer.write(&pieces)?;
        for p in &pieces {
            self.out.bytes += p.data.len() as u64;
            if p.link.is_some() || p.offset + p.data.len() as u64 >= p.size {
                self.out.files += 1;
            }
        }
        (self.progress)(self.out.bytes, self.total, self.out.files);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(root: &std::path::Path, rel: &str, data: &[u8]) {
        let path = root.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, data).unwrap();
    }

    #[test]
    fn only_what_differs_is_copied() {
        let rec = |p: &str, d: &str| FileRec {
            path: p.into(),
            size: 1,
            mtime: 0,
            digest: d.into(),
            exec: false,
            link: None,
        };
        let src = vec![
            rec(".env", "a"),
            rec("certs/k.pem", "b"),
            rec("same.txt", "c"),
        ];
        let dst = vec![
            rec(".env", "z"),
            rec("same.txt", "c"),
            rec("only-there", "d"),
        ];
        let paths: Vec<String> = changed(&src, &dst).into_iter().map(|f| f.path).collect();
        assert_eq!(paths, [".env", "certs/k.pem"]);
    }

    #[test]
    fn a_folder_copies_between_two_projects_and_undoes() {
        let a = tempfile::tempdir().unwrap();
        let b = tempfile::tempdir().unwrap();
        let big: Vec<u8> = (0..(FRAME_BYTES as usize * 2 + 77))
            .map(|i| (i % 251) as u8)
            .collect();
        write(a.path(), "uploads/big.bin", &big);
        write(a.path(), "uploads/small.txt", b"hello");
        write(a.path(), "uploads/empty", b"");
        write(b.path(), "uploads/small.txt", b"old");
        let (src, dst) = (Side::Here(a.path().into()), Side::Here(b.path().into()));
        let (s, d) = on_both(&src, &dst, |side| side.manifest(&["uploads/".into()]));
        let files = changed(&s.unwrap(), &d.unwrap());
        let out = copy(&src, &dst, &files, &|| Ok(()), |_, _, _| {});
        assert!(out.error.is_none(), "{:?}", out.error);
        assert_eq!((out.files, out.added, out.replaced), (3, 2, 1));
        assert_eq!(
            std::fs::read(b.path().join("uploads/big.bin")).unwrap(),
            big
        );
        assert_eq!(
            std::fs::read(b.path().join("uploads/small.txt")).unwrap(),
            b"hello"
        );
        assert_eq!(
            src.manifest(&["uploads/".into()]).unwrap(),
            dst.manifest(&["uploads/".into()]).unwrap(),
            "the copy carries modification times, so both sides now compare equal"
        );

        assert_eq!(dst.undo(&out.batch).unwrap().len(), 3);
        assert_eq!(
            std::fs::read(b.path().join("uploads/small.txt")).unwrap(),
            b"old"
        );
        assert!(!b.path().join("uploads/big.bin").exists());
    }

    #[test]
    fn a_stopped_copy_lands_nothing_more() {
        let a = tempfile::tempdir().unwrap();
        let b = tempfile::tempdir().unwrap();
        write(a.path(), "x.txt", b"x");
        let (src, dst) = (Side::Here(a.path().into()), Side::Here(b.path().into()));
        let files = src.manifest(&["x.txt".into()]).unwrap();
        let out = copy(&src, &dst, &files, &|| Err("stopped".into()), |_, _, _| {});
        assert_eq!(out.error.as_deref(), Some("stopped"));
        assert!(!b.path().join("x.txt").exists());
    }
}
