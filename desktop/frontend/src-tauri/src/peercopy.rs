//! A file from a paired machine, brought to this Mac so an app here can open
//! it. It comes over the peer connection, so it needs nothing but that.

use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};
use tempfile::NamedTempFile;

use crate::peerclient::PeerClientHub;

/// Under the system temp folder, which macOS clears of what goes unused.
const COPIES_DIR: &str = "lpm-peer-files";
/// A copy streams to disk, so this bounds the wait rather than memory.
const COPY_MAX_BYTES: u64 = 1024 * 1024 * 1024;

/// `host_name` is how the machine is named in an error; `progress` gets
/// `(received, total)` as the file comes in.
pub(crate) fn copy_to_mac(
    hub: &PeerClientHub,
    slug: &str,
    host_path: &str,
    host_name: &str,
    progress: impl FnMut(u64, u64),
) -> Result<PathBuf, String> {
    let dest = copy_path(&std::env::temp_dir().join(COPIES_DIR), slug, host_path);
    let mut tmp = new_copy(&dest)?;
    let fetched = crate::peerread::fetch(
        hub,
        slug,
        host_path,
        host_name,
        COPY_MAX_BYTES,
        |piece| tmp.write_all(piece).map_err(|e| e.to_string()),
        progress,
    );
    if let Err(e) = fetched {
        drop(tmp);
        if let Some(dir) = dest.parent() {
            let _ = std::fs::remove_dir(dir);
        }
        return Err(e);
    }
    keep_copy(tmp, &dest)?;
    Ok(dest)
}

/// One folder per host file keeps the file's own name, which is what the app
/// shows in its title, while two same-named files on a host stay apart.
fn copy_path(root: &Path, slug: &str, host_path: &str) -> PathBuf {
    let name = Path::new(host_path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| "file".to_string());
    let key = hex::encode(&Sha256::digest(host_path.as_bytes())[..8]);
    root.join(slug).join(key).join(name)
}

/// The copy is written beside where it will live, then swapped in whole, never
/// written through, since an app may still hold the last one.
fn new_copy(dest: &Path) -> Result<NamedTempFile, String> {
    let dir = dest.parent().ok_or("bad copy path")?;
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    NamedTempFile::new_in(dir).map_err(|e| e.to_string())
}

/// An unchanged file keeps its copy, so an app already showing it brings that
/// window forward rather than opening a second. Each copy is read-only, so an
/// edit can't be saved where it would be lost, and quarantined like a
/// download, since it came from another machine.
fn keep_copy(tmp: NamedTempFile, dest: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    if same_contents(tmp.path(), dest) {
        return Ok(());
    }
    // Before the chmod: setting an attribute needs write access.
    quarantine(tmp.as_file());
    tmp.as_file()
        .set_permissions(std::fs::Permissions::from_mode(0o444))
        .map_err(|e| e.to_string())?;
    tmp.persist(dest).map_err(|e| e.error.to_string())?;
    Ok(())
}

fn same_contents(a: &Path, b: &Path) -> bool {
    let len = |p: &Path| std::fs::metadata(p).map(|m| m.len()).ok();
    if len(a).is_none() || len(a) != len(b) {
        return false;
    }
    let (Ok(mut fa), Ok(mut fb)) = (File::open(a), File::open(b)) else {
        return false;
    };
    let (mut ba, mut bb) = (vec![0u8; 64 * 1024], vec![0u8; 64 * 1024]);
    loop {
        let n = match fa.read(&mut ba) {
            Ok(0) => return true,
            Ok(n) => n,
            Err(_) => return false,
        };
        if fb.read_exact(&mut bb[..n]).is_err() || ba[..n] != bb[..n] {
            return false;
        }
    }
}

#[cfg(target_os = "macos")]
fn quarantine(file: &std::fs::File) {
    use std::os::fd::AsRawFd;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let value = format!("0081;{now:x};lpm;");
    // SAFETY: the fd is open for the call, the name is NUL-terminated and
    // `value` outlives the call. Best effort: an unflagged copy still opens.
    unsafe {
        libc::fsetxattr(
            file.as_raw_fd(),
            c"com.apple.quarantine".as_ptr(),
            value.as_ptr().cast(),
            value.len(),
            0,
            0,
        );
    }
}

#[cfg(not(target_os = "macos"))]
fn quarantine(_file: &std::fs::File) {}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::MetadataExt;

    fn write_copy(dest: &Path, data: &[u8]) -> Result<(), String> {
        let mut tmp = new_copy(dest)?;
        tmp.write_all(data).map_err(|e| e.to_string())?;
        keep_copy(tmp, dest)
    }

    #[test]
    fn copies_keep_the_name_and_part_by_host_path() {
        let root = Path::new("/tmp/x");
        let a = copy_path(root, "abcd1234", "/srv/one/receipt.pdf");
        let b = copy_path(root, "abcd1234", "/srv/two/receipt.pdf");
        assert_eq!(a.file_name().unwrap(), "receipt.pdf");
        assert_ne!(a.parent(), b.parent());
        assert!(a.starts_with("/tmp/x/abcd1234"));
        assert_eq!(
            copy_path(root, "abcd1234", "/").file_name().unwrap(),
            "file"
        );
    }

    #[test]
    fn a_changed_copy_is_swapped_in_read_only() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("k").join("a.txt");
        write_copy(&dest, b"one").unwrap();
        let first = std::fs::metadata(&dest).unwrap().ino();
        write_copy(&dest, b"two").unwrap();
        let meta = std::fs::metadata(&dest).unwrap();
        assert_eq!(std::fs::read(&dest).unwrap(), b"two");
        assert_ne!(meta.ino(), first);
        assert_eq!(meta.permissions().mode() & 0o777, 0o444);
        assert_eq!(
            std::fs::read_dir(dest.parent().unwrap()).unwrap().count(),
            1
        );
    }

    #[test]
    fn an_unchanged_copy_is_kept() {
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("a.pdf");
        write_copy(&dest, b"%PDF-1.4").unwrap();
        let first = std::fs::metadata(&dest).unwrap().ino();
        write_copy(&dest, b"%PDF-1.4").unwrap();
        assert_eq!(std::fs::metadata(&dest).unwrap().ino(), first);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn a_copy_is_quarantined() {
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("a.pdf");
        write_copy(&dest, b"%PDF-1.4").unwrap();
        let out = std::process::Command::new("xattr")
            .args(["-p", "com.apple.quarantine"])
            .arg(&dest)
            .output()
            .unwrap();
        assert!(String::from_utf8_lossy(&out.stdout).starts_with("0081;"));
    }
}
