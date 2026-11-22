// Updating lpm in place on Windows. The lpm installer (NSIS, per user, no admin)
// does the replacing: it is downloaded like a macOS update, then run passive
// (`/P`: a progress bar, no questions) as an upgrade (`/UPDATE`: keeps what an
// upgrade keeps) that opens lpm again when it's done (`/R`). Windows won't
// replace a running exe, so lpm quits first. The installer is created suspended
// and only let go once lpm has ended its terminals, tunnels and sidecars, so an
// installer that can't start (blocked by antivirus, say) leaves everything
// running. A copy the installer didn't put in place (a dev build, a copied
// folder) gets the download notice instead.
#![cfg_attr(not(windows), allow(dead_code))]

use std::path::Path;
use std::time::Duration;

const INSTALLER_ARGS: &[&str] = &["/P", "/UPDATE", "/R"];
const SETUP_SUFFIX: &str = "-setup.exe";

/// How long quitting gets before the installer starts anyway: it ends lpm
/// itself if it finds it still running.
const TEARDOWN_LIMIT: Duration = Duration::from_secs(8);

/// The command line that starts `setup`.
fn command_line(setup: &Path, args: &[&str]) -> String {
    let mut line = format!("\"{}\"", setup.display());
    for arg in args {
        line.push(' ');
        line.push_str(arg);
    }
    line
}

/// An installer an earlier update downloaded (`lpm-update-…-setup.exe`).
fn is_leftover(name: &str) -> bool {
    name.starts_with("lpm-update-") && name.ends_with(SETUP_SUFFIX)
}

#[cfg(windows)]
pub(crate) use win::*;

#[cfg(windows)]
mod win {
    use super::*;
    use crate::updatejob::JobGuard;
    use crate::updates::{Observer, Target};
    use serde_json::Value;
    use tauri::{AppHandle, Emitter};
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        CreateProcessW, ResumeThread, TerminateProcess, CREATE_SUSPENDED, PROCESS_INFORMATION,
        STARTUPINFOW,
    };

    const NOT_INSTALLED: &str =
        "This copy of lpm wasn't put here by the lpm installer, so it can't update itself.";

    /// The installer leaves its uninstaller beside every copy it puts in place.
    pub(crate) fn installed() -> bool {
        static INSTALLED: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
        *INSTALLED.get_or_init(|| {
            std::env::current_exe()
                .ok()
                .and_then(|exe| exe.parent().map(|dir| dir.join("uninstall.exe").is_file()))
                .unwrap_or(false)
        })
    }

    /// Deletes installers earlier updates left in the temp folder. One still
    /// running can't be deleted and is left for the next start.
    pub(crate) fn sweep_leftovers() {
        let Ok(entries) = std::fs::read_dir(std::env::temp_dir()) else {
            return;
        };
        for entry in entries.flatten() {
            if is_leftover(&entry.file_name().to_string_lossy()) {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }

    pub(crate) fn install(
        app: &AppHandle,
        job: &mut JobGuard,
        report: &Observer,
        target: Target,
    ) -> Result<(), String> {
        report("update-status", Value::from("checking"));
        let check = job.run(crate::updates::do_check)?;
        let info = check.info.clone();
        let (_, url) = check.target(target)?;
        if target == Target::Newest {
            let _ = app.emit("update-available", info);
        }
        if !installed() {
            return Err(NOT_INSTALLED.into());
        }

        let setup = crate::updates::download_release(job, report, &url, SETUP_SUFFIX)?;
        job.commit()?;
        report("update-status", Value::from("installing"));

        let setup = setup
            .keep()
            .map_err(|e| format!("failed to keep the installer: {e}"))?;
        let installer = Suspended::create(&setup, INSTALLER_ARGS)?;
        teardown_within(app, TEARDOWN_LIMIT);
        installer.resume();
        std::process::exit(0);
    }

    /// Runs the quit teardown, giving up on it after `limit`.
    fn teardown_within(app: &AppHandle, limit: Duration) {
        let (done, finished) = std::sync::mpsc::channel();
        let app = app.clone();
        std::thread::spawn(move || {
            crate::lifecycle::teardown(&app, false);
            crate::tailnet::wait_stopped();
            let _ = done.send(());
        });
        let _ = finished.recv_timeout(limit);
    }

    /// A process created with its first thread held. Dropped without
    /// `resume`, it is ended before it ran.
    struct Suspended(Option<PROCESS_INFORMATION>);

    impl Suspended {
        fn create(exe: &Path, args: &[&str]) -> Result<Self, String> {
            let mut line: Vec<u16> = command_line(exe, args)
                .encode_utf16()
                .chain(Some(0))
                .collect();
            let dir: Vec<u16> = exe
                .parent()
                .unwrap_or(Path::new("."))
                .as_os_str()
                .to_string_lossy()
                .encode_utf16()
                .chain(Some(0))
                .collect();
            let mut startup: STARTUPINFOW = unsafe { std::mem::zeroed() };
            startup.cb = std::mem::size_of::<STARTUPINFOW>() as u32;
            let mut info: PROCESS_INFORMATION = unsafe { std::mem::zeroed() };
            let ok = unsafe {
                CreateProcessW(
                    std::ptr::null(),
                    line.as_mut_ptr(),
                    std::ptr::null(),
                    std::ptr::null(),
                    0,
                    CREATE_SUSPENDED,
                    std::ptr::null(),
                    dir.as_ptr(),
                    &startup,
                    &mut info,
                )
            };
            if ok == 0 {
                return Err(format!(
                    "couldn't start the installer: {}",
                    std::io::Error::last_os_error()
                ));
            }
            Ok(Self(Some(info)))
        }

        fn resume(mut self) {
            if let Some(info) = self.0.take() {
                unsafe {
                    ResumeThread(info.hThread);
                    CloseHandle(info.hThread);
                    CloseHandle(info.hProcess);
                }
            }
        }
    }

    impl Drop for Suspended {
        fn drop(&mut self) {
            if let Some(info) = self.0.take() {
                unsafe {
                    TerminateProcess(info.hProcess, 1);
                    CloseHandle(info.hThread);
                    CloseHandle(info.hProcess);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_installer_runs_passive_as_an_upgrade_and_reopens_lpm() {
        let setup = Path::new(r"C:\Users\A B\AppData\Local\Temp\lpm-update-x1-setup.exe");
        assert_eq!(
            command_line(setup, INSTALLER_ARGS),
            r#""C:\Users\A B\AppData\Local\Temp\lpm-update-x1-setup.exe" /P /UPDATE /R"#
        );
    }

    #[test]
    fn only_downloaded_installers_are_swept() {
        assert!(is_leftover("lpm-update-Ab12Cd-setup.exe"));
        assert!(!is_leftover("lpm-update-Ab12Cd.dmg"));
        assert!(!is_leftover("lpm-desktop-windows-amd64-setup.exe"));
        assert!(!is_leftover("other-setup.exe"));
    }
}
