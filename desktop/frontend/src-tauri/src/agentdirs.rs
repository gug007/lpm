// Where Claude Code, Codex, Gemini CLI, OpenCode and omp read their
// configuration on this machine.
//
// Each honors an environment variable over its default folder: CLAUDE_CONFIG_DIR
// over ~/.claude, CODEX_HOME over ~/.codex, GEMINI_CLI_HOME over the home folder
// ~/.gemini sits in, XDG_CONFIG_HOME over the ~/.config that holds OpenCode's
// folder, PI_CODING_AGENT_DIR over ~/.omp/agent. lpm's terminals are login
// shells, so the value that counts is the one the login profile exports; the
// app's own environment stands in when the profile exports none. Resolved once
// per run: reading the profile starts a login shell.
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

fn exported(name: &str) -> Option<PathBuf> {
    or_own_env(crate::sys::capture_login_env(name).as_deref(), name)
}

fn or_own_env(profile: Option<&str>, name: &str) -> Option<PathBuf> {
    profile.map(PathBuf::from).or_else(|| {
        std::env::var_os(name)
            .filter(|v| !v.is_empty())
            .map(PathBuf::from)
    })
}

/// What the login profile exports as `CLAUDE_CONFIG_DIR`.
pub(crate) fn profile_claude_config_dir() -> Option<&'static str> {
    static VALUE: OnceLock<Option<String>> = OnceLock::new();
    VALUE
        .get_or_init(|| crate::sys::capture_login_env(crate::config::CLAUDE_CONFIG_DIR_ENV))
        .as_deref()
}

/// `$CODEX_HOME`, else `~/.codex`.
pub fn codex_home() -> Option<&'static Path> {
    static DIR: OnceLock<Option<PathBuf>> = OnceLock::new();
    DIR.get_or_init(|| {
        exported("CODEX_HOME").or_else(|| dirs::home_dir().map(|home| home.join(".codex")))
    })
    .as_deref()
}

/// `$GEMINI_CLI_HOME/.gemini`, else `~/.gemini`.
pub fn gemini_dir() -> Option<&'static Path> {
    static DIR: OnceLock<Option<PathBuf>> = OnceLock::new();
    DIR.get_or_init(|| {
        exported("GEMINI_CLI_HOME")
            .or_else(dirs::home_dir)
            .map(|home| home.join(".gemini"))
    })
    .as_deref()
}

/// `$XDG_CONFIG_HOME/opencode`, else `~/.config/opencode` — on every platform.
pub fn opencode_dir() -> Option<&'static Path> {
    static DIR: OnceLock<Option<PathBuf>> = OnceLock::new();
    DIR.get_or_init(|| {
        exported("XDG_CONFIG_HOME")
            .or_else(|| dirs::home_dir().map(|home| home.join(".config")))
            .map(|config| config.join("opencode"))
    })
    .as_deref()
}

/// `$XDG_DATA_HOME/opencode`, else `~/.local/share/opencode` — on every
/// platform. OpenCode keeps its sessions there.
pub fn opencode_data_dir() -> Option<&'static Path> {
    static DIR: OnceLock<Option<PathBuf>> = OnceLock::new();
    DIR.get_or_init(|| {
        exported("XDG_DATA_HOME")
            .or_else(|| dirs::home_dir().map(|home| home.join(".local").join("share")))
            .map(|data| data.join("opencode"))
    })
    .as_deref()
}

/// `~/.cursor`, where Cursor CLI keeps its hooks and chats.
pub fn cursor_dir() -> Option<&'static Path> {
    static DIR: OnceLock<Option<PathBuf>> = OnceLock::new();
    DIR.get_or_init(|| dirs::home_dir().map(|home| home.join(".cursor")))
        .as_deref()
}

/// `$PI_CODING_AGENT_DIR`, else `~/.omp/agent`.
pub fn omp_dir() -> Option<&'static Path> {
    static DIR: OnceLock<Option<PathBuf>> = OnceLock::new();
    DIR.get_or_init(|| {
        exported("PI_CODING_AGENT_DIR")
            .or_else(|| dirs::home_dir().map(|home| home.join(".omp").join("agent")))
    })
    .as_deref()
}

/// The folder `CLAUDE_CONFIG_DIR` points Claude Code at, when it isn't
/// `~/.claude` — which is where Claude reads settings without it.
pub fn claude_config_dir() -> Option<&'static Path> {
    static DIR: OnceLock<Option<PathBuf>> = OnceLock::new();
    DIR.get_or_init(|| {
        let default = dirs::home_dir().map(|home| home.join(".claude"));
        or_own_env(profile_claude_config_dir(), crate::config::CLAUDE_CONFIG_DIR_ENV)
            .filter(|dir| Some(dir) != default.as_ref())
    })
    .as_deref()
}
