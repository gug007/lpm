// Which executable a freshly started session daemon runs from, and on Windows
// how it is spawned.
//
// The daemon is this binary under a flag (sessiond.rs), and it must keep
// running after the app quits and after the app is upgraded. On macOS that is
// simply `current_exe()`. A Linux AppImage's `current_exe()` lives on a FUSE
// mount that goes away with the app, so the daemon re-execs the AppImage file
// itself. Windows locks a running executable against replacement, so a daemon
// running from lpm.exe would block every installer while services run; it runs
// from a copy under ~/.lpm/bin instead, named for the build it came from.
#![cfg_attr(test, allow(dead_code))]
use std::path::PathBuf;

pub fn program() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("session daemon: {e}"))?;
    #[cfg(target_os = "linux")]
    if let Some(image) = mounted_appimage(
        &exe,
        std::env::var_os("APPIMAGE"),
        std::env::var_os("APPDIR"),
    ) {
        return Ok(image);
    }
    #[cfg(windows)]
    return Ok(windows::versioned_copy(&exe).unwrap_or(exe));
    #[cfg(not(windows))]
    Ok(exe)
}

/// The AppImage file this process runs from, mounted or extracted.
#[cfg(target_os = "linux")]
pub fn running_appimage() -> Option<PathBuf> {
    appimage(
        &std::env::current_exe().ok()?,
        std::env::var_os("APPIMAGE"),
        std::env::var_os("APPDIR"),
    )
}

/// Both variables are inherited by every child of the app, so `APPIMAGE` alone
/// is not proof: a dev build started from an lpm terminal would otherwise pass
/// for the installed AppImage. It counts only when we run from inside `APPDIR`.
#[cfg(any(target_os = "linux", test))]
fn appimage(
    exe: &std::path::Path,
    image: Option<std::ffi::OsString>,
    appdir: Option<std::ffi::OsString>,
) -> Option<PathBuf> {
    let image = PathBuf::from(image.filter(|v| !v.is_empty())?);
    let appdir = PathBuf::from(appdir.filter(|v| !v.is_empty())?);
    (exe.starts_with(&appdir) && image.is_file()).then_some(image)
}

/// The AppImage to re-exec for the daemon: only one running from its FUSE mount
/// (`.mount_*`). Without FUSE the runtime extracts to a folder it deletes once
/// its child exits, and a re-exec'd daemon's launcher exits at once, deleting
/// the folder the app still runs from. The daemon then runs from
/// `current_exe()`, as it does outside an AppImage.
#[cfg(any(target_os = "linux", test))]
fn mounted_appimage(
    exe: &std::path::Path,
    image: Option<std::ffi::OsString>,
    appdir: Option<std::ffi::OsString>,
) -> Option<PathBuf> {
    let mounted = appdir
        .as_deref()
        .and_then(|dir| std::path::Path::new(dir).file_name())
        .is_some_and(|name| name.to_string_lossy().starts_with(".mount_"));
    appimage(exe, image, appdir).filter(|_| mounted)
}

/// Copies of one build share a name, so every launcher of that build reuses the
/// first copy; a rebuild or reinstall of the same version gets a new one.
#[cfg(any(windows, test))]
fn copy_name(prefix: &str, version: &str, len: u64, modified_nanos: u128) -> String {
    let mut hash: u32 = 0x811c_9dc5;
    for byte in len.to_le_bytes().iter().chain(&modified_nanos.to_le_bytes()) {
        hash ^= u32::from(*byte);
        hash = hash.wrapping_mul(0x0100_0193);
    }
    format!("{prefix}{version}-{hash:08x}.exe")
}

/// An earlier build's copy, or staging left by a launcher that died mid-copy.
/// Staging still being written is spared until it is clearly abandoned.
#[cfg(any(windows, test))]
fn is_leftover(name: &str, prefix: &str, keep: &str, age: std::time::Duration) -> bool {
    if !name.starts_with(prefix) || name == keep {
        return false;
    }
    if name.ends_with(".tmp") {
        return age >= std::time::Duration::from_secs(3600);
    }
    name.ends_with(".exe")
}

#[cfg(windows)]
mod windows {
    use super::{copy_name, is_leftover};
    use std::fs::{self, File};
    use std::path::{Path, PathBuf};
    use std::process::{Command, Stdio};
    use windows_sys::Win32::System::Threading::{CREATE_NEW_PROCESS_GROUP, DETACHED_PROCESS};

    const ERROR_ACCESS_DENIED: i32 = 5;
    const MAX_LOG: u64 = 1024 * 1024;

    fn prefix() -> &'static str {
        if cfg!(debug_assertions) {
            "lpm-dev-sessiond-"
        } else {
            "lpm-sessiond-"
        }
    }

    /// The copy to run, made on first need. `None` when it can't be made — the
    /// daemon then runs from lpm.exe itself, which works but holds the lock.
    pub fn versioned_copy(exe: &Path) -> Option<PathBuf> {
        copy_into(exe, &crate::config::lpm_dir().join("bin"))
    }

    pub(super) fn copy_into(exe: &Path, dir: &Path) -> Option<PathBuf> {
        // Projects started together each launch a daemon. One copy at a time,
        // so a later caller finds the first one's copy complete instead of
        // colliding with it on this process's staging name.
        static COPYING: std::sync::Mutex<()> = std::sync::Mutex::new(());
        let _copying = COPYING.lock().unwrap_or_else(|e| e.into_inner());
        let meta = fs::metadata(exe).ok()?;
        let modified = meta
            .modified()
            .ok()?
            .duration_since(std::time::UNIX_EPOCH)
            .ok()?
            .as_nanos();
        let name = copy_name(prefix(), env!("CARGO_PKG_VERSION"), meta.len(), modified);
        let target = dir.join(&name);
        let complete = |p: &Path| fs::metadata(p).is_ok_and(|m| m.len() == meta.len());
        if complete(&target) {
            copy_sibling_dlls(exe, dir);
            return Some(target);
        }
        fs::create_dir_all(dir).ok()?;
        let staging = dir.join(format!("{name}.{}.tmp", std::process::id()));
        if fs::copy(exe, &staging).is_err() {
            let _ = fs::remove_file(&staging);
            return None;
        }
        // A launcher in another process may have renamed its own copy into
        // place first; either copy is the same build.
        if fs::rename(&staging, &target).is_err() {
            let _ = fs::remove_file(&staging);
        }
        if !complete(&target) {
            return None;
        }
        copy_sibling_dlls(exe, dir);
        prune(dir, &name);
        Some(target)
    }

    /// DLLs installed beside the app (a dynamically linked WebView2 loader, for
    /// one) have to sit beside the copy too, or it fails to load before main.
    fn copy_sibling_dlls(exe: &Path, dir: &Path) {
        let Some(Ok(entries)) = exe.parent().map(fs::read_dir) else {
            return;
        };
        for entry in entries.flatten() {
            let from = entry.path();
            let is_dll = from
                .extension()
                .is_some_and(|e| e.eq_ignore_ascii_case("dll"));
            let Ok(meta) = entry.metadata() else {
                continue;
            };
            if !is_dll || !meta.is_file() {
                continue;
            }
            let to = dir.join(entry.file_name());
            if fs::metadata(&to).is_ok_and(|m| m.len() == meta.len()) {
                continue;
            }
            let staging = to.with_extension(format!("dll.{}.tmp", std::process::id()));
            if fs::copy(&from, &staging).is_ok() && fs::rename(&staging, &to).is_ok() {
                continue;
            }
            let _ = fs::remove_file(&staging);
        }
    }

    /// Delete other builds' copies. A copy a daemon still runs from refuses
    /// deletion, which is exactly the one to keep.
    fn prune(dir: &Path, keep: &str) {
        let Ok(entries) = fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            let age = entry
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.elapsed().ok())
                .unwrap_or_default();
            if is_leftover(&name, prefix(), keep, age) {
                let _ = fs::remove_file(entry.path());
            }
        }
    }

    /// Where the daemon's stdout and stderr go: it prints nothing in normal
    /// operation, so this holds a panic or a startup failure, nothing else.
    fn log_file() -> Option<File> {
        let stem = crate::sessiond::socket_path()
            .file_stem()?
            .to_string_lossy()
            .into_owned();
        let dir = crate::config::lpm_dir().join("logs");
        fs::create_dir_all(&dir).ok()?;
        let path = dir.join(format!("{stem}.log"));
        if fs::metadata(&path).is_ok_and(|m| m.len() > MAX_LOG) {
            let _ = fs::remove_file(&path);
        }
        File::options().create(true).append(true).open(path).ok()
    }

    /// Start the daemon detached from this process's console, process group and
    /// job, so closing the app (or the job a launcher put it in) leaves it
    /// running. Nothing to wait for: unlike the Unix launcher there is no
    /// intermediate process.
    pub fn spawn(program: &Path) -> Result<(), String> {
        let mut cmd = Command::new(program);
        cmd.arg(crate::sessiond::DAEMON_ARG).stdin(Stdio::null());
        match log_file().and_then(|log| Some((log.try_clone().ok()?, log))) {
            Some((out, err)) => cmd.stdout(out).stderr(err),
            None => cmd.stdout(Stdio::null()).stderr(Stdio::null()),
        };
        crate::osproc::detach(&mut cmd);
        let spawned = match cmd.spawn() {
            // A job that forbids breakaway (cargo's, some launchers') refuses
            // the whole spawn; run inside it rather than not at all.
            Err(e) if e.raw_os_error() == Some(ERROR_ACCESS_DENIED) => {
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP)
                    .spawn()
            }
            other => other,
        };
        spawned
            .map(drop)
            .map_err(|e| format!("could not start the session daemon: {e}"))
    }
}

#[cfg(all(windows, not(test)))]
pub use windows::spawn;

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    use std::time::Duration;

    fn os(p: &Path) -> Option<std::ffi::OsString> {
        Some(p.as_os_str().to_owned())
    }

    #[test]
    fn an_appimage_counts_only_when_we_run_from_inside_it() {
        let dir = tempfile::tempdir().unwrap();
        let image = dir.path().join("lpm.AppImage");
        std::fs::write(&image, b"").unwrap();
        let mount = Path::new("/tmp/.mount_lpmAbC");
        let inside = mount.join("usr/bin/lpm-desktop");

        assert_eq!(appimage(&inside, os(&image), os(mount)), Some(image.clone()));
        assert_eq!(
            appimage(Path::new("/home/u/dev/lpm-desktop"), os(&image), os(mount)),
            None
        );
        assert_eq!(appimage(&inside, os(&image), None), None);
        assert_eq!(appimage(&inside, None, os(mount)), None);
        assert_eq!(appimage(&inside, Some("".into()), os(mount)), None);
        let gone = dir.path().join("deleted.AppImage");
        assert_eq!(appimage(&inside, os(&gone), os(mount)), None);

        let extracted = Path::new("/tmp/appimage_extracted_abc");
        assert_eq!(
            appimage(&extracted.join("usr/bin/lpm-desktop"), os(&image), os(extracted)),
            Some(image.clone())
        );
    }

    #[test]
    fn the_daemon_reexecs_only_a_fuse_mounted_appimage() {
        let dir = tempfile::tempdir().unwrap();
        let image = dir.path().join("lpm.AppImage");
        std::fs::write(&image, b"").unwrap();
        let mount = Path::new("/tmp/.mount_lpmAbC");
        assert_eq!(
            mounted_appimage(&mount.join("usr/bin/lpm-desktop"), os(&image), os(mount)),
            Some(image.clone())
        );

        let extracted = Path::new("/tmp/appimage_extracted_abc");
        assert_eq!(
            mounted_appimage(
                &extracted.join("usr/bin/lpm-desktop"),
                os(&image),
                os(extracted)
            ),
            None
        );
        assert_eq!(
            mounted_appimage(Path::new("/home/u/dev/lpm-desktop"), os(&image), os(mount)),
            None
        );
        assert_eq!(
            mounted_appimage(&mount.join("usr/bin/lpm-desktop"), os(&image), None),
            None
        );
    }

    #[cfg(windows)]
    #[test]
    fn launchers_in_one_process_share_one_copy() {
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("lpm.exe");
        std::fs::write(&exe, vec![7u8; 32 * 1024 * 1024]).unwrap();
        let bin = dir.path().join("bin");
        let launchers: Vec<_> = (0..4)
            .map(|_| {
                let (exe, bin) = (exe.clone(), bin.clone());
                std::thread::spawn(move || windows::copy_into(&exe, &bin))
            })
            .collect();
        let copies: Vec<_> = launchers.into_iter().map(|t| t.join().unwrap()).collect();
        let first = copies[0].clone().expect("a copy");
        assert!(copies.iter().all(|c| c.as_ref() == Some(&first)));
        assert_eq!(std::fs::read_dir(&bin).unwrap().count(), 1, "no staging left");
    }

    #[cfg(windows)]
    #[test]
    fn the_copy_gets_the_dlls_installed_beside_the_app() {
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("lpm.exe");
        std::fs::write(&exe, b"exe").unwrap();
        std::fs::write(dir.path().join("WebView2Loader.dll"), b"loader").unwrap();
        let bin = dir.path().join("bin");
        windows::copy_into(&exe, &bin).expect("a copy");
        assert_eq!(std::fs::read(bin.join("WebView2Loader.dll")).unwrap(), b"loader");
    }

    #[test]
    fn a_copy_is_named_for_its_version_and_build() {
        let name = copy_name("lpm-sessiond-", "1.2.3", 1000, 42);
        assert!(name.starts_with("lpm-sessiond-1.2.3-"));
        assert!(name.ends_with(".exe"));
        assert_eq!(name, copy_name("lpm-sessiond-", "1.2.3", 1000, 42));
        assert_ne!(name, copy_name("lpm-sessiond-", "1.2.3", 1001, 42));
        assert_ne!(name, copy_name("lpm-sessiond-", "1.2.3", 1000, 43));
    }

    #[test]
    fn only_other_builds_and_abandoned_staging_are_pruned() {
        let keep = "lpm-sessiond-1.2.3-aaaaaaaa.exe";
        let fresh = Duration::from_secs(5);
        let old = Duration::from_secs(7200);
        let leftover = |name: &str, age| is_leftover(name, "lpm-sessiond-", keep, age);

        assert!(!leftover(keep, old));
        assert!(leftover("lpm-sessiond-1.2.2-bbbbbbbb.exe", fresh));
        assert!(!leftover("lpm-sessiond-1.2.3-aaaaaaaa.exe.77.tmp", fresh));
        assert!(leftover("lpm-sessiond-1.2.3-aaaaaaaa.exe.77.tmp", old));
        assert!(!leftover("lpm-dev-sessiond-1.2.3-cccccccc.exe", old));
        assert!(!leftover("lpm.exe", old));
        assert!(!leftover("lpm-sessiond-notes.txt", old));
    }
}
