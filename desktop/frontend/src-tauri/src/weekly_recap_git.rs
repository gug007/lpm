//! The weekly recap's Git numbers: lines the user committed across the
//! projects' repositories. A commit reached from several copies or computers
//! counts once, by its hash.
use chrono::{DateTime, Local};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashSet};
use std::path::{Path, PathBuf};

/// One file changing by more lines than this in a commit was generated, vendored
/// or moved rather than written, like a test fixture or a build bundle.
const WRITTEN_MAX: u64 = 5_000;

/// Dependency lockfiles, rewritten by package managers rather than written.
const LOCKFILES: &[&str] = &[
    "package-lock.json",
    "npm-shrinkwrap.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "bun.lock",
    "Cargo.lock",
    "Gemfile.lock",
    "poetry.lock",
    "uv.lock",
    "Pipfile.lock",
    "composer.lock",
    "go.sum",
    "Podfile.lock",
    "Package.resolved",
    "gradle.lockfile",
    "flake.lock",
];

#[derive(Clone, Default, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct RecapCommit {
    pub(crate) sha: String,
    pub(crate) added: u64,
    pub(crate) removed: u64,
}

fn rfc3339(at: DateTime<Local>) -> String {
    at.format("%Y-%m-%dT%H:%M:%S%:z").to_string()
}

fn git(root: &Path, args: &[&str]) -> Option<String> {
    let out = crate::osproc::command("git")
        .args(args)
        .current_dir(root)
        .env("GIT_OPTIONAL_LOCKS", "0")
        .output()
        .ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).into_owned())
}

/// `git log --numstat` output, one `commit <sha>` header per commit.
pub(crate) fn parse_numstat(out: &str) -> Vec<RecapCommit> {
    let mut commits: Vec<RecapCommit> = Vec::new();
    for line in out.lines() {
        if let Some(sha) = line.strip_prefix("commit ") {
            commits.push(RecapCommit {
                sha: sha.trim().to_string(),
                ..Default::default()
            });
            continue;
        }
        let Some(commit) = commits.last_mut() else {
            continue;
        };
        let mut fields = line.split('\t');
        let (Some(added), Some(removed), Some(path)) =
            (fields.next(), fields.next(), fields.next())
        else {
            continue;
        };
        let name = path.rsplit('/').next().unwrap_or(path);
        if LOCKFILES.contains(&name) {
            continue;
        }
        // A binary file shows `-` for both.
        let (added, removed) = (
            added.parse::<u64>().unwrap_or(0),
            removed.parse::<u64>().unwrap_or(0),
        );
        if added + removed > WRITTEN_MAX {
            continue;
        }
        commit.added += added;
        commit.removed += removed;
    }
    commits
}

fn repo_commits(root: &Path, from: DateTime<Local>, to: DateTime<Local>) -> Vec<RecapCommit> {
    let Some(email) = git(root, &["config", "user.email"]).map(|e| e.trim().to_string()) else {
        return Vec::new();
    };
    if email.is_empty() {
        return Vec::new();
    }
    let since = format!("--since={}", rfc3339(from));
    let until = format!("--until={}", rfc3339(to));
    let author = format!("--author={email}");
    git(
        root,
        &[
            "log",
            "--all",
            "--no-merges",
            "--fixed-strings",
            &author,
            &since,
            &until,
            "--numstat",
            "--format=commit %H",
        ],
    )
    .map(|out| parse_numstat(&out))
    .unwrap_or_default()
}

/// An origin URL as `host/path`, lowercased, without scheme, credentials or
/// `.git`, so the SSH and HTTPS forms of one repository match, as do a local
/// Windows path's two spellings.
pub(crate) fn origin_key(url: &str) -> String {
    let url = url.trim().replace('\\', "/");
    let rest = match url.split_once("://") {
        Some((_, rest)) => rest.to_string(),
        None => url.replacen(':', "/", 1),
    };
    let (authority, path) = rest.split_once('/').unwrap_or((&rest, ""));
    let host = authority.rsplit('@').next().unwrap_or(authority);
    format!("{host}/{path}")
        .trim_end_matches('/')
        .trim_end_matches(".git")
        .to_lowercase()
}

/// One name for a repository however many copies and worktrees of it there
/// are, on any computer: its origin, else its shared Git directory; None
/// outside Git.
fn repo_key(root: &Path) -> Option<String> {
    if let Some(url) = git(root, &["remote", "get-url", "origin"]) {
        return Some(origin_key(&url));
    }
    let dir = git(root, &["rev-parse", "--git-common-dir"])?;
    let dir = root.join(dir.trim());
    Some(
        std::fs::canonicalize(&dir)
            .unwrap_or(dir)
            .to_string_lossy()
            .into_owned(),
    )
}

/// The repositories `roots` belong to, each once.
pub(crate) fn repo_keys<'a>(roots: impl Iterator<Item = &'a Path>) -> Vec<String> {
    let roots: Vec<&Path> = roots.collect();
    let keys: BTreeSet<String> = std::thread::scope(|scope| {
        let handles: Vec<_> = roots
            .iter()
            .map(|root| scope.spawn(move || repo_key(root)))
            .collect();
        handles
            .into_iter()
            .filter_map(|handle| handle.join().ok().flatten())
            .collect()
    });
    keys.into_iter().collect()
}

/// Every commit the user made in [from, to) across `roots`, each once.
pub(crate) fn user_commits(
    roots: &[PathBuf],
    from: DateTime<Local>,
    to: DateTime<Local>,
) -> Vec<RecapCommit> {
    let found: Vec<Vec<RecapCommit>> = std::thread::scope(|scope| {
        let handles: Vec<_> = roots
            .iter()
            .map(|root| scope.spawn(move || repo_commits(root, from, to)))
            .collect();
        handles
            .into_iter()
            .filter_map(|handle| handle.join().ok())
            .collect()
    });
    let mut seen = HashSet::new();
    found
        .into_iter()
        .flatten()
        .filter(|commit| seen.insert(commit.sha.clone()))
        .collect()
}

#[cfg(test)]
#[path = "weekly_recap_git_tests.rs"]
mod tests;
