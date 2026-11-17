// How much disk a project's folder takes, for the Archive page. The walk never
// follows a symlink, and an answer is kept for a few minutes so reopening the
// page doesn't walk node_modules again.
use crate::config;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const FRESH: Duration = Duration::from_secs(300);

fn cache() -> &'static Mutex<HashMap<PathBuf, (u64, Instant)>> {
    static CACHE: OnceLock<Mutex<HashMap<PathBuf, (u64, Instant)>>> = OnceLock::new();
    CACHE.get_or_init(Default::default)
}

/// The bytes of every file under `root`. Folders it can't read count as empty.
pub(crate) fn dir_size(root: &Path) -> u64 {
    let mut total = 0u64;
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            // DirEntry::metadata doesn't follow symlinks, so a link to a folder
            // outside the project (or back up into it) is never walked.
            let Ok(meta) = entry.metadata() else { continue };
            if meta.is_dir() {
                stack.push(entry.path());
            } else if meta.is_file() {
                total += meta.len();
            }
        }
    }
    total
}

/// The size of the project's folder on this machine; none for an SSH project
/// or a folder that's gone.
#[tauri::command(async)]
pub fn project_disk_size(name: String) -> Result<Option<u64>, String> {
    let (root, is_remote) = config::project_root(&name)?;
    let root = PathBuf::from(root.trim());
    if is_remote || root.as_os_str().is_empty() || !root.is_dir() {
        return Ok(None);
    }
    if let Some(&(bytes, at)) = cache().lock().unwrap().get(&root) {
        if at.elapsed() < FRESH {
            return Ok(Some(bytes));
        }
    }
    let bytes = dir_size(&root);
    cache()
        .lock()
        .unwrap()
        .insert(root, (bytes, Instant::now()));
    Ok(Some(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_up_nested_files() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.txt"), b"12345").unwrap();
        std::fs::create_dir_all(dir.path().join("src/deep")).unwrap();
        std::fs::write(dir.path().join("src/deep/b.txt"), b"123").unwrap();
        assert_eq!(dir_size(dir.path()), 8);
    }

    #[cfg(unix)]
    #[test]
    fn never_follows_a_symlink() {
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("big.bin"), vec![0u8; 4096]).unwrap();
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.txt"), b"12").unwrap();
        std::os::unix::fs::symlink(outside.path(), dir.path().join("link")).unwrap();
        std::os::unix::fs::symlink(dir.path(), dir.path().join("loop")).unwrap();
        assert_eq!(dir_size(dir.path()), 2);
    }

    #[test]
    fn a_missing_folder_is_empty() {
        assert_eq!(dir_size(Path::new("/definitely/not/here")), 0);
    }
}
