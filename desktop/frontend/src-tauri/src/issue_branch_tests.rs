use super::*;

#[test]
fn a_branch_is_named_from_the_issue() {
    assert_eq!(name_for(431, "Retry failed webhooks"), "431-retry-failed-webhooks");
    assert_eq!(name_for(9, "fix: `a/b` isn't @{safe}..lock"), "9-fix-a-b-isn-t-safe-lock");
    assert_eq!(name_for(5, "支付失败"), "issue-5");
}

#[test]
fn a_long_title_stops_at_a_word() {
    let name = name_for(
        2,
        "The sidebar lists every project I have ever added and it never ends",
    );
    assert_eq!(name, "2-the-sidebar-lists-every-project-i-have-ever");
    assert_eq!(name_for(3, &"x".repeat(90)), format!("3-{}", "x".repeat(SLUG_CHARS)));
}

#[test]
fn closing_is_added_once() {
    assert_eq!(with_closing("", 431), "Closes #431");
    assert_eq!(with_closing("Adds retries.\n", 431), "Adds retries.\n\nCloses #431");
    for already in [
        "Fixes #431",
        "This closes: #431.",
        "Resolved o/r#431",
        "fix https://github.com/o/r/issues/431",
    ] {
        assert_eq!(with_closing(already, 431), already);
    }
    assert_eq!(with_closing("Closes #43", 431), "Closes #43\n\nCloses #431");
    assert_eq!(with_closing("See #431", 431), "See #431\n\nCloses #431");
}

#[test]
fn the_link_follows_the_branch_and_names_stay_free() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let cwd = root.to_string_lossy().into_owned();
    let git = |args: &[&str]| crate::git::git_out(&cwd, args).unwrap();
    git(&["init", "-q", "-b", "main"]);
    git(&[
        "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false",
        "commit", "-q", "--allow-empty", "-m", "init",
    ]);
    assert_eq!(branch_issue(cwd.clone()), None);

    let name = name_for(431, "Retry: v1.2 webhooks");
    assert_eq!(free(root, &name), name);
    git(&["checkout", "-q", "-b", &name]);
    link(root, &name, 431).unwrap();
    assert_eq!(branch_issue(cwd.clone()), Some(431));
    assert_eq!(free(root, &name), format!("{name}-2"));

    git(&["branch", "-m", "feat/retry"]);
    assert_eq!(branch_issue(cwd.clone()), Some(431));
    git(&["checkout", "-q", "main"]);
    assert_eq!(branch_issue(cwd.clone()), None);
    git(&["branch", "-q", "-D", "feat/retry"]);
    assert_eq!(of_branch(&cwd, "feat/retry"), None);
}
