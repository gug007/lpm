// Merging a GitLab merge request from the footer's card or the phone, as
// pull_request_merge.rs does on GitHub. GitLab has one merge method per
// project and a squash switch beside it, so "merge" and "squash" are the
// choices, and the source branch goes in the same request when asked.
use crate::githost::{glab_api, GitLabRepo};
use serde_json::Value;

/// Whether a plain merge and a squash are allowed, from the project's squash
/// setting; None when GitLab can't say.
pub(crate) fn methods_allowed(cwd: &str, repo: &GitLabRepo) -> Option<(bool, bool)> {
    let json = glab_api(cwd, repo, &format!("projects/{}", repo.api_project()), &[]).ok()?;
    let project: Value = serde_json::from_str(&json).ok()?;
    Some(allowed_by(
        project["squash_option"].as_str().unwrap_or_default(),
    ))
}

fn allowed_by(squash_option: &str) -> (bool, bool) {
    match squash_option {
        "always" => (false, true),
        "never" => (true, false),
        _ => (true, true),
    }
}

/// Merge `iid` now, only while its head is still `head`, removing its source
/// branch when asked. Ok(true) when the branch went too.
pub(crate) fn merge(
    cwd: &str,
    repo: &GitLabRepo,
    iid: u64,
    method: &str,
    head: &str,
    delete_branch: bool,
) -> Result<bool, String> {
    let fields = fields(method, head, delete_branch)?;
    let mut args: Vec<&str> = vec!["-X", "PUT"];
    for (flag, field) in &fields {
        args.extend([*flag, field.as_str()]);
    }
    let endpoint = format!("projects/{}/merge_requests/{iid}/merge", repo.api_project());
    let json = glab_api(cwd, repo, &endpoint, &args).map_err(|e| explain(&e))?;
    let merged: Value = serde_json::from_str(&json).unwrap_or_default();
    match merged["state"].as_str() {
        Some("merged") | None => Ok(delete_branch),
        Some(other) => Err(format!("GitLab left it {other}")),
    }
}

fn fields(
    method: &str,
    head: &str,
    delete_branch: bool,
) -> Result<Vec<(&'static str, String)>, String> {
    let squash = match method {
        "squash" => true,
        "merge" => false,
        _ => {
            return Err(format!(
                "GitLab can't merge with “{method}”: pick merge or squash"
            ))
        }
    };
    let mut fields = vec![
        ("-F", format!("squash={squash}")),
        ("-F", format!("should_remove_source_branch={delete_branch}")),
    ];
    if !head.is_empty() {
        fields.push(("-f", format!("sha={head}")));
    }
    Ok(fields)
}

/// GitLab answers a refused merge with a bare status; say what it means.
fn explain(err: &str) -> String {
    if err.contains("409") || err.contains("SHA does not match") {
        "The merge request has new commits since you looked. Look again, then merge.".into()
    } else if err.contains("405") || err.contains("Method Not Allowed") {
        "GitLab won't merge it yet: a pipeline, an approval or an open thread is holding it back."
            .into()
    } else if err.contains("406") || err.contains("Branch cannot be merged") {
        "GitLab can't merge it: it conflicts with its target branch.".into()
    } else {
        err.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_squash_setting_decides_the_methods() {
        assert_eq!(allowed_by("always"), (false, true));
        assert_eq!(allowed_by("never"), (true, false));
        assert_eq!(allowed_by("default_on"), (true, true));
        assert_eq!(allowed_by(""), (true, true));
    }

    #[test]
    fn a_merge_pins_the_head_and_asks_for_the_branch_to_go() {
        assert_eq!(
            fields("squash", "9e7d031", true).unwrap(),
            vec![
                ("-F", "squash=true".to_string()),
                ("-F", "should_remove_source_branch=true".to_string()),
                ("-f", "sha=9e7d031".to_string()),
            ]
        );
        assert_eq!(fields("merge", "", false).unwrap().len(), 2);
        assert!(fields("rebase", "", false).is_err());
    }

    #[test]
    fn refusals_say_why() {
        assert!(explain("409 Conflict").starts_with("The merge request has new commits"));
        assert!(explain("405 Method Not Allowed").starts_with("GitLab won't merge it yet"));
        assert_eq!(explain("boom"), "boom");
    }
}
