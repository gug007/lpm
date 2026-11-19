//! A service's or action's command for one system, in place of `cmd`:
//! `cmdMacos`, `cmdLinux`, `cmdWindows`, picked as the app picks them.
use serde::Deserialize;

#[derive(Deserialize, Default, Clone, Debug)]
pub struct OsCmds {
    #[serde(rename = "cmdMacos", alias = "cmd_macos", default)]
    pub macos: String,
    #[serde(rename = "cmdLinux", alias = "cmd_linux", default)]
    pub linux: String,
    #[serde(rename = "cmdWindows", alias = "cmd_windows", default)]
    pub windows: String,
}

impl OsCmds {
    /// Puts this computer's command, when the config names one, in `cmd`.
    pub fn pick(&self, cmd: &mut String) {
        let here = if cfg!(target_os = "macos") {
            &self.macos
        } else if cfg!(windows) {
            &self.windows
        } else {
            &self.linux
        };
        if !here.trim().is_empty() {
            *cmd = here.clone();
        }
    }
}

/// The config keys, for the validator.
pub const KEYS: [&str; 6] = [
    "cmdMacos",
    "cmdLinux",
    "cmdWindows",
    "cmd_macos",
    "cmd_linux",
    "cmd_windows",
];
