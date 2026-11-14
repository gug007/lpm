use super::*;
use std::path::Path;

fn write(root: &str, file: &str, body: &str) {
    std::fs::write(Path::new(root).join(file), body).unwrap();
}

fn commit(root: &str, file: &str, body: &str, message: &str) -> String {
    write(root, file, body);
    git_out(root, &["add", file]).unwrap();
    git_out(root, &["commit", "-q", "-m", message]).unwrap();
    head(root).unwrap()
}

fn repo() -> (tempfile::TempDir, String) {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("repo").to_string_lossy().to_string();
    std::fs::create_dir(&root).unwrap();
    git_out(&root, &["init", "-q", "-b", "main"]).unwrap();
    git_out(&root, &["config", "user.name", "Test"]).unwrap();
    git_out(&root, &["config", "user.email", "test@example.com"]).unwrap();
    git_out(&root, &["config", "commit.gpgsign", "false"]).unwrap();
    commit(&root, "a.txt", "a\n", "first");
    (dir, root)
}

fn subject(root: &str) -> String {
    git_out(root, &["log", "-1", "--format=%s"]).unwrap()
}

#[test]
fn undo_keeps_the_changes_and_returns_the_message() {
    let (_dir, root) = repo();
    let hash = commit(&root, "b.txt", "b\n", "Add b\n\nWhy it matters.");
    let undone = git_undo_commit(root.clone(), hash.clone()).unwrap();
    assert_eq!(undone.hash, hash);
    assert_eq!(undone.message, "Add b\n\nWhy it matters.");
    assert_eq!(undone.files, 1);
    assert_eq!(subject(&root), "first");
    assert!(Path::new(&root).join("b.txt").exists());
    assert_eq!(
        git_out(&root, &["status", "--porcelain"]).unwrap(),
        "A  b.txt"
    );
}

#[test]
fn redo_puts_the_commit_back() {
    let (_dir, root) = repo();
    let hash = commit(&root, "b.txt", "b\n", "Add b");
    git_undo_commit(root.clone(), hash.clone()).unwrap();
    git_redo_commit(root.clone(), hash.clone()).unwrap();
    assert_eq!(head(&root).unwrap(), hash);
    assert_eq!(git_out(&root, &["status", "--porcelain"]).unwrap(), "");
}

#[test]
fn redo_refuses_once_something_else_was_committed() {
    let (_dir, root) = repo();
    let hash = commit(&root, "b.txt", "b\n", "Add b");
    git_undo_commit(root.clone(), hash.clone()).unwrap();
    commit(&root, "c.txt", "c\n", "Add c");
    assert!(git_redo_commit(root.clone(), hash).is_err());
    assert_eq!(subject(&root), "Add c");
}

#[test]
fn undo_refuses_a_stale_hash_and_the_first_commit() {
    let (_dir, root) = repo();
    let first = head(&root).unwrap();
    assert!(git_undo_commit(root.clone(), first.clone()).is_err());
    commit(&root, "b.txt", "b\n", "Add b");
    assert!(git_undo_commit(root.clone(), first).is_err());
    assert_eq!(subject(&root), "Add b");
}

#[test]
fn undo_refuses_a_pushed_commit() {
    let (dir, root) = repo();
    let origin = dir.path().join("origin.git").to_string_lossy().to_string();
    git_out(&root, &["init", "-q", "--bare", &origin]).unwrap();
    git_out(&root, &["remote", "add", "origin", &origin]).unwrap();
    let hash = commit(&root, "b.txt", "b\n", "Add b");
    git_out(&root, &["push", "-q", "origin", "main"]).unwrap();
    let err = git_undo_commit(root.clone(), hash).unwrap_err();
    assert!(err.contains("pushed"), "{err}");
    assert_eq!(subject(&root), "Add b");
}

#[test]
fn amend_adds_the_chosen_files_and_rewords() {
    let (_dir, root) = repo();
    let hash = commit(&root, "b.txt", "b\n", "Add b");
    write(&root, "c.txt", "c\n");
    write(&root, "d.txt", "d\n");
    git_amend_commit(
        root.clone(),
        "Add b and c".into(),
        vec!["c.txt".into()],
        hash.clone(),
    )
    .unwrap();
    assert_ne!(head(&root).unwrap(), hash);
    assert_eq!(subject(&root), "Add b and c");
    let files = git_out(&root, &["show", "--name-only", "--format=", "HEAD"]).unwrap();
    assert_eq!(files, "b.txt\nc.txt");
    assert_eq!(
        git_out(&root, &["status", "--porcelain"]).unwrap(),
        "?? d.txt"
    );
    assert_eq!(
        git_out(&root, &["rev-list", "--count", "HEAD"]).unwrap(),
        "2"
    );
}

#[test]
fn amend_with_no_files_only_rewords() {
    let (_dir, root) = repo();
    let hash = commit(&root, "b.txt", "b\n", "Add b");
    write(&root, "c.txt", "c\n");
    git_amend_commit(root.clone(), "Add the b file".into(), Vec::new(), hash).unwrap();
    assert_eq!(subject(&root), "Add the b file");
    assert_eq!(
        git_out(&root, &["status", "--porcelain"]).unwrap(),
        "?? c.txt"
    );
}
