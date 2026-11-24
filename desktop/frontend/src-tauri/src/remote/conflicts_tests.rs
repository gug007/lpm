use super::*;
use std::path::Path;
use std::process::Command;

fn git(dir: &Path, args: &[&str]) {
    Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .unwrap();
}

/// `main` with `feature`'s conflicting change to a.txt and b.txt merged into it.
fn stopped_merge() -> (tempfile::TempDir, String) {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path();
    git(dir, &["init", "-q", "-b", "main"]);
    git(dir, &["config", "user.email", "t@t"]);
    git(dir, &["config", "user.name", "t"]);
    let commit = |text: &str| {
        for name in ["a.txt", "b.txt"] {
            std::fs::write(dir.join(name), text).unwrap();
        }
        git(dir, &["add", "."]);
        git(dir, &["commit", "-qm", text]);
    };
    commit("base\n");
    git(dir, &["checkout", "-qb", "feature"]);
    commit("theirs\n");
    git(dir, &["checkout", "-q", "main"]);
    commit("ours\n");
    git(dir, &["merge", "feature"]);
    let cwd = dir.to_str().unwrap().to_string();
    (tmp, cwd)
}

fn take(cwd: &str, path: &str, side: &str) -> Result<(), String> {
    act(
        "gitConflictTake",
        cwd,
        &json!({ "path": path, "side": side }),
    )
}

#[test]
fn a_clean_tree_has_nothing_to_show() {
    let (_tmp, cwd) = stopped_merge();
    act("gitMergeAbort", &cwd, &Value::Null).unwrap();
    assert_eq!(merge_state(&cwd, false), None);
    assert_eq!(
        std::fs::read_to_string(Path::new(&cwd).join("a.txt")).unwrap(),
        "ours\n"
    );
}

#[test]
fn a_stopped_merge_lists_its_files_until_it_is_committed() {
    let (_tmp, cwd) = stopped_merge();
    let merge = merge_state(&cwd, true).unwrap();
    assert_eq!(merge["merging"], true);
    assert_eq!(merge["source"], "feature");
    assert_eq!(
        merge["files"][0],
        json!({ "path": "a.txt", "conflicts": 1, "firstLine": 1, "resolved": false })
    );
    assert!(merge.get("resolving").is_none());

    take(&cwd, "a.txt", "theirs").unwrap();
    assert!(act("gitMergeContinue", &cwd, &Value::Null)
        .unwrap_err()
        .contains("b.txt"));

    std::fs::write(Path::new(&cwd).join("b.txt"), "both\n").unwrap();
    act("gitConflictResolved", &cwd, &json!({ "path": "b.txt" })).unwrap();
    // Nothing is unmerged any more, but the merge still waits to be committed.
    let merge = merge_state(&cwd, false).unwrap();
    assert!(merge["files"]
        .as_array()
        .unwrap()
        .iter()
        .all(|f| f["resolved"] == true));

    act("gitMergeContinue", &cwd, &Value::Null).unwrap();
    assert_eq!(merge_state(&cwd, false), None);
    let parents = crate::git::git_out(&cwd, &["log", "-1", "--format=%P"]).unwrap();
    assert_eq!(parents.split_whitespace().count(), 2);
}

#[test]
fn a_file_with_markers_left_is_not_marked_resolved() {
    let (_tmp, cwd) = stopped_merge();
    let left = act("gitConflictResolved", &cwd, &json!({ "path": "a.txt" }));
    assert!(left.unwrap_err().contains("conflict markers"));
    assert!(take(&cwd, "a.txt", "both").is_err());
}

#[test]
fn conflicts_outside_a_merge_are_listed_without_one() {
    let (_tmp, cwd) = stopped_merge();
    let dir = Path::new(&cwd);
    git(dir, &["merge", "--abort"]);
    git(dir, &["rebase", "feature"]);
    let merge = merge_state(&cwd, true).unwrap();
    assert_eq!(merge["merging"], false);
    assert_eq!(merge["source"], "");
    assert_eq!(merge["files"].as_array().unwrap().len(), 2);
}
