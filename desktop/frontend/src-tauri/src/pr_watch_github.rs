// A GitHub repository's open pull requests, and the reviews of one, for
// pr_watch.rs. GraphQL answers each look in one call.
use crate::pr_watch_state::{LineComment, Listing, Pull, Review, LISTED};
use crate::pull_request::gh_out;
use crate::ttl_cache::TtlCache;
use serde::Deserialize;
use std::time::Duration;

const FRESH: Duration = Duration::from_secs(10 * 60);

const OPEN: &str = "query($owner:String!,$name:String!,$first:Int!){viewer{login} \
repository(owner:$owner,name:$name){viewerPermission pullRequests(states:OPEN,first:$first,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{\
number title url isDraft createdAt updatedAt headRefName headRefOid baseRefName isCrossRepository \
authorAssociation author{__typename login}}}}}";

const REVIEWS: &str = "query($owner:String!,$name:String!,$number:Int!){\
repository(owner:$owner,name:$name){pullRequest(number:$number){reviews(last:30){nodes{\
author{__typename login} authorAssociation state submittedAt body \
comments(first:50){nodes{path line originalLine body}}}}}}}";

#[derive(Deserialize)]
struct Answer<T> {
    data: T,
}

#[derive(Deserialize)]
struct Open {
    viewer: Login,
    repository: Option<OpenRepo>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenRepo {
    #[serde(default)]
    viewer_permission: Option<String>,
    pull_requests: Nodes<GhPull>,
}

#[derive(Deserialize)]
struct Nodes<T> {
    nodes: Vec<T>,
}

#[derive(Deserialize)]
struct Login {
    login: String,
}

#[derive(Deserialize)]
struct Author {
    #[serde(rename = "__typename")]
    kind: String,
    login: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhPull {
    number: u64,
    title: String,
    url: String,
    is_draft: bool,
    created_at: String,
    updated_at: String,
    head_ref_name: String,
    head_ref_oid: String,
    base_ref_name: String,
    is_cross_repository: bool,
    author_association: String,
    author: Option<Author>,
}

#[derive(Deserialize)]
struct Reviewed {
    repository: Option<ReviewedRepo>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReviewedRepo {
    pull_request: Option<ReviewedPull>,
}

#[derive(Deserialize)]
struct ReviewedPull {
    reviews: Nodes<GhReview>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhReview {
    author: Option<Author>,
    author_association: String,
    state: String,
    submitted_at: Option<String>,
    body: String,
    comments: Nodes<GhComment>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhComment {
    path: String,
    line: Option<u64>,
    original_line: Option<u64>,
    body: String,
}

fn ask(cwd: &str, query: &str, extra: &[&str]) -> Result<String, String> {
    let query = format!("query={query}");
    let mut args = vec!["api", "graphql", "-F", "owner={owner}", "-F", "name={repo}"];
    args.extend_from_slice(extra);
    args.extend_from_slice(&["-f", &query]);
    gh_out(cwd, &args)
}

pub(crate) fn open(cwd: &str) -> Result<Listing, String> {
    parse_open(&ask(cwd, OPEN, &["-F", &format!("first={LISTED}")])?)
}

pub(crate) fn reviews(cwd: &str, number: u64) -> Result<Vec<Review>, String> {
    parse_reviews(&ask(cwd, REVIEWS, &["-F", &format!("number={number}")])?)
}

/// Whether `login` can push. An organization's member may only read, and someone
/// GitHub won't tell about can't be counted on to write.
pub(crate) fn can_write(cwd: &str, login: &str) -> bool {
    static WRITERS: TtlCache<(String, String), bool> = TtlCache::new(FRESH);
    if login.is_empty() || !login.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return false;
    }
    let key = (cwd.to_string(), login.to_string());
    let mut asked = Ok(());
    let writes = WRITERS.get_or(key.clone(), || {
        let path = format!("repos/{{owner}}/{{repo}}/collaborators/{login}/permission");
        let answer = gh_out(cwd, &["api", &path]);
        asked = answer.as_ref().map(|_| ()).map_err(String::clone);
        answer.is_ok_and(|json| may_push(&json))
    });
    if asked.is_err() {
        WRITERS.forget(&key);
    }
    writes
}

fn may_push(json: &str) -> bool {
    let answer: Option<serde_json::Value> = serde_json::from_str(json).ok();
    answer.is_some_and(|a| matches!(a["permission"].as_str(), Some("admin" | "maintain" | "write")))
}

fn is_bot(author: &Option<Author>) -> bool {
    author.as_ref().is_some_and(|a| a.kind == "Bot")
}

/// What GitHub says of them at once; `can_write` settles it.
fn trusted(author: &Option<Author>, association: &str) -> bool {
    is_bot(author) || matches!(association, "OWNER" | "MEMBER" | "COLLABORATOR")
}

fn login(author: Option<Author>) -> String {
    author.map(|a| a.login).unwrap_or_else(|| "ghost".into())
}

fn parse_open(json: &str) -> Result<Listing, String> {
    let answer: Answer<Open> = serde_json::from_str(json).map_err(|e| e.to_string())?;
    let me = answer.data.viewer.login;
    let repo = answer.data.repository.ok_or("GitHub doesn't know this repository")?;
    let can_push = matches!(
        repo.viewer_permission.as_deref(),
        Some("ADMIN" | "MAINTAIN" | "WRITE")
    );
    let pulls = repo
        .pull_requests
        .nodes
        .into_iter()
        .map(|p| Pull {
            number: p.number,
            title: p.title,
            url: p.url,
            mine: p.author.as_ref().is_some_and(|a| a.login == me),
            trusted: trusted(&p.author, &p.author_association),
            bot: is_bot(&p.author),
            author: login(p.author),
            author_id: 0,
            draft: p.is_draft,
            from_fork: p.is_cross_repository,
            branch: p.head_ref_name,
            base: p.base_ref_name,
            head: p.head_ref_oid,
            created: p.created_at,
            updated: p.updated_at,
        })
        .collect();
    Ok(Listing { me, can_push, pulls })
}

fn parse_reviews(json: &str) -> Result<Vec<Review>, String> {
    let answer: Answer<Reviewed> = serde_json::from_str(json).map_err(|e| e.to_string())?;
    let nodes = answer
        .data
        .repository
        .and_then(|r| r.pull_request)
        .ok_or("GitHub doesn't know this pull request")?
        .reviews
        .nodes;
    Ok(nodes
        .into_iter()
        .filter_map(|r| {
            Some(Review {
                // A review being written has no time yet.
                at: r.submitted_at?,
                bot: is_bot(&r.author),
                trusted: trusted(&r.author, &r.author_association),
                author: login(r.author),
                state: r.state,
                body: r.body.trim().to_string(),
                comments: r
                    .comments
                    .nodes
                    .into_iter()
                    .map(|c| LineComment {
                        path: c.path,
                        line: c.line.or(c.original_line),
                        body: c.body,
                    })
                    .collect(),
            })
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_open_pull_requests_and_whose_they_are() {
        let listing = parse_open(
            r#"{"data":{"viewer":{"login":"me"},"repository":{"pullRequests":{"nodes":[
                {"number":212,"title":"CSV","url":"https://github.com/o/r/pull/212","isDraft":false,
                 "createdAt":"2026-11-23T10:00:00Z","updatedAt":"2026-11-23T11:00:00Z","headRefName":"feat/csv",
                 "headRefOid":"7e1f279","baseRefName":"main","isCrossRepository":false,
                 "authorAssociation":"OWNER","author":{"__typename":"User","login":"me"}},
                {"number":213,"title":"Free coins","url":"u","isDraft":true,"createdAt":"c","updatedAt":"u",
                 "headRefName":"main","headRefOid":"x","baseRefName":"main","isCrossRepository":true,
                 "authorAssociation":"NONE","author":{"__typename":"User","login":"stranger"}},
                {"number":214,"title":"Bump","url":"u","isDraft":false,"createdAt":"c","updatedAt":"u",
                 "headRefName":"dependabot/x","headRefOid":"x","baseRefName":"main","isCrossRepository":false,
                 "authorAssociation":"NONE","author":{"__typename":"Bot","login":"dependabot"}}
            ]}}}}"#,
        )
        .unwrap();
        assert_eq!(listing.me, "me");
        assert!(!listing.can_push);
        let flags: Vec<(u64, bool, bool, bool, bool)> = listing
            .pulls
            .iter()
            .map(|p| (p.number, p.mine, p.trusted, p.draft, p.from_fork))
            .collect();
        assert_eq!(
            flags,
            vec![
                (212, true, true, false, false),
                (213, false, false, true, true),
                (214, false, true, false, false),
            ]
        );
        assert_eq!(listing.pulls[0].branch, "feat/csv");
    }

    #[test]
    fn only_someone_who_can_push_writes() {
        for (json, writes) in [
            (r#"{"permission":"admin","role_name":"admin"}"#, true),
            (r#"{"permission":"write","role_name":"maintain"}"#, true),
            (r#"{"permission":"read","role_name":"triage"}"#, false),
            (r#"{"permission":"none"}"#, false),
            (r#"{"message":"Must have push access"}"#, false),
            ("", false),
        ] {
            assert_eq!(may_push(json), writes, "{json}");
        }
        assert!(!can_write("/none", "evil/../../user"));
        assert!(!can_write("/none", ""));
    }

    #[test]
    fn reads_reviews_with_their_lines_and_leaves_out_one_being_written() {
        let reviews = parse_reviews(
            r#"{"data":{"repository":{"pullRequest":{"reviews":{"nodes":[
                {"author":{"__typename":"User","login":"maria"},"authorAssociation":"MEMBER","state":"CHANGES_REQUESTED",
                 "submittedAt":"2026-11-23T11:00:00Z","body":" Two things ","comments":{"nodes":[
                    {"path":"src/csv.ts","line":null,"originalLine":14,"body":"Quote names"}]}},
                {"author":{"__typename":"Bot","login":"coderabbitai"},"authorAssociation":"NONE","state":"COMMENTED",
                 "submittedAt":"2026-11-23T11:05:00Z","body":"","comments":{"nodes":[]}},
                {"author":null,"authorAssociation":"NONE","state":"COMMENTED","submittedAt":"2026-11-23T11:06:00Z","body":"hi","comments":{"nodes":[]}},
                {"author":{"__typename":"User","login":"me"},"authorAssociation":"OWNER","state":"PENDING","submittedAt":null,"body":"","comments":{"nodes":[]}}
            ]}}}}}"#,
        )
        .unwrap();
        assert_eq!(reviews.len(), 3);
        assert_eq!(reviews[0].comments[0].line, Some(14));
        assert_eq!(reviews[0].body, "Two things");
        assert!(reviews[1].bot && reviews[1].trusted);
        assert!(reviews[2].author == "ghost" && !reviews[2].trusted);
    }
}
