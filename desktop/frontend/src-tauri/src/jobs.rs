// Scheduled jobs: per-project tasks that fire on a schedule, optionally run a
// cheap `check`, and — when there is work — optionally duplicate the project and
// run a command / action / agent prompt in the copy. The scheduler is a plain
// wall-clock thread modelled on updates::start_auto_check so it survives sleep,
// and the pipeline runs on worker threads so one slow job never stalls the tick.
use crate::config;
use chrono::{Datelike, TimeZone};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap, HashSet};
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
const RUN_TIMEOUT: Duration = Duration::from_secs(60 * 60);
const HISTORY_CAP: usize = 50;
const MAX_JITTER_SECS: u64 = 5 * 60;
const OUTPUT_CAP_CHARS: usize = 12_000;
const DIGEST_CAP_CHARS: usize = 24_000;

const NOTHING_TO_DO: &str = "nothing-to-do";
const FOUND_WORK: &str = "found-work";
const COMPLETED: &str = "completed";
const ERROR: &str = "error";
const CANCELED: &str = "canceled";
const TIMED_OUT: &str = "timed-out";
const CONTEXT_FULL: &str = "context-full";
const SKIPPED_OVERLAP: &str = "skipped-overlap";
const SKIPPED_PENDING_COPY: &str = "skipped-pending-copy";
const PENDING_WINDOW: &str = "pending-window";
// Event-only status emitted when a run starts, never written to history.
const RUNNING: &str = "running";

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
    /// Only meaningful on the global layer: which projects a shared job runs in.
    /// Absent = every project (legacy); a non-empty list = those projects; an
    /// empty list = standalone (no project, runs in the home directory).
    #[serde(default)]
    projects: Option<Vec<String>>,
}

/// What a global-layer job runs against, derived from its `projects` field.
#[derive(Clone, Debug, PartialEq)]
enum JobTargets {
    Every,
    Projects(Vec<String>),
    Standalone,
}

fn job_targets(def: &JobDef) -> JobTargets {
    match &def.projects {
        None => JobTargets::Every,
        Some(list) if list.is_empty() => JobTargets::Standalone,
        Some(list) => JobTargets::Projects(list.clone()),
    }
}

/// Whether a global-layer job resolves under `project`. Every runs everywhere;
/// a scoped job only in its listed projects; a standalone job never under a
/// real project (it ticks on its own).
fn global_resolves_for(def: &JobDef, project: &str) -> bool {
    match job_targets(def) {
        JobTargets::Every => true,
        JobTargets::Projects(list) => list.iter().any(|p| p == project),
        JobTargets::Standalone => false,
    }
}

#[derive(Deserialize, Default, Clone)]
struct ScheduleDef {
    #[serde(default)]
    at: String,
    #[serde(default)]
    days: Vec<String>,
    every: Option<EveryValue>,
    /// The job never fires on its own — it only runs when started by hand.
    #[serde(default)]
    manual: bool,
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
    #[serde(default)]
    access: String,
}

const KNOWN_AGENTS: [&str; 4] = ["claude", "codex", "gemini", "opencode"];

#[derive(Clone, Debug, PartialEq)]
enum Schedule {
    Interval { secs: u64 },
    /// `at_min` is minutes since local midnight; `days` are weekday numbers
    /// (0 = Mon .. 6 = Sun), empty meaning every day.
    Calendar { at_min: u32, days: Vec<u8> },
    /// Never fires automatically; runs only when started by hand.
    Manual,
}

#[derive(Clone, Debug, PartialEq)]
enum RunTarget {
    Action(String),
    Cmd(String),
    /// `full_access` grants the agent its autonomous mode (edit files, run
    /// commands); without it a headless run can only read and report — any
    /// "may I proceed?" question it asks has no one to answer it.
    Prompt { prompt: String, agent: String, model: String, effort: String, full_access: bool },
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
    if sched.manual {
        return Ok(Schedule::Manual);
    }
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
    let access = run.access.trim().to_lowercase();
    if !matches!(access.as_str(), "" | "full" | "read") {
        return Err("Access must be \"full\" or \"read\".".into());
    }
    // OpenCode's non-interactive mode runs tools unconditionally — there is no
    // read-only to give, so pretending would be worse than refusing.
    if agent == "opencode" && access == "read" {
        return Err("OpenCode always runs with full access — pick another agent for a read-only job.".into());
    }
    Ok(RunTarget::Prompt {
        prompt: prompt.to_string(),
        agent,
        model: run.model.trim().to_string(),
        effort: run.effort.trim().to_lowercase(),
        full_access: access != "read",
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
        // Only global-layer jobs carry project targeting; a `projects` field on
        // a repo/registry job is ignored — those are already single-project.
        .filter(|(_, (def, source))| *source != SOURCE_GLOBAL || global_resolves_for(def, project))
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

/// The global layer's standalone jobs (empty `projects`): each runs once on its
/// schedule with no project, in the user's home directory. Ticked and acted on
/// with the sentinel project `""` (state key `/<id>`).
fn resolve_standalone_jobs() -> Vec<(String, Result<JobResolved, String>)> {
    load_jobs_yaml(&config::global_path())
        .into_iter()
        .filter(|(_, def)| matches!(job_targets(def), JobTargets::Standalone))
        .map(|(id, def)| {
            let r = resolve_job("", &id, &def);
            (id, r)
        })
        .collect()
}

fn home_dir() -> String {
    dirs::home_dir().unwrap_or_default().to_string_lossy().into_owned()
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

/// Local wall-clock to epoch, surviving DST folds: an ambiguous time (clocks
/// fell back) takes its first occurrence, a nonexistent time (clocks sprang
/// forward) slides an hour later — the job still runs that day.
fn local_epoch(date: chrono::NaiveDate, at_min: u32) -> Option<i64> {
    let t = chrono::NaiveTime::from_hms_opt(at_min / 60, at_min % 60, 0)?;
    let dt = date.and_time(t);
    match chrono::Local.from_local_datetime(&dt) {
        chrono::LocalResult::Single(x) => Some(x.timestamp()),
        chrono::LocalResult::Ambiguous(first, _) => Some(first.timestamp()),
        chrono::LocalResult::None => chrono::Local
            .from_local_datetime(&(dt + chrono::Duration::hours(1)))
            .earliest()
            .map(|x| x.timestamp()),
    }
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
        Schedule::Manual => false,
    }
}

fn next_fire_at(schedule: &Schedule, last_run: u64, jitter: u64, now: u64) -> Option<i64> {
    match schedule {
        Schedule::Interval { secs } => Some((last_run + secs + jitter) as i64),
        Schedule::Calendar { at_min, days } => {
            next_calendar_occurrence(*at_min, days, now as i64).map(|o| o + jitter as i64)
        }
        Schedule::Manual => None,
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
    #[serde(default, rename = "activeRun", skip_serializing_if = "Option::is_none")]
    active_run: Option<ActiveRun>,
    #[serde(default, rename = "pendingTask", skip_serializing_if = "Option::is_none")]
    pending_task: Option<Value>,
    #[serde(default, rename = "enabledOverride", skip_serializing_if = "Option::is_none")]
    enabled_override: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct HistoryEntry {
    at: u64,
    result: String,
    /// How many consecutive identical outcomes this entry stands for — quiet
    /// checks and skips collapse into one entry instead of flooding the
    /// history. None means one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    count: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    copy: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    output: Option<String>,
    /// Spawn-to-exit length of a captured run.
    #[serde(default, rename = "durationSecs", skip_serializing_if = "Option::is_none")]
    duration_secs: Option<u64>,
    /// What the run cost, when the agent reports it (Claude's result JSON).
    #[serde(default, rename = "costUsd", skip_serializing_if = "Option::is_none")]
    cost_usd: Option<f64>,
    /// The agent session behind this run's output, when the agent reported one
    /// — what a follow-up message resumes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    session: Option<String>,
    /// The user's follow-up message, when this entry is the agent's reply to
    /// one rather than a scheduled run.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    question: Option<String>,
    /// The session this entry continued, linking a reply to the run it belongs
    /// to — how the feed threads a conversation per run.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    resumed: Option<String>,
    /// The `at` of the entry this reply followed — the session-free threading
    /// link, so a conversation can continue through agents that don't report
    /// resumable sessions.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    follows: Option<u64>,
    /// The reply ran in a fresh session seeded with a condensed transcript,
    /// because the original session had no room left.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    compacted: bool,
}

#[derive(Serialize, Deserialize, Clone)]
struct RunningLock {
    #[serde(rename = "startedAt")]
    started_at: u64,
}

/// A live captured run, persisted so the run survives the app in a recoverable
/// way: the agent child is setsid-detached and keeps working when lpm quits,
/// but its watcher thread dies with the process. On the next launch this
/// record lets the scheduler re-adopt the child (still stoppable, still
/// overlap-guarded) or, if it already exited, salvage its result from the log
/// instead of losing the run without a trace.
#[derive(Serialize, Deserialize, Clone)]
struct ActiveRun {
    pid: i32,
    #[serde(rename = "startedAt")]
    started_at: u64,
    #[serde(rename = "logPath")]
    log_path: String,
    /// Which agent CLI is writing the log — how a salvaged or live-tailed log
    /// gets read. None for plain command runs (and records from older builds).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    agent: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    copy: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    question: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    resumed: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    follows: Option<u64>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    compacted: bool,
    /// When the machine that spawned the pid booted — a pid from before a
    /// reboot can only be a stranger wearing the same number.
    #[serde(default, rename = "bootAt", skip_serializing_if = "Option::is_none")]
    boot_at: Option<u64>,
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

/// Results whose consecutive repeats collapse into one counted entry: a
/// blocked job re-skips every tick, and a quiet check-gated job would
/// otherwise fill the whole history with "nothing to do" between real runs.
fn is_collapsible(result: &str) -> bool {
    matches!(result, SKIPPED_OVERLAP | SKIPPED_PENDING_COPY | NOTHING_TO_DO)
}

/// Append a history entry, capped at the newest `HISTORY_CAP`.
fn push_history(st: &mut JobState, at: u64, result: &str, copy: Option<String>) {
    push_entry(
        st,
        HistoryEntry { at, result: result.to_string(), copy, ..HistoryEntry::default() },
    );
}

fn push_entry(st: &mut JobState, entry: HistoryEntry) {
    if is_collapsible(&entry.result) {
        if let Some(last) = st.history.last_mut() {
            if last.result == entry.result {
                last.at = entry.at;
                last.copy = entry.copy;
                last.count = Some(last.count.unwrap_or(1) + 1);
                return;
            }
        }
    }
    st.history.push(entry);
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
/// restarts / other instances; this one just prevents per-tick spam. Values are
/// start timestamps so the UI can show how long a run has been going.
fn inflight() -> &'static Mutex<HashMap<String, u64>> {
    static SET: OnceLock<Mutex<HashMap<String, u64>>> = OnceLock::new();
    SET.get_or_init(|| Mutex::new(HashMap::new()))
}

fn mark_inflight(key: &str) -> bool {
    inflight().lock().unwrap().insert(key.to_string(), now_secs()).is_none()
}

fn clear_inflight(key: &str) {
    inflight().lock().unwrap().remove(key);
}

/// Jobs with a child process currently alive (a check or a headless agent
/// run), keyed to the spawn time. The pipeline's `running` lock is released
/// once the agent is spawned, so this registry is what makes a long agent run
/// visible — and stoppable — after the pipeline thread has moved on. The child
/// itself is owned by the wait loop polling it, which is also where a stop
/// request gets acted on.
fn active_runs() -> &'static Mutex<HashMap<String, u64>> {
    static MAP: OnceLock<Mutex<HashMap<String, u64>>> = OnceLock::new();
    MAP.get_or_init(|| Mutex::new(HashMap::new()))
}

fn canceled_keys() -> &'static Mutex<HashSet<String>> {
    static SET: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    SET.get_or_init(|| Mutex::new(HashSet::new()))
}

fn is_cancel_requested(key: &str) -> bool {
    canceled_keys().lock().unwrap().contains(key)
}

fn take_canceled(key: &str) -> bool {
    canceled_keys().lock().unwrap().remove(key)
}

/// Flag a running job for cancellation. Only takes effect while the job is
/// actually running in this process — otherwise a stray flag would mark the
/// *next* run as stopped the moment it starts.
fn request_cancel(key: &str) -> bool {
    let running =
        inflight().lock().unwrap().contains_key(key) || active_runs().lock().unwrap().contains_key(key);
    if running {
        canceled_keys().lock().unwrap().insert(key.to_string());
    }
    running
}

/// When the job started running, if it is running in this process: the pipeline
/// start while the worker thread holds it, then the agent spawn time once the
/// pipeline has handed off to the watcher.
fn running_since(key: &str) -> Option<u64> {
    if let Some(at) = inflight().lock().unwrap().get(key) {
        return Some(*at);
    }
    active_runs().lock().unwrap().get(key).copied()
}

struct Outcome {
    result: &'static str,
    copy: Option<String>,
    advance: bool,
    /// What went wrong (or what blocked the run), in product terms — recorded
    /// on the history entry so the feed can explain a failure instead of
    /// showing a bare "Problem during the run".
    note: Option<String>,
}

fn err_outcome(note: impl Into<String>) -> Outcome {
    Outcome { result: ERROR, copy: None, advance: true, note: Some(note.into()) }
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

fn kill_group(pid: i32) {
    unsafe {
        libc::kill(-pid, libc::SIGKILL);
    }
}

enum WaitVerdict {
    Exited(bool),
    TimedOut,
    Canceled,
}

/// Poll a spawned child until it exits, the deadline passes, or (when `key` is
/// given) a Stop request lands for that job. Timeout and cancel both SIGKILL
/// the whole process group — setsid makes pgid == the child's pid, so detached
/// workers die with it. This is the single place a job's child is ever killed.
fn wait_or_kill(
    child: &mut std::process::Child,
    deadline: std::time::Instant,
    key: Option<&str>,
) -> Result<WaitVerdict, String> {
    let pid = child.id() as i32;
    loop {
        if key.is_some_and(is_cancel_requested) {
            kill_group(pid);
            let _ = child.wait();
            return Ok(WaitVerdict::Canceled);
        }
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(status) => return Ok(WaitVerdict::Exited(status.success())),
            None if std::time::Instant::now() >= deadline => {
                kill_group(pid);
                let _ = child.wait();
                return Ok(WaitVerdict::TimedOut);
            }
            None => std::thread::sleep(Duration::from_millis(100)),
        }
    }
}

/// Exit 0 = there is work to do; any non-zero exit = nothing to do. A spawn
/// failure or a timeout is surfaced as an error. A hung check would otherwise
/// pin the worker thread and its in-process inflight slot forever. `key` (the
/// scheduler passes it, the editor's dry-run doesn't) makes the check child
/// visible to Stop.
fn run_check(root: &str, check: &str, timeout: Duration, key: Option<&str>) -> Result<bool, String> {
    let mut child = shell_command(root, check).spawn().map_err(|e| e.to_string())?;
    if let Some(k) = key {
        active_runs().lock().unwrap().insert(k.to_string(), now_secs());
    }
    let verdict = wait_or_kill(&mut child, std::time::Instant::now() + timeout, key);
    if let Some(k) = key {
        active_runs().lock().unwrap().remove(k);
    }
    match verdict? {
        WaitVerdict::Exited(ok) => Ok(ok),
        WaitVerdict::TimedOut => Err("check timed out".into()),
        WaitVerdict::Canceled => Err("check stopped".into()),
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
/// With `full_access` the agent gets its unattended mode — there is nobody at a
/// headless run to answer a permission prompt, so without it the agent can only
/// read and report.
fn agent_prompt_cmdline(agent: &str, model: &str, effort: &str, full_access: bool, prompt: &str) -> String {
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
            let access_arg =
                if full_access { " --dangerously-bypass-approvals-and-sandbox" } else { "" };
            // Codex refuses to start outside a git repository by default;
            // scheduled runs must work in any project folder.
            format!("codex exec --skip-git-repo-check{model_arg}{effort_arg}{access_arg} {q}")
        }
        // Gemini/OpenCode have no effort control. Gemini's json output mode
        // wraps the final message in a `response` field the feed can extract,
        // instead of whatever banners the CLI prints around it.
        "gemini" => {
            let access_arg = if full_access { " --yolo" } else { "" };
            if model.is_empty() {
                format!("gemini{access_arg} -o json -p {q}")
            } else {
                format!("gemini{access_arg} -o json -m {m} -p {q}")
            }
        }
        // OpenCode runs tools without prompting in its non-interactive mode, so
        // there is no access flag to pass.
        "opencode" => {
            if model.is_empty() {
                format!("opencode run {q}")
            } else {
                format!("opencode run --model {m} {q}")
            }
        }
        // Claude Code takes reasoning effort via `--effort`.
        _ => claude_cmdline(None, model, effort, full_access, prompt),
    }
}

/// The shared Claude Code headless invocation; `resume` continues an earlier
/// agent session so a follow-up message lands in the same conversation.
fn claude_cmdline(
    resume: Option<&str>,
    model: &str,
    effort: &str,
    full_access: bool,
    prompt: &str,
) -> String {
    let q = config::shell_quote(prompt);
    let m = config::shell_quote(model);
    let e = config::shell_quote(effort);
    let resume_arg = match resume {
        Some(sid) => format!(" --resume {}", config::shell_quote(sid)),
        None => String::new(),
    };
    let model_arg = if model.is_empty() { String::new() } else { format!(" --model {m}") };
    let effort_arg = if effort.is_empty() { String::new() } else { format!(" --effort {e}") };
    let access_arg = if full_access { " --dangerously-skip-permissions" } else { "" };
    // stream-json (which requires --verbose in print mode) writes an event per
    // message as the run progresses, so the log can be tailed live; its final
    // `result` event carries the same fields the plain json mode did.
    format!(
        "claude{resume_arg}{model_arg}{effort_arg}{access_arg} -p --verbose --output-format stream-json {q}"
    )
}

/// Claude's json output mode wraps the final message in a single-line JSON
/// object with a `result` field; hooks and stats the user has configured can
/// splatter extra lines around it. Scan from the end for that object so the
/// feed shows the clean message, not the raw stream. The same object names the
/// agent session (what makes the run resumable for follow-ups) and what the
/// run cost.
fn extract_result(raw: &str) -> Option<(String, Option<String>, Option<f64>)> {
    for line in raw.lines().rev() {
        let line = line.trim();
        if !line.starts_with('{') {
            continue;
        }
        if let Ok(v) = serde_json::from_str::<Value>(line) {
            if let Some(result) = v.get("result").and_then(Value::as_str) {
                let result = result.trim();
                if !result.is_empty() {
                    let session = v
                        .get("session_id")
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                        .map(str::to_string);
                    let cost = v
                        .get("total_cost_usd")
                        .and_then(Value::as_f64)
                        .filter(|c| *c > 0.0);
                    return Some((result.to_string(), session, cost));
                }
            }
        }
    }
    None
}

/// Where Codex writes its final message: a sidecar next to the run's log,
/// named via `--output-last-message` so the feed doesn't have to parse the
/// human-oriented log Codex prints.
fn last_message_path(log_path: &Path) -> PathBuf {
    log_path.with_extension("last")
}

fn extract_codex(log_path: &Path) -> Option<(String, Option<String>, Option<f64>)> {
    let msg = std::fs::read_to_string(last_message_path(log_path)).ok()?;
    let msg = msg.trim();
    if msg.is_empty() {
        return None;
    }
    Some((msg.to_string(), None, None))
}

/// Gemini's json output mode prints one (pretty-printed, multi-line) object
/// with the message under `response`; credential banners and warnings can
/// precede it. Parse from the last line that opens an object, tolerating
/// trailing noise.
fn extract_gemini(raw: &str) -> Option<(String, Option<String>, Option<f64>)> {
    let mut opens: Vec<usize> = Vec::new();
    let mut pos = 0;
    for line in raw.split_inclusive('\n') {
        if line.trim_start().starts_with('{') {
            opens.push(pos + (line.len() - line.trim_start().len()));
        }
        pos += line.len();
    }
    for &off in opens.iter().rev() {
        let mut stream = serde_json::Deserializer::from_str(&raw[off..]).into_iter::<Value>();
        if let Some(Ok(v)) = stream.next() {
            if let Some(resp) = v
                .get("response")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
            {
                return Some((resp.to_string(), None, None));
            }
        }
    }
    None
}

/// The agent's clean final message (plus session/cost when it reports them),
/// by whatever contract that agent's headless mode offers. None means the raw
/// log is all there is.
fn extract_output(
    agent: Option<&str>,
    raw: &str,
    log_path: &Path,
) -> Option<(String, Option<String>, Option<f64>)> {
    match agent {
        Some("codex") => extract_codex(log_path),
        Some("gemini") => extract_gemini(raw),
        Some("opencode") => None,
        // Claude — and legacy records that predate the agent field.
        _ => extract_result(raw),
    }
}

/// A Claude stream-json log rendered as a readable activity feed: the agent's
/// message text as it lands, one `→ Tool` line per tool call. Lines that
/// aren't JSON (stderr, hook output) pass through verbatim — they're why a
/// run failed; a JSON-shaped line that doesn't parse is a partial write and
/// is dropped.
fn render_claude_stream(raw: &str) -> Option<String> {
    let mut out = String::new();
    let mut push_line = |s: &str| {
        if !out.is_empty() {
            out.push('\n');
        }
        out.push_str(s);
    };
    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if !line.starts_with('{') {
            push_line(line);
            continue;
        }
        let Ok(v) = serde_json::from_str::<Value>(line) else { continue };
        if v.get("type").and_then(Value::as_str) != Some("assistant") {
            continue;
        }
        let blocks = v.pointer("/message/content").and_then(Value::as_array);
        for block in blocks.into_iter().flatten() {
            match block.get("type").and_then(Value::as_str) {
                Some("text") => {
                    if let Some(t) =
                        block.get("text").and_then(Value::as_str).map(str::trim).filter(|t| !t.is_empty())
                    {
                        push_line(t);
                    }
                }
                Some("tool_use") => {
                    if let Some(name) = block.get("name").and_then(Value::as_str) {
                        push_line(&format!("→ {name}"));
                    }
                }
                _ => {}
            }
        }
    }
    let out = out.trim().to_string();
    (!out.is_empty()).then_some(out)
}

/// What the feed stores when there is no clean final message: Claude's stream
/// log renders to a readable trace; anything else keeps its raw tail
/// (failures live at the end).
fn fallback_output(agent: Option<&str>, raw: &str) -> String {
    match agent {
        Some("claude") => {
            render_claude_stream(raw).map_or_else(|| tail_chars(raw, OUTPUT_CAP_CHARS), |r| tail_chars(&r, OUTPUT_CAP_CHARS))
        }
        _ => tail_chars(raw, OUTPUT_CAP_CHARS),
    }
}

fn hit_context_limit(output: Option<&str>) -> bool {
    output.is_some_and(|o| o.to_ascii_lowercase().contains("prompt is too long"))
}

/// The feed's thread grouping over the whole history, as index groups oldest
/// first: an entry joins the thread its `resumed` session lives in, or the one
/// holding the entry its `follows` points at; everything else starts its own.
fn thread_groups(history: &[HistoryEntry]) -> Vec<Vec<usize>> {
    let mut groups: Vec<Vec<usize>> = Vec::new();
    let mut by_session: HashMap<&str, usize> = HashMap::new();
    let mut by_at: HashMap<u64, usize> = HashMap::new();
    for (i, e) in history.iter().enumerate() {
        let parent = e
            .resumed
            .as_deref()
            .and_then(|r| by_session.get(r))
            .or_else(|| e.follows.and_then(|f| by_at.get(&f)))
            .copied();
        let idx = match parent {
            Some(g) => {
                groups[g].push(i);
                g
            }
            None => {
                groups.push(vec![i]);
                groups.len() - 1
            }
        };
        if let Some(s) = e.session.as_deref() {
            by_session.insert(s, idx);
        }
        by_at.insert(e.at, idx);
    }
    groups
}

/// All entries of the conversation containing `session`, oldest first.
#[cfg(test)]
fn thread_entries<'a>(history: &'a [HistoryEntry], session: &str) -> Vec<&'a HistoryEntry> {
    thread_groups(history)
        .into_iter()
        .find(|g| g.iter().any(|&i| history[i].session.as_deref() == Some(session)))
        .map(|g| g.into_iter().map(|i| &history[i]).collect())
        .unwrap_or_default()
}

/// The thread's visible transcript, condensed to fit a fresh session — what a
/// reply falls back to when the original session has no room left, and what
/// any agent gets when there is no session it could resume.
fn digest_of(entries: &[&HistoryEntry]) -> String {
    let mut out = String::new();
    for e in entries {
        if let Some(q) = &e.question {
            out.push_str("\n\nThe user said:\n");
            out.push_str(q);
        }
        if let Some(o) = &e.output {
            out.push_str("\n\nYou answered:\n");
            out.push_str(o);
        }
    }
    tail_chars(&out, DIGEST_CAP_CHARS)
}

/// Drop the entry at `at` — or, for `whole_thread`, the entire conversation it
/// belongs to. Returns what was removed (empty when no such entry exists).
fn remove_history_entries(
    history: &mut Vec<HistoryEntry>,
    at: u64,
    whole_thread: bool,
) -> Vec<HistoryEntry> {
    let Some(pos) = history.iter().position(|e| e.at == at) else {
        return Vec::new();
    };
    if !whole_thread {
        return vec![history.remove(pos)];
    }
    let Some(group) = thread_groups(history).into_iter().find(|g| g.contains(&pos)) else {
        return Vec::new();
    };
    let doomed: HashSet<usize> = group.into_iter().collect();
    let mut removed = Vec::new();
    let mut i = 0;
    history.retain(|e| {
        let keep = !doomed.contains(&i);
        if !keep {
            removed.push(e.clone());
        }
        i += 1;
        keep
    });
    removed
}

fn digest_prompt(digest: &str, message: &str) -> String {
    format!(
        "You are continuing an earlier conversation about work you did in this folder. \
         Its full history no longer fits, so here is the visible transcript, oldest first:{digest}\n\n\
         Reply to the user's new message:\n{message}"
    )
}

fn tail_chars(s: &str, max: usize) -> String {
    let count = s.chars().count();
    if count <= max {
        return s.trim_end().to_string();
    }
    s.chars().skip(count - max).collect::<String>().trim_end().to_string()
}

/// The last `max_bytes` of a file, starting at a line boundary so a chopped
/// first line (or a split UTF-8 character) can't garble what follows. Reading
/// the whole log every poll would make a chatty run's tail cost megabytes.
fn read_log_tail(path: &Path, max_bytes: u64) -> String {
    use std::io::{Read, Seek, SeekFrom};
    let Ok(mut f) = std::fs::File::open(path) else {
        return String::new();
    };
    let len = f.metadata().map(|m| m.len()).unwrap_or(0);
    let skip = len.saturating_sub(max_bytes);
    if f.seek(SeekFrom::Start(skip)).is_err() {
        return String::new();
    }
    let mut buf = Vec::new();
    if f.read_to_end(&mut buf).is_err() {
        return String::new();
    }
    let mut s = String::from_utf8_lossy(&buf).into_owned();
    if skip > 0 {
        // No newline in the window means one giant line — keep it (chopped)
        // rather than going blank.
        if let Some(nl) = s.find('\n') {
            s = s[nl + 1..].to_string();
        }
    }
    s
}

/// An agent's final message reads top-down, so when it exceeds the cap keep the
/// head (a raw log keeps its tail instead — failures live at the end).
fn head_chars(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.trim_end().to_string();
    }
    let mut out: String = s.chars().take(max).collect();
    out = out.trim_end().to_string();
    out.push_str("\n\n… (shortened — the message was too long to keep in full)");
    out
}

/// How one captured run is launched and recorded. `copy` names the duplicate
/// the run happened in (when it isn't the project itself); `question` and
/// `resumed` mark a follow-up: the message this run answers and the session it
/// continued. `fallback` is a fresh-session command line to retry with when
/// the primary hits the agent's context limit, and `compacted` marks a run
/// that starts condensed (its primary already carries a digest).
struct CaptureSpec {
    cmdline: String,
    /// Which agent CLI the command runs (None for a plain `cmd` job) — it
    /// decides how the log is read back into a clean message.
    agent: Option<String>,
    copy: Option<String>,
    question: Option<String>,
    resumed: Option<String>,
    follows: Option<u64>,
    fallback: Option<String>,
    compacted: bool,
}

impl CaptureSpec {
    fn run(cmdline: String, agent: Option<String>, copy: Option<String>) -> Self {
        CaptureSpec {
            cmdline,
            agent,
            copy,
            question: None,
            resumed: None,
            follows: None,
            fallback: None,
            compacted: false,
        }
    }
}

/// Wait out one spawned attempt and classify it. A reply that fails on the
/// agent's context-limit error is CONTEXT_FULL (headless runs never compact),
/// which the watcher uses to trigger the condensed retry.
fn reap_run(
    child: &mut std::process::Child,
    key: &str,
    log_path: &Path,
    is_reply: bool,
    agent: Option<&str>,
) -> (&'static str, Option<String>, Option<String>, Option<f64>) {
    let verdict = wait_or_kill(child, std::time::Instant::now() + RUN_TIMEOUT, Some(key));
    let canceled = take_canceled(key);
    let raw = std::fs::read_to_string(log_path).unwrap_or_default();
    let mut session = None;
    let mut cost = None;
    let output = match extract_output(agent, &raw, log_path) {
        Some((msg, sid, c)) => {
            session = sid;
            cost = c;
            Some(head_chars(&msg, OUTPUT_CAP_CHARS))
        }
        None => Some(fallback_output(agent, &raw)).filter(|s| !s.is_empty()),
    };
    let result = match verdict {
        Ok(WaitVerdict::Canceled) => CANCELED,
        _ if canceled => CANCELED,
        Ok(WaitVerdict::TimedOut) => TIMED_OUT,
        Ok(WaitVerdict::Exited(true)) => COMPLETED,
        // The limit error can land on stderr outside the rendered message, so
        // the raw log is what's checked.
        _ if is_reply && hit_context_limit(Some(&raw)) => CONTEXT_FULL,
        _ => ERROR,
    };
    (result, output, session, cost)
}

fn captured_shell_line(cmdline: &str, log_path: &Path) -> String {
    format!("{{ {cmdline} ; }} > {} 2>&1", config::shell_quote(&log_path.to_string_lossy()))
}

/// Run a command headless in `root` with output streamed to a log file under
/// ~/.lpm/job-logs; a watcher thread reaps the exit off the job lock and
/// records a completion entry with the output tail, so the run's result is
/// reviewable from the Scheduled view instead of vanishing.
/// Codex won't repeat its final message anywhere parseable in the log, but it
/// will write it to a file on request — point it at the run's sidecar.
fn capture_cmdline(agent: Option<&str>, cmdline: &str, log_path: &Path) -> String {
    match agent {
        Some("codex") => format!(
            "{cmdline} --output-last-message {}",
            config::shell_quote(&last_message_path(log_path).to_string_lossy())
        ),
        _ => cmdline.to_string(),
    }
}

fn spawn_captured(app: &AppHandle, key: &str, root: &str, spec: CaptureSpec) -> Dispatch {
    let logs = config::lpm_dir().join("job-logs");
    if std::fs::create_dir_all(&logs).is_err() {
        return Dispatch::Error;
    }
    let CaptureSpec { cmdline, agent, copy, question, resumed, follows, fallback, compacted } =
        spec;
    let log_path = logs.join(format!("{}-{}.log", key.replace('/', "_"), now_secs()));
    let cmdline = capture_cmdline(agent.as_deref(), &cmdline, &log_path);
    match shell_command(root, &captured_shell_line(&cmdline, &log_path)).spawn() {
        Ok(mut child) => {
            let started = now_secs();
            active_runs().lock().unwrap().insert(key.to_string(), started);
            let _ = with_state(|f| {
                f.jobs.entry(key.to_string()).or_default().active_run = Some(ActiveRun {
                    pid: child.id() as i32,
                    started_at: started,
                    log_path: log_path.to_string_lossy().into_owned(),
                    agent: agent.clone(),
                    copy: copy.clone(),
                    question: question.clone(),
                    resumed: resumed.clone(),
                    follows,
                    compacted,
                    boot_at: Some(boot_epoch()),
                });
            });
            let app2 = app.clone();
            let key2 = key.to_string();
            let root2 = root.to_string();
            std::thread::spawn(move || {
                let is_reply = question.is_some();
                let (mut result, mut output, mut session, mut cost) =
                    reap_run(&mut child, &key2, &log_path, is_reply, agent.as_deref());
                let mut compacted = compacted;
                // The session had no room left: retry once as a fresh session
                // seeded with the thread's condensed transcript. The key stays
                // registered as running throughout, so nothing overlaps it.
                if result == CONTEXT_FULL {
                    if let Some(fb) = fallback {
                        let log2 = log_path.with_extension("compact.log");
                        if let Ok(mut retry) =
                            shell_command(&root2, &captured_shell_line(&fb, &log2)).spawn()
                        {
                            active_runs().lock().unwrap().insert(key2.clone(), now_secs());
                            let _ = with_state(|f| {
                                if let Some(ar) = f
                                    .jobs
                                    .get_mut(&key2)
                                    .and_then(|st| st.active_run.as_mut())
                                {
                                    ar.pid = retry.id() as i32;
                                    ar.log_path = log2.to_string_lossy().into_owned();
                                    ar.compacted = true;
                                }
                            });
                            (result, output, session, cost) =
                                reap_run(&mut retry, &key2, &log2, true, agent.as_deref());
                            compacted = true;
                        }
                    }
                }
                active_runs().lock().unwrap().remove(&key2);
                let at = now_secs();
                let _ = with_state(|f| {
                    // The job may have been deleted (its state cleared) while
                    // this run was live — don't resurrect it with a ghost entry.
                    if let Some(st) = f.jobs.get_mut(&key2) {
                        st.active_run = None;
                        push_entry(
                            st,
                            HistoryEntry {
                                at,
                                result: result.to_string(),
                                copy,
                                output,
                                session,
                                question,
                                resumed,
                                follows,
                                compacted,
                                duration_secs: Some(at.saturating_sub(started)),
                                cost_usd: cost,
                                count: None,
                            },
                        );
                    }
                });
                let (project, job_id) = key2.split_once('/').unwrap_or((key2.as_str(), ""));
                emit_status(&app2, project, job_id, result, &None);
            });
            Dispatch::Ran
        }
        Err(_) => Dispatch::Error,
    }
}

/// The folder a run happens in: a project's root, or the home directory for a
/// standalone job (sentinel empty project).
fn dispatch_root(project: &str) -> Option<String> {
    if project.is_empty() {
        return Some(home_dir());
    }
    match config::project_root(project) {
        Ok((r, false)) if !r.is_empty() => Some(r),
        _ => None,
    }
}

fn dispatch_run(app: &AppHandle, key: &str, target: &str, job: &JobResolved) -> Dispatch {
    let project = key.split_once('/').map(|(p, _)| p).unwrap_or(key);
    let copy = (target != project).then(|| target.to_string());
    match &job.run {
        RunTarget::Cmd(cmd) => {
            let root = match dispatch_root(target) {
                Some(r) => r,
                None => return Dispatch::Error,
            };
            spawn_captured(app, key, &root, CaptureSpec::run(cmd.clone(), None, copy))
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
        RunTarget::Prompt { prompt, agent, model, effort, full_access } => {
            let root = match dispatch_root(target) {
                Some(r) => r,
                None => return Dispatch::Error,
            };
            let agent = if agent.is_empty() { default_ai_cli() } else { agent.clone() };
            spawn_captured(
                app,
                key,
                &root,
                CaptureSpec::run(
                    agent_prompt_cmdline(&agent, model, effort, *full_access, prompt),
                    Some(agent),
                    copy,
                ),
            )
        }
    }
}

fn pipeline_body(app: &AppHandle, project: &str, job: &JobResolved, key: &str) -> Outcome {
    let st = load_job_state(key);
    if let Some(prev) = st.history.iter().rev().find_map(|h| h.copy.clone()) {
        if config::project_exists(&prev) {
            return Outcome { result: SKIPPED_PENDING_COPY, copy: None, advance: false, note: None };
        }
    }

    let root = if project.is_empty() {
        home_dir()
    } else {
        match config::project_root(project) {
            Ok((r, false)) if !r.is_empty() => r,
            _ => return err_outcome("This project has no local folder to run in."),
        }
    };

    if !job.check.is_empty() {
        match run_check(&root, &job.check, CHECK_TIMEOUT, Some(key)) {
            Ok(true) => {}
            Ok(false) => {
                return Outcome { result: NOTHING_TO_DO, copy: None, advance: true, note: None }
            }
            Err(e) if e == "check timed out" => {
                return err_outcome("The check ran too long and was stopped.")
            }
            Err(e) => return err_outcome(format!("The check couldn't run: {e}.")),
        }
    }

    let (target, copy) = if job.duplicate && !project.is_empty() {
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
            Err(e) => return err_outcome(format!("Couldn't duplicate the project: {e}")),
        }
    } else {
        (project.to_string(), None)
    };

    // A Stop that lands during the check or the duplicate step must not still
    // launch the agent.
    if is_cancel_requested(key) {
        return Outcome { result: CANCELED, copy, advance: true, note: None };
    }

    match dispatch_run(app, key, &target, job) {
        Dispatch::Ran => Outcome { result: FOUND_WORK, copy, advance: true, note: None },
        Dispatch::Parked => Outcome { result: PENDING_WINDOW, copy, advance: true, note: None },
        Dispatch::Error => Outcome {
            result: ERROR,
            copy,
            advance: true,
            note: Some("The run couldn't start.".to_string()),
        },
    }
}

fn emit_status(app: &AppHandle, project: &str, job_id: &str, result: &str, copy: &Option<String>) {
    let mut payload = json!({ "project": project, "jobId": job_id, "result": result });
    if let Some(c) = copy {
        payload["copy"] = json!(c);
    }
    let _ = app.emit("job-status", payload);
    notify_if_unattended(app, project, job_id, result);
}

/// Jobs exist to work while the user is away — when the window is hidden or in
/// the background, the in-app toast lands on glass nobody is looking at, so
/// outcomes worth interrupting for also go out as a system notification. Quiet
/// days and skips stay silent everywhere.
fn notify_if_unattended(app: &AppHandle, project: &str, job_id: &str, result: &str) {
    let at = if project.is_empty() { String::new() } else { format!(" in {project}") };
    let (title, body) = match result {
        COMPLETED => ("Scheduled job finished", format!("\"{job_id}\"{at} is done.")),
        FOUND_WORK => {
            ("Scheduled job found work", format!("\"{job_id}\"{at} started working."))
        }
        ERROR => ("Scheduled job hit a problem", format!("\"{job_id}\"{at} needs a look.")),
        TIMED_OUT => (
            "Scheduled job stopped",
            format!("\"{job_id}\"{at} ran too long and was stopped."),
        ),
        _ => return,
    };
    let attended = app
        .get_webview_window("main")
        .map(|w| w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false))
        .unwrap_or(false);
    if attended {
        return;
    }
    use tauri_plugin_notification::NotificationExt;
    let _ = app.notification().builder().title(title).body(&body).show();
}

fn run_pipeline(app: &AppHandle, project: &str, job: &JobResolved) {
    let key = state_key(project, &job.id);

    // The pipeline releases its lock once the agent is spawned, so a live agent
    // run only shows up in the active-run registry — without this, a due tick
    // (or Run now) would start a second run of the same job alongside it.
    let agent_still_running = active_runs().lock().unwrap().contains_key(&key);

    let decision = if agent_still_running {
        LockDecision::Busy
    } else {
        with_state(|f| {
            let st = f.jobs.entry(key.clone()).or_default();
            match evaluate_lock(&st.running, now_secs()) {
                LockDecision::Busy => LockDecision::Busy,
                LockDecision::Acquire => {
                    st.running = Some(RunningLock { started_at: now_secs() });
                    LockDecision::Acquire
                }
                LockDecision::Stale => {
                    push_entry(
                        st,
                        HistoryEntry {
                            at: now_secs(),
                            result: ERROR.to_string(),
                            output: Some(
                                "An earlier run never reported back, so it was written off."
                                    .to_string(),
                            ),
                            ..HistoryEntry::default()
                        },
                    );
                    st.running = Some(RunningLock { started_at: now_secs() });
                    LockDecision::Stale
                }
            }
        })
        .unwrap_or(LockDecision::Acquire)
    };

    if let LockDecision::Busy = decision {
        let _ = with_state(|f| {
            push_history(f.jobs.entry(key.clone()).or_default(), now_secs(), SKIPPED_OVERLAP, None);
        });
        emit_status(app, project, &job.id, SKIPPED_OVERLAP, &None);
        return;
    }

    emit_status(app, project, &job.id, RUNNING, &None);
    let mut outcome = pipeline_body(app, project, job, &key);
    // The found-work path hands the cancel flag to the agent watcher; every
    // other exit consumes it here so a Stop pressed mid-pipeline is recorded.
    if outcome.result != FOUND_WORK && take_canceled(&key) {
        outcome = Outcome { result: CANCELED, copy: outcome.copy, advance: true, note: None };
    }
    let at = now_secs();
    let _ = with_state(|f| {
        // The job may have been deleted (its state cleared) mid-pipeline —
        // like the agent watcher, never resurrect it with a ghost entry.
        if let Some(st) = f.jobs.get_mut(&key) {
            st.running = None;
            push_entry(
                st,
                HistoryEntry {
                    at,
                    result: outcome.result.to_string(),
                    copy: outcome.copy.clone(),
                    output: outcome.note.clone(),
                    ..HistoryEntry::default()
                },
            );
            if outcome.advance {
                st.last_run_at = Some(at);
            }
        }
    });
    emit_status(app, project, &job.id, outcome.result, &outcome.copy);
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

// ---- orphaned-run recovery ----------------------------------------------------

/// When this machine booted, from the monotonic clock. A persisted pid is only
/// trusted when it was spawned in this boot.
fn boot_epoch() -> u64 {
    let mut ts = libc::timespec { tv_sec: 0, tv_nsec: 0 };
    unsafe {
        libc::clock_gettime(libc::CLOCK_MONOTONIC, &mut ts);
    }
    now_secs().saturating_sub(ts.tv_sec as u64)
}

/// Whether the recorded run child is still alive and still ours: same boot,
/// pid exists, and the pid still leads its own process group (what setsid gave
/// it) — a recycled pid fails that test.
fn orphan_alive(run: &ActiveRun) -> bool {
    let same_boot = run
        .boot_at
        .map(|b| b.abs_diff(boot_epoch()) <= 60)
        .unwrap_or(false);
    if !same_boot {
        return false;
    }
    unsafe { libc::kill(run.pid, 0) == 0 && libc::getpgid(run.pid) == run.pid }
}

/// The history entry for a run whose watcher died with the previous app
/// process: its result is salvaged from the log. A clean agent result line
/// means the run finished its work; anything else is honest about what is
/// known. `ended_at` is None when the exit wasn't observed (the child was
/// already gone at launch), which leaves the duration unknown.
fn orphan_entry(
    run: &ActiveRun,
    log: &str,
    canceled: bool,
    timed_out: bool,
    at: u64,
    ended_at: Option<u64>,
) -> HistoryEntry {
    let mut session = None;
    let mut cost = None;
    let mut finished_cleanly = false;
    let agent = run.agent.as_deref();
    let output = match extract_output(agent, log, Path::new(&run.log_path)) {
        Some((msg, sid, c)) => {
            session = sid;
            cost = c;
            finished_cleanly = true;
            Some(head_chars(&msg, OUTPUT_CAP_CHARS))
        }
        None => Some(fallback_output(agent, log)).filter(|s| !s.is_empty()),
    };
    let result = if canceled {
        CANCELED
    } else if timed_out {
        TIMED_OUT
    } else if finished_cleanly {
        COMPLETED
    } else {
        ERROR
    };
    let output = output.or_else(|| {
        (result == ERROR).then(|| "The app closed before this run finished.".to_string())
    });
    HistoryEntry {
        at,
        result: result.to_string(),
        copy: run.copy.clone(),
        output,
        session,
        question: run.question.clone(),
        resumed: run.resumed.clone(),
        follows: run.follows,
        compacted: run.compacted,
        duration_secs: ended_at.map(|e| e.saturating_sub(run.started_at)),
        cost_usd: cost,
        count: None,
    }
}

fn finish_orphan(app: &AppHandle, key: &str, run: &ActiveRun, canceled: bool, timed_out: bool, ended_at: Option<u64>) {
    let log = std::fs::read_to_string(&run.log_path).unwrap_or_default();
    let at = now_secs();
    let entry = orphan_entry(run, &log, canceled, timed_out, at, ended_at);
    let result = entry.result.clone();
    let _ = with_state(|f| {
        if let Some(st) = f.jobs.get_mut(key) {
            st.active_run = None;
            push_entry(st, entry);
        }
    });
    let (project, job_id) = key.split_once('/').unwrap_or((key, ""));
    emit_status(app, project, job_id, &result, &None);
}

/// Re-own a run that outlived the previous app process: register it as running
/// (so overlap-skip, the UI's live state, and Stop all work again) and watch
/// the pid until it exits, is stopped, or crosses the run timeout measured
/// from its ORIGINAL start.
fn adopt_orphan(app: AppHandle, key: String, run: ActiveRun) {
    active_runs().lock().unwrap().insert(key.clone(), run.started_at);
    std::thread::spawn(move || {
        let deadline = run.started_at + RUN_TIMEOUT.as_secs();
        let mut timed_out = false;
        loop {
            if is_cancel_requested(&key) {
                kill_group(run.pid);
                break;
            }
            if !orphan_alive(&run) {
                break;
            }
            if now_secs() >= deadline {
                kill_group(run.pid);
                timed_out = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(500));
        }
        let canceled = take_canceled(&key);
        active_runs().lock().unwrap().remove(&key);
        finish_orphan(&app, &key, &run, canceled, timed_out, Some(now_secs()));
    });
}

/// Startup pass over the persisted state: adopt or reap runs the previous app
/// process left behind, and release pipeline locks whose owner died before it
/// ever spawned anything (otherwise the job stays silently blocked for hours).
fn reconcile_orphans(app: &AppHandle) {
    let snapshot: Vec<(String, JobState)> = {
        let _g = state_lock().lock().unwrap();
        load_state_file().jobs.into_iter().collect()
    };
    for (key, st) in snapshot {
        if let Some(run) = st.active_run {
            if orphan_alive(&run) {
                adopt_orphan(app.clone(), key, run);
            } else {
                finish_orphan(app, &key, &run, false, false, None);
            }
        } else if st.running.is_some() {
            let _ = with_state(|f| {
                if let Some(s) = f.jobs.get_mut(&key) {
                    if s.active_run.is_none() && s.running.is_some() {
                        s.running = None;
                        push_entry(
                            s,
                            HistoryEntry {
                                at: now_secs(),
                                result: ERROR.to_string(),
                                output: Some(
                                    "The app closed before this run finished.".to_string(),
                                ),
                                ..HistoryEntry::default()
                            },
                        );
                    }
                }
            });
            let (project, job_id) = key.split_once('/').unwrap_or((key.as_str(), ""));
            emit_status(app, project, job_id, ERROR, &None);
        }
    }
}

/// Captured-run logs are an audit trail, not an archive — drop anything older
/// than two weeks so the folder can't grow forever.
fn prune_job_logs() {
    let Ok(entries) = std::fs::read_dir(config::lpm_dir().join("job-logs")) else {
        return;
    };
    let cutoff = SystemTime::now() - Duration::from_secs(14 * 86_400);
    for e in entries.flatten() {
        let stale = e
            .metadata()
            .and_then(|m| m.modified())
            .map(|m| m < cutoff)
            .unwrap_or(false);
        if stale {
            let _ = std::fs::remove_file(e.path());
        }
    }
}

// ---- scheduler thread -------------------------------------------------------

/// Anchor, enablement, and due-check for one resolved job. `project` is the
/// sentinel `""` for a standalone job.
fn tick_job(app: &AppHandle, project: &str, id: &str, job: JobResolved) {
    let key = state_key(project, id);
    let st = load_job_state(&key);

    let last = match st.last_run_at {
        Some(l) => l,
        None => {
            // First time we've seen this job: anchor it to now so a job added
            // while the app was closed never fires retroactively.
            let _ = with_state(|f| {
                let s = f.jobs.entry(key.clone()).or_default();
                if s.last_run_at.is_none() {
                    s.last_run_at = Some(now_secs());
                }
            });
            return;
        }
    };

    if !st.enabled_override.unwrap_or(job.enabled) {
        return;
    }
    if is_due(&job.schedule, last, now_secs(), jitter_secs(project, id)) {
        spawn_pipeline(app, project, job);
    }
}

fn tick(app: &AppHandle) {
    for project in config::project_names() {
        for (id, _source, res) in resolve_jobs(&project) {
            let Ok(job) = res else { continue };
            tick_job(app, &project, &id, job);
        }
    }
    for (id, res) in resolve_standalone_jobs() {
        let Ok(job) = res else { continue };
        tick_job(app, "", &id, job);
    }
}

pub fn start_scheduler(app: AppHandle) {
    std::thread::spawn(move || {
        // Settle what the previous app process left behind before the first
        // due check, so an adopted run blocks its job from double-running.
        reconcile_orphans(&app);
        let mut ticks: u64 = 0;
        loop {
            if ticks % (24 * 60) == 0 {
                prune_job_logs();
            }
            tick(&app);
            ticks += 1;
            std::thread::sleep(TICK);
        }
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

/// A one-glance summary of what the job runs, for the list row: the prompt
/// text, the command, or the action name.
fn run_description(run: &RunTarget) -> String {
    match run {
        RunTarget::Action(a) => a.clone(),
        RunTarget::Cmd(c) => c.clone(),
        RunTarget::Prompt { prompt, .. } => prompt.clone(),
    }
}

fn schedule_json(schedule: &Schedule) -> Value {
    match schedule {
        Schedule::Interval { secs } => json!({ "mode": "interval", "everySecs": secs }),
        Schedule::Calendar { at_min, days } => {
            let days: Vec<&str> = days.iter().map(|d| DAY_NAMES[*d as usize]).collect();
            json!({ "mode": "calendar", "atMinutes": at_min, "days": days })
        }
        Schedule::Manual => json!({ "mode": "manual" }),
    }
}

/// One aggregated row for a global-layer job — every-project, project-scoped, or
/// standalone — with run state folded across the folders it runs in, so a shared
/// job shows as a single list entry instead of one per project.
fn global_job_row(id: &str, def: &JobDef, projects: &[String], now: u64) -> Value {
    let standalone = matches!(job_targets(def), JobTargets::Standalone);
    let existing: HashSet<&str> = projects.iter().map(String::as_str).collect();
    let targets: Vec<String> = match job_targets(def) {
        JobTargets::Every => projects.to_vec(),
        JobTargets::Projects(list) => {
            list.into_iter().filter(|p| existing.contains(p.as_str())).collect()
        }
        JobTargets::Standalone => Vec::new(),
    };
    // The folders the job actually runs in: a standalone job's is the sentinel
    // "" (home dir); everything else is its targets.
    let run_targets: Vec<String> = if standalone { vec![String::new()] } else { targets.clone() };

    // Resolve against a representative project so validity and run details are
    // known — prompt and command jobs resolve the same everywhere, and shared
    // jobs never run actions.
    let repr = run_targets.first().cloned().unwrap_or_default();
    let resolved = resolve_job(&repr, id, def);

    let mut enabled = false;
    let mut running_count: u32 = 0;
    let mut earliest_since: Option<u64> = None;
    let mut max_last: Option<u64> = None;
    let mut last_result: Option<String> = None;
    let mut next: Option<i64> = None;
    for t in &run_targets {
        let key = state_key(t, id);
        let st = load_job_state(&key);
        let job_enabled = match &resolved {
            Ok(job) => st.enabled_override.unwrap_or(job.enabled),
            Err(_) => st.enabled_override.unwrap_or(false),
        };
        enabled = enabled || job_enabled;
        if let Some(since) = running_since(&key) {
            running_count += 1;
            earliest_since = Some(earliest_since.map_or(since, |e| e.min(since)));
        }
        if let Some(lr) = st.last_run_at {
            if max_last.map_or(true, |m| lr >= m) {
                max_last = Some(lr);
                last_result = st.history.last().map(|h| h.result.clone());
            }
        }
        if let Ok(job) = &resolved {
            if job_enabled {
                if let Some(nf) = next_fire_at(
                    &job.schedule,
                    st.last_run_at.unwrap_or(now),
                    jitter_secs(t, id),
                    now,
                ) {
                    next = Some(next.map_or(nf, |n: i64| n.min(nf)));
                }
            }
        }
    }

    match resolved {
        Ok(job) => {
            let mut row = json!({
                "id": id,
                "valid": true,
                "source": SOURCE_GLOBAL,
                "label": job.label,
                "emoji": job.emoji,
                "enabled": enabled,
                "duplicate": job.duplicate,
                "runKind": run_kind(&job.run),
                "description": run_description(&job.run),
                "schedule": schedule_json(&job.schedule),
                "lastRunAt": max_last,
                "lastResult": last_result,
                "nextFireAt": next,
                "running": running_count > 0,
                "runningSince": earliest_since,
                "runningCount": running_count,
                "targetCount": targets.len(),
                "targets": targets,
                "standalone": standalone,
            });
            if let RunTarget::Prompt { agent, model, effort, .. } = &job.run {
                row["agent"] = json!(agent);
                row["model"] = json!(model);
                row["effort"] = json!(effort);
            }
            row
        }
        Err(e) => json!({
            "id": id,
            "valid": false,
            "source": SOURCE_GLOBAL,
            "error": e,
            "enabled": enabled,
            "runningCount": running_count,
            "targetCount": targets.len(),
            "targets": targets,
            "standalone": standalone,
        }),
    }
}

/// Every project's jobs in one flat list for the app-wide Scheduled view.
/// Project- and repo-layer jobs stay one row per project (each carries its
/// owning `project` plus a single-entry `targets`); global-layer jobs collapse
/// to one aggregated row apiece.
#[tauri::command(async)]
pub fn list_all_jobs() -> Result<Vec<Value>, String> {
    let now = now_secs();
    let projects = config::project_names();
    let mut out: Vec<Value> = Vec::new();
    for project in &projects {
        for mut row in list_jobs(project.clone())? {
            if row.get("source") == Some(&json!(SOURCE_GLOBAL)) {
                continue;
            }
            row["project"] = json!(project);
            row["targets"] = json!([project]);
            row["standalone"] = json!(false);
            out.push(row);
        }
    }
    for (id, def) in load_jobs_yaml(&config::global_path()) {
        out.push(global_job_row(&id, &def, &projects, now));
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
                    // A job the scheduler hasn't anchored yet (created moments
                    // ago) predicts from now — the anchor the next tick writes.
                    let next = next_fire_at(
                        &job.schedule,
                        st.last_run_at.unwrap_or(now),
                        jitter_secs(&project, &id),
                        now,
                    );
                    let since = running_since(&key);
                    let mut row = json!({
                        "id": id,
                        "valid": true,
                        "source": source,
                        "label": job.label,
                        "emoji": job.emoji,
                        "enabled": enabled,
                        "duplicate": job.duplicate,
                        "runKind": run_kind(&job.run),
                        "description": run_description(&job.run),
                        "schedule": schedule_json(&job.schedule),
                        "lastRunAt": st.last_run_at,
                        "lastResult": st.history.last().map(|h| h.result.clone()),
                        "nextFireAt": next,
                        "running": since.is_some(),
                        "runningSince": since,
                    });
                    if let RunTarget::Prompt { agent, model, effort, .. } = &job.run {
                        row["agent"] = json!(agent);
                        row["model"] = json!(model);
                        row["effort"] = json!(effort);
                    }
                    row
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
    let work = run_check(&root, check, Duration::from_secs(60), None)?;
    Ok(json!({ "work": work }))
}

#[tauri::command(async)]
pub fn run_job_now(app: AppHandle, project: String, job_id: String) -> Result<(), String> {
    let job = if project.is_empty() {
        resolve_standalone_jobs()
            .into_iter()
            .find(|(id, _)| *id == job_id)
            .ok_or_else(|| "That job doesn't exist.".to_string())?
            .1?
    } else {
        resolve_jobs(&project)
            .into_iter()
            .find(|(id, _, _)| *id == job_id)
            .ok_or_else(|| "That job doesn't exist.".to_string())?
            .2?
    };
    spawn_pipeline(&app, &project, job);
    Ok(())
}

/// Stop the job's current run. The flag is polled by whichever wait loop owns
/// the run's child (check or agent), which SIGKILLs its process group and
/// records a "canceled" entry; a no-op when nothing is running.
#[tauri::command(async)]
pub fn stop_job_run(project: String, job_id: String) -> Result<(), String> {
    request_cancel(&state_key(&project, &job_id));
    Ok(())
}

/// Continue one of the job's conversations, addressed by the `at` of any entry
/// in it. A Claude reply resumes the thread's session when its newest message
/// carries one (falling back to a fresh session seeded with the thread's
/// condensed transcript when that session has no room left); any other case —
/// another agent, a sessionless run, a thread that moved past its session —
/// gets the condensed transcript directly, so every conversation stays
/// continuable. Empty `agent`/`model`/`effort` mean the job's own settings.
/// Runs in the same place the run happened (the project or the copy it worked
/// in), through the same captured-run pipeline — live, stoppable, and recorded
/// in that thread with its answer.
#[tauri::command(async)]
pub fn send_job_followup(
    app: AppHandle,
    project: String,
    job_id: String,
    at: u64,
    message: String,
    agent: String,
    model: String,
    effort: String,
) -> Result<(), String> {
    let message = message.trim().to_string();
    if message.is_empty() {
        return Err("Type a message to send.".into());
    }
    let key = state_key(&project, &job_id);
    if running_since(&key).is_some() {
        return Err("This job is running — wait for it to finish.".into());
    }

    let st = load_job_state(&key);
    let group = thread_groups(&st.history)
        .into_iter()
        .find(|g| g.iter().any(|&i| st.history[i].at == at))
        .ok_or_else(|| "That conversation isn't available anymore.".to_string())?;
    let entries: Vec<&HistoryEntry> = group.iter().map(|&i| &st.history[i]).collect();
    // Replies always continue from the thread's newest message, whichever
    // entry the user replied under.
    let tail = *entries.last().expect("a thread group is never empty");

    let job = resolve_jobs(&project)
        .into_iter()
        .find(|(id, _, _)| *id == job_id)
        .ok_or_else(|| "That job doesn't exist.".to_string())?
        .2?;
    let full_access = match &job.run {
        RunTarget::Prompt { full_access, .. } => *full_access,
        _ => return Err("Replies are only available for AI prompt jobs.".into()),
    };
    let agent = {
        let chosen = agent.trim().to_lowercase();
        if chosen.is_empty() { default_ai_cli() } else { chosen }
    };
    if !KNOWN_AGENTS.contains(&agent.as_str()) {
        return Err(format!("\"{agent}\" isn't an agent lpm knows how to run."));
    }
    if agent == "opencode" && !full_access {
        return Err(
            "This job is read-only, and OpenCode always runs with full access — pick another agent."
                .into(),
        );
    }
    let model = model.trim().to_string();
    let effort = effort.trim().to_lowercase();

    // Agent sessions live with the folder they ran in, so a reply must run in
    // the same place.
    let target = tail.copy.clone().unwrap_or_else(|| project.clone());
    if tail.copy.is_some() && !config::project_exists(&target) {
        return Err("The copy that run worked in is gone — run the job again.".into());
    }
    let root = match config::project_root(&target) {
        Ok((r, false)) if !r.is_empty() => r,
        _ => return Err("This job has no local folder to run in.".into()),
    };

    let condensed = digest_prompt(&digest_of(&entries), &message);
    let thread_full = entries.iter().any(|e| e.result == CONTEXT_FULL);
    // Resuming is only sound when the newest message itself carries the
    // session — a thread that continued past it (another agent answered)
    // would lose that exchange.
    let resume = tail.session.clone().filter(|_| agent == "claude" && !thread_full);
    let spec = match resume {
        Some(sid) => CaptureSpec {
            cmdline: claude_cmdline(Some(&sid), &model, &effort, full_access, &message),
            agent: Some(agent),
            copy: tail.copy.clone(),
            question: Some(message),
            resumed: Some(sid),
            follows: Some(tail.at),
            fallback: Some(claude_cmdline(None, &model, &effort, full_access, &condensed)),
            compacted: false,
        },
        None => CaptureSpec {
            cmdline: agent_prompt_cmdline(&agent, &model, &effort, full_access, &condensed),
            agent: Some(agent),
            copy: tail.copy.clone(),
            question: Some(message),
            resumed: None,
            follows: Some(tail.at),
            fallback: None,
            compacted: true,
        },
    };
    match spawn_captured(&app, &key, &root, spec) {
        Dispatch::Ran => {
            emit_status(&app, &project, &job_id, RUNNING, &None);
            Ok(())
        }
        _ => Err("Couldn't start the reply.".into()),
    }
}

/// The duplicate project names a set of history entries worked in, each once.
fn copies_of(entries: &[HistoryEntry]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for e in entries {
        if let Some(c) = &e.copy {
            if !out.contains(c) {
                out.push(c.clone());
            }
        }
    }
    out
}

/// Delete a job-made copy alongside its history: only ever a duplicate (an
/// original can share a name with a stale record, but never gets torn down),
/// only while it still exists, and never the project the job belongs to.
fn remove_job_copy(app: &AppHandle, project: &str, copy: &str) -> Result<(), String> {
    if copy == project || !config::project_exists(copy) {
        return Ok(());
    }
    if config::peek_parent(copy).is_none() {
        return Ok(());
    }
    crate::projects_crud::remove_project(app.clone(), copy.to_string())
        .map_err(|e| format!("The run's copy \"{copy}\" couldn't be removed: {e}"))
}

fn remove_job_copies(app: &AppHandle, project: &str, copies: &[String]) -> Result<(), String> {
    let mut first_err = None;
    for copy in copies {
        if let Err(e) = remove_job_copy(app, project, copy) {
            first_err.get_or_insert(e);
        }
    }
    match first_err {
        Some(e) => Err(e),
        None => Ok(()),
    }
}

/// Whether the job has a run alive anywhere: this process's registries, or the
/// persisted lock / active-run record another lpm instance (or a
/// not-yet-reconciled previous process) may own. Copy deletion must never pass
/// while any of these stand — the copy on the block may be the very folder
/// that run is working in.
fn job_is_live(st: &JobState, key: &str) -> bool {
    st.running.is_some() || st.active_run.is_some() || running_since(key).is_some()
}

/// Remove one message from a job's feed — or, with `thread`, the whole
/// conversation it belongs to. With `delete_copies`, the duplicate projects
/// those runs worked in are torn down too, so reviewed copies don't pile up.
#[tauri::command(async)]
pub fn delete_job_history(
    app: AppHandle,
    project: String,
    job_id: String,
    at: u64,
    thread: bool,
    delete_copies: bool,
) -> Result<(), String> {
    let key = state_key(&project, &job_id);
    // The liveness check rides inside the same state lock as the mutation, so
    // a run can't slip in between — the UI disables removal while running,
    // but a run could have started since (or belong to another app instance).
    let removed = with_state(|f| {
        let Some(st) = f.jobs.get_mut(&key) else {
            return Ok(Vec::new());
        };
        if delete_copies && job_is_live(st, &key) {
            return Err("This job is running — wait for it to finish.".to_string());
        }
        Ok(remove_history_entries(&mut st.history, at, thread))
    })??;
    if delete_copies {
        remove_job_copies(&app, &project, &copies_of(&removed))?;
    }
    Ok(())
}

/// Forget a deleted job's saved state — run history, pause override, pending
/// work — so re-creating the same id later starts clean instead of inheriting
/// the old job's past. With `delete_copies`, duplicates its runs made and left
/// behind go too.
#[tauri::command(async)]
pub fn clear_job_state(
    app: AppHandle,
    project: String,
    job_id: String,
    delete_copies: bool,
) -> Result<(), String> {
    let key = state_key(&project, &job_id);
    let removed = with_state(|f| {
        if delete_copies {
            if let Some(st) = f.jobs.get(&key) {
                if job_is_live(st, &key) {
                    return Err("This job is running — wait for it to finish.".to_string());
                }
            }
        }
        Ok(f.jobs.remove(&key))
    })??;
    if delete_copies {
        if let Some(st) = removed {
            remove_job_copies(&app, &project, &copies_of(&st.history))?;
        }
    }
    Ok(())
}

/// The same, for a deleted all-projects job: drop its state in every project
/// where no other config layer still defines that id — a project or repo job
/// wearing the same id keeps its history (and its copies).
/// The project owning a `<project>/<jobId>` state key, when the key belongs to
/// `job_id`. Project names can't contain '/', so splitting at the first one is
/// exact — a suffix match would let job "nightly" swallow "review/nightly".
fn state_key_project<'a>(key: &'a str, job_id: &str) -> Option<&'a str> {
    key.split_once('/').filter(|(_, id)| *id == job_id).map(|(project, _)| project)
}

#[tauri::command(async)]
pub fn clear_job_state_global(
    app: AppHandle,
    job_id: String,
    delete_copies: bool,
) -> Result<(), String> {
    let keep: HashSet<String> = config::project_names()
        .into_iter()
        .filter(|p| resolve_jobs(p).iter().any(|(id, _, _)| *id == job_id))
        .collect();
    let removed = with_state(|f| {
        let doomed = |key: &str| {
            state_key_project(key, &job_id).is_some_and(|project| !keep.contains(project))
        };
        if delete_copies {
            for (key, st) in f.jobs.iter() {
                if doomed(key) && job_is_live(st, key) {
                    let project = state_key_project(key, &job_id).unwrap_or_default();
                    return Err(format!(
                        "This job is running in {project} — wait for it to finish."
                    ));
                }
            }
        }
        let mut dropped: Vec<(String, JobState)> = Vec::new();
        f.jobs.retain(|key, st| {
            if !doomed(key) {
                return true;
            }
            let project = state_key_project(key, &job_id).unwrap_or_default();
            dropped.push((project.to_string(), st.clone()));
            false
        });
        Ok(dropped)
    })??;
    if delete_copies {
        let mut first_err = None;
        for (project, st) in removed {
            if let Err(e) = remove_job_copies(&app, &project, &copies_of(&st.history)) {
                first_err.get_or_insert(e);
            }
        }
        if let Some(e) = first_err {
            return Err(e);
        }
    }
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

const LIVE_TAIL_CHARS: usize = 4_000;
const LIVE_READ_BYTES: u64 = 256 * 1024;

/// What the job's current run has said so far — the tail of its live log,
/// rendered readable — for the run pages to poll while it works. Null when
/// nothing is being captured (idle, or still in the check/duplicate phase).
#[tauri::command(async)]
pub fn job_live_output(project: String, job_id: String) -> Result<Value, String> {
    let st = load_job_state(&state_key(&project, &job_id));
    let Some(run) = st.active_run else {
        return Ok(Value::Null);
    };
    let raw = read_log_tail(Path::new(&run.log_path), LIVE_READ_BYTES);
    let text = match run.agent.as_deref() {
        Some("claude") => render_claude_stream(&raw).unwrap_or_default(),
        _ => raw,
    };
    Ok(json!({
        "startedAt": run.started_at,
        "text": tail_chars(&text, LIVE_TAIL_CHARS),
    }))
}

#[tauri::command(async)]
pub fn job_history(project: String, job_id: String) -> Result<Vec<Value>, String> {
    let st = load_job_state(&state_key(&project, &job_id));
    Ok(st
        .history
        .iter()
        .map(|h| {
            let mut o = json!({ "at": h.at, "result": h.result });
            if let Some(n) = h.count.filter(|n| *n > 1) {
                o["count"] = json!(n);
            }
            if let Some(c) = &h.copy {
                o["copy"] = json!(c);
            }
            if let Some(out) = &h.output {
                o["output"] = json!(out);
            }
            if let Some(d) = h.duration_secs {
                o["durationSecs"] = json!(d);
            }
            if let Some(c) = h.cost_usd {
                o["costUsd"] = json!(c);
            }
            if let Some(s) = &h.session {
                o["session"] = json!(s);
            }
            if let Some(r) = &h.resumed {
                o["resumed"] = json!(r);
            }
            if let Some(fl) = h.follows {
                o["follows"] = json!(fl);
            }
            if let Some(q) = &h.question {
                o["question"] = json!(q);
            }
            if h.compacted {
                o["compacted"] = json!(true);
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
            manual: false,
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
                full_access: true,
            },
        );
        assert_eq!(
            resolve_run(
                "p",
                &RunDef {
                    prompt: "upgrade".into(),
                    agent: "Codex".into(),
                    model: "gpt-5.6-sol".into(),
                    access: "Read".into(),
                    ..Default::default()
                }
            )
            .unwrap(),
            RunTarget::Prompt {
                prompt: "upgrade".into(),
                agent: "codex".into(),
                model: "gpt-5.6-sol".into(),
                effort: String::new(),
                full_access: false,
            },
        );
        assert!(resolve_run(
            "p",
            &RunDef { prompt: "x".into(), agent: "cursor".into(), ..Default::default() }
        )
        .is_err());
        assert!(resolve_run(
            "p",
            &RunDef { prompt: "x".into(), access: "sometimes".into(), ..Default::default() }
        )
        .is_err());
        // read-only can't be honored by opencode, so it's refused up front
        assert!(resolve_run(
            "p",
            &RunDef {
                prompt: "x".into(),
                agent: "opencode".into(),
                access: "read".into(),
                ..Default::default()
            }
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
    fn manual_never_auto_fires() {
        let now = 1_700_000_000u64;
        // Never due, no matter how long since the last (or never a) run.
        assert!(!is_due(&Schedule::Manual, 0, now, 0));
        assert!(!is_due(&Schedule::Manual, now, now + 10 * 86_400, 0));
        // And it has no next fire point.
        assert_eq!(next_fire_at(&Schedule::Manual, 0, 0, now), None);
    }

    #[test]
    fn resolve_manual_schedule() {
        let sched = ScheduleDef { manual: true, ..Default::default() };
        assert_eq!(resolve_schedule(&sched), Ok(Schedule::Manual));
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
        let total = HISTORY_CAP as u64 + 10;
        for i in 0..total {
            push_history(&mut st, i, FOUND_WORK, None);
        }
        assert_eq!(st.history.len(), HISTORY_CAP);
        // oldest entries dropped, newest kept
        assert_eq!(st.history.first().unwrap().at, total - HISTORY_CAP as u64);
        assert_eq!(st.history.last().unwrap().at, total - 1);

        let mut sk = JobState::default();
        push_history(&mut sk, 1, SKIPPED_OVERLAP, None);
        push_history(&mut sk, 2, SKIPPED_OVERLAP, None);
        push_history(&mut sk, 3, SKIPPED_OVERLAP, None);
        assert_eq!(sk.history.len(), 1);
        assert_eq!(sk.history[0].at, 3);
        assert_eq!(sk.history[0].count, Some(3));
        // a different result breaks the run
        push_history(&mut sk, 4, FOUND_WORK, None);
        assert_eq!(sk.history.len(), 2);
        assert_eq!(sk.history[1].count, None);
    }

    #[test]
    fn quiet_checks_collapse_without_hiding_real_runs() {
        let mut st = JobState::default();
        push_history(&mut st, 1, NOTHING_TO_DO, None);
        push_history(&mut st, 2, NOTHING_TO_DO, None);
        push_history(&mut st, 3, COMPLETED, None);
        push_history(&mut st, 4, NOTHING_TO_DO, None);
        push_history(&mut st, 5, NOTHING_TO_DO, None);
        push_history(&mut st, 6, NOTHING_TO_DO, None);
        let got: Vec<(u64, &str, Option<u32>)> =
            st.history.iter().map(|h| (h.at, h.result.as_str(), h.count)).collect();
        assert_eq!(
            got,
            [
                (2, NOTHING_TO_DO, Some(2)),
                (3, COMPLETED, None),
                (6, NOTHING_TO_DO, Some(3)),
            ],
        );
    }

    #[test]
    fn check_times_out_and_is_killed() {
        let root = std::env::temp_dir().to_string_lossy().into_owned();
        let start = std::time::Instant::now();
        let res = run_check(&root, "sleep 5", Duration::from_secs(1), None);
        assert!(res.is_err(), "a check that outlives its timeout must error");
        assert!(start.elapsed() < Duration::from_secs(4), "the check should be killed, not waited out");
    }

    #[test]
    fn wait_or_kill_times_out() {
        let root = std::env::temp_dir().to_string_lossy().into_owned();
        let mut child = shell_command(&root, "sleep 30").spawn().unwrap();
        let start = std::time::Instant::now();
        let verdict = wait_or_kill(&mut child, std::time::Instant::now() + Duration::from_millis(300), None);
        assert!(matches!(verdict, Ok(WaitVerdict::TimedOut)));
        assert!(start.elapsed() < Duration::from_secs(4), "the run should be killed, not waited out");
    }

    #[test]
    fn wait_or_kill_honors_stop_request() {
        let key = "test-cancel/job";
        let root = std::env::temp_dir().to_string_lossy().into_owned();
        let mut child = shell_command(&root, "sleep 30").spawn().unwrap();
        canceled_keys().lock().unwrap().insert(key.to_string());
        let start = std::time::Instant::now();
        let verdict = wait_or_kill(&mut child, std::time::Instant::now() + Duration::from_secs(60), Some(key));
        assert!(matches!(verdict, Ok(WaitVerdict::Canceled)));
        assert!(start.elapsed() < Duration::from_secs(4), "a stopped run should be killed promptly");
        assert!(take_canceled(key), "the flag stays for the caller to consume");
        assert!(!take_canceled(key), "consuming the flag clears it");
    }

    #[test]
    fn stop_only_flags_running_jobs() {
        let key = "test-stop/idle";
        assert!(!request_cancel(key), "a job with no live run must not be flagged");
        assert!(!is_cancel_requested(key));

        assert!(mark_inflight(key));
        assert!(request_cancel(key), "an inflight pipeline accepts a stop request");
        assert!(is_cancel_requested(key));
        clear_inflight(key);
        assert!(take_canceled(key));
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
    fn orphan_runs_salvage_results_from_the_log() {
        let run = ActiveRun {
            pid: 0,
            started_at: 100,
            log_path: String::new(),
            agent: None,
            copy: Some("proj-abc".into()),
            question: None,
            resumed: None,
            follows: None,
            compacted: false,
            boot_at: None,
        };
        let clean =
            "noise\n{\"result\":\"Did the work.\",\"session_id\":\"s-9\",\"total_cost_usd\":0.05}";
        let e = orphan_entry(&run, clean, false, false, 200, Some(180));
        assert_eq!(e.result, COMPLETED);
        assert_eq!(e.output.as_deref(), Some("Did the work."));
        assert_eq!(e.session.as_deref(), Some("s-9"));
        assert_eq!(e.copy.as_deref(), Some("proj-abc"));
        assert_eq!(e.duration_secs, Some(80));
        assert_eq!(e.cost_usd, Some(0.05));

        // no clean result line: honest error with whatever the log holds
        let e = orphan_entry(&run, "partial raw log", false, false, 200, None);
        assert_eq!(e.result, ERROR);
        assert_eq!(e.output.as_deref(), Some("partial raw log"));
        assert_eq!(e.duration_secs, None);

        let e = orphan_entry(&run, "", false, false, 200, None);
        assert_eq!(e.result, ERROR);
        assert!(e.output.unwrap().contains("app closed"));

        let e = orphan_entry(&run, "", true, false, 200, Some(150));
        assert_eq!(e.result, CANCELED);
        let e = orphan_entry(&run, "", false, true, 200, Some(150));
        assert_eq!(e.result, TIMED_OUT);
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
            agent_prompt_cmdline("claude", "", "", false, "fix it"),
            "claude -p --verbose --output-format stream-json 'fix it'"
        );
        assert_eq!(
            agent_prompt_cmdline("claude", "opus", "", false, "fix it"),
            "claude --model 'opus' -p --verbose --output-format stream-json 'fix it'"
        );
        assert_eq!(
            agent_prompt_cmdline("claude", "opus", "high", false, "fix it"),
            "claude --model 'opus' --effort 'high' -p --verbose --output-format stream-json 'fix it'"
        );
        assert_eq!(
            agent_prompt_cmdline("codex", "gpt-5.6-sol", "", false, "fix"),
            "codex exec --skip-git-repo-check -m 'gpt-5.6-sol' 'fix'"
        );
        assert_eq!(
            agent_prompt_cmdline("codex", "gpt-5.6-sol", "high", false, "fix"),
            "codex exec --skip-git-repo-check -m 'gpt-5.6-sol' -c model_reasoning_effort='high' 'fix'"
        );
        assert_eq!(
            agent_prompt_cmdline("claude", "", "max", false, "fix it"),
            "claude --effort 'max' -p --verbose --output-format stream-json 'fix it'"
        );
        assert_eq!(agent_prompt_cmdline("gemini", "", "", false, "fix"), "gemini -o json -p 'fix'");
        assert_eq!(agent_prompt_cmdline("opencode", "", "", false, "fix"), "opencode run 'fix'");
    }

    #[test]
    fn full_access_cmdlines_grant_unattended_mode() {
        assert_eq!(
            agent_prompt_cmdline("claude", "", "", true, "fix it"),
            "claude --dangerously-skip-permissions -p --verbose --output-format stream-json 'fix it'"
        );
        assert_eq!(
            agent_prompt_cmdline("claude", "haiku", "low", true, "fix it"),
            "claude --model 'haiku' --effort 'low' --dangerously-skip-permissions -p --verbose --output-format stream-json 'fix it'"
        );
        assert_eq!(
            agent_prompt_cmdline("codex", "", "", true, "fix"),
            "codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox 'fix'"
        );
        assert_eq!(
            agent_prompt_cmdline("gemini", "", "", true, "fix"),
            "gemini --yolo -o json -p 'fix'"
        );
        assert_eq!(agent_prompt_cmdline("opencode", "", "", true, "fix"), "opencode run 'fix'");
    }

    #[test]
    fn context_limit_error_is_recognized() {
        assert!(hit_context_limit(Some("API Error: 400 … Prompt is too long")));
        assert!(hit_context_limit(Some("prompt is too long: 210000 tokens > 200000 maximum")));
        assert!(!hit_context_limit(Some("some other failure")));
        assert!(!hit_context_limit(None));
    }

    #[test]
    fn output_capping_keeps_the_right_end() {
        assert_eq!(head_chars("short", 100), "short");
        let long: String = "a".repeat(50) + &"b".repeat(100);
        let head = head_chars(&long, 60);
        assert!(head.starts_with("aaaaa"));
        assert!(head.contains("shortened"));
        let tail = tail_chars(&long, 60);
        assert!(tail.ends_with("bbbbb"));
        assert!(!tail.contains('a'));
    }

    #[test]
    fn result_text_extraction() {
        let raw = "hook: Stop\ntokens used\n50310\n{\"type\":\"result\",\"result\":\"All good.\\n\\n- item\",\"total_cost_usd\":0.42,\"session_id\":\"abc-123\"}\n";
        let (text, session, cost) = extract_result(raw).unwrap();
        assert_eq!(text, "All good.\n\n- item");
        assert_eq!(session.as_deref(), Some("abc-123"));
        assert_eq!(cost, Some(0.42));
        assert_eq!(extract_result("plain log output\nno json here"), None);
        assert_eq!(extract_result("{\"result\":\"\"}\n"), None);
        // the last result object wins even with trailing noise after it
        let noisy = "{\"result\":\"first\"}\nhook: Stop\n{\"result\":\"final\"}\ntrailing";
        let (text, session, cost) = extract_result(noisy).unwrap();
        assert_eq!(text, "final");
        assert_eq!(session, None);
        assert_eq!(cost, None);
    }

    #[test]
    fn gemini_json_output_extraction() {
        // Pretty-printed response object after credential noise, with trailing
        // chatter — the response text comes out clean.
        let raw = "Loaded cached credentials.\n{\n  \"response\": \"All deps current.\",\n  \"stats\": {\n    \"models\": {}\n  }\n}\ntrailing note";
        let (text, session, cost) = extract_gemini(raw).unwrap();
        assert_eq!(text, "All deps current.");
        assert_eq!(session, None);
        assert_eq!(cost, None);
        // Single-line form works too, and the last object wins.
        let raw = "{\"response\":\"old\"}\n{\"response\":\"new\"}";
        assert_eq!(extract_gemini(raw).unwrap().0, "new");
        // No response object → nothing extracted, the raw tail stands.
        assert_eq!(extract_gemini("plain failure text"), None);
        assert_eq!(extract_gemini("{\"error\":\"quota\"}"), None);
        assert_eq!(extract_gemini("{\"response\":\"\"}"), None);
    }

    #[test]
    fn codex_sidecar_extraction_reads_the_last_message() {
        let dir = std::env::temp_dir().join(format!("lpm-jobs-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let log = dir.join("run.log");
        assert_eq!(extract_codex(&log), None, "no sidecar yet");
        std::fs::write(last_message_path(&log), "  Fixed the flaky test.\n").unwrap();
        assert_eq!(extract_codex(&log).unwrap().0, "Fixed the flaky test.");
        std::fs::write(last_message_path(&log), "   \n").unwrap();
        assert_eq!(extract_codex(&log), None, "an empty sidecar is no message");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn claude_stream_renders_readably() {
        let raw = concat!(
            "{\"type\":\"system\",\"subtype\":\"init\",\"session_id\":\"s\"}\n",
            "{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"Looking at the tests.\"}]}}\n",
            "{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"tool_use\",\"name\":\"Bash\",\"input\":{}}]}}\n",
            "{\"type\":\"user\",\"message\":{\"content\":[{\"type\":\"tool_result\",\"content\":\"huge dump\"}]}}\n",
            "hook: Stop\n",
            "{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"Done.\"}]}}\n",
            "{\"type\":\"assistant\",\"mess", // partial write of the next event
        );
        let got = render_claude_stream(raw).unwrap();
        assert_eq!(got, "Looking at the tests.\n→ Bash\nhook: Stop\nDone.");
        assert_eq!(render_claude_stream(""), None);
        // A log with only unparseable JSON renders to nothing → raw tail wins.
        assert_eq!(render_claude_stream("{\"type\":\"user\",\"message\":{}}"), None);
        // Plain stderr (an API failure) is kept — it's why the run died.
        assert_eq!(render_claude_stream("API Error: overloaded").unwrap(), "API Error: overloaded");
    }

    #[test]
    fn log_tail_reads_from_a_line_boundary() {
        let dir = std::env::temp_dir().join(format!("lpm-jobs-tail-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("t.log");
        std::fs::write(&path, "first line\nsecond line\nthird line\n").unwrap();
        assert_eq!(read_log_tail(&path, 1024), "first line\nsecond line\nthird line\n");
        // A capped read drops the chopped first line instead of garbling it.
        assert_eq!(read_log_tail(&path, 17), "third line\n");
        assert_eq!(read_log_tail(&dir.join("missing.log"), 64), "");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn resume_cmdline_continues_the_session() {
        assert_eq!(
            claude_cmdline(Some("abc-123"), "", "", true, "yes, proceed"),
            "claude --resume 'abc-123' --dangerously-skip-permissions -p --verbose --output-format stream-json 'yes, proceed'"
        );
        assert_eq!(
            claude_cmdline(Some("abc-123"), "haiku", "low", false, "why?"),
            "claude --resume 'abc-123' --model 'haiku' --effort 'low' -p --verbose --output-format stream-json 'why?'"
        );
    }

    #[test]
    fn codex_runs_write_a_last_message_sidecar() {
        let log = Path::new("/tmp/logs/proj_job-5.log");
        assert_eq!(
            capture_cmdline(Some("codex"), "codex exec 'fix'", log),
            "codex exec 'fix' --output-last-message '/tmp/logs/proj_job-5.last'"
        );
        // Every other runner's command line passes through untouched.
        assert_eq!(capture_cmdline(Some("claude"), "claude -p 'x'", log), "claude -p 'x'");
        assert_eq!(capture_cmdline(None, "make build", log), "make build");
    }

    fn entry(
        at: u64,
        result: &str,
        output: Option<&str>,
        session: Option<&str>,
        question: Option<&str>,
        resumed: Option<&str>,
    ) -> HistoryEntry {
        HistoryEntry {
            at,
            result: result.to_string(),
            output: output.map(str::to_string),
            session: session.map(str::to_string),
            question: question.map(str::to_string),
            resumed: resumed.map(str::to_string),
            ..HistoryEntry::default()
        }
    }

    #[test]
    fn threads_group_replies_with_their_run() {
        let history = vec![
            entry(1, COMPLETED, Some("run A"), Some("a1"), None, None),
            entry(2, NOTHING_TO_DO, None, None, None, None),
            entry(3, COMPLETED, Some("run B"), Some("b1"), None, None),
            entry(4, COMPLETED, Some("re A"), Some("a2"), Some("why?"), Some("a1")),
            // A sessionless exchange (another agent answered) still belongs to
            // thread A via its resume link.
            entry(5, COMPLETED, Some("codex says"), None, Some("ask codex"), Some("a2")),
        ];
        let a = thread_entries(&history, "a1");
        assert_eq!(a.iter().map(|e| e.at).collect::<Vec<_>>(), vec![1, 4, 5]);
        let b = thread_entries(&history, "b1");
        assert_eq!(b.iter().map(|e| e.at).collect::<Vec<_>>(), vec![3]);

        let digest = digest_of(&thread_entries(&history, "a2"));
        assert!(digest.contains("run A"));
        assert!(digest.contains("why?"));
        assert!(digest.contains("codex says"));
        assert!(!digest.contains("run B"));

        let is_full = |h: &[HistoryEntry], s: &str| {
            thread_entries(h, s).iter().any(|e| e.result == CONTEXT_FULL)
        };
        assert!(!is_full(&history, "a1"));
        let mut full = history.clone();
        full.push(entry(6, CONTEXT_FULL, None, None, Some("more?"), Some("a2")));
        assert!(is_full(&full, "a1"));
        assert!(!is_full(&full, "b1"));
    }

    #[test]
    fn sessionless_runs_thread_and_delete_via_follows() {
        let follows = |at: u64, f: u64, q: &str, out: &str| HistoryEntry {
            at,
            result: COMPLETED.to_string(),
            output: Some(out.to_string()),
            question: Some(q.to_string()),
            follows: Some(f),
            ..HistoryEntry::default()
        };
        // A codex run (no session) takes replies chained purely by `follows`.
        let mut history = vec![
            entry(1, COMPLETED, Some("codex run"), None, None, None),
            entry(2, COMPLETED, Some("run B"), Some("b1"), None, None),
            follows(3, 1, "and then?", "codex reply"),
            follows(4, 3, "more?", "codex reply 2"),
        ];
        let groups = thread_groups(&history);
        assert_eq!(groups, vec![vec![0, 2, 3], vec![1]]);

        // Deleting one reply keeps the rest of the thread.
        let removed = remove_history_entries(&mut history, 4, false);
        assert_eq!(removed.iter().map(|e| e.at).collect::<Vec<_>>(), [4]);
        assert_eq!(thread_groups(&history), vec![vec![0, 2], vec![1]]);
        // Deleting the root with `thread` removes the whole conversation and
        // hands back its entries — where copy cleanup finds its targets.
        let removed = remove_history_entries(&mut history, 1, true);
        assert_eq!(removed.iter().map(|e| e.at).collect::<Vec<_>>(), [1, 3]);
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].at, 2);
        assert!(remove_history_entries(&mut history, 99, true).is_empty());
    }

    #[test]
    fn state_keys_match_on_the_first_slash_only() {
        assert_eq!(state_key_project("web/nightly", "nightly"), Some("web"));
        // A job id containing '/' matches exactly, never as a suffix of a
        // longer id — "nightly" must not swallow "review/nightly".
        assert_eq!(state_key_project("web/review/nightly", "nightly"), None);
        assert_eq!(state_key_project("web/review/nightly", "review/nightly"), Some("web"));
        assert_eq!(state_key_project("web/other", "nightly"), None);
        assert_eq!(state_key_project("no-slash", "nightly"), None);
    }

    #[test]
    fn live_jobs_refuse_copy_deletion() {
        let mut st = JobState::default();
        assert!(!job_is_live(&st, "quiet/job"));
        st.running = Some(RunningLock { started_at: 1 });
        assert!(job_is_live(&st, "quiet/job"));
        st.running = None;
        st.active_run = Some(ActiveRun {
            pid: 0,
            started_at: 1,
            log_path: String::new(),
            agent: None,
            copy: None,
            question: None,
            resumed: None,
            follows: None,
            compacted: false,
            boot_at: None,
        });
        assert!(job_is_live(&st, "quiet/job"));
    }

    #[test]
    fn copies_dedupe_across_a_thread() {
        let with_copy = |at: u64, copy: Option<&str>| HistoryEntry {
            at,
            result: COMPLETED.to_string(),
            copy: copy.map(str::to_string),
            ..HistoryEntry::default()
        };
        let entries = vec![
            with_copy(1, Some("proj-copy")),
            with_copy(2, None),
            with_copy(3, Some("proj-copy")),
            with_copy(4, Some("proj-copy-2")),
        ];
        assert_eq!(copies_of(&entries), ["proj-copy", "proj-copy-2"]);
        assert!(copies_of(&[with_copy(1, None)]).is_empty());
    }

    #[test]
    fn latest_session_entry_wins_for_replies() {
        let mut st = JobState::default();
        push_entry(&mut st, entry(1, COMPLETED, Some("old"), Some("sid-old"), None, None));
        push_history(&mut st, 2, NOTHING_TO_DO, None);
        push_entry(
            &mut st,
            entry(3, COMPLETED, Some("new"), Some("sid-new"), Some("go on"), Some("sid-old")),
        );
        let by_session =
            st.history.iter().rev().find(|h| h.session.as_deref() == Some("sid-old")).unwrap();
        assert_eq!(by_session.output.as_deref(), Some("old"));
        let reply = st.history.iter().rev().find(|h| h.resumed.is_some()).unwrap();
        assert_eq!(reply.resumed.as_deref(), Some("sid-old"));
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

    fn def_with_projects(projects: Option<Vec<&str>>) -> JobDef {
        JobDef {
            projects: projects.map(|list| list.into_iter().map(str::to_string).collect()),
            ..Default::default()
        }
    }

    #[test]
    fn job_targets_reads_the_projects_field() {
        assert_eq!(job_targets(&def_with_projects(None)), JobTargets::Every);
        assert_eq!(job_targets(&def_with_projects(Some(vec![]))), JobTargets::Standalone);
        assert_eq!(
            job_targets(&def_with_projects(Some(vec!["web", "api"]))),
            JobTargets::Projects(vec!["web".into(), "api".into()]),
        );
    }

    #[test]
    fn global_jobs_filter_by_project_target() {
        // Legacy every-project job resolves everywhere.
        assert!(global_resolves_for(&def_with_projects(None), "web"));
        // A scoped job resolves only under its listed projects.
        let scoped = def_with_projects(Some(vec!["web"]));
        assert!(global_resolves_for(&scoped, "web"));
        assert!(!global_resolves_for(&scoped, "api"));
        // A standalone job never resolves under a real project.
        assert!(!global_resolves_for(&def_with_projects(Some(vec![])), "web"));
    }
}
