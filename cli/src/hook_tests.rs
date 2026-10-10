use super::*;

fn env() -> HookEnv {
    HookEnv {
        socket: None,
        project: "proj".into(),
        pane: "pane-1".into(),
        config_dir: None,
        home: None,
        codex_home: Some("/home/u/.codex".into()),
        reporter_pid: Some(42),
    }
}

fn one(agent: &str, event: &str, payload: &str) -> String {
    let lines = frames(agent, event, payload.as_bytes(), &env());
    assert_eq!(lines.len(), 1, "{lines:?}");
    lines.into_iter().next().unwrap()
}

fn none(agent: &str, event: &str, payload: &str) {
    let lines = frames(agent, event, payload.as_bytes(), &env());
    assert!(lines.is_empty(), "{lines:?}");
}

#[test]
fn claude_frames_match_the_sh_hooks() {
    let p = r#"{"session_id":"s1","cwd":"/tmp/p"}"#;
    assert_eq!(
        one("claude", "SessionStart", p),
        "set_resume 'proj' pane-1 s1 --provider=claude --reporter-pid=42"
    );
    assert_eq!(
        one("claude", "UserPromptSubmit", p),
        "set_status 'proj' claude_code_s1 Running --icon=bolt --color=#4C8DFF --prompt --pane=pane-1 --reporter-pid=42"
    );
    for event in [
        "PreToolUse",
        "PostToolUse",
        "PostToolUseFailure",
        "ElicitationResult",
    ] {
        assert_eq!(
            one("claude", event, p),
            "set_status 'proj' claude_code_s1 Running --icon=bolt --color=#4C8DFF --pane=pane-1 --reporter-pid=42"
        );
    }
    for event in ["Notification", "PermissionRequest"] {
        assert_eq!(
            one("claude", event, p),
            "set_status 'proj' claude_code_s1 Waiting --icon=bell --color=#f59e0b --pane=pane-1 --reporter-pid=42"
        );
    }
    assert_eq!(
        one("claude", "Elicitation", p),
        "set_status 'proj' claude_code_s1 Waiting --icon=bell --color=#f59e0b --hold --pane=pane-1 --reporter-pid=42"
    );
    assert_eq!(
        one("claude", "StopFailure", p),
        "set_status 'proj' claude_code_s1 Error --icon=warning --color=#ef4444 --pane=pane-1 --reporter-pid=42"
    );
    assert_eq!(
        one("claude", "SessionEnd", p),
        "clear_status 'proj' claude_code_s1 --live --reporter-pid=42"
    );
}

#[test]
fn claude_keys_by_pane_without_a_session_id_and_skips_resume() {
    assert!(one("claude", "PreToolUse", "{}").contains(" claude_code_pane-1 Running"));
    assert!(one("claude", "PreToolUse", "not json").contains(" claude_code_pane-1 Running"));
    none("claude", "SessionStart", r#"{"session_id":""}"#);
}

#[test]
fn nothing_is_sent_without_a_pane_identity() {
    let mut e = env();
    e.pane.clear();
    assert!(frames("claude", "Stop", b"{}", &e).is_empty());
    let mut e = env();
    e.project.clear();
    assert!(frames("codex", "Stop", b"{}", &e).is_empty());
    none("claude", "Unknown", "{}");
    none("gemini", "Stop", "{}");
}

#[test]
fn identifiers_that_are_not_plain_tokens_are_quoted() {
    let mut e = env();
    e.project = "it's".into();
    e.pane = "a b".into();
    e.reporter_pid = None;
    let line = frames("codex", "Stop", b"{}", &e).remove(0);
    assert_eq!(
        line,
        r#"set_status 'it'"'"'s' 'codex_a b' Done --icon=checkmark --color=#4ade80 --pane='a b'"#
    );
}

fn stop(tasks: &str) -> String {
    let payload = format!(
        r#"{{"session_id":"s1","hook_event_name":"Stop","last_assistant_message":"x","background_tasks":{tasks},"session_crons":[]}}"#
    );
    one("claude", "Stop", &payload)
}

fn stop_is(tasks: &str, value: &str) {
    let line = stop(tasks);
    assert!(
        line.contains(&format!("claude_code_s1 {value} ")),
        "{tasks}\n{line}"
    );
}

#[test]
fn claude_stop_keeps_running_while_background_work_is_in_flight() {
    stop_is(
        r#"[{"id":"bw1","type":"workflow","status":"running","description":"audit"}]"#,
        "Running",
    );
    stop_is(
        r#"[{"id":"b","type":"subagent","status":"running","description":"Review"}]"#,
        "Running",
    );
    stop_is(
        r#"[{"id":"b","type":"cloud session","status":"running","description":"x"}]"#,
        "Running",
    );
    for ambient in ["dream", "auto-mode scan", "memory import"] {
        stop_is(
            &format!(r#"[{{"id":"b","type":"{ambient}","status":"running","description":"x"}}]"#),
            "Done",
        );
    }
    stop_is("[]", "Done");
    assert!(one("claude", "Stop", r#"{"session_id":"s1"}"#).contains("claude_code_s1 Done"));
    let decoy = r#"{"session_id":"s1","last_assistant_message":"I set \"background_tasks\":[{ here","background_tasks":[]}"#;
    assert!(one("claude", "Stop", decoy).contains("claude_code_s1 Done"));
}

#[test]
fn claude_stop_treats_teammates_monitors_and_shells_as_finished() {
    for tasks in [
        r#"[{"id":"b","type":"teammate","status":"running","description":"Fix }] in package.json"}]"#,
        r#"[{"id":"b","type":"teammate","status":"running","description":"Fix [BUG-1]"},{"id":"c","type":"monitor","status":"running","description":"watch"}]"#,
        r#"[{"id":"b","type":"monitor","status":"running","description":"ci","server":"github","tool":"get_workflow_run"}]"#,
        r#"[{"id":"b","type":"shell","status":"running","description":"cfg","command":"printf '{\"type\":\"workflow\"}' > c.json"}]"#,
        r#"[{"id":"b","type":"shell","status":"running","description":"dev","command":"npm run dev"},{"id":"c","type":"teammate","status":"running","description":"t"}]"#,
    ] {
        stop_is(tasks, "Done");
    }
}

#[test]
fn claude_stop_never_downgrades_a_live_entry_behind_settled_ones() {
    for tasks in [
        r#"[{"id":"b","type":"teammate","status":"running","description":"see }]}x"},{"id":"c","type":"subagent","status":"running","description":"Review"}]"#,
        r#"[{"id":"b","type":"monitor","status":"running","description":"x"},{"id":"c","type":"workflow","status":"running","description":"y"}]"#,
        r#"[{"id":"b","type":"shell","status":"running","description":"dev"},{"id":"c","type":"subagent","status":"running","description":"Audit"}]"#,
        r#"[{"id":"b","type":"subagent","status":"running","description":"set \"type\":\"monitor\" in config"}]"#,
        r#"[{"id":"b","type":"monitors","status":"running","description":"x"}]"#,
        r#"[{"id":"b","type":"shells","status":"running","description":"x"}]"#,
    ] {
        stop_is(tasks, "Running");
    }
}

#[test]
fn claude_stop_ignores_task_types_quoted_in_cron_prompts() {
    let payload = r#"{"session_id":"s1","background_tasks":[{"id":"b","type":"teammate","status":"running","description":"x"}],"session_crons":[{"id":"c1","prompt":"run the \"type\":\"workflow\" audit over [drafts]"}]}"#;
    assert!(one("claude", "Stop", payload).contains("claude_code_s1 Done"));
}

fn tool_payload(subagent: bool, tool_name: &str, tool_input: &str) -> String {
    let agent = if subagent {
        r#""agent_id":"01a0","agent_type":"default","#
    } else {
        ""
    };
    format!(
        r#"{{"session_id":"s1","turn_id":"t1",{agent}"transcript_path":"/tmp/r.jsonl","cwd":"/tmp/p","permission_mode":"default","tool_name":"{tool_name}","tool_input":{tool_input}}}"#
    )
}

#[test]
fn codex_memory_consolidation_never_speaks_for_the_tab() {
    let payload = |cwd: &str| {
        format!(r#"{{"session_id":"m1","turn_id":"t1","cwd":"{cwd}","hook_event_name":"SessionStart"}}"#)
    };
    none("codex", "SessionStart", &payload("/home/u/.codex/memories"));
    none("codex", "UserPromptSubmit", &payload("/home/u/.codex/memories_v2/x"));
    assert_eq!(frames("codex", "SessionStart", payload("/work/app").as_bytes(), &env()).len(), 2);
}

#[test]
fn codex_sub_agents_report_their_start_and_stop() {
    let payload = r#"{"session_id":"s1","hook_event_name":"SubagentStop","agent_id":"019a-77","agent_type":"default","last_assistant_message":"x"}"#;
    assert_eq!(
        one("codex", "SubagentStop", payload),
        "agent_child 'proj' codex_pane-1 019a-77 stop --reporter-pid=42"
    );
    assert!(one("codex", "SubagentStart", payload).ends_with("019a-77 start --reporter-pid=42"));
    none("codex", "SubagentStart", r#"{"session_id":"s1"}"#);
}

#[test]
fn codex_frames_match_the_sh_hooks() {
    let shell = tool_payload(false, "shell", r#"{"command":["ls"]}"#);
    let running = "set_status 'proj' codex_pane-1 Running --icon=sparkle --color=#10A37F --pane=pane-1 --reporter-pid=42";
    let step = "set_status 'proj' codex_pane-1 Running --icon=sparkle --color=#10A37F --step --pane=pane-1 --reporter-pid=42";
    assert_eq!(one("codex", "UserPromptSubmit", &shell), running);
    assert_eq!(one("codex", "PostToolUse", &shell), running);
    assert_eq!(one("codex", "PreToolUse", &shell), step);
    assert_eq!(
        one("codex", "Stop", &shell),
        "set_status 'proj' codex_pane-1 Done --icon=checkmark --color=#4ade80 --pane=pane-1 --reporter-pid=42"
    );
    assert_eq!(
        frames("codex", "SessionStart", shell.as_bytes(), &env()),
        vec![
            running.to_string(),
            "set_resume 'proj' pane-1 s1 --provider=codex --reporter-pid=42".to_string()
        ]
    );
}

#[test]
fn codex_pre_tool_use_waits_only_on_request_user_input() {
    let ask = tool_payload(false, "request_user_input", r#"{"questions":[]}"#);
    assert!(one("codex", "PreToolUse", &ask).contains("codex_pane-1 Waiting --icon=bell"));
    let decoy = tool_payload(false, "shell", r#"{"tool_name":"request_user_input"}"#);
    assert!(one("codex", "PreToolUse", &decoy).contains("codex_pane-1 Running"));
}

#[test]
fn codex_sub_agents_never_speak_for_the_tab() {
    let sub = tool_payload(true, "request_user_input", r#"{"questions":[]}"#);
    for event in ["UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"] {
        none("codex", event, &sub);
    }
    none("codex", "SessionStart", &sub);
    let grep = tool_payload(
        false,
        "shell",
        r#"{"command":"grep -rn \"agent_id\" src/"}"#,
    );
    assert!(one("codex", "PostToolUse", &grep).contains("codex_pane-1 Running"));
}

fn permission(transcript: &str) -> String {
    let transcript = serde_json::to_string(transcript).unwrap();
    format!(
        r#"{{"session_id":"s1","transcript_path":{transcript},"cwd":"/tmp/p","permission_mode":"default","tool_name":"shell","tool_input":{{"command":["git","push"]}}}}"#
    )
}

fn rollout(dir: &Path, last_turn_context: &str, trailing: &str) -> String {
    let path = dir.join("rollout.jsonl");
    let stale = r#"{"type":"turn_context","payload":{"approval_policy":"untrusted","approvals_reviewer":"auto_review"}}"#;
    std::fs::write(&path, format!("{stale}\n{last_turn_context}\n{trailing}\n")).unwrap();
    path.to_string_lossy().into_owned()
}

#[test]
fn codex_permission_request_skips_auto_reviewed_sessions() {
    let td = tempfile::tempdir().unwrap();
    for policy in [
        r#""on-request""#,
        r#"{"granular":{"sandbox_approval":true}}"#,
    ] {
        let tc = format!(
            r#"{{"type":"turn_context","payload":{{"approval_policy":{policy},"approvals_reviewer":"auto_review"}}}}"#
        );
        let path = rollout(td.path(), &tc, r#"{"type":"reasoning"}"#);
        none("codex", "PermissionRequest", &permission(&path));
    }
}

#[test]
fn codex_permission_request_waits_when_the_user_decides() {
    let td = tempfile::tempdir().unwrap();
    for tc in [
        r#"{"type":"turn_context","payload":{"approval_policy":"untrusted","approvals_reviewer":"auto_review"}}"#,
        r#"{"type":"turn_context","payload":{"approval_policy":"on-request","approvals_reviewer":"user"}}"#,
    ] {
        let path = rollout(td.path(), tc, "");
        assert!(
            one("codex", "PermissionRequest", &permission(&path)).contains("codex_pane-1 Waiting")
        );
    }
    let missing = td.path().join("gone.jsonl");
    let line = one(
        "codex",
        "PermissionRequest",
        &permission(&missing.to_string_lossy()),
    );
    assert!(line.contains("codex_pane-1 Waiting"));
}

#[test]
fn codex_permission_request_finds_turn_context_behind_bulky_output() {
    let td = tempfile::tempdir().unwrap();
    let tc = r#"{"type":"turn_context","payload":{"approval_policy":"on-request","approvals_reviewer":"auto_review"}}"#;
    let bulk = format!(
        r#"{{"type":"event_msg","payload":{{"text":"{}"}}}}"#,
        "o".repeat(2 << 20)
    );
    let path = rollout(td.path(), tc, &bulk);
    none("codex", "PermissionRequest", &permission(&path));
}

#[test]
fn statusline_forwards_the_payload_under_the_config_dirs_account() {
    let mut e = env();
    let payload = b"{\"model\":{\"display_name\":\"Opus\"}}\n";
    let line = frames("claude", "statusline", payload, &e).remove(0);
    assert_eq!(
        line,
        format!(
            "agent_limits default --payload-b64={}",
            base64(&payload[..payload.len() - 1])
        )
    );
    e.project.clear();
    e.pane.clear();
    e.config_dir = Some(r"C:\Users\me\.lpm\claude-accounts\work".into());
    let line = frames("claude", "statusline", b"{}", &e).remove(0);
    assert_eq!(line, "agent_limits work --payload-b64=e30=");
}

#[test]
fn limits_account_follows_the_sh_forwarder_rule() {
    assert_eq!(limits_account(None), "default");
    assert_eq!(limits_account(Some("/Users/me/.claude")), "default");
    assert_eq!(
        limits_account(Some("/Users/me/.lpm/claude-accounts/work")),
        "work"
    );
    assert_eq!(
        limits_account(Some("/Users/me/.lpm/claude-accounts/work/")),
        "default"
    );
    assert_eq!(limits_account(Some(r"C:\x\claude-accounts\home")), "home");
}

#[test]
fn base64_matches_the_standard_alphabet_with_padding() {
    assert_eq!(base64(b""), "");
    assert_eq!(base64(b"f"), "Zg==");
    assert_eq!(base64(b"fo"), "Zm8=");
    assert_eq!(base64(b"foo"), "Zm9v");
    assert_eq!(base64(b"foobar"), "Zm9vYmFy");
    assert_eq!(base64(&[0xff, 0xfe, 0x00]), "//4A");
}

#[cfg(unix)]
#[test]
fn delivers_every_frame_to_the_recovered_socket_in_order() {
    use std::io::Write;
    use std::os::unix::net::UnixListener;
    let home = tempfile::tempdir().unwrap();
    let lpm = home.path().join(".lpm");
    std::fs::create_dir_all(&lpm).unwrap();
    let listener = UnixListener::bind(lpm.join("lpm.sock")).unwrap();
    let mut e = env();
    e.socket = Some(home.path().join("stale.sock"));
    e.home = Some(home.path().to_path_buf());
    let socket = status_socket(e.socket.as_deref(), e.home.as_deref())
        .expect("falls back to ~/.lpm/lpm.sock");
    let server = std::thread::spawn(move || {
        let (stream, _) = listener.accept().unwrap();
        let mut got = Vec::new();
        for line in BufReader::new(stream.try_clone().unwrap()).lines() {
            got.push(line.unwrap());
            writeln!(&stream, "OK").unwrap();
        }
        got
    });
    let lines = frames("codex", "SessionStart", br#"{"session_id":"s1"}"#, &e);
    deliver(&socket, &lines);
    assert_eq!(server.join().unwrap(), lines);
}

#[cfg(unix)]
#[test]
fn reports_the_process_that_ran_the_hook() {
    assert_eq!(parent_pid(), Some(std::os::unix::process::parent_id()));
}

#[test]
fn codex_interrupt_and_session_end_take_back_what_was_live() {
    let p = r#"{"session_id":"t1","turn_id":"u1","cwd":"/tmp/p"}"#;
    for event in ["Interrupt", "SessionEnd"] {
        assert_eq!(
            one("codex", event, p),
            "clear_status 'proj' codex_pane-1 --live --reporter-pid=42"
        );
    }
}

#[test]
fn a_claude_sub_agent_can_ask_but_not_speak_for_the_session() {
    let sub = r#"{"session_id":"s1","agent_id":"a7","agent_type":"general-purpose"}"#;
    for event in ["UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure", "StopFailure"] {
        none("claude", event, sub);
    }
    assert!(one("claude", "PermissionRequest", sub).contains("claude_code_s1 Waiting"));
}

#[test]
fn a_manual_compact_is_work_and_an_automatic_one_is_the_turns() {
    let claude = r#"{"session_id":"s1","trigger":"manual"}"#;
    assert!(one("claude", "PreCompact", claude).contains("claude_code_s1 Running"));
    assert!(one("claude", "PostCompact", claude).starts_with("clear_status 'proj' claude_code_s1 --live"));
    let manual = r#"{"session_id":"t1","turn_id":"u1","trigger":"manual"}"#;
    assert!(one("codex", "PreCompact", manual).contains("codex_pane-1 Running"));
    assert!(one("codex", "PostCompact", manual).starts_with("clear_status 'proj' codex_pane-1 --live"));
    let auto = r#"{"session_id":"t1","turn_id":"u1","trigger":"auto"}"#;
    none("codex", "PreCompact", auto);
    none("codex", "PostCompact", auto);
}

#[test]
fn a_tmux_session_names_the_tab_that_attached_it() {
    let env = super::parse_tmux_env(
        "LPM_PANE_ID=tab-b\nLPM_PROJECT_NAME=Bob's app\n-LPM_SOCKET_PATH\nTERM=xterm\nLPM_EMPTY=\n",
    );
    assert_eq!(env.get("LPM_PANE_ID").map(String::as_str), Some("tab-b"));
    assert_eq!(env.get("LPM_PROJECT_NAME").map(String::as_str), Some("Bob's app"));
    assert!(!env.contains_key("LPM_SOCKET_PATH") && !env.contains_key("TERM") && !env.contains_key("LPM_EMPTY"));
}
