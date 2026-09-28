use crate::agent_usage::{
    collect_jsonl_files, normalize_path, parse_files_parallel, timestamp_millis, value_u64,
    ProjectMatcher, TokenUsage, UsageEvent,
};
use crate::config;
use serde_json::Value;
use std::cmp::Reverse;
use std::collections::hash_map::Entry;
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

pub(crate) struct Candidate {
    key: String,
    written: i64,
    event: UsageEvent,
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

pub(crate) fn collect_claude_events(
    matcher: &ProjectMatcher,
    cutoff: Option<i64>,
) -> (Vec<UsageEvent>, usize) {
    let mut files = Vec::new();
    for dir in claude_project_dirs() {
        collect_jsonl_files(&dir, cutoff, &mut files);
    }
    let file_count = files.len();
    let events = parse_files_parallel(files, |path| parse_claude_file(path, matcher, cutoff));
    (dedupe_messages(events), file_count)
}

/// A forked or resumed session copies earlier messages into its own transcript under the new
/// session id and cwd, but the API billed each message id once, to the transcript that was
/// written first.
fn dedupe_messages(candidates: Vec<Candidate>) -> Vec<UsageEvent> {
    let mut latest = HashMap::new();
    for candidate in candidates {
        keep_latest(&mut latest, candidate);
    }
    latest
        .into_values()
        .map(|candidate| candidate.event)
        .collect()
}

fn rank(candidate: &Candidate) -> (u64, i64, Reverse<i64>, Reverse<&str>) {
    (
        candidate.event.tokens.total_tokens,
        candidate.event.timestamp,
        Reverse(candidate.written),
        Reverse(candidate.event.session_id.as_str()),
    )
}

fn keep_latest(latest: &mut HashMap<String, Candidate>, candidate: Candidate) {
    match latest.entry(candidate.key.clone()) {
        Entry::Occupied(mut slot) => {
            if rank(&candidate) > rank(slot.get()) {
                slot.insert(candidate);
            }
        }
        Entry::Vacant(slot) => {
            slot.insert(candidate);
        }
    }
}

fn written_at(file: &File) -> i64 {
    file.metadata()
        .and_then(|metadata| metadata.created())
        .ok()
        .and_then(|created| created.duration_since(UNIX_EPOCH).ok())
        .map_or(i64::MAX, |created| created.as_millis() as i64)
}

fn claude_tokens(usage: &Value) -> TokenUsage {
    let cache_creation = value_u64(usage, "cache_creation_input_tokens");
    let cache_creation_1h = usage
        .get("cache_creation")
        .map_or(0, |split| value_u64(split, "ephemeral_1h_input_tokens"))
        .min(cache_creation);
    let cache_read = value_u64(usage, "cache_read_input_tokens");
    let input = value_u64(usage, "input_tokens")
        .saturating_add(cache_creation)
        .saturating_add(cache_read);
    let output = value_u64(usage, "output_tokens");
    TokenUsage {
        input_tokens: input,
        cached_input_tokens: cache_creation.saturating_add(cache_read),
        cache_creation_input_tokens: cache_creation,
        cache_creation_1h_input_tokens: cache_creation_1h,
        cache_read_input_tokens: cache_read,
        output_tokens: output,
        reasoning_tokens: 0,
        total_tokens: input.saturating_add(output),
    }
}

fn iteration_kind(iteration: &Value) -> &str {
    iteration.get("type").and_then(Value::as_str).unwrap_or("")
}

/// Advisor calls, compactions and refusal-fallback hops are billed per iteration at that
/// iteration's model, and the top-level usage leaves some of them out. A hop that was declined
/// before any output is not billed for most refusal categories.
fn usage_by_model<'a>(usage: &'a Value, model: &'a str) -> Vec<(&'a str, TokenUsage)> {
    let Some(iterations) = usage
        .get("iterations")
        .and_then(Value::as_array)
        .filter(|iterations| !iterations.is_empty())
    else {
        return vec![(model, claude_tokens(usage))];
    };
    let fell_back = iterations
        .iter()
        .any(|iteration| iteration_kind(iteration) == "fallback_message");
    let mut by_model: Vec<(&str, TokenUsage)> = Vec::new();
    for iteration in iterations {
        if fell_back
            && iteration_kind(iteration) == "message"
            && value_u64(iteration, "output_tokens") == 0
        {
            continue;
        }
        let id = iteration
            .get("model")
            .and_then(Value::as_str)
            .unwrap_or(model);
        let tokens = claude_tokens(iteration);
        match by_model.iter_mut().find(|(existing, _)| *existing == id) {
            Some((_, total)) => total.add(tokens),
            None => by_model.push((id, tokens)),
        }
    }
    by_model
}

pub(crate) fn parse_claude_file(
    path: &Path,
    matcher: &ProjectMatcher,
    cutoff: Option<i64>,
) -> Vec<Candidate> {
    let Ok(file) = File::open(path) else {
        return Vec::new();
    };
    let written = written_at(&file);
    let fallback_session = path
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("unknown")
        .to_string();
    let mut messages: HashMap<String, Candidate> = HashMap::new();
    for line in BufReader::new(file).lines().map_while(Result::ok) {
        if !line.contains("\"usage\"") {
            continue;
        }
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
        let model = message
            .get("model")
            .and_then(Value::as_str)
            .unwrap_or("Unknown model");
        let fast = usage.get("speed").and_then(Value::as_str) == Some("fast");
        for (id, tokens) in usage_by_model(usage, model) {
            if tokens.is_empty() {
                continue;
            }
            let event = UsageEvent {
                provider: "claude",
                project: project.clone(),
                session_id: session_id.clone(),
                model: id.to_string(),
                timestamp,
                tokens,
                fast: fast && id == model,
            };
            let key = format!("{message_id}\0{id}");
            keep_latest(
                &mut messages,
                Candidate {
                    key,
                    written,
                    event,
                },
            );
        }
    }
    messages.into_values().collect()
}

#[cfg(test)]
#[path = "agent_usage_claude_tests.rs"]
mod tests;
