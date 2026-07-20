// Agent status hooks — port of desktop/agent_detect.go.
//
// Installs Claude Code (~/.claude/settings.json) and Codex (~/.codex/{config.toml,
// hooks.json}) hooks that pipe `set_status`/`clear_status` to the lpm status
// socket (socketsrv.rs) as the agent runs. Without this, the socket server has
// no clients and status badges stay dark. Install is idempotent via a
// `# lpm-hook` marker and only ever touches the `hooks` key — every other
// setting is preserved (serde_json::Value round-trips losslessly; key ordering
// alphabetizes exactly as Go's map+MarshalIndent did).
use base64::Engine;
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};

const MARKER: &str = "# lpm-hook";
const STATUSLINE_MARKER: &str = "# lpm-statusline:";

fn home() -> PathBuf {
    dirs::home_dir().unwrap_or_default()
}

fn claude_settings_path() -> PathBuf {
    home().join(".claude").join("settings.json")
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeHooksStatus {
    pub settings_exists: bool,
    pub hooks_installed: bool,
}

#[tauri::command]
pub fn check_claude_hooks() -> ClaudeHooksStatus {
    claude_hooks_status_at(&claude_settings_path())
}

#[tauri::command]
pub fn reset_claude_hooks() -> Result<(), String> {
    reset_claude_hooks_at(&claude_settings_path())
}

fn claude_hooks_status_at(path: &Path) -> ClaudeHooksStatus {
    let Ok(data) = std::fs::read(path) else {
        return ClaudeHooksStatus::default();
    };
    let Ok(settings) = serde_json::from_slice::<Value>(&data) else {
        return ClaudeHooksStatus {
            settings_exists: true,
            hooks_installed: false,
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
    }
}

fn reset_claude_hooks_at(path: &Path) -> Result<(), String> {
    // Validate for a real UI error, then reinstall (which strips+re-adds lpm hooks,
    // keeping the user's own — unlike removing the whole `hooks` key).
    let data = std::fs::read(path).map_err(|e| format!("cannot read Claude settings: {e}"))?;
    serde_json::from_slice::<Value>(&data)
        .map_err(|e| format!("invalid JSON in Claude settings: {e}"))?;
    install_claude_hooks_at(path)
}

/// Fired async at startup (app.go: `go a.installAgentHooks()`).
pub fn install_agent_hooks() {
    let _ = install_claude_hooks_at(&claude_settings_path()); // best-effort at startup
    install_codex_hooks();
}

/// Merge the six lpm Claude hooks into settings JSON `data`, returning Some(new
/// bytes) when a change is needed and None when unchanged or the input is not a
/// JSON object (invalid JSON is never rewritten). Pure — the transport (local fs
/// vs remote ssh) is the caller's job, so both share this exact merge/strip logic.
fn merge_claude_hooks(data: &[u8]) -> Option<Vec<u8>> {
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

    // Per-pane key: a shared key collides in the StatusStore (keyed by project+key),
    // so only one pane would show as running.
    let set_running = send_cmd("set_status '$LPM_PROJECT_NAME' claude_code_$LPM_PANE_ID Running --icon=bolt --color=#4C8DFF --pane=$LPM_PANE_ID");
    let set_done = send_cmd("set_status '$LPM_PROJECT_NAME' claude_code_$LPM_PANE_ID Done --icon=checkmark --color=#4ade80 --pane=$LPM_PANE_ID");
    let set_error = send_cmd("set_status '$LPM_PROJECT_NAME' claude_code_$LPM_PANE_ID Error --icon=warning --color=#ef4444 --pane=$LPM_PANE_ID");
    let set_waiting = send_cmd("set_status '$LPM_PROJECT_NAME' claude_code_$LPM_PANE_ID Waiting --icon=bell --color=#f59e0b --pane=$LPM_PANE_ID");
    let clear = send_cmd("clear_status '$LPM_PROJECT_NAME' claude_code_$LPM_PANE_ID");

    append_hook(hooks, "UserPromptSubmit", claude_hook(&set_running, ""));
    append_hook(hooks, "PreToolUse", claude_hook(&set_running, ""));
    append_hook(
        hooks,
        "Notification",
        claude_hook(&set_waiting, "permission_prompt"),
    );
    append_hook(hooks, "Stop", claude_hook(&set_done, ""));
    append_hook(hooks, "StopFailure", claude_hook(&set_error, ""));
    append_hook(hooks, "SessionEnd", claude_hook(&clear, ""));

    if settings == original {
        return None;
    }
    serde_json::to_string_pretty(&settings)
        .ok()
        .map(String::into_bytes)
}

fn install_claude_hooks_at(path: &Path) -> Result<(), String> {
    let Ok(data) = std::fs::read(path) else {
        return Ok(()); // missing settings — do NOT create the file
    };
    // Write only on change; errors propagate so the Reset button can surface them.
    if let Some(out) = merge_claude_hooks(&data) {
        std::fs::write(path, out).map_err(|e| format!("cannot write Claude settings: {e}"))?;
    }
    Ok(())
}

/// Best-effort: install the Claude status hooks into the REMOTE
/// ~/.claude/settings.json over ssh, so agents on the host report status. Reads
/// via `cat` (skips a missing/unreadable file — never creates it), reuses the
/// shared merge, and writes back only on change via a temp file + atomic rename.
/// Codex remote hooks are out of scope (remote TOML editing).
pub fn install_remote_claude_hooks(ssh: &crate::config::SshSettings) {
    let read = crate::sshexec::remote_command(
        ssh,
        "",
        "bash",
        &["-lc", "cat \"$HOME/.claude/settings.json\" 2>/dev/null"],
        &[],
    )
    .output();
    let Ok(out) = read else { return };
    if !out.status.success() || out.stdout.is_empty() {
        return; // missing/unreadable settings — never create
    }
    let Some(merged) = merge_claude_hooks(&out.stdout) else {
        return;
    };
    write_remote_claude_settings(ssh, &merged);
}

fn write_remote_claude_settings(ssh: &crate::config::SshSettings, bytes: &[u8]) {
    let script = "t=\"$HOME/.claude/.settings.json.lpmtmp\"; cat > \"$t\" && mv -f \"$t\" \"$HOME/.claude/settings.json\"";
    let child = crate::sshexec::remote_command(ssh, "", "bash", &["-lc", script], &[])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn();
    let Ok(mut child) = child else { return };
    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        let _ = stdin.write_all(bytes); // stdin drops here -> EOF so `cat` finishes
    }
    let _ = child.wait();
}

/// Install the remote Claude hooks once per host per app run (best-effort,
/// off-thread). Called on remote terminal spawn.
pub fn install_remote_claude_hooks_once(ssh: &crate::config::SshSettings) {
    use std::collections::HashSet;
    use std::sync::{Mutex, OnceLock};
    static DONE: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    let key = format!("{}@{}:{}", ssh.user, ssh.host, ssh.port);
    let first = DONE
        .get_or_init(Default::default)
        .lock()
        .unwrap()
        .insert(key);
    if !first {
        return;
    }
    let ssh = ssh.clone();
    std::thread::spawn(move || install_remote_claude_hooks(&ssh));
}

fn install_codex_hooks() {
    install_codex_hooks_at(&home().join(".codex"));
}

fn install_codex_hooks_at(codex_dir: &Path) {
    let config_path = codex_dir.join("config.toml");
    let hooks_path = codex_dir.join("hooks.json");

    if !codex_dir.exists() {
        return;
    }
    enable_codex_hooks_feature(&config_path);

    // Per-pane key, same reason as the Claude hooks.
    let set_running = send_cmd("set_status '$LPM_PROJECT_NAME' codex_$LPM_PANE_ID Running --icon=sparkle --color=#10A37F --pane=$LPM_PANE_ID");
    let set_done = send_cmd("set_status '$LPM_PROJECT_NAME' codex_$LPM_PANE_ID Done --icon=checkmark --color=#4ade80 --pane=$LPM_PANE_ID");
    let set_waiting = send_cmd("set_status '$LPM_PROJECT_NAME' codex_$LPM_PANE_ID Waiting --icon=bell --color=#f59e0b --pane=$LPM_PANE_ID");
    let set_resume = capture_resume_cmd();

    // Each event maps to its ordered list of hook entries. SessionStart carries
    // two: the status ping plus the resume-capture hook that reports Codex's
    // real session id back to the socket (Codex has no --session-id-at-launch).
    let new_events: Vec<(&str, Vec<Value>)> = vec![
        (
            "SessionStart",
            vec![codex_entry(&set_running), codex_entry(&set_resume)],
        ),
        ("UserPromptSubmit", vec![codex_entry(&set_running)]),
        ("PreToolUse", vec![codex_entry(&set_running)]),
        // Abstains from the allow/deny decision (no stdout), so approvals still
        // reach the user — it only flips the status badge to Waiting.
        ("PermissionRequest", vec![codex_entry(&set_waiting)]),
        ("Stop", vec![codex_entry(&set_done)]),
    ];

    let original = std::fs::read(&hooks_path)
        .ok()
        .and_then(|d| serde_json::from_slice::<Value>(&d).ok());

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

    if original.as_ref() != Some(&hooks_data) {
        if let Ok(out) = serde_json::to_string_pretty(&hooks_data) {
            let _ = std::fs::write(&hooks_path, out);
        }
    }
}

fn enable_codex_hooks_feature(config_path: &Path) {
    let content = std::fs::read_to_string(config_path).unwrap_or_default();
    if content.contains("codex_hooks") {
        return;
    }
    let new_content = if content.contains("[features]") {
        content.replacen("[features]", "[features]\ncodex_hooks = true", 1)
    } else {
        format!("{content}\n[features]\ncodex_hooks = true\n")
    };
    let _ = std::fs::write(config_path, new_content);
}

/// Backgrounded socket write; only runs when the socket exists. Ends with the
/// `# lpm-hook` marker so installs are idempotent.
fn send_cmd(cmd: &str) -> String {
    format!(
        "{{ [ -n \"$LPM_SOCKET_PATH\" ] && [ -S \"$LPM_SOCKET_PATH\" ] && echo \"{cmd}\" | nc -w1 -U \"$LPM_SOCKET_PATH\" & }} >/dev/null 2>&1; {MARKER}"
    )
}

/// Claude hook entry: {matcher, hooks: [{type: command, command}]}.
fn claude_hook(cmd: &str, matcher: &str) -> Value {
    json!({ "matcher": matcher, "hooks": [ { "type": "command", "command": cmd } ] })
}

/// Codex hook entry: {hooks: [{type: command, command}]}.
fn codex_entry(cmd: &str) -> Value {
    json!({ "hooks": [ { "type": "command", "command": cmd } ] })
}

/// SessionStart resume hook: read Codex's JSON payload from stdin, extract
/// `session_id`, and report it to the socket as `set_resume` so the tab can
/// later resume this exact session (Codex has no --session-id-at-launch). stdin
/// is consumed synchronously by `sed` before the send is backgrounded — the
/// plain `send_cmd` helper ignores stdin, so this hook needs its own shape.
/// Ends with the `# lpm-hook` marker like the others so strip/idempotency works.
fn capture_resume_cmd() -> String {
    format!(
        "sid=$(sed -n 's/.*\"session_id\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p' | head -n1); {{ [ -n \"$LPM_SOCKET_PATH\" ] && [ -S \"$LPM_SOCKET_PATH\" ] && [ -n \"$LPM_PANE_ID\" ] && [ -n \"$sid\" ] && echo \"set_resume '$LPM_PROJECT_NAME' $LPM_PANE_ID $sid\" | nc -w1 -U \"$LPM_SOCKET_PATH\" & }} >/dev/null 2>&1; {MARKER}"
    )
}

// ---- Claude usage-limit statusline forwarder --------------------------------
//
// Consent-gated: enabling "Claude usage limits" installs a `statusLine` command
// into ~/.claude/settings.json that reads the statusline JSON on stdin, forwards
// it (base64) into the status socket as `agent_limits <account> --payload-b64=…`,
// and — if the user already had a statusline — chains their original command so
// their display is unchanged. The forwarder derives the account from the live
// CLAUDE_CONFIG_DIR, so a single install covers every account (per-account
// settings.json symlink to this one file). Disable restores the exact prior
// statusLine, which is preserved base64-encoded in the trailing marker.

fn claude_config_dir_env() -> &'static str {
    crate::config::CLAUDE_CONFIG_DIR_ENV
}

/// Build the wrapper `command` string. `original` is the user's prior statusLine
/// object (or Null when there was none); it is both chained inline (via its
/// `command`) and embedded base64 in the trailing marker for exact restore.
fn statusline_command(original: &Value) -> String {
    let original_cmd = original.get("command").and_then(Value::as_str);
    let embedded =
        base64::engine::general_purpose::STANDARD.encode(serde_json::to_vec(original).unwrap_or_default());
    let env = claude_config_dir_env();
    let mut s = format!(
        "acct=default; case \"${{{env}:-}}\" in */claude-accounts/*) acct=\"${{{env}##*/}}\";; esac; "
    );
    s.push_str("i=$(cat); ");
    s.push_str(
        "printf %s \"$i\" | base64 | tr -d '\\n' | { IFS= read -r b; [ -n \"$LPM_SOCKET_PATH\" ] && [ -S \"$LPM_SOCKET_PATH\" ] && printf 'agent_limits %s --payload-b64=%s\\n' \"${acct:-default}\" \"$b\" | nc -w1 -U \"$LPM_SOCKET_PATH\"; } >/dev/null 2>&1 &",
    );
    if let Some(orig) = original_cmd {
        s.push(' ');
        s.push_str("printf %s \"$i\" | ( ");
        s.push_str(orig);
        s.push_str(" )");
    }
    s.push(' ');
    s.push_str(STATUSLINE_MARKER);
    s.push_str(&embedded);
    s
}

/// If `command` is an lpm-installed wrapper, return the embedded original
/// statusLine value (an object, or Null when the user had no prior statusLine);
/// None when the command is not ours.
fn unwrap_statusline(command: &str) -> Option<Value> {
    let idx = command.rfind(STATUSLINE_MARKER)?;
    let b64 = command[idx + STATUSLINE_MARKER.len()..].trim();
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64).ok()?;
    serde_json::from_slice(&bytes).ok()
}

/// The user's true prior statusLine, unwrapping our own wrapper if present so a
/// reinstall never nests. Null when there was no usable prior statusLine.
fn prior_statusline(settings: &Value) -> Value {
    let prior = settings.get("statusLine");
    let cmd = prior.and_then(|v| v.get("command")).and_then(Value::as_str);
    match cmd {
        Some(c) => match unwrap_statusline(c) {
            Some(embedded) => embedded,
            None => prior.cloned().unwrap_or(Value::Null),
        },
        None => Value::Null,
    }
}

/// Merge the statusLine forwarder into settings bytes, returning Some(new bytes)
/// on change and None when unchanged or the input is not a JSON object. Pure so
/// install/restore share one tested transform.
fn install_statusline(data: &[u8]) -> Option<Vec<u8>> {
    let before = serde_json::from_slice::<Value>(data).ok()?;
    let mut settings = before.clone();
    settings.as_object()?; // must be an object
    let original = prior_statusline(&settings);
    let command = statusline_command(&original);

    let mut slo = original.as_object().cloned().unwrap_or_default();
    slo.insert("type".into(), json!("command"));
    slo.insert("command".into(), json!(command));
    // Keep meters fresh while idle; never slow down a user's faster interval.
    let refresh = slo
        .get("refreshInterval")
        .and_then(Value::as_i64)
        .filter(|n| *n > 0)
        .unwrap_or(30)
        .min(30);
    slo.insert("refreshInterval".into(), json!(refresh));

    settings
        .as_object_mut()
        .unwrap()
        .insert("statusLine".into(), Value::Object(slo));
    if settings == before {
        return None;
    }
    serde_json::to_string_pretty(&settings)
        .ok()
        .map(String::into_bytes)
}

/// Restore the pre-install statusLine (or remove it if there was none), only
/// touching an lpm-installed wrapper. None when unchanged or not ours.
fn remove_statusline(data: &[u8]) -> Option<Vec<u8>> {
    let before = serde_json::from_slice::<Value>(data).ok()?;
    let cmd = before
        .get("statusLine")
        .and_then(|v| v.get("command"))
        .and_then(Value::as_str)?;
    let embedded = unwrap_statusline(cmd)?; // not ours -> leave untouched
    let mut settings = before.clone();
    let obj = settings.as_object_mut()?;
    match embedded {
        Value::Null => {
            obj.remove("statusLine");
        }
        other => {
            obj.insert("statusLine".into(), other);
        }
    }
    if settings == before {
        return None;
    }
    serde_json::to_string_pretty(&settings)
        .ok()
        .map(String::into_bytes)
}

fn install_claude_statusline_at(path: &Path) -> Result<(), String> {
    // On explicit opt-in, create a minimal settings.json when absent (unlike the
    // status hooks, which never create the file) so the meter can turn on.
    let data = std::fs::read(path).unwrap_or_else(|_| b"{}".to_vec());
    if let Some(out) = install_statusline(&data) {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("cannot create {}: {e}", parent.display()))?;
        }
        std::fs::write(path, out).map_err(|e| format!("cannot write Claude settings: {e}"))?;
    }
    Ok(())
}

fn remove_claude_statusline_at(path: &Path) -> Result<(), String> {
    let Ok(data) = std::fs::read(path) else {
        return Ok(()); // no file -> nothing to restore
    };
    if let Some(out) = remove_statusline(&data) {
        std::fs::write(path, out).map_err(|e| format!("cannot write Claude settings: {e}"))?;
    }
    Ok(())
}

/// Install or uninstall the Claude usage-limit forwarder. The frontend toggle
/// owns the persisted `claudeLimitsEnabled` flag; this only performs the
/// filesystem side effect.
#[tauri::command(async)]
pub fn apply_claude_limits(enabled: bool) -> Result<(), String> {
    let path = claude_settings_path();
    if enabled {
        install_claude_statusline_at(&path)
    } else {
        remove_claude_statusline_at(&path)
    }
}

/// Startup re-apply: silently reinstall the forwarder when the user previously
/// enabled it (mirrors the skill/CLI refresh — startup only refreshes opt-ins).
pub fn reapply_claude_limits_if_enabled() {
    let enabled = crate::config::load_settings()
        .get("claudeLimitsEnabled")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if enabled {
        let _ = install_claude_statusline_at(&claude_settings_path());
    }
}

fn has_marker(hooks: &Value) -> bool {
    serde_json::to_string(hooks)
        .map(|s| s.contains(MARKER))
        .unwrap_or(false)
}

/// Remove lpm-installed hook entries (command carries MARKER), keeping the user's own.
fn strip_lpm_hooks(hooks: &mut Map<String, Value>) {
    let events: Vec<String> = hooks.keys().cloned().collect();
    for ev in events {
        let Some(arr) = hooks.get_mut(&ev).and_then(Value::as_array_mut) else {
            continue;
        };
        arr.retain(|entry| !has_marker(entry));
        if arr.is_empty() {
            hooks.remove(&ev);
        }
    }
}

/// Append `entry` to hooks[event], creating/overwriting a non-array with [entry].
fn append_hook(hooks: &mut Map<String, Value>, event: &str, entry: Value) {
    match hooks.get_mut(event).and_then(Value::as_array_mut) {
        Some(arr) => arr.push(entry),
        None => {
            hooks.insert(event.to_string(), Value::Array(vec![entry]));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings_at(dir: &std::path::Path, body: &str) -> PathBuf {
        let p = dir.join("settings.json");
        std::fs::write(&p, body).unwrap();
        p
    }

    #[test]
    fn install_adds_six_hooks_and_preserves_siblings() {
        let dir = tempfile::tempdir().unwrap();
        let path = settings_at(dir.path(), r#"{"model":"opus","permissions":{"x":1}}"#);
        install_claude_hooks_at(&path).unwrap();

        let v: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        // siblings untouched
        assert_eq!(v["model"], "opus");
        assert_eq!(v["permissions"]["x"], 1);
        // all six events present, marker installed
        let hooks = v["hooks"].as_object().unwrap();
        for ev in [
            "UserPromptSubmit",
            "PreToolUse",
            "Notification",
            "Stop",
            "StopFailure",
            "SessionEnd",
        ] {
            assert!(hooks.contains_key(ev), "missing {ev}");
        }
        assert!(has_marker(&v["hooks"]));
        assert_eq!(claude_hooks_status_at(&path).hooks_installed, true);
    }

    #[test]
    fn install_uses_per_pane_status_key() {
        let dir = tempfile::tempdir().unwrap();
        let path = settings_at(dir.path(), "{}");
        install_claude_hooks_at(&path).unwrap();
        let v: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        for ev in [
            "UserPromptSubmit",
            "PreToolUse",
            "Notification",
            "Stop",
            "StopFailure",
            "SessionEnd",
        ] {
            for e in v["hooks"][ev].as_array().unwrap() {
                let cmd = e["hooks"][0]["command"].as_str().unwrap();
                assert!(
                    cmd.contains("claude_code_$LPM_PANE_ID"),
                    "{ev} not per-pane: {cmd}"
                );
            }
        }
    }

    #[test]
    fn reinstall_migrates_stale_shared_key_and_preserves_user_hooks() {
        let dir = tempfile::tempdir().unwrap();
        // Old install: a Stop hook on the shared `claude_code` key (carries MARKER),
        // next to the user's own Stop hook which must survive the migration.
        let body = r#"{
          "hooks": {
            "Stop": [
              { "matcher": "", "hooks": [ { "type": "command", "command": "old claude_code Done # lpm-hook" } ] },
              { "matcher": "", "hooks": [ { "type": "command", "command": "my-own-hook" } ] }
            ]
          }
        }"#;
        let path = settings_at(dir.path(), body);
        install_claude_hooks_at(&path).unwrap();

        let v: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        let stop = v["hooks"]["Stop"].as_array().unwrap();

        // user hook preserved
        assert!(stop
            .iter()
            .any(|e| e["hooks"][0]["command"] == "my-own-hook"));
        // exactly one lpm hook in Stop — old one replaced, not duplicated — and per-pane
        let lpm: Vec<&Value> = stop.iter().filter(|e| has_marker(e)).collect();
        assert_eq!(lpm.len(), 1, "stale lpm hook replaced, not duplicated");
        let cmd = lpm[0]["hooks"][0]["command"].as_str().unwrap();
        assert!(
            cmd.contains("claude_code_$LPM_PANE_ID"),
            "migrated to per-pane key: {cmd}"
        );
    }

    #[test]
    fn install_is_idempotent() {
        let dir = tempfile::tempdir().unwrap();
        let path = settings_at(dir.path(), "{}");
        install_claude_hooks_at(&path).unwrap();
        let first = std::fs::read_to_string(&path).unwrap();
        install_claude_hooks_at(&path).unwrap(); // second run: marker present -> no-op
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            first,
            "no duplicate hooks"
        );
    }

    #[test]
    fn missing_settings_is_noop() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json"); // does not exist
        install_claude_hooks_at(&path).unwrap();
        assert!(!path.exists(), "must not create the file");
        let st = claude_hooks_status_at(&path);
        assert!(!st.settings_exists && !st.hooks_installed);
    }

    #[test]
    fn invalid_json_is_left_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let path = settings_at(dir.path(), "{ not json");
        install_claude_hooks_at(&path).unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{ not json");
        let st = claude_hooks_status_at(&path);
        assert!(st.settings_exists && !st.hooks_installed);
    }

    #[test]
    fn reset_removes_then_reinstalls_preserving_siblings() {
        let dir = tempfile::tempdir().unwrap();
        let path = settings_at(dir.path(), r#"{"model":"opus"}"#);
        install_claude_hooks_at(&path).unwrap();
        reset_claude_hooks_at(&path).unwrap();
        let v: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(v["model"], "opus");
        assert!(has_marker(&v["hooks"]), "reinstalled after reset");
        assert_eq!(
            v["hooks"]["Stop"].as_array().unwrap().len(),
            1,
            "no duplication"
        );
    }

    #[test]
    fn merge_returns_change_then_none_and_ignores_invalid() {
        // First merge changes the object; a second merge of the result is a no-op
        // (idempotent) — the same guarantee the remote install relies on.
        let first = merge_claude_hooks(br#"{"model":"opus"}"#).expect("first merge changes");
        let v: Value = serde_json::from_slice(&first).unwrap();
        assert_eq!(v["model"], "opus");
        assert!(has_marker(&v["hooks"]));
        assert!(
            merge_claude_hooks(&first).is_none(),
            "second merge is a no-op"
        );
        // Invalid JSON never rewritten.
        assert!(merge_claude_hooks(b"{ not json").is_none());
    }

    #[test]
    fn send_cmd_shape_matches_go() {
        let s = send_cmd("clear_status 'x' k");
        assert!(s.starts_with(r#"{ [ -n "$LPM_SOCKET_PATH" ] && [ -S "$LPM_SOCKET_PATH" ] && echo "clear_status 'x' k" | nc -w1 -U "$LPM_SOCKET_PATH" & } >/dev/null 2>&1; "#));
        assert!(s.ends_with(MARKER));
    }

    fn codex_dir_with(body: Option<&str>) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        // install_codex_hooks_at is a no-op unless the .codex dir exists.
        let codex = dir.path().join(".codex");
        std::fs::create_dir(&codex).unwrap();
        std::fs::write(codex.join("config.toml"), "").unwrap();
        if let Some(b) = body {
            std::fs::write(codex.join("hooks.json"), b).unwrap();
        }
        dir
    }

    fn codex_hooks(dir: &std::path::Path) -> Value {
        let data = std::fs::read(dir.join(".codex").join("hooks.json")).unwrap();
        serde_json::from_slice(&data).unwrap()
    }

    #[test]
    fn codex_install_adds_resume_hook_on_session_start() {
        let dir = codex_dir_with(None);
        install_codex_hooks_at(&dir.path().join(".codex"));

        let v = codex_hooks(dir.path());
        let hooks = v["hooks"].as_object().unwrap();
        for ev in [
            "SessionStart",
            "UserPromptSubmit",
            "PreToolUse",
            "PermissionRequest",
            "Stop",
        ] {
            assert!(hooks.contains_key(ev), "missing {ev}");
        }
        let waiting = v["hooks"]["PermissionRequest"][0]["hooks"][0]["command"]
            .as_str()
            .unwrap();
        assert!(
            waiting.contains("codex_$LPM_PANE_ID Waiting"),
            "PermissionRequest must set Waiting: {waiting}"
        );
        // SessionStart holds the status ping AND the resume-capture hook.
        let start = v["hooks"]["SessionStart"].as_array().unwrap();
        assert_eq!(start.len(), 2, "SessionStart should carry two lpm hooks");
        let has_resume = start.iter().any(|e| {
            e["hooks"][0]["command"]
                .as_str()
                .map(|c| c.contains("set_resume") && c.contains("session_id"))
                .unwrap_or(false)
        });
        assert!(
            has_resume,
            "SessionStart missing set_resume hook: {start:?}"
        );
        assert!(has_marker(&v["hooks"]));
    }

    #[test]
    fn codex_install_is_idempotent() {
        let dir = codex_dir_with(None);
        let codex = dir.path().join(".codex");
        install_codex_hooks_at(&codex);
        let first = std::fs::read_to_string(codex.join("hooks.json")).unwrap();
        install_codex_hooks_at(&codex);
        assert_eq!(
            std::fs::read_to_string(codex.join("hooks.json")).unwrap(),
            first,
            "re-run must not duplicate codex hooks"
        );
        // Exactly one resume hook survives a re-run.
        let v = codex_hooks(dir.path());
        let resume_count = v["hooks"]["SessionStart"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|e| {
                e["hooks"][0]["command"]
                    .as_str()
                    .map(|c| c.contains("set_resume"))
                    .unwrap_or(false)
            })
            .count();
        assert_eq!(resume_count, 1, "resume hook not duplicated");
    }

    #[test]
    fn codex_install_preserves_user_hooks() {
        let body = r#"{
          "hooks": {
            "SessionStart": [
              { "hooks": [ { "type": "command", "command": "my-own-codex-hook" } ] }
            ]
          }
        }"#;
        let dir = codex_dir_with(Some(body));
        install_codex_hooks_at(&dir.path().join(".codex"));

        let v = codex_hooks(dir.path());
        let start = v["hooks"]["SessionStart"].as_array().unwrap();
        assert!(
            start
                .iter()
                .any(|e| e["hooks"][0]["command"] == "my-own-codex-hook"),
            "user hook must survive install"
        );
        assert!(
            start.iter().any(|e| e["hooks"][0]["command"]
                .as_str()
                .map(|c| c.contains("set_resume"))
                .unwrap_or(false)),
            "resume hook must be added alongside the user hook"
        );
    }

    #[test]
    fn capture_resume_cmd_shape() {
        let s = capture_resume_cmd();
        assert!(s.contains("session_id"), "extracts session_id from stdin");
        assert!(s.contains("set_resume '$LPM_PROJECT_NAME' $LPM_PANE_ID $sid"));
        assert!(s.contains("[ -S \"$LPM_SOCKET_PATH\" ]") && s.contains("[ -n \"$sid\" ]"));
        assert!(s.ends_with(MARKER));
    }

    #[test]
    fn statusline_wrap_forwards_and_derives_account() {
        let cmd = statusline_command(&Value::Null);
        assert!(cmd.contains("agent_limits"), "forwards to the socket verb");
        assert!(cmd.contains("--payload-b64="));
        assert!(cmd.contains("CLAUDE_CONFIG_DIR"), "derives account at runtime");
        assert!(cmd.contains(STATUSLINE_MARKER));
        // No prior statusline -> nothing chained.
        assert!(!cmd.contains("printf %s \"$i\" | ( "));
    }

    #[test]
    fn statusline_install_preserves_and_chains_user_command() {
        let body = br#"{"model":"opus","statusLine":{"type":"command","command":"my-line.sh","padding":2}}"#;
        let out = install_statusline(body).expect("install changes settings");
        let v: Value = serde_json::from_slice(&out).unwrap();
        assert_eq!(v["model"], "opus", "siblings preserved");
        assert_eq!(v["statusLine"]["padding"], 2, "padding preserved");
        let cmd = v["statusLine"]["command"].as_str().unwrap();
        assert!(cmd.contains("printf %s \"$i\" | ( my-line.sh )"), "chains original");
        assert_eq!(v["statusLine"]["refreshInterval"], 30);
        // Restore returns the exact original statusLine.
        let restored = remove_statusline(&out).expect("restore changes settings");
        let r: Value = serde_json::from_slice(&restored).unwrap();
        assert_eq!(r["statusLine"]["command"], "my-line.sh");
        assert_eq!(r["statusLine"]["padding"], 2);
        assert!(r["statusLine"].get("refreshInterval").is_none());
    }

    #[test]
    fn statusline_install_is_idempotent() {
        let body = br#"{"statusLine":{"type":"command","command":"orig"}}"#;
        let first = install_statusline(body).unwrap();
        assert!(
            install_statusline(&first).is_none(),
            "second install is a no-op (no nesting)"
        );
        // And the embedded original still restores to exactly "orig".
        let restored = remove_statusline(&first).unwrap();
        let r: Value = serde_json::from_slice(&restored).unwrap();
        assert_eq!(r["statusLine"]["command"], "orig");
    }

    #[test]
    fn statusline_install_without_prior_removes_on_restore() {
        let out = install_statusline(b"{}").expect("install changes empty settings");
        let v: Value = serde_json::from_slice(&out).unwrap();
        assert_eq!(v["statusLine"]["type"], "command");
        let restored = remove_statusline(&out).expect("restore changes settings");
        let r: Value = serde_json::from_slice(&restored).unwrap();
        assert!(r.get("statusLine").is_none(), "no prior statusline -> removed");
    }

    #[test]
    fn statusline_keeps_users_faster_refresh_interval() {
        let body = br#"{"statusLine":{"type":"command","command":"x","refreshInterval":5}}"#;
        let out = install_statusline(body).unwrap();
        let v: Value = serde_json::from_slice(&out).unwrap();
        assert_eq!(v["statusLine"]["refreshInterval"], 5, "5s beats the 30s default");
    }

    #[test]
    fn remove_leaves_foreign_statusline_untouched() {
        let body = br#"{"statusLine":{"type":"command","command":"not-ours.sh"}}"#;
        assert!(
            remove_statusline(body).is_none(),
            "a statusline we didn't install is never modified"
        );
    }

    #[test]
    fn install_and_remove_roundtrip_on_disk() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        std::fs::write(&path, r#"{"model":"opus"}"#).unwrap();
        install_claude_statusline_at(&path).unwrap();
        let v: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert!(v["statusLine"]["command"].as_str().unwrap().contains("agent_limits"));
        remove_claude_statusline_at(&path).unwrap();
        let v2: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(v2["model"], "opus");
        assert!(v2.get("statusLine").is_none());
    }

    #[test]
    fn install_creates_settings_when_absent() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json"); // does not exist
        install_claude_statusline_at(&path).unwrap();
        assert!(path.exists(), "explicit opt-in creates the file");
        let v: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(v["statusLine"]["type"], "command");
    }
}
