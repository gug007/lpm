// CI on the phone, as the desktop footer shows it: the checks of the branch's
// open pull request, else of the commit the branch last pushed, with what
// Claude is told to fix them and a way to run the failed jobs again, and how
// each recent commit did for History's rows, and merging the pull request once
// it's ready, and keeping an agent fixing until the checks pass. All ask
// GitHub, so they answer through the out-queue.
use crate::ci_checks::{branch_commit_checks, rerun_failed_checks};
use crate::ci_commits::recent_commit_checks;
use crate::pr_merge_watch::MergeWatch;
use crate::pull_request::branch_pull_request_with_merge;
use crate::remote::git_result_reply;
use serde_json::{json, Value};
use std::sync::mpsc::SyncSender;
use tauri::AppHandle;

/// The phone may send `gitChecks` and `gitChecksRerun`.
pub const FEATURE: &str = "gitChecks";
/// The phone may send `gitCommitChecks`.
pub const COMMITS_FEATURE: &str = "gitCommitChecks";
/// The phone may send `gitMergePr`, and `gitChecks` carries each open pull
/// request's `merge`.
pub const MERGE_FEATURE: &str = "gitMerge";
/// The phone may send `ciFixLoop`, and `gitChecks` carries `fixLoop` and
/// `fixLoopPrompt`.
pub const FIX_LOOP_FEATURE: &str = "ciFixLoop";
/// The phone may send `gitMergePrWhenReady`, `gitMergePrCancel` and
/// `gitMergePr` with `bypass`; `gitChecks` carries `mergeWatch` and the offer's
/// `canBypass`, and `gitMergeWatch` frames say how an armed merge went.
pub const MERGE_WATCH_FEATURE: &str = "gitMergeWhenReady";

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
    let resolve = pr
        .as_ref()
        .and_then(crate::pull_request_merge::resolve_prompt);
    let merge_watch = crate::pr_merge_watch::pull_request_merge_watch(root.clone());
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
            "merge": merge_offer(&root, &pr),
        })),
        "commit": commit,
    });
    if let Some(fix) = fix {
        reply["fixLoopPrompt"] = json!(crate::ci_fix_loop::first_prompt(&fix));
        reply["fixPrompt"] = json!(fix);
    }
    if let Some(fix_loop) = crate::ci_fix_loop::current(project) {
        reply["fixLoop"] = json!(fix_loop);
    }
    if let Some(resolve) = resolve {
        reply["resolvePrompt"] = json!(resolve);
    }
    if let Some(watch) = merge_watch {
        reply["mergeWatch"] = json!(watch);
    }
    reply
}

/// The offer with whether this person may merge past the base branch's rules,
/// asked of GitHub only while they hold it back.
fn merge_offer(root: &str, pr: &crate::pull_request::PullRequestInfo) -> Value {
    use crate::pull_request_merge::{can_bypass, held_by_rules, offer};
    std::thread::scope(|scope| {
        let bypass = held_by_rules(&pr.merge).then(|| scope.spawn(|| can_bypass(root, pr.number)));
        let mut offer = offer(root, &pr.merge);
        if let Some(bypass) = bypass {
            offer["canBypass"] = json!(bypass.join().unwrap_or(false));
        }
        offer
    })
}

/// `gitMergePrWhenReady` arms the Mac's wait to merge the project's pull request
/// once its checks pass (pr_merge_watch.rs, the PR card's "When checks pass");
/// `gitMergePrCancel` stops it. How it goes after that reaches every phone as
/// `gitMergeWatch`.
pub fn handle_merge_watch(app: &AppHandle, out: &SyncSender<String>, t: &str, v: &Value) {
    let project = v["project"].as_str().unwrap_or_default().to_string();
    let result = crate::config::project_root(&project).and_then(|(root, _)| {
        if t == "gitMergePrCancel" {
            crate::pr_merge_watch::cancel_pull_request_merge(app.clone(), root);
            return Ok(());
        }
        crate::pr_merge_watch::merge_pull_request_when_ready(
            app.clone(),
            root,
            v["number"].as_u64().unwrap_or_default(),
            v["title"].as_str().unwrap_or_default().to_string(),
            v["method"].as_str().unwrap_or("squash").to_string(),
            v["deleteBranch"].as_bool().unwrap_or(false),
            v["bypass"].as_bool().unwrap_or(false),
        )
    });
    let _ = out.try_send(git_result_reply(t, &project, result).to_string());
}

/// `ciFixLoop`: `on` arms Keep fixing until green for the project's next fix
/// tab, naming its `agent`; off stops it. Every change after this reaches every
/// phone as the same frame.
pub fn handle_fix_loop(app: &AppHandle, out: &SyncSender<String>, v: &Value) {
    let (app, out) = (app.clone(), out.clone());
    let project = v["project"].as_str().unwrap_or_default().to_string();
    let on = v["on"].as_bool().unwrap_or(false);
    let agent = v["agent"].as_str().unwrap_or_default().to_string();
    std::thread::spawn(move || {
        let reply = if on {
            crate::ci_fix_loop::start(&app, &project, &agent).map(Some)
        } else {
            Ok(crate::ci_fix_loop::cancel(&app, &project))
        };
        let mut reply = match reply {
            Ok(fix_loop) => json!({ "ok": true, "loop": fix_loop }),
            Err(error) => json!({ "ok": false, "error": error }),
        };
        reply["t"] = json!("ciFixLoop");
        reply["project"] = json!(project);
        let _ = out.try_send(reply.to_string());
    });
}

fn merge_reply(project: &str, root: &str, v: &Value) -> Value {
    let number = v["number"].as_u64().unwrap_or_default();
    let method = v["method"].as_str().unwrap_or("squash");
    let head = v["head"].as_str().unwrap_or_default();
    let delete = v["deleteBranch"].as_bool().unwrap_or(false);
    let bypass = v["bypass"].as_bool().unwrap_or(false);
    match crate::pull_request_merge::merge(root, number, method, head, delete, bypass) {
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

/// How the merge armed for a checkout stands, to every phone showing a project
/// there (`gitMergeWatch`), and how one ended to a phone that is away, as the
/// branch's CI alert.
pub fn watch_changed(app: &AppHandle, watch: &MergeWatch) {
    let (app, watch) = (app.clone(), watch.clone());
    std::thread::spawn(move || {
        let path = std::path::Path::new(&watch.path);
        let projects: Vec<String> = crate::config::project_names()
            .into_iter()
            .filter(|name| {
                crate::config::project_root(name).is_ok_and(|(root, remote)| {
                    !remote && crate::adopt::same_folder(std::path::Path::new(&root), path)
                })
            })
            .collect();
        for project in &projects {
            crate::remote::broadcast_frame(
                &app,
                json!({ "t": "gitMergeWatch", "project": project, "watch": watch }),
            );
        }
        let ended = matches!(watch.state, "merged" | "stopped");
        if let (true, Some(project)) = (ended, projects.first()) {
            let branch = crate::label_git::read_branch(&watch.path).unwrap_or_default();
            let (title, body) = crate::pr_merge_watch::banner_text(&watch);
            let label = crate::config::project_display_name(project);
            crate::remote::push_branch_ci_alert(
                &app,
                project,
                branch.trim(),
                &format!("{label} · {title}"),
                &body,
            );
        }
    });
}
