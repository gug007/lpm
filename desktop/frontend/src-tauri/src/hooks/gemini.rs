// Gemini CLI: lpm's hooks in its settings.json, which it runs through `bash -c`
// (PowerShell on Windows) with the event's JSON on stdin, `session_id` first.
use super::sh::{sid_prep, Frames, Hook};
use super::{install_json_at, install_remote_json, merge_hooks_json, strip_hooks_json_at, Agent, MARKER};
use crate::agentkind::AgentKind;
use crate::hookform::HookForm;
use serde_json::{json, Value};

pub(super) const AGENT: Agent = Agent {
    kind: AgentKind::Gemini,
    install,
    install_remote,
    uninstall,
};

const REMOTE_DIR: &str = "\"${GEMINI_CLI_HOME:-$HOME}/.gemini\"";
const REMOTE_SETTINGS: &str = "\"${GEMINI_CLI_HOME:-$HOME}/.gemini/settings.json\"";

/// The events lpm reports on: a turn starts at BeforeAgent and ends at
/// AfterAgent, which fires for the outermost turn only, so a sub-agent's work
/// never ends it. Notification fires as a tool's confirmation dialog opens; the
/// tool's AfterTool is the first sign the agent is back at work.
pub(super) const GEMINI_EVENTS: [&str; 6] = [
    "BeforeAgent",
    "BeforeTool",
    "AfterTool",
    "Notification",
    "AfterAgent",
    "SessionEnd",
];

fn settings_path() -> Option<std::path::PathBuf> {
    crate::agentdirs::gemini_dir().map(|dir| dir.join("settings.json"))
}

fn install() {
    if let Some(path) = settings_path() {
        let _ = install_json_at(&path, |data| merge_gemini_hooks_in(data, &crate::hookform::local()));
    }
}

fn install_remote(ssh: &dyn crate::remoteshell::RemoteShell) -> bool {
    install_remote_json(ssh, REMOTE_DIR, REMOTE_SETTINGS, merge_gemini_hooks)
}

fn uninstall() -> Result<(), String> {
    settings_path().map_or(Ok(()), |path| strip_hooks_json_at(&path))
}

/// Remote hosts always get the sh form.
pub(super) fn merge_gemini_hooks(data: &[u8]) -> Option<Vec<u8>> {
    merge_gemini_hooks_in(data, &HookForm::Shell)
}

/// Pure: settings.json with lpm's hooks in place of any earlier ones, or None
/// when unchanged. Empty input starts the file; anything that isn't a JSON
/// object (Gemini also reads comments, which serde can't keep) is left alone.
pub(super) fn merge_gemini_hooks_in(data: &[u8], form: &HookForm) -> Option<Vec<u8>> {
    merge_hooks_json(data, &GEMINI_EVENTS, |_| {}, |event| {
        let command = match form {
            HookForm::Shell => gemini_cmd(event),
            HookForm::Cli(cli) => crate::hookform::powershell_command(cli, AGENT.kind.id(), event, MARKER),
        };
        gemini_entry(&command)
    })
}

fn gemini_entry(command: &str) -> Value {
    json!({ "matcher": "", "hooks": [ { "name": "lpm", "type": "command", "command": command } ] })
}

/// Keyed by Gemini's own session id, like Claude's. Gemini reads a hook's stderr
/// as its output when stdout is empty and shows it to the user, so the hook
/// silences it first.
fn gemini_cmd(event: &str) -> String {
    let frames = Frames::of(AGENT.kind);
    let frame = match event {
        "Notification" => frames.waiting(),
        "AfterAgent" => frames.done(),
        "SessionEnd" => frames.clear_live(),
        _ => frames.running(),
    };
    let prep = sid_prep();
    Hook {
        read: "exec 2>/dev/null;",
        prep: &prep,
        frame: &frame,
        ..Default::default()
    }
    .line()
}

#[cfg(test)]
#[path = "gemini_tests.rs"]
mod tests;
