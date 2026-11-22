// What one more copy of a project would take, and the room left where it goes,
// for the Duplicate dialog. A copy goes beside the project (projects_crud), so
// that folder's disk is the one asked about.
use crate::diskspace::DiskSpace;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const FRESH: Duration = Duration::from_secs(300);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateSpace {
    /// Each copy's size; none for a copy that shares its files with the project
    /// until they change (an APFS clone).
    bytes: Option<u64>,
    #[serde(flatten)]
    disk: DiskSpace,
}

fn cache() -> &'static Mutex<HashMap<(PathBuf, bool), (u64, Instant)>> {
    static CACHE: OnceLock<Mutex<HashMap<(PathBuf, bool), (u64, Instant)>>> = OnceLock::new();
    CACHE.get_or_init(Default::default)
}

/// The bytes a standalone copy writes: everything but the caches Duplicate
/// leaves behind (config::DUPLICATE_SKIP_DIRS), with node_modules counted whole
/// as Duplicate copies it.
pub(crate) fn copy_bytes(root: &Path) -> u64 {
    let mut total = 0u64;
    let mut stack = vec![(root.to_path_buf(), false)];
    while let Some((dir, in_deps)) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(meta) = entry.metadata() else { continue };
            if meta.is_file() {
                total += meta.len();
            } else if meta.is_dir() {
                let name = entry.file_name();
                let name = name.to_str().unwrap_or_default();
                if !in_deps && crate::config::DUPLICATE_SKIP_DIRS.contains(&name) {
                    continue;
                }
                stack.push((entry.path(), in_deps || name == "node_modules"));
            }
        }
    }
    total
}

/// The bytes a worktree checks out: the files git tracks.
pub(crate) fn tracked_bytes(root: &Path) -> u64 {
    let Ok(out) = crate::git::git_out(&root.to_string_lossy(), &["ls-files", "-z"]) else {
        return 0;
    };
    out.split('\0')
        .filter(|f| !f.is_empty())
        .filter_map(|f| std::fs::symlink_metadata(root.join(f)).ok())
        .filter(|m| m.is_file())
        .map(|m| m.len())
        .sum()
}

fn estimate(root: &Path, worktree: bool) -> u64 {
    let key = (root.to_path_buf(), worktree);
    if let Some((bytes, at)) = cache().lock().unwrap().get(&key) {
        if at.elapsed() < FRESH {
            return *bytes;
        }
    }
    let bytes = if worktree {
        tracked_bytes(root)
    } else {
        copy_bytes(root)
    };
    cache().lock().unwrap().insert(key, (bytes, Instant::now()));
    bytes
}

/// None for an SSH project, a folder that's gone, or a disk that can't be read.
#[tauri::command(async)]
pub fn duplicate_space(name: String, worktree: bool) -> Result<Option<DuplicateSpace>, String> {
    let Some(root) = crate::project_size::local_root(&name)? else {
        return Ok(None);
    };
    let Some(disk) = root.parent().and_then(crate::diskspace::space) else {
        return Ok(None);
    };
    let shares = disk.clones && !worktree;
    Ok(Some(DuplicateSpace {
        bytes: (!shares).then(|| estimate(&root, worktree)),
        disk,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(root: &Path, rel: &str, bytes: usize) {
        let path = root.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, vec![b'x'; bytes]).unwrap();
    }

    #[test]
    fn a_copy_leaves_caches_behind_but_keeps_dependencies_whole() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "src/a.ts", 10);
        write(dir.path(), ".next/cache.bin", 500);
        write(dir.path(), "web/dist/app.js", 300);
        write(dir.path(), "node_modules/pkg/dist/index.js", 40);
        assert_eq!(copy_bytes(dir.path()), 50);
    }

    #[test]
    fn a_worktree_checks_out_only_tracked_files() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().into_owned();
        let git = |args: &[&str]| crate::git::git_out(&root, args).unwrap();
        git(&["init", "-q"]);
        write(dir.path(), "src/a.ts", 10);
        write(dir.path(), "README.md", 5);
        write(dir.path(), "node_modules/x.js", 900);
        git(&["add", "src/a.ts", "README.md"]);
        assert_eq!(tracked_bytes(dir.path()), 15);
    }
}
