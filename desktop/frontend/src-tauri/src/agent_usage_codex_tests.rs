use super::*;
use crate::agent_usage::test_matcher;
use std::io::Write;
use std::path::PathBuf;

fn session_meta(dir: &Path, subagent: bool) -> Value {
    let mut payload = serde_json::json!({ "id": "session", "cwd": dir });
    if subagent {
        payload["thread_source"] = "subagent".into();
        payload["forked_from_id"] = "parent".into();
    }
    serde_json::json!({
        "timestamp": "2026-07-15T10:00:00Z",
        "type": "session_meta",
        "payload": payload
    })
}

fn turn_context(dir: &Path, model: &str) -> Value {
    serde_json::json!({
        "timestamp": "2026-07-15T10:00:00Z",
        "type": "turn_context",
        "payload": { "cwd": dir, "model": model }
    })
}

fn token_count(timestamp: &str, cumulative: u64, turn: u64) -> Value {
    serde_json::json!({
        "timestamp": timestamp,
        "type": "event_msg",
        "payload": {
            "type": "token_count",
            "info": {
                "total_token_usage": {
                    "input_tokens": cumulative,
                    "cached_input_tokens": 0,
                    "output_tokens": 0,
                    "total_tokens": cumulative
                },
                "last_token_usage": {
                    "input_tokens": turn,
                    "cached_input_tokens": 0,
                    "output_tokens": 0,
                    "total_tokens": turn
                }
            }
        }
    })
}

fn usage_record(timestamp: &str, response: &str, input: u64, cached: u64, output: u64) -> Value {
    serde_json::json!({
        "timestamp": timestamp,
        "type": "token_usage_record",
        "payload": {
            "response_id": response,
            "usage": {
                "input_tokens": input,
                "cached_input_tokens": cached,
                "cache_write_input_tokens": 0,
                "output_tokens": output,
                "reasoning_output_tokens": 0,
                "total_tokens": input + output
            }
        }
    })
}

fn service_tier(tier: &str) -> Value {
    serde_json::json!({
        "timestamp": "2026-07-15T10:00:00Z",
        "type": "event_msg",
        "payload": {
            "type": "thread_settings_applied",
            "thread_settings": { "model": "gpt-5.6-sol", "service_tier": tier }
        }
    })
}

fn write_rollout(dir: &Path, records: &[Value]) -> PathBuf {
    let path = dir.join("session.jsonl");
    let mut file = File::create(&path).unwrap();
    for record in records {
        writeln!(file, "{record}").unwrap();
    }
    path
}

fn parse(dir: &Path, records: &[Value]) -> Vec<UsageEvent> {
    parse_codex_file(&write_rollout(dir, records), &test_matcher(dir), None)
}

fn total_tokens(events: &[UsageEvent]) -> u64 {
    events
        .iter()
        .map(|event| event.tokens.total_tokens)
        .sum::<u64>()
}

#[test]
fn codex_converts_cumulative_counts_to_deltas() {
    let dir = tempfile::tempdir().unwrap();
    let mut records = vec![
        serde_json::json!({
            "timestamp": "2026-07-15T10:00:00Z",
            "type": "session_meta",
            "payload": { "id": "session", "cwd": dir.path() }
        }),
        turn_context(dir.path(), "gpt-test"),
    ];
    for (timestamp, input, output) in [
        ("2026-07-15T10:00:02Z", 100, 20),
        ("2026-07-15T10:00:03Z", 160, 35),
    ] {
        records.push(serde_json::json!({
            "timestamp": timestamp,
            "type": "event_msg",
            "payload": {
                "type": "token_count",
                "info": { "total_token_usage": {
                    "input_tokens": input,
                    "cached_input_tokens": 40,
                    "output_tokens": output,
                    "reasoning_output_tokens": 5,
                    "total_tokens": input + output
                }}
            }
        }));
    }
    let events = parse(dir.path(), &records);
    assert_eq!(events.len(), 2);
    let mut total = TokenUsage::default();
    for event in events {
        total.add(event.tokens);
    }
    assert_eq!(total.input_tokens, 160);
    assert_eq!(total.output_tokens, 35);
    assert_eq!(total.total_tokens, 195);
}

#[test]
fn codex_prefers_per_turn_usage_over_cumulative_dips() {
    let dir = tempfile::tempdir().unwrap();
    let events = parse(
        dir.path(),
        &[
            session_meta(dir.path(), false),
            token_count("2026-07-15T10:00:01Z", 5_000_000, 5_000_000),
            token_count("2026-07-15T10:00:02Z", 6_000_000, 1_000_000),
            token_count("2026-07-15T10:00:03Z", 4_500_000, 700_000),
            token_count("2026-07-15T10:00:04Z", 6_400_000, 400_000),
        ],
    );
    assert_eq!(events.len(), 4);
    assert_eq!(total_tokens(&events), 7_100_000);
}

#[test]
fn codex_skips_replayed_history_in_forked_rollouts() {
    let dir = tempfile::tempdir().unwrap();
    let events = parse(
        dir.path(),
        &[
            session_meta(dir.path(), true),
            session_meta(dir.path(), false),
            token_count("2026-07-15T11:59:59.996Z", 1_000_000, 1_000_000),
            token_count("2026-07-15T11:59:59.999Z", 3_000_000, 2_000_000),
            token_count("2026-07-15T12:00:00.004Z", 6_000_000, 3_000_000),
            token_count("2026-07-15T12:00:13.000Z", 6_050_000, 50_000),
        ],
    );
    assert_eq!(events.len(), 1);
    assert_eq!(total_tokens(&events), 50_000);
}

#[test]
fn codex_keeps_first_turn_of_a_fork_without_replay() {
    let dir = tempfile::tempdir().unwrap();
    let events = parse(
        dir.path(),
        &[
            session_meta(dir.path(), true),
            token_count("2026-07-15T12:00:00Z", 40_000, 40_000),
            token_count("2026-07-15T12:01:00Z", 90_000, 50_000),
        ],
    );
    assert_eq!(events.len(), 2);
    assert_eq!(total_tokens(&events), 90_000);
}

#[test]
fn codex_skips_token_counts_resent_on_a_rate_limit_refresh() {
    let dir = tempfile::tempdir().unwrap();
    let events = parse(
        dir.path(),
        &[
            session_meta(dir.path(), false),
            token_count("2026-07-15T10:00:01Z", 40_000, 40_000),
            token_count("2026-07-15T10:00:02Z", 40_000, 40_000),
            token_count("2026-07-15T10:01:00Z", 90_000, 50_000),
        ],
    );
    assert_eq!(events.len(), 2);
    assert_eq!(total_tokens(&events), 90_000);
}

#[test]
fn codex_ignores_the_estimate_rows_written_after_a_compaction() {
    let dir = tempfile::tempdir().unwrap();
    let mut estimate = token_count("2026-07-15T10:00:02Z", 40_000, 0);
    estimate["payload"]["info"]["last_token_usage"]["total_tokens"] = 15_206.into();
    estimate["payload"]["info"]["total_token_usage"] = serde_json::json!({
        "input_tokens": 0,
        "output_tokens": 0,
        "total_tokens": 258_400
    });
    let events = parse(
        dir.path(),
        &[
            session_meta(dir.path(), false),
            token_count("2026-07-15T10:00:01Z", 40_000, 40_000),
            estimate,
        ],
    );
    assert_eq!(events.len(), 1);
    assert_eq!(total_tokens(&events), 40_000);
}

#[test]
fn codex_bills_usage_records_once_per_response() {
    let dir = tempfile::tempdir().unwrap();
    let events = parse(
        dir.path(),
        &[
            session_meta(dir.path(), false),
            turn_context(dir.path(), "gpt-6-astra"),
            usage_record("2026-07-15T10:00:01Z", "resp_1", 1_000, 800, 20),
            token_count("2026-07-15T10:00:01Z", 1_020, 1_020),
            usage_record("2026-07-15T10:00:05Z", "resp_2", 2_000, 1_500, 30),
            token_count("2026-07-15T10:00:05Z", 3_050, 2_030),
            token_count("2026-07-15T10:00:06Z", 3_050, 2_030),
            usage_record("2026-07-15T10:00:05Z", "resp_2", 2_000, 1_500, 30),
            usage_record("2026-07-15T10:01:00Z", "resp_compact", 224_000, 0, 4_000),
        ],
    );
    assert_eq!(events.len(), 3);
    assert_eq!(total_tokens(&events), 1_020 + 2_030 + 228_000);
    assert!(events.iter().all(|event| event.model == "gpt-6-astra"));
    let cached: u64 = events
        .iter()
        .map(|event| event.tokens.cache_read_input_tokens)
        .sum();
    assert_eq!(cached, 2_300);
}

#[test]
fn codex_counts_cache_writes_inside_the_input() {
    let tokens = codex_tokens(&serde_json::json!({
        "input_tokens": 100,
        "cached_input_tokens": 40,
        "cache_write_input_tokens": 60,
        "output_tokens": 10,
        "reasoning_output_tokens": 4,
        "total_tokens": 110
    }));
    assert_eq!(tokens.input_tokens, 100);
    assert_eq!(tokens.cache_read_input_tokens, 40);
    assert_eq!(tokens.cache_creation_input_tokens, 60);
    assert_eq!(tokens.cached_input_tokens, 100);
    assert_eq!(tokens.reasoning_tokens, 4);
    assert_eq!(tokens.total_tokens, 110);
}

#[test]
fn codex_marks_turns_run_on_the_fast_tier() {
    let dir = tempfile::tempdir().unwrap();
    let events = parse(
        dir.path(),
        &[
            session_meta(dir.path(), false),
            service_tier("default"),
            usage_record("2026-07-15T10:00:01Z", "resp_1", 1_000, 0, 20),
            service_tier("priority"),
            usage_record("2026-07-15T10:00:05Z", "resp_2", 2_000, 0, 30),
        ],
    );
    let fast: Vec<bool> = events.iter().map(|event| event.fast).collect();
    assert_eq!(fast, vec![false, true]);
}

#[test]
fn codex_counts_token_counts_an_older_build_appends_after_usage_records() {
    let dir = tempfile::tempdir().unwrap();
    let events = parse(
        dir.path(),
        &[
            session_meta(dir.path(), false),
            usage_record("2026-07-15T10:00:01Z", "resp_1", 1_000, 0, 0),
            token_count("2026-07-15T10:00:01Z", 1_000, 1_000),
            token_count("2026-07-15T10:05:00Z", 6_000, 5_000),
            token_count("2026-07-15T10:06:00Z", 13_000, 7_000),
        ],
    );
    assert_eq!(events.len(), 3);
    assert_eq!(total_tokens(&events), 13_000);
}

#[test]
fn codex_applies_the_first_logged_tier_to_the_turns_before_it() {
    let dir = tempfile::tempdir().unwrap();
    let events = parse(
        dir.path(),
        &[
            session_meta(dir.path(), false),
            usage_record("2026-07-15T10:00:01Z", "resp_1", 1_000, 0, 20),
            service_tier("priority"),
            usage_record("2026-07-15T10:00:05Z", "resp_2", 2_000, 0, 30),
        ],
    );
    let fast: Vec<bool> = events.iter().map(|event| event.fast).collect();
    assert_eq!(fast, vec![true, true]);
}
