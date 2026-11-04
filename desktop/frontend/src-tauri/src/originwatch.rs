// Seeing origin move in every project here, not only the one open in a window.
// A push or a fetch rewrites the branch's ref under refs/remotes, wherever it
// was run from: an agent's terminal, lpm, or a connected Mac checking this one.
// Announcing it as that project's git change has its origin check and auto pull
// run at once, and lets the copies of the repository here and on connected Macs
// follow, instead of each waiting for its next round of fetches.
//
// Only refs/remotes is watched: objects, the index and logs churn with every
// commit and say nothing about where origin is.
use notify::{RecursiveMode, Watcher};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

/// A ref update is a lock file, a write and a rename: settle before announcing.
const SETTLE: Duration = Duration::from_millis(500);
/// However loud a repository gets, its projects are announced no more often.
const MIN_GAP: Duration = Duration::from_secs(2);

/// Dropping the watcher drops the only sender, which ends its worker.
struct OriginWatch {
    roots: Vec<String>,
    _watcher: notify::RecommendedWatcher,
}

fn current() -> &'static Mutex<Option<OriginWatch>> {
    static CURRENT: OnceLock<Mutex<Option<OriginWatch>>> = OnceLock::new();
    CURRENT.get_or_init(Mutex::default)
}

/// One repository's remote refs, by real path since that's what FSEvents
/// reports, and the projects that share it: a parent and its worktrees.
struct Repo {
    dir: PathBuf,
    roots: Vec<String>,
}

/// Watch the remote refs of exactly these projects of this Mac's, replacing the
/// last list. An empty list stops watching.
#[tauri::command(async)]
pub fn watch_origin_refs(mut roots: Vec<String>) {
    roots.sort();
    roots.dedup();
    let mut current = current().lock().unwrap_or_else(|e| e.into_inner());
    if current.as_ref().is_some_and(|w| w.roots == roots) {
        return;
    }
    *current = None;
    if !roots.is_empty() {
        *current = start(roots, crate::gitmoved::announce);
    }
}

type Announce = fn(&str);

fn start(roots: Vec<String>, announce: Announce) -> Option<OriginWatch> {
    let repos = group_by_repo(&roots);
    let (events, inbox) = std::sync::mpsc::channel::<usize>();
    let dirs: Vec<PathBuf> = repos.iter().map(|r| r.dir.clone()).collect();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else {
            return;
        };
        if crate::watchfilter::is_read_only(&event) {
            return;
        }
        for path in &event.paths {
            if let Some(i) = owner(&dirs, path) {
                let _ = events.send(i);
            }
        }
    })
    .ok()?;
    let mut paths = watcher.paths_mut();
    let mut watching = false;
    for repo in &repos {
        watching |= paths.add(&repo.dir, RecursiveMode::Recursive).is_ok();
    }
    if !watching || paths.commit().is_err() {
        return None;
    }
    let groups: Vec<Vec<String>> = repos.into_iter().map(|r| r.roots).collect();
    std::thread::spawn(move || announce_settled(inbox, groups, announce));
    Some(OriginWatch {
        roots,
        _watcher: watcher,
    })
}

fn group_by_repo(roots: &[String]) -> Vec<Repo> {
    let mut repos: Vec<Repo> = Vec::new();
    for root in roots {
        let Some(dir) = remote_refs_dir(root) else {
            continue;
        };
        match repos.iter_mut().find(|r| r.dir == dir) {
            Some(repo) => repo.roots.push(root.clone()),
            None => repos.push(Repo {
                dir,
                roots: vec![root.clone()],
            }),
        }
    }
    repos
}

/// Where `root`'s repository keeps its remote refs: refs/remotes in the common
/// git directory, or the reftable directory of a repository that uses one.
fn remote_refs_dir(root: &str) -> Option<PathBuf> {
    let common = crate::label_git::locate(root)?.common_dir;
    [common.join("refs").join("remotes"), common.join("reftable")]
        .into_iter()
        .find(|d| d.is_dir())
        .and_then(|d| std::fs::canonicalize(d).ok())
}

fn owner(dirs: &[PathBuf], path: &Path) -> Option<usize> {
    dirs.iter().position(|d| path.starts_with(d))
}

/// Announce each repository's projects once its burst settles, no more often
/// than MIN_GAP; a change inside the gap waits for it rather than being lost.
fn announce_settled(inbox: Receiver<usize>, groups: Vec<Vec<String>>, announce: Announce) {
    let mut pending: HashSet<usize> = HashSet::new();
    let mut last: HashMap<usize, Instant> = HashMap::new();
    loop {
        let next = if pending.is_empty() {
            inbox.recv().map_err(|_| RecvTimeoutError::Disconnected)
        } else {
            inbox.recv_timeout(SETTLE)
        };
        match next {
            Ok(i) => {
                pending.insert(i);
                continue;
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => return,
        }
        let now = Instant::now();
        pending.retain(|i| {
            if last
                .get(i)
                .is_some_and(|t| now.duration_since(*t) < MIN_GAP)
            {
                return true;
            }
            last.insert(*i, now);
            groups[*i].iter().for_each(|root| announce(root));
            false
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::{git_out, git_out_env};
    use crate::gitworkstate::LPM_IDENTITY;

    fn repo_with_remote(dir: &Path) -> (String, String) {
        let root = dir.to_string_lossy().to_string();
        let origin = format!("{root}/origin.git");
        let work = format!("{root}/work");
        git_out(&root, &["init", "-q", "--bare", "-b", "main", &origin]).unwrap();
        git_out(&root, &["clone", "-q", &origin, &work]).unwrap();
        git_out_env(
            &work,
            &["commit", "-q", "--allow-empty", "-m", "a"],
            &LPM_IDENTITY,
        )
        .unwrap();
        git_out(&work, &["push", "-q", "-u", "origin", "main"]).unwrap();
        (work, origin)
    }

    #[test]
    fn a_worktree_shares_its_parents_remote_refs() {
        let d = tempfile::tempdir().unwrap();
        let (work, _) = repo_with_remote(d.path());
        let tree = d.path().join("tree").to_string_lossy().to_string();
        git_out(&work, &["worktree", "add", "-q", "-b", "side", &tree]).unwrap();
        let plain = d.path().join("plain");
        std::fs::create_dir(&plain).unwrap();

        let repos = group_by_repo(&[
            work.clone(),
            tree.clone(),
            plain.to_string_lossy().to_string(),
        ]);
        assert_eq!(repos.len(), 1);
        assert_eq!(repos[0].roots, vec![work, tree]);
        assert!(repos[0].dir.ends_with("refs/remotes"));
    }

    static HEARD: Mutex<Vec<String>> = Mutex::new(Vec::new());

    fn heard(root: &str) {
        HEARD.lock().unwrap().push(root.to_string());
    }

    fn was_heard(root: &str) -> bool {
        HEARD.lock().unwrap().iter().any(|r| r == root)
    }

    fn hear(root: &str) -> bool {
        let deadline = Instant::now() + Duration::from_secs(10);
        while Instant::now() < deadline {
            if was_heard(root) {
                return true;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        false
    }

    #[test]
    fn a_push_from_one_copy_and_the_fetch_that_brings_it_to_another_are_announced() {
        let d = tempfile::tempdir().unwrap();
        let (work, origin) = repo_with_remote(d.path());
        let copy = d.path().join("copy").to_string_lossy().to_string();
        git_out(&work, &["clone", "-q", &origin, &copy]).unwrap();
        let _watch = start(vec![work.clone(), copy.clone()], heard).unwrap();
        std::thread::sleep(Duration::from_millis(500));

        git_out_env(
            &copy,
            &["commit", "-q", "--allow-empty", "-m", "b"],
            &LPM_IDENTITY,
        )
        .unwrap();
        git_out(&copy, &["push", "-q"]).unwrap();
        assert!(hear(&copy), "the push wasn't announced");
        assert!(!was_heard(&work));

        git_out(&work, &["fetch", "-q"]).unwrap();
        assert!(hear(&work), "the fetch wasn't announced");
    }

    #[test]
    fn events_are_matched_to_their_repository() {
        let dirs = vec![
            PathBuf::from("/a/.git/refs/remotes"),
            PathBuf::from("/b/.git/refs/remotes"),
        ];
        assert_eq!(
            owner(&dirs, Path::new("/b/.git/refs/remotes/origin/main")),
            Some(1)
        );
        assert_eq!(
            owner(&dirs, Path::new("/a/.git/refs/remotes/origin/main.lock")),
            Some(0)
        );
        assert_eq!(
            owner(&dirs, Path::new("/c/.git/refs/remotes/origin/main")),
            None
        );
    }
}
