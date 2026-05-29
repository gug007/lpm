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
        return ClaudeHooksStatus { settings_exists: true, hooks_installed: false };
    };
    let hooks_installed = settings
        .get("hooks")
        .filter(|h| h.is_object())
        .map(has_marker)
        .unwrap_or(false);
    ClaudeHooksStatus { settings_exists: true, hooks_installed }
}

fn reset_claude_hooks_at(path: &Path) -> Result<(), String> {
    let data = std::fs::read(path).map_err(|e| format!("cannot read Claude settings: {e}"))?;
    let mut settings: Value =
        serde_json::from_slice(&data).map_err(|e| format!("invalid JSON in Claude settings: {e}"))?;
    if let Some(obj) = settings.as_object_mut() {
        obj.remove("hooks");
    }
    let out = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(path, out).map_err(|e| e.to_string())?;
    install_claude_hooks_at(path);
    Ok(())
}

/// Fired async at startup (app.go: `go a.installAgentHooks()`).
pub fn install_agent_hooks() {
    install_claude_hooks_at(&claude_settings_path());
    install_codex_hooks();
}

fn install_claude_hooks_at(path: &Path) {
    let Ok(data) = std::fs::read(path) else {
        return; // missing settings — do NOT create the file
    };
    let Ok(mut settings) = serde_json::from_slice::<Value>(&data) else {
        return;
    };
    let Some(obj) = settings.as_object_mut() else {
        return;
    };
    if !obj.get("hooks").map(Value::is_object).unwrap_or(false) {
        obj.insert("hooks".into(), json!({}));
    }
    let hooks = obj.get_mut("hooks").unwrap().as_object_mut().unwrap();
    if has_marker(&Value::Object(hooks.clone())) {
        return; // already installed
    }

    let set_running = send_cmd("set_status '$LPM_PROJECT_NAME' claude_code Running --icon=bolt --color=#4C8DFF --pane=$LPM_PANE_ID");
    let set_done = send_cmd("set_status '$LPM_PROJECT_NAME' claude_code Done --icon=checkmark --color=#4ade80 --pane=$LPM_PANE_ID");
    let set_error = send_cmd("set_status '$LPM_PROJECT_NAME' claude_code Error --icon=warning --color=#ef4444 --pane=$LPM_PANE_ID");
    let set_waiting = send_cmd("set_status '$LPM_PROJECT_NAME' claude_code Waiting --icon=bell --color=#f59e0b --pane=$LPM_PANE_ID");
    let clear = send_cmd("clear_status '$LPM_PROJECT_NAME' claude_code");

    append_hook(hooks, "UserPromptSubmit", claude_hook(&set_running, ""));
    append_hook(hooks, "PreToolUse", claude_hook(&set_running, ""));
    append_hook(hooks, "Notification", claude_hook(&set_waiting, "permission_prompt"));
    append_hook(hooks, "Stop", claude_hook(&set_done, ""));
    append_hook(hooks, "StopFailure", claude_hook(&set_error, ""));
    append_hook(hooks, "SessionEnd", claude_hook(&clear, ""));

    if let Ok(out) = serde_json::to_string_pretty(&settings) {
        let _ = std::fs::write(path, out);
    }
}

fn install_codex_hooks() {
    let codex_dir = home().join(".codex");
    let config_path = codex_dir.join("config.toml");
    let hooks_path = codex_dir.join("hooks.json");

    if !codex_dir.exists() {
        return;
    }
    if let Ok(existing) = std::fs::read_to_string(&hooks_path) {
        if existing.contains(MARKER) {
            return; // already installed
        }
    }
    enable_codex_hooks_feature(&config_path);

    let set_running = send_cmd("set_status '$LPM_PROJECT_NAME' codex Running --icon=sparkle --color=#10A37F --pane=$LPM_PANE_ID");
    let set_done = send_cmd("set_status '$LPM_PROJECT_NAME' codex Done --icon=checkmark --color=#4ade80 --pane=$LPM_PANE_ID");

    // Each event maps to an array holding one hook entry (Codex shape).
    let new_events: Vec<(&str, Value)> = vec![
        ("SessionStart", codex_hook(&set_running)),
        ("UserPromptSubmit", codex_hook(&set_running)),
        ("PreToolUse", codex_hook(&set_running)),
        ("Stop", codex_hook(&set_done)),
    ];

    // Merge into an existing hooks.json (append) when its top-level `hooks` is an
    // object; otherwise write a fresh structure.
    let existing = std::fs::read(&hooks_path)
        .ok()
        .and_then(|d| serde_json::from_slice::<Value>(&d).ok())
        .filter(|e| e.get("hooks").map(Value::is_object).unwrap_or(false));

    let hooks_data = if let Some(mut existing) = existing {
        let eh = existing.get_mut("hooks").unwrap().as_object_mut().unwrap();
        for (event, entry_arr) in &new_events {
            let entry = entry_arr.as_array().and_then(|a| a.first()).cloned().unwrap_or(Value::Null);
            append_hook(eh, event, entry);
        }
        existing
    } else {
        let mut m = Map::new();
        for (event, entry_arr) in new_events {
            m.insert(event.to_string(), entry_arr);
        }
        json!({ "hooks": Value::Object(m) })
    };

    if let Ok(out) = serde_json::to_string_pretty(&hooks_data) {
        let _ = std::fs::write(&hooks_path, out);
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

/// Codex hook entry: [{hooks: [{type: command, command}]}].
fn codex_hook(cmd: &str) -> Value {
    json!([ { "hooks": [ { "type": "command", "command": cmd } ] } ])
}

fn has_marker(hooks: &Value) -> bool {
    serde_json::to_string(hooks).map(|s| s.contains(MARKER)).unwrap_or(false)
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
        install_claude_hooks_at(&path);

        let v: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        // siblings untouched
        assert_eq!(v["model"], "opus");
        assert_eq!(v["permissions"]["x"], 1);
        // all six events present, marker installed
        let hooks = v["hooks"].as_object().unwrap();
        for ev in ["UserPromptSubmit", "PreToolUse", "Notification", "Stop", "StopFailure", "SessionEnd"] {
            assert!(hooks.contains_key(ev), "missing {ev}");
        }
        assert!(has_marker(&v["hooks"]));
        assert_eq!(claude_hooks_status_at(&path).hooks_installed, true);
    }

    #[test]
    fn install_is_idempotent() {
        let dir = tempfile::tempdir().unwrap();
        let path = settings_at(dir.path(), "{}");
        install_claude_hooks_at(&path);
        let first = std::fs::read_to_string(&path).unwrap();
        install_claude_hooks_at(&path); // second run: marker present -> no-op
        assert_eq!(std::fs::read_to_string(&path).unwrap(), first, "no duplicate hooks");
    }

    #[test]
    fn missing_settings_is_noop() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json"); // does not exist
        install_claude_hooks_at(&path);
        assert!(!path.exists(), "must not create the file");
        let st = claude_hooks_status_at(&path);
        assert!(!st.settings_exists && !st.hooks_installed);
    }

    #[test]
    fn invalid_json_is_left_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let path = settings_at(dir.path(), "{ not json");
        install_claude_hooks_at(&path);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{ not json");
        let st = claude_hooks_status_at(&path);
        assert!(st.settings_exists && !st.hooks_installed);
    }

    #[test]
    fn reset_removes_then_reinstalls_preserving_siblings() {
        let dir = tempfile::tempdir().unwrap();
        let path = settings_at(dir.path(), r#"{"model":"opus"}"#);
        install_claude_hooks_at(&path);
        reset_claude_hooks_at(&path).unwrap();
        let v: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(v["model"], "opus");
        assert!(has_marker(&v["hooks"]), "reinstalled after reset");
        assert_eq!(v["hooks"]["Stop"].as_array().unwrap().len(), 1, "no duplication");
    }

    #[test]
    fn send_cmd_shape_matches_go() {
        let s = send_cmd("clear_status 'x' k");
        assert!(s.starts_with(r#"{ [ -n "$LPM_SOCKET_PATH" ] && [ -S "$LPM_SOCKET_PATH" ] && echo "clear_status 'x' k" | nc -w1 -U "$LPM_SOCKET_PATH" & } >/dev/null 2>&1; "#));
        assert!(s.ends_with(MARKER));
    }
}
