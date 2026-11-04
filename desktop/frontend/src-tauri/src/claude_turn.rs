// What a Claude session's transcript says about the turn it is in.
//
// The agent sweep (agentturn.rs) reads a pane gone quiet as a turn that ended,
// because a working Claude animates its spinner several times a second.
// Claude's fullscreen view scrolled away from that spinner draws nothing at
// all while the turn goes on, and a turn that thinks or writes one long answer
// reports no hook in between, so a working session's row was dropped and came
// back at its next tool call. The transcript tells the two apart: a turn still
// going ends on the prompt, a tool's result, a request to the API or a reply
// that continues; one that is over ends on a reply that ended the turn, the
// turn's own summary, or the note an interrupt leaves.
//
// It is believed only with the agent's process known to be alive and no key
// that could have stopped the turn since it last reported: Esc before the
// answer's first word stops Claude without a word in its transcript, and a
// Claude killed mid-turn leaves one that reads as going on for good.
use crate::agent_last_answer::{collect_tail, complete_lines, is_injected};
use crate::agentkind::AgentKind;
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::SystemTime;

/// The records that decide are the last few of the file; a tool result before
/// them can be large, and the window widens until one is found — up to
/// MAX_TAIL, past which the transcript says nothing.
const TAIL_BYTES: u64 = 64 << 10;
const MAX_TAIL: u64 = 4 << 20;

/// A stop key older than any turn the sweep still extends says nothing.
const STOP_KEY_KEPT_MS: i64 = 15 * 60_000;

const INTERRUPTED: &str = "[Request interrupted by user";

/// Whether the quiet turn of the Claude session reporting under `key` from
/// `pane`, whose shell runs on Claude `account`, is still going, given that it
/// last reported at `heard`.
pub fn goes_on(project: &str, key: &str, pane: &str, account: Option<&str>, heard: i64) -> bool {
    !stop_key_since(pane, heard)
        && crate::agentexit::alive(pane) == Some(true)
        && transcript_says(project, key, account) == Some(true)
}

/// A key that can stop a turn (Esc, Ctrl+C) reached `pane` at `at`.
pub fn stop_key(pane: &str, at: i64) {
    let mut keys = stop_keys().lock().unwrap();
    keys.retain(|_, when| at - *when < STOP_KEY_KEPT_MS);
    keys.insert(pane.to_string(), at);
}

fn stop_keys() -> &'static Mutex<HashMap<String, i64>> {
    static STOP_KEYS: OnceLock<Mutex<HashMap<String, i64>>> = OnceLock::new();
    STOP_KEYS.get_or_init(Default::default)
}

fn stop_key_since(pane: &str, since: i64) -> bool {
    stop_keys()
        .lock()
        .unwrap()
        .get(pane)
        .is_some_and(|at| *at > since)
}

/// What the transcript of the session behind `key` says, by its tail. None when
/// that can't be told: not a Claude session key, a remote project, no
/// transcript, or no record that says.
fn transcript_says(project: &str, key: &str, account: Option<&str>) -> Option<bool> {
    let session = key.strip_prefix(AgentKind::Claude.key_prefix())?;
    if !crate::socketsrv::valid_session_id(session) {
        return None;
    }
    let info = crate::config::spawn_info(project)
        .ok()
        .filter(|info| !info.is_remote)?;
    let transcript = own_transcript(account, &info.root, session)
        .or_else(|| crate::claude_dirs::find_transcript(&info.root, session).map(|(_, path)| path))
        .or_else(|| profile_transcript(&info.root, session))?;
    let meta = std::fs::metadata(&transcript).ok()?;
    let stamp = (meta.len(), meta.modified().ok());
    if let Some(said) = read_before(&transcript, stamp) {
        return said;
    }
    let said = collect_tail(&transcript, TAIL_BYTES, 1, |window, _| {
        match verdict(window) {
            Some(goes_on) => vec![Some(goes_on)],
            None if window.len() as u64 >= MAX_TAIL => vec![None],
            None => Vec::new(),
        }
    })
    .ok()?
    .into_iter()
    .next()
    .flatten();
    remember(transcript, stamp, said);
    said
}

/// Where the tab's own account keeps the session. A fork or a move to another
/// account leaves a copy behind that can look newer than the live one.
fn own_transcript(account: Option<&str>, root: &str, session: &str) -> Option<PathBuf> {
    let env = crate::config::claude_env_for_account(Some(account?));
    let path = crate::claude_transcripts::claude_transcript_path(env, root, session);
    path.is_file().then_some(path)
}

/// A session kept where the login profile's CLAUDE_CONFIG_DIR points, which
/// the accounts lpm lists leave out when it was started from the Dock.
fn profile_transcript(root: &str, session: &str) -> Option<PathBuf> {
    let dir = crate::agentdirs::claude_config_dir()?;
    let path = crate::claude_dirs::sessions_dir(dir, root).join(format!("{session}.jsonl"));
    path.is_file().then_some(path)
}

type Stamp = (u64, Option<SystemTime>);
type Readings = HashMap<PathBuf, (Stamp, Option<bool>)>;

/// The last reading of each transcript, kept while the file is unchanged: a
/// quiet turn is read every few seconds, and a long one writes nothing.
fn readings() -> &'static Mutex<Readings> {
    static READINGS: OnceLock<Mutex<Readings>> = OnceLock::new();
    READINGS.get_or_init(Default::default)
}

fn read_before(transcript: &Path, stamp: Stamp) -> Option<Option<bool>> {
    let readings = readings().lock().unwrap();
    let (at, said) = readings.get(transcript)?;
    (*at == stamp).then_some(*said)
}

fn remember(transcript: PathBuf, stamp: Stamp, said: Option<bool>) {
    let mut readings = readings().lock().unwrap();
    if readings.len() >= 256 {
        readings.clear();
    }
    readings.insert(transcript, (stamp, said));
}

/// The newest record in `window` that says whether the turn goes on.
fn verdict(window: &str) -> Option<bool> {
    complete_lines(window).rev().find_map(record_says)
}

/// What one record says, or None for one that says nothing about the turn:
/// metadata, attachments, a sub-agent's records, or a user record that starts
/// no turn.
fn record_says(line: &str) -> Option<bool> {
    let record: Value = serde_json::from_str(line).ok()?;
    let flag = |name: &str| record.get(name) == Some(&Value::Bool(true));
    if flag("isSidechain") {
        return None;
    }
    match record.get("type").and_then(Value::as_str)? {
        "api-request" => Some(true),
        "system" => matches!(
            record.get("subtype").and_then(Value::as_str),
            Some("turn_duration" | "stop_hook_summary")
        )
        .then_some(false),
        "assistant" => Some(match record.pointer("/message/stop_reason") {
            None | Some(Value::Null) => true,
            Some(reason) => matches!(
                reason.as_str(),
                Some("tool_use" | "max_tokens" | "pause_turn")
            ),
        }),
        "user" if starts_no_turn(&record) => None,
        "user" => Some(!interrupted(record.pointer("/message/content")?)),
        _ => None,
    }
}

/// How user records Claude writes on its own start, past its tagged ones (see
/// agent_last_answer::is_injected): a slash command as typed, a shell-mode
/// line, a background task reporting back.
const NO_TURN_TEXT: [&str; 3] = ["/", "<bash-", "<task-notification>"];

/// A user record Claude writes without a turn behind it: its own notes, a
/// compaction's summary, a row kept for the transcript only, a slash command or
/// shell-mode line and what it printed, a background task's report. A turn one
/// of them starts shows its request to the API right after.
fn starts_no_turn(record: &Value) -> bool {
    let flag = |name: &str| record.get(name) == Some(&Value::Bool(true));
    [
        "isMeta",
        "isCompactSummary",
        "isVisibleInTranscriptOnly",
        "queueTranscriptOnly",
    ]
    .into_iter()
    .any(flag)
        || record
            .pointer("/message/content")
            .and_then(user_text)
            .is_some_and(|text| {
                is_injected(text) || NO_TURN_TEXT.iter().any(|start| text.starts_with(start))
            })
}

/// The text a user record opens with: a prompt, or the first text block. None
/// for a tool's result.
fn user_text(content: &Value) -> Option<&str> {
    match content {
        Value::String(text) => Some(text),
        Value::Array(blocks) => blocks
            .first()
            .filter(|block| block.get("type").and_then(Value::as_str) == Some("text"))
            .and_then(|block| block.get("text"))
            .and_then(Value::as_str),
        _ => None,
    }
}

fn interrupted(content: &Value) -> bool {
    match content {
        Value::String(text) => text.starts_with(INTERRUPTED),
        Value::Array(blocks) => blocks.iter().any(|block| {
            block
                .get("text")
                .and_then(Value::as_str)
                .is_some_and(|text| text.starts_with(INTERRUPTED))
        }),
        _ => false,
    }
}

#[cfg(test)]
#[path = "claude_turn_tests.rs"]
mod tests;
