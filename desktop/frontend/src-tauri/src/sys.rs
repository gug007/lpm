// System/PATH helpers. Mirrors internal/tmux's init(): a Finder-launched .app
// gets a minimal PATH without Homebrew or user-local bins, so subprocess lookups
// (tmux, ssh, git, gh, the AI CLIs, …) fail unless we prepend the usual
// locations. Run once at startup.
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::OnceLock;
use std::time::Duration;

/// Raw login-shell PATH captured once at startup, in the user's shell-resolution
/// order. Stashed so shadow detection can reason about the same PATH the user's
/// shell would use, not the (reordered, augmented) process PATH.
static LOGIN_PATH: OnceLock<String> = OnceLock::new();

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
    const START: &str = "__LPM_PATH_START__";
    const END: &str = "__LPM_PATH_END__";
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let mut child = Command::new(&shell)
        .arg("-ilc")
        .arg(format!("printf '{START}%s{END}' \"$PATH\""))
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
    let path = &text[start..end];
    if path.is_empty() {
        None
    } else {
        Some(path.to_string())
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
