//! A GitLab project's issues through `glab api`, in the shapes issues.rs gives
//! GitHub's.
use crate::githost::{glab_api, GitLabRepo};
use crate::issues::{author, open_issue, Discussion, OpenIssue};
use crate::untrusted::{one_line, plain};
use serde::Deserialize;

#[derive(Deserialize, Default)]
#[serde(default)]
struct Issue {
    iid: u64,
    title: String,
    web_url: String,
    description: Option<String>,
    labels: Vec<String>,
    author: Option<Author>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct Author {
    username: String,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct Note {
    body: String,
    author: Option<Author>,
    system: bool,
}

pub(crate) fn open(cwd: &str, repo: &GitLabRepo) -> Result<Vec<OpenIssue>, String> {
    let json = glab_api(
        cwd,
        repo,
        "issues?state=opened&order_by=created_at&sort=desc&per_page=100",
        &[],
    )?;
    parse_list(&json)
}

pub(crate) fn discussion(cwd: &str, repo: &GitLabRepo, iid: u64) -> Result<Discussion, String> {
    let issue = glab_api(cwd, repo, &format!("issues/{iid}"), &[])?;
    let notes = format!("issues/{iid}/notes?sort=asc&order_by=created_at&per_page=100");
    let notes = glab_api(cwd, repo, &notes, &[]).unwrap_or_default();
    parse_view(&issue, &notes)
}

fn parse_list(json: &str) -> Result<Vec<OpenIssue>, String> {
    let listed: Vec<Issue> = serde_json::from_str(json).map_err(|e| e.to_string())?;
    Ok(listed
        .into_iter()
        .filter(|i| i.iid > 0)
        .map(|i| {
            let author = i.author.map(|a| a.username).unwrap_or_default();
            open_issue(i.iid, &i.title, i.web_url, author, i.labels)
        })
        .collect())
}

fn parse_view(issue: &str, notes: &str) -> Result<Discussion, String> {
    let issue: Issue = serde_json::from_str(issue).map_err(|e| e.to_string())?;
    let notes: Vec<Note> = serde_json::from_str(notes).unwrap_or_default();
    Ok(Discussion {
        number: issue.iid,
        title: one_line(&issue.title),
        url: issue.web_url,
        body: plain(&issue.description.unwrap_or_default()),
        comments: notes
            .into_iter()
            .filter(|n| !n.system)
            .map(|n| (author(n.author.map(|a| a.username)), plain(&n.body)))
            .collect(),
        reader: format!("glab issue view {} --comments", issue.iid),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_gitlabs_issues_and_drops_what_the_system_wrote() {
        let listed = parse_list(
            r#"[{"iid":8,"title":"Dark mode","web_url":"https://gitlab.com/g/p/-/issues/8","labels":["ui"],"author":{"username":"maria"}}]"#,
        )
        .unwrap();
        assert_eq!(listed[0].branch, "8-dark-mode");
        assert_eq!(listed[0].labels, vec!["ui"]);

        let d = parse_view(
            r#"{"iid":8,"title":"Dark mode","web_url":"https://gitlab.com/g/p/-/issues/8","description":null}"#,
            r#"[{"body":"added label ~ui","system":true},{"body":"Follow the system","author":{"username":"dev"},"system":false}]"#,
        )
        .unwrap();
        assert_eq!(d.body, "");
        assert_eq!(d.comments, vec![("dev".to_string(), "Follow the system".to_string())]);
        assert_eq!(d.reader, "glab issue view 8 --comments");
    }
}
