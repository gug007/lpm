//! The answers an agent gave in a session: the text of its assistant messages,
//! newest first, as the raw markdown it wrote, so the clipboard keeps the
//! formatting. Both providers append to their transcripts forever and reach
//! tens of megabytes, so answers are gathered from a tail window that widens
//! only while it holds fewer than were asked for.
use crate::agent_last_answer_codex::codex_answers;
use crate::agent_session_titles::{
    codex_home, parse_provider, validate_project_name, AgentProvider,
};
use crate::agent_usage::timestamp_millis;
use crate::config;
use serde::Serialize;
use serde_json::Value;
use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

const INITIAL_TAIL_BYTES: u64 = 4 << 20;
const TAIL_GROWTH: u64 = 4;
const MAX_RECENT_ANSWERS: usize = 50;

/// Where one session's answers are recorded, once the project and provider have
/// been checked.
enum Answers {
    Claude(PathBuf),
    Codex { home: PathBuf, session_id: String },
}

/// One answer and when the agent gave it, in epoch milliseconds — `None` when
/// the record carried no parseable timestamp, which the UI reads as "no time to
/// show" rather than as the epoch.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RecentAnswer {
    pub(crate) text: String,
    pub(crate) at: Option<i64>,
}

#[tauri::command(async)]
pub fn agent_last_answer(
    project_name: String,
    provider: String,
    session_id: String,
) -> Result<Option<String>, String> {
    let answers = locate(&project_name, &provider, &session_id)?.newest(1)?;
    Ok(answers.into_iter().next().map(|answer| answer.text))
}

#[tauri::command(async)]
pub fn agent_recent_answers(
    project_name: String,
    provider: String,
    session_id: String,
    limit: usize,
) -> Result<Vec<RecentAnswer>, String> {
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
    fn newest(&self, want: usize) -> Result<Vec<RecentAnswer>, String> {
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
pub(crate) fn collect_tail<T>(
    path: &Path,
    window_bytes: u64,
    want: usize,
    collect: impl Fn(&str, usize) -> Vec<T>,
) -> io::Result<Vec<T>> {
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
pub(crate) fn complete_lines(window: &str) -> impl DoubleEndedIterator<Item = &str> {
    let end = window.rfind('\n').map_or(0, |newline| newline + 1);
    window[..end].lines()
}

pub(crate) fn join_answer(texts: Vec<String>) -> Option<String> {
    let answer = texts.join("\n\n");
    let answer = answer.trim_end();
    (!answer.is_empty()).then(|| answer.to_string())
}

fn claude_answers(path: &Path, window_bytes: u64, want: usize) -> io::Result<Vec<RecentAnswer>> {
    collect_tail(path, window_bytes, want, claude_answers_in_window)
}

/// The newest answers in the window, newest first. One API response is split
/// across consecutive records sharing a `message.id`, one content block each,
/// so a record whose id is already collected extends that answer instead of
/// starting another, and the thinking and tool_use records of that message are
/// left out. Records of one response being consecutive is what lets the walk
/// stop at the first record of the answer after the last one wanted.
fn claude_answers_in_window(window: &str, want: usize) -> Vec<RecentAnswer> {
    let mut answers: Vec<Collecting> = Vec::new();
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
                .find(|answer| answer.id.as_deref() == Some(id))
        });
        match collected {
            Some(answer) => {
                answer.texts.splice(..0, texts);
            }
            None => {
                if answers.len() >= want {
                    break;
                }
                // Walking backwards meets a message's newest record first, so
                // the stamp kept is when the answer landed, not when it opened.
                answers.push(Collecting {
                    id: id.map(str::to_string),
                    texts,
                    at: timestamp_millis(&record),
                });
            }
        }
    }
    answers.into_iter().filter_map(Collecting::finish).collect()
}

struct Collecting {
    id: Option<String>,
    texts: Vec<String>,
    at: Option<i64>,
}

impl Collecting {
    fn finish(self) -> Option<RecentAnswer> {
        Some(RecentAnswer {
            text: join_answer(self.texts)?,
            at: self.at,
        })
    }
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

pub(crate) fn text_blocks(content: Option<&Value>, block_type: &str) -> Vec<String> {
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

// The single-answer view of each provider. `agent_last_answer` takes the same
// answer from `newest(1)`, so these exist to pin that one narrowing in tests.
#[cfg(test)]
fn claude_last_answer(path: &Path, window_bytes: u64) -> io::Result<Option<String>> {
    Ok(claude_answers(path, window_bytes, 1)?
        .into_iter()
        .next()
        .map(|answer| answer.text))
}

#[cfg(test)]
#[path = "agent_last_answer_tests.rs"]
mod tests;
