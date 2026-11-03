// A person's yes before an agent copies files between computers (agentcp.rs).
// The copy waits here while lpm shows what it would do; "for this tab" is
// remembered against the tab's shell, so it ends with the tab and is never
// handed to a process outside it.
use serde::Serialize;
use std::collections::HashMap;
use std::sync::mpsc::{sync_channel, SyncSender};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub(crate) const REQUEST_EVENT: &str = "agent-files-request";
const WAIT: Duration = Duration::from_secs(5 * 60);

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Request {
    pub id: String,
    pub machine: String,
    /// Copying from the other computer to this one.
    pub pulling: bool,
    pub from: String,
    pub to: String,
    pub files: u64,
    pub bytes: u64,
    /// Files among them that always need a yes, as the other computer names them.
    pub sensitive: Vec<String>,
    pub replaces: bool,
    /// Who asks: the agent and project of the tab, when lpm could tell.
    pub agent: String,
    pub project: String,
    /// Whether "for this tab" may be offered: the tab is known and nothing
    /// sensitive is in the copy.
    pub tab_grant: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Decision {
    Deny,
    Once,
    Tab,
}

struct Pending {
    req: Request,
    answer: SyncSender<Decision>,
}

fn pending() -> &'static Mutex<Vec<Pending>> {
    static PENDING: OnceLock<Mutex<Vec<Pending>>> = OnceLock::new();
    PENDING.get_or_init(|| Mutex::new(Vec::new()))
}

/// (tab, machine) → the tab's shell when it was allowed.
fn grants() -> &'static Mutex<HashMap<(String, String), i32>> {
    static GRANTS: OnceLock<Mutex<HashMap<(String, String), i32>>> = OnceLock::new();
    GRANTS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub(crate) fn granted(pane: &str, slug: &str, shell: i32) -> bool {
    grants()
        .lock()
        .unwrap()
        .get(&(pane.to_string(), slug.to_string()))
        == Some(&shell)
}

pub(crate) fn grant(pane: &str, slug: &str, shell: i32) {
    grants()
        .lock()
        .unwrap()
        .insert((pane.to_string(), slug.to_string()), shell);
}

/// Wait for the answer to `req`.
pub(crate) fn ask(app: &AppHandle, req: Request) -> Result<Decision, String> {
    if crate::sys::headless() {
        return Err(
            "nobody is at this computer to allow the copy. Run it on a computer with lpm open"
                .into(),
        );
    }
    let (tx, rx) = sync_channel(1);
    let id = req.id.clone();
    pending().lock().unwrap().push(Pending {
        req: req.clone(),
        answer: tx,
    });
    let _ = app.emit(REQUEST_EVENT, &req);
    if !crate::statusnotify::window_attended(app) {
        let way = if req.pulling { "from" } else { "to" };
        crate::statusnotify::notify(
            app,
            "An agent wants to copy files",
            &format!(
                "{} {way} {}. Open lpm to allow or deny it.",
                count(req.files),
                req.machine
            ),
        );
    }
    let answer = rx.recv_timeout(WAIT);
    pending().lock().unwrap().retain(|p| p.req.id != id);
    let _ = app.emit(REQUEST_EVENT, ());
    answer.map_err(|_| "nobody answered in lpm within 5 minutes, so nothing was copied".into())
}

pub(crate) fn count(files: u64) -> String {
    if files == 1 {
        "1 file".into()
    } else {
        format!("{files} files")
    }
}

/// The copies waiting for an answer, oldest first.
#[tauri::command]
pub fn peer_agent_requests() -> Vec<Request> {
    pending()
        .lock()
        .unwrap()
        .iter()
        .map(|p| p.req.clone())
        .collect()
}

/// Answer request `id`: "deny", "once" or "tab".
#[tauri::command]
pub fn peer_agent_answer(app: AppHandle, id: String, decision: String) -> Result<(), String> {
    let decision = match decision.as_str() {
        "once" => Decision::Once,
        "tab" => Decision::Tab,
        _ => Decision::Deny,
    };
    let list = pending().lock().unwrap();
    let Some(p) = list.iter().find(|p| p.req.id == id) else {
        return Err("that request is gone".into());
    };
    let decision = if decision == Decision::Tab && !p.req.tab_grant {
        Decision::Once
    } else {
        decision
    };
    let _ = p.answer.try_send(decision);
    drop(list);
    let _ = app.emit(REQUEST_EVENT, ());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_tab_grant_holds_only_for_the_same_shell() {
        grant("tab-1", "mac-a", 100);
        assert!(granted("tab-1", "mac-a", 100));
        assert!(!granted("tab-1", "mac-a", 101), "the tab was reopened");
        assert!(!granted("tab-1", "mac-b", 100), "another computer");
        assert!(!granted("tab-2", "mac-a", 100), "another tab");
    }
}
