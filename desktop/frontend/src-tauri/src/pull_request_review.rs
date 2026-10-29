//! The discussion on a branch's pull request, for the terminal input's "@"
//! menu: its description, review verdicts, comments on lines of the diff and
//! the conversation, read through the `gh` CLI.
use crate::pull_request::gh_out;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestDiscussion {
    pub number: u64,
    pub title: String,
    pub url: String,
    pub body: String,
    /// Oldest first.
    pub notes: Vec<PullRequestNote>,
}

#[derive(Serialize, Debug, PartialEq, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum NoteKind {
    /// A review verdict.
    Review,
    /// A comment on a line of the diff.
    Line,
    Comment,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestNote {
    pub kind: NoteKind,
    pub author: String,
    pub body: String,
    /// The review verdict, e.g. "CHANGES_REQUESTED"; empty for other kinds.
    pub state: String,
    pub path: String,
    pub line: Option<u64>,
    pub created_at: String,
}

#[derive(Deserialize)]
struct GhUser {
    #[serde(default)]
    login: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhView {
    number: u64,
    #[serde(default)]
    title: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    body: String,
    #[serde(default)]
    comments: Vec<GhComment>,
    #[serde(default)]
    reviews: Vec<GhReview>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhComment {
    author: Option<GhUser>,
    #[serde(default)]
    body: String,
    #[serde(default)]
    created_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhReview {
    author: Option<GhUser>,
    #[serde(default)]
    body: String,
    #[serde(default)]
    state: String,
    #[serde(default)]
    submitted_at: String,
}

#[derive(Deserialize)]
struct GhLineComment {
    user: Option<GhUser>,
    #[serde(default)]
    body: String,
    #[serde(default)]
    path: String,
    line: Option<u64>,
    original_line: Option<u64>,
    #[serde(default)]
    created_at: String,
}

/// The discussion, or None when the branch has no pull request.
#[tauri::command(async)]
pub fn pull_request_discussion(cwd: String) -> Result<Option<PullRequestDiscussion>, String> {
    let view = match gh_out(
        &cwd,
        &[
            "pr",
            "view",
            "--json",
            "number,title,url,body,comments,reviews",
        ],
    ) {
        Ok(json) => json,
        Err(e) if e.contains("no pull requests found") => return Ok(None),
        Err(e) => return Err(e),
    };
    let view: GhView = serde_json::from_str(&view).map_err(|e| e.to_string())?;
    let endpoint = format!(
        "repos/{{owner}}/{{repo}}/pulls/{}/comments?per_page=100",
        view.number
    );
    let lines = gh_out(&cwd, &["api", &endpoint])
        .ok()
        .and_then(|json| serde_json::from_str::<Vec<GhLineComment>>(&json).ok())
        .unwrap_or_default();
    Ok(Some(discussion(view, lines)))
}

fn note(kind: NoteKind, user: Option<GhUser>, body: &str, created_at: String) -> PullRequestNote {
    PullRequestNote {
        kind,
        author: user
            .map(|u| u.login)
            .filter(|l| !l.is_empty())
            .unwrap_or_else(|| "ghost".into()),
        body: body.trim().to_string(),
        state: String::new(),
        path: String::new(),
        line: None,
        created_at,
    }
}

fn discussion(view: GhView, lines: Vec<GhLineComment>) -> PullRequestDiscussion {
    let mut notes: Vec<PullRequestNote> = Vec::new();
    for r in view.reviews {
        // A bare "COMMENTED" review only carries line comments, listed on their own.
        if r.body.trim().is_empty() && !matches!(r.state.as_str(), "APPROVED" | "CHANGES_REQUESTED")
        {
            continue;
        }
        notes.push(PullRequestNote {
            state: r.state,
            ..note(NoteKind::Review, r.author, &r.body, r.submitted_at)
        });
    }
    for c in lines {
        notes.push(PullRequestNote {
            path: c.path,
            line: c.line.or(c.original_line),
            ..note(NoteKind::Line, c.user, &c.body, c.created_at)
        });
    }
    for c in view.comments {
        notes.push(note(NoteKind::Comment, c.author, &c.body, c.created_at));
    }
    // ISO 8601 timestamps sort as text.
    notes.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    PullRequestDiscussion {
        number: view.number,
        title: view.title,
        url: view.url,
        body: view.body.trim().to_string(),
        notes,
    }
}

#[cfg(test)]
mod tests {
    use super::{discussion, GhLineComment, GhView, NoteKind};

    const VIEW: &str = r#"{
        "number": 212, "title": "Add CSV export", "url": "https://github.com/o/r/pull/212",
        "body": "Exports invoices.\n",
        "comments": [{"author": {"login": "dev"}, "body": "Ready for another look", "createdAt": "2026-10-03T10:00:00Z"}],
        "reviews": [
            {"author": {"login": "maria"}, "body": "", "state": "COMMENTED", "submittedAt": "2026-10-01T09:00:00Z"},
            {"author": {"login": "maria"}, "body": "", "state": "CHANGES_REQUESTED", "submittedAt": "2026-10-02T09:00:00Z"},
            {"author": null, "body": "Looks good", "state": "APPROVED", "submittedAt": "2026-10-04T09:00:00Z"}
        ]
    }"#;

    const LINES: &str = r#"[
        {"user": {"login": "maria"}, "body": " Names with commas break the row. ", "path": "src/export/csv.ts", "line": 14, "original_line": 12, "created_at": "2026-10-01T09:00:00Z"},
        {"user": {"login": "maria"}, "body": "Outdated", "path": "src/routes/export.ts", "line": null, "original_line": 30, "created_at": "2026-10-02T08:00:00Z"}
    ]"#;

    fn parse() -> super::PullRequestDiscussion {
        let view: GhView = serde_json::from_str(VIEW).unwrap();
        let lines: Vec<GhLineComment> = serde_json::from_str(LINES).unwrap();
        discussion(view, lines)
    }

    #[test]
    fn keeps_pr_header_and_trims_body() {
        let d = parse();
        assert_eq!(d.number, 212);
        assert_eq!(d.title, "Add CSV export");
        assert_eq!(d.body, "Exports invoices.");
    }

    #[test]
    fn orders_notes_by_time_and_drops_empty_comment_reviews() {
        let kinds: Vec<(NoteKind, String)> = parse()
            .notes
            .into_iter()
            .map(|n| (n.kind, n.author))
            .collect();
        assert_eq!(
            kinds,
            vec![
                (NoteKind::Line, "maria".to_string()),
                (NoteKind::Line, "maria".to_string()),
                (NoteKind::Review, "maria".to_string()),
                (NoteKind::Comment, "dev".to_string()),
                (NoteKind::Review, "ghost".to_string()),
            ]
        );
    }

    #[test]
    fn line_comments_fall_back_to_the_original_line() {
        let d = parse();
        let first = &d.notes[0];
        assert_eq!(
            (first.path.as_str(), first.line, first.body.as_str()),
            (
                "src/export/csv.ts",
                Some(14),
                "Names with commas break the row."
            )
        );
        assert_eq!(d.notes[1].line, Some(30));
    }

    #[test]
    fn note_kinds_serialize_lowercase() {
        assert_eq!(
            serde_json::to_string(&NoteKind::Review).unwrap(),
            "\"review\""
        );
    }
}
