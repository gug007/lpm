// Self-updater — port of desktop/updates.go.
//
// CheckForUpdate asks GitHub for the newest release on this app's update
// channel (updatechannel.rs) and the newest stable one. InstallUpdate re-runs
// that check so it always targets the actual latest release, downloads its
// macos-<arch>.dmg (emitting progress), mounts it, swaps the running .app, and
// relaunches. RollbackUpdate does the same with the newest stable release, for
// a Beta build going back. In dev there is no enclosing .app, so both
// error early (before any destructive step).
//
// The download-and-swap flow is .app/DMG-shaped and therefore macOS-only. A
// Linux or Windows desktop gets a notice instead: the same check picks this
// machine's installer (updatenotice.rs) and InstallUpdate opens its download in
// the browser. A headless Linux host is updated by whatever installed it
// (package manager, tarball, image rebuild), so there the commands stay
// registered — the peer protocol must look identical from a Mac client — but
// refuse, and no auto-check thread is started.
#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

use crate::updatechannel::{Asset, Channel, Choice, Found};
use crate::updatejob::UpdateJob;
use serde::Serialize;
use serde_json::Value;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use std::time::SystemTime;
use tauri::Emitter;
#[cfg(target_os = "macos")]
use tauri::Manager;
use tauri::{AppHandle, State};

pub(crate) const DEV_BUILD: &str = "Updates aren't available in development builds.";

/// Hears an install's `update-status` and `update-progress` steps besides this
/// app's own windows: the paired Mac that asked for it (peerupdate.rs).
pub(crate) type Observer = Arc<dyn Fn(&'static str, Value) + Send + Sync>;

#[derive(Default)]
pub struct UpdateState {
    job: UpdateJob,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current_version: String,
    /// The newest release on `channel`.
    pub latest_version: String,
    pub update_avail: bool,
    pub channel: &'static str,
    /// The newest stable release, which a rollback installs.
    pub stable_version: String,
    /// This build is newer than the newest stable release: a Beta build.
    pub rollback_avail: bool,
    /// Linux/Windows: the installer to download for this update.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download_url: Option<String>,
}

/// A check's answer, and where the releases it names are downloaded from.
struct Check {
    info: UpdateInfo,
    newest_url: String,
    stable_url: String,
}

/// What an install moves to: this channel's newest release, or back to the
/// newest stable one.
#[derive(Clone, Copy, PartialEq)]
pub(crate) enum Target {
    Newest,
    Stable,
}

impl Check {
    /// The version and download `target` installs, or why there is none.
    fn target(self, target: Target) -> Result<(String, String), String> {
        match target {
            Target::Newest if self.info.update_avail => {
                Ok((self.info.latest_version, self.newest_url))
            }
            Target::Stable if self.info.rollback_avail => {
                Ok((self.info.stable_version, self.stable_url))
            }
            Target::Newest => Err("You're already on the latest version.".into()),
            Target::Stable => {
                Err("This version isn't newer than the latest stable release.".into())
            }
        }
    }
}

pub(crate) fn current_version() -> String {
    option_env!("LPM_VERSION").unwrap_or("dev").to_string()
}

/// Go GOARCH spelling for the asset suffix (macos-arm64.dmg / macos-amd64.dmg).
fn go_arch() -> &'static str {
    match std::env::consts::ARCH {
        "aarch64" => "arm64",
        "x86_64" => "amd64",
        other => other,
    }
}

/// version.Newer: compare up to 3 dot-separated integer parts.
pub(crate) fn newer(latest: &str, current: &str) -> bool {
    fn parse(v: &str) -> [i64; 3] {
        let mut p = [0i64; 3];
        for (i, s) in v.splitn(3, '.').enumerate() {
            p[i] = s.parse().unwrap_or(0);
        }
        p
    }
    let (l, c) = (parse(latest), parse(current));
    if l[0] != c[0] {
        return l[0] > c[0];
    }
    if l[1] != c[1] {
        return l[1] > c[1];
    }
    l[2] > c[2]
}

#[cfg(not(target_os = "macos"))]
const UNSUPPORTED: &str =
    "lpm updates itself only on macOS — update this host the way you installed it.";

#[tauri::command(async)]
pub fn check_for_update() -> Result<UpdateInfo, String> {
    #[cfg(not(target_os = "macos"))]
    if crate::sys::headless() {
        return Err(UNSUPPORTED.into());
    }
    Ok(do_check()?.info)
}

/// Background check used by the "Check for Updates…" menu item and the
/// auto-checker — emits "update-available" when a newer release exists.
pub fn check_and_emit(app: &AppHandle) -> Result<(), String> {
    #[cfg(not(target_os = "macos"))]
    if crate::sys::headless() {
        return Err(UNSUPPORTED.into());
    }
    let info = do_check()?.info;
    if info.update_avail {
        let _ = app.emit("update-available", info);
    }
    Ok(())
}

const AUTO_CHECK_INTERVAL: Duration = Duration::from_secs(24 * 60 * 60);
const AUTO_CHECK_TICK: Duration = Duration::from_secs(15 * 60);

/// Check once at startup, then every 24h of wall-clock time while the app runs
/// (the window may be hidden). thread::sleep on macOS stops counting while the
/// system is asleep, so a single 24h sleep stretches by however long the Mac
/// slept — tick in short intervals and compare SystemTime instead. A failed
/// check (e.g. network not up yet at login) retries on the next tick rather
/// than silently waiting another 24h.
pub fn start_auto_check(app: AppHandle) {
    #[cfg(not(target_os = "macos"))]
    if crate::sys::headless() {
        return;
    }
    std::thread::spawn(move || {
        let mut next_check = SystemTime::now();
        loop {
            if SystemTime::now() >= next_check && check_and_emit(&app).is_ok() {
                next_check = SystemTime::now() + AUTO_CHECK_INTERVAL;
            }
            std::thread::sleep(AUTO_CHECK_TICK);
        }
    });
}

// reqwest::blocking owns a tokio runtime that panics if dropped on a
// #[command(async)] worker; run such work on a plain thread, which is not an async
// context (the start_auto_check path relied on the same property).
pub(crate) fn run_off_worker<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    std::thread::spawn(f)
        .join()
        .map_err(|_| "background thread panicked".to_string())?
}

fn do_check() -> Result<Check, String> {
    let channel = Channel::current();
    let Choice { newest, stable } = crate::updatechannel::fetch(channel, &download)?;
    let current = current_version().trim_start_matches('v').to_string();
    // Dev/debug builds report version "dev" (parsed as 0.0.0) and have no
    // enclosing .app to swap — never offer them a release they can't apply.
    let release_build = current != "dev";
    let update_avail =
        release_build && newest.as_ref().is_some_and(|f| newer(&f.version, &current));
    let rollback_avail =
        release_build && stable.as_ref().is_some_and(|f| newer(&current, &f.version));
    let version = |f: &Option<Found>| f.as_ref().map(|f| f.version.clone()).unwrap_or_default();
    let url = |f: &Option<Found>| f.as_ref().map(|f| f.url.clone()).unwrap_or_default();
    Ok(Check {
        info: UpdateInfo {
            latest_version: version(&newest),
            stable_version: version(&stable),
            current_version: current,
            update_avail,
            rollback_avail,
            channel: channel.as_str(),
            download_url: newest
                .as_ref()
                .filter(|_| cfg!(not(target_os = "macos")))
                .map(|f| f.url.clone()),
        },
        newest_url: url(&newest),
        stable_url: url(&stable),
    })
}

/// This machine's download in a release: its DMG on macOS, its installer
/// elsewhere. A release without one is never offered, so an update never
/// points at nothing.
fn download(assets: &[Asset]) -> Option<String> {
    #[cfg(target_os = "macos")]
    let asset = {
        let suffix = format!("macos-{}.dmg", go_arch());
        assets.iter().find(|a| a.name.ends_with(&suffix))
    };
    #[cfg(not(target_os = "macos"))]
    let asset = {
        let names: Vec<&str> = assets.iter().map(|a| a.name.as_str()).collect();
        crate::updatenotice::pick(
            &names,
            crate::updatenotice::current(),
            std::env::consts::ARCH,
        )
        .and_then(|name| assets.iter().find(|a| a.name == name))
    };
    asset.map(|a| a.browser_download_url.clone())
}

/// Probe that the folder holding the .app is writable before downloading
/// anything — it isn't when the app runs Gatekeeper-translocated (launched
/// from ~/Downloads), straight off a mounted DMG, or without permission to
/// the install folder. "Open it from there" matters: moving the .app doesn't
/// change the running process's path, so Retry alone can't succeed.
fn ensure_app_dir_writable(app_dir: &Path) -> Result<(), String> {
    use std::io::ErrorKind;
    match tempfile::Builder::new().prefix(".lpm-update-probe-").tempdir_in(app_dir) {
        Ok(_) => Ok(()),
        Err(e) if matches!(e.kind(), ErrorKind::PermissionDenied | ErrorKind::ReadOnlyFilesystem) => {
            Err("lpm can't update itself in its current location. Move it to a folder you can change — like the Applications folder — then open it from there.".into())
        }
        Err(e) => Err(format!("failed to prepare update: {e}")),
    }
}

/// stderr is where hdiutil/ditto write diagnostics (stdout is empty on
/// failure); fall back to the exit status so the cause is never blank.
fn command_failure(out: &std::process::Output) -> String {
    let stderr = String::from_utf8_lossy(&out.stderr);
    let stderr = stderr.trim();
    if stderr.is_empty() {
        out.status.to_string()
    } else {
        stderr.to_string()
    }
}

/// Walk up from the current executable to the enclosing `*.app` bundle.
pub(crate) fn app_bundle_path() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let mut dir = exe.parent();
    while let Some(d) = dir {
        if d.as_os_str().is_empty() || d == Path::new("/") {
            break;
        }
        if d.extension().and_then(|e| e.to_str()) == Some("app") {
            return Ok(d.to_path_buf());
        }
        dir = d.parent();
    }
    Err(format!(
        "could not determine .app bundle path from {}",
        exe.display()
    ))
}

#[tauri::command(async)]
pub fn install_update(app: AppHandle, state: State<'_, UpdateState>) -> Result<(), String> {
    install_command(&app, &state, Target::Newest)
}

/// Back from a Beta build to the newest stable release.
#[tauri::command(async)]
pub fn rollback_update(app: AppHandle, state: State<'_, UpdateState>) -> Result<(), String> {
    install_command(&app, &state, Target::Stable)
}

/// Linux/Windows: open the installer's download in the browser. Returns Err
/// even then, so a caller waiting for the app to restart stops waiting and
/// shows what to do next.
#[cfg(not(target_os = "macos"))]
fn install_command(app: &AppHandle, _state: &UpdateState, target: Target) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    if crate::sys::headless() {
        return Err(UNSUPPORTED.into());
    }
    if current_version() == "dev" {
        return Err(DEV_BUILD.into());
    }
    let (version, url) = do_check()?.target(target)?;
    app.opener()
        .open_url(url, None::<String>)
        .map_err(|e| format!("failed to open the download: {e}"))?;
    Err(format!(
        "The lpm {version} installer is downloading in your browser. Open it to finish updating."
    ))
}

/// Returns Ok only when cancel_update stopped it: a finished install relaunches
/// the app instead of returning.
#[cfg(target_os = "macos")]
fn install_command(app: &AppHandle, state: &UpdateState, target: Target) -> Result<(), String> {
    // No enclosing .app in dev — bail with a product-terms message instead of
    // leaking the debug binary path from app_bundle_path() into the UI.
    if current_version() == "dev" {
        return Err(DEV_BUILD.into());
    }
    let mut job = state.job.begin()?;
    let result = install(app, &mut job, &reporter(app, None), target);
    crate::remote_update::relay(app, "update-status", &Value::from("idle"));
    match result {
        Err(_) if job.cancelled() => Ok(()),
        result => result,
    }
}

/// The same install, asked for by a paired Mac or phone. Its steps go to
/// `observer` as well as this app's windows, so whoever sits here sees it happen
/// too. Ok(true) when it was cancelled; a finished install restarts the app
/// instead of returning. Either way of stopping short tells this app's windows it
/// is over, since no install of theirs is waiting to say so.
#[cfg(target_os = "macos")]
pub(crate) fn install_for_peer(
    app: &AppHandle,
    observer: Option<Observer>,
) -> Result<bool, String> {
    install_observed(app, observer, Target::Newest)
}

/// [`install_for_peer`] to either target: what `lpm update` and an install
/// waiting for idle run.
#[cfg(target_os = "macos")]
pub(crate) fn install_observed(
    app: &AppHandle,
    observer: Option<Observer>,
    target: Target,
) -> Result<bool, String> {
    if current_version() == "dev" {
        return Err(DEV_BUILD.into());
    }
    let state = app.state::<UpdateState>();
    let mut job = state.job.begin()?;
    let result = install(app, &mut job, &reporter(app, observer), target);
    let _ = app.emit("update-status", "idle");
    crate::remote_update::relay(app, "update-status", &Value::from("idle"));
    match result {
        Err(_) if job.cancelled() => Ok(true),
        Err(e) => {
            // No install of this window's is waiting to show why it failed.
            let _ = app.emit("update-error", &e);
            Err(e)
        }
        Ok(()) => Ok(false),
    }
}

/// The version `target` would install, or None when this build is already the
/// newest on its channel.
#[cfg(target_os = "macos")]
pub(crate) fn pending_version(target: Target) -> Result<Option<String>, String> {
    let check = do_check()?;
    if target == Target::Newest && !check.info.update_avail {
        return Ok(None);
    }
    check.target(target).map(|(version, _)| Some(version))
}

#[cfg(target_os = "macos")]
fn reporter(app: &AppHandle, observer: Option<Observer>) -> Observer {
    let app = app.clone();
    Arc::new(move |event, payload| {
        let _ = app.emit(event, payload.clone());
        crate::remote_update::relay(&app, event, &payload);
        if let Some(observer) = &observer {
            observer(event, payload);
        }
    })
}

#[tauri::command]
pub fn cancel_update(state: State<'_, UpdateState>) -> bool {
    state.job.cancel()
}

pub(crate) fn installing(state: &UpdateState) -> bool {
    state.job.running()
}

#[cfg(target_os = "macos")]
fn install(
    app: &AppHandle,
    job: &mut crate::updatejob::JobGuard,
    report: &Observer,
    target: Target,
) -> Result<(), String> {
    report("update-status", Value::from("checking"));

    // Re-check so we install the actual latest release, not whatever an earlier
    // check saw — a newer version may have shipped since.
    let check = job.run(do_check)?;
    let info = check.info.clone();
    let (_, url) = check.target(target)?;
    if target == Target::Newest {
        let _ = app.emit("update-available", info);
    }

    // Errors here in dev (no enclosing .app) BEFORE any download/swap.
    let app_path = app_bundle_path()?;
    let app_dir = app_path
        .parent()
        .ok_or("could not determine app directory")?
        .to_path_buf();
    ensure_app_dir_writable(&app_dir)?;

    job.check()?;
    report("update-status", Value::from("downloading"));

    // Download the DMG to a temp file, emitting integer percent progress.
    let tmp = tempfile::Builder::new()
        .prefix("lpm-update-")
        .suffix(".dmg")
        .tempfile()
        .map_err(|e| format!("failed to create temp file: {e}"))?;
    let report_progress = report.clone();
    let url_owned = url.clone();
    let cancel = job.flag();
    let mut out_file = tmp.as_file().try_clone().map_err(|e| e.to_string())?;
    job.run(move || {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(300))
            .user_agent("lpm")
            .build()
            .map_err(|e| e.to_string())?;
        let mut resp = client
            .get(&url_owned)
            .send()
            .map_err(|e| format!("failed to download update: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!(
                "download returned status {}",
                resp.status().as_u16()
            ));
        }
        let total = resp.content_length().unwrap_or(0);
        copy_with_progress(&mut resp, &mut out_file, total, &cancel, &|pct| {
            report_progress("update-progress", Value::from(pct));
        })
        .map_err(|e| format!("failed to save update: {e}"))
    })?;
    let dmg_path = tmp.into_temp_path();

    job.commit()?;
    report("update-status", Value::from("installing"));

    let mount = tempfile::Builder::new()
        .prefix("lpm-mount-")
        .tempdir()
        .map_err(|e| format!("failed to create mount dir: {e}"))?;
    let mount_point = mount.path().to_path_buf();

    let attach = Command::new("hdiutil")
        .args(["attach"])
        .arg(&dmg_path)
        .arg("-nobrowse")
        .arg("-mountpoint")
        .arg(&mount_point)
        .output()
        .map_err(|e| e.to_string())?;
    if !attach.status.success() {
        return Err(format!(
            "failed to open the update package: {}",
            command_failure(&attach)
        ));
    }
    // Always detach the DMG, even on the error paths below.
    let _detach_guard = DetachGuard(mount_point.clone());

    let new_app_name = std::fs::read_dir(&mount_point)
        .map_err(|e| format!("failed to read mounted DMG: {e}"))?
        .flatten()
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .find(|n| n.ends_with(".app"))
        .ok_or("no .app found in DMG")?;

    let src_app = mount_point.join(&new_app_name);
    let dst_app = app_dir.join(&new_app_name);
    let staging = app_dir.join(format!("{new_app_name}.new"));
    let _ = std::fs::remove_dir_all(&staging);

    let copy = Command::new("ditto")
        .arg(&src_app)
        .arg(&staging)
        .output()
        .map_err(|e| e.to_string())?;
    if !copy.status.success() {
        let _ = std::fs::remove_dir_all(&staging);
        return Err(format!(
            "failed to copy new app: {}",
            command_failure(&copy)
        ));
    }
    if let Err(e) = std::fs::remove_dir_all(&dst_app) {
        let _ = std::fs::remove_dir_all(&staging);
        return Err(format!("failed to remove old app: {e}"));
    }
    std::fs::rename(&staging, &dst_app).map_err(|e| format!("failed to finalize update: {e}"))?;

    // Detach + temp cleanup now (process is about to exit; Drop guards won't run
    // after process::exit).
    drop(_detach_guard);
    let _ = Command::new("hdiutil")
        .args(["detach"])
        .arg(&mount_point)
        .arg("-quiet")
        .status();

    // Relaunch via a detached process that waits for THIS pid to die, then opens
    // the new app — avoids two instances fighting over the socket/dock icon.
    let pid = std::process::id();
    let script = format!(
        "while kill -0 {pid} 2>/dev/null; do sleep 0.2; done; sleep 0.5; open {}",
        shell_quote(&dst_app.to_string_lossy())
    );
    spawn_detached_bash(&script)?;

    // process::exit skips the RunEvent::Exit handler, so mirror its cleanup
    // here: reap in-app terminal trees and ssh tunnels (the relaunched instance
    // reopens the tunnels on their ports) and remove the socket (it also clears
    // a stale socket before binding). Service sessions live in the session
    // daemon and are intentionally left running, so projects survive the
    // restart. Agents dying with their terminals are not the user quitting
    // them, so stop watching first or they restore as shells.
    crate::agentexit::stop();
    crate::pty::kill_all_trees(&app.state::<crate::pty::PtyState>());
    crate::portforward::stop_on_exit(app);
    crate::socketsrv::release();
    std::thread::sleep(Duration::from_millis(300));
    std::process::exit(0);
}

struct DetachGuard(PathBuf);
impl Drop for DetachGuard {
    fn drop(&mut self) {
        let _ = Command::new("hdiutil")
            .args(["detach"])
            .arg(&self.0)
            .arg("-quiet")
            .status();
    }
}

fn copy_with_progress(
    src: &mut impl Read,
    dst: &mut impl std::io::Write,
    total: u64,
    cancel: &AtomicBool,
    emit: &dyn Fn(i64),
) -> std::io::Result<()> {
    let mut buf = [0u8; 64 * 1024];
    let mut written: u64 = 0;
    let mut last_pct: i64 = -1;
    loop {
        if cancel.load(Ordering::SeqCst) {
            return Err(std::io::ErrorKind::Interrupted.into());
        }
        let n = src.read(&mut buf)?;
        if n == 0 {
            break;
        }
        dst.write_all(&buf[..n])?;
        written += n as u64;
        if total > 0 {
            let pct = (written * 100 / total) as i64;
            if pct != last_pct {
                last_pct = pct;
                emit(pct);
            }
        }
    }
    Ok(())
}

#[cfg(target_os = "macos")]
pub(crate) fn spawn_detached_bash(script: &str) -> Result<(), String> {
    use std::os::unix::process::CommandExt;
    let mut cmd = Command::new("bash");
    cmd.arg("-c").arg(script);
    unsafe {
        cmd.pre_exec(|| {
            libc::setsid(); // detach from our session so it survives our exit
            Ok(())
        });
    }
    cmd.spawn()
        .map_err(|e| format!("failed to schedule relaunch: {e}"))?;
    Ok(())
}

pub(crate) fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', r"'\''"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn newer_semver() {
        assert!(newer("1.2.3", "1.2.2"));
        assert!(newer("2.0.0", "1.9.9"));
        assert!(newer("1.3.0", "1.2.9"));
        assert!(!newer("1.2.3", "1.2.3"));
        assert!(!newer("1.2.2", "1.2.3"));
        assert!(!newer("0.9.0", "1.0.0"));
        assert!(newer("1.2", "1.1.5")); // short versions
    }

    #[test]
    fn go_arch_mapping() {
        assert!(matches!(go_arch(), "arm64" | "amd64"));
    }

    #[cfg(unix)]
    #[test]
    fn writable_probe() {
        use std::os::unix::fs::PermissionsExt;

        let writable = tempfile::tempdir().unwrap();
        assert!(ensure_app_dir_writable(writable.path()).is_ok());
        assert!(std::fs::read_dir(writable.path()).unwrap().next().is_none());

        let read_only = tempfile::tempdir().unwrap();
        std::fs::set_permissions(read_only.path(), std::fs::Permissions::from_mode(0o555)).unwrap();
        let err = ensure_app_dir_writable(read_only.path()).unwrap_err();
        assert!(err.contains("Applications"), "unexpected message: {err}");
    }
}
