// macOS: apps are bundles under /Applications (or ~/Applications), launched
// with `open -a`; Terminal and iTerm are driven over AppleScript.
use super::{format_path_spec, run, InstalledApp};
use std::process::Command;

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
pub(crate) fn detect(id: &str) -> Option<String> {
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

/// Icons for apps without an embedded one; none on macOS.
pub(crate) fn system_icon(_id: &str) -> Option<String> {
    None
}

pub(crate) fn open_folder(app: &InstalledApp, path: &str) -> Result<(), String> {
    match app.id {
        "finder" => run(Command::new("open").arg(path)),
        "terminal" => launch_terminal(path),
        "iterm2" => launch_iterm(path),
        "ghostty" => launch_ghostty(path),
        // By bundle path, not label: a version-suffixed bundle (Path Finder 26)
        // has no app named after the label for `open -a` to resolve.
        _ => run(Command::new("open").args(["-a", &app.path, path])),
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

/// No editor picked and none with a line recipe installed.
pub(crate) fn open_default(abs: &str) -> Result<(), String> {
    run(Command::new("open").arg(abs))
}

fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

fn applescript_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
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
