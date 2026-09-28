use super::*;
use crate::agent_usage::test_matcher;
use std::io::Write;

fn write_transcript(dir: &Path, name: &str, records: &[Value]) -> PathBuf {
    let path = dir.join(name);
    let mut file = File::create(&path).unwrap();
    for record in records {
        writeln!(file, "{record}").unwrap();
    }
    path
}

fn assistant(dir: &Path, session: &str, id: &str, model: &str, usage: Value) -> Value {
    serde_json::json!({
        "timestamp": "2026-07-15T10:00:00Z",
        "cwd": dir,
        "sessionId": session,
        "message": { "id": id, "model": model, "usage": usage }
    })
}

fn events_of(dir: &Path, name: &str, records: &[Value]) -> Vec<UsageEvent> {
    let path = write_transcript(dir, name, records);
    dedupe_messages(parse_claude_file(&path, &test_matcher(dir), None))
}

#[test]
fn claude_deduplicates_streamed_message_updates() {
    let dir = tempfile::tempdir().unwrap();
    let records: Vec<Value> = [5, 5, 120]
        .into_iter()
        .map(|output| {
            assistant(
                dir.path(),
                "session",
                "message",
                "claude-test",
                serde_json::json!({
                    "input_tokens": 2,
                    "cache_creation_input_tokens": 100,
                    "cache_read_input_tokens": 50,
                    "output_tokens": output
                }),
            )
        })
        .collect();
    let events = events_of(dir.path(), "session.jsonl", &records);
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].tokens.input_tokens, 152);
    assert_eq!(events[0].tokens.cached_input_tokens, 150);
    assert_eq!(events[0].tokens.cache_creation_input_tokens, 100);
    assert_eq!(events[0].tokens.cache_read_input_tokens, 50);
    assert_eq!(events[0].tokens.output_tokens, 120);
    assert_eq!(events[0].tokens.total_tokens, 272);
    assert!(!events[0].fast);
}

#[test]
fn claude_keeps_one_hour_cache_writes_apart() {
    let dir = tempfile::tempdir().unwrap();
    let events = events_of(
        dir.path(),
        "session.jsonl",
        &[assistant(
            dir.path(),
            "session",
            "message",
            "claude-opus-5-5",
            serde_json::json!({
                "input_tokens": 2,
                "cache_creation_input_tokens": 300,
                "cache_read_input_tokens": 50,
                "output_tokens": 10,
                "cache_creation": {
                    "ephemeral_5m_input_tokens": 100,
                    "ephemeral_1h_input_tokens": 200
                }
            }),
        )],
    );
    assert_eq!(events[0].tokens.cache_creation_input_tokens, 300);
    assert_eq!(events[0].tokens.cache_creation_1h_input_tokens, 200);
}

#[test]
fn claude_bills_each_iteration_at_its_own_model() {
    let dir = tempfile::tempdir().unwrap();
    let iteration = |kind: &str, model: Value, input: u64, output: u64| {
        serde_json::json!({
            "type": kind,
            "model": model,
            "input_tokens": input,
            "cache_creation_input_tokens": 0,
            "cache_read_input_tokens": 0,
            "output_tokens": output
        })
    };
    let events = events_of(
        dir.path(),
        "session.jsonl",
        &[assistant(
            dir.path(),
            "session",
            "message",
            "claude-opus-5",
            serde_json::json!({
                "input_tokens": 30,
                "cache_creation_input_tokens": 0,
                "cache_read_input_tokens": 0,
                "output_tokens": 7,
                "speed": "fast",
                "iterations": [
                    iteration("message", Value::Null, 10, 3),
                    iteration("advisor_message", "claude-fable-5-1".into(), 500, 40),
                    iteration("message", "claude-opus-5".into(), 20, 4),
                ]
            }),
        )],
    );
    let mut by_model: Vec<(String, u64, u64, bool)> = events
        .iter()
        .map(|event| {
            (
                event.model.clone(),
                event.tokens.input_tokens,
                event.tokens.output_tokens,
                event.fast,
            )
        })
        .collect();
    by_model.sort();
    assert_eq!(
        by_model,
        vec![
            ("claude-fable-5-1".to_string(), 500, 40, false),
            ("claude-opus-5".to_string(), 30, 7, true),
        ]
    );
}

#[test]
fn claude_uses_top_level_usage_without_iterations() {
    let dir = tempfile::tempdir().unwrap();
    let events = events_of(
        dir.path(),
        "session.jsonl",
        &[assistant(
            dir.path(),
            "session",
            "message",
            "claude-opus-5-5",
            serde_json::json!({
                "input_tokens": 4,
                "cache_creation_input_tokens": 0,
                "cache_read_input_tokens": 0,
                "output_tokens": 6,
                "iterations": []
            }),
        )],
    );
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].tokens.total_tokens, 10);
}

#[test]
fn claude_counts_a_message_copied_into_a_forked_session_once() {
    let dir = tempfile::tempdir().unwrap();
    let usage = serde_json::json!({
        "input_tokens": 2,
        "cache_creation_input_tokens": 0,
        "cache_read_input_tokens": 1_000,
        "output_tokens": 30
    });
    let mut keyed = parse_claude_file(
        &write_transcript(
            dir.path(),
            "original.jsonl",
            &[assistant(
                dir.path(),
                "original",
                "msg_1",
                "claude-opus-5-5",
                usage.clone(),
            )],
        ),
        &test_matcher(dir.path()),
        None,
    );
    keyed.extend(parse_claude_file(
        &write_transcript(
            dir.path(),
            "fork.jsonl",
            &[
                assistant(
                    dir.path(),
                    "fork",
                    "msg_1",
                    "claude-opus-5-5",
                    usage.clone(),
                ),
                assistant(dir.path(), "fork", "msg_2", "claude-opus-5-5", usage),
            ],
        ),
        &test_matcher(dir.path()),
        None,
    ));
    let events = dedupe_messages(keyed);
    assert_eq!(events.len(), 2);
    let total: u64 = events.iter().map(|event| event.tokens.total_tokens).sum();
    assert_eq!(total, 2 * 1_032);
}

#[test]
fn claude_skips_zero_usage_placeholders() {
    let dir = tempfile::tempdir().unwrap();
    let events = events_of(
        dir.path(),
        "session.jsonl",
        &[assistant(
            dir.path(),
            "session",
            "message",
            "<synthetic>",
            serde_json::json!({
                "input_tokens": 0,
                "cache_creation_input_tokens": 0,
                "cache_read_input_tokens": 0,
                "output_tokens": 0
            }),
        )],
    );
    assert!(events.is_empty());
}

fn candidate(session: &str, written: i64) -> Candidate {
    Candidate {
        key: "msg_1\0claude-opus-5-5".into(),
        written,
        event: UsageEvent {
            provider: "claude",
            project: session.into(),
            session_id: session.into(),
            model: "claude-opus-5-5".into(),
            timestamp: 1_700_000_000_000,
            tokens: TokenUsage {
                input_tokens: 10,
                total_tokens: 10,
                ..Default::default()
            },
            fast: false,
        },
    }
}

#[test]
fn claude_credits_a_copied_message_to_the_transcript_written_first() {
    for order in [
        ["aaaa-fork", "zzzz-original"],
        ["zzzz-original", "aaaa-fork"],
    ] {
        let events = dedupe_messages(
            order
                .iter()
                .map(|session| {
                    candidate(session, if session.ends_with("original") { 1 } else { 2 })
                })
                .collect(),
        );
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].session_id, "zzzz-original");
        assert_eq!(events[0].project, "zzzz-original");
    }
}

#[test]
fn claude_skips_a_fallback_hop_declined_before_any_output() {
    let dir = tempfile::tempdir().unwrap();
    let hop = |kind: &str, model: &str, input: u64, output: u64| {
        serde_json::json!({
            "type": kind,
            "model": model,
            "input_tokens": input,
            "cache_creation_input_tokens": 0,
            "cache_read_input_tokens": 0,
            "output_tokens": output
        })
    };
    let events = events_of(
        dir.path(),
        "session.jsonl",
        &[assistant(
            dir.path(),
            "session",
            "message",
            "claude-opus-4-8",
            serde_json::json!({
                "input_tokens": 900,
                "cache_creation_input_tokens": 0,
                "cache_read_input_tokens": 0,
                "output_tokens": 264,
                "iterations": [
                    hop("message", "claude-fable-5-1", 400_000, 0),
                    hop("fallback_message", "claude-opus-4-8", 900, 264),
                ]
            }),
        )],
    );
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].model, "claude-opus-4-8");
    assert_eq!(events[0].tokens.total_tokens, 1_164);
}
