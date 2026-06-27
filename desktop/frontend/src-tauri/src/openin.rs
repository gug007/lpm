// "Open in <editor/app>" — port of desktop/openin.go. macOS-only. App icons are
// embedded from assets/apps/*.png and returned as data: URIs.
use crate::config::expand_home;
use crate::files::resolve_existing_file;
use base64::Engine;
use serde::Serialize;
use std::process::Command;

#[derive(Serialize)]
pub struct OpenInTarget {
    pub id: String,
    pub label: String,
    pub icon: String,
    #[serde(rename = "fileOnly", skip_serializing_if = "std::ops::Not::not")]
    pub file_only: bool,
}

struct Target {
    id: &'static str,
    label: &'static str,
    icon: &'static str, // png filename, or "" when no asset
    file_only: bool,
}

// Display order = this order.
const TARGETS: &[Target] = &[
    Target { id: "cursor", label: "Cursor", icon: "cursor.png", file_only: false },
    Target { id: "vscode", label: "Visual Studio Code", icon: "vscode.png", file_only: false },
    Target { id: "vscode-insiders", label: "Visual Studio Code - Insiders", icon: "vscode-insiders.png", file_only: false },
    Target { id: "windsurf", label: "Windsurf", icon: "windsurf.png", file_only: false },
    Target { id: "zed", label: "Zed", icon: "zed.png", file_only: false },
    Target { id: "xcode", label: "Xcode", icon: "xcode.png", file_only: false },
    Target { id: "sublime-text", label: "Sublime Text", icon: "sublime-text.png", file_only: false },
    Target { id: "webstorm", label: "WebStorm", icon: "", file_only: false },
    Target { id: "typora", label: "Typora", icon: "typora.png", file_only: true },
    Target { id: "terminal", label: "Terminal", icon: "terminal.png", file_only: false },
    Target { id: "iterm2", label: "iTerm", icon: "iterm2.png", file_only: false },
    Target { id: "ghostty", label: "Ghostty", icon: "ghostty.png", file_only: false },
    Target { id: "warp", label: "Warp", icon: "warp.png", file_only: false },
    Target { id: "finder", label: "Finder", icon: "finder.png", file_only: false },
];

fn home() -> String {
    dirs::home_dir().unwrap_or_default().to_string_lossy().into_owned()
}

/// `/Applications/X.app` also checks `~/Applications/X.app`.
fn app_candidates(path: &str) -> Vec<String> {
    match path.strip_prefix("/Applications/") {
        Some(rest) => vec![path.to_string(), format!("{}/Applications/{}", home(), rest)],
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
    for dir in ["/Applications".to_string(), format!("{}/Applications", home())] {
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
        "cursor" => detect_by_paths(&["/Applications/Cursor.app", "/Applications/Cursor Nightly.app"])
            .or_else(|| detect_by_prefix("Cursor")),
        "vscode" => detect_by_paths(&["/Applications/Visual Studio Code.app", "/Applications/Code.app"]),
        "vscode-insiders" => detect_by_paths(&[
            "/Applications/Visual Studio Code - Insiders.app",
            "/Applications/Code - Insiders.app",
        ]),
        "windsurf" => detect_by_paths(&["/Applications/Windsurf.app"]),
        "zed" => detect_by_paths(&["/Applications/Zed.app", "/Applications/Zed Preview.app"]),
        "xcode" => detect_by_paths(&["/Applications/Xcode.app"]),
        "sublime-text" => detect_by_paths(&["/Applications/Sublime Text.app"]),
        "webstorm" => detect_by_paths(&["/Applications/WebStorm.app"]).or_else(|| detect_by_prefix("WebStorm")),
        "typora" => detect_by_paths(&["/Applications/Typora.app"]),
        "terminal" => detect_by_paths(&[
            "/System/Applications/Utilities/Terminal.app",
            "/Applications/Utilities/Terminal.app",
        ]),
        "iterm2" => detect_by_paths(&["/Applications/iTerm.app", "/Applications/iTerm2.app"]),
        "ghostty" => detect_by_paths(&["/Applications/Ghostty.app"]),
        "warp" => detect_by_paths(&["/Applications/Warp.app"]),
        "finder" => Some("/System/Library/CoreServices/Finder.app".to_string()),
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

fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

fn applescript_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

fn run(c: &mut Command) -> Result<(), String> {
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
        })
        .collect()
}

#[tauri::command(async)]
pub fn open_in(target_id: String, project_path: String) -> Result<(), String> {
    let t = target(&target_id).ok_or_else(|| format!("unknown open-in target: {target_id}"))?;
    detect(&target_id).ok_or_else(|| format!("{} is not installed", t.label))?;
    if project_path.is_empty() {
        return Err("empty project path".into());
    }
    let path = expand_home(&project_path);
    match target_id.as_str() {
        "finder" => run(Command::new("open").arg(&path)),
        "terminal" => launch_terminal(&path),
        "iterm2" => launch_iterm(&path),
        "ghostty" => launch_ghostty(&path),
        _ => run(Command::new("open").args(["-a", t.label, &path])),
    }
}

#[tauri::command(async)]
pub fn open_file_in_editor(
    editor_id: String,
    abs_path: String,
    line: i64,
    col: i64,
) -> Result<(), String> {
    let abs = resolve_existing_file(&abs_path)?;
    if !editor_id.is_empty() {
        let t = target(&editor_id).ok_or_else(|| format!("unknown editor: {editor_id}"))?;
        let app_path = detect(&editor_id).ok_or_else(|| format!("{} is not installed", t.label))?;
        return open_file_with(&editor_id, t.label, &app_path, &abs, line, col);
    }
    // No editor specified: first installed target with a file-open recipe.
    for t in TARGETS {
        if editor_has_recipe(t.id) {
            if let Some(app_path) = detect(t.id) {
                return open_file_with(t.id, t.label, &app_path, &abs, line, col);
            }
        }
    }
    run(Command::new("open").arg(&abs))
}

fn editor_has_recipe(id: &str) -> bool {
    matches!(
        id,
        "cursor" | "vscode" | "vscode-insiders" | "windsurf" | "sublime-text" | "webstorm" | "zed"
    )
}

fn format_path_spec(path: &str, line: i64, col: i64) -> String {
    if line <= 0 {
        path.to_string()
    } else if col <= 0 {
        format!("{path}:{line}")
    } else {
        format!("{path}:{line}:{col}")
    }
}

fn open_file_with(
    id: &str,
    label: &str,
    app_path: &str,
    abs: &str,
    line: i64,
    col: i64,
) -> Result<(), String> {
    let spec = format_path_spec(abs, line, col);
    match id {
        "cursor" => run(Command::new(format!("{app_path}/Contents/Resources/app/bin/cursor")).args(["-g", &spec])),
        "vscode" => run(Command::new(format!("{app_path}/Contents/Resources/app/bin/code")).args(["-g", &spec])),
        "vscode-insiders" => run(Command::new(format!("{app_path}/Contents/Resources/app/bin/code-insiders")).args(["-g", &spec])),
        "windsurf" => run(Command::new(format!("{app_path}/Contents/Resources/app/bin/windsurf")).args(["-g", &spec])),
        "sublime-text" => run(Command::new(format!("{app_path}/Contents/SharedSupport/bin/subl")).arg(&spec)),
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
        // xcode, typora, terminals: no per-line recipe — open the app on the file.
        _ => run(Command::new("open").args(["-a", label, abs])),
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
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let inner = format!("cd {} && exec {shell}", shell_quote(path));
    run(Command::new("open").args(["-na", "Ghostty.app", "--args", "-e", &shell, "-lc", &inner]))
}
