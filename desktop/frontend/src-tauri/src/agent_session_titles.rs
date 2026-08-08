use crate::config;
use rusqlite::{Connection, OpenFlags, OptionalExtension};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::ffi::OsStr;
use std::fs::File;
use std::io::{self, BufRead, BufReader, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime};

const MAX_TITLE_CHARS: usize = 200;
const TRANSCRIPT_CACHE_MAX: usize = 64;
const CODEX_DB_SCAN_TTL: Duration = Duration::from_secs(60);
const CODEX_HOME_ENV: &str = "CODEX_HOME";
const GLOBAL_PROJECT_NAME: &str = "__global__";

enum AgentProvider {
    Claude,
    Codex,
}

#[derive(Default)]
struct CodexThreadMetadata {
    name: Option<String>,
    preview: Option<String>,
    title: Option<String>,
    first_user_message: Option<String>,
}

#[tauri::command(async)]
pub fn agent_session_title(
    project_name: String,
    provider: String,
    session_id: String,
) -> Result<Option<String>, String> {
    let provider = parse_provider(&provider)?;
    if !crate::socketsrv::valid_session_id(&session_id) {
        return Err("invalid agent session id".into());
    }
    validate_project_name(&project_name)?;
    let project = config::spawn_info(&project_name)?;
    if project.is_remote {
        return Err("agent session titles are only available for local projects".into());
    }

    match provider {
        AgentProvider::Claude => {
            let transcript = crate::hooks::claude_transcript_path(
                config::claude_env_for_account(project.claude_account.as_deref()),
                &project.root,
                &session_id,
            );
            cached_claude_transcript_title(&transcript).map_err(|e| e.to_string())
        }
        AgentProvider::Codex => Ok(codex_session_title(&codex_home(), &session_id)),
    }
}

fn validate_project_name(project_name: &str) -> Result<(), String> {
    if project_name == GLOBAL_PROJECT_NAME {
        Ok(())
    } else {
        config::validate_name(project_name)
    }
}

fn parse_provider(provider: &str) -> Result<AgentProvider, String> {
    match provider {
        "claude" => Ok(AgentProvider::Claude),
        "codex" => Ok(AgentProvider::Codex),
        _ => Err("unsupported agent session provider".into()),
    }
}

/// What the last scan of a transcript established: how far it read (always a
/// line boundary), the mtime that produced it, and the two last-wins titles.
#[derive(Clone, Default)]
struct TranscriptScan {
    mtime: Option<SystemTime>,
    scanned: u64,
    custom_title: Option<String>,
    ai_title: Option<String>,
}

impl TranscriptScan {
    fn title(&self) -> Option<String> {
        self.custom_title.clone().or_else(|| self.ai_title.clone())
    }
}

fn transcript_cache() -> &'static Mutex<HashMap<PathBuf, TranscriptScan>> {
    static CACHE: OnceLock<Mutex<HashMap<PathBuf, TranscriptScan>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Transcripts grow to tens of megabytes and are re-read per open tab on every
/// poll, so each scan resumes where the last one stopped. Claude only appends,
/// and both records are last-wins, so replaying just the new bytes gives the
/// same answer as a full pass — a re-read of the whole file is needed only when
/// the file shrank (rewritten/replaced) or was never scanned.
fn cached_claude_transcript_title(path: &Path) -> io::Result<Option<String>> {
    let stat = std::fs::metadata(path)
        .ok()
        .and_then(|meta| Some((meta.modified().ok()?, meta.len())));
    let Some((mtime, len)) = stat else {
        return claude_transcript_title(path, TranscriptScan::default()).map(|scan| scan.title());
    };

    // A file that shrank was replaced rather than appended to, so its scan
    // can't be resumed.
    let resume = transcript_cache()
        .lock()
        .unwrap()
        .get(path)
        .filter(|scan| scan.scanned <= len)
        .cloned()
        .unwrap_or_default();
    if resume.mtime == Some(mtime) && resume.scanned == len {
        return Ok(resume.title());
    }

    let mut scan = claude_transcript_title(path, resume)?;
    scan.mtime = Some(mtime);
    let title = scan.title();
    let mut cache = transcript_cache().lock().unwrap();
    if cache.len() >= TRANSCRIPT_CACHE_MAX && !cache.contains_key(path) {
        if let Some(evict) = cache.keys().next().cloned() {
            cache.remove(&evict);
        }
    }
    cache.insert(path.to_path_buf(), scan);
    Ok(title)
}

fn claude_transcript_title(path: &Path, mut scan: TranscriptScan) -> io::Result<TranscriptScan> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(TranscriptScan::default()),
        Err(e) => return Err(e),
    };

    // Most lines are multi-megabyte tool results; only the two title records
    // are worth parsing, so the marker check gates the JSON work and the line
    // buffer is reused instead of allocating per line.
    let mut reader = BufReader::new(file);
    if scan.scanned > 0 {
        reader.seek(SeekFrom::Start(scan.scanned))?;
    }
    let mut raw = Vec::new();
    loop {
        raw.clear();
        let read = reader.read_until(b'\n', &mut raw)?;
        if read == 0 {
            break;
        }
        // A trailing line without its newline is a half-written record: stop
        // before it so the next scan reads it whole.
        if raw.last() != Some(&b'\n') {
            break;
        }
        scan.scanned += read as u64;
        let line = String::from_utf8_lossy(&raw);
        if !line.contains("ai-title") && !line.contains("custom-title") {
            continue;
        }
        let Ok(event) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        match event.get("type").and_then(Value::as_str) {
            // Claude reduces both records last-wins per session, so a cleared
            // custom title must fall back to the AI one rather than stick.
            Some("custom-title") => {
                if let Some(value) = event.get("customTitle") {
                    scan.custom_title = value.as_str().and_then(compact_title);
                }
            }
            Some("ai-title") => {
                if let Some(title) = event
                    .get("aiTitle")
                    .and_then(Value::as_str)
                    .and_then(compact_title)
                {
                    scan.ai_title = Some(title);
                }
            }
            _ => {}
        }
    }

    Ok(scan)
}

pub(crate) fn codex_home() -> PathBuf {
    std::env::var_os(CODEX_HOME_ENV)
        .map(PathBuf::from)
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_default().join(".codex"))
}

fn codex_session_title(home: &Path, session_id: &str) -> Option<String> {
    let metadata = codex_thread_metadata(home, session_id);
    if let Some(title) = metadata
        .as_ref()
        .and_then(|metadata| metadata.name.as_deref())
        .and_then(compact_title)
    {
        return Some(title);
    }

    if let Some(title) = session_index_title(&home.join("session_index.jsonl"), session_id)
        .ok()
        .flatten()
    {
        return Some(title);
    }

    let metadata = metadata?;
    [
        metadata.preview,
        metadata.title,
        metadata.first_user_message,
    ]
    .into_iter()
    .flatten()
    .find_map(|value| compact_fallback(&value))
}

fn codex_thread_metadata(home: &Path, session_id: &str) -> Option<CodexThreadMetadata> {
    for path in codex_state_databases(home) {
        if let Ok(Some(metadata)) = codex_metadata_from_database(home, &path, session_id) {
            return Some(metadata);
        }
    }
    None
}

/// Which databases codex keeps, and the columns each one has. Neither changes
/// between polls, but a lookup runs per Codex tab every few seconds — so both
/// are cached and re-derived on a timer, which is what picks up a `state_<n>`
/// (or a migrated schema) that a codex upgrade introduces mid-session.
struct CodexDatabases {
    scanned_at: Instant,
    paths: Vec<PathBuf>,
    columns: HashMap<PathBuf, HashSet<String>>,
}

fn codex_database_cache() -> &'static Mutex<HashMap<PathBuf, CodexDatabases>> {
    static CACHE: OnceLock<Mutex<HashMap<PathBuf, CodexDatabases>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub(crate) fn codex_state_databases(home: &Path) -> Vec<PathBuf> {
    if let Some(entry) = codex_database_cache().lock().unwrap().get(home) {
        if entry.scanned_at.elapsed() < CODEX_DB_SCAN_TTL {
            return entry.paths.clone();
        }
    }

    let paths = scan_codex_state_databases(home);
    codex_database_cache().lock().unwrap().insert(
        home.to_path_buf(),
        CodexDatabases {
            scanned_at: Instant::now(),
            paths: paths.clone(),
            columns: HashMap::new(),
        },
    );
    paths
}

fn scan_codex_state_databases(home: &Path) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    for (root_priority, dir) in [(1u8, home.to_path_buf()), (0, home.join("sqlite"))] {
        let Ok(entries) = std::fs::read_dir(dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let Some(version) = state_database_version(&entry.file_name()) else {
                continue;
            };
            if entry.path().is_file() {
                candidates.push((version, root_priority, entry.path()));
            }
        }
    }
    candidates.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| b.1.cmp(&a.1)));
    candidates.into_iter().map(|(_, _, path)| path).collect()
}

pub(crate) fn threads_columns(
    home: &Path,
    path: &Path,
    connection: &Connection,
) -> rusqlite::Result<HashSet<String>> {
    if let Some(columns) = codex_database_cache()
        .lock()
        .unwrap()
        .get(home)
        .and_then(|entry| entry.columns.get(path))
    {
        return Ok(columns.clone());
    }

    let mut columns = HashSet::new();
    let mut statement = connection.prepare("PRAGMA table_info(threads)")?;
    let rows = statement.query_map([], |row| row.get::<_, String>(1))?;
    for column in rows {
        columns.insert(column?);
    }
    if let Some(entry) = codex_database_cache().lock().unwrap().get_mut(home) {
        entry.columns.insert(path.to_path_buf(), columns.clone());
    }
    Ok(columns)
}

fn state_database_version(name: &OsStr) -> Option<u64> {
    name.to_str()?
        .strip_prefix("state_")?
        .strip_suffix(".sqlite")?
        .parse()
        .ok()
}

fn codex_metadata_from_database(
    home: &Path,
    path: &Path,
    session_id: &str,
) -> rusqlite::Result<Option<CodexThreadMetadata>> {
    let connection = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    connection.busy_timeout(Duration::from_millis(100))?;

    let columns = threads_columns(home, path, &connection)?;
    if !columns.contains("id") {
        return Ok(None);
    }

    let column = |name: &str| {
        if columns.contains(name) {
            format!("CAST({name} AS TEXT)")
        } else {
            "NULL".to_string()
        }
    };
    let sql = format!(
        "SELECT {}, {}, {}, {} FROM threads WHERE id = ?1 LIMIT 1",
        column("name"),
        column("preview"),
        column("title"),
        column("first_user_message")
    );
    connection
        .query_row(&sql, [session_id], |row| {
            Ok(CodexThreadMetadata {
                name: row.get(0)?,
                preview: row.get(1)?,
                title: row.get(2)?,
                first_user_message: row.get(3)?,
            })
        })
        .optional()
}

fn session_index_title(path: &Path, session_id: &str) -> io::Result<Option<String>> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e),
    };
    let mut title = None;
    for line in BufReader::new(file).lines() {
        let line = line?;
        if !line.contains(session_id) {
            continue;
        }
        let Ok(entry) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if entry.get("id").and_then(Value::as_str) != Some(session_id) {
            continue;
        }
        if let Some(next) = entry
            .get("thread_name")
            .and_then(Value::as_str)
            .and_then(compact_title)
        {
            title = Some(next);
        }
    }
    Ok(title)
}

pub(crate) fn compact_title(value: &str) -> Option<String> {
    compact(value, false)
}

pub(crate) fn compact_fallback(value: &str) -> Option<String> {
    // A prompt that was only an image strips to nothing, and a session with
    // neither title nor preview is dropped from the picker entirely — so the
    // raw text stands in rather than losing the row.
    compact(
        strip_leading_image_path(strip_image_placeholders(value)),
        true,
    )
    .or_else(|| compact(value, true))
}

/// An attached image is serialized as `[Image #N]` and lands verbatim at the
/// head of the prompt the agent recorded; several can stack before the words.
fn strip_image_placeholders(value: &str) -> &str {
    let mut rest = value.trim_start();
    while let Some(inner) = rest.strip_prefix("[Image #") {
        let Some(end) = inner.find(']') else { break };
        if inner[..end].is_empty() || !inner[..end].bytes().all(|b| b.is_ascii_digit()) {
            break;
        }
        rest = inner[end + 1..].trim_start();
    }
    rest
}

fn strip_leading_image_path(value: &str) -> &str {
    const IMAGE_EXTENSIONS: [&str; 10] = [
        ".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic", ".avif", ".bmp", ".tif", ".tiff",
    ];

    let trimmed = value.trim_start();
    let (path, quote) = match trimmed.as_bytes().first().copied() {
        Some(quote @ (b'\'' | b'"' | b'`')) => (&trimmed[1..], Some(quote as char)),
        _ => (trimmed, None),
    };
    if !path.starts_with('/') && !path.starts_with("~/") {
        return value;
    }

    // The shortest boundary-terminated match: a pasted path ends where the
    // extension does, and the prompt text follows.
    let lowercase = path.to_ascii_lowercase();
    let Some(image_end) = IMAGE_EXTENSIONS
        .iter()
        .flat_map(|extension| {
            lowercase
                .match_indices(extension)
                .map(move |(offset, _)| offset + extension.len())
        })
        .filter(|&end| {
            path[end..]
                .chars()
                .next()
                .is_none_or(|next| next.is_whitespace() || Some(next) == quote)
        })
        .min()
    else {
        return value;
    };
    let mut remainder = &path[image_end..];
    if let Some(quote) = quote {
        remainder = remainder.strip_prefix(quote).unwrap_or(remainder);
    }
    remainder.trim_start()
}

fn compact(value: &str, strip_prompt_markup: bool) -> Option<String> {
    let normalized = value
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let normalized = if strip_prompt_markup {
        normalized
            .trim_start_matches(['#', '>', '*', '`'])
            .trim_start()
    } else {
        normalized.as_str()
    };
    if normalized.is_empty() {
        return None;
    }

    let chars = normalized.chars().collect::<Vec<_>>();
    if chars.len() <= MAX_TITLE_CHARS {
        return Some(normalized.to_string());
    }
    let hard_limit = MAX_TITLE_CHARS - 1;
    let word_limit = chars[..hard_limit]
        .iter()
        .rposition(|c| c.is_whitespace())
        .filter(|index| *index >= MAX_TITLE_CHARS / 2)
        .unwrap_or(hard_limit);
    let mut title = chars[..word_limit].iter().collect::<String>();
    let trimmed_len = title.trim_end().len();
    title.truncate(trimmed_len);
    title.push('…');
    Some(title)
}

#[cfg(test)]
#[path = "agent_session_titles_tests.rs"]
mod tests;
