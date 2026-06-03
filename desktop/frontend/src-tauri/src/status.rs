// Per-pane status store — port of desktop/status.go.
//
// Agents running inside panes report status over the unix socket (socketsrv.rs),
// which lands here as StatusEntry rows keyed by (project, key). The store feeds
// the `statusEntries` array of each ProjectInfo (so badges render) and the
// pane-level ClearStatus command (tab-click dismiss of Done/Error).
use serde::Serialize;
use std::collections::HashMap;
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
    pub timestamp: i64, // unix millis
    #[serde(rename = "agentPID", skip_serializing_if = "is_zero")]
    pub agent_pid: i64,
    #[serde(rename = "paneID", skip_serializing_if = "String::is_empty")]
    pub pane_id: String,
}

#[derive(Default)]
pub struct StatusStore {
    // project -> (key -> entry)
    entries: RwLock<HashMap<String, HashMap<String, StatusEntry>>>,
}

/// Dedup gate (status.go shouldReplace): only value/icon/color/priority count —
/// not timestamp/pid/pane — so re-reporting the same status emits no event.
fn should_replace(existing: &StatusEntry, incoming: &StatusEntry) -> bool {
    existing.value != incoming.value
        || existing.icon != incoming.icon
        || existing.color != incoming.color
        || existing.priority != incoming.priority
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
    pub fn set(&self, project: &str, entry: StatusEntry) -> bool {
        let mut m = self.entries.write().unwrap();
        let bucket = m.entry(project.to_string()).or_default();
        if let Some(existing) = bucket.get(&entry.key) {
            if !should_replace(existing, &entry) {
                return false;
            }
        }
        bucket.insert(entry.key.clone(), entry);
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
        self.retain_where(project, |e| e.pane_id == pane_id)
    }

    /// Entries for a project, sorted priority desc, timestamp desc, key asc.
    /// Missing project -> empty Vec (serializes to `[]`, never `null`).
    pub fn list(&self, project: &str) -> Vec<StatusEntry> {
        let m = self.entries.read().unwrap();
        let mut out: Vec<StatusEntry> = match m.get(project) {
            Some(b) => b.values().cloned().collect(),
            None => return Vec::new(),
        };
        out.sort_by(|a, b| {
            b.priority
                .cmp(&a.priority)
                .then(b.timestamp.cmp(&a.timestamp))
                .then(a.key.cmp(&b.key))
        });
        out
    }

    /// (project, key, pid) for every entry carrying a live agent PID — feeds the sweep.
    fn pid_candidates(&self) -> Vec<(String, String, i64)> {
        let m = self.entries.read().unwrap();
        let mut out = Vec::new();
        for (project, bucket) in m.iter() {
            for (key, e) in bucket {
                if e.agent_pid > 0 {
                    out.push((project.clone(), key.clone(), e.agent_pid));
                }
            }
        }
        out
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

/// Every 30s, clear entries whose agent PID is gone (kill(pid,0)==ESRCH).
/// Hooks don't pass --pid today, so this is dormant but kept for fidelity.
pub fn start_pid_sweep(store: Arc<StatusStore>, app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(30));
        for (project, key, pid) in store.pid_candidates() {
            let alive = unsafe { libc::kill(pid as libc::pid_t, 0) } == 0
                || std::io::Error::last_os_error().raw_os_error() != Some(libc::ESRCH);
            if !alive && store.clear(&project, &key) {
                let _ = app.emit("status-changed", &project);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn set_dedups_unchanged() {
        let s = StatusStore::new();
        assert!(s.set("p", entry("k", "Running", 0, 1, "p-1")), "first set changes");
        assert!(!s.set("p", entry("k", "Running", 0, 999, "p-1")), "same value/icon/color/priority dedups");
        assert!(s.set("p", entry("k", "Done", 0, 2, "p-1")), "value change replaces");
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
        assert!(!s.clear_by_pane_value("p", "p-1", "Done"), "second clear is a no-op");
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
}
