// Agent status hooks — port of desktop/agent_detect.go.
//
// Installs Claude Code (~/.claude/settings.json) and Codex (~/.codex/{config.toml,
// hooks.json}) hooks that pipe `set_status`/`clear_status` to the lpm status
// socket (socketsrv.rs) as the agent runs. Without this, the socket server has
// no clients and status badges stay dark. Install is idempotent via a
// `# lpm-hook` marker and only ever touches the `hooks` key — every other
// setting is preserved (serde_json::Value round-trips losslessly; key ordering
// alphabetizes exactly as Go's map+MarshalIndent did).
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};

const MARKER: &str = "# lpm-hook";

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
}
