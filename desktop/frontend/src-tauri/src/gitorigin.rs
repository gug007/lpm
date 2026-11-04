// How far a project's branch on origin has moved past it: the counts behind the
// sidebar's "↓3" mark. A check can fetch first. That fetch is quiet and bounded,
// so a remote that wants a password or never answers costs one failed check
// instead of a hung one.
use crate::git::{git_command, git_default_branch, git_out, parse_ahead_behind};
use crate::weekly_recap_git::origin_key;
use serde::Serialize;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const FETCH_TIMEOUT: Duration = Duration::from_secs(30);
const FETCH_POLL: Duration = Duration::from_millis(100);

#[derive(Serialize, Default, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OriginStatus {
    pub branch: String,
    pub has_upstream: bool,
    pub ahead: i64,
    pub behind: i64,
    /// For a branch with no upstream: the default branch it's measured against,
    /// and how many commits origin has on it that this branch doesn't.
    pub base: String,
    pub base_behind: i64,
    pub conflicted: bool,
    /// Tracked files with uncommitted changes, which can stop a pull or merge.
    /// Only counted while origin has something new.
    pub changes: i64,
    /// Whether a requested fetch landed. When it didn't, the counts are as old
    /// as the last fetch that did.
    pub fetched: bool,
    /// Which repository and branch the upstream is, the same for every copy of
    /// it on any machine, and the commit it was at when last fetched or pushed.
    /// When the commit moves here, the other copies are behind too.
    pub upstream_key: String,
    pub upstream_sha: String,
}

#[tauri::command(async)]
pub fn git_origin_status(cwd: String, fetch: bool) -> OriginStatus {
    let mut st = origin_counts(cwd.clone(), fetch);
    if st.behind > 0 || st.base_behind > 0 {
        st.changes = uncommitted_files(&cwd);
    }
    st
}

fn uncommitted_files(cwd: &str) -> i64 {
    git_out(
        cwd,
        &[
            "--no-optional-locks",
            "status",
            "--porcelain=v1",
            "--untracked-files=no",
        ],
    )
    .map(|out| out.lines().count() as i64)
    .unwrap_or(0)
}

fn origin_counts(cwd: String, fetch: bool) -> OriginStatus {
    let mut st = OriginStatus::default();
    // Detached HEADs and folders that aren't repos have nothing to compare.
    let Ok(head) = git_out(&cwd, &["symbolic-ref", "-q", "HEAD"]) else {
        return st;
    };
    if fetch {
        st.fetched = quiet_fetch(&cwd);
    }
    st.branch = head.trim_start_matches("refs/heads/").to_string();
    st.conflicted = git_out(&cwd, &["ls-files", "--unmerged"])
        .map(|out| !out.is_empty())
        .unwrap_or(false);

    let track = git_out(
        &cwd,
        &[
            "for-each-ref",
            "--format=%(upstream:short)%00%(upstream:track)%00%(upstream)%00%(upstream:remotename)%00%(upstream:remoteref)",
            &head,
        ],
    )
    .unwrap_or_default();
    let mut fields = track.split('\0');
    let mut field = || fields.next().unwrap_or("");
    let (upstream, tail, full, remote, remote_ref) = (field(), field(), field(), field(), field());
    if !upstream.is_empty() && tail != "[gone]" {
        st.has_upstream = true;
        (st.ahead, st.behind) = parse_ahead_behind(tail);
        st.upstream_key = upstream_key(&cwd, remote, remote_ref, fetch);
        if !st.upstream_key.is_empty() {
            st.upstream_sha =
                git_out(&cwd, &["rev-parse", "-q", "--verify", full]).unwrap_or_default();
        }
        return st;
    }

    let base = git_default_branch(cwd.clone());
    let remote_ref = format!("refs/remotes/origin/{base}");
    if git_out(&cwd, &["rev-parse", "-q", "--verify", &remote_ref]).is_ok() {
        st.base_behind = git_out(
            &cwd,
            &["rev-list", "--count", &format!("HEAD..{remote_ref}")],
        )
        .ok()
        .and_then(|n| n.parse().ok())
        .unwrap_or(0);
        st.base = base;
    }
    st
}

/// `<repository>#<branch ref on the remote>`, alike for every copy on any
/// computer, or empty when the remote has no URL (a branch tracking another
/// local branch, say).
fn upstream_key(cwd: &str, remote: &str, remote_ref: &str, refresh: bool) -> String {
    if remote.is_empty() || remote == "." || remote_ref.is_empty() {
        return String::new();
    }
    let repo = remote_repo(cwd, remote, refresh);
    if repo.is_empty() {
        return String::new();
    }
    format!("{repo}#{remote_ref}")
}

/// A remote's repository as `origin_key` names it. A remote's URL all but never
/// changes, so git is asked again only by a check that fetches.
fn remote_repo(cwd: &str, remote: &str, refresh: bool) -> String {
    static REPOS: OnceLock<Mutex<HashMap<(String, String), String>>> = OnceLock::new();
    let repos = REPOS.get_or_init(Mutex::default);
    let id = (cwd.to_string(), remote.to_string());
    if !refresh {
        if let Some(repo) = repos.lock().unwrap_or_else(|e| e.into_inner()).get(&id) {
            return repo.clone();
        }
    }
    let repo = git_out(cwd, &["remote", "get-url", remote])
        .ok()
        .filter(|url| !url.is_empty())
        .map(|url| origin_key(&url))
        .unwrap_or_default();
    repos
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(id, repo.clone());
    repo
}

/// `git fetch` that can't prompt and can't hang: no terminal or credential-manager
/// prompts, ssh in batch mode unless the repo picks its own ssh command, and the
/// whole process group killed if it runs past `FETCH_TIMEOUT`.
fn quiet_fetch(cwd: &str) -> bool {
    let mut envs = vec![("GIT_TERMINAL_PROMPT", "0"), ("GCM_INTERACTIVE", "never")];
    let own_ssh = std::env::var_os("GIT_SSH_COMMAND").is_some()
        || git_out(cwd, &["config", "core.sshCommand"]).is_ok();
    if !own_ssh {
        envs.push((
            "GIT_SSH_COMMAND",
            "ssh -o BatchMode=yes -o ConnectTimeout=10",
        ));
    }
    let mut cmd = git_command(cwd, &["fetch", "--quiet"], &envs);
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    let Ok(mut child) = cmd.spawn() else {
        return false;
    };
    let deadline = Instant::now() + FETCH_TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return status.success(),
            Ok(None) if Instant::now() < deadline => std::thread::sleep(FETCH_POLL),
            _ => break,
        }
    }
    #[cfg(unix)]
    unsafe {
        libc::kill(-(child.id() as i32), libc::SIGKILL);
    }
    // No process groups: end the ssh (or credential helper) git started too.
    #[cfg(windows)]
    crate::osproc::kill_tree(child.id());
    let _ = child.kill();
    let _ = child.wait();
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::git_out_env;
    use crate::gitworkstate::LPM_IDENTITY;
    use std::path::Path;

    const LPM_IDENTITY_CONFIG: [(&str, &str); 2] =
        [("user.name", "lpm"), ("user.email", "lpm@localhost")];

    fn commit(cwd: &str, file: &str, body: &str) {
        std::fs::write(Path::new(cwd).join(file), body).unwrap();
        git_out(cwd, &["add", "-A"]).unwrap();
        git_out_env(cwd, &["commit", "-q", "-m", file], &LPM_IDENTITY).unwrap();
    }

    /// A bare origin, a clone that is checked for news, and a second clone that
    /// pushes that news.
    fn setup() -> (tempfile::TempDir, String, String) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().to_string();
        let origin = format!("{root}/origin.git");
        let (mine, theirs) = (format!("{root}/mine"), format!("{root}/theirs"));
        git_out(&root, &["init", "-q", "--bare", "-b", "main", &origin]).unwrap();
        git_out(&root, &["clone", "-q", &origin, &theirs]).unwrap();
        commit(&theirs, "a.txt", "one\n");
        git_out(&theirs, &["push", "-q", "origin", "main"]).unwrap();
        git_out(&root, &["clone", "-q", &origin, &mine]).unwrap();
        (dir, mine, theirs)
    }

    fn push_news(theirs: &str, files: &[&str]) {
        for f in files {
            commit(theirs, f, "news\n");
        }
        git_out(theirs, &["push", "-q", "origin", "main"]).unwrap();
    }

    #[test]
    fn a_fetch_reveals_commits_pushed_elsewhere() {
        let (_d, mine, theirs) = setup();
        push_news(&theirs, &["b.txt", "c.txt"]);

        let before = git_origin_status(mine.clone(), false);
        assert_eq!((before.has_upstream, before.behind), (true, 0));

        let after = git_origin_status(mine, true);
        assert!(after.fetched);
        assert_eq!(
            (after.branch.as_str(), after.ahead, after.behind),
            ("main", 0, 2)
        );
    }

    #[test]
    fn copies_of_one_repo_share_a_key_and_see_their_push_move_its_commit() {
        let (d, mine, _theirs) = setup();
        let copy = d.path().join("copy").to_string_lossy().to_string();
        let origin = d.path().join("origin.git").to_string_lossy().to_string();
        git_out(
            &d.path().to_string_lossy(),
            &["clone", "-q", &origin, &copy],
        )
        .unwrap();

        let before = git_origin_status(mine.clone(), false);
        assert!(before.upstream_key.ends_with("#refs/heads/main"));
        assert_eq!(
            git_origin_status(copy.clone(), false).upstream_key,
            before.upstream_key
        );
        assert_eq!(
            git_origin_status(copy.clone(), false).upstream_sha,
            before.upstream_sha
        );

        commit(&copy, "b.txt", "news\n");
        git_out(&copy, &["push", "-q"]).unwrap();
        let pushed = git_origin_status(copy, false).upstream_sha;
        assert_ne!(pushed, before.upstream_sha);
        assert_eq!(
            git_origin_status(mine.clone(), false).upstream_sha,
            before.upstream_sha
        );
        assert_eq!(git_origin_status(mine, true).upstream_sha, pushed);
    }

    #[test]
    fn a_new_remote_url_is_picked_up_by_the_next_fetch() {
        let (d, mine, _theirs) = setup();
        let before = git_origin_status(mine.clone(), false).upstream_key;
        let moved = d.path().join("moved.git").to_string_lossy().to_string();
        git_out(&mine, &["remote", "set-url", "origin", &moved]).unwrap();
        assert_eq!(git_origin_status(mine.clone(), false).upstream_key, before);
        let after = git_origin_status(mine, true).upstream_key;
        assert!(after.contains("moved"), "{after}");
    }

    #[test]
    fn a_branch_without_upstream_has_no_key() {
        let (_d, mine, _theirs) = setup();
        git_out(&mine, &["switch", "-q", "-c", "feature"]).unwrap();
        let st = git_origin_status(mine, false);
        assert_eq!(
            (st.upstream_key.as_str(), st.upstream_sha.as_str()),
            ("", "")
        );
    }

    #[test]
    fn local_commits_on_top_of_news_count_both_ways() {
        let (_d, mine, theirs) = setup();
        push_news(&theirs, &["b.txt"]);
        commit(&mine, "mine.txt", "local\n");
        let st = git_origin_status(mine, true);
        assert_eq!((st.ahead, st.behind), (1, 1));
    }

    // The sidebar's Sync on a branch that is both ahead and behind, with the
    // default "Pull (ff if possible)" strategy and no pull.rebase in any config.
    #[test]
    fn the_default_pull_merges_a_branch_that_is_also_ahead() {
        let (_d, mine, theirs) = setup();
        for (key, value) in LPM_IDENTITY_CONFIG {
            git_out(&mine, &["config", key, value]).unwrap();
        }
        git_out(&mine, &["config", "--unset-all", "pull.rebase"]).ok();
        push_news(&theirs, &["b.txt"]);
        commit(&mine, "mine.txt", "local\n");
        git_origin_status(mine.clone(), true);

        crate::git::pull_branch(mine.clone(), "ff".into(), vec![]).unwrap();
        let st = git_origin_status(mine, false);
        assert_eq!((st.ahead, st.behind), (2, 0));
    }

    #[test]
    fn edits_to_tracked_files_are_counted_once_origin_has_news() {
        let (_d, mine, theirs) = setup();
        std::fs::write(Path::new(&mine).join("a.txt"), "edited\n").unwrap();
        std::fs::write(Path::new(&mine).join("scratch.txt"), "untracked\n").unwrap();
        assert_eq!(git_origin_status(mine.clone(), false).changes, 0);

        push_news(&theirs, &["b.txt"]);
        let st = git_origin_status(mine, true);
        assert_eq!((st.behind, st.changes), (1, 1));
    }

    #[test]
    fn a_branch_without_upstream_is_measured_against_origins_default() {
        let (_d, mine, theirs) = setup();
        git_out(&mine, &["switch", "-q", "-c", "feature"]).unwrap();
        commit(&mine, "f.txt", "feature\n");
        push_news(&theirs, &["b.txt", "c.txt", "d.txt"]);

        let st = git_origin_status(mine, true);
        assert!(!st.has_upstream);
        assert_eq!((st.base.as_str(), st.base_behind), ("main", 3));
    }

    #[test]
    fn a_detached_head_or_plain_folder_reports_nothing() {
        let (d, mine, _theirs) = setup();
        git_out(&mine, &["switch", "-q", "--detach"]).unwrap();
        assert_eq!(git_origin_status(mine, true), OriginStatus::default());

        let plain = d.path().join("plain");
        std::fs::create_dir(&plain).unwrap();
        let st = git_origin_status(plain.to_string_lossy().to_string(), true);
        assert_eq!(st, OriginStatus::default());
    }

    #[test]
    fn an_unreachable_origin_fails_the_fetch_without_hanging() {
        let (d, mine, _theirs) = setup();
        let gone = d.path().join("nowhere.git").to_string_lossy().to_string();
        git_out(&mine, &["remote", "set-url", "origin", &gone]).unwrap();
        let st = git_origin_status(mine, true);
        assert!(!st.fetched);
        assert!(st.has_upstream);
    }
}
