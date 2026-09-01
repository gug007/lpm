//! Reading codex's side of a session's answers: the rollout transcript's path
//! (from the thread database, or the sessions tree when no database knows it)
//! and the assistant messages inside it. Split from `agent_last_answer` so each
//! provider's record shapes stay in one place, as the session modules do.
use crate::agent_last_answer::{
    collect_tail, complete_lines, join_answer, text_blocks, RecentAnswer,
};
use crate::agent_session_titles::{codex_state_databases, threads_columns};
use crate::agent_usage::timestamp_millis;
use rusqlite::{Connection, OpenFlags, OptionalExtension};
use serde_json::Value;
use std::io;
use std::path::{Path, PathBuf};
use std::time::Duration;

pub(crate) fn codex_answers(
    home: &Path,
    session_id: &str,
    window_bytes: u64,
    want: usize,
) -> io::Result<Vec<RecentAnswer>> {
    let Some(rollout) = codex_rollout_path(home, session_id) else {
        return Ok(Vec::new());
    };
    codex_rollout_answers(&rollout, window_bytes, want)
}

/// One message record is one whole answer. `task_complete` only echoes the last
/// of them, so it stands in for a rollout that has no message record at all —
/// never for one that sits further from the tail than the window reaches, and
/// never as an extra entry beside the messages it repeats.
pub(crate) fn codex_rollout_answers(
    path: &Path,
    window_bytes: u64,
    want: usize,
) -> io::Result<Vec<RecentAnswer>> {
    let answers = collect_tail(path, window_bytes, want, |window, want| {
        complete_lines(window)
            .rev()
            .filter_map(codex_assistant_answer)
            .take(want)
            .collect()
    })?;
    if !answers.is_empty() {
        return Ok(answers);
    }
    collect_tail(path, window_bytes, 1, |window, want| {
        complete_lines(window)
            .rev()
            .filter_map(codex_task_complete_answer)
            .take(want)
            .collect()
    })
}

fn codex_assistant_answer(line: &str) -> Option<RecentAnswer> {
    if !line.contains("\"role\":\"assistant\"") {
        return None;
    }
    let record = serde_json::from_str::<Value>(line).ok()?;
    let payload = codex_payload(&record, "message")?;
    if payload.get("role").and_then(Value::as_str) != Some("assistant") {
        return None;
    }
    Some(RecentAnswer {
        text: join_answer(text_blocks(payload.get("content"), "output_text"))?,
        at: timestamp_millis(&record),
    })
}

fn codex_task_complete_answer(line: &str) -> Option<RecentAnswer> {
    if !line.contains("task_complete") {
        return None;
    }
    let record = serde_json::from_str::<Value>(line).ok()?;
    let payload = codex_payload(&record, "task_complete")?;
    let message = payload.get("last_agent_message").and_then(Value::as_str)?;
    Some(RecentAnswer {
        text: join_answer(vec![message.to_string()])?,
        at: timestamp_millis(&record),
    })
}

fn codex_payload<'a>(record: &'a Value, payload_type: &str) -> Option<&'a Value> {
    let payload = record.get("payload")?;
    (payload.get("type").and_then(Value::as_str) == Some(payload_type)).then_some(payload)
}

fn codex_rollout_path(home: &Path, session_id: &str) -> Option<PathBuf> {
    for database in codex_state_databases(home) {
        let Ok(Some(recorded)) = codex_rollout_from_database(home, &database, session_id) else {
            continue;
        };
        let path = home.join(recorded);
        if path.is_file() {
            return Some(path);
        }
    }
    codex_rollout_by_filename(home, session_id)
}

fn codex_rollout_from_database(
    home: &Path,
    path: &Path,
    session_id: &str,
) -> rusqlite::Result<Option<String>> {
    let connection = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    connection.busy_timeout(Duration::from_millis(100))?;

    let columns = threads_columns(home, path, &connection)?;
    if !columns.contains("id") || !columns.contains("rollout_path") {
        return Ok(None);
    }
    connection
        .query_row(
            "SELECT CAST(rollout_path AS TEXT) FROM threads WHERE id = ?1 LIMIT 1",
            [session_id],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()
        .map(Option::flatten)
}

/// Rollouts live at `sessions/YYYY/MM/DD/rollout-<timestamp>-<id>.jsonl`. The
/// tree holds every session ever run, so the walk goes newest day first and
/// stops at the match rather than collecting the tree.
fn codex_rollout_by_filename(home: &Path, session_id: &str) -> Option<PathBuf> {
    let suffix = format!("-{session_id}.jsonl");
    for year in newest_first(&home.join("sessions")) {
        for month in newest_first(&year) {
            for day in newest_first(&month) {
                let Ok(entries) = std::fs::read_dir(&day) else {
                    continue;
                };
                for entry in entries.flatten() {
                    let name = entry.file_name();
                    let name = name.to_string_lossy();
                    if name.starts_with("rollout-") && name.ends_with(suffix.as_str()) {
                        return Some(entry.path());
                    }
                }
            }
        }
    }
    None
}

fn newest_first(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut dirs = entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .map(|entry| entry.path())
        .collect::<Vec<_>>();
    dirs.sort_by(|a, b| b.file_name().cmp(&a.file_name()));
    dirs
}
#[cfg(test)]
#[path = "agent_last_answer_codex_tests.rs"]
mod tests;
