// A GitLab project's open merge requests, and the reviews of one, for
// pr_watch.rs. GitLab keeps a review's remarks as notes of their own.
use crate::githost::{glab_api, glab_out, GitLabRepo};
use crate::pr_watch_state::{LineComment, Listing, Pull, Review, LISTED};
use crate::ttl_cache::TtlCache;
use serde::Deserialize;
use std::time::Duration;

/// GitLab's access level for someone who can push.
const DEVELOPER: u64 = 30;
const FRESH: Duration = Duration::from_secs(10 * 60);

#[derive(Deserialize, Default)]
#[serde(default)]
struct Person {
    id: u64,
    username: String,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct Mr {
    iid: u64,
    title: String,
    web_url: String,
    draft: bool,
    work_in_progress: bool,
    created_at: String,
    updated_at: String,
    source_branch: String,
    target_branch: String,
    sha: String,
    source_project_id: u64,
    target_project_id: u64,
    author: Person,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct Note {
    body: String,
    author: Person,
    created_at: String,
    system: bool,
    #[serde(rename = "type")]
    kind: Option<String>,
    position: Option<Position>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct Position {
    new_path: Option<String>,
    old_path: Option<String>,
    new_line: Option<u64>,
    old_line: Option<u64>,
}

pub(crate) fn open(cwd: &str, repo: &GitLabRepo) -> Result<Listing, String> {
    let me = signed_in_as(cwd, repo)?;
    let path = format!("merge_requests?state=opened&order_by=updated_at&sort=desc&per_page={LISTED}");
    parse_open(&glab_api(cwd, repo, &path, &[])?, me)
}

pub(crate) fn reviews(cwd: &str, repo: &GitLabRepo, iid: u64) -> Result<Vec<Review>, String> {
    let path = format!("merge_requests/{iid}/notes?sort=desc&order_by=created_at&per_page=50");
    let notes = glab_api(cwd, repo, &path, &[])?;
    parse_notes(&notes, |id| can_write(cwd, repo, id))
}

fn signed_in_as(cwd: &str, repo: &GitLabRepo) -> Result<String, String> {
    static ME: TtlCache<String, Result<String, String>> = TtlCache::new(FRESH);
    ME.get_or(repo.host.clone(), || {
        let json = glab_out(cwd, &["api", "--hostname", &repo.host, "user"])?;
        let person: Person = serde_json::from_str(&json).map_err(|e| e.to_string())?;
        Ok(person.username)
    })
}

/// Whether the person with this id can push to the project. GitLab answers "not
/// found" for someone who isn't a member, so a failure counts as a no.
pub(crate) fn can_write(cwd: &str, repo: &GitLabRepo, id: u64) -> bool {
    static WRITERS: TtlCache<(String, u64), bool> = TtlCache::new(FRESH);
    if id == 0 {
        return false;
    }
    WRITERS.get_or((format!("{}/{}", repo.host, repo.path), id), || {
        glab_api(cwd, repo, &format!("members/all/{id}"), &[])
            .ok()
            .and_then(|json| serde_json::from_str::<serde_json::Value>(&json).ok())
            .and_then(|member| member["access_level"].as_u64())
            .is_some_and(|level| level >= DEVELOPER)
    })
}

/// GitLab doesn't mark bots; project and group access tokens are named so.
fn is_bot(username: &str) -> bool {
    let name = username.to_lowercase();
    name.ends_with("bot")
        || name.ends_with("[bot]")
        || name.starts_with("project_") && name.contains("_bot")
        || name.starts_with("group_") && name.contains("_bot")
}

fn parse_open(json: &str, me: String) -> Result<Listing, String> {
    let listed: Vec<Mr> = serde_json::from_str(json).map_err(|e| e.to_string())?;
    let pulls = listed
        .into_iter()
        .filter(|mr| mr.iid > 0)
        .map(|mr| Pull {
            number: mr.iid,
            title: mr.title,
            url: mr.web_url,
            mine: mr.author.username == me,
            // Asked for only when it matters (can_write).
            trusted: false,
            bot: false,
            author: mr.author.username,
            author_id: mr.author.id,
            draft: mr.draft || mr.work_in_progress,
            from_fork: mr.source_project_id != mr.target_project_id,
            branch: mr.source_branch,
            base: mr.target_branch,
            head: mr.sha,
            created: mr.created_at,
            updated: mr.updated_at,
        })
        .collect();
    Ok(Listing { me, can_push: true, pulls })
}

fn parse_notes(json: &str, can_write: impl Fn(u64) -> bool) -> Result<Vec<Review>, String> {
    let notes: Vec<Note> = serde_json::from_str(json).map_err(|e| e.to_string())?;
    let mut reviews: Vec<Review> = notes
        .into_iter()
        .filter_map(|n| review(n, &can_write))
        .collect();
    reviews.sort_by(|a, b| a.at.cmp(&b.at));
    Ok(reviews)
}

fn review(n: Note, can_write: &impl Fn(u64) -> bool) -> Option<Review> {
    let body = n.body.trim().to_string();
    let (state, body, comments) = match (n.system, n.kind.as_deref()) {
        (true, _) if body.starts_with("requested changes") => {
            ("CHANGES_REQUESTED", String::new(), Vec::new())
        }
        (true, _) => return None,
        (false, Some("DiffNote")) => {
            let at = n.position.unwrap_or_default();
            let line = LineComment {
                path: at.new_path.or(at.old_path).unwrap_or_default(),
                line: at.new_line.or(at.old_line),
                body,
            };
            ("COMMENTED", String::new(), vec![line])
        }
        // A thread someone started, which asks to be resolved.
        (false, Some("DiscussionNote")) => ("COMMENTED", body, Vec::new()),
        (false, _) => return None,
    };
    Some(Review {
        bot: is_bot(&n.author.username),
        trusted: can_write(n.author.id),
        author: n.author.username,
        state: state.into(),
        at: n.created_at,
        body,
        comments,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_open_merge_requests() {
        let listing = parse_open(
            r#"[{"iid":7,"title":"CSV","web_url":"https://gitlab.com/g/p/-/merge_requests/7","draft":true,
                "created_at":"2026-11-23T10:00:00.000Z","updated_at":"2026-11-23T11:00:00.000Z",
                "source_branch":"feat/csv","target_branch":"main","sha":"7e1f279","source_project_id":1,
                "target_project_id":2,"author":{"id":5,"username":"me"}}]"#,
            "me".into(),
        )
        .unwrap();
        let pull = &listing.pulls[0];
        assert!(pull.mine && pull.draft && pull.from_fork);
        assert_eq!((pull.author_id, pull.base.as_str()), (5, "main"));
    }

    #[test]
    fn remarks_and_requested_changes_are_reviews_and_chatter_is_not() {
        let notes = parse_notes(
            r#"[
                {"body":"requested changes","author":{"id":2,"username":"maria"},"created_at":"4","system":true},
                {"body":"added 2 commits","author":{"id":5,"username":"me"},"created_at":"3","system":true},
                {"body":"/label ~ui","author":{"id":2,"username":"maria"},"created_at":"2","system":false,"type":null},
                {"body":" Quote names ","author":{"id":2,"username":"maria"},"created_at":"1","system":false,
                 "type":"DiffNote","position":{"new_path":"src/csv.ts","new_line":14}},
                {"body":"Split this?","author":{"id":9,"username":"project_4_bot_a1"},"created_at":"5","system":false,"type":"DiscussionNote"}
            ]"#,
            |id| id == 2,
        )
        .unwrap();
        let summary: Vec<(&str, &str, bool, bool)> = notes
            .iter()
            .map(|r| (r.at.as_str(), r.state.as_str(), r.trusted, r.bot))
            .collect();
        assert_eq!(
            summary,
            vec![
                ("1", "COMMENTED", true, false),
                ("4", "CHANGES_REQUESTED", true, false),
                ("5", "COMMENTED", false, true),
            ]
        );
        assert_eq!(notes[0].comments[0].path, "src/csv.ts");
    }
}
