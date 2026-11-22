//! Reading Cursor CLI's chats: a folder per conversation in
//! `~/.cursor/chats/<workspace>/<chat id>/`, `<workspace>` being a hash of the
//! folder it ran in. Each holds `meta.json` — that folder, its times, whether
//! anything was said — and `store.db`, whose `meta` row names the chat and
//! whose blobs are its messages. The hash is matched by reading the folder a
//! workspace's chats name, so nothing here depends on how Cursor computes it.
use crate::agent_session_titles::{compact_fallback, compact_title};
use crate::agent_sessions::{
    open_store, root_spellings, scan_page, AgentSessionSummary, FileCache, StorePage,
};
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

/// The name Cursor gives a chat until it has a real one.
const PLACEHOLDER_TITLE: &str = "New Agent";
/// Opening blobs looked at for the first prompt.
const PROMPT_SCAN_ROWS: usize = 20;

/// (title, opening prompt) per `store.db`.
static TEXT: FileCache<(Option<String>, Option<String>)> = FileCache::new();

struct Candidate {
    dir: PathBuf,
    chat_id: String,
    updated_at: i64,
}

/// The project's chats, newest first.
pub(crate) fn page(cursor_dir: Option<&Path>, root: &str, needle: &str, limit: usize) -> StorePage {
    let Some(cursor_dir) = cursor_dir else {
        return StorePage::default();
    };
    let candidates = candidates(&workspaces(&cursor_dir.join("chats"), root));
    scan_page(&candidates, needle, limit, |c| {
        let (title, preview) = TEXT
            .get_or_read(&c.dir.join("store.db"), |_| text(&c.dir.join("store.db")))
            .unwrap_or_default();
        Some(AgentSessionSummary {
            provider: "cursor",
            session_id: c.chat_id.clone(),
            title,
            preview,
            updated_at: c.updated_at,
            git_branch: None,
            account: None,
        })
    })
}

/// Workspace folder -> the project folder its chats ran in, once read.
fn workspace_roots() -> &'static Mutex<HashMap<PathBuf, Option<String>>> {
    static ROOTS: OnceLock<Mutex<HashMap<PathBuf, Option<String>>>> = OnceLock::new();
    ROOTS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// The workspace folders whose chats ran in `root`.
pub(crate) fn workspaces(chats: &Path, root: &str) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(chats) else {
        return Vec::new();
    };
    let spellings = root_spellings(root);
    let mut known = workspace_roots().lock().unwrap();
    entries
        .flatten()
        .map(|e| e.path())
        .filter(|dir| dir.is_dir())
        .filter(|dir| {
            if known.get(dir).is_none_or(Option::is_none) {
                let cwd = workspace_root(dir);
                known.insert(dir.clone(), cwd);
            }
            known
                .get(dir)
                .and_then(Option::as_deref)
                .is_some_and(|cwd| spellings.iter().any(|s| s == cwd))
        })
        .collect()
}

fn workspace_root(workspace: &Path) -> Option<String> {
    std::fs::read_dir(workspace)
        .ok()?
        .flatten()
        .find_map(|chat| meta(&chat.path())?["cwd"].as_str().map(str::to_string))
}

fn meta(chat: &Path) -> Option<Value> {
    serde_json::from_slice(&std::fs::read(chat.join("meta.json")).ok()?).ok()
}

fn candidates(workspaces: &[PathBuf]) -> Vec<Candidate> {
    let mut out = Vec::new();
    for workspace in workspaces {
        let Ok(entries) = std::fs::read_dir(workspace) else {
            continue;
        };
        for entry in entries.flatten() {
            let dir = entry.path();
            let Some(chat_id) = dir
                .file_name()
                .and_then(|n| n.to_str())
                .filter(|id| crate::socketsrv::valid_session_id(id))
                .map(str::to_string)
            else {
                continue;
            };
            let Some(meta) = meta(&dir) else { continue };
            // A chat opened and left before anything was said: nothing to resume.
            if meta["hasConversation"].as_bool() != Some(true) {
                continue;
            }
            let updated_at = ["updatedAtMs", "createdAtMs"]
                .into_iter()
                .find_map(|key| meta[key].as_i64())
                .unwrap_or(0);
            out.push(Candidate {
                dir,
                chat_id,
                updated_at,
            });
        }
    }
    out.sort_by_key(|c| std::cmp::Reverse(c.updated_at));
    out
}

/// The chat's name and its opening prompt. Either can be missing — a store
/// Cursor encrypted reads as neither — and the row still lists, since the
/// chat said there was a conversation.
fn text(store: &Path) -> (Option<String>, Option<String>) {
    let Some(connection) = open_store(store) else {
        return (None, None);
    };
    let title = connection
        .query_row("SELECT value FROM meta WHERE key = '0'", [], |row| {
            row.get::<_, String>(0)
        })
        .ok()
        .and_then(|value| hex::decode(value.trim()).ok())
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
        .and_then(|meta| meta["name"].as_str().map(str::to_string))
        .filter(|name| name.trim() != PLACEHOLDER_TITLE)
        .and_then(|name| compact_title(&name));
    let prompt = connection
        .prepare(&format!(
            "SELECT CAST(data AS TEXT) FROM blobs \
             WHERE CAST(data AS TEXT) LIKE '{{%\"role\":\"user\"%' ORDER BY rowid LIMIT {PROMPT_SCAN_ROWS}"
        ))
        .ok()
        .and_then(|mut statement| {
            let rows = statement.query_map([], |row| row.get::<_, String>(0)).ok()?;
            rows.flatten().find_map(|blob| user_query(&blob))
        })
        .and_then(|prompt| compact_fallback(&prompt));
    (title, prompt)
}

/// What the person asked, out of a user message: Cursor wraps it in
/// `<user_query>` among the context it adds (the OS, the time, open files).
fn user_query(blob: &str) -> Option<String> {
    let message: Value = serde_json::from_str(blob).ok()?;
    let text = match message.get("content")? {
        Value::String(text) => text.clone(),
        Value::Array(parts) => parts
            .iter()
            .filter_map(|p| p.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n"),
        _ => return None,
    };
    let start = text.find("<user_query>")? + "<user_query>".len();
    let end = text[start..]
        .find("</user_query>")
        .map_or(text.len(), |at| start + at);
    Some(text[start..end].trim().to_string()).filter(|q| !q.is_empty())
}

#[cfg(test)]
#[path = "agent_sessions_cursor_tests.rs"]
mod tests;
