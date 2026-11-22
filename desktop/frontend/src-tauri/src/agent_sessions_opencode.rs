//! Reading OpenCode's sessions: one row per conversation in `opencode.db` in its
//! data folder, scoped by the folder it ran in, so a page is a single query.
//! OpenCode 2 keeps them in `session_v2`, with each message a `session_message`
//! row; OpenCode 1 in `session`. Columns differ across versions, so each one is
//! probed before it appears in a statement, as codex's are.
use crate::agent_session_titles::{compact_fallback, compact_title};
use crate::agent_sessions::{escape_like, open_store, root_spellings, AgentSessionSummary, StorePage};
use rusqlite::Connection;
use std::collections::HashSet;
use std::path::Path;

/// The title OpenCode gives a session until it has a real one.
const PLACEHOLDER_TITLES: [&str; 2] = ["New session - ", "Child session - "];

/// The project's sessions, newest first.
pub(crate) fn page(data_dir: Option<&Path>, root: &str, needle: &str, limit: usize) -> StorePage {
    let Some(connection) = data_dir.and_then(|dir| open_store(&dir.join("opencode.db"))) else {
        return StorePage::default();
    };
    let Some(table) = ["session_v2", "session"]
        .into_iter()
        .find(|t| table_exists(&connection, t))
    else {
        return StorePage::default();
    };
    let rows = sessions(&connection, table, root, needle, limit).unwrap_or_default();
    StorePage {
        more: rows.len() >= limit,
        rows,
    }
}

fn table_exists(connection: &Connection, table: &str) -> bool {
    connection
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1",
            [table],
            |_| Ok(()),
        )
        .is_ok()
}

fn columns(connection: &Connection, table: &str) -> HashSet<String> {
    let Ok(mut statement) = connection.prepare(&format!("PRAGMA table_info({table})")) else {
        return HashSet::new();
    };
    statement
        .query_map([], |row| row.get::<_, String>(1))
        .map(|rows| rows.flatten().collect())
        .unwrap_or_default()
}

fn sessions(
    connection: &Connection,
    table: &str,
    root: &str,
    needle: &str,
    limit: usize,
) -> Option<Vec<AgentSessionSummary>> {
    let columns = columns(connection, table);
    let has = |name: &str| columns.contains(name);
    if !has("id") || !has("directory") {
        return None;
    }
    let spellings = root_spellings(root);
    let mut filters = vec![format!(
        "s.directory IN ({})",
        (0..spellings.len())
            .map(|i| format!("?{}", i + 2))
            .collect::<Vec<_>>()
            .join(",")
    )];
    // A child session is a sub-agent's, part of its parent's conversation.
    if has("parent_id") {
        filters.push("s.parent_id IS NULL".into());
    }
    if has("time_archived") {
        filters.push("s.time_archived IS NULL".into());
    }
    // OpenCode 1 keeps the opening prompt off the session's tables, so its rows
    // carry the title alone.
    let messages = table == "session_v2" && table_exists(connection, "session_message");
    let prompt = if messages {
        "(SELECT json_extract(m.data, '$.text') FROM session_message m \
         WHERE m.session_id = s.id AND m.type = 'user' ORDER BY m.seq LIMIT 1)"
    } else {
        "NULL"
    };
    let title = if has("title") { "s.title" } else { "NULL" };
    if !needle.is_empty() {
        filters.push(format!(
            "(LOWER(COALESCE({title},'')) LIKE ?1 ESCAPE '\\' \
             OR LOWER(COALESCE({prompt},'')) LIKE ?1 ESCAPE '\\')"
        ));
    }
    let recency = ["time_updated", "time_created"]
        .into_iter()
        .filter(|name| has(name))
        .map(|name| format!("NULLIF(s.{name},0)"))
        .collect::<Vec<_>>();
    let recency = if recency.is_empty() {
        "0".to_string()
    } else {
        format!("COALESCE({},0)", recency.join(","))
    };
    let sql = format!(
        "SELECT CAST(s.id AS TEXT), {title}, {prompt}, {recency} FROM {table} s \
         WHERE {} ORDER BY {recency} DESC LIMIT {limit}",
        filters.join(" AND "),
    );
    let mut statement = connection.prepare(&sql).ok()?;
    let pattern = format!("%{}%", escape_like(needle));
    // ?1 is the search, unused (but still bound) without one.
    let mut params: Vec<&dyn rusqlite::ToSql> = vec![&pattern];
    for spelling in &spellings {
        params.push(spelling);
    }
    let rows = statement
        .query_map(params.as_slice(), |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, i64>(3)?,
            ))
        })
        .ok()?;
    Some(
        rows.flatten()
            .filter(|(id, ..)| crate::socketsrv::valid_session_id(id))
            .filter_map(|(id, title, prompt, updated_at)| {
                let title = title
                    .filter(|t| !is_placeholder(t))
                    .as_deref()
                    .and_then(compact_title);
                let preview = prompt.as_deref().and_then(compact_fallback);
                (title.is_some() || preview.is_some()).then_some(AgentSessionSummary {
                    provider: "opencode",
                    session_id: id,
                    title,
                    preview,
                    updated_at,
                    git_branch: None,
                    account: None,
                })
            })
            .collect(),
    )
}

fn is_placeholder(title: &str) -> bool {
    PLACEHOLDER_TITLES.iter().any(|p| title.starts_with(p))
}

#[cfg(test)]
#[path = "agent_sessions_opencode_tests.rs"]
mod tests;
