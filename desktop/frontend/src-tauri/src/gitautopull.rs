// Auto pull: fast-forwards a project onto what the background origin check
// already fetched, only while nothing local stands in the way, and remembers the
// old HEAD so the pull can be taken back. The frontend decides when to try
// (setting, agents); every git condition is checked here, right before the merge.
use crate::config;
use crate::git::git_out;
use serde::Serialize;
use serde_norway::Value as Yaml;
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

const KEY: &str = "autoPull";

const IN_PROGRESS: [&str; 6] = [
    "MERGE_HEAD",
    "CHERRY_PICK_HEAD",
    "REVERT_HEAD",
    "BISECT_LOG",
    "rebase-merge",
    "rebase-apply",
];

#[derive(Serialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Skip {
    NotOnBranch,
    NoUpstream,
    InProgress,
    UpToDate,
    Ahead,
    Undone,
    Changes,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AutoPulled {
    pub branch: String,
    pub count: i64,
    pub from: String,
    pub to: String,
    pub at: u64,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AutoPullOutcome {
    Pulled(AutoPulled),
    Skipped { reason: Skip },
}

#[derive(Clone)]
struct Record {
    branch: String,
    count: i64,
    from: String,
    to: String,
    at: u64,
}

impl Record {
    fn public(&self) -> AutoPulled {
        AutoPulled {
            branch: self.branch.clone(),
            count: self.count,
            from: short(&self.from),
            to: short(&self.to),
            at: self.at,
        }
    }
}

#[derive(Default)]
struct Memory {
    last: HashMap<String, Record>,
    // After an undo, the origin tip that was taken back: not pulled again until
    // origin moves past it.
    undone: HashMap<String, String>,
}

fn memory() -> MutexGuard<'static, Memory> {
    static MEMORY: OnceLock<Mutex<Memory>> = OnceLock::new();
    MEMORY
        .get_or_init(Mutex::default)
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

fn key(cwd: &str) -> String {
    std::fs::canonicalize(cwd)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| cwd.to_string())
}

fn short(sha: &str) -> String {
    sha.chars().take(7).collect()
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn current_branch(cwd: &str) -> Option<String> {
    git_out(cwd, &["symbolic-ref", "-q", "HEAD"])
        .ok()
        .map(|r| r.trim_start_matches("refs/heads/").to_string())
}

fn in_progress(cwd: &str) -> bool {
    let mut args = vec!["rev-parse"];
    for name in IN_PROGRESS {
        args.extend(["--git-path", name]);
    }
    git_out(cwd, &args)
        .map(|out| out.lines().any(|p| Path::new(cwd).join(p).exists()))
        .unwrap_or(false)
}

fn ahead_behind(cwd: &str) -> Result<(i64, i64), String> {
    let out = git_out(
        cwd,
        &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
    )?;
    let mut parts = out.split_whitespace().map(|n| n.parse::<i64>().unwrap_or(0));
    Ok((parts.next().unwrap_or(0), parts.next().unwrap_or(0)))
}

fn has_changes(cwd: &str) -> Result<bool, String> {
    git_out(
        cwd,
        &[
            "--no-optional-locks",
            "status",
            "--porcelain=v1",
            "--untracked-files=no",
        ],
    )
    .map(|out| !out.is_empty())
}

fn check(cwd: &str) -> Result<Result<(String, String, i64), Skip>, String> {
    let Some(branch) = current_branch(cwd) else {
        return Ok(Err(Skip::NotOnBranch));
    };
    let Ok(upstream) = git_out(cwd, &["rev-parse", "-q", "--verify", "@{upstream}"]) else {
        return Ok(Err(Skip::NoUpstream));
    };
    if in_progress(cwd) {
        return Ok(Err(Skip::InProgress));
    }
    let (ahead, behind) = ahead_behind(cwd)?;
    if behind == 0 {
        return Ok(Err(Skip::UpToDate));
    }
    if ahead > 0 {
        return Ok(Err(Skip::Ahead));
    }
    {
        let mut mem = memory();
        let k = key(cwd);
        match mem.undone.get(&k) {
            Some(tip) if *tip == upstream => return Ok(Err(Skip::Undone)),
            Some(_) => {
                mem.undone.remove(&k);
            }
            None => {}
        }
    }
    if has_changes(cwd)? {
        return Ok(Err(Skip::Changes));
    }
    Ok(Ok((branch, upstream, behind)))
}

/// Fast-forward `cwd` to its upstream as last fetched, if the branch is clean,
/// not ahead, and nothing is in progress. Never fetches, stashes or merges.
#[tauri::command(async)]
pub fn git_auto_pull(cwd: String) -> Result<AutoPullOutcome, String> {
    let (branch, upstream, count) = match check(&cwd)? {
        Ok(go) => go,
        Err(reason) => return Ok(AutoPullOutcome::Skipped { reason }),
    };
    let from = git_out(&cwd, &["rev-parse", "HEAD"])?;
    git_out(&cwd, &["merge", "--ff-only", "--quiet", &upstream])?;
    crate::gitmoved::announce(&cwd);
    let record = Record {
        branch,
        count,
        from,
        to: upstream,
        at: now_ms(),
    };
    let public = record.public();
    memory().last.insert(key(&cwd), record);
    Ok(AutoPullOutcome::Pulled(public))
}

fn undoable(cwd: &str) -> Option<Record> {
    let k = key(cwd);
    let record = memory().last.get(&k).cloned()?;
    let head = git_out(cwd, &["rev-parse", "HEAD"]).ok();
    if current_branch(cwd).as_deref() == Some(record.branch.as_str())
        && head.as_deref() == Some(record.to.as_str())
    {
        return Some(record);
    }
    memory().last.remove(&k);
    None
}

/// The last auto pull in `cwd`, while it can still be undone: the branch is the
/// same and HEAD hasn't moved since.
pub(crate) fn last_auto_pull(cwd: &str) -> Option<AutoPulled> {
    undoable(cwd).map(|r| r.public())
}

#[tauri::command(async)]
pub fn git_auto_pull_last(cwd: String) -> Option<AutoPulled> {
    last_auto_pull(&cwd)
}

/// Take the last auto pull back with `git reset --keep`, which refuses rather
/// than lose a local change, and hold off on those commits until origin moves.
#[tauri::command(async)]
pub fn git_auto_pull_undo(cwd: String) -> Result<AutoPulled, String> {
    let Some(record) = undoable(&cwd) else {
        return Err("This auto pull can't be undone: the branch has moved since.".into());
    };
    git_out(&cwd, &["reset", "--keep", "--quiet", &record.from])?;
    crate::gitmoved::announce(&cwd);
    let k = key(&cwd);
    let mut mem = memory();
    mem.last.remove(&k);
    mem.undone.insert(k, record.to.clone());
    Ok(record.public())
}

/// The app-wide mode from Settings › Git: "off", "chosen" or "all".
pub(crate) fn auto_pull_mode() -> &'static str {
    match config::load_settings().get(KEY).and_then(|v| v.as_str()) {
        Some("chosen") => "chosen",
        Some("all") => "all",
        _ => "off",
    }
}

fn apply_auto_pull(doc: &mut Yaml, value: Option<bool>) -> Result<bool, String> {
    let map = doc
        .as_mapping_mut()
        .ok_or_else(|| "The config file isn't valid.".to_string())?;
    let next = value.map(Yaml::Bool);
    if map.get(KEY) == next.as_ref() {
        return Ok(false);
    }
    match next {
        Some(v) => {
            map.insert(KEY.into(), v);
        }
        None => {
            map.remove(KEY);
        }
    }
    Ok(true)
}

/// A project's own auto pull choice: on, off, or `None` to follow its parent
/// (for a copy) and then the app-wide mode.
#[tauri::command(async)]
pub fn set_auto_pull(app: AppHandle, name: String, value: Option<bool>) -> Result<(), String> {
    if config::edit_project_yaml(&name, |doc| apply_auto_pull(doc, value))? {
        let _ = app.emit("projects-changed", ());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::git_out_env;
    use crate::gitworkstate::LPM_IDENTITY;

    fn commit(cwd: &str, file: &str, body: &str) {
        std::fs::write(Path::new(cwd).join(file), body).unwrap();
        git_out(cwd, &["add", "-A"]).unwrap();
        git_out_env(cwd, &["commit", "-q", "-m", file], &LPM_IDENTITY).unwrap();
    }

    fn setup() -> (tempfile::TempDir, String, String) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().to_string();
        let origin = format!("{root}/origin.git");
        let (mine, theirs) = (format!("{root}/mine"), format!("{root}/theirs"));
        git_out(&root, &["init", "-q", "--bare", "-b", "main", &origin]).unwrap();
        git_out(&root, &["clone", "-q", &origin, &theirs]).unwrap();
        commit(&theirs, "a.txt", "one\n");
        git_out(&theirs, &["push", "-q", "origin", "main"]).unwrap();
        git_out(&root, &["clone", "-q", &origin, &mine]).unwrap();
        (dir, mine, theirs)
    }

    fn news(mine: &str, theirs: &str, files: &[&str]) {
        for f in files {
            commit(theirs, f, "news\n");
        }
        git_out(theirs, &["push", "-q", "origin", "main"]).unwrap();
        git_out(mine, &["fetch", "-q"]).unwrap();
    }

    fn skipped(cwd: &str) -> Skip {
        match git_auto_pull(cwd.into()).unwrap() {
            AutoPullOutcome::Skipped { reason } => reason,
            other => panic!("expected a skip, got {other:?}"),
        }
    }

    #[test]
    fn a_clean_branch_behind_origin_fast_forwards() {
        let (_d, mine, theirs) = setup();
        let before = git_out(&mine, &["rev-parse", "HEAD"]).unwrap();
        news(&mine, &theirs, &["b.txt", "c.txt"]);

        let AutoPullOutcome::Pulled(p) = git_auto_pull(mine.clone()).unwrap() else {
            panic!("expected a pull");
        };
        assert_eq!((p.branch.as_str(), p.count), ("main", 2));
        assert_eq!(p.from, short(&before));
        assert_eq!(ahead_behind(&mine).unwrap(), (0, 0));
        assert_eq!(last_auto_pull(&mine), Some(p));
    }

    #[test]
    fn uncommitted_changes_hold_it_back_but_untracked_files_dont() {
        let (_d, mine, theirs) = setup();
        news(&mine, &theirs, &["b.txt"]);
        std::fs::write(Path::new(&mine).join("a.txt"), "edited\n").unwrap();
        assert_eq!(skipped(&mine), Skip::Changes);

        git_out(&mine, &["checkout", "--", "a.txt"]).unwrap();
        std::fs::write(Path::new(&mine).join("scratch.txt"), "mine\n").unwrap();
        assert!(matches!(
            git_auto_pull(mine).unwrap(),
            AutoPullOutcome::Pulled(_)
        ));
    }

    #[test]
    fn a_branch_with_unpushed_commits_is_left_alone() {
        let (_d, mine, theirs) = setup();
        news(&mine, &theirs, &["b.txt"]);
        commit(&mine, "mine.txt", "local\n");
        assert_eq!(skipped(&mine), Skip::Ahead);
    }

    #[test]
    fn nothing_new_detached_or_untracked_branches_are_skipped() {
        let (_d, mine, theirs) = setup();
        assert_eq!(skipped(&mine), Skip::UpToDate);

        git_out(&mine, &["switch", "-q", "-c", "feature"]).unwrap();
        news(&mine, &theirs, &["b.txt"]);
        assert_eq!(skipped(&mine), Skip::NoUpstream);

        git_out(&mine, &["switch", "-q", "--detach"]).unwrap();
        assert_eq!(skipped(&mine), Skip::NotOnBranch);
    }

    #[test]
    fn a_merge_in_progress_is_left_alone() {
        let (_d, mine, theirs) = setup();
        news(&mine, &theirs, &["b.txt"]);
        let merge_head = git_out(&mine, &["rev-parse", "--git-path", "MERGE_HEAD"]).unwrap();
        let tip = git_out(&mine, &["rev-parse", "@{upstream}"]).unwrap();
        std::fs::write(Path::new(&mine).join(merge_head), tip).unwrap();
        assert_eq!(skipped(&mine), Skip::InProgress);
    }

    #[test]
    fn undo_goes_back_and_waits_for_newer_commits() {
        let (_d, mine, theirs) = setup();
        let before = git_out(&mine, &["rev-parse", "HEAD"]).unwrap();
        news(&mine, &theirs, &["b.txt"]);
        git_auto_pull(mine.clone()).unwrap();

        let undone = git_auto_pull_undo(mine.clone()).unwrap();
        assert_eq!(undone.count, 1);
        assert_eq!(git_out(&mine, &["rev-parse", "HEAD"]).unwrap(), before);
        assert_eq!(last_auto_pull(&mine), None);
        assert_eq!(skipped(&mine), Skip::Undone);

        news(&mine, &theirs, &["c.txt"]);
        let AutoPullOutcome::Pulled(p) = git_auto_pull(mine).unwrap() else {
            panic!("expected a pull once origin moved");
        };
        assert_eq!(p.count, 2);
    }

    #[test]
    fn undo_refuses_once_the_branch_moved() {
        let (_d, mine, theirs) = setup();
        news(&mine, &theirs, &["b.txt"]);
        git_auto_pull(mine.clone()).unwrap();
        commit(&mine, "mine.txt", "local\n");
        assert!(git_auto_pull_undo(mine.clone()).is_err());
        assert_eq!(last_auto_pull(&mine), None);
    }

    #[test]
    fn undo_keeps_unrelated_local_edits() {
        let (_d, mine, theirs) = setup();
        news(&mine, &theirs, &["b.txt"]);
        git_auto_pull(mine.clone()).unwrap();
        std::fs::write(Path::new(&mine).join("a.txt"), "edited after\n").unwrap();
        git_auto_pull_undo(mine.clone()).unwrap();
        let body = std::fs::read_to_string(Path::new(&mine).join("a.txt")).unwrap();
        assert_eq!(body, "edited after\n");
        assert!(!Path::new(&mine).join("b.txt").exists());
    }

    #[test]
    fn the_project_key_is_written_and_removed() {
        let mut doc: Yaml = serde_norway::from_str("name: web-3\nparent_name: web\n").unwrap();
        assert!(apply_auto_pull(&mut doc, Some(false)).unwrap());
        assert_eq!(doc.get(KEY), Some(&Yaml::Bool(false)));
        assert!(!apply_auto_pull(&mut doc, Some(false)).unwrap());
        assert!(apply_auto_pull(&mut doc, None).unwrap());
        assert_eq!(doc.get(KEY), None);
        assert_eq!(doc.get("parent_name").and_then(Yaml::as_str), Some("web"));
    }
}
