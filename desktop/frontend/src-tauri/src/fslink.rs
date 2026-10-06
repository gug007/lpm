// Links that need no privileges on any platform. Unix makes a symlink. Windows
// makes one only with Developer Mode or elevation; without either a directory
// becomes a junction, which any user may create on a local volume, and a file
// becomes a copy, since a hard link silently splits the first time either side
// is replaced by an atomic write.
use std::io;
use std::path::{Path, PathBuf};

/// Keep `dst` leading to `src` while `src` exists: link it when `dst` is absent.
/// Where a file had to be copied instead, the copy is listed in `ledger` and is
/// refreshed from `src` whenever the two differ. Anything at `dst` that this
/// function didn't put there is left alone.
pub fn mirror(src: &Path, dst: &Path, ledger: &Path) -> io::Result<()> {
    if !src.exists() {
        return Ok(());
    }
    let present = std::fs::symlink_metadata(dst).is_ok();
    #[cfg(unix)]
    {
        let _ = ledger;
        if !present {
            std::os::unix::fs::symlink(src, dst)?;
        }
        Ok(())
    }
    #[cfg(windows)]
    {
        let name = dst
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        if !present {
            if src.is_dir() {
                return link_dir(src, dst);
            }
            if link_file(src, dst, &absolute_target(src, dst)?)? == Linked::Copy {
                ledger_add(ledger, &name)?;
            }
            return Ok(());
        }
        if ledger_names(ledger).contains(&name) {
            let fresh = std::fs::read(src)?;
            if std::fs::read(dst).ok().as_deref() != Some(fresh.as_slice()) {
                crate::fsatomic::write(dst, &fresh, crate::fsatomic::Mode::Preserve(0o644))?;
            }
        }
        Ok(())
    }
}

/// Recreate the link at `from` as `to`. With `rebase`, an absolute target inside
/// `rebase.0` is pointed at the same place under `rebase.1`, so the links of a
/// copied tree stay inside the copy.
pub fn copy_link(from: &Path, to: &Path, rebase: Option<(&Path, &Path)>) -> io::Result<()> {
    let original = std::fs::read_link(from)?;
    let rebased = rebase.and_then(|(old, new)| rebase_path(&original, old, new));
    let target = rebased.as_deref().unwrap_or(&original);
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(target, to)
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::FileTypeExt;
        if std::fs::symlink_metadata(from)?
            .file_type()
            .is_symlink_dir()
        {
            return link_dir(target, to);
        }
        // A copy in place of the link reads the source tree's file: the copied
        // tree may not hold its target yet.
        let source = absolute_target(&original, from)?;
        match link_file(target, to, &source) {
            Ok(_) => Ok(()),
            // A dangling link copies to nothing, as there is nothing to copy.
            Err(e) if e.kind() == io::ErrorKind::NotFound && !source.exists() => Ok(()),
            Err(e) => Err(e),
        }
    }
}

/// `target` moved from under `old_root` to the same place under `new_root`, or
/// None when it is relative or lies outside `old_root`.
fn rebase_path(target: &Path, old_root: &Path, new_root: &Path) -> Option<PathBuf> {
    if !target.is_absolute() {
        return None;
    }
    let target = plain(target);
    let mut rest = target.components();
    for part in plain(old_root).components() {
        let next = rest.next()?;
        let same = if cfg!(windows) {
            next.as_os_str()
                .to_string_lossy()
                .eq_ignore_ascii_case(&part.as_os_str().to_string_lossy())
        } else {
            next == part
        };
        if !same {
            return None;
        }
    }
    let rest = rest.as_path();
    Some(if rest.as_os_str().is_empty() {
        new_root.to_path_buf()
    } else {
        new_root.join(rest)
    })
}

/// `path` without a `\\?\` verbatim prefix, so it compares equal to the same
/// path written plainly. Unchanged off Windows.
fn plain(path: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        let s = path.to_string_lossy();
        if let Some(rest) = s.strip_prefix(r"\\?\") {
            if rest.as_bytes().get(1) == Some(&b':') {
                return PathBuf::from(rest);
            }
        }
    }
    path.to_path_buf()
}

#[cfg(windows)]
#[derive(Debug, PartialEq, Eq)]
enum Linked {
    Link,
    Copy,
}

#[cfg(windows)]
fn link_dir(target: &Path, link: &Path) -> io::Result<()> {
    match std::os::windows::fs::symlink_dir(target, link) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == io::ErrorKind::AlreadyExists => Err(e),
        Err(_) => junction(&absolute_target(target, link)?, link),
    }
}

/// A file link at `link` to `target`, or where links aren't allowed a copy of
/// `contents`, the file the link would lead to.
#[cfg(windows)]
fn link_file(target: &Path, link: &Path, contents: &Path) -> io::Result<Linked> {
    match std::os::windows::fs::symlink_file(target, link) {
        Ok(()) => return Ok(Linked::Link),
        Err(e) if e.kind() == io::ErrorKind::AlreadyExists => return Err(e),
        Err(_) => {}
    }
    if std::fs::symlink_metadata(link).is_ok() {
        return Err(io::ErrorKind::AlreadyExists.into());
    }
    std::fs::copy(contents, link)?;
    Ok(Linked::Copy)
}

/// A link target as an absolute path: a relative one is relative to the folder
/// holding the link.
#[cfg(windows)]
fn absolute_target(target: &Path, link: &Path) -> io::Result<PathBuf> {
    let joined = match link.parent() {
        Some(dir) if target.is_relative() => dir.join(target),
        _ => target.to_path_buf(),
    };
    std::path::absolute(joined)
}

#[cfg(windows)]
fn ledger_names(ledger: &Path) -> Vec<String> {
    std::fs::read_to_string(ledger)
        .map(|s| s.lines().map(str::to_string).collect())
        .unwrap_or_default()
}

#[cfg(windows)]
fn ledger_add(ledger: &Path, name: &str) -> io::Result<()> {
    let mut names = ledger_names(ledger);
    if names.iter().any(|n| n == name) {
        return Ok(());
    }
    names.push(name.to_string());
    let body = names.join("\n") + "\n";
    crate::fsatomic::write(
        ledger,
        body.as_bytes(),
        crate::fsatomic::Mode::Preserve(0o644),
    )
}

/// An NTFS junction at `link` (created here, must not exist) to the directory
/// `target`, an absolute path on a local volume.
#[cfg(windows)]
pub fn junction(target: &Path, link: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::{CloseHandle, GENERIC_WRITE, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::Storage::FileSystem::{
        CreateFileW, FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT, OPEN_EXISTING,
    };
    use windows_sys::Win32::System::IO::DeviceIoControl;
    const FSCTL_SET_REPARSE_POINT: u32 = 0x0009_00A4;

    let print: Vec<u16> = plain(target).as_os_str().encode_wide().collect();
    let substitute: Vec<u16> = r"\??\"
        .encode_utf16()
        .chain(print.iter().copied())
        .collect();
    let buf = mount_point_buffer(&substitute, &print)?;

    std::fs::create_dir(link)?;
    // Verbatim, so a link deep inside a copied tree isn't cut off at MAX_PATH.
    let absolute = std::path::absolute(link)?;
    let prefix: &[u16] = if absolute.as_os_str().to_string_lossy().starts_with(r"\\") {
        &[]
    } else {
        &[b'\\' as u16, b'\\' as u16, b'?' as u16, b'\\' as u16]
    };
    let wide: Vec<u16> = prefix
        .iter()
        .copied()
        .chain(absolute.as_os_str().encode_wide())
        .chain(Some(0))
        .collect();
    // SAFETY: `wide` is NUL-terminated and outlives the call; the handle is
    // closed below on every path.
    let handle = unsafe {
        CreateFileW(
            wide.as_ptr(),
            GENERIC_WRITE,
            0,
            std::ptr::null(),
            OPEN_EXISTING,
            FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS,
            std::ptr::null_mut(),
        )
    };
    if handle == INVALID_HANDLE_VALUE {
        let err = io::Error::last_os_error();
        let _ = std::fs::remove_dir(link);
        return Err(err);
    }
    let mut returned = 0u32;
    // SAFETY: `buf` is a complete REPARSE_DATA_BUFFER of the length passed.
    let ok = unsafe {
        DeviceIoControl(
            handle,
            FSCTL_SET_REPARSE_POINT,
            buf.as_ptr().cast(),
            buf.len() as u32,
            std::ptr::null_mut(),
            0,
            &mut returned,
            std::ptr::null_mut(),
        )
    };
    let err = io::Error::last_os_error();
    unsafe { CloseHandle(handle) };
    if ok == 0 {
        let _ = std::fs::remove_dir(link);
        return Err(err);
    }
    Ok(())
}

/// A REPARSE_DATA_BUFFER for a mount point (junction): the header, then the
/// substitute (NT) and print (display) names, each NUL-terminated.
#[cfg(any(windows, test))]
fn mount_point_buffer(substitute: &[u16], print: &[u16]) -> io::Result<Vec<u8>> {
    const IO_REPARSE_TAG_MOUNT_POINT: u32 = 0xA000_0003;
    const HEADER: usize = 8;
    let sub_bytes = substitute.len() * 2;
    let print_bytes = print.len() * 2;
    let data_len = 8 + sub_bytes + 2 + print_bytes + 2;
    let too_long = || io::Error::new(io::ErrorKind::InvalidInput, "junction target too long");
    let data_len16 = u16::try_from(data_len).map_err(|_| too_long())?;
    if HEADER + data_len > 16 * 1024 {
        return Err(too_long());
    }
    let mut buf = Vec::with_capacity(HEADER + data_len);
    buf.extend_from_slice(&IO_REPARSE_TAG_MOUNT_POINT.to_le_bytes());
    buf.extend_from_slice(&data_len16.to_le_bytes());
    buf.extend_from_slice(&0u16.to_le_bytes());
    for field in [0, sub_bytes, sub_bytes + 2, print_bytes] {
        buf.extend_from_slice(&(field as u16).to_le_bytes());
    }
    for unit in substitute.iter().chain(&[0]).chain(print).chain(&[0]) {
        buf.extend_from_slice(&unit.to_le_bytes());
    }
    Ok(buf)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A rooted path on every platform: `/src` alone has no drive on Windows,
    /// so `rebase_path` would refuse it as relative.
    fn abs(posix: &str) -> PathBuf {
        #[cfg(windows)]
        let posix = format!("C:{posix}");
        PathBuf::from(posix)
    }

    #[test]
    fn a_target_inside_the_old_root_moves_to_the_new_one() {
        assert_eq!(
            rebase_path(
                &abs("/src/app/node_modules/.pnpm/a/node_modules/a"),
                &abs("/src/app"),
                &abs("/src/app-x1"),
            ),
            Some(abs("/src/app-x1/node_modules/.pnpm/a/node_modules/a"))
        );
        assert_eq!(
            rebase_path(&abs("/src/app"), &abs("/src/app/"), &abs("/b")),
            Some(abs("/b"))
        );
    }

    #[cfg(windows)]
    #[test]
    fn a_verbatim_or_differently_cased_target_still_rebases() {
        let (old, new) = (Path::new(r"C:\src\app"), Path::new(r"C:\src\app-x1"));
        assert_eq!(
            rebase_path(Path::new(r"\\?\C:\src\app\pkg"), old, new),
            Some(PathBuf::from(r"C:\src\app-x1\pkg"))
        );
        assert_eq!(
            rebase_path(Path::new(r"c:\SRC\App\pkg"), old, new),
            Some(PathBuf::from(r"C:\src\app-x1\pkg"))
        );
    }

    #[test]
    fn relative_and_outside_targets_are_kept() {
        let (old, new) = (abs("/src/app"), abs("/src/app-x1"));
        assert_eq!(rebase_path(Path::new("../shared"), &old, &new), None);
        assert_eq!(rebase_path(&abs("/src/application/x"), &old, &new), None);
        assert_eq!(rebase_path(&abs("/usr/lib"), &old, &new), None);
    }

    #[cfg(unix)]
    #[test]
    fn a_copied_link_points_inside_the_copy() {
        let dir = tempfile::tempdir().unwrap();
        let (old, new) = (dir.path().join("app"), dir.path().join("copy"));
        std::fs::create_dir_all(old.join("store/pkg")).unwrap();
        std::fs::create_dir_all(&new).unwrap();
        std::os::unix::fs::symlink(old.join("store/pkg"), old.join("pkg")).unwrap();
        std::os::unix::fs::symlink("store", old.join("rel")).unwrap();
        copy_link(&old.join("pkg"), &new.join("pkg"), Some((&old, &new))).unwrap();
        copy_link(&old.join("rel"), &new.join("rel"), Some((&old, &new))).unwrap();
        assert_eq!(
            std::fs::read_link(new.join("pkg")).unwrap(),
            new.join("store/pkg")
        );
        assert_eq!(
            std::fs::read_link(new.join("rel")).unwrap(),
            PathBuf::from("store")
        );
    }

    #[cfg(unix)]
    #[test]
    fn mirror_links_once_and_leaves_what_is_there() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("settings.json");
        let dst = dir.path().join("acct-settings.json");
        let ledger = dir.path().join(".lpm-copies");
        mirror(&src, &dst, &ledger).unwrap();
        assert!(
            std::fs::symlink_metadata(&dst).is_err(),
            "no source, no link"
        );
        std::fs::write(&src, b"{}").unwrap();
        mirror(&src, &dst, &ledger).unwrap();
        assert_eq!(std::fs::read_link(&dst).unwrap(), src);
        let own = dir.path().join("own.json");
        std::fs::write(&own, b"mine").unwrap();
        mirror(&src, &own, &ledger).unwrap();
        assert_eq!(std::fs::read(&own).unwrap(), b"mine");
    }

    #[cfg(windows)]
    #[test]
    fn a_junction_leads_to_its_folder_and_reads_as_a_link() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("target");
        std::fs::create_dir(&target).unwrap();
        std::fs::write(target.join("f.txt"), "x").unwrap();
        let link = dir.path().join("link");
        junction(&target, &link).unwrap();
        assert_eq!(std::fs::read_to_string(link.join("f.txt")).unwrap(), "x");
        let kind = std::fs::symlink_metadata(&link).unwrap().file_type();
        assert!(kind.is_symlink());
        std::fs::remove_dir(&link).unwrap();
        assert!(
            target.join("f.txt").exists(),
            "removing a junction keeps its target"
        );
    }

    #[cfg(windows)]
    #[test]
    fn a_file_link_copied_before_its_target_still_leads_to_it() {
        let dir = tempfile::tempdir().unwrap();
        let (old, new) = (dir.path().join("app"), dir.path().join("copy"));
        std::fs::create_dir_all(old.join("envs")).unwrap();
        std::fs::create_dir_all(&new).unwrap();
        std::fs::write(old.join("envs/dev.json"), "dev").unwrap();
        let from = old.join("current.json");
        if std::os::windows::fs::symlink_file(r"envs\dev.json", &from).is_err() {
            return;
        }
        let to = new.join("current.json");
        copy_link(&from, &to, Some((&old, &new))).unwrap();
        if std::fs::symlink_metadata(&to).unwrap().file_type().is_symlink() {
            assert_eq!(std::fs::read_link(&to).unwrap(), PathBuf::from(r"envs\dev.json"));
        } else {
            assert_eq!(std::fs::read_to_string(&to).unwrap(), "dev");
        }
    }

    #[cfg(windows)]
    #[test]
    fn mirror_keeps_a_copied_file_in_step_with_its_source() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("settings.json");
        let dst = dir.path().join("acct-settings.json");
        let ledger = dir.path().join(".lpm-copies");
        std::fs::write(&src, b"one").unwrap();
        mirror(&src, &dst, &ledger).unwrap();
        assert_eq!(std::fs::read(&dst).unwrap(), b"one");
        std::fs::remove_file(&src).unwrap();
        std::fs::write(&src, b"two").unwrap();
        mirror(&src, &dst, &ledger).unwrap();
        assert_eq!(std::fs::read(&dst).unwrap(), b"two");
    }

    #[test]
    fn a_junction_buffer_carries_both_names() {
        let sub: Vec<u16> = r"\??\C:\a".encode_utf16().collect();
        let print: Vec<u16> = r"C:\a".encode_utf16().collect();
        let buf = mount_point_buffer(&sub, &print).unwrap();
        let u16_at = |i: usize| u16::from_le_bytes([buf[i], buf[i + 1]]);
        assert_eq!(&buf[..4], &0xA000_0003u32.to_le_bytes());
        assert_eq!(usize::from(u16_at(4)), buf.len() - 8);
        assert_eq!(u16_at(8), 0);
        assert_eq!(usize::from(u16_at(10)), sub.len() * 2);
        assert_eq!(usize::from(u16_at(12)), sub.len() * 2 + 2);
        assert_eq!(usize::from(u16_at(14)), print.len() * 2);
        let names: Vec<u16> = buf[16..]
            .chunks(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        assert_eq!(&names[..sub.len()], &sub[..]);
        assert_eq!(names[sub.len()], 0);
        assert_eq!(&names[sub.len() + 1..names.len() - 1], &print[..]);
        assert_eq!(names.last(), Some(&0));
    }
}
