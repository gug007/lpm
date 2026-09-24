// A push that catches up when origin moved on: a background commit & push
// shouldn't fail just because someone else pushed to the branch in the meantime.
use crate::git::{git_merge_conflicts, git_out, git_push};

/// `git push -u origin HEAD`; when origin rejects it only because it has commits
/// we don't, rebase onto them and push once more. Returns whether it rebased.
/// A rebase that stops on conflicts is aborted, so the repo is never left
/// mid-rebase and the local commits stay as they were, unpushed.
#[tauri::command(async)]
pub fn git_push_rebasing(cwd: String, flags: Vec<String>) -> Result<bool, String> {
    let rejected = match git_push(cwd.clone(), flags.clone()) {
        Ok(()) => return Ok(false),
        Err(e) if is_behind_rejection(&e) => e,
        Err(e) => return Err(e),
    };
    // Detached HEAD (e.g. an interactive rebase stopped mid-way) isn't ours to rebase.
    let branch = git_out(&cwd, &["symbolic-ref", "--short", "HEAD"]).map_err(|_| rejected)?;
    if let Err(e) = git_out(&cwd, &["pull", "--rebase", "--autostash", "origin", &branch]) {
        let conflicts = git_merge_conflicts(cwd.clone());
        let _ = git_out(&cwd, &["rebase", "--abort"]);
        if conflicts.is_empty() {
            return Err(format!("pulling new commits from origin/{branch}: {e}"));
        }
        return Err(format!(
            "new commits on origin/{branch} conflict with yours in {} — your commit is kept locally; pull, resolve, then push",
            conflicts.join(", ")
        ));
    }
    git_push(cwd, flags).map(|()| true)
}

/// Git's "[rejected] … (fetch first)" / "(non-fast-forward)" — origin is ahead.
/// These markers are not translated, so matching them is locale-safe.
fn is_behind_rejection(stderr: &str) -> bool {
    stderr.contains("[rejected]")
        && (stderr.contains("(fetch first)") || stderr.contains("(non-fast-forward)"))
}

#[cfg(test)]
mod tests {
    use super::{git_push_rebasing, is_behind_rejection};
    use crate::git::git_out;
    use std::path::Path;

    struct Repos {
        _dir: tempfile::TempDir,
        mine: String,
        theirs: String,
    }

    fn setup() -> Repos {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().to_string();
        git_out(&root, &["init", "-q", "--bare", "-b", "main", "origin.git"]).unwrap();
        let clone = |name: &str| {
            git_out(&root, &["clone", "-q", "origin.git", name]).unwrap();
            let path = format!("{root}/{name}");
            for (k, v) in [
                ("user.name", "lpm"),
                ("user.email", "lpm@localhost"),
                ("commit.gpgsign", "false"),
            ] {
                git_out(&path, &["config", k, v]).unwrap();
            }
            path
        };
        let mine = clone("mine");
        commit(&mine, "shared.txt", "base\n");
        git_out(&mine, &["push", "-q", "-u", "origin", "main"]).unwrap();
        let theirs = clone("theirs");
        Repos { _dir: dir, mine, theirs }
    }

    fn commit(repo: &str, file: &str, body: &str) {
        std::fs::write(Path::new(repo).join(file), body).unwrap();
        git_out(repo, &["add", file]).unwrap();
        git_out(repo, &["commit", "-q", "-m", file]).unwrap();
    }

    fn origin_log(repo: &str) -> String {
        git_out(repo, &["fetch", "-q", "origin"]).unwrap();
        git_out(repo, &["log", "--format=%s", "origin/main"]).unwrap()
    }

    #[test]
    fn a_push_origin_already_accepts_does_not_rebase() {
        let r = setup();
        commit(&r.mine, "mine.txt", "mine\n");
        assert_eq!(git_push_rebasing(r.mine.clone(), vec![]), Ok(false));
        assert_eq!(origin_log(&r.mine), "mine.txt\nshared.txt");
    }

    #[test]
    fn when_origin_moved_on_it_rebases_and_pushes_both() {
        let r = setup();
        commit(&r.theirs, "theirs.txt", "theirs\n");
        git_out(&r.theirs, &["push", "-q"]).unwrap();
        commit(&r.mine, "mine.txt", "mine\n");
        std::fs::write(Path::new(&r.mine).join("wip.txt"), "untouched\n").unwrap();
        git_out(&r.mine, &["add", "wip.txt"]).unwrap();

        assert_eq!(git_push_rebasing(r.mine.clone(), vec![]), Ok(true));
        assert_eq!(origin_log(&r.mine), "mine.txt\ntheirs.txt\nshared.txt");
        assert_eq!(
            git_out(&r.mine, &["status", "--porcelain"]).unwrap(),
            "A  wip.txt",
            "uncommitted work survives the autostash"
        );
    }

    #[test]
    fn a_conflicting_rebase_is_rolled_back_and_nothing_is_pushed() {
        let r = setup();
        commit(&r.theirs, "shared.txt", "theirs\n");
        git_out(&r.theirs, &["push", "-q"]).unwrap();
        commit(&r.mine, "shared.txt", "mine\n");
        let before = git_out(&r.mine, &["rev-parse", "HEAD"]).unwrap();

        let err = git_push_rebasing(r.mine.clone(), vec![]).unwrap_err();
        assert!(err.contains("conflict with yours in shared.txt"), "{err}");
        assert_eq!(git_out(&r.mine, &["rev-parse", "HEAD"]).unwrap(), before);
        assert_eq!(
            git_out(&r.mine, &["symbolic-ref", "--short", "HEAD"]).unwrap(),
            "main",
            "not left mid-rebase"
        );
        assert_eq!(origin_log(&r.mine), "shared.txt\nshared.txt");
    }

    #[test]
    fn only_an_origin_ahead_rejection_counts() {
        assert!(is_behind_rejection(
            " ! [rejected]        HEAD -> main (fetch first)\nerror: failed to push some refs"
        ));
        assert!(is_behind_rejection(" ! [rejected]        HEAD -> main (non-fast-forward)"));
        assert!(!is_behind_rejection(" ! [rejected]        HEAD -> main (stale info)"));
        assert!(!is_behind_rejection(
            " ! [remote rejected] HEAD -> main (protected branch hook declined)"
        ));
    }
}
