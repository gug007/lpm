// Merging a branch's pull request once its checks pass, for the footer's PR
// card. GitHub's own auto-merge needs a repository setting and required checks
// that most repositories don't have, so lpm follows the checks itself and
// merges the moment the last one passes. One wait per checkout, for as long as
// lpm runs; it ends when it merges, something stops it, or it is cancelled.
use crate::notifychannels::NotificationEvent;
use crate::pull_request::{branch_pull_request_with_merge, PullRequestInfo};
use crate::pull_request_merge::{held_by_rules, merge, method_flag};
use crate::statusnotify::{notify, should_notify};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

pub const EVENT: &str = "pr-merge-watch";

const POLL_EVERY: Duration = Duration::from_secs(20);
/// Checks still running after this long are taken to be stuck.
const GIVE_UP_AFTER: Duration = Duration::from_secs(6 * 60 * 60);
/// `gh` failing this many times in a row (offline, signed out) ends the wait.
const MAX_MISSES: u32 = 15;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MergeWatch {
    pub path: String,
    pub number: u64,
    pub title: String,
    pub method: String,
    pub delete_branch: bool,
    /// Merge past the base branch's rules if they still hold it back once the
    /// checks pass. Only set when GitHub said this person may.
    pub bypass: bool,
    /// "waiting", then "merged", "stopped" or "cancelled".
    pub state: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    pub deleted_branch: bool,
}

struct Armed {
    id: u64,
    watch: MergeWatch,
}

fn armed() -> &'static Mutex<HashMap<String, Armed>> {
    static ARMED: OnceLock<Mutex<HashMap<String, Armed>>> = OnceLock::new();
    ARMED.get_or_init(Default::default)
}

fn is_current(path: &str, id: u64) -> bool {
    armed()
        .lock()
        .unwrap()
        .get(path)
        .is_some_and(|a| a.id == id)
}

#[tauri::command]
pub fn merge_pull_request_when_ready(
    app: AppHandle,
    cwd: String,
    number: u64,
    title: String,
    method: String,
    delete_branch: bool,
    bypass: bool,
) -> Result<(), String> {
    if number == 0 {
        return Err("No pull request to merge".into());
    }
    method_flag(&method)?;
    static NEXT_ID: AtomicU64 = AtomicU64::new(1);
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let watch = MergeWatch {
        path: cwd.clone(),
        number,
        title,
        method,
        delete_branch,
        bypass,
        state: "waiting",
        reason: None,
        deleted_branch: false,
    };
    armed().lock().unwrap().insert(
        cwd.clone(),
        Armed {
            id,
            watch: watch.clone(),
        },
    );
    tell(&app, &watch);
    std::thread::spawn(move || follow(app, cwd, id));
    Ok(())
}

#[tauri::command]
pub fn cancel_pull_request_merge(app: AppHandle, cwd: String) {
    let removed = armed().lock().unwrap().remove(&cwd);
    if let Some(a) = removed {
        tell(
            &app,
            &MergeWatch {
                state: "cancelled",
                ..a.watch
            },
        );
    }
}

/// Every window, and every phone showing a project at that checkout.
fn tell(app: &AppHandle, watch: &MergeWatch) {
    let _ = app.emit(EVENT, watch);
    crate::remote_ci::watch_changed(app, watch);
}

/// The wait armed for the checkout at `cwd`, if any.
#[tauri::command]
pub fn pull_request_merge_watch(cwd: String) -> Option<MergeWatch> {
    armed().lock().unwrap().get(&cwd).map(|a| a.watch.clone())
}

#[derive(Debug, PartialEq)]
enum Next {
    Wait,
    Merge { head: String, bypass: bool },
    Merged,
    Stop(String),
}

fn follow(app: AppHandle, path: String, id: u64) {
    let started = Instant::now();
    let mut misses = 0;
    loop {
        let Some(watch) = current(&path, id) else {
            return;
        };
        let next = match branch_pull_request_with_merge(&path) {
            Some(pr) => {
                misses = 0;
                decide(&pr, &watch, started.elapsed())
            }
            None => {
                misses += 1;
                if misses < MAX_MISSES {
                    Next::Wait
                } else {
                    Next::Stop("lpm couldn't read the pull request from GitHub.".into())
                }
            }
        };
        if !is_current(&path, id) {
            return;
        }
        match next {
            Next::Wait => sleep_while_current(&path, id, POLL_EVERY),
            Next::Merged => return finish(&app, &path, id, Ok(false)),
            Next::Stop(reason) => return finish(&app, &path, id, Err(reason)),
            Next::Merge { head, bypass } => {
                let result = merge(
                    &path,
                    watch.number,
                    &watch.method,
                    &head,
                    watch.delete_branch,
                    bypass,
                );
                return finish(&app, &path, id, result);
            }
        }
    }
}

fn current(path: &str, id: u64) -> Option<MergeWatch> {
    let armed = armed().lock().unwrap();
    armed
        .get(path)
        .filter(|a| a.id == id)
        .map(|a| a.watch.clone())
}

fn sleep_while_current(path: &str, id: u64, total: Duration) {
    let step = Duration::from_secs(1);
    let mut slept = Duration::ZERO;
    while slept < total && is_current(path, id) {
        std::thread::sleep(step);
        slept += step;
    }
}

/// What to do about `pr`, armed as `watch`, `waited` after arming.
fn decide(pr: &PullRequestInfo, watch: &MergeWatch, waited: Duration) -> Next {
    if pr.number != watch.number {
        return Next::Stop("The branch has another pull request now.".into());
    }
    match pr.state.as_str() {
        "MERGED" => return Next::Merged,
        "CLOSED" => return Next::Stop("The pull request was closed.".into()),
        _ => {}
    }
    let merge = &pr.merge;
    let base = if merge.base.is_empty() {
        "its base branch"
    } else {
        merge.base.as_str()
    };
    if pr.is_draft || merge.state == "DRAFT" {
        return Next::Stop("It was turned back into a draft.".into());
    }
    let failed: Vec<&str> = pr
        .checks
        .iter()
        .filter(|c| c.state == "fail")
        .map(|c| c.name.as_str())
        .collect();
    match failed.as_slice() {
        [] => {}
        [one] => return Next::Stop(format!("{one} failed.")),
        many => return Next::Stop(format!("{} checks failed.", many.len())),
    }
    let waiting = pr.checks.iter().any(|c| c.state == "pending");
    if merge.conflicts() {
        return Next::Stop(format!("It conflicts with {base}."));
    }
    let settled =
        matches!(merge.state.as_str(), "CLEAN" | "HAS_HOOKS" | "UNSTABLE") || held_by_rules(merge);
    if waiting || !settled {
        return if waited >= GIVE_UP_AFTER {
            Next::Stop("Its checks were still running after 6 hours.".into())
        } else {
            Next::Wait
        };
    }
    let head = merge.head.clone();
    if !held_by_rules(merge) {
        return Next::Merge {
            head,
            bypass: false,
        };
    }
    match merge.review.as_str() {
        "CHANGES_REQUESTED" => Next::Stop("A reviewer asked for changes.".into()),
        "REVIEW_REQUIRED" => Next::Stop("A review is required before merging.".into()),
        _ if watch.bypass => Next::Merge { head, bypass: true },
        _ if merge.state == "BEHIND" => Next::Stop(format!(
            "The branch is behind {base}. Update it, then merge."
        )),
        _ => Next::Stop(format!("The rules on {base} don't allow merging yet.")),
    }
}

/// Ends the wait with how it went (Ok: merged, and whether the branch went
/// too), says so in the app, on connected Macs, and in a banner.
fn finish(app: &AppHandle, path: &str, id: u64, result: Result<bool, String>) {
    let Some(armed) = ({
        let mut map = armed().lock().unwrap();
        match map.get(path) {
            Some(a) if a.id == id => map.remove(path),
            _ => None,
        }
    }) else {
        return;
    };
    let watch = match result {
        Ok(deleted_branch) => MergeWatch {
            state: "merged",
            deleted_branch,
            ..armed.watch
        },
        Err(reason) => MergeWatch {
            state: "stopped",
            reason: Some(reason),
            ..armed.watch
        },
    };
    tell(app, &watch);
    if should_notify(app, NotificationEvent::Ci) {
        let (title, body) = banner_text(&watch);
        notify(app, &title, &body);
    }
}

pub(crate) fn banner_text(watch: &MergeWatch) -> (String, String) {
    if watch.state == "merged" {
        return (format!("Merged #{}", watch.number), watch.title.clone());
    }
    (
        format!("Stopped waiting to merge #{}", watch.number),
        watch.reason.clone().unwrap_or_default(),
    )
}

#[cfg(test)]
#[path = "pr_merge_watch_tests.rs"]
mod tests;
