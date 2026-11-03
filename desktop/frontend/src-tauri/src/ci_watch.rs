// Telling you when CI fails on a commit you pushed from this computer, whatever
// pushed it: a terminal, an agent or a button. A push writes "update by push"
// to the reflog of the remote branch it moved, which is read here every
// minute, and each push is then followed on GitHub until its checks finish. A
// failure, and the push that makes that branch pass again, is a toast, a banner
// when nobody is at the app, and a notification on the phones. A connected
// computer's shows here too.
use crate::ci_checks::{commit_checks, short_sha, CommitChecksInfo};
use crate::notifychannels::NotificationEvent;
use crate::pull_request::PrCheck;
use crate::statusnotify::{notify, should_notify};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

pub(crate) const RESULT_EVENT: &str = "ci-result";
// A connected computer's, under a name of its own: forwarding it on as this
// machine's own would bounce it between two computers paired both ways.
const PEER_RESULT_EVENT: &str = "peer-ci-result";

const SCAN_EVERY: Duration = Duration::from_secs(60);
const PROJECTS_EVERY: Duration = Duration::from_secs(5 * 60);
const POLL_EVERY: Duration = Duration::from_secs(45);
/// GitHub takes a moment to queue a push's workflows; read sooner, the quick
/// checks can look like all of them.
const SETTLE: Duration = Duration::from_secs(60);
/// A push nothing runs for (a docs-only change) stops being followed after this;
/// sooner in a repository whose last followed push ran nothing either.
const NO_CHECKS: Duration = Duration::from_secs(10 * 60);
const NO_CHECKS_AGAIN: Duration = Duration::from_secs(2 * 60);
const GIVE_UP: Duration = Duration::from_secs(3 * 60 * 60);
const MAX_ERRORS: u32 = 3;
const PUSH_MESSAGE: &str = "update by push";

pub fn start(app: AppHandle) {
    let _ = std::thread::Builder::new()
        .name("ci-watch".into())
        .spawn(move || {
            let mut watcher = CiWatch::default();
            loop {
                std::thread::sleep(watcher.sleep_from(Instant::now()));
                watcher.tick(&app, Instant::now());
            }
        });
}

/// The commits a reflog's new lines say a push moved the ref to.
fn pushed_commits(lines: &str) -> Vec<String> {
    lines
        .lines()
        .filter_map(|line| {
            let (head, message) = line.split_once('\t')?;
            if message.trim() != PUSH_MESSAGE {
                return None;
            }
            let to = head.split(' ').nth(1)?;
            (to.len() >= 7 && to.bytes().any(|b| b != b'0')).then(|| to.to_string())
        })
        .collect()
}

fn reflog_files(dir: &Path, depth: usize, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        match entry.file_type() {
            Ok(t) if t.is_dir() && depth > 0 => reflog_files(&path, depth - 1, out),
            Ok(t) if t.is_file() => out.push(path),
            _ => {}
        }
    }
}

fn read_from(path: &Path, offset: u64) -> String {
    let mut text = String::new();
    if let Ok(mut file) = std::fs::File::open(path) {
        if file.seek(SeekFrom::Start(offset)).is_ok() {
            let mut bytes = Vec::new();
            if file.read_to_end(&mut bytes).is_ok() {
                text = String::from_utf8_lossy(&bytes).into_owned();
            }
        }
    }
    text
}

/// Each remote branch's reflog length when last read, per repository. A
/// repository read for the first time is only measured, so pushes from before
/// lpm was running say nothing.
#[derive(Default)]
struct PushLogs {
    repos: HashMap<PathBuf, HashMap<PathBuf, u64>>,
}

impl PushLogs {
    /// The branches pushed since the last read, each with the commit it went to.
    fn scan(&mut self, repo: &Path) -> Vec<(String, String)> {
        let logs = repo.join("logs").join("refs").join("remotes");
        let mut files = Vec::new();
        reflog_files(&logs, 8, &mut files);
        let first = !self.repos.contains_key(repo);
        let seen = self.repos.entry(repo.to_path_buf()).or_default();
        let mut pushes = Vec::new();
        for file in files {
            let Ok(len) = std::fs::metadata(&file).map(|m| m.len()) else {
                continue;
            };
            let before = seen.insert(file.clone(), len);
            if first {
                continue;
            }
            let from = before.unwrap_or(0);
            if len <= from {
                continue;
            }
            let Some(sha) = pushed_commits(&read_from(&file, from)).pop() else {
                continue;
            };
            let Some(branch) = remote_branch(&logs, &file) else {
                continue;
            };
            pushes.push((branch, sha));
        }
        pushes
    }
}

/// `origin/feature/x`'s branch is `feature/x`.
fn remote_branch(logs: &Path, file: &Path) -> Option<String> {
    let rel = file.strip_prefix(logs).ok()?;
    let rel = rel.to_string_lossy().replace('\\', "/");
    let (_remote, branch) = rel.split_once('/')?;
    (!branch.is_empty()).then(|| branch.to_string())
}

/// A local project's checkout, for the repository it belongs to.
struct Checkout {
    project: String,
    root: String,
}

/// Every local project's repository, with the checkouts that share it: a
/// project and its worktrees log their pushes in one place.
fn local_repos() -> HashMap<PathBuf, Vec<Checkout>> {
    let mut repos: HashMap<PathBuf, Vec<Checkout>> = HashMap::new();
    let mut names = crate::config::project_names();
    names.sort();
    for project in names {
        let Ok((root, remote)) = crate::config::project_root(&project) else {
            continue;
        };
        if remote {
            continue;
        }
        let Some(repo) = crate::label_git::locate(&root) else {
            continue;
        };
        let common = std::fs::canonicalize(&repo.common_dir).unwrap_or(repo.common_dir);
        repos
            .entry(common)
            .or_default()
            .push(Checkout { project, root });
    }
    repos
}

/// The checkout a push of `branch` came from: the one on that branch, else the
/// repository's first project.
fn checkout_for<'a>(checkouts: &'a [Checkout], branch: &str) -> Option<&'a Checkout> {
    checkouts
        .iter()
        .find(|c| crate::label_git::read_branch(&c.root).as_deref() == Some(branch))
        .or_else(|| checkouts.first())
}

struct Watch {
    repo: PathBuf,
    project: String,
    cwd: String,
    branch: String,
    sha: String,
    since: Instant,
    next: Instant,
    errors: u32,
}

#[derive(Debug, PartialEq)]
enum Outcome {
    /// Nothing ran on the push yet.
    Nothing,
    Running,
    Failed,
    Passed,
}

/// Where a push's own checks stand: the ones that ran on its commit, not the
/// results carried over from earlier pushes.
fn outcome(checks: &[PrCheck]) -> Outcome {
    let own: Vec<&PrCheck> = checks
        .iter()
        .filter(|c| c.commit.is_none() && c.state != "skipped")
        .collect();
    if own.is_empty() {
        Outcome::Nothing
    } else if own.iter().any(|c| c.state == "pending") {
        Outcome::Running
    } else if own.iter().any(|c| c.state == "fail") {
        Outcome::Failed
    } else {
        Outcome::Passed
    }
}

#[derive(Default)]
struct CiWatch {
    logs: PushLogs,
    repos: HashMap<PathBuf, Vec<Checkout>>,
    repos_read: Option<Instant>,
    next_scan: Option<Instant>,
    watches: Vec<Watch>,
    /// Branches whose last followed push failed, so the push that makes one pass
    /// again can say so.
    failing: HashSet<(PathBuf, String)>,
    /// Repositories whose last followed push ran nothing.
    quiet: HashSet<PathBuf>,
}

impl CiWatch {
    fn tick(&mut self, app: &AppHandle, now: Instant) {
        if self.next_scan.is_none_or(|at| at <= now) {
            self.next_scan = Some(now + SCAN_EVERY);
            if crate::git::check_ghcli() {
                self.scan(now);
            }
        }
        self.poll(app, now);
    }

    fn sleep_from(&self, now: Instant) -> Duration {
        let next = self
            .watches
            .iter()
            .map(|w| w.next)
            .chain(self.next_scan)
            .min()
            .unwrap_or(now + SCAN_EVERY);
        next.saturating_duration_since(now)
            .max(Duration::from_secs(1))
    }

    fn scan(&mut self, now: Instant) {
        if self
            .repos_read
            .is_none_or(|at| now.duration_since(at) >= PROJECTS_EVERY)
        {
            self.repos = local_repos();
            self.repos_read = Some(now);
        }
        for (repo, checkouts) in &self.repos {
            for (branch, sha) in self.logs.scan(repo) {
                let Some(checkout) = checkout_for(checkouts, &branch) else {
                    continue;
                };
                self.watches
                    .retain(|w| !(w.repo == *repo && w.branch == branch));
                self.watches.push(Watch {
                    repo: repo.clone(),
                    project: checkout.project.clone(),
                    cwd: checkout.root.clone(),
                    branch,
                    sha,
                    since: now,
                    next: now + SETTLE,
                    errors: 0,
                });
            }
        }
    }

    fn poll(&mut self, app: &AppHandle, now: Instant) {
        let mut i = 0;
        while i < self.watches.len() {
            if self.watches[i].next > now {
                i += 1;
                continue;
            }
            if self.follow(app, i, now) {
                i += 1;
            } else {
                self.watches.remove(i);
            }
        }
    }

    /// Reads watch `i`'s checks; false once there's nothing more to wait for.
    fn follow(&mut self, app: &AppHandle, i: usize, now: Instant) -> bool {
        let w = &mut self.watches[i];
        w.next = now + POLL_EVERY;
        let age = now.duration_since(w.since);
        let info = match commit_checks(&w.cwd, &w.sha, &w.branch) {
            Ok(Some(info)) => info,
            Ok(None) => return false,
            Err(_) => {
                w.errors += 1;
                return w.errors < MAX_ERRORS;
            }
        };
        w.errors = 0;
        let outcome = outcome(&info.checks);
        if outcome == Outcome::Nothing {
            let quiet = self.quiet.contains(&w.repo);
            let waiting = age < if quiet { NO_CHECKS_AGAIN } else { NO_CHECKS };
            if !waiting {
                self.quiet.insert(w.repo.clone());
            }
            return waiting;
        }
        self.quiet.remove(&w.repo);
        let key = (w.repo.clone(), w.branch.clone());
        match outcome {
            Outcome::Running => age < GIVE_UP,
            Outcome::Failed => {
                self.failing.insert(key);
                announce(app, &CiResult::of(w, &info, false));
                false
            }
            _ => {
                if info.checks.iter().any(|c| c.state == "fail") {
                    self.failing.insert(key);
                } else if self.failing.remove(&key) {
                    announce(app, &CiResult::of(w, &info, true));
                }
                false
            }
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FailedCheck {
    name: String,
    workflow: String,
    url: String,
}

/// What a finished push came to, as the app, the banner, the phones and a
/// connected computer say it.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CiResult {
    pub(crate) project: String,
    project_label: String,
    branch: String,
    sha: String,
    title: String,
    url: String,
    passed: bool,
    failed: Vec<FailedCheck>,
    /// "CI failed: Linux host", "CI passes again".
    summary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    fix_prompt: Option<String>,
}

impl CiResult {
    fn of(w: &Watch, info: &CommitChecksInfo, passed: bool) -> Self {
        let failed: Vec<FailedCheck> = info
            .checks
            .iter()
            .filter(|c| c.commit.is_none() && c.state == "fail")
            .map(|c| FailedCheck {
                name: c.name.clone(),
                workflow: c.workflow.clone(),
                url: c.url.clone(),
            })
            .collect();
        CiResult {
            project: w.project.clone(),
            project_label: crate::config::project_display_name(&w.project),
            branch: w.branch.clone(),
            sha: short_sha(&info.sha).to_string(),
            title: info.title.clone(),
            url: info.url.clone(),
            passed,
            summary: summary(passed, &failed),
            failed,
            fix_prompt: info.fix_prompt.clone(),
        }
    }

    /// "lpm · main", with the computer it's on when that isn't this one.
    pub(crate) fn headline(&self, machine: Option<&str>) -> String {
        match machine {
            Some(machine) => format!("{} · {} on {machine}", self.project_label, self.branch),
            None => format!("{} · {}", self.project_label, self.branch),
        }
    }

    pub(crate) fn summary(&self) -> &str {
        &self.summary
    }

    pub(crate) fn body(&self) -> String {
        format!("{}\n{} {}", self.summary, self.sha, self.title)
    }

    pub(crate) fn branch(&self) -> &str {
        &self.branch
    }

    pub(crate) fn project_label(&self) -> &str {
        &self.project_label
    }
}

/// "CI failed: Linux host, Desktop CI": the workflows, or a check's own name when
/// it has none, the first three and how many more.
fn summary(passed: bool, failed: &[FailedCheck]) -> String {
    if passed {
        return "CI passes again".into();
    }
    let mut names: Vec<&str> = Vec::new();
    for check in failed {
        let name = if check.workflow.is_empty() {
            check.name.as_str()
        } else {
            check.workflow.as_str()
        };
        if !names.contains(&name) {
            names.push(name);
        }
    }
    let shown = names.iter().take(3).copied().collect::<Vec<_>>().join(", ");
    match names.len() {
        0 => "CI failed".into(),
        n if n > 3 => format!("CI failed: {shown} and {} more", n - 3),
        _ => format!("CI failed: {shown}"),
    }
}

fn banner(app: &AppHandle, result: &CiResult, machine: Option<&str>) {
    if should_notify(app, NotificationEvent::Ci) {
        notify(app, &result.headline(machine), &result.body());
    }
}

fn announce(app: &AppHandle, result: &CiResult) {
    let _ = app.emit(RESULT_EVENT, result);
    banner(app, result, None);
    crate::remote::push_ci_result(app, result);
}

/// A connected computer's result, which it forwarded here.
pub(crate) fn from_peer(app: &AppHandle, slug: &str, payload: &Value) {
    let Some(hub) = app.try_state::<crate::peerclient::PeerClientHub>() else {
        return;
    };
    let Ok(result) = serde_json::from_value::<CiResult>(payload.clone()) else {
        return;
    };
    let machine = crate::ignoredsync::machine_name(hub.inner(), slug);
    let mut forwarded = payload.clone();
    forwarded["slug"] = json!(slug);
    forwarded["machine"] = json!(machine);
    let _ = app.emit(PEER_RESULT_EVENT, forwarded);
    banner(app, &result, Some(&machine));
}

#[cfg(test)]
mod tests {
    use super::*;

    const ZERO: &str = "0000000000000000000000000000000000000000";
    const A: &str = "7e1f279d02bf2269c0927d3ba611c690abceeea8";
    const B: &str = "fcb454fef20f91bd85895fc7201d835fc549972b";

    fn line(from: &str, to: &str, message: &str) -> String {
        format!("{from} {to} Someone <someone@example.com> 1793720397 +0400\t{message}\n")
    }

    #[test]
    fn only_a_push_counts_not_a_fetch_or_pull() {
        let log = [
            line(ZERO, A, "fetch: fast-forward"),
            line(A, B, "update by push"),
            line(B, A, "pull: fast-forward"),
        ]
        .concat();
        assert_eq!(pushed_commits(&log), vec![B.to_string()]);
    }

    #[test]
    fn deleting_a_remote_branch_is_no_push_to_follow() {
        assert!(pushed_commits(&line(A, ZERO, "update by push")).is_empty());
    }

    fn temp_repo(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("lpm-ci-watch-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("logs/refs/remotes/origin/feature")).unwrap();
        dir
    }

    #[test]
    fn a_push_after_the_first_read_names_its_branch_and_commit() {
        let repo = temp_repo("push");
        let main = repo.join("logs/refs/remotes/origin/main");
        std::fs::write(&main, line(ZERO, A, "update by push")).unwrap();
        let mut logs = PushLogs::default();
        assert!(
            logs.scan(&repo).is_empty(),
            "pushes before lpm ran say nothing"
        );

        let mut text = std::fs::read_to_string(&main).unwrap();
        text.push_str(&line(A, B, "update by push"));
        std::fs::write(&main, text).unwrap();
        let nested = repo.join("logs/refs/remotes/origin/feature/x");
        std::fs::write(&nested, line(ZERO, A, "update by push")).unwrap();

        let mut pushes = logs.scan(&repo);
        pushes.sort();
        assert_eq!(
            pushes,
            vec![
                ("feature/x".to_string(), A.to_string()),
                ("main".to_string(), B.to_string()),
            ]
        );
        assert!(logs.scan(&repo).is_empty());
        let _ = std::fs::remove_dir_all(&repo);
    }

    fn check(name: &str, state: &'static str, commit: Option<&str>) -> PrCheck {
        PrCheck {
            name: name.into(),
            workflow: "CI".into(),
            state,
            url: String::new(),
            commit: commit.map(str::to_string),
        }
    }

    #[test]
    fn a_push_stands_on_its_own_checks_not_ones_carried_over() {
        assert_eq!(outcome(&[]), Outcome::Nothing);
        assert_eq!(
            outcome(&[check("test", "fail", Some("bbbbbbb"))]),
            Outcome::Nothing
        );
        assert_eq!(
            outcome(&[check("lint", "pass", None), check("test", "pending", None)]),
            Outcome::Running
        );
        assert_eq!(
            outcome(&[check("lint", "pass", None), check("test", "fail", None)]),
            Outcome::Failed
        );
        assert_eq!(
            outcome(&[check("lint", "pass", None), check("docs", "skipped", None)]),
            Outcome::Passed
        );
    }

    fn result(passed: bool, failed: &[(&str, &str)]) -> CiResult {
        let failed: Vec<FailedCheck> = failed
            .iter()
            .map(|(name, workflow)| FailedCheck {
                name: name.to_string(),
                workflow: workflow.to_string(),
                url: String::new(),
            })
            .collect();
        CiResult {
            project: "lpm".into(),
            project_label: "lpm".into(),
            branch: "main".into(),
            sha: "fcb454f".into(),
            title: "feat(cli): add remote command execution".into(),
            url: String::new(),
            passed,
            summary: summary(passed, &failed),
            failed,
            fix_prompt: None,
        }
    }

    #[test]
    fn the_banner_names_the_branch_and_what_failed() {
        let r = result(
            false,
            &[
                ("check", "Linux host"),
                ("lint", "Linux host"),
                ("Vercel", ""),
            ],
        );
        assert_eq!(r.headline(None), "lpm · main");
        assert_eq!(r.headline(Some("Studio")), "lpm · main on Studio");
        assert_eq!(
            r.body(),
            "CI failed: Linux host, Vercel\nfcb454f feat(cli): add remote command execution"
        );
        let many = result(
            false,
            &[
                ("a", "One"),
                ("b", "Two"),
                ("c", "Three"),
                ("d", "Four"),
                ("e", "Five"),
            ],
        );
        assert_eq!(many.summary(), "CI failed: One, Two, Three and 2 more");
        assert_eq!(result(true, &[]).summary(), "CI passes again");
    }

    #[test]
    fn a_connected_computers_result_reads_back_whole() {
        let r = result(false, &[("check", "Linux host")]);
        let json = serde_json::to_value(&r).unwrap();
        assert_eq!(json["summary"], "CI failed: Linux host");
        assert_eq!(serde_json::from_value::<CiResult>(json).unwrap(), r);
    }
}
