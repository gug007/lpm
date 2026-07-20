// Live usage-limit meters for the installed AI coding CLIs.
//
// Two providers feed one store:
//   - Codex writes a rate-limit snapshot into its session rollout JSONL on every
//     model turn; a notify watcher on ~/.codex/sessions re-parses the newest file
//     on change (no setup required).
//   - Claude Code forwards its statusline JSON (which carries rate_limits for
//     Pro/Max logins) into the status socket, tagged with an account id. The
//     forwarder is consent-gated (hooks.rs), so this only populates once enabled.
//
// A change to any provider emits `agent-limits-changed` with the full snapshot,
// suppressing no-op re-emits like status.rs's should_replace.
use base64::Engine;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{sync_channel, RecvTimeoutError};
use std::sync::{Arc, RwLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

const CODEX_TAIL_BYTES: u64 = 1 << 20; // read at most the last 1 MiB of a rollout
const WATCH_SETTLE: Duration = Duration::from_millis(500);

#[derive(Serialize, Clone, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LimitWindow {
    pub used_percent: f64,
    pub resets_at: i64,
}

/// One provider's latest limits. `provider` is "claude" or "codex"; `account_id`
/// is set for Claude (per CLAUDE_CONFIG_DIR account) and absent for Codex.
/// `updated_at` is unix millis, used by the UI to dim stale meters.
#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProviderLimits {
    pub provider: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub five_hour: Option<LimitWindow>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub weekly: Option<LimitWindow>,
    pub updated_at: i64,
}

/// Everything except `updated_at` — the fields whose change warrants an emit.
fn meaningful_eq(a: &ProviderLimits, b: &ProviderLimits) -> bool {
    a.provider == b.provider
        && a.account_id == b.account_id
        && a.label == b.label
        && a.five_hour == b.five_hour
        && a.weekly == b.weekly
}

#[derive(Default)]
pub struct AgentLimitsStore {
    // store key -> limits. Key is "codex" or "claude:<account>" so a Claude
    // account and Codex never collide.
    entries: RwLock<HashMap<String, ProviderLimits>>,
}

impl AgentLimitsStore {
    pub fn new() -> Self {
        Self::default()
    }

    /// Insert/replace `limits` under `key`; returns whether meaningful fields
    /// changed (the caller emits only then). The stored `updated_at` always
    /// advances so a later fetch reports fresh data even on a no-op re-report.
    pub fn set(&self, key: &str, limits: ProviderLimits) -> bool {
        let mut m = self.entries.write().unwrap();
        let changed = m.get(key).map(|e| !meaningful_eq(e, &limits)).unwrap_or(true);
        m.insert(key.to_string(), limits);
        changed
    }

    pub fn snapshot(&self) -> HashMap<String, ProviderLimits> {
        self.entries.read().unwrap().clone()
    }
}

pub fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Full snapshot map — the payload the frontend fetches and the event carries.
#[tauri::command(async)]
pub fn agent_limits(store: State<'_, Arc<AgentLimitsStore>>) -> HashMap<String, ProviderLimits> {
    store.snapshot()
}

fn emit_snapshot(app: &AppHandle, store: &AgentLimitsStore) {
    let _ = app.emit("agent-limits-changed", store.snapshot());
}

// ---- Codex ------------------------------------------------------------------

fn codex_sessions_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_default()
        .join(".codex")
        .join("sessions")
}

/// One rate-limit window from Codex's `primary`/`secondary` object. Accepts both
/// `resets_at` (epoch seconds) and the older `resets_in_seconds` (relative), and
/// tolerates missing fields. `now` is injected so parsing stays testable.
fn parse_codex_window(v: &Value, now: i64) -> Option<(i64, LimitWindow)> {
    let obj = v.as_object()?;
    let used_percent = obj.get("used_percent").and_then(Value::as_f64)?;
    let window_minutes = obj.get("window_minutes").and_then(Value::as_i64)?;
    let resets_at = match obj.get("resets_at").and_then(Value::as_i64) {
        Some(ts) => ts,
        None => match obj.get("resets_in_seconds").and_then(Value::as_i64) {
            Some(secs) => now + secs,
            None => 0,
        },
    };
    Some((
        window_minutes,
        LimitWindow {
            used_percent,
            resets_at,
        },
    ))
}

/// Map a window's `window_minutes` onto the 5-hour / weekly slots. 300 min = 5h,
/// 10080 min = weekly; anything else is ignored. Codex may report either window
/// in `primary` (the active one), so slotting is by duration, not position.
fn slot_codex_window(limits: &mut ProviderLimits, minutes: i64, window: LimitWindow) {
    match minutes {
        300 => limits.five_hour = Some(window),
        10080 => limits.weekly = Some(window),
        _ => {}
    }
}

/// Parse a single rollout JSONL line into Codex limits, or None when the line is
/// not a token_count event, has null/absent rate_limits, or yields no usable
/// window. `now`/`updated_at` are injected for testability.
fn parse_codex_line(line: &str, now: i64, updated_at: i64) -> Option<ProviderLimits> {
    let v: Value = serde_json::from_str(line).ok()?;
    let rl = v.get("payload")?.get("rate_limits")?;
    if rl.is_null() {
        return None;
    }
    let mut limits = ProviderLimits {
        provider: "codex".into(),
        updated_at,
        ..Default::default()
    };
    if let Some(w) = rl.get("primary").and_then(|p| parse_codex_window(p, now)) {
        slot_codex_window(&mut limits, w.0, w.1);
    }
    if let Some(w) = rl.get("secondary").and_then(|s| parse_codex_window(s, now)) {
        slot_codex_window(&mut limits, w.0, w.1);
    }
    if limits.five_hour.is_none() && limits.weekly.is_none() {
        return None;
    }
    limits.label = rl
        .get("plan_type")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    Some(limits)
}

/// Last usable limits from a rollout file, reading only its tail (rollouts grow
/// unbounded, and the freshest rate_limits line is always near the end).
fn parse_codex_file(path: &Path, now: i64, updated_at: i64) -> Option<ProviderLimits> {
    let text = read_tail(path, CODEX_TAIL_BYTES)?;
    text.lines()
        .rev()
        .find_map(|line| parse_codex_line(line, now, updated_at))
}

/// Read at most the last `max_bytes` of a file as UTF-8 (lossy), dropping a
/// leading partial line so callers only see whole lines.
fn read_tail(path: &Path, max_bytes: u64) -> Option<String> {
    let mut f = std::fs::File::open(path).ok()?;
    let len = f.metadata().ok()?.len();
    let start = len.saturating_sub(max_bytes);
    f.seek(SeekFrom::Start(start)).ok()?;
    let mut buf = Vec::new();
    f.read_to_end(&mut buf).ok()?;
    let mut text = String::from_utf8_lossy(&buf).into_owned();
    if start > 0 {
        if let Some(nl) = text.find('\n') {
            text.drain(..=nl);
        }
    }
    Some(text)
}

/// Most-recently-modified `rollout-*.jsonl` under the sessions tree, walking the
/// YYYY/MM/DD layout without a walkdir dependency.
fn newest_rollout(dir: &Path) -> Option<PathBuf> {
    let mut best: Option<(SystemTime, PathBuf)> = None;
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&d) else {
            continue;
        };
        for entry in rd.flatten() {
            let path = entry.path();
            let Ok(ft) = entry.file_type() else { continue };
            if ft.is_dir() {
                stack.push(path);
                continue;
            }
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if !(name.starts_with("rollout-") && name.ends_with(".jsonl")) {
                continue;
            }
            let Ok(modified) = entry.metadata().and_then(|m| m.modified()) else {
                continue;
            };
            if best.as_ref().map(|(t, _)| modified > *t).unwrap_or(true) {
                best = Some((modified, path));
            }
        }
    }
    best.map(|(_, p)| p)
}

/// Re-scan the newest rollout and update the store, emitting on a real change.
fn refresh_codex(app: &AppHandle, store: &AgentLimitsStore) {
    let Some(path) = newest_rollout(&codex_sessions_dir()) else {
        return;
    };
    let Some(limits) = parse_codex_file(&path, now_secs(), now_millis()) else {
        return;
    };
    if store.set("codex", limits) {
        emit_snapshot(app, store);
    }
}

/// Initial scan + a recursive notify watcher on ~/.codex/sessions. Non-fatal on
/// failure (logged), matching configwatch::start. Coalesces event bursts. All
/// filesystem work runs off the UI thread.
pub fn start(app: AppHandle) {
    let store = app.state::<Arc<AgentLimitsStore>>().inner().clone();

    let dir = codex_sessions_dir();
    if !dir.exists() {
        // No Codex yet: still do the one-shot scan in case the dir appears later
        // is out of scope; nothing to watch, so return quietly.
        let (a, s) = (app.clone(), store.clone());
        std::thread::spawn(move || refresh_codex(&a, &s));
        return;
    }
    let (tx, rx) = sync_channel::<()>(1);
    let mut watcher = match notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if res.is_ok() {
            let _ = tx.try_send(());
        }
    }) {
        Ok(w) => w,
        Err(e) => {
            eprintln!("warning: failed to start codex limits watcher: {e}");
            return;
        }
    };
    use notify::{RecursiveMode, Watcher};
    if let Err(e) = watcher.watch(&dir, RecursiveMode::Recursive) {
        eprintln!("warning: codex limits watcher could not watch sessions: {e}");
        return;
    }
    std::thread::spawn(move || {
        let _watcher = watcher;
        refresh_codex(&app, &store); // initial snapshot, off the UI thread
        loop {
            if rx.recv().is_err() {
                return;
            }
            // Drain the burst that a single turn's write triggers.
            loop {
                match rx.recv_timeout(WATCH_SETTLE) {
                    Ok(()) => {}
                    Err(RecvTimeoutError::Timeout) => break,
                    Err(RecvTimeoutError::Disconnected) => return,
                }
            }
            refresh_codex(&app, &store);
        }
    });
}

// ---- Claude -----------------------------------------------------------------

/// Parse the `rate_limits` block of a Claude statusline payload. Both windows
/// may be independently absent (only populated for Pro/Max OAuth logins);
/// returns None when neither is present.
fn parse_claude_rate_limits(payload: &Value) -> Option<(Option<LimitWindow>, Option<LimitWindow>)> {
    let rl = payload.get("rate_limits")?;
    let window = |key: &str| -> Option<LimitWindow> {
        let w = rl.get(key)?;
        let used_percent = w.get("used_percentage").and_then(Value::as_f64)?;
        let resets_at = w.get("resets_at").and_then(Value::as_i64).unwrap_or(0);
        Some(LimitWindow {
            used_percent,
            resets_at,
        })
    };
    let five = window("five_hour");
    let seven = window("seven_day");
    if five.is_none() && seven.is_none() {
        return None;
    }
    Some((five, seven))
}

/// Build Claude limits from a full statusline payload, or None when no usable
/// rate_limits are present. `updated_at` injected for testability.
fn parse_claude_payload(account_id: &str, payload: &Value, updated_at: i64) -> Option<ProviderLimits> {
    let (five_hour, weekly) = parse_claude_rate_limits(payload)?;
    Some(ProviderLimits {
        provider: "claude".into(),
        account_id: Some(account_id.to_string()),
        label: payload
            .get("model")
            .and_then(|m| m.get("display_name").or_else(|| m.get("id")))
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        five_hour,
        weekly,
        updated_at,
    })
}

fn claude_store_key(account_id: &str) -> String {
    format!("claude:{account_id}")
}

/// Socket entry point for the statusline forwarder: `agent_limits <account>
/// --payload-b64=<base64 statusline JSON>`. Decodes, parses, stores, emits.
/// Returns a socket reply string.
pub fn ingest_from_socket(
    app: &AppHandle,
    store: &AgentLimitsStore,
    positional: &[String],
    payload_b64: Option<&str>,
) -> String {
    let account_id = positional.first().map(String::as_str).unwrap_or("default");
    let Some(b64) = payload_b64 else {
        return "ERROR: usage: agent_limits <account> --payload-b64=<data>".into();
    };
    let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(b64) else {
        return "ERROR: invalid base64 payload".into();
    };
    let Ok(payload) = serde_json::from_slice::<Value>(&bytes) else {
        return "ERROR: invalid JSON payload".into();
    };
    if let Some(limits) = parse_claude_payload(account_id, &payload, now_millis()) {
        if store.set(&claude_store_key(account_id), limits) {
            emit_snapshot(app, store);
        }
    }
    "OK".into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn codex_maps_windows_by_duration_not_position() {
        // primary is the WEEKLY window (10080) with secondary null — the real
        // shape observed on disk; must still slot into `weekly`, not `five_hour`.
        let line = r#"{"type":"event_msg","payload":{"type":"token_count","rate_limits":{"primary":{"used_percent":24.0,"window_minutes":10080,"resets_at":1785088782},"secondary":null,"plan_type":"plus"}}}"#;
        let l = parse_codex_line(line, 1_000, 5).unwrap();
        assert!(l.five_hour.is_none());
        let weekly = l.weekly.unwrap();
        assert_eq!(weekly.used_percent, 24.0);
        assert_eq!(weekly.resets_at, 1785088782);
        assert_eq!(l.label.as_deref(), Some("plus"));
        assert_eq!(l.updated_at, 5);
    }

    #[test]
    fn codex_both_windows() {
        let line = r#"{"payload":{"type":"token_count","rate_limits":{"primary":{"used_percent":3.0,"window_minutes":300,"resets_at":100},"secondary":{"used_percent":2.0,"window_minutes":10080,"resets_at":200},"plan_type":"plus"}}}"#;
        let l = parse_codex_line(line, 0, 0).unwrap();
        assert_eq!(l.five_hour.unwrap().used_percent, 3.0);
        assert_eq!(l.weekly.unwrap().used_percent, 2.0);
    }

    #[test]
    fn codex_resets_in_seconds_becomes_absolute() {
        let line = r#"{"payload":{"rate_limits":{"primary":{"used_percent":1.0,"window_minutes":300,"resets_in_seconds":60}}}}"#;
        let l = parse_codex_line(line, 1_000, 0).unwrap();
        assert_eq!(l.five_hour.unwrap().resets_at, 1_060);
    }

    #[test]
    fn codex_null_and_absent_rate_limits_are_none() {
        assert!(parse_codex_line(r#"{"payload":{"rate_limits":null}}"#, 0, 0).is_none());
        assert!(parse_codex_line(r#"{"payload":{"type":"token_count"}}"#, 0, 0).is_none());
        assert!(parse_codex_line("not json", 0, 0).is_none());
    }

    #[test]
    fn codex_no_known_window_is_none() {
        // A window whose duration matches neither slot yields nothing usable.
        let line = r#"{"payload":{"rate_limits":{"primary":{"used_percent":5.0,"window_minutes":42,"resets_at":1}}}}"#;
        assert!(parse_codex_line(line, 0, 0).is_none());
    }

    #[test]
    fn codex_file_takes_last_valid_line() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("rollout-x.jsonl");
        let mut f = std::fs::File::create(&path).unwrap();
        writeln!(f, r#"{{"payload":{{"rate_limits":{{"primary":{{"used_percent":10.0,"window_minutes":300,"resets_at":1}}}}}}}}"#).unwrap();
        writeln!(f, r#"{{"payload":{{"rate_limits":null}}}}"#).unwrap();
        writeln!(f, r#"{{"payload":{{"rate_limits":{{"primary":{{"used_percent":55.0,"window_minutes":300,"resets_at":2}}}}}}}}"#).unwrap();
        writeln!(f, r#"{{"payload":{{"type":"other"}}}}"#).unwrap();
        let l = parse_codex_file(&path, 0, 0).unwrap();
        assert_eq!(l.five_hour.unwrap().used_percent, 55.0);
    }

    fn backdate(path: &Path, secs: i64) {
        let c = std::ffi::CString::new(path.to_string_lossy().as_bytes()).unwrap();
        let t = libc::timeval {
            tv_sec: secs as libc::time_t,
            tv_usec: 0,
        };
        unsafe { libc::utimes(c.as_ptr(), [t, t].as_ptr()) };
    }

    #[test]
    fn newest_rollout_picks_latest_mtime() {
        let dir = tempfile::tempdir().unwrap();
        let day = dir.path().join("2026").join("07").join("20");
        std::fs::create_dir_all(&day).unwrap();
        let old = day.join("rollout-old.jsonl");
        let new = day.join("rollout-new.jsonl");
        std::fs::write(&old, "a").unwrap();
        std::fs::write(&new, "b").unwrap();
        // Deterministically make `old` older than `new`.
        backdate(&old, 1_000_000_000);
        backdate(&new, 2_000_000_000);
        // A non-rollout file is ignored even when newest.
        let notes = day.join("notes.txt");
        std::fs::write(&notes, "x").unwrap();
        backdate(&notes, 3_000_000_000);
        assert_eq!(newest_rollout(dir.path()).unwrap(), new);
    }

    #[test]
    fn read_tail_drops_partial_leading_line() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("f");
        std::fs::write(&path, "aaaa\nbbbb\ncccc\n").unwrap();
        // Small cap so start > 0 and the first (partial) line is dropped.
        let tail = read_tail(&path, 9).unwrap();
        assert!(!tail.contains("aaaa"));
        assert!(tail.contains("cccc"));
    }

    #[test]
    fn claude_parses_both_windows_and_label() {
        let payload: Value = serde_json::from_str(
            r#"{"model":{"id":"claude","display_name":"Opus"},"rate_limits":{"five_hour":{"used_percentage":23.5,"resets_at":1738425600},"seven_day":{"used_percentage":41.2,"resets_at":1738857600}}}"#,
        )
        .unwrap();
        let l = parse_claude_payload("default", &payload, 7).unwrap();
        assert_eq!(l.provider, "claude");
        assert_eq!(l.account_id.as_deref(), Some("default"));
        assert_eq!(l.label.as_deref(), Some("Opus"));
        assert_eq!(l.five_hour.unwrap().used_percent, 23.5);
        assert_eq!(l.weekly.unwrap().resets_at, 1738857600);
        assert_eq!(l.updated_at, 7);
    }

    #[test]
    fn claude_missing_rate_limits_is_none() {
        let payload: Value = serde_json::from_str(r#"{"model":{"id":"claude"}}"#).unwrap();
        assert!(parse_claude_payload("default", &payload, 0).is_none());
    }

    #[test]
    fn claude_partial_windows_ok() {
        let payload: Value = serde_json::from_str(
            r#"{"rate_limits":{"five_hour":{"used_percentage":10.0,"resets_at":1}}}"#,
        )
        .unwrap();
        let l = parse_claude_payload("acct", &payload, 0).unwrap();
        assert_eq!(l.five_hour.unwrap().used_percent, 10.0);
        assert!(l.weekly.is_none());
        assert!(l.label.is_none());
    }

    #[test]
    fn store_set_reports_meaningful_change_only() {
        let s = AgentLimitsStore::new();
        let mk = |pct: f64, updated: i64| ProviderLimits {
            provider: "codex".into(),
            five_hour: Some(LimitWindow {
                used_percent: pct,
                resets_at: 1,
            }),
            updated_at: updated,
            ..Default::default()
        };
        assert!(s.set("codex", mk(10.0, 1)), "first insert changes");
        assert!(
            !s.set("codex", mk(10.0, 999)),
            "same values, newer timestamp -> no emit"
        );
        assert!(s.set("codex", mk(20.0, 1000)), "percent change -> emit");
        // updated_at still advanced in the store.
        assert_eq!(s.snapshot().get("codex").unwrap().updated_at, 1000);
    }
}
