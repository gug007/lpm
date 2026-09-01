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
const SYNTHETIC_MODEL: &str = "<synthetic>";

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
    let mut answers = Vec::new();
    let mut turn: Option<Collecting> = None;
    for line in complete_lines(window).rev() {
        if claude_turn_boundary(line) {
            if let Some(answer) = turn.take().and_then(Collecting::finish) {
                answers.push(answer);
                if answers.len() >= want {
                    return answers;
                }
            }
            continue;
        }
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
        match &mut turn {
            // One response is split across consecutive records sharing an id,
            // so a record carrying the open answer's id extends it.
            Some(open) if open.id.is_some() && open.id.as_deref() == id => {
                open.texts.splice(..0, texts);
            }
            // Anything else earlier in this turn is what the agent said on its
            // way to the answer, not the answer.
            Some(_) => {}
            // Walking backwards meets a turn's last text first — its answer —
            // and the stamp kept is when that text landed.
            None => {
                turn = Some(Collecting {
                    id: id.map(str::to_string),
                    texts,
                    at: timestamp_millis(&record),
                });
            }
        }
    }
    if answers.len() < want {
        answers.extend(turn.and_then(Collecting::finish));
    }
    answers
}

/// A user record that is a person actually speaking, which is where one
/// exchange ends and the next begins. Tool results are written as user records
/// too but are the plumbing inside a turn, and the CLI injects slash-command
/// echoes and reminders that nobody typed. An interruption does count: the user
/// stopped the agent, so whatever it had said by then is that exchange's answer.
fn claude_turn_boundary(line: &str) -> bool {
    if !line.contains("\"type\":\"user\"") {
        return false;
    }
    let Ok(record) = serde_json::from_str::<Value>(line) else {
        return false;
    };
    if record.get("type").and_then(Value::as_str) != Some("user")
        || record.get("isSidechain").and_then(Value::as_bool) == Some(true)
    {
        return false;
    }
    claude_user_text(&record).is_some_and(|text| !is_injected(text))
}

fn claude_user_text(record: &Value) -> Option<&str> {
    match record.get("message")?.get("content")? {
        Value::String(text) => Some(text.as_str()),
        Value::Array(items) => items.iter().find_map(|item| {
            (item.get("type").and_then(Value::as_str) == Some("text"))
                .then(|| item.get("text").and_then(Value::as_str))
                .flatten()
        }),
        _ => None,
    }
}

fn is_injected(text: &str) -> bool {
    let text = text.trim_start();
    text.is_empty()
        || text.starts_with("<command-")
        || text.starts_with("<local-command")
        || text.starts_with("<system-reminder>")
        || text.starts_with("Caveat:")
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
/// JSON work. Sidechain records belong to a subagent, not to the conversation,
/// and a `<synthetic>` model marks a notice the CLI wrote in the agent's voice
/// — "No response requested.", a session-limit warning, an API error — which is
/// never something anyone means to copy.
fn claude_assistant_record(line: &str) -> Option<Value> {
    if !line.contains("\"type\":\"assistant\"") {
        return None;
    }
    let record = serde_json::from_str::<Value>(line).ok()?;
    if record.get("type").and_then(Value::as_str) != Some("assistant")
        || record.get("isSidechain").and_then(Value::as_bool) == Some(true)
        || claude_model(&record) == Some(SYNTHETIC_MODEL)
    {
        return None;
    }
    Some(record)
}

fn claude_model(record: &Value) -> Option<&str> {
    record
        .get("message")
        .and_then(|message| message.get("model"))
        .and_then(Value::as_str)
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
