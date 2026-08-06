// Telling a following Mac the moment something changes here, instead of being
// asked every few seconds.
//
// A follower registers the folders it follows on its connection; this Mac watches
// them and pushes a `gitFollowChanged` frame carrying the new fingerprint. The
// follower's poll then drops to a slow heartbeat, so an idle project costs nothing
// on either side and an edit lands almost at once.
//
// Two things keep the watcher from becoming its own problem. Events are filtered
// before they cost anything — build output and git's own churn are the loudest
// things in a repo and neither means the working state moved. And the fingerprint
// behind them is rate limited, so even a pathological event storm cannot ask more
// of this Mac than the old polling did.
use crate::gitworkstate::working_state_tree;
use notify::{RecursiveMode, Watcher};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::path::{Component, Path};
use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender, SyncSender};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

/// This Mac can watch followed folders and push their changes.
pub const GIT_WATCH_FEATURE: &str = "gitWatch";

/// Events arrive in bursts — one save can be several — so settle before asking
/// git anything.
const SETTLE: Duration = Duration::from_millis(400);
/// Never fingerprint a folder more often than this, however loud the folder is.
/// The old polling cadence was one every 10s; a burst can be more responsive than
/// that, but not without limit.
const MIN_GAP: Duration = Duration::from_secs(2);

/// Paths whose changes never move the working state. `.git` is handled separately:
/// its refs matter, the rest of it is noise.
const GIT_DIR: &str = ".git";
/// Inside `.git`, only these say a commit or a branch switch happened.
const GIT_PATHS_OF_INTEREST: [&str; 3] = ["HEAD", "refs", "packed-refs"];

struct ConnWatch {
    /// Dropping this stops the OS watch.
    _watcher: notify::RecommendedWatcher,
    /// Held only so that dropping this watch closes the channel and ends the
    /// debounce worker with it.
    _events: Sender<String>,
    watched: HashSet<String>,
}

fn registry() -> &'static Mutex<HashMap<u64, ConnWatch>> {
    static REG: OnceLock<Mutex<HashMap<u64, ConnWatch>>> = OnceLock::new();
    REG.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Answer a follower's `gitFollowWatch`: watch exactly the folders it listed,
/// replacing whatever it asked for before. An empty list is how it stops.
pub fn set_watched(conn_id: u64, out: &SyncSender<String>, cwds: Vec<String>) {
    let wanted: HashSet<String> = cwds
        .into_iter()
        .filter(|cwd| is_known_project_root(cwd))
        .collect();
    let mut reg = registry().lock().unwrap();
    if reg.get(&conn_id).is_some_and(|w| w.watched == wanted) {
        return;
    }
    reg.remove(&conn_id);
    if wanted.is_empty() {
        return;
    }
    if let Some(watch) = start(out.clone(), &wanted) {
        reg.insert(conn_id, watch);
    }
}

/// Stop watching for a connection that has gone.
pub fn drop_conn(conn_id: u64) {
    registry().lock().unwrap().remove(&conn_id);
}

fn start(out: SyncSender<String>, wanted: &HashSet<String>) -> Option<ConnWatch> {
    let (events, inbox) = std::sync::mpsc::channel::<String>();
    let roots: Vec<String> = wanted.iter().cloned().collect();
    let sink = events.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else {
            return;
        };
        // fingerprint() re-reads the whole working tree; on Linux those opens
        // would land right back here and re-arm it forever.
        if crate::watchfilter::is_read_only(&event) {
            return;
        }
        for path in event.paths {
            if let Some(root) = owning_root(&roots, &path) {
                let _ = sink.send(root.clone());
            }
        }
    })
    .ok()?;
    let mut watched = HashSet::new();
    for cwd in wanted {
        if watcher
            .watch(Path::new(cwd), RecursiveMode::Recursive)
            .is_ok()
        {
            watched.insert(cwd.clone());
        }
    }
    if watched.is_empty() {
        return None;
    }
    std::thread::spawn(move || debounce_and_push(inbox, out));
    Some(ConnWatch {
        _watcher: watcher,
        _events: events,
        watched,
    })
}

/// Coalesce a burst into one fingerprint per folder, then push only what actually
/// moved. Ends when the registry drops the watch and its sender with it.
fn debounce_and_push(inbox: Receiver<String>, out: SyncSender<String>) {
    let mut sent: HashMap<String, (String, String)> = HashMap::new();
    let mut last_checked: HashMap<String, Instant> = HashMap::new();
    let mut pending: HashSet<String> = HashSet::new();
    loop {
        match inbox.recv_timeout(SETTLE) {
            Ok(root) => {
                pending.insert(root);
                continue; // keep draining while the burst lasts
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => return,
        }
        for root in std::mem::take(&mut pending) {
            let now = Instant::now();
            if last_checked
                .get(&root)
                .is_some_and(|t| now.duration_since(*t) < MIN_GAP)
            {
                continue;
            }
            last_checked.insert(root.clone(), now);
            let Some(state) = fingerprint(&root) else {
                continue;
            };
            if sent.get(&root) == Some(&state) {
                continue;
            }
            let frame = json!({
                "t": "gitFollowChanged",
                "cwd": root,
                "head": state.0,
                "tree": state.1,
            });
            if out.try_send(frame.to_string()).is_err() {
                return; // the connection is gone or wedged
            }
            sent.insert(root, state);
        }
    }
}

fn fingerprint(root: &str) -> Option<(String, String)> {
    let head = crate::gitworkstate::head_sha(root).ok()?;
    let tree = working_state_tree(root, &head).ok()?;
    Some((head, tree))
}

/// Which watched folder an event path belongs to, or None when the path is one
/// whose changes cannot move the working state.
fn owning_root<'a>(roots: &'a [String], path: &Path) -> Option<&'a String> {
    let root = roots
        .iter()
        .filter(|r| path.starts_with(Path::new(r)))
        // Nested projects: the deepest match owns the event.
        .max_by_key(|r| r.len())?;
    let rest = path.strip_prefix(Path::new(root)).ok()?;
    if is_noise(rest) {
        return None;
    }
    Some(root)
}

fn is_noise(rest: &Path) -> bool {
    let mut components = rest.components().filter_map(|c| match c {
        Component::Normal(name) => name.to_str(),
        _ => None,
    });
    match components.next() {
        // Commits and branch switches move refs; objects, index and logs churn
        // constantly and say nothing on their own.
        Some(GIT_DIR) => !components
            .next()
            .is_some_and(|next| GIT_PATHS_OF_INTEREST.contains(&next)),
        // Build output and dependency trees are the loudest paths in a repo and
        // are ignored by git, so they can never change the fingerprint.
        Some(first) => is_heavy_dir(first) || components.any(is_heavy_dir),
        None => true,
    }
}

fn is_heavy_dir(name: &str) -> bool {
    name == "node_modules" || crate::config::DUPLICATE_SKIP_DIRS.contains(&name)
}

fn is_known_project_root(cwd: &str) -> bool {
    let Ok(want) = std::fs::canonicalize(cwd) else {
        return false;
    };
    crate::config::project_names().into_iter().any(|name| {
        match crate::config::project_root(&name) {
            Ok((root, false)) => std::fs::canonicalize(root).is_ok_and(|r| r == want),
            _ => false,
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn roots() -> Vec<String> {
        vec!["/Users/dev/app".to_string()]
    }

    fn owns(path: &str) -> bool {
        owning_root(&roots(), &PathBuf::from(path)).is_some()
    }

    #[test]
    fn an_edited_source_file_is_a_real_change() {
        assert!(owns("/Users/dev/app/src/main.rs"));
        assert!(owns("/Users/dev/app/README.md"));
    }

    #[test]
    fn a_path_outside_every_watched_folder_belongs_to_none() {
        assert!(!owns("/Users/dev/other/src/main.rs"));
    }

    /// A build writing thousands of files under target/ or node_modules/ would
    /// otherwise drive a fingerprint every couple of seconds forever.
    #[test]
    fn build_output_and_dependencies_are_ignored_at_any_depth() {
        assert!(!owns("/Users/dev/app/node_modules/react/index.js"));
        assert!(!owns("/Users/dev/app/dist/bundle.js"));
        assert!(!owns("/Users/dev/app/packages/web/node_modules/x/y.js"));
        assert!(!owns("/Users/dev/app/.next/cache/thing"));
    }

    #[test]
    fn git_refs_count_but_the_rest_of_git_does_not() {
        assert!(owns("/Users/dev/app/.git/HEAD"));
        assert!(owns("/Users/dev/app/.git/refs/heads/main"));
        assert!(owns("/Users/dev/app/.git/packed-refs"));

        assert!(!owns("/Users/dev/app/.git/index"));
        assert!(!owns("/Users/dev/app/.git/index.lock"));
        assert!(!owns("/Users/dev/app/.git/objects/ab/cdef"));
        assert!(!owns("/Users/dev/app/.git/logs/HEAD"));
        // The folder itself is not a change either.
        assert!(!owns("/Users/dev/app"));
    }

    #[test]
    fn the_deepest_watched_folder_owns_a_nested_path() {
        let nested = vec![
            "/Users/dev/app".to_string(),
            "/Users/dev/app/packages/inner".to_string(),
        ];
        let path = PathBuf::from("/Users/dev/app/packages/inner/src/x.ts");
        assert_eq!(
            owning_root(&nested, &path),
            Some(&"/Users/dev/app/packages/inner".to_string())
        );
    }
}
