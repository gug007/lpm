// Which local projects follow which Mac, and what the last run of each landed.
//
// Held in ~/.lpm/follow.json — per-machine and off the config-sync surface: a
// follow is a statement about *this* Mac pulling from another, so syncing it to
// the other Mac would tell it to follow itself.
//
// The record is what makes the next run correct. `last_head` is the branch tip the
// previous run left, and `last_tree` its working state, so the engine can both spot
// that nothing changed on the other Mac and tell whether anything in the local
// folder needs setting aside before it writes.
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Follow {
    /// The local project the work lands in. One follow per project, so this is
    /// the record's identity.
    pub project: String,
    pub slug: String,
    /// The project's folder on the other Mac, host-native.
    pub source_root: String,
    /// Why syncing stopped, when it has. Set means paused: either the user asked
    /// for it, or a run refused for a reason retrying will not fix. Shown as
    /// written, so the text is what says which.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub paused: Option<String>,
    /// The last fault that is expected to clear on its own — an unreachable Mac,
    /// an expired pack. Retried on a backoff, and shown so a follow that has gone
    /// quiet can say why.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
    /// The remote HEAD and working state the last run landed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_head: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_tree: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_branch: Option<String>,
    #[serde(default)]
    pub last_synced_at: i64,
    #[serde(default)]
    pub files: u64,
}

impl Follow {
    pub fn new(project: String, slug: String, source_root: String) -> Self {
        Follow {
            project,
            slug,
            source_root,
            paused: None,
            last_error: None,
            last_head: None,
            last_tree: None,
            last_branch: None,
            last_synced_at: 0,
            files: 0,
        }
    }

    pub fn is_paused(&self) -> bool {
        self.paused.is_some()
    }

    /// Record a stop that needs the user before syncing can go on. The reason is
    /// shown as written, so it says whether they asked for it.
    pub fn pause(&mut self, reason: String) {
        self.paused = Some(reason);
    }

    pub fn clear_pause(&mut self) {
        self.paused = None;
    }
}

#[derive(Serialize, Deserialize, Default)]
struct Stored {
    #[serde(default)]
    follows: Vec<Follow>,
}

pub fn path() -> PathBuf {
    crate::config::lpm_dir().join("follow.json")
}

/// Every follow on this Mac. A file that cannot be read or parsed reads as no
/// follows: syncing nothing is the safe failure, and the next write repairs it.
pub fn load() -> Vec<Follow> {
    let Ok(bytes) = std::fs::read(path()) else {
        return Vec::new();
    };
    serde_json::from_slice::<Stored>(&bytes)
        .map(|s| s.follows)
        .unwrap_or_default()
}

pub fn save(follows: &[Follow]) -> Result<(), String> {
    let data = serde_json::to_vec_pretty(&Stored {
        follows: follows.to_vec(),
    })
    .map_err(|e| e.to_string())?;
    crate::fsatomic::write(&path(), &data, crate::fsatomic::Mode::Preserve(0o600))
        .map_err(|e| e.to_string())
}

/// Add or replace the follow for a project, keeping the file's order stable so
/// the sidebar does not reshuffle on every write.
pub fn put(follow: Follow) -> Result<(), String> {
    let mut all = load();
    match all.iter_mut().find(|f| f.project == follow.project) {
        Some(existing) => *existing = follow,
        None => all.push(follow),
    }
    save(&all)
}

pub fn remove(project: &str) -> Result<(), String> {
    let mut all = load();
    let before = all.len();
    all.retain(|f| f.project != project);
    if all.len() == before {
        return Ok(());
    }
    save(&all)
}

/// Apply a change to one follow, if it is still there. A run can finish after the
/// user stopped following, and that must not resurrect the record.
pub fn update(project: &str, change: impl FnOnce(&mut Follow)) -> Result<(), String> {
    let mut all = load();
    let Some(entry) = all.iter_mut().find(|f| f.project == project) else {
        return Ok(());
    };
    change(entry);
    save(&all)
}

/// Drop follows whose project is gone (removed or renamed behind our back), so a
/// stale record cannot keep a poll alive for a folder that no longer exists.
pub fn prune_missing(existing: &[String]) -> Vec<Follow> {
    let all = load();
    let live: Vec<Follow> = all
        .iter()
        .filter(|f| existing.iter().any(|p| p == &f.project))
        .cloned()
        .collect();
    if live.len() != all.len() {
        let _ = save(&live);
    }
    live
}

#[cfg(test)]
mod tests {
    use super::*;

    fn follow(project: &str) -> Follow {
        Follow::new(
            project.into(),
            "a0af5f07".into(),
            format!("/Users/dev/{project}"),
        )
    }

    #[test]
    fn a_stored_follow_round_trips_through_json() {
        let mut f = follow("web");
        f.last_head = Some("a".repeat(40));
        f.last_branch = Some("lpm/main".into());
        f.files = 3;
        let json = serde_json::to_string(&f).unwrap();
        assert_eq!(serde_json::from_str::<Follow>(&json).unwrap(), f);
        // An unpaused follow writes no pause key at all.
        assert!(!json.contains("paused"), "{json}");

        f.pause("paused by you".into());
        let paused = serde_json::to_string(&f).unwrap();
        assert_eq!(serde_json::from_str::<Follow>(&paused).unwrap(), f);
        assert!(paused.contains("paused by you"));
    }

    #[test]
    fn a_record_from_an_older_build_keeps_its_defaults() {
        let f: Follow = serde_json::from_str(
            r#"{"project":"web","slug":"a0af5f07","sourceRoot":"/Users/dev/web"}"#,
        )
        .unwrap();
        assert_eq!(f.last_synced_at, 0);
        assert!(!f.is_paused());
        assert!(f.last_head.is_none());
    }

    #[test]
    fn unreadable_json_reads_as_no_follows() {
        assert!(serde_json::from_slice::<Stored>(b"not json")
            .map(|s| s.follows)
            .unwrap_or_default()
            .is_empty());
    }
}
