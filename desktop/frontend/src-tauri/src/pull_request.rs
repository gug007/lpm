// The pull request behind a project's current branch, looked up through the
// `gh` CLI so the terminal footer can keep its link on screen.
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestInfo {
    pub number: u64,
    pub url: String,
    pub state: String,
    pub title: String,
    #[serde(default)]
    pub is_draft: bool,
}

const FIELDS: &str = "number,url,state,title,isDraft";

/// The pull request for `cwd`'s current branch — `gh` prefers an open one and
/// falls back to the newest merged/closed — or None when there is none, the
/// remote is not GitHub, or `gh` is missing or signed out.
#[tauri::command(async)]
pub fn branch_pull_request(cwd: String) -> Option<PullRequestInfo> {
    let local = crate::sshexec::remote_project_for_path(&cwd).is_none();
    if local && !crate::git::check_ghcli() {
        return None;
    }
    let out = crate::git::tool_command(
        &cwd,
        "gh",
        &["pr", "view", "--json", FIELDS],
        &[("GH_PROMPT_DISABLED", "1"), ("GH_NO_UPDATE_NOTIFIER", "1")],
    )
    .output()
    .ok()?;
    if !out.status.success() {
        return None;
    }
    parse_pull_request(&String::from_utf8_lossy(&out.stdout))
}

fn parse_pull_request(json: &str) -> Option<PullRequestInfo> {
    serde_json::from_str::<PullRequestInfo>(json)
        .ok()
        .filter(|pr| pr.number > 0 && !pr.url.is_empty())
}

#[cfg(test)]
mod tests {
    use super::{parse_pull_request, PullRequestInfo};

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
}
