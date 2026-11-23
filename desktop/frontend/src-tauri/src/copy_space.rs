// What each copy of a project costs the disk, and freeing an idle copy's
// dependencies and build caches. Only what comes back by itself is removed:
// node_modules beside a package.json (the copy's next Start installs it again,
// copy_reinstall), Cargo's target beside a Cargo.toml, and framework caches.
// Code, uncommitted changes, .env files and anything git tracks stay.
use crate::config;
use crate::ttl_cache::TtlCache;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::Duration;

static USES: TtlCache<PathBuf, CopyUse> = TtlCache::new(Duration::from_secs(300));

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

fn freeable_dir(dir: &Path, name: &str) -> bool {
    let beside = |file: &str| dir.parent().is_some_and(|p| p.join(file).is_file());
    match name {
        DEPENDENCIES => beside("package.json"),
        "target" => beside("Cargo.toml"),
        _ => CACHES.contains(&name),
    }
}

/// Outside a repository nothing is tracked, so nothing needs protecting from a
/// delete; `project_size::tracked` counts every folder as tracked there.
fn in_git(root: &Path) -> bool {
    crate::git::git_out(&root.to_string_lossy(), &["rev-parse", "--is-inside-work-tree"])
        .is_ok_and(|out| out.trim() == "true")
}

/// Walk the copy once, counting each file's own bytes. A freeable folder is
/// measured whole and never searched for more of them; one git tracks anything
/// inside is left out.
fn measure(root: &Path) -> CopyUse {
    let (bytes, found) = crate::project_size::walk(root, freeable_dir, crate::diskusage::own_bytes);
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
    USES.get_or(root.to_path_buf(), || measure(root))
}

fn is_running(name: &str) -> bool {
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
    USES.forget(&root);
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
