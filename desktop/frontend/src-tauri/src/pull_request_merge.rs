// Merging a branch's open pull request from the phone through `gh`, and what
// the phone needs before it offers to: the merge methods the repository allows
// and whether GitHub deletes the branch by itself. The working copy on the Mac
// is never touched: only the remote branch goes, as GitHub's own button does.
use crate::pull_request::{gh_out, MergeReadiness};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

/// Repository settings change rarely; the CI sheet asks often.
const SETTINGS_FOR: Duration = Duration::from_secs(10 * 60);
const REPO_FIELDS: &str =
    "squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed,deleteBranchOnMerge";

#[derive(Deserialize, Debug, Clone, PartialEq)]
#[serde(default, rename_all = "camelCase")]
struct RepoSettings {
    squash_merge_allowed: bool,
    merge_commit_allowed: bool,
    rebase_merge_allowed: bool,
    delete_branch_on_merge: bool,
}

impl Default for RepoSettings {
    fn default() -> Self {
        Self {
            squash_merge_allowed: true,
            merge_commit_allowed: true,
            rebase_merge_allowed: true,
            delete_branch_on_merge: false,
        }
    }
}

impl RepoSettings {
    /// The methods GitHub offers for this repository, in the order its merge
    /// button lists them.
    fn methods(&self) -> Vec<&'static str> {
        [
            ("merge", self.merge_commit_allowed),
            ("squash", self.squash_merge_allowed),
            ("rebase", self.rebase_merge_allowed),
        ]
        .into_iter()
        .filter_map(|(method, allowed)| allowed.then_some(method))
        .collect()
    }
}

fn cache() -> &'static Mutex<HashMap<String, (RepoSettings, Instant)>> {
    static CACHE: OnceLock<Mutex<HashMap<String, (RepoSettings, Instant)>>> = OnceLock::new();
    CACHE.get_or_init(Default::default)
}

/// What `gh` says the repository allows, or GitHub's defaults when it can't say.
fn settings(root: &str) -> RepoSettings {
    if let Some((settings, at)) = cache().lock().unwrap().get(root) {
        if at.elapsed() < SETTINGS_FOR {
            return settings.clone();
        }
    }
    let Ok(json) = gh_out(root, &["repo", "view", "--json", REPO_FIELDS]) else {
        return RepoSettings::default();
    };
    let settings = serde_json::from_str::<RepoSettings>(&json).unwrap_or_default();
    cache()
        .lock()
        .unwrap()
        .insert(root.to_string(), (settings.clone(), Instant::now()));
    settings
}

/// The `merge` object of an open pull request in a `gitChecks` reply.
pub fn offer(root: &str, readiness: &MergeReadiness) -> Value {
    offer_json(readiness, &settings(root))
}

fn offer_json(readiness: &MergeReadiness, settings: &RepoSettings) -> Value {
    let mut offer = json!(readiness);
    offer["methods"] = json!(settings.methods());
    offer["deletesBranch"] = json!(settings.delete_branch_on_merge);
    offer
}

/// Merge pull request `number` with `method`, only while its head is still
/// `head`, then delete its branch on GitHub when asked and GitHub doesn't do it
/// itself. Ok(true) when the branch went too.
pub fn merge(
    root: &str,
    number: u64,
    method: &str,
    head: &str,
    delete_branch: bool,
) -> Result<bool, String> {
    let number = number.to_string();
    gh_out(root, &merge_args(&number, method, head)?)?;
    if !delete_branch || settings(root).delete_branch_on_merge {
        return Ok(delete_branch);
    }
    Ok(delete_remote_branch(root, &number))
}

fn merge_args<'a>(number: &'a str, method: &str, head: &'a str) -> Result<Vec<&'a str>, String> {
    let flag = match method {
        "squash" => "--squash",
        "merge" => "--merge",
        "rebase" => "--rebase",
        _ => return Err(format!("Unknown merge method “{method}”")),
    };
    let mut args = vec!["pr", "merge", number, flag];
    if !head.is_empty() {
        args.extend(["--match-head-commit", head]);
    }
    Ok(args)
}

/// The merged pull request's branch, removed from GitHub. A branch on a fork
/// isn't this repository's to delete.
fn delete_remote_branch(root: &str, number: &str) -> bool {
    let Ok(json) = gh_out(
        root,
        &[
            "pr",
            "view",
            number,
            "--json",
            "headRefName,isCrossRepository",
        ],
    ) else {
        return false;
    };
    let Ok(head) = serde_json::from_str::<Value>(&json) else {
        return false;
    };
    let branch = head["headRefName"].as_str().unwrap_or_default();
    if branch.is_empty() || head["isCrossRepository"].as_bool().unwrap_or(true) {
        return false;
    }
    let path = format!("repos/{{owner}}/{{repo}}/git/refs/heads/{branch}");
    gh_out(root, &["api", "-X", "DELETE", &path]).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_method_maps_to_its_flag_and_pins_the_head() {
        assert_eq!(
            merge_args("42", "squash", "9e7d031").unwrap(),
            vec![
                "pr",
                "merge",
                "42",
                "--squash",
                "--match-head-commit",
                "9e7d031"
            ]
        );
        assert_eq!(
            merge_args("42", "rebase", "").unwrap(),
            vec!["pr", "merge", "42", "--rebase"]
        );
        assert!(merge_args("42", "octopus", "").is_err());
    }

    #[test]
    fn methods_follow_the_repository_and_github_order() {
        let settings: RepoSettings = serde_json::from_str(
            r#"{"squashMergeAllowed":true,"mergeCommitAllowed":false,"rebaseMergeAllowed":true,"deleteBranchOnMerge":true}"#,
        )
        .unwrap();
        assert_eq!(settings.methods(), vec!["squash", "rebase"]);
        assert!(settings.delete_branch_on_merge);
        assert_eq!(
            RepoSettings::default().methods(),
            vec!["merge", "squash", "rebase"]
        );
    }

    #[test]
    fn the_offer_carries_readiness_and_settings() {
        let readiness = MergeReadiness {
            mergeable: "MERGEABLE".into(),
            state: "CLEAN".into(),
            review: "APPROVED".into(),
            head: "9e7d031".into(),
        };
        assert_eq!(
            offer_json(&readiness, &RepoSettings::default()),
            json!({
                "mergeable": "MERGEABLE",
                "state": "CLEAN",
                "review": "APPROVED",
                "head": "9e7d031",
                "methods": ["merge", "squash", "rebase"],
                "deletesBranch": false,
            })
        );
    }
}
