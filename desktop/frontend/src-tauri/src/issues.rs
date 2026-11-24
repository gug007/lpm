//! A repository's open issues and one issue's discussion, read through `gh` or
//! `glab` (gitlab_issues.rs): for the "@" menu, the phone, and a worktree
//! started from an issue (issue_branch.rs).
use crate::pull_request::gh_out;
use crate::ttl_cache::TtlCache;
use crate::untrusted::{fenced, one_line, plain};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// The "@" menu asks whenever its input takes the keyboard.
const FRESH: Duration = Duration::from_secs(2 * 60);
const LIST_LIMIT: &str = "100";
const MENTION_LINES: usize = 600;
/// A prompt is typed into the agent's launch command, so a long discussion is
/// left for the agent to read.
const PROMPT_CHARS: usize = 6000;

#[derive(Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpenIssue {
    pub number: u64,
    pub title: String,
    pub url: String,
    pub author: String,
    pub labels: Vec<String>,
    /// What a worktree started from it calls its branch.
    pub branch: String,
}

#[derive(Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub struct IssueText {
    pub number: u64,
    pub title: String,
    pub url: String,
    /// What the "@" menu puts in the input.
    pub mention: String,
    /// What an agent started on it is told.
    pub prompt: String,
}

/// An issue as its forge gave it, every text already `plain`.
#[derive(Debug, PartialEq)]
pub(crate) struct Discussion {
    pub number: u64,
    pub title: String,
    pub url: String,
    pub body: String,
    /// Who said what, oldest first.
    pub comments: Vec<(String, String)>,
    /// The command that reads the whole of it.
    pub reader: String,
}

/// The open issues, newest first. `fresh` asks the forge again.
#[tauri::command(async)]
pub fn open_issues(cwd: String, fresh: Option<bool>) -> Result<Vec<OpenIssue>, String> {
    static ISSUES: TtlCache<String, Result<Vec<OpenIssue>, String>> = TtlCache::new(FRESH);
    if fresh == Some(true) {
        ISSUES.forget(&cwd);
    }
    ISSUES.get_or(cwd.clone(), || read_open(&cwd))
}

fn read_open(cwd: &str) -> Result<Vec<OpenIssue>, String> {
    let remotes = crate::git::git_out(cwd, &["remote"]).unwrap_or_default();
    if remotes.trim().is_empty() {
        return Err("This project's repository has no remote to read issues from".into());
    }
    if let Some(repo) = crate::githost::gitlab(cwd) {
        return crate::gitlab_issues::open(cwd, &repo);
    }
    let listed = gh_out(
        cwd,
        &[
            "issue",
            "list",
            "--state",
            "open",
            "--limit",
            LIST_LIMIT,
            "--json",
            "number,title,url,author,labels",
        ],
    );
    match listed {
        Ok(json) => parse_list(&json),
        Err(e) if e.contains("has disabled issues") => Ok(Vec::new()),
        Err(e) => Err(e),
    }
}

/// One issue and its discussion.
#[tauri::command(async)]
pub fn read_issue(cwd: String, number: u64) -> Result<IssueText, String> {
    let discussion = match crate::githost::gitlab(&cwd) {
        Some(repo) => crate::gitlab_issues::discussion(&cwd, &repo, number)?,
        None => {
            let json = gh_out(
                &cwd,
                &[
                    "issue",
                    "view",
                    &number.to_string(),
                    "--json",
                    "number,title,url,body,comments",
                ],
            )
            .map_err(|e| missing(e, number))?;
            parse_view(&json)?
        }
    };
    Ok(text_of(&discussion))
}

fn missing(error: String, number: u64) -> String {
    if error.contains("Could not resolve to an issue") {
        format!("There's no issue #{number} in this repository")
    } else {
        error
    }
}

#[derive(Deserialize)]
struct GhUser {
    #[serde(default)]
    login: String,
}

#[derive(Deserialize)]
struct GhLabel {
    #[serde(default)]
    name: String,
}

#[derive(Deserialize)]
struct GhIssue {
    number: u64,
    #[serde(default)]
    title: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    body: String,
    author: Option<GhUser>,
    #[serde(default)]
    labels: Vec<GhLabel>,
    #[serde(default)]
    comments: Vec<GhComment>,
}

#[derive(Deserialize)]
struct GhComment {
    author: Option<GhUser>,
    #[serde(default)]
    body: String,
}

fn parse_list(json: &str) -> Result<Vec<OpenIssue>, String> {
    let listed: Vec<GhIssue> = serde_json::from_str(json).map_err(|e| e.to_string())?;
    Ok(listed
        .into_iter()
        .map(|i| {
            let labels = i.labels.into_iter().map(|l| l.name).collect();
            let author = i.author.map(|a| a.login).unwrap_or_default();
            open_issue(i.number, &i.title, i.url, author, labels)
        })
        .collect())
}

fn parse_view(json: &str) -> Result<Discussion, String> {
    let i: GhIssue = serde_json::from_str(json).map_err(|e| e.to_string())?;
    Ok(Discussion {
        number: i.number,
        title: one_line(&i.title),
        url: i.url,
        body: plain(&i.body),
        comments: i
            .comments
            .into_iter()
            .map(|c| (author(c.author.map(|a| a.login)), plain(&c.body)))
            .collect(),
        reader: format!("gh issue view {} --comments", i.number),
    })
}

pub(crate) fn author(login: Option<String>) -> String {
    login
        .filter(|l| !l.is_empty())
        .unwrap_or_else(|| "ghost".into())
}

pub(crate) fn open_issue(
    number: u64,
    title: &str,
    url: String,
    author: String,
    labels: Vec<String>,
) -> OpenIssue {
    OpenIssue {
        number,
        title: one_line(title),
        url,
        author,
        labels,
        branch: crate::issue_branch::name_for(number, title),
    }
}

fn thread(d: &Discussion) -> String {
    let mut out: Vec<String> = Vec::new();
    if !d.body.is_empty() {
        out.push(d.body.clone());
    }
    let said: Vec<String> = d
        .comments
        .iter()
        .filter(|(_, body)| !body.is_empty())
        .map(|(who, body)| format!("- {who}: {}", body.replace('\n', "\n  ")))
        .collect();
    if !said.is_empty() {
        out.push(format!("Comments:\n{}", said.join("\n")));
    }
    out.join("\n\n")
}

fn text_of(d: &Discussion) -> IssueText {
    let thread = thread(d);
    let rest = if thread.is_empty() {
        String::new()
    } else {
        format!("\n\n{thread}")
    };
    let block = cap_lines(&format!("#{} {}\n{}{rest}", d.number, d.title, d.url));
    IssueText {
        number: d.number,
        mention: format!("Issue #{}:\n{}\n", d.number, fenced(&block)),
        prompt: cap_prompt(
            &format!("Work on issue #{}: {}\n{}{rest}", d.number, d.title, d.url),
            &d.reader,
        ),
        title: d.title.clone(),
        url: d.url.clone(),
    }
}

fn cap_lines(text: &str) -> String {
    let lines: Vec<&str> = text.lines().collect();
    if lines.len() <= MENTION_LINES {
        return text.to_string();
    }
    let left = lines.len() - MENTION_LINES;
    let noun = if left == 1 { "line" } else { "lines" };
    format!(
        "{}\n… {left} more {noun} left out",
        lines[..MENTION_LINES].join("\n")
    )
}

fn cap_prompt(text: &str, reader: &str) -> String {
    if text.chars().count() <= PROMPT_CHARS {
        return text.to_string();
    }
    let kept: String = text.chars().take(PROMPT_CHARS).collect();
    format!("{}…\n\nRead the rest with `{reader}`.", kept.trim_end())
}

#[cfg(test)]
#[path = "issues_tests.rs"]
mod tests;
