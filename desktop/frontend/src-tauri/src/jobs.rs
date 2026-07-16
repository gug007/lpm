// Scheduled jobs: per-project tasks that fire on a schedule, optionally run a
// cheap `check`, and — when there is work — optionally duplicate the project and
// run a command / action / agent prompt in the copy. The scheduler is a plain
// wall-clock thread modelled on updates::start_auto_check so it survives sleep,
// and the pipeline runs on worker threads so one slow job never stalls the tick.
use crate::config;
use chrono::{Datelike, TimeZone};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashSet};
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

const TICK: Duration = Duration::from_secs(60);
const MIN_INTERVAL_SECS: u64 = 3600;
const STALE_LOCK_SECS: u64 = 6 * 3600;
const CHECK_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const HISTORY_CAP: usize = 20;
const MAX_JITTER_SECS: u64 = 5 * 60;
const OUTPUT_CAP_CHARS: usize = 12_000;

const NOTHING_TO_DO: &str = "nothing-to-do";
const FOUND_WORK: &str = "found-work";
const COMPLETED: &str = "completed";
const ERROR: &str = "error";
const SKIPPED_OVERLAP: &str = "skipped-overlap";
const SKIPPED_PENDING_COPY: &str = "skipped-pending-copy";
const PENDING_WINDOW: &str = "pending-window";

const DAY_NAMES: [&str; 7] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// ---- config parsing ---------------------------------------------------------

#[derive(Deserialize, Default)]
struct JobsYaml {
    #[serde(default)]
    jobs: BTreeMap<String, JobDef>,
}

#[derive(Deserialize, Default, Clone)]
struct JobDef {
    #[serde(default)]
    label: String,
    #[serde(default)]
    emoji: String,
    schedule: Option<ScheduleDef>,
    #[serde(default)]
    check: String,
    #[serde(default)]
    duplicate: bool,
    run: Option<RunDef>,
    enabled: Option<bool>,
}

#[derive(Deserialize, Default, Clone)]
struct ScheduleDef {
    #[serde(default)]
    at: String,
    #[serde(default)]
    days: Vec<String>,
    every: Option<EveryValue>,
}

/// `every: 6h` / `every: 2d` (string with an h/d suffix) or a bare integer read
/// as hours — both collapse to a whole number of seconds.
#[derive(Deserialize, Clone)]
#[serde(untagged)]
enum EveryValue {
    Int(i64),
    Str(String),
}

#[derive(Deserialize, Default, Clone)]
struct RunDef {
    #[serde(default)]
    action: String,
    #[serde(default)]
    cmd: String,
    #[serde(default)]
    prompt: String,
    #[serde(default)]
    agent: String,
    #[serde(default)]
    model: String,
    #[serde(default)]
    effort: String,
}

const KNOWN_AGENTS: [&str; 4] = ["claude", "codex", "gemini", "opencode"];

#[derive(Clone, Debug, PartialEq)]
enum Schedule {
    Interval { secs: u64 },
    /// `at_min` is minutes since local midnight; `days` are weekday numbers
    /// (0 = Mon .. 6 = Sun), empty meaning every day.
    Calendar { at_min: u32, days: Vec<u8> },
}

#[derive(Clone, Debug, PartialEq)]
enum RunTarget {
    Action(String),
    Cmd(String),
    Prompt { prompt: String, agent: String, model: String, effort: String },
}

struct JobResolved {
    id: String,
    label: String,
    emoji: String,
    schedule: Schedule,
    check: String,
    duplicate: bool,
    run: RunTarget,
    enabled: bool,
}

fn parse_every_secs(v: &EveryValue) -> Result<u64, String> {
    let secs = match v {
        EveryValue::Int(h) => {
            if *h <= 0 {
                return Err("The interval must be at least 1 hour.".into());
            }
            (*h as u64) * 3600
        }
        EveryValue::Str(s) => {
            let s = s.trim().to_lowercase();
            let (num, mult) = if let Some(n) = s.strip_suffix('h') {
                (n.trim(), 3600u64)
            } else if let Some(n) = s.strip_suffix('d') {
                (n.trim(), 86_400u64)
            } else {
                (s.as_str(), 3600u64)
            };
            let n: u64 = num.parse().map_err(|_| "The interval isn't a valid length.".to_string())?;
            n.checked_mul(mult).ok_or_else(|| "The interval is too large.".to_string())?
        }
    };
    if secs < MIN_INTERVAL_SECS {
        return Err("The interval must be at least 1 hour.".into());
    }
    Ok(secs)
}

fn parse_at_minutes(at: &str) -> Result<u32, String> {
    let bad = || "Use a time like 09:00.".to_string();
    let (h, m) = at.split_once(':').ok_or_else(bad)?;
    let h: u32 = h.trim().parse().map_err(|_| bad())?;
    let m: u32 = m.trim().parse().map_err(|_| bad())?;
    if h > 23 || m > 59 {
        return Err(bad());
    }
    Ok(h * 60 + m)
}

fn parse_day(d: &str) -> Result<u8, String> {
    let d = d.trim().to_lowercase();
    DAY_NAMES
        .iter()
        .position(|n| *n == d)
        .map(|i| i as u8)
        .ok_or_else(|| format!("\"{d}\" isn't a valid day."))
}

fn resolve_schedule(sched: &ScheduleDef) -> Result<Schedule, String> {
    let has_at = !sched.at.trim().is_empty();
    let has_every = sched.every.is_some();
    match (has_at, has_every) {
        (true, false) => {
            let at_min = parse_at_minutes(sched.at.trim())?;
            let mut days: Vec<u8> = Vec::new();
            for d in &sched.days {
                let n = parse_day(d)?;
                if !days.contains(&n) {
                    days.push(n);
                }
            }
            Ok(Schedule::Calendar { at_min, days })
        }
        (false, true) => Ok(Schedule::Interval {
            secs: parse_every_secs(sched.every.as_ref().unwrap())?,
        }),
        (false, false) => Err("Give this job a time or an interval.".into()),
        (true, true) => Err("Give this job either a time or an interval, not both.".into()),
    }
}

fn resolve_run(project: &str, run: &RunDef) -> Result<RunTarget, String> {
    let action = run.action.trim();
    let cmd = run.cmd.trim();
    let prompt = run.prompt.trim();
    let count = [!action.is_empty(), !cmd.is_empty(), !prompt.is_empty()]
        .iter()
        .filter(|b| **b)
        .count();
    if count == 0 {
        return Err("Give this job an action, a command, or a prompt to run.".into());
    }
    if count > 1 {
        return Err("A job can run only one of an action, a command, or a prompt.".into());
    }
    if !action.is_empty() {
        if config::resolve_action_full(project, action).is_none() {
            return Err(format!("The action \"{action}\" doesn't exist in this project."));
        }
        return Ok(RunTarget::Action(action.to_string()));
    }
    if !cmd.is_empty() {
        return Ok(RunTarget::Cmd(cmd.to_string()));
    }
    let agent = run.agent.trim().to_lowercase();
    if !agent.is_empty() && !KNOWN_AGENTS.contains(&agent.as_str()) {
        return Err(format!("\"{agent}\" isn't an agent lpm knows how to run."));
    }
    Ok(RunTarget::Prompt {
        prompt: prompt.to_string(),
        agent,
        model: run.model.trim().to_string(),
        effort: run.effort.trim().to_lowercase(),
    })
}

fn resolve_job(project: &str, id: &str, def: &JobDef) -> Result<JobResolved, String> {
    let sched = def.schedule.as_ref().ok_or_else(|| "Give this job a schedule.".to_string())?;
    let schedule = resolve_schedule(sched)?;
    let run = def.run.as_ref().ok_or_else(|| "Give this job something to run.".to_string())?;
    let run = resolve_run(project, run)?;
    Ok(JobResolved {
        id: id.to_string(),
        label: if def.label.trim().is_empty() { id.to_string() } else { def.label.clone() },
        emoji: def.emoji.clone(),
        schedule,
        check: def.check.trim().to_string(),
        duplicate: def.duplicate,
        run,
        enabled: def.enabled.unwrap_or(true),
    })
}

fn load_jobs_yaml(path: &Path) -> BTreeMap<String, JobDef> {
    std::fs::read(path)
        .ok()
        .and_then(|b| serde_yaml::from_slice::<JobsYaml>(&b).ok())
        .map(|y| y.jobs)
        .unwrap_or_default()
}

const SOURCE_PROJECT: &str = "project";
const SOURCE_REPO: &str = "repo";
const SOURCE_GLOBAL: &str = "global";

fn merge_job_defs(
    registry: BTreeMap<String, JobDef>,
    repo: BTreeMap<String, JobDef>,
    global: BTreeMap<String, JobDef>,
) -> BTreeMap<String, (JobDef, &'static str)> {
    let mut out: BTreeMap<String, (JobDef, &'static str)> =
        global.into_iter().map(|(k, v)| (k, (v, SOURCE_GLOBAL))).collect();
    for (k, v) in repo {
        out.insert(k, (v, SOURCE_REPO));
    }
    for (k, v) in registry {
        out.insert(k, (v, SOURCE_PROJECT));
    }
    out
}

/// Layering: project registry file > repo `.lpm.yml` > `~/.lpm/global.yml`, a
/// job id in a higher layer taking that definition wholesale. Duplicate-created
/// projects only use their own registry layer — a shared job that duplicates
/// would otherwise fire on the very copies it creates and breed copies of
/// copies (the repo layer travels with the cloned tree, the global layer is
/// everywhere).
fn resolve_jobs(project: &str) -> Vec<(String, &'static str, Result<JobResolved, String>)> {
    let root_info = config::project_root(project).ok();
    let is_remote = root_info.as_ref().map(|(_, r)| *r).unwrap_or(false);
    let is_duplicate = config::peek_parent(project).is_some();

    let registry = load_jobs_yaml(&config::project_path(project));
    let repo = match &root_info {
        Some((root, false)) if !root.is_empty() && !is_duplicate => {
            load_jobs_yaml(&Path::new(root).join(".lpm.yml"))
        }
        _ => BTreeMap::new(),
    };
    let global = if is_duplicate {
        BTreeMap::new()
    } else {
        load_jobs_yaml(&config::global_path())
    };

    merge_job_defs(registry, repo, global)
        .into_iter()
        .map(|(id, (def, source))| {
            let r = if is_remote {
                Err("Scheduled jobs aren't available on SSH projects.".to_string())
            } else {
                resolve_job(project, &id, &def)
            };
            (id, source, r)
        })
        .collect()
}

// ---- scheduling math --------------------------------------------------------

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// A stable 0–5 minute offset per job so jobs sharing a fire point (e.g. every
/// 09:00 job) don't all run in the same tick. FNV-1a over "<project>/<jobId>".
fn jitter_secs(project: &str, job_id: &str) -> u64 {
    let key = format!("{project}/{job_id}");
    let mut h: u64 = 0xcbf29ce484222325;
    for b in key.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h % (MAX_JITTER_SECS + 1)
}

fn day_ok(date: chrono::NaiveDate, days: &[u8]) -> bool {
    days.is_empty() || days.contains(&(date.weekday().num_days_from_monday() as u8))
}

fn local_epoch(date: chrono::NaiveDate, at_min: u32) -> Option<i64> {
    let t = chrono::NaiveTime::from_hms_opt(at_min / 60, at_min % 60, 0)?;
    chrono::Local
        .from_local_datetime(&date.and_time(t))
        .single()
        .map(|dt| dt.timestamp())
}

fn most_recent_calendar_occurrence(at_min: u32, days: &[u8], now: i64) -> Option<i64> {
    let today = chrono::Local.timestamp_opt(now, 0).single()?.date_naive();
    for back in 0..8i64 {
        let d = today - chrono::Duration::days(back);
        if !day_ok(d, days) {
            continue;
        }
        if let Some(e) = local_epoch(d, at_min) {
            if e <= now {
                return Some(e);
            }
        }
    }
    None
}

fn next_calendar_occurrence(at_min: u32, days: &[u8], now: i64) -> Option<i64> {
    let today = chrono::Local.timestamp_opt(now, 0).single()?.date_naive();
    for fwd in 0..8i64 {
        let d = today + chrono::Duration::days(fwd);
        if !day_ok(d, days) {
            continue;
        }
        if let Some(e) = local_epoch(d, at_min) {
            if e > now {
                return Some(e);
            }
        }
    }
    None
}

/// Interval jobs are due once `secs` (plus jitter) have elapsed since the last
/// run. Calendar jobs are due when the most recent scheduled occurrence is
/// strictly later than the last run — coalescing any number of occurrences
/// missed while the app was closed into a single run.
fn is_due(schedule: &Schedule, last_run: u64, now: u64, jitter: u64) -> bool {
    match schedule {
        Schedule::Interval { secs } => now.saturating_sub(last_run) >= secs + jitter,
        Schedule::Calendar { at_min, days } => {
            match most_recent_calendar_occurrence(*at_min, days, now as i64) {
                Some(occ) => (occ as u64) > last_run && now >= (occ as u64) + jitter,
                None => false,
            }
        }
    }
}

fn next_fire_at(schedule: &Schedule, last_run: u64, jitter: u64, now: u64) -> Option<i64> {
    match schedule {
        Schedule::Interval { secs } => Some((last_run + secs + jitter) as i64),
        Schedule::Calendar { at_min, days } => {
            next_calendar_occurrence(*at_min, days, now as i64).map(|o| o + jitter as i64)
        }
    }
}

// ---- persisted state (~/.lpm/jobs-state.json) -------------------------------

#[derive(Serialize, Deserialize, Default, Clone)]
struct JobState {
    #[serde(default, rename = "lastRunAt", skip_serializing_if = "Option::is_none")]
    last_run_at: Option<u64>,
    #[serde(default)]
    history: Vec<HistoryEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    running: Option<RunningLock>,
    #[serde(default, rename = "pendingTask", skip_serializing_if = "Option::is_none")]
    pending_task: Option<Value>,
    #[serde(default, rename = "enabledOverride", skip_serializing_if = "Option::is_none")]
    enabled_override: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone)]
struct HistoryEntry {
    at: u64,
    result: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    copy: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    output: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct RunningLock {
    #[serde(rename = "startedAt")]
    started_at: u64,
}

#[derive(Serialize, Deserialize, Default)]
struct JobsStateFile {
    #[serde(default)]
    jobs: BTreeMap<String, JobState>,
}

fn state_path() -> PathBuf {
    config::lpm_dir().join("jobs-state.json")
}

fn state_key(project: &str, job_id: &str) -> String {
    format!("{project}/{job_id}")
}

fn state_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn load_state_file() -> JobsStateFile {
    std::fs::read(state_path())
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

fn save_state_file(f: &JobsStateFile) -> Result<(), String> {
    std::fs::create_dir_all(config::lpm_dir()).map_err(|e| e.to_string())?;
    let data = serde_json::to_vec_pretty(f).map_err(|e| e.to_string())?;
    let tmp = state_path().with_extension("json.tmp");
    std::fs::write(&tmp, data).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, state_path()).map_err(|e| e.to_string())
}

/// Serialize every read-modify-write of the state file behind one lock so
/// concurrent worker threads can't clobber each other's history.
fn with_state<T>(f: impl FnOnce(&mut JobsStateFile) -> T) -> Result<T, String> {
    let _g = state_lock().lock().unwrap();
    let mut file = load_state_file();
    let out = f(&mut file);
    save_state_file(&file)?;
    Ok(out)
}

fn load_job_state(key: &str) -> JobState {
    let _g = state_lock().lock().unwrap();
    load_state_file().jobs.get(key).cloned().unwrap_or_default()
}

fn is_skip(result: &str) -> bool {
    matches!(result, SKIPPED_OVERLAP | SKIPPED_PENDING_COPY)
}

/// Append a history entry, capped at the newest `HISTORY_CAP`. Consecutive
/// identical skip results collapse into one (a job that stays blocked ticks
/// every minute; without this the real history would scroll off in 20 minutes).
fn push_history(st: &mut JobState, at: u64, result: &str, copy: Option<String>) {
    push_history_out(st, at, result, copy, None);
}

fn push_history_out(
    st: &mut JobState,
    at: u64,
    result: &str,
    copy: Option<String>,
    output: Option<String>,
) {
    if is_skip(result) {
        if let Some(last) = st.history.last_mut() {
            if last.result == result {
                last.at = at;
                last.copy = copy;
                return;
            }
        }
    }
    st.history.push(HistoryEntry { at, result: result.to_string(), copy, output });
    let overflow = st.history.len().saturating_sub(HISTORY_CAP);
    if overflow > 0 {
        st.history.drain(0..overflow);
    }
}

enum LockDecision {
    Acquire,
    Busy,
    Stale,
}

fn evaluate_lock(running: &Option<RunningLock>, now: u64) -> LockDecision {
    match running {
        None => LockDecision::Acquire,
        Some(lock) if now.saturating_sub(lock.started_at) < STALE_LOCK_SECS => LockDecision::Busy,
        Some(_) => LockDecision::Stale,
    }
}

// ---- pipeline ---------------------------------------------------------------

/// In-process guard so a job already running on a worker thread isn't respawned
/// by the next tick. The persisted `running` lock covers overlap across app
/// restarts / other instances; this one just prevents per-tick spam.
fn inflight() -> &'static Mutex<HashSet<String>> {
    static SET: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    SET.get_or_init(|| Mutex::new(HashSet::new()))
}

fn mark_inflight(key: &str) -> bool {
    inflight().lock().unwrap().insert(key.to_string())
}

fn clear_inflight(key: &str) {
    inflight().lock().unwrap().remove(key);
}

struct Outcome {
    result: &'static str,
    copy: Option<String>,
    advance: bool,
}

fn err_outcome() -> Outcome {
    Outcome { result: ERROR, copy: None, advance: true }
}

enum Dispatch {
    Ran,
    Parked,
    Error,
}

fn duplicate_defaults() -> (bool, bool, bool) {
    let s = config::load_settings();
    let b = |k: &str, d: bool| s.get(k).and_then(Value::as_bool).unwrap_or(d);
    (
        b("duplicateExcludeUncommitted", false),
        b("duplicateReinstallDeps", false),
        b("duplicatePullLatest", true),
    )
}

/// The same interactive-login-shell wrapper actions use, run headless with all
/// streams detached and its own session (so an app launched from a terminal
/// doesn't stop the shell with SIGTTIN).
fn shell_command(cwd: &str, cmd: &str) -> Command {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let script = format!("cd {} && {}", config::shell_quote(cwd), cmd);
    let mut c = Command::new(shell);
    c.arg("-ilc").arg(script).current_dir(cwd);
    c.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    unsafe {
        c.pre_exec(|| {
            if libc::setsid() == -1 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
    c
}

/// Exit 0 = there is work to do; any non-zero exit = nothing to do. A spawn
/// failure or a timeout is surfaced as an error. A hung check would otherwise
/// pin the worker thread and its in-process inflight slot forever; on expiry we
/// SIGKILL the whole process group (setsid makes pgid == the child's pid).
fn run_check(root: &str, check: &str, timeout: Duration) -> Result<bool, String> {
    let mut child = shell_command(root, check).spawn().map_err(|e| e.to_string())?;
    let pid = child.id() as i32;
    let deadline = std::time::Instant::now() + timeout;
    loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(status) => return Ok(status.success()),
            None if std::time::Instant::now() >= deadline => {
                unsafe {
                    libc::kill(-pid, libc::SIGKILL);
                }
                let _ = child.wait();
                return Err("check timed out".into());
            }
            None => std::thread::sleep(Duration::from_millis(100)),
        }
    }
}

/// A job-created copy has never been visited, so its ProjectDetail isn't mounted
/// and a queued task would sit forever — `select: true` mounts it so the task
/// fires (mirrors socketsrv.rs's duplicate relay).
fn emit_or_park(app: &AppHandle, key: &str, target: &str, task: Value) -> Dispatch {
    let payload = json!({ "project": target, "task": task, "select": true });
    if app.get_webview_window("main").is_some() {
        let _ = app.emit("remote-run-task", payload);
        Dispatch::Ran
    } else {
        let _ = with_state(|f| {
            f.jobs.entry(key.to_string()).or_default().pending_task = Some(payload);
        });
        Dispatch::Parked
    }
}

fn default_ai_cli() -> String {
    config::load_settings()
        .get("aiCli")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .unwrap_or("claude")
        .to_string()
}

/// The agent's non-interactive mode, so a scheduled prompt runs headless like
/// Codex automations do — no terminal opens in the project and no window is
/// needed; the run's output is reviewed from the Scheduled view afterwards.
fn agent_prompt_cmdline(agent: &str, model: &str, effort: &str, prompt: &str) -> String {
    let q = config::shell_quote(prompt);
    let m = config::shell_quote(model);
    let e = config::shell_quote(effort);
    match agent {
        // Codex takes reasoning effort as a `-c model_reasoning_effort=…` config.
        "codex" => {
            let model_arg = if model.is_empty() { String::new() } else { format!(" -m {m}") };
            let effort_arg = if effort.is_empty() {
                String::new()
            } else {
                format!(" -c model_reasoning_effort={e}")
            };
            format!("codex exec{model_arg}{effort_arg} {q}")
        }
        // Gemini/OpenCode have no effort control.
        "gemini" => {
            if model.is_empty() {
                format!("gemini -p {q}")
            } else {
                format!("gemini -m {m} -p {q}")
            }
        }
        "opencode" => {
            if model.is_empty() {
                format!("opencode run {q}")
            } else {
                format!("opencode run --model {m} {q}")
            }
        }
        // Claude Code takes reasoning effort via `--effort`.
        _ => {
            let model_arg = if model.is_empty() { String::new() } else { format!(" --model {m}") };
            let effort_arg = if effort.is_empty() { String::new() } else { format!(" --effort {e}") };
            format!("claude{model_arg}{effort_arg} -p --output-format json {q}")
        }
    }
}

/// Claude's json output mode wraps the final message in a single-line JSON
/// object with a `result` field; hooks and stats the user has configured can
/// splatter extra lines around it. Scan from the end for that object so the
/// feed shows the clean message, not the raw stream.
fn extract_result_text(raw: &str) -> Option<String> {
    for line in raw.lines().rev() {
        let line = line.trim();
        if !line.starts_with('{') {
            continue;
        }
        if let Ok(v) = serde_json::from_str::<Value>(line) {
            if let Some(result) = v.get("result").and_then(Value::as_str) {
                let result = result.trim();
                if !result.is_empty() {
                    return Some(result.to_string());
                }
            }
        }
    }
    None
}

fn tail_chars(s: &str, max: usize) -> String {
    let count = s.chars().count();
    if count <= max {
        return s.trim_end().to_string();
    }
    s.chars().skip(count - max).collect::<String>().trim_end().to_string()
}

/// An agent's final message reads top-down, so when it exceeds the cap keep the
/// head (a raw log keeps its tail instead — failures live at the end).
fn head_chars(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.trim_end().to_string();
    }
    let mut out: String = s.chars().take(max).collect();
    out = out.trim_end().to_string();
    out.push_str("\n\n… (truncated — the full output is in ~/.lpm/job-logs)");
    out
}

/// Run a command headless in `root` with output streamed to a log file under
/// ~/.lpm/job-logs; a watcher thread reaps the exit off the job lock and
/// records a completion entry with the output tail, so the run's result is
/// reviewable from the Scheduled view instead of vanishing.
fn spawn_captured(app: &AppHandle, key: &str, root: &str, cmdline: &str) -> Dispatch {
    let logs = config::lpm_dir().join("job-logs");
    if std::fs::create_dir_all(&logs).is_err() {
        return Dispatch::Error;
    }
    let log_path = logs.join(format!("{}-{}.log", key.replace('/', "_"), now_secs()));
    let full = format!(
        "{{ {cmdline} ; }} > {} 2>&1",
        config::shell_quote(&log_path.to_string_lossy())
    );
    match shell_command(root, &full).spawn() {
        Ok(mut child) => {
            let app2 = app.clone();
            let key2 = key.to_string();
            std::thread::spawn(move || {
                let ok = child.wait().map(|s| s.success()).unwrap_or(false);
                let output = std::fs::read_to_string(&log_path)
                    .ok()
                    .map(|s| match extract_result_text(&s) {
                        Some(msg) => head_chars(&msg, OUTPUT_CAP_CHARS),
                        None => tail_chars(&s, OUTPUT_CAP_CHARS),
                    })
                    .filter(|s| !s.is_empty());
                let result = if ok { COMPLETED } else { ERROR };
                let at = now_secs();
                let _ = with_state(|f| {
                    push_history_out(f.jobs.entry(key2.clone()).or_default(), at, result, None, output);
                });
                let (project, job_id) = key2.split_once('/').unwrap_or((key2.as_str(), ""));
                emit_status(&app2, project, job_id, result, &None);
            });
            Dispatch::Ran
        }
        Err(_) => Dispatch::Error,
    }
}

fn dispatch_run(app: &AppHandle, key: &str, target: &str, job: &JobResolved) -> Dispatch {
    match &job.run {
        RunTarget::Cmd(cmd) => {
            let root = match config::project_root(target) {
                Ok((r, false)) if !r.is_empty() => r,
                _ => return Dispatch::Error,
            };
            spawn_captured(app, key, &root, cmd)
        }
        RunTarget::Action(id) => {
            let terminal = config::resolve_action_full(target, id)
                .map(|a| a.kind == "terminal")
                .unwrap_or(false);
            if terminal {
                emit_or_park(app, key, target, json!({ "kind": "action", "actionName": id }))
            } else {
                let app2 = app.clone();
                let target2 = target.to_string();
                let id2 = id.clone();
                std::thread::spawn(move || {
                    let run_id = format!("job-{}", now_secs());
                    let _ = crate::actions::run_action_background(
                        app2,
                        target2,
                        id2,
                        std::collections::HashMap::new(),
                        run_id,
                    );
                });
                Dispatch::Ran
            }
        }
        RunTarget::Prompt { prompt, agent, model, effort } => {
            let root = match config::project_root(target) {
                Ok((r, false)) if !r.is_empty() => r,
                _ => return Dispatch::Error,
            };
            let agent = if agent.is_empty() { default_ai_cli() } else { agent.clone() };
            spawn_captured(app, key, &root, &agent_prompt_cmdline(&agent, model, effort, prompt))
        }
    }
}

fn pipeline_body(app: &AppHandle, project: &str, job: &JobResolved, key: &str) -> Outcome {
    let st = load_job_state(key);
    if let Some(prev) = st.history.iter().rev().find_map(|h| h.copy.clone()) {
        if config::project_exists(&prev) {
            return Outcome { result: SKIPPED_PENDING_COPY, copy: None, advance: false };
        }
    }

    let root = match config::project_root(project) {
        Ok((r, false)) if !r.is_empty() => r,
        _ => return err_outcome(),
    };

    if !job.check.is_empty() {
        match run_check(&root, &job.check, CHECK_TIMEOUT) {
            Ok(true) => {}
            Ok(false) => return Outcome { result: NOTHING_TO_DO, copy: None, advance: true },
            Err(_) => return err_outcome(),
        }
    }

    let (target, copy) = if job.duplicate {
        let (excl, reinstall, pull) = duplicate_defaults();
        match crate::projects_crud::duplicate_project(
            app.clone(),
            project.to_string(),
            None,
            excl,
            reinstall,
            pull,
        ) {
            Ok(c) => (c.clone(), Some(c)),
            Err(_) => return err_outcome(),
        }
    } else {
        (project.to_string(), None)
    };

    match dispatch_run(app, key, &target, job) {
        Dispatch::Ran => Outcome { result: FOUND_WORK, copy, advance: true },
        Dispatch::Parked => Outcome { result: PENDING_WINDOW, copy, advance: true },
        Dispatch::Error => Outcome { result: ERROR, copy, advance: true },
    }
}

fn emit_status(app: &AppHandle, project: &str, job_id: &str, result: &str, copy: &Option<String>) {
    let mut payload = json!({ "project": project, "jobId": job_id, "result": result });
    if let Some(c) = copy {
        payload["copy"] = json!(c);
    }
    let _ = app.emit("job-status", payload);
}

fn run_pipeline(app: &AppHandle, project: &str, job: &JobResolved) {
    let key = state_key(project, &job.id);

    let decision = with_state(|f| {
        let st = f.jobs.entry(key.clone()).or_default();
        match evaluate_lock(&st.running, now_secs()) {
            LockDecision::Busy => LockDecision::Busy,
            LockDecision::Acquire => {
                st.running = Some(RunningLock { started_at: now_secs() });
                LockDecision::Acquire
            }
            LockDecision::Stale => {
                push_history(st, now_secs(), ERROR, None);
                st.running = Some(RunningLock { started_at: now_secs() });
                LockDecision::Stale
            }
        }
    })
    .unwrap_or(LockDecision::Acquire);

    if let LockDecision::Busy = decision {
        let _ = with_state(|f| {
            push_history(f.jobs.entry(key.clone()).or_default(), now_secs(), SKIPPED_OVERLAP, None);
        });
        emit_status(app, project, &job.id, SKIPPED_OVERLAP, &None);
        return;
    }

    let outcome = pipeline_body(app, project, job, &key);
    let at = now_secs();
    let _ = with_state(|f| {
        let st = f.jobs.entry(key.clone()).or_default();
        st.running = None;
        push_history(st, at, outcome.result, outcome.copy.clone());
        if outcome.advance {
            st.last_run_at = Some(at);
        }
    });
    emit_status(app, project, &job.id, outcome.result, &outcome.copy);
    if outcome.result == PENDING_WINDOW {
        crate::remote::push_job_found_work(app, project, &job.id);
    }
}

fn spawn_pipeline(app: &AppHandle, project: &str, job: JobResolved) {
    let key = state_key(project, &job.id);
    if !mark_inflight(&key) {
        return;
    }
    let app2 = app.clone();
    let project2 = project.to_string();
    std::thread::spawn(move || {
        run_pipeline(&app2, &project2, &job);
        clear_inflight(&key);
    });
}

// ---- scheduler thread -------------------------------------------------------

fn tick(app: &AppHandle) {
    for project in config::project_names() {
        for (id, _source, res) in resolve_jobs(&project) {
            let Ok(job) = res else { continue };
            let key = state_key(&project, &id);
            let st = load_job_state(&key);

            let last = match st.last_run_at {
                Some(l) => l,
                None => {
                    // First time we've seen this job: anchor it to now so a job
                    // added while the app was closed never fires retroactively.
                    let _ = with_state(|f| {
                        let s = f.jobs.entry(key.clone()).or_default();
                        if s.last_run_at.is_none() {
                            s.last_run_at = Some(now_secs());
                        }
                    });
                    continue;
                }
            };

            if !st.enabled_override.unwrap_or(job.enabled) {
                continue;
            }
            if is_due(&job.schedule, last, now_secs(), jitter_secs(&project, &id)) {
                spawn_pipeline(app, &project, job);
            }
        }
    }
}

pub fn start_scheduler(app: AppHandle) {
    std::thread::spawn(move || loop {
        tick(&app);
        std::thread::sleep(TICK);
    });
}

// ---- commands ---------------------------------------------------------------

fn run_kind(run: &RunTarget) -> &'static str {
    match run {
        RunTarget::Action(_) => "action",
        RunTarget::Cmd(_) => "cmd",
        RunTarget::Prompt { .. } => "prompt",
    }
}

fn schedule_json(schedule: &Schedule) -> Value {
    match schedule {
        Schedule::Interval { secs } => json!({ "mode": "interval", "everySecs": secs }),
        Schedule::Calendar { at_min, days } => {
            let days: Vec<&str> = days.iter().map(|d| DAY_NAMES[*d as usize]).collect();
            json!({ "mode": "calendar", "atMinutes": at_min, "days": days })
        }
    }
}

/// Every project's jobs in one flat list for the app-wide Scheduled view. Each
/// row is the `list_jobs` shape plus the owning `project`.
#[tauri::command(async)]
pub fn list_all_jobs() -> Result<Vec<Value>, String> {
    let mut out: Vec<Value> = Vec::new();
    for project in config::project_names() {
        for mut row in list_jobs(project.clone())? {
            row["project"] = json!(project);
            out.push(row);
        }
    }
    Ok(out)
}

#[tauri::command(async)]
pub fn list_jobs(project: String) -> Result<Vec<Value>, String> {
    let now = now_secs();
    let out = resolve_jobs(&project)
        .into_iter()
        .map(|(id, source, res)| {
            let key = state_key(&project, &id);
            let st = load_job_state(&key);
            match res {
                Ok(job) => {
                    let enabled = st.enabled_override.unwrap_or(job.enabled);
                    let next = st
                        .last_run_at
                        .and_then(|l| next_fire_at(&job.schedule, l, jitter_secs(&project, &id), now));
                    json!({
                        "id": id,
                        "valid": true,
                        "source": source,
                        "label": job.label,
                        "emoji": job.emoji,
                        "enabled": enabled,
                        "duplicate": job.duplicate,
                        "runKind": run_kind(&job.run),
                        "schedule": schedule_json(&job.schedule),
                        "lastRunAt": st.last_run_at,
                        "lastResult": st.history.last().map(|h| h.result.clone()),
                        "nextFireAt": next,
                    })
                }
                Err(e) => json!({
                    "id": id,
                    "valid": false,
                    "source": source,
                    "error": e,
                    "enabled": st.enabled_override.unwrap_or(false),
                }),
            }
        })
        .collect();
    Ok(out)
}

/// Dry-run a job's `check` command from the editor so the user can confirm it
/// signals work the way they expect. Same exit-code contract as the scheduler
/// (0 = work to do), capped at a short timeout so a hung command can't wedge the
/// UI.
#[tauri::command(async)]
pub fn test_job_check(project: String, check: String) -> Result<Value, String> {
    let check = check.trim();
    if check.is_empty() {
        return Err("Add a check command to test it.".into());
    }
    let root = match config::project_root(&project) {
        Ok((r, false)) if !r.is_empty() => r,
        Ok((_, true)) => return Err("Scheduled jobs aren't available on SSH projects.".into()),
        _ => return Err("This project has no local folder to run the check in.".into()),
    };
    let work = run_check(&root, check, Duration::from_secs(60))?;
    Ok(json!({ "work": work }))
}

#[tauri::command(async)]
pub fn run_job_now(app: AppHandle, project: String, job_id: String) -> Result<(), String> {
    let job = resolve_jobs(&project)
        .into_iter()
        .find(|(id, _, _)| *id == job_id)
        .ok_or_else(|| "That job doesn't exist.".to_string())?
        .2?;
    spawn_pipeline(&app, &project, job);
    Ok(())
}

#[tauri::command(async)]
pub fn set_job_enabled(project: String, job_id: String, enabled: bool) -> Result<(), String> {
    with_state(|f| {
        let st = f.jobs.entry(state_key(&project, &job_id)).or_default();
        st.enabled_override = Some(enabled);
        // Re-enabling means "resume from now", never fire for every occurrence
        // missed while it was off.
        if enabled {
            st.last_run_at = Some(now_secs());
        }
    })
}

/// Take every parked `pendingTask` payload out of the state, clearing each in
/// place. Pure over the state file so it's testable without an AppHandle:
/// returns `(state key, payload)` pairs in key order and leaves every
/// `pending_task` empty.
fn collect_pending_tasks(f: &mut JobsStateFile) -> Vec<(String, Value)> {
    f.jobs
        .iter_mut()
        .filter_map(|(key, st)| st.pending_task.take().map(|task| (key.clone(), task)))
        .collect()
}

/// Re-emit every task a job parked while no main window existed. The frontend
/// calls this once at startup, after the `remote-run-task` listener is
/// registered, so a stored payload mounts its copy and runs. A `job-status`
/// event mirrors the drain so the Jobs view refreshes. A no-op when nothing is
/// parked.
#[tauri::command(async)]
pub fn drain_pending_job_tasks(app: AppHandle) -> Result<(), String> {
    let tasks = with_state(collect_pending_tasks)?;
    for (key, payload) in tasks {
        let (project, job_id) = key.split_once('/').unwrap_or((key.as_str(), ""));
        let copy = payload
            .get("project")
            .and_then(Value::as_str)
            .filter(|target| !target.is_empty() && *target != project)
            .map(str::to_string);
        let _ = app.emit("remote-run-task", payload);
        let at = now_secs();
        let _ = with_state(|f| {
            push_history(f.jobs.entry(key.clone()).or_default(), at, FOUND_WORK, copy.clone());
        });
        emit_status(&app, project, job_id, FOUND_WORK, &copy);
    }
    Ok(())
}

#[tauri::command(async)]
pub fn job_history(project: String, job_id: String) -> Result<Vec<Value>, String> {
    let st = load_job_state(&state_key(&project, &job_id));
    Ok(st
        .history
        .iter()
        .map(|h| {
            let mut o = json!({ "at": h.at, "result": h.result });
            if let Some(c) = &h.copy {
                o["copy"] = json!(c);
            }
            if let Some(out) = &h.output {
                o["output"] = json!(out);
            }
            o
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sched(at: &str, days: &[&str], every: Option<EveryValue>) -> ScheduleDef {
        ScheduleDef {
            at: at.to_string(),
            days: days.iter().map(|s| s.to_string()).collect(),
            every,
        }
    }

    #[test]
    fn every_parsing() {
        assert_eq!(parse_every_secs(&EveryValue::Str("6h".into())).unwrap(), 6 * 3600);
        assert_eq!(parse_every_secs(&EveryValue::Str("2d".into())).unwrap(), 2 * 86_400);
        assert_eq!(parse_every_secs(&EveryValue::Str(" 3H ".into())).unwrap(), 3 * 3600);
        assert_eq!(parse_every_secs(&EveryValue::Int(4)).unwrap(), 4 * 3600);
        assert!(parse_every_secs(&EveryValue::Str("30m".into())).is_err());
        assert!(parse_every_secs(&EveryValue::Str("0h".into())).is_err());
        assert!(parse_every_secs(&EveryValue::Int(0)).is_err());
        assert!(parse_every_secs(&EveryValue::Str("nope".into())).is_err());
    }

    #[test]
    fn at_parsing() {
        assert_eq!(parse_at_minutes("09:00").unwrap(), 540);
        assert_eq!(parse_at_minutes("23:59").unwrap(), 23 * 60 + 59);
        assert_eq!(parse_at_minutes("00:00").unwrap(), 0);
        assert!(parse_at_minutes("24:00").is_err());
        assert!(parse_at_minutes("09:60").is_err());
        assert!(parse_at_minutes("9am").is_err());
        assert!(parse_at_minutes("").is_err());
    }

    #[test]
    fn day_parsing() {
        assert_eq!(parse_day("mon").unwrap(), 0);
        assert_eq!(parse_day("SUN").unwrap(), 6);
        assert_eq!(parse_day(" thu ").unwrap(), 3);
        assert!(parse_day("funday").is_err());
    }

    #[test]
    fn schedule_resolution() {
        assert_eq!(
            resolve_schedule(&sched("09:00", &["mon", "thu"], None)).unwrap(),
            Schedule::Calendar { at_min: 540, days: vec![0, 3] },
        );
        assert_eq!(
            resolve_schedule(&sched("", &[], Some(EveryValue::Str("6h".into())))).unwrap(),
            Schedule::Interval { secs: 6 * 3600 },
        );
        // days default to all
        assert_eq!(
            resolve_schedule(&sched("07:30", &[], None)).unwrap(),
            Schedule::Calendar { at_min: 450, days: vec![] },
        );
        // both / neither are errors
        assert!(resolve_schedule(&sched("09:00", &[], Some(EveryValue::Int(6)))).is_err());
        assert!(resolve_schedule(&sched("", &[], None)).is_err());
        // bad day propagates
        assert!(resolve_schedule(&sched("09:00", &["monday"], None)).is_err());
    }

    #[test]
    fn run_resolution() {
        assert_eq!(
            resolve_run("p", &RunDef { cmd: "make".into(), ..Default::default() }).unwrap(),
            RunTarget::Cmd("make".into()),
        );
        assert_eq!(
            resolve_run("p", &RunDef { prompt: "upgrade".into(), ..Default::default() }).unwrap(),
            RunTarget::Prompt {
                prompt: "upgrade".into(),
                agent: String::new(),
                model: String::new(),
                effort: String::new(),
            },
        );
        assert_eq!(
            resolve_run(
                "p",
                &RunDef {
                    prompt: "upgrade".into(),
                    agent: "Codex".into(),
                    model: "gpt-5.6-sol".into(),
                    ..Default::default()
                }
            )
            .unwrap(),
            RunTarget::Prompt {
                prompt: "upgrade".into(),
                agent: "codex".into(),
                model: "gpt-5.6-sol".into(),
                effort: String::new(),
            },
        );
        assert!(resolve_run(
            "p",
            &RunDef { prompt: "x".into(), agent: "cursor".into(), ..Default::default() }
        )
        .is_err());
        // exactly one target required
        assert!(resolve_run("p", &RunDef::default()).is_err());
        assert!(resolve_run(
            "p",
            &RunDef { cmd: "make".into(), prompt: "x".into(), ..Default::default() }
        )
        .is_err());
    }

    #[test]
    fn interval_due_math() {
        let s = Schedule::Interval { secs: 3600 };
        let last = 1_000_000u64;
        // due exactly at the boundary (>= interval)
        assert!(!is_due(&s, last, last + 3599, 0));
        assert!(is_due(&s, last, last + 3600, 0));
        // jitter pushes the boundary out by its own amount
        assert!(!is_due(&s, last, last + 3660, 120));
        assert!(is_due(&s, last, last + 3720, 120));
    }

    #[test]
    fn calendar_due_coalesces_and_never_fires_at_init() {
        // Midnight every day. Its most-recent occurrence is always <= now.
        let s = Schedule::Calendar { at_min: 0, days: vec![] };
        let now = 1_700_000_000i64;
        let occ = most_recent_calendar_occurrence(0, &[], now).unwrap();
        assert!(occ <= now);

        // A long gap (last run 30 days ago) collapses to a single due=true.
        assert!(is_due(&s, (occ as u64).saturating_sub(30 * 86_400), now as u64, 0));
        // Once last_run has caught up to the occurrence, it is no longer due —
        // this is exactly the "anchor lastRunAt = now, never fire at init" case.
        assert!(!is_due(&s, occ as u64, now as u64, 0));
        assert!(!is_due(&s, now as u64, now as u64, 0));
    }

    #[test]
    fn jitter_is_stable_and_bounded() {
        let a = jitter_secs("proj", "dep-updates");
        assert_eq!(a, jitter_secs("proj", "dep-updates"));
        assert!(a <= MAX_JITTER_SECS);
        // different keys generally differ; at minimum the function is total.
        let b = jitter_secs("proj", "other");
        assert!(b <= MAX_JITTER_SECS);
    }

    #[test]
    fn state_round_trips_with_camel_case() {
        let mut file = JobsStateFile::default();
        let st = file.jobs.entry("proj/job".into()).or_default();
        st.last_run_at = Some(42);
        st.enabled_override = Some(false);
        st.running = Some(RunningLock { started_at: 7 });
        push_history(st, 1, FOUND_WORK, Some("proj-abc123".into()));

        let json = serde_json::to_string(&file).unwrap();
        assert!(json.contains("lastRunAt"));
        assert!(json.contains("enabledOverride"));
        assert!(json.contains("startedAt"));

        let back: JobsStateFile = serde_json::from_str(&json).unwrap();
        let got = back.jobs.get("proj/job").unwrap();
        assert_eq!(got.last_run_at, Some(42));
        assert_eq!(got.enabled_override, Some(false));
        assert_eq!(got.history.len(), 1);
        assert_eq!(got.history[0].copy.as_deref(), Some("proj-abc123"));
    }

    #[test]
    fn history_caps_and_dedupes_skips() {
        let mut st = JobState::default();
        for i in 0..30u64 {
            push_history(&mut st, i, FOUND_WORK, None);
        }
        assert_eq!(st.history.len(), HISTORY_CAP);
        // oldest entries dropped, newest kept
        assert_eq!(st.history.first().unwrap().at, 30 - HISTORY_CAP as u64);
        assert_eq!(st.history.last().unwrap().at, 29);

        let mut sk = JobState::default();
        push_history(&mut sk, 1, SKIPPED_OVERLAP, None);
        push_history(&mut sk, 2, SKIPPED_OVERLAP, None);
        push_history(&mut sk, 3, SKIPPED_OVERLAP, None);
        assert_eq!(sk.history.len(), 1);
        assert_eq!(sk.history[0].at, 3);
        // a different result breaks the run
        push_history(&mut sk, 4, FOUND_WORK, None);
        assert_eq!(sk.history.len(), 2);
    }

    #[test]
    fn check_times_out_and_is_killed() {
        let root = std::env::temp_dir().to_string_lossy().into_owned();
        let start = std::time::Instant::now();
        let res = run_check(&root, "sleep 5", Duration::from_secs(1));
        assert!(res.is_err(), "a check that outlives its timeout must error");
        assert!(start.elapsed() < Duration::from_secs(4), "the check should be killed, not waited out");
    }

    #[test]
    fn collect_pending_tasks_drains_and_empties() {
        let mut file = JobsStateFile::default();
        file.jobs.entry("proj/a".into()).or_default().pending_task =
            Some(json!({ "project": "proj-copy", "task": {}, "select": true }));
        file.jobs.entry("proj/b".into()).or_default().last_run_at = Some(5);
        file.jobs.entry("proj/c".into()).or_default().pending_task =
            Some(json!({ "project": "proj", "task": {}, "select": true }));

        let drained = collect_pending_tasks(&mut file);
        let keys: Vec<&str> = drained.iter().map(|(k, _)| k.as_str()).collect();
        assert_eq!(keys, ["proj/a", "proj/c"]);
        assert_eq!(drained[0].1["project"], "proj-copy");

        // Every pending_task is now empty; the job that never had one is untouched.
        assert!(file.jobs.values().all(|st| st.pending_task.is_none()));
        assert_eq!(file.jobs.get("proj/b").unwrap().last_run_at, Some(5));

        // Draining again yields nothing.
        assert!(collect_pending_tasks(&mut file).is_empty());
    }

    #[test]
    fn stale_lock_detection() {
        assert!(matches!(evaluate_lock(&None, 100), LockDecision::Acquire));
        assert!(matches!(
            evaluate_lock(&Some(RunningLock { started_at: 100 }), 100 + 60),
            LockDecision::Busy
        ));
        assert!(matches!(
            evaluate_lock(&Some(RunningLock { started_at: 100 }), 100 + STALE_LOCK_SECS + 1),
            LockDecision::Stale
        ));
    }

    #[test]
    fn agent_cmdlines_run_headless() {
        assert_eq!(
            agent_prompt_cmdline("claude", "", "", "fix it"),
            "claude -p --output-format json 'fix it'"
        );
        assert_eq!(
            agent_prompt_cmdline("claude", "opus", "", "fix it"),
            "claude --model 'opus' -p --output-format json 'fix it'"
        );
        assert_eq!(
            agent_prompt_cmdline("claude", "opus", "high", "fix it"),
            "claude --model 'opus' --effort 'high' -p --output-format json 'fix it'"
        );
        assert_eq!(
            agent_prompt_cmdline("codex", "gpt-5.6-sol", "", "fix"),
            "codex exec -m 'gpt-5.6-sol' 'fix'"
        );
        assert_eq!(
            agent_prompt_cmdline("codex", "gpt-5.6-sol", "high", "fix"),
            "codex exec -m 'gpt-5.6-sol' -c model_reasoning_effort='high' 'fix'"
        );
        assert_eq!(
            agent_prompt_cmdline("claude", "", "max", "fix it"),
            "claude --effort 'max' -p --output-format json 'fix it'"
        );
        assert_eq!(agent_prompt_cmdline("gemini", "", "", "fix"), "gemini -p 'fix'");
        assert_eq!(agent_prompt_cmdline("opencode", "", "", "fix"), "opencode run 'fix'");
    }

    #[test]
    fn output_capping_keeps_the_right_end() {
        assert_eq!(head_chars("short", 100), "short");
        let long: String = "a".repeat(50) + &"b".repeat(100);
        let head = head_chars(&long, 60);
        assert!(head.starts_with("aaaaa"));
        assert!(head.contains("truncated"));
        let tail = tail_chars(&long, 60);
        assert!(tail.ends_with("bbbbb"));
        assert!(!tail.contains('a'));
    }

    #[test]
    fn result_text_extraction() {
        let raw = "hook: Stop\ntokens used\n50310\n{\"type\":\"result\",\"result\":\"All good.\\n\\n- item\",\"cost\":1}\n";
        assert_eq!(extract_result_text(raw).as_deref(), Some("All good.\n\n- item"));
        assert_eq!(extract_result_text("plain log output\nno json here"), None);
        assert_eq!(extract_result_text("{\"result\":\"\"}\n"), None);
        // the last result object wins even with trailing noise after it
        let noisy = "{\"result\":\"first\"}\nhook: Stop\n{\"result\":\"final\"}\ntrailing";
        assert_eq!(extract_result_text(noisy).as_deref(), Some("final"));
    }

    #[test]
    fn job_layers_merge_with_registry_winning() {
        let job = |label: &str| JobDef { label: label.into(), ..Default::default() };
        let registry = BTreeMap::from([("a".to_string(), job("reg-a"))]);
        let repo = BTreeMap::from([
            ("a".to_string(), job("repo-a")),
            ("b".to_string(), job("repo-b")),
        ]);
        let global = BTreeMap::from([
            ("a".to_string(), job("glob-a")),
            ("b".to_string(), job("glob-b")),
            ("c".to_string(), job("glob-c")),
        ]);
        let merged = merge_job_defs(registry, repo, global);
        let got: Vec<(&str, &str, &str)> = merged
            .iter()
            .map(|(k, (d, s))| (k.as_str(), d.label.as_str(), *s))
            .collect();
        assert_eq!(
            got,
            [
                ("a", "reg-a", SOURCE_PROJECT),
                ("b", "repo-b", SOURCE_REPO),
                ("c", "glob-c", SOURCE_GLOBAL),
            ],
        );
    }
}
