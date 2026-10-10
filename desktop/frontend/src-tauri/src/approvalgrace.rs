// Codex approval requests that may never be shown.
//
// Codex runs its PermissionRequest hook before it checks the approvals the user
// already gave for the session ("Yes, and don't ask again for these files"), so
// a call that goes ahead without asking still reports a Waiting, then its
// PostToolUse a moment later. Announced at once, that is a bell, a banner and a
// phone push for a question nobody was asked. So a request is held for a moment
// and announced only if nothing settled it first: a later report from the same
// agent (its call finishing, the turn ending) or the user answering. A call's
// own start doesn't settle it: that PreToolUse can land after the request it
// preceded, since each hook delivers in the background.
use crate::status::{StatusEntry, StatusStore};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Manager};

/// Longer than a session-approved patch takes to apply; short enough that a
/// real question is still news when it shows.
const GRACE: Duration = Duration::from_millis(1_000);

struct Request {
    token: u64,
    pane: String,
}

fn requests() -> &'static Mutex<HashMap<(String, String), Request>> {
    static REQUESTS: OnceLock<Mutex<HashMap<(String, String), Request>>> = OnceLock::new();
    REQUESTS.get_or_init(Default::default)
}

/// Publish `entry` once GRACE has passed, unless something settles it first.
pub fn defer(app: &AppHandle, project: &str, entry: StatusEntry) {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let token = NEXT.fetch_add(1, Ordering::Relaxed);
    let id = (project.to_string(), entry.key.clone());
    let request = Request {
        token,
        pane: entry.pane_id.clone(),
    };
    requests().lock().unwrap().insert(id.clone(), request);
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(GRACE);
        if take(&id, token) {
            let store = app.state::<Arc<StatusStore>>();
            crate::socketsrv::publish(&app, &store, &id.0, entry);
        }
    });
}

fn take(id: &(String, String), token: u64) -> bool {
    let mut requests = requests().lock().unwrap();
    let due = requests.get(id).is_some_and(|r| r.token == token);
    if due {
        requests.remove(id);
    }
    due
}

/// A later report from the agent that made the request.
pub fn settle(project: &str, key: &str) {
    requests()
        .lock()
        .unwrap()
        .remove(&(project.to_string(), key.to_string()));
}

/// Input reached the terminal before its request was announced: whatever was
/// asked has been answered.
pub fn answered(pane: &str) {
    requests().lock().unwrap().retain(|_, r| r.pane != pane);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(project: &str, key: &str, pane: &str) -> u64 {
        static NEXT: AtomicU64 = AtomicU64::new(1_000);
        let token = NEXT.fetch_add(1, Ordering::Relaxed);
        let request = Request {
            token,
            pane: pane.into(),
        };
        requests()
            .lock()
            .unwrap()
            .insert((project.into(), key.into()), request);
        token
    }

    fn id(project: &str, key: &str) -> (String, String) {
        (project.into(), key.into())
    }

    #[test]
    fn an_unsettled_request_comes_due_once() {
        let token = request("g1", "codex_p-1", "p-1");
        assert!(take(&id("g1", "codex_p-1"), token));
        assert!(!take(&id("g1", "codex_p-1"), token));
    }

    #[test]
    fn a_later_report_or_an_answer_settles_it() {
        let token = request("g2", "codex_p-1", "p-1");
        settle("g2", "codex_p-1");
        assert!(!take(&id("g2", "codex_p-1"), token));

        let token = request("g2", "codex_p-2", "p-2");
        answered("p-9");
        answered("p-2");
        assert!(!take(&id("g2", "codex_p-2"), token));
    }

    #[test]
    fn a_newer_request_replaces_the_one_it_follows() {
        let first = request("g3", "codex_p-1", "p-1");
        let second = request("g3", "codex_p-1", "p-1");
        assert!(!take(&id("g3", "codex_p-1"), first));
        assert!(take(&id("g3", "codex_p-1"), second));
    }
}
