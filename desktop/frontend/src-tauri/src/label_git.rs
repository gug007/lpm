//! Git facts for action labels on local projects, read straight from the
//! repository: the branch from HEAD, the newest tag through one cached
//! `git for-each-ref` that reruns only when the tag refs change on disk.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime};

const STALE: Duration = Duration::from_secs(600);
const GIT_TIMEOUT: Duration = Duration::from_secs(5);

pub(crate) struct Repo {
    pub(crate) git_dir: PathBuf,
    pub(crate) common_dir: PathBuf,
}

/// The repository holding `root`, which may sit below its top level.
pub(crate) fn locate(root: &str) -> Option<Repo> {
    if root.is_empty() {
        return None;
    }
    let mut dir = Some(Path::new(root));
    while let Some(d) = dir {
        let dot = d.join(".git");
        if dot.is_dir() {
            return Some(Repo {
                git_dir: dot.clone(),
                common_dir: dot,
            });
        }
        if dot.is_file() {
            return linked(&dot);
        }
        dir = d.parent();
    }
    None
}

/// A linked worktree's `.git` file points at its own git dir, whose
/// `commondir` names the main repository's, where the tags live.
fn linked(dot: &Path) -> Option<Repo> {
    let text = std::fs::read_to_string(dot).ok()?;
    let rel = text.trim().strip_prefix("gitdir:")?.trim();
    let git_dir = dot.parent()?.join(rel);
    let common_dir = match std::fs::read_to_string(git_dir.join("commondir")) {
        Ok(c) => git_dir.join(c.trim()),
        Err(_) => git_dir.clone(),
    };
    Some(Repo {
        git_dir,
        common_dir,
    })
}

/// The checked-out branch, or the short commit when HEAD is detached, read now.
pub(crate) fn read_branch(root: &str) -> Option<String> {
    let repo = locate(root)?;
    let head = std::fs::read_to_string(repo.git_dir.join("HEAD")).ok()?;
    let head = head.trim();
    Some(match head.strip_prefix("ref:") {
        Some(r) => {
            let r = r.trim();
            r.strip_prefix("refs/heads/").unwrap_or(r).to_string()
        }
        None => head.chars().take(7).collect(),
    })
}

struct Seen<T> {
    value: T,
    seen: Instant,
}

fn branches() -> &'static Mutex<HashMap<String, Seen<Option<String>>>> {
    static BRANCHES: OnceLock<Mutex<HashMap<String, Seen<Option<String>>>>> = OnceLock::new();
    BRANCHES.get_or_init(|| Mutex::new(HashMap::new()))
}

/// The checked-out branch, or the short commit when HEAD is detached.
pub fn branch(root: &str) -> Option<String> {
    let value = read_branch(root);
    branches()
        .lock()
        .unwrap()
        .entry(root.to_string())
        .or_insert_with(|| Seen {
            value: value.clone(),
            seen: Instant::now(),
        })
        .seen = Instant::now();
    value
}

#[derive(Clone, PartialEq)]
struct Stamp(Option<SystemTime>, Option<SystemTime>);

fn tag_stamp(repo: &Repo) -> Stamp {
    let modified = |p: PathBuf| std::fs::metadata(p).and_then(|m| m.modified()).ok();
    Stamp(
        modified(repo.common_dir.join("refs").join("tags")),
        modified(repo.common_dir.join("packed-refs")),
    )
}

/// `stamp` says whether `tag` is still current for a listing; `watched` is the
/// ticker's own last look, kept apart so a listing that refreshes the tag first
/// doesn't hide the change from the ticker that tells phones about it.
struct TagEntry {
    stamp: Stamp,
    watched: Stamp,
    tag: Option<(String, i64)>,
    seen: Instant,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) enum Bump {
    Major,
    Minor,
    Patch,
}

/// The version after `tag`, keeping its prefix: `v0.7.13` → `v0.7.14`,
/// `v0.8.0` or `v1.0.0`. A pre-release or build suffix is dropped first; a tag
/// with no version number has no next one.
pub(crate) fn next_version(tag: &str, bump: Bump) -> Option<String> {
    let start = tag.find(|c: char| c.is_ascii_digit())?;
    let (prefix, rest) = tag.split_at(start);
    let core = rest.split(['-', '+']).next()?;
    let mut parts = core.split('.');
    let mut part = || parts.next().map_or(Some(0), |n| n.parse::<u64>().ok());
    let (major, minor, patch) = (part()?, part()?, part()?);
    let (major, minor, patch) = match bump {
        Bump::Major => (major + 1, 0, 0),
        Bump::Minor => (major, minor + 1, 0),
        Bump::Patch => (major, minor, patch + 1),
    };
    Some(format!("{prefix}{major}.{minor}.{patch}"))
}

/// Which tag a label wants: the newest by creation date, or the highest
/// version, the one a release script bumps from.
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum TagOrder {
    Newest,
    Highest,
}

type TagKey = (String, String, TagOrder);

fn tags() -> &'static Mutex<HashMap<TagKey, TagEntry>> {
    static TAGS: OnceLock<Mutex<HashMap<TagKey, TagEntry>>> = OnceLock::new();
    TAGS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub(crate) fn tag_args(pattern: &str, order: TagOrder) -> Vec<String> {
    let refs = if pattern.is_empty() {
        "refs/tags".to_string()
    } else {
        format!("refs/tags/{pattern}")
    };
    let sort = match order {
        TagOrder::Newest => "--sort=-creatordate",
        TagOrder::Highest => "--sort=-v:refname",
    };
    vec![
        "for-each-ref".into(),
        sort.into(),
        "--count=1".into(),
        "--format=%(refname:lstrip=2) %(creatordate:unix)".into(),
        refs,
    ]
}

/// `<tag> <unix time>` from `tag_args`' output.
pub(crate) fn parse_tag(out: &str) -> Option<(String, i64)> {
    let line = out.lines().map(str::trim).find(|l| !l.is_empty())?;
    let (name, at) = line.rsplit_once(' ')?;
    Some((name.to_string(), at.parse().ok()?))
}

fn query_tag(root: &str, pattern: &str, order: TagOrder) -> Option<(String, i64)> {
    let mut cmd = crate::osproc::command("git");
    cmd.args(tag_args(pattern, order)).current_dir(root);
    let out = crate::statusfwd::run_with_timeout(cmd, GIT_TIMEOUT)?;
    parse_tag(&String::from_utf8_lossy(&out))
}

/// The tag matching `refs/tags/<pattern>` that comes first in `order`, with
/// its creation date. A lightweight tag has no date of its own, so it is its
/// commit's.
pub fn tag(root: &str, pattern: &str, order: TagOrder) -> Option<(String, i64)> {
    let repo = locate(root)?;
    let stamp = tag_stamp(&repo);
    let key = (root.to_string(), pattern.to_string(), order);
    if let Some(entry) = tags().lock().unwrap().get_mut(&key) {
        entry.seen = Instant::now();
        if entry.stamp == stamp {
            return entry.tag.clone();
        }
    }
    let tag = query_tag(root, pattern, order);
    let mut tags = tags().lock().unwrap();
    let entry = tags.entry(key).or_insert_with(|| TagEntry {
        stamp: stamp.clone(),
        watched: stamp.clone(),
        tag: None,
        seen: Instant::now(),
    });
    entry.stamp = stamp;
    entry.tag = tag.clone();
    tag
}

/// Whether a branch or the tags of a repository some label shows have moved
/// since the ticker last looked.
pub(crate) fn poll() -> bool {
    let mut moved = false;
    let roots: Vec<String> = {
        let mut branches = branches().lock().unwrap();
        branches.retain(|_, b| b.seen.elapsed() < STALE);
        branches.keys().cloned().collect()
    };
    for root in roots {
        let now = read_branch(&root);
        if let Some(b) = branches().lock().unwrap().get_mut(&root) {
            if b.value != now {
                b.value = now;
                moved = true;
            }
        }
    }
    let keys: Vec<TagKey> = {
        let mut tags = tags().lock().unwrap();
        tags.retain(|_, t| t.seen.elapsed() < STALE);
        tags.keys().cloned().collect()
    };
    for key in keys {
        let Some(repo) = locate(&key.0) else {
            continue;
        };
        let now = tag_stamp(&repo);
        if let Some(t) = tags().lock().unwrap().get_mut(&key) {
            if t.watched != now {
                t.watched = now;
                moved = true;
            }
        }
    }
    moved
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tag_args_scope_the_pattern_under_refs_tags() {
        assert_eq!(tag_args("", TagOrder::Newest).last().unwrap(), "refs/tags");
        let highest = tag_args("v*", TagOrder::Highest);
        assert_eq!(highest.last().unwrap(), "refs/tags/v*");
        assert!(highest.contains(&"--sort=-v:refname".to_string()));
    }

    #[test]
    fn next_version_bumps_one_part_and_keeps_the_prefix() {
        assert_eq!(
            next_version("v0.7.13", Bump::Patch).as_deref(),
            Some("v0.7.14")
        );
        assert_eq!(
            next_version("v0.7.13", Bump::Minor).as_deref(),
            Some("v0.8.0")
        );
        assert_eq!(
            next_version("v0.7.13", Bump::Major).as_deref(),
            Some("v1.0.0")
        );
        assert_eq!(next_version("1.2", Bump::Patch).as_deref(), Some("1.2.1"));
        assert_eq!(
            next_version("app-2.0.0-rc.1", Bump::Minor).as_deref(),
            Some("app-2.1.0")
        );
        assert_eq!(next_version("release", Bump::Patch), None);
        assert_eq!(next_version("v1.x.0", Bump::Patch), None);
    }

    #[test]
    fn parse_tag_reads_the_name_and_time() {
        assert_eq!(
            parse_tag("v0.7.13 1760307854\n"),
            Some(("v0.7.13".into(), 1_760_307_854))
        );
        assert_eq!(parse_tag(""), None);
        assert_eq!(parse_tag("v1 soon"), None);
    }

    #[test]
    fn branch_reads_head_in_a_plain_repo_and_a_linked_worktree() {
        let dir = tempfile::tempdir().unwrap();
        let main = dir.path().join("main");
        let git = main.join(".git");
        std::fs::create_dir_all(git.join("worktrees").join("feat")).unwrap();
        std::fs::write(git.join("HEAD"), "ref: refs/heads/main\n").unwrap();
        let sub = main.join("apps").join("web");
        std::fs::create_dir_all(&sub).unwrap();
        assert_eq!(read_branch(sub.to_str().unwrap()).as_deref(), Some("main"));

        let wt_git = git.join("worktrees").join("feat");
        std::fs::write(wt_git.join("HEAD"), "0123456789abcdef\n").unwrap();
        std::fs::write(wt_git.join("commondir"), "../..\n").unwrap();
        let wt = dir.path().join("feat");
        std::fs::create_dir_all(&wt).unwrap();
        std::fs::write(wt.join(".git"), format!("gitdir: {}\n", wt_git.display())).unwrap();
        assert_eq!(
            read_branch(wt.to_str().unwrap()).as_deref(),
            Some("0123456")
        );
        let repo = locate(wt.to_str().unwrap()).unwrap();
        assert_eq!(
            std::fs::canonicalize(repo.common_dir).unwrap(),
            std::fs::canonicalize(&git).unwrap()
        );
    }
}
