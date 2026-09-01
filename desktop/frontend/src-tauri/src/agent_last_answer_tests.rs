use super::*;
use serde_json::json;
use std::fs;
use tempfile::TempDir;

/// The answer texts alone, for the assertions that are about which answers came
/// back and in what order rather than about their stamps.
fn texts(answers: Vec<RecentAnswer>) -> Vec<String> {
    answers.into_iter().map(|answer| answer.text).collect()
}

fn stamped(mut record: Value, timestamp: &str) -> Value {
    record["timestamp"] = json!(timestamp);
    record
}

fn write_jsonl(path: &Path, lines: &[Value]) {
    let body = lines
        .iter()
        .map(Value::to_string)
        .collect::<Vec<_>>()
        .join("\n");
    fs::write(path, format!("{body}\n")).unwrap();
}

fn assistant(id: &str, block: Value) -> Value {
    json!({
        "type": "assistant",
        "isSidechain": false,
        "message": {"id": id, "content": [block]},
    })
}

fn text_block(text: &str) -> Value {
    json!({"type": "text", "text": text})
}

fn thinking_block(text: &str) -> Value {
    json!({"type": "thinking", "thinking": text})
}

fn tool_use_block(name: &str) -> Value {
    json!({"type": "tool_use", "name": name, "input": {}})
}

fn tool_result(text: &str) -> Value {
    json!({
        "type": "user",
        "message": {"role": "user", "content": [{"type": "tool_result", "content": text}]},
    })
}

#[test]
fn claude_joins_every_text_block_of_the_newest_message() {
    let dir = TempDir::new().unwrap();
    let transcript = dir.path().join("session.jsonl");
    write_jsonl(
        &transcript,
        &[
            assistant("msg_old", text_block("An older answer.")),
            assistant("msg_last", thinking_block("weighing it up")),
            assistant("msg_last", text_block("First half.")),
            assistant("msg_last", tool_use_block("Bash")),
            assistant("msg_last", text_block("Second half.")),
            assistant("msg_last", text_block("   ")),
            assistant("msg_last", tool_use_block("Read")),
        ],
    );

    assert_eq!(
        claude_last_answer(&transcript, INITIAL_TAIL_BYTES)
            .unwrap()
            .as_deref(),
        Some("First half.\n\nSecond half.")
    );
}

#[test]
fn claude_skips_the_title_and_prompt_records_written_after_the_answer() {
    let dir = TempDir::new().unwrap();
    let transcript = dir.path().join("session.jsonl");
    write_jsonl(
        &transcript,
        &[
            assistant(
                "msg_last",
                text_block("The composer footer row is in flow."),
            ),
            json!({"type": "user", "message": {"role": "user", "content": "thanks"}}),
            json!({"type": "ai-title", "aiTitle": "Composer footer"}),
            json!({"type": "custom-title", "customTitle": "Mine"}),
            json!({"type": "last-prompt", "lastPrompt": "why is the footer floating"}),
        ],
    );

    assert_eq!(
        claude_last_answer(&transcript, INITIAL_TAIL_BYTES)
            .unwrap()
            .as_deref(),
        Some("The composer footer row is in flow.")
    );
}

#[test]
fn claude_ignores_newer_sidechain_answers() {
    let dir = TempDir::new().unwrap();
    let transcript = dir.path().join("session.jsonl");
    let mut sidechain = assistant("msg_sub", text_block("A subagent's answer."));
    sidechain["isSidechain"] = json!(true);
    write_jsonl(
        &transcript,
        &[
            assistant("msg_last", text_block("The real answer.")),
            sidechain,
        ],
    );

    assert_eq!(
        claude_last_answer(&transcript, INITIAL_TAIL_BYTES)
            .unwrap()
            .as_deref(),
        Some("The real answer.")
    );
}

#[test]
fn claude_skips_a_half_written_trailing_record() {
    let dir = TempDir::new().unwrap();
    let transcript = dir.path().join("session.jsonl");
    // The record is whole but its newline has not been written yet, so it is
    // not a record the scan may read.
    fs::write(
        &transcript,
        format!(
            "{}\n{}",
            assistant("msg_last", text_block("The finished answer.")),
            assistant("msg_next", text_block("Still being written."))
        ),
    )
    .unwrap();

    assert_eq!(
        claude_last_answer(&transcript, INITIAL_TAIL_BYTES)
            .unwrap()
            .as_deref(),
        Some("The finished answer.")
    );
}

#[test]
fn claude_widens_the_window_past_trailing_tool_results() {
    let dir = TempDir::new().unwrap();
    let transcript = dir.path().join("session.jsonl");
    let mut lines = vec![assistant("msg_last", text_block("Buried but final."))];
    lines.extend((0..40).map(|n| tool_result(&format!("output line {n} padded out a little"))));
    write_jsonl(&transcript, &lines);
    assert!(fs::metadata(&transcript).unwrap().len() > 4 * 256);

    assert_eq!(
        claude_last_answer(&transcript, 256).unwrap().as_deref(),
        Some("Buried but final.")
    );
}

#[test]
fn claude_reports_no_answer_for_a_missing_or_answerless_transcript() {
    let dir = TempDir::new().unwrap();
    let missing = dir.path().join("missing.jsonl");
    assert_eq!(
        claude_last_answer(&missing, INITIAL_TAIL_BYTES).unwrap(),
        None
    );

    let transcript = dir.path().join("session.jsonl");
    write_jsonl(
        &transcript,
        &[
            assistant("msg_last", thinking_block("still working")),
            assistant("msg_last", tool_use_block("Edit")),
        ],
    );
    assert_eq!(
        claude_last_answer(&transcript, INITIAL_TAIL_BYTES).unwrap(),
        None
    );
}

#[test]
fn claude_lists_answers_newest_first_assembling_each_from_its_records() {
    let dir = TempDir::new().unwrap();
    let transcript = dir.path().join("session.jsonl");
    write_jsonl(
        &transcript,
        &[
            assistant("msg_1", text_block("Oldest answer.")),
            tool_result("first tool output"),
            assistant("msg_2", thinking_block("weighing it up")),
            assistant("msg_2", text_block("Middle, first half.")),
            assistant("msg_2", tool_use_block("Bash")),
            tool_result("output of that Bash call"),
            assistant("msg_2", text_block("Middle, second half.")),
            tool_result("more output"),
            assistant("msg_3", text_block("Newest answer.")),
        ],
    );

    assert_eq!(
        texts(claude_answers(&transcript, INITIAL_TAIL_BYTES, 10).unwrap()),
        [
            "Newest answer.",
            "Middle, first half.\n\nMiddle, second half.",
            "Oldest answer.",
        ]
    );
}

#[test]
fn claude_answers_stop_at_the_requested_count() {
    let dir = TempDir::new().unwrap();
    let transcript = dir.path().join("session.jsonl");
    write_jsonl(
        &transcript,
        &[
            assistant("msg_1", text_block("First.")),
            assistant("msg_2", text_block("Second.")),
            assistant("msg_3", text_block("Third.")),
            assistant("msg_4", text_block("Fourth.")),
        ],
    );

    assert_eq!(
        texts(claude_answers(&transcript, INITIAL_TAIL_BYTES, 2).unwrap()),
        ["Fourth.", "Third."]
    );
    assert_eq!(
        texts(claude_answers(&transcript, INITIAL_TAIL_BYTES, 1).unwrap()),
        ["Fourth."]
    );
}

#[test]
fn claude_widens_the_window_until_the_requested_count_is_gathered() {
    let dir = TempDir::new().unwrap();
    let transcript = dir.path().join("session.jsonl");
    let mut lines = Vec::new();
    for answer in ["Oldest.", "Middle.", "Newest."] {
        lines.push(assistant(answer, text_block(answer)));
        lines.extend((0..12).map(|n| tool_result(&format!("padding line {n} for {answer}"))));
    }
    write_jsonl(&transcript, &lines);
    assert!(fs::metadata(&transcript).unwrap().len() > 16 * 256);

    assert_eq!(
        texts(claude_answers(&transcript, 256, 3).unwrap()),
        ["Newest.", "Middle.", "Oldest."]
    );
    // Asking for more than the session holds returns what there is.
    assert_eq!(claude_answers(&transcript, 256, 9).unwrap().len(), 3);
}

#[test]
fn claude_answers_carry_the_stamp_of_the_record_that_landed_them() {
    let dir = TempDir::new().unwrap();
    let transcript = dir.path().join("session.jsonl");
    write_jsonl(
        &transcript,
        &[
            stamped(
                assistant("msg_1", text_block("First half.")),
                "2026-09-01T15:05:10.000Z",
            ),
            // Skipped for having no text, so it cannot stamp the answer either.
            stamped(
                assistant("msg_1", tool_use_block("Bash")),
                "2026-09-01T15:05:12.000Z",
            ),
            stamped(
                assistant("msg_1", text_block("Second half.")),
                "2026-09-01T15:05:15.949Z",
            ),
            assistant("msg_2", text_block("Answer with no stamp.")),
        ],
    );

    let answers = claude_answers(&transcript, INITIAL_TAIL_BYTES, 10).unwrap();
    assert_eq!(
        answers,
        [
            RecentAnswer {
                text: "Answer with no stamp.".into(),
                at: None,
            },
            RecentAnswer {
                text: "First half.\n\nSecond half.".into(),
                at: Some(1_788_275_115_949),
            },
        ]
    );
}
