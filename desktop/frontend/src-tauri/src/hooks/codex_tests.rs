use super::*;
use crate::hooks::has_marker;
use crate::hooks::test_support::*;

#[cfg(unix)]
#[test]
fn shell_hooks_succeed_without_lpm_context() {
    let home = tempfile::tempdir().unwrap();
    for shell in ["/bin/sh", "/bin/zsh"] {
        if !std::path::Path::new(shell).exists() {
            continue;
        }
        for (event, entries) in codex_shell_events() {
            for entry in entries {
                let cmd = entry["hooks"][0]["command"].as_str().unwrap();
                let output = std::process::Command::new(shell)
                    .args(["-c", cmd])
                    .env_clear()
                    .env("HOME", home.path())
                    .env("PATH", "/usr/bin:/bin")
                    .stdin(std::process::Stdio::null())
                    .output()
                    .unwrap();
                assert!(
                    output.status.success(),
                    "{shell} {event}: {:?}",
                    output.status
                );
                assert!(
                    output.stdout.is_empty(),
                    "{shell} {event}: {:?}",
                    output.stdout
                );
            }
        }
    }
}

#[test]
fn merge_upgrades_old_nc_only_codex_hook() {
    let old = "{ [ -n \"$LPM_SOCKET_PATH\" ] && [ -S \"$LPM_SOCKET_PATH\" ] && echo \"set_status '$LPM_PROJECT_NAME' codex_$LPM_PANE_ID Done --icon=checkmark --color=#4ade80 --pane=$LPM_PANE_ID\" | nc -w1 -U \"$LPM_SOCKET_PATH\" & } >/dev/null 2>&1; # lpm-hook";
    let body = format!(
        r#"{{ "hooks": {{ "Stop": [ {{ "hooks": [ {{ "type": "command", "command": {} }} ] }} ] }} }}"#,
        serde_json::to_string(old).unwrap()
    );

    let out = merge_codex_hooks(body.as_bytes()).expect("old codex command must be upgraded");
    let v: Value = serde_json::from_slice(&out).unwrap();
    let stop = v["hooks"]["Stop"].as_array().unwrap();
    let lpm: Vec<&Value> = stop.iter().filter(|e| has_marker(e)).collect();
    assert_eq!(lpm.len(), 1, "old lpm hook replaced, not duplicated");
    let cmd = lpm[0]["hooks"][0]["command"].as_str().unwrap();
    assert!(cmd.contains("python3 -c") && cmd.contains("perl -MIO::Socket::UNIX"));
    assert_ne!(cmd, old, "command text actually changed");
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
        "PostToolUse",
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
fn codex_permission_request_gates_on_auto_review() {
    let cmd = codex_permission_request_cmd();
    assert!(
        cmd.contains("transcript_path"),
        "must read the rollout path"
    );
    assert!(
        cmd.contains("\"type\":\"turn_context\""),
        "must locate the last turn_context line"
    );
    assert!(
        cmd.contains("\"approvals_reviewer\":\"auto_review\"")
            && cmd.contains("\"approval_policy\":(\"on-request\"|\\{\"granular\")"),
        "must match the guardian-routing predicate: {cmd}"
    );
    assert!(
        cmd.contains("[ -z \"$auto\" ] &&"),
        "delivery must be gated on the auto-review check: {cmd}"
    );
}

#[test]
fn codex_pre_tool_use_flags_request_user_input() {
    let cmd = codex_pre_tool_use_cmd();
    assert!(
        cmd.contains("[ \"$tn\" = \"request_user_input\" ]"),
        "must branch on the tool name: {cmd}"
    );
    assert!(
        cmd.contains("Waiting --icon=bell") && cmd.contains("Running --icon=sparkle"),
        "must carry both status branches: {cmd}"
    );
    assert!(
        cmd.contains("\"permission_mode\""),
        "tool_name extraction must anchor on permission_mode: {cmd}"
    );
}

#[test]
fn codex_post_tool_use_resumes_running() {
    let dir = codex_dir_with(None);
    install_codex_hooks_at(&dir.path().join(".codex"));
    let v = codex_hooks(dir.path());
    let cmd = v["hooks"]["PostToolUse"][0]["hooks"][0]["command"]
        .as_str()
        .unwrap();
    assert!(
        cmd.contains("codex_$LPM_PANE_ID Running"),
        "PostToolUse must set Running: {cmd}"
    );
}

#[cfg(unix)]
fn installed_codex_cmd(event: &str) -> String {
    let v: Value = serde_json::from_slice(&merge_codex_hooks(b"{}").unwrap()).unwrap();
    v["hooks"][event][0]["hooks"][0]["command"]
        .as_str()
        .unwrap()
        .to_string()
}

/// A tool hook payload as Codex 0.154 serializes it; `subagent` adds the
/// `agent_id`/`agent_type` pair a thread-spawned sub-agent carries.
#[cfg(unix)]
fn tool_payload(event: &str, subagent: bool, tool_name: &str, tool_input: &str) -> String {
    let agent = if subagent {
        r#""agent_id":"01a0aac0-2a49-75c2-96de-c3b2e22e1396","agent_type":"default","#
    } else {
        ""
    };
    format!(
        r#"{{"session_id":"s1","turn_id":"t1",{agent}"transcript_path":"/tmp/r.jsonl","cwd":"/tmp/p","hook_event_name":"{event}","model":"gpt-5","permission_mode":"default","tool_name":"{tool_name}","tool_input":{tool_input},"tool_response":"ok","tool_use_id":"c1"}}"#
    )
}

/// Codex fires the tab's tool hooks inside thread-spawned sub-agents too,
/// and one that outlived the root thread's Stop re-reported Running after
/// the tab's Done — with no Stop of its own to ever end it.
#[cfg(unix)]
#[test]
fn codex_status_hooks_ignore_thread_spawned_subagents() {
    let shell = r#"{"command":["echo","hi"]}"#;
    let post = installed_codex_cmd("PostToolUse");
    let msg =
        run_codex_hook(&post, &tool_payload("PostToolUse", false, "shell", shell)).unwrap();
    assert!(
        msg.contains("codex_pane-1 Running"),
        "root thread reports: {msg}"
    );
    assert_eq!(
        run_codex_hook(&post, &tool_payload("PostToolUse", true, "shell", shell)),
        None,
        "a sub-agent's tool must not speak for the tab"
    );

    let ask = r#"{"questions":[]}"#;
    let pre = installed_codex_cmd("PreToolUse");
    let msg = run_codex_hook(
        &pre,
        &tool_payload("PreToolUse", false, "request_user_input", ask),
    )
    .unwrap();
    assert!(
        msg.contains("codex_pane-1 Waiting"),
        "root question waits on the user: {msg}"
    );
    let msg = run_codex_hook(&pre, &tool_payload("PreToolUse", false, "shell", shell)).unwrap();
    assert!(
        msg.contains("codex_pane-1 Running"),
        "root tool runs: {msg}"
    );
    assert_eq!(
        run_codex_hook(
            &pre,
            &tool_payload("PreToolUse", true, "request_user_input", ask)
        ),
        None,
        "a sub-agent's question goes to its parent, not the user"
    );
}

/// Codex's memory consolidation thread works in CODEX_HOME's memory folder
/// and never reports a Stop, so none of its reports may speak for the tab.
#[cfg(unix)]
#[test]
fn codex_memory_consolidation_never_speaks_for_the_tab() {
    let payload = |cwd: &str| {
        format!(
            r#"{{"session_id":"m1","turn_id":"t1","transcript_path":null,"cwd":"{cwd}","hook_event_name":"UserPromptSubmit","model":"m","permission_mode":"default","prompt":"consolidate"}}"#
        )
    };
    let home = std::env::temp_dir().join("lpm-codex-home");
    let cmd = format!(
        "CODEX_HOME={}; {}",
        home.display(),
        installed_codex_cmd("UserPromptSubmit")
    );
    let memories = format!("{}/memories", home.display());
    assert_eq!(run_codex_hook(&cmd, &payload(&memories)), None);
    let msg = run_codex_hook(&cmd, &payload("/work/app")).unwrap();
    assert!(msg.contains("codex_pane-1 Running"), "{msg}");
}

/// The gate reads only the structural prefix ahead of `transcript_path`:
/// prose in `tool_input` naming the field is not a sub-agent.
#[cfg(unix)]
#[test]
fn codex_root_gate_ignores_agent_id_in_tool_input() {
    let post = installed_codex_cmd("PostToolUse");
    let grep = r#"{"command":"grep -rn \"agent_id\" src/"}"#;
    let msg =
        run_codex_hook(&post, &tool_payload("PostToolUse", false, "shell", grep)).unwrap();
    assert!(msg.contains("codex_pane-1 Running"), "{msg}");
}

/// A tool result larger than the pipe buffer must still be drained, or Codex
/// reports a broken hook stdin; the gate reads a prefix and sinks the rest.
#[cfg(unix)]
#[test]
fn codex_status_hooks_drain_bulky_payloads() {
    let post = installed_codex_cmd("PostToolUse");
    let bulky = format!(r#"{{"command":"{}"}}"#, "x".repeat(512 * 1024));
    let msg =
        run_codex_hook(&post, &tool_payload("PostToolUse", false, "shell", &bulky)).unwrap();
    assert!(msg.contains("codex_pane-1 Running"), "{msg}");
}

#[cfg(unix)]
#[test]
fn codex_sub_agents_report_their_start_and_stop() {
    let payload = |event: &str, tail: &str| {
        format!(
            r#"{{"session_id":"s1","turn_id":"t1","transcript_path":null,"cwd":"/tmp","hook_event_name":"{event}","model":"m","permission_mode":"default","agent_id":"019a-77","agent_type":"default"{tail}}}"#
        )
    };
    let start = run_codex_hook(&codex_child_cmd("start"), &payload("SubagentStart", "")).unwrap();
    assert!(start.starts_with("agent_child 'proj' codex_pane-1 019a-77 start"), "{start}");
    let quoted = r#","last_assistant_message":"done: \"agent_id\":\"fake\"""#;
    let stop = run_codex_hook(&codex_child_cmd("stop"), &payload("SubagentStop", quoted)).unwrap();
    assert!(stop.starts_with("agent_child 'proj' codex_pane-1 019a-77 stop"), "{stop}");
    assert_eq!(run_codex_hook(&codex_child_cmd("start"), r#"{"hook_event_name":"SubagentStart"}"#), None);
}

#[cfg(unix)]
#[test]
fn codex_reports_only_a_compact_the_user_ran() {
    let v: Value = serde_json::from_slice(&merge_codex_hooks(b"{}").unwrap()).unwrap();
    let cmd = |event: &str| v["hooks"][event][0]["hooks"][0]["command"].as_str().unwrap().to_string();
    let payload = |trigger: &str| {
        format!(r#"{{"session_id":"t1","turn_id":"u1","transcript_path":"/t","cwd":"/c","hook_event_name":"PreCompact","model":"m","trigger":"{trigger}"}}"#)
    };
    let msg = run_codex_hook(&cmd("PreCompact"), &payload("manual")).expect("manual compact reports");
    assert!(msg.contains(" codex_pane-1 Running "), "{msg}");
    assert_eq!(run_codex_hook(&cmd("PreCompact"), &payload("auto")), None);
    let msg = run_codex_hook(&cmd("PostCompact"), &payload("manual")).unwrap();
    assert!(msg.starts_with("clear_status 'proj' codex_pane-1 --live"), "{msg}");
}

#[cfg(unix)]
fn permission_payload(transcript: &str) -> String {
    format!(
        r#"{{"session_id":"s1","turn_id":"t1","transcript_path":"{transcript}","cwd":"/tmp/p","hook_event_name":"PermissionRequest","model":"gpt-5","permission_mode":"default","tool_name":"shell","tool_input":{{"command":["git","push"]}}}}"#
    )
}

#[cfg(unix)]
fn rollout_with(dir: &Path, last_turn_context: &str) -> String {
    let path = dir.join("rollout.jsonl");
    let stale = r#"{"timestamp":"T","type":"turn_context","payload":{"turn_id":"t0","approval_policy":"untrusted","approvals_reviewer":"auto_review"}}"#;
    let noise = r#"{"timestamp":"T","type":"reasoning","payload":{"text":"thinking"}}"#;
    std::fs::write(&path, format!("{stale}\n{last_turn_context}\n{noise}\n")).unwrap();
    path.to_string_lossy().into_owned()
}

#[cfg(unix)]
#[test]
fn codex_permission_hook_suppresses_guardian_routed_requests() {
    let cmd = codex_permission_request_cmd();
    let td = tempfile::tempdir().unwrap();

    let auto = rollout_with(
        td.path(),
        r#"{"timestamp":"T","type":"turn_context","payload":{"turn_id":"t1","approval_policy":"on-request","approvals_reviewer":"auto_review"}}"#,
    );
    assert_eq!(
        run_codex_hook(&cmd, &permission_payload(&auto)),
        None,
        "on-request + auto_review routes to the guardian: no Waiting"
    );

    let granular = rollout_with(
        td.path(),
        r#"{"timestamp":"T","type":"turn_context","payload":{"turn_id":"t1","approval_policy":{"granular":{"sandbox_approval":true}},"approvals_reviewer":"auto_review"}}"#,
    );
    assert_eq!(
        run_codex_hook(&cmd, &permission_payload(&granular)),
        None,
        "granular + auto_review routes to the guardian: no Waiting"
    );
}

#[cfg(unix)]
#[test]
fn codex_permission_hook_sends_waiting_for_user_routed_requests() {
    let cmd = codex_permission_request_cmd();
    let td = tempfile::tempdir().unwrap();

    let untrusted = rollout_with(
        td.path(),
        r#"{"timestamp":"T","type":"turn_context","payload":{"turn_id":"t1","approval_policy":"untrusted","approvals_reviewer":"auto_review"}}"#,
    );
    let msg = run_codex_hook(&cmd, &permission_payload(&untrusted)).unwrap();
    assert!(
        msg.contains("codex_pane-1 Waiting"),
        "untrusted policy prompts the user: {msg}"
    );

    let user_reviewer = rollout_with(
        td.path(),
        r#"{"timestamp":"T","type":"turn_context","payload":{"turn_id":"t1","approval_policy":"on-request","approvals_reviewer":"user"}}"#,
    );
    let msg = run_codex_hook(&cmd, &permission_payload(&user_reviewer)).unwrap();
    assert!(msg.contains("codex_pane-1 Waiting"), "user reviewer: {msg}");

    let missing = td.path().join("gone.jsonl").to_string_lossy().into_owned();
    let msg = run_codex_hook(&cmd, &permission_payload(&missing)).unwrap();
    assert!(
        msg.contains("codex_pane-1 Waiting"),
        "unreadable rollout falls back to Waiting: {msg}"
    );
}

/// A turn that dumps large tool output pushes `turn_context` far behind the
/// write head; the gate must still find it instead of failing open. Observed
/// in a live session: the approval request landed 2.3MB past its own
/// `turn_context`, and the badge (plus its chime) fired for a request the
/// auto reviewer approved on its own.
#[cfg(unix)]
#[test]
fn codex_permission_hook_finds_turn_context_behind_bulky_output() {
    let td = tempfile::tempdir().unwrap();
    let path = td.path().join("bulky.jsonl");
    let tc = r#"{"timestamp":"T","type":"turn_context","payload":{"turn_id":"t1","approval_policy":"on-request","approvals_reviewer":"auto_review"}}"#;
    let bulk = format!(
        r#"{{"timestamp":"T","type":"event_msg","payload":{{"text":"{}"}}}}"#,
        "o".repeat(2 * 1024 * 1024)
    );
    std::fs::write(&path, format!("{tc}\n{bulk}\n")).unwrap();

    let transcript = path.to_string_lossy().into_owned();
    assert_eq!(
        run_codex_hook(
            &codex_permission_request_cmd(),
            &permission_payload(&transcript)
        ),
        None,
        "turn_context beyond the first tail window still suppresses Waiting"
    );
}

/// Every hook must consume the payload the agent writes to its stdin. A hook
/// that exits without reading breaks the agent's write once the payload
/// outgrows the pipe buffer (Codex prints `failed to write hook stdin`).
#[test]
fn codex_hooks_drain_oversized_payloads() {
    use std::io::Write;
    let payload = format!(
        r#"{{"session_id":"s1","transcript_path":"/tmp/r.jsonl","cwd":"/tmp/p","permission_mode":"default","tool_name":"shell","tool_output":"{}"}}"#,
        "o".repeat(1024 * 1024)
    );
    let cmds = [
        send_cmd("set_status 'p' k Running"),
        codex_pre_tool_use_cmd(),
        codex_permission_request_cmd(),
    ];
    for cmd in cmds {
        // Isolate the child from the developer's own lpm terminal: with no
        // LPM_SOCKET_PATH the hook globs $HOME/.lpm/lpm.sock — the LIVE app's
        // socket — and would deliver under the inherited LPM_PROJECT_NAME /
        // LPM_PANE_ID, pinning a real Waiting badge (chime, phone push) on
        // whichever tab ran the suite.
        let home = tempfile::tempdir().unwrap();
        let mut child = std::process::Command::new(posix_sh())
            .arg("-c")
            .arg(&cmd)
            .env_remove("TMUX")
            .env_remove("LPM_SOCKET_PATH")
            .env_remove("LPM_PROJECT_NAME")
            .env_remove("LPM_PANE_ID")
            .env("HOME", home.path())
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .unwrap();
        let wrote = child.stdin.take().unwrap().write_all(payload.as_bytes());
        child.wait().unwrap();
        assert!(wrote.is_ok(), "hook closed stdin early: {wrote:?}\n{cmd}");
    }
}

#[cfg(unix)]
#[test]
fn codex_pre_tool_hook_maps_tool_name_to_status() {
    let cmd = codex_pre_tool_use_cmd();
    let base = r#"{"session_id":"s1","turn_id":"t1","transcript_path":"/tmp/r.jsonl","cwd":"/tmp/p","hook_event_name":"PreToolUse","model":"gpt-5","permission_mode":"default","tool_name":"TOOL","tool_input":INPUT,"tool_use_id":"u1"}"#;

    let ask = base
        .replace("TOOL", "request_user_input")
        .replace("INPUT", r#"{"questions":[]}"#);
    let msg = run_codex_hook(&cmd, &ask).unwrap();
    assert!(
        msg.contains("codex_pane-1 Waiting"),
        "request_user_input blocks on the user: {msg}"
    );

    let shell = base
        .replace("TOOL", "shell")
        .replace("INPUT", r#"{"command":["ls"]}"#);
    let msg = run_codex_hook(&cmd, &shell).unwrap();
    assert!(msg.contains("codex_pane-1 Running"), "shell runs: {msg}");

    // A tool whose own arguments carry a raw `tool_name` key must not fool
    // the extraction into reading the nested value.
    let decoy = base
        .replace("TOOL", "shell")
        .replace("INPUT", r#"{"tool_name":"request_user_input"}"#);
    let msg = run_codex_hook(&cmd, &decoy).unwrap();
    assert!(
        msg.contains("codex_pane-1 Running"),
        "nested tool_name decoy must not flip the status: {msg}"
    );
}

#[test]
fn codex_feature_enables_hooks() {
    assert_eq!(merge_codex_feature("", "hooks").unwrap(), "[features]\nhooks = true\n");
    assert_eq!(
        merge_codex_feature("model = \"o3\"\n[features]\nweb = true\n", "hooks").unwrap(),
        "model = \"o3\"\n[features]\nweb = true\nhooks = true\n"
    );
    assert!(merge_codex_feature("[features]\nhooks = true\n", "hooks").is_none());
    // A hooks key outside [features] (e.g. lpm's own [hooks.state]) doesn't count.
    let other_section = merge_codex_feature("[hooks.state]\nhooks = true\n", "hooks").unwrap();
    assert!(other_section.contains("[features]\nhooks = true\n"));
}

/// Valid TOML that the old line matcher didn't recognize as `[features]`
/// got a second table appended, and Codex refused to start.
#[test]
fn codex_feature_edits_any_valid_features_table_in_place() {
    for (config, expected) in [
        ("[features] # mine\nweb = true\n", "[features] # mine\nweb = true\nhooks = true\n"),
        ("[ features ]\nweb = true\n", "[ features ]\nweb = true\nhooks = true\n"),
        ("features = { web = true }\n", "features = { web = true , hooks = true }\n"),
    ] {
        let out = merge_codex_feature(config, "hooks").unwrap();
        assert_eq!(out, expected);
        assert!(out.parse::<toml_edit::DocumentMut>().is_ok(), "{out}");
    }
    assert_eq!(merge_codex_feature("[features\nbroken", "hooks"), None, "never rewrite what can't be read");
}

#[test]
fn codex_feature_migrates_deprecated_flag() {
    let migrated =
        merge_codex_feature("[features]\ncodex_hooks = true\n\n[other]\nx = 1\n", "hooks").unwrap();
    assert_eq!(migrated, "[features]\nhooks = true\n\n[other]\nx = 1\n");
    // Both present: only the deprecated flag is dropped.
    let both = merge_codex_feature("[features]\nhooks = true\ncodex_hooks = true\n", "hooks").unwrap();
    assert_eq!(both, "[features]\nhooks = true\n");
    assert!(merge_codex_feature(&both, "hooks").is_none(), "migration settles");
    let old = merge_codex_feature("[features]\nhooks = true\n", "codex_hooks").unwrap();
    assert_eq!(old, "[features]\ncodex_hooks = true\n", "the name Codex 0.123 and older read");
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
