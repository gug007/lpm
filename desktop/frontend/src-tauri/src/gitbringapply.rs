// Local-side git plumbing for syncing a folder from another Mac: what this Mac
// already has, how a received pack is installed, and how the remote's state is
// checked out.
//
// Everything here is a small pure function or a single git call, so the pieces
// the transfer orchestration depends on are testable without two Macs.
use crate::git::git_out;
use std::path::Path;

const MAX_HAVES: usize = 512;
const RECENT_COMMITS: &str = "--max-count=64";
pub(crate) const DEFAULT_CHUNK: u64 = 1024 * 1024;

pub(crate) fn is_object_id(s: &str) -> bool {
    (40..=64).contains(&s.len()) && s.chars().all(|c| c.is_ascii_hexdigit())
}

pub(crate) fn dedup_cap(ids: Vec<String>, cap: usize) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    ids.into_iter()
        .filter(|id| seen.insert(id.clone()))
        .take(cap)
        .collect()
}

/// The commits this Mac can offer as pack bases: every ref tip plus a slice of
/// recent history, so a repo whose branch was rewound still shares a base.
pub(crate) fn have_list(root: &str) -> Vec<String> {
    let mut ids = read_ids(
        root,
        &[
            "for-each-ref",
            "--format=%(objectname)",
            "refs/heads",
            "refs/remotes",
            "refs/lpm",
        ],
    );
    ids.extend(read_ids(root, &["rev-list", RECENT_COMMITS, "HEAD"]));
    dedup_cap(ids, MAX_HAVES)
}

fn read_ids(root: &str, args: &[&str]) -> Vec<String> {
    git_out(root, args)
        .unwrap_or_default()
        .lines()
        .map(str::trim)
        .filter(|l| is_object_id(l))
        .map(str::to_string)
        .collect()
}

pub(crate) fn has_object(root: &str, sha: &str) -> bool {
    git_out(root, &["cat-file", "-e", &format!("{sha}^{{commit}}")]).is_ok()
}

/// Unknown counts as dirty. This is the one guard between the user's uncommitted
/// work and a checkout, so a git that failed to answer must never read as clean.
pub(crate) fn is_dirty(root: &str) -> bool {
    match git_out(root, &["status", "--porcelain", "--untracked-files=all"]) {
        Ok(out) => !out.trim().is_empty(),
        Err(_) => true,
    }
}

/// Install a received pack into `root`'s object store. `--fix-thin` is harmless
/// on the complete packs the sender produces today and keeps this working if it
/// ever starts sending thin ones.
pub(crate) fn index_pack(root: &str, pack: &Path) -> Result<(), String> {
    let input = std::fs::File::open(pack).map_err(|e| e.to_string())?;
    let out = crate::git::git_command(root, &["index-pack", "--stdin", "--fix-thin"], &[])
        .stdin(std::process::Stdio::from(input))
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?
        .wait_with_output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        return Ok(());
    }
    Err(format!(
        "could not store the received changes: {}",
        String::from_utf8_lossy(&out.stderr).trim()
    ))
}

pub(crate) fn bring_ref(slug: &str) -> String {
    format!("refs/lpm/from-{slug}")
}

/// Anchor the received objects behind a ref so `gc` cannot prune them, and so the
/// next sync can prove what it is allowed to replace.
pub(crate) fn update_bring_ref(root: &str, slug: &str, sha: &str) -> Result<(), String> {
    git_out(root, &["update-ref", &bring_ref(slug), sha]).map(|_| ())
}

/// Land the remote's state: the branch points at what the remote had committed,
/// and its uncommitted work sits in the working tree unstaged — an exact mirror,
/// with the user's previous branch one `git switch` away.
pub(crate) fn apply_state(l: &Landing) -> Result<(), String> {
    if branch_would_lose_commits(l) {
        return Err(format!(
            "{} already has commits of its own here — move or delete that branch, then resume syncing",
            l.branch
        ));
    }
    // Checked even when replacing: git protects an untracked file from a checkout
    // but not an ignored one, and `--force` protects neither.
    let clobbered = ignored_collisions(l.root, l.target);
    if !clobbered.is_empty() {
        return Err(format!(
            "these ignored files would be overwritten: {} — move them aside first",
            preview(&clobbered)
        ));
    }
    checkout(l)?;
    if l.has_snapshot {
        git_out(l.root, &["reset", "--mixed", l.head])
            .map_err(|e| format!("could not restore the uncommitted changes: {e}"))?;
    }
    Ok(())
}

/// One checkout of another Mac's state into a local folder.
pub(crate) struct Landing<'a> {
    pub(crate) root: &'a str,
    pub(crate) branch: &'a str,
    /// What the working tree becomes: the snapshot commit, or the remote's HEAD
    /// when it had nothing uncommitted.
    pub(crate) target: &'a str,
    /// Where the branch ends up — the remote's own HEAD.
    pub(crate) head: &'a str,
    pub(crate) has_snapshot: bool,
    /// Set only by a follow run, and only once its caller has proved that
    /// everything in the folder is what a previous run of that same follow left
    /// there. It licenses overwriting that state — never the user's.
    pub(crate) replaces: Option<Replaced<'a>>,
}

/// Licence to overwrite the previous run's state, carrying the remote HEAD that
/// run landed so this one can tell its own leftovers from work the user has done
/// since. The head is absent on the first run, which lands into a folder nothing
/// has synced into yet.
pub(crate) struct Replaced<'a> {
    pub(crate) head: Option<&'a str>,
}

impl<'a> Landing<'a> {
    pub(crate) fn new(
        root: &'a str,
        branch: &'a str,
        target: &'a str,
        head: &'a str,
        has_snapshot: bool,
    ) -> Self {
        Landing {
            root,
            branch,
            target,
            head,
            has_snapshot,
            replaces: None,
        }
    }

    /// Licence this checkout to overwrite the state a previous run of the same
    /// follow landed, given that run's remote HEAD. Callers must have proved the
    /// folder still holds only that state.
    pub(crate) fn replacing(mut self, previous_head: Option<&'a str>) -> Self {
        self.replaces = Some(Replaced {
            head: previous_head,
        });
        self
    }
}

/// A sync run arrives with its own previous state still spread across the working
/// tree, which a plain checkout would refuse to discard. So it forces past that
/// and then drops the files that state added which the new one does not have. `clean` stays off ignored files, so
/// build output and local env files are never touched; the untracked files it
/// does remove are only those leftovers, since everything the new state carries
/// is tracked at that point.
fn checkout(l: &Landing) -> Result<(), String> {
    let replacing = l.replaces.is_some();
    let mut args = vec!["checkout"];
    if replacing {
        args.push("--force");
    }
    args.extend(["-B", l.branch, l.target]);
    git_out(l.root, &args).map_err(|e| format!("could not create {}: {e}", l.branch))?;
    if replacing {
        git_out(l.root, &["clean", "-fd"])
            .map_err(|e| format!("could not clear the previous changes: {e}"))?;
    }
    Ok(())
}

/// `checkout -B` re-points a branch unconditionally. If a previous sync landed
/// here and the user then committed on that branch, moving it would leave their
/// commits reachable only from the reflog — so refuse instead. Work the incoming
/// changes already contain is not a loss, hence the ancestor test; neither is a
/// tip this sync's own last run put there, which is what lets an amend or a
/// rebase on the other Mac keep flowing.
fn branch_would_lose_commits(l: &Landing) -> bool {
    let git_ref = format!("refs/heads/{}", l.branch);
    if git_out(l.root, &["rev-parse", "--verify", "--quiet", &git_ref]).is_err() {
        return false;
    }
    if let Some(previous) = l.replaces.as_ref().and_then(|r| r.head) {
        if same_commit(l.root, l.branch, previous) {
            return false;
        }
    }
    git_out(l.root, &["merge-base", "--is-ancestor", l.branch, l.target]).is_err()
}

fn same_commit(root: &str, a: &str, b: &str) -> bool {
    match (commit_id(root, a), commit_id(root, b)) {
        (Ok(x), Ok(y)) => x == y,
        _ => false,
    }
}

fn commit_id(root: &str, rev: &str) -> Result<String, String> {
    git_out(
        root,
        &[
            "rev-parse",
            "--verify",
            "--quiet",
            &format!("{rev}^{{commit}}"),
        ],
    )
}

/// git refuses to clobber an untracked file, but silently replaces one that is
/// ignored here and tracked there — the only category it will not protect, and
/// the one the user cannot get back. Narrowed to incoming paths that are present
/// and untracked locally before asking git about each, so the ignore check runs
/// over a handful of files rather than the whole tree.
fn ignored_collisions(root: &str, target: &str) -> Vec<String> {
    let Ok(incoming) = git_out(root, &["ls-tree", "-r", "-z", "--name-only", target]) else {
        return Vec::new();
    };
    let listed = git_out(root, &["ls-files", "-z"]).unwrap_or_default();
    let tracked: std::collections::HashSet<&str> = listed.split('\0').collect();
    incoming
        .split('\0')
        .filter(|p| !p.is_empty() && !tracked.contains(*p))
        .filter(|p| Path::new(root).join(p).exists())
        .filter(|p| git_out(root, &["check-ignore", "-q", p]).is_ok())
        .map(str::to_string)
        .collect()
}

fn preview(paths: &[String]) -> String {
    let shown = paths.iter().take(5).cloned().collect::<Vec<_>>().join(", ");
    if paths.len() > 5 {
        return format!("{shown} and {} more", paths.len() - 5);
    }
    shown
}

/// The branch the brought changes land on. A detached remote HEAD has no name to
/// mirror, so the Mac it came from names the branch instead.
pub(crate) fn bring_branch(remote_branch: Option<&str>, alias: &str) -> String {
    match remote_branch.map(sanitize_ref).filter(|b| !b.is_empty()) {
        Some(b) => format!("lpm/{b}"),
        None => {
            let from = sanitize_ref(alias);
            format!("lpm/from-{}", if from.is_empty() { "mac" } else { &from })
        }
    }
}

/// Reduce a name to something `git check-ref-format` accepts under a `lpm/`
/// prefix: git rejects control characters, whitespace, `~^:?*[\`, `..`, `@{`,
/// a trailing `.lock`, and leading/trailing separators.
fn sanitize_ref(raw: &str) -> String {
    let mut s: String = raw
        .chars()
        .map(|c| {
            let bad = c.is_ascii_control()
                || c == '\u{7f}'
                || c.is_whitespace()
                || matches!(c, '~' | '^' | ':' | '?' | '*' | '[' | '\\');
            if bad {
                '-'
            } else {
                c
            }
        })
        .collect();
    s = s.replace("@{", "-");
    while s.contains("..") {
        s = s.replace("..", ".");
    }
    while s.contains("//") {
        s = s.replace("//", "/");
    }
    let mut s = s
        .trim_matches(|c| c == '/' || c == '.' || c == '-')
        .to_string();
    while let Some(base) = s.strip_suffix(".lock") {
        s = base.trim_end_matches('.').to_string();
    }
    if s == "@" {
        s.clear();
    }
    s
}

/// The next byte range to ask the sender for, or None once the pack is complete.
pub(crate) fn next_chunk(received: u64, total: u64, chunk: u64) -> Option<(u64, u64)> {
    if received >= total {
        return None;
    }
    let chunk = if chunk == 0 { DEFAULT_CHUNK } else { chunk };
    Some((received, chunk.min(total - received)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn object_ids_must_be_full_length_hex() {
        assert!(is_object_id(&"a".repeat(40)));
        assert!(is_object_id(&"0".repeat(64)));
        assert!(!is_object_id(&"a".repeat(39)));
        assert!(!is_object_id(&"a".repeat(65)));
        assert!(!is_object_id("HEAD"));
        assert!(!is_object_id(&format!("{}z", "a".repeat(39))));
        assert!(!is_object_id(""));
    }

    #[test]
    fn dedup_cap_keeps_first_occurrence_order_and_truncates() {
        let ids = vec!["a".into(), "b".into(), "a".into(), "c".into()];
        assert_eq!(
            dedup_cap(ids.clone(), 10),
            vec!["a".to_string(), "b".into(), "c".into()]
        );
        assert_eq!(dedup_cap(ids, 2), vec!["a".to_string(), "b".into()]);
        assert!(dedup_cap(Vec::new(), 5).is_empty());
    }

    #[test]
    fn dedup_cap_counts_unique_entries_not_raw_input() {
        // Duplicates must not eat into the cap, or a repo with many identical ref
        // tips would offer far fewer bases than it has.
        let ids = vec!["a".into(), "a".into(), "a".into(), "b".into()];
        assert_eq!(dedup_cap(ids, 2), vec!["a".to_string(), "b".into()]);
    }

    #[test]
    fn bring_branch_mirrors_the_remote_branch() {
        assert_eq!(bring_branch(Some("main"), "Studio"), "lpm/main");
        assert_eq!(
            bring_branch(Some("feature/login"), "Studio"),
            "lpm/feature/login"
        );
    }

    #[test]
    fn bring_branch_falls_back_to_the_mac_when_detached() {
        assert_eq!(bring_branch(None, "Studio"), "lpm/from-Studio");
        assert_eq!(bring_branch(None, "My Mac Pro"), "lpm/from-My-Mac-Pro");
        assert_eq!(bring_branch(None, ""), "lpm/from-mac");
        assert_eq!(bring_branch(None, "..."), "lpm/from-mac");
        assert_eq!(bring_branch(Some(""), "Studio"), "lpm/from-Studio");
    }

    #[test]
    fn bring_branch_sanitises_names_git_would_reject() {
        assert_eq!(bring_branch(Some("wip stuff"), "m"), "lpm/wip-stuff");
        assert_eq!(bring_branch(Some("a..b"), "m"), "lpm/a.b");
        assert_eq!(bring_branch(Some("a...b"), "m"), "lpm/a.b");
        assert_eq!(bring_branch(Some("head@{1}"), "m"), "lpm/head-1}");
        assert_eq!(bring_branch(Some("x~1^2:*?[\\"), "m"), "lpm/x-1-2");
        assert_eq!(bring_branch(Some("/leading/"), "m"), "lpm/leading");
        assert_eq!(bring_branch(Some("a//b"), "m"), "lpm/a/b");
        assert_eq!(bring_branch(Some("fix.lock"), "m"), "lpm/fix");
        assert_eq!(bring_branch(Some("weird."), "m"), "lpm/weird");
        assert_eq!(bring_branch(Some("@"), "Studio"), "lpm/from-Studio");
        assert_eq!(bring_branch(Some("~~~"), "Studio"), "lpm/from-Studio");
    }

    #[test]
    fn next_chunk_walks_the_pack_and_stops_at_the_end() {
        assert_eq!(next_chunk(0, 250, 100), Some((0, 100)));
        assert_eq!(next_chunk(100, 250, 100), Some((100, 100)));
        // The tail is short — never ask for bytes past the end.
        assert_eq!(next_chunk(200, 250, 100), Some((200, 50)));
        assert_eq!(next_chunk(250, 250, 100), None);
        // Defensive: an over-read still terminates rather than looping.
        assert_eq!(next_chunk(300, 250, 100), None);
        // An empty pack has nothing to fetch.
        assert_eq!(next_chunk(0, 0, 100), None);
        // A sender that advertised no chunk size gets the default.
        assert_eq!(
            next_chunk(0, 10 * DEFAULT_CHUNK, 0),
            Some((0, DEFAULT_CHUNK))
        );
    }

    #[test]
    fn bring_ref_is_namespaced_per_source_mac() {
        assert_eq!(bring_ref("abcd1234"), "refs/lpm/from-abcd1234");
    }
}
