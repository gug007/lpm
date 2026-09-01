use super::*;
use rusqlite::params;
use serde_json::json;
use std::fs;
use tempfile::TempDir;

const SESSION_ID: &str = "019fac59-0da4-7160-b104-5b8429ba1054";
const OTHER_SESSION_ID: &str = "019fac59-0da4-7160-b104-5b8429ba1055";

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

fn codex_message(role: &str, texts: &[&str]) -> Value {
    let content = texts
        .iter()
        .map(|text| json!({"type": if role == "assistant" { "output_text" } else { "input_text" }, "text": text}))
        .collect::<Vec<_>>();
    json!({
        "type": "response_item",
        "payload": {"type": "message", "id": "msg_023d", "role": role, "content": content},
    })
}

fn codex_task_complete(message: Value) -> Value {
    json!({
        "type": "event_msg",
        "payload": {"type": "task_complete", "last_agent_message": message},
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
fn codex_takes_the_last_assistant_message_over_the_task_complete_echo() {
    let dir = TempDir::new().unwrap();
    let rollout = dir.path().join("rollout.jsonl");
    write_jsonl(
        &rollout,
        &[
            codex_message("developer", &["you are a helpful agent"]),
            codex_message("assistant", &["An earlier answer."]),
            codex_message("user", &["and now the real question"]),
            codex_message("assistant", &["The final answer.", "With a second part."]),
            codex_task_complete(json!("The final answer.")),
        ],
    );

    assert_eq!(
        codex_rollout_answer(&rollout, INITIAL_TAIL_BYTES)
            .unwrap()
            .as_deref(),
        Some("The final answer.\n\nWith a second part.")
    );
}

#[test]
fn codex_falls_back_to_the_task_complete_message() {
    let dir = TempDir::new().unwrap();
    let rollout = dir.path().join("rollout.jsonl");
    write_jsonl(
        &rollout,
        &[
            codex_message("user", &["write the commit message"]),
            codex_task_complete(json!("fix(tooltip): hide on context menu opening")),
        ],
    );
    assert_eq!(
        codex_rollout_answer(&rollout, INITIAL_TAIL_BYTES)
            .unwrap()
            .as_deref(),
        Some("fix(tooltip): hide on context menu opening")
    );

    write_jsonl(&rollout, &[codex_task_complete(Value::Null)]);
    assert_eq!(
        codex_rollout_answer(&rollout, INITIAL_TAIL_BYTES).unwrap(),
        None
    );
}

#[test]
fn codex_reads_the_rollout_path_from_the_thread_database() {
    let home = TempDir::new().unwrap();
    let sessions = home.path().join("sessions/2026/09/01");
    fs::create_dir_all(&sessions).unwrap();
    let name = format!("rollout-2026-09-01T14-14-33-{SESSION_ID}.jsonl");
    write_jsonl(
        &sessions.join(&name),
        &[codex_message("assistant", &["From the database."])],
    );

    let connection = Connection::open(home.path().join("state_1.sqlite")).unwrap();
    connection
        .execute_batch("CREATE TABLE threads (id TEXT PRIMARY KEY, rollout_path TEXT);")
        .unwrap();
    connection
        .execute(
            "INSERT INTO threads VALUES (?1, ?2)",
            params![SESSION_ID, format!("sessions/2026/09/01/{name}")],
        )
        .unwrap();

    assert_eq!(
        codex_last_answer(home.path(), SESSION_ID, INITIAL_TAIL_BYTES)
            .unwrap()
            .as_deref(),
        Some("From the database.")
    );
}

#[test]
fn codex_finds_the_rollout_by_filename_without_a_database() {
    let home = TempDir::new().unwrap();
    let older = home.path().join("sessions/2026/08/31");
    let newer = home.path().join("sessions/2026/09/01");
    fs::create_dir_all(&older).unwrap();
    fs::create_dir_all(&newer).unwrap();
    write_jsonl(
        &older.join(format!(
            "rollout-2026-08-31T09-00-00-{OTHER_SESSION_ID}.jsonl"
        )),
        &[codex_message("assistant", &["Another session."])],
    );
    write_jsonl(
        &newer.join(format!("rollout-2026-09-01T14-14-33-{SESSION_ID}.jsonl")),
        &[codex_message("assistant", &["Found by filename."])],
    );

    assert_eq!(
        codex_last_answer(home.path(), SESSION_ID, INITIAL_TAIL_BYTES)
            .unwrap()
            .as_deref(),
        Some("Found by filename.")
    );
    assert_eq!(
        codex_last_answer(
            home.path(),
            "019fac59-0da4-7160-b104-5b8429ba1056",
            INITIAL_TAIL_BYTES
        )
        .unwrap(),
        None
    );
}
