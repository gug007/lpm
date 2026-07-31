// The one definition of "what this working tree currently holds", shared by both
// Macs so their states are directly comparable.
//
// A working state is HEAD plus every tracked edit, deletion and untracked-unignored
// file, reduced to a single tree id. The sending Mac reports it as a fingerprint
// (cheap: no pack, no commit) and the receiving Mac recomputes it the same way to
// answer the question that makes repeat syncing safe — is everything in this
// folder still exactly what the last transfer put there, or has the user typed
// since?
use crate::git::{git_out, git_out_env};
use std::path::PathBuf;

/// A machine identity for the commits this module writes: the repo may have no
/// configured user, and these commits are transport or recovery artifacts that
/// never carry authorship.
pub(crate) const LPM_IDENTITY: [(&str, &str); 4] = [
    ("GIT_AUTHOR_NAME", "lpm"),
    ("GIT_AUTHOR_EMAIL", "lpm@localhost"),
    ("GIT_COMMITTER_NAME", "lpm"),
    ("GIT_COMMITTER_EMAIL", "lpm@localhost"),
];

pub(crate) fn head_sha(root: &str) -> Result<String, String> {
    git_out(root, &["rev-parse", "HEAD"])
}

/// Where a discarded working state is kept. One per source Mac, replaced each
/// time: "the last thing you discarded here" is a contract that can be explained
/// in a sentence, which an accumulating list of timestamps cannot.
pub(crate) fn discarded_ref(slug: &str) -> String {
    format!("refs/lpm/discarded/{slug}")
}

/// Commit the working state as it stands and anchor it, so overwriting it is
/// recoverable. Called only on the path where the user chose to discard their own
/// edits — the one place syncing writes over work it did not put there.
pub(crate) fn preserve_state(root: &str, slug: &str) -> Result<String, String> {
    let head = head_sha(root)?;
    let tree = working_state_tree(root, &head)?;
    let commit = git_out_env(
        root,
        &[
            "commit-tree",
            &tree,
            "-p",
            &head,
            "-m",
            "lpm: discarded local changes",
        ],
        &LPM_IDENTITY,
    )?;
    let anchor = discarded_ref(slug);
    git_out(root, &["update-ref", &anchor, &commit])?;
    Ok(anchor)
}

pub(crate) fn tree_of(root: &str, rev: &str) -> Result<String, String> {
    git_out(root, &["rev-parse", &format!("{rev}^{{tree}}")])
}

/// The tree the working state would produce, built in a throwaway index so the
/// user's own staging area is never touched. Ignored files stay out — they are
/// machine-specific and never travel.
pub(crate) fn working_state_tree(root: &str, head: &str) -> Result<String, String> {
    let index = temp_index();
    let index_arg = index.to_string_lossy().to_string();
    let built = build_tree(root, head, &[("GIT_INDEX_FILE", index_arg.as_str())]);
    let _ = std::fs::remove_file(&index);
    built
}

fn build_tree(root: &str, head: &str, envs: &[(&str, &str)]) -> Result<String, String> {
    git_out_env(root, &["read-tree", head], envs)?;
    git_out_env(root, &["add", "-A", "--"], envs)?;
    git_out_env(root, &["write-tree"], envs)
}

fn temp_index() -> PathBuf {
    std::env::temp_dir().join(format!("lpm-workstate-{}", uuid::Uuid::new_v4()))
}

/// True when nothing in `root` is the user's own: either it is clean, or its
/// working state is byte-for-byte the state `anchor` records — what the last
/// transfer landed there. This is the whole basis for replacing a followed
/// project's contents without ever destroying local work, so every failure to
/// answer counts as "the user's" and blocks the write.
pub(crate) fn holds_only_state(root: &str, anchor: &str) -> bool {
    if !crate::gitbringapply::is_dirty(root) {
        return true;
    }
    let Ok(head) = head_sha(root) else {
        return false;
    };
    let (Ok(current), Ok(anchored)) = (working_state_tree(root, &head), tree_of(root, anchor))
    else {
        return false;
    };
    current == anchored
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repo() -> (tempfile::TempDir, String) {
        let dir = tempfile::tempdir().unwrap();
        let cwd = dir.path().to_string_lossy().to_string();
        git_out(&cwd, &["init", "-q", "-b", "main"]).unwrap();
        std::fs::write(dir.path().join("a.txt"), "one\n").unwrap();
        git_out(&cwd, &["add", "-A"]).unwrap();
        git_out_env(&cwd, &["commit", "-q", "-m", "first"], &LPM_IDENTITY).unwrap();
        (dir, cwd)
    }

    #[test]
    fn a_clean_tree_reports_heads_own_tree() {
        let (_d, cwd) = repo();
        let head = head_sha(&cwd).unwrap();
        assert_eq!(
            working_state_tree(&cwd, &head).unwrap(),
            tree_of(&cwd, &head).unwrap()
        );
    }

    #[test]
    fn edits_and_untracked_files_change_the_tree_but_ignored_ones_do_not() {
        let (d, cwd) = repo();
        let head = head_sha(&cwd).unwrap();
        let clean = working_state_tree(&cwd, &head).unwrap();

        std::fs::write(d.path().join(".gitignore"), "secret.env\n").unwrap();
        std::fs::write(d.path().join("a.txt"), "two\n").unwrap();
        let edited = working_state_tree(&cwd, &head).unwrap();
        assert_ne!(edited, clean);

        std::fs::write(d.path().join("secret.env"), "TOKEN=1\n").unwrap();
        assert_eq!(working_state_tree(&cwd, &head).unwrap(), edited);
        // The user's real index stays empty throughout.
        assert!(git_out(&cwd, &["diff", "--cached", "--name-only"])
            .unwrap()
            .is_empty());
    }

    #[test]
    fn a_clean_folder_holds_nothing_of_the_users_own() {
        let (_d, cwd) = repo();
        assert!(holds_only_state(&cwd, "refs/lpm/absent"));
    }

    #[test]
    fn a_dirty_folder_matching_the_anchor_is_still_only_the_landed_state() {
        let (d, cwd) = repo();
        std::fs::write(d.path().join("a.txt"), "landed\n").unwrap();
        let head = head_sha(&cwd).unwrap();
        let tree = working_state_tree(&cwd, &head).unwrap();
        // commit-tree writes a commit, so it needs an identity like any other —
        // without one this borrows the machine's global git config and fails
        // wherever there isn't one (a bare CI runner, a fresh checkout).
        let anchor = git_out_env(
            &cwd,
            &["commit-tree", &tree, "-p", &head, "-m", "landed"],
            &LPM_IDENTITY,
        )
        .unwrap();
        git_out(&cwd, &["update-ref", "refs/lpm/from-test", &anchor]).unwrap();

        assert!(holds_only_state(&cwd, "refs/lpm/from-test"));

        std::fs::write(d.path().join("a.txt"), "mine\n").unwrap();
        assert!(!holds_only_state(&cwd, "refs/lpm/from-test"));
    }

    #[test]
    fn an_untracked_file_of_the_users_own_counts_as_theirs() {
        let (d, cwd) = repo();
        let head = head_sha(&cwd).unwrap();
        let tree = working_state_tree(&cwd, &head).unwrap();
        // commit-tree writes a commit, so it needs an identity like any other —
        // without one this borrows the machine's global git config and fails
        // wherever there isn't one (a bare CI runner, a fresh checkout).
        let anchor = git_out_env(
            &cwd,
            &["commit-tree", &tree, "-p", &head, "-m", "landed"],
            &LPM_IDENTITY,
        )
        .unwrap();
        git_out(&cwd, &["update-ref", "refs/lpm/from-test", &anchor]).unwrap();

        std::fs::write(d.path().join("notes.md"), "mine\n").unwrap();
        assert!(!holds_only_state(&cwd, "refs/lpm/from-test"));
    }

    /// "Discard mine" is the one path that writes over the user's own work, so what
    /// it discards has to be recoverable afterwards.
    #[test]
    fn discarded_work_is_recoverable_from_its_ref() {
        let (d, cwd) = repo();
        std::fs::write(d.path().join("a.txt"), "my edit\n").unwrap();
        std::fs::write(d.path().join("mine.txt"), "my new file\n").unwrap();

        let anchor = preserve_state(&cwd, "a0af5f07").unwrap();
        assert_eq!(anchor, "refs/lpm/discarded/a0af5f07");

        // What a sync then does to the folder: replace it wholesale.
        std::fs::write(d.path().join("a.txt"), "theirs\n").unwrap();
        std::fs::remove_file(d.path().join("mine.txt")).unwrap();

        let listed = git_out(&cwd, &["ls-tree", "-r", "--name-only", &anchor]).unwrap();
        assert!(listed.contains("mine.txt"));
        git_out(&cwd, &["restore", "--source", &anchor, "--", "."]).unwrap();
        assert_eq!(
            std::fs::read_to_string(d.path().join("a.txt")).unwrap(),
            "my edit\n"
        );
        assert_eq!(
            std::fs::read_to_string(d.path().join("mine.txt")).unwrap(),
            "my new file\n"
        );
    }

    #[test]
    fn preserving_a_clean_folder_records_exactly_what_is_there() {
        let (_d, cwd) = repo();
        let anchor = preserve_state(&cwd, "a0af5f07").unwrap();
        assert_eq!(
            tree_of(&cwd, &anchor).unwrap(),
            tree_of(&cwd, "HEAD").unwrap()
        );
    }

    #[test]
    fn a_missing_anchor_over_a_dirty_folder_blocks_the_write() {
        let (d, cwd) = repo();
        std::fs::write(d.path().join("a.txt"), "mine\n").unwrap();
        assert!(!holds_only_state(&cwd, "refs/lpm/absent"));
    }
}
