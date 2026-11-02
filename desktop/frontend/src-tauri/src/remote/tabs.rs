//! Keeps every remote view of a project's tabs in step with the desktop: phones
//! hear the list again whenever it changes, and a project the desktop hasn't
//! shown since it started has its saved tabs restored when a phone or a paired
//! Mac asks for them, instead of reading as a project with no terminals.
use super::{broadcast, has_clients, project_terminals, RemoteHub, TERMINALS_CHANGED_EVENT};
use serde_json::{json, Value};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Listener, Manager};

/// Asks the main window to restore a project's saved tabs without putting it on
/// screen.
pub const RESTORE_EVENT: &str = "remote-restore-project";

/// How long a phone's first look at an unopened project waits for its tabs to
/// come back, so it doesn't flash "No Terminals" first.
const RESTORE_WAIT: Duration = Duration::from_secs(6);
const RESTORE_POLL: Duration = Duration::from_millis(100);

pub(super) fn install(hub: &RemoteHub, app: &AppHandle) {
    let h = hub.clone();
    let a = app.clone();
    app.listen(TERMINALS_CHANGED_EVENT, move |e| {
        let project = serde_json::from_str::<String>(e.payload()).unwrap_or_default();
        // A Mac lists another Mac's project under a marked name only it knows.
        if project.is_empty()
            || crate::gitbring::unmark(&project) != project
            || !has_clients(&h)
            || h.inner.quitting.load(std::sync::atomic::Ordering::SeqCst)
        {
            return;
        }
        // Mid-restore the list is empty on purpose; the reply waiting on the
        // restore carries the real one.
        if awaiting_restore(&h, &project) {
            return;
        }
        broadcast(&h, terminals_frame(&a, &h, &project));
    });
}

pub(super) fn terminals_frame(app: &AppHandle, hub: &RemoteHub, project: &str) -> Value {
    json!({ "t": "terminals", "project": project, "terminals": project_terminals(app, hub, project) })
}

/// Adds the conversation each terminal's tab runs, as the desktop reported it,
/// for a paired Mac. One that opened the project after the agent started never
/// heard it say, and without it the tab there is a plain terminal: no model
/// picker, nothing to resume or fork.
pub(super) fn with_agent_sessions(hub: &RemoteHub, terminals: &mut [Value]) {
    let sessions = hub.inner.agent_sessions.lock().unwrap();
    for t in terminals {
        let Some(session) = t["id"].as_str().and_then(|id| sessions.get(id)) else {
            continue;
        };
        let session = json!({ "provider": session.provider, "sessionId": session.session_id });
        if let Some(m) = t.as_object_mut() {
            m.insert("agentSession".into(), session);
        }
    }
}

/// Records the tab list the frontend just reported and says whether anything a
/// remote shows — which tabs, their order, names, pins, icons or menu — changed.
pub(super) fn note_tree(
    hub: &RemoteHub,
    project: &str,
    ids: Vec<String>,
    labels: &[Value],
) -> bool {
    let sig: Vec<Value> = labels
        .iter()
        .filter(|item| {
            item.get("id")
                .and_then(Value::as_str)
                .is_some_and(|id| !id.is_empty())
        })
        .map(|item| {
            json!([
                item.get("id"),
                item.get("label"),
                item.get("pinned"),
                item.get("emoji"),
                item.get("canFork"),
                item.get("canForkCopy"),
                item.get("canTitle")
            ])
        })
        .collect();
    let sig = Value::Array(sig).to_string();
    hub.inner
        .tree_ids
        .lock()
        .unwrap()
        .insert(project.to_string(), ids);
    hub.inner
        .tree_sigs
        .lock()
        .unwrap()
        .insert(project.to_string(), sig.clone())
        != Some(sig)
}

/// Starts restoring `project`'s saved tabs when the desktop hasn't reported any
/// this run, once per project, and says whether it did — the caller then knows
/// the list it would answer with is about to change. Only the main window
/// restores tabs, so without one nothing is asked.
pub(crate) fn wake(app: &AppHandle, hub: &RemoteHub, project: &str) -> bool {
    if project.is_empty()
        || crate::gitbring::unmark(project) != project
        || app.get_webview_window("main").is_none()
    {
        return false;
    }
    let shown = hub.inner.tree_ids.lock().unwrap().contains_key(project);
    if shown || hub.inner.woken.lock().unwrap().contains(project) {
        return false;
    }
    if !has_saved_tabs(&crate::commands_real::load_terminals(), project) {
        return false;
    }
    hub.inner.woken.lock().unwrap().insert(project.to_string())
        && app.emit(RESTORE_EVENT, project).is_ok()
}

/// The project's saved tabs are coming back for a remote and the desktop hasn't
/// reported them yet. Its live terminals then are the restore's own, some of
/// them about to be replaced, so none of them is listed until it reports.
pub(super) fn restoring(hub: &RemoteHub, project: &str) -> bool {
    hub.inner.woken.lock().unwrap().contains(project)
}

/// Projects a remote asked about that the main window hasn't restored yet. It
/// takes them when it mounts: a wake-up sent before its listener was up (a phone
/// reconnecting the moment lpm starts) is otherwise lost.
#[tauri::command]
pub fn remote_take_restore_requests(hub: tauri::State<'_, RemoteHub>) -> Vec<String> {
    let woken = hub.inner.woken.lock().unwrap().clone();
    let shown = hub.inner.tree_ids.lock().unwrap();
    woken
        .into_iter()
        .filter(|p| !shown.contains_key(p))
        .collect()
}

/// A restore `wake` started is still under way.
pub(super) fn awaiting_restore(hub: &RemoteHub, project: &str) -> bool {
    let shown = hub.inner.tree_ids.lock().unwrap().contains_key(project);
    !shown && restoring(hub, project)
}

/// Blocks until the desktop has reported `project`'s tabs, or the wait runs out.
pub(super) fn await_tree(hub: &RemoteHub, project: &str) {
    let deadline = Instant::now() + RESTORE_WAIT;
    while Instant::now() < deadline {
        if hub.inner.tree_ids.lock().unwrap().contains_key(project) {
            return;
        }
        std::thread::sleep(RESTORE_POLL);
    }
}

fn has_saved_tabs(saved: &Value, project: &str) -> bool {
    let entry = &saved["projects"][project];
    leaf_has_tabs(&entry["panes"]) || entry["terminals"].as_array().is_some_and(|t| !t.is_empty())
}

fn leaf_has_tabs(node: &Value) -> bool {
    match node["kind"].as_str() {
        Some("leaf") => node["tabs"].as_array().is_some_and(|t| !t.is_empty()),
        Some("split") => leaf_has_tabs(&node["a"]) || leaf_has_tabs(&node["b"]),
        _ => false,
    }
}

/// A tab op another Mac asks this one to run on its own tab tree — the relay a
/// phone's rename, pin or reorder takes, and a paired Mac's restart of an ended
/// terminal or move of a Claude tab to another `account` of this machine's —
/// so the host stays the one place a project's tabs are named, ordered and run.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn terminal_tab_op(
    app: AppHandle,
    project_name: String,
    op: String,
    id: Option<String>,
    label: Option<String>,
    emoji: Option<String>,
    order: Option<Vec<String>>,
    account: Option<String>,
) -> Result<(), String> {
    if !matches!(
        op.as_str(),
        "rename" | "pin" | "reorder" | "title" | "restart" | "account"
    ) {
        return Err(format!("unknown tab op {op:?}"));
    }
    if op == "account" && account.as_deref().unwrap_or("").is_empty() {
        return Err("no Claude account given".into());
    }
    app.emit(
        "remote-terminal-op",
        json!({
            "project": project_name,
            "op": op,
            "id": id.unwrap_or_default(),
            "label": label.unwrap_or_default(),
            "emoji": emoji,
            "order": order.unwrap_or_default(),
            "account": account,
        }),
    )
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saved_tabs_found_in_any_leaf() {
        let saved = json!({ "projects": {
            "split": { "panes": { "kind": "split",
                "a": { "kind": "leaf", "tabs": [] },
                "b": { "kind": "leaf", "tabs": [{ "label": "Terminal 1" }] } } },
            "empty": { "panes": { "kind": "leaf", "tabs": [] } },
            "legacy": { "terminals": [{ "label": "old" }] },
        }});
        assert!(has_saved_tabs(&saved, "split"));
        assert!(has_saved_tabs(&saved, "legacy"));
        assert!(!has_saved_tabs(&saved, "empty"));
        assert!(!has_saved_tabs(&saved, "missing"));
    }

    #[test]
    fn listed_terminals_carry_their_agent_session() {
        let hub = RemoteHub::default();
        hub.inner.agent_sessions.lock().unwrap().insert(
            "p-1".into(),
            crate::remote_answers::AgentSession {
                provider: "claude".into(),
                session_id: "s-1".into(),
            },
        );
        let mut terminals = vec![json!({ "id": "p-1" }), json!({ "id": "p-2" })];
        with_agent_sessions(&hub, &mut terminals);
        assert_eq!(
            terminals[0]["agentSession"],
            json!({ "provider": "claude", "sessionId": "s-1" })
        );
        assert!(terminals[1].get("agentSession").is_none());
    }

    #[test]
    fn a_rename_or_pin_counts_as_a_change() {
        let hub = RemoteHub::default();
        let tab =
            |label: &str, pinned: bool| json!({ "id": "p-1", "label": label, "pinned": pinned });
        let ids = || vec!["p-1".to_string()];
        assert!(note_tree(&hub, "p", ids(), &[tab("a", false)]));
        assert!(!note_tree(&hub, "p", ids(), &[tab("a", false)]));
        assert!(note_tree(&hub, "p", ids(), &[tab("b", false)]));
        assert!(note_tree(&hub, "p", ids(), &[tab("b", true)]));
        assert!(note_tree(&hub, "p", vec![], &[]));
    }
}
