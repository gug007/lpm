//! Finished agents the user has looked at. Opening a Done or a problem used to
//! delete it; with Keep finished agents until archived on, it moves here instead,
//! so the sidebar keeps listing it, muted, until it is archived, its tab closes,
//! or it has been seen for longer than the auto-archive setting. Nothing else
//! reads this list: to badges, chimes and notifications a seen agent is as gone
//! as a dismissed one.
use super::{is_agent_key, now_millis, retain_in, StatusEntry, StatusStore, STATUS_DONE, STATUS_ERROR};
use crate::config;
use serde_json::Value;
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

const MINUTE_MS: i64 = 60_000;
const HOUR_MS: i64 = 60 * MINUTE_MS;
const DAY_MS: i64 = 24 * HOUR_MS;
const MAX_AMOUNT: i64 = 999;
const SWEEP_EVERY: Duration = Duration::from_secs(60);
static WAKE: OnceLock<Sender<()>> = OnceLock::new();

pub(super) fn is_finished(value: &str) -> bool {
    value == STATUS_DONE || value == STATUS_ERROR
}

/// Settings › General › Keep finished agents until archived. Unset means off.
pub fn keeps_finished(settings: &Value) -> bool {
    settings
        .get("keepFinishedAgents")
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

/// How long an agent stays seen before it archives itself; None for never.
/// Unset, or a value it can't read, means a day.
fn archive_after_ms(settings: &Value) -> Option<i64> {
    match settings.get("autoArchiveAgentsAfter").and_then(Value::as_str) {
        Some("never") => None,
        value => Some(value.and_then(duration_ms).unwrap_or(DAY_MS)),
    }
}

/// An amount from 1 to 999 and a unit — m, h, d or w — as in "90m" or "2d".
fn duration_ms(value: &str) -> Option<i64> {
    if !value.is_ascii() {
        return None;
    }
    let (amount, unit) = value.split_at(value.len().checked_sub(1)?);
    let amount = amount.parse::<i64>().ok().filter(|n| (1..=MAX_AMOUNT).contains(n))?;
    let unit_ms = match unit {
        "m" => MINUTE_MS,
        "h" => HOUR_MS,
        "d" => DAY_MS,
        "w" => 7 * DAY_MS,
        _ => return None,
    };
    Some(amount * unit_ms)
}

/// What Settings › General › Archive seen agents automatically may hold.
pub fn is_archive_after(value: &str) -> bool {
    value == "never" || duration_ms(value).is_some()
}

/// Settings › General › Seen agents per project, 1–10. Unset means 3.
pub fn seen_shown(settings: &Value) -> u64 {
    settings
        .get("seenAgentsShown")
        .and_then(Value::as_u64)
        .map_or(3, |n| n.clamp(1, 10))
}

impl StatusStore {
    /// A project's seen agents, most recently seen first. A closing tab's are
    /// out of sight, as in `list`.
    pub fn seen_list(&self, project: &str) -> Vec<StatusEntry> {
        let mut out = self.visible_in(&self.seen, project);
        out.sort_by(|a, b| b.seen_at.cmp(&a.seen_at).then(a.key.cmp(&b.key)));
        out
    }

    fn has_seen(&self) -> bool {
        !self.seen.read().unwrap().is_empty()
    }

    fn see(&self, project: &str, now: i64, pick: impl Fn(&StatusEntry) -> bool) -> bool {
        let mut m = self.entries.write().unwrap();
        let Some(bucket) = m.get_mut(project) else {
            return false;
        };
        let keys: Vec<String> = bucket
            .values()
            .filter(|e| is_finished(&e.value) && pick(e))
            .map(|e| e.key.clone())
            .collect();
        if keys.is_empty() {
            return false;
        }
        let mut seen = self.seen.write().unwrap();
        let into = seen.entry(project.to_string()).or_default();
        for key in keys {
            if let Some(mut e) = bucket.remove(&key) {
                e.seen_at = now;
                e.revived = false;
                into.insert(key, e);
            }
        }
        if bucket.is_empty() {
            m.remove(project);
        }
        true
    }

    /// The tab-click dismiss, keeping what finished: every `value` on `pane_id`.
    fn mark_seen_on_pane(&self, project: &str, pane_id: &str, value: &str, now: i64) -> bool {
        self.see(project, now, |e| e.pane_id == pane_id && e.value == value)
    }

    /// Mark `keys` seen without opening them. One already seen counts as seen
    /// again from `now`, which restarts its auto-archive clock.
    pub(super) fn mark_seen(&self, project: &str, keys: &[String], now: i64) -> bool {
        let moved = self.see(project, now, |e| keys.contains(&e.key));
        let mut seen = self.seen.write().unwrap();
        let mut touched = false;
        if let Some(bucket) = seen.get_mut(project) {
            for e in bucket.values_mut().filter(|e| keys.contains(&e.key) && e.seen_at != now) {
                e.seen_at = now;
                touched = true;
            }
        }
        moved || touched
    }

    /// Back to the list as they were, but `revived`: their finish was announced once.
    pub fn mark_unread(&self, project: &str, keys: &[String]) -> bool {
        let mut m = self.entries.write().unwrap();
        let mut seen = self.seen.write().unwrap();
        let Some(bucket) = seen.get_mut(project) else {
            return false;
        };
        let back: Vec<StatusEntry> = keys.iter().filter_map(|key| bucket.remove(key)).collect();
        if bucket.is_empty() {
            seen.remove(project);
        }
        let into = m.entry(project.to_string()).or_default();
        for mut e in back.iter().cloned() {
            e.seen_at = 0;
            e.revived = true;
            into.entry(e.key.clone()).or_insert(e);
        }
        !back.is_empty()
    }

    /// Take `keys` off the sidebar: seen ones, and finished ones not yet seen.
    /// What is still working or asking stays.
    pub fn archive(&self, project: &str, keys: &[String]) -> bool {
        let unseen = retain_in(&self.seen, project, |e| keys.contains(&e.key));
        self.retain_where(project, |e| is_finished(&e.value) && keys.contains(&e.key)) || unseen
    }

    /// Archive every seen agent `keep` turns down, naming the projects that lost one.
    fn prune_seen(&self, keep: impl Fn(&StatusEntry) -> bool) -> Vec<String> {
        let mut seen = self.seen.write().unwrap();
        let mut changed = Vec::new();
        seen.retain(|project, bucket| {
            let before = bucket.len();
            bucket.retain(|_, e| keep(e));
            if bucket.len() != before {
                changed.push(project.clone());
            }
            !bucket.is_empty()
        });
        changed
    }

    /// A report means the agent is at it again: its seen entry, and for an agent
    /// any other seen one on the same tab, give way to it.
    pub(super) fn forget_seen(&self, project: &str, reported: &StatusEntry) {
        let pane = reported.pane_id.as_str();
        let agent = !pane.is_empty() && is_agent_key(&reported.key);
        retain_in(&self.seen, project, |e| e.key == reported.key || (agent && e.pane_id == pane));
    }
}

/// What looking at the `value` on `pane_id` does: a finish turns seen while Keep
/// finished agents until archived is on; anything else is dismissed as before.
pub fn retire_viewed(store: &StatusStore, project: &str, pane_id: &str, value: &str) -> bool {
    if is_finished(value) && keeps_finished(&config::load_settings()) {
        return store.mark_seen_on_pane(project, pane_id, value, now_millis());
    }
    store.clear_by_pane_value(project, pane_id, value)
}

/// Mark `keys` seen without opening them — or, with Keep finished agents until
/// archived off, archive them, as opening them would.
pub fn retire_unopened(store: &StatusStore, project: &str, keys: &[String]) -> bool {
    if keeps_finished(&config::load_settings()) {
        return store.mark_seen(project, keys, now_millis());
    }
    store.archive(project, keys)
}

fn sweep(store: &StatusStore, settings: &Value, now: i64) -> Vec<String> {
    if !keeps_finished(settings) {
        return store.prune_seen(|_| false);
    }
    match archive_after_ms(settings) {
        Some(after) => store.prune_seen(|e| now - e.seen_at < after),
        None => Vec::new(),
    }
}

/// Archives seen agents once they're past the auto-archive time, and all of them
/// when the setting that keeps them is switched off.
pub fn start_sweep(app: AppHandle) {
    let (tx, rx) = channel();
    if WAKE.set(tx).is_err() {
        return;
    }
    std::thread::spawn(move || loop {
        let _ = rx.recv_timeout(SWEEP_EVERY);
        let store = app.state::<Arc<StatusStore>>();
        if !store.has_seen() {
            continue;
        }
        for project in sweep(&store, &config::load_settings(), now_millis()) {
            let _ = app.emit("status-changed", &project);
        }
    });
}

/// Look again now: the settings may have changed.
pub fn nudge() {
    if let Some(tx) = WAKE.get() {
        let _ = tx.send(());
    }
}

#[tauri::command]
pub fn archive_agent_status(
    app: AppHandle,
    store: State<'_, Arc<StatusStore>>,
    project: String,
    keys: Vec<String>,
) -> Result<(), String> {
    if store.archive(&project, &keys) {
        let _ = app.emit("status-changed", &project);
    }
    Ok(())
}

#[tauri::command]
pub fn mark_agent_status_seen(
    app: AppHandle,
    store: State<'_, Arc<StatusStore>>,
    project: String,
    keys: Vec<String>,
) -> Result<(), String> {
    if retire_unopened(&store, &project, &keys) {
        let _ = app.emit("status-changed", &project);
    }
    Ok(())
}

#[tauri::command]
pub fn mark_agent_status_unread(
    app: AppHandle,
    store: State<'_, Arc<StatusStore>>,
    project: String,
    keys: Vec<String>,
) -> Result<(), String> {
    if store.mark_unread(&project, &keys) {
        let _ = app.emit("status-changed", &project);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::super::{STATUS_RUNNING, STATUS_WAITING};
    use super::*;
    use serde_json::json;

    fn entry(key: &str, value: &str, ts: i64, pane: &str) -> StatusEntry {
        StatusEntry {
            key: key.into(),
            value: value.into(),
            timestamp: ts,
            pane_id: pane.into(),
            ..Default::default()
        }
    }

    fn keys(list: Vec<StatusEntry>) -> Vec<String> {
        let mut keys: Vec<String> = list.into_iter().map(|e| e.key).collect();
        keys.sort();
        keys
    }

    fn strings(keys: &[&str]) -> Vec<String> {
        keys.iter().map(|k| k.to_string()).collect()
    }

    #[test]
    fn opening_a_finish_keeps_it_as_seen() {
        let s = StatusStore::new();
        s.set("p", entry("claude_code_a", STATUS_DONE, 100, "p-1"));
        s.set("p", entry("claude_code_b", STATUS_WAITING, 100, "p-1"));
        assert!(s.mark_seen_on_pane("p", "p-1", STATUS_DONE, 500));
        assert_eq!(keys(s.list("p")), ["claude_code_b"]);
        let seen = s.seen_list("p");
        assert_eq!((seen[0].key.as_str(), seen[0].seen_at), ("claude_code_a", 500));
        assert!(!s.mark_seen_on_pane("p", "p-1", STATUS_WAITING, 600), "a question is never seen");
    }

    #[test]
    fn the_agents_next_turn_takes_the_tab_back() {
        let s = StatusStore::new();
        s.set("p", entry("claude_code_a", STATUS_DONE, 100, "p-1"));
        s.set("p", entry("claude_code_c", STATUS_DONE, 100, "p-2"));
        s.mark_seen("p", &strings(&["claude_code_a", "claude_code_c"]), 200);
        s.set("p", entry("claude_code_new", STATUS_RUNNING, 300, "p-1"));
        assert_eq!(keys(s.seen_list("p")), ["claude_code_c"]);
        s.set("p", entry("deploy", STATUS_RUNNING, 300, "p-2"));
        assert_eq!(keys(s.seen_list("p")), ["claude_code_c"], "only an agent takes the tab");
        s.set("p", entry("claude_code_c", STATUS_RUNNING, 400, "p-2"));
        assert!(s.seen_list("p").is_empty());
    }

    #[test]
    fn archive_takes_finished_agents_and_leaves_work() {
        let s = StatusStore::new();
        s.set("p", entry("a", STATUS_DONE, 100, "p-1"));
        s.set("p", entry("b", STATUS_ERROR, 100, "p-2"));
        s.set("p", entry("c", STATUS_RUNNING, 100, "p-3"));
        s.mark_seen("p", &strings(&["a"]), 200);
        assert!(s.archive("p", &strings(&["a", "b", "c"])));
        assert!(s.seen_list("p").is_empty());
        assert_eq!(keys(s.list("p")), ["c"]);
        assert!(!s.archive("p", &strings(&["a"])), "already gone");
    }

    #[test]
    fn unread_comes_back_without_announcing_itself_again() {
        let s = StatusStore::new();
        s.set("p", entry("a", STATUS_DONE, 100, "p-1"));
        s.mark_seen("p", &strings(&["a"]), 200);
        assert!(s.mark_unread("p", &strings(&["a"])));
        let e = s.get("p", "a").unwrap();
        assert_eq!((e.timestamp, e.seen_at, e.revived), (100, 0, true));
        assert!(s.seen_list("p").is_empty());
        assert!(!s.mark_unread("p", &strings(&["a"])));
    }

    #[test]
    fn seeing_again_restarts_the_clock() {
        let s = StatusStore::new();
        s.set("p", entry("a", STATUS_DONE, 100, "p-1"));
        s.mark_seen("p", &strings(&["a"]), 200);
        assert!(s.mark_seen("p", &strings(&["a"]), 900));
        assert_eq!(s.seen_list("p")[0].seen_at, 900);
    }

    #[test]
    fn closing_and_moving_a_tab_take_its_seen_agents_along() {
        let s = StatusStore::new();
        s.set("p", entry("a", STATUS_DONE, 100, "p-1"));
        s.set("p", entry("b", STATUS_DONE, 100, "p-2"));
        s.mark_seen("p", &strings(&["a", "b"]), 200);
        assert!(s.move_pane("p", "p-1", "p-9"));
        assert_eq!(s.seen_list("p").iter().find(|e| e.key == "a").unwrap().pane_id, "p-9");
        s.hold_pane("p-2");
        assert_eq!(keys(s.seen_list("p")), ["a"], "a closing tab is out of sight");
        assert!(s.clear_pane("p", "p-2"));
        s.release_pane("p-2");
        assert_eq!(keys(s.seen_list("p")), ["a"]);
    }

    #[test]
    fn clear_status_from_the_cli_archives_a_seen_agent() {
        let s = StatusStore::new();
        s.set("p", entry("a", STATUS_DONE, 100, "p-1"));
        s.mark_seen("p", &strings(&["a"]), 200);
        assert!(s.clear("p", "a"));
        assert!(s.seen_list("p").is_empty());
    }

    #[test]
    fn the_sweep_archives_what_was_seen_too_long_ago() {
        let s = StatusStore::new();
        s.set("p", entry("old", STATUS_DONE, 100, "p-1"));
        s.set("q", entry("new", STATUS_DONE, 100, "q-1"));
        s.mark_seen("p", &strings(&["old"]), 0);
        s.mark_seen("q", &strings(&["new"]), 23 * HOUR_MS);
        let keep = json!({ "keepFinishedAgents": true });
        assert_eq!(sweep(&s, &keep, 24 * HOUR_MS), ["p"]);
        assert_eq!(keys(s.seen_list("q")), ["new"]);
        let never = json!({ "keepFinishedAgents": true, "autoArchiveAgentsAfter": "never" });
        assert!(sweep(&s, &never, 99 * HOUR_MS).is_empty());
        assert_eq!(sweep(&s, &json!({}), 0), ["q"], "off unless switched on");
    }

    #[test]
    fn settings_read_their_defaults() {
        assert!(!keeps_finished(&json!({})));
        assert_eq!(archive_after_ms(&json!({})), Some(24 * HOUR_MS));
        assert_eq!(archive_after_ms(&json!({ "autoArchiveAgentsAfter": "8h" })), Some(8 * HOUR_MS));
        assert_eq!(archive_after_ms(&json!({ "autoArchiveAgentsAfter": "90m" })), Some(90 * MINUTE_MS));
        assert_eq!(archive_after_ms(&json!({ "autoArchiveAgentsAfter": "3w" })), Some(21 * DAY_MS));
        assert_eq!(archive_after_ms(&json!({ "autoArchiveAgentsAfter": "never" })), None);
        assert_eq!(archive_after_ms(&json!({ "autoArchiveAgentsAfter": "soon" })), Some(DAY_MS));
        for bad in ["", "0d", "1000h", "2y", "d", "-1d", "1.5h", "2дн"] {
            assert!(!is_archive_after(bad), "{bad}");
        }
        assert!(is_archive_after("999m") && is_archive_after("never"));
        assert_eq!(seen_shown(&json!({})), 3);
        assert_eq!(seen_shown(&json!({ "seenAgentsShown": 40 })), 10);
    }
}
