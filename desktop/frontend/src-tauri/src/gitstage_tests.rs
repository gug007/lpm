use crate::git::{git_commit, git_out};
use crate::gitundo::git_amend_commit;
use std::path::Path;

const SKILL: &str = ".claude/skills/release/SKILL.md";

fn write(root: &str, file: &str, body: &str) {
    let path = Path::new(root).join(file);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, body).unwrap();
}

fn repo() -> (tempfile::TempDir, String) {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("repo").to_string_lossy().to_string();
    std::fs::create_dir(&root).unwrap();
    git_out(&root, &["init", "-q", "-b", "main"]).unwrap();
    git_out(&root, &["config", "user.name", "Test"]).unwrap();
    git_out(&root, &["config", "user.email", "test@example.com"]).unwrap();
    git_out(&root, &["config", "commit.gpgsign", "false"]).unwrap();
    write(&root, SKILL, "one\n");
    write(&root, "a.txt", "a\n");
    git_out(&root, &["add", "--", SKILL, "a.txt"]).unwrap();
    git_out(&root, &["commit", "-q", "-m", "first"]).unwrap();
    (dir, root)
}

fn ignore_skill(root: &str) {
    let exclude = Path::new(root).join(".git/info/exclude");
    std::fs::create_dir_all(exclude.parent().unwrap()).unwrap();
    std::fs::write(exclude, "/.claude/skills/release\n").unwrap();
}

/// What lpm does when a skill Git already holds is kept out of it.
fn keep_out(root: &str) {
    git_out(root, &["rm", "-r", "-q", "--cached", "--", ".claude/skills/release"]).unwrap();
    ignore_skill(root);
}

fn status(root: &str) -> String {
    git_out(root, &["status", "--porcelain"]).unwrap()
}

fn in_head(root: &str, file: &str) -> Option<String> {
    git_out(root, &["show", &format!("HEAD:{file}")]).ok()
}

fn files(names: &[&str]) -> Vec<String> {
    names.iter().map(|n| n.to_string()).collect()
}

#[test]
fn a_tracked_file_in_an_ignored_folder_is_committed() {
    let (_dir, root) = repo();
    ignore_skill(&root);
    write(&root, SKILL, "one\ntwo\n");

    git_commit(root.clone(), "edit the skill".into(), files(&[SKILL])).unwrap();

    assert_eq!(in_head(&root, SKILL).as_deref(), Some("one\ntwo"));
    assert_eq!(status(&root), "");
}

#[test]
fn a_commit_of_other_files_leaves_a_removal_staged() {
    let (_dir, root) = repo();
    keep_out(&root);
    write(&root, "a.txt", "a\nb\n");

    git_commit(root.clone(), "edit a".into(), files(&["a.txt"])).unwrap();

    assert_eq!(status(&root), format!("D  {SKILL}"));
    assert!(in_head(&root, SKILL).is_some());
    assert!(Path::new(&root).join(SKILL).exists());
}

#[test]
fn a_picked_removal_is_committed_and_the_file_stays() {
    let (_dir, root) = repo();
    keep_out(&root);
    write(&root, SKILL, "one\nlocal edit\n");

    git_commit(root.clone(), "keep the skill out".into(), files(&[SKILL])).unwrap();

    assert!(in_head(&root, SKILL).is_none());
    assert_eq!(std::fs::read_to_string(Path::new(&root).join(SKILL)).unwrap(), "one\nlocal edit\n");
    assert_eq!(status(&root), "");
}

#[test]
fn new_deleted_and_changed_files_still_stage_together() {
    let (_dir, root) = repo();
    write(&root, "a.txt", "a\nb\n");
    write(&root, "new.txt", "new\n");
    write(&root, "fresh/inside.txt", "in a new folder\n");
    std::fs::remove_file(Path::new(&root).join(SKILL)).unwrap();

    git_commit(root.clone(), "mixed".into(), files(&["a.txt", "new.txt", "fresh/", SKILL])).unwrap();

    assert_eq!(status(&root), "");
    assert_eq!(in_head(&root, "a.txt").as_deref(), Some("a\nb"));
    assert_eq!(in_head(&root, "fresh/inside.txt").as_deref(), Some("in a new folder"));
    assert!(in_head(&root, "new.txt").is_some());
    assert!(in_head(&root, SKILL).is_none());
}

#[test]
fn an_amend_leaves_a_removal_staged_too() {
    let (_dir, root) = repo();
    keep_out(&root);
    write(&root, "a.txt", "a\nb\n");
    let head = git_out(&root, &["rev-parse", "HEAD"]).unwrap();

    git_amend_commit(root.clone(), "first, amended".into(), files(&["a.txt"]), head).unwrap();

    assert_eq!(status(&root), format!("D  {SKILL}"));
    assert_eq!(in_head(&root, "a.txt").as_deref(), Some("a\nb"));
    assert!(in_head(&root, SKILL).is_some());
}
