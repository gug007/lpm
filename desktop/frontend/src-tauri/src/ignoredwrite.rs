// Landing files a sync brings into a project, on whichever computer receives
// them. Each file arrives in pieces into a hidden temp beside its place and is
// swapped in only once whole. Whatever it replaces is moved into a backup kept
// under ~/.lpm, and every landed file is logged, so Undo can put the project
// back exactly as it was.
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Backups older than this are cleared the next time a sync starts.
const KEEP_BACKUPS: Duration = Duration::from_secs(7 * 24 * 60 * 60);
const LOG: &str = "landed.jsonl";
const ROOT: &str = "root.txt";

/// One piece of a file on its way in. The last piece of a file is the one that
/// brings it up to `size`; a link has no pieces and lands at once.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Piece {
    pub path: String,
    #[serde(default)]
    pub offset: u64,
    pub size: u64,
    #[serde(default)]
    pub mtime: u64,
    #[serde(default)]
    pub exec: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link: Option<String>,
    #[serde(skip)]
    pub data: Vec<u8>,
}

#[derive(Serialize, Deserialize)]
struct Landed {
    path: String,
    #[serde(default)]
    replaced: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    old_link: Option<String>,
    /// A folder this batch had to make, which Undo takes away again once empty.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    made_dir: bool,
}

struct Part {
    tmp: PathBuf,
    file: File,
    received: u64,
}

pub(crate) struct Batch {
    id: String,
    root: PathBuf,
    dir: PathBuf,
    parts: HashMap<String, Part>,
    log: Option<File>,
    added: u64,
    replaced: u64,
    pub touched_at: i64,
}

#[cfg(not(test))]
fn batches_dir() -> PathBuf {
    crate::config::lpm_dir()
        .join("ignored-sync")
        .join("backups")
}

#[cfg(test)]
fn batches_dir() -> PathBuf {
    std::env::temp_dir().join("lpm-test-ignored-backups")
}

/// A batch id names a folder under ~/.lpm, so it must be one we could have made.
fn checked_id(id: &str) -> Result<&str, String> {
    let ok = (8..=64).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-');
    if ok {
        Ok(id)
    } else {
        Err("that sync can't be found".into())
    }
}

fn prune_old_backups(base: &Path) {
    let Ok(entries) = std::fs::read_dir(base) else {
        return;
    };
    let now = SystemTime::now();
    for entry in entries.flatten() {
        let old = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| now.duration_since(t).ok())
            .is_some_and(|age| age > KEEP_BACKUPS);
        if old {
            let _ = std::fs::remove_dir_all(entry.path());
        }
    }
}

fn move_or_copy(from: &Path, to: &Path) -> std::io::Result<()> {
    if let Some(parent) = to.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if std::fs::rename(from, to).is_ok() {
        return Ok(());
    }
    std::fs::copy(from, to)?;
    std::fs::remove_file(from)
}

#[cfg(unix)]
fn make_link(target: &str, at: &Path) -> std::io::Result<()> {
    std::os::unix::fs::symlink(target, at)
}

#[cfg(not(unix))]
fn make_link(_target: &str, _at: &Path) -> std::io::Result<()> {
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "links aren't copied to Windows",
    ))
}

fn under(base: &Path, rel: &str) -> PathBuf {
    rel.split('/')
        .fold(base.to_path_buf(), |p, part| p.join(part))
}

/// Bring back to `dest` what `item` replaced, from the backup of batch `dir`.
fn put_back(item: &Landed, dir: &Path, dest: &Path) -> std::io::Result<()> {
    if let Some(target) = &item.old_link {
        make_link(target, dest)
    } else if item.replaced {
        move_or_copy(&under(&dir.join("old"), &item.path), dest)
    } else {
        Ok(())
    }
}

impl Batch {
    pub(crate) fn new(id: &str, root: &Path) -> Result<Self, String> {
        Self::in_dir(&batches_dir(), id, root)
    }

    fn in_dir(base: &Path, id: &str, root: &Path) -> Result<Self, String> {
        let id = checked_id(id)?.to_string();
        prune_old_backups(base);
        let dir = base.join(&id);
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        std::fs::write(dir.join(ROOT), root.to_string_lossy().as_bytes())
            .map_err(|e| e.to_string())?;
        Ok(Batch {
            id,
            root: root.to_path_buf(),
            dir,
            parts: HashMap::new(),
            log: None,
            added: 0,
            replaced: 0,
            touched_at: crate::status::now_millis(),
        })
    }

    /// Take one piece; the file goes in place with its last one.
    pub(crate) fn write(&mut self, piece: &Piece) -> Result<(), String> {
        self.touched_at = crate::status::now_millis();
        let rel = crate::ignoredpath::clean_rel(&piece.path)?;
        let dest = crate::ignoredpath::resolve(&self.root, &rel)?;
        if let Some(target) = &piece.link {
            let tmp = self.temp_beside(&dest)?;
            make_link(target, &tmp).map_err(|e| format!("{rel}: {e}"))?;
            return self.land(&rel, &tmp, &dest);
        }
        if !self.parts.contains_key(&rel) {
            let tmp = self.temp_beside(&dest)?;
            let file = File::create(&tmp).map_err(|e| format!("{rel}: {e}"))?;
            self.parts.insert(
                rel.clone(),
                Part {
                    tmp,
                    file,
                    received: 0,
                },
            );
        }
        let part = self.parts.get_mut(&rel).expect("inserted above");
        if piece.offset != part.received {
            return Err(format!("{rel} arrived out of order"));
        }
        part.file
            .write_all(&piece.data)
            .map_err(|e| format!("{rel}: {e}"))?;
        part.received += piece.data.len() as u64;
        if part.received < piece.size {
            return Ok(());
        }
        if part.received > piece.size {
            return Err(format!("{rel} arrived longer than it is"));
        }
        let mut part = self.parts.remove(&rel).expect("present");
        part.file.flush().map_err(|e| e.to_string())?;
        if piece.mtime > 0 {
            let at = UNIX_EPOCH + Duration::from_millis(piece.mtime);
            let _ = part.file.set_modified(at);
        }
        drop(part.file);
        let _ = crate::fsperm::set_mode(&part.tmp, if piece.exec { 0o755 } else { 0o644 });
        self.land(&rel, &part.tmp, &dest)
    }

    fn temp_beside(&mut self, dest: &Path) -> Result<PathBuf, String> {
        let parent = dest.parent().ok_or("no folder to land in")?;
        let mut missing: Vec<&Path> = parent.ancestors().take_while(|d| !d.exists()).collect();
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        missing.reverse();
        for made in missing {
            if let Ok(rel) = made.strip_prefix(&self.root) {
                let path = rel.to_string_lossy().replace('\\', "/");
                self.log(&Landed {
                    path,
                    replaced: false,
                    old_link: None,
                    made_dir: true,
                })?;
            }
        }
        let name = dest
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let tmp = parent.join(format!(".{name}.lpm-sync-{}", &self.id[..8]));
        let _ = std::fs::remove_file(&tmp);
        Ok(tmp)
    }

    fn land(&mut self, rel: &str, tmp: &Path, dest: &Path) -> Result<(), String> {
        let mut landed = Landed {
            path: rel.to_string(),
            replaced: false,
            old_link: None,
            made_dir: false,
        };
        if let Ok(meta) = std::fs::symlink_metadata(dest) {
            if meta.is_dir() {
                let _ = std::fs::remove_file(tmp);
                return Err(format!("{rel}: a folder is in the way"));
            }
            if meta.file_type().is_symlink() {
                landed.old_link = std::fs::read_link(dest)
                    .ok()
                    .map(|t| t.to_string_lossy().into_owned());
                std::fs::remove_file(dest).map_err(|e| e.to_string())?;
            } else {
                move_or_copy(dest, &under(&self.dir.join("old"), rel))
                    .map_err(|e| format!("{rel}: {e}"))?;
            }
            landed.replaced = true;
        }
        if let Err(e) = std::fs::rename(tmp, dest) {
            let _ = std::fs::remove_file(tmp);
            if put_back(&landed, &self.dir, dest).is_err() {
                // Undo is the way back now, so the backup must outlive the batch.
                self.log(&landed)?;
                self.replaced += 1;
            }
            return Err(format!("{rel}: {e}"));
        }
        self.log(&landed)?;
        if landed.replaced {
            self.replaced += 1;
        } else {
            self.added += 1;
        }
        Ok(())
    }

    fn log(&mut self, landed: &Landed) -> Result<(), String> {
        if self.log.is_none() {
            let file = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(self.dir.join(LOG))
                .map_err(|e| e.to_string())?;
            self.log = Some(file);
        }
        let line = serde_json::to_string(landed).map_err(|e| e.to_string())?;
        writeln!(self.log.as_mut().expect("opened above"), "{line}").map_err(|e| e.to_string())
    }

    /// Stop here: half-arrived files are thrown away, whole ones stay (Undo
    /// still reaches them). A batch that landed nothing leaves no backup behind.
    pub(crate) fn finish(mut self) -> (u64, u64) {
        self.log = None;
        for (_, part) in self.parts.drain() {
            drop(part.file);
            let _ = std::fs::remove_file(&part.tmp);
        }
        if self.added + self.replaced == 0 {
            let _ = std::fs::remove_dir_all(&self.dir);
        }
        (self.added, self.replaced)
    }
}

/// Put the project back as it was before batch `id`: files it added are
/// removed, files it replaced come back. Answers the files put back.
pub(crate) fn undo(id: &str, root: &Path) -> Result<Vec<String>, String> {
    undo_in(&batches_dir(), id, root)
}

fn undo_in(base: &Path, id: &str, root: &Path) -> Result<Vec<String>, String> {
    let dir = base.join(checked_id(id)?);
    let recorded = std::fs::read_to_string(dir.join(ROOT))
        .map_err(|_| "that sync can't be undone any more".to_string())?;
    if Path::new(recorded.trim()) != root {
        return Err("that sync belongs to another project".into());
    }
    let log = File::open(dir.join(LOG)).map_err(|_| "that sync changed nothing".to_string())?;
    let landed: Vec<Landed> = std::io::BufReader::new(log)
        .lines()
        .map_while(Result::ok)
        .filter_map(|l| serde_json::from_str(&l).ok())
        .collect();
    let mut restored = Vec::new();
    for item in landed.iter().rev() {
        let dest = crate::ignoredpath::resolve(root, &item.path)?;
        if item.made_dir {
            let _ = std::fs::remove_dir(&dest);
            continue;
        }
        let _ = std::fs::remove_file(&dest);
        put_back(item, &dir, &dest).map_err(|e| format!("{}: {e}", item.path))?;
        restored.push(item.path.clone());
    }
    let _ = std::fs::remove_dir_all(&dir);
    Ok(restored)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn piece(path: &str, data: &[u8], offset: u64, size: u64) -> Piece {
        Piece {
            path: path.into(),
            offset,
            size,
            mtime: 1_700_000_000_000,
            exec: false,
            link: None,
            data: data.to_vec(),
        }
    }

    fn with_lpm_dir<T>(f: impl FnOnce(&Path) -> T) -> T {
        let base = tempfile::tempdir().unwrap();
        f(base.path())
    }

    #[test]
    fn a_file_lands_whole_and_undo_puts_the_old_one_back() {
        with_lpm_dir(|base| {
            let root = tempfile::tempdir().unwrap();
            std::fs::write(root.path().join(".env"), "OLD=1\n").unwrap();
            let id = uuid::Uuid::new_v4().to_string();
            let mut batch = Batch::in_dir(base, &id, root.path()).unwrap();
            batch.write(&piece(".env", b"NEW=", 0, 6)).unwrap();
            assert_eq!(
                std::fs::read_to_string(root.path().join(".env")).unwrap(),
                "OLD=1\n",
                "untouched until whole"
            );
            batch.write(&piece(".env", b"2\n", 4, 6)).unwrap();
            batch.write(&piece("certs/key.pem", b"k", 0, 1)).unwrap();
            assert_eq!(batch.finish(), (1, 1));
            assert_eq!(
                std::fs::read_to_string(root.path().join(".env")).unwrap(),
                "NEW=2\n"
            );

            assert_eq!(
                undo_in(base, &id, root.path()).unwrap(),
                ["certs/key.pem", ".env"]
            );
            assert_eq!(
                std::fs::read_to_string(root.path().join(".env")).unwrap(),
                "OLD=1\n"
            );
            assert!(
                !root.path().join("certs/key.pem").exists(),
                "an added file goes again"
            );
        });
    }

    #[test]
    fn pieces_out_of_order_and_paths_out_of_the_project_are_refused() {
        with_lpm_dir(|base| {
            let root = tempfile::tempdir().unwrap();
            let mut batch =
                Batch::in_dir(base, &uuid::Uuid::new_v4().to_string(), root.path()).unwrap();
            assert!(batch.write(&piece("../escape", b"x", 0, 1)).is_err());
            assert!(batch.write(&piece("a.txt", b"x", 3, 4)).is_err());
            std::fs::create_dir(root.path().join("dir")).unwrap();
            assert!(
                batch.write(&piece("dir", b"x", 0, 1)).is_err(),
                "a folder is never replaced by a file"
            );
            assert_eq!(batch.finish(), (0, 0));
            assert!(std::fs::read_dir(root.path()).unwrap().all(|e| !e
                .unwrap()
                .file_name()
                .to_string_lossy()
                .contains("lpm-sync")));
        });
    }

    #[test]
    fn a_swap_that_fails_leaves_the_old_file_in_place() {
        with_lpm_dir(|base| {
            let root = tempfile::tempdir().unwrap();
            let dest = root.path().join(".env");
            std::fs::write(&dest, "OLD=1\n").unwrap();
            let mut batch =
                Batch::in_dir(base, &uuid::Uuid::new_v4().to_string(), root.path()).unwrap();
            let gone = root.path().join(".env.lpm-sync-missing");
            assert!(batch.land(".env", &gone, &dest).is_err());
            assert_eq!(std::fs::read_to_string(&dest).unwrap(), "OLD=1\n");
            assert_eq!(batch.finish(), (0, 0));
        });
    }

    #[test]
    fn undo_refuses_another_project_and_made_up_ids() {
        with_lpm_dir(|base| {
            let root = tempfile::tempdir().unwrap();
            let id = uuid::Uuid::new_v4().to_string();
            let mut batch = Batch::in_dir(base, &id, root.path()).unwrap();
            batch.write(&piece("a.txt", b"a", 0, 1)).unwrap();
            batch.finish();
            let other = tempfile::tempdir().unwrap();
            assert!(undo_in(base, &id, other.path()).is_err());
            assert!(undo_in(base, "../../etc", root.path()).is_err());
        });
    }
}
