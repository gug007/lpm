use crate::agent_usage_claude::collect_claude_events;
use crate::agent_usage_codex::collect_codex_events;
use crate::config;
use chrono::{DateTime, Duration, Local, TimeZone};
use serde::Serialize;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::path::{Path, PathBuf};

#[derive(Clone, Copy, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsage {
    pub input_tokens: u64,
    pub cached_input_tokens: u64,
    pub cache_creation_input_tokens: u64,
    pub cache_creation_1h_input_tokens: u64,
    pub cache_read_input_tokens: u64,
    pub output_tokens: u64,
    pub reasoning_tokens: u64,
    pub total_tokens: u64,
}

impl TokenUsage {
    pub(crate) fn add(&mut self, other: Self) {
        self.input_tokens = self.input_tokens.saturating_add(other.input_tokens);
        self.cached_input_tokens = self
            .cached_input_tokens
            .saturating_add(other.cached_input_tokens);
        self.cache_creation_input_tokens = self
            .cache_creation_input_tokens
            .saturating_add(other.cache_creation_input_tokens);
        self.cache_creation_1h_input_tokens = self
            .cache_creation_1h_input_tokens
            .saturating_add(other.cache_creation_1h_input_tokens);
        self.cache_read_input_tokens = self
            .cache_read_input_tokens
            .saturating_add(other.cache_read_input_tokens);
        self.output_tokens = self.output_tokens.saturating_add(other.output_tokens);
        self.reasoning_tokens = self.reasoning_tokens.saturating_add(other.reasoning_tokens);
        self.total_tokens = self.total_tokens.saturating_add(other.total_tokens);
    }

    pub(crate) fn is_empty(self) -> bool {
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
    #[serde(skip_serializing_if = "Option::is_none")]
    provider: Option<String>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    fast: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyModelUsage {
    provider: String,
    model: String,
    tokens: TokenUsage,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    fast: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyUsage {
    date: String,
    claude_tokens: u64,
    codex_tokens: u64,
    total_tokens: u64,
    models: Vec<DailyModelUsage>,
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
    models: Vec<UsageBreakdown>,
    daily: Vec<DailyUsage>,
    recent_sessions: Vec<AgentSessionUsage>,
    sources: Vec<UsageSource>,
}

#[derive(Clone)]
pub(crate) struct UsageEvent {
    pub(crate) provider: &'static str,
    pub(crate) project: String,
    pub(crate) session_id: String,
    pub(crate) model: String,
    pub(crate) timestamp: i64,
    pub(crate) tokens: TokenUsage,
    pub(crate) fast: bool,
}

pub(crate) struct ProjectRoot {
    pub(crate) name: String,
    pub(crate) root: PathBuf,
}

pub(crate) struct ProjectMatcher {
    pub(crate) roots: Vec<ProjectRoot>,
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

    pub(crate) fn project_for(&self, cwd: &str) -> Option<String> {
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

pub(crate) fn normalize_path(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

pub(crate) fn value_u64(value: &Value, key: &str) -> u64 {
    value.get(key).and_then(Value::as_u64).unwrap_or(0)
}

pub(crate) fn timestamp_millis(value: &Value) -> Option<i64> {
    value
        .get("timestamp")
        .and_then(Value::as_str)
        .and_then(|timestamp| DateTime::parse_from_rfc3339(timestamp).ok())
        .map(|timestamp| timestamp.timestamp_millis())
}

pub(crate) fn collect_jsonl_files(root: &Path, cutoff: Option<i64>, files: &mut Vec<PathBuf>) {
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

pub(crate) fn parse_files_parallel<T, F>(files: Vec<PathBuf>, parse: F) -> Vec<T>
where
    T: Send,
    F: Fn(&Path) -> Vec<T> + Sync,
{
    if files.is_empty() {
        return Vec::new();
    }
    let workers = std::thread::available_parallelism()
        .map(|count| count.get())
        .unwrap_or(1)
        .max(1);
    let chunk_size = files.len().div_ceil(workers).max(1);
    let parse = &parse;
    std::thread::scope(|scope| {
        let handles: Vec<_> = files
            .chunks(chunk_size)
            .map(|chunk| {
                scope.spawn(move || {
                    let mut local = Vec::new();
                    for path in chunk {
                        local.extend(parse(path));
                    }
                    local
                })
            })
            .collect();
        handles
            .into_iter()
            .flat_map(|handle| handle.join().unwrap_or_default())
            .collect()
    })
}

#[derive(Default)]
struct GroupAggregate {
    tokens: TokenUsage,
    sessions: HashSet<String>,
    provider: Option<&'static str>,
    fast: bool,
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
    models: BTreeMap<(String, String, bool), TokenUsage>,
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
    groups: impl IntoIterator<Item = (String, GroupAggregate)>,
    labels: &HashMap<String, String>,
) -> Vec<UsageBreakdown> {
    let mut rows: Vec<UsageBreakdown> = groups
        .into_iter()
        .map(|(key, aggregate)| UsageBreakdown {
            label: labels.get(&key).cloned().unwrap_or_else(|| key.clone()),
            key,
            sessions: aggregate.sessions.len(),
            tokens: aggregate.tokens,
            provider: aggregate.provider.map(str::to_string),
            fast: aggregate.fast,
        })
        .collect();
    rows.sort_by(|a, b| {
        b.tokens
            .total_tokens
            .cmp(&a.tokens.total_tokens)
            .then_with(|| a.label.cmp(&b.label))
            .then_with(|| a.fast.cmp(&b.fast))
    });
    rows
}

fn aggregate(events: Vec<UsageEvent>, days: i64, sources: Vec<UsageSource>) -> AgentUsageStats {
    let mut totals = TokenUsage::default();
    let mut provider_groups: HashMap<String, GroupAggregate> = HashMap::new();
    let mut project_groups: HashMap<String, GroupAggregate> = HashMap::new();
    let mut model_groups: HashMap<(String, bool), GroupAggregate> = HashMap::new();
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
        let model = model_groups
            .entry((event.model.clone(), event.fast))
            .or_default();
        model.tokens.add(event.tokens);
        model.sessions.insert(session_key.clone());
        model.provider.get_or_insert(event.provider);
        model.fast = event.fast;
        let session = sessions
            .entry(session_key)
            .or_insert_with(|| SessionAggregate {
                provider: event.provider.to_string(),
                project: event.project.clone(),
                started_at: event.timestamp,
                last_at: event.timestamp,
                ..Default::default()
            });
        session.models.insert(event.model.clone());
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
        day.models
            .entry((event.provider.to_string(), event.model, event.fast))
            .or_default()
            .add(event.tokens);
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
        models: breakdowns(
            model_groups
                .into_iter()
                .map(|((model, _), aggregate)| (model, aggregate)),
            &HashMap::new(),
        ),
        daily: daily
            .into_iter()
            .map(|(date, totals)| DailyUsage {
                date,
                claude_tokens: totals.claude_tokens,
                codex_tokens: totals.codex_tokens,
                total_tokens: totals.claude_tokens.saturating_add(totals.codex_tokens),
                models: totals
                    .models
                    .into_iter()
                    .map(|((provider, model, fast), tokens)| DailyModelUsage {
                        provider,
                        model,
                        tokens,
                        fast,
                    })
                    .collect(),
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
pub(crate) fn test_matcher(root: &Path) -> ProjectMatcher {
    ProjectMatcher {
        roots: vec![ProjectRoot {
            name: "lpm".into(),
            root: normalize_path(root),
        }],
    }
}

#[cfg(test)]
#[path = "agent_usage_tests.rs"]
mod tests;
