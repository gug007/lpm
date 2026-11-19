use super::*;
use crate::git::{git_out, git_out_env};
use crate::gitbringhost as packing;
use crate::gitworkstate::LPM_IDENTITY;
use serde_json::json;
use std::path::Path;

struct Pair {
    _dirs: (tempfile::TempDir, tempfile::TempDir),
    here: String,
    there: String,
}

fn commit(cwd: &str, msg: &str) {
    git_out(cwd, &["add", "-A"]).unwrap();
    git_out_env(cwd, &["commit", "-q", "-m", msg], &LPM_IDENTITY.to_vec()).unwrap();
}

fn write(root: &str, file: &str, text: &str) {
    std::fs::write(Path::new(root).join(file), text).unwrap();
}

fn read(root: &str, file: &str) -> Option<String> {
    std::fs::read_to_string(Path::new(root).join(file)).ok()
}

/// The same project on two computers: one repository and a clone of it, both
/// on `main` at the same commit.
fn pair() -> Pair {
    let (a, b) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
    let here = a.path().to_string_lossy().to_string();
    let there = b.path().join("work").to_string_lossy().to_string();
    git_out(&here, &["init", "-q", "-b", "main"]).unwrap();
    git_out(&here, &["config", "core.autocrlf", "false"]).unwrap();
    write(&here, ".gitignore", "secret.env\n");
    write(&here, "a.txt", "one\n");
    commit(&here, "shared");
    git_out(
        &here,
        &[
            "clone",
            "--no-hardlinks",
            "-q",
            "-c",
            "core.autocrlf=false",
            &here,
            &there,
        ],
    )
    .unwrap();
    Pair {
        _dirs: (a, b),
        here,
        there,
    }
}

/// Everything a handoff does to the two folders, without the connection that
/// carries the bytes between them.
fn hand(from: &str, to: &str) -> Result<String, String> {
    let head = git_out(from, &["rev-parse", "HEAD"]).unwrap();
    let snapshot = packing::snapshot(from, &head).unwrap().sha;
    let branch = packing::branch_of(from);
    let handed = Handed {
        head: &head,
        snapshot: snapshot.as_deref(),
        branch: branch.as_deref(),
    };
    let target = handed.target().to_string();
    let haves = packing::filter_haves(from, Some(&json!(ga::have_list(to))));
    let pack = packing::pack(from, &target, &haves).unwrap();
    let landed = land(to, to, Some(&pack), &handed);
    let _ = std::fs::remove_file(&pack);
    if landed.is_ok() {
        anchor(from, &target).unwrap();
    }
    landed
}

fn unstaged(root: &str) -> Vec<String> {
    let listings: [&[&str]; 2] = [
        &["diff", "--name-only"],
        &["ls-files", "--others", "--exclude-standard"],
    ];
    let mut names: Vec<String> = listings
        .iter()
        .flat_map(|args| {
            git_out(root, args)
                .unwrap()
                .lines()
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .filter(|l| !l.is_empty())
        .collect();
    names.sort();
    names
}

#[test]
fn the_session_work_lands_on_its_own_branch_with_uncommitted_changes_unstaged() {
    let p = pair();
    git_out(&p.here, &["switch", "-q", "-c", "feat/billing"]).unwrap();
    write(&p.here, "b.txt", "committed here\n");
    commit(&p.here, "only here");
    write(&p.here, "a.txt", "edited\n");
    write(&p.here, "new.txt", "fresh\n");
    write(&p.here, "secret.env", "TOKEN=1\n");

    assert_eq!(hand(&p.here, &p.there).unwrap(), "feat/billing");

    let head = git_out(&p.here, &["rev-parse", "HEAD"]).unwrap();
    assert_eq!(git_out(&p.there, &["rev-parse", "HEAD"]).unwrap(), head);
    assert_eq!(
        git_out(&p.there, &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap(),
        "feat/billing"
    );
    assert_eq!(read(&p.there, "b.txt").unwrap(), "committed here\n");
    assert_eq!(read(&p.there, "a.txt").unwrap(), "edited\n");
    assert_eq!(read(&p.there, "new.txt").unwrap(), "fresh\n");
    assert_eq!(
        read(&p.there, "secret.env"),
        None,
        "ignored files stay home"
    );
    assert_eq!(unstaged(&p.there), ["a.txt", "new.txt"]);
    assert!(git_out(&p.there, &["diff", "--cached", "--name-only"])
        .unwrap()
        .is_empty());
}

#[test]
fn a_folder_with_changes_of_its_own_is_refused_and_left_alone() {
    let p = pair();
    write(&p.here, "a.txt", "from here\n");
    write(&p.there, "a.txt", "theirs, uncommitted\n");

    let err = hand(&p.here, &p.there).unwrap_err();

    assert!(err.contains("uncommitted changes of its own"), "{err}");
    assert_eq!(read(&p.there, "a.txt").unwrap(), "theirs, uncommitted\n");
}

#[test]
fn a_session_comes_back_over_the_state_it_left_behind() {
    let p = pair();
    write(&p.here, "a.txt", "started here\n");
    write(&p.here, "scratch.txt", "left behind\n");
    hand(&p.here, &p.there).unwrap();

    // The agent carries on over there: a commit, a new edit, a file removed.
    commit(&p.there, "done there");
    write(&p.there, "a.txt", "finished there\n");
    std::fs::remove_file(Path::new(&p.there).join("scratch.txt")).unwrap();

    assert!(
        ga::is_dirty(&p.here),
        "what was sent is still in the folder"
    );
    assert_eq!(hand(&p.there, &p.here).unwrap(), "main");

    assert_eq!(
        git_out(&p.here, &["rev-parse", "HEAD"]).unwrap(),
        git_out(&p.there, &["rev-parse", "HEAD"]).unwrap()
    );
    assert_eq!(read(&p.here, "a.txt").unwrap(), "finished there\n");
    assert_eq!(read(&p.here, "scratch.txt"), None);
    assert_eq!(unstaged(&p.here), ["a.txt", "scratch.txt"]);
}

#[test]
fn an_edit_made_here_after_sending_blocks_taking_the_session_back() {
    let p = pair();
    write(&p.here, "a.txt", "started here\n");
    hand(&p.here, &p.there).unwrap();
    write(&p.there, "a.txt", "finished there\n");

    write(&p.here, "mine.txt", "typed while it was away\n");

    let err = hand(&p.there, &p.here).unwrap_err();
    assert!(err.contains("uncommitted changes of its own"), "{err}");
    assert_eq!(read(&p.here, "a.txt").unwrap(), "started here\n");
    assert_eq!(
        read(&p.here, "mine.txt").unwrap(),
        "typed while it was away\n"
    );
}

#[test]
fn a_branch_with_commits_the_incoming_work_lacks_is_not_moved() {
    let p = pair();
    write(&p.there, "theirs.txt", "committed there\n");
    commit(&p.there, "only there");
    let theirs = git_out(&p.there, &["rev-parse", "HEAD"]).unwrap();
    write(&p.here, "a.txt", "from here\n");
    commit(&p.here, "only here");

    let err = hand(&p.here, &p.there).unwrap_err();

    assert!(err.contains("main has commits in"), "{err}");
    assert_eq!(git_out(&p.there, &["rev-parse", "HEAD"]).unwrap(), theirs);
}

#[test]
fn a_detached_head_lands_on_a_branch_named_for_the_handoff() {
    let p = pair();
    git_out(&p.here, &["checkout", "-q", "--detach"]).unwrap();
    write(&p.here, "a.txt", "detached\n");

    assert_eq!(hand(&p.here, &p.there).unwrap(), "lpm/handoff");
}

#[test]
fn a_conversation_is_installed_unless_a_longer_one_is_already_there() {
    let dir = tempfile::tempdir().unwrap();
    let incoming = dir.path().join("incoming");
    let dest = dir.path().join("projects").join("-work").join("abc.jsonl");
    std::fs::write(&incoming, "one\ntwo\n").unwrap();

    install_at(&dest, &incoming).unwrap();
    assert_eq!(std::fs::read_to_string(&dest).unwrap(), "one\ntwo\n");

    std::fs::write(&dest, "one\ntwo\nthree\n").unwrap();
    install_at(&dest, &incoming).unwrap();
    assert_eq!(std::fs::read_to_string(&dest).unwrap(), "one\ntwo\nthree\n");

    std::fs::write(&incoming, "one\ntwo\nthree\nfour\n").unwrap();
    install_at(&dest, &incoming).unwrap();
    assert_eq!(
        std::fs::read_to_string(&dest).unwrap(),
        "one\ntwo\nthree\nfour\n"
    );
}
