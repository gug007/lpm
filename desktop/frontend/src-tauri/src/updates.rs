// Self-updater + tmux installer — port of desktop/updates.go + app.go InstallTmux.
//
// CheckForUpdate hits the GitHub releases API and stashes the matching
// macos-<arch>.dmg download URL. InstallUpdate downloads that DMG (emitting
// progress), mounts it, swaps the running .app, and relaunches. In dev there is
// no enclosing .app, so InstallUpdate errors early (before any destructive step).
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::Duration;
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

/// Background check used by the "Check for Updates…" menu item — emits
/// "update-available" when a newer release exists (mirrors Go's autoCheck).
pub fn check_and_emit(app: &AppHandle) {
    let state = app.state::<UpdateState>();
    if let Ok(info) = do_check(&state) {
        if info.update_avail {
            let _ = app.emit("update-available", info);
        }
    }
}

fn do_check(state: &UpdateState) -> Result<UpdateInfo, String> {
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
    let body = resp.text().map_err(|e| e.to_string())?;
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
        update_avail: newer(&latest, &current),
        latest_version: latest,
        current_version: current,
    })
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
    let url = state.pending_url.lock().unwrap().clone();
    if url.is_empty() {
        return Err("no update available — check for updates first".into());
    }
    // Errors here in dev (no enclosing .app) BEFORE any download/swap.
    let app_path = app_bundle_path()?;
    let app_dir = app_path
        .parent()
        .ok_or("could not determine app directory")?
        .to_path_buf();

    let _ = app.emit("update-status", "downloading");

    // Download the DMG to a temp file, emitting integer percent progress.
    let tmp = tempfile::Builder::new()
        .prefix("lpm-update-")
        .suffix(".dmg")
        .tempfile()
        .map_err(|e| format!("failed to create temp file: {e}"))?;
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(300))
        .user_agent("lpm")
        .build()
        .map_err(|e| e.to_string())?;
    let mut resp = client
        .get(&url)
        .send()
        .map_err(|e| format!("failed to download update: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("download returned status {}", resp.status().as_u16()));
    }
    let total = resp.content_length().unwrap_or(0);
    copy_with_progress(&mut resp, &mut tmp.as_file(), total, &|pct| {
        let _ = app.emit("update-progress", pct);
    })
    .map_err(|e| format!("failed to save update: {e}"))?;
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
        return Err(format!(
            "failed to mount DMG: {}",
            String::from_utf8_lossy(&attach.stdout)
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
        return Err(format!("failed to copy new app: {}", String::from_utf8_lossy(&copy.stdout)));
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
}
