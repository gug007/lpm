// Terminal composer message history, backed by SQLite (~/.lpm/message-history.db).
//
// Unlike the JSON-file stores (groups/settings/terminals), history can grow
// unbounded, so it's a real table: each send is an indexed INSERT and the
// popover pages results with keyset pagination (ORDER BY at DESC, seq DESC) +
// a WHERE cursor, rather than loading everything. One serialized connection
// behind a Mutex, opened lazily on first use (mirrors notes_store).
use rusqlite::types::Value as SqlValue;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

use crate::config;

const MAX_PAGE: i64 = 500;

#[derive(Default)]
pub struct MessageHistoryState {
    conn: Mutex<Option<Connection>>,
}

impl MessageHistoryState {
    fn with_conn<T>(&self, f: impl FnOnce(&Connection) -> Result<T, String>) -> Result<T, String> {
        let mut guard = self.conn.lock().unwrap();
        if guard.is_none() {
            *guard = Some(open()?);
        }
        f(guard.as_ref().unwrap())
    }
}

fn open() -> Result<Connection, String> {
    config::ensure_dirs()?;
    let conn = Connection::open(config::message_history_path()).map_err(|e| e.to_string())?;
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS message_history (
            seq INTEGER PRIMARY KEY AUTOINCREMENT,
            id TEXT UNIQUE NOT NULL,
            text TEXT NOT NULL,
            project_name TEXT NOT NULL,
            terminal_id TEXT NOT NULL,
            terminal_label TEXT NOT NULL,
            at INTEGER NOT NULL,
            favorite INTEGER NOT NULL DEFAULT 0,
            images TEXT NOT NULL DEFAULT '{}',
            folder_id TEXT
        );
        CREATE TABLE IF NOT EXISTS message_folders (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_mh_order ON message_history(at DESC, seq DESC);
        CREATE INDEX IF NOT EXISTS idx_mh_terminal ON message_history(terminal_id);
        "#,
    )
    .map_err(|e| e.to_string())?;
    // Migrate DBs created before these columns existed (each errors if already
    // present, which is fine). The folder_id index is created AFTER the column
    // so it doesn't reference a missing column on an older DB.
    let _ = conn.execute_batch(
        "ALTER TABLE message_history ADD COLUMN images TEXT NOT NULL DEFAULT '{}';",
    );
    let _ = conn.execute_batch("ALTER TABLE message_history ADD COLUMN folder_id TEXT;");
    conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_mh_folder ON message_history(folder_id);")
        .map_err(|e| e.to_string())?;
    Ok(conn)
}

fn now_millis() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// The "this terminal" predicate — matched by live id OR the stable project+label
// pair (the live id changes across restarts). Built once so the list query and
// the clear DELETE can't drift. Pushes its bind params; "" for the "all" scope.
fn scope_clause(
    scope: &str,
    terminal_id: &str,
    project_name: &str,
    terminal_label: &str,
    args: &mut Vec<SqlValue>,
) -> &'static str {
    if scope != "terminal" {
        return "";
    }
    args.push(terminal_id.to_string().into());
    args.push(project_name.to_string().into());
    args.push(terminal_label.to_string().into());
    " AND (terminal_id = ? OR (project_name = ? AND terminal_label = ?))"
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryRow {
    pub seq: i64,
    pub id: String,
    pub text: String,
    pub project_name: String,
    pub terminal_id: String,
    pub terminal_label: String,
    pub at: i64,
    pub favorite: bool,
    pub folder_id: Option<String>,
    // Map of "[Image #N]" token index -> resolved file path, so recall can
    // rebuild image chips instead of pasting the raw path.
    pub images: serde_json::Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddInput {
    pub text: String,
    pub project_name: String,
    pub terminal_id: String,
    pub terminal_label: String,
    #[serde(default)]
    pub images: std::collections::HashMap<String, String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryInput {
    pub scope: String, // "terminal" | "all"
    pub terminal_id: String,
    pub project_name: String,
    pub terminal_label: String,
    pub collection: String, // "" / "all" = none, "favorites", or a folder id
    pub search: String,     // "" = no filter
    pub cursor_at: Option<i64>,
    pub cursor_seq: Option<i64>,
    pub limit: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub count: i64,
}

// Escape LIKE wildcards so a literal % or _ in the query matches itself.
fn escape_like(s: &str) -> String {
    s.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")
}

#[tauri::command(async)]
pub fn message_history_query(
    state: State<MessageHistoryState>,
    input: QueryInput,
) -> Result<Vec<HistoryRow>, String> {
    state.with_conn(|conn| {
        let mut sql = String::from(
            "SELECT seq, id, text, project_name, terminal_id, terminal_label, at, favorite, folder_id, images \
             FROM message_history WHERE 1 = 1",
        );
        let mut args: Vec<SqlValue> = Vec::new();

        sql.push_str(scope_clause(
            &input.scope,
            &input.terminal_id,
            &input.project_name,
            &input.terminal_label,
            &mut args,
        ));
        if input.collection == "favorites" {
            sql.push_str(" AND favorite = 1");
        } else if !input.collection.is_empty() && input.collection != "all" {
            sql.push_str(" AND folder_id = ?");
            args.push(input.collection.clone().into());
        }
        let q = input.search.trim();
        if !q.is_empty() {
            sql.push_str(
                " AND (text LIKE ? ESCAPE '\\' OR project_name LIKE ? ESCAPE '\\' \
                 OR terminal_label LIKE ? ESCAPE '\\')",
            );
            let like = format!("%{}%", escape_like(q));
            args.push(like.clone().into());
            args.push(like.clone().into());
            args.push(like.into());
        }
        if let (Some(at), Some(seq)) = (input.cursor_at, input.cursor_seq) {
            sql.push_str(" AND (at < ? OR (at = ? AND seq < ?))");
            args.push(at.into());
            args.push(at.into());
            args.push(seq.into());
        }
        sql.push_str(" ORDER BY at DESC, seq DESC LIMIT ?");
        args.push(input.limit.clamp(1, MAX_PAGE).into());

        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params_from_iter(args), |r| {
                Ok(HistoryRow {
                    seq: r.get(0)?,
                    id: r.get(1)?,
                    text: r.get(2)?,
                    project_name: r.get(3)?,
                    terminal_id: r.get(4)?,
                    terminal_label: r.get(5)?,
                    at: r.get(6)?,
                    favorite: r.get::<_, i64>(7)? != 0,
                    folder_id: r.get(8)?,
                    images: serde_json::from_str(&r.get::<_, String>(9)?)
                        .unwrap_or_else(|_| serde_json::json!({})),
                })
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|e| e.to_string())?);
        }
        Ok(out)
    })
}

#[tauri::command(async)]
pub fn message_history_add(
    state: State<MessageHistoryState>,
    message: AddInput,
) -> Result<(), String> {
    state.with_conn(|conn| {
        // Skip an immediate repeat: same text on the same terminal as the newest
        // row overall (matches the composer's ↑/↓ recall de-duping).
        let is_repeat = conn
            .query_row(
                "SELECT terminal_id, text FROM message_history ORDER BY at DESC, seq DESC LIMIT 1",
                [],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .map(|(tid, text)| tid == message.terminal_id && text == message.text)
            .unwrap_or(false);
        if is_repeat {
            return Ok(());
        }
        let images = serde_json::to_string(&message.images).unwrap_or_else(|_| "{}".into());
        conn.execute(
            "INSERT INTO message_history \
             (id, text, project_name, terminal_id, terminal_label, at, favorite, images) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)",
            params![
                uuid::Uuid::new_v4().to_string(),
                message.text,
                message.project_name,
                message.terminal_id,
                message.terminal_label,
                now_millis(),
                images,
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}

#[tauri::command(async)]
pub fn message_history_toggle_favorite(
    state: State<MessageHistoryState>,
    id: String,
) -> Result<(), String> {
    state.with_conn(|conn| {
        conn.execute(
            "UPDATE message_history SET favorite = 1 - favorite WHERE id = ?1",
            params![id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}

// Clear keeps favorited and foldered messages, so curated saves survive a
// "clear history".
#[tauri::command(async)]
pub fn message_history_clear(
    state: State<MessageHistoryState>,
    scope: String,
    terminal_id: String,
    project_name: String,
    terminal_label: String,
) -> Result<(), String> {
    state.with_conn(|conn| {
        let mut sql =
            String::from("DELETE FROM message_history WHERE favorite = 0 AND folder_id IS NULL");
        let mut args: Vec<SqlValue> = Vec::new();
        sql.push_str(scope_clause(&scope, &terminal_id, &project_name, &terminal_label, &mut args));
        conn.execute(&sql, params_from_iter(args)).map_err(|e| e.to_string())?;
        Ok(())
    })
}

#[tauri::command(async)]
pub fn message_history_folders(state: State<MessageHistoryState>) -> Result<Vec<Folder>, String> {
    state.with_conn(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT f.id, f.name, COUNT(m.seq) \
                 FROM message_folders f \
                 LEFT JOIN message_history m ON m.folder_id = f.id \
                 GROUP BY f.id, f.name \
                 ORDER BY f.name COLLATE NOCASE",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(Folder { id: r.get(0)?, name: r.get(1)?, count: r.get(2)? })
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|e| e.to_string())?);
        }
        Ok(out)
    })
}

#[tauri::command(async)]
pub fn message_history_create_folder(
    state: State<MessageHistoryState>,
    name: String,
) -> Result<Folder, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Folder name cannot be empty".into());
    }
    state.with_conn(|conn| {
        let id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO message_folders (id, name, created_at) VALUES (?1, ?2, ?3)",
            params![id, name, now_millis()],
        )
        .map_err(|e| e.to_string())?;
        Ok(Folder { id, name, count: 0 })
    })
}

// Deleting a folder un-files its messages (they stay in history) rather than
// deleting them.
#[tauri::command(async)]
pub fn message_history_delete_folder(
    state: State<MessageHistoryState>,
    id: String,
) -> Result<(), String> {
    state.with_conn(|conn| {
        conn.execute("UPDATE message_history SET folder_id = NULL WHERE folder_id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM message_folders WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}

// Move a message into a folder, or pass null to remove it from its folder.
#[tauri::command(async)]
pub fn message_history_set_folder(
    state: State<MessageHistoryState>,
    message_id: String,
    folder_id: Option<String>,
) -> Result<(), String> {
    state.with_conn(|conn| {
        conn.execute(
            "UPDATE message_history SET folder_id = ?1 WHERE id = ?2",
            params![folder_id, message_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}
