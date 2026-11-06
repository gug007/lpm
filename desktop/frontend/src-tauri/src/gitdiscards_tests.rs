use super::*;
use crate::git::{git_changed_files, git_diff, git_diffs, git_discard_all, git_discard_files};

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

fn commit(root: &str) {
    git_out(root, &["add", "-A"]).unwrap();
    git_out_env(root, &["commit", "-q", "-m", "more"], &LPM_IDENTITY).unwrap();
}

fn changes_list(root: &str) -> Vec<String> {
    git_changed_files(root.to_string())
        .into_iter()
        .map(|f| f.path)
        .collect()
}

fn assert_discards_and_undoes(names: &[&str]) {
    let (_dir, root) = repo();
    for name in names {
        write(&root, name, "old\n");
    }
    commit(&root);
    for name in names {
        write(&root, name, "new\n");
    }

    let listed = changes_list(&root);
    assert_eq!(listed.len(), names.len(), "{listed:?}");
    let id = git_discard_files(root.clone(), listed)
        .unwrap()
        .expect("a copy");
    for name in names {
        assert_eq!(read(&root, name).as_deref(), Some("old\n"), "{name}");
    }
    assert_eq!(status(&root), "");

    git_restore_discarded(root.clone(), id).unwrap();
    for name in names {
        assert_eq!(read(&root, name).as_deref(), Some("new\n"), "{name}");
    }
}

#[test]
fn tracked_non_ascii_names_are_discarded_and_undo_restores_them() {
    assert_discards_and_undoes(&["中文.txt", "目录/日本語.txt", "cafe\u{301}.txt", "a.txt"]);
}

#[cfg(unix)]
#[test]
fn names_git_quotes_under_any_setting_are_discarded() {
    assert_discards_and_undoes(&["a\"b.txt", "back\\slash.txt", "tab\there.txt"]);
}

#[test]
fn a_mixed_batch_sorts_each_file_the_right_way() {
    let (_dir, root) = repo();
    write(&root, "中文.txt", "old\n");
    write(&root, "删除.txt", "old\n");
    commit(&root);
    write(&root, "a.txt", "a2\n");
    write(&root, "中文.txt", "new\n");
    std::fs::remove_file(Path::new(&root).join("删除.txt")).unwrap();
    write(&root, "新的.txt", "new\n");
    write(&root, "新目录/里面.txt", "new\n");

    let id = git_discard_files(root.clone(), changes_list(&root))
        .unwrap()
        .expect("a copy");
    assert_eq!(status(&root), "");
    assert_eq!(read(&root, "中文.txt").as_deref(), Some("old\n"));
    assert_eq!(read(&root, "删除.txt").as_deref(), Some("old\n"));
    assert_eq!(read(&root, "新的.txt"), None);

    git_restore_discarded(root.clone(), id).unwrap();
    assert_eq!(read(&root, "a.txt").as_deref(), Some("a2\n"));
    assert_eq!(read(&root, "中文.txt").as_deref(), Some("new\n"));
    assert_eq!(read(&root, "删除.txt"), None);
    assert_eq!(read(&root, "新的.txt").as_deref(), Some("new\n"));
    assert_eq!(read(&root, "新目录/里面.txt").as_deref(), Some("new\n"));
}

#[test]
fn a_tracked_name_with_brackets_is_not_a_pattern() {
    let (_dir, root) = repo();
    write(&root, "[ab].txt", "old\n");
    commit(&root);
    write(&root, "[ab].txt", "new\n");
    write(&root, "a.txt", "mine\n");

    let id = git_discard_files(root.clone(), vec!["[ab].txt".into()])
        .unwrap()
        .expect("a copy");
    assert_eq!(read(&root, "[ab].txt").as_deref(), Some("old\n"));
    assert_eq!(read(&root, "a.txt").as_deref(), Some("mine\n"));

    git_restore_discarded(root.clone(), id).unwrap();
    assert_eq!(read(&root, "[ab].txt").as_deref(), Some("new\n"));
    assert_eq!(read(&root, "a.txt").as_deref(), Some("mine\n"));
}

#[test]
fn committing_a_name_with_brackets_leaves_the_file_it_would_match() {
    let (_tmp, root) = repo();
    git_out(&root, &["config", "user.email", "t@t"]).unwrap();
    git_out(&root, &["config", "user.name", "t"]).unwrap();
    write(&root, "a.txt", "a\n");
    write(&root, "[ab].txt", "brackets\n");
    commit(&root);
    write(&root, "a.txt", "edited\n");
    write(&root, "[ab].txt", "edited\n");

    crate::git::git_commit(root.clone(), "only brackets".into(), vec!["[ab].txt".into()]).unwrap();

    assert_eq!(changes_list(&root), vec!["a.txt"]);
}

#[test]
fn an_untracked_name_with_brackets_is_not_a_pattern() {
    let (_dir, root) = repo();
    write(&root, "[cd].txt", "gone\n");
    write(&root, "c.txt", "mine\n");

    let id = git_discard_files(root.clone(), vec!["[cd].txt".into()])
        .unwrap()
        .expect("a copy");
    assert_eq!(read(&root, "[cd].txt"), None);
    assert_eq!(read(&root, "c.txt").as_deref(), Some("mine\n"));

    git_restore_discarded(root.clone(), id).unwrap();
    assert_eq!(read(&root, "[cd].txt").as_deref(), Some("gone\n"));
    assert_eq!(read(&root, "c.txt").as_deref(), Some("mine\n"));
}

#[test]
fn a_new_folder_is_still_removed_by_its_name() {
    let (_dir, root) = repo();
    write(&root, "fresh/one.txt", "1\n");
    write(&root, "fresh/sub/two.txt", "2\n");

    let id = git_discard_files(root.clone(), vec!["fresh".into()])
        .unwrap()
        .expect("a copy");
    assert_eq!(status(&root), "");

    git_restore_discarded(root.clone(), id).unwrap();
    assert_eq!(read(&root, "fresh/one.txt").as_deref(), Some("1\n"));
    assert_eq!(read(&root, "fresh/sub/two.txt").as_deref(), Some("2\n"));
}

#[test]
fn a_path_git_refuses_stops_the_discard() {
    let (_dir, root) = repo();
    write(&root, "a.txt", "a2\n");

    let result = git_discard_files(root.clone(), vec!["a.txt".into(), "../outside.txt".into()]);
    assert!(result.is_err());
    assert_eq!(read(&root, "a.txt").as_deref(), Some("a2\n"));
}

#[test]
fn discard_all_keeps_every_kind_of_name() {
    let (_dir, root) = repo();
    write(&root, "中文.txt", "old\n");
    write(&root, "[ab].txt", "old\n");
    commit(&root);
    write(&root, "中文.txt", "new\n");
    write(&root, "[ab].txt", "new\n");
    write(&root, "新的.txt", "new\n");

    let id = git_discard_all(root.clone()).unwrap().expect("a copy");
    assert_eq!(status(&root), "");

    git_restore_discarded(root.clone(), id).unwrap();
    assert_eq!(read(&root, "中文.txt").as_deref(), Some("new\n"));
    assert_eq!(read(&root, "[ab].txt").as_deref(), Some("new\n"));
    assert_eq!(read(&root, "新的.txt").as_deref(), Some("new\n"));
}

#[test]
fn tracked_non_ascii_files_get_their_real_diff() {
    let (_dir, root) = repo();
    write(&root, "中文.txt", "old\nsame\n");
    commit(&root);
    write(&root, "a.txt", "a2\n");
    write(&root, "中文.txt", "new\nsame\n");
    write(&root, "新的.txt", "fresh\n");

    let batch = git_diffs(
        &root,
        &["a.txt".into(), "中文.txt".into(), "新的.txt".into()],
    );
    assert!(batch[0].diff.contains("+a2"), "{}", batch[0].diff);
    assert!(batch[1].diff.contains("-old"), "{}", batch[1].diff);
    assert!(!batch[1].diff.contains("+a2"), "{}", batch[1].diff);
    assert!(!batch[1].diff.contains("new file"), "{}", batch[1].diff);
    assert!(batch[2].diff.contains("new file"), "{}", batch[2].diff);

    let single = git_diff(root.clone(), vec!["中文.txt".into()]).unwrap();
    assert_eq!(single.matches("diff --git ").count(), 1, "{single}");
    assert!(single.contains("-old"), "{single}");
}

#[path = "gitdiscards_staged_tests.rs"]
mod staged;
