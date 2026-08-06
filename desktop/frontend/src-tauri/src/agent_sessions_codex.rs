//! Reading codex's thread database: one indexed row per conversation, so a
//! project's page is a single query — scoped to its directory, ordered by
//! recency, searched in SQL. Column sets differ across codex versions, so every
//! optional column is probed before it appears in a statement.
use crate::agent_session_titles::{
    codex_state_databases, compact_fallback, compact_title, threads_columns,
};
use crate::agent_sessions::AgentSessionSummary;
use rusqlite::{Connection, OpenFlags};
use std::path::Path;
use std::time::Duration;

/// Every resumable thread this project has, newest first.
pub(crate) fn summaries(
    home: &Path,
    cwd: &str,
    needle: &str,
    limit: usize,
) -> Vec<AgentSessionSummary> {
    for path in codex_state_databases(home) {
        let Ok(connection) = Connection::open_with_flags(
            &path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        ) else {
            continue;
        };
        let _ = connection.busy_timeout(Duration::from_millis(200));
        let Ok(columns) = threads_columns(home, &path, &connection) else {
            continue;
        };
        if !columns.contains("id") || !columns.contains("cwd") {
            continue;
        }

        let has = |name: &str| columns.contains(name);
        let text = |name: &str| {
            if has(name) {
                format!("CAST({name} AS TEXT)")
            } else {
                "NULL".to_string()
            }
        };
        // Whichever timestamp this schema has, normalized to milliseconds.
        let recency = ["updated_at_ms", "recency_at", "updated_at", "created_at"]
            .iter()
            .filter(|name| has(name))
            .map(|name| {
                if name.ends_with("_ms") {
                    format!("NULLIF({name},0)")
                } else {
                    format!("NULLIF({name},0)*1000")
                }
            })
            .collect::<Vec<_>>();
        let recency = if recency.is_empty() {
            "0".to_string()
        } else {
            format!("COALESCE({},0)", recency.join(","))
        };

        let mut filters = vec!["cwd = ?1".to_string()];
        if has("archived") {
            filters.push("COALESCE(archived,0) = 0".into());
        }
        // `exec` threads are one-shot `codex exec` runs (lpm's own commit-message
        // and summary generators among them) and `{"subagent":…}` threads belong
        // to a parent conversation; neither is something to resume into. Older
        // schemas without the column keep everything.
        if has("source") {
            filters.push("COALESCE(source,'cli') IN ('cli','')".into());
        }
        let base = filters.join(" AND ");

        let searchable = [
            "name",
            "title",
            "preview",
            "first_user_message",
            "git_branch",
        ]
        .iter()
        .filter(|name| has(name))
        .map(|name| format!("LOWER(COALESCE({name},'')) LIKE ?2 ESCAPE '\\'"))
        .collect::<Vec<_>>();
        let where_clause = if needle.is_empty() || searchable.is_empty() {
            base.clone()
        } else {
            format!("{base} AND ({})", searchable.join(" OR "))
        };

        let sql = format!(
            "SELECT CAST(id AS TEXT), {}, {}, {}, {}, {}, {recency} FROM threads \
             WHERE {where_clause} ORDER BY {recency} DESC LIMIT {limit}",
            text("name"),
            text("title"),
            text("preview"),
            text("first_user_message"),
            text("git_branch"),
        );
        let Ok(mut statement) = connection.prepare(&sql) else {
            continue;
        };
        let pattern = format!("%{}%", escape_like(needle));
        let params: Vec<&dyn rusqlite::ToSql> = if needle.is_empty() || searchable.is_empty() {
            vec![&cwd]
        } else {
            vec![&cwd, &pattern]
        };
        let Ok(rows) = statement.query_map(params.as_slice(), |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, i64>(6)?,
            ))
        }) else {
            continue;
        };

        return rows
            .flatten()
            .filter(|row| crate::socketsrv::valid_session_id(&row.0))
            .map(
                |(id, name, title, preview, first_message, branch, updated_at)| {
                    AgentSessionSummary {
                        provider: "codex",
                        title: name.as_deref().and_then(compact_title),
                        preview: [preview, title, first_message]
                            .into_iter()
                            .flatten()
                            .find_map(|value| compact_fallback(&value)),
                        session_id: id,
                        updated_at,
                        git_branch: branch.filter(|b| !b.is_empty()),
                    }
                },
            )
            .filter(|summary| summary.title.is_some() || summary.preview.is_some())
            .collect();
    }
    Vec::new()
}

fn escape_like(needle: &str) -> String {
    needle
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

#[cfg(test)]
#[path = "agent_sessions_codex_tests.rs"]
mod tests;
