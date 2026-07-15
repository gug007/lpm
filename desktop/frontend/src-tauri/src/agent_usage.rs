use crate::config;
use chrono::{DateTime, Duration, Local, TimeZone};
use serde::Serialize;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

#[derive(Clone, Copy, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsage {
    pub input_tokens: u64,
    pub cached_input_tokens: u64,
    pub output_tokens: u64,
    pub reasoning_tokens: u64,
    pub total_tokens: u64,
}

impl TokenUsage {
    fn add(&mut self, other: Self) {
        self.input_tokens = self.input_tokens.saturating_add(other.input_tokens);
        self.cached_input_tokens = self
            .cached_input_tokens
            .saturating_add(other.cached_input_tokens);
        self.output_tokens = self.output_tokens.saturating_add(other.output_tokens);
        self.reasoning_tokens = self.reasoning_tokens.saturating_add(other.reasoning_tokens);
        self.total_tokens = self.total_tokens.saturating_add(other.total_tokens);
    }

    fn is_empty(self) -> bool {
        self.total_tokens == 0
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageBreakdown {
    key: String,
    label: String,
    sessions: usize,
    tokens: TokenUsage,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyUsage {
    date: String,
    claude_tokens: u64,
    codex_tokens: u64,
    total_tokens: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionUsage {
    provider: String,
    project: String,
    model: String,
    started_at: i64,
    last_at: i64,
    tokens: TokenUsage,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSource {
    provider: String,
    files: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentUsageStats {
    generated_at: i64,
    days: i64,
    sessions: usize,
    totals: TokenUsage,
    providers: Vec<UsageBreakdown>,
    projects: Vec<UsageBreakdown>,
    daily: Vec<DailyUsage>,
    recent_sessions: Vec<AgentSessionUsage>,
    sources: Vec<UsageSource>,
}

#[derive(Clone)]
struct UsageEvent {
    provider: &'static str,
    project: String,
    session_id: String,
    model: String,
    timestamp: i64,
    tokens: TokenUsage,
}

struct ProjectRoot {
    name: String,
    root: PathBuf,
}

struct ProjectMatcher {
    roots: Vec<ProjectRoot>,
}

impl ProjectMatcher {
    fn load() -> Self {
        let mut roots: Vec<ProjectRoot> = config::project_names()
            .into_iter()
            .filter_map(|name| {
                let info = config::spawn_info(&name).ok()?;
                if info.is_remote || info.root.is_empty() {
                    return None;
                }
                let root = normalize_path(Path::new(&info.root));
                Some(ProjectRoot { name, root })
            })
            .collect();
        roots.sort_by(|a, b| {
            b.root
                .components()
                .count()
                .cmp(&a.root.components().count())
        });
        Self { roots }
    }

    fn project_for(&self, cwd: &str) -> Option<String> {
        if cwd.is_empty() {
            return None;
        }
        let cwd = normalize_path(Path::new(cwd));
        self.roots
            .iter()
            .find(|project| cwd.starts_with(&project.root))
            .map(|project| project.name.clone())
    }
}

fn normalize_path(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn value_u64(value: &Value, key: &str) -> u64 {
    value.get(key).and_then(Value::as_u64).unwrap_or(0)
}

fn timestamp_millis(value: &Value) -> Option<i64> {
    value
        .get("timestamp")
        .and_then(Value::as_str)
        .and_then(|timestamp| DateTime::parse_from_rfc3339(timestamp).ok())
        .map(|timestamp| timestamp.timestamp_millis())
}

fn usage_delta(current: TokenUsage, previous: TokenUsage) -> TokenUsage {
    fn delta(current: u64, previous: u64) -> u64 {
        if current >= previous {
            current - previous
        } else {
            current
        }
    }
    TokenUsage {
        input_tokens: delta(current.input_tokens, previous.input_tokens),
        cached_input_tokens: delta(current.cached_input_tokens, previous.cached_input_tokens),
        output_tokens: delta(current.output_tokens, previous.output_tokens),
        reasoning_tokens: delta(current.reasoning_tokens, previous.reasoning_tokens),
        total_tokens: delta(current.total_tokens, previous.total_tokens),
    }
}

fn collect_jsonl_files(root: &Path, cutoff: Option<i64>, files: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_dir() {
            collect_jsonl_files(&path, cutoff, files);
        } else if file_type.is_file()
            && path.extension().and_then(|ext| ext.to_str()) == Some("jsonl")
        {
            let recent_enough = cutoff.is_none_or(|cutoff| {
                entry
                    .metadata()
                    .and_then(|metadata| metadata.modified())
                    .ok()
                    .and_then(|modified| modified.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|modified| modified.as_millis() as i64 >= cutoff)
                    .unwrap_or(true)
            });
            if recent_enough {
                files.push(path);
            }
        }
    }
}

fn claude_project_dirs() -> Vec<PathBuf> {
    let home = dirs::home_dir().unwrap_or_default();
    let mut candidates = vec![home.join(".claude").join("projects")];
    if let Some(dir) = std::env::var_os(config::CLAUDE_CONFIG_DIR_ENV) {
        candidates.push(PathBuf::from(dir).join("projects"));
    }
    if let Ok(accounts) = std::fs::read_dir(config::lpm_dir().join("claude-accounts")) {
        candidates.extend(
            accounts
                .flatten()
                .map(|entry| entry.path().join("projects")),
        );
    }
    let mut seen = HashSet::new();
    candidates
        .into_iter()
        .filter(|path| path.is_dir())
        .filter(|path| seen.insert(normalize_path(path)))
        .collect()
}

fn collect_claude_events(
    matcher: &ProjectMatcher,
    cutoff: Option<i64>,
) -> (Vec<UsageEvent>, usize) {
    let mut files = Vec::new();
    for dir in claude_project_dirs() {
        collect_jsonl_files(&dir, cutoff, &mut files);
    }
    let file_count = files.len();
    let mut events = Vec::new();
    for path in files {
        events.extend(parse_claude_file(&path, matcher, cutoff));
    }
    (events, file_count)
}

fn parse_claude_file(
    path: &Path,
    matcher: &ProjectMatcher,
    cutoff: Option<i64>,
) -> Vec<UsageEvent> {
    let Ok(file) = File::open(path) else {
        return Vec::new();
    };
    let fallback_session = path
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("unknown")
        .to_string();
    let mut messages: HashMap<String, UsageEvent> = HashMap::new();
    for line in BufReader::new(file).lines().map_while(Result::ok) {
        let Ok(record) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let Some(timestamp) = timestamp_millis(&record) else {
            continue;
        };
        if cutoff.is_some_and(|cutoff| timestamp < cutoff) {
            continue;
        }
        let Some(message) = record.get("message") else {
            continue;
        };
        let Some(usage) = message.get("usage") else {
            continue;
        };
        let Some(project) = record
            .get("cwd")
            .and_then(Value::as_str)
            .and_then(|cwd| matcher.project_for(cwd))
        else {
            continue;
        };
        let cache_creation = value_u64(usage, "cache_creation_input_tokens");
        let cache_read = value_u64(usage, "cache_read_input_tokens");
        let input = value_u64(usage, "input_tokens")
            .saturating_add(cache_creation)
            .saturating_add(cache_read);
        let output = value_u64(usage, "output_tokens");
        let tokens = TokenUsage {
            input_tokens: input,
            cached_input_tokens: cache_creation.saturating_add(cache_read),
            output_tokens: output,
            reasoning_tokens: 0,
            total_tokens: input.saturating_add(output),
        };
        if tokens.is_empty() {
            continue;
        }
        let session = record
            .get("sessionId")
            .and_then(Value::as_str)
            .unwrap_or(&fallback_session);
        let agent = record.get("agentId").and_then(Value::as_str).unwrap_or("");
        let session_id = if agent.is_empty() {
            session.to_string()
        } else {
            format!("{session}:{agent}")
        };
        let message_id = message
            .get("id")
            .and_then(Value::as_str)
            .or_else(|| record.get("uuid").and_then(Value::as_str))
            .unwrap_or(&line);
        let key = format!("{session_id}\0{message_id}");
        let event = UsageEvent {
            provider: "claude",
            project,
            session_id,
            model: message
                .get("model")
                .and_then(Value::as_str)
                .unwrap_or("Unknown model")
                .to_string(),
            timestamp,
            tokens,
        };
        let replace = messages
            .get(&key)
            .map(|current| {
                event.tokens.total_tokens > current.tokens.total_tokens
                    || (event.tokens.total_tokens == current.tokens.total_tokens
                        && event.timestamp > current.timestamp)
            })
            .unwrap_or(true);
        if replace {
            messages.insert(key, event);
        }
    }
    messages.into_values().collect()
}

fn collect_codex_events(matcher: &ProjectMatcher, cutoff: Option<i64>) -> (Vec<UsageEvent>, usize) {
    let root = dirs::home_dir()
        .unwrap_or_default()
        .join(".codex")
        .join("sessions");
    let mut files = Vec::new();
    collect_jsonl_files(&root, cutoff, &mut files);
    let file_count = files.len();
    let mut events = Vec::new();
    for path in files {
        events.extend(parse_codex_file(&path, matcher, cutoff));
    }
    (events, file_count)
}

fn parse_codex_file(path: &Path, matcher: &ProjectMatcher, cutoff: Option<i64>) -> Vec<UsageEvent> {
    let Ok(file) = File::open(path) else {
        return Vec::new();
    };
    let mut cwd = String::new();
    let mut model = "Unknown model".to_string();
    let mut session_id = path
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("unknown")
        .to_string();
    let mut previous = TokenUsage::default();
    let mut events = Vec::new();
    for line in BufReader::new(file).lines().map_while(Result::ok) {
        let Ok(record) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let payload = record.get("payload").unwrap_or(&Value::Null);
        match record.get("type").and_then(Value::as_str) {
            Some("session_meta") => {
                if let Some(value) = payload
                    .get("session_id")
                    .or_else(|| payload.get("id"))
                    .and_then(Value::as_str)
                {
                    session_id = value.to_string();
                }
                if let Some(value) = payload.get("cwd").and_then(Value::as_str) {
                    cwd = value.to_string();
                }
                continue;
            }
            Some("turn_context") => {
                if let Some(value) = payload.get("cwd").and_then(Value::as_str) {
                    cwd = value.to_string();
                }
                if let Some(value) = payload.get("model").and_then(Value::as_str) {
                    model = value.to_string();
                }
                continue;
            }
            _ => {}
        }
        if payload.get("type").and_then(Value::as_str) != Some("token_count") {
            continue;
        }
        let Some(total) = payload
            .get("info")
            .and_then(|info| info.get("total_token_usage"))
        else {
            continue;
        };
        let input = value_u64(total, "input_tokens");
        let output = value_u64(total, "output_tokens");
        let current = TokenUsage {
            input_tokens: input,
            cached_input_tokens: value_u64(total, "cached_input_tokens"),
            output_tokens: output,
            reasoning_tokens: value_u64(total, "reasoning_output_tokens"),
            total_tokens: {
                let reported = value_u64(total, "total_tokens");
                if reported == 0 {
                    input.saturating_add(output)
                } else {
                    reported
                }
            },
        };
        let tokens = usage_delta(current, previous);
        previous = current;
        if tokens.is_empty() {
            continue;
        }
        let Some(timestamp) = timestamp_millis(&record) else {
            continue;
        };
        if cutoff.is_some_and(|cutoff| timestamp < cutoff) {
            continue;
        }
        let Some(project) = matcher.project_for(&cwd) else {
            continue;
        };
        events.push(UsageEvent {
            provider: "codex",
            project,
            session_id: session_id.clone(),
            model: model.clone(),
            timestamp,
            tokens,
        });
    }
    events
}

#[derive(Default)]
struct GroupAggregate {
    tokens: TokenUsage,
    sessions: HashSet<String>,
}

#[derive(Default)]
struct SessionAggregate {
    provider: String,
    project: String,
    models: BTreeSet<String>,
    started_at: i64,
    last_at: i64,
    tokens: TokenUsage,
}

#[derive(Default)]
struct DailyAggregate {
    claude_tokens: u64,
    codex_tokens: u64,
}

fn period_cutoff(days: i64) -> Result<Option<i64>, String> {
    if days == 0 {
        return Ok(None);
    }
    if !matches!(days, 1 | 7 | 30) {
        return Err("days must be 0, 1, 7, or 30".into());
    }
    let start_date = Local::now().date_naive() - Duration::days(days - 1);
    let start = start_date
        .and_hms_opt(0, 0, 0)
        .and_then(|value| Local.from_local_datetime(&value).earliest())
        .ok_or_else(|| "could not resolve local date".to_string())?;
    Ok(Some(start.timestamp_millis()))
}

fn breakdowns(
    groups: HashMap<String, GroupAggregate>,
    labels: &HashMap<String, String>,
) -> Vec<UsageBreakdown> {
    let mut rows: Vec<UsageBreakdown> = groups
        .into_iter()
        .map(|(key, aggregate)| UsageBreakdown {
            label: labels.get(&key).cloned().unwrap_or_else(|| key.clone()),
            key,
            sessions: aggregate.sessions.len(),
            tokens: aggregate.tokens,
        })
        .collect();
    rows.sort_by(|a, b| {
        b.tokens
            .total_tokens
            .cmp(&a.tokens.total_tokens)
            .then_with(|| a.label.cmp(&b.label))
    });
    rows
}

fn aggregate(events: Vec<UsageEvent>, days: i64, sources: Vec<UsageSource>) -> AgentUsageStats {
    let mut totals = TokenUsage::default();
    let mut provider_groups: HashMap<String, GroupAggregate> = HashMap::new();
    let mut project_groups: HashMap<String, GroupAggregate> = HashMap::new();
    let mut sessions: HashMap<String, SessionAggregate> = HashMap::new();
    let mut daily: BTreeMap<String, DailyAggregate> = BTreeMap::new();
    for event in events {
        totals.add(event.tokens);
        let session_key = format!(
            "{}\0{}\0{}",
            event.provider, event.project, event.session_id
        );
        let provider = provider_groups
            .entry(event.provider.to_string())
            .or_default();
        provider.tokens.add(event.tokens);
        provider.sessions.insert(session_key.clone());
        let project = project_groups.entry(event.project.clone()).or_default();
        project.tokens.add(event.tokens);
        project.sessions.insert(session_key.clone());
        let session = sessions
            .entry(session_key)
            .or_insert_with(|| SessionAggregate {
                provider: event.provider.to_string(),
                project: event.project.clone(),
                started_at: event.timestamp,
                last_at: event.timestamp,
                ..Default::default()
            });
        session.models.insert(event.model);
        session.started_at = session.started_at.min(event.timestamp);
        session.last_at = session.last_at.max(event.timestamp);
        session.tokens.add(event.tokens);
        let date = DateTime::from_timestamp_millis(event.timestamp)
            .map(|value| value.with_timezone(&Local).format("%Y-%m-%d").to_string())
            .unwrap_or_default();
        let day = daily.entry(date).or_default();
        if event.provider == "claude" {
            day.claude_tokens = day.claude_tokens.saturating_add(event.tokens.total_tokens);
        } else {
            day.codex_tokens = day.codex_tokens.saturating_add(event.tokens.total_tokens);
        }
    }
    let session_count = sessions.len();
    let mut recent_sessions: Vec<AgentSessionUsage> = sessions
        .into_values()
        .map(|session| AgentSessionUsage {
            provider: session.provider,
            project: session.project,
            model: if session.models.len() == 1 {
                session.models.into_iter().next().unwrap_or_default()
            } else {
                "Multiple models".into()
            },
            started_at: session.started_at,
            last_at: session.last_at,
            tokens: session.tokens,
        })
        .collect();
    recent_sessions.sort_by(|a, b| b.last_at.cmp(&a.last_at));
    recent_sessions.truncate(50);
    let provider_labels = HashMap::from([
        ("claude".to_string(), "Claude Code".to_string()),
        ("codex".to_string(), "Codex".to_string()),
    ]);
    AgentUsageStats {
        generated_at: chrono::Utc::now().timestamp_millis(),
        days,
        sessions: session_count,
        totals,
        providers: breakdowns(provider_groups, &provider_labels),
        projects: breakdowns(project_groups, &HashMap::new()),
        daily: daily
            .into_iter()
            .map(|(date, totals)| DailyUsage {
                date,
                claude_tokens: totals.claude_tokens,
                codex_tokens: totals.codex_tokens,
                total_tokens: totals.claude_tokens.saturating_add(totals.codex_tokens),
            })
            .collect(),
        recent_sessions,
        sources,
    }
}

fn load_agent_usage_stats(days: i64) -> Result<AgentUsageStats, String> {
    let cutoff = period_cutoff(days)?;
    let matcher = ProjectMatcher::load();
    let (mut events, claude_files) = collect_claude_events(&matcher, cutoff);
    let (codex_events, codex_files) = collect_codex_events(&matcher, cutoff);
    events.extend(codex_events);
    Ok(aggregate(
        events,
        days,
        vec![
            UsageSource {
                provider: "claude".into(),
                files: claude_files,
            },
            UsageSource {
                provider: "codex".into(),
                files: codex_files,
            },
        ],
    ))
}

#[tauri::command(async)]
pub fn agent_usage_stats(days: i64) -> Result<AgentUsageStats, String> {
    load_agent_usage_stats(days)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn matcher(root: &Path) -> ProjectMatcher {
        ProjectMatcher {
            roots: vec![ProjectRoot {
                name: "lpm".into(),
                root: normalize_path(root),
            }],
        }
    }

    #[test]
    fn claude_deduplicates_streamed_message_updates() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("session.jsonl");
        let mut file = File::create(&path).unwrap();
        for output in [5, 5, 120] {
            writeln!(
                file,
                "{}",
                serde_json::json!({
                    "timestamp": "2026-07-15T10:00:00Z",
                    "cwd": dir.path(),
                    "sessionId": "session",
                    "message": {
                        "id": "message",
                        "model": "claude-test",
                        "usage": {
                            "input_tokens": 2,
                            "cache_creation_input_tokens": 100,
                            "cache_read_input_tokens": 50,
                            "output_tokens": output
                        }
                    }
                })
            )
            .unwrap();
        }
        let events = parse_claude_file(&path, &matcher(dir.path()), None);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].tokens.input_tokens, 152);
        assert_eq!(events[0].tokens.cached_input_tokens, 150);
        assert_eq!(events[0].tokens.output_tokens, 120);
        assert_eq!(events[0].tokens.total_tokens, 272);
    }

    #[test]
    fn codex_converts_cumulative_counts_to_deltas() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("session.jsonl");
        let mut file = File::create(&path).unwrap();
        writeln!(
            file,
            "{}",
            serde_json::json!({
                "timestamp": "2026-07-15T10:00:00Z",
                "type": "session_meta",
                "payload": { "id": "session", "cwd": dir.path() }
            })
        )
        .unwrap();
        writeln!(
            file,
            "{}",
            serde_json::json!({
                "timestamp": "2026-07-15T10:00:01Z",
                "type": "turn_context",
                "payload": { "cwd": dir.path(), "model": "gpt-test" }
            })
        )
        .unwrap();
        for (timestamp, input, output) in [
            ("2026-07-15T10:00:02Z", 100, 20),
            ("2026-07-15T10:00:03Z", 160, 35),
        ] {
            writeln!(
                file,
                "{}",
                serde_json::json!({
                    "timestamp": timestamp,
                    "type": "event_msg",
                    "payload": {
                        "type": "token_count",
                        "info": { "total_token_usage": {
                            "input_tokens": input,
                            "cached_input_tokens": 40,
                            "output_tokens": output,
                            "reasoning_output_tokens": 5,
                            "total_tokens": input + output
                        }}
                    }
                })
            )
            .unwrap();
        }
        let events = parse_codex_file(&path, &matcher(dir.path()), None);
        assert_eq!(events.len(), 2);
        let mut total = TokenUsage::default();
        for event in events {
            total.add(event.tokens);
        }
        assert_eq!(total.input_tokens, 160);
        assert_eq!(total.output_tokens, 35);
        assert_eq!(total.total_tokens, 195);
    }

    #[test]
    fn longest_project_root_wins() {
        let matcher = ProjectMatcher {
            roots: vec![
                ProjectRoot {
                    name: "copy".into(),
                    root: PathBuf::from("/tmp/work/copy"),
                },
                ProjectRoot {
                    name: "parent".into(),
                    root: PathBuf::from("/tmp/work"),
                },
            ],
        };
        assert_eq!(
            matcher.project_for("/tmp/work/copy/src").as_deref(),
            Some("copy")
        );
        assert_eq!(
            matcher.project_for("/tmp/work/src").as_deref(),
            Some("parent")
        );
        assert_eq!(matcher.project_for("/tmp/other"), None);
    }
}
