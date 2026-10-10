// Sub-agents that outlive the turn that spawned them.
//
// A Codex root thread can end its turn while the sub-agents it spawned are still
// running tools and editing files; their own hooks don't speak for the tab (only
// the root's do), and the root isn't woken when they finish. So the root's Stop
// alone would read "finished" all through their work. Codex reports each
// sub-agent's start and stop, so the tab keeps Running while any is live, and the
// root's Done goes out when the last one stops.
use crate::status::{StatusEntry, StatusStore};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Manager};

#[derive(Default)]
struct Family {
    live: HashSet<String>,
    /// The root's Done, held with the report it was to replace.
    held: Option<(StatusEntry, StatusEntry)>,
}

fn families() -> &'static Mutex<HashMap<(String, String), Family>> {
    static FAMILIES: OnceLock<Mutex<HashMap<(String, String), Family>>> = OnceLock::new();
    FAMILIES.get_or_init(Default::default)
}

fn id(project: &str, key: &str) -> (String, String) {
    (project.to_string(), key.to_string())
}

pub fn started(project: &str, key: &str, child: &str) {
    let mut families = families().lock().unwrap();
    families
        .entry(id(project, key))
        .or_default()
        .live
        .insert(child.to_string());
}

/// A sub-agent finished; if it was the last and the root already stopped, the
/// root's Done goes out now.
pub fn stopped(app: &AppHandle, project: &str, key: &str, child: &str) {
    let held = {
        let mut families = families().lock().unwrap();
        let Some(family) = families.get_mut(&id(project, key)) else {
            return;
        };
        family.live.remove(child);
        if !family.live.is_empty() {
            return;
        }
        families.remove(&id(project, key)).and_then(|f| f.held)
    };
    let Some((seen, done)) = held else {
        return;
    };
    let store = app.state::<Arc<StatusStore>>();
    if store.holds(project, &seen) {
        let done = StatusEntry {
            timestamp: crate::status::now_millis(),
            ..done
        };
        crate::socketsrv::publish(app, &store, project, done);
    }
}

/// Hold the root's Done while any sub-agent is still working. False when none
/// is, and the Done should go out as usual.
pub fn hold_done(store: &StatusStore, project: &str, done: &StatusEntry) -> bool {
    let mut families = families().lock().unwrap();
    let Some(family) = families.get_mut(&id(project, &done.key)) else {
        return false;
    };
    if family.live.is_empty() {
        return false;
    }
    match store.live_entry(project, &done.key) {
        Some(seen) => {
            family.held = Some((seen, done.clone()));
            true
        }
        None => false,
    }
}

pub fn busy(project: &str, key: &str) -> bool {
    families()
        .lock()
        .unwrap()
        .get(&id(project, key))
        .is_some_and(|f| !f.live.is_empty())
}

/// The root was interrupted or quit: its sub-agents went with it.
pub fn forget(project: &str, key: &str) {
    families().lock().unwrap().remove(&id(project, key));
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::status::{STATUS_DONE, STATUS_RUNNING};

    fn entry(value: &str) -> StatusEntry {
        StatusEntry {
            key: "codex_p-1".into(),
            value: value.into(),
            pane_id: "p-1".into(),
            ..Default::default()
        }
    }

    #[test]
    fn a_done_waits_for_live_sub_agents_only() {
        let store = StatusStore::new();
        store.set("c1", entry(STATUS_RUNNING));
        assert!(
            !hold_done(&store, "c1", &entry(STATUS_DONE)),
            "no sub-agents"
        );

        started("c1", "codex_p-1", "a1");
        assert!(hold_done(&store, "c1", &entry(STATUS_DONE)));
        let held = families().lock().unwrap()[&id("c1", "codex_p-1")]
            .held
            .clone();
        assert_eq!(
            held.map(|(_, done)| done.value),
            Some(STATUS_DONE.to_string())
        );
    }

    #[test]
    fn an_interrupt_forgets_the_sub_agents() {
        let store = StatusStore::new();
        store.set("c2", entry(STATUS_RUNNING));
        started("c2", "codex_p-1", "a1");
        forget("c2", "codex_p-1");
        assert!(!hold_done(&store, "c2", &entry(STATUS_DONE)));
    }
}
