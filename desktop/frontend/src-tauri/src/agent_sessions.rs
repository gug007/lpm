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
    let (mut sessions, scanned) = claude::summaries(&candidates, &needle, limit);
    let codex = codex::summaries(&codex_home(), &project.root, &needle, limit);
    // Either store may have stopped at the page size, and a search stops at its
    // scan cap — any of those means "there is more behind this".
    let has_more = sessions.len() >= limit || codex.len() >= limit || scanned < candidates.len();
    sessions.extend(codex);

    sessions.sort_by_key(|s| std::cmp::Reverse(s.updated_at));
    sessions.truncate(limit);
    Ok(AgentSessionPage { sessions, has_more })
}
