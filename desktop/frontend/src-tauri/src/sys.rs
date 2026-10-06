// System/PATH helpers. A Finder-launched .app gets a minimal PATH without
// Homebrew or user-local bins, so subprocess lookups (ssh, git, gh, the AI CLIs,
// …) fail unless we prepend the usual locations. Run once at startup.
use std::path::Path;
use std::process::Stdio;
use std::sync::OnceLock;
use std::time::Duration;

/// Raw login-shell PATH captured once at startup, in the user's shell-resolution
/// order. Stashed so shadow detection can reason about the same PATH the user's
/// shell would use, not the (reordered, augmented) process PATH.
static LOGIN_PATH: OnceLock<String> = OnceLock::new();

/// The shell to run terminals, actions and jobs through.
///
/// `$SHELL` is the answer whenever it's set, but it is NOT always set: a service
/// manager hands a process almost no environment, so a Linux host running lpm
/// under systemd has no `$SHELL` at all. The old fallback was `/bin/zsh`, which is
/// the macOS default and simply doesn't exist on a stock Ubuntu — every terminal
/// on such a host failed to spawn. So ask the account database for the real login
/// shell before falling back to a per-platform guess.
///
/// Lives here rather than in pty.rs because terminals are only one of five things
/// that spawn a login shell; the other four kept their own `/bin/zsh` fallback
/// long after the terminal path was fixed, which is exactly the bug this prevents.
pub(crate) fn login_shell() -> String {
    #[cfg(windows)]
    return windows_shell();
    #[cfg(unix)]
    unix_login_shell()
}

/// Separator between PATH entries.
pub const PATH_SEP: char = if cfg!(windows) { ';' } else { ':' };

/// Windows runs every shell line through Git for Windows' bash, the same choice
/// Claude Code makes: services, actions and agent launches are POSIX shell lines,
/// and users' configs are shared with macOS/Linux teammates. `LPM_SHELL` naming a
/// real file wins, then a `$SHELL` that is a POSIX shell (Windows OpenSSH and
/// some terminals set it to PowerShell); then Git's usual install locations;
/// then the `git` on PATH (its sibling `bin\bash.exe`). Never a bare `bash.exe`:
/// Windows resolves that to System32's WSL launcher before PATH.
#[cfg(windows)]
fn windows_shell() -> String {
    let explicit = std::env::var("LPM_SHELL").ok();
    let inherited = std::env::var("SHELL")
        .ok()
        .filter(|shell| is_posix_shell(Path::new(shell)));
    explicit
        .into_iter()
        .chain(inherited)
        .find(|shell| !shell.is_empty() && Path::new(shell).is_file())
        .or_else(git_bash)
        .unwrap_or_else(|| r"C:\Program Files\Git\bin\bash.exe".to_string())
}

/// A bash/sh/zsh/dash by name, outside the Windows directory, whose `bash.exe`
/// is the WSL launcher and runs the line in another filesystem.
#[cfg(windows)]
fn is_posix_shell(shell: &Path) -> bool {
    let named_posix = shell
        .file_stem()
        .and_then(|stem| stem.to_str())
        .is_some_and(|stem| {
            ["bash", "sh", "zsh", "dash"]
                .iter()
                .any(|posix| stem.eq_ignore_ascii_case(posix))
        });
    let in_windows_dir = std::env::var("SystemRoot").is_ok_and(|root| {
        shell
            .to_string_lossy()
            .to_ascii_lowercase()
            .starts_with(&format!("{}\\", root.trim_end_matches('\\').to_ascii_lowercase()))
    });
    named_posix && !in_windows_dir
}

/// Forget any std handle this process cannot duplicate. A launcher can hand the
/// app a handle value it never let it inherit (.NET's `Process.Start` passes its
/// own stdin when it redirects only the output), and then every child spawned
/// with that stream inherited fails with "The request is not supported". No
/// handle at all is what Explorer hands over, and children inherit that fine.
#[cfg(windows)]
pub fn drop_unusable_std_handles() {
    use windows_sys::Win32::Foundation::{
        CloseHandle, DuplicateHandle, DUPLICATE_SAME_ACCESS, INVALID_HANDLE_VALUE,
    };
    use windows_sys::Win32::System::Console::{
        GetStdHandle, SetStdHandle, STD_ERROR_HANDLE, STD_INPUT_HANDLE, STD_OUTPUT_HANDLE,
    };
    use windows_sys::Win32::System::Threading::GetCurrentProcess;
    for id in [STD_INPUT_HANDLE, STD_OUTPUT_HANDLE, STD_ERROR_HANDLE] {
        unsafe {
            let handle = GetStdHandle(id);
            if handle.is_null() || handle == INVALID_HANDLE_VALUE {
                continue;
            }
            let process = GetCurrentProcess();
            let mut copy = std::ptr::null_mut();
            if DuplicateHandle(process, handle, process, &mut copy, 0, 0, DUPLICATE_SAME_ACCESS) != 0 {
                CloseHandle(copy);
            } else {
                SetStdHandle(id, std::ptr::null_mut());
            }
        }
    }
}

/// Stop children inheriting this process's std handles behind their own. Every
/// spawn passes on all inheritable handles, and a launcher that redirected the
/// app's output handed it inheritable ones, so the session daemon, which
/// outlives the app, would hold the app's log file or pipe open. A child given
/// the app's stream still gets its own copy of it.
#[cfg(windows)]
pub fn keep_std_handles_from_children() {
    use windows_sys::Win32::Foundation::{
        SetHandleInformation, HANDLE_FLAG_INHERIT, INVALID_HANDLE_VALUE,
    };
    use windows_sys::Win32::System::Console::{
        GetStdHandle, STD_ERROR_HANDLE, STD_INPUT_HANDLE, STD_OUTPUT_HANDLE,
    };
    for id in [STD_INPUT_HANDLE, STD_OUTPUT_HANDLE, STD_ERROR_HANDLE] {
        unsafe {
            let handle = GetStdHandle(id);
            if !handle.is_null() && handle != INVALID_HANDLE_VALUE {
                SetHandleInformation(handle, HANDLE_FLAG_INHERIT, 0);
            }
        }
    }
}

/// Git for Windows' bash.exe, when installed.
#[cfg(windows)]
pub fn git_bash() -> Option<String> {
    let mut candidates = Vec::new();
    for var in ["ProgramFiles", "ProgramW6432", "ProgramFiles(x86)"] {
        if let Ok(dir) = std::env::var(var) {
            candidates.push(Path::new(&dir).join(r"Git\bin\bash.exe"));
        }
    }
    if let Ok(dir) = std::env::var("LOCALAPPDATA") {
        candidates.push(Path::new(&dir).join(r"Programs\Git\bin\bash.exe"));
    }
    if let Some(git) = find_on_path("git") {
        if let Some(root) = git.parent().and_then(Path::parent) {
            candidates.push(root.join(r"bin\bash.exe"));
        }
    }
    candidates
        .into_iter()
        .find(|p| p.is_file())
        .map(|p| p.to_string_lossy().into_owned())
}

#[cfg(unix)]
fn unix_login_shell() -> String {
    if let Ok(shell) = std::env::var("SHELL") {
        if !shell.is_empty() && !is_locked_out_shell(&shell) {
            return shell;
        }
    }
    if let Some(shell) = passwd_shell() {
        return shell;
    }
    if cfg!(target_os = "macos") {
        "/bin/zsh".into()
    } else {
        "/bin/sh".into()
    }
}

/// This account's login shell per `/etc/passwd` (7th field). Read directly rather
/// than through getpwuid so there's no libc call to gate per platform; a missing
/// or unreadable file just falls through to the caller's default.
///
/// A locked-out account (`nologin`, `false`) is rejected rather than returned: it
/// is a valid passwd entry that exits immediately, so honouring it would turn
/// every spawn into a silent no-op. The platform default is wrong for that
/// account too, but it at least runs.
#[cfg(unix)]
fn passwd_shell() -> Option<String> {
    let user = std::env::var("USER")
        .or_else(|_| std::env::var("LOGNAME"))
        .ok()?;
    let passwd = std::fs::read_to_string("/etc/passwd").ok()?;
    for line in passwd.lines() {
        let mut fields = line.split(':');
        if fields.next()? != user {
            continue;
        }
        let shell = fields.nth(5)?.trim();
        if !shell.is_empty() && !is_locked_out_shell(shell) {
            return Some(shell.to_string());
        }
    }
    None
}

#[cfg(unix)]
fn is_locked_out_shell(shell: &str) -> bool {
    matches!(
        Path::new(shell).file_name().and_then(|n| n.to_str()),
        Some("nologin" | "false")
    )
}

#[cfg(unix)]
const EXTRA_PATHS: [&str; 2] = ["/opt/homebrew/bin", "/usr/local/bin"];
#[cfg(windows)]
const EXTRA_PATHS: [&str; 0] = [];

// Home-relative bin dirs a Finder-launched app never sees on PATH: claude's
// native installer drops into ~/.local/bin; cargo/bun/npm-global/pnpm are similar.
#[cfg(unix)]
const HOME_BIN_DIRS: [&str; 5] = [
    ".local/bin",
    ".cargo/bin",
    ".bun/bin",
    ".npm-global/bin",
    "Library/pnpm",
];
#[cfg(windows)]
const HOME_BIN_DIRS: [&str; 5] = [
    ".local\\bin",
    ".cargo\\bin",
    ".bun\\bin",
    "AppData\\Roaming\\npm",
    "AppData\\Local\\Programs\\lpm\\bin",
];

pub fn ensure_path() {
    ensure_path_hardcoded();
    #[cfg(unix)]
    merge_login_shell_path();
}

fn ensure_path_hardcoded() {
    let current = std::env::var("PATH").unwrap_or_default();
    #[cfg(unix)]
    let home = std::env::var_os("HOME").map(std::path::PathBuf::from);
    #[cfg(windows)]
    let home = dirs::home_dir();
    let home = home.as_deref();

    let home_bins: Vec<String> = home
        .map(|home| {
            HOME_BIN_DIRS
                .iter()
                .map(|d| home.join(d).to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default();
    let nvm_bins: Vec<String> = home.map(nvm_node_bins).unwrap_or_default();

    let mut prefix = String::new();
    let extras = EXTRA_PATHS
        .iter()
        .copied()
        .map(String::from)
        .chain(home_bins)
        .chain(nvm_bins);
    for dir in extras {
        if !current.split(PATH_SEP).any(|p| p == dir) {
            prefix.push_str(&dir);
            prefix.push(PATH_SEP);
        }
    }
    if !prefix.is_empty() {
        std::env::set_var("PATH", format!("{prefix}{current}"));
    }
}

/// Put the login-shell PATH first, in the shell's own order, so the app resolves
/// `codex`/`node`/… to the same binaries the user's terminal does; the hardcoded
/// dirs only fill in behind it. Otherwise /opt/homebrew/bin outranks ~/.local/bin
/// and nvm, and a stale Homebrew copy of a CLI wins. Best-effort; no-op on failure.
#[cfg(unix)]
fn merge_login_shell_path() {
    let Some(captured) = capture_login_path() else {
        return;
    };
    let _ = LOGIN_PATH.set(captured.clone());
    let current = std::env::var("PATH").unwrap_or_default();
    let merged = login_path_first(&captured, &current, |dir| Path::new(dir).is_dir());
    std::env::set_var("PATH", merged);
}

#[cfg(unix)]
fn login_path_first(login: &str, current: &str, is_dir: impl Fn(&str) -> bool) -> String {
    let mut seen = std::collections::HashSet::new();
    let login_dirs = login
        .split(':')
        .filter(|dir| Path::new(dir).is_absolute() && is_dir(dir));
    let current_dirs = current.split(':').filter(|dir| !dir.is_empty());
    login_dirs
        .chain(current_dirs)
        .filter(|dir| seen.insert(*dir))
        .collect::<Vec<_>>()
        .join(":")
}

/// `-i` is required: volta/nvm/fnm edit ~/.zshrc, sourced only when interactive.
/// Sentinels survive rc-file banner output; reading to the closing sentinel rather
/// than EOF avoids hanging when an rc leaves a daemon holding stdout (gitstatusd,
/// atuin). 2s timeout + kill bounds a pathological rc.
#[cfg(unix)]
fn capture_login_path() -> Option<String> {
    capture_login_env("PATH")
}

pub(crate) fn capture_login_env(name: &str) -> Option<String> {
    if name.is_empty()
        || !name.bytes().enumerate().all(|(index, byte)| {
            byte.is_ascii_uppercase() || byte == b'_' || (index > 0 && byte.is_ascii_digit())
        })
    {
        return None;
    }
    const START: &str = "__LPM_ENV_START__";
    const END: &str = "__LPM_ENV_END__";
    let shell = login_shell();
    let mut child = crate::osproc::command(&shell)
        .arg("-ilc")
        .arg(format!("printf '{START}%s{END}' \"${{{name}:-}}\""))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let mut stdout = child.stdout.take()?;
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        use std::io::Read;
        let mut buf = Vec::new();
        let mut chunk = [0u8; 4096];
        loop {
            match stdout.read(&mut chunk) {
                Ok(0) => break,
                Ok(n) => {
                    buf.extend_from_slice(&chunk[..n]);
                    if buf.windows(END.len()).any(|w| w == END.as_bytes()) || buf.len() > 1 << 16 {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        let _ = tx.send(buf);
    });
    let buf = rx.recv_timeout(Duration::from_secs(2)).ok();
    let _ = child.kill();
    let _ = child.wait();
    let buf = buf?;
    let text = String::from_utf8_lossy(&buf);
    let start = text.find(START)? + START.len();
    let end = text[start..].find(END)? + start;
    let value = &text[start..end];
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

// nvm installs global CLIs (e.g. codex) under ~/.nvm/versions/node/<ver>/bin; the
// version segment is dynamic, so enumerate every installed version.
fn nvm_node_bins(home: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(home.join(".nvm/versions/node")) else {
        return Vec::new();
    };
    entries
        .flatten()
        .map(|e| e.path().join("bin"))
        .filter(|p| p.is_dir())
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

/// PATH in the user's shell-resolution order: the login-shell capture when we
/// got one, else the process PATH. Split on ':', empties skipped.
pub fn shell_path_dirs() -> Vec<String> {
    let raw = LOGIN_PATH
        .get()
        .cloned()
        .or_else(|| std::env::var("PATH").ok())
        .unwrap_or_default();
    raw.split(PATH_SEP)
        .filter(|d| !d.is_empty())
        .map(String::from)
        .collect()
}

/// The network hostname, or None when the syscall fails or reports an empty name.
#[cfg(windows)]
pub fn hostname() -> Option<String> {
    std::env::var("COMPUTERNAME")
        .ok()
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty())
}

/// The network hostname, or None when the syscall fails or reports an empty name.
#[cfg(unix)]
pub fn hostname() -> Option<String> {
    let mut buf = [0u8; 256];
    if unsafe { libc::gethostname(buf.as_mut_ptr() as *mut libc::c_char, buf.len()) } != 0 {
        return None;
    }
    let end = buf.iter().position(|&b| b == 0).unwrap_or(buf.len());
    let name = String::from_utf8_lossy(&buf[..end]).trim().to_string();
    (!name.is_empty()).then_some(name)
}

/// This machine's user-facing name — what a paired Mac's peer list and the
/// phone's server switcher show. macOS prefers the Sharing pane's ComputerName
/// (`scutil` exists nowhere else, so the call is skipped rather than failed);
/// every platform then falls back to the network hostname, and finally to a
/// generic label.
pub fn machine_name() -> String {
    #[cfg(target_os = "macos")]
    {
        if let Ok(out) = std::process::Command::new("scutil")
            .args(["--get", "ComputerName"])
            .output()
        {
            if out.status.success() {
                let name = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !name.is_empty() {
                    return name;
                }
            }
        }
    }
    if let Some(name) = hostname() {
        return name;
    }
    #[cfg(target_os = "macos")]
    return "Mac".to_string();
    #[cfg(windows)]
    return "Windows PC".to_string();
    #[cfg(all(unix, not(target_os = "macos")))]
    return "Linux host".to_string();
}

/// True when this process is a headless lpm host (a Linux server driven from a
/// Mac): no one sits at this machine, so chimes, approval prompts and the like
/// belong to the paired Mac. The host's supervisors set `LPM_HEADLESS=1`; a host
/// installed before that variable existed is recognised by its install prefix.
/// Every desktop build (macOS, a Linux desktop, Windows) is not headless.
pub fn headless() -> bool {
    static HEADLESS: OnceLock<bool> = OnceLock::new();
    *HEADLESS.get_or_init(|| {
        if let Ok(v) = std::env::var("LPM_HEADLESS") {
            return matches!(v.trim(), "1" | "true" | "yes");
        }
        #[cfg(target_os = "linux")]
        {
            if let Ok(exe) = std::env::current_exe() {
                return exe.starts_with("/opt/lpm");
            }
        }
        false
    })
}

/// Full path of `bin` on PATH, honouring PATHEXT on Windows.
pub fn find_on_path(bin: &str) -> Option<std::path::PathBuf> {
    let path = std::env::var_os("PATH")?;
    #[cfg(windows)]
    let exts: Vec<String> = if Path::new(bin).extension().is_some() {
        vec![String::new()]
    } else {
        std::env::var("PATHEXT")
            .unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into())
            .split(';')
            .filter(|e| !e.is_empty())
            .map(|e| e.to_ascii_lowercase())
            .collect()
    };
    #[cfg(unix)]
    let exts: Vec<String> = vec![String::new()];
    std::env::split_paths(&path)
        .filter(|d| !d.as_os_str().is_empty())
        .flat_map(|dir| {
            exts.iter()
                .map(move |ext| dir.join(format!("{bin}{ext}")))
                .collect::<Vec<_>>()
        })
        .find(|candidate| candidate.is_file())
}

/// True if `bin` resolves to a file on PATH (LookPath-style presence check).
pub fn which(bin: &str) -> bool {
    find_on_path(bin).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    // The shell every spawn path resolves must exist on the machine it spawns on.
    // A service manager hands down no $SHELL, and the old fallback was macOS's
    // /bin/zsh — absent on a stock Linux host, so the spawn failed outright.
    #[test]
    fn resolves_a_shell_that_exists_on_this_platform() {
        let shell = login_shell();
        assert!(
            Path::new(&shell).exists(),
            "resolved shell must exist: {shell}"
        );
    }

    // A locked-out account's shell is a valid passwd entry that exits immediately,
    // so honouring it would turn every terminal, action and job into a silent
    // no-op rather than an error anyone could read.
    #[cfg(unix)]
    #[test]
    fn a_locked_out_login_shell_is_not_used() {
        assert!(is_locked_out_shell("/usr/sbin/nologin"));
        assert!(is_locked_out_shell("/sbin/nologin"));
        assert!(is_locked_out_shell("/bin/false"));
        assert!(!is_locked_out_shell("/bin/bash"));
        assert!(!is_locked_out_shell("/bin/sh"));
    }

    #[cfg(windows)]
    #[test]
    fn only_a_posix_shell_from_the_environment_runs_lpm_lines() {
        assert!(is_posix_shell(Path::new(r"C:\Program Files\Git\bin\bash.exe")));
        assert!(is_posix_shell(Path::new(r"C:\msys64\usr\bin\ZSH.EXE")));
        assert!(is_posix_shell(Path::new(r"D:\tools\dash.exe")));
        assert!(!is_posix_shell(Path::new(
            r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
        )));
        assert!(!is_posix_shell(Path::new(r"C:\Program Files\PowerShell\7\pwsh.exe")));
        assert!(!is_posix_shell(Path::new(r"C:\Windows\System32\cmd.exe")));
        let root = std::env::var("SystemRoot").unwrap();
        assert!(!is_posix_shell(&Path::new(&root).join(r"System32\bash.exe")));
        let shell = login_shell();
        assert!(is_posix_shell(Path::new(&shell)), "{shell}");
    }

    #[test]
    fn nvm_node_bins_lists_only_version_dirs_with_bin() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path();
        let versions = home.join(".nvm/versions/node");
        let with_bin = versions.join("v20.0.0").join("bin");
        std::fs::create_dir_all(&with_bin).unwrap();
        std::fs::create_dir_all(versions.join("v18.0.0")).unwrap();
        assert_eq!(
            nvm_node_bins(home),
            vec![with_bin.to_string_lossy().into_owned()]
        );
    }

    #[cfg(unix)]
    #[test]
    fn login_shell_order_outranks_hardcoded_dirs() {
        let login = "/home/u/.local/bin:/home/u/.nvm/bin:relative:/gone:/opt/homebrew/bin:/usr/bin";
        let current = "/opt/homebrew/bin:/usr/local/bin:/home/u/.local/bin:/usr/bin:/bin";
        let merged = login_path_first(login, current, |dir| dir != "/gone");
        assert_eq!(
            merged,
            "/home/u/.local/bin:/home/u/.nvm/bin:/opt/homebrew/bin:/usr/bin:/usr/local/bin:/bin"
        );
    }

    #[test]
    fn nvm_node_bins_empty_without_nvm() {
        let dir = tempfile::tempdir().unwrap();
        assert!(nvm_node_bins(dir.path()).is_empty());
    }

    #[test]
    fn find_on_path_resolves_a_binary_every_platform_has() {
        #[cfg(unix)]
        assert!(find_on_path("sh").is_some());
        #[cfg(windows)]
        assert!(find_on_path("cmd").is_some());
        assert!(find_on_path("lpm-no-such-binary-anywhere").is_none());
    }
}
