use super::*;

const CLI: &str = r"C:\Users\dev\AppData\Local\lpm\lpm-cli.exe";

fn cli() -> HookForm {
    HookForm::Cli(PathBuf::from(CLI))
}

fn events_and_matchers(v: &Value) -> Vec<(String, Vec<String>)> {
    v["hooks"]
        .as_object()
        .unwrap()
        .iter()
        .map(|(event, entries)| {
            let matchers = entries
                .as_array()
                .unwrap()
                .iter()
                .map(|e| e["matcher"].as_str().unwrap_or_default().to_string())
                .collect();
            (event.clone(), matchers)
        })
        .collect()
}

#[test]
fn claude_cli_form_covers_the_sh_forms_events_in_exec_form() {
    let sh: Value = serde_json::from_slice(&merge_claude_hooks(b"{}").unwrap()).unwrap();
    let exec: Value =
        serde_json::from_slice(&merge_claude_hooks_in(b"{}", &cli()).unwrap()).unwrap();
    assert_eq!(events_and_matchers(&exec), events_and_matchers(&sh));
    for (event, entries) in exec["hooks"].as_object().unwrap() {
        let hook = &entries[0]["hooks"][0];
        assert_eq!(hook["type"], "command");
        assert_eq!(hook["command"], CLI);
        assert_eq!(hook["args"], json!(["hook", "claude", event, MARKER]));
    }
    assert!(claude_hooks_status_from(&exec));
}

fn claude_hooks_status_from(settings: &Value) -> bool {
    let td = tempfile::tempdir().unwrap();
    let path = td.path().join("settings.json");
    std::fs::write(&path, settings.to_string()).unwrap();
    claude_hooks_status_at(&path).hooks_installed
}

#[test]
fn claude_cli_form_replaces_sh_hooks_keeps_user_hooks_and_is_idempotent() {
    let user = json!({ "matcher": "", "hooks": [{ "type": "command", "command": "my-hook" }] });
    let mut settings: Value = serde_json::from_slice(&merge_claude_hooks(b"{}").unwrap()).unwrap();
    settings["hooks"]["Stop"]
        .as_array_mut()
        .unwrap()
        .push(user.clone());
    let bytes = serde_json::to_vec(&settings).unwrap();

    let once = merge_claude_hooks_in(&bytes, &cli()).unwrap();
    let v: Value = serde_json::from_slice(&once).unwrap();
    let stop = v["hooks"]["Stop"].as_array().unwrap();
    assert_eq!(stop.len(), 2);
    assert_eq!(stop[0], user);
    assert_eq!(stop[1]["hooks"][0]["args"][2], "Stop");
    assert!(
        !once.windows(4).any(|w| w == b"nc -"),
        "no sh hook survives"
    );
    assert_eq!(merge_claude_hooks_in(&once, &cli()), None);

    let stripped: Value = serde_json::from_slice(&strip_hooks_json(&once).unwrap()).unwrap();
    assert_eq!(stripped["hooks"], json!({ "Stop": [user] }));
}

#[test]
fn codex_cli_form_runs_one_bare_command_per_event() {
    let v: Value = serde_json::from_slice(&merge_codex_hooks_in(b"{}", &cli()).unwrap()).unwrap();
    let hooks = v["hooks"].as_object().unwrap();
    assert_eq!(hooks.len(), CODEX_EVENTS.len());
    for event in CODEX_EVENTS {
        let entries = hooks[event].as_array().unwrap();
        assert_eq!(entries.len(), 1, "{event}");
        assert_eq!(
            entries[0]["hooks"][0]["command"],
            format!("{CLI} hook codex {event} {MARKER}")
        );
    }
    let bytes = serde_json::to_vec(&v).unwrap();
    assert_eq!(merge_codex_hooks_in(&bytes, &cli()), None);
    assert!(
        merge_codex_hooks(&bytes).is_some(),
        "sh form replaces it back"
    );
}

#[test]
fn cli_statusline_forwarder_chains_and_restores_the_users_line() {
    let original = json!({ "type": "command", "command": "my-line.sh", "padding": 2 });
    let cmd = statusline_command_in(&original, &cli());
    assert!(cmd.starts_with(
        "i=$(cat); printf %s \"$i\" | 'C:/Users/dev/AppData/Local/lpm/lpm-cli.exe' hook claude statusline >/dev/null 2>&1 &"
    ));
    assert!(cmd.contains(" printf %s \"$i\" | ( my-line.sh ) "));
    assert_eq!(unwrap_statusline(&cmd), Some(original.clone()));

    let settings = json!({ "statusLine": { "type": "command", "command": cmd } });
    let restored = remove_statusline(&serde_json::to_vec(&settings).unwrap()).unwrap();
    let v: Value = serde_json::from_slice(&restored).unwrap();
    assert_eq!(v["statusLine"], original);

    let bare = statusline_command_in(&Value::Null, &cli());
    assert!(!bare.contains("( "), "nothing to chain: {bare}");
    assert_eq!(unwrap_statusline(&bare), Some(Value::Null));
}

#[test]
fn shell_statusline_is_unchanged_by_the_dispatch() {
    let original = json!({ "type": "command", "command": "my-line.sh" });
    if cfg!(not(windows)) {
        assert_eq!(
            statusline_command(&original),
            statusline_command_in(&original, &HookForm::Shell)
        );
    }
    let sh = statusline_command_in(&original, &HookForm::Shell);
    assert!(sh.starts_with("acct=default; case \"${CLAUDE_CONFIG_DIR:-}\""));
}

#[test]
fn claude_project_slug_matches_claudes_windows_project_dirs() {
    assert_eq!(
        claude_project_slug(r"C:\Users\dev\my-app"),
        "C--Users-dev-my-app"
    );
    assert_eq!(
        claude_project_slug("C:/Users/dev/my-app"),
        "C--Users-dev-my-app"
    );
}
