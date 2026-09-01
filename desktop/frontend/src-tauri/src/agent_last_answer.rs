//! The answers an agent gave in a session: the text of its assistant messages,
//! newest first, as the raw markdown it wrote, so the clipboard keeps the
//! formatting. Both providers append to their transcripts forever and reach
//! tens of megabytes, so answers are gathered from a tail window that widens
//! only while it holds fewer than were asked for.
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
const MAX_RECENT_ANSWERS: usize = 50;

/// Where one session's answers are recorded, once the project and provider have
/// been checked.
enum Answers {
    Claude(PathBuf),
    Codex { home: PathBuf, session_id: String },
}

#[tauri::command(async)]
pub fn agent_last_answer(
    project_name: String,
    provider: String,
    session_id: String,
) -> Result<Option<String>, String> {
    let answers = locate(&project_name, &provider, &session_id)?.newest(1)?;
    Ok(answers.into_iter().next())
}

#[tauri::command(async)]
pub fn agent_recent_answers(
    project_name: String,
    provider: String,
    session_id: String,
    limit: usize,
) -> Result<Vec<String>, String> {
    locate(&project_name, &provider, &session_id)?.newest(limit.clamp(1, MAX_RECENT_ANSWERS))
}

fn locate(project_name: &str, provider: &str, session_id: &str) -> Result<Answers, String> {
    let provider = parse_provider(provider)?;
    if !crate::socketsrv::valid_session_id(session_id) {
        return Err("invalid agent session id".into());
    }
    validate_project_name(project_name)?;
    let project = config::spawn_info(project_name)?;
    if project.is_remote {
        return Err("agent answers are only available for local projects".into());
    }

    Ok(match provider {
        AgentProvider::Claude => Answers::Claude(crate::hooks::claude_transcript_path(
            config::claude_env_for_account(project.claude_account.as_deref()),
            &project.root,
            session_id,
        )),
        AgentProvider::Codex => Answers::Codex {
            home: codex_home(),
            session_id: session_id.to_string(),
        },
    })
}

impl Answers {
    fn newest(&self, want: usize) -> Result<Vec<String>, String> {
        match self {
            Answers::Claude(transcript) => claude_answers(transcript, INITIAL_TAIL_BYTES, want),
            Answers::Codex { home, session_id } => {
                codex_answers(home, session_id, INITIAL_TAIL_BYTES, want)
            }
        }
        .map_err(|e| e.to_string())
    }
}

/// Gather from a JSONL file's tail with `collect`, widening the window until it
/// yields `want` records or covers the whole file — so a session with fewer
/// answers than asked for costs one full read, and the common case costs one
/// window. A missing file is "no answers yet", not a failure.
fn collect_tail(
    path: &Path,
    window_bytes: u64,
    want: usize,
    collect: impl Fn(&str, usize) -> Vec<String>,
) -> io::Result<Vec<String>> {
    let mut file = match File::open(path) {
        Ok(file) => file,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e),
    };
    let len = file.metadata()?.len();
    let mut window = window_bytes.max(1);
    loop {
        let found = collect(&read_window(&mut file, len, window)?, want);
        if found.len() >= want || window >= len {
            return Ok(found);
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

fn claude_answers(path: &Path, window_bytes: u64, want: usize) -> io::Result<Vec<String>> {
    collect_tail(path, window_bytes, want, claude_answers_in_window)
}

/// The newest answers in the window, newest first. One API response is split
/// across consecutive records sharing a `message.id`, one content block each,
/// so a record whose id is already collected extends that answer instead of
/// starting another, and the thinking and tool_use records of that message are
/// left out. Records of one response being consecutive is what lets the walk
/// stop at the first record of the answer after the last one wanted.
fn claude_answers_in_window(window: &str, want: usize) -> Vec<String> {
    let mut answers: Vec<(Option<String>, Vec<String>)> = Vec::new();
    for line in complete_lines(window).rev() {
        let Some(record) = claude_assistant_record(line) else {
            continue;
        };
        let texts = claude_text_blocks(&record);
        if texts.is_empty() {
            continue;
        }
        let id = record
            .get("message")
            .and_then(|message| message.get("id"))
            .and_then(Value::as_str);
        // A record without an id is an answer of its own, so it never extends
        // one already collected.
        let collected = id.and_then(|id| {
            answers
                .iter_mut()
                .find(|(seen, _)| seen.as_deref() == Some(id))
        });
        match collected {
            Some((_, collected)) => {
                collected.splice(..0, texts);
            }
            None => {
                if answers.len() >= want {
                    break;
                }
                answers.push((id.map(str::to_string), texts));
            }
        }
    }
    answers
        .into_iter()
        .filter_map(|(_, texts)| join_answer(texts))
        .collect()
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
    )
}

fn text_blocks(content: Option<&Value>, block_type: &str) -> Vec<String> {
    content
        .and_then(Value::as_array)
        .map(|blocks| {
            blocks
                .iter()
                .filter(|block| block.get("type").and_then(Value::as_str) == Some(block_type))
                .filter_map(|block| block.get("text").and_then(Value::as_str))
                .filter(|text| !text.trim().is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn codex_answers(
    home: &Path,
    session_id: &str,
    window_bytes: u64,
    want: usize,
) -> io::Result<Vec<String>> {
    let Some(rollout) = codex_rollout_path(home, session_id) else {
        return Ok(Vec::new());
    };
    codex_rollout_answers(&rollout, window_bytes, want)
}

/// One message record is one whole answer. `task_complete` only echoes the last
/// of them, so it stands in for a rollout that has no message record at all —
/// never for one that sits further from the tail than the window reaches, and
/// never as an extra entry beside the messages it repeats.
fn codex_rollout_answers(path: &Path, window_bytes: u64, want: usize) -> io::Result<Vec<String>> {
    let answers = collect_tail(path, window_bytes, want, |window, want| {
        complete_lines(window)
            .rev()
            .filter_map(codex_assistant_text)
            .take(want)
            .collect()
    })?;
    if !answers.is_empty() {
        return Ok(answers);
    }
    collect_tail(path, window_bytes, 1, |window, want| {
        complete_lines(window)
            .rev()
            .filter_map(codex_task_complete_text)
            .take(want)
            .collect()
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
    join_answer(text_blocks(payload.get("content"), "output_text"))
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

// The single-answer view of each provider. `agent_last_answer` takes the same
// answer from `newest(1)`, so these exist to pin that one narrowing in tests.
#[cfg(test)]
fn claude_last_answer(path: &Path, window_bytes: u64) -> io::Result<Option<String>> {
    Ok(claude_answers(path, window_bytes, 1)?.into_iter().next())
}

#[cfg(test)]
fn codex_last_answer(
    home: &Path,
    session_id: &str,
    window_bytes: u64,
) -> io::Result<Option<String>> {
    Ok(codex_answers(home, session_id, window_bytes, 1)?
        .into_iter()
        .next())
}

#[cfg(test)]
fn codex_rollout_answer(path: &Path, window_bytes: u64) -> io::Result<Option<String>> {
    Ok(codex_rollout_answers(path, window_bytes, 1)?
        .into_iter()
        .next())
}

#[cfg(test)]
#[path = "agent_last_answer_tests.rs"]
mod tests;
