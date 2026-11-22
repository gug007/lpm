// Codex: lpm's hooks in $CODEX_HOME/hooks.json, with the hooks feature switched
// on and the entries trusted in its config.toml.
use super::sh::{send_cmd, Hook, SID_SED};
use super::{append_hook, strip_hooks_json_at, strip_lpm_hooks, write_remote_file, Agent, MARKER};
use crate::hookform::HookForm;
use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};

pub(super) const AGENT: Agent = Agent {
    kind: crate::agentkind::AgentKind::Codex,
    install: install_codex_hooks,
    install_remote: install_remote_codex_hooks,
    uninstall,
};

fn uninstall() -> Result<(), String> {
    codex_hooks_json_path().map_or(Ok(()), |path| strip_hooks_json_at(&path))
}

fn codex_hooks_json_path() -> Option<PathBuf> {
    crate::agentdirs::codex_home().map(|dir| dir.join("hooks.json"))
}

/// Where Codex keeps its configuration on a host, as its login shell expands it:
/// the folder its profile exports, else the default.
const REMOTE_CODEX_HOME: &str = "\"${CODEX_HOME:-$HOME/.codex}\"";

/// Best-effort: install the Codex status hooks on the REMOTE host — enable the
/// codex_hooks feature in ~/.codex/config.toml and merge the lpm entries into
/// ~/.codex/hooks.json. Gated on the remote ~/.codex dir existing (never
/// created), the same gate the local install applies; within it, config.toml
/// and hooks.json are created when missing, also matching local.
/// Returns whether the host is now installed. A missing remote ~/.codex is not
/// (the dir is never created, but Codex may be installed there later), and
/// neither is an unreachable host or a failed read/write; the caller retries.
fn install_remote_codex_hooks(ssh: &dyn crate::remoteshell::RemoteShell) -> bool {
    let read = |script: &str| {
        ssh.login_script(script)
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| o.stdout)
    };
    let Some(gate) = read(&format!("[ -d {REMOTE_CODEX_HOME} ] && echo yes || true")) else {
        return false;
    };
    if String::from_utf8_lossy(&gate).trim() != "yes" {
        return false; // no remote Codex yet: try again once it may be there
    }
    let hooks_file = format!("{REMOTE_CODEX_HOME}/hooks.json");
    let Some(mut hooks) = read(&format!("cat {hooks_file} 2>/dev/null || true")) else {
        return false;
    };
    if let Some(new) = merge_codex_hooks(&hooks) {
        if !write_remote_file(ssh, &hooks_file, &new) {
            return false;
        }
        hooks = new;
    }
    // Codex keys trust by the hooks file's absolute path on the host.
    let config_file = format!("{REMOTE_CODEX_HOME}/config.toml");
    let (Some(codex_home), Some(config), Some(version)) = (
        read(&format!("printf '%s' {REMOTE_CODEX_HOME}")),
        read(&format!("cat {config_file} 2>/dev/null || true")),
        read("codex --version 2>/dev/null || true"),
    ) else {
        return false;
    };
    // Joined with `/` whatever this machine's separator: the path is the host's.
    let hooks_path = PathBuf::from(format!(
        "{}/hooks.json",
        String::from_utf8_lossy(&codex_home).trim().trim_end_matches('/')
    ));
    let key = crate::codexfeature::key_for(&String::from_utf8_lossy(&version));
    match merge_codex_config(&String::from_utf8_lossy(&config), &hooks_path, &hooks, key) {
        Some(new) => write_remote_file(ssh, &config_file, new.as_bytes()),
        None => true,
    }
}

fn install_codex_hooks() {
    if let Some(dir) = crate::agentdirs::codex_home() {
        install_codex_hooks_at(dir);
    }
}

fn install_codex_hooks_at(codex_dir: &Path) {
    if !codex_dir.exists() {
        return;
    }
    let hooks_path = codex_dir.join("hooks.json");
    let mut hooks = std::fs::read(&hooks_path).unwrap_or_default();
    if let Some(out) = merge_codex_hooks_in(&hooks, &crate::hookform::local()) {
        if crate::fsatomic::write(&hooks_path, &out, crate::fsatomic::Mode::Preserve(0o644)).is_err() {
            return;
        }
        hooks = out;
    }
    let config_path = codex_dir.join("config.toml");
    let content = std::fs::read_to_string(&config_path).unwrap_or_default();
    if let Some(new) = merge_codex_config(&content, &hooks_path, &hooks, crate::codexfeature::local_key()) {
        let _ = crate::fsatomic::write(
            &config_path,
            new.as_bytes(),
            crate::fsatomic::Mode::Preserve(0o644),
        );
    }
}

/// Pure: config.toml with the hooks feature on and lpm's hooks in `hooks` (the
/// content of `hooks_path`) trusted, or None when it is already so. Shared by
/// the local and remote installs.
fn merge_codex_config(content: &str, hooks_path: &Path, hooks: &[u8], key: &str) -> Option<String> {
    let featured = merge_codex_feature(content, key);
    let base = featured.as_deref().unwrap_or(content);
    let trusted = serde_json::from_slice::<Value>(hooks)
        .ok()
        .and_then(|json| crate::codextrust::trust_lpm_hooks(base, hooks_path, &json, MARKER));
    trusted.or(featured)
}

/// Pure: config.toml content with the hooks feature enabled under `key` (see
/// codexfeature.rs), the other name for it removed, or None when already up to
/// date. Edited as TOML, not as lines: a `[features]` header written any other
/// way (a trailing comment, spaced brackets, an inline table) used to get a
/// second `[features]` table appended, which Codex refuses to start with. A
/// config that doesn't parse is never rewritten.
fn merge_codex_feature(content: &str, key: &str) -> Option<String> {
    use crate::codexfeature::{KEY, LEGACY_KEY};
    let other = if key == KEY { LEGACY_KEY } else { KEY };
    let mut doc: toml_edit::DocumentMut = content.parse().ok()?;
    let features = doc
        .entry("features")
        .or_insert_with(|| toml_edit::Item::Table(toml_edit::Table::new()))
        .as_table_like_mut()?;
    let mut changed = features.remove(other).is_some();
    if features.get(key).is_none() {
        features.insert(key, toml_edit::value(true));
        changed = true;
    }
    changed.then(|| doc.to_string())
}

/// Pure: merge the lpm Codex hooks into hooks.json `data` (missing/invalid →
/// built fresh), returning Some(new bytes) when a write is needed and None when
/// unchanged. Shared by the local and remote installs; remote hosts always get
/// the sh form.
pub(super) fn merge_codex_hooks(data: &[u8]) -> Option<Vec<u8>> {
    merge_codex_hooks_in(data, &HookForm::Shell)
}

/// The Codex events lpm reports on. In the CLI form one SessionStart run sends
/// both the status and the resume id the sh form splits across two entries.
pub(super) const CODEX_EVENTS: [&str; 12] = [
    "SessionStart",
    "PreCompact",
    "PostCompact",
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "PermissionRequest",
    "Stop",
    "Interrupt",
    "SessionEnd",
    "SubagentStart",
    "SubagentStop",
];

pub(super) fn merge_codex_hooks_in(data: &[u8], form: &HookForm) -> Option<Vec<u8>> {
    let new_events = match form {
        HookForm::Shell => codex_shell_events(),
        HookForm::Cli(cli) => CODEX_EVENTS
            .iter()
            .map(|event| {
                let cmd = crate::hookform::codex_command(cli, event, MARKER);
                (*event, vec![codex_entry(&cmd)])
            })
            .collect(),
    };

    let original = serde_json::from_slice::<Value>(data).ok();

    let hooks_data = if let Some(mut existing) = original
        .clone()
        .filter(|e| e.get("hooks").map(Value::is_object).unwrap_or(false))
    {
        let eh = existing.get_mut("hooks").unwrap().as_object_mut().unwrap();
        strip_lpm_hooks(eh);
        for (event, entries) in &new_events {
            for entry in entries {
                append_hook(eh, event, entry.clone());
            }
        }
        existing
    } else {
        let mut m = Map::new();
        for (event, entries) in new_events {
            m.insert(event.to_string(), Value::Array(entries));
        }
        json!({ "hooks": Value::Object(m) })
    };

    if original.as_ref() == Some(&hooks_data) {
        return None;
    }
    serde_json::to_string_pretty(&hooks_data)
        .ok()
        .map(String::into_bytes)
}

fn codex_shell_events() -> Vec<(&'static str, Vec<Value>)> {
    // Per-pane key, same reason as the Claude hooks.
    let set_running_frame =
        "set_status '$pq' codex_$LPM_PANE_ID Running --icon=sparkle --color=#10A37F --pane=$LPM_PANE_ID";
    let clear_frame = "clear_status '$pq' codex_$LPM_PANE_ID --live";
    let set_running = codex_status_cmd(set_running_frame);
    let set_done = codex_status_cmd("set_status '$pq' codex_$LPM_PANE_ID Done --icon=checkmark --color=#4ade80 --pane=$LPM_PANE_ID");
    // Interrupt and SessionEnd fire for the root thread only, so they need no
    // gate; like Claude's SessionEnd they keep a finish the user hasn't seen.
    let clear = send_cmd(clear_frame);
    let set_resume = codex_resume_cmd();
    let pre_tool = codex_pre_tool_use_cmd();
    let permission = codex_permission_request_cmd();

    // Each event maps to its ordered list of hook entries. SessionStart carries
    // two: the status ping plus the resume-capture hook that reports Codex's
    // real session id back to the socket (Codex has no --session-id-at-launch).
    // PostToolUse flips Waiting back to Running once a tool (or an answered
    // request_user_input) completes. A PermissionRequest is only announced once
    // no PostToolUse has said the call went ahead without asking (socketsrv.rs).
    vec![
        (
            "SessionStart",
            vec![codex_entry(&set_running), codex_entry(&set_resume)],
        ),
        ("UserPromptSubmit", vec![codex_entry(&set_running)]),
        ("PreToolUse", vec![codex_entry(&pre_tool)]),
        ("PostToolUse", vec![codex_entry(&set_running)]),
        ("PermissionRequest", vec![codex_entry(&permission)]),
        ("Stop", vec![codex_entry(&set_done)]),
        ("Interrupt", vec![codex_entry(&clear)]),
        ("SessionEnd", vec![codex_entry(&clear)]),
        ("PreCompact", vec![codex_entry(&codex_manual_compact_cmd(set_running_frame))]),
        ("PostCompact", vec![codex_entry(&codex_manual_compact_cmd(clear_frame))]),
        ("SubagentStart", vec![codex_entry(&codex_child_cmd("start"))]),
        ("SubagentStop", vec![codex_entry(&codex_child_cmd("stop"))]),
    ]
}

/// Codex runs the tab's UserPromptSubmit/PreToolUse/PostToolUse hooks inside
/// thread-spawned sub-agents (`spawn_agent`) as well, under the same LPM_* env,
/// but a sub-agent's turn ends in `SubagentStop`, never `Stop`. One that outlives
/// the root thread's Stop re-reported Running right after the tab's Done, and
/// nothing ever ended that turn (observed: a tab pinned at Running long after
/// the final answer). Sub-agent payloads carry `agent_id`; the root thread's
/// never do. Codex serializes it ahead of `transcript_path`, so only that
/// structural prefix is inspected — `tool_input`/`prompt` prose can't match.
/// Codex's memory consolidation is a hidden thread of its own, with no
/// `agent_id` and no Stop hook for lpm, working in the memory folder under
/// CODEX_HOME; its reports would flip an idle tab back to Running for good. Its
/// `cwd` gives it away, and comes ahead of any free text too.
/// Reading through `head` drains stdin like `send_cmd`, and the `[ -t 0 ]` guard
/// keeps an interactive run from blocking. Leaves the prefix in `h` for callers
/// that read other leading fields.
fn codex_root_gate() -> &'static str {
    r#"[ -t 0 ] || h=$(head -c 8192; cat >/dev/null 2>&1); case "${h%%transcript_path*}" in *agent_id*) exit 0;; esac; cw=${h#*\"cwd\":\"}; case "${cw%%\"*}" in "${CODEX_HOME:-$HOME/.codex}"/memories*) exit 0;; esac;"#
}

/// `send_cmd` for a Codex status frame: the same recover/stage/deliver chain
/// behind [`codex_root_gate`], so only the tab's root thread speaks for it.
pub(super) fn codex_status_cmd(frame: &str) -> String {
    Hook {
        read: codex_root_gate(),
        frame,
        ..Default::default()
    }
    .line()
}

/// Codex SubagentStart/SubagentStop: which of the root's sub-agents are live, so
/// a root that stops before them keeps the tab Running (agentchildren.rs). The
/// id is the payload's first `agent_id`, ahead of any free text.
fn codex_child_cmd(phase: &str) -> String {
    let frame = format!("agent_child '$pq' codex_$LPM_PANE_ID $c {phase}");
    Hook {
        read: r#"h=$(cat); c=${h#*\"agent_id\":\"}; c=${c%%\"*}; case "$c" in ''|*[!A-Za-z0-9-]*) c=;; esac;"#,
        frame: &frame,
        only_if: r#"[ -n "$c" ]"#,
        ..Default::default()
    }
    .line()
}

/// `codex_status_cmd` for a `/compact` the user ran: model work no prompt
/// started. Compaction Codex runs inside a turn (trigger "auto") is the turn's
/// own business, and its reports already cover it.
fn codex_manual_compact_cmd(frame: &str) -> String {
    let gate = codex_root_gate();
    let read = format!(r#"{gate} case "$h" in *\"trigger\":\"manual\"*) ;; *) exit 0;; esac;"#);
    Hook {
        read: &read,
        frame,
        ..Default::default()
    }
    .line()
}

/// Codex hook entry: {hooks: [{type: command, command}]}.
fn codex_entry(cmd: &str) -> Value {
    json!({ "hooks": [ { "type": "command", "command": cmd } ] })
}

/// `capture_resume_cmd` behind [`codex_root_gate`]: a thread other than the
/// tab's root must not become what the tab resumes.
pub(super) fn codex_resume_cmd() -> String {
    let prep = format!(r#"sid=$(printf '%s' "$h" | {SID_SED} | head -n1);"#);
    Hook {
        read: codex_root_gate(),
        prep: &prep,
        frame: "set_resume '$pq' $LPM_PANE_ID $sid --provider=codex",
        and_if: r#"[ -n "$sid" ]"#,
        ..Default::default()
    }
    .line()
}

/// Codex PermissionRequest hook: flip the badge to Waiting only when the request
/// will actually block on the user. With `approvals_reviewer = "auto_review"` and
/// an on-request/granular approval policy, Codex routes every approval to the
/// automatic reviewer, which approves or denies without ever prompting the user —
/// a Waiting status (and the phone push behind it) would be a false alarm. The
/// payload's `transcript_path` is the session rollout; its last `turn_context`
/// line records the live policy + reviewer, so the gate reads per-session truth
/// and runs on the host that owns the rollout (covering SSH projects). Any read
/// failure leaves `auto` empty and falls back to sending Waiting. The
/// `,"cwd"` anchor pins the real field: `tool_input` can embed arbitrary text.
/// Abstains from the allow/deny decision (no stdout), so user-routed approvals
/// still reach the user.
///
/// The rollout is searched in widening tail windows rather than a fixed one: a
/// turn that dumps large tool output pushes its `turn_context` arbitrarily far
/// from the write head (multi-MB gaps are routine, 17MB observed), and a window
/// that misses it fails open into exactly the false Waiting this gate exists to
/// prevent. The common case still stops at the first (cheap) window.
pub(super) fn codex_permission_request_cmd() -> String {
    Hook {
        prep: r#"tp=$(sed -n 's/.*"transcript_path"[[:space:]]*:[[:space:]]*"\([^"]*\)"[[:space:]]*,[[:space:]]*"cwd".*/\1/p' | head -n1); auto=""; if [ -f "$tp" ]; then tc=""; for n in 1048576 16777216 0; do if [ "$n" = 0 ]; then tc=$(grep -a '"type":"turn_context"' "$tp" 2>/dev/null | tail -n 1); else tc=$(tail -c "$n" "$tp" 2>/dev/null | grep -a '"type":"turn_context"' | tail -n 1); fi; [ -n "$tc" ] && break; done; auto=$(printf '%s\n' "$tc" | grep -E '"approval_policy":("on-request"|\{"granular")' | grep -F '"approvals_reviewer":"auto_review"'); fi;"#,
        frame: "set_status '$pq' codex_$LPM_PANE_ID Waiting --icon=bell --color=#f59e0b --approval --pane=$LPM_PANE_ID",
        only_if: r#"[ -z "$auto" ]"#,
        ..Default::default()
    }
    .line()
}

/// Codex PreToolUse hook: most tools mean the agent is working (Running), but
/// `request_user_input` blocks the turn on the user's answer — the one prompt
/// that still needs attention when the automatic reviewer handles approvals — so
/// it flips the badge to Waiting instead. The `tool_name` extraction anchors on
/// the preceding `permission_mode` field because `tool_input` carries arbitrary
/// text (file contents, prompts) that could embed a bare `"tool_name"` key.
/// Runs behind [`codex_root_gate`], reading the name from the prefix it kept
/// (cut ahead of `tool_input`), so a sub-agent's tools never speak for the tab.
pub(super) fn codex_pre_tool_use_cmd() -> String {
    Hook {
        read: codex_root_gate(),
        prep: r#"tn=$(printf '%s' "${h%%tool_input*}" | sed -n 's/.*"permission_mode"[[:space:]]*:[[:space:]]*"[^"]*"[[:space:]]*,[[:space:]]*"tool_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1); st="Running --icon=sparkle --color=#10A37F --step"; [ "$tn" = "request_user_input" ] && st="Waiting --icon=bell --color=#f59e0b";"#,
        frame: "set_status '$pq' codex_$LPM_PANE_ID $st --pane=$LPM_PANE_ID",
        ..Default::default()
    }
    .line()
}

#[cfg(test)]
#[path = "codex_tests.rs"]
mod tests;
