// How far a project's branch on origin has moved past it: the counts behind the
// sidebar's "↓3" mark. A check can fetch first. That fetch is quiet and bounded,
// so a remote that wants a password or never answers costs one failed check
// instead of a hung one.
use crate::git::{git_command, git_default_branch, git_out, parse_ahead_behind};
use serde::Serialize;
use std::process::Stdio;
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
    /// Whether a requested fetch landed. When it didn't, the counts are as old
    /// as the last fetch that did.
    pub fetched: bool,
}

#[tauri::command(async)]
pub fn git_origin_status(cwd: String, fetch: bool) -> OriginStatus {
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
            "--format=%(upstream:short)%00%(upstream:track)",
            &head,
        ],
    )
    .unwrap_or_default();
    let (upstream, tail) = track.split_once('\0').unwrap_or(("", ""));
    if !upstream.is_empty() && tail != "[gone]" {
        st.has_upstream = true;
        (st.ahead, st.behind) = parse_ahead_behind(tail);
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
