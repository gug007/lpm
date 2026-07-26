// Local-side git plumbing for "Bring changes": what this Mac already has, how a
// received pack is installed, and how the remote's state is checked out.
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

pub(crate) fn is_repo(root: &str) -> bool {
    Path::new(root).is_dir() && git_out(root, &["rev-parse", "--is-inside-work-tree"]).is_ok()
}

pub(crate) fn is_dirty(root: &str) -> bool {
    !git_out(root, &["status", "--porcelain", "--untracked-files=all"])
        .unwrap_or_default()
        .trim()
        .is_empty()
}

/// Install a received pack into `root`'s object store. `--fix-thin` completes the
/// deltas whose bases the sender left out because we said we already had them.
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

/// Anchor the received objects behind a ref so `gc` cannot prune them before the
/// user lands them somewhere.
pub(crate) fn update_bring_ref(root: &str, slug: &str, sha: &str) -> Result<(), String> {
    git_out(root, &["update-ref", &bring_ref(slug), sha]).map(|_| ())
}

/// A standalone duplicate has its own object store, so the anchor ref (and the
/// objects behind it) have to be copied across from the source repo. The local
/// path transport makes this near-instant and costs no network bytes.
pub(crate) fn fetch_bring_ref(root: &str, source_root: &str, slug: &str) -> Result<(), String> {
    let r = bring_ref(slug);
    git_out(
        root,
        &["fetch", "--no-tags", source_root, &format!("+{r}:{r}")],
    )
    .map(|_| ())
    .map_err(|e| format!("could not copy the changes into the copy: {e}"))
}

/// Land the remote's state: the branch points at what the remote had committed,
/// and its uncommitted work sits in the working tree unstaged — an exact mirror,
/// with the user's previous branch one `git switch` away.
pub(crate) fn apply_state(
    root: &str,
    branch: &str,
    target: &str,
    head: &str,
    has_snapshot: bool,
) -> Result<(), String> {
    git_out(root, &["checkout", "-B", branch, target])
        .map_err(|e| format!("could not create {branch}: {e}"))?;
    if has_snapshot {
        git_out(root, &["reset", "--mixed", head])
            .map_err(|e| format!("could not restore the uncommitted changes: {e}"))?;
    }
    Ok(())
}

/// The branch the brought changes land on. A detached remote HEAD has no name to
/// mirror, so the Mac it came from names the branch instead.
pub(crate) fn bring_branch(remote_branch: Option<&str>, alias: &str) -> String {
    match remote_branch
        .map(sanitize_ref)
        .filter(|b| !b.is_empty())
    {
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
    let mut s = s.trim_matches(|c| c == '/' || c == '.' || c == '-').to_string();
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
        assert_eq!(next_chunk(0, 10 * DEFAULT_CHUNK, 0), Some((0, DEFAULT_CHUNK)));
    }

    #[test]
    fn bring_ref_is_namespaced_per_source_mac() {
        assert_eq!(bring_ref("abcd1234"), "refs/lpm/from-abcd1234");
    }
}
