//! The receiving end of "Continue on": a session handed over from another
//! computer lands here as its working state, checked out the way a sync lands
//! one, and its Claude conversation, put where `claude --resume` looks for it
//! in this folder. Both computers run this: the one a session moves to, and
//! the one it comes back to.
use crate::gitbringapply as ga;
use crate::sys::MACHINE;
use std::path::{Path, PathBuf};

/// The state the last handoff sent from or landed in a folder. A folder still
/// holding exactly that has nothing of the user's own since, so the next
/// handoff may replace it.
const ANCHOR: &str = "refs/lpm/handoff";
/// Where the work lands when the other computer was on no branch.
const DETACHED_BRANCH: &str = "lpm/handoff";

pub(crate) struct Handed<'a> {
    pub(crate) head: &'a str,
    pub(crate) snapshot: Option<&'a str>,
    pub(crate) branch: Option<&'a str>,
}

impl Handed<'_> {
    pub(crate) fn target(&self) -> &str {
        self.snapshot.unwrap_or(self.head)
    }
}

fn busy(name: &str) -> String {
    format!("{name} has uncommitted changes of its own. Commit or discard them, then try again")
}

/// Refuses a folder that can't take a handed-over state without losing work.
pub(crate) fn ensure_can_take(name: &str, root: &str) -> Result<(), String> {
    if crate::gitworkstate::holds_only_state(root, ANCHOR) {
        return Ok(());
    }
    Err(busy(name))
}

/// Record that `root` holds exactly `sha`, the state a handoff just sent or
/// landed.
pub(crate) fn anchor(root: &str, sha: &str) -> Result<(), String> {
    if !ga::is_object_id(sha) || !ga::has_object(root, sha) {
        return Err("that state isn't in this folder".into());
    }
    crate::git::git_out(root, &["update-ref", ANCHOR, sha]).map(|_| ())
}

/// Check the handed-over state out into `root` and return the branch it is
/// on. `pack` holds the objects this repository is missing.
pub(crate) fn land(
    name: &str,
    root: &str,
    pack: Option<&Path>,
    handed: &Handed,
) -> Result<String, String> {
    if !ga::is_object_id(handed.head) || handed.snapshot.is_some_and(|s| !ga::is_object_id(s)) {
        return Err(format!("the other {MACHINE} sent an unusable change id"));
    }
    let _held = crate::gitbring::lock_landing(name)
        .ok_or_else(|| format!("{name} is already taking in changes"))?;
    // Dirty with nothing of the user's own is what the last handoff left.
    let leftover = ga::is_dirty(root);
    if leftover && !crate::gitworkstate::holds_only_state(root, ANCHOR) {
        return Err(busy(name));
    }
    let target = handed.target();
    if !ga::has_object(root, target) {
        let pack = pack.ok_or("the changes didn't arrive")?;
        ga::index_pack(root, pack)?;
    }
    let branch = landing_branch(root, handed.branch);
    let landing = ga::Landing::new(
        root,
        &branch,
        target,
        handed.head,
        handed.snapshot.is_some(),
    );
    let landing = if leftover {
        landing.replacing(None)
    } else {
        landing
    };
    if ga::branch_would_lose_commits(&landing) {
        return Err(format!(
            "{branch} has commits in {name} that the incoming work doesn't include. Push or merge them first"
        ));
    }
    ga::apply_state(&landing)?;
    anchor(root, target)?;
    track_origin(root, &branch);
    Ok(branch)
}

fn landing_branch(root: &str, wanted: Option<&str>) -> String {
    wanted
        .filter(|b| !b.starts_with('-'))
        .filter(|b| crate::git::git_out(root, &["check-ref-format", "--branch", b]).is_ok())
        .unwrap_or(DETACHED_BRANCH)
        .to_string()
}

/// A branch created by the landing follows origin's branch of the same name
/// when there is one, so a push from here goes where it went from there.
fn track_origin(root: &str, branch: &str) {
    let git = |args: &[&str]| crate::git::git_out(root, args);
    let upstream = format!("{branch}@{{upstream}}");
    if git(&["rev-parse", "--verify", "--quiet", &upstream]).is_ok() {
        return;
    }
    let remote = format!("refs/remotes/origin/{branch}");
    if git(&["rev-parse", "--verify", "--quiet", &remote]).is_ok() {
        let _ = git(&[
            "branch",
            "--set-upstream-to",
            &format!("origin/{branch}"),
            branch,
        ]);
    }
}

/// Where a conversation handed to `project` goes: over the copy filed under
/// this folder, on whichever account holds it, or with the account the
/// project's new sessions use.
fn session_path(project: &str, root: &str, session_id: &str) -> PathBuf {
    crate::claude_dirs::find_filed(root, session_id)
        .map(|(_, path)| path)
        .unwrap_or_else(|| {
            let env = crate::claude_pool::spawn_env(project, None, true).env;
            crate::claude_transcripts::claude_transcript_path(env, root, session_id)
        })
}

/// Put a handed-over conversation where `claude --resume` finds it in `root`.
pub(crate) fn install_session(
    project: &str,
    root: &str,
    session_id: &str,
    file: &Path,
) -> Result<(), String> {
    if !crate::socketsrv::valid_session_id(session_id) {
        return Err("invalid session id".into());
    }
    install_at(&session_path(project, root, session_id), file)
}

/// A transcript only grows, so a longer one already at `dest` is the same
/// conversation carried further and is kept.
fn install_at(dest: &Path, file: &Path) -> Result<(), String> {
    let size = |p: &Path| std::fs::metadata(p).map(|m| m.len()).unwrap_or(0);
    if size(dest) > size(file) {
        return Ok(());
    }
    let dir = dest.parent().ok_or("the conversation has no folder")?;
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    crate::fsatomic::write_with(dest, crate::fsatomic::Mode::Preserve(0o600), |to| {
        std::io::copy(&mut std::fs::File::open(file)?, to).map(|_| ())
    })
    .map_err(|e| e.to_string())
}

#[cfg(test)]
#[path = "handoffland_tests.rs"]
mod tests;
