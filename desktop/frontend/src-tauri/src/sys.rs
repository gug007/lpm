// System/PATH helpers. Mirrors internal/tmux's init(): a Finder-launched .app
// gets a minimal PATH without Homebrew, so subprocess lookups (tmux, ssh, git,
// gh, …) fail unless we prepend the usual locations. Run once at startup.
use std::path::Path;

const EXTRA_PATHS: [&str; 2] = ["/opt/homebrew/bin", "/usr/local/bin"];

pub fn ensure_path() {
    let current = std::env::var("PATH").unwrap_or_default();
    let mut prefix = String::new();
    for dir in EXTRA_PATHS {
        if !current.split(':').any(|p| p == dir) {
            prefix.push_str(dir);
            prefix.push(':');
        }
    }
    if !prefix.is_empty() {
        std::env::set_var("PATH", format!("{prefix}{current}"));
    }
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
