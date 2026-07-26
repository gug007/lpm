// One cycle of a follow: ask the other Mac what it holds, and land it if that is
// not what we already have.
//
// The cheap half is the fingerprint — head plus working-state tree, no pack, no
// commit — which is all it takes to answer "has anything changed over there?".
// Only a real difference reaches the transfer, which is the same code path the
// first sync drives, told that it may replace the state its own last run landed.
use crate::gitbring::{Follow as FollowContext, Request};
use crate::gitfollowstore::{self as store, Follow};
use crate::peerclient::{PeerClientHub, PEER_NOT_CONNECTED, PEER_REQUEST_TIMED_OUT};
use serde_json::{json, Value};
use std::time::Duration;
use tauri::AppHandle;

const STATE_TIMEOUT: Duration = Duration::from_secs(30);

pub(crate) enum Outcome {
    /// The other Mac holds exactly what the last run landed.
    Unchanged,
    Synced,
    /// Reachability, not refusal — worth retrying on a backoff. The reason is kept
    /// on the record so a follow that has gone quiet can say why.
    Retry,
    /// Needs the user: their own work is in the way, or the landing refused for a
    /// reason another attempt would hit identically.
    Paused(String),
}

/// Run one cycle. `on_transfer` fires once it is clear that bytes will actually
/// move, which is the only point worth telling the UI about — most cycles find
/// nothing to do and must stay invisible.
pub(crate) fn sync(
    app: &AppHandle,
    hub: &PeerClientHub,
    follow: &Follow,
    discard_local: bool,
    on_transfer: &dyn Fn(),
) -> Outcome {
    let remote = match fingerprint(hub, follow) {
        Ok(state) => state,
        Err(e) => return classify(follow, e),
    };
    if remote.matches(follow) {
        return Outcome::Unchanged;
    }
    // Serialised against a first-time setup of the same project: two checkouts in
    // one folder would interleave into a state neither asked for.
    let Some(_lock) = crate::gitbring::lock_landing(&follow.project) else {
        return Outcome::Retry;
    };
    on_transfer();
    match transfer(app, hub, follow, discard_local) {
        Ok(()) => Outcome::Synced,
        Err(e) => classify(follow, e),
    }
}

struct RemoteState {
    head: String,
    tree: String,
}

impl RemoteState {
    /// Both ids have to match: a commit on the other Mac moves the head, editing a
    /// file moves only the tree, and amending moves both.
    fn matches(&self, follow: &Follow) -> bool {
        follow.last_head.as_deref() == Some(self.head.as_str())
            && follow.last_tree.as_deref() == Some(self.tree.as_str())
    }
}

fn fingerprint(hub: &PeerClientHub, follow: &Follow) -> Result<RemoteState, String> {
    let reply = hub.bring_request(
        &follow.slug,
        STATE_TIMEOUT,
        json!({ "t": "gitBringState", "cwd": follow.source_root }),
    )?;
    let head = string_of(&reply, "head");
    let tree = string_of(&reply, "tree");
    if head.is_empty() || tree.is_empty() {
        return Err("the other Mac did not report what it holds".into());
    }
    Ok(RemoteState { head, tree })
}

fn transfer(
    app: &AppHandle,
    hub: &PeerClientHub,
    follow: &Follow,
    discard_local: bool,
) -> Result<(), String> {
    let root = crate::gitbring::local_root(&follow.project)?;
    let req = Request {
        source_slug: follow.slug.clone(),
        source_root: follow.source_root.clone(),
        project: follow.project.clone(),
        follow: Some(FollowContext {
            previous_head: follow.last_head.clone(),
            discard_local,
        }),
    };
    let id = uuid::Uuid::new_v4().to_string();
    let done = crate::gitbringrun::run(app, hub, &req, &id, &root)?;
    record_landed(follow, &root, &done);
    Ok(())
}

/// What landed becomes the baseline for the next cycle. The tree is read back from
/// the folder rather than taken from the reply: it is then the same measurement
/// the next comparison makes, and it is the state the safety check will have to
/// recognise before anything is overwritten again.
fn record_landed(follow: &Follow, root: &str, done: &crate::gitbring::Done) {
    let head = done.head.clone();
    let tree = head
        .as_deref()
        .and_then(|h| crate::gitworkstate::working_state_tree(root, h).ok());
    let branch = done.branch.clone();
    let files = done.changed.unwrap_or(0);
    let _ = store::update(&follow.project, |f| {
        f.last_head = head;
        f.last_tree = tree;
        f.last_branch = branch;
        f.files = files;
        f.last_synced_at = crate::status::now_millis();
        f.clear_pause();
        f.last_error = None;
    });
}

fn classify(follow: &Follow, error: String) -> Outcome {
    if is_transient(&error) {
        let recorded = error.clone();
        let _ = store::update(&follow.project, |f| f.last_error = Some(recorded));
        return Outcome::Retry;
    }
    let recorded = error.clone();
    let _ = store::update(&follow.project, |f| {
        f.pause(recorded, false);
        f.last_error = None;
    });
    Outcome::Paused(error)
}

/// Reachability and one-shot transport faults come back on the next cycle. A
/// refusal from the landing — the user's own work, a branch carrying their
/// commits, an ignored file in the way — will refuse identically until they act,
/// so it pauses instead of retrying every few seconds.
fn is_transient(error: &str) -> bool {
    const RETRYABLE: [&str; 4] = [
        "that transfer expired",
        "damaged transfer",
        "stopped sending the changes",
        "did not report what it holds",
    ];
    error == PEER_NOT_CONNECTED
        || error == PEER_REQUEST_TIMED_OUT
        || RETRYABLE.iter().any(|r| error.contains(r))
}

fn string_of(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::{git_out, git_out_env};
    use crate::gitbringapply::{apply_state, Landing};
    use crate::gitworkstate::{head_sha, holds_only_state, working_state_tree};

    const ANCHOR: &str = "refs/lpm/from-test";
    const IDENTITY: [(&str, &str); 4] = [
        ("GIT_AUTHOR_NAME", "lpm"),
        ("GIT_AUTHOR_EMAIL", "lpm@localhost"),
        ("GIT_COMMITTER_NAME", "lpm"),
        ("GIT_COMMITTER_EMAIL", "lpm@localhost"),
    ];

    fn sender_repo() -> (tempfile::TempDir, String) {
        let dir = tempfile::tempdir().unwrap();
        let cwd = dir.path().to_string_lossy().to_string();
        git_out(&cwd, &["init", "-q", "-b", "main"]).unwrap();
        std::fs::write(dir.path().join(".gitignore"), "local.env\n").unwrap();
        std::fs::write(dir.path().join("a.txt"), "one\n").unwrap();
        git_out(&cwd, &["add", "-A"]).unwrap();
        git_out_env(&cwd, &["commit", "-q", "-m", "first"], &IDENTITY).unwrap();
        (dir, cwd)
    }

    /// What the sending Mac does: capture the working state as a commit on HEAD.
    fn snapshot(cwd: &str) -> String {
        let head = head_sha(cwd).unwrap();
        let tree = working_state_tree(cwd, &head).unwrap();
        git_out_env(
            cwd,
            &["commit-tree", &tree, "-p", &head, "-m", "lpm: working state"],
            &IDENTITY,
        )
        .unwrap()
    }

    /// What a run does before landing: bring the objects over and anchor them. The
    /// real path streams a packfile; a local fetch installs the same objects.
    fn deliver(receiver: &str, sender: &str, sha: &str) {
        git_out(
            receiver,
            &["fetch", "--no-tags", sender, &format!("+{sha}:{ANCHOR}")],
        )
        .unwrap();
    }

    /// Two runs of one follow, which is the case a manual bring never reaches: the
    /// second arrives with the first's uncommitted state still spread across the
    /// working tree.
    #[test]
    fn a_second_run_replaces_the_first_runs_state_and_keeps_ignored_files() {
        let (sender_dir, sender) = sender_repo();
        let receiver_dir = tempfile::tempdir().unwrap();
        let receiver = receiver_dir.path().join("work").to_string_lossy().to_string();
        git_out(
            &receiver_dir.path().to_string_lossy(),
            &["clone", "-q", &sender, &receiver],
        )
        .unwrap();
        // Local-only build output: it must survive every sync.
        std::fs::write(receiver_dir.path().join("work/local.env"), "MY SECRET\n").unwrap();

        std::fs::write(sender_dir.path().join("a.txt"), "v1\n").unwrap();
        std::fs::write(sender_dir.path().join("only-in-v1.txt"), "gone later\n").unwrap();
        let head1 = head_sha(&sender).unwrap();
        let target1 = snapshot(&sender);
        deliver(&receiver, &sender, &target1);
        apply_state(&Landing::new(&receiver, "lpm/main", &target1, &head1, true)).unwrap();

        let at = |p: &str| receiver_dir.path().join("work").join(p);
        assert_eq!(std::fs::read_to_string(at("a.txt")).unwrap(), "v1\n");
        assert!(at("only-in-v1.txt").exists());
        // The landed state is uncommitted, so the folder is dirty — and that dirt
        // is recognisably ours, which is what licenses the next run.
        assert!(crate::gitbringapply::is_dirty(&receiver));
        assert!(holds_only_state(&receiver, ANCHOR));

        // The other Mac keeps working: one file changes, one goes away, one appears.
        std::fs::write(sender_dir.path().join("a.txt"), "v2\n").unwrap();
        std::fs::remove_file(sender_dir.path().join("only-in-v1.txt")).unwrap();
        std::fs::write(sender_dir.path().join("only-in-v2.txt"), "new\n").unwrap();
        let head2 = head_sha(&sender).unwrap();
        let target2 = snapshot(&sender);
        deliver(&receiver, &sender, &target2);
        apply_state(
            &Landing::new(&receiver, "lpm/main", &target2, &head2, true).replacing(Some(&head1)),
        )
        .unwrap();

        assert_eq!(std::fs::read_to_string(at("a.txt")).unwrap(), "v2\n");
        assert!(at("only-in-v2.txt").exists());
        assert!(
            !at("only-in-v1.txt").exists(),
            "a file the previous run left behind is gone"
        );
        assert_eq!(
            std::fs::read_to_string(at("local.env")).unwrap(),
            "MY SECRET\n",
            "an ignored file is never touched"
        );
        assert_eq!(
            git_out(&receiver, &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap(),
            "lpm/main"
        );
        assert_eq!(git_out(&receiver, &["rev-parse", "HEAD"]).unwrap(), head2);
        assert!(holds_only_state(&receiver, ANCHOR));
    }

    /// The whole point of the guard: work the user did in the followed folder is
    /// theirs, and a run must be able to tell.
    #[test]
    fn a_users_own_edit_in_the_followed_folder_is_not_ours_to_replace() {
        let (sender_dir, sender) = sender_repo();
        let receiver_dir = tempfile::tempdir().unwrap();
        let receiver = receiver_dir.path().join("work").to_string_lossy().to_string();
        git_out(
            &receiver_dir.path().to_string_lossy(),
            &["clone", "-q", &sender, &receiver],
        )
        .unwrap();

        std::fs::write(sender_dir.path().join("a.txt"), "theirs\n").unwrap();
        let head = head_sha(&sender).unwrap();
        let target = snapshot(&sender);
        deliver(&receiver, &sender, &target);
        apply_state(&Landing::new(&receiver, "lpm/main", &target, &head, true)).unwrap();
        assert!(holds_only_state(&receiver, ANCHOR));

        std::fs::write(receiver_dir.path().join("work/mine.txt"), "my work\n").unwrap();
        assert!(
            !holds_only_state(&receiver, ANCHOR),
            "one untracked file of the user's stops the next run"
        );
    }

    /// An amend or rebase on the other Mac moves its branch off the ancestor line.
    /// That is not the user losing commits, so it must keep flowing.
    #[test]
    fn a_rewritten_remote_branch_still_lands_when_the_tip_is_ours() {
        let (sender_dir, sender) = sender_repo();
        let receiver_dir = tempfile::tempdir().unwrap();
        let receiver = receiver_dir.path().join("work").to_string_lossy().to_string();
        git_out(
            &receiver_dir.path().to_string_lossy(),
            &["clone", "-q", &sender, &receiver],
        )
        .unwrap();

        std::fs::write(sender_dir.path().join("b.txt"), "work\n").unwrap();
        git_out(&sender, &["add", "-A"]).unwrap();
        git_out_env(&sender, &["commit", "-q", "-m", "second"], &IDENTITY).unwrap();
        let head1 = head_sha(&sender).unwrap();
        deliver(&receiver, &sender, &head1);
        apply_state(&Landing::new(&receiver, "lpm/main", &head1, &head1, false)).unwrap();

        std::fs::write(sender_dir.path().join("b.txt"), "reworked\n").unwrap();
        git_out(&sender, &["add", "-A"]).unwrap();
        git_out_env(&sender, &["commit", "-q", "--amend", "-m", "second, again"], &IDENTITY)
            .unwrap();
        let head2 = head_sha(&sender).unwrap();
        deliver(&receiver, &sender, &head2);

        let landing = Landing::new(&receiver, "lpm/main", &head2, &head2, false);
        assert!(
            apply_state(&landing.replacing(Some(&head1))).is_ok(),
            "the branch tip is exactly what the last run left"
        );
        assert_eq!(git_out(&receiver, &["rev-parse", "HEAD"]).unwrap(), head2);

        // But a commit of the user's own on that branch still stops it.
        std::fs::write(receiver_dir.path().join("work/mine.txt"), "my work\n").unwrap();
        git_out(&receiver, &["add", "-A"]).unwrap();
        git_out_env(&receiver, &["commit", "-q", "-m", "mine"], &IDENTITY).unwrap();
        let mine = head_sha(&receiver).unwrap();
        let err = apply_state(
            &Landing::new(&receiver, "lpm/main", &head1, &head1, false).replacing(Some(&head2)),
        )
        .unwrap_err();
        assert!(err.contains("commits of its own"), "{err}");
        assert_eq!(head_sha(&receiver).unwrap(), mine);
    }

    fn follow_at(head: &str, tree: &str) -> Follow {
        let mut f = Follow::new("web".into(), "a0af5f07".into(), "/Users/dev/web".into());
        f.last_head = Some(head.into());
        f.last_tree = Some(tree.into());
        f
    }

    fn state(head: &str, tree: &str) -> RemoteState {
        RemoteState {
            head: head.into(),
            tree: tree.into(),
        }
    }

    #[test]
    fn an_unchanged_mac_matches_the_recorded_baseline() {
        assert!(state("h1", "t1").matches(&follow_at("h1", "t1")));
    }

    #[test]
    fn a_commit_an_edit_or_an_amend_all_read_as_changed() {
        let base = follow_at("h1", "t1");
        assert!(!state("h2", "t1").matches(&base), "a commit moved the head");
        assert!(!state("h1", "t2").matches(&base), "an edit moved the tree");
        assert!(!state("h2", "t2").matches(&base), "an amend moved both");
    }

    #[test]
    fn a_follow_with_no_baseline_never_matches() {
        let fresh = Follow::new("web".into(), "a0af5f07".into(), "/Users/dev/web".into());
        assert!(!state("h1", "t1").matches(&fresh));
    }

    #[test]
    fn reachability_faults_retry_and_refusals_pause() {
        assert!(is_transient(PEER_NOT_CONNECTED));
        assert!(is_transient(PEER_REQUEST_TIMED_OUT));
        assert!(is_transient("that transfer expired — start it again"));
        assert!(is_transient("damaged transfer: bad base64"));

        assert!(!is_transient(
            "web has changes that didn't come from the other Mac — they were left untouched"
        ));
        assert!(!is_transient(
            "lpm/main already has commits of its own here — rename or delete it first"
        ));
        assert!(!is_transient(
            "these ignored files would be overwritten: app.env — move them aside first"
        ));
        assert!(!is_transient("that folder is not a project on the other Mac"));
    }
}
