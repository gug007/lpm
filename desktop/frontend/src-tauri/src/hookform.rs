// How the agent hooks lpm installs get run on this machine.
//
// macOS and Linux (and every SSH host) get the POSIX-sh one-liners hooks.rs
// builds. On Windows those cannot reach the app: Git Bash has no `nc -U`,
// CPython no AF_UNIX, and `$PPID` is an MSYS pid. There the hooks call the lpm
// CLI shipped beside the app (`lpm hook <agent> <event>`), which sends the same
// frames over the socket itself.
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub(crate) enum HookForm {
    Shell,
    Cli(PathBuf),
}

/// The form for hooks installed into this machine's own agent settings. A
/// Windows build missing its CLI keeps the sh form, which stays inert there.
pub(crate) fn local() -> HookForm {
    if cfg!(windows) {
        if let Some(cli) = bundled_cli() {
            return HookForm::Cli(cli);
        }
    }
    HookForm::Shell
}

/// The CLI bundled next to the app executable (Tauri's `externalBin`, installed
/// without its target-triple suffix).
fn bundled_cli() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let cli = exe
        .parent()?
        .join(format!("lpm-cli{}", std::env::consts::EXE_SUFFIX));
    cli.is_file().then_some(cli)
}

/// A Claude hook in exec form: Claude spawns `command` with `args` directly, no
/// shell involved, so the path needs no quoting. The marker rides as a trailing
/// argument the CLI ignores.
pub(crate) fn claude_entry(cli: &Path, event: &str, matcher: &str, marker: &str) -> Value {
    json!({
        "matcher": matcher,
        "hooks": [{
            "type": "command",
            "command": cli.to_string_lossy(),
            "args": ["hook", "claude", event, marker],
        }],
    })
}

/// A Codex hook command line. Codex has no exec form and, depending on its
/// version, runs the line through cmd.exe or PowerShell — and cmd.exe's `/c`
/// mangles a quoted program token. So the program is written bare: the path as
/// is, or its 8.3 short form when the long one would need quotes. Only when
/// neither is bare does it fall back to PowerShell's call operator. The marker
/// is a comment in PowerShell and an ignored argument in cmd.exe.
pub(crate) fn codex_command(cli: &Path, event: &str, marker: &str) -> String {
    format!("{} hook codex {event} {marker}", program_word(cli))
}

fn program_word(program: &Path) -> String {
    let long = program.to_string_lossy();
    if is_bare(&long) {
        return long.into_owned();
    }
    match short_path(program).filter(|short| is_bare(short)) {
        Some(short) => short,
        None => format!("& '{}'", long.replace('\'', "''")),
    }
}

/// Safe unquoted in cmd.exe, PowerShell and bash alike.
fn is_bare(word: &str) -> bool {
    !word.is_empty()
        && word
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "\\/:._-~".contains(c))
}

#[cfg(windows)]
fn short_path(path: &Path) -> Option<String> {
    use std::os::windows::ffi::{OsStrExt, OsStringExt};
    use windows_sys::Win32::Storage::FileSystem::GetShortPathNameW;
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain([0]).collect();
    let mut buf = vec![0u16; 1024];
    let len = unsafe { GetShortPathNameW(wide.as_ptr(), buf.as_mut_ptr(), buf.len() as u32) };
    if len == 0 || len as usize >= buf.len() {
        return None;
    }
    buf.truncate(len as usize);
    Some(
        std::ffi::OsString::from_wide(&buf)
            .to_string_lossy()
            .into_owned(),
    )
}

#[cfg(not(windows))]
fn short_path(_path: &Path) -> Option<String> {
    None
}

/// The part of the Claude statusline wrapper that reports the payload, as Git
/// Bash runs it (Claude Code runs statusline commands through Git Bash on
/// Windows). It expects the payload already captured in `$i` and backgrounds
/// itself off stdout so the line still renders immediately.
pub(crate) fn statusline_forward(cli: &Path) -> String {
    format!(
        "printf %s \"$i\" | {} hook claude statusline >/dev/null 2>&1 &",
        bash_word(&cli.to_string_lossy())
    )
}

/// A path as it appears inside an sh command line lpm writes into Claude's
/// statusline: unchanged on Unix, forward slashes on Windows, where Git Bash
/// would eat backslashes and every Windows program accepts `/`.
pub(crate) fn script_path(path: &Path) -> String {
    let path = path.to_string_lossy();
    if cfg!(windows) {
        path.replace('\\', "/")
    } else {
        path.into_owned()
    }
}

/// A Windows path as one single-quoted Git Bash word.
fn bash_word(s: &str) -> String {
    format!("'{}'", s.replace('\\', "/").replace('\'', "'\\''"))
}

/// The program that runs a status line script. `sh` on Unix. On Windows, Git
/// Bash by a path both Git Bash and PowerShell accept as a bare command, so the
/// line renders whichever of the two Claude Code picked; `sh` (Git Bash only)
/// when no such path exists.
pub(crate) fn statusline_shell() -> String {
    #[cfg(windows)]
    if let Some(bash) = crate::sys::git_bash() {
        let bash = Path::new(&bash);
        let word = Some(bash.to_string_lossy().into_owned())
            .filter(|long| is_bare(long))
            .or_else(|| short_path(bash).filter(|short| is_bare(short)));
        if let Some(word) = word {
            return word.replace('\\', "/");
        }
    }
    "sh".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_entry_is_exec_form_with_the_marker_as_an_argument() {
        let entry = claude_entry(
            Path::new(r"C:\Program Files\lpm\lpm-cli.exe"),
            "Notification",
            "permission_prompt",
            "# lpm-hook",
        );
        assert_eq!(entry["matcher"], "permission_prompt");
        let hook = &entry["hooks"][0];
        assert_eq!(hook["type"], "command");
        assert_eq!(hook["command"], r"C:\Program Files\lpm\lpm-cli.exe");
        assert_eq!(
            hook["args"],
            json!(["hook", "claude", "Notification", "# lpm-hook"])
        );
    }

    #[test]
    fn codex_command_keeps_the_program_token_bare() {
        assert_eq!(
            codex_command(
                Path::new(r"C:\Users\dev\AppData\Local\lpm\lpm-cli.exe"),
                "Stop",
                "# lpm-hook"
            ),
            r"C:\Users\dev\AppData\Local\lpm\lpm-cli.exe hook codex Stop # lpm-hook"
        );
    }

    #[cfg(not(windows))]
    #[test]
    fn codex_command_without_a_bare_path_uses_the_powershell_call_operator() {
        assert_eq!(
            codex_command(
                Path::new(r"C:\Users\O'Neil Smith\lpm-cli.exe"),
                "Stop",
                "# lpm-hook"
            ),
            r"& 'C:\Users\O''Neil Smith\lpm-cli.exe' hook codex Stop # lpm-hook"
        );
    }

    #[test]
    fn bare_words_exclude_every_shell_metacharacter() {
        assert!(is_bare(r"C:\PROGRA~1\lpm\lpm-cli.exe"));
        assert!(is_bare("C:/Users/dev/lpm-cli.exe"));
        for word in [
            "", "a b", "a'b", "a\"b", "a&b", "a(b", "a$b", "a;b", "a#b", "a`b",
        ] {
            assert!(!is_bare(word), "{word}");
        }
    }

    #[test]
    fn bash_word_uses_forward_slashes_and_survives_quotes() {
        assert_eq!(
            bash_word(r"C:\Users\O'Neil\lpm-cli.exe"),
            r"'C:/Users/O'\''Neil/lpm-cli.exe'"
        );
    }

    #[test]
    fn statusline_forward_reports_in_the_background() {
        let line = statusline_forward(Path::new(r"C:\lpm\lpm-cli.exe"));
        assert_eq!(
            line,
            "printf %s \"$i\" | 'C:/lpm/lpm-cli.exe' hook claude statusline >/dev/null 2>&1 &"
        );
    }

    #[cfg(not(windows))]
    #[test]
    fn unix_keeps_the_sh_form_and_paths() {
        assert!(matches!(local(), HookForm::Shell));
        assert_eq!(statusline_shell(), "sh");
        assert_eq!(script_path(Path::new("/a/b.sh")), "/a/b.sh");
    }
}
