// What a project's sidebar row can say about its checkout beyond origin: the
// branch, how much is changed, when the last commit landed and the version its
// manifest names. Local reads only, asked about once a minute per project.
use crate::git::{git_default_branch, git_out};
use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Serialize, Default, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RowStats {
    pub branch: String,
    pub default_branch: String,
    pub insertions: i64,
    pub deletions: i64,
    pub files: i64,
    /// Unix seconds; 0 when the repository has no commit yet.
    pub last_commit_at: i64,
    pub version: String,
}

/// Changes are counted against the last commit, or with `since_branch` against
/// where the branch left the default one, so a branch's whole work shows.
#[tauri::command(async)]
pub fn project_row_stats(cwd: String, since_branch: bool) -> RowStats {
    let mut st = RowStats {
        version: manifest_version(Path::new(&cwd)),
        ..RowStats::default()
    };
    if git_out(&cwd, &["rev-parse", "--is-inside-work-tree"]).is_err() {
        return st;
    }
    st.branch = git_out(&cwd, &["symbolic-ref", "-q", "--short", "HEAD"]).unwrap_or_default();
    st.default_branch = git_default_branch(cwd.clone());
    st.last_commit_at = git_out(&cwd, &["log", "-1", "--format=%ct"])
        .ok()
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(0);
    let base = if since_branch {
        branch_base(&cwd, &st.default_branch)
    } else {
        None
    };
    let against = base.as_deref().unwrap_or("HEAD");
    if let Ok(out) = git_out(
        &cwd,
        &["--no-optional-locks", "diff", "--shortstat", against],
    ) {
        (st.insertions, st.deletions) = parse_shortstat(&out);
    }
    st.files = changed_files(&cwd, base.as_deref());
    st
}

fn branch_base(cwd: &str, default_branch: &str) -> Option<String> {
    if default_branch.is_empty() {
        return None;
    }
    [
        format!("refs/remotes/origin/{default_branch}"),
        format!("refs/heads/{default_branch}"),
    ]
    .iter()
    .find_map(|r| {
        git_out(cwd, &["merge-base", "HEAD", r])
            .ok()
            .filter(|sha| !sha.is_empty())
    })
}

// Untracked files count too: to a person they are changed files. A folder
// git hasn't seen counts once, as `git status` lists it.
fn changed_files(cwd: &str, base: Option<&str>) -> i64 {
    let status = git_out(cwd, &["--no-optional-locks", "status", "--porcelain=v1"])
        .unwrap_or_default();
    let Some(base) = base else {
        return status.lines().filter(|l| !l.is_empty()).count() as i64;
    };
    let untracked = status.lines().filter(|l| l.starts_with("??")).count();
    let tracked = git_out(
        cwd,
        &["--no-optional-locks", "diff", "--name-only", base],
    )
    .map(|out| out.lines().filter(|l| !l.is_empty()).count())
    .unwrap_or(0);
    (tracked + untracked) as i64
}

/// " 3 files changed, 10 insertions(+), 2 deletions(-)" → (10, 2). Either
/// count is missing from git's line when it's zero.
fn parse_shortstat(out: &str) -> (i64, i64) {
    let (mut insertions, mut deletions) = (0, 0);
    for part in out.split(',') {
        let part = part.trim();
        let n = part
            .split_whitespace()
            .next()
            .and_then(|n| n.parse().ok())
            .unwrap_or(0);
        if part.contains("insertion") {
            insertions = n;
        } else if part.contains("deletion") {
            deletions = n;
        }
    }
    (insertions, deletions)
}

fn manifest_version(dir: &Path) -> String {
    json_version(&dir.join("package.json"))
        .or_else(|| toml_version(&dir.join("Cargo.toml"), &["package"]))
        .or_else(|| toml_version(&dir.join("pyproject.toml"), &["project", "tool.poetry"]))
        .unwrap_or_default()
}

fn json_version(path: &Path) -> Option<String> {
    let text = fs::read_to_string(path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    value
        .get("version")?
        .as_str()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string)
}

/// The `version` string in the first of `tables` (dotted paths) that has one.
/// A version taken from a workspace (`version.workspace = true`) is a table,
/// not a value of its own here.
fn toml_version(path: &Path, tables: &[&str]) -> Option<String> {
    let doc: toml_edit::DocumentMut = fs::read_to_string(path).ok()?.parse().ok()?;
    tables.iter().find_map(|table| {
        let item = table.split('.').try_fold(doc.as_item(), |item, key| item.get(key))?;
        let version = item.get("version")?.as_str()?.trim();
        (!version.is_empty()).then(|| version.to_string())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shortstat_reads_both_counts_and_either_alone() {
        assert_eq!(
            parse_shortstat(" 3 files changed, 10 insertions(+), 2 deletions(-)"),
            (10, 2)
        );
        assert_eq!(parse_shortstat(" 1 file changed, 1 insertion(+)"), (1, 0));
        assert_eq!(parse_shortstat(" 1 file changed, 4 deletions(-)"), (0, 4));
        assert_eq!(parse_shortstat(""), (0, 0));
    }

    #[test]
    fn versions_come_from_the_first_manifest_that_has_one() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(manifest_version(dir.path()), "");

        fs::write(
            dir.path().join("Cargo.toml"),
            "[package]\nname = \"x\"\nversion = \"0.7.1\"\n\n[dependencies]\nversion = \"9\"\n",
        )
        .unwrap();
        assert_eq!(manifest_version(dir.path()), "0.7.1");

        fs::write(dir.path().join("package.json"), r#"{"name":"x","version":"2.4.1"}"#).unwrap();
        assert_eq!(manifest_version(dir.path()), "2.4.1");
    }

    #[test]
    fn a_workspace_version_or_one_outside_the_table_is_not_taken() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("Cargo.toml"),
            "[workspace.package]\nversion = \"1.0.0\"\n[package]\nversion.workspace = true\n",
        )
        .unwrap();
        assert_eq!(manifest_version(dir.path()), "");

        fs::write(
            dir.path().join("pyproject.toml"),
            "[tool.poetry]\nname = \"x\"\nversion = \"3.1.0\"\n",
        )
        .unwrap();
        assert_eq!(manifest_version(dir.path()), "3.1.0");
    }

    #[test]
    fn a_folder_outside_git_reports_only_its_version() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("package.json"), r#"{"version":"1.2.3"}"#).unwrap();
        let st = project_row_stats(dir.path().to_string_lossy().into_owned(), false);
        assert_eq!(st.version, "1.2.3");
        assert_eq!(st.branch, "");
        assert_eq!(st.files, 0);
    }
}
