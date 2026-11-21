// Merging a branch's open pull request through `gh`, from the footer's PR card
// or the phone, and what both need before they offer to: the merge methods the
// repository allows and whether GitHub deletes the branch by itself. The working
// copy is never touched: only the remote branch goes, as GitHub's own button does.
use crate::pull_request::{
    branch_pull_request_with_merge, gh_out, MergeReadiness, PullRequestInfo,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

/// Repository settings change rarely; the CI sheet asks often.
const SETTINGS_FOR: Duration = Duration::from_secs(10 * 60);
/// Who may bypass a branch's rules changes as rarely; the card asks on every poll.
const BYPASS_FOR: Duration = Duration::from_secs(10 * 60);
const BYPASS_QUERY: &str = "query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){viewerCanMergeAsAdmin}}}";
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

fn bypass_cache() -> &'static Mutex<HashMap<(String, u64), (bool, Instant)>> {
    static CACHE: OnceLock<Mutex<HashMap<(String, u64), (bool, Instant)>>> = OnceLock::new();
    CACHE.get_or_init(Default::default)
}

/// Whether GitHub lets whoever `gh` is signed in as bypass the rules that hold
/// pull request `number` back (its "Bypass requirements"); false when it can't say.
pub fn can_bypass(root: &str, number: u64) -> bool {
    let key = (root.to_string(), number);
    if let Some((allowed, at)) = bypass_cache().lock().unwrap().get(&key) {
        if at.elapsed() < BYPASS_FOR {
            return *allowed;
        }
    }
    let query = format!("query={BYPASS_QUERY}");
    let number_field = format!("number={number}");
    let args = [
        "api",
        "graphql",
        "-f",
        &query,
        "-F",
        "owner={owner}",
        "-F",
        "repo={repo}",
        "-F",
        &number_field,
        "--jq",
        ".data.repository.pullRequest.viewerCanMergeAsAdmin",
    ];
    let Ok(out) = gh_out(root, &args) else {
        return false;
    };
    let allowed = out.trim() == "true";
    bypass_cache()
        .lock()
        .unwrap()
        .insert(key, (allowed, Instant::now()));
    allowed
}

/// The states bypassing the rules can get past: rules (a required check or
/// review, restricted updates) and a branch behind its base.
pub fn held_by_rules(readiness: &MergeReadiness) -> bool {
    matches!(readiness.state.as_str(), "BLOCKED" | "BEHIND")
}

/// What an agent is told to resolve the conflicts of a pull request GitHub
/// can't merge into its base; None while it merges cleanly.
pub fn resolve_prompt(pr: &PullRequestInfo) -> Option<String> {
    pr.merge
        .conflicts()
        .then(|| crate::ci_prompt::for_conflicts(pr.number, &pr.url, &pr.merge.base))
}

/// The current branch's open pull request with how GitHub stands on merging it
/// (`merge`, as the phone gets it), and while it conflicts with its base, what
/// an agent is told to resolve that. None when the branch has no open one.
#[tauri::command(async)]
pub fn pull_request_merge_offer(cwd: String) -> Option<Value> {
    // Both are a GitHub round trip; the repository's settings are usually
    // past their cache by the time someone merges again.
    let (pr, settings) = std::thread::scope(|scope| {
        let settings = scope.spawn(|| settings(&cwd));
        let pr = branch_pull_request_with_merge(&cwd);
        (pr, settings.join().unwrap_or_default())
    });
    let pr = pr.filter(|pr| pr.state == "OPEN")?;
    let mut reply = json!(pr);
    reply["merge"] = offer_json(&pr.merge, &settings);
    reply["merge"]["canBypass"] = json!(held_by_rules(&pr.merge) && can_bypass(&cwd, pr.number));
    if let Some(prompt) = resolve_prompt(&pr) {
        reply["resolvePrompt"] = json!(prompt);
    }
    Some(reply)
}

#[tauri::command(async)]
pub fn merge_pull_request(
    cwd: String,
    number: u64,
    method: String,
    head: String,
    delete_branch: bool,
    bypass: bool,
) -> Result<bool, String> {
    merge(&cwd, number, &method, &head, delete_branch, bypass)
}

/// Merge pull request `number` with `method`, only while its head is still
/// `head`, then delete its branch on GitHub when asked and GitHub doesn't do it
/// itself. `bypass` merges past the base branch's rules, as GitHub's "Bypass
/// requirements" does for someone allowed to. Ok(true) when the branch went
/// too. Every window, connected Mac and phone showing the branch hears of it,
/// wherever the merge came from.
pub fn merge(
    root: &str,
    number: u64,
    method: &str,
    head: &str,
    delete_branch: bool,
    bypass: bool,
) -> Result<bool, String> {
    if number == 0 {
        return Err("No pull request to merge".into());
    }
    let number = number.to_string();
    gh_out(root, &merge_args(&number, method, head, bypass)?)?;
    crate::gitmoved::announce(root);
    if !delete_branch || settings(root).delete_branch_on_merge {
        return Ok(delete_branch);
    }
    Ok(delete_remote_branch(root, &number))
}

/// `gh pr merge`'s flag for `method`.
pub fn method_flag(method: &str) -> Result<&'static str, String> {
    match method {
        "squash" => Ok("--squash"),
        "merge" => Ok("--merge"),
        "rebase" => Ok("--rebase"),
        _ => Err(format!("Unknown merge method “{method}”")),
    }
}

fn merge_args<'a>(
    number: &'a str,
    method: &str,
    head: &'a str,
    bypass: bool,
) -> Result<Vec<&'a str>, String> {
    let mut args = vec!["pr", "merge", number, method_flag(method)?];
    if !head.is_empty() {
        args.extend(["--match-head-commit", head]);
    }
    if bypass {
        args.push("--admin");
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
            merge_args("42", "squash", "9e7d031", false).unwrap(),
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
            merge_args("42", "rebase", "", true).unwrap(),
            vec!["pr", "merge", "42", "--rebase", "--admin"]
        );
        assert!(merge_args("42", "octopus", "", false).is_err());
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
            base: String::new(),
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
