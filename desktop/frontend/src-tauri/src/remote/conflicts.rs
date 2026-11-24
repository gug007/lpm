//! Merge conflicts on the phone: what Review Changes shows of a merge, pull or
//! rebase that stopped on them, and the desktop Merge dialog's actions on it.
//! An AI takes minutes and a locked phone drops its socket long before, so its
//! run belongs to the Mac (gitresolve_run.rs) and every step goes to each phone.
use super::{broadcast, git_ai_opts, git_result_reply, has_clients, RemoteHub};
use crate::gitresolve::MergeState;
use crate::gitresolve_run::{self, Run};
use crate::ignoredhost::str_arg;
use crate::{config, gitresolve};
use serde_json::{json, Value};
use std::sync::mpsc::SyncSender;
use tauri::{AppHandle, Listener};

/// `git` carries `merge`, and the phone may send `gitMerge…` and `gitConflict…`.
pub(super) const FEATURE: &str = "gitConflicts";

/// Worth showing: files left to resolve, or a merge that only needs committing.
fn needs_resolving(state: &MergeState) -> bool {
    state.files.iter().any(|f| !f.resolved) || (state.merging && !state.files.is_empty())
}

/// The `merge` field of a `git` reply, while there is something to resolve.
/// `conflicted` says the status scan already saw an unmerged file.
pub(super) fn merge_state(cwd: &str, conflicted: bool) -> Option<Value> {
    if !conflicted && !gitresolve::merging(cwd) {
        return None;
    }
    let state = gitresolve::git_merge_state(cwd.to_string());
    if !needs_resolving(&state) {
        return None;
    }
    serde_json::to_value(&state).ok()
}

/// Off the read loop: a merge commit runs the project's hooks, and an SSH
/// project's git is a round trip away.
pub(super) fn handle(app: &AppHandle, out: &SyncSender<String>, t: &str, v: &Value) {
    let (app, out, t, v) = (app.clone(), out.clone(), t.to_string(), v.clone());
    std::thread::spawn(move || {
        let project = str_arg(&v, "project");
        let reply = |r| {
            let _ = out.try_send(git_result_reply(&t, project, r).to_string());
        };
        let cwd = match config::project_root(project) {
            Ok((cwd, _)) => cwd,
            Err(e) => return reply(Err(e)),
        };
        match t.as_str() {
            "gitMergeResolve" => match begin(&app, project, &cwd) {
                Ok(run) => {
                    reply(Ok(()));
                    let (cli, model, effort, fast) = git_ai_opts();
                    let _ = crate::aigen::resolve_conflicts(run, &cli, model, effort, fast, |_| {});
                }
                Err(e) => reply(Err(e)),
            },
            _ => reply(act(&t, &cwd, &v)),
        }
    });
}

fn begin(app: &AppHandle, project: &str, cwd: &str) -> Result<Run, String> {
    if crate::gitconflict::unmerged_files(cwd).is_empty() {
        return Err("There are no conflicts left to resolve.".into());
    }
    let gen_id = uuid::Uuid::new_v4().to_string();
    Run::begin(app, Some(project), cwd, &gen_id)
}

fn act(t: &str, cwd: &str, v: &Value) -> Result<(), String> {
    let (cwd, path) = (cwd.to_string(), str_arg(v, "path").to_string());
    match t {
        "gitMergeStop" => gitresolve_run::git_stop_conflict_ai(cwd),
        "gitMergeAbort" => crate::git::git_abort_merge(cwd),
        "gitMergeContinue" => gitresolve::git_continue_merge(cwd),
        "gitConflictTake" => {
            gitresolve::git_take_conflict_side(cwd, path, str_arg(v, "side").into())
        }
        "gitConflictResolved" => gitresolve::git_mark_conflict_resolved(cwd, path),
        _ => Err(format!("unknown request {t:?}")),
    }
}

/// Every phone hears each step of an AI run on a project's conflicts.
pub(super) fn install(hub: &RemoteHub, app: &AppHandle) {
    let hub = hub.clone();
    app.listen(gitresolve_run::EVENT, move |e| {
        if !has_clients(&hub) {
            return;
        }
        if let Ok(mut step) = serde_json::from_str::<Value>(e.payload()) {
            step["t"] = json!("gitMergeRun");
            broadcast(&hub, step);
        }
    });
}

#[cfg(test)]
#[path = "conflicts_tests.rs"]
mod tests;
