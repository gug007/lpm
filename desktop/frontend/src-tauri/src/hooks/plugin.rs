// Agents that run no hook commands but load scripts from a folder of their own
// (OpenCode, omp): lpm writes its plugin there. The agent's half
// (<agent>_plugin.js) follows its turns; lpm's half (plugin_runner.js) runs the
// hook of each state a turn enters with the session id on stdin — the sh line,
// or `lpm hook <id> <state>` on Windows — so the app gets the frames every other
// agent's hooks send.
use super::sh::{sid_prep, Frames, Hook};
use super::{install_owned_file, install_remote_owned_file, remove_owned_file, MARKER};
use crate::agentkind::AgentKind;
use crate::hookform::HookForm;
use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};

/// The states a plugin reports a session's turn in.
pub(super) const STATES: [&str; 5] = ["running", "waiting", "done", "error", "clear"];

const RUNNER: &str = include_str!("plugin_runner.js");
const HOOKS_SLOT: &str = "__LPM_HOOKS__";

pub(super) struct Plugin {
    pub kind: AgentKind,
    /// The agent's half of the plugin.
    pub source: &'static str,
    /// Where the plugin goes in the agent's folder. Past two parts it sits in a
    /// folder of its own, which uninstalling removes once it's empty.
    pub path: &'static [&'static str],
    /// The agent's folder on an SSH host, as its login shell expands it.
    pub remote_dir: &'static str,
}

impl Plugin {
    pub fn path_in(&self, dir: &Path) -> PathBuf {
        self.path.iter().fold(dir.to_path_buf(), |path, part| path.join(part))
    }

    /// The plugin with each state's hook filled in.
    pub fn render(&self, form: &HookForm) -> String {
        let hooks = STATES
            .iter()
            .map(|state| {
                let hook = match form {
                    HookForm::Shell => json!(["/bin/sh", ["-c", state_cmd(self.kind, state)]]),
                    HookForm::Cli(cli) => json!([cli.to_string_lossy(), ["hook", self.kind.id(), state, MARKER]]),
                };
                (state.to_string(), hook)
            })
            .collect();
        self.with_hooks(hooks)
    }

    pub fn with_hooks(&self, hooks: Map<String, Value>) -> String {
        format!("{}\n{}", self.source, RUNNER.replace(HOOKS_SLOT, &Value::Object(hooks).to_string()))
    }

    /// Written once the agent's folder exists; rewritten only on change.
    pub fn install(&self, dir: Option<&Path>) {
        if let Some(dir) = dir {
            let _ = install_owned_file(dir, &self.path_in(dir), &self.render(&crate::hookform::local()));
        }
    }

    pub fn install_remote(&self, ssh: &dyn crate::remoteshell::RemoteShell) -> bool {
        let (dir, file) = self.remote_paths();
        install_remote_owned_file(ssh, &dir, &file, &self.render(&HookForm::Shell))
    }

    /// The agent's folder and the plugin's path on a host, quoted for its shell.
    fn remote_paths(&self) -> (String, String) {
        (
            format!("\"{}\"", self.remote_dir),
            format!("\"{}/{}\"", self.remote_dir, self.path.join("/")),
        )
    }

    pub fn uninstall(&self, dir: Option<&Path>) -> Result<(), String> {
        let Some(dir) = dir else { return Ok(()) };
        let path = self.path_in(dir);
        remove_owned_file(&path)?;
        if self.path.len() > 2 {
            if let Some(own) = path.parent() {
                let _ = std::fs::remove_dir(own);
            }
        }
        Ok(())
    }
}

/// Keyed by the agent's session id: the top-level session's, which a plugin
/// reports a sub-agent's questions under. Its Waiting is one only the plugin
/// ends — the agent reports every answer, and keys typed into a question with
/// several parts don't all answer it. Delivered before the hook exits, so the
/// app takes a turn's states in the order the plugin runs them: an omp approval
/// follows its turn's start by milliseconds.
fn state_cmd(kind: AgentKind, state: &str) -> String {
    let frames = Frames::of(kind);
    let frame = match state {
        "running" => frames.running(),
        "waiting" => frames.held_waiting(),
        "done" => frames.done(),
        "error" => frames.error(),
        _ => frames.clear_live(),
    };
    let prep = sid_prep();
    Hook {
        prep: &prep,
        frame: &frame,
        waits: true,
        ..Default::default()
    }
    .line()
}

#[cfg(test)]
#[path = "plugin_tests.rs"]
pub(super) mod tests;
