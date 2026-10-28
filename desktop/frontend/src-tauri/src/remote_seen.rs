// Seen and archived agents from the phone (status/seen.rs): the same archive,
// mark-seen and mark-unread the desktop sidebar offers. No replies — the
// `status-changed` a change emits refreshes the desktop and every phone.
use crate::status::StatusStore;
use serde_json::Value;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

/// The phone may send `archiveStatus`, `markStatusSeen` and `markStatusUnread`,
/// and gets `seenEntries`, `seen` and `seenAgentsShown`.
pub const FEATURE: &str = "agentArchive";

pub fn handle(app: &AppHandle, t: &str, v: &Value) {
    let project = v.get("project").and_then(Value::as_str).unwrap_or_default();
    let keys: Vec<String> = v
        .get("keys")
        .and_then(Value::as_array)
        .map(|keys| keys.iter().filter_map(Value::as_str).map(str::to_string).collect())
        .unwrap_or_default();
    let store = app.state::<Arc<StatusStore>>();
    let changed = match t {
        "archiveStatus" => store.archive(project, &keys),
        "markStatusSeen" => crate::status::seen::retire_unopened(&store, project, &keys),
        "markStatusUnread" => store.mark_unread(project, &keys),
        _ => false,
    };
    if changed {
        let _ = app.emit("status-changed", project);
    }
}
