//! What a Claude session's own transcript says it is running. Claude states its
//! model and reasoning level on screen only in passing — a startup banner, a
//! confirmation line, a chip that fades — so a pane looked at an hour into a
//! conversation names neither. Every assistant record carries both, and the
//! transcript is append-only, so its tail answers the question for a session of
//! any age.
use crate::agent_last_answer::{collect_tail, complete_lines};
use crate::agent_session_titles::validate_project_name;
use crate::agent_usage::timestamp_millis;
use crate::config;
use serde::Serialize;
use serde_json::Value;

// One record is wanted and it is usually the last line of the file; this window
// covers a turn's worth of tool records before it without reading the megabytes
// a long conversation puts in front of them.
const TAIL_BYTES: u64 = 256 << 10;
// The model an SDK-side synthetic message is attributed to — no session ever
// runs it.
const SYNTHETIC_MODEL: &str = "<synthetic>";

/// The model and level one assistant record ran at, and when it landed — the
/// stamp is what tells this reading from a fresher one taken off the pane.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ClaudeSessionState {
    pub(crate) model: String,
    pub(crate) effort: String,
    pub(crate) at: Option<i64>,
}

#[tauri::command(async)]
pub fn claude_session_state(
    project_name: String,
    session_id: String,
) -> Result<Option<ClaudeSessionState>, String> {
    if !crate::socketsrv::valid_session_id(&session_id) {
        return Err("invalid agent session id".into());
    }
    validate_project_name(&project_name)?;
    let project = config::spawn_info(&project_name)?;
    if project.is_remote {
        return Err("agent session state is only available for local projects".into());
    }
    let transcript = crate::hooks::claude_transcript_path(
        config::claude_env_for_account(project.claude_account.as_deref()),
        &project.root,
        &session_id,
    );
    let found =
        collect_tail(&transcript, TAIL_BYTES, 1, newest_state).map_err(|e| e.to_string())?;
    Ok(found.into_iter().next())
}

/// The newest record in the window that describes the session itself. Walked
/// backwards so a long window costs the same as a short one.
fn newest_state(window: &str, want: usize) -> Vec<ClaudeSessionState> {
    let mut found = Vec::new();
    for line in complete_lines(window).rev() {
        if !line.contains("\"type\":\"assistant\"") {
            continue;
        }
        let Some(state) = session_state(line) else {
            continue;
        };
        found.push(state);
        if found.len() >= want {
            break;
        }
    }
    found
}

fn session_state(line: &str) -> Option<ClaudeSessionState> {
    let record: Value = serde_json::from_str(line).ok()?;
    if record.get("type").and_then(Value::as_str) != Some("assistant") {
        return None;
    }
    // A sidechain is a spawned agent answering on its own model and level; what
    // it ran at says nothing about the session that spawned it.
    if record.get("isSidechain") == Some(&Value::Bool(true)) {
        return None;
    }
    // A turn-scoped override describes that one turn, so the level beside it is
    // not the level the session stands at.
    if record
        .get("perTurnEffort")
        .is_some_and(|v| v.as_str().is_some())
    {
        return None;
    }
    let effort = record
        .get("effort")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let model = record
        .get("message")
        .and_then(|message| message.get("model"))
        .and_then(Value::as_str)
        .filter(|model| *model != SYNTHETIC_MODEL)
        .unwrap_or_default();
    if effort.is_empty() && model.is_empty() {
        return None;
    }
    Some(ClaudeSessionState {
        model: model.to_string(),
        effort: effort.to_string(),
        at: timestamp_millis(&record),
    })
}

#[cfg(test)]
#[path = "claude_session_state_tests.rs"]
mod tests;
