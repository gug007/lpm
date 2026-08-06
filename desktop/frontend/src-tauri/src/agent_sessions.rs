//! Every past agent conversation a project can be resumed into, read from the
//! agents' own stores: claude's per-project transcripts and codex's thread
//! database. The tab history lpm keeps only covers sessions closed inside the
//! app, so it misses everything started from a plain shell or lost to a
//! restart — this is the full set.
//!
//! Both stores grow without bound — a busy project has thousands of sessions —
//! so a page is bounded at every step: enumerating candidates costs a directory
//! stat and one indexed query, and only the newest `limit` of them are opened.
//! What "opening" means is each store's own problem; see the two modules.
use crate::agent_session_titles::codex_home;
use crate::agent_sessions_claude as claude;
use crate::agent_sessions_codex as codex;
use crate::config;
use serde::Serialize;

const MAX_LIMIT: usize = 500;
const GLOBAL_PROJECT_NAME: &str = "__global__";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentSessionSummary {
    pub provider: &'static str,
    pub session_id: String,
    pub title: Option<String>,
    pub preview: Option<String>,
    /// Last write, in epoch milliseconds.
    pub updated_at: i64,
    pub git_branch: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionPage {
    pub sessions: Vec<AgentSessionSummary>,
    /// Whether older sessions exist past this page — either more candidates
    /// than it holds, or a search that stopped at its scan cap.
    pub has_more: bool,
}

#[tauri::command(async)]
pub fn list_agent_sessions(
    project_name: String,
    limit: usize,
    search: String,
) -> Result<AgentSessionPage, String> {
    if project_name != GLOBAL_PROJECT_NAME {
        config::validate_name(&project_name)?;
    }
    let project = config::spawn_info(&project_name)?;
    if project.is_remote {
        return Err("agent sessions are only listed for local projects".into());
    }

    let limit = limit.clamp(1, MAX_LIMIT);
    let needle = search.trim().to_lowercase();
    let transcripts = crate::hooks::claude_sessions_dir(
        config::claude_env_for_account(project.claude_account.as_deref()),
        &project.root,
    );

    let candidates = claude::candidates(&transcripts);
    let (sessions, scanned) = claude::summaries(&candidates, &needle, limit);
    let codex = codex::summaries(&codex_home(), &project.root, &needle, limit);
    Ok(merge_page(
        sessions,
        codex,
        scanned < candidates.len(),
        limit,
    ))
}

/// One page out of the two stores, newest first. Both were filled to the page
/// size independently, so the merge itself drops rows — and the flag has to be
/// read off the merged page, not off either half.
fn merge_page(
    mut sessions: Vec<AgentSessionSummary>,
    codex: Vec<AgentSessionSummary>,
    claude_stopped_early: bool,
    limit: usize,
) -> AgentSessionPage {
    // Codex stops at the page size with no way to tell a full page from an
    // exhausted store; claude never returns more than the page size, so its
    // own overflow shows up as candidates it never opened.
    let codex_full = codex.len() >= limit;
    sessions.extend(codex);
    sessions.sort_by_key(|s| std::cmp::Reverse(s.updated_at));
    let has_more = sessions.len() > limit || codex_full || claude_stopped_early;
    sessions.truncate(limit);
    AgentSessionPage { sessions, has_more }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn summary(provider: &'static str, updated_at: i64) -> AgentSessionSummary {
        AgentSessionSummary {
            provider,
            session_id: format!("{provider}-{updated_at}"),
            title: None,
            preview: Some("prompt".into()),
            updated_at,
            git_branch: None,
        }
    }

    /// Interleaved timestamps, so truncating the merged page can only keep the
    /// newest rows by taking some of each store.
    fn merged(claude: usize, codex: usize, limit: usize) -> AgentSessionPage {
        let claude = (0..claude)
            .map(|i| summary("claude", 2 * i as i64))
            .collect();
        let codex = (0..codex)
            .map(|i| summary("codex", 2 * i as i64 + 1))
            .collect();
        merge_page(claude, codex, false, limit)
    }

    #[test]
    fn rows_the_merge_drops_still_count_as_older_sessions() {
        let page = merged(25, 30, 40);
        assert_eq!(page.sessions.len(), 40);
        assert!(page.has_more);
    }

    #[test]
    fn a_page_holding_both_stores_whole_is_the_end() {
        let page = merged(5, 5, 40);
        assert_eq!(page.sessions.len(), 10);
        assert!(!page.has_more);
    }

    #[test]
    fn a_full_codex_page_or_an_early_claude_stop_means_more() {
        assert!(merged(0, 4, 4).has_more);
        assert!(merge_page(vec![summary("claude", 1)], Vec::new(), true, 40).has_more);
    }

    #[test]
    fn the_page_is_newest_first_across_both_stores() {
        let page = merged(3, 3, 40);
        let order = page
            .sessions
            .iter()
            .map(|s| s.updated_at)
            .collect::<Vec<_>>();
        assert_eq!(order, vec![5, 4, 3, 2, 1, 0]);
    }
}
