use super::*;
use chrono::Duration;

#[test]
fn adds_up_each_commits_written_lines() {
    let out = "commit aaa\n\n3\t1\tsrc/a.rs\n-\t-\tlogo.png\n10\t0\tREADME.md\n900\t80\tweb/package-lock.json\ncommit bbb\n\n0\t4\tsrc/b.rs\n40\t2\tCargo.lock\n49749\t0\ttest/fixture.json\n";
    assert_eq!(
        parse_numstat(out),
        [
            RecapCommit {
                sha: "aaa".into(),
                added: 13,
                removed: 1
            },
            RecapCommit {
                sha: "bbb".into(),
                added: 0,
                removed: 4
            },
        ]
    );
}

#[test]
fn names_one_repository_the_same_in_every_remote_form() {
    for url in [
        "git@gitlab.com:Team/App.git",
        "https://gitlab.com/team/app",
        "https://user:secret@gitlab.com/team/app.git\n",
        "ssh://git@gitlab.com/team/app.git",
    ] {
        assert_eq!(origin_key(url), "gitlab.com/team/app", "{url}");
    }
}

#[test]
fn names_a_local_windows_remote_the_same_with_either_slash() {
    assert_eq!(
        origin_key(r"C:\Repos\App.git"),
        origin_key("C:/Repos/App.git")
    );
    assert_eq!(
        origin_key(r"C:\Repos/App.git"),
        origin_key("C:/Repos/App.git")
    );
    assert_eq!(
        origin_key(r"\\nas\Repos\App.git"),
        origin_key("//nas/Repos/App.git")
    );
    assert_ne!(
        origin_key(r"C:\Repos\App.git"),
        origin_key(r"C:\Repos\Web.git")
    );
}

#[test]
fn counts_copies_and_worktrees_of_a_repository_once() {
    let dir = tempfile::tempdir().unwrap();
    let app = dir.path().join("app");
    let copy = dir.path().join("app-copy");
    let local = dir.path().join("local");
    for root in [&app, &copy, &local] {
        std::fs::create_dir(root).unwrap();
        run(root, &["init", "-q"]);
    }
    run(&app, &["remote", "add", "origin", "git@github.com:me/app.git"]);
    run(&copy, &["remote", "add", "origin", "https://github.com/me/app"]);
    let plain = dir.path().join("plain");
    std::fs::create_dir(&plain).unwrap();
    let roots = [&app, &copy, &local, &plain];
    let keys = repo_keys(roots.iter().map(|root| root.as_path()));
    assert_eq!(keys.len(), 2, "{keys:?}");
    assert!(keys.contains(&"github.com/me/app".to_string()));
}

fn run(root: &Path, args: &[&str]) {
    let status = std::process::Command::new("git")
        .args(args)
        .current_dir(root)
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .status()
        .unwrap();
    assert!(status.success(), "git {args:?}");
}

#[test]
fn counts_the_users_own_commits_once_across_copies() {
    let dir = tempfile::tempdir().unwrap();
    let repo = dir.path().join("app");
    std::fs::create_dir(&repo).unwrap();
    run(&repo, &["init", "-q"]);
    run(&repo, &["config", "user.email", "me@example.com"]);
    run(&repo, &["config", "user.name", "Me"]);
    std::fs::write(repo.join("a.txt"), "one\ntwo\nthree\n").unwrap();
    run(&repo, &["add", "."]);
    run(&repo, &["commit", "-qm", "mine"]);
    std::fs::write(repo.join("a.txt"), "one\n").unwrap();
    run(
        &repo,
        &[
            "commit",
            "-qam",
            "someone else's",
            "--author",
            "Other <other@example.com>",
        ],
    );
    let copy = dir.path().join("copy");
    run(
        dir.path(),
        &[
            "clone",
            "-q",
            repo.to_str().unwrap(),
            copy.to_str().unwrap(),
        ],
    );
    run(&copy, &["config", "user.email", "me@example.com"]);

    let now = Local::now();
    let commits = user_commits(
        &[repo, copy],
        now - Duration::days(1),
        now + Duration::days(1),
    );
    assert_eq!(commits.len(), 1);
    assert_eq!((commits[0].added, commits[0].removed), (3, 0));
}
