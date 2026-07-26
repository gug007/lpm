// "Bring changes": pull another Mac's exact working state for the same project
// — committed history plus its uncommitted, unignored edits — and land it here.
//
// Only git objects this Mac is missing cross the network, as one packfile over
// the existing peer socket. A brand-new copy is still an APFS clone of the local
// folder, so the bulk bytes never travel; the delta arrives once and the copy is
// born with it.
//
// This module is the command surface and its guards; `gitbringrun` drives the
// transfer, `gitbringapply` holds the git plumbing, `gitbringhost` answers on
// the Mac that has the work.
use crate::gitbringapply as ga;
use serde::Serialize;
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager};

const CANCELLED: &str = "cancelled";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BringTarget {
    name: String,
    root: String,
    worktree: bool,
    is_repo: bool,
    dirty: bool,
    // `pack-objects` never traverses gitlinks, so a submodule whose commit moved
    // on the other Mac lands here as a pointer to an object that was not sent.
    submodules: bool,
}

#[derive(Serialize, Clone)]
pub(crate) struct Progress<'a> {
    pub(crate) id: &'a str,
    pub(crate) phase: &'a str,
    pub(crate) received: u64,
    pub(crate) total: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) message: Option<&'a str>,
}

#[derive(Serialize, Clone, Default)]
pub(crate) struct Done {
    pub(crate) id: String,
    pub(crate) ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) project: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) branch: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) changed: Option<u64>,
}

fn cancelled() -> &'static Mutex<HashSet<String>> {
    static IDS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    IDS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn is_cancelled(id: &str) -> bool {
    cancelled().lock().unwrap().contains(id)
}

pub(crate) fn check_cancelled(id: &str) -> Result<(), String> {
    if is_cancelled(id) {
        return Err(CANCELLED.to_string());
    }
    Ok(())
}

fn is_slug(s: &str) -> bool {
    s.len() == 8 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// The frontend identifies a peer's project as `peer-<slug>-<name>` and its root
/// as `/@peer-<slug><hostPath>`; a dialog opened from the peer's sidebar row
/// holds those forms, one opened from the local row holds the bare ones. Both
/// name the same thing here, so accept either.
fn unmark(value: &str) -> &str {
    if let Some(rest) = value.strip_prefix("/@peer-") {
        if is_slug(rest.get(..8).unwrap_or_default()) && rest[8..].starts_with('/') {
            return &rest[8..];
        }
        return value;
    }
    if let Some(rest) = value.strip_prefix("peer-") {
        if is_slug(rest.get(..8).unwrap_or_default()) && rest[8..].starts_with('-') {
            return &rest[9..];
        }
    }
    value
}

/// Local root of a project that can take brought changes. SSH projects have no
/// local repo to land in, so they are refused up front.
pub(crate) fn local_root(name: &str) -> Result<String, String> {
    let (root, is_remote) = crate::config::project_root(name)?;
    if is_remote || root.trim().is_empty() {
        return Err(format!("{name} is an SSH project and has no local copy"));
    }
    Ok(root)
}

/// The project itself plus its copies, each with the state the dialog needs to
/// decide whether it can safely receive.
#[tauri::command(async)]
pub fn bring_changes_targets(project: String) -> Result<Vec<BringTarget>, String> {
    let project = unmark(&project);
    // The project itself always leads the list, so refuse rather than quietly
    // returning one that starts with a copy.
    local_root(project)?;
    let mut names = vec![project.to_string()];
    names.extend(crate::config::duplicates_of(project)?);
    Ok(names
        .into_iter()
        .filter_map(|name| {
            let root = local_root(&name).ok()?;
            let is_repo = ga::is_repo(&root);
            Some(BringTarget {
                worktree: crate::config::peek_worktree(&name),
                dirty: is_repo && ga::is_dirty(&root),
                submodules: std::path::Path::new(&root).join(".gitmodules").is_file(),
                is_repo,
                name,
                root,
            })
        })
        .collect())
}

pub(crate) struct Request {
    pub(crate) source_slug: String,
    pub(crate) source_root: String, // the project's path on the OTHER Mac, host-native
    pub(crate) project: String,     // the local project holding the object store
    pub(crate) mode: String,
    pub(crate) target: Option<String>,
    pub(crate) label: Option<String>,
}

/// Kick off a transfer. Everything cheap enough to fail fast is checked here so
/// the dialog gets a real error instead of an event; the rest runs on a thread
/// and reports through `bring-changes-progress` / `bring-changes-done`.
#[tauri::command(async)]
pub fn bring_changes_start(
    app: AppHandle,
    source_slug: String,
    source_root: String,
    project: String,
    mode: String,
    target: Option<String>,
    label: Option<String>,
) -> Result<String, String> {
    if !matches!(mode.as_str(), "current" | "existing" | "new") {
        return Err(format!("unknown target for the changes: {mode}"));
    }
    let source_root = unmark(source_root.trim()).to_string();
    let project = unmark(&project).to_string();
    let target = target.map(|t| unmark(t.trim()).to_string());
    if source_root.is_empty() {
        return Err("the other Mac did not report a project folder".into());
    }
    let hub = app
        .state::<crate::peerclient::PeerClientHub>()
        .inner()
        .clone();
    hub.require_git_bring(&source_slug)?;

    let root = local_root(&project)?;
    if !ga::is_repo(&root) {
        return Err(format!("{project} is not a Git repository"));
    }
    if let Some(dest) = landing_name(&mode, &project, target.as_deref())? {
        // The changes only ever land in this project or one of its copies —
        // never in an unrelated repo, whatever the dialog sent.
        if dest != project && !crate::config::duplicates_of(&project)?.contains(&dest) {
            return Err(format!("{dest} is not a copy of {project}"));
        }
        let dest_root = local_root(&dest)?;
        if !ga::is_repo(&dest_root) {
            return Err(format!("{dest} is not a Git repository"));
        }
        if ga::is_dirty(&dest_root) {
            return Err(format!(
                "{dest} has uncommitted changes — commit or discard them first, or bring the changes into a new copy"
            ));
        }
    }

    let id = uuid::Uuid::new_v4().to_string();
    let req = Request {
        source_slug,
        source_root,
        project,
        mode,
        target,
        label,
    };
    let (thread_app, thread_id) = (app.clone(), id.clone());
    std::thread::spawn(move || {
        let outcome = crate::gitbringrun::run(&thread_app, &hub, &req, &thread_id, &root);
        cancelled().lock().unwrap().remove(&thread_id);
        let done = match outcome {
            Ok(done) => done,
            Err(e) => Done {
                id: thread_id,
                ok: false,
                error: Some(e),
                ..Default::default()
            },
        };
        let _ = thread_app.emit("bring-changes-done", done);
    });
    Ok(id)
}

#[tauri::command(async)]
pub fn bring_changes_cancel(id: String) -> Result<(), String> {
    cancelled().lock().unwrap().insert(id);
    Ok(())
}

/// The existing project a run will write into, or None when it will create a new
/// copy (which is born clean and needs no check).
pub(crate) fn landing_name(
    mode: &str,
    project: &str,
    target: Option<&str>,
) -> Result<Option<String>, String> {
    match mode {
        "current" => Ok(Some(project.to_string())),
        "existing" => match target.map(str::trim).filter(|t| !t.is_empty()) {
            Some(t) => Ok(Some(t.to_string())),
            None => Err("choose which copy should receive the changes".into()),
        },
        _ => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn landing_name_resolves_the_project_for_the_current_mode() {
        assert_eq!(
            landing_name("current", "web", None).unwrap(),
            Some("web".to_string())
        );
    }

    #[test]
    fn landing_name_requires_a_chosen_copy_for_the_existing_mode() {
        assert_eq!(
            landing_name("existing", "web", Some("web-ab12cd")).unwrap(),
            Some("web-ab12cd".to_string())
        );
        assert!(landing_name("existing", "web", None).is_err());
        assert!(landing_name("existing", "web", Some("  ")).is_err());
    }

    #[test]
    fn landing_name_is_empty_for_a_new_copy() {
        assert_eq!(landing_name("new", "web", None).unwrap(), None);
        // A stale target from the dialog must not redirect a new-copy run.
        assert_eq!(landing_name("new", "web", Some("web-ab12cd")).unwrap(), None);
    }

    #[test]
    fn unmark_accepts_both_the_marked_and_the_bare_form() {
        assert_eq!(unmark("web"), "web");
        assert_eq!(unmark("peer-abcd1234-web"), "web");
        // Raw names can contain dashes; only the 8-char slug is the marker.
        assert_eq!(unmark("peer-00ff00ff-my-app-2"), "my-app-2");
        assert_eq!(unmark("/@peer-abcd1234/Users/dev/web"), "/Users/dev/web");
        assert_eq!(unmark("/Users/dev/web"), "/Users/dev/web");
    }

    #[test]
    fn unmark_leaves_anything_that_is_not_a_real_marker_alone() {
        assert_eq!(unmark("peer-ZZZZ1234-web"), "peer-ZZZZ1234-web"); // not hex
        assert_eq!(unmark("peer-abc-web"), "peer-abc-web"); // slug too short
        assert_eq!(unmark("peer-abcd1234"), "peer-abcd1234"); // no raw part
        assert_eq!(unmark("peer-web"), "peer-web");
        assert_eq!(unmark("/@peer-abcd1234"), "/@peer-abcd1234"); // no host path
        assert_eq!(unmark("/@peer-abcd1234x/y"), "/@peer-abcd1234x/y");
        assert_eq!(unmark(""), "");
        // A multi-byte lead must not panic on the slug slice.
        assert_eq!(unmark("peer-Ω-web"), "peer-Ω-web");
        assert_eq!(unmark("/@peer-Ωbcd1234/x"), "/@peer-Ωbcd1234/x");
    }

    #[test]
    fn cancelling_marks_the_transfer_and_clears_on_completion() {
        let id = uuid::Uuid::new_v4().to_string();
        assert!(check_cancelled(&id).is_ok());
        bring_changes_cancel(id.clone()).unwrap();
        assert_eq!(check_cancelled(&id).unwrap_err(), CANCELLED);
        cancelled().lock().unwrap().remove(&id);
        assert!(check_cancelled(&id).is_ok());
    }
}
