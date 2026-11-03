use super::*;
use crate::git::{git_discard_all, git_discard_files};

fn repo() -> (tempfile::TempDir, String) {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("main").to_string_lossy().to_string();
    std::fs::create_dir(&root).unwrap();
    git_out(&root, &["init", "-q", "-b", "main"]).unwrap();
    write(&root, "a.txt", "a\n");
    write(&root, "b.txt", "b\n");
    write(&root, ".gitignore", "node_modules/\n");
    git_out(&root, &["add", "-A"]).unwrap();
    git_out_env(&root, &["commit", "-q", "-m", "init"], &LPM_IDENTITY).unwrap();
    (dir, root)
}

fn write(root: &str, file: &str, body: &str) {
    let path = Path::new(root).join(file);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, body).unwrap();
}

fn read(root: &str, file: &str) -> Option<String> {
    std::fs::read_to_string(Path::new(root).join(file)).ok()
}

fn status(root: &str) -> String {
    git_out(root, &["status", "--porcelain", "--untracked-files=all"]).unwrap()
}

#[test]
fn discard_all_keeps_a_copy_that_undo_puts_back() {
    let (_dir, root) = repo();
    write(&root, "a.txt", "a2\n");
    std::fs::remove_file(Path::new(&root).join("b.txt")).unwrap();
    write(&root, "c.txt", "c\n");
    git_out(&root, &["add", "c.txt"]).unwrap();
    write(&root, "d.txt", "d\n");
    write(&root, "node_modules/x", "x\n");
    let before = status(&root);

    let id = git_discard_all(root.clone()).unwrap().expect("a copy");
    assert_eq!(status(&root), "");
    assert_eq!(read(&root, "node_modules/x").as_deref(), Some("x\n"));

    let kept = git_discarded(root.clone());
    assert_eq!(kept.len(), 1);
    let mut files = kept[0].files.clone();
    files.sort();
    assert_eq!(files, ["a.txt", "b.txt", "c.txt", "d.txt"]);

    git_restore_discarded(root.clone(), id).unwrap();
    assert_eq!(status(&root), before);
    assert_eq!(read(&root, "a.txt").as_deref(), Some("a2\n"));
    assert!(git_discarded(root).is_empty());
}

#[test]
fn nothing_to_keep_means_no_copy() {
    let (_dir, root) = repo();
    assert_eq!(git_discard_all(root.clone()).unwrap(), None);
    assert!(git_discarded(root).is_empty());
}

#[test]
fn discarding_some_files_keeps_only_those() {
    let (_dir, root) = repo();
    write(&root, "a.txt", "a2\n");
    write(&root, "b.txt", "b2\n");
    write(&root, "new.txt", "new\n");

    let id = git_discard_files(root.clone(), vec!["a.txt".into(), "new.txt".into()])
        .unwrap()
        .expect("a copy");
    assert_eq!(read(&root, "a.txt").as_deref(), Some("a\n"));
    assert_eq!(read(&root, "new.txt"), None);
    assert_eq!(read(&root, "b.txt").as_deref(), Some("b2\n"));

    git_restore_discarded(root.clone(), id).unwrap();
    assert_eq!(read(&root, "a.txt").as_deref(), Some("a2\n"));
    assert_eq!(read(&root, "new.txt").as_deref(), Some("new\n"));
    assert_eq!(read(&root, "b.txt").as_deref(), Some("b2\n"));
}

#[test]
fn a_file_back_in_the_way_keeps_the_copy() {
    let (_dir, root) = repo();
    write(&root, "d.txt", "d\n");
    let id = git_discard_all(root.clone()).unwrap().expect("a copy");
    write(&root, "d.txt", "again\n");

    let err = git_restore_discarded(root.clone(), id).unwrap_err();
    assert!(err.starts_with("Nothing was restored"), "{err}");
    assert_eq!(git_discarded(root.clone()).len(), 1);
    assert_eq!(read(&root, "d.txt").as_deref(), Some("again\n"));
}

#[test]
fn copies_older_than_a_week_are_dropped() {
    let (_dir, root) = repo();
    write(&root, "a.txt", "a2\n");
    git_discard_all(root.clone()).unwrap().expect("a copy");
    let sha = git_out(
        &root,
        &[
            "rev-parse",
            &format!("{REF_PREFIX}{}", git_discarded(root.clone())[0].id),
        ],
    )
    .unwrap();
    let old = now_ms() - KEEP_MS - 1;
    git_out(&root, &["update-ref", &format!("{REF_PREFIX}{old}"), &sha]).unwrap();
    assert_eq!(git_discarded(root.clone()).len(), 1);
    assert!(git_discarded(root).iter().all(|d| d.at > old));
}

#[test]
fn worktrees_keep_their_own_copies() {
    let (dir, root) = repo();
    let other = dir.path().join("wt").to_string_lossy().to_string();
    git_out(&root, &["worktree", "add", "-q", "-b", "wt", &other]).unwrap();
    write(&root, "a.txt", "a2\n");
    git_discard_all(root.clone()).unwrap().expect("a copy");
    assert_eq!(git_discarded(root).len(), 1);
    assert!(git_discarded(other).is_empty());
}
