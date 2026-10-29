//! Local changes colliding with incoming ones: files git left unmerged, commits
//! that would carry their conflict markers, and pulls that stopped or landed
//! with conflicts, told in words instead of git's raw stderr.
use crate::git::{git_command, git_out};

/// Porcelain XY codes git uses for an unmerged path (DD AU UD UA DU AA UU).
pub(crate) fn is_unmerged(x: u8, y: u8) -> bool {
    x == b'U' || y == b'U' || (x == b'A' && y == b'A') || (x == b'D' && y == b'D')
}

/// Repo-root-relative paths git still holds as unmerged.
pub(crate) fn unmerged_files(cwd: &str) -> Vec<String> {
    match git_command(cwd, &["diff", "--name-only", "-z", "--diff-filter=U"], &[]).output() {
        Ok(o) if o.status.success() => nul_separated(&o.stdout),
        _ => Vec::new(),
    }
}

/// The paths of a `-z` listing, verbatim. Without `-z` git C-quotes non-ASCII
/// and special-character names (`"\344\270\255.txt"`), which no longer match
/// the names in MERGE_MSG or the status list.
fn nul_separated(out: &[u8]) -> Vec<String> {
    String::from_utf8_lossy(out)
        .split('\0')
        .filter(|p| !p.is_empty())
        .map(String::from)
        .collect()
}

const MARKER_LINE: &str = "^(<{7}|>{7})( |$)";

/// The unmerged files among `files` whose working copy still has conflict
/// markers. One without markers was resolved by hand and may be committed;
/// staging it is what marks it resolved.
fn unresolved(cwd: &str, files: &[String]) -> Vec<String> {
    let unmerged = unmerged_files(cwd);
    let picked: Vec<&String> = files.iter().filter(|f| unmerged.contains(f)).collect();
    if picked.is_empty() {
        return Vec::new();
    }
    let specs: Vec<String> = picked.iter().map(|f| format!(":(top){f}")).collect();
    let mut args = vec!["grep", "-l", "-z", "-I", "--full-name", "-E", "-e", MARKER_LINE, "--"];
    args.extend(specs.iter().map(String::as_str));
    match git_command(cwd, &args, &[]).output() {
        Ok(o) if o.status.success() => nul_separated(&o.stdout),
        Ok(o) if o.status.code() == Some(1) => Vec::new(),
        _ => picked.into_iter().cloned().collect(),
    }
}

/// Refuses a commit that would record conflict markers.
pub(crate) fn check_commit(cwd: &str, files: &[String]) -> Result<(), String> {
    let left = unresolved(cwd, files);
    if left.is_empty() {
        return Ok(());
    }
    Err(format!(
        "{} still {} merge conflict markers (<<<<<<< … >>>>>>>). Resolve {} and commit again.",
        name_files(&left),
        if left.len() == 1 { "has" } else { "have" },
        if left.len() == 1 { "it" } else { "them" },
    ))
}

/// `pull`'s outcome, with what git left behind put in words. A pull that went
/// through but left conflicts is still an error: the user has work to do before
/// the next commit.
pub(crate) fn explain_pull(
    cwd: &str,
    strategy: &str,
    pulled: Result<String, String>,
) -> Result<(), String> {
    let conflicted = unmerged_files(cwd);
    match pulled {
        Ok(_) if conflicted.is_empty() => Ok(()),
        Ok(_) => Err(landed_with_conflicts(&conflicted, kept_in_stash(cwd))),
        Err(e) => Err(pull_failure(&e, strategy, &conflicted)),
    }
}

fn kept_in_stash(cwd: &str) -> bool {
    git_out(cwd, &["stash", "list", "-1", "--format=%gs"])
        .map(|s| s.trim() == "autostash")
        .unwrap_or(false)
}

fn landed_with_conflicts(conflicted: &[String], stashed: bool) -> String {
    if stashed {
        format!(
            "Pulled, but your local changes conflict with the new commits in {}. Resolve the conflict markers before you commit; your changes are also kept in the stash (drop it once resolved).",
            name_files(conflicted)
        )
    } else {
        format!(
            "Pulled, but {} {} conflicts. Resolve the conflict markers before you commit.",
            name_files(conflicted),
            if conflicted.len() == 1 { "has" } else { "have" },
        )
    }
}

fn pull_failure(err: &str, strategy: &str, conflicted: &[String]) -> String {
    if let Some(files) = files_after(err, "local changes to the following files would be overwritten") {
        return format!(
            "Your uncommitted changes to {} would be overwritten by the new commits. Commit or stash them first, or pull with autostash.",
            name_files(&files)
        );
    }
    if let Some(files) = files_after(err, "untracked working tree files would be overwritten") {
        return format!(
            "The new commits would overwrite {}, which {} untracked here. Move or delete {} first.",
            name_files(&files),
            if files.len() == 1 { "is" } else { "are" },
            if files.len() == 1 { "it" } else { "them" },
        );
    }
    if err.contains("cannot pull with rebase") {
        return "You have uncommitted changes, and a rebase pull needs a clean working tree. Commit or stash them first, or pull with autostash.".into();
    }
    if err.contains("unmerged files") || err.contains("not concluded your merge") {
        return if conflicted.is_empty() {
            "A merge is still in progress. Commit or abort it before pulling.".into()
        } else {
            format!(
                "{} still {} unresolved conflicts. Resolve and commit them before pulling.",
                name_files(conflicted),
                if conflicted.len() == 1 { "has" } else { "have" },
            )
        };
    }
    if !conflicted.is_empty() {
        let undo = if strategy == "rebase" {
            "Resolve them and run `git rebase --continue`, or `git rebase --abort` to undo the pull."
        } else {
            "Resolve them and commit, or run `git merge --abort` to undo the pull."
        };
        return format!("The pull stopped on conflicts in {}. {undo}", name_files(conflicted));
    }
    err.to_string()
}

/// The tab-indented file list git prints under a line containing `heading`.
fn files_after(err: &str, heading: &str) -> Option<Vec<String>> {
    let mut lines = err.lines().skip_while(|l| !l.contains(heading));
    lines.next()?;
    Some(
        lines
            .take_while(|l| l.starts_with('\t'))
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect(),
    )
}

pub(crate) fn name_files(files: &[String]) -> String {
    const SHOWN: usize = 3;
    match files.len() {
        0 => "some files".into(),
        1 => files[0].clone(),
        n if n <= SHOWN => format!("{} and {}", files[..n - 1].join(", "), files[n - 1]),
        n => format!("{} and {} more files", files[..SHOWN].join(", "), n - SHOWN),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    use std::process::Command;

    fn files(names: &[&str]) -> Vec<String> {
        names.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn every_unmerged_code_is_recognised() {
        for code in ["DD", "AU", "UD", "UA", "DU", "AA", "UU"] {
            let b = code.as_bytes();
            assert!(is_unmerged(b[0], b[1]), "{code}");
        }
        for code in [" M", "M ", "A ", "D ", " D", "R ", "??", "AM", "MD"] {
            let b = code.as_bytes();
            assert!(!is_unmerged(b[0], b[1]), "{code}");
        }
    }

    #[test]
    fn local_changes_in_the_way_name_the_files_and_offer_autostash() {
        let err = "error: Your local changes to the following files would be overwritten by merge:\n\tREADME.md\n\tsrc/a.rs\nPlease commit your changes or stash them before you merge.\nAborting";
        let msg = pull_failure(err, "ff", &[]);
        assert!(msg.contains("README.md and src/a.rs"), "{msg}");
        assert!(msg.contains("pull with autostash"), "{msg}");
    }

    #[test]
    fn untracked_files_in_the_way_do_not_offer_autostash() {
        let err = "error: The following untracked working tree files would be overwritten by merge:\n\tnew.txt\nPlease move or remove them before you merge.\nAborting";
        let msg = pull_failure(err, "ff", &[]);
        assert!(msg.contains("new.txt"), "{msg}");
        assert!(!msg.contains("autostash"), "{msg}");
    }

    #[test]
    fn a_dirty_tree_blocking_a_rebase_pull_offers_autostash() {
        let err = "error: cannot pull with rebase: You have unstaged changes.\nerror: Please commit or stash them.";
        assert!(pull_failure(err, "rebase", &[]).contains("pull with autostash"));
    }

    #[test]
    fn leftover_conflicts_are_named_before_a_pull() {
        let err = "error: Pulling is not possible because you have unmerged files.\nhint: Fix them up";
        let msg = pull_failure(err, "ff", &files(&["README.md"]));
        assert!(msg.starts_with("README.md still has unresolved conflicts"), "{msg}");
    }

    #[test]
    fn a_pull_stopped_on_conflicts_says_how_to_go_on() {
        let msg = pull_failure("git exited with status 1", "rebase", &files(&["a", "b"]));
        assert!(msg.contains("conflicts in a and b"), "{msg}");
        assert!(msg.contains("git rebase --continue"), "{msg}");
        let msg = pull_failure("git exited with status 1", "ff", &files(&["a"]));
        assert!(msg.contains("git merge --abort"), "{msg}");
    }

    #[test]
    fn other_errors_pass_through() {
        assert_eq!(pull_failure("fatal: no upstream", "ff", &[]), "fatal: no upstream");
    }

    #[test]
    fn a_pull_that_landed_on_conflicts_mentions_the_stash() {
        let msg = landed_with_conflicts(&files(&["README.md"]), true);
        assert!(msg.starts_with("Pulled, but"), "{msg}");
        assert!(msg.contains("README.md"), "{msg}");
        assert!(msg.contains("stash"), "{msg}");
        assert!(!landed_with_conflicts(&files(&["README.md"]), false).contains("stash"));
    }

    #[test]
    fn long_file_lists_are_cut_short() {
        assert_eq!(name_files(&files(&["a", "b", "c", "d", "e"])), "a, b, c and 2 more files");
        assert_eq!(name_files(&files(&["a", "b", "c"])), "a, b and c");
    }

    fn git(dir: &Path, args: &[&str]) {
        Command::new("git").args(args).current_dir(dir).output().unwrap();
    }

    fn write(dir: &Path, name: &str, text: &str) {
        std::fs::write(dir.join(name), text).unwrap();
    }

    fn clone(root: &Path, name: &str) -> std::path::PathBuf {
        git(root, &["clone", "-q", "remote.git", name]);
        let dir = root.join(name);
        git(&dir, &["config", "user.email", "t@t"]);
        git(&dir, &["config", "user.name", "t"]);
        dir
    }

    /// A clone holding an uncommitted edit to README.md that the pushed commit
    /// also changes; pulling it with autostash reaches the lab's state:
    /// `UU README.md` plus `stash@{0}: autostash`.
    fn conflicted_clone() -> (tempfile::TempDir, std::path::PathBuf) {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        git(root, &["init", "-q", "--bare", "remote.git"]);
        let a = clone(root, "a");
        write(&a, "README.md", "line1\n");
        git(&a, &["add", "."]);
        git(&a, &["commit", "-qm", "init"]);
        git(&a, &["push", "-q", "origin", "HEAD"]);
        let b = clone(root, "b");
        write(&b, "README.md", "line1\nfrom-b\n");
        git(&b, &["commit", "-qam", "b"]);
        git(&b, &["push", "-q"]);
        write(&a, "README.md", "line1\nlocal-a\n");
        (tmp, a)
    }

    #[test]
    fn an_autostash_pull_that_conflicts_is_reported_and_its_markers_cannot_be_committed() {
        let (_tmp, a) = conflicted_clone();
        let cwd = a.to_str().unwrap().to_string();
        let res = crate::git::pull_branch(cwd.clone(), "ff".into(), vec!["--autostash".into()]);
        let err = res.unwrap_err();
        assert!(err.starts_with("Pulled, but"), "{err}");
        assert!(err.contains("stash"), "{err}");

        let (_, listed) = crate::git::git_status_and_files(&cwd);
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].status, "conflicted");

        let refused = crate::git::git_commit(cwd.clone(), "oops".into(), files(&["README.md"]));
        assert!(refused.unwrap_err().contains("conflict markers"));
        assert_eq!(unmerged_files(&cwd), files(&["README.md"]));

        write(&a, "README.md", "line1\nfrom-b\nlocal-a\n");
        crate::git::git_commit(cwd.clone(), "resolved".into(), files(&["README.md"])).unwrap();
        assert!(unmerged_files(&cwd).is_empty());
    }

    #[test]
    fn a_pull_blocked_by_local_changes_says_so() {
        let (_tmp, a) = conflicted_clone();
        let cwd = a.to_str().unwrap().to_string();
        let err = crate::git::pull_branch(cwd, "ff".into(), vec![]).unwrap_err();
        assert!(err.starts_with("Your uncommitted changes to README.md"), "{err}");
    }
}
