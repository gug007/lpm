//! The branch a worktree started from an issue is on, and the issue that branch
//! is for: its pull request closes it. Git's own config keeps the link, so it
//! follows the branch through renames, into other checkouts, and goes with it.
use crate::git::git_out;
use serde::Deserialize;
use std::path::Path;
use std::sync::LazyLock;

const KEY: &str = "lpm-issue";
const SLUG_CHARS: usize = 48;

/// The issue a new worktree starts from.
#[derive(Deserialize, Clone, Debug, PartialEq)]
pub struct IssueStart {
    pub number: u64,
    #[serde(default)]
    pub title: String,
}

/// `431-retry-failed-webhooks`, as GitHub and GitLab name an issue's own branch.
pub(crate) fn name_for(number: u64, title: &str) -> String {
    let mut slug = String::new();
    for word in title
        .to_lowercase()
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|w| !w.is_empty())
    {
        let joined = slug.len() + word.len() + usize::from(!slug.is_empty());
        if !slug.is_empty() && joined > SLUG_CHARS {
            break;
        }
        if !slug.is_empty() {
            slug.push('-');
        }
        slug.extend(word.chars().take(SLUG_CHARS));
    }
    if slug.is_empty() {
        format!("issue-{number}")
    } else {
        format!("{number}-{slug}")
    }
}

/// `name`, or `name-2` and so on while a branch here or on origin has it.
pub(crate) fn free(repo: &Path, name: &str) -> String {
    let cwd = repo.to_string_lossy();
    let taken = |name: &str| {
        ["refs/heads/", "refs/remotes/origin/"].iter().any(|space| {
            let full = format!("{space}{name}");
            git_out(&cwd, &["show-ref", "--verify", "--quiet", &full]).is_ok()
        })
    };
    std::iter::once(name.to_string())
        .chain((2..).map(|n| format!("{name}-{n}")))
        .find(|candidate| !taken(candidate))
        .unwrap_or_else(|| name.to_string())
}

pub(crate) fn link(repo: &Path, branch: &str, number: u64) -> Result<(), String> {
    let key = format!("branch.{branch}.{KEY}");
    git_out(&repo.to_string_lossy(), &["config", &key, &number.to_string()]).map(|_| ())
}

/// The issue the checkout's branch was started from.
#[tauri::command(async)]
pub fn branch_issue(cwd: String) -> Option<u64> {
    let branch = git_out(&cwd, &["rev-parse", "--abbrev-ref", "HEAD"]).ok()?;
    of_branch(&cwd, branch.trim())
}

pub(crate) fn of_branch(cwd: &str, branch: &str) -> Option<u64> {
    if branch.is_empty() || branch == "HEAD" {
        return None;
    }
    git_out(cwd, &["config", "--get", &format!("branch.{branch}.{KEY}")])
        .ok()?
        .trim()
        .parse()
        .ok()
}

/// A pull request's text with the line that closes `issue` when it merges,
/// unless it closes it already.
pub(crate) fn with_closing(body: &str, issue: u64) -> String {
    static CLOSES: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(
            r"(?i)\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+(?:[\w./-]*#|https?://\S+/issues/)(\d+)\b",
        )
        .unwrap()
    });
    let closes = CLOSES
        .captures_iter(body)
        .any(|c| c[1].parse() == Ok(issue));
    match body.trim() {
        _ if closes => body.to_string(),
        "" => format!("Closes #{issue}"),
        text => format!("{text}\n\nCloses #{issue}"),
    }
}

#[cfg(test)]
#[path = "issue_branch_tests.rs"]
mod tests;
