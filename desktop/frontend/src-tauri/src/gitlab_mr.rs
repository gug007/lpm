// A GitLab checkout's merge request through `glab api`, shaped as the pull
// request lpm already shows: the footer pill and its card, the phone's CI
// sheet, merged-copy marks. GitLab's merge status is put in GitHub's words
// (pull_request.rs), so everything that reads them works unchanged.
use crate::githost::{glab_api, GitLabRepo};
use crate::pull_request::{MergeReadiness, PrCheck, PullRequestInfo};
use serde::Deserialize;

pub(crate) const HOST: &str = "gitlab";

#[derive(Deserialize, Default, Clone)]
#[serde(default)]
struct Mr {
    iid: u64,
    web_url: String,
    state: String,
    title: String,
    description: String,
    draft: bool,
    work_in_progress: bool,
    sha: String,
    target_branch: String,
    detailed_merge_status: String,
    merge_status: String,
    has_conflicts: bool,
    source_project_id: u64,
    target_project_id: u64,
    head_pipeline: Option<HeadPipeline>,
}

#[derive(Deserialize, Default, Clone)]
#[serde(default)]
struct HeadPipeline {
    id: u64,
}

/// The merge request for `cwd`'s current branch: an open one first, else the
/// newest merged or closed, as `gh pr view` picks. Only the project's own
/// branches count, so a fork's branch of the same name never answers.
pub(crate) fn branch_merge_request(cwd: &str, repo: &GitLabRepo) -> Option<PullRequestInfo> {
    let mr = find(cwd, repo)?;
    let checks = match (&mr.head_pipeline, mr.state.as_str()) {
        (Some(pipeline), "opened") if pipeline.id > 0 => {
            crate::gitlab_ci::pipeline_checks(cwd, repo, pipeline.id)
        }
        _ => Vec::new(),
    };
    Some(info(mr, checks))
}

/// The branch's merge request as `(iid, title, url, description)`, for its
/// discussion (gitlab_review.rs).
pub(crate) fn heading(cwd: &str, repo: &GitLabRepo) -> Option<(u64, String, String, String)> {
    let mr = find(cwd, repo)?;
    let title = plain_title(&mr.title, mr.draft || mr.work_in_progress).to_string();
    Some((mr.iid, title, mr.web_url, mr.description))
}

fn find(cwd: &str, repo: &GitLabRepo) -> Option<Mr> {
    let branch = crate::git::git_out(cwd, &["rev-parse", "--abbrev-ref", "HEAD"]).ok()?;
    let branch = branch.trim();
    if branch.is_empty() || branch == "HEAD" {
        return None;
    }
    let list = format!(
        "projects/{}/merge_requests?source_branch={}&order_by=updated_at&sort=desc&per_page=20",
        repo.api_project(),
        urlencoding::encode(branch)
    );
    let listed: Vec<Mr> = serde_json::from_str(&glab_api(cwd, repo, &list, &[]).ok()?).ok()?;
    let picked = pick(&listed)?;
    let one = format!(
        "projects/{}/merge_requests/{}",
        repo.api_project(),
        picked.iid
    );
    let mr = glab_api(cwd, repo, &one, &[])
        .ok()
        .and_then(|json| serde_json::from_str::<Mr>(&json).ok())
        .filter(|mr| mr.iid == picked.iid)
        .unwrap_or(picked);
    Some(mr)
}

fn pick(listed: &[Mr]) -> Option<Mr> {
    let own: Vec<&Mr> = listed
        .iter()
        .filter(|mr| mr.iid > 0 && mr.source_project_id == mr.target_project_id)
        .collect();
    own.iter()
        .find(|mr| mr.state == "opened")
        .or_else(|| own.first())
        .map(|mr| (*mr).clone())
}

fn info(mr: Mr, checks: Vec<PrCheck>) -> PullRequestInfo {
    let state = match mr.state.as_str() {
        "opened" => "OPEN",
        "merged" => "MERGED",
        _ => "CLOSED",
    };
    let is_draft = mr.draft || mr.work_in_progress;
    let mut merge = readiness(&mr, &checks);
    if is_draft && merge.mergeable != "CONFLICTING" {
        merge.state = "DRAFT".into();
    }
    let fix_prompt = (state == "OPEN")
        .then(|| fix_prompt(mr.iid, &mr.web_url, &checks))
        .flatten();
    PullRequestInfo {
        number: mr.iid,
        title: plain_title(&mr.title, is_draft).to_string(),
        url: mr.web_url,
        state: state.into(),
        is_draft,
        head_merged: false,
        checks,
        merge,
        fix_prompt,
        host: Some(HOST),
    }
}

/// GitLab keeps a draft's marker in its title; GitHub shows it apart.
fn plain_title(title: &str, draft: bool) -> &str {
    if !draft {
        return title;
    }
    for marker in ["Draft:", "[Draft]", "(Draft)", "WIP:", "[WIP]"] {
        if let Some(rest) = title.strip_prefix(marker) {
            return rest.trim_start();
        }
    }
    title
}

/// GitLab's `detailed_merge_status` in GitHub's mergeable / mergeStateStatus /
/// reviewDecision words. A merge request GitLab would take while some job
/// fails is GitHub's UNSTABLE.
fn readiness(mr: &Mr, checks: &[PrCheck]) -> MergeReadiness {
    let failing = checks.iter().any(|c| c.state == "fail");
    let (mergeable, state, review) = match mr.detailed_merge_status.as_str() {
        _ if mr.has_conflicts => ("CONFLICTING", "DIRTY", ""),
        "mergeable" if failing => ("MERGEABLE", "UNSTABLE", ""),
        "mergeable" => ("MERGEABLE", "CLEAN", ""),
        "conflict" => ("CONFLICTING", "DIRTY", ""),
        "need_rebase" => ("MERGEABLE", "BEHIND", ""),
        "draft_status" => ("MERGEABLE", "DRAFT", ""),
        "not_approved" => ("MERGEABLE", "BLOCKED", "REVIEW_REQUIRED"),
        "requested_changes" => ("MERGEABLE", "BLOCKED", "CHANGES_REQUESTED"),
        "checking" | "unchecked" | "preparing" | "approvals_syncing" | "not_open" => {
            ("UNKNOWN", "UNKNOWN", "")
        }
        "" => match mr.merge_status.as_str() {
            "can_be_merged" if failing => ("MERGEABLE", "UNSTABLE", ""),
            "can_be_merged" => ("MERGEABLE", "CLEAN", ""),
            "cannot_be_merged" => ("CONFLICTING", "DIRTY", ""),
            _ => ("UNKNOWN", "UNKNOWN", ""),
        },
        _ => ("MERGEABLE", "BLOCKED", ""),
    };
    MergeReadiness {
        mergeable: mergeable.into(),
        state: state.into(),
        review: review.into(),
        head: mr.sha.clone(),
        base: mr.target_branch.clone(),
    }
}

/// What an agent is told while an open merge request's jobs fail.
pub(crate) fn fix_prompt(iid: u64, url: &str, checks: &[PrCheck]) -> Option<String> {
    use crate::ci_prompt::{link, prompt, workflow_name};
    prompt(
        format!("CI jobs are failing on merge request !{iid} ({url}):"),
        checks,
        |c| format!("- {}{}", workflow_name(c), link(&c.url)),
        None,
        |url| crate::gitlab_ci::job_id(url).map(|id| format!("`glab ci trace {id}`")),
    )
}

/// What an agent is told to resolve a merge request's conflicts.
pub(crate) fn conflicts_prompt(iid: u64, url: &str, base: &str) -> String {
    crate::ci_prompt::conflicts(
        &format!("Merge request !{iid}"),
        url,
        "target",
        base,
        "its target branch".into(),
    )
}

/// Open a merge request from `branch` into `base` (the project's default
/// branch when empty), answering its URL as `gh pr create` does.
pub(crate) fn create(
    cwd: &str,
    repo: &GitLabRepo,
    branch: &str,
    title: &str,
    body: &str,
    base: &str,
    draft: bool,
) -> Result<String, String> {
    let target = if base.trim().is_empty() {
        default_branch(cwd, repo)?
    } else {
        base.trim().to_string()
    };
    let title = if draft {
        format!("Draft: {title}")
    } else {
        title.to_string()
    };
    let fields = [
        format!("source_branch={branch}"),
        format!("target_branch={target}"),
        format!("title={title}"),
        format!("description={body}"),
    ];
    let mut args: Vec<&str> = vec!["-X", "POST"];
    for field in &fields {
        args.extend(["-f", field.as_str()]);
    }
    let endpoint = format!("projects/{}/merge_requests", repo.api_project());
    let json = glab_api(cwd, repo, &endpoint, &args)?;
    created_url(&json)
        .ok_or_else(|| format!("GitLab didn't say where the merge request is: {json}"))
}

fn created_url(json: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(json).ok()?;
    value["web_url"]
        .as_str()
        .filter(|url| !url.is_empty())
        .map(str::to_string)
}

fn default_branch(cwd: &str, repo: &GitLabRepo) -> Result<String, String> {
    let json = glab_api(cwd, repo, &format!("projects/{}", repo.api_project()), &[])?;
    serde_json::from_str::<serde_json::Value>(&json)
        .ok()
        .and_then(|v| v["default_branch"].as_str().map(str::to_string))
        .filter(|b| !b.is_empty())
        .ok_or_else(|| "GitLab didn't name the project's default branch".into())
}

#[cfg(test)]
#[path = "gitlab_mr_tests.rs"]
mod tests;
