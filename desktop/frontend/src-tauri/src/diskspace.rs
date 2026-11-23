// How much room is left on the disk that holds a folder: for the Duplicate
// dialog's estimate and a connected computer's card in Connections.
use serde::Serialize;
use std::path::Path;

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DiskSpace {
    /// What this user can still write.
    pub free: u64,
    pub total: u64,
    /// A copy made here shares its unchanged files with the original (an APFS
    /// clone), so it takes almost nothing until either one changes.
    pub clones: bool,
}

#[cfg(target_os = "macos")]
pub(crate) fn space(path: &Path) -> Option<DiskSpace> {
    use std::os::unix::ffi::OsStrExt;
    let c = std::ffi::CString::new(path.as_os_str().as_bytes()).ok()?;
    let mut st: libc::statfs = unsafe { std::mem::zeroed() };
    if unsafe { libc::statfs(c.as_ptr(), &mut st) } != 0 {
        return None;
    }
    let unit = u64::from(st.f_bsize);
    let kind = unsafe { std::ffi::CStr::from_ptr(st.f_fstypename.as_ptr()) };
    Some(DiskSpace {
        free: st.f_bavail.saturating_mul(unit),
        total: st.f_blocks.saturating_mul(unit),
        clones: kind.to_bytes() == b"apfs",
    })
}

#[cfg(all(unix, not(target_os = "macos")))]
pub(crate) fn space(path: &Path) -> Option<DiskSpace> {
    use std::os::unix::ffi::OsStrExt;
    let c = std::ffi::CString::new(path.as_os_str().as_bytes()).ok()?;
    let mut st: libc::statvfs = unsafe { std::mem::zeroed() };
    if unsafe { libc::statvfs(c.as_ptr(), &mut st) } != 0 {
        return None;
    }
    #[allow(clippy::unnecessary_cast)]
    let unit = st.f_frsize as u64;
    #[allow(clippy::unnecessary_cast)]
    Some(DiskSpace {
        free: (st.f_bavail as u64).saturating_mul(unit),
        total: (st.f_blocks as u64).saturating_mul(unit),
        clones: false,
    })
}

#[cfg(windows)]
pub(crate) fn space(path: &Path) -> Option<DiskSpace> {
    use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    let wide = crate::sys::wide(path);
    let (mut free, mut total, mut all_free) = (0u64, 0u64, 0u64);
    let ok = unsafe { GetDiskFreeSpaceExW(wide.as_ptr(), &mut free, &mut total, &mut all_free) };
    (ok != 0).then_some(DiskSpace {
        free,
        total,
        clones: false,
    })
}

/// The disk that holds this computer's home folder, where projects and their
/// copies go unless someone put them elsewhere.
#[tauri::command(async)]
pub fn machine_disk_space() -> Option<DiskSpace> {
    space(&dirs::home_dir()?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_disk_a_folder_is_on() {
        let dir = tempfile::tempdir().unwrap();
        let s = space(dir.path()).unwrap();
        assert!(s.total > 0);
        assert!(s.free <= s.total);
    }

    #[test]
    fn a_missing_folder_has_no_answer() {
        assert_eq!(space(Path::new("/definitely/not/here")), None);
    }
}
