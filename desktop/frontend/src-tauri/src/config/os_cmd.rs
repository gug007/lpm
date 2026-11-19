//! A service's or action's command for one system, in place of `cmd`:
//! `cmdMacos`, `cmdLinux`, `cmdWindows`. The computer lpm runs on picks, so a
//! paired computer or a Linux host runs its own; a system without one runs `cmd`.
use serde::Deserialize;
use serde_json::{Map, Value};

#[derive(Deserialize, Default, Clone, Debug, PartialEq)]
pub struct OsCmds {
    #[serde(rename = "cmdMacos", alias = "cmd_macos", default)]
    pub macos: String,
    #[serde(rename = "cmdLinux", alias = "cmd_linux", default)]
    pub linux: String,
    #[serde(rename = "cmdWindows", alias = "cmd_windows", default)]
    pub windows: String,
}

impl OsCmds {
    /// This computer's command, when the config names one.
    pub fn here(&self) -> Option<&str> {
        let cmd = if cfg!(target_os = "macos") {
            &self.macos
        } else if cfg!(windows) {
            &self.windows
        } else {
            &self.linux
        };
        Some(cmd.as_str()).filter(|c| !c.trim().is_empty())
    }

    /// Puts this computer's command in `cmd`, keeping what was written there
    /// in `written` for the forms that edit it.
    pub fn pick(&self, cmd: &mut String, written: &mut String) {
        if let Some(here) = self.here() {
            *written = std::mem::replace(cmd, here.to_string());
        }
    }

    /// The commands as written, under their config keys, for the forms.
    pub fn write_json(&self, out: &mut Map<String, Value>) {
        for (key, cmd) in [
            ("cmdMacos", &self.macos),
            ("cmdLinux", &self.linux),
            ("cmdWindows", &self.windows),
        ] {
            if !cmd.is_empty() {
                out.insert(key.into(), Value::String(cmd.clone()));
            }
        }
    }
}

/// `cmd` as written, for a form to edit, when this computer runs another one.
pub fn config_cmd(written: &str, cmd: &str) -> String {
    if written.is_empty() || written == cmd {
        String::new()
    } else {
        written.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Deserialize)]
    struct Entry {
        #[serde(default)]
        cmd: String,
        #[serde(flatten)]
        os: OsCmds,
    }

    fn entry(yaml: &str) -> Entry {
        serde_norway::from_str(yaml).unwrap()
    }

    #[test]
    fn reads_each_system_and_its_snake_case_spelling() {
        let e = entry("cmd: pnpm dev\ncmdLinux: pnpm dev --host 0.0.0.0\ncmd_windows: pnpm dev:win\n");
        assert_eq!(e.os.linux, "pnpm dev --host 0.0.0.0");
        assert_eq!(e.os.windows, "pnpm dev:win");
        assert_eq!(e.os.macos, "");
    }

    #[test]
    fn this_computer_runs_its_own_command_and_keeps_the_written_one() {
        let e = entry("cmd: make\ncmdMacos: make mac\ncmdLinux: make linux\ncmdWindows: make win\n");
        let mut cmd = e.cmd.clone();
        let mut written = String::new();
        e.os.pick(&mut cmd, &mut written);
        let expected = if cfg!(target_os = "macos") {
            "make mac"
        } else if cfg!(windows) {
            "make win"
        } else {
            "make linux"
        };
        assert_eq!(cmd, expected);
        assert_eq!(written, "make");
        assert_eq!(config_cmd(&written, &cmd), "make");
    }

    #[test]
    fn a_system_without_its_own_runs_cmd() {
        let e = entry("cmd: make\ncmdMacos: \"  \"\ncmdLinux: \"\"\n");
        let mut cmd = e.cmd.clone();
        let mut written = String::new();
        e.os.pick(&mut cmd, &mut written);
        assert_eq!(cmd, "make");
        assert_eq!(config_cmd(&written, &cmd), "");
    }
}
