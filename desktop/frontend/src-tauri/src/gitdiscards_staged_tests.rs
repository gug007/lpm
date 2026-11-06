use super::*;

fn stage(root: &str, args: &[&str]) {
    git_out(root, args).unwrap();
}

#[test]
fn staged_new_files_are_removed_and_undo_restores_them() {
    let (_dir, root) = repo();
    write(&root, "plain.txt", "n\n");
    write(&root, "新的.txt", "n\n");
    stage(&root, &["add", "-A"]);

    let id = git_discard_files(root.clone(), changes_list(&root))
        .unwrap()
        .expect("a copy");
    assert_eq!(status(&root), "");
    assert_eq!(read(&root, "plain.txt"), None);
    assert_eq!(read(&root, "新的.txt"), None);

    git_restore_discarded(root.clone(), id).unwrap();
    assert_eq!(read(&root, "plain.txt").as_deref(), Some("n\n"));
    assert_eq!(read(&root, "新的.txt").as_deref(), Some("n\n"));
}

#[test]
fn edits_made_after_staging_a_new_file_are_in_the_copy() {
    let (_dir, root) = repo();
    write(&root, "n.txt", "staged\n");
    stage(&root, &["add", "-A"]);
    write(&root, "n.txt", "latest\n");

    let id = git_discard_files(root.clone(), vec!["n.txt".into()])
        .unwrap()
        .expect("a copy");
    assert_eq!(read(&root, "n.txt"), None);

    git_restore_discarded(root.clone(), id).unwrap();
    assert_eq!(read(&root, "n.txt").as_deref(), Some("latest\n"));
}

#[test]
fn a_staged_new_file_gone_from_disk_leaves_the_index_too() {
    let (_dir, root) = repo();
    write(&root, "n.txt", "n\n");
    stage(&root, &["add", "-A"]);
    std::fs::remove_file(Path::new(&root).join("n.txt")).unwrap();

    git_discard_files(root.clone(), vec!["n.txt".into()]).unwrap();
    assert_eq!(status(&root), "");
}

#[test]
fn a_staged_new_file_does_not_sink_a_batch() {
    let (_dir, root) = repo();
    write(&root, "n.txt", "n\n");
    stage(&root, &["add", "-A"]);
    write(&root, "a.txt", "a2\n");
    write(&root, "loose.txt", "l\n");

    git_discard_files(root.clone(), changes_list(&root))
        .unwrap()
        .expect("a copy");
    assert_eq!(status(&root), "");
    assert_eq!(read(&root, "a.txt").as_deref(), Some("a\n"));
    assert_eq!(read(&root, "n.txt"), None);
    assert_eq!(read(&root, "loose.txt"), None);
}

#[test]
fn a_staged_new_name_with_brackets_is_not_a_pattern() {
    let (_dir, root) = repo();
    write(&root, "[ab].txt", "n\n");
    stage(&root, &["add", "-A"]);
    write(&root, "a.txt", "mine\n");

    git_discard_files(root.clone(), vec!["[ab].txt".into()])
        .unwrap()
        .expect("a copy");
    assert_eq!(read(&root, "[ab].txt"), None);
    assert_eq!(read(&root, "a.txt").as_deref(), Some("mine\n"));
}

#[test]
fn a_staged_deletion_is_restored_and_undo_deletes_it_again() {
    let (_dir, root) = repo();
    stage(&root, &["rm", "-q", "b.txt"]);

    let id = git_discard_files(root.clone(), changes_list(&root))
        .unwrap()
        .expect("a copy");
    assert_eq!(status(&root), "");
    assert_eq!(read(&root, "b.txt").as_deref(), Some("b\n"));

    git_restore_discarded(root.clone(), id).unwrap();
    assert_eq!(read(&root, "b.txt"), None);
}

#[test]
fn a_staged_rename_goes_back_to_its_old_name() {
    let (_dir, root) = repo();
    stage(&root, &["mv", "a.txt", "moved.txt"]);
    assert_eq!(changes_list(&root), vec!["moved.txt"]);

    let id = git_discard_files(root.clone(), changes_list(&root))
        .unwrap()
        .expect("a copy");
    assert_eq!(status(&root), "");
    assert_eq!(read(&root, "a.txt").as_deref(), Some("a\n"));
    assert_eq!(read(&root, "moved.txt"), None);

    git_restore_discarded(root.clone(), id).unwrap();
    assert_eq!(read(&root, "a.txt"), None);
    assert_eq!(read(&root, "moved.txt").as_deref(), Some("a\n"));
}

#[test]
fn edits_made_after_a_rename_are_in_the_copy() {
    let (_dir, root) = repo();
    write(&root, "long.txt", "1\n2\n3\n4\n5\n6\n7\n8\n");
    commit(&root);
    stage(&root, &["mv", "long.txt", "中文.txt"]);
    write(&root, "中文.txt", "1\n2\n3\n4\n5\n6\n7\n9\n");

    let id = git_discard_files(root.clone(), changes_list(&root))
        .unwrap()
        .expect("a copy");
    assert_eq!(status(&root), "");
    assert_eq!(
        read(&root, "long.txt").as_deref(),
        Some("1\n2\n3\n4\n5\n6\n7\n8\n")
    );

    git_restore_discarded(root.clone(), id).unwrap();
    assert_eq!(read(&root, "long.txt"), None);
    assert_eq!(
        read(&root, "中文.txt").as_deref(),
        Some("1\n2\n3\n4\n5\n6\n7\n9\n")
    );
}

#[test]
fn a_rename_that_only_changes_case_goes_back() {
    let (_dir, root) = repo();
    stage(&root, &["mv", "a.txt", "A.txt"]);

    git_discard_files(root.clone(), vec!["A.txt".into()]).unwrap();
    assert_eq!(status(&root), "");
    assert_eq!(read(&root, "a.txt").as_deref(), Some("a\n"));
    let names: Vec<String> = std::fs::read_dir(&root)
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    assert!(names.contains(&"a.txt".to_string()), "{names:?}");
}

#[test]
fn edits_in_a_rename_that_only_changes_case_are_in_the_copy() {
    let (_dir, root) = repo();
    write(&root, "long.txt", "1\n2\n3\n4\n5\n6\n7\n8\n");
    commit(&root);
    stage(&root, &["mv", "long.txt", "LONG.txt"]);
    write(&root, "LONG.txt", "1\n2\n3\n4\n5\n6\n7\n9\n");

    let id = git_discard_files(root.clone(), vec!["LONG.txt".into()])
        .unwrap()
        .expect("a copy");
    assert_eq!(status(&root), "");
    assert_eq!(
        read(&root, "long.txt").as_deref(),
        Some("1\n2\n3\n4\n5\n6\n7\n8\n")
    );

    git_restore_discarded(root.clone(), id).unwrap();
    assert_eq!(
        read(&root, "LONG.txt").as_deref(),
        Some("1\n2\n3\n4\n5\n6\n7\n9\n")
    );
}

#[test]
fn discarding_a_new_file_leaves_a_rename_alone() {
    let (_dir, root) = repo();
    stage(&root, &["mv", "a.txt", "moved.txt"]);
    write(&root, "n.txt", "n\n");
    stage(&root, &["add", "-A"]);

    git_discard_files(root.clone(), vec!["n.txt".into()])
        .unwrap()
        .expect("a copy");
    assert_eq!(read(&root, "n.txt"), None);
    assert_eq!(read(&root, "moved.txt").as_deref(), Some("a\n"));
    assert_eq!(read(&root, "a.txt"), None);
}

#[test]
fn a_diff_of_a_name_with_brackets_shows_only_that_file() {
    let (_dir, root) = repo();
    write(&root, "[ab].txt", "old\n");
    commit(&root);
    write(&root, "[ab].txt", "new\n");
    write(&root, "a.txt", "mine\n");

    let single = git_diff(root.clone(), vec!["[ab].txt".into()]).unwrap();
    assert_eq!(single.matches("diff --git ").count(), 1, "{single}");
    assert!(!single.contains("+mine"), "{single}");

    let batch = git_diffs(&root, &["[ab].txt".into()]);
    assert!(!batch[0].diff.contains("+mine"), "{}", batch[0].diff);
}

#[test]
fn a_diff_of_an_unchanged_name_with_brackets_is_empty() {
    let (_dir, root) = repo();
    write(&root, "[ab].txt", "same\n");
    commit(&root);
    write(&root, "a.txt", "mine\n");

    let batch = git_diffs(&root, &["[ab].txt".into()]);
    assert_eq!(batch[0].diff, "");
    assert_eq!(git_diff(root.clone(), vec!["[ab].txt".into()]).unwrap(), "");
}
