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
use std::io::{self, Write};
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

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
            .map(|m| m.permissions().mode() & 0o777)
            .unwrap_or(default),
    };
    // Created 0600; content is written and fsynced at 0600, and the mode is only
    // widened (for non-secret Preserve files) after the bytes are on disk, so a
    // secret file (always Exact(0o600)) never exists at a wider mode.
    let mut temp = tempfile::NamedTempFile::new_in(parent)?;
    temp.write_all(bytes)?;
    temp.as_file().sync_all()?;
    temp.as_file()
        .set_permissions(std::fs::Permissions::from_mode(final_mode))?;
    temp.persist(&target).map_err(|e| e.error)?;
    Ok(())
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

    #[test]
    fn new_file_uses_preserve_default() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("fresh.json");
        write(&path, b"x", Mode::Preserve(0o644)).unwrap();
        let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o644);
    }

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

    #[test]
    fn exact_mode_on_new_secret_never_widens() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("peer.json");
        write(&path, b"{}", Mode::Exact(0o600)).unwrap();
        let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
    }

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
