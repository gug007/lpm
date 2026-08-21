// System/PATH helpers. A Finder-launched .app gets a minimal PATH without
// Homebrew or user-local bins, so subprocess lookups (ssh, git, gh, the AI CLIs,
// …) fail unless we prepend the usual locations. Run once at startup.
use std::path::Path;
use std::process::{Command, Stdio};
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

fn is_locked_out_shell(shell: &str) -> bool {
    matches!(
        Path::new(shell).file_name().and_then(|n| n.to_str()),
        Some("nologin" | "false")
    )
}

const EXTRA_PATHS: [&str; 2] = ["/opt/homebrew/bin", "/usr/local/bin"];

// Home-relative bin dirs a Finder-launched app never sees on PATH: claude's
// native installer drops into ~/.local/bin; cargo/bun/npm-global/pnpm are similar.
const HOME_BIN_DIRS: [&str; 5] = [
    ".local/bin",
    ".cargo/bin",
    ".bun/bin",
    ".npm-global/bin",
    "Library/pnpm",
];

pub fn ensure_path() {
    ensure_path_hardcoded();
    merge_login_shell_path();
}

fn ensure_path_hardcoded() {
    let current = std::env::var("PATH").unwrap_or_default();
    let home = std::env::var_os("HOME");
    let home = home.as_deref().map(Path::new);

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
        if !current.split(':').any(|p| p == dir) {
            prefix.push_str(&dir);
            prefix.push(':');
        }
    }
    if !prefix.is_empty() {
        std::env::set_var("PATH", format!("{prefix}{current}"));
    }
}

/// Prepend login-shell PATH dirs the process lacks. Best-effort; no-op on failure.
fn merge_login_shell_path() {
    let Some(captured) = capture_login_path() else {
        return;
    };
    let _ = LOGIN_PATH.set(captured.clone());
    let current = std::env::var("PATH").unwrap_or_default();
    let mut existing: std::collections::HashSet<&str> = current.split(':').collect();
    let mut prefix: Vec<&str> = Vec::new();
    for dir in captured.split(':') {
        if !dir.is_empty()
            && Path::new(dir).is_absolute()
            && existing.insert(dir)
            && Path::new(dir).is_dir()
        {
            prefix.push(dir);
        }
    }
    if !prefix.is_empty() {
        std::env::set_var("PATH", format!("{}:{current}", prefix.join(":")));
    }
}

/// `-i` is required: volta/nvm/fnm edit ~/.zshrc, sourced only when interactive.
/// Sentinels survive rc-file banner output; reading to the closing sentinel rather
/// than EOF avoids hanging when an rc leaves a daemon holding stdout (gitstatusd,
/// atuin). 2s timeout + kill bounds a pathological rc.
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
    let mut child = Command::new(&shell)
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
    raw.split(':')
        .filter(|d| !d.is_empty())
        .map(String::from)
        .collect()
}

/// The network hostname, or None when the syscall fails or reports an empty name.
fn hostname() -> Option<String> {
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
        if let Ok(out) = Command::new("scutil")
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
    #[cfg(not(target_os = "macos"))]
    return "Linux host".to_string();
}

/// True if `bin` resolves to a file on PATH (LookPath-style presence check).
pub fn which(bin: &str) -> bool {
    let Ok(path) = std::env::var("PATH") else {
        return false;
    };
    path.split(':')
        .filter(|d| !d.is_empty())
        .any(|dir| Path::new(dir).join(bin).is_file())
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
    #[test]
    fn a_locked_out_login_shell_is_not_used() {
        assert!(is_locked_out_shell("/usr/sbin/nologin"));
        assert!(is_locked_out_shell("/sbin/nologin"));
        assert!(is_locked_out_shell("/bin/false"));
        assert!(!is_locked_out_shell("/bin/bash"));
        assert!(!is_locked_out_shell("/bin/sh"));
    }

    #[test]
    fn nvm_node_bins_lists_only_version_dirs_with_bin() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path();
        let with_bin = home.join(".nvm/versions/node/v20.0.0/bin");
        std::fs::create_dir_all(&with_bin).unwrap();
        std::fs::create_dir_all(home.join(".nvm/versions/node/v18.0.0")).unwrap();
        assert_eq!(
            nvm_node_bins(home),
            vec![with_bin.to_string_lossy().into_owned()]
        );
    }

    #[test]
    fn nvm_node_bins_empty_without_nvm() {
        let dir = tempfile::tempdir().unwrap();
        assert!(nvm_node_bins(dir.path()).is_empty());
    }
}
