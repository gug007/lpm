use super::*;
use crate::agent_last_answer::RecentAnswer;
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::fs;
use std::path::Path;
use tempfile::TempDir;

const SESSION_ID: &str = "019fac59-0da4-7160-b104-5b8429ba1054";
const OTHER_SESSION_ID: &str = "019fac59-0da4-7160-b104-5b8429ba1055";
const INITIAL_TAIL_BYTES: u64 = 4 << 20;

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

// The single-answer view the commands reach through `newest(1)`.
fn codex_last_answer(
    home: &Path,
    session_id: &str,
    window_bytes: u64,
) -> std::io::Result<Option<String>> {
    Ok(codex_answers(home, session_id, window_bytes, 1)?
        .into_iter()
        .next()
        .map(|answer| answer.text))
}

fn codex_rollout_answer(path: &Path, window_bytes: u64) -> std::io::Result<Option<String>> {
    Ok(codex_rollout_answers(path, window_bytes, 1)?
        .into_iter()
        .next()
        .map(|answer| answer.text))
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

#[test]
fn codex_lists_answers_newest_first() {
    let dir = TempDir::new().unwrap();
    let rollout = dir.path().join("rollout.jsonl");
    write_jsonl(
        &rollout,
        &[
            codex_message("developer", &["you are a helpful agent"]),
            codex_message("assistant", &["Oldest answer."]),
            codex_message("user", &["another question"]),
            codex_message("assistant", &["Newest answer.", "With a second part."]),
            codex_task_complete(json!("Newest answer.")),
        ],
    );

    assert_eq!(
        texts(codex_rollout_answers(&rollout, INITIAL_TAIL_BYTES, 10).unwrap()),
        ["Newest answer.\n\nWith a second part.", "Oldest answer."]
    );
    assert_eq!(
        texts(codex_rollout_answers(&rollout, INITIAL_TAIL_BYTES, 1).unwrap()),
        ["Newest answer.\n\nWith a second part."]
    );
}

#[test]
fn codex_answers_fall_back_to_a_lone_task_complete_echo() {
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
        texts(codex_rollout_answers(&rollout, INITIAL_TAIL_BYTES, 10).unwrap()),
        ["fix(tooltip): hide on context menu opening"]
    );
}

#[test]
fn codex_answers_carry_their_record_stamp() {
    let dir = TempDir::new().unwrap();
    let rollout = dir.path().join("rollout.jsonl");
    write_jsonl(
        &rollout,
        &[
            stamped(
                codex_message("assistant", &["An earlier answer."]),
                "2026-09-01T15:05:10.000Z",
            ),
            stamped(
                codex_message("assistant", &["The final answer."]),
                "2026-09-01T15:06:42.168Z",
            ),
        ],
    );
    assert_eq!(
        codex_rollout_answers(&rollout, INITIAL_TAIL_BYTES, 10).unwrap(),
        [
            RecentAnswer {
                text: "The final answer.".into(),
                at: Some(1_788_275_202_168),
            },
            RecentAnswer {
                text: "An earlier answer.".into(),
                at: Some(1_788_275_110_000),
            },
        ]
    );

    // The echo fallback carries its own record's stamp.
    write_jsonl(
        &rollout,
        &[stamped(
            codex_task_complete(json!("fix(tooltip): hide on context menu opening")),
            "2026-09-01T15:06:42.168Z",
        )],
    );
    assert_eq!(
        codex_rollout_answers(&rollout, INITIAL_TAIL_BYTES, 10).unwrap(),
        [RecentAnswer {
            text: "fix(tooltip): hide on context menu opening".into(),
            at: Some(1_788_275_202_168),
        }]
    );
}
