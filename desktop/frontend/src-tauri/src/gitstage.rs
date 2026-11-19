//! The index for a commit made in lpm, which holds exactly the files the user
//! picked. Plain `git add` gets two cases wrong. It refuses a tracked file inside
//! an ignored folder. And clearing the stage first forgets a file taken out of the
//! index only (`git rm --cached`, which is how a skill is kept out of Git): the
//! file is still on disk, so nothing in the working tree brings that removal back.

use crate::git::{git_command, git_out, path_args};
use crate::gitconflict::nul_separated;
use std::collections::HashSet;
use std::path::Path;

/// Removals staged while their files stay on disk.
pub(crate) struct Removals(Vec<String>);

impl Removals {
    /// Read before the stage is cleared.
    pub(crate) fn staged(cwd: &str) -> Self {
        let deleted = listed(cwd, &["diff", "--cached", "--name-only", "-z", "--diff-filter=D"]);
        Self(deleted.into_iter().filter(|p| on_disk(cwd, p)).collect())
    }

    /// Stages `files`, a picked removal as the removal it was.
    pub(crate) fn add(&self, cwd: &str, files: &[String]) -> Result<(), String> {
        let (gone, changed): (Vec<&str>, Vec<&str>) =
            files.iter().map(String::as_str).partition(|f| self.0.iter().any(|r| r == f));
        add(cwd, &changed)?;
        unindex(cwd, &gone)
    }

    /// Puts back the removals that weren't picked, once the commit is made.
    pub(crate) fn keep(&self, cwd: &str, files: &[String]) {
        let left: Vec<&str> =
            self.0.iter().map(String::as_str).filter(|r| !files.iter().any(|f| f == r)).collect();
        let _ = unindex(cwd, &left);
    }
}

fn add(cwd: &str, files: &[&str]) -> Result<(), String> {
    if files.is_empty() {
        return Ok(());
    }
    let tracked: HashSet<String> =
        listed(cwd, &path_args(&["ls-files", "-z"], files)).into_iter().collect();
    let (known, new): (Vec<&str>, Vec<&str>) = files.iter().partition(|f| tracked.contains(**f));
    // `-u` takes a tracked file whatever the ignore rules say of its folder.
    if !known.is_empty() {
        git_out(cwd, &path_args(&["add", "-u"], &known))?;
    }
    if !new.is_empty() {
        git_out(cwd, &path_args(&["add"], &new))?;
    }
    Ok(())
}

fn unindex(cwd: &str, paths: &[&str]) -> Result<(), String> {
    if paths.is_empty() {
        return Ok(());
    }
    git_out(cwd, &path_args(&["rm", "-q", "--cached", "--ignore-unmatch"], paths)).map(|_| ())
}

fn listed(cwd: &str, args: &[&str]) -> Vec<String> {
    git_command(cwd, args, &[]).output().map(|o| nul_separated(&o.stdout)).unwrap_or_default()
}

fn on_disk(cwd: &str, path: &str) -> bool {
    Path::new(cwd).join(path).symlink_metadata().is_ok()
}

#[cfg(test)]
#[path = "gitstage_tests.rs"]
mod tests;
