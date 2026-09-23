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
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{sync_channel, RecvTimeoutError};
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

const CODEX_TAIL_BYTES: u64 = 1 << 20; // read at most the last 1 MiB of a rollout
const WATCH_SETTLE: Duration = Duration::from_millis(500);
const SESSION_MARK_TTL_SECS: i64 = 24 * 3600;

#[derive(Serialize, Deserialize, Clone, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LimitWindow {
    pub used_percent: f64,
    pub resets_at: i64,
    /// Taken from a Claude session right after its own API response, as opposed
    /// to a replay of an older reading. Process-local: never sent or persisted.
    #[serde(skip)]
    pub from_response: bool,
}

/// One provider's latest limits. `provider` is "claude" or "codex"; `account_id`
/// is set for Claude (per CLAUDE_CONFIG_DIR account) and absent for Codex.
/// `updated_at` is unix millis, used by the UI to dim stale meters.
/// `no_limits` marks a Claude account whose replies carry no plan windows at
/// all (API-billed logins), so the UI can say so instead of waiting forever.
#[derive(Serialize, Deserialize, Clone, Default)]
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
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub no_limits: bool,
}

/// Pick between the stored and incoming reading of one window. Every concurrent
/// session reports its own last-seen snapshot, so an idle session can push a
/// reading hours older than what we already have; taking it verbatim makes the
/// meter oscillate.
///
/// A `fresh` reading came straight from an API response, so it wins outright —
/// the only way to see the provider reset usage mid-window (back to 0, often
/// with the same `resets_at`). Once a window holds such a reading, replays can't
/// contradict it until it runs out. Without one (after a relaunch, or from
/// Codex) the guess is that usage only grows inside a window: the later
/// `resets_at` wins, then the higher percent. The bool is true only when `next`
/// won.
fn pick_window(
    prev: Option<&LimitWindow>,
    next: Option<LimitWindow>,
    now: i64,
    fresh: bool,
) -> (Option<LimitWindow>, bool) {
    match (prev, next) {
        (_, None) => (
            // A snapshot that omits a window says nothing about it; keep what we
            // know until that window's reset makes it meaningless.
            prev.filter(|p| p.resets_at == 0 || p.resets_at > now)
                .cloned(),
            false,
        ),
        (None, Some(n)) => (
            Some(LimitWindow {
                from_response: fresh,
                ..n
            }),
            true,
        ),
        (Some(p), Some(n)) => {
            let newer = if fresh {
                true
            } else if p.from_response {
                p.resets_at != 0 && p.resets_at <= now && n.resets_at > p.resets_at
            } else {
                n.resets_at > p.resets_at
                    || (n.resets_at == p.resets_at && n.used_percent > p.used_percent)
            };
            if newer {
                (
                    Some(LimitWindow {
                        from_response: fresh,
                        ..n
                    }),
                    true,
                )
            } else {
                (Some(p.clone()), false)
            }
        }
    }
}

/// Fold an incoming reading into the stored one, keeping the freshest value per
/// window. `updated_at` always takes the incoming value — it tracks when we last
/// heard from the provider, not which reading won.
fn merge_limits(
    prev: &ProviderLimits,
    next: ProviderLimits,
    now: i64,
    fresh: bool,
) -> ProviderLimits {
    let (five_hour, five_fresh) = pick_window(prev.five_hour.as_ref(), next.five_hour, now, fresh);
    let (weekly, weekly_fresh) = pick_window(prev.weekly.as_ref(), next.weekly, now, fresh);
    let stale_report = !five_fresh && !weekly_fresh;
    let label = if stale_report {
        prev.label.clone().or(next.label)
    } else {
        next.label.or_else(|| prev.label.clone())
    };
    let no_limits = five_hour.is_none() && weekly.is_none() && (next.no_limits || prev.no_limits);
    ProviderLimits {
        provider: next.provider,
        account_id: next.account_id,
        label,
        five_hour,
        weekly,
        updated_at: next.updated_at,
        no_limits,
    }
}

/// Everything except `updated_at` — the fields whose change warrants an emit.
fn meaningful_eq(a: &ProviderLimits, b: &ProviderLimits) -> bool {
    a.provider == b.provider
        && a.account_id == b.account_id
        && a.label == b.label
        && a.five_hour == b.five_hour
        && a.weekly == b.weekly
        && a.no_limits == b.no_limits
}

#[derive(Default)]
pub struct AgentLimitsStore {
    // store key -> limits. Key is "codex" or "claude:<account>" so a Claude
    // account and Codex never collide.
    entries: RwLock<HashMap<String, ProviderLimits>>,
    // Claude session id -> (cumulative API ms, last report secs).
    sessions: Mutex<HashMap<String, (i64, i64)>>,
}

impl AgentLimitsStore {
    pub fn new() -> Self {
        Self::default()
    }

    /// Fold `limits` into whatever is stored under `key`; returns whether
    /// meaningful fields changed (the caller emits only then). The stored
    /// `updated_at` always advances so a later fetch reports fresh data even on a
    /// no-op re-report. `now` is unix seconds, injected for testability.
    pub fn set(&self, key: &str, limits: ProviderLimits, now: i64, fresh: bool) -> bool {
        let mut m = self.entries.write().unwrap();
        let merged = merge_limits(
            m.get(key).unwrap_or(&ProviderLimits::default()),
            limits,
            now,
            fresh,
        );
        let changed = m
            .get(key)
            .map(|e| !meaningful_eq(e, &merged))
            .unwrap_or(true);
        m.insert(key.to_string(), merged);
        changed
    }

    /// Record a Claude session's cumulative API time and say whether it moved
    /// since that session's previous report. It only moves when a response
    /// lands — which is also when the session's rate_limits refresh — while an
    /// idle session keeps replaying its last reading with the time unchanged.
    pub fn session_advanced(&self, session_id: &str, api_ms: i64, now: i64) -> bool {
        let mut m = self.sessions.lock().unwrap();
        m.retain(|_, (_, seen)| now - *seen < SESSION_MARK_TTL_SECS);
        let prev = m.insert(session_id.to_string(), (api_ms, now));
        prev.is_some_and(|(ms, _)| api_ms > ms)
    }

    pub fn snapshot(&self) -> HashMap<String, ProviderLimits> {
        self.entries.read().unwrap().clone()
    }
}

/// Claude limits reach the app only through a live session's status line, so
/// the last reading is kept on disk and shown again right after a relaunch,
/// the way Codex's meter comes straight from its own session files.
fn limits_path() -> PathBuf {
    crate::config::lpm_dir().join("agent-limits.json")
}

fn persist_claude(store: &AgentLimitsStore) {
    let claude: HashMap<String, ProviderLimits> = store
        .snapshot()
        .into_iter()
        .filter(|(k, _)| k.starts_with("claude:"))
        .collect();
    if let Err(e) = persist_claude_at(&limits_path(), &claude) {
        eprintln!("warning: failed to save agent limits: {e}");
    }
}

fn persist_claude_at(path: &Path, claude: &HashMap<String, ProviderLimits>) -> std::io::Result<()> {
    let bytes = serde_json::to_vec_pretty(claude).map_err(std::io::Error::other)?;
    crate::fsatomic::write(path, &bytes, crate::fsatomic::Mode::Preserve(0o644))
}

/// The saved readings with any window that has already reset dropped; a reading
/// left with no window is not worth a row.
fn load_claude_at(path: &Path, now: i64) -> HashMap<String, ProviderLimits> {
    let Ok(bytes) = std::fs::read(path) else {
        return HashMap::new();
    };
    let saved: HashMap<String, ProviderLimits> = serde_json::from_slice(&bytes).unwrap_or_default();
    let live = |w: Option<LimitWindow>| w.filter(|w| w.resets_at == 0 || w.resets_at > now);
    saved
        .into_iter()
        .filter(|(k, _)| k.starts_with("claude:"))
        .filter_map(|(k, mut l)| {
            l.five_hour = live(l.five_hour.take());
            l.weekly = live(l.weekly.take());
            (l.five_hour.is_some() || l.weekly.is_some()).then_some((k, l))
        })
        .collect()
}

pub fn load_persisted(store: &AgentLimitsStore) {
    let now = now_secs();
    for (k, l) in load_claude_at(&limits_path(), now) {
        store.set(&k, l, now, false);
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
            ..Default::default()
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
    let now = now_secs();
    let Some(limits) = parse_codex_file(&path, now, now_millis()) else {
        return;
    };
    if store.set("codex", limits, now, false) {
        emit_snapshot(app, store);
    }
}

/// Initial scan + a recursive notify watcher on ~/.codex/sessions. Non-fatal on
/// failure (logged), matching configwatch::start. Coalesces event bursts. All
/// filesystem work runs off the UI thread.
pub fn start(app: AppHandle) {
    let store = app.state::<Arc<AgentLimitsStore>>().inner().clone();
    load_persisted(&store);
    emit_snapshot(&app, &store);

    let dir = codex_sessions_dir();
    if !dir.exists() {
        // No Codex yet: still do the one-shot scan in case the dir appears later
        // is out of scope; nothing to watch, so return quietly.
        let (a, s) = (app.clone(), store.clone());
        std::thread::spawn(move || refresh_codex(&a, &s));
        return;
    }
    let (tx, rx) = sync_channel::<()>(1);
    let mut watcher =
        match notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            // refresh_codex read_dir's every directory in this watched tree and
            // opens the newest rollout — all opens, all of which would land back
            // here and refresh again.
            if res.is_ok_and(|ev| !crate::watchfilter::is_read_only(&ev)) {
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
            ..Default::default()
        })
    };
    let five = window("five_hour");
    let seven = window("seven_day");
    if five.is_none() && seven.is_none() {
        return None;
    }
    Some((five, seven))
}

fn claude_model_label(payload: &Value) -> Option<String> {
    payload
        .get("model")
        .and_then(|m| m.get("display_name").or_else(|| m.get("id")))
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

/// Build Claude limits from a full statusline payload, or None when no usable
/// rate_limits are present. `updated_at` injected for testability.
fn parse_claude_payload(
    account_id: &str,
    payload: &Value,
    updated_at: i64,
) -> Option<ProviderLimits> {
    let (five_hour, weekly) = parse_claude_rate_limits(payload)?;
    Some(ProviderLimits {
        provider: "claude".into(),
        account_id: Some(account_id.to_string()),
        label: claude_model_label(payload),
        five_hour,
        weekly,
        updated_at,
        no_limits: false,
    })
}

/// What a report means when it has no usable rate_limits. Claude Code fills
/// them from the headers of every subscription reply, so a session that just
/// got a reply (`fresh`) and still has none belongs to a login with no plan
/// windows. Before the first reply it simply says nothing yet.
fn claude_reading(
    account_id: &str,
    payload: &Value,
    updated_at: i64,
    fresh: bool,
) -> Option<ProviderLimits> {
    parse_claude_payload(account_id, payload, updated_at).or_else(|| {
        fresh.then(|| ProviderLimits {
            provider: "claude".into(),
            account_id: Some(account_id.to_string()),
            label: claude_model_label(payload),
            updated_at,
            no_limits: true,
            ..Default::default()
        })
    })
}

/// Whether this statusline payload reflects an API response its session had not
/// reported yet. Checked even when rate_limits is absent, so a new session's
/// very first response already counts.
fn claude_session_advanced(store: &AgentLimitsStore, payload: &Value, now: i64) -> bool {
    let session_id = payload.get("session_id").and_then(Value::as_str);
    let api_ms = payload
        .get("cost")
        .and_then(|c| c.get("total_api_duration_ms"))
        .and_then(Value::as_f64);
    match (session_id, api_ms) {
        (Some(id), Some(ms)) => store.session_advanced(id, ms as i64, now),
        _ => false,
    }
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
    let now = now_secs();
    let fresh = claude_session_advanced(store, &payload, now);
    if let Some(limits) = claude_reading(account_id, &payload, now_millis(), fresh) {
        let changed = store.set(&claude_store_key(account_id), limits, now, fresh);
        if changed {
            emit_snapshot(app, store);
        }
        if changed || !limits_path().exists() {
            persist_claude(store);
        }
    }
    "OK".into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn claude_readings_round_trip_and_drop_reset_windows() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("agent-limits.json");
        let window = |used_percent: f64, resets_at: i64| LimitWindow {
            used_percent,
            resets_at,
            ..Default::default()
        };
        let mut saved = HashMap::new();
        saved.insert(
            "claude:default".to_string(),
            ProviderLimits {
                provider: "claude".into(),
                account_id: Some("default".into()),
                label: Some("max".into()),
                five_hour: Some(window(40.0, 50)),
                weekly: Some(window(22.0, 5_000)),
                updated_at: 7,
                ..Default::default()
            },
        );
        saved.insert(
            "claude:old".to_string(),
            ProviderLimits {
                provider: "claude".into(),
                five_hour: Some(window(90.0, 10)),
                ..Default::default()
            },
        );
        saved.insert(
            "codex".to_string(),
            ProviderLimits {
                provider: "codex".into(),
                ..Default::default()
            },
        );
        persist_claude_at(&path, &saved).unwrap();

        let loaded = load_claude_at(&path, 100);
        assert_eq!(
            loaded.len(),
            1,
            "the fully reset account and the codex entry are gone"
        );
        let l = &loaded["claude:default"];
        assert!(l.five_hour.is_none(), "the five-hour window had reset");
        assert_eq!(l.weekly.as_ref().unwrap().used_percent, 22.0);
        assert_eq!(l.label.as_deref(), Some("max"));
        assert_eq!(l.updated_at, 7);
        assert!(load_claude_at(&dir.path().join("missing.json"), 100).is_empty());
    }

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

    fn codex_limits(pct: f64, resets_at: i64, updated: i64) -> ProviderLimits {
        ProviderLimits {
            provider: "codex".into(),
            five_hour: Some(LimitWindow {
                used_percent: pct,
                resets_at,
                ..Default::default()
            }),
            updated_at: updated,
            ..Default::default()
        }
    }

    #[test]
    fn store_set_reports_meaningful_change_only() {
        let s = AgentLimitsStore::new();
        assert!(
            s.set("codex", codex_limits(10.0, 1, 1), 0, false),
            "first insert changes"
        );
        assert!(
            !s.set("codex", codex_limits(10.0, 1, 999), 0, false),
            "same values, newer timestamp -> no emit"
        );
        assert!(
            s.set("codex", codex_limits(20.0, 1, 1000), 0, false),
            "percent change -> emit"
        );
        // updated_at still advanced in the store.
        assert_eq!(s.snapshot().get("codex").unwrap().updated_at, 1000);
    }

    fn claude_limits(five: Option<f64>, weekly: Option<f64>, resets_at: i64) -> ProviderLimits {
        ProviderLimits {
            provider: "claude".into(),
            account_id: Some("default".into()),
            five_hour: five.map(|used_percent| LimitWindow {
                used_percent,
                resets_at,
                ..Default::default()
            }),
            weekly: weekly.map(|used_percent| LimitWindow {
                used_percent,
                resets_at: resets_at + 100,
                ..Default::default()
            }),
            updated_at: 0,
            ..Default::default()
        }
    }

    #[test]
    fn idle_session_snapshot_never_walks_a_meter_backwards() {
        // Every concurrent Claude session forwards its own last-seen snapshot
        // under the same account key; the idle one is behind and must not win.
        let s = AgentLimitsStore::new();
        s.set(
            "claude:default",
            claude_limits(Some(36.0), Some(51.0), 9_000),
            0,
            false,
        );
        assert!(
            !s.set(
                "claude:default",
                claude_limits(Some(25.0), Some(48.0), 9_000),
                0,
                false
            ),
            "stale reading changes nothing -> no emit"
        );
        let stored = s.snapshot();
        let stored = stored.get("claude:default").unwrap();
        assert_eq!(stored.five_hour.as_ref().unwrap().used_percent, 36.0);
        assert_eq!(stored.weekly.as_ref().unwrap().used_percent, 51.0);
    }

    #[test]
    fn window_reset_is_adopted_even_though_percent_drops() {
        let s = AgentLimitsStore::new();
        s.set(
            "claude:default",
            claude_limits(Some(96.0), None, 9_000),
            0,
            false,
        );
        assert!(s.set(
            "claude:default",
            claude_limits(Some(2.0), None, 27_000),
            0,
            false
        ));
        let stored = s.snapshot();
        let five = stored
            .get("claude:default")
            .unwrap()
            .five_hour
            .clone()
            .unwrap();
        assert_eq!(five.used_percent, 2.0);
        assert_eq!(five.resets_at, 27_000);
    }

    #[test]
    fn omitted_window_is_kept_until_it_resets() {
        // Codex rollout lines often carry only one of the two windows.
        let s = AgentLimitsStore::new();
        s.set("codex", codex_limits(40.0, 9_000, 0), 0, false);
        let weekly_only = || ProviderLimits {
            provider: "codex".into(),
            weekly: Some(LimitWindow {
                used_percent: 32.0,
                resets_at: 500_000,
                ..Default::default()
            }),
            ..Default::default()
        };
        s.set("codex", weekly_only(), 8_000, false);
        assert_eq!(
            s.snapshot()
                .get("codex")
                .unwrap()
                .five_hour
                .as_ref()
                .unwrap()
                .used_percent,
            40.0,
            "5-hour survives a weekly-only report"
        );
        // Past its reset the retained window is meaningless, so it drops out.
        s.set("codex", weekly_only(), 9_001, false);
        let stored = s.snapshot();
        let stored = stored.get("codex").unwrap();
        assert!(stored.five_hour.is_none(), "expired window is not kept");
        assert_eq!(stored.weekly.as_ref().unwrap().used_percent, 32.0);
    }

    #[test]
    fn stale_report_does_not_steal_the_model_badge() {
        // Sessions run different models; the badge follows whichever session's
        // reading we are actually showing.
        let s = AgentLimitsStore::new();
        let mut fresh = claude_limits(Some(36.0), None, 9_000);
        fresh.label = Some("Opus 5".into());
        s.set("claude:default", fresh, 0, false);
        let mut stale = claude_limits(Some(25.0), None, 9_000);
        stale.label = Some("Fable 5".into());
        assert!(
            !s.set("claude:default", stale, 0, false),
            "no emit for a stale report"
        );
        assert_eq!(
            s.snapshot().get("claude:default").unwrap().label.as_deref(),
            Some("Opus 5")
        );
    }

    #[test]
    fn mid_window_reset_is_adopted_from_a_session_that_just_got_a_response() {
        // The provider can zero usage without moving `resets_at`; only a reading
        // from a session whose API time advanced may walk the meter back.
        let s = AgentLimitsStore::new();
        s.set(
            "claude:default",
            claude_limits(None, Some(61.0), 9_000),
            0,
            false,
        );
        assert!(
            !s.session_advanced("a", 5_000, 0),
            "first report only sets the mark"
        );
        assert!(!s.set(
            "claude:default",
            claude_limits(None, Some(0.0), 9_000),
            0,
            false
        ));
        assert!(!s.session_advanced("a", 5_000, 30), "idle replay");
        assert!(s.session_advanced("a", 6_200, 60), "a response landed");
        assert!(s.set(
            "claude:default",
            claude_limits(None, Some(0.0), 9_000),
            60,
            true
        ));
        let stored = s.snapshot();
        let weekly = stored
            .get("claude:default")
            .unwrap()
            .weekly
            .clone()
            .unwrap();
        assert_eq!(weekly.used_percent, 0.0);
    }

    #[test]
    fn replay_from_before_a_reset_cannot_undo_a_live_response() {
        // Sessions idle since before the reset keep replaying 61% for the same
        // window every refresh; the live 0% must hold instead of flip-flopping.
        let s = AgentLimitsStore::new();
        let weekly = |s: &AgentLimitsStore| {
            s.snapshot()["claude:default"]
                .weekly
                .as_ref()
                .unwrap()
                .used_percent
        };
        s.set(
            "claude:default",
            claude_limits(None, Some(0.0), 9_000),
            0,
            true,
        );
        assert!(!s.set(
            "claude:default",
            claude_limits(None, Some(61.0), 9_000),
            30,
            false
        ));
        assert_eq!(weekly(&s), 0.0);
        // A reset that moved the window earlier: the replay's later `resets_at`
        // still doesn't beat the live reading while that reading's window runs.
        assert!(!s.set(
            "claude:default",
            claude_limits(None, Some(61.0), 50_000),
            30,
            false
        ));
        assert_eq!(weekly(&s), 0.0);
        // Once the live window has run out, a later window is welcome again.
        assert!(s.set(
            "claude:default",
            claude_limits(None, Some(4.0), 50_000),
            9_200,
            false
        ));
        assert_eq!(weekly(&s), 4.0);
    }

    #[test]
    fn session_marks_expire() {
        let s = AgentLimitsStore::new();
        s.session_advanced("a", 1_000, 0);
        s.session_advanced("b", 1_000, SESSION_MARK_TTL_SECS);
        assert!(
            !s.session_advanced("a", 2_000, SESSION_MARK_TTL_SECS),
            "a's mark was pruned, so this is a first report again"
        );
        assert_eq!(s.sessions.lock().unwrap().len(), 2);
    }

    #[test]
    fn claude_new_session_first_response_counts_as_fresh() {
        let s = AgentLimitsStore::new();
        let before: Value =
            serde_json::from_str(r#"{"session_id":"x","cost":{"total_api_duration_ms":0}}"#)
                .unwrap();
        let after: Value =
            serde_json::from_str(r#"{"session_id":"x","cost":{"total_api_duration_ms":1638}}"#)
                .unwrap();
        let no_cost: Value = serde_json::from_str(r#"{"session_id":"y"}"#).unwrap();
        assert!(!claude_session_advanced(&s, &before, 0));
        assert!(claude_session_advanced(&s, &after, 1));
        assert!(!claude_session_advanced(&s, &after, 2));
        assert!(!claude_session_advanced(&s, &no_cost, 3));
    }

    #[test]
    fn reply_without_rate_limits_marks_the_account_as_having_none() {
        let payload: Value = serde_json::from_str(r#"{"model":{"display_name":"Opus"}}"#).unwrap();
        assert!(
            claude_reading("work", &payload, 5, false).is_none(),
            "no reply yet says nothing"
        );
        let l = claude_reading("work", &payload, 5, true).unwrap();
        assert!(l.no_limits);
        assert!(l.five_hour.is_none() && l.weekly.is_none());
        assert_eq!(l.account_id.as_deref(), Some("work"));
        assert_eq!(l.label.as_deref(), Some("Opus"));
        let json = serde_json::to_value(&l).unwrap();
        assert_eq!(json["noLimits"], true);
        assert!(serde_json::to_value(claude_limits(Some(1.0), None, 10))
            .unwrap()
            .get("noLimits")
            .is_none());
    }

    #[test]
    fn no_limits_never_hides_real_windows() {
        let s = AgentLimitsStore::new();
        let none = || ProviderLimits {
            provider: "claude".into(),
            account_id: Some("default".into()),
            no_limits: true,
            ..Default::default()
        };
        s.set(
            "claude:default",
            claude_limits(Some(10.0), None, 1_000),
            0,
            false,
        );
        s.set("claude:default", none(), 1, true);
        let kept = &s.snapshot()["claude:default"];
        assert!(!kept.no_limits, "live windows outrank the flag");
        assert_eq!(kept.five_hour.as_ref().unwrap().used_percent, 10.0);

        s.set("claude:api", none(), 0, true);
        assert!(s.snapshot()["claude:api"].no_limits);
        assert!(
            s.set("claude:api", claude_limits(Some(3.0), None, 1_000), 1, true),
            "a first real reading clears the flag"
        );
        assert!(!s.snapshot()["claude:api"].no_limits);
    }
}
