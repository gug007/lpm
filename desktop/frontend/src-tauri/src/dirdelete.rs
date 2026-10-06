// Deleting a folder on Windows without leaving it half emptied. Windows won't
// delete a folder that a process has open — a shell's working directory, a file
// an editor holds — and a recursive delete only learns that at the very end,
// after emptying everything it could. Renaming the folder fails up front in
// exactly those cases, so the folder is moved aside first and only emptied once
// nothing can stop that.
use std::io;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// A process that was just stopped can keep its handles for a moment longer.
const RELEASE_WAIT: Duration = Duration::from_secs(3);
const RETRY: Duration = Duration::from_millis(100);

/// Delete `dir` and everything in it. A folder still in use is left exactly as
/// it was, and a missing one counts as removed.
pub fn remove(dir: &Path) -> Result<(), String> {
    match move_aside(dir)? {
        Some(aside) => crate::config::remove_dir_all_retry(&aside),
        None => Ok(()),
    }
}

/// Fail, changing nothing, while anything still has `dir` or a file in it open.
/// For deletes another tool carries out (`git worktree remove`), which would
/// otherwise empty the folder and then stop at the folder itself.
pub fn ensure_unused(dir: &Path) -> Result<(), String> {
    let Some(aside) = move_aside(dir)? else {
        return Ok(());
    };
    std::fs::rename(&aside, dir).map_err(|e| {
        format!(
            "{} was moved to {} and couldn't be moved back: {e}",
            dir.display(),
            aside.display()
        )
    })
}

fn move_aside(dir: &Path) -> Result<Option<PathBuf>, String> {
    let aside = aside_path(dir);
    let deadline = Instant::now() + RELEASE_WAIT;
    loop {
        match std::fs::rename(dir, &aside) {
            Ok(()) => return Ok(Some(aside)),
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(e) if is_in_use(&e) && Instant::now() < deadline => std::thread::sleep(RETRY),
            Err(e) if is_in_use(&e) => {
                return Err(format!(
                    "{} is still open in another program. Close it there and try again.",
                    dir.display()
                ))
            }
            Err(e) => return Err(format!("failed to remove {}: {e}", dir.display())),
        }
    }
}

/// ERROR_ACCESS_DENIED / ERROR_SHARING_VIOLATION: how a rename reports a folder
/// with something open in it.
fn is_in_use(e: &io::Error) -> bool {
    matches!(e.raw_os_error(), Some(5 | 32))
}

/// A sibling, so the move stays on the same volume and is only a rename.
fn aside_path(dir: &Path) -> PathBuf {
    let name = dir
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos());
    dir.with_file_name(format!(".{name}.lpm-removing-{stamp}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tree(root: &Path) {
        std::fs::create_dir_all(root.join("src/deep")).unwrap();
        std::fs::write(root.join("a.txt"), "a").unwrap();
        std::fs::write(root.join("src/deep/b.txt"), "b").unwrap();
    }

    fn entries(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn removes_the_folder_and_leaves_nothing_beside_it() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("copy");
        tree(&dir);
        remove(&dir).unwrap();
        assert!(!dir.exists());
        assert!(entries(tmp.path()).is_empty());
    }

    #[test]
    fn a_missing_folder_is_already_removed() {
        let tmp = tempfile::tempdir().unwrap();
        remove(&tmp.path().join("gone")).unwrap();
        ensure_unused(&tmp.path().join("gone")).unwrap();
    }

    #[test]
    fn checking_a_free_folder_leaves_it_in_place() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("wt");
        tree(&dir);
        ensure_unused(&dir).unwrap();
        assert_eq!(entries(tmp.path()), ["wt"]);
        assert_eq!(std::fs::read_to_string(dir.join("src/deep/b.txt")).unwrap(), "b");
    }

    #[cfg(windows)]
    #[test]
    fn a_folder_with_an_open_file_is_left_whole() {
        use std::os::windows::fs::OpenOptionsExt;
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("copy");
        tree(&dir);
        let held = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(dir.join("src/deep/b.txt"))
            .unwrap();
        let err = remove(&dir).unwrap_err();
        assert!(err.contains("still open"), "{err}");
        assert!(ensure_unused(&dir).is_err());
        assert_eq!(entries(tmp.path()), ["copy"]);
        assert_eq!(std::fs::read_to_string(dir.join("a.txt")).unwrap(), "a");
        drop(held);
        remove(&dir).unwrap();
        assert!(entries(tmp.path()).is_empty());
    }
}
