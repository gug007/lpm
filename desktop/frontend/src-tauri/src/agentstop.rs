// Noticing that an agent stopped when no hook says so.
//
// A turn the user interrupts ends without a Stop hook. Claude Code documents it
// — "Stop … does not run if the stoppage occurred due to a user interrupt" — and
// Codex has no abort event at all. The tab is left holding the Running its last
// PreToolUse reported and shimmers on, until some later turn happens to end
// normally. Nothing in the hook set can close that gap: StopFailure is API
// errors, SessionEnd needs the session to actually end, and Notification's idle
// signal is a minute late and suppressed exactly when the user is at the
// keyboard.
//
// Both agents write the truth to disk regardless.
//
//   Claude keeps a live record per agent process at `<config>/sessions/<pid>.json`
//   whose `status` leaves `busy` the moment the turn does — measured at 0.16s
//   after Esc. The pid is the agent process's own, which is how a pane finds its
//   record (agentnest::pane_agent_pid).
//
//   Codex appends `{"type":"turn_aborted","reason":"interrupted"}` to its session
//   rollout, and never follows it with the `task_complete` that would have ended
//   the turn. A pane finds its rollout by the session id its SessionStart hook
//   already reports (socketsrv::cmd_set_resume).
//
// Neither file is a supported contract, so every uncertainty leaves the badge
// alone: no record, no pid, an unparsable file, two agents in one pane, a remote
// pane whose agent runs on another machine's process table. A Running that
// lingers is the bug we started with; a Running cleared out from under a working
// agent is a worse one.
//
// This only ever CLEARS. It must never report Done: Done rings the finish chime
// and pushes "Agent finished" to paired phones (statusnotify.rs), and nobody
// finished.
//
// KNOWN GAP. `claude_stop_cmd` holds Running past the end of a turn whenever
// work is still in flight behind it, and the agent's own record does not say so
// for every kind. A backgrounded Bash is covered — the record says `shell` and
// this reads that as working — but an MCP task, a long-running cloud agent, and
// the agent's own background scans all leave the record on `idle` while that
// hook is deliberately holding Running. The badge then goes dark until the
// harness re-prompts and a PreToolUse lights it again. Closing that needs a
// signal the record doesn't carry; re-checking the Stop payload is not possible
// from here, and the entry's own timestamp cannot stand in for one because the
// store dedups a re-reported Running without advancing it (status.rs).
use crate::status::{KeyProvider, StatusStore};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

/// How often a Running badge is checked against its agent. Only panes actually
/// holding one are looked at, so an idle app does no work at all.
const POLL: Duration = Duration::from_secs(2);

/// Enough of a rollout's tail to hold the current turn's events.
const ROLLOUT_TAIL_BYTES: u64 = 1 << 20;

/// How long a rollout that could not be found stays not-found. Long enough that
/// a pane whose rollout will never appear stops re-walking the archive every
/// poll, short enough that one Codex writes moments after reporting its id is
/// still picked up.
const MISS_TTL: Duration = Duration::from_secs(30);

/// What an agent's own state says about the turn a badge is still claiming.
#[derive(PartialEq, Debug)]
enum Liveness {
    /// The agent says it is working; leave the badge alone.
    Working,
    /// The turn ended without a hook to say so; retire the badge.
    Stopped,
    /// Nothing legible. Leave the badge alone.
    Unknown,
}

/// The session id each pane's agent reported at SessionStart, which is how a
/// Codex pane is matched to its rollout. Claude needs no entry here — its record
/// is keyed by pid, which the process tree already answers.
#[derive(Default)]
pub struct PaneSessions(Mutex<HashMap<String, String>>);

impl PaneSessions {
    pub fn set(&self, pane_id: &str, session_id: &str) {
        if pane_id.is_empty() || session_id.is_empty() {
            return;
        }
        self.0
            .lock()
            .unwrap()
            .insert(pane_id.to_string(), session_id.to_string());
    }

    fn get(&self, pane_id: &str) -> Option<String> {
        self.0.lock().unwrap().get(pane_id).cloned()
    }
}

/// Claude's live record for the agent running in `pane_id`. Every step that can
/// come back empty means the same thing — nothing legible — so the whole lookup
/// is one `?` chain and the fallback is stated once.
fn claude_liveness(app: &AppHandle, pane_id: &str, root: &Path) -> Liveness {
    claude_record(app, pane_id, root).unwrap_or(Liveness::Unknown)
}

fn claude_record(app: &AppHandle, pane_id: &str, root: &Path) -> Option<Liveness> {
    let state = app.state::<crate::pty::PtyState>();
    // None for a remote pane: its agent lives in another machine's process
    // table, and its record is on that machine's disk.
    let shell = crate::pty::local_session_pid(&state, pane_id)?;
    let pid = crate::agentnest::pane_agent_pid(shell)?;
    // The record is removed when the agent exits, and a session that inherits
    // CLAUDE_CODE_* never registers one at all.
    let text = std::fs::read_to_string(root.join(format!("{pid}.json"))).ok()?;
    let json: serde_json::Value = serde_json::from_str(&text).ok()?;
    Some(claude_status_liveness(
        json.get("status").and_then(|v| v.as_str()),
    ))
}

/// Read the `status` of a Claude session record. Only `idle` retires a badge.
///
/// `waiting` is the agent blocked on the user mid-turn, and clearing then would
/// take away the one hint that something needs answering.
///
/// `shell` looks like a finish and is not one: the agent writes it for a turn
/// that ended while a backgrounded Bash is still running, which is exactly the
/// state `claude_stop_cmd` re-asserts Running for (see the `background_tasks`
/// reasoning in hooks.rs). Reading it as stopped would delete the badge that
/// hook deliberately wrote, and leave the tab dark for the whole background
/// command. An interrupt lands on `idle`, never here, so nothing is lost.
///
/// An unrecognised state is a future word, so it says nothing.
fn claude_status_liveness(status: Option<&str>) -> Liveness {
    match status {
        Some("busy") | Some("waiting") | Some("shell") => Liveness::Working,
        Some("idle") => Liveness::Stopped,
        _ => Liveness::Unknown,
    }
}

/// Find the rollout Codex is writing for `session_id` by the id its filename
/// carries, walking the YYYY/MM/DD layout. `file_type()` comes from the
/// directory entry itself, so recursing costs no extra syscall.
fn search_rollout(session_id: &str) -> Option<PathBuf> {
    let suffix = format!("{session_id}.jsonl");
    let mut stack = vec![crate::agent_limits::codex_sessions_dir()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            if entry.file_type().is_ok_and(|t| t.is_dir()) {
                stack.push(entry.path());
                continue;
            }
            let name = entry.file_name();
            let Some(name) = name.to_str() else { continue };
            // The id is unique, so the first match is the only match.
            if name.starts_with("rollout-") && name.ends_with(&suffix) {
                return Some(entry.path());
            }
        }
    }
    None
}

/// What is known about one session's rollout.
enum Rollout {
    At(PathBuf),
    /// Searched and not found, at this time. Remembered too: a lookup that keeps
    /// missing is the expensive one — a full walk of an archive that only grows,
    /// repeated for as long as the pane holds its badge.
    Missing(Instant),
}

/// The rollout for `session_id`, remembered either way.
///
/// A hit is dropped the moment the file stops existing, so a pruned or moved
/// rollout is looked up again. A miss expires on [`MISS_TTL`] rather than being
/// permanent, because the legitimate miss is a rollout Codex has not written
/// YET: SessionStart reports the id first, and the file follows.
fn rollout_for(session_id: &str) -> Option<PathBuf> {
    static KNOWN: OnceLock<Mutex<HashMap<String, Rollout>>> = OnceLock::new();
    let cell = KNOWN.get_or_init(|| Mutex::new(HashMap::new()));
    let mut known = cell.lock().unwrap();
    remembered(&mut known, session_id, search_rollout)
}

/// The memo itself, with the search injected so what it chooses to re-run is
/// testable without a Codex archive on disk.
fn remembered(
    known: &mut HashMap<String, Rollout>,
    session_id: &str,
    search: impl Fn(&str) -> Option<PathBuf>,
) -> Option<PathBuf> {
    match known.get(session_id) {
        Some(Rollout::At(path)) if path.exists() => return Some(path.clone()),
        Some(Rollout::Missing(at)) if at.elapsed() < MISS_TTL => return None,
        _ => {}
    }
    let found = search(session_id);
    known.insert(
        session_id.to_string(),
        match &found {
            Some(path) => Rollout::At(path.clone()),
            None => Rollout::Missing(Instant::now()),
        },
    );
    found
}

/// Whether the last turn in a rollout tail was aborted. Only the three events
/// that bound a turn are read, so anything an agent merely printed — including a
/// transcript quoting these very names — cannot be mistaken for one.
fn aborted_in_tail(text: &str) -> Liveness {
    for line in text.lines().rev() {
        let Ok(json) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        if json.get("type").and_then(|v| v.as_str()) != Some("event_msg") {
            continue;
        }
        match json
            .get("payload")
            .and_then(|p| p.get("type"))
            .and_then(|v| v.as_str())
        {
            Some("turn_aborted") => return Liveness::Stopped,
            // Either other boundary means a turn that is running or finished
            // cleanly — the hooks speak for both.
            Some("task_started") | Some("task_complete") => return Liveness::Working,
            _ => {}
        }
    }
    Liveness::Unknown
}

fn codex_liveness(app: &AppHandle, pane_id: &str) -> Liveness {
    codex_rollout(app, pane_id).unwrap_or(Liveness::Unknown)
}

fn codex_rollout(app: &AppHandle, pane_id: &str) -> Option<Liveness> {
    // A remote pane writes its rollout on the host, so searching this machine's
    // archive for it can only ever fail — expensively, and forever.
    let state = app.state::<crate::pty::PtyState>();
    crate::pty::local_session_pid(&state, pane_id)?;
    let session_id = app.state::<Arc<PaneSessions>>().get(pane_id)?;
    let path = rollout_for(&session_id)?;
    let text = crate::agent_limits::read_tail(&path, ROLLOUT_TAIL_BYTES)?;
    Some(aborted_in_tail(&text))
}

/// Retire every Running badge whose agent says the turn is over.
///
/// A project's Claude config dir is resolved once here rather than per entry:
/// finding it parses the project's YAML off disk (config.rs), and several panes
/// of one project would otherwise each pay for that on every tick.
fn reconcile(app: &AppHandle, store: &StatusStore) {
    let mut roots: HashMap<String, PathBuf> = HashMap::new();
    let mut changed: HashSet<String> = HashSet::new();
    for (project, key, pane_id) in store.running_agents() {
        let verdict = match crate::status::key_provider(&key) {
            Some(KeyProvider::Claude) => {
                let root = roots.entry(project.clone()).or_insert_with(|| {
                    crate::hooks::claude_records_dir(
                        crate::config::claude_env_for_project_readonly(&project),
                    )
                });
                claude_liveness(app, &pane_id, root)
            }
            Some(KeyProvider::Codex) => codex_liveness(app, &pane_id),
            // Somebody's own key, via `lpm set-status`. It speaks for itself.
            None => Liveness::Unknown,
        };
        if verdict != Liveness::Stopped {
            continue;
        }
        // Re-read rather than trusting the snapshot: a Done or Waiting may have
        // landed while the agent's own state was being read, and that report is
        // the better answer.
        if store.clear_if_value(&project, &key, crate::status::STATUS_RUNNING) {
            changed.insert(project);
        }
    }
    for project in changed {
        let _ = app.emit("status-changed", &project);
    }
}

pub fn start(app: AppHandle, store: Arc<StatusStore>) {
    std::thread::spawn(move || loop {
        std::thread::sleep(POLL);
        reconcile(&app, &store);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(payload_type: &str) -> String {
        format!(r#"{{"type":"event_msg","payload":{{"type":"{payload_type}"}}}}"#)
    }

    #[test]
    fn an_aborted_turn_is_stopped() {
        let text = [line("task_started"), line("turn_aborted")].join("\n");
        assert_eq!(aborted_in_tail(&text), Liveness::Stopped);
    }

    #[test]
    fn a_turn_started_after_an_abort_is_working_again() {
        let text = [
            line("task_started"),
            line("turn_aborted"),
            line("task_started"),
        ]
        .join("\n");
        assert_eq!(aborted_in_tail(&text), Liveness::Working);
    }

    #[test]
    fn a_completed_turn_leaves_the_badge_to_its_own_hook() {
        let text = [line("task_started"), line("task_complete")].join("\n");
        assert_eq!(aborted_in_tail(&text), Liveness::Working);
    }

    #[test]
    fn a_tail_with_no_turn_boundary_says_nothing() {
        assert_eq!(aborted_in_tail(""), Liveness::Unknown);
        assert_eq!(aborted_in_tail(&line("token_count")), Liveness::Unknown);
        assert_eq!(aborted_in_tail("not json at all"), Liveness::Unknown);
    }

    /// A rollout holds whatever an agent read or wrote, so the words themselves
    /// appear in it constantly. Only a real event record counts.
    #[test]
    fn text_quoting_the_event_names_is_not_an_event() {
        let quoted = r#"{"type":"response_item","payload":{"type":"message","text":"if (t===\"turn_aborted\") ..."}}"#;
        assert_eq!(aborted_in_tail(quoted), Liveness::Unknown);
        let as_response = r#"{"type":"response_item","payload":{"type":"turn_aborted"}}"#;
        assert_eq!(aborted_in_tail(as_response), Liveness::Unknown);
    }

    #[test]
    fn only_a_finished_turn_retires_a_claude_badge() {
        assert_eq!(claude_status_liveness(Some("busy")), Liveness::Working);
        // Blocked on the user is still inside the turn: clearing here would take
        // away the only hint that something needs answering.
        assert_eq!(claude_status_liveness(Some("waiting")), Liveness::Working);
        // `shell` is a turn that ended with a backgrounded Bash still running —
        // the state claude_stop_cmd re-asserts Running for on purpose.
        assert_eq!(claude_status_liveness(Some("shell")), Liveness::Working);
        assert_eq!(claude_status_liveness(Some("idle")), Liveness::Stopped);
        // A word this doesn't know is not a verdict.
        assert_eq!(
            claude_status_liveness(Some("compacting")),
            Liveness::Unknown
        );
        assert_eq!(claude_status_liveness(None), Liveness::Unknown);
    }

    /// A miss is the expensive lookup — a full walk of an archive that only
    /// grows — so it must not repeat every poll.
    #[test]
    fn a_miss_is_searched_once_and_then_remembered() {
        use std::cell::Cell;
        let searches = Cell::new(0);
        let mut known = HashMap::new();
        let search = |_: &str| {
            searches.set(searches.get() + 1);
            None
        };
        assert_eq!(remembered(&mut known, "sid", search), None);
        assert_eq!(remembered(&mut known, "sid", search), None);
        assert_eq!(remembered(&mut known, "sid", search), None);
        assert_eq!(
            searches.get(),
            1,
            "the archive is walked once, not per call"
        );
    }

    /// The miss has to expire: Codex writes the rollout shortly AFTER
    /// SessionStart reports the id, so a permanent miss would be a dead leg.
    #[test]
    fn an_expired_miss_is_searched_again() {
        let mut known = HashMap::new();
        known.insert(
            "sid".to_string(),
            Rollout::Missing(Instant::now() - MISS_TTL - Duration::from_secs(1)),
        );
        let found = PathBuf::from("/nonexistent/rollout-sid.jsonl");
        assert_eq!(
            remembered(&mut known, "sid", |_| Some(found.clone())),
            Some(found)
        );
    }

    /// A remembered hit that has since been pruned or moved is looked up again
    /// rather than handed out as a path to nothing.
    #[test]
    fn a_vanished_hit_is_searched_again() {
        let mut known = HashMap::new();
        known.insert(
            "sid".to_string(),
            Rollout::At(PathBuf::from("/nonexistent/gone.jsonl")),
        );
        let searched = std::cell::Cell::new(false);
        remembered(&mut known, "sid", |_| {
            searched.set(true);
            None
        });
        assert!(
            searched.get(),
            "a hit that no longer exists must not be reused"
        );
    }

    #[test]
    fn pane_sessions_ignores_empty_ids() {
        let map = PaneSessions::default();
        map.set("", "sid");
        map.set("pty-1", "");
        assert_eq!(map.get("pty-1"), None);
        map.set("pty-1", "sid");
        assert_eq!(map.get("pty-1").as_deref(), Some("sid"));
    }
}
