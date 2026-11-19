//! Where a branch's own work starts, for reviewing all of it: the commit it
//! left the default branch at, or on the default branch itself, the upstream it
//! hasn't pushed to yet. The same rule the phone's branch review follows.
use serde::Serialize;

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BranchBase {
    /// The commit the branch's own work comes after.
    pub rev: String,
    /// What it is called: the default branch, or the upstream.
    pub name: String,
    /// "since" when the branch left `name`; "unpushed" for commits `name` lacks.
    pub range: String,
    pub commits: i64,
}

#[tauri::command(async)]
pub fn git_branch_base(cwd: String) -> Option<BranchBase> {
    let git = |args: &[&str]| {
        crate::git::git_out(&cwd, args)
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    };
    let branch = git(&["rev-parse", "--abbrev-ref", "HEAD"]).unwrap_or_default();
    let default = crate::git::git_default_branch(cwd.clone());
    let (target, name, range) = if !default.is_empty() && branch != default && branch != "HEAD" {
        let remote = format!("origin/{default}");
        let tracked = git(&[
            "rev-parse",
            "--verify",
            "--quiet",
            &format!("refs/remotes/{remote}"),
        ])
        .is_some();
        (if tracked { remote } else { default.clone() }, default, "since")
    } else {
        let upstream = git(&[
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
        ])?;
        (upstream.clone(), upstream, "unpushed")
    };
    let rev = git(&["merge-base", "HEAD", &target])?;
    let commits = crate::git::git_commit_count(cwd.clone(), rev.clone(), "HEAD".into());
    Some(BranchBase {
        rev,
        name,
        range: range.into(),
        commits,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    use std::process::Command;

    fn git(dir: &Path, args: &[&str]) {
        let ok = Command::new("git")
            .args(["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"])
            .args(args)
            .current_dir(dir)
            .output()
            .unwrap()
            .status
            .success();
        assert!(ok, "git {args:?}");
    }

    fn repo() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        git(dir.path(), &["init", "-q", "-b", "main"]);
        std::fs::write(dir.path().join("a.txt"), "a\n").unwrap();
        git(dir.path(), &["add", "."]);
        git(dir.path(), &["commit", "-q", "-m", "one"]);
        dir
    }

    #[test]
    fn a_branch_starts_where_it_left_the_default_branch() {
        let dir = repo();
        let cwd = dir.path().to_string_lossy().into_owned();
        let left_at = crate::git::git_out(&cwd, &["rev-parse", "HEAD"]).unwrap();
        git(dir.path(), &["checkout", "-q", "-b", "feat"]);
        for n in ["b", "c"] {
            std::fs::write(dir.path().join(format!("{n}.txt")), "x\n").unwrap();
            git(dir.path(), &["add", "."]);
            git(dir.path(), &["commit", "-q", "-m", n]);
        }
        git(dir.path(), &["checkout", "-q", "main"]);
        std::fs::write(dir.path().join("later.txt"), "x\n").unwrap();
        git(dir.path(), &["add", "."]);
        git(dir.path(), &["commit", "-q", "-m", "main moved on"]);
        git(dir.path(), &["checkout", "-q", "feat"]);

        let base = git_branch_base(cwd).unwrap();
        assert_eq!(base.rev, left_at.trim());
        assert_eq!(base.name, "main");
        assert_eq!(base.range, "since");
        assert_eq!(base.commits, 2);
    }

    #[test]
    fn the_default_branch_without_an_upstream_has_nothing_to_compare() {
        let dir = repo();
        assert_eq!(git_branch_base(dir.path().to_string_lossy().into_owned()), None);
    }
}
