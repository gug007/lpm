//! Read-only queries against lpm's session daemon.
//!
//! Sessions live in a daemon (the desktop crate's `sessiond`), not in this
//! process, so this is a small JSON-over-unix-socket client — the same split
//! the CLI had when sessions lived in a tmux server. The daemon is never
//! started from here: no daemon means no sessions, which is the honest answer
//! to "what is running", and a read must not create processes to find that out.
//!
//! Panes are listed in creation order. The app labels each service pane with
//! its service; creation order follows the started profile and `dependsOn`,
//! not declaration order, so the label — not the index — names the service.

use crate::config::Ctx;
use crate::statussock;
use serde::Deserialize;
use serde_json::{json, Value};

/// One request, one reply. `None` whenever the daemon is absent or unwell —
/// every caller here treats that as "nothing is running".
fn ask(request: Value) -> Option<Value> {
    let socket = Ctx::from_home().sessions_socket_path();
    let reply = statussock::request(&socket, &request.to_string()).ok()?;
    let reply: Value = serde_json::from_str(reply.trim()).ok()?;
    reply.get("ok")?.as_bool()?.then_some(reply)
}

/// Live session names. Empty when no daemon is running — not an error, the same
/// way "no server" was not an error before.
pub fn running_sessions() -> std::collections::HashSet<String> {
    ask(json!({"op": "sessions"}))
        .and_then(|r| r.get("sessions").cloned())
        .and_then(|s| serde_json::from_value::<Vec<String>>(s).ok())
        .map(|names| names.into_iter().collect())
        .unwrap_or_default()
}

pub fn session_exists(name: &str) -> bool {
    !panes_field(name, false).is_empty()
}

/// One live pane of a session, in creation order. Field names are the daemon's
/// wire names (sessionproto::PaneInfo); the two that differ are renamed here.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pane {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub pid: i64,
    /// The service the app started in this pane; empty for panes it didn't
    /// label (older daemons, plain terminals).
    #[serde(default)]
    pub service: String,
    #[serde(default, rename = "command")]
    pub current_command: String,
    #[serde(default, rename = "path")]
    pub current_path: String,
    #[serde(default)]
    pub title: String,
    /// The pane's service command has ended (it crashed, exited, or its shell
    /// did); the pane stays until the service is restarted or stopped.
    #[serde(default)]
    pub ended: bool,
    /// The status it ended with, when the shell reported one.
    #[serde(default)]
    pub code: Option<i32>,
}

/// Panes for a session in creation order. Empty on error / no session.
pub fn list_panes(session: &str) -> Vec<Pane> {
    panes_field(session, true)
}

/// The panes' ids and services alone, without the foreground-process lookups
/// that fork; for callers that poll.
pub fn list_panes_brief(session: &str) -> Vec<Pane> {
    panes_field(session, false)
}

fn panes_field(session: &str, detail: bool) -> Vec<Pane> {
    ask(json!({"op": "panes", "session": session, "detail": detail}))
        .and_then(|r| r.get("panes").cloned())
        .and_then(|p| serde_json::from_value::<Vec<Pane>>(p).ok())
        .unwrap_or_default()
}

/// Recent scrollback for a pane: `lines` of history plus its current screen,
/// with wrapped rows re-joined and the whole thing trimmed.
pub fn capture_pane(pane_id: &str, lines: i64) -> Result<String, String> {
    let reply = ask(json!({"op": "capture", "pane": pane_id, "history": lines.max(0)}))
        .ok_or_else(|| format!("could not read pane {pane_id}"))?;
    let text = reply.get("text").and_then(Value::as_str).unwrap_or_default();
    Ok(text.trim().to_string())
}
