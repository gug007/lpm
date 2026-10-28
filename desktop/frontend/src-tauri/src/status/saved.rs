//! Finished agents across a restart. The store lives in memory, so while Keep
//! finished agents until archived is on, the finished and seen agents are
//! written to disk under the tab they belong to — its history key, since a
//! restored tab comes back under a new terminal id — and put back when lpm
//! starts. Until the window reports that tab again (`attach`), a restored agent
//! belongs to no tab: terminal ids start over each run, so an old one could
//! name somebody else's tab.
use super::seen::{is_finished, keeps_finished};
use super::{StatusEntry, StatusStore};
use crate::config;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use std::path::PathBuf;
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, LazyLock, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Listener, Manager};

/// Changes come in bursts while agents work; one write covers a burst.
const SAVE_AFTER: Duration = Duration::from_secs(2);

#[derive(Serialize, Deserialize)]
struct Saved {
    /// The history key of the tab the agent ran in.
    tab: String,
    entry: StatusEntry,
}

/// project -> its saved agents, in a stable order so an unchanged list writes
/// the same bytes.
type SavedAgents = BTreeMap<String, Vec<Saved>>;

/// Terminal id -> the history key of its tab, as the windows last reported.
static TABS: LazyLock<Mutex<HashMap<String, String>>> = LazyLock::new(Mutex::default);
/// project -> history key -> the keys of restored agents waiting for that tab.
static WAITING: LazyLock<Mutex<HashMap<String, HashMap<String, Vec<String>>>>> =
    LazyLock::new(Mutex::default);
static SAVE: OnceLock<Sender<()>> = OnceLock::new();
static WRITTEN: LazyLock<Mutex<Vec<u8>>> = LazyLock::new(Mutex::default);

fn path() -> PathBuf {
    config::lpm_dir().join("finished-agents.json")
}

/// Put back what the last run left, then keep the file in step with the store.
pub fn start(app: &AppHandle) {
    let (tx, rx) = channel();
    if SAVE.set(tx).is_err() {
        return;
    }
    let store = app.state::<Arc<StatusStore>>().inner().clone();
    if keeps_finished(&config::load_settings()) {
        restore(&store, read());
    }
    std::thread::spawn(move || {
        while rx.recv().is_ok() {
            std::thread::sleep(SAVE_AFTER);
            while rx.try_recv().is_ok() {}
            save(&store);
        }
    });
    app.listen("status-changed", |_| changed());
}

fn changed() {
    if let Some(tx) = SAVE.get() {
        let _ = tx.send(());
    }
}

fn read() -> SavedAgents {
    std::fs::read(path())
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn restore(store: &StatusStore, saved: SavedAgents) {
    let mut waiting = WAITING.lock().unwrap();
    for (project, agents) in saved {
        for Saved { tab, mut entry } in agents {
            entry.pane_id.clear();
            waiting
                .entry(project.clone())
                .or_default()
                .entry(tab)
                .or_default()
                .push(entry.key.clone());
            store.put_back(&project, entry);
        }
    }
}

fn save(store: &StatusStore) {
    let saved = if keeps_finished(&config::load_settings()) {
        store.saved_agents()
    } else {
        SavedAgents::new()
    };
    let Ok(bytes) = serde_json::to_vec_pretty(&saved) else {
        return;
    };
    let mut written = WRITTEN.lock().unwrap();
    if *written == bytes {
        return;
    }
    let _ = std::fs::create_dir_all(config::lpm_dir());
    if crate::fsatomic::write(&path(), &bytes, crate::fsatomic::Mode::Preserve(0o644)).is_ok() {
        *written = bytes;
    }
}

/// `project`'s tabs as a window has them now, terminal id and history key each:
/// a restored agent goes back on its tab. True when one did.
pub fn attach(store: &StatusStore, project: &str, tabs: &[(String, String)]) -> bool {
    TABS.lock().unwrap().extend(tabs.iter().cloned());
    let mut placed = false;
    let mut waiting = WAITING.lock().unwrap();
    if let Some(by_tab) = waiting.get_mut(project) {
        for (pane, tab) in tabs {
            if let Some(keys) = by_tab.remove(tab) {
                placed |= store.place(project, &keys, pane);
            }
        }
        if by_tab.is_empty() {
            waiting.remove(project);
        }
    }
    drop(waiting);
    changed();
    placed
}

impl StatusStore {
    /// A saved agent, back where it was: seen, or finished and not yet seen.
    /// It was announced before the restart, so it isn't announced again.
    fn put_back(&self, project: &str, mut entry: StatusEntry) {
        if !is_finished(&entry.value) {
            return;
        }
        let mut m = self.entries.write().unwrap();
        let mut seen = self.seen.write().unwrap();
        let live = m.get(project).is_some_and(|b| b.contains_key(&entry.key));
        let shown = seen.get(project).is_some_and(|b| b.contains_key(&entry.key));
        if live || shown {
            return;
        }
        let into = if entry.seen_at > 0 { &mut *seen } else { &mut *m };
        entry.revived = entry.seen_at == 0;
        into.entry(project.to_string()).or_default().insert(entry.key.clone(), entry);
    }

    /// Put restored agents with no tab yet on `pane`.
    fn place(&self, project: &str, keys: &[String], pane: &str) -> bool {
        let mut placed = false;
        for map in [&self.entries, &self.seen] {
            if let Some(bucket) = map.write().unwrap().get_mut(project) {
                for e in bucket.values_mut().filter(|e| e.pane_id.is_empty() && keys.contains(&e.key)) {
                    e.pane_id = pane.to_string();
                    placed = true;
                }
            }
        }
        placed
    }

    /// Every finished and seen agent whose tab is known, by project.
    fn saved_agents(&self) -> SavedAgents {
        let tabs = TABS.lock().unwrap();
        let waiting = WAITING.lock().unwrap();
        let tab_of = |project: &str, e: &StatusEntry| -> Option<String> {
            if !e.pane_id.is_empty() {
                return tabs.get(&e.pane_id).cloned();
            }
            waiting.get(project).and_then(|by_tab| {
                by_tab.iter().find(|(_, keys)| keys.contains(&e.key)).map(|(tab, _)| tab.clone())
            })
        };
        let mut out = SavedAgents::new();
        let m = self.entries.read().unwrap();
        let seen = self.seen.read().unwrap();
        let finished = m.iter().map(|(p, b)| (p, b.values().filter(|e| is_finished(&e.value)).collect::<Vec<_>>()));
        let opened = seen.iter().map(|(p, b)| (p, b.values().collect::<Vec<_>>()));
        for (project, entries) in finished.chain(opened) {
            for e in entries {
                if let Some(tab) = tab_of(project, e) {
                    out.entry(project.clone()).or_default().push(Saved { tab, entry: e.clone() });
                }
            }
        }
        for agents in out.values_mut() {
            agents.sort_by(|a, b| a.entry.key.cmp(&b.entry.key));
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::super::{STATUS_DONE, STATUS_RUNNING};
    use super::*;

    fn entry(key: &str, value: &str, pane: &str, seen_at: i64) -> StatusEntry {
        StatusEntry {
            key: key.into(),
            value: value.into(),
            timestamp: 100,
            pane_id: pane.into(),
            seen_at,
            ..Default::default()
        }
    }

    // One test: TABS and WAITING are process-wide, as they are in the app.
    #[test]
    fn a_finished_agent_comes_back_on_its_tab_after_a_restart() {
        let before = StatusStore::new();
        TABS.lock().unwrap().extend([
            ("t-1".to_string(), "hk-a".to_string()),
            ("t-2".to_string(), "hk-b".to_string()),
        ]);
        before.set("p", entry("claude_code_a", STATUS_DONE, "t-1", 0));
        before.set("p", entry("claude_code_b", STATUS_DONE, "t-2", 0));
        before.set("p", entry("claude_code_c", STATUS_RUNNING, "t-2", 0));
        before.mark_seen("p", &["claude_code_b".to_string()], 500);
        let saved = before.saved_agents();
        let keys: Vec<&str> = saved["p"].iter().map(|s| s.entry.key.as_str()).collect();
        assert_eq!(keys, ["claude_code_a", "claude_code_b"], "work in progress isn't kept");

        let json = serde_json::to_vec(&saved).unwrap();
        let after = StatusStore::new();
        TABS.lock().unwrap().clear();
        restore(&after, serde_json::from_slice(&json).unwrap());
        let new = after.get("p", "claude_code_a").unwrap();
        assert_eq!((new.pane_id.as_str(), new.revived), ("", true), "no tab yet, and no second alert");
        assert_eq!(after.seen_list("p")[0].seen_at, 500);
        assert_eq!(after.saved_agents()["p"].len(), 2, "still saved while waiting for their tabs");

        assert!(attach(&after, "p", &[("t-9".to_string(), "hk-b".to_string())]));
        assert_eq!(after.seen_list("p")[0].pane_id, "t-9");
        assert_eq!(after.get("p", "claude_code_a").unwrap().pane_id, "");
        assert!(!attach(&after, "p", &[("t-9".to_string(), "hk-b".to_string())]), "placed once");
    }
}
