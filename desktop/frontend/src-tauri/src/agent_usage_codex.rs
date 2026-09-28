use crate::agent_usage::{
    collect_jsonl_files, parse_files_parallel, timestamp_millis, value_u64, ProjectMatcher,
    TokenUsage, UsageEvent,
};
use serde_json::Value;
use std::collections::HashSet;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

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
        cache_creation_input_tokens: delta(
            current.cache_creation_input_tokens,
            previous.cache_creation_input_tokens,
        ),
        cache_creation_1h_input_tokens: 0,
        cache_read_input_tokens: delta(
            current.cache_read_input_tokens,
            previous.cache_read_input_tokens,
        ),
        output_tokens: delta(current.output_tokens, previous.output_tokens),
        reasoning_tokens: delta(current.reasoning_tokens, previous.reasoning_tokens),
        total_tokens: delta(current.total_tokens, previous.total_tokens),
    }
}

/// `input_tokens` already contains both the cache reads and the cache writes. Codex's own
/// `total_tokens` is an estimate on the rows it synthesizes after a compaction, so the total is
/// rebuilt from the billed counts.
pub(crate) fn codex_tokens(usage: &Value) -> TokenUsage {
    let input = value_u64(usage, "input_tokens");
    let output = value_u64(usage, "output_tokens");
    let cache_read = value_u64(usage, "cached_input_tokens");
    let cache_write = value_u64(usage, "cache_write_input_tokens");
    TokenUsage {
        input_tokens: input,
        cached_input_tokens: cache_read.saturating_add(cache_write),
        cache_creation_input_tokens: cache_write,
        cache_creation_1h_input_tokens: 0,
        cache_read_input_tokens: cache_read,
        output_tokens: output,
        reasoning_tokens: value_u64(usage, "reasoning_output_tokens"),
        total_tokens: input.saturating_add(output),
    }
}

/// A forked or subagent rollout opens with a verbatim copy of the parent thread's transcript,
/// dumped in one sub-second burst and re-stamped with the spawn instant. Counting it would bill
/// the parent's whole history again for every spawn. Real turns are seconds apart, so the end of
/// that burst is the boundary.
const REPLAY_BURST_GAP_MS: i64 = 1_000;

fn trim_replayed_history(events: &mut Vec<UsageEvent>, forked: bool) {
    if !forked {
        return;
    }
    let replayed = events
        .windows(2)
        .take_while(|pair| pair[1].timestamp - pair[0].timestamp < REPLAY_BURST_GAP_MS)
        .count();
    if replayed > 0 {
        events.drain(..=replayed);
    }
}

pub(crate) fn collect_codex_events(
    matcher: &ProjectMatcher,
    cutoff: Option<i64>,
) -> (Vec<UsageEvent>, usize) {
    let root = dirs::home_dir()
        .unwrap_or_default()
        .join(".codex")
        .join("sessions");
    let mut files = Vec::new();
    collect_jsonl_files(&root, cutoff, &mut files);
    let file_count = files.len();
    let events = parse_files_parallel(files, |path| parse_codex_file(path, matcher, cutoff));
    (events, file_count)
}

struct Thread {
    cwd: String,
    model: String,
    session_id: String,
    fast: bool,
}

impl Thread {
    fn event(
        &self,
        record: &Value,
        tokens: TokenUsage,
        matcher: &ProjectMatcher,
        cutoff: Option<i64>,
    ) -> Option<UsageEvent> {
        if tokens.is_empty() {
            return None;
        }
        let timestamp = timestamp_millis(record)?;
        if cutoff.is_some_and(|cutoff| timestamp < cutoff) {
            return None;
        }
        Some(UsageEvent {
            provider: "codex",
            project: matcher.project_for(&self.cwd)?,
            session_id: self.session_id.clone(),
            model: self.model.clone(),
            timestamp,
            tokens,
            fast: self.fast,
        })
    }
}

/// Newer rollouts log one `token_usage_record` per model response, including remote compactions
/// that never reach a `token_count`, and follow each with that response's `token_count`. Older
/// ones only have `token_count`, which is re-sent unchanged whenever the rate limits refresh.
pub(crate) fn parse_codex_file(
    path: &Path,
    matcher: &ProjectMatcher,
    cutoff: Option<i64>,
) -> Vec<UsageEvent> {
    let Ok(file) = File::open(path) else {
        return Vec::new();
    };
    let mut thread = Thread {
        cwd: String::new(),
        model: "Unknown model".to_string(),
        session_id: path
            .file_stem()
            .and_then(|name| name.to_str())
            .unwrap_or("unknown")
            .to_string(),
        fast: false,
    };
    let mut previous: Option<TokenUsage> = None;
    let mut meta_seen = false;
    let mut forked = false;
    let mut tier_seen = false;
    let mut recorded = false;
    let mut responses = HashSet::new();
    let mut turns = Vec::new();
    let mut records = Vec::new();
    for line in BufReader::new(file).lines().map_while(Result::ok) {
        if !line.contains("token_count")
            && !line.contains("token_usage_record")
            && !line.contains("session_meta")
            && !line.contains("turn_context")
            && !line.contains("thread_settings_applied")
        {
            continue;
        }
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
                    thread.session_id = value.to_string();
                }
                if let Some(value) = payload.get("cwd").and_then(Value::as_str) {
                    thread.cwd = value.to_string();
                }
                if !meta_seen {
                    // The replayed transcript carries the parent's own session_meta, so
                    // only the rollout's first one describes this thread.
                    meta_seen = true;
                    forked = payload.get("forked_from_id").is_some()
                        || payload.get("thread_source").and_then(Value::as_str) == Some("subagent");
                }
                continue;
            }
            Some("turn_context") => {
                if let Some(value) = payload.get("cwd").and_then(Value::as_str) {
                    thread.cwd = value.to_string();
                }
                if let Some(value) = payload.get("model").and_then(Value::as_str) {
                    thread.model = value.to_string();
                }
                continue;
            }
            Some("token_usage_record") => {
                let Some(usage) = payload.get("usage") else {
                    continue;
                };
                if let Some(response) = payload.get("response_id").and_then(Value::as_str) {
                    if !responses.insert(response.to_string()) {
                        continue;
                    }
                }
                recorded = true;
                records.extend(thread.event(&record, codex_tokens(usage), matcher, cutoff));
                continue;
            }
            _ => {}
        }
        match payload.get("type").and_then(Value::as_str) {
            Some("thread_settings_applied") => {
                let tier = payload
                    .pointer("/thread_settings/service_tier")
                    .and_then(Value::as_str);
                thread.fast = matches!(tier, Some("priority" | "fast"));
                if !tier_seen {
                    // The settings are only logged once a later turn re-sends them, and they
                    // were already in force for the turns before.
                    tier_seen = true;
                    for event in turns.iter_mut().chain(records.iter_mut()) {
                        event.fast = thread.fast;
                    }
                }
                continue;
            }
            Some("token_count") => {}
            _ => continue,
        }
        let info = payload.get("info").unwrap_or(&Value::Null);
        let cumulative = info.get("total_token_usage").map(codex_tokens);
        if cumulative.is_some() && cumulative == previous {
            continue;
        }
        let billed = std::mem::take(&mut recorded);
        let tokens = match info.get("last_token_usage").map(codex_tokens) {
            Some(turn) => turn,
            None => {
                let Some(current) = cumulative else {
                    continue;
                };
                usage_delta(current, previous.unwrap_or_default())
            }
        };
        if cumulative.is_some() {
            previous = cumulative;
        }
        if billed {
            continue;
        }
        turns.extend(thread.event(&record, tokens, matcher, cutoff));
    }
    trim_replayed_history(&mut turns, forked);
    turns.extend(records);
    turns
}

#[cfg(test)]
#[path = "agent_usage_codex_tests.rs"]
mod tests;
