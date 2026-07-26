// "Sync to this Mac": take a project that lives on a paired Mac and give it a
// local folder here that keeps matching it.
//
// This is the setup half — pick a free name and a sensible parent folder, create
// the repo, register it as a project, and run the first transfer, which carries
// the history because nothing local exists yet. From then on `gitfollow` keeps it
// in step, so the last thing this does on success is record the follow.
//
// Nothing is left half-made: a setup that fails at any point removes the folder
// and the project it created.
use crate::gitbring::{self, Done, Follow, Request};
use crate::gitbringrun::progress;
use crate::gitfollowstore::{self as store, Follow as FollowRecord};
use crate::peerclient::PeerClientHub;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};

/// Tried in order when this Mac has no projects to take a hint from.
const FALLBACK_PARENTS: [&str; 2] = ["Projects", "Developer"];

/// Begin syncing a paired Mac's project here. Everything cheap enough to fail
/// fast is checked before returning, so the UI gets a real error rather than an
/// event; the transfer itself runs on a thread and reports through
/// `sync-progress`, ending in one `sync-done`.
#[tauri::command(async)]
pub fn sync_project_start(
    app: AppHandle,
    slug: String,
    source_root: String,
    remote_name: String,
) -> Result<String, String> {
    let source_root = gitbring::unmark(source_root.trim()).to_string();
    let remote_name = gitbring::unmark(remote_name.trim()).to_string();
    if source_root.is_empty() {
        return Err("the other Mac did not report a project folder".into());
    }
    let hub = app.state::<PeerClientHub>().inner().clone();
    hub.require_git_bring(&slug)?;
    hub.require_git_follow(&slug)?;
    if let Some(existing) = store::load()
        .into_iter()
        .find(|f| f.slug == slug && f.source_root == source_root)
    {
        return Err(format!(
            "already syncing to {} — stop that first to start again",
            existing.project
        ));
    }

    let (project, root) = plan_local_copy(&remote_name)?;
    let id = uuid::Uuid::new_v4().to_string();
    let (thread_app, thread_id) = (app.clone(), id.clone());
    std::thread::spawn(move || {
        let outcome = set_up(&thread_app, &hub, &slug, &source_root, &project, &root, &thread_id);
        gitbring::forget_cancel(&thread_id);
        let done = match outcome {
            Ok(done) => done,
            Err(error) => {
                discard_partial(&project, &root);
                Done {
                    id: thread_id,
                    ok: false,
                    // A transfer the user stopped is not a failure to report back.
                    error: Some(error).filter(|e| !gitbring::was_cancelled(e)),
                    ..Default::default()
                }
            }
        };
        let _ = thread_app.emit("sync-done", done);
        let _ = thread_app.emit("projects-changed", ());
    });
    Ok(id)
}

#[tauri::command(async)]
pub fn sync_project_cancel(id: String) -> Result<(), String> {
    gitbring::cancel(&id);
    Ok(())
}

fn set_up(
    app: &AppHandle,
    hub: &PeerClientHub,
    slug: &str,
    source_root: &str,
    project: &str,
    root: &Path,
    id: &str,
) -> Result<Done, String> {
    progress(app, id, "creating", 0, 0);
    create_repo(root)?;
    crate::projects_crud::register_synced_project(project, &root.to_string_lossy())?;
    // Claimed for the same reason every other transfer claims it, and before the
    // follow record exists so the scheduler cannot race this first run.
    let _lock = gitbring::lock_landing(project)
        .ok_or_else(|| format!("{project} is already receiving changes"))?;

    let req = Request {
        source_slug: slug.to_string(),
        source_root: source_root.to_string(),
        project: project.to_string(),
        follow: Some(Follow {
            previous_head: None,
            discard_local: false,
        }),
    };
    let root_str = root.to_string_lossy().to_string();
    let done = crate::gitbringrun::run(app, hub, &req, id, &root_str)?;
    start_following(project, slug, source_root, &root_str, &done)?;
    Ok(done)
}

/// Record the follow so the scheduler takes over, with what just landed as its
/// baseline: the next cycle then has nothing to do until the other Mac moves on.
fn start_following(
    project: &str,
    slug: &str,
    source_root: &str,
    root: &str,
    done: &Done,
) -> Result<(), String> {
    let mut record = FollowRecord::new(
        project.to_string(),
        slug.to_string(),
        source_root.to_string(),
    );
    record.last_head = done.head.clone();
    record.last_tree = done
        .head
        .as_deref()
        .and_then(|head| crate::gitworkstate::working_state_tree(root, head).ok());
    record.last_branch = done.branch.clone();
    record.files = done.changed.unwrap_or(0);
    record.last_synced_at = crate::status::now_millis();
    store::put(record)
}

fn create_repo(root: &Path) -> Result<(), String> {
    if root.exists() {
        return Err(format!("{} already exists", root.to_string_lossy()));
    }
    std::fs::create_dir_all(root).map_err(|e| e.to_string())?;
    crate::git::git_out(&root.to_string_lossy(), &["init", "-q"])
        .map(|_| ())
        .map_err(|e| format!("could not create the folder's repository: {e}"))
}

/// Undo a failed setup. Only ever called for a folder this run created, and only
/// before it is being followed, so there is nothing of the user's to lose.
fn discard_partial(project: &str, root: &Path) {
    let _ = crate::projects_crud::forget_project_config(project);
    let _ = std::fs::remove_dir_all(root);
}

/// Where a new synced copy goes: a free name based on the other Mac's, in the
/// folder most of this Mac's projects already live in.
fn plan_local_copy(remote_name: &str) -> Result<(String, PathBuf), String> {
    crate::config::validate_name(remote_name)?;
    let parent = preferred_parent(&local_project_roots());
    std::fs::create_dir_all(&parent).map_err(|e| e.to_string())?;
    let name = free_name(remote_name, &parent, crate::config::project_exists)?;
    Ok((name.clone(), parent.join(name)))
}

fn local_project_roots() -> Vec<String> {
    crate::config::project_names()
        .into_iter()
        .filter_map(|name| match crate::config::project_root(&name) {
            Ok((root, false)) => Some(root),
            _ => None,
        })
        .collect()
}

/// The directory the most projects share as their parent — the one the user
/// evidently keeps work in. Counted in first-seen order and kept only on a strict
/// improvement, so a tie holds the earliest and the answer is stable across runs.
fn preferred_parent(roots: &[String]) -> PathBuf {
    let home = dirs::home_dir().unwrap_or_default();
    let mut counts: Vec<(PathBuf, usize)> = Vec::new();
    for root in roots {
        // A project sitting directly in the home folder says nothing about where
        // work is kept, and syncing into ~ itself would be hostile.
        let Some(parent) = Path::new(root).parent().filter(|p| p != &home) else {
            continue;
        };
        match counts.iter_mut().find(|(p, _)| p == parent) {
            Some((_, n)) => *n += 1,
            None => counts.push((parent.to_path_buf(), 1)),
        }
    }
    let best = counts
        .into_iter()
        .reduce(|best, next| if next.1 > best.1 { next } else { best });
    match best {
        Some((parent, _)) => parent,
        None => fallback_parent(&home),
    }
}

fn fallback_parent(home: &Path) -> PathBuf {
    FALLBACK_PARENTS
        .iter()
        .map(|name| home.join(name))
        .find(|path| path.is_dir())
        .unwrap_or_else(|| home.join(FALLBACK_PARENTS[0]))
}

/// `name`, then `name-2`, `name-3`… until one is free as both a project name and
/// a folder. Suffixed rather than randomised: this folder is one the user will
/// look for by name.
fn free_name(base: &str, parent: &Path, taken: impl Fn(&str) -> bool) -> Result<String, String> {
    for suffix in 1..100 {
        let candidate = if suffix == 1 {
            base.to_string()
        } else {
            format!("{base}-{suffix}")
        };
        if !taken(&candidate) && !parent.join(&candidate).exists() {
            return Ok(candidate);
        }
    }
    Err(format!("too many folders here are already called {base}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::{git_out, git_out_env};
    use crate::gitbringapply::{apply_state, Landing};
    use crate::gitworkstate::{head_sha, holds_only_state, working_state_tree};

    const ANCHOR: &str = "refs/lpm/from-test";
    const IDENTITY: [(&str, &str); 4] = [
        ("GIT_AUTHOR_NAME", "lpm"),
        ("GIT_AUTHOR_EMAIL", "lpm@localhost"),
        ("GIT_COMMITTER_NAME", "lpm"),
        ("GIT_COMMITTER_EMAIL", "lpm@localhost"),
    ];

    /// The first sync is the one case with no local repo to build on: the folder is
    /// created empty and has to end up holding the other Mac's committed history
    /// *and* its uncommitted work, on the branch it was on.
    #[test]
    fn a_first_sync_lands_a_whole_project_into_an_empty_folder() {
        let sender_dir = tempfile::tempdir().unwrap();
        let sender = sender_dir.path().to_string_lossy().to_string();
        git_out(&sender, &["init", "-q", "-b", "main"]).unwrap();
        std::fs::write(sender_dir.path().join(".gitignore"), "local.env\n").unwrap();
        std::fs::write(sender_dir.path().join("committed.txt"), "history\n").unwrap();
        git_out(&sender, &["add", "-A"]).unwrap();
        git_out_env(&sender, &["commit", "-q", "-m", "first"], &IDENTITY).unwrap();
        // Work in progress over there, of every shape the transfer carries.
        std::fs::write(sender_dir.path().join("committed.txt"), "edited\n").unwrap();
        std::fs::write(sender_dir.path().join("untracked.txt"), "fresh\n").unwrap();
        std::fs::write(sender_dir.path().join("local.env"), "THEIR SECRET\n").unwrap();

        let head = head_sha(&sender).unwrap();
        let tree = working_state_tree(&sender, &head).unwrap();
        let target = git_out_env(
            &sender,
            &["commit-tree", &tree, "-p", &head, "-m", "lpm: working state"],
            &IDENTITY,
        )
        .unwrap();

        // What setting a folder up does before any transfer.
        let dest_dir = tempfile::tempdir().unwrap();
        let dest_path = dest_dir.path().join("synced");
        create_repo(&dest_path).unwrap();
        let dest = dest_path.to_string_lossy().to_string();
        git_out(
            &dest,
            &["fetch", "--no-tags", &sender, &format!("+{target}:{ANCHOR}")],
        )
        .unwrap();

        apply_state(&Landing::new(&dest, "lpm/main", &target, &head, true).replacing(None)).unwrap();

        let at = |p: &str| dest_path.join(p);
        assert_eq!(
            std::fs::read_to_string(at("committed.txt")).unwrap(),
            "edited\n",
            "the uncommitted edit came too"
        );
        assert!(at("untracked.txt").exists(), "so did the untracked file");
        assert!(!at("local.env").exists(), "ignored files never travel");
        assert_eq!(
            git_out(&dest, &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap(),
            "lpm/main"
        );
        assert_eq!(git_out(&dest, &["rev-parse", "HEAD"]).unwrap(), head);
        // The uncommitted part is left uncommitted, mirroring their screen.
        assert!(crate::gitbringapply::is_dirty(&dest));
        assert!(holds_only_state(&dest, ANCHOR));
    }

    #[test]
    fn creating_a_repo_refuses_a_folder_that_already_exists() {
        let dir = tempfile::tempdir().unwrap();
        assert!(create_repo(dir.path()).is_err());
    }

    #[test]
    fn the_parent_most_projects_share_wins() {
        let roots = vec![
            "/Users/dev/Projects/one".to_string(),
            "/Users/dev/Projects/two".to_string(),
            "/Users/dev/Sites/three".to_string(),
        ];
        assert_eq!(preferred_parent(&roots), PathBuf::from("/Users/dev/Projects"));
    }

    #[test]
    fn a_tie_keeps_the_first_seen_so_the_answer_is_stable() {
        let roots = vec![
            "/Users/dev/Alpha/one".to_string(),
            "/Users/dev/Beta/two".to_string(),
        ];
        assert_eq!(preferred_parent(&roots), PathBuf::from("/Users/dev/Alpha"));
    }

    /// A project sitting directly in the home folder says nothing about where work
    /// is kept, and syncing into ~ itself would be hostile.
    #[test]
    fn a_project_at_the_top_of_home_is_not_taken_as_a_hint() {
        let home = dirs::home_dir().unwrap_or_default();
        let at_home = home.join("loose").to_string_lossy().to_string();
        let nested = home.join("Work/app").to_string_lossy().to_string();
        assert_eq!(preferred_parent(&[at_home.clone()]), fallback_parent(&home));
        assert_eq!(preferred_parent(&[at_home, nested]), home.join("Work"));
    }

    #[test]
    fn with_no_projects_at_all_it_falls_back_under_home() {
        let home = dirs::home_dir().unwrap_or_default();
        assert_eq!(preferred_parent(&[]), fallback_parent(&home));
    }

    #[test]
    fn a_free_name_is_the_plain_one_and_then_numbered() {
        let dir = tempfile::tempdir().unwrap();
        let parent = dir.path();
        let untaken = |_: &str| false;
        assert_eq!(free_name("lpm", parent, untaken).unwrap(), "lpm");

        std::fs::create_dir(parent.join("lpm")).unwrap();
        assert_eq!(free_name("lpm", parent, untaken).unwrap(), "lpm-2");

        std::fs::create_dir(parent.join("lpm-2")).unwrap();
        assert_eq!(free_name("lpm", parent, untaken).unwrap(), "lpm-3");
    }

    /// A folder can be free while lpm already knows a project by that name, and
    /// registering a second one would collide.
    #[test]
    fn a_name_lpm_already_uses_is_skipped_even_with_no_folder() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            free_name("lpm", dir.path(), |name| name == "lpm").unwrap(),
            "lpm-2"
        );
    }
}
