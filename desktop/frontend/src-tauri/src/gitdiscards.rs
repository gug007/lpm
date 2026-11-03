// What a discard keeps: before lpm resets files it saves them as a stash-shaped
// commit (parents HEAD, an index commit, and the untracked files) under a
// per-worktree ref, so Undo and Git › History › Discarded can bring them back
// with `git stash apply` for a week. The user's own stash list is never touched.
use crate::git::{git_out, git_out_env};
use crate::gitworkstate::LPM_IDENTITY;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const REF_PREFIX: &str = "refs/worktree/lpm-discarded/";
const KEEP_MS: u64 = 7 * 24 * 60 * 60 * 1000;
const SUMMARY: &str = "lpm: discarded changes";

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Discarded {
    pub id: String,
    pub at: u64,
    pub files: Vec<String>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// A throwaway index file next to the repo's own, removed when dropped.
struct ScratchIndex {
    path: PathBuf,
}

impl ScratchIndex {
    fn new(cwd: &str, kind: &str) -> Result<Self, String> {
        let name = format!(
            "lpm-discard-{kind}-{}-{}.index",
            std::process::id(),
            now_ms()
        );
        let rel = git_out(cwd, &["rev-parse", "--git-path", &name])?;
        let path = Path::new(cwd).join(rel);
        let _ = std::fs::remove_file(&path);
        Ok(Self { path })
    }

    fn git(&self, cwd: &str, args: &[&str]) -> Result<String, String> {
        let index = self.path.to_string_lossy();
        git_out_env(cwd, args, &[("GIT_INDEX_FILE", index.as_ref())])
    }
}

impl Drop for ScratchIndex {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

fn lines(out: &str) -> Vec<String> {
    out.split('\0')
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(String::from)
        .collect()
}

fn head(cwd: &str) -> Option<String> {
    git_out(cwd, &["rev-parse", "--verify", "-q", "HEAD^{commit}"]).ok()
}

/// The tree of every tracked change in the repo: the index as it stands, with
/// each tracked file's working copy (deletions included) folded in.
fn tracked_tree_all(cwd: &str) -> Result<String, String> {
    let scratch = ScratchIndex::new(cwd, "tracked")?;
    let real = Path::new(cwd).join(git_out(cwd, &["rev-parse", "--git-path", "index"])?);
    if real.exists() {
        std::fs::copy(&real, &scratch.path).map_err(|e| e.to_string())?;
    } else {
        scratch.git(cwd, &["read-tree", "HEAD"])?;
    }
    scratch.git(cwd, &["add", "-u", "--", ":/"])?;
    scratch.git(cwd, &["write-tree"])
}

/// The tree of HEAD with only `paths` taken from the working copy.
fn tracked_tree_of(cwd: &str, paths: &[&str]) -> Result<String, String> {
    if paths.is_empty() {
        return git_out(cwd, &["rev-parse", "HEAD^{tree}"]);
    }
    let scratch = ScratchIndex::new(cwd, "tracked")?;
    scratch.git(cwd, &["read-tree", "HEAD"])?;
    let mut ls = vec!["ls-tree", "-r", "-z", "--name-only", "HEAD", "--"];
    ls.extend(paths);
    let in_head = lines(&git_out(cwd, &ls).unwrap_or_default());
    let present: Vec<&str> = paths
        .iter()
        .copied()
        .filter(|p| Path::new(cwd).join(p).exists() || in_head.iter().any(|h| h == p))
        .collect();
    if !present.is_empty() {
        let mut add = vec!["add", "-A", "--"];
        add.extend(&present);
        scratch.git(cwd, &add)?;
    }
    scratch.git(cwd, &["write-tree"])
}

fn untracked_tree(cwd: &str, paths: &[&str]) -> Result<Option<String>, String> {
    if paths.is_empty() {
        return Ok(None);
    }
    let scratch = ScratchIndex::new(cwd, "untracked")?;
    scratch.git(cwd, &["read-tree", "--empty"])?;
    let mut add = vec!["add", "-f", "--"];
    add.extend(paths);
    scratch.git(cwd, &add)?;
    Ok(Some(scratch.git(cwd, &["write-tree"])?))
}

fn untracked_in(cwd: &str, paths: &[&str]) -> Vec<String> {
    let mut args = vec!["ls-files", "--others", "--exclude-standard", "-z", "--"];
    args.extend(paths);
    lines(&git_out(cwd, &args).unwrap_or_default())
}

fn commit_tree(cwd: &str, tree: &str, parents: &[&str], message: &str) -> Result<String, String> {
    let mut args = vec!["commit-tree", tree];
    for p in parents {
        args.extend(["-p", p]);
    }
    args.extend(["-m", message]);
    git_out_env(cwd, &args, &LPM_IDENTITY)
}

fn changed_names(cwd: &str, from: &str, to: &str) -> Vec<String> {
    lines(&git_out(cwd, &["diff", "--name-only", "-z", from, to]).unwrap_or_default())
}

/// Builds and stores the saved copy. None when there is nothing to keep.
fn store(cwd: &str, tracked: String, untracked: &[String]) -> Result<Option<String>, String> {
    let Some(head) = head(cwd) else {
        return Ok(None);
    };
    let head_tree = git_out(cwd, &["rev-parse", &format!("{head}^{{tree}}")])?;
    let untracked_refs: Vec<&str> = untracked.iter().map(String::as_str).collect();
    let untracked_tree = untracked_tree(cwd, &untracked_refs)?;
    if tracked == head_tree && untracked_tree.is_none() {
        return Ok(None);
    }
    let mut files = changed_names(cwd, &head, &tracked);
    files.extend(untracked.iter().cloned());
    let message = format!("{SUMMARY}\n\n{}", files.join("\n"));
    let index = commit_tree(cwd, &head_tree, &[&head], "index")?;
    let mut parents = vec![head.as_str(), index.as_str()];
    let untracked_commit = match &untracked_tree {
        Some(tree) => Some(commit_tree(cwd, tree, &[], "untracked")?),
        None => None,
    };
    if let Some(u) = &untracked_commit {
        parents.push(u);
    }
    let saved = commit_tree(cwd, &tracked, &parents, &message)?;
    let id = claim_ref(cwd, &saved)?;
    prune(cwd);
    Ok(Some(id))
}

fn claim_ref(cwd: &str, sha: &str) -> Result<String, String> {
    let start = now_ms();
    for n in 0..20 {
        let id = (start + n).to_string();
        let name = format!("{REF_PREFIX}{id}");
        if git_out(cwd, &["update-ref", &name, sha, ""]).is_ok() {
            return Ok(id);
        }
    }
    Err("couldn't name the saved copy".into())
}

/// Saves every change `git_discard_all` is about to throw away.
pub fn save_all(cwd: &str) -> Result<Option<String>, String> {
    let tracked = tracked_tree_all(cwd)?;
    store(cwd, tracked, &untracked_in(cwd, &[]))
}

/// Saves the changes to `paths` that `git_discard_files` is about to throw away.
pub fn save_paths(
    cwd: &str,
    tracked: &[&str],
    untracked: &[&str],
) -> Result<Option<String>, String> {
    let tree = tracked_tree_of(cwd, tracked)?;
    let untracked = if untracked.is_empty() {
        Vec::new()
    } else {
        untracked_in(cwd, untracked)
    };
    store(cwd, tree, &untracked)
}

fn parse(record: &str) -> Option<Discarded> {
    let (name, contents) = record.split_once('\0')?;
    let id = name.trim().strip_prefix(REF_PREFIX)?;
    let at = id.parse::<u64>().ok()?;
    let files = contents
        .lines()
        .skip_while(|l| !l.trim().is_empty())
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(String::from)
        .collect();
    Some(Discarded {
        id: id.to_string(),
        at,
        files,
    })
}

fn all(cwd: &str) -> Vec<Discarded> {
    let out = git_out(
        cwd,
        &[
            "for-each-ref",
            "--format=%(refname)%00%(contents)%01",
            REF_PREFIX,
        ],
    )
    .unwrap_or_default();
    let mut list: Vec<Discarded> = out.split('\u{1}').filter_map(parse).collect();
    list.sort_by(|a, b| b.at.cmp(&a.at));
    list
}

fn forget(cwd: &str, id: &str) {
    let _ = git_out(cwd, &["update-ref", "-d", &format!("{REF_PREFIX}{id}")]);
}

fn prune(cwd: &str) {
    let cutoff = now_ms().saturating_sub(KEEP_MS);
    for d in all(cwd).into_iter().filter(|d| d.at < cutoff) {
        forget(cwd, &d.id);
    }
}

/// The discards still kept for this worktree, newest first.
#[tauri::command(async)]
pub fn git_discarded(cwd: String) -> Vec<Discarded> {
    prune(&cwd);
    all(&cwd)
}

/// Puts a discard's files back, merging with anything changed since. Once its
/// files are back, conflicted or not, the copy is forgotten so it can't apply twice.
#[tauri::command(async)]
pub fn git_restore_discarded(cwd: String, id: String) -> Result<(), String> {
    let name = format!("{REF_PREFIX}{id}");
    let sha = git_out(&cwd, &["rev-parse", "--verify", "-q", &name])
        .map_err(|_| "That discard is no longer kept.".to_string())?;
    match git_out(&cwd, &["stash", "apply", &sha]) {
        Ok(_) => {
            forget(&cwd, &id);
            Ok(())
        }
        Err(_) if has_conflicts(&cwd) => {
            forget(&cwd, &id);
            Err("Restored, with conflicts in files changed since the discard.".into())
        }
        Err(e) if e.contains("already exists") => Err(format!(
            "Nothing was restored: some of its files exist again. {e}"
        )),
        Err(e) => Err(e),
    }
}

fn has_conflicts(cwd: &str) -> bool {
    git_out(cwd, &["ls-files", "-u"]).is_ok_and(|out| !out.is_empty())
}

#[cfg(test)]
#[path = "gitdiscards_tests.rs"]
mod tests;
