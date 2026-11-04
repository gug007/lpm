// A terminal tab that ran an agent brings it back after a restart: the session
// it reported (set_resume, from SessionStart) becomes the tab's resume command.
// Once the user has quit that agent the tab is a plain shell again, and bringing
// the agent back would hand whatever they type next to a conversation they
// ended. This watches the agent process behind each tab's report and tells the
// window when it is gone while the tab's shell lives on — the agent ended, not
// the tab (closing a tab or quitting lpm takes the shell with it, and the window
// keeps the agent to resume).
use crate::pty::PtyState;
use serde_json::json;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

pub const ENDED_EVENT: &str = "agent-session-ended";

const POLL: Duration = Duration::from_secs(1);

#[derive(Clone, Debug, PartialEq)]
struct Watched {
    project: String,
    session_id: String,
    pid: u32,
}

/// pane id -> the agent last reported from it.
fn watched() -> &'static Mutex<HashMap<String, Watched>> {
    static WATCHED: OnceLock<Mutex<HashMap<String, Watched>>> = OnceLock::new();
    WATCHED.get_or_init(|| Mutex::new(HashMap::new()))
}

static POLLING: AtomicBool = AtomicBool::new(false);
static STOPPED: AtomicBool = AtomicBool::new(false);

/// Follow the agent `pid` that reported `session_id` from pane `pane_id`. A
/// later report from the same pane (a new agent, or `/clear` minting a new id)
/// replaces it.
pub fn watch(app: &AppHandle, project: &str, pane_id: &str, session_id: &str, pid: u32) {
    if STOPPED.load(Ordering::SeqCst) {
        return;
    }
    watched().lock().unwrap().insert(
        pane_id.to_string(),
        Watched {
            project: project.to_string(),
            session_id: session_id.to_string(),
            pid,
        },
    );
    if POLLING.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(POLL);
        if sweep(&app) {
            continue;
        }
        POLLING.store(false, Ordering::SeqCst);
        // A watch that landed after the last sweep found nothing finds no
        // poller; take the job back rather than leave it unwatched.
        if watched().lock().unwrap().is_empty() || POLLING.swap(true, Ordering::SeqCst) {
            return;
        }
    });
}

/// Whether the agent last reported from `pane_id` is still running. None when
/// none is followed there.
pub fn alive(pane_id: &str) -> Option<bool> {
    let pid = watched().lock().unwrap().get(pane_id)?.pid;
    Some(crate::osproc::is_alive(pid))
}

/// Whether the tab brings its agent back after a restart.
pub fn resumes(pane_id: &str) -> bool {
    watched().lock().unwrap().contains_key(pane_id)
}

/// Quitting kills every terminal's processes, agents included; that is not the
/// user ending them, so nothing is reported from here on.
pub fn stop() {
    STOPPED.store(true, Ordering::SeqCst);
    watched().lock().unwrap().clear();
}

/// One pass. Returns whether anything is left to watch.
fn sweep(app: &AppHandle) -> bool {
    let ptys = app.state::<PtyState>();
    let shell_alive = |pane_id: &str| {
        crate::pty::local_session_pid(&ptys, pane_id)
            .is_some_and(|pid| crate::osproc::is_alive(pid as u32))
    };
    let (ended, left) = {
        let mut map = watched().lock().unwrap();
        let ended = take_ended(&mut map, |pid| crate::osproc::is_alive(pid), shell_alive);
        (ended, !map.is_empty())
    };
    if STOPPED.load(Ordering::SeqCst) {
        return false;
    }
    for (pane_id, w) in ended {
        // An agent killed, or one that crashed, ran no SessionEnd hook.
        crate::donehold::session_gone(app, &w.project, &format!("claude_code_{}", w.session_id));
        let _ = app.emit(
            ENDED_EVENT,
            json!({ "project": w.project, "paneId": pane_id, "sessionId": w.session_id }),
        );
    }
    left
}

/// Drops every entry whose agent is gone and returns those whose pane's shell
/// is still there: the agents that ended in a tab that stays.
fn take_ended(
    map: &mut HashMap<String, Watched>,
    agent_alive: impl Fn(u32) -> bool,
    shell_alive: impl Fn(&str) -> bool,
) -> Vec<(String, Watched)> {
    let gone: Vec<String> = map
        .iter()
        .filter(|(_, w)| !agent_alive(w.pid))
        .map(|(pane, _)| pane.clone())
        .collect();
    gone.into_iter()
        .filter_map(|pane| {
            let w = map.remove(&pane)?;
            shell_alive(&pane).then_some((pane, w))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(session_id: &str, pid: u32) -> Watched {
        Watched {
            project: "demo".into(),
            session_id: session_id.into(),
            pid,
        }
    }

    #[test]
    fn reports_an_agent_that_exited_in_a_tab_that_stays() {
        let mut map = HashMap::from([("t1".to_string(), entry("s1", 100))]);
        let ended = take_ended(&mut map, |_| false, |_| true);
        assert_eq!(ended, vec![("t1".to_string(), entry("s1", 100))]);
        assert!(map.is_empty());
    }

    #[test]
    fn keeps_watching_a_running_agent() {
        let mut map = HashMap::from([("t1".to_string(), entry("s1", 100))]);
        assert!(take_ended(&mut map, |_| true, |_| true).is_empty());
        assert_eq!(map.len(), 1);
    }

    #[test]
    fn says_nothing_when_the_tab_went_with_its_agent() {
        let mut map = HashMap::from([("t1".to_string(), entry("s1", 100))]);
        assert!(take_ended(&mut map, |_| false, |_| false).is_empty());
        assert!(map.is_empty());
    }

    #[test]
    fn sorts_several_tabs_independently() {
        let mut map = HashMap::from([
            ("live".to_string(), entry("a", 1)),
            ("quit".to_string(), entry("b", 2)),
            ("closed".to_string(), entry("c", 3)),
        ]);
        let ended = take_ended(&mut map, |pid| pid == 1, |pane| pane != "closed");
        assert_eq!(ended, vec![("quit".to_string(), entry("b", 2))]);
        assert_eq!(map.keys().collect::<Vec<_>>(), vec!["live"]);
    }
}
