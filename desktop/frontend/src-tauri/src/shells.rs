// The shells a plain terminal can open in. Services, actions and agent tabs keep
// the login shell (sys::login_shell): their lines are POSIX and shared with
// teammates. A terminal asks for a shell by id, or for "default": the project's
// `terminal: { shell }`, else Settings › Terminal › Shell on this machine.
use crate::ttl_cache::TtlCache;
use serde::Serialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::Duration;

pub(crate) const DEFAULT: &str = "default";
const SETTING: &str = "terminalShell";
const FRESH: Duration = Duration::from_secs(30);

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Shell {
    pub id: String,
    pub label: String,
    /// What tells two shells of the same name apart: a path, or a WSL distro.
    pub detail: String,
    /// The login shell every other pane runs in.
    pub login: bool,
    #[serde(skip)]
    pub program: PathBuf,
    #[serde(skip)]
    pub args: Vec<String>,
}

fn cached() -> Vec<Shell> {
    static SHELLS: TtlCache<(), Vec<Shell>> = TtlCache::new(FRESH);
    SHELLS.get_or((), found)
}

/// A shell's name from its path, `wsl` from `C:\Windows\System32\wsl.exe` on
/// any system: a Windows path is only split on its backslashes on Windows.
fn name_of(path: &Path) -> &str {
    let text = path.to_str().unwrap_or_default();
    let base = text.rsplit(['/', '\\']).next().unwrap_or(text);
    base.strip_suffix(".exe").unwrap_or(base)
}

#[cfg(unix)]
const NOT_INTERACTIVE: &[&str] = &[
    "nologin",
    "false",
    "true",
    "tmux",
    "screen",
    "rbash",
    "git-shell",
];

#[cfg(unix)]
const ON_PATH: &[&str] = &["zsh", "bash", "fish", "nu", "pwsh"];

#[cfg(unix)]
fn found() -> Vec<Shell> {
    let login = PathBuf::from(crate::sys::login_shell());
    let listed = std::fs::read_to_string("/etc/shells").unwrap_or_default();
    let candidates = std::iter::once(login.clone())
        .chain(etc_shells(&listed))
        .chain(ON_PATH.iter().filter_map(|n| crate::sys::find_on_path(n)));
    unix_shells(candidates, &login)
}

#[cfg(unix)]
fn etc_shells(text: &str) -> impl Iterator<Item = PathBuf> + '_ {
    text.lines()
        .map(str::trim)
        .filter(|l| l.starts_with('/'))
        .map(PathBuf::from)
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    std::fs::metadata(path).is_ok_and(|m| m.is_file() && crate::fsperm::mode(&m) & 0o111 != 0)
}

/// One entry per shell binary, the login shell first: a link to a shell already
/// listed (`/bin/bash` and `/usr/bin/bash` on a merged-usr Linux) is left out.
#[cfg(unix)]
fn unix_shells(candidates: impl Iterator<Item = PathBuf>, login: &Path) -> Vec<Shell> {
    let login_real = std::fs::canonicalize(login).ok();
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for path in candidates {
        let name = name_of(&path).to_string();
        if name.is_empty() || NOT_INTERACTIVE.contains(&name.as_str()) || !is_executable(&path) {
            continue;
        }
        let real = std::fs::canonicalize(&path).unwrap_or_else(|_| path.clone());
        if !seen.insert(real.clone()) {
            continue;
        }
        let shown = path.to_string_lossy().into_owned();
        out.push(Shell {
            id: shown.clone(),
            label: name,
            detail: shown,
            login: login_real.as_ref() == Some(&real),
            program: path,
            args: vec!["-l".into()],
        });
    }
    out
}

#[cfg(windows)]
fn found() -> Vec<Shell> {
    let system = std::env::var_os("SystemRoot")
        .or_else(|| std::env::var_os("windir"))
        .map(|root| PathBuf::from(root).join("System32"));
    let pwsh = crate::openin::pwsh().map(PathBuf::from);
    let cmd = std::env::var_os("ComSpec")
        .map(PathBuf::from)
        .or_else(|| system.as_ref().map(|s| s.join("cmd.exe")));
    let login_args: Vec<String> = crate::shellpath::login_args()
        .iter()
        .map(|a| a.to_string())
        .collect();
    let fixed: [(&str, &str, Option<PathBuf>, Vec<String>); 4] = [
        (
            "git-bash",
            "Git Bash",
            Some(PathBuf::from(crate::sys::login_shell())),
            login_args,
        ),
        ("pwsh", "PowerShell 7", pwsh, vec!["-NoLogo".into()]),
        (
            "powershell",
            "Windows PowerShell",
            system
                .as_ref()
                .map(|s| s.join(r"WindowsPowerShell\v1.0\powershell.exe")),
            vec!["-NoLogo".into()],
        ),
        ("cmd", "Command Prompt", cmd, Vec::new()),
    ];
    let mut out: Vec<Shell> = fixed
        .into_iter()
        .filter_map(|(id, label, program, args)| {
            let program = program.filter(|p| p.is_file())?;
            Some(Shell {
                id: id.into(),
                label: label.into(),
                detail: program.to_string_lossy().into_owned(),
                login: id == "git-bash",
                program,
                args,
            })
        })
        .collect();
    let wsl = crate::wsl::exe();
    if wsl.is_file() {
        for distro in crate::wsl::distros() {
            out.push(Shell {
                id: format!("wsl:{}", distro.name),
                label: format!("WSL · {}", distro.name),
                detail: distro.name.clone(),
                login: false,
                program: wsl.clone(),
                args: vec!["-d".into(), distro.name],
            });
        }
    }
    out
}

/// A shell by its id, or by a name a person would write in a config:
/// `fish`, `pwsh`, `powershell`, `cmd`, `bash` (Git Bash) or `wsl` (the first distro).
pub(crate) fn find<'a>(shells: &'a [Shell], wanted: &str) -> Option<&'a Shell> {
    let wanted = wanted.trim();
    if wanted.is_empty() {
        return None;
    }
    shells
        .iter()
        .find(|s| s.id == wanted)
        .or_else(|| shells.iter().find(|s| s.id.eq_ignore_ascii_case(wanted)))
        .or_else(|| {
            shells.iter().find(|s| {
                s.label.eq_ignore_ascii_case(wanted)
                    || name_of(&s.program).eq_ignore_ascii_case(wanted)
            })
        })
}

fn setting_choice() -> Option<String> {
    let settings = crate::config::load_settings();
    clean(settings.get(SETTING)?.as_str()?)
}

fn clean(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_string())
}

/// `terminal: { shell }` in a project's file. A copy has its original's.
fn project_choice(project: &str) -> Option<String> {
    let (shell, parent) = project_file(project)?;
    shell.or_else(|| project_file(&parent?)?.0)
}

/// A project file's `terminal: { shell }`, and the original a copy was made
/// from, out of one read.
fn project_file(project: &str) -> Option<(Option<String>, Option<String>)> {
    if project.is_empty() {
        return None;
    }
    let text = std::fs::read_to_string(crate::config::project_path(project)).ok()?;
    let doc: serde_norway::Value = serde_norway::from_str(&text).ok()?;
    let parent = doc.get("parent_name").and_then(|v| clean(v.as_str()?));
    Some((terminal_shell_of(&doc), parent))
}

fn terminal_shell_of(doc: &serde_norway::Value) -> Option<String> {
    clean(doc.get("terminal")?.get("shell")?.as_str()?)
}

fn default_choice(project: &str) -> Option<String> {
    project_choice(project).or_else(setting_choice)
}

/// What a plain terminal of `project` opens in when it asks for `requested`.
/// None is the login shell: nothing asked, the login shell asked for, or a
/// shell this machine doesn't have.
pub(crate) fn for_terminal(project: &str, requested: Option<&str>) -> Option<Shell> {
    let requested = clean(requested?)?;
    let wanted = if requested == DEFAULT {
        default_choice(project)?
    } else {
        requested
    };
    let shells = cached();
    find(&shells, &wanted).filter(|s| !s.login).cloned()
}

fn is_ssh_project(project: &str) -> bool {
    !project.is_empty()
        && crate::config::project_root(project).is_ok_and(|(_, remote)| remote)
}

/// The shells a plain terminal can open in on this machine, and the id of the
/// one a new terminal of `project` opens in. A project reached over SSH runs its
/// server's login shell, so it has none to pick.
#[tauri::command(async)]
pub fn list_shells(project_name: Option<String>) -> Value {
    let project = project_name.unwrap_or_default();
    if is_ssh_project(&project) {
        return json!({ "shells": [], "default": "" });
    }
    let shells = cached();
    let default = default_choice(&project)
        .and_then(|wanted| find(&shells, &wanted))
        .or_else(|| shells.iter().find(|s| s.login))
        .map(|s| s.id.clone())
        .unwrap_or_default();
    json!({ "shells": shells, "default": default })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn shell(id: &str, label: &str, program: &str, login: bool) -> Shell {
        Shell {
            id: id.into(),
            label: label.into(),
            detail: program.into(),
            login,
            program: PathBuf::from(program),
            args: Vec::new(),
        }
    }

    #[test]
    fn finds_a_shell_by_id_or_by_the_name_a_config_uses() {
        let shells = [
            shell("/bin/zsh", "zsh", "/bin/zsh", true),
            shell("/opt/homebrew/bin/fish", "fish", "/opt/homebrew/bin/fish", false),
            shell("git-bash", "Git Bash", r"C:\Program Files\Git\bin\bash.exe", false),
            shell("wsl:Ubuntu", "WSL · Ubuntu", r"C:\Windows\System32\wsl.exe", false),
        ];
        assert_eq!(find(&shells, "/opt/homebrew/bin/fish").unwrap().label, "fish");
        assert_eq!(find(&shells, "fish").unwrap().id, "/opt/homebrew/bin/fish");
        assert_eq!(find(&shells, "WSL:ubuntu").unwrap().id, "wsl:Ubuntu");
        assert_eq!(find(&shells, "wsl").unwrap().id, "wsl:Ubuntu");
        assert_eq!(find(&shells, " Git Bash ").unwrap().id, "git-bash");
        assert!(find(&shells, "nu").is_none());
        assert!(find(&shells, "").is_none());
    }

    #[test]
    fn reads_the_shell_a_project_file_names() {
        let shell = |yaml: &str| terminal_shell_of(&serde_norway::from_str(yaml).unwrap());
        assert_eq!(shell("name: app\nterminal:\n  shell: pwsh\n").as_deref(), Some("pwsh"));
        assert_eq!(shell("name: app\nterminal:\n  shell: '  '\n"), None);
        assert_eq!(shell("name: app\nterminal: fish\n"), None);
        assert_eq!(shell("name: app\n"), None);
    }

    #[cfg(unix)]
    #[test]
    fn lists_each_shell_once_with_the_login_shell_marked() {
        let dir = tempfile::tempdir().unwrap();
        let make = |name: &str| {
            let path = dir.path().join(name);
            std::fs::write(&path, "").unwrap();
            std::fs::set_permissions(
                &path,
                std::os::unix::fs::PermissionsExt::from_mode(0o755),
            )
            .unwrap();
            path
        };
        let zsh = make("zsh");
        let fish = make("fish");
        let tmux = make("tmux");
        let plain = dir.path().join("bash");
        std::fs::write(&plain, "").unwrap();
        let link = dir.path().join("zsh-link");
        std::os::unix::fs::symlink(&zsh, &link).unwrap();
        let shells = unix_shells(
            vec![zsh.clone(), fish.clone(), tmux, plain, link, fish.clone()].into_iter(),
            &zsh,
        );
        let labels: Vec<(&str, bool)> = shells.iter().map(|s| (s.label.as_str(), s.login)).collect();
        assert_eq!(labels, vec![("zsh", true), ("fish", false)]);
        assert_eq!(shells[1].args, vec!["-l"]);
    }
}
