//! Every past agent conversation a project can be resumed into, read from the
//! agents' own stores: claude's per-project transcripts, codex's thread
//! database, Gemini CLI's chat files, OpenCode's database and Cursor CLI's chat
//! folders. The tab history lpm keeps only covers sessions closed inside the
//! app, so it misses everything started from a plain shell or lost to a
//! restart — this is the full set.
//!
//! The stores grow without bound — a busy project has thousands of sessions —
//! so a page is bounded at every step: enumerating candidates costs a directory
//! stat or one indexed query, and only the newest `limit` of them are opened.
//! What "opening" means is each store's own problem; see their modules.
use crate::agent_session_titles::codex_home;
use crate::agent_sessions_claude as claude;
use crate::agent_sessions_codex as codex;
use crate::agent_sessions_cursor as cursor;
use crate::agent_sessions_gemini as gemini;
use crate::agent_sessions_opencode as opencode;
use crate::config;
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const MAX_LIMIT: usize = 500;
const GLOBAL_PROJECT_NAME: &str = "__global__";
/// Sessions a search may open beyond the page itself.
const SEARCH_SCAN_CAP: usize = 200;
const FILE_CACHE_MAX: usize = 512;

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
    /// The Claude account whose config dir holds the conversation, which is
    /// where resuming it runs (`default` for the main login).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account: Option<String>,
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
    let (root, needle) = (&project.root, &needle);
    let claude = || {
        let candidates =
            claude::candidates_in(crate::claude_dirs::account_dirs().into_iter().map(|a| {
                (a.id, crate::claude_dirs::sessions_dir(&a.dir, root))
            }));
        scan_page(&candidates, needle, limit, claude::summary)
    };
    // Codex stops at the page size with no way to tell a full page from an
    // exhausted store.
    let codex = || {
        let rows = codex::summaries(&codex_home(), root, needle, limit);
        StorePage {
            more: rows.len() >= limit,
            rows,
        }
    };
    let gemini = || gemini::page(crate::agentdirs::gemini_dir(), root, needle, limit);
    let opencode = || opencode::page(crate::agentdirs::opencode_data_dir(), root, needle, limit);
    let cursor = || cursor::page(crate::agentdirs::cursor_dir(), root, needle, limit);
    let stores = std::thread::scope(|scope| {
        [
            scope.spawn(claude),
            scope.spawn(codex),
            scope.spawn(gemini),
            scope.spawn(opencode),
            scope.spawn(cursor),
        ]
        .map(|store| store.join().unwrap_or_default())
    });
    Ok(merge_page(stores.into(), limit))
}

/// One store's newest rows for a page, and whether it holds older ones past
/// them.
#[derive(Default)]
pub(crate) struct StorePage {
    pub rows: Vec<AgentSessionSummary>,
    pub more: bool,
}

/// One page out of every store, newest first. Each was filled to the page size
/// independently, so the merge itself drops rows — and the flag has to be read
/// off the merged page, not off any one store.
fn merge_page(stores: Vec<StorePage>, limit: usize) -> AgentSessionPage {
    let mut more = false;
    let mut sessions = Vec::new();
    for store in stores {
        more |= store.more;
        sessions.extend(store.rows);
    }
    sessions.sort_by_key(|s| std::cmp::Reverse(s.updated_at));
    let has_more = sessions.len() > limit || more;
    sessions.truncate(limit);
    AgentSessionPage { sessions, has_more }
}

/// Summarizes candidates newest first until the page is full. A search keeps
/// going past non-matches, but only so far — a bigger page (the caller asking
/// for more) is what widens the reach. A conversation found twice keeps its
/// first, newest row.
pub(crate) fn scan_page<C>(
    candidates: &[C],
    needle: &str,
    limit: usize,
    summarize: impl Fn(&C) -> Option<AgentSessionSummary>,
) -> StorePage {
    let scan_cap = if needle.is_empty() {
        limit
    } else {
        SEARCH_SCAN_CAP.max(limit * 5)
    };
    let mut rows = Vec::new();
    let mut seen = HashSet::new();
    let mut scanned = 0;
    for candidate in candidates {
        if rows.len() >= limit || scanned >= scan_cap {
            break;
        }
        scanned += 1;
        let Some(summary) = summarize(candidate) else {
            continue;
        };
        if matches_needle(&summary, needle) && seen.insert(summary.session_id.clone()) {
            rows.push(summary);
        }
    }
    StorePage {
        rows,
        more: scanned < candidates.len(),
    }
}

pub(crate) fn matches_needle(summary: &AgentSessionSummary, needle: &str) -> bool {
    if needle.is_empty() {
        return true;
    }
    [&summary.title, &summary.preview, &summary.git_branch]
        .into_iter()
        .flatten()
        .any(|field| field.to_lowercase().contains(needle))
}

pub(crate) fn epoch_millis(time: Option<SystemTime>) -> i64 {
    time.and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// What was read out of a file, valid while its mtime and length hold — so
/// reopening the picker, or typing in its search box, re-reads nothing that
/// hasn't changed.
pub(crate) struct FileCache<T>(OnceLock<Mutex<HashMap<PathBuf, (Option<SystemTime>, u64, T)>>>);

impl<T: Clone> FileCache<T> {
    pub(crate) const fn new() -> Self {
        Self(OnceLock::new())
    }

    pub(crate) fn get_or_read(&self, path: &Path, read: impl FnOnce(u64) -> T) -> Option<T> {
        let meta = std::fs::metadata(path).ok()?;
        let (mtime, len) = (meta.modified().ok(), meta.len());
        let cache = self.0.get_or_init(|| Mutex::new(HashMap::new()));
        if let Some((_, _, value)) = cache
            .lock()
            .unwrap()
            .get(path)
            .filter(|(m, l, _)| *m == mtime && *l == len)
        {
            return Some(value.clone());
        }
        let value = read(len);
        let mut cache = cache.lock().unwrap();
        if cache.len() >= FILE_CACHE_MAX && !cache.contains_key(path) {
            if let Some(evict) = cache.keys().next().cloned() {
                cache.remove(&evict);
            }
        }
        cache.insert(path.to_path_buf(), (mtime, len, value.clone()));
        Some(value)
    }
}

/// An agent's SQLite store, read-only. A database in WAL mode can't be opened
/// that way while its `-shm` file is missing (the agent isn't running), so that
/// case reads the file as it stands instead.
pub(crate) fn open_store(path: &Path) -> Option<Connection> {
    if !path.is_file() {
        return None;
    }
    let flags = OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    let usable = |connection: Connection| {
        let _ = connection.busy_timeout(Duration::from_millis(200));
        connection
            .query_row("SELECT count(*) FROM sqlite_master", [], |_| Ok(()))
            .is_ok()
            .then_some(connection)
    };
    Connection::open_with_flags(path, flags)
        .ok()
        .and_then(usable)
        .or_else(|| {
            Connection::open_with_flags(immutable_uri(path), flags | OpenFlags::SQLITE_OPEN_URI)
                .ok()
                .and_then(usable)
        })
}

fn immutable_uri(path: &Path) -> String {
    let mut spelled = path.to_string_lossy().replace('\\', "/");
    if !spelled.starts_with('/') {
        spelled.insert(0, '/');
    }
    let escaped = spelled
        .replace('%', "%25")
        .replace('?', "%3f")
        .replace('#', "%23");
    format!("file://{escaped}?immutable=1")
}

/// `needle` as a LIKE pattern matches it literally, under `ESCAPE '\\'`.
pub(crate) fn escape_like(needle: &str) -> String {
    needle
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

/// A message's text: a string as is, or the `text` of each of its parts,
/// joined with `sep`. None for any other shape.
pub(crate) fn content_text(content: &Value, sep: &str) -> Option<String> {
    match content {
        Value::String(text) => Some(text.clone()),
        Value::Array(parts) => Some(
            parts
                .iter()
                .filter_map(|p| p.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join(sep),
        ),
        _ => None,
    }
}

/// The project folder as the agent may have recorded it: as lpm knows it, and
/// with symlinks resolved (macOS's /tmp is /private/tmp).
pub(crate) fn root_spellings(root: &str) -> Vec<String> {
    let mut out = vec![root.to_string()];
    if let Ok(real) = std::fs::canonicalize(root) {
        let real = real
            .to_string_lossy()
            .trim_start_matches(r"\\?\")
            .to_string();
        if real != root {
            out.push(real);
        }
    }
    out
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
            account: None,
        }
    }

    fn store(rows: Vec<AgentSessionSummary>, more: bool) -> StorePage {
        StorePage { rows, more }
    }

    /// Interleaved timestamps, so truncating the merged page can only keep the
    /// newest rows by taking some of each store. Codex says it has more when it
    /// filled the page, as `list_agent_sessions` reads it.
    fn merged(claude: usize, codex: usize, limit: usize) -> AgentSessionPage {
        let claude = (0..claude)
            .map(|i| summary("claude", 2 * i as i64))
            .collect();
        let codex = (0..codex)
            .map(|i| summary("codex", 2 * i as i64 + 1))
            .collect::<Vec<_>>();
        let codex_full = codex.len() >= limit;
        merge_page(vec![store(claude, false), store(codex, codex_full)], limit)
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
        assert!(merge_page(vec![store(vec![summary("claude", 1)], true)], 40).has_more);
    }

    #[test]
    fn any_store_with_older_sessions_means_more() {
        let page = merge_page(
            vec![
                store(vec![summary("claude", 3)], false),
                store(vec![summary("gemini", 2)], false),
                store(vec![summary("cursor", 1)], true),
            ],
            40,
        );
        assert_eq!(page.sessions.len(), 3);
        assert!(page.has_more);
    }

    #[test]
    fn a_scan_skips_a_conversation_it_already_listed() {
        let rows = [
            summary("gemini", 3),
            summary("gemini", 3),
            summary("gemini", 2),
        ];
        let page = scan_page(&rows, "", 40, |s| Some(s.clone()));
        assert_eq!(page.rows.len(), 2);
        assert!(!page.more);
    }

    #[test]
    fn a_scan_stops_at_the_page_and_says_more_are_left() {
        let rows = (0..5).map(|i| summary("cursor", i)).collect::<Vec<_>>();
        let page = scan_page(&rows, "", 3, |s| Some(s.clone()));
        assert_eq!(page.rows.len(), 3);
        assert!(page.more);
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
