//! `lpm wait --agent` — block until a project's AI agents settle. Agent statuses
//! live only in the app, so this polls its status socket and needs it running.

use crate::config::{self, Ctx};
use crate::control;
use crate::error::{resolve_status_target, RunError};
use crate::statussock::{self, StatusEntry};
use crate::style::{status_value, Style};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::io::IsTerminal;
use std::time::{Duration, Instant};

/// Polling the app socket is more expensive than a local port check, so the
/// agent mode uses a gentler cadence.
const POLL_INTERVAL: Duration = Duration::from_secs(1);

/// What the wait has seen of the project's agents since it began.
///
/// Statuses outlive their turn — a tab's Done stays until someone looks at it —
/// so what is in the store when the wait starts says nothing about the work the
/// caller just queued, which has usually not reported yet. The agents count as
/// settled once one has reported since then (or one seen working is gone) and
/// none is still working. The calling tab's own agent is left out: it is busy
/// running this very wait.
struct AgentWatch {
    own_pane: Option<String>,
    before: HashSet<(String, i64)>,
    seen_running: HashSet<String>,
}

impl AgentWatch {
    fn new(own_pane: Option<String>, entries: &[StatusEntry]) -> Self {
        let mut watch = AgentWatch {
            own_pane,
            before: HashSet::new(),
            seen_running: HashSet::new(),
        };
        let others = watch.others(entries);
        watch.before = others
            .iter()
            .map(|e| (e.key.clone(), e.timestamp))
            .collect();
        watch.note_running(&others);
        watch
    }

    fn others<'a>(&self, entries: &'a [StatusEntry]) -> Vec<&'a StatusEntry> {
        entries
            .iter()
            .filter(|e| self.own_pane.as_deref() != Some(e.pane_id.as_str()))
            .collect()
    }

    fn note_running(&mut self, entries: &[&StatusEntry]) {
        for e in entries.iter().filter(|e| e.value == "Running") {
            self.seen_running.insert(e.key.clone());
        }
    }

    /// Takes one poll's entries; true once the agents have settled.
    fn settled(&mut self, entries: &[StatusEntry]) -> bool {
        let others = self.others(entries);
        self.note_running(&others);
        if others.iter().any(|e| e.value == "Running") {
            return false;
        }
        let reported = others
            .iter()
            .any(|e| !self.before.contains(&(e.key.clone(), e.timestamp)));
        let present: HashSet<&str> = others.iter().map(|e| e.key.as_str()).collect();
        let finished = self
            .seen_running
            .iter()
            .any(|k| !present.contains(k.as_str()));
        reported || finished
    }
}

fn statuses_json(entries: &[StatusEntry]) -> Vec<Value> {
    entries
        .iter()
        .map(|e| {
            json!({
                "key": e.key,
                "value": e.value,
                "paneID": e.pane_id,
                "timestamp": e.timestamp,
            })
        })
        .collect()
}

pub fn run(ctx: &Ctx, project: Option<&str>, timeout: i64, as_json: bool) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let file_name = resolve_status_target(ctx, project)?;
    let socket = ctx.socket_path();
    let deadline = Duration::from_secs(timeout as u64);
    let start = Instant::now();
    // A transient socket failure (None) reads as "nothing new yet" — keep
    // polling rather than giving up early.
    let poll = || statussock::list_status(&socket, &file_name).unwrap_or_default();
    let mut watch = AgentWatch::new(config::own_pane(&file_name), &poll());

    loop {
        std::thread::sleep(POLL_INTERVAL);
        let entries = poll();
        if watch.settled(&entries) {
            let ms = start.elapsed().as_millis() as u64;
            if as_json {
                crate::util::print_json(&json!({
                    "ok": true,
                    "elapsedMs": ms,
                    "statuses": statuses_json(&entries),
                }));
            } else {
                println!("agents settled after {:.1}s", start.elapsed().as_secs_f64());
                let style = Style {
                    on: std::io::stdout().is_terminal(),
                };
                for e in &entries {
                    println!(
                        "  {}  {}",
                        style.bold(&e.key),
                        status_value(&style, &e.value)
                    );
                }
            }
            return Ok(());
        }
        if start.elapsed() >= deadline {
            let ms = start.elapsed().as_millis() as u64;
            let waiting_for = format!(
                "agents in {:?} to settle",
                config::status_group_label(&file_name)
            );
            if as_json {
                crate::util::print_json(&json!({
                    "ok": false,
                    "elapsedMs": ms,
                    "waitingFor": waiting_for,
                    "statuses": statuses_json(&entries),
                }));
            }
            return Err(RunError::Internal(format!(
                "timed out after {timeout}s waiting for {waiting_for}"
            )));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(key: &str, value: &str, pane: &str, timestamp: i64) -> StatusEntry {
        StatusEntry {
            key: key.into(),
            value: value.into(),
            icon: String::new(),
            color: String::new(),
            priority: 0,
            timestamp,
            agent_pid: 0,
            pane_id: pane.into(),
        }
    }

    #[test]
    fn nothing_reported_yet_is_not_settled() {
        let mut w = AgentWatch::new(None, &[]);
        assert!(!w.settled(&[]));
    }

    #[test]
    fn a_done_left_from_before_the_wait_does_not_settle_it() {
        let old = [entry("claude_code_old", "Done", "p1", 10)];
        let mut w = AgentWatch::new(None, &old);
        assert!(!w.settled(&old));

        let queued = [
            old[0].clone(),
            entry("claude_code_new", "Running", "p2", 20),
        ];
        assert!(!w.settled(&queued));
        let finished = [old[0].clone(), entry("claude_code_new", "Done", "p2", 30)];
        assert!(w.settled(&finished));
    }

    #[test]
    fn the_callers_own_tab_is_left_out() {
        let caller = entry("claude_code_me", "Running", "mine", 10);
        let mut w = AgentWatch::new(Some("mine".into()), std::slice::from_ref(&caller));
        assert!(!w.settled(&[caller.clone(), entry("codex_q", "Running", "p2", 20)]));
        assert!(w.settled(&[caller, entry("codex_q", "Done", "p2", 30)]));
    }

    #[test]
    fn an_agent_seen_working_that_disappears_has_finished() {
        let running = [entry("codex_q", "Running", "p2", 10)];
        let mut w = AgentWatch::new(None, &running);
        assert!(!w.settled(&running));
        assert!(w.settled(&[]));
    }

    #[test]
    fn a_question_settles_it_like_an_answer() {
        let mut w = AgentWatch::new(None, &[]);
        assert!(w.settled(&[entry("claude_code_q", "Waiting", "p2", 5)]));
    }

    #[test]
    fn any_agent_still_working_holds_it() {
        let mut w = AgentWatch::new(None, &[]);
        let entries = [entry("a", "Done", "p1", 5), entry("b", "Running", "p2", 5)];
        assert!(!w.settled(&entries));
    }
}
