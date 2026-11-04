// CI for a branch with no open pull request: the checks on the commit it last
// pushed. A workflow that only runs for some paths leaves that commit without
// it, so each check is read from the newest of the last few pushes that ran it,
// and a branch whose newest push only touched docs still shows the test that
// broke one push earlier. Only runs for this branch count: a tag's release
// build or a merged branch's own runs sit on the same commits.
use crate::pull_request::{checks_from_rollup, gh_out, PrCheck};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

/// How many pushes back a check's last result is looked for.
const HISTORY: usize = 8;
/// The footer, the phones and the push watcher ask about the same commit; one
/// answer serves them all this long. Finished checks only change on a re-run,
/// which clears it.
const RUNNING_FOR: Duration = Duration::from_secs(15);
const FINISHED_FOR: Duration = Duration::from_secs(10 * 60);

const QUERY: &str = "query($owner:String!,$name:String!,$oid:GitObjectID!,$depth:Int!){repository(owner:$owner,name:$name){object(oid:$oid){... on Commit{history(first:$depth){nodes{oid messageHeadline url statusCheckRollup{contexts(first:60){nodes{__typename ... on CheckRun{name status conclusion detailsUrl startedAt checkSuite{branch{name} workflowRun{workflow{name}}}} ... on StatusContext{context state targetUrl createdAt}}}}}}}}}}";

/// A commit and its checks: one commit's own as GitHub lists them, or a
/// branch's, carried over from earlier pushes (`branch_checks`).
#[derive(Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CommitChecksInfo {
    pub sha: String,
    pub title: String,
    pub url: String,
    pub checks: Vec<PrCheck>,
    /// What a Fix with … agent is told while something fails.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fix_prompt: Option<String>,
}

/// The checks on the commit `cwd`'s branch last pushed, or None when the branch
/// has no upstream, the remote isn't on GitHub, or `gh` is missing or signed out.
#[tauri::command(async)]
pub fn branch_commit_checks(cwd: String) -> Option<CommitChecksInfo> {
    let (sha, branch) = upstream_head(&cwd)?;
    commit_checks(&cwd, &sha, &branch).ok().flatten()
}

/// The last pushes of `cwd`'s branch, newest first, each with the checks GitHub
/// ran on it for that branch. None when `branch_commit_checks` would be.
pub(crate) fn upstream_rollups(cwd: &str) -> Option<Vec<CommitChecksInfo>> {
    let (sha, branch) = upstream_head(cwd)?;
    rollups(cwd, &sha, &branch).ok()
}

fn upstream_head(cwd: &str) -> Option<(String, String)> {
    let out = crate::git::git_out(
        cwd,
        &[
            "rev-parse",
            "@{upstream}",
            "--symbolic-full-name",
            "@{upstream}",
        ],
    )
    .ok()?;
    upstream(&out).map(|(sha, branch)| (sha.to_string(), branch))
}

struct Cached {
    commits: Vec<CommitChecksInfo>,
    at: Instant,
}

fn cache() -> &'static Mutex<HashMap<(String, String), Cached>> {
    static CACHE: OnceLock<Mutex<HashMap<(String, String), Cached>>> = OnceLock::new();
    CACHE.get_or_init(Default::default)
}

fn fresh(cached: &Cached) -> bool {
    let running = cached
        .commits
        .iter()
        .flat_map(|commit| &commit.checks)
        .any(|check| check.state == "pending");
    cached.at.elapsed() < if running { RUNNING_FOR } else { FINISHED_FOR }
}

/// `sha` and the commits before it (`commit_rollups`), from the cache while
/// it's fresh.
fn rollups(cwd: &str, sha: &str, branch: &str) -> Result<Vec<CommitChecksInfo>, String> {
    let key = (cwd.to_string(), sha.to_string());
    if let Some(cached) = cache().lock().unwrap().get(&key).filter(|c| fresh(c)) {
        return Ok(cached.commits.clone());
    }
    let commits = commit_rollups(cwd, sha, branch)?;
    let mut cache = cache().lock().unwrap();
    cache.retain(|_, c| fresh(c));
    cache.insert(
        key,
        Cached {
            commits: commits.clone(),
            at: Instant::now(),
        },
    );
    Ok(commits)
}

/// `branch`'s checks as of commit `sha` (`branch_checks`).
pub(crate) fn commit_checks(
    cwd: &str,
    sha: &str,
    branch: &str,
) -> Result<Option<CommitChecksInfo>, String> {
    Ok(branch_checks(&rollups(cwd, sha, branch)?, branch))
}

/// The commit and remote branch `git rev-parse @{upstream} --symbolic-full-name
/// @{upstream}` names: `refs/remotes/origin/feature/x` is `feature/x`.
fn upstream(out: &str) -> Option<(&str, String)> {
    let mut lines = out.lines().map(str::trim);
    let sha = lines.next().filter(|s| !s.is_empty())?;
    let full = lines.next()?.strip_prefix("refs/remotes/")?;
    let (_remote, branch) = full.split_once('/')?;
    Some((sha, branch.to_string()))
}

/// Runs the failed jobs of each workflow run again.
#[tauri::command(async)]
pub fn rerun_failed_checks(cwd: String, run_ids: Vec<String>) -> Result<(), String> {
    let ids: Vec<&String> = run_ids
        .iter()
        .filter(|id| !id.is_empty() && id.chars().all(|c| c.is_ascii_digit()))
        .collect();
    if ids.is_empty() {
        return Err("Nothing to run again".into());
    }
    cache().lock().unwrap().retain(|(dir, _), _| *dir != cwd);
    for id in ids {
        gh_out(&cwd, &["run", "rerun", id, "--failed"])?;
    }
    Ok(())
}

/// `sha` and up to `HISTORY - 1` commits before it, newest first, each with the
/// checks GitHub ran on it for `branch`.
fn commit_rollups(cwd: &str, sha: &str, branch: &str) -> Result<Vec<CommitChecksInfo>, String> {
    let oid = format!("oid={sha}");
    let depth = format!("depth={HISTORY}");
    let query = format!("query={QUERY}");
    let json = gh_out(
        cwd,
        &[
            "api",
            "graphql",
            "-F",
            "owner={owner}",
            "-F",
            "name={repo}",
            "-f",
            &oid,
            "-F",
            &depth,
            "-f",
            &query,
        ],
    )?;
    parse_rollups(&json, branch).ok_or_else(|| "GitHub doesn't know this commit".into())
}

fn parse_rollups(json: &str, branch: &str) -> Option<Vec<CommitChecksInfo>> {
    let v: Value = serde_json::from_str(json).ok()?;
    let nodes = v
        .pointer("/data/repository/object/history/nodes")?
        .as_array()?;
    Some(
        nodes
            .iter()
            .filter_map(|node| commit_rollup(node, branch))
            .collect(),
    )
}

fn commit_rollup(node: &Value, branch: &str) -> Option<CommitChecksInfo> {
    let text = |k: &str| node.get(k).and_then(Value::as_str).unwrap_or_default();
    let sha = text("oid");
    if sha.is_empty() {
        return None;
    }
    let contexts = node
        .pointer("/statusCheckRollup/contexts/nodes")
        .and_then(Value::as_array)
        .map(|nodes| {
            nodes
                .iter()
                .filter(|n| ran_for(n, branch))
                .map(flat_context)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    Some(CommitChecksInfo {
        sha: sha.to_string(),
        title: text("messageHeadline").to_string(),
        url: text("url").to_string(),
        checks: checks_from_rollup(&contexts),
        fix_prompt: None,
    })
}

/// A check run GitHub started for another ref, such as a release tag or a
/// pull request's branch, says nothing about this branch. A status has no ref.
fn ran_for(node: &Value, branch: &str) -> bool {
    node.pointer("/checkSuite/branch/name")
        .and_then(Value::as_str)
        .is_none_or(|name| name == branch)
}

/// A GraphQL rollup entry in the shape `gh pr view` prints, which
/// `checks_from_rollup` reads.
fn flat_context(node: &Value) -> Value {
    let mut flat = node.clone();
    if let Some(name) = node
        .pointer("/checkSuite/workflowRun/workflow/name")
        .and_then(Value::as_str)
    {
        flat["workflowName"] = json!(name);
    }
    if node.get("startedAt").is_none() {
        if let Some(at) = node.get("createdAt") {
            flat["startedAt"] = at.clone();
        }
    }
    flat
}

fn same(a: &PrCheck, b: &PrCheck) -> bool {
    a.name == b.name && a.workflow == b.workflow
}

/// The newest commit with every check's latest result: its own, else the one
/// from the newest earlier push that ran the check, marked with that commit. A
/// skipped run says nothing about the code, so an earlier real result wins.
fn branch_checks(commits: &[CommitChecksInfo], branch: &str) -> Option<CommitChecksInfo> {
    let head = commits.first()?;
    let mut checks: Vec<PrCheck> = Vec::new();
    let mut skipped: Vec<PrCheck> = Vec::new();
    for (i, commit) in commits.iter().enumerate() {
        for check in &commit.checks {
            if checks.iter().any(|c| same(c, check)) {
                continue;
            }
            let mut check = check.clone();
            if i > 0 {
                check.commit = Some(short_sha(&commit.sha).to_string());
            }
            if check.state == "skipped" {
                if !skipped.iter().any(|c| same(c, &check)) {
                    skipped.push(check);
                }
            } else {
                checks.push(check);
            }
        }
    }
    for check in skipped {
        if !checks.iter().any(|c| same(c, &check)) {
            checks.push(check);
        }
    }
    let fix_prompt =
        crate::ci_prompt::for_branch(branch, &head.sha, &head.title, &head.url, &checks);
    Some(CommitChecksInfo {
        checks,
        fix_prompt,
        ..head.clone()
    })
}

pub(crate) fn short_sha(sha: &str) -> &str {
    sha.get(..7).unwrap_or(sha)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn check(name: &str, workflow: &str, state: &'static str, commit: Option<&str>) -> PrCheck {
        PrCheck {
            name: name.into(),
            workflow: workflow.into(),
            state,
            url: format!("https://github.com/o/r/actions/runs/1/job/{name}"),
            commit: commit.map(str::to_string),
        }
    }

    fn commit(sha: &str, checks: Vec<PrCheck>) -> CommitChecksInfo {
        CommitChecksInfo {
            sha: sha.into(),
            title: format!("commit {sha}"),
            url: format!("https://github.com/o/r/commit/{sha}"),
            checks,
            fix_prompt: None,
        }
    }

    #[test]
    fn reads_the_graphql_history_into_commits_and_checks() {
        let json = r#"{"data":{"repository":{"object":{"history":{"nodes":[
            {"oid":"e8ddefe9528798016cb5374322aa6e5c789d1669","messageHeadline":"feat(config): add a footer action","url":"https://github.com/o/r/commit/e8ddefe","statusCheckRollup":{"contexts":{"nodes":[
                {"__typename":"StatusContext","context":"Vercel","state":"SUCCESS","targetUrl":"https://vercel.com/x","createdAt":"2026-11-03T16:03:05Z"}
            ]}}},
            {"oid":"fcb454fef20f91bd85895fc7201d835fc549972b","messageHeadline":"feat(cli): add remote command execution","url":"https://github.com/o/r/commit/fcb454f","statusCheckRollup":{"contexts":{"nodes":[
                {"__typename":"CheckRun","name":"check","status":"COMPLETED","conclusion":"FAILURE","detailsUrl":"https://github.com/o/r/actions/runs/41/job/12","startedAt":"2026-11-03T15:40:00Z","checkSuite":{"branch":{"name":"main"},"workflowRun":{"workflow":{"name":"Linux host"}}}},
                {"__typename":"CheckRun","name":"build-linux","status":"COMPLETED","conclusion":"FAILURE","detailsUrl":"https://github.com/o/r/actions/runs/42/job/13","startedAt":"2026-11-03T15:41:00Z","checkSuite":{"branch":{"name":"v0.7.50"},"workflowRun":{"workflow":{"name":"Release"}}}}
            ]}}},
            {"oid":"7e1f279d02bf2269c0927d3ba611c690abceeea8","messageHeadline":"fix(android): broadcast","url":"https://github.com/o/r/commit/7e1f279","statusCheckRollup":null}
        ]}}}}}"#;
        let commits = parse_rollups(json, "main").unwrap();
        assert_eq!(commits.len(), 3);
        assert_eq!(commits[0].title, "feat(config): add a footer action");
        assert_eq!(commits[0].checks[0].name, "Vercel");
        assert_eq!(commits[0].checks[0].state, "pass");
        assert_eq!(
            commits[1].checks.len(),
            1,
            "the tag's release run isn't main's"
        );
        assert_eq!(commits[1].checks[0].workflow, "Linux host");
        assert_eq!(commits[1].checks[0].state, "fail");
        assert!(commits[2].checks.is_empty());
    }

    #[test]
    fn an_unknown_commit_or_repository_reads_as_none() {
        assert_eq!(
            parse_rollups(r#"{"data":{"repository":{"object":null}}}"#, "main"),
            None
        );
        assert_eq!(parse_rollups("not json", "main"), None);
    }

    #[test]
    fn reads_the_upstream_commit_and_its_branch() {
        let out = "e8ddefe9528798016cb5374322aa6e5c789d1669\nrefs/remotes/origin/feature/x\n";
        assert_eq!(
            upstream(out),
            Some((
                "e8ddefe9528798016cb5374322aa6e5c789d1669",
                "feature/x".to_string()
            ))
        );
        assert_eq!(upstream("abc\nrefs/heads/main"), None);
        assert_eq!(upstream(""), None);
    }

    #[test]
    fn a_check_the_newest_push_skipped_keeps_its_last_result_and_commit() {
        let commits = vec![
            commit("e8ddefe9", vec![check("Vercel", "", "pass", None)]),
            commit(
                "fcb454fe",
                vec![
                    check("Vercel", "", "pass", None),
                    check("check", "Linux host", "fail", None),
                ],
            ),
            commit("40b25cc1", vec![check("check", "Linux host", "pass", None)]),
        ];
        let info = branch_checks(&commits, "main").unwrap();
        assert_eq!(info.sha, "e8ddefe9");
        assert_eq!(info.title, "commit e8ddefe9");
        assert!(info
            .fix_prompt
            .as_deref()
            .is_some_and(|p| p.contains("- Linux host › check (on fcb454f)")));
        assert_eq!(
            info.checks,
            vec![
                check("Vercel", "", "pass", None),
                check("check", "Linux host", "fail", Some("fcb454f")),
            ]
        );
    }

    #[test]
    fn a_running_check_on_the_newest_push_hides_its_older_failure() {
        let commits = vec![
            commit("aaaaaaa1", vec![check("test", "CI", "pending", None)]),
            commit("bbbbbbb2", vec![check("test", "CI", "fail", None)]),
        ];
        assert_eq!(
            branch_checks(&commits, "main").unwrap().checks,
            vec![check("test", "CI", "pending", None)]
        );
    }

    #[test]
    fn a_skipped_or_cancelled_run_gives_way_to_an_earlier_real_result() {
        let commits = vec![
            commit(
                "aaaaaaa1",
                vec![
                    check("test", "CI", "skipped", None),
                    check("docs", "CI", "skipped", None),
                ],
            ),
            commit("bbbbbbb2", vec![check("test", "CI", "fail", None)]),
        ];
        assert_eq!(
            branch_checks(&commits, "main").unwrap().checks,
            vec![
                check("test", "CI", "fail", Some("bbbbbbb")),
                check("docs", "CI", "skipped", None),
            ]
        );
    }

    #[test]
    fn no_commits_is_no_checks() {
        assert_eq!(branch_checks(&[], "main"), None);
    }

    #[test]
    fn only_run_ids_are_run_again() {
        assert_eq!(
            rerun_failed_checks("/nowhere".into(), vec!["".into(), "1; rm".into()]),
            Err("Nothing to run again".into())
        );
    }
}
