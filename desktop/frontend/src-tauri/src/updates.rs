// Self-updater + tmux installer — port of desktop/updates.go + app.go InstallTmux.
//
// CheckForUpdate hits the GitHub releases API and stashes the matching
// macos-<arch>.dmg download URL. InstallUpdate re-runs that check so it always
// targets the actual latest release (the stashed URL can be up to 24h stale),
// downloads the DMG (emitting progress), mounts it, swaps the running .app, and
// relaunches. In dev there is no enclosing .app, so InstallUpdate errors early
// (before any destructive step).
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter, Manager, State};

const RELEASES_URL: &str = "https://api.github.com/repos/gug007/lpm/releases/latest";

#[derive(Default)]
pub struct UpdateState {
    pending_url: Mutex<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub update_avail: bool,
}

#[derive(Deserialize)]
struct Release {
    #[serde(default)]
    tag_name: String,
    #[serde(default)]
    assets: Vec<Asset>,
}

#[derive(Deserialize)]
struct Asset {
    #[serde(default)]
    name: String,
    #[serde(default, rename = "browser_download_url")]
    browser_download_url: String,
}

fn current_version() -> String {
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
fn newer(latest: &str, current: &str) -> bool {
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

#[tauri::command(async)]
pub fn check_for_update(state: State<'_, UpdateState>) -> Result<UpdateInfo, String> {
    do_check(&state)
}

/// Background check used by the "Check for Updates…" menu item and the
/// auto-checker — emits "update-available" when a newer release exists.
pub fn check_and_emit(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<UpdateState>();
    let info = do_check(&state)?;
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
fn run_off_worker<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    std::thread::spawn(f).join().map_err(|_| "background thread panicked".to_string())?
}

fn do_check(state: &UpdateState) -> Result<UpdateInfo, String> {
    let body = run_off_worker(|| {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent("lpm")
            .build()
            .map_err(|e| e.to_string())?;
        let resp = client
            .get(RELEASES_URL)
            .send()
            .map_err(|e| format!("failed to check for updates: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("GitHub API returned status {}", resp.status().as_u16()));
        }
        resp.text().map_err(|e| e.to_string())
    })?;
    let release: Release =
        serde_json::from_str(&body).map_err(|e| format!("failed to parse response: {e}"))?;

    let latest = release.tag_name.trim_start_matches('v').to_string();
    let current = current_version();
    let current = current.trim_start_matches('v').to_string();

    let suffix = format!("macos-{}.dmg", go_arch());
    let url = release
        .assets
        .iter()
        .find(|a| a.name.ends_with(&suffix))
        .map(|a| a.browser_download_url.clone())
        .unwrap_or_default();
    *state.pending_url.lock().unwrap() = url;

    Ok(UpdateInfo {
        // Dev/debug builds report version "dev" (parsed as 0.0.0) and have no
        // enclosing .app to swap — never offer them an update they can't apply.
        update_avail: current != "dev" && newer(&latest, &current),
        latest_version: latest,
        current_version: current,
    })
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
    if stderr.is_empty() { out.status.to_string() } else { stderr.to_string() }
}

/// Walk up from the current executable to the enclosing `*.app` bundle.
fn app_bundle_path() -> Result<PathBuf, String> {
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
    Err(format!("could not determine .app bundle path from {}", exe.display()))
}

#[tauri::command(async)]
pub fn install_update(app: AppHandle, state: State<'_, UpdateState>) -> Result<(), String> {
    // No enclosing .app in dev — bail with a product-terms message instead of
    // leaking the debug binary path from app_bundle_path() into the UI.
    if current_version() == "dev" {
        return Err("Updates aren't available in development builds.".into());
    }
    let _ = app.emit("update-status", "checking");

    // Re-check so we install the actual latest release, not whatever was
    // stashed at the last check — a newer version may have shipped since.
    let info = do_check(&state)?;
    if !info.update_avail {
        return Err("You're already on the latest version.".into());
    }
    let url = state.pending_url.lock().unwrap().clone();
    if url.is_empty() {
        return Err("The download for this version isn't available yet — try again in a few minutes.".into());
    }
    let _ = app.emit("update-available", info);

    // Errors here in dev (no enclosing .app) BEFORE any download/swap.
    let app_path = app_bundle_path()?;
    let app_dir = app_path
        .parent()
        .ok_or("could not determine app directory")?
        .to_path_buf();
    ensure_app_dir_writable(&app_dir)?;

    let _ = app.emit("update-status", "downloading");

    // Download the DMG to a temp file, emitting integer percent progress.
    let tmp = tempfile::Builder::new()
        .prefix("lpm-update-")
        .suffix(".dmg")
        .tempfile()
        .map_err(|e| format!("failed to create temp file: {e}"))?;
    let app_progress = app.clone();
    let url_owned = url.clone();
    let mut out_file = tmp.as_file().try_clone().map_err(|e| e.to_string())?;
    run_off_worker(move || {
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
            return Err(format!("download returned status {}", resp.status().as_u16()));
        }
        let total = resp.content_length().unwrap_or(0);
        copy_with_progress(&mut resp, &mut out_file, total, &|pct| {
            let _ = app_progress.emit("update-progress", pct);
        })
        .map_err(|e| format!("failed to save update: {e}"))
    })?;
    let dmg_path = tmp.into_temp_path();

    let _ = app.emit("update-status", "installing");

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
        return Err(format!("failed to open the update package: {}", command_failure(&attach)));
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
        return Err(format!("failed to copy new app: {}", command_failure(&copy)));
    }
    if let Err(e) = std::fs::remove_dir_all(&dst_app) {
        let _ = std::fs::remove_dir_all(&staging);
        return Err(format!("failed to remove old app: {e}"));
    }
    std::fs::rename(&staging, &dst_app).map_err(|e| format!("failed to finalize update: {e}"))?;

    // Detach + temp cleanup now (process is about to exit; Drop guards won't run
    // after process::exit).
    drop(_detach_guard);
    let _ = Command::new("hdiutil").args(["detach"]).arg(&mount_point).arg("-quiet").status();

    // Relaunch via a detached process that waits for THIS pid to die, then opens
    // the new app — avoids two instances fighting over the socket/dock icon.
    let pid = std::process::id();
    let script = format!(
        "while kill -0 {pid} 2>/dev/null; do sleep 0.2; done; sleep 0.5; open {}",
        shell_quote(&dst_app.to_string_lossy())
    );
    spawn_detached_bash(&script)?;

    // process::exit skips the RunEvent::Exit handler, so remove the socket here
    // (the relaunched instance also clears a stale socket before binding). tmux
    // sessions are intentionally left running so projects survive the restart.
    let _ = std::fs::remove_file(crate::config::socket_path());
    std::thread::sleep(Duration::from_millis(300));
    std::process::exit(0);
}

struct DetachGuard(PathBuf);
impl Drop for DetachGuard {
    fn drop(&mut self) {
        let _ = Command::new("hdiutil").args(["detach"]).arg(&self.0).arg("-quiet").status();
    }
}

fn copy_with_progress(
    src: &mut impl Read,
    dst: &mut impl std::io::Write,
    total: u64,
    emit: &dyn Fn(i64),
) -> std::io::Result<()> {
    let mut buf = [0u8; 64 * 1024];
    let mut written: u64 = 0;
    let mut last_pct: i64 = -1;
    loop {
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

fn spawn_detached_bash(script: &str) -> Result<(), String> {
    use std::os::unix::process::CommandExt;
    let mut cmd = Command::new("bash");
    cmd.arg("-c").arg(script);
    unsafe {
        cmd.pre_exec(|| {
            libc::setsid(); // detach from our session so it survives our exit
            Ok(())
        });
    }
    cmd.spawn().map_err(|e| format!("failed to schedule relaunch: {e}"))?;
    Ok(())
}

fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', r"'\''"))
}

// ---- tmux install ----------------------------------------------------------

#[tauri::command(async)]
pub fn install_tmux(app: AppHandle) -> Result<(), String> {
    let brew = look_path("brew").ok_or(
        "Homebrew is required to install tmux.\n\nInstall it from https://brew.sh and relaunch the app.",
    )?;
    let _ = app.emit("tmux-install-output", "==> Installing tmux via Homebrew…");

    let mut child = Command::new(brew)
        .args(["install", "tmux"])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to start installation: {e}"))?;
    // Merge stderr into stdout ordering by reading stdout; brew writes progress
    // to stderr too, so also drain it. Simplest faithful approach: read stdout
    // lines (brew's user-facing output goes there) and emit each.
    if let Some(out) = child.stdout.take() {
        use std::io::BufRead;
        for line in std::io::BufReader::new(out).lines().map_while(Result::ok) {
            let _ = app.emit("tmux-install-output", line);
        }
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("installation failed".into());
    }
    Ok(())
}

/// Resolve a binary on PATH to its absolute path (exec.LookPath equivalent).
fn look_path(bin: &str) -> Option<String> {
    let path = std::env::var("PATH").ok()?;
    for dir in path.split(':').filter(|d| !d.is_empty()) {
        let cand = Path::new(dir).join(bin);
        if let Ok(meta) = std::fs::metadata(&cand) {
            use std::os::unix::fs::PermissionsExt;
            if meta.is_file() && meta.permissions().mode() & 0o111 != 0 {
                return Some(cand.to_string_lossy().into_owned());
            }
        }
    }
    None
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

    #[test]
    fn writable_probe() {
        use std::os::unix::fs::PermissionsExt;

        let writable = tempfile::tempdir().unwrap();
        assert!(ensure_app_dir_writable(writable.path()).is_ok());
        assert!(std::fs::read_dir(writable.path()).unwrap().next().is_none());

        let read_only = tempfile::tempdir().unwrap();
        std::fs::set_permissions(read_only.path(), std::fs::Permissions::from_mode(0o555))
            .unwrap();
        let err = ensure_app_dir_writable(read_only.path()).unwrap_err();
        assert!(err.contains("Applications"), "unexpected message: {err}");
    }
}
