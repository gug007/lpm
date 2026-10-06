// How lpm hands paths and scripts to the shell its commands run through. On
// macOS and Linux that is the user's own shell, and a path is already in the
// form it wants. On Windows it is Git for Windows' bash (sys::login_shell),
// which speaks MSYS paths (/c/Users/x) and re-parses its command line with
// Cygwin rules that disagree with std's quoting about backslashes.
use std::path::Path;
use std::process::Command;

/// The environment variable a Windows script rides in (see `shell_script`).
#[cfg(windows)]
const SCRIPT_ENV: &str = "LPM_SHELL_SCRIPT";

/// `p` as the shell spells it, for embedding in a shell line (`cd`, a
/// redirect). Quoting stays with the caller. Identity on Unix; on Windows
/// `C:\Users\x` becomes `/c/Users/x` and `\\srv\share` becomes `//srv/share`.
pub fn shell_path(p: &Path) -> String {
    #[cfg(windows)]
    return msys_path(&p.to_string_lossy());
    #[cfg(not(windows))]
    p.to_string_lossy().into_owned()
}

/// Flags that make the shell an interactive login shell on a pty. A pty is
/// already interactive on Unix; Windows adds `-i` so bash still takes a ^C at
/// its prompt as an interrupt rather than a reason to exit, even if MSYS does
/// not recognise the pseudoconsole as a tty.
pub fn login_args() -> &'static [&'static str] {
    if cfg!(windows) {
        &["-l", "-i"]
    } else {
        &["-l"]
    }
}

/// `login_shell() <flag> <script>`. On Windows the script travels in the
/// environment and the command line only carries a fixed `eval` stub, so no
/// backslash or quote in the script depends on how MSYS parses argv.
pub fn shell_script(flag: &str, script: &str) -> Command {
    let mut cmd = crate::osproc::command(crate::sys::login_shell());
    cmd.arg(flag);
    #[cfg(windows)]
    cmd.arg(eval_stub()).env(SCRIPT_ENV, script);
    #[cfg(not(windows))]
    cmd.arg(script);
    cmd
}

/// A plain POSIX `sh -c <script>`, for lines that need no login environment
/// (an ssh command line resolves its own on the far side). Windows has no
/// /bin/sh, so it gets the same bash every other line runs through.
pub fn sh_script(script: &str) -> Command {
    #[cfg(windows)]
    return shell_script("-c", script);
    #[cfg(not(windows))]
    {
        let mut cmd = crate::osproc::command("/bin/sh");
        cmd.arg("-c").arg(script);
        cmd
    }
}

/// Keep Git Bash from rewriting an agent's slash-command argument (`/init`,
/// `/review the diff`) into a path under the Git install when it execs the
/// native CLI. Only the slash-command words in `line` are excluded, because the
/// agent inherits the setting: its own commands still get MSYS path rewriting.
/// No-op off Windows.
pub fn verbatim_args<'a>(cmd: &'a mut Command, line: &str) -> &'a mut Command {
    #[cfg(windows)]
    if let Some(prefixes) = slash_command_prefixes(line) {
        cmd.env("MSYS2_ARG_CONV_EXCL", prefixes);
    }
    #[cfg(not(windows))]
    let _ = line;
    cmd
}

/// The quoted words in a shell line that open with a slash command (`'/review …'`)
/// as an `MSYS2_ARG_CONV_EXCL` list. A word with a second `/` is a path and keeps
/// its rewrite.
#[cfg_attr(not(windows), allow(dead_code))]
fn slash_command_prefixes(line: &str) -> Option<String> {
    let mut words: Vec<&str> = Vec::new();
    for (at, _) in line.match_indices("'/") {
        let rest = &line[at + 1..];
        let end = rest
            .find(|c: char| c.is_whitespace() || c == '\'')
            .unwrap_or(rest.len());
        let word = &rest[..end];
        if word.len() > 1 && !word[1..].contains('/') && !words.contains(&word) {
            words.push(word);
        }
    }
    (!words.is_empty()).then(|| words.join(";"))
}

/// `cli args…` for a CLI found on PATH (an AI agent). Windows runs a native
/// `.exe` directly, but npm installs CLIs as `.cmd` shims, which std won't
/// hand a multi-line argument to (cmd.exe can't be trusted to keep it) and
/// won't even find without the extension. npm writes a POSIX shim beside
/// each, so those run through bash instead.
pub fn cli_command(cli: &str, args: &[String]) -> Command {
    #[cfg(windows)]
    {
        let native = crate::sys::find_on_path(cli).filter(|path| {
            path.extension()
                .and_then(|e| e.to_str())
                .is_some_and(|e| e.eq_ignore_ascii_case("exe") || e.eq_ignore_ascii_case("com"))
        });
        if let Some(path) = native {
            let mut cmd = crate::osproc::command(path);
            cmd.args(args);
            return cmd;
        }
        let line = exec_line(cli, args);
        let mut cmd = shell_script("-c", &line);
        verbatim_args(&mut cmd, &line);
        cmd
    }
    #[cfg(not(windows))]
    {
        let mut cmd = crate::osproc::command(cli);
        cmd.args(args);
        cmd
    }
}

#[cfg_attr(not(windows), allow(dead_code))]
fn exec_line(cli: &str, args: &[String]) -> String {
    std::iter::once(cli)
        .chain(args.iter().map(String::as_str))
        .fold(String::from("exec"), |mut line, word| {
            line.push(' ');
            line.push_str(&crate::config::shell_quote(word));
            line
        })
}

#[cfg(windows)]
fn eval_stub() -> String {
    format!("__lpm_script=${SCRIPT_ENV}; unset {SCRIPT_ENV}; eval \"$__lpm_script\"")
}

/// MSYS spelling of a Windows path. Verbatim (`\\?\`) prefixes are dropped
/// first, so the result is what Git Bash's own `cygpath -u` prints.
#[cfg_attr(not(windows), allow(dead_code))]
fn msys_path(path: &str) -> String {
    let path = if let Some(rest) = path.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{rest}")
    } else if let Some(rest) = path.strip_prefix(r"\\?\") {
        rest.to_string()
    } else {
        path.to_string()
    };
    let slashed = path.replace('\\', "/");
    let bytes = slashed.as_bytes();
    if bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
        let drive = (bytes[0] as char).to_ascii_lowercase();
        let rest = &slashed[2..];
        if rest.is_empty() || rest.starts_with('/') {
            return format!("/{drive}{rest}");
        }
    }
    slashed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drive_paths_become_msys_paths() {
        assert_eq!(msys_path(r"C:\Users\x\proj"), "/c/Users/x/proj");
        assert_eq!(msys_path(r"d:\work"), "/d/work");
        assert_eq!(msys_path("C:/Users/x"), "/c/Users/x");
        assert_eq!(msys_path(r"C:\"), "/c/");
        assert_eq!(msys_path("C:"), "/c");
    }

    #[test]
    fn unc_and_verbatim_paths_keep_their_server() {
        assert_eq!(msys_path(r"\\srv\share\dir"), "//srv/share/dir");
        assert_eq!(msys_path(r"\\?\C:\Users\x"), "/c/Users/x");
        assert_eq!(msys_path(r"\\?\UNC\srv\share\x"), "//srv/share/x");
    }

    #[test]
    fn relative_and_posix_paths_only_change_separators() {
        assert_eq!(msys_path(r"packages\web app"), "packages/web app");
        assert_eq!(msys_path("/c/Users/x"), "/c/Users/x");
        assert_eq!(msys_path("~/proj"), "~/proj");
        // Drive-relative `C:x` names a path on that drive's own cwd, which
        // has no MSYS spelling; leave it for bash to resolve.
        assert_eq!(msys_path("C:proj"), "C:proj");
    }

    #[cfg(not(windows))]
    #[test]
    fn unix_paths_pass_through_untouched() {
        assert_eq!(
            shell_path(Path::new("/Users/x/my proj")),
            "/Users/x/my proj"
        );
        assert_eq!(shell_path(Path::new(r"odd\name")), r"odd\name");
    }

    #[cfg(not(windows))]
    #[test]
    fn unix_scripts_go_straight_to_the_shell() {
        let cmd = shell_script("-ilc", "cd '/tmp' && echo 'a\\\\b'");
        let args: Vec<_> = cmd.get_args().collect();
        assert_eq!(args, ["-ilc", "cd '/tmp' && echo 'a\\\\b'"]);
        assert_eq!(cmd.get_program(), crate::sys::login_shell().as_str());

        let sh = sh_script("echo hi");
        assert_eq!(sh.get_program(), "/bin/sh");
        assert_eq!(sh.get_args().collect::<Vec<_>>(), ["-c", "echo hi"]);
    }

    #[cfg(windows)]
    #[test]
    fn windows_scripts_ride_in_the_environment() {
        let script = r#"cd '/c/x' && echo 'a\\b' && grep -E '\"q\"'"#;
        let cmd = shell_script("-ilc", script);
        let args: Vec<_> = cmd.get_args().collect();
        assert_eq!(args.len(), 2);
        assert_eq!(args[0], "-ilc");
        assert!(!args[1].to_string_lossy().contains("a\\b"));
        let env: Vec<_> = cmd.get_envs().collect();
        assert!(env
            .iter()
            .any(|(k, v)| *k == SCRIPT_ENV && v.map(|v| v == script).unwrap_or(false)));
    }

    #[cfg(not(windows))]
    #[test]
    fn verbatim_args_change_nothing_off_windows() {
        let mut cmd = Command::new("claude");
        verbatim_args(&mut cmd, "claude -p '/init'");
        assert_eq!(cmd.get_envs().count(), 0);
    }

    #[test]
    fn only_slash_command_words_skip_msys_rewriting() {
        assert_eq!(
            slash_command_prefixes("( claude -p '/review the diff' ) > log 2>&1").as_deref(),
            Some("/review")
        );
        assert_eq!(
            slash_command_prefixes("claude -p '/init' --add-dir '/c/repo/src'").as_deref(),
            Some("/init")
        );
        assert_eq!(slash_command_prefixes("claude -p 'fix the bug'"), None);
        assert_eq!(slash_command_prefixes("cat '/'"), None);
    }

    #[cfg(windows)]
    #[test]
    fn agent_args_skip_msys_path_conversion() {
        let mut cmd = Command::new("claude");
        verbatim_args(&mut cmd, "claude -p '/init'");
        assert!(cmd
            .get_envs()
            .any(|(k, v)| k == "MSYS2_ARG_CONV_EXCL" && v == Some("/init".as_ref())));
        assert!(!cmd.get_envs().any(|(k, _)| k == "MSYS_NO_PATHCONV"));
    }

    #[test]
    fn exec_line_quotes_every_word() {
        let args = vec![
            "-p".to_string(),
            "line one\nit's \"two\"".to_string(),
            "--model".to_string(),
            String::new(),
        ];
        assert_eq!(
            exec_line("claude", &args),
            "exec 'claude' '-p' 'line one\nit'\\''s \"two\"' '--model' ''"
        );
    }

    #[test]
    fn a_script_runs_with_its_backslashes_and_quotes_intact() {
        let out = shell_script("-c", r#"printf '%s|' 'a\\b' "q\"x" 'it'\''s'"#)
            .output()
            .unwrap();
        assert_eq!(String::from_utf8_lossy(&out.stdout), r#"a\\b|q"x|it's|"#);
    }
}
