// The discussion on a GitLab merge request, for the "@" menu and the phone, in
// the shape pull_request_review.rs gives GitHub's: approvals as review
// verdicts, diff notes on their lines, the rest as comments.
use crate::githost::{glab_api, GitLabRepo};
use crate::pull_request_review::{NoteKind, PullRequestDiscussion, PullRequestNote};
use serde::Deserialize;

#[derive(Deserialize, Default)]
#[serde(default)]
struct Note {
    body: String,
    author: Option<Author>,
    created_at: String,
    system: bool,
    #[serde(rename = "type")]
    kind: Option<String>,
    position: Option<Position>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct Author {
    username: String,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct Position {
    new_path: Option<String>,
    old_path: Option<String>,
    new_line: Option<u64>,
    old_line: Option<u64>,
}

/// The branch's merge request discussion, or None when it has none.
pub(crate) fn discussion(cwd: &str, repo: &GitLabRepo) -> Option<PullRequestDiscussion> {
    let (iid, title, url, body) = crate::gitlab_mr::heading(cwd, repo)?;
    let endpoint = format!("merge_requests/{iid}/notes?sort=asc&order_by=created_at&per_page=100");
    let notes = glab_api(cwd, repo, &endpoint, &[])
        .ok()
        .and_then(|json| serde_json::from_str::<Vec<Note>>(&json).ok())
        .unwrap_or_default();
    Some(PullRequestDiscussion {
        number: iid,
        title,
        url,
        body: body.trim().to_string(),
        notes: notes_from(notes),
    })
}

fn notes_from(notes: Vec<Note>) -> Vec<PullRequestNote> {
    let mut out: Vec<PullRequestNote> = notes.into_iter().filter_map(note).collect();
    out.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    out
}

fn note(n: Note) -> Option<PullRequestNote> {
    let author = n
        .author
        .map(|a| a.username)
        .filter(|u| !u.is_empty())
        .unwrap_or_else(|| "ghost".into());
    let body = n.body.trim().to_string();
    let base = PullRequestNote {
        kind: NoteKind::Comment,
        author,
        body: String::new(),
        state: String::new(),
        path: String::new(),
        line: None,
        created_at: n.created_at,
    };
    if n.system {
        let state = if body.starts_with("approved this merge request") {
            "APPROVED"
        } else if body.starts_with("requested changes") {
            "CHANGES_REQUESTED"
        } else {
            return None;
        };
        return Some(PullRequestNote {
            kind: NoteKind::Review,
            state: state.into(),
            ..base
        });
    }
    if body.is_empty() {
        return None;
    }
    if n.kind.as_deref() == Some("DiffNote") {
        let position = n.position.unwrap_or_default();
        return Some(PullRequestNote {
            kind: NoteKind::Line,
            body,
            path: position.new_path.or(position.old_path).unwrap_or_default(),
            line: position.new_line.or(position.old_line),
            ..base
        });
    }
    Some(PullRequestNote { body, ..base })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn approvals_lines_and_comments_in_order() {
        let notes: Vec<Note> = serde_json::from_str(
            r#"[
                {"body":"Ready for another look","author":{"username":"dev"},"created_at":"2026-10-03T10:00:00Z","system":false,"type":null},
                {"body":"approved this merge request","author":{"username":"maria"},"created_at":"2026-10-04T09:00:00Z","system":true},
                {"body":"added 2 commits","author":{"username":"dev"},"created_at":"2026-10-02T09:00:00Z","system":true},
                {"body":" Names with commas break the row. ","author":{"username":"maria"},"created_at":"2026-10-01T09:00:00Z","system":false,"type":"DiffNote","position":{"new_path":"src/export/csv.ts","new_line":14}}
            ]"#,
        )
        .unwrap();
        let out = notes_from(notes);
        let summary: Vec<(NoteKind, &str, &str, &str, Option<u64>)> = out
            .iter()
            .map(|n| {
                (
                    n.kind,
                    n.author.as_str(),
                    n.body.as_str(),
                    n.path.as_str(),
                    n.line,
                )
            })
            .collect();
        assert_eq!(
            summary,
            vec![
                (
                    NoteKind::Line,
                    "maria",
                    "Names with commas break the row.",
                    "src/export/csv.ts",
                    Some(14)
                ),
                (NoteKind::Comment, "dev", "Ready for another look", "", None),
                (NoteKind::Review, "maria", "", "", None),
            ]
        );
        assert_eq!(out[2].state, "APPROVED");
    }
}
