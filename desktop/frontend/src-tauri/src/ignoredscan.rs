// Reading a project's files the same way on every computer, so two answers can
// be compared: what git ignores there, each entry's size, file count and digest,
// and the files a chosen set of paths holds. Shared by this Mac's own side of a
// sync and by the host verbs a paired Mac asks (ignoredhost.rs).
use crate::ignoredpath::{
    clean_rel, is_exec, link_target, mtime_ms, resolve, skipped, sorted_children,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::Metadata;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

/// Files up to this size compare by content. A bigger one compares by size and
/// modification time, which every copy made by a sync carries over.
const HASH_MAX: u64 = 4 * 1024 * 1024;
/// A folder's digest reads the content of its small files, the ones keys and
/// certificates live in, until this much has been read; past it, sizes only.
/// The walk is sorted, so two identical folders stop at the same file.
const DIR_HASH_FILE_MAX: u64 = 64 * 1024;
const DIR_HASH_BUDGET: u64 = 32 * 1024 * 1024;
/// More files than this in one folder, or one sync, is refused rather than read.
pub(crate) const WALK_MAX: u64 = 400_000;
/// The entries one listing returns; the rest are counted.
const LIST_MAX: usize = 2_000;
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Entry {
    /// Project-relative and `/`-separated; a folder's ends in `/`.
    pub path: String,
    pub dir: bool,
    pub size: u64,
    pub files: u64,
    /// Milliseconds; a folder's newest file.
    pub mtime: u64,
    pub digest: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Listing {
    pub entries: Vec<Entry>,
    /// Entries past the ones returned.
    pub more: u64,
    /// The project's `origin`, on the listing of its ignored entries.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub origin: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileRec {
    pub path: String,
    pub size: u64,
    pub mtime: u64,
    pub digest: String,
    #[serde(default)]
    pub exec: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link: Option<String>,
}

/// Content hashes by path, size and modification time.
type HashCache = HashMap<(PathBuf, u64, u64), String>;

fn hash_cache() -> &'static Mutex<HashCache> {
    static CACHE: OnceLock<Mutex<HashCache>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// The SHA-256 of a file's content, remembered for as long as its size and
/// modification time stay the same: a dialog lists, compares and copies the same
/// files within seconds.
fn content_hash(path: &Path, meta: &Metadata) -> String {
    let key = (path.to_path_buf(), meta.len(), mtime_ms(meta));
    if let Some(hit) = hash_cache().lock().unwrap().get(&key) {
        return hit.clone();
    }
    let digest =
        crate::hostfilesave::sha256_file(path).unwrap_or_else(|_| format!("unreadable:{}", key.2));
    let mut cache = hash_cache().lock().unwrap();
    if cache.len() > 200_000 {
        cache.clear();
    }
    cache.insert(key, digest.clone());
    digest
}

/// A pipe, socket or device holds nothing to copy, and opening a pipe waits for
/// a writer that may never come.
fn copyable(meta: &Metadata) -> bool {
    meta.is_dir() || meta.is_file() || meta.file_type().is_symlink()
}

fn file_digest(path: &Path, meta: &Metadata) -> String {
    if meta.len() <= HASH_MAX {
        return content_hash(path, meta);
    }
    format!("big:{}:{}", meta.len(), mtime_ms(meta) / 1000)
}

#[derive(Default)]
struct Totals {
    files: u64,
    size: u64,
    mtime: u64,
    hashed: u64,
    over: bool,
}

fn walk_folder(dir: &Path, rel: &str, t: &mut Totals, hasher: &mut Sha256) {
    for (name, path) in sorted_children(dir) {
        if t.over {
            return;
        }
        let Some(meta) = std::fs::symlink_metadata(&path).ok().filter(copyable) else {
            continue;
        };
        let child = format!("{rel}{name}");
        if meta.file_type().is_symlink() {
            hasher.update(format!("{child}\0l:{}\n", link_target(&path)));
        } else if meta.is_dir() {
            walk_folder(&path, &format!("{child}/"), t, hasher);
        } else {
            t.files += 1;
            t.size += meta.len();
            t.mtime = t.mtime.max(mtime_ms(&meta));
            let digest =
                if meta.len() <= DIR_HASH_FILE_MAX && t.hashed + meta.len() <= DIR_HASH_BUDGET {
                    t.hashed += meta.len();
                    content_hash(&path, &meta)
                } else {
                    format!("n:{}", meta.len())
                };
            hasher.update(format!("{child}\0{digest}\n"));
            t.over = t.files > WALK_MAX;
        }
    }
}

/// One entry as the tree shows it: a file or link as itself, a folder with
/// everything under it added up.
fn entry(abs: &Path, rel: &str) -> Option<Entry> {
    let meta = std::fs::symlink_metadata(abs).ok().filter(copyable)?;
    let rel = rel.trim_end_matches('/');
    if !meta.is_dir() {
        let rec = file_rec(abs, rel.to_string(), &meta);
        return Some(Entry {
            path: rec.path,
            dir: false,
            size: rec.size,
            files: 1,
            mtime: rec.mtime,
            digest: rec.digest,
        });
    }
    let mut totals = Totals::default();
    let mut hasher = Sha256::new();
    walk_folder(abs, "", &mut totals, &mut hasher);
    let digest = if totals.over {
        format!("over:{}", uuid::Uuid::new_v4())
    } else {
        hex::encode(hasher.finalize())
    };
    Some(Entry {
        path: format!("{rel}/"),
        dir: true,
        size: totals.size,
        files: totals.files,
        mtime: totals.mtime,
        digest,
    })
}

/// Everything git ignores in the project, as git reports it: a folder that is
/// ignored as a whole is one entry, an ignored file deeper in a tracked folder
/// is its own.
fn ignored_paths(root: &Path) -> Result<Vec<String>, String> {
    let cwd = root.to_string_lossy();
    let out = crate::git::git_command(
        &cwd,
        &[
            "ls-files",
            "--others",
            "--ignored",
            "--exclude-standard",
            "--directory",
            "-z",
        ],
        &[],
    )
    .output()
    .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err("this project isn't a Git repository".into());
    }
    let paths: Vec<String> = String::from_utf8_lossy(&out.stdout)
        .split('\0')
        .filter(|p| !p.is_empty())
        .filter(|p| !p.trim_end_matches('/').split('/').any(skipped))
        .map(str::to_string)
        .collect();
    // An untracked folder holding only ignored files comes back as the folder
    // and as its files. The files are what is ignored; the folder may also hold
    // files that aren't.
    Ok(paths
        .iter()
        .filter(|p| {
            !(p.ends_with('/') && paths.iter().any(|q| q != *p && q.starts_with(p.as_str())))
        })
        .cloned()
        .collect())
}

/// The project's ignored entries (`dir` empty), or the children of one ignored
/// folder in it.
pub(crate) fn list(root: &Path, dir: &str) -> Result<Listing, String> {
    let mut rels: Vec<String> = if dir.is_empty() {
        ignored_paths(root)?
    } else {
        let folder = clean_rel(dir)?;
        let abs = resolve(root, &folder)?;
        if !abs.is_dir() {
            return Ok(Listing {
                entries: vec![],
                more: 0,
                origin: None,
            });
        }
        sorted_children(&abs)
            .into_iter()
            .map(|(name, _)| format!("{folder}/{name}"))
            .collect()
    };
    rels.sort();
    let more = rels.len().saturating_sub(LIST_MAX) as u64;
    let entries = rels
        .iter()
        .take(LIST_MAX)
        .filter_map(|rel| entry(&resolve(root, rel).ok()?, rel))
        .collect();
    let origin = dir
        .is_empty()
        .then(|| crate::ignoredpath::origin_of(root))
        .flatten();
    Ok(Listing {
        entries,
        more,
        origin,
    })
}

fn file_rec(abs: &Path, rel: String, meta: &Metadata) -> FileRec {
    if meta.file_type().is_symlink() {
        let target = link_target(abs);
        return FileRec {
            path: rel,
            size: 0,
            mtime: mtime_ms(meta),
            digest: format!("l:{target}"),
            exec: false,
            link: Some(target),
        };
    }
    FileRec {
        path: rel,
        size: meta.len(),
        mtime: mtime_ms(meta),
        digest: file_digest(abs, meta),
        exec: is_exec(meta),
        link: None,
    }
}

fn collect(abs: &Path, rel: &str, out: &mut HashMap<String, FileRec>) -> Result<(), String> {
    let Some(meta) = std::fs::symlink_metadata(abs).ok().filter(copyable) else {
        return Ok(());
    };
    if !meta.is_dir() || meta.file_type().is_symlink() {
        out.insert(rel.to_string(), file_rec(abs, rel.to_string(), &meta));
    } else {
        for (name, path) in sorted_children(abs) {
            collect(&path, &format!("{rel}/{name}"), out)?;
        }
    }
    if out.len() as u64 > WALK_MAX {
        return Err(format!("{rel} holds more than {WALK_MAX} files"));
    }
    Ok(())
}

/// Every file the given paths hold, each with what it compares by. A path this
/// computer doesn't have is simply absent from the answer.
pub(crate) fn manifest(root: &Path, paths: &[String]) -> Result<Vec<FileRec>, String> {
    let mut out = HashMap::new();
    for path in paths {
        let rel = clean_rel(path)?;
        collect(&resolve(root, &rel)?, &rel, &mut out)?;
    }
    let mut files: Vec<FileRec> = out.into_values().collect();
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(root: &Path, rel: &str, data: &str) {
        let path = root.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, data).unwrap();
    }

    fn repo() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        crate::git::git_out(&root.to_string_lossy(), &["init", "-q"]).unwrap();
        write(
            root,
            ".gitignore",
            ".env\nnode_modules/\ncerts/\n*.local.json\n",
        );
        write(root, ".env", "KEY=1\n");
        write(root, "src/app.js", "tracked\n");
        write(root, "config/stripe.local.json", "{}\n");
        write(root, "node_modules/a/index.js", "module\n");
        write(root, "node_modules/b.js", "b\n");
        write(root, "certs/key.pem", "secret\n");
        write(root, "certs/.DS_Store", "junk");
        dir
    }

    #[test]
    fn the_listing_holds_what_git_ignores_and_nothing_tracked() {
        let dir = repo();
        let listing = list(dir.path(), "").unwrap();
        let paths: Vec<&str> = listing.entries.iter().map(|e| e.path.as_str()).collect();
        assert_eq!(
            paths,
            [
                ".env",
                "certs/",
                "config/stripe.local.json",
                "node_modules/"
            ]
        );
        let modules = listing
            .entries
            .iter()
            .find(|e| e.path == "node_modules/")
            .unwrap();
        assert!(modules.dir);
        assert_eq!(modules.files, 2);
        let certs = listing.entries.iter().find(|e| e.path == "certs/").unwrap();
        assert_eq!(certs.files, 1, "system files are never counted");
    }

    #[test]
    fn a_folder_lists_its_children_and_compares_by_content() {
        let a = repo();
        let b = repo();
        let children = list(a.path(), "node_modules/").unwrap();
        let paths: Vec<&str> = children.entries.iter().map(|e| e.path.as_str()).collect();
        assert_eq!(paths, ["node_modules/a/", "node_modules/b.js"]);

        let digest = |root: &Path| {
            list(root, "")
                .unwrap()
                .entries
                .into_iter()
                .find(|e| e.path == "certs/")
                .unwrap()
                .digest
        };
        assert_eq!(
            digest(a.path()),
            digest(b.path()),
            "same content, same digest"
        );
        write(b.path(), "certs/key.pem", "SECRET\n");
        assert_ne!(
            digest(a.path()),
            digest(b.path()),
            "a same-size edit still differs"
        );
    }

    #[test]
    fn a_manifest_expands_folders_into_their_files() {
        let dir = repo();
        let files = manifest(
            dir.path(),
            &["node_modules/".into(), ".env".into(), "missing.txt".into()],
        )
        .unwrap();
        let paths: Vec<&str> = files.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(
            paths,
            [".env", "node_modules/a/index.js", "node_modules/b.js"]
        );
        assert_eq!(
            files[0].digest,
            crate::hostfilesave::sha256_file(&dir.path().join(".env")).unwrap()
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_pipe_is_skipped_without_waiting_on_it() {
        let dir = repo();
        let pipe = dir.path().join("node_modules/pipe");
        let c = std::ffi::CString::new(pipe.to_string_lossy().as_bytes()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(c.as_ptr(), 0o600) }, 0);

        let modules = list(dir.path(), "")
            .unwrap()
            .entries
            .into_iter()
            .find(|e| e.path == "node_modules/")
            .unwrap();
        assert_eq!(modules.files, 2);
        let children = list(dir.path(), "node_modules/").unwrap();
        assert!(children.entries.iter().all(|e| e.path != "node_modules/pipe"));
        let files = manifest(dir.path(), &["node_modules/".into()]).unwrap();
        assert!(files.iter().all(|f| f.path != "node_modules/pipe"));
    }

    #[cfg(unix)]
    #[test]
    fn a_link_out_of_the_project_is_not_followed() {
        let dir = repo();
        let outside = tempfile::tempdir().unwrap();
        write(outside.path(), "secret.txt", "outside");
        std::os::unix::fs::symlink(outside.path(), dir.path().join("node_modules/escape")).unwrap();
        assert!(resolve(dir.path(), "node_modules/escape/secret.txt").is_err());
        let files = manifest(dir.path(), &["node_modules/".into()]).unwrap();
        let link = files
            .iter()
            .find(|f| f.path == "node_modules/escape")
            .unwrap();
        assert_eq!(
            link.link.as_deref(),
            Some(outside.path().to_string_lossy().as_ref())
        );
    }
}
