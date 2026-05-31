// SQLCipher-backed notes store — port of notes/store.go.
//
// Opens ~/.lpm/notes/<project>/notes.db with the raw 32-byte vault key
// (PRAGMA key = "x'<hex>'", cipher_page_size 4096 — SQLCipher 4 defaults
// otherwise), matching Go's mutecomm/go-sqlcipher/v4 exactly so existing
// encrypted databases open unchanged. Single serialized connection (Mutex)
// mirrors Go's SetMaxOpenConns(1).
use rusqlite::{params, params_from_iter, Connection};
use serde::Serialize;
use std::collections::HashMap;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

pub const DEFAULT_CHAT_TITLE: &str = "General";

/// Mirrors Go's sql.ErrNoRows string; some frontend flows match on it.
const NO_ROWS: &str = "sql: no rows in result set";

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub chat_id: String,
    #[serde(rename = "ts")]
    pub timestamp: i64, // unix millis
    pub text: String,
    #[serde(rename = "editedAt", skip_serializing_if = "Option::is_none")]
    pub edited_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachments: Option<Vec<Attachment>>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub hash: String,
    pub name: String,
    pub size: i64,
    pub mime_type: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Chat {
    pub id: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize, Debug)]
pub struct SearchHit {
    #[serde(rename = "id")]
    pub message_id: String,
    #[serde(rename = "chatId")]
    pub chat_id: String,
    #[serde(rename = "chatTitle")]
    pub chat_title: String,
    #[serde(rename = "ts")]
    pub timestamp: i64,
    pub snippet: String,
}

pub struct Store {
    conn: Mutex<Connection>,
    dir: PathBuf,
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn new_uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}

impl Store {
    /// Opens (and migrates) the per-project encrypted db. `key` comes pre-fetched
    /// from vault so one Keychain round-trip serves every project this session.
    pub fn open(dir: &Path, key: &[u8; 32]) -> Result<Store, String> {
        std::fs::create_dir_all(dir).map_err(|e| format!("notes: create dir: {e}"))?;
        let _ = std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700));

        let db_path = dir.join("notes.db");
        let conn = Connection::open(&db_path).map_err(|e| format!("notes: open db: {e}"))?;

        // Raw-key blob literal — the double-quoted x'..' makes SQLCipher use the
        // 32 bytes directly (no PBKDF2 over a passphrase). Key is our own hex, so
        // no injection risk. cipher_page_size 4096 is the SQLCipher-4 default but
        // set explicitly to match Go's DSN.
        let set_key = format!("PRAGMA key = \"x'{}'\";", hex::encode(key));
        conn.execute_batch(&set_key)
            .map_err(|e| format!("notes: set key: {e}"))?;
        conn.execute_batch("PRAGMA cipher_page_size = 4096;")
            .map_err(|e| format!("notes: set cipher_page_size: {e}"))?;

        // Force decryption + page-HMAC validation: a wrong key / corrupt file
        // fails here (Go's PingContext equivalent).
        conn.query_row("SELECT count(*) FROM sqlite_master", [], |_| Ok(()))
            .map_err(|e| format!("notes: ping db (bad key or corrupted file?): {e}"))?;

        let store = Store { conn: Mutex::new(conn), dir: dir.to_path_buf() };
        store.migrate()?;
        Ok(store)
    }

    pub fn blobs_dir(&self) -> PathBuf {
        self.dir.join("blobs")
    }

    fn migrate(&self) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        // Ordering uses seq (not ts) so messages added in the same millisecond
        // still have a stable total order. foreign_keys is per-connection — set
        // last so ON DELETE CASCADE fires (the single connection persists it).
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS messages (
                seq INTEGER PRIMARY KEY AUTOINCREMENT,
                id TEXT UNIQUE NOT NULL,
                ts INTEGER NOT NULL,
                text TEXT NOT NULL,
                edited_ts INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(ts);
            CREATE TABLE IF NOT EXISTS attachments (
                message_id TEXT NOT NULL,
                hash TEXT NOT NULL,
                name TEXT NOT NULL,
                size INTEGER NOT NULL,
                mime_type TEXT,
                PRIMARY KEY (message_id, hash),
                FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_attachments_hash ON attachments(hash);
            CREATE TABLE IF NOT EXISTS chats (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_ts INTEGER NOT NULL,
                updated_ts INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_chats_updated ON chats(updated_ts);
            PRAGMA foreign_keys = ON;
            "#,
        )
        .map_err(|e| format!("notes: migrate: {e}"))?;
        drop(conn);
        self.ensure_chat_id_column()?;
        self.backfill_default_chat()
    }

    fn ensure_chat_id_column(&self) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        let has_chat_id = {
            let mut stmt = conn
                .prepare("PRAGMA table_info(messages)")
                .map_err(|e| format!("notes: probe messages schema: {e}"))?;
            let names = stmt
                .query_map([], |r| r.get::<_, String>(1))
                .map_err(|e| format!("notes: probe messages schema: {e}"))?;
            let mut found = false;
            for n in names {
                if n.map_err(|e| e.to_string())? == "chat_id" {
                    found = true;
                    break;
                }
            }
            found
        };
        if has_chat_id {
            return Ok(());
        }
        conn.execute_batch(
            "ALTER TABLE messages ADD COLUMN chat_id TEXT;\n\
             CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, seq);",
        )
        .map_err(|e| format!("notes: add chat_id column: {e}"))
    }

    fn backfill_default_chat(&self) -> Result<(), String> {
        let mut conn = self.conn.lock().unwrap();
        let unassigned: i64 = conn
            .query_row("SELECT COUNT(*) FROM messages WHERE chat_id IS NULL", [], |r| r.get(0))
            .map_err(|e| format!("notes: count unassigned messages: {e}"))?;
        if unassigned == 0 {
            return Ok(());
        }
        let id = new_uuid();
        let now = now_millis();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO chats (id, title, created_ts, updated_ts) VALUES (?, ?, ?, ?)",
            params![id, DEFAULT_CHAT_TITLE, now, now],
        )
        .map_err(|e| format!("notes: create default chat: {e}"))?;
        tx.execute("UPDATE messages SET chat_id = ? WHERE chat_id IS NULL", params![id])
            .map_err(|e| format!("notes: backfill chat_id: {e}"))?;
        tx.commit().map_err(|e| e.to_string())
    }

    // --- chats ---------------------------------------------------------------

    pub fn create_chat(&self, title: &str) -> Result<Chat, String> {
        let title = title.trim();
        if title.is_empty() {
            return Err("notes: chat title is empty".into());
        }
        let now = now_millis();
        let c = Chat {
            id: new_uuid(),
            title: title.to_string(),
            created_at: now,
            updated_at: now,
        };
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO chats (id, title, created_ts, updated_ts) VALUES (?, ?, ?, ?)",
            params![c.id, c.title, c.created_at, c.updated_at],
        )
        .map_err(|e| format!("notes: create chat: {e}"))?;
        Ok(c)
    }

    pub fn list_chats(&self) -> Result<Vec<Chat>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, title, created_ts, updated_ts FROM chats ORDER BY updated_ts DESC, id")
            .map_err(|e| format!("notes: list chats: {e}"))?;
        let rows = stmt
            .query_map([], |r| {
                Ok(Chat {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    created_at: r.get(2)?,
                    updated_at: r.get(3)?,
                })
            })
            .map_err(|e| format!("notes: list chats: {e}"))?;
        let mut out = Vec::new();
        for c in rows {
            out.push(c.map_err(|e| e.to_string())?);
        }
        Ok(out)
    }

    pub fn rename_chat(&self, id: &str, title: &str) -> Result<(), String> {
        let title = title.trim();
        if title.is_empty() {
            return Err("notes: chat title is empty".into());
        }
        let conn = self.conn.lock().unwrap();
        let n = conn
            .execute("UPDATE chats SET title = ? WHERE id = ?", params![title, id])
            .map_err(|e| format!("notes: rename chat: {e}"))?;
        if n == 0 {
            return Err(NO_ROWS.into());
        }
        Ok(())
    }

    pub fn chat_exists(&self, id: &str) -> Result<bool, String> {
        let conn = self.conn.lock().unwrap();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM chats WHERE id = ?", params![id], |r| r.get(0))
            .map_err(|e| format!("notes: chat exists: {e}"))?;
        Ok(n > 0)
    }

    /// Deletes a chat and its messages (cascade), returning blob hashes no
    /// remaining attachment references — callers GC them.
    pub fn delete_chat(&self, id: &str) -> Result<Vec<String>, String> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        // Snapshot hashes before the cascade wipes attachment rows.
        let candidates: Vec<String> = {
            let mut stmt = tx
                .prepare(
                    "SELECT DISTINCT hash FROM attachments \
                     WHERE message_id IN (SELECT id FROM messages WHERE chat_id = ?)",
                )
                .map_err(|e| format!("notes: read chat attachments: {e}"))?;
            let rows = stmt
                .query_map(params![id], |r| r.get::<_, String>(0))
                .map_err(|e| format!("notes: read chat attachments: {e}"))?;
            let mut v = Vec::new();
            for h in rows {
                v.push(h.map_err(|e| e.to_string())?);
            }
            v
        };
        tx.execute("DELETE FROM messages WHERE chat_id = ?", params![id])
            .map_err(|e| format!("notes: delete chat messages: {e}"))?;
        let n = tx
            .execute("DELETE FROM chats WHERE id = ?", params![id])
            .map_err(|e| format!("notes: delete chat: {e}"))?;
        if n == 0 {
            return Err(NO_ROWS.into());
        }
        let orphans = orphans_among(&tx, &candidates)?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(orphans)
    }

    // --- messages ------------------------------------------------------------

    pub fn add_message(
        &self,
        chat_id: &str,
        text: &str,
        attachments: &[Attachment],
    ) -> Result<Message, String> {
        if chat_id.is_empty() {
            return Err("notes: chat id is empty".into());
        }
        let id = new_uuid();
        let now = now_millis();

        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        // UPDATE doubles as existence check (0 rows ⇒ no such chat).
        let n = tx
            .execute("UPDATE chats SET updated_ts = ? WHERE id = ?", params![now, chat_id])
            .map_err(|e| format!("notes: bump chat: {e}"))?;
        if n == 0 {
            return Err(NO_ROWS.into());
        }
        tx.execute(
            "INSERT INTO messages (id, chat_id, ts, text) VALUES (?, ?, ?, ?)",
            params![id, chat_id, now, text],
        )
        .map_err(|e| format!("notes: insert message: {e}"))?;
        for att in attachments {
            tx.execute(
                "INSERT INTO attachments (message_id, hash, name, size, mime_type) \
                 VALUES (?, ?, ?, ?, ?)",
                params![id, att.hash, att.name, att.size, att.mime_type],
            )
            .map_err(|e| format!("notes: insert attachment: {e}"))?;
        }
        tx.commit().map_err(|e| e.to_string())?;

        Ok(Message {
            id,
            chat_id: chat_id.to_string(),
            timestamp: now,
            text: text.to_string(),
            edited_at: None,
            attachments: if attachments.is_empty() {
                None
            } else {
                Some(attachments.to_vec())
            },
        })
    }

    /// Newest-first page of a chat. `before_id` = "" for the latest page; a page
    /// shorter than `limit` means start-of-stream.
    pub fn list_messages(
        &self,
        chat_id: &str,
        limit: i64,
        before_id: &str,
    ) -> Result<Vec<Message>, String> {
        if chat_id.is_empty() {
            return Err("notes: chat id is empty".into());
        }
        let limit = if limit <= 0 || limit > 500 { 100 } else { limit };

        let conn = self.conn.lock().unwrap();
        let mut msgs: Vec<Message> = Vec::new();
        {
            let (sql, bound): (&str, Vec<rusqlite::types::Value>) = if !before_id.is_empty() {
                (
                    "SELECT id, chat_id, ts, text, edited_ts FROM messages \
                     WHERE chat_id = ? AND seq < (SELECT seq FROM messages WHERE id = ?) \
                     ORDER BY seq DESC LIMIT ?",
                    vec![chat_id.to_string().into(), before_id.to_string().into(), limit.into()],
                )
            } else {
                (
                    "SELECT id, chat_id, ts, text, edited_ts FROM messages \
                     WHERE chat_id = ? ORDER BY seq DESC LIMIT ?",
                    vec![chat_id.to_string().into(), limit.into()],
                )
            };
            let mut stmt = conn.prepare(sql).map_err(|e| format!("notes: list messages: {e}"))?;
            let rows = stmt
                .query_map(params_from_iter(bound.iter()), |r| {
                    Ok(Message {
                        id: r.get(0)?,
                        chat_id: r.get(1)?,
                        timestamp: r.get(2)?,
                        text: r.get(3)?,
                        edited_at: r.get::<_, Option<i64>>(4)?,
                        attachments: None,
                    })
                })
                .map_err(|e| format!("notes: list messages: {e}"))?;
            for m in rows {
                msgs.push(m.map_err(|e| e.to_string())?);
            }
        }
        if msgs.is_empty() {
            return Ok(msgs);
        }
        load_attachments(&conn, &mut msgs)?;
        Ok(msgs)
    }

    pub fn edit_message(&self, id: &str, text: &str) -> Result<(), String> {
        let now = now_millis();
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        let n = tx
            .execute(
                "UPDATE messages SET text = ?, edited_ts = ? WHERE id = ?",
                params![text, now, id],
            )
            .map_err(|e| format!("notes: edit message: {e}"))?;
        if n == 0 {
            return Err(NO_ROWS.into());
        }
        tx.execute(
            "UPDATE chats SET updated_ts = ? \
             WHERE id = (SELECT chat_id FROM messages WHERE id = ?)",
            params![now, id],
        )
        .map_err(|e| format!("notes: bump chat on edit: {e}"))?;
        tx.commit().map_err(|e| e.to_string())
    }

    /// Deletes a message (cascade), returning now-orphaned blob hashes.
    pub fn delete_message(&self, id: &str) -> Result<Vec<String>, String> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        let hashes: Vec<String> = {
            let mut stmt = tx
                .prepare("SELECT hash FROM attachments WHERE message_id = ?")
                .map_err(|e| format!("notes: read attachment hashes: {e}"))?;
            let rows = stmt
                .query_map(params![id], |r| r.get::<_, String>(0))
                .map_err(|e| format!("notes: read attachment hashes: {e}"))?;
            let mut v = Vec::new();
            for h in rows {
                v.push(h.map_err(|e| e.to_string())?);
            }
            v
        };
        let n = tx
            .execute("DELETE FROM messages WHERE id = ?", params![id])
            .map_err(|e| format!("notes: delete message: {e}"))?;
        if n == 0 {
            return Err(NO_ROWS.into());
        }
        let orphans = orphans_among(&tx, &hashes)?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(orphans)
    }

    /// Every distinct attachment hash still referenced — feeds BlobStore::gc.
    pub fn all_attachment_hashes(&self) -> Result<std::collections::HashSet<String>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT DISTINCT hash FROM attachments")
            .map_err(|e| format!("notes: list attachment hashes: {e}"))?;
        let rows = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| format!("notes: list attachment hashes: {e}"))?;
        let mut out = std::collections::HashSet::new();
        for h in rows {
            out.insert(h.map_err(|e| e.to_string())?);
        }
        Ok(out)
    }

    // --- search --------------------------------------------------------------

    pub fn search(&self, query: &str, limit: i64) -> Result<Vec<SearchHit>, String> {
        let limit = if limit <= 0 || limit > 200 { 50 } else { limit };
        let tokens: Vec<&str> = query.split_whitespace().collect();
        if tokens.is_empty() {
            return Ok(Vec::new());
        }
        let mut conds = Vec::with_capacity(tokens.len());
        let mut args: Vec<rusqlite::types::Value> = Vec::with_capacity(tokens.len() + 1);
        for t in &tokens {
            conds.push(r"m.text LIKE ? ESCAPE '\'");
            args.push(format!("%{}%", escape_like(t)).into());
        }
        args.push(limit.into());
        let sql = format!(
            "SELECT m.id, m.chat_id, c.title, m.ts, m.text \
             FROM messages m JOIN chats c ON c.id = m.chat_id \
             WHERE {} ORDER BY m.ts DESC LIMIT ?",
            conds.join(" AND ")
        );

        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(&sql).map_err(|e| format!("notes: search: {e}"))?;
        let first = tokens[0];
        let rows = stmt
            .query_map(params_from_iter(args.iter()), |r| {
                let text: String = r.get(4)?;
                Ok(SearchHit {
                    message_id: r.get(0)?,
                    chat_id: r.get(1)?,
                    chat_title: r.get(2)?,
                    timestamp: r.get(3)?,
                    snippet: build_snippet(&text, first),
                })
            })
            .map_err(|e| format!("notes: search: {e}"))?;
        let mut out = Vec::new();
        for h in rows {
            out.push(h.map_err(|e| e.to_string())?);
        }
        Ok(out)
    }
}

fn load_attachments(conn: &Connection, msgs: &mut [Message]) -> Result<(), String> {
    let mut idx_by_id: HashMap<String, usize> = HashMap::with_capacity(msgs.len());
    for (i, m) in msgs.iter().enumerate() {
        idx_by_id.insert(m.id.clone(), i);
    }
    let ids: Vec<rusqlite::types::Value> = msgs.iter().map(|m| m.id.clone().into()).collect();
    let placeholders = vec!["?"; ids.len()].join(",");
    let sql = format!(
        "SELECT message_id, hash, name, size, mime_type FROM attachments WHERE message_id IN ({placeholders})"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| format!("notes: load attachments: {e}"))?;
    let rows = stmt
        .query_map(params_from_iter(ids.iter()), |r| {
            let msg_id: String = r.get(0)?;
            Ok((
                msg_id,
                Attachment {
                    hash: r.get(1)?,
                    name: r.get(2)?,
                    size: r.get(3)?,
                    mime_type: r.get::<_, Option<String>>(4)?.unwrap_or_default(),
                },
            ))
        })
        .map_err(|e| format!("notes: load attachments: {e}"))?;
    for row in rows {
        let (msg_id, att) = row.map_err(|e| e.to_string())?;
        if let Some(&i) = idx_by_id.get(&msg_id) {
            msgs[i].attachments.get_or_insert_with(Vec::new).push(att);
        }
    }
    Ok(())
}

/// Of `candidates`, the hashes with no remaining attachment row (run inside the
/// delete tx, after the cascade).
fn orphans_among(tx: &rusqlite::Transaction, candidates: &[String]) -> Result<Vec<String>, String> {
    if candidates.is_empty() {
        return Ok(Vec::new());
    }
    let placeholders = vec!["?"; candidates.len()].join(",");
    let sql = format!("SELECT DISTINCT hash FROM attachments WHERE hash IN ({placeholders})");
    let mut still_ref = std::collections::HashSet::new();
    {
        let mut stmt = tx.prepare(&sql).map_err(|e| format!("notes: count orphan refs: {e}"))?;
        let args: Vec<rusqlite::types::Value> = candidates.iter().map(|h| h.clone().into()).collect();
        let rows = stmt
            .query_map(params_from_iter(args.iter()), |r| r.get::<_, String>(0))
            .map_err(|e| format!("notes: count orphan refs: {e}"))?;
        for h in rows {
            still_ref.insert(h.map_err(|e| e.to_string())?);
        }
    }
    Ok(candidates
        .iter()
        .filter(|h| !still_ref.contains(*h))
        .cloned()
        .collect())
}

/// Backslash escapes itself because the SQL uses ESCAPE '\'.
fn escape_like(s: &str) -> String {
    s.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")
}

fn build_snippet(text: &str, term: &str) -> String {
    const BEFORE: usize = 80;
    const AFTER: usize = 160;
    let lower_text = text.to_lowercase();
    let lower_term = term.to_lowercase();
    let idx = match lower_text.find(&lower_term) {
        Some(i) => i,
        None => return head_snippet(text, BEFORE + AFTER),
    };
    // idx is a byte offset in the lowercased text; lowercasing can shift offsets
    // (rare Unicode case-folding). Clamp + align to char boundaries of the
    // original text; if anything still looks off, fall back to the head.
    let mut start = idx.saturating_sub(BEFORE).min(text.len());
    let mut end = (idx + term.len() + AFTER).min(text.len());
    start = align_start(text, start);
    end = align_end(text, end);
    if start > end || !text.is_char_boundary(start) || !text.is_char_boundary(end) {
        return head_snippet(text, BEFORE + AFTER);
    }
    let mut out = String::new();
    if start > 0 {
        out.push('…');
    }
    out.push_str(&text[start..end]);
    if end < text.len() {
        out.push('…');
    }
    out
}

fn head_snippet(text: &str, n: usize) -> String {
    if text.len() <= n {
        return text.to_string();
    }
    let mut end = align_end(text, n);
    while end < text.len() && !text.is_char_boundary(end) {
        end += 1;
    }
    format!("{}…", &text[..end])
}

/// Walks left off UTF-8 continuation bytes so text[i..] starts on a rune.
fn align_start(text: &str, mut i: usize) -> usize {
    let b = text.as_bytes();
    while i > 0 && i < b.len() && (b[i] & 0xC0) == 0x80 {
        i -= 1;
    }
    i
}

/// Walks right off UTF-8 continuation bytes so text[..i] ends on a rune.
fn align_end(text: &str, mut i: usize) -> usize {
    let b = text.as_bytes();
    while i < b.len() && (b[i] & 0xC0) == 0x80 {
        i += 1;
    }
    i
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes_blobs::BlobStore;

    const NR: &str = "sql: no rows in result set";
    fn k() -> [u8; 32] {
        [7u8; 32]
    }

    #[test]
    fn full_chat_message_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let s = Store::open(dir.path(), &k()).unwrap();

        let c = s.create_chat("  Hello  ").unwrap();
        assert_eq!(c.title, "Hello", "title is trimmed");
        assert!(s.create_chat("   ").is_err(), "blank title rejected");
        assert_eq!(s.list_chats().unwrap().len(), 1);

        let m1 = s.add_message(&c.id, "first", &[]).unwrap();
        assert!(m1.attachments.is_none() && m1.edited_at.is_none());
        let m2 = s.add_message(&c.id, "second apple pie", &[]).unwrap();
        assert_eq!(s.add_message("nope", "x", &[]).unwrap_err(), NR);

        // newest-first by seq
        let msgs = s.list_messages(&c.id, 100, "").unwrap();
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[0].id, m2.id);
        assert_eq!(msgs[1].id, m1.id);

        // pagination: page of 1, then before
        let p0 = s.list_messages(&c.id, 1, "").unwrap();
        assert_eq!(p0[0].id, m2.id);
        let p1 = s.list_messages(&c.id, 1, &m2.id).unwrap();
        assert_eq!(p1.len(), 1);
        assert_eq!(p1[0].id, m1.id);

        s.edit_message(&m1.id, "edited text").unwrap();
        let edited = s
            .list_messages(&c.id, 100, "")
            .unwrap()
            .into_iter()
            .find(|m| m.id == m1.id)
            .unwrap();
        assert_eq!(edited.text, "edited text");
        assert!(edited.edited_at.is_some());
        assert_eq!(s.edit_message("nope", "x").unwrap_err(), NR);

        let hits = s.search("apple", 50).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].message_id, m2.id);
        assert!(hits[0].snippet.contains("apple"));
        assert!(s.search("   ", 50).unwrap().is_empty());

        s.rename_chat(&c.id, "Renamed").unwrap();
        assert_eq!(s.list_chats().unwrap()[0].title, "Renamed");
        assert_eq!(s.rename_chat("nope", "x").unwrap_err(), NR);

        s.delete_message(&m1.id).unwrap();
        assert_eq!(s.list_messages(&c.id, 100, "").unwrap().len(), 1);
        assert_eq!(s.delete_message("nope").unwrap_err(), NR);

        s.delete_chat(&c.id).unwrap();
        assert!(s.list_chats().unwrap().is_empty());
        assert_eq!(s.delete_chat("nope").unwrap_err(), NR);
    }

    #[test]
    fn attachments_blobs_and_fk_cascade() {
        let dir = tempfile::tempdir().unwrap();
        let key = k();
        let s = Store::open(dir.path(), &key).unwrap();
        let blobs = BlobStore::new(s.blobs_dir(), &key);
        let c = s.create_chat("c").unwrap();

        let (hash, size) = blobs.put(b"hello bytes").unwrap();
        assert_eq!(size, 11);
        let att = Attachment {
            hash: hash.clone(),
            name: "a.txt".into(),
            size,
            mime_type: "text/plain".into(),
        };
        let m = s
            .add_message(&c.id, "with file", std::slice::from_ref(&att))
            .unwrap();
        assert_eq!(m.attachments.as_ref().unwrap().len(), 1);
        assert_eq!(blobs.read(&hash).unwrap(), b"hello bytes");

        // list reattaches metadata
        let msgs = s.list_messages(&c.id, 100, "").unwrap();
        assert_eq!(msgs[0].attachments.as_ref().unwrap()[0].hash, hash);

        // delete -> orphan returned, FK cascade wiped the attachment row
        let orphans = s.delete_message(&m.id).unwrap();
        assert_eq!(orphans, vec![hash]);
        assert!(s.all_attachment_hashes().unwrap().is_empty());
    }

    #[test]
    fn reopen_persists_data() {
        let dir = tempfile::tempdir().unwrap();
        let id;
        {
            let s = Store::open(dir.path(), &k()).unwrap();
            id = s.create_chat("persisted").unwrap().id;
        }
        // reopening the same encrypted db with the same key must decrypt + read
        let s = Store::open(dir.path(), &k()).unwrap();
        let chats = s.list_chats().unwrap();
        assert_eq!(chats.len(), 1);
        assert_eq!(chats[0].id, id);
    }

    #[test]
    fn wrong_key_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        Store::open(dir.path(), &k()).unwrap().create_chat("x").unwrap();
        let bad = Store::open(dir.path(), &[1u8; 32]);
        assert!(bad.is_err(), "a different key must fail to open");
    }

    #[test]
    fn escape_like_matches_go() {
        assert_eq!(escape_like("a%b_c\\d"), "a\\%b\\_c\\\\d");
    }

    // Opt-in: decrypts COPIES of the real ~/.lpm notes using the live Keychain
    // key (may show a one-time access prompt). Proves data compatibility.
    // Run with: cargo test --release real_data_compat -- --ignored --nocapture
    #[test]
    #[ignore = "touches the real Keychain + ~/.lpm; run manually"]
    fn real_data_compat() {
        use sha2::{Digest, Sha256};
        let key = crate::vault::key().expect("fetch vault key");
        let notes_root = crate::config::lpm_dir().join("notes");

        // Enumerate whatever projects exist locally (no hard-coded names).
        let Ok(projects) = std::fs::read_dir(&notes_root) else {
            println!("no {} — nothing to verify", notes_root.display());
            return;
        };
        for entry in projects.flatten() {
            let proj_dir = entry.path();
            let db = proj_dir.join("notes.db");
            if !db.is_file() {
                continue; // skip non-project entries (e.g. .DS_Store)
            }
            let tmp = tempfile::tempdir().unwrap();
            std::fs::copy(&db, tmp.path().join("notes.db")).unwrap();
            let s = Store::open(tmp.path(), &key).expect("open real (copied) db");
            let chats = s.list_chats().unwrap();
            let total: usize = chats
                .iter()
                .map(|c| s.list_messages(&c.id, 500, "").unwrap().len())
                .sum();
            println!("OK <project>: {} chats, {} messages decrypted", chats.len(), total);

            // Decrypt one real blob (if any) and verify content-addressing.
            let blobs_dir = proj_dir.join("blobs");
            if let Ok(rd) = std::fs::read_dir(&blobs_dir) {
                for e in rd.flatten() {
                    let name = e.file_name().to_string_lossy().into_owned();
                    if let Some(stem) = name.strip_suffix(".enc") {
                        let bs = BlobStore::new(blobs_dir.clone(), &key);
                        let plain = bs.read(stem).expect("decrypt real blob");
                        assert_eq!(hex::encode(Sha256::digest(&plain)), stem, "content-address");
                        println!("OK blob: {} bytes, sha256 matches", plain.len());
                        break;
                    }
                }
            }
        }
    }
}
