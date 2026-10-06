// POSIX mode bits and advisory locks behind one API. Windows has neither mode
// bits nor flock: files under the user's profile are already private to that
// account by ACL, so the mode calls are no-ops there, and locking goes through
// std's LockFileEx-backed File::try_lock.
use std::fs::{DirBuilder, File, Metadata, OpenOptions};
use std::io;
use std::path::Path;

/// chmod. No-op on Windows.
pub fn set_mode(path: &Path, mode: u32) -> io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode))
    }
    #[cfg(windows)]
    {
        let _ = (path, mode);
        Ok(())
    }
}

/// The permission bits of `meta`. Windows reports a synthetic value: 0o755 for
/// directories, 0o444 for read-only files, 0o644 otherwise.
pub fn mode(meta: &Metadata) -> u32 {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        meta.permissions().mode()
    }
    #[cfg(windows)]
    {
        if meta.is_dir() {
            0o755
        } else if meta.permissions().readonly() {
            0o444
        } else {
            0o644
        }
    }
}

/// `DirBuilderExt::mode`. No-op on Windows.
pub fn dir_mode(builder: &mut DirBuilder, mode: u32) -> &mut DirBuilder {
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(mode);
    }
    #[cfg(windows)]
    let _ = mode;
    builder
}

/// `OpenOptionsExt::mode`. No-op on Windows.
pub fn open_mode(options: &mut OpenOptions, mode: u32) -> &mut OpenOptions {
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(mode);
    }
    #[cfg(windows)]
    let _ = mode;
    options
}

/// Take an exclusive advisory lock without blocking. Ok(false) when another
/// holder has it.
pub fn try_lock_exclusive(file: &File) -> io::Result<bool> {
    match file.try_lock() {
        Ok(()) => Ok(true),
        Err(std::fs::TryLockError::WouldBlock) => Ok(false),
        Err(std::fs::TryLockError::Error(err)) => Err(err),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_second_exclusive_lock_is_refused_until_the_first_drops() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("lock");
        let first = File::create(&path).unwrap();
        assert!(try_lock_exclusive(&first).unwrap());
        let second = OpenOptions::new().write(true).open(&path).unwrap();
        assert!(!try_lock_exclusive(&second).unwrap());
        drop(first);
        // A child forked by a concurrent test holds a copy of the fd until it
        // execs (O_CLOEXEC), keeping the flock alive for a moment after drop.
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
        while !try_lock_exclusive(&second).unwrap() {
            assert!(std::time::Instant::now() < deadline, "lock never released");
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
    }

    #[cfg(unix)]
    #[test]
    fn set_mode_round_trips_through_mode() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("f");
        File::create(&path).unwrap();
        set_mode(&path, 0o600).unwrap();
        assert_eq!(mode(&std::fs::metadata(&path).unwrap()) & 0o777, 0o600);
    }
}
