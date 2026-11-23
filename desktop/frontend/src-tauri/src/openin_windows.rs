// Windows: apps are found in their per-user (%LOCALAPPDATA%\Programs) and
// per-machine (Program Files) install folders, then on PATH, and started
// directly. A VS Code-family editor goes through its `bin\*.cmd` launcher,
// which hands the request to a running window and returns.
use super::{file_args, is_vscode_family, run, InstalledApp};
use std::path::{Path, PathBuf};
use std::process::Command;

fn env_dir(var: &str) -> Option<PathBuf> {
    std::env::var_os(var)
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
}

fn program_files() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    for var in ["ProgramW6432", "ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(dir) = env_dir(var) {
            if !dirs.contains(&dir) {
                dirs.push(dir);
            }
        }
    }
    dirs
}

/// `rel` under the per-user install root, then each per-machine one.
fn installed(rel: &str) -> Vec<PathBuf> {
    env_dir("LOCALAPPDATA")
        .map(|d| d.join("Programs"))
        .into_iter()
        .chain(program_files())
        .map(|root| root.join(rel))
        .collect()
}

fn first_file(candidates: impl IntoIterator<Item = PathBuf>) -> Option<String> {
    candidates
        .into_iter()
        .find(|p| p.is_file())
        .map(|p| p.to_string_lossy().into_owned())
}

fn on_path(bins: &[&str]) -> Option<String> {
    bins.iter()
        .find_map(|b| crate::sys::find_on_path(b))
        .map(|p| p.to_string_lossy().into_owned())
}

/// Per app: launchers relative to an install root, then names on PATH.
const APPS: &[(&str, &[&str], &[&str])] = &[
    (
        "cursor",
        &[
            r"cursor\resources\app\bin\cursor.cmd",
            r"cursor\bin\cursor.cmd",
        ],
        &["cursor"],
    ),
    ("vscode", &[r"Microsoft VS Code\bin\code.cmd"], &["code"]),
    (
        "vscode-insiders",
        &[r"Microsoft VS Code Insiders\bin\code-insiders.cmd"],
        &["code-insiders"],
    ),
    ("windsurf", &[r"Windsurf\bin\windsurf.cmd"], &["windsurf"]),
    ("zed", &[r"Zed\bin\zed.exe", r"Zed\Zed.exe"], &["zed"]),
    (
        "sublime-text",
        &[r"Sublime Text\subl.exe", r"Sublime Text 3\subl.exe"],
        &["subl"],
    ),
    ("typora", &[r"Typora\Typora.exe"], &[]),
    ("powershell", &[r"PowerShell\7\pwsh.exe"], &["pwsh"]),
    ("alacritty", &[r"Alacritty\alacritty.exe"], &["alacritty"]),
    ("wezterm", &[r"WezTerm\wezterm-gui.exe"], &["wezterm-gui"]),
];

fn from_table(id: &str) -> Option<String> {
    let (_, rels, bins) = APPS.iter().find(|(app, _, _)| *app == id)?;
    first_file(rels.iter().flat_map(|rel| installed(rel))).or_else(|| on_path(bins))
}

/// The app's launcher, or None when not installed.
pub(crate) fn detect(id: &str) -> Option<String> {
    match id {
        "windows-terminal" => windows_terminal(),
        "git-bash" => git_bash_launcher(),
        "finder" => Some("explorer.exe".to_string()),
        "powershell" => from_table(id).or_else(|| {
            first_file(
                env_dir("SystemRoot")
                    .map(|d| d.join(r"System32\WindowsPowerShell\v1.0\powershell.exe")),
            )
        }),
        _ => from_table(id).or_else(|| jetbrains(id)),
    }
}

/// `wt.exe` is an App Execution Alias: a reparse point that only resolves
/// when started, so it is checked by its link rather than followed.
fn windows_terminal() -> Option<String> {
    env_dir("LOCALAPPDATA")
        .map(|d| d.join(r"Microsoft\WindowsApps\wt.exe"))
        .filter(|p| std::fs::symlink_metadata(p).is_ok())
        .map(|p| p.to_string_lossy().into_owned())
        .or_else(|| on_path(&["wt"]))
}

/// Git for Windows' `git-bash.exe`, beside the `bin\bash.exe` lpm runs.
fn git_bash_launcher() -> Option<String> {
    let bash = PathBuf::from(crate::sys::git_bash()?);
    first_file(
        bash.parent()
            .and_then(Path::parent)
            .map(|root| root.join("git-bash.exe")),
    )
}

/// Toolbox's generated `<ide>.cmd`, then PATH, then the newest standalone
/// install under `Program Files\JetBrains`.
fn jetbrains(id: &str) -> Option<String> {
    let (script, folder, exe) = match id {
        "webstorm" => ("webstorm", "WebStorm", "webstorm64.exe"),
        "intellij-idea" => ("idea", "IntelliJ IDEA", "idea64.exe"),
        "pycharm" => ("pycharm", "PyCharm", "pycharm64.exe"),
        "goland" => ("goland", "GoLand", "goland64.exe"),
        "rustrover" => ("rustrover", "RustRover", "rustrover64.exe"),
        "clion" => ("clion", "CLion", "clion64.exe"),
        "phpstorm" => ("phpstorm", "PhpStorm", "phpstorm64.exe"),
        "rubymine" => ("rubymine", "RubyMine", "rubymine64.exe"),
        "rider" => ("rider", "JetBrains Rider", "rider64.exe"),
        _ => return None,
    };
    let toolbox =
        env_dir("LOCALAPPDATA").map(|d| d.join(format!(r"JetBrains\Toolbox\scripts\{script}.cmd")));
    first_file(toolbox)
        .or_else(|| on_path(&[script]))
        .or_else(|| newest_install(folder, exe))
}

fn newest_install(folder: &str, exe: &str) -> Option<String> {
    program_files()
        .into_iter()
        .filter_map(|root| std::fs::read_dir(root.join("JetBrains")).ok())
        .flatten()
        .flatten()
        .filter_map(|e| {
            let rank = install_rank(&e.file_name().to_string_lossy(), folder)?;
            Some((rank, e.path().join("bin").join(exe)))
        })
        .filter(|(_, p)| p.is_file())
        .max_by(|a, b| a.0.cmp(&b.0))
        .map(|(_, p)| p.to_string_lossy().into_owned())
}

/// How an install folder named `name` ranks as one of `product`'s ("IntelliJ
/// IDEA 2025.1", "IntelliJ IDEA Community Edition 2023.1"): by version, then
/// the plain product over an edition. None for another product's folder.
fn install_rank(name: &str, product: &str) -> Option<(Vec<u32>, bool)> {
    let rest = name.strip_prefix(product)?;
    if !rest.is_empty() && !rest.starts_with(' ') {
        return None;
    }
    let words: Vec<&str> = rest.split_whitespace().collect();
    let version = words.iter().rev().find_map(|w| parse_version(w));
    let plain = words.iter().all(|w| parse_version(w).is_some());
    Some((version.unwrap_or_default(), plain))
}

fn parse_version(word: &str) -> Option<Vec<u32>> {
    word.split('.').map(|part| part.parse().ok()).collect()
}

/// No embedded icon and no icon theme to read one from.
pub(crate) fn system_icon(_id: &str) -> Option<String> {
    None
}

fn native(path: &str) -> String {
    path.replace('/', "\\")
}

fn is_terminal(id: &str) -> bool {
    matches!(
        id,
        "windows-terminal" | "powershell" | "git-bash" | "alacritty" | "wezterm"
    )
}

/// `wt` splits its command line into subcommands on `;`, so a literal one in
/// the folder is escaped.
fn wt_dir(dir: &str) -> String {
    dir.replace(';', "\\;")
}

/// A console program in a new console of its own, started the way Explorer
/// starts it. A spawned child would carry our stdio handles instead (NUL for
/// stdin), and PowerShell reads commands from a redirected stdin, meets EOF
/// and exits at once.
fn open_console(app_path: &str, dir: &str) -> Result<(), String> {
    use windows_sys::Win32::System::Com::{
        CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE,
    };
    use windows_sys::Win32::UI::Shell::{
        ShellExecuteExW, SEE_MASK_FLAG_NO_UI, SEE_MASK_NOASYNC, SHELLEXECUTEINFOW,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    let wide = |s: &str| s.encode_utf16().chain(Some(0)).collect::<Vec<u16>>();
    let (file, dir) = (wide(app_path), wide(dir));
    let mut info = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_NOASYNC | SEE_MASK_FLAG_NO_UI,
        lpFile: file.as_ptr(),
        lpDirectory: dir.as_ptr(),
        nShow: SW_SHOWNORMAL,
        ..Default::default()
    };
    let com = unsafe {
        CoInitializeEx(
            std::ptr::null(),
            (COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) as u32,
        )
    };
    let started = unsafe { ShellExecuteExW(&mut info) } != 0;
    let err = std::io::Error::last_os_error();
    if com >= 0 {
        unsafe { CoUninitialize() };
    }
    if started {
        return Ok(());
    }
    let program = Path::new(app_path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    Err(format!("{program}: {err}"))
}

fn open_dir(id: &str, app_path: &str, dir: &str) -> Result<(), String> {
    let dir = native(dir);
    match id {
        "finder" => crate::files::open_default(&dir),
        "windows-terminal" => run(Command::new(app_path).args(["-d", &wt_dir(&dir)])),
        "powershell" => open_console(app_path, &dir),
        "git-bash" => run(Command::new(app_path).current_dir(&dir)),
        "alacritty" => run(Command::new(app_path).arg("--working-directory").arg(&dir)),
        "wezterm" => run(Command::new(app_path).args(["start", "--cwd", &dir])),
        _ => run(Command::new(app_path).arg(&dir)),
    }
}

pub(crate) fn open_folder(app: &InstalledApp, path: &str) -> Result<(), String> {
    open_dir(app.id, &app.path, path)
}

/// VS Code-family launchers take the editor's own CLI flags directly.
pub(crate) fn vscode_cli(id: &str, app_path: &str) -> Option<String> {
    is_vscode_family(id).then(|| app_path.to_string())
}

pub(crate) fn open_file_with(
    id: &str,
    app_path: &str,
    abs: &str,
    line: i64,
    col: i64,
) -> Result<(), String> {
    let abs = native(abs);
    if id == "finder" {
        return crate::files::reveal(&abs);
    }
    if is_terminal(id) {
        let dir = Path::new(&abs)
            .parent()
            .map(|d| d.to_string_lossy().into_owned())
            .unwrap_or_else(|| abs.clone());
        return open_dir(id, app_path, &dir);
    }
    run(Command::new(app_path).args(file_args(id, &abs, line, col)))
}

/// No editor picked and none with a line recipe installed.
pub(crate) fn open_default(abs: &str) -> Result<(), String> {
    crate::files::open_default(abs)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wt_folder_escapes_its_subcommand_separator() {
        assert_eq!(wt_dir(r"C:\a;b"), r"C:\a\;b");
        assert_eq!(native("C:/Users/dev/app"), r"C:\Users\dev\app");
    }

    #[test]
    fn jetbrains_installs_rank_by_version_then_plain_edition() {
        let rank = |name| install_rank(name, "IntelliJ IDEA");
        let ultimate = rank("IntelliJ IDEA 2025.1");
        assert!(ultimate > rank("IntelliJ IDEA Community Edition 2023.1"));
        assert!(ultimate > rank("IntelliJ IDEA Community Edition 2025.1"));
        assert!(rank("IntelliJ IDEA Community Edition 2025.2") > ultimate);
        assert!(rank("IntelliJ IDEA 2024.10") > rank("IntelliJ IDEA 2024.9"));
        assert!(rank("IntelliJ IDEA 2025.1.1") > ultimate);
        assert_eq!(rank("IntelliJ IDEAX 2025.1"), None);
        assert_eq!(rank("PyCharm 2025.1"), None);
    }

    #[test]
    fn explorer_is_always_present() {
        assert_eq!(detect("finder").as_deref(), Some("explorer.exe"));
        assert_eq!(detect("xcode"), None);
    }
}
