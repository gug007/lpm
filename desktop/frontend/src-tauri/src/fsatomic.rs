// Atomic config-file writes: sibling temp file + fsync + rename, so a concurrent
// reader (the FSEvents watcher in configwatch.rs, a peer sync reading files, or a
// second lpm instance) never observes a half-written config. Every non-atomic
// `fs::write` of a config-like file under ~/.lpm (and the agent config under
// ~/.claude / ~/.codex) routes through here.
//
// The temp is created 0600 (NamedTempFile's default) in the SAME directory as the
// resolved target, so the final rename is atomic on one filesystem and secret
// bytes never exist at a wider mode than the caller asked for. A symlinked target
// is written through to its resolved path so the link itself survives — dotfile
// managers commonly symlink ~/.claude/settings.json. This generalizes the recipe
// codex_statusline.rs already uses into one shared helper.
//
// Windows has no mode bits: a mode without any write bit becomes the read-only
// attribute, anything else leaves the file writable, and the user-only ACL the
// profile folder hands down keeps secrets private.
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use tempfile::NamedTempFile;

/// The permission bits the finished file should carry.
pub enum Mode {
    /// Keep the target's current mode when it already exists, else this fallback.
    /// The common config-file case: a fresh file lands at `default` (0644 as the
    /// bare `fs::write` did), an existing file keeps whatever mode it had.
    Preserve(u32),
    /// Always exactly this mode, independent of any prior file. For files whose
    /// mode must not depend on prior state: 0600 secrets (peer.json / remote.json)
    /// and 0755 status-line scripts.
    Exact(u32),
}

/// Atomically replace `path` with `bytes`. The parent directory must already
/// exist (callers create it, exactly as they did before the switch to atomic
/// writes). On any error the temp file is removed automatically by NamedTempFile.
pub fn write(path: &Path, bytes: &[u8], mode: Mode) -> io::Result<()> {
    let target = resolve_symlink(path)?;
    let parent = target.parent().ok_or_else(|| {
        io::Error::new(io::ErrorKind::InvalidInput, "path has no parent directory")
    })?;
    let final_mode = match mode {
        Mode::Exact(m) => m,
        Mode::Preserve(default) => std::fs::metadata(&target)
            .map(|m| crate::fsperm::mode(&m) & 0o777)
            .unwrap_or(default),
    };
    // Created 0600; content is written and fsynced at 0600, and the mode is only
    // widened (for non-secret Preserve files) after the bytes are on disk, so a
    // secret file (always Exact(0o600)) never exists at a wider mode.
    let mut temp = NamedTempFile::new_in(parent)?;
    temp.write_all(bytes)?;
    temp.as_file().sync_all()?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        temp.as_file()
            .set_permissions(std::fs::Permissions::from_mode(final_mode))?;
    }
    persist(temp, &target)?;
    // After the rename: tempfile resets the attributes of the file it persists.
    #[cfg(windows)]
    if final_mode & 0o222 == 0 {
        set_readonly(&target, true)?;
    }
    Ok(())
}

/// Rename `temp` over `target`. Unix renames once. Windows refuses to replace a
/// read-only file, or one another process holds open without delete sharing (an
/// editor, a virus scanner, the search indexer), so the attribute is cleared and
/// a sharing violation is waited out briefly before giving up.
pub fn persist(temp: NamedTempFile, target: &Path) -> io::Result<()> {
    #[cfg(unix)]
    {
        temp.persist(target).map_err(|e| e.error)?;
        Ok(())
    }
    #[cfg(windows)]
    {
        let _ = set_readonly(target, false);
        let mut temp = temp;
        let mut delay = std::time::Duration::from_millis(10);
        for _ in 0..PERSIST_RETRIES {
            match temp.persist(target) {
                Ok(_) => return Ok(()),
                Err(e) if is_sharing_violation(&e.error) => {
                    temp = e.file;
                    std::thread::sleep(delay);
                    delay *= 2;
                }
                Err(e) => return Err(e.error),
            }
        }
        temp.persist(target).map(|_| ()).map_err(|e| e.error)
    }
}

/// Backoff doubles from 10 ms, so six retries wait out about 0.6 s in total.
#[cfg(windows)]
const PERSIST_RETRIES: u32 = 6;

#[cfg(windows)]
fn is_sharing_violation(err: &io::Error) -> bool {
    const ERROR_ACCESS_DENIED: i32 = 5;
    const ERROR_SHARING_VIOLATION: i32 = 32;
    const ERROR_LOCK_VIOLATION: i32 = 33;
    matches!(
        err.raw_os_error(),
        Some(ERROR_ACCESS_DENIED | ERROR_SHARING_VIOLATION | ERROR_LOCK_VIOLATION)
    )
}

/// Set or clear the read-only attribute of an existing file. A missing file, or
/// one already in that state, is left alone.
#[cfg(windows)]
pub fn set_readonly(path: &Path, readonly: bool) -> io::Result<()> {
    let Ok(meta) = std::fs::metadata(path) else {
        return Ok(());
    };
    let mut perms = meta.permissions();
    if perms.readonly() == readonly {
        return Ok(());
    }
    perms.set_readonly(readonly);
    std::fs::set_permissions(path, perms)
}

/// The path a write should actually land on: a symlinked target resolves to the
/// file it points at (so the rename replaces that file, not the link); a regular
/// or not-yet-existing path is returned unchanged. Mirrors codex_statusline.rs.
fn resolve_symlink(path: &Path) -> io::Result<PathBuf> {
    match std::fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_symlink() => std::fs::canonicalize(path),
        _ => Ok(path.to_path_buf()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;

    #[test]
    fn replaces_content() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("f.json");
        write(&path, b"one", Mode::Preserve(0o644)).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"one");
        write(&path, b"two", Mode::Preserve(0o644)).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"two");
    }

    #[test]
    fn replaces_a_read_only_file_and_keeps_it_read_only() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("ro.json");
        std::fs::write(&path, b"old").unwrap();
        let mut perms = std::fs::metadata(&path).unwrap().permissions();
        perms.set_readonly(true);
        std::fs::set_permissions(&path, perms).unwrap();
        write(&path, b"new", Mode::Preserve(0o644)).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"new");
        assert!(std::fs::metadata(&path).unwrap().permissions().readonly());
    }

    #[test]
    fn a_mode_without_write_bits_lands_read_only() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("copy.txt");
        write(&path, b"x", Mode::Exact(0o444)).unwrap();
        assert!(std::fs::metadata(&path).unwrap().permissions().readonly());
        write(&path, b"y", Mode::Exact(0o644)).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"y");
        assert!(!std::fs::metadata(&path).unwrap().permissions().readonly());
    }

    #[cfg(windows)]
    #[test]
    fn waits_out_a_reader_that_blocks_the_swap() {
        use std::os::windows::fs::OpenOptionsExt;
        const FILE_SHARE_READ: u32 = 1;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("busy.json");
        std::fs::write(&path, b"old").unwrap();
        let held = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ)
            .open(&path)
            .unwrap();
        let release = std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(50));
            drop(held);
        });
        write(&path, b"new", Mode::Preserve(0o644)).unwrap();
        release.join().unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"new");
    }

    #[cfg(unix)]
    #[test]
    fn preserves_existing_mode() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("secret.json");
        std::fs::write(&path, b"x").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
        // A Preserve write with a 0644 fallback must keep the file's own 0600.
        write(&path, b"y", Mode::Preserve(0o644)).unwrap();
        let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
    }

    #[cfg(unix)]
    #[test]
    fn new_file_uses_preserve_default() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("fresh.json");
        write(&path, b"x", Mode::Preserve(0o644)).unwrap();
        let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o644);
    }

    #[cfg(unix)]
    #[test]
    fn exact_mode_overrides_existing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("script.sh");
        std::fs::write(&path, b"old").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
        write(&path, b"#!/bin/sh\n", Mode::Exact(0o755)).unwrap();
        let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o755);
    }

    #[cfg(unix)]
    #[test]
    fn exact_mode_on_new_secret_never_widens() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("peer.json");
        write(&path, b"{}", Mode::Exact(0o600)).unwrap();
        let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
    }

    #[cfg(unix)]
    #[test]
    fn writes_through_symlink_preserving_link() {
        let dir = tempfile::tempdir().unwrap();
        let real = dir.path().join("real.json");
        let link = dir.path().join("link.json");
        std::fs::write(&real, b"orig").unwrap();
        std::os::unix::fs::symlink(&real, &link).unwrap();
        write(&link, b"updated", Mode::Preserve(0o644)).unwrap();
        // The link is still a symlink and its target received the new bytes.
        assert!(std::fs::symlink_metadata(&link)
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(std::fs::read(&real).unwrap(), b"updated");
    }

    #[test]
    fn cleans_up_temp_on_error() {
        // A parent that does not exist makes NamedTempFile::new_in fail; no temp
        // (or target) is left behind and the error propagates.
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("nope").join("f.json");
        assert!(write(&missing, b"x", Mode::Preserve(0o644)).is_err());
        assert!(!dir.path().join("nope").exists());
        let leftovers = std::fs::read_dir(dir.path()).unwrap().count();
        assert_eq!(leftovers, 0);
    }
}
