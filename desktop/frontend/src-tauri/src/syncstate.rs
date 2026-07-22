// Revision sidecar for Mac-to-Mac config sync (~/.lpm/sync-state.json).
//
// Newest-wins by file mtime (peersync's original rule) can't tell a genuine
// concurrent edit from a stale clock, and it resurrects deleted files forever.
// This sidecar records, per synced config unit, a monotonic revision and the id
// of the Mac that last authored it, plus — per paired Mac — the common base the
// two last agreed on. With those, `peersync::compute_plan_v2` distinguishes a
// fast-forward (one side moved) from a real conflict (both moved off the shared
// base), and lets a deletion of a synced-dir file cross to the other Mac instead
// of being re-created.
//
// The file is process-private book-keeping: it never joins any sync/export
// surface and is never watched. It is written only through `fsatomic`, and every
// read-modify-write goes through `mutate` under one process-wide lock so a host
// apply and a client reconcile can't race on it. A missing or corrupt file starts
// fresh with a newly minted device id and empty maps — it never panics and never
// mass-tombstones.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const VERSION: u32 = 1;

/// The content key of a unit known to be deleted. A real portable digest is 64
/// lowercase-hex chars, so this NUL-prefixed sentinel can never collide with one,
/// which lets a deletion and any content compare unequal by string.
pub const TOMBSTONE: &str = "\u{0}deleted";

/// The last observed state of one config unit on this Mac.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct ItemState {
    /// Portable digest (empty for a tombstone).
    pub digest: String,
    pub rev: u64,
    /// Sidecar device id of the Mac that authored this revision.
    pub device: String,
    #[serde(default)]
    pub deleted: bool,
}

/// The common base two Macs last agreed on for one unit (per remote device id).
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct BaseState {
    pub rev: u64,
    pub digest: String,
    #[serde(default)]
    pub deleted: bool,
}

impl BaseState {
    pub fn content_key(&self) -> &str {
        if self.deleted {
            TOMBSTONE
        } else {
            &self.digest
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SyncState {
    pub version: u32,
    /// This Mac's stable sync identity, minted on first creation. Independent of
    /// peer.rs pairing device ids.
    pub device: String,
    /// item key ("project/<name>", "global/<rel>", "template/<name>") -> state.
    #[serde(default)]
    pub items: BTreeMap<String, ItemState>,
    /// remote device id -> (item key -> agreed base).
    #[serde(default)]
    pub peers: BTreeMap<String, BTreeMap<String, BaseState>>,
}

impl SyncState {
    fn fresh() -> Self {
        SyncState {
            version: VERSION,
            device: uuid::Uuid::new_v4().to_string(),
            items: BTreeMap::new(),
            peers: BTreeMap::new(),
        }
    }

    /// Fold the currently-present config units into the sidecar, bumping the rev of
    /// any new or changed unit (author = this Mac) and tombstoning a synced-dir file
    /// that has vanished. `present` maps every present unit's key to its portable
    /// digest; `tombstones_for` reports whether an absent, still-live entry should
    /// become a tombstone — true only for files under a synced global dir, so a
    /// missing project / template / top-level file is left untouched (its presence
    /// is machine-local, not an intent to delete everywhere). Returns whether
    /// anything changed. This is the single observation choke point: applying a
    /// received unit stores its digest verbatim (see the apply paths), so the next
    /// reconcile sees an unchanged digest and does not bump — the echo guard.
    pub fn reconcile(
        &mut self,
        present: &BTreeMap<String, String>,
        tombstones_for: impl Fn(&str) -> bool,
    ) -> bool {
        let me = self.device.clone();
        let mut changed = false;
        for (key, digest) in present {
            match self.items.get_mut(key) {
                None => {
                    self.items.insert(
                        key.clone(),
                        ItemState {
                            digest: digest.clone(),
                            rev: 1,
                            device: me.clone(),
                            deleted: false,
                        },
                    );
                    changed = true;
                }
                Some(entry) => {
                    if entry.deleted || &entry.digest != digest {
                        entry.digest = digest.clone();
                        entry.rev += 1;
                        entry.device = me.clone();
                        entry.deleted = false;
                        changed = true;
                    }
                }
            }
        }
        for (key, entry) in self.items.iter_mut() {
            if entry.deleted || present.contains_key(key) {
                continue;
            }
            if tombstones_for(key) {
                entry.digest.clear();
                entry.rev += 1;
                entry.device = me.clone();
                entry.deleted = true;
                changed = true;
            }
        }
        changed
    }

    pub fn set_item(&mut self, key: &str, state: ItemState) {
        self.items.insert(key.to_string(), state);
    }

    pub fn set_base(&mut self, peer: &str, key: &str, base: BaseState) {
        self.peers
            .entry(peer.to_string())
            .or_default()
            .insert(key.to_string(), base);
    }
}

/// Compose the sidecar entry and agreed base to store after this Mac writes a unit
/// received from `_sender`. `incoming_*` describe the sender's advertised revision;
/// `stored_digest` is the portable digest actually written, which differs from
/// `incoming_digest` only for the settings.json fixpoint — when the local file kept
/// portable keys the merge preserved. In that case the merged result becomes a new
/// local edit (rev above both sides, author = self) that pushes back on the next
/// run and converges in one extra round, while the base is still the sender's state
/// so that next run sees a clean push. This is the one and only rebroadcast path.
pub fn received_state(
    incoming_digest: &str,
    incoming_rev: u64,
    incoming_device: &str,
    incoming_deleted: bool,
    stored_digest: &str,
    local_rev: u64,
    self_device: &str,
) -> (ItemState, BaseState) {
    let base = BaseState {
        rev: incoming_rev,
        digest: incoming_digest.to_string(),
        deleted: incoming_deleted,
    };
    let item = if incoming_deleted {
        ItemState {
            digest: String::new(),
            rev: incoming_rev,
            device: incoming_device.to_string(),
            deleted: true,
        }
    } else if stored_digest == incoming_digest {
        ItemState {
            digest: stored_digest.to_string(),
            rev: incoming_rev,
            device: incoming_device.to_string(),
            deleted: false,
        }
    } else {
        ItemState {
            digest: stored_digest.to_string(),
            rev: local_rev.max(incoming_rev) + 1,
            device: self_device.to_string(),
            deleted: false,
        }
    };
    (item, base)
}

// ---- persistence -------------------------------------------------------------

static LOCK: Mutex<()> = Mutex::new(());

#[cfg(test)]
static TEST_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);

fn state_path() -> PathBuf {
    #[cfg(test)]
    if let Some(p) = TEST_PATH.lock().unwrap().clone() {
        return p;
    }
    crate::config::lpm_dir().join("sync-state.json")
}

/// Load the sidecar, returning `(state, minted)` where `minted` is true when the
/// file was missing or unreadable and a fresh identity had to be created — so the
/// caller persists it even if it makes no other change.
fn load(path: &Path) -> (SyncState, bool) {
    match std::fs::read(path) {
        Ok(bytes) => match serde_json::from_slice::<SyncState>(&bytes) {
            Ok(s) if !s.device.is_empty() => (s, false),
            _ => (SyncState::fresh(), true),
        },
        Err(_) => (SyncState::fresh(), true),
    }
}

fn save(path: &Path, state: &SyncState) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let data = serde_json::to_vec_pretty(state).unwrap_or_default();
    crate::fsatomic::write(path, &data, crate::fsatomic::Mode::Preserve(0o644))
}

/// Run `f` against the on-disk sidecar under the process-wide lock, persisting the
/// result when `f` reports a change (or the identity was freshly minted). All reads
/// and writes funnel through here, so concurrent host/client operations serialize.
pub fn mutate<T>(f: impl FnOnce(&mut SyncState) -> (bool, T)) -> T {
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let path = state_path();
    let (mut state, minted) = load(&path);
    let (changed, out) = f(&mut state);
    if changed || minted {
        let _ = save(&path, &state);
    }
    out
}

/// This Mac's stable sidecar device id, minting and persisting one on first use.
pub fn device_id() -> String {
    mutate(|s| (false, s.device.clone()))
}

/// A read-only snapshot of the current sidecar.
pub fn snapshot() -> SyncState {
    mutate(|s| (false, s.clone()))
}

/// The agreed bases for one remote Mac (its device id -> item key -> base), empty
/// when nothing has synced with it yet.
pub fn peer_bases(peer: &str) -> BTreeMap<String, BaseState> {
    mutate(|s| (false, s.peers.get(peer).cloned().unwrap_or_default()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn present(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    fn state(device: &str) -> SyncState {
        SyncState {
            version: VERSION,
            device: device.into(),
            items: BTreeMap::new(),
            peers: BTreeMap::new(),
        }
    }

    // Only files under a synced global dir may tombstone.
    fn eligible(key: &str) -> bool {
        key.starts_with("global/generator-icons/") || key.starts_with("global/zdotdir/")
    }

    #[test]
    fn new_item_starts_at_rev_one_authored_by_self() {
        let mut s = state("A");
        assert!(s.reconcile(&present(&[("project/web", "d0")]), eligible));
        let it = &s.items["project/web"];
        assert_eq!((it.rev, it.device.as_str(), it.deleted), (1, "A", false));
    }

    #[test]
    fn edit_bumps_rev_once_and_reauthors() {
        let mut s = state("A");
        s.reconcile(&present(&[("project/web", "d0")]), eligible);
        // Second reconcile at the same digest is a no-op (no bump).
        assert!(!s.reconcile(&present(&[("project/web", "d0")]), eligible));
        assert_eq!(s.items["project/web"].rev, 1);
        // A changed digest bumps exactly once.
        assert!(s.reconcile(&present(&[("project/web", "d1")]), eligible));
        assert_eq!(s.items["project/web"].rev, 2);
    }

    #[test]
    fn received_apply_does_not_bump_on_next_reconcile() {
        // Simulate an apply: store the received digest verbatim, then reconcile the
        // now-present file at that same digest — the echo guard means no bump.
        let mut s = state("A");
        s.set_item(
            "global/groups.json",
            ItemState {
                digest: "remote".into(),
                rev: 7,
                device: "B".into(),
                deleted: false,
            },
        );
        assert!(!s.reconcile(&present(&[("global/groups.json", "remote")]), eligible));
        let it = &s.items["global/groups.json"];
        assert_eq!((it.rev, it.device.as_str()), (7, "B"));
    }

    #[test]
    fn vanished_dir_file_tombstones_but_top_level_and_project_do_not() {
        let mut s = state("A");
        s.reconcile(
            &present(&[
                ("global/zdotdir/.zshrc", "z"),
                ("global/groups.json", "g"),
                ("project/web", "w"),
                ("template/base", "t"),
            ]),
            eligible,
        );
        // Everything gone: only the synced-dir file tombstones.
        assert!(s.reconcile(&present(&[]), eligible));
        assert!(s.items["global/zdotdir/.zshrc"].deleted);
        assert_eq!(s.items["global/zdotdir/.zshrc"].device, "A");
        assert!(!s.items["global/groups.json"].deleted);
        assert!(!s.items["project/web"].deleted);
        assert!(!s.items["template/base"].deleted);
    }

    #[test]
    fn tombstone_is_not_retombstoned() {
        let mut s = state("A");
        s.reconcile(&present(&[("global/zdotdir/.zshrc", "z")]), eligible);
        assert!(s.reconcile(&present(&[]), eligible)); // tombstones (rev 2)
        assert_eq!(s.items["global/zdotdir/.zshrc"].rev, 2);
        assert!(!s.reconcile(&present(&[]), eligible)); // already deleted -> no change
        assert_eq!(s.items["global/zdotdir/.zshrc"].rev, 2);
    }

    #[test]
    fn resurrecting_a_tombstoned_file_bumps_and_reauthors() {
        let mut s = state("A");
        s.reconcile(&present(&[("global/zdotdir/.zshrc", "z")]), eligible);
        s.reconcile(&present(&[]), eligible); // tombstone, rev 2
        assert!(s.reconcile(&present(&[("global/zdotdir/.zshrc", "z2")]), eligible));
        let it = &s.items["global/zdotdir/.zshrc"];
        assert_eq!((it.rev, it.deleted, it.digest.as_str()), (3, false, "z2"));
    }

    #[test]
    fn received_state_straight_apply_takes_sender_revision() {
        let (item, base) = received_state("dr", 5, "B", false, "dr", 2, "A");
        assert_eq!(
            item,
            ItemState {
                digest: "dr".into(),
                rev: 5,
                device: "B".into(),
                deleted: false
            }
        );
        assert_eq!(
            base,
            BaseState {
                rev: 5,
                digest: "dr".into(),
                deleted: false
            }
        );
    }

    #[test]
    fn received_state_settings_fixpoint_bumps_above_both() {
        // Merge kept extra local keys -> stored digest differs from incoming, so it
        // becomes a self-authored edit above both revs, base still the sender's.
        let (item, base) = received_state("dr", 3, "B", false, "merged", 9, "A");
        assert_eq!(item.digest, "merged");
        assert_eq!(item.device, "A");
        assert_eq!(item.rev, 10); // max(9,3)+1
        assert_eq!(base.digest, "dr"); // pushes back next round
    }

    #[test]
    fn received_state_delete_stores_tombstone() {
        let (item, base) = received_state("", 4, "B", true, "", 1, "A");
        assert!(item.deleted && item.rev == 4 && item.device == "B");
        assert!(base.deleted && base.rev == 4);
    }

    #[test]
    fn load_missing_mints_fresh_and_persists() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sync-state.json");
        *TEST_PATH.lock().unwrap() = Some(path.clone());
        let id = device_id();
        assert!(!id.is_empty());
        // Persisted, and a second read is stable.
        assert!(path.exists());
        assert_eq!(device_id(), id);
        *TEST_PATH.lock().unwrap() = None;
    }

    #[test]
    fn load_corrupt_starts_fresh_without_panicking() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sync-state.json");
        std::fs::write(&path, b"{ this is not json").unwrap();
        let (s, minted) = load(&path);
        assert!(minted);
        assert!(!s.device.is_empty());
        assert!(s.items.is_empty());
    }
}
