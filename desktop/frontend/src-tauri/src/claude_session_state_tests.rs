use super::*;
use serde_json::json;

fn window(lines: &[Value]) -> String {
    let body = lines
        .iter()
        .map(Value::to_string)
        .collect::<Vec<_>>()
        .join("\n");
    format!("{body}\n")
}

fn assistant(model: &str, effort: &str, at: &str) -> Value {
    json!({
        "type": "assistant",
        "isSidechain": false,
        "message": {"model": model, "content": [{"type": "text", "text": "hi"}]},
        "effort": effort,
        "perTurnEffort": Value::Null,
        "timestamp": at,
    })
}

fn newest(lines: &[Value]) -> Option<ClaudeSessionState> {
    newest_state(&window(lines), 1).into_iter().next()
}

#[test]
fn reads_the_newest_record_s_model_and_level() {
    let state = newest(&[
        assistant("claude-opus-5", "high", "2026-09-21T10:00:00.000Z"),
        assistant("claude-opus-5", "xhigh", "2026-09-21T10:05:00.000Z"),
    ])
    .expect("a record describes the session");
    assert_eq!(state.model, "claude-opus-5");
    assert_eq!(state.effort, "xhigh");
    assert_eq!(state.at, Some(1789985100000));
}

#[test]
fn keeps_the_model_id_s_variant() {
    // "Opus 5 (1M context)" is the Opus row all the same; mapping that is the
    // caller's job, so the id comes back whole.
    let state = newest(&[assistant(
        "claude-opus-5[1m]",
        "xhigh",
        "2026-09-21T10:00:00.000Z",
    )])
    .unwrap();
    assert_eq!(state.model, "claude-opus-5[1m]");
}

#[test]
fn skips_a_spawned_agent_s_own_level() {
    let mut sidechain = assistant("claude-haiku-4-5", "low", "2026-09-21T10:06:00.000Z");
    sidechain["isSidechain"] = json!(true);
    let state = newest(&[
        assistant("claude-opus-5", "xhigh", "2026-09-21T10:05:00.000Z"),
        sidechain,
    ])
    .unwrap();
    assert_eq!(state.effort, "xhigh");
    assert_eq!(state.model, "claude-opus-5");
}

#[test]
fn skips_a_turn_scoped_override() {
    let mut per_turn = assistant("claude-opus-5", "max", "2026-09-21T10:06:00.000Z");
    per_turn["perTurnEffort"] = json!("max");
    let state = newest(&[
        assistant("claude-opus-5", "high", "2026-09-21T10:05:00.000Z"),
        per_turn,
    ])
    .unwrap();
    assert_eq!(state.effort, "high");
}

#[test]
fn ignores_records_that_describe_no_session() {
    assert!(newest(&[json!({"type": "user", "effort": "max"})]).is_none());
    assert!(
        newest(&[json!({"type": "assistant", "message": {"model": SYNTHETIC_MODEL}})]).is_none()
    );
    assert!(newest(&[json!({"type": "assistant"})]).is_none());
    assert!(newest(&[]).is_none());
}

#[test]
fn a_record_still_being_written_is_not_read() {
    // Whole lines only: the newline is what makes a record complete.
    let half = json!({"type": "assistant", "message": {"model": "claude-opus-5"}, "effort": "max"})
        .to_string();
    let done = assistant("claude-opus-5", "high", "2026-09-21T10:05:00.000Z").to_string();
    let state = newest_state(&format!("{done}\n{half}"), 1)
        .into_iter()
        .next()
        .unwrap();
    assert_eq!(state.effort, "high");
}

#[test]
fn a_record_with_no_stamp_still_reads() {
    let mut record = assistant("claude-opus-5", "high", "2026-09-21T10:05:00.000Z");
    record["timestamp"] = Value::Null;
    let state = newest(&[record]).unwrap();
    assert_eq!(state.effort, "high");
    assert_eq!(state.at, None);
}

#[test]
fn a_session_id_with_a_path_in_it_is_refused() {
    let err = claude_session_state("lpm".into(), "../../etc/passwd".into()).unwrap_err();
    assert_eq!(err, "invalid agent session id");
}
