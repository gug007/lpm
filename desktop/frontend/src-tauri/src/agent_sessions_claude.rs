//! Reading claude's transcripts: one `<session id>.jsonl` per conversation in
//! the project's directory, appended to forever. Nothing here reads a whole
//! file — a transcript reaches tens of megabytes, and everything a row needs
//! sits at one end or the other: the opening prompt at the head, the current
//! title at the tail.
use crate::agent_session_titles::{compact_fallback, compact_title};
use crate::agent_sessions::AgentSessionSummary;
use serde_json::Value;
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

/// How much of a transcript is read to find the first user message (the
/// preview) and the newest title record. Titles are rewritten as the
/// conversation evolves, so the newest one is always near the end.
const HEAD_SCAN_BYTES: u64 = 64 * 1024;
const TAIL_SCAN_BYTES: u64 = 256 * 1024;
/// Transcripts a search may open beyond the page itself.
const SEARCH_SCAN_CAP: usize = 200;
const SUMMARY_CACHE_MAX: usize = 512;

pub(crate) struct Candidate {
    path: PathBuf,
    session_id: String,
    updated_at: i64,
}

/// Every transcript in the project's directory, newest first. Only metadata is
/// touched here — opening the files is the caller's (bounded) job.
pub(crate) fn candidates(dir: &Path) -> Vec<Candidate> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }
        let Some(session_id) = path
            .file_stem()
            .and_then(|s| s.to_str())
            .map(str::to_string)
            .filter(|id| crate::socketsrv::valid_session_id(id))
        else {
            continue;
        };
        let Ok(meta) = entry.metadata() else { continue };
        if !meta.is_file() || meta.len() == 0 {
            continue;
        }
        out.push(Candidate {
            path,
            session_id,
            updated_at: epoch_millis(meta.modified().ok()),
        });
    }
    out.sort_by_key(|c| std::cmp::Reverse(c.updated_at));
    out
}

/// Summarizes candidates newest-first until the page is full. A search keeps
/// going past non-matches, but only so far — a project can hold thousands of
/// transcripts, and a bigger page (the caller asking for more) is what widens
/// the reach. Returns how many were opened, so the caller can tell a page that
/// exhausted the store from one that stopped early.
pub(crate) fn summaries(
    candidates: &[Candidate],
    needle: &str,
    limit: usize,
) -> (Vec<AgentSessionSummary>, usize) {
    let scan_cap = if needle.is_empty() {
        limit
    } else {
        SEARCH_SCAN_CAP.max(limit * 5)
    };
    let mut out = Vec::new();
    let mut scanned = 0;
    for candidate in candidates {
        if out.len() >= limit || scanned >= scan_cap {
            break;
        }
        scanned += 1;
        let Some(summary) = summary(candidate) else {
            continue;
        };
        if matches_needle(&summary, needle) {
            out.push(summary);
        }
    }
    (out, scanned)
}

fn matches_needle(summary: &AgentSessionSummary, needle: &str) -> bool {
    if needle.is_empty() {
        return true;
    }
    [&summary.title, &summary.preview, &summary.git_branch]
        .into_iter()
        .flatten()
        .any(|field| field.to_lowercase().contains(needle))
}

#[derive(Clone)]
struct CachedSummary {
    mtime: Option<SystemTime>,
    len: u64,
    title: Option<String>,
    head: TranscriptHead,
}

fn summary_cache() -> &'static Mutex<HashMap<PathBuf, CachedSummary>> {
    static CACHE: OnceLock<Mutex<HashMap<PathBuf, CachedSummary>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// A transcript's row: its newest title, its opening prompt, and the branch it
/// started on. Cached against (mtime, len) so reopening the picker — or typing
/// in its search box — re-reads nothing that hasn't changed.
fn summary(candidate: &Candidate) -> Option<AgentSessionSummary> {
    let meta = std::fs::metadata(&candidate.path).ok()?;
    let (mtime, len) = (meta.modified().ok(), meta.len());

    let cached = summary_cache()
        .lock()
        .unwrap()
        .get(&candidate.path)
        .filter(|entry| entry.mtime == mtime && entry.len == len)
        .cloned();
    let scan = match cached {
        Some(entry) => entry,
        None => {
            let entry = CachedSummary {
                mtime,
                len,
                title: tail_title(&candidate.path, len),
                head: head(&candidate.path),
            };
            let mut cache = summary_cache().lock().unwrap();
            if cache.len() >= SUMMARY_CACHE_MAX && !cache.contains_key(&candidate.path) {
                if let Some(evict) = cache.keys().next().cloned() {
                    cache.remove(&evict);
                }
            }
            cache.insert(candidate.path.clone(), entry.clone());
            entry
        }
    };

    // A transcript with neither a title nor a prompt is an aborted start with
    // nothing to resume into, and nothing to show in a row.
    if !scan.head.interactive || (scan.title.is_none() && scan.head.preview.is_none()) {
        return None;
    }
    Some(AgentSessionSummary {
        provider: "claude",
        session_id: candidate.session_id.clone(),
        title: scan.title,
        preview: scan.head.preview,
        updated_at: candidate.updated_at,
        git_branch: scan.head.git_branch,
    })
}

#[derive(Clone, Default)]
struct TranscriptHead {
    preview: Option<String>,
    git_branch: Option<String>,
    /// `sdk-cli` for a headless `claude -p` run — lpm's own generators write
    /// those into the project's directory, and there is no conversation there
    /// to pick up.
    interactive: bool,
}

/// The conversation's opening prompt and branch, from the first real user
/// record. Slash commands, hook output and system reminders are skipped — they
/// are the transcript's plumbing, not something a person would recognize.
fn head(path: &Path) -> TranscriptHead {
    let Ok(file) = File::open(path) else {
        return TranscriptHead::default();
    };
    let mut reader = BufReader::new(file);
    let mut consumed = 0u64;
    let mut raw = Vec::new();
    while consumed < HEAD_SCAN_BYTES {
        raw.clear();
        match reader.read_until(b'\n', &mut raw) {
            Ok(0) | Err(_) => break,
            Ok(read) => consumed += read as u64,
        }
        let line = String::from_utf8_lossy(&raw);
        if !line.contains("\"type\":\"user\"") {
            continue;
        }
        let Ok(event) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if event.get("type").and_then(Value::as_str) != Some("user")
            || event.get("isSidechain").and_then(Value::as_bool) == Some(true)
        {
            continue;
        }
        let Some(text) = user_text(event.get("message")).filter(|t| !is_plumbing(t)) else {
            continue;
        };
        return TranscriptHead {
            preview: compact_fallback(&text),
            git_branch: event
                .get("gitBranch")
                .and_then(Value::as_str)
                .filter(|b| !b.is_empty())
                .map(str::to_string),
            interactive: event.get("entrypoint").and_then(Value::as_str) != Some("sdk-cli"),
        };
    }
    TranscriptHead::default()
}

fn user_text(message: Option<&Value>) -> Option<String> {
    match message?.get("content")? {
        Value::String(text) => Some(text.clone()),
        Value::Array(items) => items.iter().find_map(|item| {
            (item.get("type").and_then(Value::as_str) == Some("text"))
                .then(|| item.get("text").and_then(Value::as_str))
                .flatten()
                .map(str::to_string)
        }),
        _ => None,
    }
}

fn is_plumbing(text: &str) -> bool {
    let text = text.trim_start();
    text.is_empty()
        || text.starts_with("<command-")
        || text.starts_with("<local-command")
        || text.starts_with("<system-reminder>")
        || text.starts_with("[Request interrupted")
        || text.starts_with("Caveat:")
}

/// The session's current title. Claude appends a fresh `ai-title` record as the
/// conversation drifts and a `custom-title` when the user renames it, both
/// last-wins — so the answer is in the tail, and reading backwards from the end
/// finds it without touching the megabytes in between.
fn tail_title(path: &Path, len: u64) -> Option<String> {
    let mut file = File::open(path).ok()?;
    let start = len.saturating_sub(TAIL_SCAN_BYTES);
    if start > 0 {
        file.seek(SeekFrom::Start(start)).ok()?;
    }
    let mut buf = Vec::new();
    file.take(TAIL_SCAN_BYTES).read_to_end(&mut buf).ok()?;
    let text = String::from_utf8_lossy(&buf);

    let mut lines = text.split('\n').collect::<Vec<_>>();
    // Seeking lands mid-record; that fragment isn't parseable JSON.
    if start > 0 && !lines.is_empty() {
        lines.remove(0);
    }

    let mut custom: Option<Option<String>> = None;
    let mut ai: Option<String> = None;
    for line in lines.iter().rev() {
        if !line.contains("ai-title") && !line.contains("custom-title") {
            continue;
        }
        let Ok(event) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        match event.get("type").and_then(Value::as_str) {
            Some("custom-title") if custom.is_none() => {
                custom = Some(
                    event
                        .get("customTitle")
                        .and_then(Value::as_str)
                        .and_then(compact_title),
                );
            }
            Some("ai-title") if ai.is_none() => {
                ai = event
                    .get("aiTitle")
                    .and_then(Value::as_str)
                    .and_then(compact_title);
            }
            _ => {}
        }
        if custom.is_some() && ai.is_some() {
            break;
        }
    }
    // A cleared custom title falls back to the AI one rather than sticking.
    custom.flatten().or(ai)
}

fn epoch_millis(time: Option<SystemTime>) -> i64 {
    time.and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
#[path = "agent_sessions_claude_tests.rs"]
mod tests;
