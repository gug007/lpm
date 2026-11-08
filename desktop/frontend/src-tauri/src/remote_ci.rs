// CI on the phone, as the desktop footer shows it: the checks of the branch's
// open pull request, else of the commit the branch last pushed, with what
// Claude is told to fix them and a way to run the failed jobs again, and how
// each recent commit did for History's rows, and merging the pull request once
// it's ready. All ask GitHub, so they answer through the out-queue.
use crate::ci_checks::{branch_commit_checks, rerun_failed_checks};
use crate::ci_commits::recent_commit_checks;
use crate::pull_request::branch_pull_request_with_merge;
use crate::remote::git_result_reply;
use serde_json::{json, Value};
use std::sync::mpsc::SyncSender;

/// The phone may send `gitChecks` and `gitChecksRerun`.
pub const FEATURE: &str = "gitChecks";
/// The phone may send `gitCommitChecks`.
pub const COMMITS_FEATURE: &str = "gitCommitChecks";
/// The phone may send `gitMergePr`, and `gitChecks` carries each open pull
/// request's `merge`.
pub const MERGE_FEATURE: &str = "gitMerge";

pub fn handle(out: &SyncSender<String>, t: &str, v: &Value) {
    let out = out.clone();
    let verb = t.to_string();
    let v = v.clone();
    std::thread::spawn(move || {
        let project = v["project"].as_str().unwrap_or_default().to_string();
        let reply = match crate::config::project_root(&project) {
            Err(error) => git_result_reply(&verb, &project, Err(error)),
            Ok((root, _)) if verb == "gitChecksRerun" => {
                let ids = v["runIds"]
                    .as_array()
                    .map(|ids| {
                        ids.iter()
                            .filter_map(|id| id.as_str().map(str::to_string))
                            .collect()
                    })
                    .unwrap_or_default();
                git_result_reply(&verb, &project, rerun_failed_checks(root, ids))
            }
            Ok((root, _)) if verb == "gitMergePr" => merge_reply(&project, &root, &v),
            Ok((root, _)) if verb == "gitCommitChecks" => json!({
                "t": verb,
                "project": project,
                "ok": true,
                "commits": recent_commit_checks(root),
            }),
            Ok((root, _)) => checks_reply(&project, root),
        };
        let _ = out.try_send(reply.to_string());
    });
}

fn checks_reply(project: &str, root: String) -> Value {
    let branch = crate::label_git::read_branch(&root)
        .or_else(|| crate::git::git_out(&root, &["rev-parse", "--abbrev-ref", "HEAD"]).ok())
        .unwrap_or_default();
    let pr = branch_pull_request_with_merge(&root).filter(|pr| pr.state == "OPEN");
    let commit = if pr.is_none() {
        branch_commit_checks(root.clone())
    } else {
        None
    };
    let fix = pr
        .as_ref()
        .and_then(|pr| pr.fix_prompt.clone())
        .or_else(|| commit.as_ref().and_then(|c| c.fix_prompt.clone()));
    let mut reply = json!({
        "t": "gitChecks",
        "project": project,
        "ok": true,
        "branch": branch.trim(),
        "pr": pr.map(|pr| json!({
            "number": pr.number,
            "url": pr.url,
            "title": pr.title,
            "isDraft": pr.is_draft,
            "checks": pr.checks,
            "merge": crate::pull_request_merge::offer(&root, &pr.merge),
        })),
        "commit": commit,
    });
    if let Some(fix) = fix {
        reply["fixPrompt"] = json!(fix);
    }
    reply
}

fn merge_reply(project: &str, root: &str, v: &Value) -> Value {
    let number = v["number"].as_u64().unwrap_or_default();
    let method = v["method"].as_str().unwrap_or("squash");
    let head = v["head"].as_str().unwrap_or_default();
    let delete = v["deleteBranch"].as_bool().unwrap_or(false);
    if number == 0 {
        return git_result_reply(
            "gitMergePr",
            project,
            Err::<(), _>("No pull request to merge".into()),
        );
    }
    match crate::pull_request_merge::merge(root, number, method, head, delete) {
        Ok(deleted) => json!({
            "t": "gitMergePr",
            "project": project,
            "ok": true,
            "number": number,
            "deletedBranch": deleted,
        }),
        Err(error) => git_result_reply("gitMergePr", project, Err::<(), _>(error)),
    }
}
