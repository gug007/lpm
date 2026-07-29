// The transfer core shared by both halves of syncing a folder from another Mac:
// its exact working state — committed history plus its uncommitted, unignored
// edits — landed in a local folder.
//
// Only git objects this Mac is missing cross the network, as one packfile over
// the existing peer socket. The first sync of a new folder therefore carries the
// history; every sync after it carries a delta.
//
// This module holds the shared types and guards. `gitsync` sets a folder up and
// runs the first transfer, `gitfollowrun` runs the ones after it, `gitbringrun`
// drives any single transfer, `gitbringapply` holds the git plumbing, and
// `gitbringhost` answers on the Mac that has the work.
use serde::Serialize;
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};

const CANCELLED: &str = "cancelled";

#[derive(Serialize, Clone)]
pub(crate) struct Progress<'a> {
    pub(crate) id: &'a str,
    pub(crate) phase: &'a str,
    pub(crate) received: u64,
    pub(crate) total: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) message: Option<&'a str>,
}

#[derive(Serialize, Clone, Default)]
pub(crate) struct Done {
    pub(crate) id: String,
    pub(crate) ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) project: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) branch: Option<String>,
    /// The remote HEAD that landed — what the next sync compares the local branch
    /// tip against before it moves it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) head: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) changed: Option<u64>,
    /// Set when local contents had to be moved aside to land this state: the ref
    /// they were committed to, so they can still be recovered.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) replaced: Option<String>,
    /// A local project of the same name that a first sync took its dependencies
    /// and configuration from, and how many things it cloned across.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) twin: Option<String>,
    #[serde(default)]
    pub(crate) seeded: u64,
}

pub(crate) struct Request {
    pub(crate) source_slug: String,
    pub(crate) source_root: String, // the folder's path on the OTHER Mac, host-native
    pub(crate) project: String,     // the local project that receives it
    /// Present on every sync run, which is what licenses replacing the state the
    /// run before it landed. Absent only in tests of the raw transfer.
    pub(crate) follow: Option<Follow>,
}

pub(crate) struct Follow {
    /// The remote HEAD the previous run landed, absent on the first.
    pub(crate) previous_head: Option<String>,
}

fn cancelled() -> &'static Mutex<HashSet<String>> {
    static IDS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    IDS.get_or_init(|| Mutex::new(HashSet::new()))
}

pub(crate) fn cancel(id: &str) {
    cancelled().lock().unwrap().insert(id.to_string());
}

pub(crate) fn forget_cancel(id: &str) {
    cancelled().lock().unwrap().remove(id);
}

pub(crate) fn check_cancelled(id: &str) -> Result<(), String> {
    if cancelled().lock().unwrap().contains(id) {
        return Err(CANCELLED.to_string());
    }
    Ok(())
}

pub(crate) fn was_cancelled(error: &str) -> bool {
    error == CANCELLED
}

fn landing_locks() -> &'static Mutex<HashSet<String>> {
    static HELD: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    HELD.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Claim a project for the duration of a transfer, or `None` when another one
/// already holds it. Setting a folder up and keeping it in step both check out
/// into the same place, and interleaving those would produce a state neither
/// asked for.
pub(crate) fn lock_landing(project: &str) -> Option<LandingLock> {
    if landing_locks().lock().unwrap().insert(project.to_string()) {
        return Some(LandingLock(project.to_string()));
    }
    None
}

pub(crate) struct LandingLock(String);

impl Drop for LandingLock {
    fn drop(&mut self) {
        landing_locks().lock().unwrap().remove(&self.0);
    }
}

fn is_slug(s: &str) -> bool {
    s.len() == 8
        && s.bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// The frontend identifies a peer's project as `peer-<slug>-<name>` and its root
/// as `/@peer-<slug><hostPath>`. Both name the same thing here, so accept either
/// those forms or the bare ones.
pub(crate) fn unmark(value: &str) -> &str {
    if let Some(rest) = value.strip_prefix("/@peer-") {
        if is_slug(rest.get(..8).unwrap_or_default()) && rest[8..].starts_with('/') {
            return &rest[8..];
        }
        return value;
    }
    if let Some(rest) = value.strip_prefix("peer-") {
        if is_slug(rest.get(..8).unwrap_or_default()) && rest[8..].starts_with('-') {
            return &rest[9..];
        }
    }
    value
}

/// Local root of a project that can receive a sync. SSH projects have no local
/// repo to land in, so they are refused up front.
pub(crate) fn local_root(name: &str) -> Result<String, String> {
    let (root, is_remote) = crate::config::project_root(name)?;
    if is_remote || root.trim().is_empty() {
        return Err(format!("{name} is an SSH project and has no local copy"));
    }
    Ok(root)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unmark_accepts_both_the_marked_and_the_bare_form() {
        assert_eq!(unmark("web"), "web");
        assert_eq!(unmark("peer-abcd1234-web"), "web");
        // Raw names can contain dashes; only the 8-char slug is the marker.
        assert_eq!(unmark("peer-00ff00ff-my-app-2"), "my-app-2");
        assert_eq!(unmark("/@peer-abcd1234/Users/dev/web"), "/Users/dev/web");
        assert_eq!(unmark("/Users/dev/web"), "/Users/dev/web");
    }

    #[test]
    fn unmark_leaves_anything_that_is_not_a_real_marker_alone() {
        assert_eq!(unmark("peer-ZZZZ1234-web"), "peer-ZZZZ1234-web"); // not hex
        assert_eq!(unmark("peer-abc-web"), "peer-abc-web"); // slug too short
        assert_eq!(unmark("peer-abcd1234"), "peer-abcd1234"); // no raw part
        assert_eq!(unmark("peer-web"), "peer-web");
        assert_eq!(unmark("/@peer-abcd1234"), "/@peer-abcd1234"); // no host path
        assert_eq!(unmark("/@peer-abcd1234x/y"), "/@peer-abcd1234x/y");
        assert_eq!(unmark(""), "");
        // A multi-byte lead must not panic on the slug slice.
        assert_eq!(unmark("peer-Ω-web"), "peer-Ω-web");
        assert_eq!(unmark("/@peer-Ωbcd1234/x"), "/@peer-Ωbcd1234/x");
    }

    #[test]
    fn cancelling_marks_the_transfer_and_clears_on_completion() {
        let id = uuid::Uuid::new_v4().to_string();
        assert!(check_cancelled(&id).is_ok());
        cancel(&id);
        assert!(was_cancelled(&check_cancelled(&id).unwrap_err()));
        forget_cancel(&id);
        assert!(check_cancelled(&id).is_ok());
    }

    #[test]
    fn a_landing_lock_is_exclusive_and_released_on_drop() {
        let held = lock_landing("web").expect("free");
        assert!(lock_landing("web").is_none(), "a second claim is refused");
        assert!(
            lock_landing("other").is_some(),
            "other projects are unaffected"
        );
        drop(held);
        assert!(lock_landing("web").is_some(), "the claim is released");
    }
}
