// What each copy of a project costs the disk, and freeing an idle copy's
// dependencies and build caches. Only what comes back by itself is removed:
// node_modules beside a package.json (the copy's next Start installs it again,
// copy_reinstall), Cargo's target beside a Cargo.toml, and framework caches.
// Code, uncommitted changes, .env files and anything git tracks stay.
use crate::config;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const FRESH: Duration = Duration::from_secs(300);

pub(crate) const DEPENDENCIES: &str = "node_modules";

/// Caches a dev server or a build recreates on its own.
const CACHES: &[&str] = &[
    ".next",
    ".nuxt",
    ".turbo",
    ".svelte-kit",
    ".parcel-cache",
    ".swc",
    "__pycache__",
];

#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct CopyUse {
    /// What the copy holds of its own: what deleting all of it would free.
    pub bytes: u64,
    /// Folders that come back by themselves, relative to the root, biggest first.
    pub freeable: Vec<(PathBuf, u64)>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    path: String,
    bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopySpace {
    bytes: u64,
    freeable: Vec<Folder>,
    running: bool,
}

fn cache() -> &'static Mutex<HashMap<PathBuf, (CopyUse, Instant)>> {
    static CACHE: OnceLock<Mutex<HashMap<PathBuf, (CopyUse, Instant)>>> = OnceLock::new();
    CACHE.get_or_init(Default::default)
}

fn freeable_dir(dir: &Path, name: &str) -> bool {
    let beside = |file: &str| dir.parent().is_some_and(|p| p.join(file).is_file());
    match name {
        DEPENDENCIES => beside("package.json"),
        "target" => beside("Cargo.toml"),
        _ => CACHES.contains(&name),
    }
}

/// Every file's own bytes under `dir`, never following a link.
fn own_size(dir: &Path) -> u64 {
    let mut total = 0u64;
    let mut stack = vec![dir.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(meta) = entry.metadata() else { continue };
            if meta.is_dir() {
                stack.push(entry.path());
            } else if meta.is_file() {
                total += crate::diskusage::own_bytes(&entry.path(), &meta);
            }
        }
    }
    total
}

/// Outside a repository nothing is tracked, so nothing needs protecting from a
/// delete; `project_size::tracked` counts every folder as tracked there.
fn in_git(root: &Path) -> bool {
    crate::git::git_out(&root.to_string_lossy(), &["rev-parse", "--is-inside-work-tree"])
        .is_ok_and(|out| out.trim() == "true")
}

/// Walk the copy once. A freeable folder is measured whole and never searched
/// for more of them; one git tracks anything inside is left out.
pub(crate) fn measure(root: &Path) -> CopyUse {
    let mut bytes = 0u64;
    let mut found: Vec<(PathBuf, u64)> = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(meta) = entry.metadata() else { continue };
            let path = entry.path();
            if meta.is_file() {
                bytes += crate::diskusage::own_bytes(&path, &meta);
                continue;
            }
            if !meta.is_dir() {
                continue;
            }
            if entry
                .file_name()
                .to_str()
                .is_some_and(|n| freeable_dir(&path, n))
            {
                if let Ok(rel) = path.strip_prefix(root) {
                    let size = own_size(&path);
                    bytes += size;
                    found.push((rel.to_path_buf(), size));
                    continue;
                }
            }
            stack.push(path);
        }
    }
    let dirs: Vec<PathBuf> = found.iter().map(|(p, _)| p.clone()).collect();
    let tracked = if in_git(root) {
        crate::project_size::tracked(root, &dirs)
    } else {
        Vec::new()
    };
    let mut freeable: Vec<(PathBuf, u64)> = found
        .into_iter()
        .filter(|(p, size)| *size > 0 && !tracked.contains(p))
        .collect();
    freeable.sort_by(|a, b| b.1.cmp(&a.1));
    CopyUse { bytes, freeable }
}

fn measured(root: &Path) -> CopyUse {
    if let Some((used, at)) = cache().lock().unwrap().get(root) {
        if at.elapsed() < FRESH {
            return used.clone();
        }
    }
    let used = measure(root);
    cache()
        .lock()
        .unwrap()
        .insert(root.to_path_buf(), (used.clone(), Instant::now()));
    used
}

pub(crate) fn is_running(name: &str) -> bool {
    config::spawn_info(name)
        .is_ok_and(|info| crate::sessions::running_sessions().contains(&info.session))
}

/// A copy's own disk use and the folders that come back by themselves. None
/// for an SSH project or a folder that's gone.
#[tauri::command(async)]
pub fn copy_space(name: String) -> Result<Option<CopySpace>, String> {
    let Some(root) = crate::project_size::local_root(&name)? else {
        return Ok(None);
    };
    let used = measured(&root);
    Ok(Some(CopySpace {
        bytes: used.bytes,
        freeable: used
            .freeable
            .iter()
            .map(|(path, bytes)| Folder {
                path: path.to_string_lossy().into_owned(),
                bytes: *bytes,
            })
            .collect(),
        running: is_running(&name),
    }))
}

/// Delete a stopped copy's freeable folders and answer with the bytes freed.
/// The folders are found again here, never taken from the caller. Where
/// node_modules goes, the copy's next Start installs it first.
#[tauri::command(async)]
pub fn free_copy_space(name: String) -> Result<u64, String> {
    if config::peek_parent(&name).is_none() {
        return Err(format!("{name} isn't a copy"));
    }
    if is_running(&name) {
        return Err(format!("{name} is running. Stop it first."));
    }
    let Some(root) = crate::project_size::local_root(&name)? else {
        return Ok(0);
    };
    let found = measure(&root).freeable;
    let installs: Vec<PathBuf> = found
        .iter()
        .filter(|(rel, _)| rel.file_name().is_some_and(|n| n == DEPENDENCIES))
        .map(|(rel, _)| rel.parent().map(Path::to_path_buf).unwrap_or_default())
        .collect();
    crate::copy_reinstall::remember(&name, &installs)?;
    let mut freed = 0u64;
    let mut failed: Option<String> = None;
    for (rel, bytes) in found {
        let dir = root.join(&rel);
        match config::remove_folder(&dir) {
            Ok(()) => freed += bytes,
            Err(e) => failed = Some(e),
        }
    }
    cache().lock().unwrap().remove(&root);
    crate::project_size::forget(&root);
    match failed {
        Some(e) if freed == 0 => Err(e),
        _ => Ok(freed),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(root: &Path, rel: &str, bytes: usize) {
        let path = root.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, vec![b'x'; bytes]).unwrap();
    }

    fn paths(used: &CopyUse) -> Vec<String> {
        let mut out: Vec<String> = used
            .freeable
            .iter()
            .map(|(p, _)| p.to_string_lossy().replace('\\', "/"))
            .collect();
        out.sort();
        out
    }

    #[test]
    fn finds_what_comes_back_by_itself() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "package.json", 10);
        write(dir.path(), "node_modules/a/index.js", 9000);
        write(dir.path(), "node_modules/a/node_modules/b/x.js", 9000);
        write(dir.path(), "web/.next/cache/x", 9000);
        write(dir.path(), "crate/Cargo.toml", 10);
        write(dir.path(), "crate/target/debug/bin", 9000);
        write(dir.path(), "src/main.ts", 10);
        assert_eq!(
            paths(&measure(dir.path())),
            vec!["crate/target", "node_modules", "web/.next"]
        );
    }

    #[test]
    fn leaves_folders_nothing_would_bring_back() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "node_modules/a.js", 9000);
        write(dir.path(), "target/out.bin", 9000);
        write(dir.path(), ".venv/lib/x.py", 9000);
        write(dir.path(), ".env", 10);
        assert!(measure(dir.path()).freeable.is_empty());
    }

    #[test]
    fn leaves_a_folder_git_tracks() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().into_owned();
        let git = |args: &[&str]| crate::git::git_out(&root, args).unwrap();
        git(&["init", "-q"]);
        write(dir.path(), "package.json", 10);
        write(dir.path(), "node_modules/vendored.js", 9000);
        write(dir.path(), ".turbo/cache", 9000);
        git(&["add", "-f", "node_modules/vendored.js"]);
        assert_eq!(paths(&measure(dir.path())), vec![".turbo"]);
    }

    #[test]
    fn counts_the_freeable_folders_in_the_copy_total() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "package.json", 10);
        write(dir.path(), "node_modules/a.js", 64 * 1024);
        let used = measure(dir.path());
        let freeable: u64 = used.freeable.iter().map(|(_, b)| b).sum();
        assert!(freeable >= 64 * 1024);
        assert!(used.bytes >= freeable);
    }
}
