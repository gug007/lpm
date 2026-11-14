use crate::git::{git_out, path_args};
use serde::Serialize;

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UndoneCommit {
    pub hash: String,
    pub message: String,
    pub files: usize,
}

fn head(cwd: &str) -> Result<String, String> {
    git_out(cwd, &["rev-parse", "HEAD"])
}

fn parent_count(cwd: &str, hash: &str) -> Result<usize, String> {
    let line = git_out(cwd, &["rev-list", "--parents", "-n", "1", hash])?;
    Ok(line.split_whitespace().count().saturating_sub(1))
}

/// Only the newest commit, while no remote has it, may be rewritten: anything
/// older or pushed would rewrite history someone else can already see.
fn ensure_rewritable(cwd: &str, hash: &str) -> Result<(), String> {
    if head(cwd)? != hash {
        return Err("The branch has moved since. Reload and try again.".into());
    }
    if crate::gitresolve::merging(cwd) {
        return Err("Finish or abort the merge first.".into());
    }
    if !git_out(cwd, &["branch", "-r", "--contains", hash])?.is_empty() {
        return Err("This commit is already pushed.".into());
    }
    Ok(())
}

/// Takes the newest commit back with a soft reset: its changes stay in the
/// working tree and its message comes back for the next commit.
#[tauri::command(async)]
pub fn git_undo_commit(cwd: String, hash: String) -> Result<UndoneCommit, String> {
    ensure_rewritable(&cwd, &hash)?;
    match parent_count(&cwd, &hash)? {
        1 => {}
        0 => return Err("This is the first commit, so there is nothing to go back to.".into()),
        _ => return Err("A merge commit can't be undone here.".into()),
    }
    let message = git_out(&cwd, &["log", "-1", "--format=%B", &hash])?;
    let parent = format!("{hash}^");
    let files = git_out(&cwd, &["diff", "--name-only", &parent, &hash])?
        .lines()
        .filter(|l| !l.is_empty())
        .count();
    git_out(&cwd, &["reset", "--soft", &parent])?;
    Ok(UndoneCommit {
        hash,
        message,
        files,
    })
}

/// Puts an undone commit back, as long as nothing was committed on top since.
#[tauri::command(async)]
pub fn git_redo_commit(cwd: String, hash: String) -> Result<(), String> {
    let parent = git_out(&cwd, &["rev-parse", "--verify", &format!("{hash}^")])?;
    if head(&cwd)? != parent {
        return Err("The branch has moved since the undo, so it can't be redone.".into());
    }
    git_out(&cwd, &["reset", "--soft", &hash]).map(|_| ())
}

/// Replaces the newest commit with one holding its changes plus `files`, under
/// `message`. No files only rewords it.
#[tauri::command(async)]
pub fn git_amend_commit(
    cwd: String,
    message: String,
    files: Vec<String>,
    hash: String,
) -> Result<(), String> {
    let message = message.trim();
    if message.is_empty() {
        return Err("commit message required".into());
    }
    ensure_rewritable(&cwd, &hash)?;
    if parent_count(&cwd, &hash)? > 1 {
        return Err("A merge commit can't be amended here.".into());
    }
    if !files.is_empty() {
        crate::gitconflict::check_commit(&cwd, &files)?;
    }
    git_out(&cwd, &["reset", "-q", "HEAD"])?;
    if !files.is_empty() {
        let paths: Vec<&str> = files.iter().map(String::as_str).collect();
        git_out(&cwd, &path_args(&["add"], &paths)).map_err(|e| format!("staging files: {e}"))?;
    }
    git_out(&cwd, &["commit", "--amend", "-m", message]).map(|_| ())
}

#[cfg(test)]
#[path = "gitundo_tests.rs"]
mod tests;
