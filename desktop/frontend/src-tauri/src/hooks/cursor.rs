// Cursor CLI (cursor-agent): lpm's hooks in ~/.cursor/hooks.json.
//
// Cursor hands a hook its payload as a heredoc appended to the command
// (`<command> <<'CURSOR_HOOK_EOF'`), which binds to the command's last simple
// command — and a trailing comment would swallow it, leaving the payload's line
// to run as shell. So each hook is one `sh -c '…'` whose stdin is the payload,
// with the marker inside the quoted script. Only observational events are
// used: Cursor reads empty output from a permission hook as no opinion, but lpm
// has no business near those decisions. Its CLI asks for approvals without
// firing any hook, so a Cursor tab never shows Waiting.
use super::sh::{send_cmd, Frames, Hook};
use super::{install_json_at, install_remote_json, merge_hooks_json, strip_hooks_json_at, Agent, MARKER};
use crate::agentkind::AgentKind;
use crate::hookform::HookForm;
use serde_json::{json, Map, Value};

pub(super) const AGENT: Agent = Agent {
    kind: AgentKind::Cursor,
    install,
    install_remote,
    uninstall,
};

const REMOTE_DIR: &str = "\"$HOME/.cursor\"";
const REMOTE_HOOKS: &str = "\"$HOME/.cursor/hooks.json\"";

/// The events lpm reports on. Cursor fires `stop` only when a hooks.json of its
/// own asks for it — Claude's imported hooks don't count.
pub(super) const CURSOR_EVENTS: [&str; 5] = [
    "beforeSubmitPrompt",
    "postToolUse",
    "postToolUseFailure",
    "stop",
    "sessionEnd",
];

fn hooks_path() -> Option<std::path::PathBuf> {
    crate::agentdirs::cursor_dir().map(|dir| dir.join("hooks.json"))
}

fn install() {
    if let Some(path) = hooks_path() {
        let _ = install_json_at(&path, |data| merge_cursor_hooks_in(data, &crate::hookform::local()));
    }
}

fn install_remote(ssh: &dyn crate::remoteshell::RemoteShell) -> bool {
    install_remote_json(ssh, REMOTE_DIR, REMOTE_HOOKS, merge_cursor_hooks)
}

fn uninstall() -> Result<(), String> {
    hooks_path().map_or(Ok(()), |path| strip_hooks_json_at(&path))
}

/// Remote hosts always get the sh form.
pub(super) fn merge_cursor_hooks(data: &[u8]) -> Option<Vec<u8>> {
    merge_cursor_hooks_in(data, &HookForm::Shell)
}

/// Pure: hooks.json with lpm's hooks in place of any earlier ones, or None when
/// unchanged. Empty input starts the file; anything that isn't a JSON object
/// (Cursor also reads comments, which serde can't keep) is left alone.
pub(super) fn merge_cursor_hooks_in(data: &[u8], form: &HookForm) -> Option<Vec<u8>> {
    let version = |config: &mut Map<String, Value>| {
        config.entry("version").or_insert(json!(1));
    };
    merge_hooks_json(data, &CURSOR_EVENTS, version, |event| {
        let command = match form {
            HookForm::Shell => sh_c(&cursor_cmd(event)),
            HookForm::Cli(cli) => crate::hookform::powershell_command(cli, AGENT.kind.id(), event, MARKER),
        };
        json!({ "command": command })
    })
}

/// `script` as one `sh -c` command, single-quoted for whichever shell Cursor
/// runs it in.
fn sh_c(script: &str) -> String {
    format!("sh -c '{}'", script.replace('\'', r"'\''"))
}

/// Keyed by the pane, like Codex's: the payload leads with its conversation
/// id, but a pane runs one conversation at a time and every event names it.
/// `stop` says how the turn ended: done, failed, or interrupted — which takes
/// back the Running it left.
fn cursor_cmd(event: &str) -> String {
    let frames = Frames::of(AGENT.kind);
    match event {
        "stop" => {
            let prep = format!(
                r#"f="{}"; case "$p" in *\"status\":\"error\"*) f="{}";; *\"status\":\"aborted\"*) f="{}";; esac;"#,
                frames.done(),
                frames.error(),
                frames.clear_live()
            );
            Hook {
                read: "[ -t 0 ] || p=$(cat);",
                prep: &prep,
                frame: "$f",
                ..Default::default()
            }
            .line()
        }
        "sessionEnd" => send_cmd(&frames.clear_live()),
        _ => send_cmd(&frames.running()),
    }
}

#[cfg(test)]
#[path = "cursor_tests.rs"]
mod tests;
