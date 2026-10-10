// Where Claude Code and Codex read their configuration on this machine.
//
// Each honors an environment variable over its default folder: CLAUDE_CONFIG_DIR
// over ~/.claude, CODEX_HOME over ~/.codex. lpm's terminals are login shells, so
// the value that counts is the one the login profile exports; the app's own
// environment stands in when the profile exports none. Resolved once per run:
// reading the profile starts a login shell.
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

fn exported(name: &str) -> Option<PathBuf> {
    crate::sys::capture_login_env(name)
        .map(PathBuf::from)
        .or_else(|| {
            std::env::var_os(name)
                .filter(|v| !v.is_empty())
                .map(PathBuf::from)
        })
}

/// `$CODEX_HOME`, else `~/.codex`.
pub fn codex_home() -> Option<&'static Path> {
    static DIR: OnceLock<Option<PathBuf>> = OnceLock::new();
    DIR.get_or_init(|| {
        exported("CODEX_HOME").or_else(|| dirs::home_dir().map(|home| home.join(".codex")))
    })
    .as_deref()
}

/// The folder `CLAUDE_CONFIG_DIR` points Claude Code at, when it isn't
/// `~/.claude` — which is where Claude reads settings without it.
pub fn claude_config_dir() -> Option<&'static Path> {
    static DIR: OnceLock<Option<PathBuf>> = OnceLock::new();
    DIR.get_or_init(|| {
        let default = dirs::home_dir().map(|home| home.join(".claude"));
        exported(crate::config::CLAUDE_CONFIG_DIR_ENV).filter(|dir| Some(dir) != default.as_ref())
    })
    .as_deref()
}
