// Per-pane status store — port of desktop/status.go.
//
// Agents running inside panes report status over the unix socket (socketsrv.rs),
// which lands here as StatusEntry rows keyed by (project, key). The store feeds
// the `statusEntries` array of each ProjectInfo (so badges render) and the
// pane-level ClearStatus command (tab-click dismiss of Done/Error).
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};

#[allow(dead_code)] // agents send "Running"; kept for the full StatusKind set
pub const STATUS_RUNNING: &str = "Running";
pub const STATUS_DONE: &str = "Done";
pub const STATUS_WAITING: &str = "Waiting";
pub const STATUS_ERROR: &str = "Error";

fn is_zero(v: &i64) -> bool {
    *v == 0
}

#[derive(Serialize, Clone, Default)]
pub struct StatusEntry {
    pub key: String,
    pub value: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub icon: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub color: String,
    pub priority: i64,
    pub timestamp: i64, // unix millis — when this state began
    #[serde(rename = "agentPID", skip_serializing_if = "is_zero")]
    pub agent_pid: i64,
    #[serde(rename = "paneID", skip_serializing_if = "String::is_empty")]
    pub pane_id: String,
    /// When the agent picked this turn up, carried across the states within it
    /// so a UI can say how long the work has run rather than how long it has
    /// been in its latest state. Zero when the turn's start was never seen.
    #[serde(rename = "turnStart", skip_serializing_if = "is_zero")]
    pub turn_start: i64,
    /// When the turn finished, so an elapsed reading can stop there instead of
    /// counting on past the work it measures. Zero while the turn is running.
    #[serde(rename = "endedAt", skip_serializing_if = "is_zero")]
    pub ended_at: i64,
    /// A Waiting only the agent's own hooks can end. An MCP dialog answers with
    /// ElicitationResult, and the tool call's spinner keeps animating while it
    /// waits, so what the pane draws says nothing about it (agentturn.rs).
    #[serde(skip)]
    pub held: bool,
    /// Prompts submitted while this turn was still going. Claude runs each as a
    /// turn of its own once this one stops — with no start hook of its own, its
    /// UserPromptSubmit having fired at queue time.
    #[serde(skip)]
    pub queued: u32,
}

/// Carry `turn_start` from the entry being replaced, and stamp `ended_at` when
/// this is the report that ends the turn. A turn spans the states the agent is
/// live in, so an approval pause (Running -> Waiting -> Running) stays one turn.
/// Done and Error both end one — an Error is the turn failing — so the next
/// report, like one with nothing before it, starts a fresh turn rather than
/// timing the new work from the start of the failed one.
fn carry_turn(existing: Option<&StatusEntry>, incoming: &mut StatusEntry) {
    let started = existing.filter(|e| is_live(&e.value)).map(|e| {
        if e.turn_start > 0 {
            e.turn_start
        } else {
            e.timestamp
        }
    });
    if is_live(&incoming.value) {
        incoming.turn_start = started.unwrap_or(incoming.timestamp);
        incoming.ended_at = 0;
        incoming.queued = existing.filter(|e| is_live(&e.value)).map_or(0, |e| e.queued);
    } else if incoming.value == STATUS_DONE || incoming.value == STATUS_ERROR {
        incoming.turn_start = started.unwrap_or(0);
        incoming.ended_at = incoming.timestamp;
    }
}

#[derive(Default)]
pub struct StatusStore {
    // project -> (key -> entry)
    entries: RwLock<HashMap<String, HashMap<String, StatusEntry>>>,
    // Tabs the user closed that can still be reopened: their agents keep
    // running and reporting, but nobody is shown or told about a tab that is gone.
    closing: RwLock<HashSet<String>>,
    // Pane ids a reconnected tab left behind, to the id it has now.
    moved: RwLock<HashMap<String, String>>,
}

/// How many reconnects the store remembers; past it, the oldest are forgotten.
const MOVED_CAP: usize = 256;

/// Dedup gate (status.go shouldReplace): re-reporting the same status emits no
/// event, so timestamp and pid don't count. The pane does: a report that only
/// moves an agent to another tab must still move its badge there.
fn should_replace(existing: &StatusEntry, incoming: &StatusEntry) -> bool {
    existing.value != incoming.value
        || existing.icon != incoming.icon
        || existing.color != incoming.color
        || existing.priority != incoming.priority
        || existing.pane_id != incoming.pane_id
}

/// Whether `current` is still the report `seen` was taken of: the dedup above
/// keeps a re-reported entry's timestamp, so value and timestamp name a report.
fn same_report(current: &StatusEntry, seen: &StatusEntry) -> bool {
    current.value == seen.value && current.timestamp == seen.timestamp
}

/// The keys the agent hooks report under (hooks.rs). A key outside these is a
/// caller's own — `lpm set-status` — and speaks for whatever it likes.
pub fn is_agent_key(key: &str) -> bool {
    key.starts_with("claude_code_") || key.starts_with("codex_")
}

/// A state an agent holds only while something is happening right now.
pub fn is_live(value: &str) -> bool {
    value == STATUS_RUNNING || value == STATUS_WAITING
}

pub fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

impl StatusStore {
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns `changed` (true when the caller should emit status-changed).
    pub fn set(&self, project: &str, mut entry: StatusEntry) -> bool {
        let mut m = self.entries.write().unwrap();
        let bucket = m.entry(project.to_string()).or_default();
        let existing = bucket.get(&entry.key);
        // A re-report of the state already held keeps the entry it would have
        // replaced, timestamps and all, so the turn is dated from its first
        // report rather than its latest.
        if existing.is_some_and(|e| !should_replace(e, &entry)) {
            return false;
        }
        carry_turn(existing, &mut entry);
        bucket.insert(entry.key.clone(), entry);
        true
    }

    /// Remove `key` only if it still holds the report that was observed — a hook
    /// that reported since then knows better than whoever observed the old one.
    pub fn clear_if_unchanged(&self, project: &str, key: &str, seen: &StatusEntry) -> bool {
        let mut m = self.entries.write().unwrap();
        let Some(bucket) = m.get_mut(project) else {
            return false;
        };
        if !bucket.get(key).is_some_and(|e| same_report(e, seen)) {
            return false;
        }
        bucket.remove(key);
        if bucket.is_empty() {
            m.remove(project);
        }
        true
    }

    /// Replace the observed report with `next`, under the same condition as
    /// [`Self::clear_if_unchanged`]. The turn carries over as with any report.
    pub fn replace_if_unchanged(&self, project: &str, seen: &StatusEntry, mut next: StatusEntry) -> bool {
        let mut m = self.entries.write().unwrap();
        let Some(bucket) = m.get_mut(project) else {
            return false;
        };
        let Some(existing) = bucket.get(&seen.key).filter(|e| same_report(e, seen)) else {
            return false;
        };
        carry_turn(Some(existing), &mut next);
        bucket.insert(next.key.clone(), next);
        true
    }

    /// Count a submitted prompt against `key`'s turn when that turn is still
    /// live, so it queues rather than restarting it. False when nothing is live,
    /// in which case the prompt simply starts a turn.
    pub fn queue_prompt(&self, project: &str, key: &str) -> bool {
        let mut m = self.entries.write().unwrap();
        let Some(e) = m.get_mut(project).and_then(|b| b.get_mut(key)) else {
            return false;
        };
        if !is_live(&e.value) {
            return false;
        }
        e.queued += 1;
        true
    }

    /// Take one queued prompt off `key`'s live turn, if it has any.
    pub fn take_queued_prompt(&self, project: &str, key: &str) -> bool {
        let mut m = self.entries.write().unwrap();
        let Some(e) = m.get_mut(project).and_then(|b| b.get_mut(key)) else {
            return false;
        };
        if !is_live(&e.value) || e.queued == 0 {
            return false;
        }
        e.queued -= 1;
        true
    }

    /// Retire what other sessions of the same agent left on `pane` when `key`
    /// reports there. A terminal runs one Claude in its foreground at a time, so
    /// an older session still marked working there stopped without saying so —
    /// and, outranking the live one, it hid what that one reported. Codex keys
    /// name their pane, so another one on it was carried over from the pane id
    /// the tab had before it reconnected, and the agent reporting now replaces it.
    pub fn retire_other_sessions(&self, project: &str, key: &str, pane: &str) -> bool {
        if pane.is_empty() {
            return false;
        }
        let other = |e: &StatusEntry, prefix: &str| {
            e.key != key && e.pane_id == pane && e.key.starts_with(prefix)
        };
        if key.starts_with("claude_code_") {
            self.retain_where(project, |e| other(e, "claude_code_") && is_live(&e.value))
        } else if key.starts_with("codex_") {
            self.retain_where(project, |e| other(e, "codex_"))
        } else {
            false
        }
    }

    /// Whether `key` still holds the report `seen` was taken of.
    pub fn holds(&self, project: &str, seen: &StatusEntry) -> bool {
        let m = self.entries.read().unwrap();
        m.get(project)
            .and_then(|b| b.get(&seen.key))
            .is_some_and(|e| same_report(e, seen))
    }

    /// The live entry `key` holds right now, if any.
    pub fn live_entry(&self, project: &str, key: &str) -> Option<StatusEntry> {
        let m = self.entries.read().unwrap();
        m.get(project)?.get(key).filter(|e| is_live(&e.value)).cloned()
    }

    /// Every agent report that says something is happening on a terminal right
    /// now, with its project.
    pub fn live_agent_entries(&self) -> Vec<(String, StatusEntry)> {
        let m = self.entries.read().unwrap();
        m.iter()
            .flat_map(|(project, bucket)| {
                bucket
                    .values()
                    .filter(|e| is_agent_key(&e.key) && is_live(&e.value) && !e.pane_id.is_empty())
                    .map(move |e| (project.clone(), e.clone()))
            })
            .collect()
    }

    /// [`Self::live_agent_entries`] of one terminal.
    pub fn live_agent_entries_on(&self, project: &str, pane_id: &str) -> Vec<StatusEntry> {
        let m = self.entries.read().unwrap();
        m.get(project)
            .map(|bucket| {
                bucket
                    .values()
                    .filter(|e| e.pane_id == pane_id && is_agent_key(&e.key) && is_live(&e.value))
                    .cloned()
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Remove `key` only while it says something is happening now: whatever
    /// ended the agent leaves a finish or a problem for the user to see.
    pub fn clear_live(&self, project: &str, key: &str) -> bool {
        let mut m = self.entries.write().unwrap();
        let Some(bucket) = m.get_mut(project) else {
            return false;
        };
        if !bucket.get(key).is_some_and(|e| is_live(&e.value)) {
            return false;
        }
        bucket.remove(key);
        if bucket.is_empty() {
            m.remove(project);
        }
        true
    }

    pub fn clear(&self, project: &str, key: &str) -> bool {
        let mut m = self.entries.write().unwrap();
        let Some(bucket) = m.get_mut(project) else {
            return false;
        };
        if bucket.remove(key).is_none() {
            return false;
        }
        if bucket.is_empty() {
            m.remove(project);
        }
        true
    }

    /// Drop every entry of `project` for which `drop` returns true, removing the
    /// project bucket once it empties. Returns whether anything was removed.
    fn retain_where<F: Fn(&StatusEntry) -> bool>(&self, project: &str, drop: F) -> bool {
        let mut m = self.entries.write().unwrap();
        let Some(bucket) = m.get_mut(project) else {
            return false;
        };
        let before = bucket.len();
        bucket.retain(|_, e| !drop(e));
        let changed = bucket.len() != before;
        if changed && bucket.is_empty() {
            m.remove(project);
        }
        changed
    }

    /// Remove every entry of `project` whose value==value && pane_id==pane_id.
    /// Drives the tab-click dismiss (status.go ClearByPaneValue).
    pub fn clear_by_pane_value(&self, project: &str, pane_id: &str, value: &str) -> bool {
        self.retain_where(project, |e| e.value == value && e.pane_id == pane_id)
    }

    /// Remove every entry of `project` for `pane_id`, regardless of value.
    /// Drives close cleanup so a killed pane leaves no orphaned status behind
    /// (a stale Waiting/Done would otherwise outrank a new pane's status).
    pub fn clear_pane(&self, project: &str, pane_id: &str) -> bool {
        self.release_pane(pane_id);
        self.retain_where(project, |e| e.pane_id == pane_id)
    }

    /// Keep a closing tab's statuses out of every list until the close is undone
    /// (`release_pane`) or completed (`clear_pane`). True when that changed.
    pub fn hold_pane(&self, pane_id: &str) -> bool {
        self.closing.write().unwrap().insert(pane_id.to_string())
    }

    pub fn release_pane(&self, pane_id: &str) -> bool {
        self.closing.write().unwrap().remove(pane_id)
    }

    pub fn is_closing(&self, pane_id: &str) -> bool {
        !pane_id.is_empty() && self.closing.read().unwrap().contains(pane_id)
    }

    /// Hand everything `old_pane_id` showed to `new_pane_id`: a reconnected SSH
    /// terminal is the same tab under a new pane id. An agent in the host's tmux
    /// outlived the dropped connection and is still working or asking; one that
    /// died with it is retired the usual way — a working one once its terminal
    /// goes quiet, a question by a click on the tab (agentturn.rs). Its later
    /// reports, and any it queued while the connection was down, still name the
    /// old pane, so the move is remembered for them (`current_pane`).
    ///
    /// Key, value and timestamp are left alone so the phone's already-delivered
    /// notification is neither withdrawn nor sent a second time — `remote.rs`
    /// dedups on those three and never on the pane.
    pub fn move_pane(&self, project: &str, old_pane_id: &str, new_pane_id: &str) -> bool {
        // An empty pane would match every status set outside a terminal.
        if old_pane_id.is_empty() || old_pane_id == new_pane_id {
            return false;
        }
        self.remember_move(old_pane_id, new_pane_id);
        let mut m = self.entries.write().unwrap();
        let Some(bucket) = m.get_mut(project) else {
            return false;
        };
        let mut moved = false;
        for e in bucket.values_mut().filter(|e| e.pane_id == old_pane_id) {
            e.pane_id = new_pane_id.to_string();
            moved = true;
        }
        moved
    }

    fn remember_move(&self, old_pane_id: &str, new_pane_id: &str) {
        let mut moved = self.moved.write().unwrap();
        if moved.len() >= MOVED_CAP {
            moved.clear();
        }
        for to in moved.values_mut().filter(|to| *to == old_pane_id) {
            *to = new_pane_id.to_string();
        }
        moved.insert(old_pane_id.to_string(), new_pane_id.to_string());
    }

    /// The pane a report naming `pane_id` belongs to now.
    pub fn current_pane(&self, pane_id: &str) -> String {
        self.moved
            .read()
            .unwrap()
            .get(pane_id)
            .cloned()
            .unwrap_or_else(|| pane_id.to_string())
    }

    /// Entries for a project, sorted priority desc, timestamp desc, key asc.
    /// Missing project -> empty Vec (serializes to `[]`, never `null`).
    pub fn list(&self, project: &str) -> Vec<StatusEntry> {
        let m = self.entries.read().unwrap();
        let Some(bucket) = m.get(project) else {
            return Vec::new();
        };
        let closing = self.closing.read().unwrap();
        let mut out: Vec<StatusEntry> = bucket
            .values()
            .filter(|e| !closing.contains(&e.pane_id))
            .cloned()
            .collect();
        out.sort_by(|a, b| {
            b.priority
                .cmp(&a.priority)
                .then(b.timestamp.cmp(&a.timestamp))
                .then(a.key.cmp(&b.key))
        });
        out
    }

    /// Every entry that names the process it speaks for (`--pid`), with its
    /// project — the agent sweep retires them once that process is gone.
    pub fn pid_entries(&self) -> Vec<(String, StatusEntry)> {
        let m = self.entries.read().unwrap();
        m.iter()
            .flat_map(|(project, bucket)| {
                bucket
                    .values()
                    .filter(|e| e.agent_pid > 0)
                    .map(move |e| (project.clone(), e.clone()))
            })
            .collect()
    }
}

/// App-level ClearStatus: dismiss the status of `value` on pane `pane_id`.
/// Frontend sends {project, paneId, value}; paneId -> pane_id via Tauri camelCase.
#[tauri::command]
pub fn clear_status(
    app: AppHandle,
    store: State<'_, Arc<StatusStore>>,
    project: String,
    pane_id: String,
    value: String,
) -> Result<(), String> {
    if store.clear_by_pane_value(&project, &pane_id, &value) {
        let _ = app.emit("status-changed", &project);
    }
    Ok(())
}

/// App-level ClearPaneStatus: drop ALL status of a pane (used when its terminal
/// is closed). Frontend sends {project, paneId}; paneId -> pane_id via camelCase.
#[tauri::command]
pub fn clear_pane_status(
    app: AppHandle,
    store: State<'_, Arc<StatusStore>>,
    project: String,
    pane_id: String,
) -> Result<(), String> {
    if store.clear_pane(&project, &pane_id) {
        let _ = app.emit("status-changed", &project);
    }
    Ok(())
}

/// App-level HoldPaneStatus / ReleasePaneStatus: a tab closed with Undo still
/// on offer hides its statuses until the close is undone, or until
/// ClearPaneStatus completes it.
#[tauri::command]
pub fn hold_pane_status(
    app: AppHandle,
    store: State<'_, Arc<StatusStore>>,
    project: String,
    pane_id: String,
) -> Result<(), String> {
    if store.hold_pane(&pane_id) {
        let _ = app.emit("status-changed", &project);
    }
    Ok(())
}

#[tauri::command]
pub fn release_pane_status(
    app: AppHandle,
    store: State<'_, Arc<StatusStore>>,
    project: String,
    pane_id: String,
) -> Result<(), String> {
    if store.release_pane(&pane_id) {
        let _ = app.emit("status-changed", &project);
    }
    Ok(())
}

/// App-level MovePaneStatus: a remote terminal that came back under a new pane
/// id keeps the finishes and problems it was already showing. Frontend sends
/// {project, oldPaneId, newPaneId}.
#[tauri::command]
pub fn move_pane_status(
    app: AppHandle,
    store: State<'_, Arc<StatusStore>>,
    project: String,
    old_pane_id: String,
    new_pane_id: String,
) -> Result<(), String> {
    if store.move_pane(&project, &old_pane_id, &new_pane_id) {
        let _ = app.emit("status-changed", &project);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn agent_keys_are_the_ones_the_hooks_report_under() {
        assert!(is_agent_key("claude_code_9a15513b-e4a3"));
        assert!(is_agent_key("codex_pty-3"));
        // A caller's own key: `lpm set-status` names whatever it likes, and the
        // nested-agent rule has no business second-guessing it.
        assert!(!is_agent_key("deploy"));
        assert!(!is_agent_key("claude"));
        assert!(!is_agent_key("my_codex_run"));
    }

    fn entry(key: &str, value: &str, priority: i64, ts: i64, pane: &str) -> StatusEntry {
        StatusEntry {
            key: key.into(),
            value: value.into(),
            priority,
            timestamp: ts,
            pane_id: pane.into(),
            ..Default::default()
        }
    }

    #[test]
    fn a_reconnected_codex_tab_keeps_one_codex() {
        let s = StatusStore::new();
        s.set("p", entry("codex_p-1", STATUS_DONE, 0, 100, "p-1"));
        assert!(s.move_pane("p", "p-1", "p-2"));
        assert!(s.retire_other_sessions("p", "codex_p-2", "p-2"));
        s.set("p", entry("codex_p-2", STATUS_RUNNING, 0, 200, "p-2"));
        assert_eq!(only(&s, "p").key, "codex_p-2");
        assert!(!s.retire_other_sessions("p", "claude_code_x", "p-2"), "another agent's stays");
    }

    #[test]
    fn a_closing_tab_is_out_of_sight_until_reopened_or_closed_for_good() {
        let s = StatusStore::new();
        s.set("p", entry("a", STATUS_WAITING, 0, 100, "p-1"));
        s.set("p", entry("b", STATUS_RUNNING, 0, 100, "p-2"));
        assert!(s.hold_pane("p-1"));
        assert!(s.is_closing("p-1"));
        s.set("p", entry("a", STATUS_DONE, 0, 200, "p-1"));
        assert_eq!(s.list("p").iter().map(|e| e.key.as_str()).collect::<Vec<_>>(), ["b"]);

        assert!(s.release_pane("p-1"));
        assert_eq!(s.list("p").len(), 2, "undo brings back what it reported meanwhile");

        s.hold_pane("p-1");
        assert!(s.clear_pane("p", "p-1"));
        assert!(!s.is_closing("p-1"));
    }

    #[test]
    fn a_report_from_another_tab_moves_the_badge() {
        let s = StatusStore::new();
        s.set("p", entry("k", STATUS_RUNNING, 0, 100, "p-1"));
        assert!(s.set("p", entry("k", STATUS_RUNNING, 0, 200, "p-2")));
        let e = only(&s, "p");
        assert_eq!(e.pane_id, "p-2");
        assert_eq!(e.turn_start, 100, "still the same turn");
    }

    #[test]
    fn an_observed_report_is_only_retired_if_nothing_newer_came() {
        let s = StatusStore::new();
        s.set("p", entry("k", STATUS_WAITING, 0, 100, "p-1"));
        let seen = only(&s, "p");
        s.set("p", entry("k", STATUS_RUNNING, 0, 200, "p-1"));
        assert!(!s.clear_if_unchanged("p", "k", &seen));
        assert!(!s.replace_if_unchanged("p", &seen, entry("k", STATUS_RUNNING, 0, 300, "p-1")));
        assert_eq!(only(&s, "p").timestamp, 200);
        let seen = only(&s, "p");
        assert!(s.clear_if_unchanged("p", "k", &seen));
        assert!(s.list("p").is_empty());
    }

    #[test]
    fn an_answered_wait_resumes_the_same_turn() {
        let s = StatusStore::new();
        s.set("p", entry("k", STATUS_RUNNING, 0, 100, "p-1"));
        s.set("p", entry("k", STATUS_WAITING, 0, 200, "p-1"));
        let seen = only(&s, "p");
        assert!(s.replace_if_unchanged("p", &seen, entry("k", STATUS_RUNNING, 0, 300, "p-1")));
        let e = only(&s, "p");
        assert_eq!((e.value.as_str(), e.turn_start), (STATUS_RUNNING, 100));
    }

    #[test]
    fn a_live_clear_leaves_a_finish_for_the_user() {
        let s = StatusStore::new();
        s.set("p", entry("claude_code_a", STATUS_DONE, 0, 100, "p-1"));
        s.set("p", entry("claude_code_b", STATUS_WAITING, 0, 100, "p-1"));
        assert!(!s.clear_live("p", "claude_code_a"));
        assert!(s.clear_live("p", "claude_code_b"));
        assert_eq!(only(&s, "p").key, "claude_code_a");
    }

    #[test]
    fn live_agent_entries_are_agents_doing_something_on_a_terminal() {
        let s = StatusStore::new();
        s.set("p", entry("claude_code_a", STATUS_RUNNING, 0, 1, "p-1"));
        s.set("p", entry("codex_p-2", STATUS_WAITING, 0, 1, "p-2"));
        s.set("p", entry("claude_code_b", STATUS_DONE, 0, 1, "p-1"));
        s.set("p", entry("deploy", STATUS_RUNNING, 0, 1, "p-1"));
        s.set("q", entry("codex_x", STATUS_RUNNING, 0, 1, ""));
        let mut keys: Vec<String> = s.live_agent_entries().into_iter().map(|(_, e)| e.key).collect();
        keys.sort();
        assert_eq!(keys, ["claude_code_a", "codex_p-2"]);
        assert_eq!(s.live_agent_entries_on("p", "p-1").len(), 1);
    }

    #[test]
    fn set_dedups_unchanged() {
        let s = StatusStore::new();
        assert!(
            s.set("p", entry("k", "Running", 0, 1, "p-1")),
            "first set changes"
        );
        assert!(
            !s.set("p", entry("k", "Running", 0, 999, "p-1")),
            "same value/icon/color/priority dedups"
        );
        assert!(
            s.set("p", entry("k", "Done", 0, 2, "p-1")),
            "value change replaces"
        );
    }

    fn only(s: &StatusStore, project: &str) -> StatusEntry {
        s.list(project).into_iter().next().expect("one entry")
    }

    #[test]
    fn turn_starts_at_the_first_active_report() {
        let s = StatusStore::new();
        s.set("p", entry("k", STATUS_RUNNING, 0, 100, "p-1"));
        let e = only(&s, "p");
        assert_eq!(e.turn_start, 100);
        assert_eq!(e.ended_at, 0, "a running turn has not ended");
    }

    #[test]
    fn turn_spans_an_approval_pause() {
        let s = StatusStore::new();
        s.set("p", entry("k", STATUS_RUNNING, 0, 100, "p-1"));
        s.set("p", entry("k", STATUS_WAITING, 0, 200, "p-1"));
        s.set("p", entry("k", STATUS_RUNNING, 0, 300, "p-1"));
        let e = only(&s, "p");
        assert_eq!(e.turn_start, 100, "one turn, not three");
        assert_eq!(e.timestamp, 300, "but the state itself began at 300");
    }

    #[test]
    fn done_keeps_the_turn_and_stamps_its_end() {
        let s = StatusStore::new();
        s.set("p", entry("k", STATUS_RUNNING, 0, 100, "p-1"));
        s.set("p", entry("k", STATUS_DONE, 0, 400, "p-1"));
        let e = only(&s, "p");
        assert_eq!(e.turn_start, 100);
        assert_eq!(e.ended_at, 400, "300ms of work, held still");
    }

    #[test]
    fn a_repeated_report_does_not_redate_the_turn() {
        let s = StatusStore::new();
        s.set("p", entry("k", STATUS_RUNNING, 0, 100, "p-1"));
        s.set("p", entry("k", STATUS_RUNNING, 0, 999, "p-1"));
        assert_eq!(only(&s, "p").turn_start, 100);
    }

    #[test]
    fn work_after_a_finish_is_a_new_turn() {
        let s = StatusStore::new();
        s.set("p", entry("k", STATUS_RUNNING, 0, 100, "p-1"));
        s.set("p", entry("k", STATUS_DONE, 0, 200, "p-1"));
        s.set("p", entry("k", STATUS_RUNNING, 0, 300, "p-1"));
        let e = only(&s, "p");
        assert_eq!(e.turn_start, 300);
        assert_eq!(e.ended_at, 0, "the finish stamp does not outlive its turn");
    }

    #[test]
    fn a_finish_with_nothing_before_it_reports_no_turn() {
        let s = StatusStore::new();
        s.set("p", entry("k", STATUS_DONE, 0, 400, "p-1"));
        let e = only(&s, "p");
        assert_eq!(e.turn_start, 0, "how long it ran is unknowable");
        assert_eq!(e.ended_at, 400);
    }

    #[test]
    fn a_problem_belongs_to_the_turn_it_interrupts() {
        let s = StatusStore::new();
        s.set("p", entry("k", STATUS_RUNNING, 0, 100, "p-1"));
        s.set("p", entry("k", STATUS_ERROR, 0, 200, "p-1"));
        assert_eq!(only(&s, "p").turn_start, 100);
    }

    #[test]
    fn work_after_a_failure_is_a_new_turn() {
        let s = StatusStore::new();
        s.set("p", entry("k", STATUS_RUNNING, 0, 100, "p-1"));
        s.set("p", entry("k", STATUS_ERROR, 0, 200, "p-1"));
        assert_eq!(only(&s, "p").ended_at, 200, "the failure ends the turn");
        s.set("p", entry("k", STATUS_RUNNING, 0, 500, "p-1"));
        let e = only(&s, "p");
        assert_eq!((e.turn_start, e.ended_at), (500, 0));
    }

    #[test]
    fn a_prompt_sent_mid_turn_queues_behind_it() {
        let s = StatusStore::new();
        assert!(!s.queue_prompt("p", "k"), "nothing to queue behind");
        s.set("p", entry("k", STATUS_RUNNING, 0, 100, "p-1"));
        assert!(s.queue_prompt("p", "k"));
        s.set("p", entry("k", STATUS_WAITING, 0, 200, "p-1"));
        s.set("p", entry("k", STATUS_RUNNING, 0, 300, "p-1"));
        assert!(s.take_queued_prompt("p", "k"), "the queue survives the turn's pauses");
        assert!(!s.take_queued_prompt("p", "k"));
        s.set("p", entry("k", STATUS_DONE, 0, 400, "p-1"));
        assert!(!s.queue_prompt("p", "k"), "a finished turn queues nothing");
    }

    #[test]
    fn a_newer_session_on_a_tab_retires_the_older_ones_still_marked_working() {
        let s = StatusStore::new();
        s.set("p", entry("claude_code_old", STATUS_RUNNING, 0, 1, "p-1"));
        s.set("p", entry("claude_code_done", STATUS_DONE, 0, 1, "p-1"));
        s.set("p", entry("claude_code_elsewhere", STATUS_RUNNING, 0, 1, "p-2"));
        s.set("p", entry("codex_p-1", STATUS_RUNNING, 0, 1, "p-1"));
        assert!(s.retire_other_sessions("p", "claude_code_new", "p-1"));
        let mut keys: Vec<String> = s.list("p").into_iter().map(|e| e.key).collect();
        keys.sort();
        assert_eq!(keys, ["claude_code_done", "claude_code_elsewhere", "codex_p-1"]);
    }

    #[test]
    fn a_cleared_agent_starts_over() {
        let s = StatusStore::new();
        s.set("p", entry("k", STATUS_RUNNING, 0, 100, "p-1"));
        assert!(s.clear("p", "k"));
        s.set("p", entry("k", STATUS_RUNNING, 0, 300, "p-1"));
        assert_eq!(only(&s, "p").turn_start, 300);
    }

    #[test]
    fn list_sorts_priority_then_ts_then_key() {
        let s = StatusStore::new();
        s.set("p", entry("a", "Running", 1, 100, "p-1"));
        s.set("p", entry("b", "Running", 5, 50, "p-2"));
        s.set("p", entry("c", "Running", 5, 50, "p-3"));
        let got: Vec<String> = s.list("p").into_iter().map(|e| e.key).collect();
        assert_eq!(got, ["b", "c", "a"]); // priority desc; tie -> ts desc; tie -> key asc
        assert!(s.list("missing").is_empty()); // -> serializes to []
    }

    #[test]
    fn clear_by_pane_value_only_matching() {
        let s = StatusStore::new();
        s.set("p", entry("done1", "Done", 0, 1, "p-1"));
        s.set("p", entry("wait1", "Waiting", 0, 1, "p-1"));
        s.set("p", entry("done2", "Done", 0, 1, "p-2"));
        assert!(s.clear_by_pane_value("p", "p-1", "Done"));
        let keys: Vec<String> = s.list("p").into_iter().map(|e| e.key).collect();
        assert_eq!(keys, ["done2", "wait1"]); // p-1 Done gone; Waiting survives (persist rule); p-2 Done untouched
        assert!(
            !s.clear_by_pane_value("p", "p-1", "Done"),
            "second clear is a no-op"
        );
    }

    #[test]
    fn clear_pane_removes_all_values_for_pane() {
        let s = StatusStore::new();
        s.set("p", entry("run1", "Running", 0, 1, "p-1"));
        s.set("p", entry("wait1", "Waiting", 0, 1, "p-1"));
        s.set("p", entry("run2", "Running", 0, 1, "p-2"));
        assert!(s.clear_pane("p", "p-1"));
        let keys: Vec<String> = s.list("p").into_iter().map(|e| e.key).collect();
        assert_eq!(keys, ["run2"]); // every p-1 entry gone regardless of value; p-2 untouched
        assert!(!s.clear_pane("p", "p-1"), "second clear is a no-op");
    }

    #[test]
    fn a_reconnected_pane_keeps_the_work_that_finished() {
        let s = StatusStore::new();
        s.set("p", entry("done1", STATUS_DONE, 0, 100, "p-1"));
        s.set("p", entry("err1", STATUS_ERROR, 0, 100, "p-1"));
        s.set("p", entry("done2", STATUS_DONE, 0, 100, "p-2"));

        assert!(s.move_pane("p", "p-1", "p-9"));

        let got: Vec<(String, String)> = s
            .list("p")
            .into_iter()
            .map(|e| (e.key, e.pane_id))
            .collect();
        assert_eq!(
            got,
            [
                ("done1".to_string(), "p-9".to_string()),
                ("done2".to_string(), "p-2".to_string()),
                ("err1".to_string(), "p-9".to_string()),
            ]
        );
    }

    // An agent in the host's tmux outlives the connection: it is still working
    // or asking on the reconnected tab, and its reports still name the old pane.
    #[test]
    fn a_reconnected_pane_keeps_what_its_agents_are_doing() {
        let s = StatusStore::new();
        s.set("p", entry("run1", STATUS_RUNNING, 0, 100, "p-1"));
        s.set("p", entry("wait1", STATUS_WAITING, 0, 100, "p-1"));
        assert!(s.move_pane("p", "p-1", "p-9"));
        assert!(s.list("p").iter().all(|e| e.pane_id == "p-9"));
        assert_eq!(s.current_pane("p-1"), "p-9");
        s.move_pane("p", "p-9", "p-12");
        assert_eq!(s.current_pane("p-1"), "p-12", "a second reconnect");
        assert_eq!(s.current_pane("p-3"), "p-3");
    }

    // An empty pane id belongs to every status set outside a terminal, so it must
    // never be read as "this pane".
    #[test]
    fn moving_nothing_in_particular_moves_nothing() {
        let s = StatusStore::new();
        s.set("p", entry("job", STATUS_DONE, 0, 100, ""));
        assert!(!s.move_pane("p", "", "p-9"));
        assert!(!s.move_pane("p", "p-1", "p-1"));
        assert_eq!(only(&s, "p").pane_id, "");
    }

    // The phone withdraws a notification when its key disappears, so a move must
    // not look like one — key, value and timestamp are what it compares.
    #[test]
    fn moving_a_pane_leaves_the_notification_alone() {
        let s = StatusStore::new();
        s.set("p", entry("done1", STATUS_DONE, 0, 100, "p-1"));
        let before = only(&s, "p");
        s.move_pane("p", "p-1", "p-9");
        let after = only(&s, "p");
        assert_eq!(
            (after.key, after.value, after.timestamp),
            (before.key, before.value, before.timestamp)
        );
        assert_eq!(
            (after.turn_start, after.ended_at),
            (before.turn_start, before.ended_at)
        );
    }

    #[test]
    fn moving_a_pane_with_nothing_on_it_changes_nothing() {
        let s = StatusStore::new();
        s.set("p", entry("done2", STATUS_DONE, 0, 100, "p-2"));
        assert!(!s.move_pane("p", "p-1", "p-9"));
        assert!(!s.move_pane("missing", "p-1", "p-9"));
    }
}
