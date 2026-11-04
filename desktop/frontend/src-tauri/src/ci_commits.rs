// CI commit by commit, for the history lists: how each of a branch's last pushes
// did on its own, without the results `ci_checks.rs` carries over from earlier
// pushes. It reads the same cached answer the footer's checks pill does, so it
// costs no extra GitHub request.
use crate::ci_checks::{upstream_rollups, CommitChecksInfo};
use serde::Serialize;

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CommitCi {
    pub sha: String,
    /// "fail", "pending" or "pass".
    pub state: &'static str,
}

/// How the last pushes of `cwd`'s branch did, newest first. A commit with no
/// checks worth showing is left out, and the list is empty when the branch has
/// no upstream, the remote isn't on GitHub, or `gh` is missing or signed out.
#[tauri::command(async)]
pub fn recent_commit_checks(cwd: String) -> Vec<CommitCi> {
    upstream_rollups(&cwd)
        .map(|commits| verdicts(&commits))
        .unwrap_or_default()
}

fn verdicts(commits: &[CommitChecksInfo]) -> Vec<CommitCi> {
    commits
        .iter()
        .filter_map(|commit| {
            Some(CommitCi {
                sha: commit.sha.clone(),
                state: verdict(commit)?,
            })
        })
        .collect()
}

/// Any failure decides it, then anything still running; a commit with only
/// skipped checks says nothing about the code.
fn verdict(commit: &CommitChecksInfo) -> Option<&'static str> {
    let has = |state: &str| commit.checks.iter().any(|check| check.state == state);
    ["fail", "pending", "pass"]
        .into_iter()
        .find(|state| has(state))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pull_request::PrCheck;

    fn commit(sha: &str, states: &[&'static str]) -> CommitChecksInfo {
        CommitChecksInfo {
            sha: sha.into(),
            title: String::new(),
            url: String::new(),
            checks: states
                .iter()
                .enumerate()
                .map(|(i, state)| PrCheck {
                    name: format!("check {i}"),
                    workflow: "CI".into(),
                    state,
                    url: String::new(),
                    commit: None,
                })
                .collect(),
            fix_prompt: None,
        }
    }

    #[test]
    fn a_failure_outranks_running_and_passed_checks() {
        assert_eq!(
            verdict(&commit("a", &["pass", "pending", "fail"])),
            Some("fail")
        );
        assert_eq!(verdict(&commit("a", &["pass", "pending"])), Some("pending"));
        assert_eq!(verdict(&commit("a", &["pass", "skipped"])), Some("pass"));
    }

    #[test]
    fn commits_without_a_real_result_are_left_out() {
        let commits = [
            commit("newest", &["fail"]),
            commit("docs-only", &["skipped"]),
            commit("no-ci", &[]),
            commit("oldest", &["pass"]),
        ];
        assert_eq!(
            verdicts(&commits),
            vec![
                CommitCi {
                    sha: "newest".into(),
                    state: "fail"
                },
                CommitCi {
                    sha: "oldest".into(),
                    state: "pass"
                },
            ]
        );
    }

    #[test]
    fn a_commit_keeps_its_own_failure_when_a_newer_one_passes() {
        let states: Vec<_> = verdicts(&[commit("fixed", &["pass"]), commit("broke", &["fail"])])
            .into_iter()
            .map(|c| c.state)
            .collect();
        assert_eq!(states, ["pass", "fail"]);
    }
}
