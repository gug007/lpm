// Claude Code: lpm's hooks in its settings.json — ~/.claude's, the config dir
// the login profile exports, and each lpm account's own copy — plus the check
// Settings shows for them.
use super::sh::{sid_prep, Hook, SID_SED};
use super::{
    append_hook, changed_json, has_marker, strip_hooks_json_at, strip_lpm_hooks, write_remote_file,
    Agent, MARKER,
};
use crate::hookform::HookForm;
use serde::Serialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

/// Cursor runs the hooks in Claude's settings as its own ("third-party hooks",
/// on by default), with a payload of its own shape appended to the command as a
/// heredoc. The marker comment ending each command swallowed the heredoc, so the
/// payload's line then ran as shell code: backticks or `$(…)` in a prompt or a
/// tool's output executed. Cursor sets CURSOR_VERSION for every hook it runs and
/// lpm's own Cursor hooks (cursor.rs) report for its sessions, so these step
/// aside there — exiting before the shell reaches that line.
const NOT_UNDER_CURSOR: &str = r#"[ -n "$CURSOR_VERSION" ] && exit 0;"#;

pub(super) const AGENT: Agent = Agent {
    kind: crate::agentkind::AgentKind::Claude,
    install,
    install_remote: install_remote_claude_hooks,
    uninstall,
};

fn install() {
    let _ = install_claude_hooks_at(&claude_settings_path()); // best-effort at startup
    if let Some(dir) = crate::agentdirs::claude_config_dir() {
        let _ = install_claude_hooks_at(&dir.join("settings.json"));
    }
    for path in account_settings_copies() {
        let _ = install_claude_hooks_at(&path);
    }
}

fn uninstall() -> Result<(), String> {
    let settings = strip_hooks_json_at(&claude_settings_path());
    for path in account_settings_copies().into_iter().chain(profile_settings()) {
        let _ = strip_hooks_json_at(&path);
    }
    settings
}

fn home() -> PathBuf {
    dirs::home_dir().unwrap_or_default()
}

pub(crate) fn claude_settings_path() -> PathBuf {
    home().join(".claude").join("settings.json")
}

/// The settings Claude reads in lpm's terminals: CLAUDE_CONFIG_DIR's when the
/// login profile points it elsewhere, else ~/.claude's.
fn claude_terminal_settings_path() -> PathBuf {
    crate::agentdirs::claude_config_dir()
        .map(|dir| dir.join("settings.json"))
        .unwrap_or_else(claude_settings_path)
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeHooksStatus {
    pub settings_exists: bool,
    pub hooks_installed: bool,
    /// Claude's own settings switch hooks off, installed or not.
    pub hooks_disabled: bool,
    /// The program the hooks run is gone (hookform.rs), so they report nothing.
    pub helper_missing: bool,
}

#[tauri::command(async)]
pub fn check_claude_hooks() -> ClaudeHooksStatus {
    ClaudeHooksStatus {
        helper_missing: crate::hookform::helper_missing(),
        ..claude_hooks_status_at(&claude_terminal_settings_path())
    }
}

#[tauri::command(async)]
pub fn reset_claude_hooks() -> Result<(), String> {
    reset_claude_hooks_at(&claude_terminal_settings_path())
}

pub(super) fn claude_hooks_status_at(path: &Path) -> ClaudeHooksStatus {
    let Ok(data) = std::fs::read(path) else {
        return ClaudeHooksStatus::default();
    };
    let Ok(settings) = serde_json::from_slice::<Value>(&data) else {
        return ClaudeHooksStatus {
            settings_exists: true,
            ..Default::default()
        };
    };
    let hooks_installed = settings
        .get("hooks")
        .filter(|h| h.is_object())
        .map(has_marker)
        .unwrap_or(false);
    ClaudeHooksStatus {
        settings_exists: true,
        hooks_installed,
        hooks_disabled: claude_hooks_disabled(&settings, claude_managed_settings().as_ref()),
        ..Default::default()
    }
}

/// Whether Claude runs no hooks of the user's at all: `disableAllHooks` in the
/// user's or the machine's managed settings, or managed settings that allow only
/// their own hooks. lpm's hooks are then in place but never run.
fn claude_hooks_disabled(user: &Value, managed: Option<&Value>) -> bool {
    let on = |v: &Value, key: &str| v.get(key).and_then(Value::as_bool) == Some(true);
    on(user, "disableAllHooks")
        || managed.is_some_and(|m| on(m, "disableAllHooks") || on(m, "allowManagedHooksOnly"))
}

/// The machine's managed Claude settings file, where Claude looks for it.
fn claude_managed_settings() -> Option<Value> {
    let dir = if cfg!(target_os = "macos") {
        "/Library/Application Support/ClaudeCode"
    } else if cfg!(windows) {
        r"C:\Program Files\ClaudeCode"
    } else {
        "/etc/claude-code"
    };
    let data = std::fs::read(Path::new(dir).join("managed-settings.json")).ok()?;
    serde_json::from_slice(&data).ok()
}

fn reset_claude_hooks_at(path: &Path) -> Result<(), String> {
    // Validate for a real UI error, then reinstall (which strips+re-adds lpm hooks,
    // keeping the user's own — unlike removing the whole `hooks` key). A missing
    // file is started by the install, as long as Claude's folder exists.
    match std::fs::read(path) {
        Ok(data) => {
            serde_json::from_slice::<Value>(&data)
                .map_err(|e| format!("invalid JSON in Claude settings: {e}"))?;
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound && path.parent().is_some_and(Path::is_dir) => {}
        Err(e) => return Err(format!("cannot read Claude settings: {e}")),
    }
    install_claude_hooks_at(path)
}

/// Settings files of lpm's Claude accounts that are their own copies rather than
/// links to ~/.claude/settings.json, so each needs the hooks written into it.
/// Windows makes copies (a file symlink needs Developer Mode); anywhere else an
/// account can end up with one too, when the link is replaced by a real file.
pub(crate) fn account_settings_copies() -> Vec<PathBuf> {
    std::fs::read_dir(crate::config::lpm_dir().join("claude-accounts"))
        .into_iter()
        .flatten()
        .flatten()
        .map(|entry| entry.path().join("settings.json"))
        .filter(|path| std::fs::symlink_metadata(path).is_ok_and(|meta| meta.is_file()))
        .collect()
}

/// The settings CLAUDE_CONFIG_DIR points Claude at, when that isn't ~/.claude.
pub(crate) fn profile_settings() -> Option<PathBuf> {
    crate::agentdirs::claude_config_dir().map(|dir| dir.join("settings.json"))
}

/// Merge the lpm Claude hooks into settings JSON `data`, returning Some(new
/// bytes) when a change is needed and None when unchanged or the input is not a
/// JSON object (invalid JSON is never rewritten). Pure — the transport (local fs
/// vs remote ssh) is the caller's job, so both share this exact merge/strip logic.
/// Remote hosts always get the sh form.
pub(super) fn merge_claude_hooks(data: &[u8]) -> Option<Vec<u8>> {
    merge_claude_hooks_in(data, &HookForm::Shell)
}

/// The Claude events lpm reports on, each with the matcher it is installed under.
const CLAUDE_EVENTS: [(&str, &str); 16] = [
    ("SessionStart", ""),
    ("PreCompact", "manual"),
    ("PostCompact", "manual"),
    ("UserPromptSubmit", ""),
    ("PreToolUse", ""),
    ("PostToolUse", ""),
    ("PostToolUseFailure", ""),
    ("PermissionRequest", ""),
    ("Elicitation", ""),
    ("ElicitationResult", ""),
    ("Notification", CLAUDE_ASKS),
    ("Stop", ""),
    ("StopFailure", ""),
    ("SubagentStart", ""),
    ("SubagentStop", ""),
    ("SessionEnd", ""),
];

/// The notifications that mean a dialog is waiting on the user. `idle_prompt`
/// only says a finished session is still open, and `auth_success` asks nothing.
const CLAUDE_ASKS: &str =
    "permission_prompt|elicitation_dialog|agent_needs_input|worker_permission_prompt";

pub(super) fn merge_claude_hooks_in(data: &[u8], form: &HookForm) -> Option<Vec<u8>> {
    let mut settings = serde_json::from_slice::<Value>(data).ok()?;
    let original = settings.clone();
    let obj = settings.as_object_mut()?;
    if !obj.get("hooks").map(Value::is_object).unwrap_or(false) {
        obj.insert("hooks".into(), json!({}));
    }
    let hooks = obj.get_mut("hooks").unwrap().as_object_mut().unwrap();
    // Strip prior lpm hooks first so re-runs stay idempotent and migrate old keys;
    // the user's own hooks are kept.
    strip_lpm_hooks(hooks);
    if let HookForm::Cli(cli) = form {
        for (event, matcher) in CLAUDE_EVENTS {
            append_hook(
                hooks,
                event,
                crate::hookform::claude_entry(cli, event, matcher, MARKER),
            );
        }
        return changed_json(&settings, &original);
    }

    // Key by claude's own session id (falling back to the pane id if a payload ever
    // lacks one): a per-pane key breaks when the resolved pane id shifts mid-session
    // (orphaning a Running under the old key) or when two claude sessions share a
    // tab (they would clobber one key); a per-session key survives both. `--pane`
    // still carries the resolved tab attribution. Keys must not collide in the
    // StatusStore (keyed by project+key), or only one would show as running.
    // A tool call draws nothing of its own while it runs (agentturn.rs).
    let set_tool = claude_main_thread_cmd("set_status '$pq' claude_code_${sid:-$LPM_PANE_ID} Running --icon=bolt --color=#4C8DFF --pane=$LPM_PANE_ID --tool");
    let set_error = claude_main_thread_cmd("set_status '$pq' claude_code_${sid:-$LPM_PANE_ID} Error --icon=warning --color=#ef4444 --pane=$LPM_PANE_ID");
    // Only the 6 s reminder of a dialog: it can't say whose dialog it is.
    let set_waiting = claude_sid_cmd("set_status '$pq' claude_code_${sid:-$LPM_PANE_ID} Waiting --icon=bell --color=#f59e0b --pane=$LPM_PANE_ID");
    // An ended session takes back only what was happening in it; a finish it
    // reported stays until the user has seen it.
    let clear = claude_sid_cmd("clear_status '$pq' claude_code_${sid:-$LPM_PANE_ID} --live");
    let set_resume = claude_resume_cmd();

    append_hook(hooks, "SessionStart", claude_hook(&set_resume, ""));
    append_hook(hooks, "UserPromptSubmit", claude_hook(&claude_prompt_cmd(), ""));
    append_hook(hooks, "PreToolUse", claude_hook(&set_tool, ""));
    // Answering a dialog fires no hook of its own; a tool that ran or failed
    // after it is the first sign the agent is back at work (agentturn.rs covers
    // the answer itself). A sub-agent's says so for its own question only.
    append_hook(hooks, "PostToolUse", claude_hook(&claude_work_cmd(), ""));
    append_hook(hooks, "PostToolUseFailure", claude_hook(&claude_work_cmd(), ""));
    // PermissionRequest fires as the dialog opens; the permission_prompt
    // Notification only after it has sat unanswered for 6 s.
    append_hook(hooks, "PermissionRequest", claude_hook(&claude_ask_cmd(false), ""));
    // An MCP dialog's spinner keeps animating while it waits, so only its own
    // ElicitationResult may end this Waiting (agentturn.rs).
    append_hook(hooks, "Elicitation", claude_hook(&claude_ask_cmd(true), ""));
    append_hook(hooks, "ElicitationResult", claude_hook(&claude_work_cmd(), ""));
    append_hook(hooks, "Notification", claude_hook(&set_waiting, CLAUDE_ASKS));
    // A /compact is model work started without a prompt; compaction inside a
    // turn (matcher "auto") is already covered by the turn's own reports. Its
    // end takes back only the Running it started itself.
    let set_compacting = claude_main_thread_cmd("set_status '$pq' claude_code_${sid:-$LPM_PANE_ID} Running --icon=bolt --color=#4C8DFF --pane=$LPM_PANE_ID --compact");
    let clear_compacted = claude_sid_cmd("clear_status '$pq' claude_code_${sid:-$LPM_PANE_ID} --live --compact");
    append_hook(hooks, "PreCompact", claude_hook(&set_compacting, "manual"));
    append_hook(hooks, "PostCompact", claude_hook(&clear_compacted, "manual"));
    append_hook(hooks, "Stop", claude_hook(&claude_stop_cmd(), ""));
    append_hook(hooks, "StopFailure", claude_hook(&set_error, ""));
    append_hook(hooks, "SubagentStart", claude_hook(&claude_child_cmd("start"), ""));
    append_hook(hooks, "SubagentStop", claude_hook(&claude_child_cmd("stop"), ""));
    append_hook(hooks, "SessionEnd", claude_hook(&clear, ""));

    changed_json(&settings, &original)
}

pub(super) fn install_claude_hooks_at(path: &Path) -> Result<(), String> {
    let data = match std::fs::read(path) {
        Ok(data) => data,
        // Claude is installed (its folder exists) but has never written its
        // settings: start them, or every session runs without lpm's hooks.
        // Without the folder Claude isn't here, and nothing is created.
        Err(e)
            if e.kind() == std::io::ErrorKind::NotFound
                && path.parent().is_some_and(Path::is_dir) =>
        {
            b"{}".to_vec()
        }
        Err(_) => return Ok(()),
    };
    // Write only on change; errors propagate so the Reset button can surface them.
    if let Some(out) = merge_claude_hooks_in(&data, &crate::hookform::local()) {
        crate::fsatomic::write(path, &out, crate::fsatomic::Mode::Preserve(0o644))
            .map_err(|e| format!("cannot write Claude settings: {e}"))?;
    }
    Ok(())
}

/// Where Claude reads its settings on a host, as its login shell expands it: the
/// folder its profile exports, else the default.
const REMOTE_CLAUDE_SETTINGS: &str = "\"${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json\"";

/// Best-effort: install the Claude status hooks into the REMOTE
/// Claude settings over ssh, so agents on the host report status. A
/// reachable host with a missing/empty file is treated as `{}` and the file is
/// created (fresh servers had no hooks otherwise); an unreachable host, an
/// unreadable or unparseable existing file, or a failed write is a failure the
/// caller retries — never overwrite content that couldn't be read and merged.
/// Returns whether the host is now installed (wrote successfully, or was
/// already up to date).
fn install_remote_claude_hooks(ssh: &dyn crate::remoteshell::RemoteShell) -> bool {
    // `cat` failing on an EXISTING file (perms) must fail the script, so it is
    // distinguishable from "missing" — only a missing file may become `{}`.
    let script = format!(
        "if [ -e {REMOTE_CLAUDE_SETTINGS} ]; then cat {REMOTE_CLAUDE_SETTINGS}; else printf %s '{{}}'; fi"
    );
    let read = ssh.login_script(&script).output();
    let Ok(out) = read else { return false };
    if !out.status.success() {
        return false;
    }
    let data: Vec<u8> = if out.stdout.is_empty() {
        b"{}".to_vec()
    } else {
        out.stdout
    };
    if serde_json::from_slice::<Value>(&data).is_err() {
        return false; // corrupt settings — merge would misreport it as up to date
    }
    match merge_claude_hooks(&data) {
        Some(merged) => write_remote_file(ssh, REMOTE_CLAUDE_SETTINGS, &merged),
        None => true, // already up to date
    }
}

/// A report keyed by the session (`sid_prep`), stepping aside under Cursor.
fn claude_sid_cmd(frame: &str) -> String {
    let prep = sid_prep();
    Hook {
        read: NOT_UNDER_CURSOR,
        prep: &prep,
        frame,
        ..Default::default()
    }
    .line()
}

/// SessionStart resume hook: read the session id from the payload and report it
/// to the socket so the tab can track and later resume this exact session.
/// stdin is consumed synchronously by `sed` first, then the message is staged in
/// `m`, so the backgrounded delivery (and its nc/python3/perl fallbacks) never
/// re-read the already-drained stdin.
pub(super) fn claude_resume_cmd() -> String {
    let prep = sid_prep();
    Hook {
        read: NOT_UNDER_CURSOR,
        prep: &prep,
        frame: "set_resume '$pq' $LPM_PANE_ID $sid --provider=claude",
        and_if: r#"[ -n "$sid" ]"#,
        ..Default::default()
    }
    .line()
}

/// `claude_sid_cmd` for a report only the session's main thread may make. A
/// sub-agent's hooks run under the parent's session id and carry `agent_id`,
/// which Claude serializes ahead of `hook_event_name`, so only that prefix is
/// read and tool input can't fake it. Ungated, a background sub-agent's tool
/// call turned the main thread's open question back into Running, and a
/// sub-agent's failed API call showed the whole tab as a Problem. A sub-agent's
/// own question still reaches the user: the Waiting reports stay ungated.
fn claude_main_thread_cmd(frame: &str) -> String {
    let prep = format!(
        "p=$(cat); case \"${{p%%hook_event_name*}}\" in *\\\"agent_id\\\"*) exit 0;; esac; sid=$(printf '%s' \"$p\" | {SID_SED});"
    );
    Hook {
        read: NOT_UNDER_CURSOR,
        prep: &prep,
        frame,
        ..Default::default()
    }
    .line()
}

/// Reads the payload into `$p` and the id of the sub-agent whose hook this is
/// into `$a`, empty for the main thread. The id serializes ahead of
/// `hook_event_name`, so only that prefix is read and tool input can't fake
/// it; one that isn't a plain token ends the hook.
const SUB_AGENT_PREP: &str = r#"p=$(cat); q=${p%%hook_event_name*}; a=; case "$q" in *\"agent_id\"*) a=$(printf '%s' "$q" | sed -n 's/.*"agent_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'); case "$a" in ''|*[!A-Za-z0-9_.-]*) exit 0;; esac;; esac;"#;

/// A hook reading `SUB_AGENT_PREP` and the session id, then `more`.
fn claude_sub_agent_cmd(more: &str, frame: &str) -> String {
    let prep = format!("{SUB_AGENT_PREP} sid=$(printf '%s' \"$p\" | {SID_SED}); {more}");
    Hook {
        read: NOT_UNDER_CURSOR,
        prep: &prep,
        frame,
        ..Default::default()
    }
    .line()
}

/// The main thread at work, or a sub-agent carrying on — which says nothing
/// about the session, except that a question that sub-agent asked has been
/// answered (statusask.rs).
fn claude_work_cmd() -> String {
    claude_sub_agent_cmd(
        r#"x=; [ -n "$a" ] && x=" --answered=$a";"#,
        "set_status '$pq' claude_code_${sid:-$LPM_PANE_ID} Running --icon=bolt --color=#4C8DFF --pane=$LPM_PANE_ID$x",
    )
}

/// A dialog opening, with who asked: `main` or the sub-agent, so that the main
/// thread's own reports don't take a sub-agent's question off the tab. A
/// question form (AskUserQuestion, a plan to approve) takes several answers;
/// `tool_name` serializes right after `hook_event_name`, ahead of the input.
/// `held` marks an MCP dialog, which only its ElicitationResult ends.
fn claude_ask_cmd(held: bool) -> String {
    let hold = if held { " --hold" } else { "" };
    let frame = format!("set_status '$pq' claude_code_${{sid:-$LPM_PANE_ID}} Waiting --icon=bell --color=#f59e0b --pane=$LPM_PANE_ID{hold}$x");
    claude_sub_agent_cmd(
        r#"x=" --asker=${a:-main}"; r=${p#*hook_event_name}; r=${r%%\"tool_input\"*}; printf '%s' "$r" | grep -Eq '"tool_name"[[:space:]]*:[[:space:]]*"(AskUserQuestion|ExitPlanMode)"' && x="$x --form";"#,
        &frame,
    )
}

/// A sub-agent or teammate starting or ending a stint of work: the session's
/// finish waits for the last of them (agentchildren.rs). Claude's own side
/// agents (a title, a summary) report no type and are left out.
fn claude_child_cmd(phase: &str) -> String {
    let frame = format!("agent_child '$pq' claude_code_${{sid:-$LPM_PANE_ID}} $a {phase} --pane=$LPM_PANE_ID");
    claude_sub_agent_cmd(
        r#"t=$(printf '%s' "$q" | sed -n 's/.*"agent_type"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'); [ -n "$a" ] && [ -n "$t" ] || exit 0;"#,
        &frame,
    )
}

/// UserPromptSubmit, marked as a prompt: one submitted while a turn is still
/// going queues behind it (socketsrv.rs), and its own turn starts without a
/// hook. A prompt the harness writes itself — a background task reporting in,
/// a teammate's message — wakes the session rather than coming from the user.
fn claude_prompt_cmd() -> String {
    let prep = format!(
        "p=$(cat); case \"${{p%%hook_event_name*}}\" in *\\\"agent_id\\\"*) exit 0;; esac; sid=$(printf '%s' \"$p\" | {SID_SED}); w=; printf '%s' \"$p\" | grep -Eq '\"prompt\"[[:space:]]*:[[:space:]]*\"<(task-notification|agent-message|teammate-message)' && w=' --wake';"
    );
    Hook {
        read: NOT_UNDER_CURSOR,
        prep: &prep,
        frame: "set_status '$pq' claude_code_${sid:-$LPM_PANE_ID} Running --icon=bolt --color=#4C8DFF --pane=$LPM_PANE_ID --prompt$w",
        ..Default::default()
    }
    .line()
}

/// Claude Stop hook: `Stop` fires at every TURN boundary, not at the end of the
/// work — a turn that hands off to a workflow, a backgrounded shell command or a
/// background agent ends right there, and the harness re-prompts the session
/// itself once that work reports back. Reporting Done on every Stop therefore
/// dropped the running badge (and rang the done chime, and pushed "agent
/// finished" to paired phones) mid-task, until some background subagent's next
/// PreToolUse — which carries the PARENT session id, so it lands on this very
/// key — happened to re-assert Running. Observed as a 54s dark gap that healed
/// on its own.
///
/// The payload's `background_tasks` is exactly the discriminator: the harness
/// builds it from the live task registry and documents it as letting hooks tell
/// "session is done" from "session is paused waiting for background work to wake
/// it", empty when nothing is in flight. Non-empty -> re-assert Running and let
/// the real Done land on the turn that ends with nothing pending.
///
/// Three entry kinds are NOT a pause. A `teammate` (an in-process teammate
/// agent): the harness leaves it registered with `status: "running"` for the
/// whole session and tracks liveness in a separate `isIdle` flag that it never
/// serializes into the hook payload, so an idle teammate is byte-identical to a
/// working one. A `monitor` (an MCP or websocket watch): publishing an Artifact
/// auto-arms a persistent ambient comment watcher (`timeout_ms: 0`, status
/// `running` forever) that rides in every later Stop payload, so any session
/// that published an artifact would otherwise pin on Running for good. And a
/// `shell` (a backgrounded Bash command, or a Monitor tool watch, which Claude
/// runs as one): nothing is thinking while it runs — the harness's own
/// transcript calls the turn done and merely notes "1 shell still running" — and
/// its exit, or a watch firing, starts a fresh turn whose own hooks re-assert
/// Running and land a Done of their own. A dev server or job worker an agent
/// deliberately leaves running for the user's manual test never exits, so a
/// turn that ends with nothing but teammates, monitors and shells in flight
/// reports Done here, and treating it as a pause pinned tabs on Running for
/// hours — every later Stop re-reported the same value, which dedups away in
/// status.rs and so never healed. These are therefore the only types that can
/// be downgraded, and only on POSITIVE evidence. Whether that Done is announced
/// at once is the app's call (donehold.rs): it holds the finish of a turn that
/// started a build it will be woken by, and of one whose teammates still work,
/// so every Stop carries its task list (`--bg-hex`), an empty one included —
/// a sub-agent missing from it is gone, even one Claude stopped silently. Claude's own housekeeping — a `dream` (memory
/// consolidation), an `auto-mode scan`, a `memory import` — joins them: it is
/// ambient work that finishes without ever waking the session, so a Running it
/// held up stayed until the next prompt.
///
/// JSON escapes `"` inside strings but leaves `{`, `}` and `[`, `]` raw, so no
/// check on the shape of a naively cut array body can tell "the array closed"
/// from "a `description` mentioned a bracket" — a teammate description holding
/// `}]` would cut the body mid-entry, balance its own braces, and hide a live
/// workflow behind the cut. The scan therefore tokenizes before it slices:
/// `s/\\./Z/g` collapses every escape, after which a `"` can only be a real
/// string delimiter; the ignorable `"type"` forms (`teammate`, `monitor`,
/// `shell`) collapse to `T` and every other type to `X`; and `s/"[^"]*"/Q/g`
/// blanks what is left of every string — a shell's `command` included, so a
/// command line that quotes a task type is text like any other. The
/// survivors are pure structure, so `${f%%]*}` now cuts at the array's own close
/// and the counts mean what they say: as many objects as `{`, as many `T` as
/// objects, no `X`, no stray `[` (a nested array would cut early). A body that
/// fails any of those — a foreign or future type, an unparsable shape — keeps
/// Running, which is today's behavior.
///
/// Unlike `claude_sid_cmd` this needs several reads of the payload, so stdin
/// is slurped once into `$p` instead of streamed through `sed`. The extractions
/// lean on a greedy `.*`, which anchors to the LAST occurrence: prose fields
/// (`last_assistant_message`) serialize before `background_tasks` and so cannot
/// hijack the branch by quoting it. Cutting at the array's close likewise keeps
/// `session_crons` — which serializes after, and whose `prompt` is arbitrary
/// user text — out of the type scan. A payload with no `background_tasks` at all
/// (Claude older than the field) leaves `$bt` empty and reports Done — the
/// pre-existing behavior, so the fix degrades to today rather than sticking on
/// Running.
pub(super) fn claude_stop_cmd() -> String {
    let key = "claude_code_${sid:-$LPM_PANE_ID}";
    let done = "Done --icon=checkmark --color=#4ade80";
    let running = "Running --icon=bolt --color=#4C8DFF";
    let ty = "\"type\"[[:space:]]*:[[:space:]]*";
    let prep = format!(
        "p=$(cat); sid=$(printf '%s' \"$p\" | {SID_SED}); bt=$(printf '%s' \"$p\" | sed -n 's/.*\"background_tasks\"[[:space:]]*:[[:space:]]*\\[[[:space:]]*\\(.\\{{0,1\\}}\\).*/\\1/p'); st=\"{done}\"; if [ \"$bt\" = \"{{\" ]; then st=\"{running}\"; f=$(printf '%s' \"$p\" | sed -n 's/.*\"background_tasks\"[[:space:]]*:[[:space:]]*\\[//p' | sed -e 's/\\\\./Z/g' -e 's/{ty}\"teammate\"/T/g' -e 's/{ty}\"monitor\"/T/g' -e 's/{ty}\"shell\"/T/g' -e 's/{ty}\"dream\"/T/g' -e 's/{ty}\"auto-mode scan\"/T/g' -e 's/{ty}\"memory import\"/T/g' -e 's/{ty}\"[^\"]*\"/X/g' -e 's/\"[^\"]*\"/Q/g'); b=${{f%%]*}}; case \"$f\" in *\"]\"*) case \"$b\" in *\"[\"*) ;; *) n=$(printf '%s' \"$b\" | tr -cd '{{' | wc -c | tr -d ' '); c=$(printf '%s' \"$b\" | tr -cd '}}' | wc -c | tr -d ' '); k=$(printf '%s' \"$b\" | tr -cd 'T' | wc -c | tr -d ' '); x=$(printf '%s' \"$b\" | tr -cd 'X' | wc -c | tr -d ' '); if [ \"$n\" -gt 0 ] && [ \"$n\" = \"$c\" ] && [ \"$k\" = \"$n\" ] && [ \"$x\" = 0 ]; then st=\"{done}\"; fi;; esac;; esac; fi; bg=$(printf '%s' \"$p\" | sed -n 's/.*\"background_tasks\"[[:space:]]*:[[:space:]]*\\(\\[.*\\]\\)[[:space:]]*,[[:space:]]*\"session_crons\".*/\\1/p' | od -An -v -tx1 | tr -d ' \\n'); [ -n \"$bg\" ] && bg=\" --bg-hex=$bg\";"
    );
    let frame = format!("set_status '$pq' {key} $st$bg --pane=$LPM_PANE_ID");
    Hook {
        read: NOT_UNDER_CURSOR,
        prep: &prep,
        frame: &frame,
        ..Default::default()
    }
    .line()
}

/// Claude hook entry: {matcher, hooks: [{type: command, command}]}.
fn claude_hook(cmd: &str, matcher: &str) -> Value {
    json!({ "matcher": matcher, "hooks": [ { "type": "command", "command": cmd } ] })
}

#[cfg(test)]
#[path = "claude_tests.rs"]
mod tests;
