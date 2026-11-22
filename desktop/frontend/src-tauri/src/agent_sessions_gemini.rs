//! Reading Gemini CLI's chats: one `session-<time>-<id>.jsonl` per conversation
//! in `<gemini dir>/tmp/<project>/chats`, where `<project>` is the short name
//! `projects.json` gives the folder — or, before Gemini kept that registry, the
//! SHA-256 of its path. A file opens with a metadata record and grows by
//! appended messages and `$set` patches; older Gemini wrote one `.json`
//! document instead. A row needs the opening prompt, near the head, and the
//! summary Gemini writes once the conversation has one, near the tail.
use crate::agent_session_titles::{compact_fallback, compact_title};
use crate::agent_sessions::{
    epoch_millis, root_spellings, scan_page, AgentSessionSummary, FileCache, StorePage,
};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs::File;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::{Component, Path, PathBuf};

const HEAD_SCAN_BYTES: u64 = 256 * 1024;
const TAIL_SCAN_BYTES: u64 = 256 * 1024;
/// A legacy `.json` chat is one document, read whole; past this it's skipped.
const DOCUMENT_MAX_BYTES: u64 = 16 * 1024 * 1024;

static ROWS: FileCache<Option<AgentSessionSummary>> = FileCache::new();

struct Candidate {
    path: PathBuf,
    updated_at: i64,
}

/// The project's resumable chats, newest first.
pub(crate) fn page(gemini_dir: Option<&Path>, root: &str, needle: &str, limit: usize) -> StorePage {
    let Some(gemini_dir) = gemini_dir else {
        return StorePage::default();
    };
    let candidates = candidates(&chats_dirs(gemini_dir, root));
    scan_page(&candidates, needle, limit, |c| {
        let mut row = ROWS.get_or_read(&c.path, |_| summary(&c.path)).flatten()?;
        row.updated_at = c.updated_at;
        Some(row)
    })
}

/// Where Gemini keeps this folder's chats, under either naming.
pub(crate) fn chats_dirs(gemini_dir: &Path, root: &str) -> Vec<PathBuf> {
    let tmp = gemini_dir.join("tmp");
    let registry = std::fs::read(gemini_dir.join("projects.json"))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok());
    let mut dirs = Vec::new();
    for root in root_spellings(root) {
        let named = registry
            .as_ref()
            .and_then(|r| r["projects"][root.as_str()].as_str())
            .filter(|name| is_plain_name(name));
        if let Some(name) = named {
            dirs.push(tmp.join(name).join("chats"));
        }
        dirs.push(
            tmp.join(hex::encode(Sha256::digest(root.as_bytes())))
                .join("chats"),
        );
    }
    let mut seen = HashSet::new();
    dirs.retain(|d| seen.insert(d.clone()));
    dirs
}

/// A registry entry names one folder inside `tmp`, nothing that climbs out.
fn is_plain_name(name: &str) -> bool {
    let mut parts = Path::new(name).components();
    matches!(parts.next(), Some(Component::Normal(_))) && parts.next().is_none()
}

fn candidates(dirs: &[PathBuf]) -> Vec<Candidate> {
    let mut out = Vec::new();
    for dir in dirs {
        let Ok(entries) = std::fs::read_dir(dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if !name.starts_with("session-")
                || !(name.ends_with(".jsonl") || name.ends_with(".json"))
            {
                continue;
            }
            let Ok(meta) = entry.metadata() else { continue };
            if !meta.is_file() || meta.len() == 0 {
                continue;
            }
            out.push(Candidate {
                path,
                updated_at: epoch_millis(meta.modified().ok()),
            });
        }
    }
    out.sort_by_key(|c| std::cmp::Reverse(c.updated_at));
    out
}

#[derive(Default)]
struct Chat {
    session_id: Option<String>,
    kind: Option<String>,
    summary: Option<String>,
    prompt: Option<String>,
}

impl Chat {
    /// One record of a `.jsonl` chat, in file order: the metadata record, a
    /// message, or a `$set` patch (which can replace the messages wholesale).
    fn apply(&mut self, record: &Value) {
        if let Some(patch) = record.get("$set") {
            self.apply_metadata(patch);
        } else if record.get("type").is_some() && record.get("id").is_some() {
            self.consider(record);
        } else {
            self.apply_metadata(record);
        }
    }

    fn apply_metadata(&mut self, record: &Value) {
        let text = |key: &str| record.get(key).and_then(Value::as_str).map(str::to_string);
        if self.session_id.is_none() {
            self.session_id = text("sessionId");
        }
        if let Some(kind) = text("kind") {
            self.kind = Some(kind);
        }
        if let Some(summary) = text("summary") {
            self.summary = Some(summary);
        }
        for message in record
            .get("messages")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            self.consider(message);
        }
    }

    fn consider(&mut self, message: &Value) {
        if self.prompt.is_none() && message.get("type").and_then(Value::as_str) == Some("user") {
            self.prompt = prompt_text(message.get("content"));
        }
    }

    fn into_summary(self) -> Option<AgentSessionSummary> {
        let session_id = self
            .session_id
            .filter(|id| crate::socketsrv::valid_session_id(id))?;
        // A sub-agent's chat belongs to its parent's conversation, and one
        // with no prompt of its own is an aborted start Gemini won't resume.
        if self.kind.as_deref() == Some("subagent") {
            return None;
        }
        let preview = compact_fallback(self.prompt.as_deref()?);
        let title = self.summary.as_deref().and_then(compact_title);
        if title.is_none() && preview.is_none() {
            return None;
        }
        Some(AgentSessionSummary {
            provider: "gemini",
            session_id,
            title,
            preview,
            updated_at: 0,
            git_branch: None,
            account: None,
        })
    }
}

/// What the person typed, as Gemini's own session list reads it: the text
/// parts joined. Slash commands, `?` help and the context Gemini injects are
/// its plumbing, never the opening prompt.
fn prompt_text(content: Option<&Value>) -> Option<String> {
    let text = match content? {
        Value::String(text) => text.clone(),
        Value::Array(parts) => parts
            .iter()
            .filter_map(|p| p.get("text").and_then(Value::as_str))
            .collect::<String>(),
        _ => return None,
    };
    let trimmed = text.trim();
    let plumbing = trimmed.is_empty()
        || trimmed.starts_with('/')
        || trimmed.starts_with('?')
        || trimmed.starts_with("<session_context>")
        || trimmed.starts_with("<hook_context>");
    (!plumbing).then(|| trimmed.to_string())
}

fn summary(path: &Path) -> Option<AgentSessionSummary> {
    if path.extension().and_then(|e| e.to_str()) == Some("json") {
        return document(path);
    }
    let len = std::fs::metadata(path).ok()?.len();
    let mut chat = Chat::default();
    let mut reader = BufReader::new(File::open(path).ok()?);
    let mut consumed = 0u64;
    let mut raw = Vec::new();
    while consumed < HEAD_SCAN_BYTES {
        raw.clear();
        match reader.read_until(b'\n', &mut raw) {
            Ok(0) | Err(_) => break,
            Ok(read) => consumed += read as u64,
        }
        if let Ok(record) = serde_json::from_slice::<Value>(&raw) {
            chat.apply(&record);
        }
    }
    if consumed < len {
        tail_summary(path, len, consumed, &mut chat);
    }
    chat.into_summary()
}

/// The newest summary, from the records past the head: Gemini patches it in
/// with `$set` as the conversation gets one, last write wins.
fn tail_summary(path: &Path, len: u64, head: u64, chat: &mut Chat) {
    let Ok(mut file) = File::open(path) else {
        return;
    };
    let start = len.saturating_sub(TAIL_SCAN_BYTES).max(head);
    if file.seek(SeekFrom::Start(start)).is_err() {
        return;
    }
    let mut buf = Vec::new();
    if file.take(TAIL_SCAN_BYTES).read_to_end(&mut buf).is_err() {
        return;
    }
    let text = String::from_utf8_lossy(&buf);
    let mut lines = text.split('\n');
    // Seeking past the head can land mid-record; that fragment isn't JSON.
    if start > head {
        lines.next();
    }
    for line in lines {
        if !line.contains("\"summary\"") {
            continue;
        }
        let Ok(record) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let patch = record.get("$set").unwrap_or(&record);
        if let Some(summary) = patch.get("summary").and_then(Value::as_str) {
            chat.summary = Some(summary.to_string());
        }
    }
}

fn document(path: &Path) -> Option<AgentSessionSummary> {
    if std::fs::metadata(path).ok()?.len() > DOCUMENT_MAX_BYTES {
        return None;
    }
    let record: Value = serde_json::from_reader(BufReader::new(File::open(path).ok()?)).ok()?;
    let mut chat = Chat::default();
    chat.apply_metadata(&record);
    chat.into_summary()
}

#[cfg(test)]
#[path = "agent_sessions_gemini_tests.rs"]
mod tests;
