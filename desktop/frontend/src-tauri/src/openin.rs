// "Open in <editor/app>" — port of desktop/openin.go. The targets, their ids and
// their order are shared; each OS finds and starts the apps its own way
// (openin_macos.rs, openin_linux.rs, openin_windows.rs). App icons are embedded
// from assets/apps/*.png and returned as data: URIs.
use crate::config::expand_home;
use crate::files::resolve_existing_file;
use crate::mediapeer::split_peer_path;
use crate::peerclient::PeerClientHub;
use crate::peeropen::PeerOpened;
use base64::Engine;
use serde::Serialize;
use std::process::Command;
use tauri::State;

#[cfg(target_os = "macos")]
#[path = "openin_macos.rs"]
mod backend;
#[cfg(windows)]
#[path = "openin_windows.rs"]
mod backend;
#[cfg(all(unix, not(target_os = "macos")))]
#[path = "openin_linux.rs"]
mod backend;

use backend::detect;
#[cfg(target_os = "macos")]
pub(crate) use backend::detect_by_paths;
pub(crate) use backend::{open_file_with, vscode_cli};

#[derive(Serialize)]
pub struct OpenInTarget {
    pub id: String,
    pub label: String,
    pub icon: String,
    #[serde(rename = "fileOnly", skip_serializing_if = "std::ops::Not::not")]
    pub file_only: bool,
    // Can open a project that lives on an SSH host (VS Code-family Remote-SSH).
    #[serde(rename = "remoteCapable", skip_serializing_if = "std::ops::Not::not")]
    pub remote_capable: bool,
}

struct Target {
    id: &'static str,
    label: &'static str,
    icon: &'static str, // png filename, or "" when no asset
    os: u8,
    file_only: bool,
    remote_capable: bool,
}

const MAC: u8 = 1;
const LINUX: u8 = 2;
const WINDOWS: u8 = 4;
const ALL: u8 = MAC | LINUX | WINDOWS;
const HERE: u8 = if cfg!(target_os = "macos") {
    MAC
} else if cfg!(windows) {
    WINDOWS
} else {
    LINUX
};

const fn app(id: &'static str, label: &'static str, icon: &'static str, os: u8) -> Target {
    Target {
        id,
        label,
        icon,
        os,
        file_only: false,
        remote_capable: false,
    }
}

const fn remote(t: Target) -> Target {
    Target {
        remote_capable: true,
        ..t
    }
}

const fn file_only(t: Target) -> Target {
    Target {
        file_only: true,
        ..t
    }
}

// Display order = this order, filtered to the OS this runs on.
const TARGETS: &[Target] = &[
    remote(app("cursor", "Cursor", "cursor.png", ALL)),
    remote(app("vscode", "Visual Studio Code", "vscode.png", ALL)),
    remote(app(
        "vscode-insiders",
        "Visual Studio Code - Insiders",
        "vscode-insiders.png",
        ALL,
    )),
    remote(app("windsurf", "Windsurf", "windsurf.png", ALL)),
    app("zed", "Zed", "zed.png", ALL),
    app("xcode", "Xcode", "xcode.png", MAC),
    app("sublime-text", "Sublime Text", "sublime-text.png", ALL),
    app("webstorm", "WebStorm", "", ALL),
    app("intellij-idea", "IntelliJ IDEA", "", LINUX | WINDOWS),
    app("pycharm", "PyCharm", "", LINUX | WINDOWS),
    app("goland", "GoLand", "", LINUX | WINDOWS),
    app("rustrover", "RustRover", "", LINUX | WINDOWS),
    app("clion", "CLion", "", LINUX | WINDOWS),
    app("phpstorm", "PhpStorm", "", LINUX | WINDOWS),
    app("rubymine", "RubyMine", "", LINUX | WINDOWS),
    app("rider", "Rider", "", LINUX | WINDOWS),
    file_only(app("typora", "Typora", "typora.png", ALL)),
    app("terminal", "Terminal", "terminal.png", MAC),
    app("windows-terminal", "Windows Terminal", "", WINDOWS),
    app("powershell", "PowerShell", "", WINDOWS),
    app("git-bash", "Git Bash", "", WINDOWS),
    app("gnome-terminal", "GNOME Terminal", "", LINUX),
    app("ptyxis", "Ptyxis", "", LINUX),
    app("konsole", "Konsole", "", LINUX),
    app("xfce4-terminal", "Xfce Terminal", "", LINUX),
    app("iterm2", "iTerm", "iterm2.png", MAC),
    app("ghostty", "Ghostty", "ghostty.png", MAC | LINUX),
    app("kitty", "kitty", "", LINUX),
    app("alacritty", "Alacritty", "", LINUX | WINDOWS),
    app("wezterm", "WezTerm", "", LINUX | WINDOWS),
    app("warp", "Warp", "warp.png", MAC | LINUX),
    app("xterm", "XTerm", "", LINUX),
    app("finder", "Finder", "finder.png", MAC),
    app("finder", "Files", "", LINUX),
    app("finder", "File Explorer", "", WINDOWS),
    app("path-finder", "Path Finder", "", MAC),
];

fn icon_data_uri(file: &str) -> String {
    let bytes: &[u8] = match file {
        "cursor.png" => include_bytes!("../assets/apps/cursor.png"),
        "vscode.png" => include_bytes!("../assets/apps/vscode.png"),
        "vscode-insiders.png" => include_bytes!("../assets/apps/vscode-insiders.png"),
        "windsurf.png" => include_bytes!("../assets/apps/windsurf.png"),
        "zed.png" => include_bytes!("../assets/apps/zed.png"),
        "xcode.png" => include_bytes!("../assets/apps/xcode.png"),
        "sublime-text.png" => include_bytes!("../assets/apps/sublime-text.png"),
        "typora.png" => include_bytes!("../assets/apps/typora.png"),
        "terminal.png" => include_bytes!("../assets/apps/terminal.png"),
        "iterm2.png" => include_bytes!("../assets/apps/iterm2.png"),
        "ghostty.png" => include_bytes!("../assets/apps/ghostty.png"),
        "warp.png" => include_bytes!("../assets/apps/warp.png"),
        "finder.png" => include_bytes!("../assets/apps/finder.png"),
        _ => return String::new(),
    };
    format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    )
}

fn targets() -> impl Iterator<Item = &'static Target> {
    TARGETS.iter().filter(|t| t.os & HERE != 0)
}

fn target(id: &str) -> Option<&'static Target> {
    targets().find(|t| t.id == id)
}

/// An app the user picked, found on this machine. `path` is whatever the OS
/// backend launches it by: a bundle on macOS, a launcher elsewhere.
pub(crate) struct InstalledApp {
    pub id: &'static str,
    pub label: &'static str,
    pub remote_capable: bool,
    pub path: String,
}

pub(crate) fn installed_app(id: &str) -> Result<InstalledApp, String> {
    let t = target(id).ok_or_else(|| format!("unknown app: {id}"))?;
    let path = detect(id).ok_or_else(|| format!("{} is not installed", t.label))?;
    Ok(InstalledApp {
        id: t.id,
        label: t.label,
        remote_capable: t.remote_capable,
        path,
    })
}

#[cfg(target_os = "macos")]
pub(crate) fn run(c: &mut Command) -> Result<(), String> {
    let status = c.status().map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("command failed".into());
    }
    Ok(())
}

/// Start an app in its own session (so it outlives lpm) without a console
/// window flashing up for a `.cmd` launcher.
#[cfg(not(target_os = "macos"))]
pub(crate) fn run(c: &mut Command) -> Result<(), String> {
    #[cfg(unix)]
    crate::osproc::detach(c);
    #[cfg(windows)]
    crate::osproc::no_window(c);
    launch(c)
}

/// There is no `open -a` to hand the app to, so the app (or its launcher) is
/// our child. A launcher that exits at once is judged by its status; anything
/// still running after a moment (a terminal, an AppImage, a Flatpak wrapper) is
/// the app itself, left to run and reaped in the background.
#[cfg(not(target_os = "macos"))]
pub(crate) fn launch(c: &mut Command) -> Result<(), String> {
    use std::time::{Duration, Instant};
    let program = std::path::Path::new(c.get_program())
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let mut child = c
        .stdin(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("{program}: {e}"))?;
    let deadline = Instant::now() + Duration::from_millis(1500);
    while Instant::now() < deadline {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => return Ok(()),
            Ok(Some(status)) => return Err(format!("{program} exited with {status}")),
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(e) => return Err(e.to_string()),
        }
    }
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

/// The Command for a launcher path. On Linux a launcher can carry fixed
/// arguments (`flatpak run <app>`, a desktop entry's `--no-sandbox`) joined to
/// the program by NUL, the one character no path holds; elsewhere it is just
/// the program.
pub(crate) fn launcher(app_path: &str) -> Command {
    let mut parts = app_path.split('\0');
    let mut c = crate::osproc::command(parts.next().unwrap_or_default());
    c.args(parts);
    c
}

// ---- commands ---------------------------------------------------------------

#[tauri::command(async)]
pub fn list_open_in_targets() -> Vec<OpenInTarget> {
    targets()
        .filter(|t| detect(t.id).is_some())
        .map(|t| OpenInTarget {
            id: t.id.into(),
            label: t.label.into(),
            icon: if t.icon.is_empty() {
                backend::system_icon(t.id).unwrap_or_default()
            } else {
                icon_data_uri(t.icon)
            },
            file_only: t.file_only,
            remote_capable: t.remote_capable,
        })
        .collect()
}

#[tauri::command]
pub async fn open_in(
    hub: State<'_, PeerClientHub>,
    target_id: String,
    project_path: String,
) -> Result<(), String> {
    let hub = hub.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let app = installed_app(&target_id)?;
        if project_path.is_empty() {
            return Err("empty project path".into());
        }
        if split_peer_path(&project_path).is_some() {
            return crate::peeropen::open_folder(&hub, &app, &project_path);
        }
        if let Some(ssh) = crate::sshexec::remote_project_for_path(&project_path) {
            if !app.remote_capable {
                return Err(format!("{} can't open a remote project", app.label));
            }
            return open_remote(&app, &ssh, &project_path);
        }
        backend::open_folder(&app, &expand_home(&project_path))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Open a project on an SSH host via VS Code-family Remote-SSH. The remote dir
/// (possibly `~`-relative) is resolved to an absolute path once and cached.
fn open_remote(
    app: &InstalledApp,
    ssh: &crate::config::SshSettings,
    project_dir: &str,
) -> Result<(), String> {
    let abs = resolve_remote_abs(ssh, project_dir)?;
    let port = u16::try_from(ssh.port).unwrap_or(0);
    let authority = crate::remotessh::authority(&ssh.host, &ssh.user, port, &ssh.key);
    crate::remotessh::open_folder(app, &authority, &abs)
}

/// The remote dir resolved to an absolute path (`cd <dir> && pwd` over the mux),
/// cached per (host, dir). ssh.dir may be `~/…`; the folder URI needs it absolute.
fn resolve_remote_abs(ssh: &crate::config::SshSettings, dir: &str) -> Result<String, String> {
    use std::collections::HashMap;
    use std::sync::{Mutex, OnceLock};
    static CACHE: OnceLock<Mutex<HashMap<(String, String), String>>> = OnceLock::new();
    let key = (format!("{}@{}", ssh.user, ssh.host), dir.to_string());
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Some(hit) = cache.lock().unwrap().get(&key) {
        return Ok(hit.clone());
    }
    let out = crate::sshexec::remote_command(ssh, dir, "pwd", &[], &[])
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if err.is_empty() {
            "could not resolve remote path".into()
        } else {
            err
        });
    }
    let abs = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if abs.is_empty() {
        return Err("could not resolve remote path".into());
    }
    cache.lock().unwrap().insert(key, abs.clone());
    Ok(abs)
}

/// `edit` (default true) says the file is one to edit rather than look at,
/// which decides how a file on a paired machine is opened (peeropen.rs); the
/// answer then says what the app was given.
#[tauri::command]
pub async fn open_file_in_editor(
    app_handle: tauri::AppHandle,
    hub: State<'_, PeerClientHub>,
    editor_id: String,
    abs_path: String,
    line: i64,
    col: i64,
    edit: Option<bool>,
) -> Result<Option<PeerOpened>, String> {
    let hub = hub.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let app = if editor_id.is_empty() {
            None
        } else {
            Some(installed_app(&editor_id)?)
        };
        if split_peer_path(&abs_path).is_some() {
            let edit = edit.unwrap_or(true);
            return crate::peeropen::open_file(
                &app_handle,
                &hub,
                &abs_path,
                app.as_ref(),
                line,
                col,
                edit,
            )
            .map(Some);
        }
        let abs = resolve_existing_file(&abs_path)?;
        if let Some(app) = app {
            return open_file_with(app.id, &app.path, &abs, line, col).map(|()| None);
        }
        // No editor specified: first installed target with a file-open recipe.
        for t in targets() {
            if editor_has_recipe(t.id) {
                if let Some(app_path) = detect(t.id) {
                    return open_file_with(t.id, &app_path, &abs, line, col).map(|()| None);
                }
            }
        }
        backend::open_default(&abs).map(|()| None)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn editor_has_recipe(id: &str) -> bool {
    is_vscode_family(id) || is_jetbrains(id) || matches!(id, "sublime-text" | "zed")
}

fn is_vscode_family(id: &str) -> bool {
    matches!(id, "cursor" | "vscode" | "vscode-insiders" | "windsurf")
}

fn is_jetbrains(id: &str) -> bool {
    matches!(
        id,
        "webstorm"
            | "intellij-idea"
            | "pycharm"
            | "goland"
            | "rustrover"
            | "clion"
            | "phpstorm"
            | "rubymine"
            | "rider"
    )
}

pub(crate) fn format_path_spec(path: &str, line: i64, col: i64) -> String {
    if line <= 0 {
        path.to_string()
    } else if col <= 0 {
        format!("{path}:{line}")
    } else {
        format!("{path}:{line}:{col}")
    }
}

/// What an editor's own launcher takes to open a file at a line, wherever the
/// launcher is a plain command line rather than a macOS bundle.
#[cfg(any(test, not(target_os = "macos")))]
fn file_args(id: &str, abs: &str, line: i64, col: i64) -> Vec<String> {
    if is_vscode_family(id) {
        return vec!["-g".into(), format_path_spec(abs, line, col)];
    }
    if matches!(id, "sublime-text" | "zed") {
        return vec![format_path_spec(abs, line, col)];
    }
    let mut args = Vec::new();
    if is_jetbrains(id) && line > 0 {
        args.extend(["--line".to_string(), line.to_string()]);
        if col > 0 {
            args.extend(["--column".to_string(), col.to_string()]);
        }
    }
    args.push(abs.to_string());
    args
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remote_capable_set_is_exactly_the_vscode_family() {
        let capable: Vec<&str> = targets()
            .filter(|t| t.remote_capable)
            .map(|t| t.id)
            .collect();
        assert_eq!(
            capable,
            vec!["cursor", "vscode", "vscode-insiders", "windsurf"]
        );
    }

    #[test]
    fn each_os_lists_an_id_once() {
        for os in [MAC, LINUX, WINDOWS] {
            let mut ids: Vec<&str> = TARGETS
                .iter()
                .filter(|t| t.os & os != 0)
                .map(|t| t.id)
                .collect();
            let total = ids.len();
            ids.sort();
            ids.dedup();
            assert_eq!(ids.len(), total, "duplicate id for os {os}");
        }
    }

    #[test]
    fn macos_keeps_its_original_targets_in_order() {
        let ids: Vec<&str> = TARGETS
            .iter()
            .filter(|t| t.os & MAC != 0)
            .map(|t| t.id)
            .collect();
        assert_eq!(
            ids,
            vec![
                "cursor",
                "vscode",
                "vscode-insiders",
                "windsurf",
                "zed",
                "xcode",
                "sublime-text",
                "webstorm",
                "typora",
                "terminal",
                "iterm2",
                "ghostty",
                "warp",
                "finder",
                "path-finder",
            ]
        );
    }

    #[test]
    fn mac_only_apps_stay_off_other_platforms() {
        for id in ["xcode", "terminal", "iterm2", "path-finder"] {
            assert!(TARGETS.iter().filter(|t| t.id == id).all(|t| t.os == MAC));
        }
    }

    #[test]
    fn file_args_follow_each_editor_family() {
        assert_eq!(file_args("vscode", "/a.rs", 3, 4), vec!["-g", "/a.rs:3:4"]);
        assert_eq!(file_args("zed", "/a.rs", 3, 0), vec!["/a.rs:3"]);
        assert_eq!(
            file_args("pycharm", "/a.py", 7, 2),
            vec!["--line", "7", "--column", "2", "/a.py"]
        );
        assert_eq!(file_args("webstorm", "/a.ts", 0, 0), vec!["/a.ts"]);
        assert_eq!(file_args("typora", "/a.md", 9, 1), vec!["/a.md"]);
    }

    #[test]
    fn launcher_splits_fixed_arguments() {
        let c = launcher("/usr/bin/flatpak\0run\0com.visualstudio.code");
        assert_eq!(c.get_program(), "/usr/bin/flatpak");
        let args: Vec<_> = c.get_args().collect();
        assert_eq!(args, vec!["run", "com.visualstudio.code"]);
        let plain = launcher("/Applications/Cursor.app/Contents/Resources/app/bin/cursor");
        assert_eq!(plain.get_args().count(), 0);
    }
}
