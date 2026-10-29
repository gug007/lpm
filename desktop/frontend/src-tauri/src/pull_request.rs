// The pull request behind a project's current branch, looked up through the
// `gh` CLI so the terminal footer can keep its link on screen, with the state
// of its CI checks.
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Serialize, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestInfo {
    pub number: u64,
    pub url: String,
    pub state: String,
    pub title: String,
    pub is_draft: bool,
    pub checks: Vec<PrCheck>,
}

#[derive(Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PrCheck {
    pub name: String,
    pub workflow: String,
    /// "pass", "fail", "pending" or "skipped" (neutral, skipped or cancelled).
    pub state: &'static str,
    pub url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhPullRequest {
    number: u64,
    url: String,
    state: String,
    title: String,
    #[serde(default)]
    is_draft: bool,
    #[serde(default)]
    status_check_rollup: Vec<Value>,
}

const FIELDS: &str = "number,url,state,title,isDraft,statusCheckRollup";

/// The pull request for `cwd`'s current branch — `gh` prefers an open one and
/// falls back to the newest merged/closed — or None when there is none, the
/// remote is not GitHub, or `gh` is missing or signed out.
#[tauri::command(async)]
pub fn branch_pull_request(cwd: String) -> Option<PullRequestInfo> {
    gh_out(&cwd, &["pr", "view", "--json", FIELDS])
        .ok()
        .and_then(|json| parse_pull_request(&json))
}

/// Run `gh` in `cwd` without prompts or update notices. A local checkout
/// without `gh` installed fails before anything is spawned.
pub(crate) fn gh_out(cwd: &str, args: &[&str]) -> Result<String, String> {
    let local = crate::sshexec::remote_project_for_path(cwd).is_none();
    if local && !crate::git::check_ghcli() {
        return Err("Install the GitHub CLI (gh) to read pull requests".into());
    }
    crate::git::tool_out(
        cwd,
        "gh",
        args,
        &[("GH_PROMPT_DISABLED", "1"), ("GH_NO_UPDATE_NOTIFIER", "1")],
    )
}

fn parse_pull_request(json: &str) -> Option<PullRequestInfo> {
    let pr = serde_json::from_str::<GhPullRequest>(json).ok()?;
    if pr.number == 0 || pr.url.is_empty() {
        return None;
    }
    Some(PullRequestInfo {
        number: pr.number,
        url: pr.url,
        state: pr.state,
        title: pr.title,
        is_draft: pr.is_draft,
        checks: checks_from_rollup(&pr.status_check_rollup),
    })
}

/// One row per check, the newest run of each: a re-run or a second trigger
/// (push and pull_request) lists the same check again.
fn checks_from_rollup(rollup: &[Value]) -> Vec<PrCheck> {
    let mut newest: Vec<(String, PrCheck)> = Vec::new();
    for item in rollup {
        let Some((started, check)) = rollup_check(item) else {
            continue;
        };
        match newest
            .iter_mut()
            .find(|(_, seen)| seen.name == check.name && seen.workflow == check.workflow)
        {
            Some(slot) if slot.0 <= started => *slot = (started, check),
            Some(_) => {}
            None => newest.push((started, check)),
        }
    }
    newest.into_iter().map(|(_, check)| check).collect()
}

fn rollup_check(item: &Value) -> Option<(String, PrCheck)> {
    let text = |k: &str| item.get(k).and_then(Value::as_str).unwrap_or_default();
    let (name, state, url) = if text("__typename") == "StatusContext" {
        (
            text("context"),
            status_context_state(text("state")),
            text("targetUrl"),
        )
    } else {
        (
            text("name"),
            check_run_state(text("status"), text("conclusion")),
            text("detailsUrl"),
        )
    };
    if name.is_empty() {
        return None;
    }
    Some((
        text("startedAt").to_string(),
        PrCheck {
            name: name.to_string(),
            workflow: text("workflowName").to_string(),
            state,
            url: url.to_string(),
        },
    ))
}

fn check_run_state(status: &str, conclusion: &str) -> &'static str {
    if status != "COMPLETED" {
        return "pending";
    }
    match conclusion {
        "SUCCESS" => "pass",
        "NEUTRAL" | "SKIPPED" | "CANCELLED" => "skipped",
        "" => "pending",
        _ => "fail",
    }
}

fn status_context_state(state: &str) -> &'static str {
    match state {
        "SUCCESS" => "pass",
        "FAILURE" | "ERROR" => "fail",
        _ => "pending",
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_pull_request, PrCheck, PullRequestInfo};

    #[test]
    fn parses_gh_pr_view_json() {
        let json = r#"{"isDraft":false,"number":42,"state":"OPEN","title":"Add footer link","url":"https://github.com/o/r/pull/42"}"#;
        assert_eq!(
            parse_pull_request(json),
            Some(PullRequestInfo {
                number: 42,
                url: "https://github.com/o/r/pull/42".into(),
                state: "OPEN".into(),
                title: "Add footer link".into(),
                is_draft: false,
                checks: vec![],
            })
        );
    }

    #[test]
    fn draft_defaults_to_false_when_gh_omits_it() {
        let json =
            r#"{"number":7,"state":"MERGED","title":"t","url":"https://github.com/o/r/pull/7"}"#;
        assert!(!parse_pull_request(json).unwrap().is_draft);
    }

    #[test]
    fn rejects_empty_malformed_or_numberless_output() {
        assert_eq!(parse_pull_request(""), None);
        assert_eq!(parse_pull_request("no pull requests found"), None);
        assert_eq!(
            parse_pull_request(
                r#"{"number":0,"state":"OPEN","title":"","url":"https://x/pull/0"}"#
            ),
            None
        );
        assert_eq!(
            parse_pull_request(r#"{"number":3,"state":"OPEN","title":"","url":""}"#),
            None
        );
    }

    fn check(name: &str, workflow: &str, state: &'static str, url: &str) -> PrCheck {
        PrCheck {
            name: name.into(),
            workflow: workflow.into(),
            state,
            url: url.into(),
        }
    }

    #[test]
    fn reads_check_runs_and_status_contexts() {
        let json = r#"{"isDraft":false,"number":142,"state":"OPEN","title":"t","url":"https://github.com/o/r/pull/142","statusCheckRollup":[
            {"__typename":"CheckRun","name":"test (ubuntu-latest)","workflowName":"CI","status":"COMPLETED","conclusion":"FAILURE","startedAt":"2026-10-29T10:00:00Z","detailsUrl":"https://github.com/o/r/actions/runs/11/job/21"},
            {"__typename":"CheckRun","name":"lint","workflowName":"CI","status":"IN_PROGRESS","conclusion":"","startedAt":"2026-10-29T10:00:00Z","detailsUrl":"https://github.com/o/r/actions/runs/11/job/22"},
            {"__typename":"CheckRun","name":"build","workflowName":"CI","status":"COMPLETED","conclusion":"SUCCESS","startedAt":"2026-10-29T10:00:00Z","detailsUrl":"https://github.com/o/r/actions/runs/11/job/23"},
            {"__typename":"CheckRun","name":"docs","workflowName":"CI","status":"COMPLETED","conclusion":"SKIPPED","startedAt":"2026-10-29T10:00:00Z","detailsUrl":""},
            {"__typename":"StatusContext","context":"vercel","state":"PENDING","startedAt":"2026-10-29T10:00:00Z","targetUrl":"https://vercel.com/x"},
            {"__typename":"StatusContext","context":"codecov","state":"ERROR","startedAt":"2026-10-29T10:00:00Z","targetUrl":""}
        ]}"#;
        assert_eq!(
            parse_pull_request(json).unwrap().checks,
            vec![
                check(
                    "test (ubuntu-latest)",
                    "CI",
                    "fail",
                    "https://github.com/o/r/actions/runs/11/job/21"
                ),
                check(
                    "lint",
                    "CI",
                    "pending",
                    "https://github.com/o/r/actions/runs/11/job/22"
                ),
                check(
                    "build",
                    "CI",
                    "pass",
                    "https://github.com/o/r/actions/runs/11/job/23"
                ),
                check("docs", "CI", "skipped", ""),
                check("vercel", "", "pending", "https://vercel.com/x"),
                check("codecov", "", "fail", ""),
            ]
        );
    }

    #[test]
    fn a_rerun_replaces_the_earlier_run_of_the_same_check() {
        let json = r#"{"number":5,"state":"OPEN","title":"t","url":"https://github.com/o/r/pull/5","statusCheckRollup":[
            {"__typename":"CheckRun","name":"test","workflowName":"CI","status":"COMPLETED","conclusion":"SUCCESS","startedAt":"2026-10-29T11:00:00Z","detailsUrl":"https://x/runs/2/job/2"},
            {"__typename":"CheckRun","name":"test","workflowName":"CI","status":"COMPLETED","conclusion":"FAILURE","startedAt":"2026-10-29T10:00:00Z","detailsUrl":"https://x/runs/1/job/1"},
            {"__typename":"CheckRun","name":"test","workflowName":"Nightly","status":"COMPLETED","conclusion":"FAILURE","startedAt":"2026-10-29T09:00:00Z","detailsUrl":"https://x/runs/3/job/3"}
        ]}"#;
        assert_eq!(
            parse_pull_request(json).unwrap().checks,
            vec![
                check("test", "CI", "pass", "https://x/runs/2/job/2"),
                check("test", "Nightly", "fail", "https://x/runs/3/job/3"),
            ]
        );
    }

    #[test]
    fn a_pull_request_without_checks_has_none() {
        let json = r#"{"number":9,"state":"OPEN","title":"t","url":"https://github.com/o/r/pull/9","statusCheckRollup":[]}"#;
        assert!(parse_pull_request(json).unwrap().checks.is_empty());
    }
}
