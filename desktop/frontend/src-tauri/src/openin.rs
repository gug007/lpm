// "Open in <editor/app>" — port of desktop/openin.go. macOS-only. App icons are
// embedded from assets/apps/*.png and returned as data: URIs.
use crate::config::expand_home;
use crate::files::resolve_existing_file;
use crate::mediapeer::split_peer_path;
use crate::peerclient::PeerClientHub;
use crate::peeropen::PeerOpened;
use base64::Engine;
use serde::Serialize;
use std::process::Command;
use tauri::State;

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
    file_only: bool,
    remote_capable: bool,
}

// Display order = this order.
const TARGETS: &[Target] = &[
    Target {
        id: "cursor",
        label: "Cursor",
        icon: "cursor.png",
        file_only: false,
        remote_capable: true,
    },
    Target {
        id: "vscode",
        label: "Visual Studio Code",
        icon: "vscode.png",
        file_only: false,
        remote_capable: true,
    },
    Target {
        id: "vscode-insiders",
        label: "Visual Studio Code - Insiders",
        icon: "vscode-insiders.png",
        file_only: false,
        remote_capable: true,
    },
    Target {
        id: "windsurf",
        label: "Windsurf",
        icon: "windsurf.png",
        file_only: false,
        remote_capable: true,
    },
    Target {
        id: "zed",
        label: "Zed",
        icon: "zed.png",
        file_only: false,
        remote_capable: false,
    },
    Target {
        id: "xcode",
        label: "Xcode",
        icon: "xcode.png",
        file_only: false,
        remote_capable: false,
    },
    Target {
        id: "sublime-text",
        label: "Sublime Text",
        icon: "sublime-text.png",
        file_only: false,
        remote_capable: false,
    },
    Target {
        id: "webstorm",
        label: "WebStorm",
        icon: "",
        file_only: false,
        remote_capable: false,
    },
    Target {
        id: "typora",
        label: "Typora",
        icon: "typora.png",
        file_only: true,
        remote_capable: false,
    },
    Target {
        id: "terminal",
        label: "Terminal",
        icon: "terminal.png",
        file_only: false,
        remote_capable: false,
    },
    Target {
        id: "iterm2",
        label: "iTerm",
        icon: "iterm2.png",
        file_only: false,
        remote_capable: false,
    },
    Target {
        id: "ghostty",
        label: "Ghostty",
        icon: "ghostty.png",
        file_only: false,
        remote_capable: false,
    },
    Target {
        id: "warp",
        label: "Warp",
        icon: "warp.png",
        file_only: false,
        remote_capable: false,
    },
    Target {
        id: "finder",
        label: "Finder",
        icon: "finder.png",
        file_only: false,
        remote_capable: false,
    },
    Target {
        id: "path-finder",
        label: "Path Finder",
        icon: "",
        file_only: false,
        remote_capable: false,
    },
];

fn home() -> String {
    dirs::home_dir()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned()
}

/// `/Applications/X.app` also checks `~/Applications/X.app`.
fn app_candidates(path: &str) -> Vec<String> {
    match path.strip_prefix("/Applications/") {
        Some(rest) => vec![
            path.to_string(),
            format!("{}/Applications/{}", home(), rest),
        ],
        None => vec![path.to_string()],
    }
}

pub(crate) fn detect_by_paths(paths: &[&str]) -> Option<String> {
    for p in paths {
        for cand in app_candidates(p) {
            if std::fs::metadata(&cand).is_ok() {
                return Some(cand);
            }
        }
    }
    None
}

fn detect_by_prefix(prefix: &str) -> Option<String> {
    let pl = prefix.to_lowercase();
    for dir in [
        "/Applications".to_string(),
        format!("{}/Applications", home()),
    ] {
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for e in rd.flatten() {
                let name = e.file_name().to_string_lossy().to_lowercase();
                if name.starts_with(&pl) && name.ends_with(".app") {
                    return Some(e.path().to_string_lossy().into_owned());
                }
            }
        }
    }
    None
}

/// Detected app bundle path, or None when not installed.
fn detect(id: &str) -> Option<String> {
    match id {
        "cursor" => detect_by_paths(&[
            "/Applications/Cursor.app",
            "/Applications/Cursor Nightly.app",
        ])
        .or_else(|| detect_by_prefix("Cursor")),
        "vscode" => detect_by_paths(&[
            "/Applications/Visual Studio Code.app",
            "/Applications/Code.app",
        ]),
        "vscode-insiders" => detect_by_paths(&[
            "/Applications/Visual Studio Code - Insiders.app",
            "/Applications/Code - Insiders.app",
        ]),
        "windsurf" => detect_by_paths(&["/Applications/Windsurf.app"]),
        "zed" => detect_by_paths(&["/Applications/Zed.app", "/Applications/Zed Preview.app"]),
        "xcode" => detect_by_paths(&["/Applications/Xcode.app"]),
        "sublime-text" => detect_by_paths(&["/Applications/Sublime Text.app"]),
        "webstorm" => detect_by_paths(&["/Applications/WebStorm.app"])
            .or_else(|| detect_by_prefix("WebStorm")),
        "typora" => detect_by_paths(&["/Applications/Typora.app"]),
        "terminal" => detect_by_paths(&[
            "/System/Applications/Utilities/Terminal.app",
            "/Applications/Utilities/Terminal.app",
        ]),
        "iterm2" => detect_by_paths(&["/Applications/iTerm.app", "/Applications/iTerm2.app"]),
        "ghostty" => detect_by_paths(&["/Applications/Ghostty.app"]),
        "warp" => detect_by_paths(&["/Applications/Warp.app"]),
        "finder" => Some("/System/Library/CoreServices/Finder.app".to_string()),
        // Cocoatech ships the bundle both plain and version-suffixed depending on
        // the release, and Setapp installs into its own subfolder (which the
        // prefix scan doesn't walk), so all three are named explicitly.
        "path-finder" => detect_by_paths(&[
            "/Applications/Path Finder 26.app",
            "/Applications/Path Finder.app",
            "/Applications/Setapp/Path Finder.app",
        ])
        .or_else(|| detect_by_prefix("Path Finder")),
        _ => None,
    }
}

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

fn target(id: &str) -> Option<&'static Target> {
    TARGETS.iter().find(|t| t.id == id)
}

/// An app the user picked, found on this Mac.
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

fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

fn applescript_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

pub(crate) fn run(c: &mut Command) -> Result<(), String> {
    let status = c.status().map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("command failed".into());
    }
    Ok(())
}

// ---- commands ---------------------------------------------------------------

#[tauri::command(async)]
pub fn list_open_in_targets() -> Vec<OpenInTarget> {
    TARGETS
        .iter()
        .filter(|t| detect(t.id).is_some())
        .map(|t| OpenInTarget {
            id: t.id.into(),
            label: t.label.into(),
            icon: if t.icon.is_empty() {
                String::new()
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
        let path = expand_home(&project_path);
        match app.id {
            "finder" => run(Command::new("open").arg(&path)),
            "terminal" => launch_terminal(&path),
            "iterm2" => launch_iterm(&path),
            "ghostty" => launch_ghostty(&path),
            // By bundle path, not label: a version-suffixed bundle (Path Finder 26)
            // has no app named after the label for `open -a` to resolve.
            _ => run(Command::new("open").args(["-a", &app.path, &path])),
        }
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
        for t in TARGETS {
            if editor_has_recipe(t.id) {
                if let Some(app_path) = detect(t.id) {
                    return open_file_with(t.id, &app_path, &abs, line, col).map(|()| None);
                }
            }
        }
        run(Command::new("open").arg(&abs)).map(|()| None)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn editor_has_recipe(id: &str) -> bool {
    matches!(
        id,
        "cursor" | "vscode" | "vscode-insiders" | "windsurf" | "sublime-text" | "webstorm" | "zed"
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

/// The command-line launcher a VS Code-family editor ships in its bundle.
pub(crate) fn vscode_cli(id: &str, app_path: &str) -> Option<String> {
    let name = match id {
        "cursor" => "cursor",
        "vscode" => "code",
        "vscode-insiders" => "code-insiders",
        "windsurf" => "windsurf",
        _ => return None,
    };
    Some(format!("{app_path}/Contents/Resources/app/bin/{name}"))
}

pub(crate) fn open_file_with(
    id: &str,
    app_path: &str,
    abs: &str,
    line: i64,
    col: i64,
) -> Result<(), String> {
    let spec = format_path_spec(abs, line, col);
    if let Some(cli) = vscode_cli(id, app_path) {
        return run(Command::new(cli).args(["-g", &spec]));
    }
    match id {
        "sublime-text" => {
            run(Command::new(format!("{app_path}/Contents/SharedSupport/bin/subl")).arg(&spec))
        }
        "zed" => run(Command::new(format!("{app_path}/Contents/MacOS/cli")).arg(&spec)),
        "webstorm" => {
            let mut c = Command::new(format!("{app_path}/Contents/MacOS/webstorm"));
            if line > 0 {
                c.arg("--line").arg(line.to_string());
                if col > 0 {
                    c.arg("--column").arg(col.to_string());
                }
            }
            c.arg(abs);
            run(&mut c)
        }
        // xcode, typora, terminals, file managers: no per-line recipe — open the
        // app on the file.
        _ => run(Command::new("open").args(["-a", app_path, abs])),
    }
}

fn launch_terminal(path: &str) -> Result<(), String> {
    let esc = applescript_escape(path);
    run(Command::new("osascript").args([
        "-e",
        &format!("tell application \"Terminal\" to do script \"cd {esc}; clear\""),
    ]))?;
    run(Command::new("osascript").args(["-e", "tell application \"Terminal\" to activate"]))
}

fn launch_iterm(path: &str) -> Result<(), String> {
    let esc = applescript_escape(path);
    let script = format!(
        "tell application \"iTerm\"\n  activate\n  create window with default profile\n  tell current session of current window to write text \"cd {esc}; clear\"\nend tell"
    );
    run(Command::new("osascript").args(["-e", &script]))
}

fn launch_ghostty(path: &str) -> Result<(), String> {
    let shell = crate::sys::login_shell();
    let inner = format!("cd {} && exec {shell}", shell_quote(path));
    run(Command::new("open").args(["-na", "Ghostty.app", "--args", "-e", &shell, "-lc", &inner]))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remote_capable_set_is_exactly_the_vscode_family() {
        let capable: Vec<&str> = TARGETS
            .iter()
            .filter(|t| t.remote_capable)
            .map(|t| t.id)
            .collect();
        assert_eq!(
            capable,
            vec!["cursor", "vscode", "vscode-insiders", "windsurf"]
        );
    }
}
