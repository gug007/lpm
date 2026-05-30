// System/PATH helpers. Mirrors internal/tmux's init(): a Finder-launched .app
// gets a minimal PATH without Homebrew or user-local bins, so subprocess lookups
// (tmux, ssh, git, gh, the AI CLIs, …) fail unless we prepend the usual
// locations. Run once at startup.
use std::path::Path;

const EXTRA_PATHS: [&str; 2] = ["/opt/homebrew/bin", "/usr/local/bin"];

// Home-relative bin dirs a Finder-launched app never sees on PATH: claude's
// native installer drops into ~/.local/bin; cargo/bun/npm-global are similar.
const HOME_BIN_DIRS: [&str; 4] = [".local/bin", ".cargo/bin", ".bun/bin", ".npm-global/bin"];

pub fn ensure_path() {
    let current = std::env::var("PATH").unwrap_or_default();
    let home_bins: Vec<String> = std::env::var_os("HOME")
        .map(|home| {
            HOME_BIN_DIRS
                .iter()
                .map(|d| Path::new(&home).join(d).to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default();

    let mut prefix = String::new();
    let extras = EXTRA_PATHS.iter().copied().map(String::from).chain(home_bins);
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

/// True if `bin` resolves to a file on PATH (LookPath-style presence check).
pub fn which(bin: &str) -> bool {
    let Ok(path) = std::env::var("PATH") else {
        return false;
    };
    path.split(':')
        .filter(|d| !d.is_empty())
        .any(|dir| Path::new(dir).join(bin).is_file())
}
