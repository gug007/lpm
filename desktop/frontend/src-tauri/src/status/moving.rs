//! A tab moved to another project takes its agents' statuses along.
use super::{Buckets, StatusEntry, StatusStore};
use std::sync::RwLock;

/// Take every entry on `pane_id` out of `from` and put it in `to`, returning
/// the keys moved.
fn rehome_in(map: &RwLock<Buckets>, pane_id: &str, from: &str, to: &str) -> Vec<String> {
    let mut m = map.write().unwrap();
    let Some(bucket) = m.get_mut(from) else {
        return Vec::new();
    };
    let keys: Vec<String> = bucket
        .iter()
        .filter(|(_, e)| e.pane_id == pane_id)
        .map(|(k, _)| k.clone())
        .collect();
    let moved: Vec<StatusEntry> = keys.iter().filter_map(|k| bucket.remove(k)).collect();
    if bucket.is_empty() {
        m.remove(from);
    }
    if !moved.is_empty() {
        let into = m.entry(to.to_string()).or_default();
        for e in moved {
            into.insert(e.key.clone(), e);
        }
    }
    keys
}

impl StatusStore {
    /// Moves `pane_id`'s statuses from `from` to `to`. True when one moved (the
    /// caller emits for both). Later reports find the tab's project through
    /// its terminal (socketsrv.rs).
    pub fn move_pane_project(&self, pane_id: &str, from: &str, to: &str) -> bool {
        if pane_id.is_empty() || from == to {
            return false;
        }
        let keys = rehome_in(&self.entries, pane_id, from, to);
        let seen = rehome_in(&self.seen, pane_id, from, to);
        let mut revs = self.revs.write().unwrap();
        for key in &keys {
            if let Some(rev) = revs.remove(&(from.to_string(), key.clone())) {
                revs.insert((to.to_string(), key.clone()), rev);
            }
        }
        !keys.is_empty() || !seen.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(key: &str, pane: &str, value: &str) -> StatusEntry {
        StatusEntry {
            key: key.into(),
            value: value.into(),
            pane_id: pane.into(),
            timestamp: 1,
            ..Default::default()
        }
    }

    #[test]
    fn a_moved_tab_takes_its_statuses_and_only_its_own() {
        let store = StatusStore::new();
        store.set("bowen", entry("claude:t1", "t1", "Running"));
        store.set("bowen", entry("claude:t2", "t2", "Done"));
        assert!(store.move_pane_project("t1", "bowen", "api"));
        assert_eq!(store.list("api").iter().map(|e| e.key.as_str()).collect::<Vec<_>>(), ["claude:t1"]);
        assert_eq!(store.list("bowen").iter().map(|e| e.key.as_str()).collect::<Vec<_>>(), ["claude:t2"]);
    }

}
