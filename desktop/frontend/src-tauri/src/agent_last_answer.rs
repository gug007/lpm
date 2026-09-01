//! The last answer an agent gave in a session: the text of its newest assistant
//! message, as the raw markdown it wrote, so the clipboard keeps the formatting.
//! Both providers append to their transcripts forever and reach tens of
//! megabytes, so the answer is searched in a tail window that widens only when
//! it comes up empty.
use crate::agent_session_titles::{
    codex_home, codex_state_databases, parse_provider, threads_columns, validate_project_name,
    AgentProvider,
};
use crate::config;
use rusqlite::{Connection, OpenFlags, OptionalExtension};
use serde_json::Value;
use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::Duration;

const INITIAL_TAIL_BYTES: u64 = 4 << 20;
const TAIL_GROWTH: u64 = 4;

#[tauri::command(async)]
pub fn agent_last_answer(
    project_name: String,
    provider: String,
    session_id: String,
) -> Result<Option<String>, String> {
    let provider = parse_provider(&provider)?;
    if !crate::socketsrv::valid_session_id(&session_id) {
        return Err("invalid agent session id".into());
    }
    validate_project_name(&project_name)?;
    let project = config::spawn_info(&project_name)?;
    if project.is_remote {
        return Err("the last answer is only available for local projects".into());
    }

    match provider {
        AgentProvider::Claude => {
            let transcript = crate::hooks::claude_transcript_path(
                config::claude_env_for_account(project.claude_account.as_deref()),
                &project.root,
                &session_id,
            );
            claude_last_answer(&transcript, INITIAL_TAIL_BYTES).map_err(|e| e.to_string())
        }
        AgentProvider::Codex => codex_last_answer(&codex_home(), &session_id, INITIAL_TAIL_BYTES)
            .map_err(|e| e.to_string()),
    }
}

/// Search a JSONL file's tail with `extract`, widening the window until it
/// answers or the window covers the whole file. A missing file is "no answer
/// yet", not a failure.
fn scan_tail<T>(
    path: &Path,
    window_bytes: u64,
    extract: impl Fn(&str) -> Option<T>,
) -> io::Result<Option<T>> {
    let mut file = match File::open(path) {
        Ok(file) => file,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e),
    };
    let len = file.metadata()?.len();
    let mut window = window_bytes.max(1);
    loop {
        if let Some(found) = extract(&read_window(&mut file, len, window)?) {
            return Ok(Some(found));
        }
        if window >= len {
            return Ok(None);
        }
        window = window.saturating_mul(TAIL_GROWTH);
    }
}

fn read_window(file: &mut File, len: u64, window: u64) -> io::Result<String> {
    let start = len.saturating_sub(window);
    file.seek(SeekFrom::Start(start))?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf)?;
    let mut text = String::from_utf8_lossy(&buf).into_owned();
    // A window that opens mid-file opens mid-record; that fragment is not one.
    if start > 0 {
        match text.find('\n') {
            Some(newline) => {
                text.drain(..=newline);
            }
            None => text.clear(),
        }
    }
    Ok(text)
}

/// Whole records only: a trailing line without its newline is a record the
/// agent is still writing.
fn complete_lines(window: &str) -> impl DoubleEndedIterator<Item = &str> {
    let end = window.rfind('\n').map_or(0, |newline| newline + 1);
    window[..end].lines()
}

fn join_answer(texts: Vec<String>) -> Option<String> {
    let answer = texts.join("\n\n");
    let answer = answer.trim_end();
    (!answer.is_empty()).then(|| answer.to_string())
}

fn claude_last_answer(path: &Path, window_bytes: u64) -> io::Result<Option<String>> {
    scan_tail(path, window_bytes, claude_answer_in_window)
}

/// One API response is split across consecutive records sharing a `message.id`,
/// one content block each — so the answer is every text block of the newest
/// message that has one, and the thinking and tool_use records of that same
/// message are left out.
fn claude_answer_in_window(window: &str) -> Option<String> {
    let lines = complete_lines(window).collect::<Vec<_>>();
    let (last, record) = lines.iter().enumerate().rev().find_map(|(index, line)| {
        let record = claude_assistant_record(line)?;
        (!claude_text_blocks(&record).is_empty()).then_some((index, record))
    })?;

    let Some(id) = record
        .get("message")
        .and_then(|message| message.get("id"))
        .and_then(Value::as_str)
    else {
        return join_answer(claude_text_blocks(&record));
    };
    let texts = lines[..=last]
        .iter()
        .filter(|line| line.contains(id))
        .filter_map(|line| claude_assistant_record(line))
        .filter(|part| {
            part.get("message")
                .and_then(|message| message.get("id"))
                .and_then(Value::as_str)
                == Some(id)
        })
        .flat_map(|part| claude_text_blocks(&part))
        .collect();
    join_answer(texts)
}

/// Most lines are multi-megabyte tool results, so the marker check gates the
/// JSON work. Sidechain records belong to a subagent, not to the conversation.
fn claude_assistant_record(line: &str) -> Option<Value> {
    if !line.contains("\"type\":\"assistant\"") {
        return None;
    }
    let record = serde_json::from_str::<Value>(line).ok()?;
    if record.get("type").and_then(Value::as_str) != Some("assistant")
        || record.get("isSidechain").and_then(Value::as_bool) == Some(true)
    {
        return None;
    }
    Some(record)
}

fn claude_text_blocks(record: &Value) -> Vec<String> {
    text_blocks(
        record
            .get("message")
            .and_then(|message| message.get("content")),
        "text",
        "text",
    )
}

fn text_blocks(content: Option<&Value>, block_type: &str, field: &str) -> Vec<String> {
    content
        .and_then(Value::as_array)
        .map(|blocks| {
            blocks
                .iter()
                .filter(|block| block.get("type").and_then(Value::as_str) == Some(block_type))
                .filter_map(|block| block.get(field).and_then(Value::as_str))
                .filter(|text| !text.trim().is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn codex_last_answer(
    home: &Path,
    session_id: &str,
    window_bytes: u64,
) -> io::Result<Option<String>> {
    let Some(rollout) = codex_rollout_path(home, session_id) else {
        return Ok(None);
    };
    codex_rollout_answer(&rollout, window_bytes)
}

/// The message record is the answer; `task_complete` only repeats it and is the
/// fallback for a rollout that has none, so it may not stand in for a message
/// record that sits further from the tail than the current window reaches.
fn codex_rollout_answer(path: &Path, window_bytes: u64) -> io::Result<Option<String>> {
    if let Some(answer) = scan_tail(path, window_bytes, |window| {
        complete_lines(window).rev().find_map(codex_assistant_text)
    })? {
        return Ok(Some(answer));
    }
    scan_tail(path, window_bytes, |window| {
        complete_lines(window)
            .rev()
            .find_map(codex_task_complete_text)
    })
}

fn codex_assistant_text(line: &str) -> Option<String> {
    if !line.contains("\"role\":\"assistant\"") {
        return None;
    }
    let payload = codex_payload(line, "message")?;
    if payload.get("role").and_then(Value::as_str) != Some("assistant") {
        return None;
    }
    join_answer(text_blocks(payload.get("content"), "output_text", "text"))
}

fn codex_task_complete_text(line: &str) -> Option<String> {
    if !line.contains("task_complete") {
        return None;
    }
    let payload = codex_payload(line, "task_complete")?;
    let message = payload.get("last_agent_message").and_then(Value::as_str)?;
    join_answer(vec![message.to_string()])
}

fn codex_payload(line: &str, payload_type: &str) -> Option<Value> {
    let record = serde_json::from_str::<Value>(line).ok()?;
    let payload = record.get("payload")?;
    (payload.get("type").and_then(Value::as_str) == Some(payload_type)).then(|| payload.clone())
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
#[path = "agent_last_answer_tests.rs"]
mod tests;
