// Scheduled jobs: per-project tasks that fire on a schedule, optionally run a
// cheap `check`, and — when there is work — optionally duplicate the project and
// run a command / action / agent prompt in the copy. The scheduler is a plain
// wall-clock thread modelled on updates::start_auto_check so it survives sleep,
// and the pipeline runs on worker threads so one slow job never stalls the tick.
use crate::config;
use askform::Ask;
use crate::jobcal::{self, AtValue, DateRule, DaysValue, IntervalLimits, ParsedDays, DAY_NAMES};
use crate::notifychannels::NotificationEvent;
use crate::sendto;
use chrono::{Datelike, TimeZone};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

const TICK: Duration = Duration::from_secs(60);
// Five minutes, not one: the scheduler ticks once a minute, a run can easily
// outlive a shorter gap and spend the rest of the day skipped for overlap, and
// every run keeps its own log for a fortnight.
const MIN_INTERVAL_SECS: u64 = 300;
const STALE_LOCK_SECS: u64 = 6 * 3600;
const CHECK_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const RUN_TIMEOUT: Duration = Duration::from_secs(60 * 60);
const VERIFY_TIMEOUT: Duration = Duration::from_secs(15 * 60);
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
const SKIPPED_CAPACITY: &str = "skipped-capacity";
// Event-only status emitted when a run starts, never written to history.
const RUNNING: &str = "running";
// Event-only status for a quiet job's run that found nothing: it leaves no
// entry and interrupts no one.
const QUIET: &str = "quiet";
// Event-only status for a run that put a question to the user and is waiting
// for the answer.
const ASKED: &str = "asked";

/// The whole reply a quiet job's agent gives when its run turned up nothing.
const NOTHING_TO_REPORT: &str = "NOTHING_TO_REPORT";
const QUIET_INSTRUCTION: &str = "If you find nothing new or worth reporting, reply with exactly NOTHING_TO_REPORT and nothing else.";
const ASK_INSTRUCTION: &str = "If you can't go on without a decision or information only the user has, ask them with `lpm ask` (yes/no: `lpm ask \"Deploy to staging?\" --confirm`; a pick from a list: `lpm ask \"Which region?\" --choice us-east --choice eu-west`; free text: `lpm ask \"What should the release be called?\" --text`; `lpm ask --help` for more), then end your turn: their answer comes back as your next message. Only the user answers it; never answer or dismiss it yourself. Don't ask about anything you can decide yourself.";

pub(crate) mod ask;
pub(crate) mod askform;
pub(crate) mod machines;
mod runstep;
mod signin;
pub(crate) mod takeover;

// ---- config parsing ---------------------------------------------------------

#[derive(Deserialize, Default)]
struct JobsYaml {
    #[serde(default)]
    jobs: BTreeMap<String, serde_norway::Value>,
}

/// A layer's jobs, each parsed on its own so one unreadable job stays one
/// unreadable job.
type JobEntries = BTreeMap<String, Result<JobDef, String>>;

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
    verify: String,
    #[serde(default)]
    duplicate: DuplicateDef,
    run: Option<RunDef>,
    enabled: Option<bool>,
    /// Only meaningful on the global layer: which projects a shared job runs in.
    /// Absent = every project (legacy); a non-empty list = those projects; an
    /// empty list = standalone (no project, runs in the home directory).
    #[serde(default)]
    projects: Option<Vec<String>>,
    /// Where the job's results go (see sendto.rs); absent = lpm alone.
    #[serde(default, rename = "sendTo")]
    send_to: Option<SendToValue>,
    /// The Macs that may run the job, by hostId, best first (see
    /// jobs/machines.rs); absent = every Mac that has it.
    #[serde(default)]
    machines: Option<machines::MachinesValue>,
}

/// `sendTo: telegram` or `sendTo: [lpm, telegram]`.
#[derive(Deserialize, Clone)]
#[serde(untagged)]
enum SendToValue {
    One(String),
    Many(Vec<String>),
}

/// `duplicate: true` stays readable forever — an older build that meets the
/// options form would otherwise fail to read the job at all.
#[derive(Deserialize, Clone)]
#[serde(untagged)]
enum DuplicateDef {
    On(bool),
    Options(DuplicateOptions),
}

impl Default for DuplicateDef {
    fn default() -> Self {
        DuplicateDef::On(false)
    }
}

#[derive(Deserialize, Default, Clone)]
struct DuplicateOptions {
    #[serde(default)]
    mode: String,
    #[serde(rename = "pullLatest")]
    pull_latest: Option<bool>,
    #[serde(rename = "reinstallDeps")]
    reinstall_deps: Option<bool>,
    #[serde(rename = "excludeUncommitted")]
    exclude_uncommitted: Option<bool>,
}

#[derive(Clone, Debug, Default, PartialEq)]
struct DuplicateSpec {
    enabled: bool,
    worktree: bool,
    pull_latest: bool,
    reinstall_deps: bool,
    exclude_uncommitted: bool,
}

/// How a job makes its copy is part of the job. It used to be read from the
/// settings the bulk-duplicate dialog remembers, so ticking a box in that
/// dialog silently changed what every scheduled job did — and the worktree
/// setting it looked for was never written by anything, leaving worktree mode
/// unreachable.
fn resolve_duplicate(def: &DuplicateDef) -> Result<DuplicateSpec, String> {
    let opts = match def {
        DuplicateDef::On(false) => return Ok(DuplicateSpec::default()),
        DuplicateDef::On(true) => DuplicateOptions::default(),
        DuplicateDef::Options(o) => o.clone(),
    };
    let worktree = match opts.mode.trim() {
        "" | "copy" => false,
        "worktree" => true,
        other => return Err(format!("\"{other}\" isn't a way to copy a project.")),
    };
    Ok(DuplicateSpec {
        enabled: true,
        worktree,
        // A worktree shares the original's history and working files, so
        // pulling into it and leaving uncommitted work behind don't apply.
        pull_latest: !worktree && opts.pull_latest.unwrap_or(true),
        reinstall_deps: opts.reinstall_deps.unwrap_or(false),
        exclude_uncommitted: !worktree && opts.exclude_uncommitted.unwrap_or(false),
    })
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
    /// One time of day, or a list of them.
    #[serde(default)]
    at: AtValue,
    /// End of the window the run lands somewhere inside, instead of `at` being
    /// the fire point itself.
    #[serde(default)]
    until: String,
    /// Runs per day, spread across that window.
    times: Option<u32>,
    #[serde(default)]
    days: DaysValue,
    /// For dates of the month: run a date a short month lacks on its last day
    /// (`last`) or skip that month (`skip`, the default).
    #[serde(default, rename = "shortMonths")]
    short_months: String,
    /// Use only this many of `days` each week, chosen at random.
    #[serde(default, rename = "pickDays")]
    pick_days: Option<u32>,
    every: Option<EveryValue>,
    /// The job never fires on its own — it only runs when started by hand.
    #[serde(default)]
    manual: bool,
    /// A five-field cron line, standing in for every other timing key.
    #[serde(default)]
    cron: String,
}

/// `every: 6h` / `every: 2d` (string with an h/d suffix) or a bare integer read
/// as hours — both collapse to a whole number of seconds. A string may also name
/// a band (`4h-8h`), which every gap is drawn from.
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
    /// Report only runs that found something: the agent answers
    /// NOTHING_TO_REPORT otherwise, and that run leaves no trace.
    #[serde(default)]
    quiet: bool,
    /// Every run recalls and saves the job's lpm-memory session (jobmemory.rs).
    #[serde(default)]
    memory: bool,
    /// The Claude account its runs use, `""` being the main login; absent
    /// leaves it to the project.
    #[serde(default, rename = "claudeAccount")]
    claude_account: Option<String>,
}

const CLAUDE: &str = "claude";
const CLAUDE_FULL_ACCESS: &str = " --dangerously-skip-permissions";
const KNOWN_AGENTS: [&str; 4] = [CLAUDE, "codex", "gemini", "opencode"];

/// A time-of-day schedule. `at_min` is minutes since local midnight and `days`
/// are weekday numbers (0 = Mon .. 6 = Sun), empty meaning every day. The three
/// optional fields make the job's timing deliberately unpredictable: `until_min`
/// opens a window the run lands somewhere inside rather than at a fixed minute,
/// `times` puts more than one run in that window, and `pick_days` uses only some
/// of `days` each week. Every choice is drawn from the job's own seed, so it is
/// the same answer on every tick and after a restart with nothing written down.
#[derive(Clone, Debug, PartialEq)]
struct CalendarSpec {
    at_min: u32,
    /// Further fixed times on the same days, later than `at_min`.
    also_at: Vec<u32>,
    until_min: Option<u32>,
    times: u32,
    days: Vec<u8>,
    pick_days: Option<u32>,
    /// Dates of the month, a position in it, or calendar dates — replaces
    /// `days` when set.
    dates: Option<DateRule>,
}

#[derive(Clone, Debug, PartialEq)]
enum Schedule {
    /// Each gap is drawn from `min_secs..=max_secs`; the two are equal for a
    /// plain fixed interval.
    Interval {
        min_secs: u64,
        max_secs: u64,
        limits: Option<IntervalLimits>,
    },
    Calendar(CalendarSpec),
    Cron(crate::jobcron::CronSpec),
    /// Never fires automatically; runs only when started by hand.
    Manual,
}

#[derive(Clone, Debug, PartialEq)]
enum RunTarget {
    /// `prompt` is handed to the agent a terminal action launches, once it's
    /// ready; empty leaves the action's own prompt (if any) in charge.
    Action {
        name: String,
        prompt: String,
    },
    Cmd(String),
    /// `full_access` grants the agent its autonomous mode (edit files, run
    /// commands); without it a headless run can only read and report — any
    /// "may I proceed?" question it asks has no one to answer it.
    Prompt {
        prompt: String,
        agent: String,
        model: String,
        effort: String,
        full_access: bool,
        quiet: bool,
        memory: bool,
        claude_account: Option<String>,
    },
}

struct JobResolved {
    id: String,
    label: String,
    emoji: String,
    schedule: Schedule,
    check: String,
    verify: String,
    duplicate: DuplicateSpec,
    run: RunTarget,
    enabled: bool,
    send_to: Vec<String>,
    machines: Option<machines::Machines>,
}

fn parse_every_secs(v: &EveryValue) -> Result<u64, String> {
    let secs = match v {
        EveryValue::Int(h) => {
            if *h <= 0 {
                return Err("The interval must be at least 5 minutes.".into());
            }
            (*h as u64) * 3600
        }
        EveryValue::Str(s) => {
            let s = s.trim().to_lowercase();
            let (num, mult) = if let Some(n) = s.strip_suffix('m') {
                (n.trim(), 60u64)
            } else if let Some(n) = s.strip_suffix('h') {
                (n.trim(), 3600u64)
            } else if let Some(n) = s.strip_suffix('d') {
                (n.trim(), 86_400u64)
            } else {
                (s.as_str(), 3600u64)
            };
            let n: u64 = num
                .parse()
                .map_err(|_| "The interval isn't a valid length.".to_string())?;
            n.checked_mul(mult)
                .ok_or_else(|| "The interval is too large.".to_string())?
        }
    };
    if secs < MIN_INTERVAL_SECS {
        return Err("The interval must be at least 5 minutes.".into());
    }
    Ok(secs)
}

/// `every: 4h-8h` (or `4-8h`, which carries the unit once) is a band: the gap
/// after each run is drawn from it. Anything else is the degenerate band whose
/// ends match.
fn parse_every_band(v: &EveryValue) -> Result<(u64, u64), String> {
    let fixed = |v: &EveryValue| parse_every_secs(v).map(|s| (s, s));
    let EveryValue::Str(raw) = v else {
        return fixed(v);
    };
    let raw = raw.trim().to_lowercase();
    let Some((lo, hi)) = raw.split_once('-') else {
        return fixed(v);
    };
    let (lo, hi) = (lo.trim(), hi.trim());
    if lo.is_empty() || hi.is_empty() {
        return Err("The interval isn't a valid length.".into());
    }
    let has_unit = |s: &str| s.ends_with(['m', 'h', 'd']);
    let lo = if has_unit(hi) && !has_unit(lo) {
        format!("{lo}{}", &hi[hi.len() - 1..])
    } else {
        lo.to_string()
    };
    let min = parse_every_secs(&EveryValue::Str(lo))?;
    let max = parse_every_secs(&EveryValue::Str(hi.to_string()))?;
    if max < min {
        return Err("The longest gap has to be at least the shortest.".into());
    }
    Ok((min, max))
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

fn resolve_calendar(sched: &ScheduleDef) -> Result<CalendarSpec, String> {
    let mut ats: Vec<u32> = Vec::new();
    for at in sched.at.items() {
        let m = parse_at_minutes(at)?;
        if !ats.contains(&m) {
            ats.push(m);
        }
    }
    ats.sort_unstable();
    let at_min = ats[0];
    let also_at = ats[1..].to_vec();

    let (days, dates) = match jobcal::parse_days(&sched.days, &sched.short_months)? {
        ParsedDays::Weekdays(days) => (days, None),
        ParsedDays::Rule(rule) => (Vec::new(), Some(rule)),
    };

    let until = sched.until.trim();
    let until_min = if until.is_empty() {
        None
    } else {
        Some(parse_at_minutes(until)?)
    };
    if until_min.is_some() && !also_at.is_empty() {
        return Err("A window starts at one time, not a list of them.".into());
    }
    if until_min.is_some_and(|u| u <= at_min) {
        return Err("The window has to end after it starts.".into());
    }

    let times = sched.times.unwrap_or(1).max(1);
    match until_min {
        None if times > 1 => return Err("Give the job a window to spread its runs across.".into()),
        // Each run gets an equal slice of the window to land in, and a slice has
        // to be wide enough that two runs can't collapse into one tick.
        Some(u) if ((u - at_min) as u64) * 60 / (times as u64) < MIN_INTERVAL_SECS => {
            return Err("That's more runs than the window has room for.".into())
        }
        _ => {}
    }
    if let Some(gap) = ats.windows(2).map(|w| w[1] - w[0]).min() {
        if (gap as u64) * 60 < MIN_INTERVAL_SECS {
            return Err("Keep the times at least 5 minutes apart.".into());
        }
    }

    if dates.is_some() && sched.pick_days.is_some() {
        return Err("Picking days at random works with days of the week only.".into());
    }
    let pick_days = resolve_pick_days(sched.pick_days, &days)?;
    Ok(CalendarSpec {
        at_min,
        also_at,
        until_min,
        times,
        days,
        pick_days,
        dates,
    })
}

/// How many of the job's days to use each week. Asking for as many as it has (or
/// more than exist) is just "all of them", which needs no drawing.
fn resolve_pick_days(pick: Option<u32>, days: &[u8]) -> Result<Option<u32>, String> {
    let pool = if days.is_empty() { 7 } else { days.len() };
    match pick {
        None => Ok(None),
        Some(0) => Err("Pick at least one day.".into()),
        Some(n) if n as usize > pool => Err(format!(
            "This job only has {pool} day{} to pick from.",
            if pool == 1 { "" } else { "s" }
        )),
        Some(n) if n as usize == pool => Ok(None),
        Some(n) => Ok(Some(n)),
    }
}

fn resolve_schedule(sched: &ScheduleDef) -> Result<Schedule, String> {
    if sched.manual {
        return Ok(Schedule::Manual);
    }
    let cron = sched.cron.trim();
    if !cron.is_empty() {
        let no_days = matches!(&sched.days, DaysValue::List(v) if v.is_empty());
        if sched.every.is_some() || !sched.at.is_empty() || !no_days {
            return Err("A cron line says when the job runs on its own — drop at, every and days.".into());
        }
        return crate::jobcron::parse(cron, MIN_INTERVAL_SECS).map(Schedule::Cron);
    }
    match (&sched.every, sched.at.is_empty()) {
        (Some(every), _) => resolve_interval(sched, every),
        (None, false) => Ok(Schedule::Calendar(resolve_calendar(sched)?)),
        (None, true) => Err("Give this job a time or an interval.".into()),
    }
}

/// An interval job may be held to a daily window (`at` … `until`) and to some
/// weekdays; between those it keeps its own gap.
fn resolve_interval(sched: &ScheduleDef, every: &EveryValue) -> Result<Schedule, String> {
    if sched.times.is_some() {
        return Err("Runs a day belong to a job that runs at a time of day.".into());
    }
    if sched.pick_days.is_some() {
        return Err("Picking days belongs to a job that runs at a time of day.".into());
    }
    let ats = sched.at.items();
    let until = sched.until.trim();
    let window = match (ats.as_slice(), until.is_empty()) {
        ([], true) => None,
        ([at], false) => {
            let (from, to) = (parse_at_minutes(at)?, parse_at_minutes(until)?);
            if to <= from {
                return Err("The window has to end after it starts.".into());
            }
            Some((from, to))
        }
        ([], false) => return Err("Give the window a start time.".into()),
        ([_], true) => return Err("Give the window an end time.".into()),
        _ => return Err("An interval takes one window, not a list of times.".into()),
    };
    let days = match jobcal::parse_days(&sched.days, &sched.short_months)? {
        ParsedDays::Weekdays(days) => days,
        ParsedDays::Rule(_) => {
            return Err("An interval can only be limited to days of the week.".into())
        }
    };
    let (min_secs, max_secs) = parse_every_band(every)?;
    let limits = (window.is_some() || !days.is_empty()).then_some(IntervalLimits { window, days });
    Ok(Schedule::Interval {
        min_secs,
        max_secs,
        limits,
    })
}

fn resolve_run(project: &str, run: &RunDef) -> Result<RunTarget, String> {
    let action = run.action.trim();
    let cmd = run.cmd.trim();
    let prompt = run.prompt.trim();
    // An action may carry a prompt for the agent it launches; otherwise the
    // three are alternatives.
    let count = [!action.is_empty(), !cmd.is_empty(), !prompt.is_empty() && action.is_empty()]
        .iter()
        .filter(|b| **b)
        .count();
    if count == 0 {
        return Err("Give this job an action, a command, or a prompt to run.".into());
    }
    if count > 1 {
        return Err("A job can run only one of an action, a command, or a prompt.".into());
    }
    // Only an agent can be asked to say it found nothing.
    if run.quiet && (!action.is_empty() || !cmd.is_empty()) {
        return Err("Staying quiet when nothing is found is only for AI prompts.".into());
    }
    if run.memory && (!action.is_empty() || !cmd.is_empty()) {
        return Err("Remembering earlier runs is only for AI prompts.".into());
    }
    if run.claude_account.is_some() && (!action.is_empty() || !cmd.is_empty()) {
        return Err("Picking a Claude account is only for AI prompts.".into());
    }
    let claude_account = resolve_claude_account(run.claude_account.as_deref())?;
    if !action.is_empty() {
        let Some(resolved) = config::resolve_action_full(project, action) else {
            return Err(format!(
                "The action \"{action}\" doesn't exist in this project."
            ));
        };
        if !prompt.is_empty() && resolved.kind != "terminal" {
            return Err("Only an action that opens a terminal can take a prompt.".into());
        }
        return Ok(RunTarget::Action {
            name: action.to_string(),
            prompt: prompt.to_string(),
        });
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
        return Err(
            "OpenCode always runs with full access — pick another agent for a read-only job."
                .into(),
        );
    }
    Ok(RunTarget::Prompt {
        prompt: prompt.to_string(),
        agent,
        model: run.model.trim().to_string(),
        effort: run.effort.trim().to_lowercase(),
        full_access: access != "read",
        quiet: run.quiet,
        // A read-only run can't write the session, so it has nothing to remember.
        memory: run.memory && access != "read",
        claude_account,
    })
}

/// `default`, the main login's name in account lists, means `""` here too.
fn resolve_claude_account(id: Option<&str>) -> Result<Option<String>, String> {
    let Some(id) = id.map(str::trim) else {
        return Ok(None);
    };
    if id.is_empty() || id == crate::claude_dirs::MAIN_LOGIN {
        return Ok(Some(String::new()));
    }
    if !config::valid_claude_account_id(id) {
        return Err(format!("\"{id}\" isn't a Claude account."));
    }
    Ok(Some(id.to_string()))
}

impl JobResolved {
    fn quiet(&self) -> bool {
        matches!(self.run, RunTarget::Prompt { quiet: true, .. })
    }

    fn claude_account(&self) -> Option<&str> {
        match &self.run {
            RunTarget::Prompt { claude_account, .. } => claude_account.as_deref(),
            _ => None,
        }
    }

    fn sends_to(&self, destination: &str) -> bool {
        self.send_to.iter().any(|d| d == destination)
    }
}

fn resolve_send_to(value: Option<&SendToValue>) -> Result<Vec<String>, String> {
    let ids: Vec<String> = match value {
        None => return Ok(vec![sendto::LPM.to_string()]),
        Some(SendToValue::One(id)) => vec![id.clone()],
        Some(SendToValue::Many(ids)) => ids.clone(),
    };
    let mut out: Vec<String> = Vec::new();
    for id in ids.iter().map(|id| id.trim().to_lowercase()) {
        if !sendto::is_known(&id) {
            return Err(format!("\"{id}\" isn't a place lpm can send results to."));
        }
        if !out.contains(&id) {
            out.push(id);
        }
    }
    if out.is_empty() {
        return Err("Choose at least one place to send this job's results.".into());
    }
    Ok(out)
}

fn resolve_job(project: &str, id: &str, def: &JobDef) -> Result<JobResolved, String> {
    let sched = def
        .schedule
        .as_ref()
        .ok_or_else(|| "Give this job a schedule.".to_string())?;
    let schedule = resolve_schedule(sched)?;
    let run = def
        .run
        .as_ref()
        .ok_or_else(|| "Give this job something to run.".to_string())?;
    let run = resolve_run(project, run)?;
    let verify = def.verify.trim();
    // lpm hands an action off and never learns how it ended, so there is no
    // moment at which a check after the run could mean anything.
    if !verify.is_empty() && matches!(run, RunTarget::Action { .. }) {
        return Err("A check after the run isn't available for actions.".into());
    }
    Ok(JobResolved {
        id: id.to_string(),
        label: if def.label.trim().is_empty() {
            id.to_string()
        } else {
            def.label.clone()
        },
        emoji: def.emoji.clone(),
        schedule,
        check: def.check.trim().to_string(),
        verify: verify.to_string(),
        duplicate: resolve_duplicate(&def.duplicate)?,
        run,
        enabled: def.enabled.unwrap_or(true),
        send_to: resolve_send_to(def.send_to.as_ref())?,
        machines: machines::parse(def.machines.as_ref()),
    })
}

/// Each job in a config file, as written.
pub(crate) fn raw_jobs(bytes: &[u8]) -> BTreeMap<String, serde_norway::Value> {
    serde_norway::from_slice::<JobsYaml>(bytes)
        .map(|y| y.jobs)
        .unwrap_or_default()
}

/// Each job is read on its own: a field the schema doesn't recognise breaks
/// that job into a row the user can see and fix, instead of taking every other
/// job in the file down with it silently.
fn load_jobs_yaml(path: &Path) -> JobEntries {
    std::fs::read(path)
        .map(|bytes| raw_jobs(&bytes))
        .unwrap_or_default()
        .into_iter()
        .map(|(id, body)| {
            let def = serde_norway::from_value::<JobDef>(body)
                .map_err(|e| format!("This job's settings can't be read: {e}"));
            (id, def)
        })
        .collect()
}

const SOURCE_PROJECT: &str = "project";
const SOURCE_REPO: &str = "repo";
const SOURCE_GLOBAL: &str = "global";

fn merge_job_defs(
    registry: JobEntries,
    repo: JobEntries,
    global: JobEntries,
) -> BTreeMap<String, (Result<JobDef, String>, &'static str)> {
    let mut out: BTreeMap<String, (Result<JobDef, String>, &'static str)> = global
        .into_iter()
        .map(|(k, v)| (k, (v, SOURCE_GLOBAL)))
        .collect();
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
    let held = match &root_info {
        Some((root, false)) if !repo.is_empty() => config::repo_trust::held(root, false),
        _ => Default::default(),
    };

    merge_job_defs(registry, repo, global)
        .into_iter()
        // Only global-layer jobs carry project targeting; a `projects` field on
        // a repo/registry job is ignored — those are already single-project.
        .filter(|(_, (def, source))| match def {
            Ok(d) => *source != SOURCE_GLOBAL || global_resolves_for(d, project),
            // An unreadable global job has no known targeting, so the
            // Automations view lists it once from the global layer rather than
            // repeating the same error under every project.
            Err(_) => *source != SOURCE_GLOBAL,
        })
        .map(|(id, (def, source))| {
            let r = if is_remote {
                Err("Scheduled jobs aren't available on SSH projects.".to_string())
            } else if source == SOURCE_REPO && config::repo_trust::holds_job(&held, &id) {
                Err("This automation comes from the repo's .lpm.yml and waits until you allow its commands in lpm.".to_string())
            } else {
                def.and_then(|d| resolve_job(project, &id, &d))
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
        .filter(|(_, def)| {
            def.as_ref()
                .is_ok_and(|d| matches!(job_targets(d), JobTargets::Standalone))
        })
        .map(|(id, def)| {
            let r = def.and_then(|d| resolve_job("", &id, &d));
            (id, r)
        })
        .collect()
}

pub(crate) fn is_standalone_job(job_id: &str) -> bool {
    resolve_standalone_jobs().iter().any(|(id, _)| id == job_id)
}

fn home_dir() -> String {
    dirs::home_dir()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned()
}

// ---- scheduling math --------------------------------------------------------

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// The number every random choice a job makes is drawn from: FNV-1a over
/// "<project>/<jobId>". Because it is derived rather than rolled, the scheduler,
/// the list row predicting the next run, and the app after a restart all reach
/// the same answer without anything being persisted.
fn job_seed(project: &str, job_id: &str) -> u64 {
    let key = format!("{project}/{job_id}");
    let mut h: u64 = 0xcbf29ce484222325;
    for b in key.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

/// A further draw from `seed` for one particular occasion — the day a run
/// belongs to, its slot within that day, or the run a gap follows.
fn draw(seed: u64, a: i64, b: u64) -> u64 {
    let mut h = seed;
    for v in [a as u64, b] {
        for i in 0..8 {
            h ^= (v >> (i * 8)) & 0xff;
            h = h.wrapping_mul(0x100000001b3);
        }
    }
    h
}

/// A stable 0–5 minute offset per job so jobs sharing a fire point (e.g. every
/// 09:00 job) don't all run in the same tick. A job with a window of its own
/// doesn't get one: the window already spreads it, and the offset would push a
/// run past the end the user set.
fn implicit_jitter(spec: &CalendarSpec, seed: u64) -> u64 {
    if spec.until_min.is_some() {
        0
    } else {
        seed % (MAX_JITTER_SECS + 1)
    }
}

/// The days a spec may run on: the ones it names, or all seven.
fn day_pool(days: &[u8]) -> Vec<u8> {
    if days.is_empty() {
        (0..7).collect()
    } else {
        days.to_vec()
    }
}

/// The `n` days drawn for one week — a shuffle of the pool seeded on the week
/// itself, so every day of that week agrees on which ones were picked.
fn picked_days(pool: &[u8], n: usize, week_seed: u64) -> Vec<u8> {
    let mut rest = pool.to_vec();
    let mut out = Vec::with_capacity(n);
    let mut h = week_seed;
    for i in 0..n.min(rest.len()) {
        h = draw(h, i as i64, 0);
        out.push(rest.remove((h % rest.len() as u64) as usize));
    }
    out
}

fn day_ok(date: chrono::NaiveDate, spec: &CalendarSpec, seed: u64) -> bool {
    if let Some(rule) = &spec.dates {
        return rule.matches(date);
    }
    let weekday = date.weekday().num_days_from_monday() as u8;
    let pool = day_pool(&spec.days);
    if !pool.contains(&weekday) {
        return false;
    }
    let Some(n) = spec.pick_days else {
        return true;
    };
    let week = date.iso_week();
    let week_seed = draw(seed, week.year() as i64, week.week() as u64);
    picked_days(&pool, n as usize, week_seed).contains(&weekday)
}

/// Local wall-clock to epoch, surviving DST folds: an ambiguous time (clocks
/// fell back) takes its first occurrence, a nonexistent time (clocks sprang
/// forward) slides an hour later — the job still runs that day.
pub(crate) fn local_epoch(date: chrono::NaiveDate, at_min: u32) -> Option<i64> {
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

/// How far the occurrence search looks either way. A job picking two days out of
/// seven can leave a fortnight between the pair it lands on in one week and the
/// pair it lands on in the next, so a week's worth of lookahead isn't enough.
const LOOKAROUND_DAYS: i64 = 16;

/// Every instant the spec fires at on `date`. An exact-time spec has one per
/// time it names; a windowed spec has `times`, each drawn from its own equal
/// slice of the window so two runs of the same job can't crowd together.
fn day_fire_points(date: chrono::NaiveDate, spec: &CalendarSpec, seed: u64) -> Vec<i64> {
    if !spec.also_at.is_empty() {
        let mut points: Vec<i64> = std::iter::once(spec.at_min)
            .chain(spec.also_at.iter().copied())
            .filter_map(|m| local_epoch(date, m))
            .collect();
        points.sort_unstable();
        points.dedup();
        return points;
    }
    let Some(start) = local_epoch(date, spec.at_min) else {
        return Vec::new();
    };
    // The window is measured end to end rather than in wall-clock minutes, so
    // one spanning a DST change keeps the length the clock says it has.
    let end = spec.until_min.and_then(|u| local_epoch(date, u));
    let window = end.map(|e| e - start).unwrap_or(0);
    if window <= 0 {
        return vec![start];
    }
    let times = spec.times.max(1) as i64;
    let slice = window / times;
    (0..times)
        .map(|k| {
            // Every slice but the last holds back a gap at its end, so a draw
            // late in one slice and one early in the next can't land together.
            let span = slice
                - if k + 1 < times {
                    MIN_INTERVAL_SECS as i64
                } else {
                    0
                };
            let offset = if span > 0 {
                (draw(seed, date.num_days_from_ce() as i64, k as u64) % (span as u64 + 1)) as i64
            } else {
                0
            };
            start + k * slice + offset
        })
        .collect()
}

/// The days worth looking at for a fire point, nearest first, going forward from
/// `today` or back from it. Calendar dates are listed outright, however far off.
fn candidate_days(spec: &CalendarSpec, today: chrono::NaiveDate, forward: bool) -> Vec<chrono::NaiveDate> {
    if let Some(DateRule::On(dates)) = &spec.dates {
        let mut days: Vec<_> = dates
            .iter()
            .copied()
            .filter(|d| if forward { *d >= today } else { *d <= today })
            .collect();
        if !forward {
            days.reverse();
        }
        return days;
    }
    let span = if spec.dates.is_some() {
        jobcal::MONTH_LOOKAROUND_DAYS
    } else {
        LOOKAROUND_DAYS
    };
    (0..span)
        .map(|i| {
            let step = chrono::Duration::days(i);
            if forward {
                today + step
            } else {
                today - step
            }
        })
        .collect()
}

fn most_recent_fire_point(spec: &CalendarSpec, now: i64, seed: u64) -> Option<i64> {
    let today = chrono::Local.timestamp_opt(now, 0).single()?.date_naive();
    for d in candidate_days(spec, today, false) {
        if !day_ok(d, spec, seed) {
            continue;
        }
        if let Some(p) = day_fire_points(d, spec, seed)
            .into_iter()
            .rev()
            .find(|p| *p <= now)
        {
            return Some(p);
        }
    }
    None
}

fn next_fire_point(spec: &CalendarSpec, now: i64, seed: u64) -> Option<i64> {
    let today = chrono::Local.timestamp_opt(now, 0).single()?.date_naive();
    for d in candidate_days(spec, today, true) {
        if !day_ok(d, spec, seed) {
            continue;
        }
        if let Some(p) = day_fire_points(d, spec, seed)
            .into_iter()
            .find(|p| *p > now)
        {
            return Some(p);
        }
    }
    None
}

/// How long the job waits after `last_run`. A band draws a fresh length for each
/// gap, seeded on the run it follows so the tick asking whether the job is due
/// and the row saying when it is next both get the same answer.
fn interval_gap(min_secs: u64, max_secs: u64, last_run: u64, seed: u64) -> u64 {
    if max_secs <= min_secs {
        return min_secs;
    }
    min_secs + draw(seed, last_run as i64, 0) % (max_secs - min_secs + 1)
}

/// Interval jobs are due once their gap has elapsed since the last run, so
/// "every 6 hours" stays every 6 hours. Jitter is deliberately not charged here:
/// the gap is measured from the previous run rather than from a fixed grid, so
/// adding it would lengthen every period and walk the job further out of
/// position on each run. Interval jobs are already spread by their own start
/// times; the jobs that genuinely share a fire point are the calendar ones,
/// which jitter still offsets below.
///
/// Calendar jobs are due when the most recent scheduled fire point is strictly
/// later than the last run — coalescing any number of occurrences missed while
/// the app was closed into a single run.
fn is_due(schedule: &Schedule, last_run: u64, now: u64, seed: u64) -> bool {
    match schedule {
        Schedule::Interval {
            min_secs,
            max_secs,
            limits,
        } => {
            now.saturating_sub(last_run) >= interval_gap(*min_secs, *max_secs, last_run, seed)
                && limits.as_ref().is_none_or(|l| l.allows(now as i64))
        }
        Schedule::Calendar(spec) => match most_recent_fire_point(spec, now as i64, seed) {
            Some(occ) => {
                (occ as u64) > last_run && now >= (occ as u64) + implicit_jitter(spec, seed)
            }
            None => false,
        },
        Schedule::Cron(spec) => spec
            .last_at_or_before(now as i64)
            .is_some_and(|occ| occ as u64 > last_run),
        Schedule::Manual => false,
    }
}

/// When the job is next due, as the schedule states it. A fixed-time calendar
/// job is held back by up to `MAX_JITTER_SECS` so a fleet of 09:00 jobs doesn't
/// all start in one tick, but showing "09:04" against a schedule that reads
/// 09:00 just looks wrong — that spread is explained in words in the editor
/// instead. A job given a window of its own is the opposite case: the drawn time
/// *is* its schedule, so it is the time to show.
fn next_fire_at(schedule: &Schedule, last_run: u64, now: u64, seed: u64) -> Option<i64> {
    match schedule {
        Schedule::Interval {
            min_secs,
            max_secs,
            limits,
        } => {
            let due = (last_run + interval_gap(*min_secs, *max_secs, last_run, seed)) as i64;
            match limits {
                Some(l) => l.next_open(due.max(now as i64)),
                None => Some(due),
            }
        }
        Schedule::Calendar(spec) => next_fire_point(spec, now as i64, seed),
        Schedule::Cron(spec) => spec.next_after(now as i64),
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
    #[serde(
        default,
        rename = "pendingTask",
        skip_serializing_if = "Option::is_none"
    )]
    pending_task: Option<Value>,
    #[serde(
        default,
        rename = "enabledOverride",
        skip_serializing_if = "Option::is_none"
    )]
    enabled_override: Option<bool>,
    /// When the user last opened this job — runs that landed after it are the
    /// ones still unread. Absent means nothing has been read yet.
    #[serde(default, rename = "seenAt", skip_serializing_if = "Option::is_none")]
    seen_at: Option<u64>,
}

impl JobState {
    /// The user's on/off switch wins over the config's `enabled:`.
    fn is_on(&self, configured: bool) -> bool {
        self.enabled_override.unwrap_or(configured)
    }

    /// A job that names its Macs is one job across all of them, so its switch
    /// lives in the config they share — though one paused here before it named
    /// them stays paused.
    fn job_on(&self, job: &JobResolved) -> bool {
        if job.machines.is_some() {
            job.enabled && self.enabled_override != Some(false)
        } else {
            self.is_on(job.enabled)
        }
    }
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
    #[serde(
        default,
        rename = "durationSecs",
        skip_serializing_if = "Option::is_none"
    )]
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
    /// Whether the job's `verify` command passed after the run. None means the
    /// job declares no check, or there was no live run to check (a run salvaged
    /// after the app closed) — those are unverified, not failed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    verified: Option<bool>,
    /// What the verify command said, capped.
    #[serde(
        default,
        rename = "verifyOutput",
        skip_serializing_if = "Option::is_none"
    )]
    verify_output: Option<String>,
    /// What the run asked the user, with the answers once given.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    asks: Vec<Ask>,
    /// The question this entry's message answered. The entry that asked shows
    /// the answer already, so the views don't repeat it as a message.
    #[serde(default, rename = "answerTo", skip_serializing_if = "Option::is_none")]
    answer_to: Option<String>,
    /// The Mac that made this run, when it wasn't this one: another of the
    /// job's Macs ran it while this one was off.
    #[serde(default, rename = "ranOn", skip_serializing_if = "Option::is_none")]
    ran_on: Option<String>,
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
    /// The run belongs to a quiet job, so finding nothing leaves no trace —
    /// still true when a relaunched app salvages it.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    quiet: bool,
    /// When the machine that spawned the pid booted — a pid from before a
    /// reboot can only be a stranger wearing the same number.
    #[serde(default, rename = "bootAt", skip_serializing_if = "Option::is_none")]
    boot_at: Option<u64>,
    /// The pid's creation time (Windows only), so a recycled pid can't pass
    /// for the run after a relaunch.
    #[serde(default, rename = "procStart", skip_serializing_if = "Option::is_none")]
    proc_start: Option<u64>,
    /// Handed to the run as LPM_RUN_ID — what `lpm ask` names the run by, so a
    /// process left over from an earlier run can't ask on a later one's behalf.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    token: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    asks: Vec<Ask>,
    #[serde(default, rename = "answerTo", skip_serializing_if = "Option::is_none")]
    answer_to: Option<String>,
    /// What a terminal passes `claude --resume` to carry this run on as it was.
    #[serde(default, rename = "terminalFlags", skip_serializing_if = "String::is_empty")]
    terminal_flags: String,
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

/// `with_state` for a change that can be refused: a refusal writes nothing.
fn try_with_state<T>(f: impl FnOnce(&mut JobsStateFile) -> Result<T, String>) -> Result<T, String> {
    let _g = state_lock().lock().unwrap();
    let mut file = load_state_file();
    let out = f(&mut file)?;
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
    matches!(
        result,
        SKIPPED_OVERLAP | SKIPPED_PENDING_COPY | SKIPPED_CAPACITY | NOTHING_TO_DO
    )
}

/// Outcomes that left something to read. A quiet check, a skip and a stop the
/// user asked for say nothing they haven't already seen, so they never make a
/// job unread.
fn is_readable_outcome(result: &str) -> bool {
    matches!(
        result,
        COMPLETED | FOUND_WORK | ERROR | TIMED_OUT | CONTEXT_FULL
    )
}

/// How many runs landed since the user last opened the job.
fn unread_count(st: &JobState) -> u32 {
    let seen = st.seen_at.unwrap_or(0);
    st.history
        .iter()
        .filter(|h| h.at > seen && is_readable_outcome(&h.result))
        .count() as u32
}

const PREVIEW_CHARS: usize = 400;

/// The newest message the job left — a run's answer or a reply — cut to the
/// head the job list previews, with when it landed.
fn latest_message(st: &JobState) -> Option<(u64, String)> {
    st.history
        .iter()
        .filter(|h| is_readable_outcome(&h.result))
        .filter_map(|h| {
            let out = h.output.as_deref()?.trim();
            (!out.is_empty()).then(|| (h.at, out.chars().take(PREVIEW_CHARS).collect()))
        })
        .max_by_key(|(at, _)| *at)
}

/// Append a history entry, capped at the newest `HISTORY_CAP`.
fn push_history(st: &mut JobState, at: u64, result: &str, copy: Option<String>) {
    push_entry(
        st,
        HistoryEntry {
            at,
            result: result.to_string(),
            copy,
            ..HistoryEntry::default()
        },
    );
}

fn push_entry(st: &mut JobState, entry: HistoryEntry) {
    if is_collapsible(&entry.result) {
        if let Some(last) = st.history.last_mut() {
            if last.result == entry.result {
                last.at = entry.at;
                last.copy = entry.copy;
                // Keep the newest reason — an unchanged one just rewrites the
                // same text, and a changed one is the more useful of the two.
                last.output = entry.output;
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

/// How far apart the pipeline's clock and the captured run's own start clock
/// can land for the same spawn.
const PLACEHOLDER_SKEW_SECS: u64 = 5;

/// Outcomes only a captured run ever ends in — the pipeline never writes them
/// itself, so an entry carrying one closes the run its marker opened.
fn is_captured_outcome(result: &str) -> bool {
    matches!(result, COMPLETED | TIMED_OUT | CONTEXT_FULL)
}

/// Whether `entry` is the "found work" marker that older builds wrote when
/// `next` was spawned.
fn is_run_placeholder(entry: &HistoryEntry, next: &HistoryEntry) -> bool {
    if entry.result != FOUND_WORK || entry.output.is_some() || entry.copy != next.copy {
        return false;
    }
    match next.duration_secs {
        // A captured run names the second it started — when it landed, less how
        // long it ran — which is the marker's own timestamp.
        Some(secs) => next.at.saturating_sub(secs).abs_diff(entry.at) <= PLACEHOLDER_SKEW_SECS,
        // A run salvaged after the app closed mid-flight has no duration to
        // match on; what it ended in is enough to place it.
        None => is_captured_outcome(&next.result),
    }
}

/// Drop the markers older builds left in front of their runs, so a finished run
/// is one row that says how it went rather than two, the second of which reads
/// "running" forever.
fn prune_run_placeholders(st: &mut JobState) {
    let mut kept: Vec<HistoryEntry> = Vec::with_capacity(st.history.len());
    for (i, entry) in st.history.iter().enumerate() {
        let paired = st
            .history
            .get(i + 1)
            .is_some_and(|next| is_run_placeholder(entry, next));
        if !paired {
            kept.push(entry.clone());
        }
    }
    st.history = kept;
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
    inflight()
        .lock()
        .unwrap()
        .insert(key.to_string(), now_secs())
        .is_none()
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
    let running = inflight().lock().unwrap().contains_key(key)
        || active_runs().lock().unwrap().contains_key(key);
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
    /// Whether the pipeline writes this outcome to the history. A captured run
    /// is recorded by its watcher once the agent is done; an entry here too
    /// would leave every finished run trailed by a blank row still reading
    /// "running".
    record: bool,
}

const LAST_NOTE_CHARS: usize = 400;

/// What the last run said about itself, kept short enough for a list row: the
/// reason a failed run gives, or the opening of a run's output.
fn last_note(entry: &HistoryEntry) -> Option<String> {
    let text = entry.output.as_deref()?.trim();
    if text.is_empty() {
        return None;
    }
    Some(text.chars().take(LAST_NOTE_CHARS).collect())
}

fn err_outcome(note: impl Into<String>) -> Outcome {
    Outcome {
        result: ERROR,
        copy: None,
        advance: true,
        note: Some(note.into()),
        record: true,
    }
}

enum Dispatch {
    /// The work was handed off — an action opened in the app — and nothing
    /// reports back afterwards, so the pipeline's own entry is the only record
    /// the run ever gets.
    Ran,
    /// A headless run whose watcher writes the outcome entry when the agent
    /// exits.
    Captured,
    Parked,
    Error,
}

/// The same interactive-login-shell wrapper actions use, run headless with all
/// streams detached and its own session (so an app launched from a terminal
/// doesn't stop the shell with SIGTTIN), on the project's Claude account.
fn shell_command(
    cwd: &str,
    cmd: &str,
    env: &[(String, String)],
    claude: &config::ClaudeEnv,
) -> Command {
    let mut c = crate::shellpath::login_line(Path::new(cwd), cmd);
    for (k, v) in env {
        c.env(k, v);
    }
    claude.apply(&mut c);
    c.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(unix)]
    crate::osproc::detach(&mut c);
    #[cfg(windows)]
    crate::procwin::detach(&mut c);
    c
}

/// `shell_command` for a captured run. An agent's prompt is an argv word, which
/// Git Bash would rewrite into a Windows path when it starts with `/`; a plain
/// command keeps the rewrite its author may rely on.
fn captured_command(
    cwd: &str,
    line: &str,
    env: &[(String, String)],
    claude: &config::ClaudeEnv,
    agent: bool,
) -> Command {
    let mut c = shell_command(cwd, line, env, claude);
    if agent {
        crate::shellpath::verbatim_args(&mut c, line);
    }
    c
}

/// What started this run. Passed to the children so a check can behave
/// differently when a person pressed Run now.
#[derive(Clone, Copy, PartialEq)]
enum Trigger {
    Schedule,
    Manual,
    Reply,
}

impl Trigger {
    fn as_str(self) -> &'static str {
        match self {
            Trigger::Schedule => "schedule",
            Trigger::Manual => "manual",
            Trigger::Reply => "reply",
        }
    }
}

/// The fire point this run is servicing, as against the wall clock it actually
/// ran at — a job scheduled for 09:00 that starts at 23:00 because the Mac was
/// asleep can only tell the difference if it is told both.
fn due_fire_at(schedule: &Schedule, last_run: u64, now: u64, seed: u64) -> Option<u64> {
    match schedule {
        Schedule::Interval {
            min_secs,
            max_secs,
            limits,
        } => {
            let due = last_run + interval_gap(*min_secs, *max_secs, last_run, seed);
            match limits {
                Some(l) => l.next_open(due as i64).map(|t| t as u64),
                None => Some(due),
            }
        }
        Schedule::Calendar(spec) => most_recent_fire_point(spec, now as i64, seed)
            .map(|o| o as u64 + implicit_jitter(spec, seed)),
        Schedule::Cron(spec) => spec.last_at_or_before(now as i64).map(|o| o as u64),
        Schedule::Manual => None,
    }
}

/// What a run tells the children it starts. Nothing was passed before, so a
/// check had no way to act only on what changed since the last run.
fn run_env(
    project: &str,
    job_id: &str,
    root: &str,
    trigger: Trigger,
    scheduled_for: Option<u64>,
    last_run_at: Option<u64>,
    copy: Option<&str>,
) -> Vec<(String, String)> {
    let mut env = vec![
        ("LPM_JOB_ID".to_string(), job_id.to_string()),
        ("LPM_RUN_ROOT".to_string(), root.to_string()),
        ("LPM_TRIGGER".to_string(), trigger.as_str().to_string()),
        ("LPM_ACTUAL_TIME".to_string(), now_secs().to_string()),
        (
            "LPM_IS_COPY".to_string(),
            if copy.is_some() { "1" } else { "0" }.to_string(),
        ),
        // A script's prints reach the log as they happen, so the run's page can
        // show them while it works.
        ("PYTHONUNBUFFERED".to_string(), "1".to_string()),
        // The instance that owns this run, so `lpm ask` reaches it rather than
        // whichever app holds the default socket.
        (
            "LPM_SOCKET_PATH".to_string(),
            crate::socketsrv::serving(&config::socket_path()),
        ),
    ];
    // The name terminals already set, so a skill written for one works in both.
    if !project.is_empty() {
        env.push(("LPM_PROJECT_NAME".to_string(), project.to_string()));
        // The project the run itself is in: LPM_PROJECT_NAME stays the original
        // in a copy, and renaming that would rename the wrong one.
        env.push((
            "LPM_RUN_PROJECT".to_string(),
            copy.unwrap_or(project).to_string(),
        ));
        // Where the lpm-memory skill saves and recalls sessions — a run in a
        // copy still belongs to the original's memory, like its terminals do.
        if let Ok(dir) = crate::session_memory_scope::memory_dir(project) {
            env.push(("LPM_MEMORY_DIR".to_string(), dir.to_string_lossy().into_owned()));
        }
    }
    if let Some(v) = scheduled_for {
        env.push(("LPM_SCHEDULED_FOR".to_string(), v.to_string()));
    }
    if let Some(v) = last_run_at {
        env.push(("LPM_LAST_RUN_AT".to_string(), v.to_string()));
    }
    env
}

/// SIGKILL the run's process group. Windows has no groups: the run's tree is
/// walked from its root instead.
fn kill_group(pid: i32) {
    #[cfg(unix)]
    crate::osproc::kill_group(pid as u32, true);
    #[cfg(windows)]
    crate::proctree::kill_pids(&crate::proctree::trees(&[pid]));
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
/// Time the run spends waiting on the user's answer doesn't count against it.
fn wait_or_kill(
    child: &mut std::process::Child,
    mut deadline: std::time::Instant,
    key: Option<&str>,
) -> Result<WaitVerdict, String> {
    let pid = child.id() as i32;
    let watch = crate::runguard::watch(child.id());
    let mut last = std::time::Instant::now();
    loop {
        watch.sweep();
        if key.is_some_and(is_cancel_requested) {
            kill_group(pid);
            let _ = child.wait();
            return Ok(WaitVerdict::Canceled);
        }
        let now = std::time::Instant::now();
        if key.is_some_and(ask::is_blocked) {
            deadline += now - last;
        }
        last = now;
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(status) => return Ok(WaitVerdict::Exited(status.success())),
            None if now >= deadline => {
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
/// What the check decided, and what it said while deciding. Its output used to
/// be thrown away, which left a check that was quietly broken looking exactly
/// like a check that found nothing to do.
struct CheckOutcome {
    work: bool,
    output: Option<String>,
}

const CHECK_OUTPUT_CAP_CHARS: usize = 2_000;

fn run_check(
    root: &str,
    check: &str,
    timeout: Duration,
    key: Option<&str>,
    env: &[(String, String)],
    claude: &config::ClaudeEnv,
) -> Result<CheckOutcome, String> {
    // Jobs check concurrently, so the file has to be unique per call — a shared
    // one would hand a job another job's output.
    static CHECK_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let seq = CHECK_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let log_path = config::lpm_dir()
        .join("job-logs")
        .join(format!("check-{}-{seq}.log", std::process::id()));
    if let Some(dir) = log_path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = std::fs::remove_file(&log_path);
    let mut child = shell_command(root, &captured_shell_line(check, &log_path), env, claude)
        .spawn()
        .map_err(|e| e.to_string())?;
    if let Some(k) = key {
        active_runs()
            .lock()
            .unwrap()
            .insert(k.to_string(), now_secs());
    }
    let verdict = wait_or_kill(&mut child, std::time::Instant::now() + timeout, key);
    if let Some(k) = key {
        active_runs().lock().unwrap().remove(k);
    }
    let said = read_log_tail(&log_path, 64 * 1024);
    let _ = std::fs::remove_file(&log_path);
    let output = {
        let trimmed = said.trim();
        (!trimmed.is_empty()).then(|| tail_chars(trimmed, CHECK_OUTPUT_CAP_CHARS))
    };
    match verdict? {
        WaitVerdict::Exited(work) => Ok(CheckOutcome { work, output }),
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
fn agent_prompt_cmdline(
    agent: &str,
    model: &str,
    effort: &str,
    full_access: bool,
    browser: bool,
    prompt: &str,
) -> String {
    let q = config::shell_quote(prompt);
    let m = config::shell_quote(model);
    let e = config::shell_quote(effort);
    match agent {
        // Codex takes reasoning effort as a `-c model_reasoning_effort=…` config.
        "codex" => {
            let model_arg = if model.is_empty() {
                String::new()
            } else {
                format!(" -m {m}")
            };
            let effort_arg = if effort.is_empty() {
                String::new()
            } else {
                format!(" -c model_reasoning_effort={e}")
            };
            let access_arg = if full_access {
                " --dangerously-bypass-approvals-and-sandbox"
            } else {
                ""
            };
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
        _ => claude_cmdline(None, model, effort, full_access, browser, prompt),
    }
}

/// Claude in Chrome for a headless Claude run, on the terms the user's terminals
/// get it: headless Claude Code ignores its "enabled by default" setting, so the
/// run has to ask. Only a full-access run can use it — a read-only one has
/// nobody to approve the browser's tool calls.
fn browser_tools(full_access: bool) -> bool {
    full_access && config::claude_chrome_by_default()
}

fn claude_model_args(model: &str, effort: &str) -> String {
    let mut args = String::new();
    if !model.is_empty() {
        args.push_str(&format!(" --model {}", config::shell_quote(model)));
    }
    if !effort.is_empty() {
        args.push_str(&format!(" --effort {}", config::shell_quote(effort)));
    }
    args
}

/// What a terminal needs to go on with a Claude conversation the way its run
/// had it.
fn claude_terminal_flags(model: &str, effort: &str, full_access: bool) -> String {
    let access = if full_access { CLAUDE_FULL_ACCESS } else { "" };
    format!("{}{access}", claude_model_args(model, effort))
}

/// The shared Claude Code headless invocation; `resume` continues an earlier
/// agent session so a follow-up message lands in the same conversation.
fn claude_cmdline(
    resume: Option<&str>,
    model: &str,
    effort: &str,
    full_access: bool,
    browser: bool,
    prompt: &str,
) -> String {
    let q = config::shell_quote(prompt);
    let resume_arg = match resume {
        Some(sid) => format!(" --resume {}", config::shell_quote(sid)),
        None => String::new(),
    };
    let model_args = claude_model_args(model, effort);
    // A read-only run can't approve tools, but asking the user stays open to it.
    let access_arg = if full_access {
        CLAUDE_FULL_ACCESS
    } else {
        " --allowedTools 'Bash(lpm ask:*)'"
    };
    let browser_arg = if browser { " --chrome" } else { "" };
    // stream-json (which requires --verbose in print mode) writes an event per
    // message as the run progresses, so the log can be tailed live; its final
    // `result` event carries the same fields the plain json mode did.
    format!(
        "claude{resume_arg}{model_args}{access_arg}{browser_arg} -p --verbose --output-format stream-json {q}"
    )
}

/// The session a Claude stream event belongs to.
fn event_session(event: &Value) -> Option<String> {
    let session = event.get("session_id")?.as_str()?.trim();
    (!session.is_empty()).then(|| session.to_string())
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
                    let session = event_session(&v);
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
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        if v.get("type").and_then(Value::as_str) != Some("assistant") {
            continue;
        }
        let blocks = v.pointer("/message/content").and_then(Value::as_array);
        for block in blocks.into_iter().flatten() {
            match block.get("type").and_then(Value::as_str) {
                Some("text") => {
                    if let Some(t) = block
                        .get("text")
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .filter(|t| !t.is_empty())
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
        Some("claude") => render_claude_stream(raw).map_or_else(
            || tail_chars(raw, OUTPUT_CAP_CHARS),
            |r| tail_chars(&r, OUTPUT_CAP_CHARS),
        ),
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
        .find(|g| {
            g.iter()
                .any(|&i| history[i].session.as_deref() == Some(session))
        })
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
    let Some(group) = thread_groups(history)
        .into_iter()
        .find(|g| g.contains(&pos))
    else {
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
         Reply to the user's new message:\n{message}\n\n{ASK_INSTRUCTION}"
    )
}

fn tail_chars(s: &str, max: usize) -> String {
    let count = s.chars().count();
    if count <= max {
        return s.trim_end().to_string();
    }
    s.chars()
        .skip(count - max)
        .collect::<String>()
        .trim_end()
        .to_string()
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
    env: Vec<(String, String)>,
    /// Shell command run after the agent exits, deciding whether the run
    /// actually did what it was asked. Absent on replies — a conversational
    /// answer is not a run to check.
    verify: Option<String>,
    /// A run that answers NOTHING_TO_REPORT leaves no trace; `manual` says a
    /// person pressed Run now and is waiting to hear it finished.
    quiet: bool,
    manual: bool,
    /// The question whose answer this run carries on with — the job's own
    /// work resuming, so it reports out like a run, not like a reply.
    answer_to: Option<String>,
    /// The job's own Claude account; None leaves it to the project.
    account: Option<String>,
    terminal_flags: String,
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
            env: Vec::new(),
            verify: None,
            quiet: false,
            manual: false,
            answer_to: None,
            account: None,
            terminal_flags: String::new(),
        }
    }

    fn with_terminal_flags(mut self, flags: String) -> Self {
        self.terminal_flags = flags;
        self
    }

    fn with_account(mut self, account: Option<&str>) -> Self {
        self.account = account.map(str::to_string);
        self
    }

    fn with_verify(mut self, verify: &str) -> Self {
        let verify = verify.trim();
        if !verify.is_empty() {
            self.verify = Some(verify.to_string());
        }
        self
    }

    fn with_env(mut self, env: Vec<(String, String)>) -> Self {
        self.env = env;
        self
    }

    fn with_quiet(mut self, quiet: bool, trigger: Trigger) -> Self {
        self.quiet = quiet;
        self.manual = trigger == Trigger::Manual;
        self
    }
}

/// The prompt a run hands its agent: a memory job's says where its earlier runs
/// are kept, every run hears how to put a question to the user, and a quiet
/// job's carries the one line that lets the agent say it found nothing — last,
/// as it governs the reply itself.
fn run_prompt(prompt: &str, memory: Option<&str>, quiet: bool) -> String {
    let mut parts = vec![prompt];
    parts.extend(memory);
    parts.push(ASK_INSTRUCTION);
    if quiet {
        parts.push(QUIET_INSTRUCTION);
    }
    parts.join("\n\n")
}

/// Whether a quiet job's run came back with the agreed answer and nothing
/// else. Anything more, however empty it sounds, is reported as usual — a
/// wrong guess here should cost a notification, never a finding.
fn found_nothing(quiet: bool, result: &str, output: Option<&str>) -> bool {
    quiet
        && result == COMPLETED
        && output.is_some_and(|o| {
            o.trim()
                .trim_matches(|c: char| matches!(c, '`' | '*' | '"' | '\'' | '.') || c.is_whitespace())
                == NOTHING_TO_REPORT
        })
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

/// A subshell, not a brace group: a command that exits by itself would otherwise
/// end the login shell while the redirect is still in force, and bash greets that
/// with `logout` — captured as if the command had said it.
fn captured_shell_line(cmdline: &str, log_path: &Path) -> String {
    format!(
        "( {cmdline} ) > {} 2>&1",
        config::shell_quote(&crate::shellpath::shell_path(log_path))
    )
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
    let CaptureSpec {
        cmdline,
        agent,
        copy,
        question,
        resumed,
        follows,
        fallback,
        compacted,
        mut env,
        verify,
        quiet,
        manual,
        answer_to,
        account: own_account,
        terminal_flags,
    } = spec;
    let token = uuid::Uuid::new_v4().simple().to_string();
    env.push(("LPM_RUN_ID".to_string(), token.clone()));
    let env2 = env.clone();
    // The job's own Claude account, else the project's fixed one, as a
    // scheduled terminal gets; a resumed session goes back to the account
    // holding its transcript.
    let target = copy.as_deref().unwrap_or(split_key(key).0);
    let crate::claude_pool::Spawn {
        env: claude,
        account,
    } = crate::claude_pool::job_spawn_env(
        target,
        resumed.as_deref().map(|sid| (root, sid)),
        own_account.as_deref(),
    );
    let log_path = logs.join(format!("{}-{}.log", key.replace('/', "_"), now_secs()));
    let cmdline = capture_cmdline(agent.as_deref(), &cmdline, &log_path);
    let is_agent = agent.is_some();
    let line = captured_shell_line(&cmdline, &log_path);
    match captured_command(root, &line, &env, &claude, is_agent).spawn() {
        Ok(mut child) => {
            let started = now_secs();
            active_runs()
                .lock()
                .unwrap()
                .insert(key.to_string(), started);
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
                    quiet,
                    boot_at: Some(boot_epoch()),
                    proc_start: proc_start(child.id()),
                    token: Some(token),
                    asks: Vec::new(),
                    answer_to: answer_to.clone(),
                    terminal_flags,
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
                let mut last_log = log_path.clone();
                // The session had no room left: retry once as a fresh session
                // seeded with the thread's condensed transcript. The key stays
                // registered as running throughout, so nothing overlaps it.
                if result == CONTEXT_FULL {
                    if let Some(fb) = fallback {
                        let log2 = log_path.with_extension("compact.log");
                        if let Ok(mut retry) = captured_command(
                            &root2,
                            &captured_shell_line(&fb, &log2),
                            &env2,
                            &claude,
                            is_agent,
                        )
                        .spawn()
                        {
                            active_runs()
                                .lock()
                                .unwrap()
                                .insert(key2.clone(), now_secs());
                            let _ = with_state(|f| {
                                if let Some(ar) =
                                    f.jobs.get_mut(&key2).and_then(|st| st.active_run.as_mut())
                                {
                                    ar.pid = retry.id() as i32;
                                    ar.proc_start = proc_start(retry.id());
                                    ar.log_path = log2.to_string_lossy().into_owned();
                                    ar.compacted = true;
                                }
                            });
                            (result, output, session, cost) =
                                reap_run(&mut retry, &key2, &log2, true, agent.as_deref());
                            compacted = true;
                            last_log = log2;
                        }
                    }
                }
                if result == ERROR && agent.as_deref() == Some("claude") {
                    output = signin::explain(output, &last_log, account.as_deref(), &claude);
                }
                active_runs().lock().unwrap().remove(&key2);
                if ended_quietly(&app2, &key2, quiet, manual, result, output.as_deref()) {
                    return;
                }
                let at = now_secs();
                // After the final attempt, including the condensed retry — a
                // run that needed a second try still gets checked once. A run
                // waiting to be resumed with an answer hasn't finished its work.
                let (verified, verify_output) = match &verify {
                    Some(cmd) if result == COMPLETED && !ask::resumes(&live_asks(&key2)) => {
                        match run_check(&root2, cmd, VERIFY_TIMEOUT, None, &env2, &claude) {
                            Ok(v) => (Some(v.work), v.output),
                            Err(e) => (
                                Some(false),
                                Some(format!("The check after the run couldn't finish: {e}.")),
                            ),
                        }
                    }
                    _ => (None, None),
                };
                let detail = notification_detail(output.as_deref(), cost)
                    .into_iter()
                    .chain(verify_note(verified))
                    .collect::<Vec<_>>()
                    .join(" · ");
                let detail = (!detail.is_empty()).then_some(detail);
                let report = report_text(output.as_deref(), verified);
                let entry = HistoryEntry {
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
                    verified,
                    verify_output,
                    asks: Vec::new(),
                    answer_to,
                    ran_on: None,
                };
                close_run(&app2, &key2, entry, detail, report);
            });
            Dispatch::Captured
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

fn dispatch_run(
    app: &AppHandle,
    key: &str,
    target: &str,
    job: &JobResolved,
    env: Vec<(String, String)>,
    trigger: Trigger,
) -> Dispatch {
    let project = key.split_once('/').map(|(p, _)| p).unwrap_or(key);
    let copy = (target != project).then(|| target.to_string());
    match &job.run {
        RunTarget::Cmd(cmd) => {
            let root = match dispatch_root(target) {
                Some(r) => r,
                None => return Dispatch::Error,
            };
            spawn_captured(
                app,
                key,
                &root,
                CaptureSpec::run(cmd.clone(), None, copy)
                    .with_verify(&job.verify)
                    .with_env(env),
            )
        }
        RunTarget::Action { name: id, prompt } => {
            let terminal = config::resolve_action_full(target, id)
                .map(|a| a.kind == "terminal")
                .unwrap_or(false);
            if terminal {
                // A scheduled run stays on the project's fixed account.
                let mut task = json!({ "kind": "action", "actionName": id, "fixedAccount": true });
                if !prompt.is_empty() {
                    task["prompt"] = json!(prompt);
                }
                emit_or_park(app, key, target, task)
            } else {
                let app2 = app.clone();
                let target2 = target.to_string();
                let id2 = id.clone();
                std::thread::spawn(move || {
                    // now_secs() alone collides when two action jobs fire in the same
                    // wall-clock second; a colliding id would merge both runs in the
                    // background registry. A process-wide counter keeps ids distinct.
                    static SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
                    let seq = SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                    let run_id = format!("job-{}-{}", now_secs(), seq);
                    let _ =
                        crate::actions::run_action_background_for_job(app2, target2, id2, run_id);
                });
                Dispatch::Ran
            }
        }
        RunTarget::Prompt {
            prompt,
            agent,
            model,
            effort,
            full_access,
            quiet,
            memory,
            claude_account,
        } => {
            let root = match dispatch_root(target) {
                Some(r) => r,
                None => return Dispatch::Error,
            };
            let agent = if agent.is_empty() {
                default_ai_cli()
            } else {
                agent.clone()
            };
            let mut env = env;
            let memory = memory.then(|| crate::jobmemory::dir(project)).flatten();
            let memory_note = memory.as_ref().map(|dir| {
                // A standalone run has no project folder in its env; the skill
                // reads this one before guessing from the working directory.
                env.retain(|(k, _)| k != "LPM_MEMORY_DIR");
                env.push(("LPM_MEMORY_DIR".to_string(), dir.to_string_lossy().into_owned()));
                crate::jobmemory::instruction(dir, &job.id)
            });
            spawn_captured(
                app,
                key,
                &root,
                CaptureSpec::run(
                    agent_prompt_cmdline(
                        &agent,
                        model,
                        effort,
                        *full_access,
                        browser_tools(*full_access),
                        &run_prompt(prompt, memory_note.as_deref(), *quiet),
                    ),
                    Some(agent),
                    copy,
                )
                .with_verify(&job.verify)
                .with_env(env)
                .with_quiet(*quiet, trigger)
                .with_account(claude_account.as_deref())
                .with_terminal_flags(claude_terminal_flags(model, effort, *full_access)),
            )
        }
    }
}

fn pipeline_body(
    app: &AppHandle,
    project: &str,
    job: &JobResolved,
    key: &str,
    trigger: Trigger,
) -> Outcome {
    let st = load_job_state(key);
    if let Some(waiting) = ask::open_in(&st) {
        return Outcome {
            result: SKIPPED_OVERLAP,
            copy: None,
            advance: true,
            note: Some(format!(
                "The run before this one is still waiting for your answer to \"{}\", so this one was skipped.",
                waiting.summary()
            )),
            record: true,
        };
    }
    if let Some(prev) = st.history.iter().rev().find_map(|h| h.copy.clone()) {
        if config::project_exists(&prev) {
            return Outcome {
                result: SKIPPED_PENDING_COPY,
                copy: None,
                advance: false,
                note: Some(format!(
                    "The copy the last run made, {prev}, is still around. Look it over and remove it and this job picks up again."
                )),
                record: true,
            };
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

    let scheduled_for = st
        .last_run_at
        .and_then(|last| due_fire_at(&job.schedule, last, now_secs(), job_seed(project, &job.id)));
    let context = |run_root: &str, copy: Option<&str>| {
        run_env(
            project,
            &job.id,
            run_root,
            trigger,
            scheduled_for,
            st.last_run_at,
            copy,
        )
    };

    if !job.check.is_empty() {
        // The check runs before any copy exists, so it always looks at the
        // project itself.
        match run_check(
            &root,
            &job.check,
            CHECK_TIMEOUT,
            Some(key),
            &context(&root, None),
            &crate::claude_pool::job_spawn_env(project, None, job.claude_account()).env,
        ) {
            Ok(check) if check.work => {}
            Ok(check) => {
                return Outcome {
                    result: NOTHING_TO_DO,
                    copy: None,
                    advance: true,
                    note: check.output,
                    record: true,
                }
            }
            Err(e) if e == "check timed out" => {
                return err_outcome("The check ran too long and was stopped.")
            }
            Err(e) => return err_outcome(format!("The check couldn't run: {e}.")),
        }
    }

    let (target, copy) = if job.duplicate.enabled && !project.is_empty() {
        runstep::copying(app, key);
        let dup = &job.duplicate;
        let result = if dup.worktree {
            crate::projects_crud::duplicate_worktree_project(
                app.clone(),
                project.to_string(),
                None,
                dup.reinstall_deps,
                None,
            )
        } else {
            crate::projects_crud::duplicate_project(
                app.clone(),
                project.to_string(),
                None,
                dup.exclude_uncommitted,
                dup.reinstall_deps,
                dup.pull_latest,
                None,
            )
        };
        match result {
            Ok(c) => (c.clone(), Some(c)),
            Err(e) => return err_outcome(format!("Couldn't duplicate the project: {e}")),
        }
    } else {
        (project.to_string(), None)
    };

    // A Stop that lands during the check or the duplicate step must not still
    // launch the agent.
    if is_cancel_requested(key) {
        return Outcome {
            result: CANCELED,
            copy,
            advance: true,
            note: None,
            record: true,
        };
    }

    let run_root = dispatch_root(&target).unwrap_or_else(|| root.clone());
    let dispatch_env = context(&run_root, copy.as_deref());
    dispatch_outcome(dispatch_run(app, key, &target, job, dispatch_env, trigger), copy)
}

fn dispatch_outcome(dispatch: Dispatch, copy: Option<String>) -> Outcome {
    match dispatch {
        Dispatch::Ran => Outcome {
            result: FOUND_WORK,
            copy,
            advance: true,
            note: None,
            record: true,
        },
        Dispatch::Captured => Outcome {
            result: FOUND_WORK,
            copy,
            advance: true,
            note: None,
            record: false,
        },
        Dispatch::Parked => Outcome {
            result: PENDING_WINDOW,
            copy,
            advance: true,
            note: None,
            record: true,
        },
        Dispatch::Error => Outcome {
            result: ERROR,
            copy,
            advance: true,
            note: Some("The run couldn't start.".to_string()),
            record: true,
        },
    }
}

/// The name the user gave the job. Notifications were the one surface still
/// showing the internal id.
fn find_job(project: &str, job_id: &str) -> Option<JobResolved> {
    resolve_one(project, job_id).ok()
}

fn label_of(job: Option<&JobResolved>, job_id: &str) -> String {
    job.map(|j| j.label.clone())
        .filter(|l| !l.trim().is_empty())
        .unwrap_or_else(|| job_id.to_string())
}

fn job_label(project: &str, job_id: &str) -> String {
    label_of(find_job(project, job_id).as_ref(), job_id)
}

/// The run's own verdict, short enough for a notification: what the agent said
/// first, and what the run cost. "Finished" on its own says nothing about
/// whether the job did what it was asked.
fn notification_detail(output: Option<&str>, cost: Option<f64>) -> Option<String> {
    let mut parts: Vec<String> = Vec::new();
    if let Some(line) = output.and_then(|o| first_line(o, 120)) {
        parts.push(line);
    }
    if let Some(c) = cost.filter(|c| *c > 0.0) {
        parts.push(format!("${c:.2}"));
    }
    (!parts.is_empty()).then(|| parts.join(" · "))
}

/// The report outside destinations get: what the run said, and how the check
/// after it went when the job has one.
fn report_text(output: Option<&str>, verified: Option<bool>) -> Option<String> {
    let check = match verified {
        Some(true) => Some("Checks passed."),
        Some(false) => Some("Checks failed."),
        None => None,
    };
    let parts: Vec<&str> = output
        .map(str::trim)
        .filter(|o| !o.is_empty())
        .into_iter()
        .chain(check)
        .collect();
    (!parts.is_empty()).then(|| parts.join("\n\n"))
}

/// How a run's check reads in a notification. Nothing is said when the job
/// declares no check — silence is not a pass.
fn verify_note(verified: Option<bool>) -> Option<String> {
    match verified {
        Some(true) => Some("checks passed".to_string()),
        Some(false) => Some("checks failed".to_string()),
        None => None,
    }
}

fn first_line(text: &str, max: usize) -> Option<String> {
    let line = text.lines().map(str::trim).find(|l| !l.is_empty())?;
    let mut out: String = line.chars().take(max).collect();
    if line.chars().count() > max {
        out.push('…');
    }
    Some(out)
}

/// The `<project>` and `<jobId>` halves of a state key.
fn split_key(key: &str) -> (&str, &str) {
    key.split_once('/').unwrap_or((key, ""))
}

/// The questions a live run has asked. `lpm ask` records them from another
/// process, so they're read back from the state rather than carried along.
fn live_asks(key: &str) -> Vec<Ask> {
    load_job_state(key)
        .active_run
        .map(|r| r.asks)
        .unwrap_or_default()
}

/// A quiet job's run that found nothing leaves no entry and interrupts no one —
/// unless it asked something, which is never nothing.
fn ended_quietly(
    app: &AppHandle,
    key: &str,
    quiet: bool,
    manual: bool,
    result: &str,
    output: Option<&str>,
) -> bool {
    if !found_nothing(quiet, result, output) || !live_asks(key).is_empty() {
        return false;
    }
    let _ = with_state(|f| {
        if let Some(st) = f.jobs.get_mut(key) {
            st.active_run = None;
        }
    });
    emit_quiet(app, key, manual);
    true
}

/// Record how a run ended, with the questions it asked, then announce it — and
/// resume it if an answer came in while it was finishing.
fn close_run(
    app: &AppHandle,
    key: &str,
    mut entry: HistoryEntry,
    detail: Option<String>,
    report: Option<String>,
) {
    let (at, canceled) = (entry.at, entry.result == CANCELED);
    entry.asks = with_state(|f| {
        // The job may have been deleted (its state cleared) while this run was
        // live — don't resurrect it with a ghost entry.
        let st = f.jobs.get_mut(key)?;
        let mut asks = st.active_run.take().map(|r| r.asks).unwrap_or_default();
        ask::settle(&mut asks, canceled, at);
        push_entry(
            st,
            HistoryEntry {
                asks: asks.clone(),
                ..entry.clone()
            },
        );
        Some(asks)
    })
    .ok()
    .flatten()
    .unwrap_or_default();
    announce_end(app, key, &entry, detail, report);
    ask::after_reap(app, key, at, &entry.asks);
}

/// Tell the views, and whoever the job reports to, how a run ended. A run
/// left waiting on a question says that instead of "finished": the user is
/// what it needs next. One whose answer already came in says nothing — it is
/// carrying on, and announces itself when it does.
fn announce_end(
    app: &AppHandle,
    key: &str,
    entry: &HistoryEntry,
    detail: Option<String>,
    report: Option<String>,
) {
    let (project, job_id) = split_key(key);
    let mut status = (entry.result.as_str(), detail, report);
    let mut asking = None;
    if entry.result != CANCELED {
        if let Some(open) = entry.asks.iter().find(|a| a.is_open() && !a.blocking) {
            asking = Some(open);
            let said = entry.output.as_deref().map(str::trim).unwrap_or_default();
            let body = [said, &open.outline()]
                .into_iter()
                .filter(|p| !p.is_empty())
                .collect::<Vec<_>>()
                .join("\n\n");
            status = (ASKED, Some(open.summary()), Some(body));
        } else if ask::resumes(&entry.asks) {
            return;
        }
    }
    let (result, detail, body) = status;
    // A reply someone is reading in lpm isn't news to send out; the job's own
    // work resuming after an answer is.
    let send_out = match (
        entry.question.is_none() || entry.answer_to.is_some(),
        asking,
    ) {
        (false, _) => SendOut::No,
        (true, Some(ask)) => SendOut::Asked(body.as_deref(), ask),
        (true, None) => SendOut::Report(body.as_deref()),
    };
    emit_status_detail(app, project, job_id, result, &None, detail, send_out);
}

/// A quiet job's run that found nothing: enough for the views to drop its
/// running state, and for a Run now someone is waiting on to say it finished —
/// no entry, no notification.
fn emit_quiet(app: &AppHandle, key: &str, manual: bool) {
    let (project, job_id) = split_key(key);
    let payload = json!({
        "project": project,
        "jobId": job_id,
        "result": QUIET,
        "label": job_label(project, job_id),
        "manual": manual,
    });
    let _ = app.emit("job-status", payload);
}

/// What outside destinations get for a status: the run's report (or nothing
/// more than how it ended), or nothing at all — a run that has only just
/// started, or a reply someone is reading in lpm, isn't news to send out.
enum SendOut<'a> {
    No,
    Report(Option<&'a str>),
    /// The report of a run waiting on `Ask`, which a destination may let the
    /// user answer.
    Asked(Option<&'a str>, &'a askform::Ask),
}

/// Enough for the views and phones to read the job again.
fn refresh_rows(app: &AppHandle, key: &str) {
    let (project, job_id) = split_key(key);
    let _ = app.emit("job-status", json!({ "project": project, "jobId": job_id }));
}

fn emit_status(app: &AppHandle, project: &str, job_id: &str, result: &str, copy: &Option<String>) {
    emit_status_detail(app, project, job_id, result, copy, None, SendOut::Report(None));
}

/// Every status goes to the views; how a run ended also goes wherever the job
/// sends its results — lpm's own toast, banner and phone push only when lpm
/// is one of them.
fn emit_status_detail(
    app: &AppHandle,
    project: &str,
    job_id: &str,
    result: &str,
    copy: &Option<String>,
    detail: Option<String>,
    send_out: SendOut,
) {
    let job = find_job(project, job_id);
    let label = label_of(job.as_ref(), job_id);
    let in_lpm = job.as_ref().map_or(true, |j| j.sends_to(sendto::LPM));
    let mut payload =
        json!({ "project": project, "jobId": job_id, "result": result, "label": label });
    if let Some(c) = copy {
        payload["copy"] = json!(c);
    }
    if let Some(d) = &detail {
        payload["detail"] = json!(d);
    }
    if !in_lpm {
        payload["notify"] = json!(false);
    }
    let _ = app.emit("job-status", payload);
    if in_lpm {
        notify_if_unattended(app, project, &label, result, detail.as_deref());
    }
    let (report, asking) = match send_out {
        SendOut::No => return,
        SendOut::Report(report) => (report, None),
        SendOut::Asked(report, ask) => (report, Some(ask)),
    };
    let (Some(job), Some((_, verb, mark))) = (job, outcome_words(result)) else {
        return;
    };
    sendto::deliver(
        app,
        &job.send_to,
        sendto::Report {
            mark,
            title: format!("\"{label}\"{} {verb}.", project_suffix(project)),
            body: report.map(str::to_string).or(detail),
            asking: asking.map(|ask| sendto::Asking {
                project: project.to_string(),
                job_id: job_id.to_string(),
                ask: ask.clone(),
            }),
        },
    );
}

/// How the outcomes worth telling anyone about read: a notification's title,
/// the verb after the job's name, and the mark a message leads with.
fn outcome_words(result: &str) -> Option<(&'static str, &'static str, &'static str)> {
    Some(match result {
        COMPLETED => ("Automation finished", "is done", "✅"),
        FOUND_WORK => ("Automation found work", "started working", "▶️"),
        ERROR => ("Automation hit a problem", "needs a look", "⚠️"),
        TIMED_OUT => ("Automation stopped", "ran too long and was stopped", "⏱️"),
        ASKED => ("Automation needs your answer", "is waiting for your answer", "❓"),
        _ => return None,
    })
}

/// " in Web", or nothing for a job that runs in no project.
fn project_suffix(project: &str) -> String {
    if project.is_empty() {
        String::new()
    } else {
        format!(" in {}", crate::config::project_display_name(project))
    }
}

/// Jobs exist to work while the user is away — when the window is hidden or in
/// the background, the in-app toast lands on glass nobody is looking at, so
/// outcomes worth interrupting for also go out as a system notification. Quiet
/// days and skips stay silent everywhere.
fn notify_if_unattended(
    app: &AppHandle,
    project: &str,
    label: &str,
    result: &str,
    detail: Option<&str>,
) {
    let Some((title, verb, _)) = outcome_words(result) else {
        return;
    };
    if !crate::statusnotify::should_notify(app, NotificationEvent::Automation) {
        return;
    }
    let mut body = format!("\"{label}\"{} {verb}.", project_suffix(project));
    if let Some(d) = detail {
        body.push(' ');
        body.push_str(d);
    }
    crate::statusnotify::notify(app, title, &body);
}

fn run_pipeline(app: &AppHandle, project: &str, job: &JobResolved, trigger: Trigger) {
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
                    st.running = Some(RunningLock {
                        started_at: now_secs(),
                    });
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
                    st.running = Some(RunningLock {
                        started_at: now_secs(),
                    });
                    LockDecision::Stale
                }
            }
        })
        .unwrap_or(LockDecision::Acquire)
    };

    if let LockDecision::Busy = decision {
        let _ = with_state(|f| {
            push_entry(
                f.jobs.entry(key.clone()).or_default(),
                HistoryEntry {
                    at: now_secs(),
                    result: SKIPPED_OVERLAP.to_string(),
                    output: Some(
                        "The run before this one was still going, so this one was skipped."
                            .to_string(),
                    ),
                    ..HistoryEntry::default()
                },
            );
        });
        emit_status(app, project, &job.id, SKIPPED_OVERLAP, &None);
        return;
    }

    runstep::begin(&key, job);
    emit_status(app, project, &job.id, RUNNING, &None);
    let mut outcome = pipeline_body(app, project, job, &key, trigger);
    runstep::end(&key);
    // The found-work path hands the cancel flag to the agent watcher; every
    // other exit consumes it here so a Stop pressed mid-pipeline is recorded.
    if outcome.result != FOUND_WORK && take_canceled(&key) {
        outcome = Outcome {
            result: CANCELED,
            copy: outcome.copy,
            advance: true,
            note: None,
            record: true,
        };
    }
    let at = now_secs();
    let _ = with_state(|f| {
        // The job may have been deleted (its state cleared) mid-pipeline —
        // like the agent watcher, never resurrect it with a ghost entry.
        if let Some(st) = f.jobs.get_mut(&key) {
            st.running = None;
            // A quiet job's check finding nothing is a quiet day too.
            if outcome.record && !(job.quiet() && outcome.result == NOTHING_TO_DO) {
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
            }
            if outcome.advance {
                st.last_run_at = Some(at);
            }
        }
    });
    if job.quiet() && outcome.result == NOTHING_TO_DO {
        emit_quiet(app, &key, trigger == Trigger::Manual);
        return;
    }
    // A quiet job's agent has only just started: whether it found anything is
    // for its own run to report, so the start stays as quiet as the outcome.
    let result = if job.quiet() && outcome.result == FOUND_WORK {
        RUNNING
    } else {
        outcome.result
    };
    // An agent run that has just been handed off reports for itself when it
    // ends; anything else ending here is the run's whole story.
    let send_out = if outcome.result == FOUND_WORK && !outcome.record {
        SendOut::No
    } else {
        SendOut::Report(outcome.note.as_deref())
    };
    emit_status_detail(app, project, &job.id, result, &outcome.copy, None, send_out);
}

fn spawn_pipeline(app: &AppHandle, project: &str, job: JobResolved, trigger: Trigger) {
    let key = state_key(project, &job.id);
    if !mark_inflight(&key) {
        return;
    }
    let app2 = app.clone();
    let project2 = project.to_string();
    std::thread::spawn(move || {
        run_pipeline(&app2, &project2, &job, trigger);
        clear_inflight(&key);
    });
}

// ---- orphaned-run recovery ----------------------------------------------------

/// When this machine booted, from the monotonic clock. A persisted pid is only
/// trusted when it was spawned in this boot.
#[cfg(unix)]
fn boot_epoch() -> u64 {
    let mut ts = libc::timespec {
        tv_sec: 0,
        tv_nsec: 0,
    };
    unsafe {
        libc::clock_gettime(libc::CLOCK_MONOTONIC, &mut ts);
    }
    now_secs().saturating_sub(ts.tv_sec as u64)
}

#[cfg(windows)]
fn boot_epoch() -> u64 {
    let uptime_ms = unsafe { windows_sys::Win32::System::SystemInformation::GetTickCount64() };
    now_secs().saturating_sub(uptime_ms / 1000)
}

/// The start time that, with the pid, identifies a run's process: a pid that
/// came back to someone else after the app quit never passes for the run.
fn proc_start(pid: u32) -> Option<u64> {
    crate::osproc::start_of(pid)
}

/// Whether the recorded run child is still alive and still ours: same boot,
/// and the pid's process started when the recorded one did, so a recycled pid
/// (someone else's process) fails. On Unix the pid must also still lead its own
/// process group (what setsid gave it), the only test state from a build that
/// kept no start time there could pass.
fn orphan_alive(run: &ActiveRun) -> bool {
    let same_boot = run
        .boot_at
        .map(|b| b.abs_diff(boot_epoch()) <= 60)
        .unwrap_or(false);
    if !same_boot {
        return false;
    }
    #[cfg(unix)]
    return unsafe { libc::kill(run.pid, 0) == 0 && libc::getpgid(run.pid) == run.pid }
        && run
            .proc_start
            .is_none_or(|start| proc_start(run.pid as u32) == Some(start));
    #[cfg(windows)]
    {
        run.pid > 0
            && run.proc_start.is_some()
            && crate::osproc::is_alive(run.pid as u32)
            && proc_start(run.pid as u32) == run.proc_start
    }
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
        // A run salvaged from its log after the app closed has no live child
        // left to check, so it is unverified rather than passed or failed.
        verified: None,
        verify_output: None,
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
        asks: Vec::new(),
        answer_to: run.answer_to.clone(),
        ran_on: None,
    }
}

fn finish_orphan(
    app: &AppHandle,
    key: &str,
    run: &ActiveRun,
    canceled: bool,
    timed_out: bool,
    ended_at: Option<u64>,
) {
    let log = std::fs::read_to_string(&run.log_path).unwrap_or_default();
    let entry = orphan_entry(run, &log, canceled, timed_out, now_secs(), ended_at);
    if ended_quietly(app, key, run.quiet, false, &entry.result, entry.output.as_deref()) {
        return;
    }
    let report = entry.output.clone();
    close_run(app, key, entry, None, report);
}

/// Re-own a run that outlived the previous app process: register it as running
/// (so overlap-skip, the UI's live state, and Stop all work again) and watch
/// the pid until it exits, is stopped, or crosses the run timeout measured
/// from its ORIGINAL start.
fn adopt_orphan(app: AppHandle, key: String, run: ActiveRun) {
    active_runs()
        .lock()
        .unwrap()
        .insert(key.clone(), run.started_at);
    ask::readopt(&key, &run.asks);
    std::thread::spawn(move || {
        let watch = crate::runguard::watch(run.pid as u32);
        let held: u64 = run.asks.iter().map(|a| a.waited_secs(now_secs())).sum();
        let mut deadline = run.started_at + RUN_TIMEOUT.as_secs() + held;
        let mut timed_out = false;
        let mut last = now_secs();
        loop {
            if is_cancel_requested(&key) {
                kill_group(run.pid);
                break;
            }
            watch.sweep();
            if !orphan_alive(&run) {
                break;
            }
            let now = now_secs();
            if ask::is_blocked(&key) {
                deadline += now.saturating_sub(last);
            }
            last = now;
            if now >= deadline {
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
/// How long a due job has been waiting, or None if it isn't due. Anchors a job
/// seen for the first time so one added while the app was closed never fires
/// retroactively.
fn overdue_by(project: &str, id: &str, job: &JobResolved, now: u64) -> Option<u64> {
    let key = state_key(project, id);
    let st = load_job_state(&key);

    let last = match st.last_run_at {
        Some(l) => l,
        None => {
            let _ = with_state(|f| {
                let s = f.jobs.entry(key.clone()).or_default();
                if s.last_run_at.is_none() {
                    s.last_run_at = Some(now_secs());
                }
            });
            return None;
        }
    };

    if !st.job_on(job) {
        return None;
    }
    let seed = job_seed(project, id);
    if !is_due(&job.schedule, last, now, seed) {
        return None;
    }
    Some(
        due_fire_at(&job.schedule, last, now, seed)
            .map(|fire| now.saturating_sub(fire))
            .unwrap_or(0),
    )
}

/// How many automations may be under way at once. Nothing bounded this before:
/// a morning where ten jobs came due together started ten agents, each of which
/// may also duplicate a project first.
const DEFAULT_MAX_CONCURRENT: usize = 3;

fn max_concurrent() -> usize {
    config::load_settings()
        .get("maxConcurrentAutomations")
        .and_then(Value::as_u64)
        .map(|n| n.max(1) as usize)
        .unwrap_or(DEFAULT_MAX_CONCURRENT)
}

/// A job counts as under way for its whole life: the in-flight set covers the
/// check and duplicate steps, the active-run map covers the agent that outlives
/// them. Neither alone spans the gap between the two.
/// A run held up on a question gives its seat back until it's answered.
fn under_way() -> usize {
    let pipelines: Vec<String> = inflight().lock().unwrap().keys().cloned().collect();
    let mut keys: HashSet<String> = pipelines.into_iter().collect();
    keys.extend(active_runs().lock().unwrap().keys().cloned());
    keys.retain(|k| !ask::is_blocked(k));
    keys.len()
}

/// Record a run deferred for capacity. It deliberately does not advance the
/// job's last-run time — the job stays due and goes first on a later tick
/// rather than forfeiting its turn.
fn record_capacity_skip(app: &AppHandle, project: &str, job: &JobResolved) {
    let key = state_key(project, &job.id);
    let _ = with_state(|f| {
        push_entry(
            f.jobs.entry(key.clone()).or_default(),
            HistoryEntry {
                at: now_secs(),
                result: SKIPPED_CAPACITY.to_string(),
                output: Some(
                    "Other automations were already running, so this one waited its turn."
                        .to_string(),
                ),
                ..HistoryEntry::default()
            },
        );
    });
    emit_status(app, project, &job.id, SKIPPED_CAPACITY, &None);
}

fn tick(app: &AppHandle) {
    ask::expire_due(app);
    let now = now_secs();
    let mut due: Vec<(String, JobResolved, u64)> = Vec::new();
    let mut shared: Vec<(String, machines::Machines)> = Vec::new();
    let mut consider = |project: &str, id: &str, job: JobResolved| {
        if let Some(m) = &job.machines {
            shared.push((state_key(project, id), m.clone()));
        }
        if let Some(waited) = overdue_by(project, id, &job, now) {
            due.push((project.to_string(), job, waited));
        }
    };
    for project in config::project_names() {
        for (id, _source, res) in resolve_jobs(&project) {
            let Ok(job) = res else { continue };
            consider(&project, &id, job);
        }
    }
    for (id, res) in resolve_standalone_jobs() {
        let Ok(job) = res else { continue };
        consider("", &id, job);
    }
    machines::pull(app, shared);

    // Longest-waiting first. The scan walks projects in a fixed order, so
    // taking them as they come would starve the same late-in-the-alphabet jobs
    // every single morning.
    due.sort_by(|a, b| b.2.cmp(&a.2));

    let cap = max_concurrent();
    for (project, job, waited) in due {
        let key = state_key(&project, &job.id);
        if !matches!(
            machines::plan(app, &key, &job, now, now.saturating_sub(waited)),
            machines::Plan::Run
        ) {
            continue;
        }
        if under_way() >= cap {
            record_capacity_skip(app, &project, &job);
            continue;
        }
        spawn_pipeline(app, &project, job, Trigger::Schedule);
    }
}

pub fn start_scheduler(app: AppHandle) {
    std::thread::spawn(move || {
        let _ = with_state(|f| {
            for st in f.jobs.values_mut() {
                prune_run_placeholders(st);
            }
        });
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
        RunTarget::Action { .. } => "action",
        RunTarget::Cmd(_) => "cmd",
        RunTarget::Prompt { .. } => "prompt",
    }
}

/// A one-glance summary of what the job runs, for the list row: the prompt
/// text, the command, or the action name.
fn run_description(run: &RunTarget) -> String {
    match run {
        RunTarget::Action { name, .. } => name.clone(),
        RunTarget::Cmd(c) => c.clone(),
        RunTarget::Prompt { prompt, .. } => prompt.clone(),
    }
}

fn schedule_json(schedule: &Schedule) -> Value {
    match schedule {
        Schedule::Interval {
            min_secs,
            max_secs,
            limits,
        } => {
            let mut v = json!({ "mode": "interval", "everySecs": min_secs });
            if max_secs > min_secs {
                v["everyMaxSecs"] = json!(max_secs);
            }
            if let Some(l) = limits {
                l.write_json(&mut v);
            }
            v
        }
        Schedule::Calendar(spec) => {
            let days: Vec<&str> = spec.days.iter().map(|d| DAY_NAMES[*d as usize]).collect();
            let mut v = json!({ "mode": "calendar", "atMinutes": spec.at_min, "days": days });
            if let Some(until) = spec.until_min {
                v["untilMinutes"] = json!(until);
            }
            if spec.times > 1 {
                v["times"] = json!(spec.times);
            }
            if let Some(n) = spec.pick_days {
                v["pickDays"] = json!(n);
            }
            if !spec.also_at.is_empty() {
                v["alsoAtMinutes"] = json!(spec.also_at);
            }
            if let Some(rule) = &spec.dates {
                rule.write_json(&mut v);
            }
            v
        }
        Schedule::Cron(spec) => json!({ "mode": "cron", "cron": spec.source }),
        Schedule::Manual => json!({ "mode": "manual" }),
    }
}

/// One aggregated row for a global-layer job — every-project, project-scoped, or
/// standalone — with run state folded across the folders it runs in, so a shared
/// job shows as a single list entry instead of one per project.
fn global_job_row(
    id: &str,
    def: &JobDef,
    projects: &[String],
    now: u64,
    names: &machines::Names,
) -> Value {
    let standalone = matches!(job_targets(def), JobTargets::Standalone);
    let existing: HashSet<&str> = projects.iter().map(String::as_str).collect();
    let targets: Vec<String> = match job_targets(def) {
        JobTargets::Every => projects.to_vec(),
        JobTargets::Projects(list) => list
            .into_iter()
            .filter(|p| existing.contains(p.as_str()))
            .collect(),
        JobTargets::Standalone => Vec::new(),
    };
    // The folders the job actually runs in: a standalone job's is the sentinel
    // "" (home dir); everything else is its targets.
    let run_targets: Vec<String> = if standalone {
        vec![String::new()]
    } else {
        targets.clone()
    };

    // Resolve against a representative project so validity and run details are
    // known — prompt and command jobs resolve the same everywhere, and shared
    // jobs never run actions.
    let repr = run_targets.first().cloned().unwrap_or_default();
    let resolved = resolve_job(&repr, id, def);

    let mut enabled = false;
    let mut running_count: u32 = 0;
    let mut running: Option<(String, JobState)> = None;
    let mut earliest_since: Option<u64> = None;
    let mut max_last: Option<u64> = None;
    let mut last_result: Option<String> = None;
    let mut last_entry: Option<HistoryEntry> = None;
    let mut next: Option<i64> = None;
    let mut unread: u32 = 0;
    let mut latest: Option<(u64, String)> = None;
    let mut waiting: Option<Value> = None;
    for t in &run_targets {
        let key = state_key(t, id);
        let st = load_job_state(&key);
        unread += unread_count(&st);
        if waiting.is_none() {
            waiting = ask::open_json(&st, t);
        }
        if let Some(msg) = latest_message(&st) {
            if latest.as_ref().map_or(true, |(at, _)| msg.0 > *at) {
                latest = Some(msg);
            }
        }
        let job_enabled = match &resolved {
            Ok(job) => st.job_on(job),
            Err(_) => st.is_on(false),
        };
        enabled = enabled || job_enabled;
        if let Some(lr) = st.last_run_at {
            if max_last.map_or(true, |m| lr >= m) {
                max_last = Some(lr);
                last_result = st.history.last().map(|h| h.result.clone());
                last_entry = st.history.last().cloned();
            }
        }
        if let Ok(job) = &resolved {
            if job_enabled {
                if let Some(nf) = next_fire_at(
                    &job.schedule,
                    st.last_run_at.unwrap_or(now),
                    now,
                    job_seed(t, id),
                ) {
                    next = Some(next.map_or(nf, |n: i64| n.min(nf)));
                }
            }
        }
        if let Some(since) = running_since(&key) {
            running_count += 1;
            earliest_since = Some(earliest_since.map_or(since, |e| e.min(since)));
            running = Some((key, st));
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
                "duplicate": job.duplicate.enabled,
                "runKind": run_kind(&job.run),
                "description": run_description(&job.run),
                "schedule": schedule_json(&job.schedule),
                "lastRunAt": max_last,
                "lastResult": last_result,
                "lastNote": last_entry.as_ref().and_then(last_note),
                "lastDurationSecs": last_entry.as_ref().and_then(|h| h.duration_secs),
                "nextFireAt": next,
                "running": running_count > 0,
                "runningSince": earliest_since,
                "runningCount": running_count,
                "targetCount": targets.len(),
                "targets": targets,
                "standalone": standalone,
                "unread": unread,
                "lastMessage": latest.map(|(_, m)| m),
            });
            if let Some(a) = waiting {
                row["ask"] = a;
            }
            // Several live runs have no one place to name.
            if let (1, Some((key, st))) = (running_count, &running) {
                runstep::add_row_fields(&mut row, key, st);
            }
            if let RunTarget::Prompt {
                agent,
                model,
                effort,
                ..
            } = &job.run
            {
                row["agent"] = json!(agent);
                row["model"] = json!(model);
                row["effort"] = json!(effort);
            }
            names.add_row_fields(&mut row, &job);
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
    let names = machines::Names::load();
    let mut out: Vec<Value> = Vec::new();
    for project in &projects {
        for mut row in project_job_rows(project, &names) {
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
        out.push(match def {
            Ok(d) => global_job_row(&id, &d, &projects, now, &names),
            Err(e) => json!({
                "id": id,
                "valid": false,
                "source": SOURCE_GLOBAL,
                "error": e,
                "enabled": false,
                "runningCount": 0,
                "targetCount": 0,
                "targets": [],
                "standalone": false,
            }),
        });
    }
    Ok(out)
}

#[tauri::command(async)]
pub fn list_jobs(project: String) -> Result<Vec<Value>, String> {
    Ok(project_job_rows(&project, &machines::Names::load()))
}

fn project_job_rows(project: &str, names: &machines::Names) -> Vec<Value> {
    let now = now_secs();
    resolve_jobs(project)
        .into_iter()
        .map(|(id, source, res)| {
            let key = state_key(&project, &id);
            let st = load_job_state(&key);
            match res {
                Ok(job) => {
                    let enabled = st.job_on(&job);
                    // A job the scheduler hasn't anchored yet (created moments
                    // ago) predicts from now — the anchor the next tick writes.
                    let next = next_fire_at(
                        &job.schedule,
                        st.last_run_at.unwrap_or(now),
                        now,
                        job_seed(&project, &id),
                    );
                    let since = running_since(&key);
                    let mut row = json!({
                        "id": id,
                        "valid": true,
                        "source": source,
                        "label": job.label,
                        "emoji": job.emoji,
                        "enabled": enabled,
                        "duplicate": job.duplicate.enabled,
                        "runKind": run_kind(&job.run),
                        "description": run_description(&job.run),
                        "schedule": schedule_json(&job.schedule),
                        "lastRunAt": st.last_run_at,
                        "lastResult": st.history.last().map(|h| h.result.clone()),
                        "lastNote": st.history.last().and_then(last_note),
                        "lastDurationSecs": st.history.last().and_then(|h| h.duration_secs),
                        "nextFireAt": next,
                        "running": since.is_some(),
                        "runningSince": since,
                        "unread": unread_count(&st),
                        "lastMessage": latest_message(&st).map(|(_, m)| m),
                    });
                    if let Some(a) = ask::open_json(&st, &project) {
                        row["ask"] = a;
                    }
                    runstep::add_row_fields(&mut row, &key, &st);
                    if let RunTarget::Prompt {
                        agent,
                        model,
                        effort,
                        ..
                    } = &job.run
                    {
                        row["agent"] = json!(agent);
                        row["model"] = json!(model);
                        row["effort"] = json!(effort);
                    }
                    names.add_row_fields(&mut row, &job);
                    row
                }
                Err(e) => json!({
                    "id": id,
                    "valid": false,
                    "source": source,
                    "error": e,
                    "enabled": st.is_on(false),
                }),
            }
        })
        .collect()
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
    let claude = crate::claude_pool::spawn_env(&project, None, false).env;
    let outcome = run_check(&root, check, Duration::from_secs(60), None, &[], &claude)?;
    Ok(json!({ "work": outcome.work, "output": outcome.output }))
}

#[tauri::command(async)]
pub fn run_job_now(app: AppHandle, project: String, job_id: String) -> Result<(), String> {
    let job = resolve_one(&project, &job_id)?;
    let st = load_job_state(&state_key(&project, &job_id));
    if !st.job_on(&job) {
        return Err("This automation is off. Turn it on to run it.".into());
    }
    if ask::open_in(&st).is_some() {
        return Err(
            "This automation is waiting for your answer. Answer or skip its question first."
                .into(),
        );
    }
    spawn_pipeline(&app, &project, job, Trigger::Manual);
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

/// Ends the live Claude run and says which tab carries it on, for the window
/// that asked to open it: a paired computer's job opens where the person is.
#[tauri::command]
pub async fn take_over_job_run(project: String, job_id: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || takeover::take_over(&project, &job_id))
        .await
        .map_err(|e| e.to_string())?
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
    start_followup(
        &app,
        &project,
        &job_id,
        at,
        Followup {
            message,
            agent,
            model,
            effort,
            answer_to: None,
        },
    )
}

/// The next message of a conversation, and who answers it.
#[derive(Default)]
struct Followup {
    message: String,
    agent: String,
    model: String,
    effort: String,
    /// The question this message answers — set when it's the user's answer
    /// resuming the run, which then carries on as the job's own work, with the
    /// job's own agent.
    answer_to: Option<String>,
}

fn start_followup(
    app: &AppHandle,
    project: &str,
    job_id: &str,
    at: u64,
    followup: Followup,
) -> Result<(), String> {
    let Followup {
        message,
        agent,
        model,
        effort,
        answer_to,
    } = followup;
    let message = message.trim().to_string();
    if message.is_empty() {
        return Err("Type a message to send.".into());
    }
    let key = state_key(project, job_id);
    if running_since(&key).is_some() {
        return Err("This job is running — wait for it to finish.".into());
    }

    let st = load_job_state(&key);
    let group = thread_groups(&st.history)
        .into_iter()
        .find(|g| g.iter().any(|&i| st.history[i].at == at))
        .ok_or_else(|| "That conversation isn't available anymore.".to_string())?;
    let entries: Vec<&HistoryEntry> = group.iter().map(|&i| &st.history[i]).collect();
    // Writing back in their own words answers whatever the thread was waiting
    // on.
    let answers_in_words = answer_to.is_none()
        && entries
            .iter()
            .any(|e| e.asks.iter().any(|a| a.is_open() && !a.blocking));
    let thread_ats: Vec<u64> = entries.iter().map(|e| e.at).collect();
    // Replies always continue from the thread's newest message, whichever
    // entry the user replied under.
    let tail = *entries.last().expect("a thread group is never empty");

    let job = resolve_one(project, job_id)?;
    let verify = answer_to
        .as_ref()
        .map(|_| job.verify.trim().to_string())
        .filter(|v| !v.is_empty());
    let RunTarget::Prompt {
        full_access,
        agent: job_agent,
        model: job_model,
        effort: job_effort,
        claude_account,
        ..
    } = &job.run
    else {
        return Err("Replies are only available for AI prompt jobs.".into());
    };
    let full_access = *full_access;
    let claude_account = claude_account.clone();
    let (agent, model, effort) = if answer_to.is_some() {
        (job_agent.clone(), job_model.clone(), job_effort.clone())
    } else {
        (agent, model, effort)
    };
    let agent = {
        let chosen = agent.trim().to_lowercase();
        if chosen.is_empty() {
            default_ai_cli()
        } else {
            chosen
        }
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
    let target = tail.copy.clone().unwrap_or_else(|| project.to_string());
    if tail.copy.is_some() && !config::project_exists(&target) {
        return Err("The copy that run worked in is gone — run the job again.".into());
    }
    let root = dispatch_root(&target)
        .ok_or_else(|| "This job has no local folder to run in.".to_string())?;

    let condensed = digest_prompt(&digest_of(&entries), &message);
    let thread_full = entries.iter().any(|e| e.result == CONTEXT_FULL);
    // Resuming is only sound when the newest message itself carries the
    // session — a thread that continued past it (another agent answered)
    // would lose that exchange. A session another computer ran is there.
    let resume = tail
        .session
        .clone()
        .filter(|_| agent == "claude" && !thread_full && tail.ran_on.is_none());
    let reply_env = run_env(
        project,
        job_id,
        &root,
        Trigger::Reply,
        None,
        None,
        tail.copy.as_deref(),
    );
    let browser = browser_tools(full_access);
    let terminal_flags = claude_terminal_flags(&model, &effort, full_access);
    let said = answers_in_words.then(|| message.clone());
    let spec = match resume {
        Some(sid) => CaptureSpec {
            cmdline: claude_cmdline(Some(&sid), &model, &effort, full_access, browser, &message),
            agent: Some(agent),
            copy: tail.copy.clone(),
            question: Some(message),
            resumed: Some(sid),
            follows: Some(tail.at),
            fallback: Some(claude_cmdline(
                None,
                &model,
                &effort,
                full_access,
                browser,
                &condensed,
            )),
            compacted: false,
            env: reply_env.clone(),
            verify: verify.clone(),
            quiet: false,
            manual: false,
            answer_to: answer_to.clone(),
            account: claude_account.clone(),
            terminal_flags: terminal_flags.clone(),
        },
        None => CaptureSpec {
            cmdline: agent_prompt_cmdline(&agent, &model, &effort, full_access, browser, &condensed),
            agent: Some(agent),
            copy: tail.copy.clone(),
            question: Some(message),
            resumed: None,
            follows: Some(tail.at),
            fallback: None,
            compacted: true,
            env: reply_env,
            verify,
            quiet: false,
            manual: false,
            answer_to,
            account: claude_account,
            terminal_flags,
        },
    };
    match spawn_captured(app, &key, &root, spec) {
        Dispatch::Captured => {
            if let Some(said) = said {
                ask::answer_in_words(&key, &thread_ats, &said);
            }
            emit_status(app, project, job_id, RUNNING, &None);
            Ok(())
        }
        _ => Err("Couldn't start the reply.".into()),
    }
}

/// One job by name, or why it can't run: a standalone job when `project` is
/// empty, otherwise the project's own.
fn resolve_one(project: &str, job_id: &str) -> Result<JobResolved, String> {
    if project.is_empty() {
        resolve_standalone_jobs()
            .into_iter()
            .find(|(id, _)| id == job_id)
            .ok_or_else(|| "That job doesn't exist.".to_string())?
            .1
    } else {
        resolve_jobs(project)
            .into_iter()
            .find(|(id, _, _)| id == job_id)
            .ok_or_else(|| "That job doesn't exist.".to_string())?
            .2
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
    key.split_once('/')
        .filter(|(_, id)| *id == job_id)
        .map(|(project, _)| project)
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

// ---- remote authoring (create / edit / delete a job's config) ---------------
//
// The desktop authors jobs by editing the layer's YAML doc on the frontend
// (jobsConfig.ts over the ReadConfig/SaveConfig bridge). The phone has no such
// bridge, so these mirror that read/modify/write against the same files the
// scheduler reads fresh every tick — a phone edit lands in the same file a
// desktop edit would, and is picked up on the next tick with no reschedule.
// serde_norway doesn't preserve comments the way the frontend's `yaml` lib does,
// so a phone-authored write reflows the file; the data (every other key, nested
// order) is preserved.

/// The config file a job of `source` lives in, matching jobsConfig.ts's layer
/// selection: the project registry, the repo `.lpm.yml`, or `~/.lpm/global.yml`.
fn job_config_path(source: &str, project: &str) -> Result<PathBuf, String> {
    match source {
        SOURCE_GLOBAL => Ok(config::global_path()),
        SOURCE_REPO => config::repo_path_for_project(project),
        _ => Ok(config::project_path(project)),
    }
}

/// The layer file parsed as a YAML mapping, or an empty mapping when it is
/// missing / unreadable / not a mapping (a fresh registry, say).
fn read_yaml_doc(path: &Path) -> serde_norway::Value {
    std::fs::read(path)
        .ok()
        .and_then(|b| serde_norway::from_slice::<serde_norway::Value>(&b).ok())
        .filter(serde_norway::Value::is_mapping)
        .unwrap_or_else(|| serde_norway::Value::Mapping(serde_norway::Mapping::new()))
}

/// Strict variant for read-modify-write: a missing file is a fresh mapping, but
/// an existing file that fails to read or parse aborts, so a transiently
/// malformed config is never silently replaced by just the jobs block.
fn read_yaml_doc_strict(path: &Path) -> Result<serde_norway::Value, String> {
    match std::fs::read(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            Ok(serde_norway::Value::Mapping(serde_norway::Mapping::new()))
        }
        Err(e) => Err(e.to_string()),
        Ok(b) => {
            let doc: serde_norway::Value = serde_norway::from_slice(&b)
                .map_err(|e| format!("The config file couldn't be parsed: {e}"))?;
            if doc.is_null() {
                Ok(serde_norway::Value::Mapping(serde_norway::Mapping::new()))
            } else if doc.is_mapping() {
                Ok(doc)
            } else {
                Err("The config file isn't valid.".into())
            }
        }
    }
}

fn write_yaml_doc(path: &Path, doc: &serde_norway::Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let out = serde_norway::to_string(doc).map_err(|e| e.to_string())?;
    config::write_config_file(path, &out)
}

/// The raw YAML body of one job (label/emoji/schedule/check/duplicate/run/
/// projects) as JSON — the mobile analogue of the frontend's readJobPayloadFrom,
/// so the phone editor can seed an edit from the exact stored config.
pub fn read_job_body(project: String, source: String, job_id: String) -> Result<Value, String> {
    let path = job_config_path(&source, &project)?;
    let doc = read_yaml_doc(&path);
    match doc.get("jobs").and_then(|j| j.get(job_id.as_str())) {
        Some(v) => serde_json::to_value(v).map_err(|e| e.to_string()),
        None => Err("This job no longer exists.".into()),
    }
}

/// `read_job_body` as YAML text, keeping the order the keys were written in —
/// what `lpm automations show` prints and `edit` starts from.
pub fn read_job_yaml(project: String, source: String, job_id: String) -> Result<String, String> {
    let path = job_config_path(&source, &project)?;
    let doc = read_yaml_doc(&path);
    match doc.get("jobs").and_then(|j| j.get(job_id.as_str())) {
        Some(v) => serde_norway::to_string(v).map_err(|e| e.to_string()),
        None => Err("That automation doesn't exist.".into()),
    }
}

/// Create or overwrite a job's `jobs.<id>` mapping in its layer file. `job` is
/// the full body the phone built (the same shape buildJobPayload writes). The
/// scheduler validates it on the next read, so an unrunnable job simply shows as
/// invalid in the list rather than being rejected here.
pub fn save_job_body(
    source: String,
    project: String,
    id: String,
    job: Value,
) -> Result<(), String> {
    let body: serde_norway::Value = serde_norway::to_value(&job).map_err(|e| e.to_string())?;
    save_job_value(source, project, id, body)
}

/// `save_job_body` for a body already parsed from YAML, so its key order
/// survives (a JSON object would sort it).
pub fn save_job_value(
    source: String,
    project: String,
    id: String,
    body: serde_norway::Value,
) -> Result<(), String> {
    let id = id.trim().to_string();
    if id.is_empty() {
        return Err("The job needs a name.".into());
    }
    if !body.is_mapping() {
        return Err("The job config is malformed.".into());
    }
    let path = job_config_path(&source, &project)?;
    let mut doc = read_yaml_doc_strict(&path)?;
    let map = doc
        .as_mapping_mut()
        .ok_or_else(|| "The config file isn't valid.".to_string())?;
    if !map
        .get("jobs")
        .map(serde_norway::Value::is_mapping)
        .unwrap_or(false)
    {
        map.insert(
            "jobs".into(),
            serde_norway::Value::Mapping(serde_norway::Mapping::new()),
        );
    }
    let jobs = map
        .get_mut("jobs")
        .and_then(serde_norway::Value::as_mapping_mut)
        .ok_or_else(|| "The config file isn't valid.".to_string())?;
    let mut body = body;
    machines::Names::load().settle_body(&mut body, jobs.get(id.as_str()));
    jobs.insert(id.as_str().into(), body);
    write_yaml_doc(&path, &doc)
}

/// Remove a job's config from its layer file, leaving its saved state.
pub fn remove_job_value(source: &str, project: &str, id: &str) -> Result<(), String> {
    let path = job_config_path(source, project)?;
    let mut doc = read_yaml_doc_strict(&path)?;
    if let Some(jobs) = doc
        .get_mut("jobs")
        .and_then(serde_norway::Value::as_mapping_mut)
    {
        jobs.shift_remove(id);
        if jobs.is_empty() {
            if let Some(map) = doc.as_mapping_mut() {
                map.shift_remove("jobs");
            }
        }
    }
    write_yaml_doc(&path, &doc)
}

/// Remove a job's config from its layer file and forget its saved state, the
/// pair the desktop's delete does (deleteJob + ClearJobState).
pub fn delete_job_body(
    app: AppHandle,
    source: String,
    project: String,
    id: String,
    delete_copies: bool,
) -> Result<(), String> {
    remove_job_value(&source, &project, &id)?;
    if source == SOURCE_GLOBAL {
        clear_job_state_global(app, id, delete_copies)
    } else {
        clear_job_state(app, project, id, delete_copies)
    }
}

#[tauri::command(async)]
pub fn set_job_enabled(project: String, job_id: String, enabled: bool) -> Result<(), String> {
    machines::write_switch(&project, &job_id, enabled)?;
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

/// Mark a job's runs read up to `at` — the run the user just opened, so the
/// ones that landed after it stay unread. Without `at`, everything up to now is
/// read. The watermark only ever moves forward: opening an older run can't
/// un-read the newer ones already behind it. A job that runs in several folders
/// is marked per folder, the same way its other row actions reach each one.
#[tauri::command(async)]
pub fn mark_job_seen(
    app: AppHandle,
    project: String,
    job_id: String,
    at: Option<u64>,
) -> Result<(), String> {
    let mark = at.unwrap_or_else(now_secs);
    with_state(|f| {
        let st = f.jobs.entry(state_key(&project, &job_id)).or_default();
        st.seen_at = Some(st.seen_at.map_or(mark, |seen| seen.max(mark)));
    })?;
    let _ = app.emit("job-seen", json!({ "project": project, "jobId": job_id }));
    Ok(())
}

/// Mark every job read at once.
#[tauri::command(async)]
pub fn mark_all_jobs_seen(app: AppHandle) -> Result<(), String> {
    let now = now_secs();
    with_state(|f| {
        for st in f.jobs.values_mut() {
            st.seen_at = Some(now);
        }
    })?;
    let _ = app.emit("job-seen", json!({}));
    Ok(())
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
            push_history(
                f.jobs.entry(key.clone()).or_default(),
                at,
                FOUND_WORK,
                copy.clone(),
            );
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
    let seen = st.seen_at.unwrap_or(0);
    Ok(st
        .history
        .iter()
        .map(|h| {
            let mut o = json!({ "at": h.at, "result": h.result });
            if h.at > seen && is_readable_outcome(&h.result) {
                o["unread"] = json!(true);
            }
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
            if !h.asks.is_empty() {
                o["asks"] = json!(h.asks);
            }
            if let Some(a) = &h.answer_to {
                o["answerTo"] = json!(a);
            }
            if let Some(m) = &h.ran_on {
                o["ranOn"] = json!(m);
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
            at: at.into(),
            days: days.iter().map(|s| s.to_string()).collect(),
            every,
            ..Default::default()
        }
    }

    fn cal(at_min: u32, days: Vec<u8>) -> CalendarSpec {
        CalendarSpec {
            at_min,
            also_at: vec![],
            until_min: None,
            times: 1,
            days,
            pick_days: None,
            dates: None,
        }
    }

    #[test]
    fn every_parsing() {
        assert_eq!(
            parse_every_secs(&EveryValue::Str("6h".into())).unwrap(),
            6 * 3600
        );
        assert_eq!(
            parse_every_secs(&EveryValue::Str("2d".into())).unwrap(),
            2 * 86_400
        );
        assert_eq!(
            parse_every_secs(&EveryValue::Str(" 3H ".into())).unwrap(),
            3 * 3600
        );
        assert_eq!(parse_every_secs(&EveryValue::Int(4)).unwrap(), 4 * 3600);
        assert_eq!(
            parse_every_secs(&EveryValue::Str("30m".into())).unwrap(),
            1_800
        );
        assert_eq!(
            parse_every_secs(&EveryValue::Str(" 15M ".into())).unwrap(),
            900
        );
        // Below the floor the tick can't honour it and a run would routinely
        // outlive its own gap.
        assert!(parse_every_secs(&EveryValue::Str("4m".into())).is_err());
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
        assert_eq!(jobcal::parse_day("mon").unwrap(), 0);
        assert_eq!(jobcal::parse_day("SUN").unwrap(), 6);
        assert_eq!(jobcal::parse_day(" thu ").unwrap(), 3);
        assert!(jobcal::parse_day("funday").is_err());
    }

    #[test]
    fn schedule_resolution() {
        assert_eq!(
            resolve_schedule(&sched("09:00", &["mon", "thu"], None)).unwrap(),
            Schedule::Calendar(cal(540, vec![0, 3])),
        );
        assert_eq!(
            resolve_schedule(&sched("", &[], Some(EveryValue::Str("6h".into())))).unwrap(),
            Schedule::Interval {
                min_secs: 6 * 3600,
                max_secs: 6 * 3600,
                limits: None,
            },
        );
        // days default to all
        assert_eq!(
            resolve_schedule(&sched("07:30", &[], None)).unwrap(),
            Schedule::Calendar(cal(450, vec![])),
        );
        // both / neither are errors
        assert!(resolve_schedule(&sched("09:00", &[], Some(EveryValue::Int(6)))).is_err());
        assert!(resolve_schedule(&sched("", &[], None)).is_err());
        // bad day propagates
        assert!(resolve_schedule(&sched("09:00", &["monday"], None)).is_err());
    }

    #[test]
    fn every_band_parsing() {
        assert_eq!(
            parse_every_band(&EveryValue::Str("4h-8h".into())).unwrap(),
            (4 * 3600, 8 * 3600)
        );
        // The unit may be written once, on the far end.
        assert_eq!(
            parse_every_band(&EveryValue::Str("4-8h".into())).unwrap(),
            (4 * 3600, 8 * 3600)
        );
        assert_eq!(
            parse_every_band(&EveryValue::Str(" 30m - 2h ".into())).unwrap(),
            (1_800, 7_200)
        );
        // A plain value is the band whose ends match.
        assert_eq!(
            parse_every_band(&EveryValue::Str("6h".into())).unwrap(),
            (6 * 3600, 6 * 3600)
        );
        assert_eq!(
            parse_every_band(&EveryValue::Int(4)).unwrap(),
            (4 * 3600, 4 * 3600)
        );
        assert!(parse_every_band(&EveryValue::Str("8h-4h".into())).is_err());
        assert!(parse_every_band(&EveryValue::Str("4m-8m".into())).is_err());
        assert!(parse_every_band(&EveryValue::Str("4h-".into())).is_err());
        assert!(parse_every_band(&EveryValue::Str("-8h".into())).is_err());
    }

    #[test]
    fn window_resolution() {
        let windowed = |at: &str, until: &str, times: Option<u32>| ScheduleDef {
            at: at.into(),
            until: until.into(),
            times,
            ..Default::default()
        };
        assert_eq!(
            resolve_schedule(&windowed("09:00", "17:00", Some(3))).unwrap(),
            Schedule::Calendar(CalendarSpec {
                at_min: 540,
                also_at: vec![],
                until_min: Some(17 * 60),
                times: 3,
                days: vec![],
                pick_days: None,
                dates: None,
            }),
        );
        // A window has to end after it starts, and can't be asked for more runs
        // than it has room for.
        assert!(resolve_schedule(&windowed("17:00", "09:00", None)).is_err());
        assert!(resolve_schedule(&windowed("09:00", "09:00", None)).is_err());
        assert!(resolve_schedule(&windowed("09:00", "09:20", Some(5))).is_err());
        assert!(resolve_schedule(&windowed("09:00", "09:20", Some(4))).is_ok());
        // More than one run a day needs a window to spread them across.
        assert!(resolve_schedule(&windowed("09:00", "", Some(3))).is_err());
        // A window is a time-of-day idea; an interval job can't take one.
        assert!(resolve_schedule(&ScheduleDef {
            until: "17:00".into(),
            every: Some(EveryValue::Str("6h".into())),
            ..Default::default()
        })
        .is_err());
    }

    #[test]
    fn pick_days_resolution() {
        let picking = |days: &[&str], pick: Option<u32>| ScheduleDef {
            at: "09:00".into(),
            days: days.iter().map(|s| s.to_string()).collect(),
            pick_days: pick,
            ..Default::default()
        };
        assert_eq!(
            resolve_schedule(&picking(&["mon", "tue", "wed"], Some(2))).unwrap(),
            Schedule::Calendar(CalendarSpec {
                at_min: 540,
                also_at: vec![],
                until_min: None,
                times: 1,
                days: vec![0, 1, 2],
                pick_days: Some(2),
                dates: None,
            }),
        );
        // Asking for every day it has is just "all of them" — no drawing needed.
        assert_eq!(resolve_pick_days(Some(3), &[0, 1, 2]).unwrap(), None);
        assert_eq!(resolve_pick_days(Some(7), &[]).unwrap(), None);
        assert_eq!(resolve_pick_days(Some(2), &[]).unwrap(), Some(2));
        assert!(resolve_pick_days(Some(0), &[0, 1]).is_err());
        assert!(resolve_pick_days(Some(4), &[0, 1, 2]).is_err());
    }

    #[test]
    fn run_resolution() {
        assert_eq!(
            resolve_run(
                "p",
                &RunDef {
                    cmd: "make".into(),
                    ..Default::default()
                }
            )
            .unwrap(),
            RunTarget::Cmd("make".into()),
        );
        assert_eq!(
            resolve_run(
                "p",
                &RunDef {
                    prompt: "upgrade".into(),
                    ..Default::default()
                }
            )
            .unwrap(),
            RunTarget::Prompt {
                prompt: "upgrade".into(),
                agent: String::new(),
                model: String::new(),
                effort: String::new(),
                full_access: true,
                quiet: false,
                memory: false,
                claude_account: None,
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
                quiet: false,
                memory: false,
                claude_account: None,
            },
        );
        assert!(resolve_run(
            "p",
            &RunDef {
                prompt: "x".into(),
                agent: "cursor".into(),
                ..Default::default()
            }
        )
        .is_err());
        assert!(resolve_run(
            "p",
            &RunDef {
                prompt: "x".into(),
                access: "sometimes".into(),
                ..Default::default()
            }
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
            &RunDef {
                cmd: "make".into(),
                prompt: "x".into(),
                ..Default::default()
            }
        )
        .is_err());
    }

    #[test]
    fn interval_due_math() {
        let s = Schedule::Interval {
            min_secs: 3600,
            max_secs: 3600,
            limits: None,
        };
        let last = 1_000_000u64;
        // due exactly at the boundary (>= interval)
        assert!(!is_due(&s, last, last + 3599, 0));
        assert!(is_due(&s, last, last + 3600, 0));
    }

    #[test]
    fn interval_period_does_not_stretch_by_the_jitter() {
        let s = Schedule::Interval {
            min_secs: 3600,
            max_secs: 3600,
            limits: None,
        };
        let last = 1_000_000u64;
        // A job with jitter keeps the interval it was given: charging the
        // jitter per period pushed every "every hour" job to 61-65 minutes and
        // slid it further out on each run.
        let seed = job_seed("proj", "hourly");
        assert!(is_due(&s, last, last + 3600, seed));
        assert_eq!(
            next_fire_at(&s, last, last, seed),
            Some((last + 3600) as i64)
        );

        // Twenty-four runs later the job is exactly a day on, not five hours
        // late.
        let mut t = last;
        for _ in 0..24 {
            t = next_fire_at(&s, t, t, seed).unwrap() as u64;
        }
        assert_eq!(t, last + 24 * 3600);
    }

    #[test]
    fn interval_band_draws_a_gap_inside_it_and_holds_it_still() {
        let s = Schedule::Interval {
            min_secs: 4 * 3600,
            max_secs: 8 * 3600,
            limits: None,
        };
        let seed = job_seed("proj", "poll");
        // The gap is stable for a given last run — the tick that asks whether
        // the job is due and the row predicting its next run must agree.
        for last in [1_000_000u64, 1_234_567, 1_700_000_000] {
            let gap = next_fire_at(&s, last, last, seed).unwrap() as u64 - last;
            assert!((4 * 3600..=8 * 3600).contains(&gap));
            assert_eq!(
                next_fire_at(&s, last, last + 99, seed).unwrap() as u64 - last,
                gap
            );
            assert!(!is_due(&s, last, last + gap - 1, seed));
            assert!(is_due(&s, last, last + gap, seed));
        }
        // And it really varies from gap to gap rather than being one draw the
        // job keeps forever.
        let gaps: HashSet<u64> = (0..40)
            .map(|i| {
                let last = 1_000_000 + i * 4_321;
                next_fire_at(&s, last, last, seed).unwrap() as u64 - last
            })
            .collect();
        assert!(gaps.len() > 20, "band collapsed to {} gaps", gaps.len());
    }

    fn local(y: i32, m: u32, d: u32, h: u32, min: u32) -> i64 {
        local_epoch(chrono::NaiveDate::from_ymd_opt(y, m, d).unwrap(), h * 60 + min).unwrap()
    }

    fn resolve_yaml(yaml: &str) -> Result<Schedule, String> {
        let def: ScheduleDef = serde_norway::from_str(yaml).unwrap();
        resolve_schedule(&def)
    }

    #[test]
    fn several_times_a_day() {
        let Schedule::Calendar(spec) = resolve_yaml("at: ['17:30', '09:00']\ndays: [mon]").unwrap() else {
            panic!("expected a calendar schedule")
        };
        assert_eq!((spec.at_min, spec.also_at.clone()), (540, vec![17 * 60 + 30]));
        // Monday 12 October 2026.
        let monday = chrono::NaiveDate::from_ymd_opt(2026, 10, 12).unwrap();
        assert_eq!(
            day_fire_points(monday, &spec, 0),
            vec![local(2026, 10, 12, 9, 0), local(2026, 10, 12, 17, 30)]
        );
        assert!(resolve_yaml("at: ['09:00', '09:03']").is_err());
        assert!(resolve_yaml("at: ['09:00', '12:00']\nuntil: '17:00'").is_err());
    }

    #[test]
    fn monthly_and_one_off_dates() {
        let Schedule::Calendar(spec) = resolve_yaml("at: '08:00'\ndays: [1, last]").unwrap() else {
            panic!("expected a calendar schedule")
        };
        let now = local(2026, 10, 11, 12, 0);
        assert_eq!(next_fire_point(&spec, now, 0), Some(local(2026, 10, 31, 8, 0)));
        assert_eq!(most_recent_fire_point(&spec, now, 0), Some(local(2026, 10, 1, 8, 0)));

        let Schedule::Calendar(nth) = resolve_yaml("at: '10:00'\ndays: first mon").unwrap() else {
            panic!("expected a calendar schedule")
        };
        assert_eq!(next_fire_point(&nth, now, 0), Some(local(2026, 11, 2, 10, 0)));

        let Schedule::Calendar(once) = resolve_yaml("at: '14:00'\ndays: [2027-03-01]").unwrap() else {
            panic!("expected a calendar schedule")
        };
        assert_eq!(next_fire_point(&once, now, 0), Some(local(2027, 3, 1, 14, 0)));
        assert_eq!(next_fire_point(&once, local(2027, 3, 1, 15, 0), 0), None);

        assert!(resolve_yaml("at: '08:00'\ndays: [1]\npickDays: 1").is_err());
        assert!(resolve_yaml("at: '08:00'\ndays: [mon]\nshortMonths: last").is_err());
    }

    #[test]
    fn interval_held_to_a_window() {
        let s = resolve_yaml("every: 30m\nat: '09:00'\nuntil: '18:00'\ndays: [mon, tue, wed, thu, fri]").unwrap();
        let Schedule::Interval { limits: Some(_), .. } = &s else {
            panic!("expected an interval with limits")
        };
        let friday_evening = local(2026, 10, 16, 17, 50) as u64;
        assert!(is_due(&s, friday_evening - 1800, friday_evening, 0));
        assert!(!is_due(&s, friday_evening, friday_evening + 1800, 0));
        assert_eq!(
            next_fire_at(&s, friday_evening, friday_evening + 60, 0),
            Some(local(2026, 10, 19, 9, 0))
        );
        assert!(resolve_yaml("every: 30m\nat: '09:00'").is_err());
        assert!(resolve_yaml("every: 30m\ndays: [1, 15]").is_err());
    }

    #[test]
    fn calendar_jitter_still_offsets_without_accumulating() {
        // Jitter belongs to the calendar mode, where jobs really do share a
        // fire point — and it offsets each occurrence rather than being added
        // to the gap between them.
        let spec = cal(9 * 60, Vec::new());
        let s = Schedule::Calendar(spec.clone());
        // A seed whose jitter works out to a known 5 minutes keeps the
        // assertion exact.
        let seed = MAX_JITTER_SECS;
        assert_eq!(implicit_jitter(&spec, seed), 300);
        let occ = most_recent_fire_point(&spec, now_secs() as i64, seed).unwrap() as u64;
        assert!(!is_due(&s, occ - 1, occ + 100, seed));
        assert!(is_due(&s, occ - 1, occ + 300, seed));
    }

    #[test]
    fn calendar_due_coalesces_and_never_fires_at_init() {
        // Midnight every day. Its most-recent occurrence is always <= now.
        let spec = cal(0, vec![]);
        let s = Schedule::Calendar(spec.clone());
        let now = 1_700_000_000i64;
        let occ = most_recent_fire_point(&spec, now, 0).unwrap();
        assert!(occ <= now);

        // A long gap (last run 30 days ago) collapses to a single due=true.
        assert!(is_due(
            &s,
            (occ as u64).saturating_sub(30 * 86_400),
            now as u64,
            0
        ));
        // Once last_run has caught up to the occurrence, it is no longer due —
        // this is exactly the "anchor lastRunAt = now, never fire at init" case.
        assert!(!is_due(&s, occ as u64, now as u64, 0));
        assert!(!is_due(&s, now as u64, now as u64, 0));
    }

    #[test]
    fn window_lands_inside_itself_and_replaces_the_implicit_jitter() {
        let spec = CalendarSpec {
            at_min: 9 * 60,
            also_at: vec![],
            until_min: Some(17 * 60),
            times: 1,
            days: Vec::new(),
            pick_days: None,
            dates: None,
        };
        // A window is the job's own spread, so the blind 0-5 minute offset that
        // would push a run past 17:00 is not charged on top of it.
        assert_eq!(implicit_jitter(&spec, u64::MAX), 0);

        let date = chrono::NaiveDate::from_ymd_opt(2026, 3, 4).unwrap();
        let start = local_epoch(date, 9 * 60).unwrap();
        let end = local_epoch(date, 17 * 60).unwrap();
        let mut seen = HashSet::new();
        for id in 0..60 {
            let points = day_fire_points(date, &spec, job_seed("proj", &format!("job-{id}")));
            assert_eq!(points.len(), 1);
            assert!((start..=end).contains(&points[0]));
            seen.insert(points[0]);
        }
        // Different jobs land at different points — that is the whole feature.
        assert!(seen.len() > 40, "window collapsed to {} times", seen.len());
    }

    #[test]
    fn window_is_stable_per_day_and_moves_between_days() {
        let spec = CalendarSpec {
            at_min: 9 * 60,
            also_at: vec![],
            until_min: Some(17 * 60),
            times: 1,
            days: Vec::new(),
            pick_days: None,
            dates: None,
        };
        let seed = job_seed("proj", "sweep");
        let date = chrono::NaiveDate::from_ymd_opt(2026, 3, 4).unwrap();
        // Asked twice on the same day, the same answer — otherwise a job would
        // re-roll its time on every tick and fire at the first minute a draw
        // came up short.
        assert_eq!(
            day_fire_points(date, &spec, seed),
            day_fire_points(date, &spec, seed)
        );
        let times: HashSet<i64> = (0..30)
            .map(|d| {
                let day = date + chrono::Duration::days(d);
                day_fire_points(day, &spec, seed)[0] - local_epoch(day, 9 * 60).unwrap()
            })
            .collect();
        assert!(times.len() > 20, "window froze at {} offsets", times.len());
    }

    #[test]
    fn several_runs_a_day_spread_across_the_window_without_crowding() {
        let spec = CalendarSpec {
            at_min: 9 * 60,
            also_at: vec![],
            until_min: Some(17 * 60),
            times: 3,
            days: Vec::new(),
            pick_days: None,
            dates: None,
        };
        let date = chrono::NaiveDate::from_ymd_opt(2026, 3, 4).unwrap();
        let start = local_epoch(date, 9 * 60).unwrap();
        let end = local_epoch(date, 17 * 60).unwrap();
        for id in 0..40 {
            let points = day_fire_points(date, &spec, job_seed("proj", &format!("job-{id}")));
            assert_eq!(points.len(), 3);
            assert!(points[0] >= start && *points.last().unwrap() <= end);
            for pair in points.windows(2) {
                assert!(pair[1] > pair[0], "runs out of order: {points:?}");
                assert!(
                    pair[1] - pair[0] >= MIN_INTERVAL_SECS as i64,
                    "two runs crowded into {}s",
                    pair[1] - pair[0]
                );
            }
        }
    }

    #[test]
    fn each_run_in_the_window_fires_once() {
        let spec = CalendarSpec {
            at_min: 0,
            also_at: vec![],
            until_min: Some(23 * 60),
            times: 3,
            days: Vec::new(),
            pick_days: None,
            dates: None,
        };
        let s = Schedule::Calendar(spec.clone());
        let seed = job_seed("proj", "thrice");
        let date = chrono::NaiveDate::from_ymd_opt(2026, 3, 4).unwrap();
        let points = day_fire_points(date, &spec, seed);
        // Walking the day a slot at a time: each fire point comes due exactly
        // once, and the run it records is what the next one is measured from.
        let mut last = points[0] as u64 - 1;
        for p in &points {
            assert!(is_due(&s, last, *p as u64, seed));
            assert!(!is_due(&s, *p as u64, *p as u64, seed));
            last = *p as u64;
        }
        assert_eq!(next_fire_point(&spec, points[0], seed), Some(points[1]));
    }

    #[test]
    fn picked_days_takes_the_asked_for_number_from_the_week() {
        let spec = CalendarSpec {
            at_min: 9 * 60,
            also_at: vec![],
            until_min: None,
            times: 1,
            days: vec![0, 1, 2, 3, 4],
            pick_days: Some(2),
            dates: None,
        };
        let seed = job_seed("proj", "weekly-sweep");
        let monday = chrono::NaiveDate::from_ymd_opt(2026, 3, 2).unwrap();
        assert_eq!(monday.weekday().num_days_from_monday(), 0);
        for week in 0..12i64 {
            let start = monday + chrono::Duration::weeks(week);
            let chosen: Vec<u8> = (0..7)
                .filter(|d| day_ok(start + chrono::Duration::days(*d), &spec, seed))
                .map(|d| d as u8)
                .collect();
            assert_eq!(chosen.len(), 2, "week {week} picked {chosen:?}");
            // Never a weekend: the draw comes out of the days the job named.
            assert!(chosen.iter().all(|d| *d < 5));
        }
        // Over enough weeks every allowed day gets its turn.
        let ever: HashSet<u8> = (0..70i64)
            .filter(|d| day_ok(monday + chrono::Duration::days(*d), &spec, seed))
            .map(|d| (d % 7) as u8)
            .collect();
        assert_eq!(ever.len(), 5);
    }

    #[test]
    fn picked_days_still_finds_the_next_run_across_a_long_gap() {
        // Two days out of seven can leave a fortnight between the pair one week
        // lands on and the pair the next does — the search has to look that far.
        let spec = CalendarSpec {
            at_min: 9 * 60,
            also_at: vec![],
            until_min: None,
            times: 1,
            days: Vec::new(),
            pick_days: Some(1),
            dates: None,
        };
        let now = local_epoch(chrono::NaiveDate::from_ymd_opt(2026, 3, 2).unwrap(), 0).unwrap();
        for id in 0..40 {
            let seed = job_seed("proj", &format!("job-{id}"));
            let next = next_fire_point(&spec, now, seed);
            assert!(next.is_some(), "job-{id} never comes due");
            assert!(most_recent_fire_point(&spec, now, seed).is_some());
        }
    }

    #[test]
    fn manual_never_auto_fires() {
        let now = 1_700_000_000u64;
        // Never due, no matter how long since the last (or never a) run.
        assert!(!is_due(&Schedule::Manual, 0, now, 0));
        assert!(!is_due(&Schedule::Manual, now, now + 10 * 86_400, 0));
        // And it has no next fire point.
        assert_eq!(next_fire_at(&Schedule::Manual, 0, now, 0), None);
    }

    #[test]
    fn resolve_manual_schedule() {
        let sched = ScheduleDef {
            manual: true,
            ..Default::default()
        };
        assert_eq!(resolve_schedule(&sched), Ok(Schedule::Manual));
    }

    #[test]
    fn cron_schedules_fire_on_their_line() {
        let s = resolve_yaml("cron: '0 18 * * 5'").unwrap();
        assert_eq!(schedule_json(&s), json!({ "mode": "cron", "cron": "0 18 * * 5" }));
        // Friday 2026-07-10: due once 18:00 has passed a run made before it,
        // and only then.
        let six = local_epoch(chrono::NaiveDate::from_ymd_opt(2026, 7, 10).unwrap(), 18 * 60).unwrap() as u64;
        assert!(!is_due(&s, six - 3_600, six - 60, 0));
        assert!(is_due(&s, six - 3_600, six + 60, 0));
        assert!(!is_due(&s, six + 30, six + 60, 0));
        assert_eq!(due_fire_at(&s, six - 3_600, six + 60, 0), Some(six));
        assert_eq!(next_fire_at(&s, six, six, 0), Some((six + 7 * 86_400) as i64));

        assert!(resolve_yaml("cron: '0 18 * * 5'\nat: '09:00'").is_err());
        assert!(resolve_yaml("cron: '* * * * *'").unwrap_err().contains("5 minutes"));
    }

    #[test]
    fn jitter_is_stable_and_bounded() {
        let spec = cal(9 * 60, Vec::new());
        let a = implicit_jitter(&spec, job_seed("proj", "dep-updates"));
        assert_eq!(a, implicit_jitter(&spec, job_seed("proj", "dep-updates")));
        assert!(a <= MAX_JITTER_SECS);
        // different keys generally differ; at minimum the function is total.
        let b = implicit_jitter(&spec, job_seed("proj", "other"));
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
    fn switch_wins_over_config() {
        let mut st = JobState::default();
        assert!(st.is_on(true));
        assert!(!st.is_on(false));
        st.enabled_override = Some(false);
        assert!(!st.is_on(true));
        st.enabled_override = Some(true);
        assert!(st.is_on(false));
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
        let got: Vec<(u64, &str, Option<u32>)> = st
            .history
            .iter()
            .map(|h| (h.at, h.result.as_str(), h.count))
            .collect();
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
    fn a_captured_run_is_recorded_once_by_its_watcher() {
        let captured = dispatch_outcome(Dispatch::Captured, Some("proj-abc123".into()));
        assert_eq!(captured.result, FOUND_WORK);
        assert!(captured.advance);
        assert!(
            !captured.record,
            "the watcher writes the run's entry when the agent exits"
        );
        // Everything the pipeline hands off is only ever recorded here.
        for dispatch in [Dispatch::Ran, Dispatch::Parked, Dispatch::Error] {
            assert!(dispatch_outcome(dispatch, None).record);
        }
    }

    #[test]
    fn legacy_run_markers_are_pruned_from_history() {
        let done = |at: u64, secs: u64| HistoryEntry {
            at,
            result: COMPLETED.to_string(),
            output: Some("all set".into()),
            duration_secs: Some(secs),
            ..HistoryEntry::default()
        };
        let history = vec![
            // The marker an older build wrote when the run below was spawned.
            entry(100, FOUND_WORK, None, None, None, None),
            done(189, 89),
            // An action job's marker: nothing reports back, so it stays.
            entry(200, FOUND_WORK, None, None, None, None),
            entry(300, NOTHING_TO_DO, None, None, None, None),
            // A run that started long after the marker before it is its own.
            entry(400, FOUND_WORK, None, None, None, None),
            done(900, 30),
            // A run salvaged after the app closed mid-flight kept no duration.
            entry(1000, FOUND_WORK, None, None, None, None),
            entry(
                1100,
                COMPLETED,
                Some("picked up from the log"),
                None,
                None,
                None,
            ),
            // The check failing on the next tick is not that marker's run.
            entry(1200, FOUND_WORK, None, None, None, None),
            entry(
                1300,
                ERROR,
                Some("The check couldn't run."),
                None,
                None,
                None,
            ),
        ];
        let mut st = JobState {
            history,
            ..JobState::default()
        };
        prune_run_placeholders(&mut st);
        let got: Vec<(u64, &str)> = st
            .history
            .iter()
            .map(|h| (h.at, h.result.as_str()))
            .collect();
        assert_eq!(
            got,
            [
                (189, COMPLETED),
                (200, FOUND_WORK),
                (300, NOTHING_TO_DO),
                (400, FOUND_WORK),
                (900, COMPLETED),
                (1100, COMPLETED),
                (1200, FOUND_WORK),
                (1300, ERROR),
            ],
        );
    }

    #[test]
    fn pruning_keeps_the_copy_a_run_worked_in() {
        let mut st = JobState {
            history: vec![
                HistoryEntry {
                    at: 10,
                    result: FOUND_WORK.to_string(),
                    copy: Some("proj-abc123".into()),
                    ..HistoryEntry::default()
                },
                HistoryEntry {
                    at: 70,
                    result: COMPLETED.to_string(),
                    copy: Some("proj-abc123".into()),
                    duration_secs: Some(60),
                    ..HistoryEntry::default()
                },
            ],
            ..JobState::default()
        };
        prune_run_placeholders(&mut st);
        assert_eq!(st.history.len(), 1);
        assert_eq!(st.history[0].copy.as_deref(), Some("proj-abc123"));
    }

    #[test]
    fn check_reports_what_it_said_and_what_it_was_told() {
        let root = std::env::temp_dir().to_string_lossy().into_owned();
        let env = run_env(
            "blog",
            "nightly",
            &root,
            Trigger::Schedule,
            Some(1_700_000_000),
            Some(1_699_000_000),
            None,
        );

        // The check's own words used to be discarded, so a broken check and a
        // quiet one were indistinguishable.
        let found = run_check(
            &root,
            "echo '3 packages are out of date'",
            Duration::from_secs(30),
            None,
            &env,
            &config::ClaudeEnv::Inherit,
        )
        .unwrap();
        assert!(found.work);
        assert_eq!(found.output.as_deref(), Some("3 packages are out of date"));

        // Anything it wrote on the way to deciding there was nothing to do is
        // kept too — that is the case the user cannot otherwise explain.
        let quiet = run_check(
            &root,
            "echo 'up to date' >&2; exit 1",
            Duration::from_secs(30),
            None,
            &env,
            &config::ClaudeEnv::Inherit,
        )
        .unwrap();
        assert!(!quiet.work);
        assert_eq!(quiet.output.as_deref(), Some("up to date"));

        // The run context reaches the child.
        let ctx = run_check(
            &root,
            "echo \"$LPM_JOB_ID $LPM_PROJECT_NAME $LPM_TRIGGER $LPM_IS_COPY $LPM_LAST_RUN_AT\"",
            Duration::from_secs(30),
            None,
            &env,
            &config::ClaudeEnv::Inherit,
        )
        .unwrap();
        assert_eq!(
            ctx.output.as_deref(),
            Some("nightly blog schedule 0 1699000000")
        );
    }

    #[test]
    fn run_env_points_the_memory_skill_at_the_project() {
        let env = run_env("blog", "nightly", "/tmp", Trigger::Manual, None, None, None);
        let dir = env
            .iter()
            .find(|(k, _)| k == "LPM_MEMORY_DIR")
            .map(|(_, v)| std::path::PathBuf::from(v))
            .expect("LPM_MEMORY_DIR");
        assert!(dir.ends_with(std::path::Path::new("memory").join("blog")));

        let standalone = run_env("", "nightly", "/tmp", Trigger::Manual, None, None, None);
        assert!(standalone.iter().all(|(k, _)| k != "LPM_MEMORY_DIR"));
    }

    #[test]
    fn run_env_names_the_copy_a_run_is_in_apart_from_its_original() {
        let var = |env: &[(String, String)], key: &str| {
            env.iter().find(|(k, _)| k == key).map(|(_, v)| v.clone())
        };
        let copy = run_env("blog", "n", "/c", Trigger::Manual, None, None, Some("blog-x1"));
        assert_eq!(var(&copy, "LPM_PROJECT_NAME").as_deref(), Some("blog"));
        assert_eq!(var(&copy, "LPM_RUN_PROJECT").as_deref(), Some("blog-x1"));
        assert_eq!(var(&copy, "LPM_IS_COPY").as_deref(), Some("1"));

        let original = run_env("blog", "n", "/r", Trigger::Manual, None, None, None);
        assert_eq!(var(&original, "LPM_RUN_PROJECT").as_deref(), Some("blog"));
        assert_eq!(var(&original, "LPM_IS_COPY").as_deref(), Some("0"));

        let standalone = run_env("", "n", "/h", Trigger::Manual, None, None, None);
        assert_eq!(var(&standalone, "LPM_RUN_PROJECT"), None);
    }

    #[test]
    fn check_times_out_and_is_killed() {
        let root = std::env::temp_dir().to_string_lossy().into_owned();
        let start = std::time::Instant::now();
        let res = run_check(
            &root,
            "sleep 5",
            Duration::from_secs(1),
            None,
            &[],
            &config::ClaudeEnv::Inherit,
        );
        assert!(res.is_err(), "a check that outlives its timeout must error");
        assert!(
            start.elapsed() < Duration::from_secs(4),
            "the check should be killed, not waited out"
        );
    }

    #[test]
    fn wait_or_kill_times_out() {
        let root = std::env::temp_dir().to_string_lossy().into_owned();
        let mut child = shell_command(&root, "sleep 30", &[], &config::ClaudeEnv::Inherit)
            .spawn()
            .unwrap();
        let start = std::time::Instant::now();
        let verdict = wait_or_kill(
            &mut child,
            std::time::Instant::now() + Duration::from_millis(300),
            None,
        );
        assert!(matches!(verdict, Ok(WaitVerdict::TimedOut)));
        assert!(
            start.elapsed() < Duration::from_secs(4),
            "the run should be killed, not waited out"
        );
    }

    #[test]
    fn only_agent_runs_turn_off_msys_argument_rewriting() {
        let env = vec![("LPM_JOB_ID".to_string(), "nightly".to_string())];
        let line = "( claude -p '/review the diff' ) > log 2>&1";
        let excl = |c: &Command| {
            c.get_envs()
                .find(|(k, _)| *k == "MSYS2_ARG_CONV_EXCL")
                .and_then(|(_, v)| v)
                .map(|v| v.to_string_lossy().into_owned())
        };
        let account = config::ClaudeEnv::Dir("/acct".into());
        let agent = captured_command("/tmp", line, &env, &account, true);
        let plain = captured_command("/tmp", line, &env, &account, false);
        assert_eq!(excl(&plain), None);
        if cfg!(windows) {
            assert_eq!(excl(&agent).as_deref(), Some("/review"));
        } else {
            assert_eq!(excl(&agent), None);
        }
        assert!(agent
            .get_envs()
            .any(|(k, v)| k == "LPM_JOB_ID" && v == Some("nightly".as_ref())));
        assert!(agent
            .get_envs()
            .any(|(k, v)| k == config::CLAUDE_CONFIG_DIR_ENV && v == Some("/acct".as_ref())));
    }

    #[test]
    fn wait_or_kill_honors_stop_request() {
        let key = "test-cancel/job";
        let root = std::env::temp_dir().to_string_lossy().into_owned();
        let mut child = shell_command(&root, "sleep 30", &[], &config::ClaudeEnv::Inherit)
            .spawn()
            .unwrap();
        canceled_keys().lock().unwrap().insert(key.to_string());
        let start = std::time::Instant::now();
        let verdict = wait_or_kill(
            &mut child,
            std::time::Instant::now() + Duration::from_secs(60),
            Some(key),
        );
        assert!(matches!(verdict, Ok(WaitVerdict::Canceled)));
        assert!(
            start.elapsed() < Duration::from_secs(4),
            "a stopped run should be killed promptly"
        );
        assert!(
            take_canceled(key),
            "the flag stays for the caller to consume"
        );
        assert!(!take_canceled(key), "consuming the flag clears it");
    }

    #[test]
    fn stop_only_flags_running_jobs() {
        let key = "test-stop/idle";
        assert!(
            !request_cancel(key),
            "a job with no live run must not be flagged"
        );
        assert!(!is_cancel_requested(key));

        assert!(mark_inflight(key));
        assert!(
            request_cancel(key),
            "an inflight pipeline accepts a stop request"
        );
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
            quiet: false,
            boot_at: None,
            proc_start: None,
            token: None,
            asks: Vec::new(),
            answer_to: None,
            terminal_flags: String::new(),
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
            evaluate_lock(
                &Some(RunningLock { started_at: 100 }),
                100 + STALE_LOCK_SECS + 1
            ),
            LockDecision::Stale
        ));
    }

    #[test]
    fn agent_cmdlines_run_headless() {
        assert_eq!(
            agent_prompt_cmdline("claude", "", "", false, false, "fix it"),
            "claude --allowedTools 'Bash(lpm ask:*)' -p --verbose --output-format stream-json 'fix it'"
        );
        assert_eq!(
            agent_prompt_cmdline("claude", "opus", "", false, false, "fix it"),
            "claude --model 'opus' --allowedTools 'Bash(lpm ask:*)' -p --verbose --output-format stream-json 'fix it'"
        );
        assert_eq!(
            agent_prompt_cmdline("claude", "opus", "high", false, false, "fix it"),
            "claude --model 'opus' --effort 'high' --allowedTools 'Bash(lpm ask:*)' -p --verbose --output-format stream-json 'fix it'"
        );
        assert_eq!(
            agent_prompt_cmdline("codex", "gpt-5.6-sol", "", false, false, "fix"),
            "codex exec --skip-git-repo-check -m 'gpt-5.6-sol' 'fix'"
        );
        assert_eq!(
            agent_prompt_cmdline("codex", "gpt-5.6-sol", "high", false, false, "fix"),
            "codex exec --skip-git-repo-check -m 'gpt-5.6-sol' -c model_reasoning_effort='high' 'fix'"
        );
        assert_eq!(
            agent_prompt_cmdline("claude", "", "max", false, false, "fix it"),
            "claude --effort 'max' --allowedTools 'Bash(lpm ask:*)' -p --verbose --output-format stream-json 'fix it'"
        );
        assert_eq!(
            agent_prompt_cmdline("gemini", "", "", false, false, "fix"),
            "gemini -o json -p 'fix'"
        );
        assert_eq!(
            agent_prompt_cmdline("opencode", "", "", false, false, "fix"),
            "opencode run 'fix'"
        );
    }

    #[test]
    fn full_access_cmdlines_grant_unattended_mode() {
        assert_eq!(
            agent_prompt_cmdline("claude", "", "", true, false, "fix it"),
            "claude --dangerously-skip-permissions -p --verbose --output-format stream-json 'fix it'"
        );
        assert_eq!(
            agent_prompt_cmdline("claude", "haiku", "low", true, false, "fix it"),
            "claude --model 'haiku' --effort 'low' --dangerously-skip-permissions -p --verbose --output-format stream-json 'fix it'"
        );
        assert_eq!(
            agent_prompt_cmdline("codex", "", "", true, false, "fix"),
            "codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox 'fix'"
        );
        assert_eq!(
            agent_prompt_cmdline("gemini", "", "", true, false, "fix"),
            "gemini --yolo -o json -p 'fix'"
        );
        assert_eq!(
            agent_prompt_cmdline("opencode", "", "", true, false, "fix"),
            "opencode run 'fix'"
        );
    }

    #[test]
    fn browser_runs_hand_claude_its_chrome_tools() {
        assert_eq!(
            agent_prompt_cmdline("claude", "", "", true, true, "read my feed"),
            "claude --dangerously-skip-permissions --chrome -p --verbose --output-format stream-json 'read my feed'"
        );
        assert_eq!(
            claude_cmdline(Some("abc-123"), "", "", true, true, "and then?"),
            "claude --resume 'abc-123' --dangerously-skip-permissions --chrome -p --verbose --output-format stream-json 'and then?'"
        );
        assert_eq!(
            agent_prompt_cmdline("codex", "", "", true, true, "read my feed"),
            "codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox 'read my feed'"
        );
        assert!(!browser_tools(false));
    }

    #[test]
    fn context_limit_error_is_recognized() {
        assert!(hit_context_limit(Some(
            "API Error: 400 … Prompt is too long"
        )));
        assert!(hit_context_limit(Some(
            "prompt is too long: 210000 tokens > 200000 maximum"
        )));
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
        assert_eq!(
            render_claude_stream("{\"type\":\"user\",\"message\":{}}"),
            None
        );
        // Plain stderr (an API failure) is kept — it's why the run died.
        assert_eq!(
            render_claude_stream("API Error: overloaded").unwrap(),
            "API Error: overloaded"
        );
    }

    #[test]
    fn log_tail_reads_from_a_line_boundary() {
        let dir = std::env::temp_dir().join(format!("lpm-jobs-tail-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("t.log");
        std::fs::write(&path, "first line\nsecond line\nthird line\n").unwrap();
        assert_eq!(
            read_log_tail(&path, 1024),
            "first line\nsecond line\nthird line\n"
        );
        // A capped read drops the chopped first line instead of garbling it.
        assert_eq!(read_log_tail(&path, 17), "third line\n");
        assert_eq!(read_log_tail(&dir.join("missing.log"), 64), "");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn resume_cmdline_continues_the_session() {
        assert_eq!(
            claude_cmdline(Some("abc-123"), "", "", true, false, "yes, proceed"),
            "claude --resume 'abc-123' --dangerously-skip-permissions -p --verbose --output-format stream-json 'yes, proceed'"
        );
        assert_eq!(
            claude_cmdline(Some("abc-123"), "haiku", "low", false, false, "why?"),
            "claude --resume 'abc-123' --model 'haiku' --effort 'low' --allowedTools 'Bash(lpm ask:*)' -p --verbose --output-format stream-json 'why?'"
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
        assert_eq!(
            capture_cmdline(Some("claude"), "claude -p 'x'", log),
            "claude -p 'x'"
        );
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
    fn latest_message_is_the_newest_readable_output() {
        let mut st = JobState::default();
        st.history = vec![
            entry(1, COMPLETED, Some("first"), None, None, None),
            entry(2, COMPLETED, Some("  second  "), None, None, None),
            entry(3, NOTHING_TO_DO, Some("quiet reason"), None, None, None),
            entry(4, ERROR, Some("   "), None, None, None),
        ];
        assert_eq!(latest_message(&st), Some((2, "second".to_string())));

        let long = "é".repeat(PREVIEW_CHARS + 10);
        st.history.push(entry(5, COMPLETED, Some(&long), None, None, None));
        let (at, text) = latest_message(&st).expect("a message");
        assert_eq!(at, 5);
        assert_eq!(text.chars().count(), PREVIEW_CHARS);

        assert_eq!(latest_message(&JobState::default()), None);
    }

    #[test]
    fn threads_group_replies_with_their_run() {
        let history = vec![
            entry(1, COMPLETED, Some("run A"), Some("a1"), None, None),
            entry(2, NOTHING_TO_DO, None, None, None, None),
            entry(3, COMPLETED, Some("run B"), Some("b1"), None, None),
            entry(
                4,
                COMPLETED,
                Some("re A"),
                Some("a2"),
                Some("why?"),
                Some("a1"),
            ),
            // A sessionless exchange (another agent answered) still belongs to
            // thread A via its resume link.
            entry(
                5,
                COMPLETED,
                Some("codex says"),
                None,
                Some("ask codex"),
                Some("a2"),
            ),
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
            thread_entries(h, s)
                .iter()
                .any(|e| e.result == CONTEXT_FULL)
        };
        assert!(!is_full(&history, "a1"));
        let mut full = history.clone();
        full.push(entry(
            6,
            CONTEXT_FULL,
            None,
            None,
            Some("more?"),
            Some("a2"),
        ));
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
        assert_eq!(
            state_key_project("web/review/nightly", "review/nightly"),
            Some("web")
        );
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
            quiet: false,
            boot_at: None,
            proc_start: None,
            token: None,
            asks: Vec::new(),
            answer_to: None,
            terminal_flags: String::new(),
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
        push_entry(
            &mut st,
            entry(1, COMPLETED, Some("old"), Some("sid-old"), None, None),
        );
        push_history(&mut st, 2, NOTHING_TO_DO, None);
        push_entry(
            &mut st,
            entry(
                3,
                COMPLETED,
                Some("new"),
                Some("sid-new"),
                Some("go on"),
                Some("sid-old"),
            ),
        );
        let by_session = st
            .history
            .iter()
            .rev()
            .find(|h| h.session.as_deref() == Some("sid-old"))
            .unwrap();
        assert_eq!(by_session.output.as_deref(), Some("old"));
        let reply = st
            .history
            .iter()
            .rev()
            .find(|h| h.resumed.is_some())
            .unwrap();
        assert_eq!(reply.resumed.as_deref(), Some("sid-old"));
    }

    #[test]
    fn verify_is_refused_where_it_could_never_mean_anything() {
        let with_verify = |run: RunDef| {
            resolve_job(
                "blog",
                "nightly",
                &JobDef {
                    schedule: Some(ScheduleDef {
                        at: "09:00".into(),
                        ..Default::default()
                    }),
                    verify: "npm test".into(),
                    run: Some(run),
                    ..Default::default()
                },
            )
        };

        // lpm hands an action off and never learns how it ended.
        assert!(with_verify(RunDef {
            action: "deploy".into(),
            ..Default::default()
        })
        .is_err());

        // Both captured kinds can be checked, because lpm watches them exit.
        let prompt = with_verify(RunDef {
            prompt: "upgrade deps".into(),
            ..Default::default()
        })
        .unwrap();
        assert_eq!(prompt.verify, "npm test");
        assert!(with_verify(RunDef {
            cmd: "make".into(),
            ..Default::default()
        })
        .is_ok());
    }

    #[test]
    fn last_note_is_the_runs_own_words_cut_to_a_row() {
        let entry = |output: Option<&str>| HistoryEntry {
            output: output.map(String::from),
            ..HistoryEntry::default()
        };
        assert_eq!(last_note(&entry(None)), None);
        assert_eq!(last_note(&entry(Some("  \n "))), None);
        let failed = entry(Some(
            "  The check couldn't run: bin/test: command not found.\n",
        ));
        assert_eq!(
            last_note(&failed).as_deref(),
            Some("The check couldn't run: bin/test: command not found.")
        );
        let long = "x".repeat(LAST_NOTE_CHARS + 50);
        assert_eq!(
            last_note(&entry(Some(&long))).map(|n| n.chars().count()),
            Some(LAST_NOTE_CHARS)
        );
    }

    #[test]
    fn a_run_with_no_check_is_unverified_not_passed() {
        assert_eq!(verify_note(None), None);
        assert_eq!(verify_note(Some(true)).as_deref(), Some("checks passed"));
        assert_eq!(verify_note(Some(false)).as_deref(), Some("checks failed"));
    }

    #[test]
    fn notification_detail_carries_the_verdict_and_cost() {
        assert_eq!(
            notification_detail(Some("  \nUpgraded 3 packages.\nTests pass.\n"), Some(0.42)),
            Some("Upgraded 3 packages. · $0.42".to_string())
        );
        // A run with nothing to say and no recorded cost adds nothing to the
        // notification rather than padding it.
        assert_eq!(notification_detail(None, None), None);
        assert_eq!(notification_detail(Some("   "), None), None);
        // Agents other than Claude report no cost at all.
        assert_eq!(
            notification_detail(Some("Nothing needed changing."), None),
            Some("Nothing needed changing.".to_string())
        );
        let long = "x".repeat(300);
        let got = notification_detail(Some(&long), None).unwrap();
        assert_eq!(got.chars().count(), 121, "clipped, with an ellipsis");
        assert!(got.ends_with('…'));
    }

    #[test]
    fn a_capacity_skip_never_forfeits_the_job_s_turn() {
        // Deferred runs must stay collapsible or a job blocked all morning
        // appends an entry a minute and evicts the real run history.
        assert!(is_collapsible(SKIPPED_CAPACITY));
        // And they must not be mistaken for a run that actually happened.
        assert!(!is_captured_outcome(SKIPPED_CAPACITY));
    }

    #[test]
    fn due_fire_at_is_the_promised_time_not_the_actual_one() {
        // How overdue a job is — which decides who goes first when the cap is
        // reached — is measured against the fire point it was owed.
        let interval = Schedule::Interval {
            min_secs: 3600,
            max_secs: 3600,
            limits: None,
        };
        let last = 1_000_000u64;
        assert_eq!(
            due_fire_at(&interval, last, last + 9_000, 0),
            Some(last + 3600)
        );

        // A calendar job woken hours late still reports the occurrence it was
        // owed, so it outranks a job that only just came due.
        let spec = cal(9 * 60, Vec::new());
        let calendar = Schedule::Calendar(spec.clone());
        let now = now_secs();
        let seed = 120u64;
        assert_eq!(implicit_jitter(&spec, seed), 120);
        let occurrence = most_recent_fire_point(&spec, now as i64, seed).unwrap() as u64;
        assert_eq!(
            due_fire_at(&calendar, occurrence - 1, now, seed),
            Some(occurrence + 120)
        );

        // A manual job has no promised time — it is never picked up by a tick.
        assert_eq!(due_fire_at(&Schedule::Manual, last, last + 9_000, 0), None);
    }

    #[test]
    fn duplicate_options_come_from_the_job() {
        let parse = |yaml: &str| {
            let def: DuplicateDef = serde_norway::from_str(yaml).unwrap();
            resolve_duplicate(&def)
        };

        assert_eq!(parse("false").unwrap(), DuplicateSpec::default());

        // The bare shorthand keeps the documented defaults instead of picking
        // up whatever the duplicate dialog was last left on.
        assert_eq!(
            parse("true").unwrap(),
            DuplicateSpec {
                enabled: true,
                worktree: false,
                pull_latest: true,
                reinstall_deps: false,
                exclude_uncommitted: false,
            }
        );

        // Worktree mode is now reachable at all — it used to be gated on a
        // setting nothing ever wrote.
        let wt = parse("{ mode: worktree, reinstallDeps: true }").unwrap();
        assert!(wt.enabled && wt.worktree && wt.reinstall_deps);
        assert!(
            !wt.pull_latest && !wt.exclude_uncommitted,
            "a worktree shares the original's files, so these don't apply"
        );

        assert_eq!(
            parse("{ mode: copy, pullLatest: false, excludeUncommitted: true }").unwrap(),
            DuplicateSpec {
                enabled: true,
                worktree: false,
                pull_latest: false,
                reinstall_deps: false,
                exclude_uncommitted: true,
            }
        );

        assert!(parse("{ mode: sideways }").is_err());
    }

    #[test]
    fn one_unreadable_job_does_not_hide_the_others() {
        let path = std::env::temp_dir().join("lpm-jobs-partial-parse.yml");
        std::fs::write(
            &path,
            concat!(
                "jobs:\n",
                "  good:\n",
                "    label: Nightly\n",
                "    schedule: { at: \"09:00\" }\n",
                "    run: { prompt: hello }\n",
                "  broken:\n",
                "    label: Busted\n",
                "    enabled: sometimes\n",
            ),
        )
        .unwrap();
        let loaded = load_jobs_yaml(&path);
        let _ = std::fs::remove_file(&path);

        assert_eq!(loaded.len(), 2, "both jobs should still be listed");
        assert_eq!(
            loaded["good"].as_ref().map(|d| d.label.as_str()),
            Ok("Nightly"),
            "a readable job must survive an unreadable sibling"
        );
        assert!(
            loaded["broken"].is_err(),
            "the job with the bad field reports its own error"
        );
    }

    #[test]
    fn job_layers_merge_with_registry_winning() {
        let job = |label: &str| JobDef {
            label: label.into(),
            ..Default::default()
        };
        let registry = JobEntries::from([("a".to_string(), Ok(job("reg-a")))]);
        let repo = JobEntries::from([
            ("a".to_string(), Ok(job("repo-a"))),
            ("b".to_string(), Ok(job("repo-b"))),
        ]);
        let global = JobEntries::from([
            ("a".to_string(), Ok(job("glob-a"))),
            ("b".to_string(), Ok(job("glob-b"))),
            ("c".to_string(), Ok(job("glob-c"))),
        ]);
        let merged = merge_job_defs(registry, repo, global);
        let got: Vec<(&str, &str, &str)> = merged
            .iter()
            .map(|(k, (d, s))| (k.as_str(), d.as_ref().unwrap().label.as_str(), *s))
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
        assert_eq!(
            job_targets(&def_with_projects(Some(vec![]))),
            JobTargets::Standalone
        );
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
        assert!(!global_resolves_for(
            &def_with_projects(Some(vec![])),
            "web"
        ));
    }

    #[test]
    fn quiet_is_only_for_prompts() {
        let quiet = |run: RunDef| resolve_run("p", &RunDef { quiet: true, ..run });
        assert!(matches!(
            quiet(RunDef {
                prompt: "any new models?".into(),
                ..Default::default()
            }),
            Ok(RunTarget::Prompt { quiet: true, .. })
        ));
        assert!(quiet(RunDef {
            cmd: "make".into(),
            ..Default::default()
        })
        .unwrap_err()
        .contains("only for AI prompts"));
    }

    #[test]
    fn claude_account_is_only_for_prompts() {
        let account = |id: &str, run: RunDef| {
            resolve_run(
                "p",
                &RunDef {
                    claude_account: Some(id.into()),
                    ..run
                },
            )
        };
        let prompt = || RunDef {
            prompt: "any new models?".into(),
            ..Default::default()
        };
        let picked = |r: Result<RunTarget, String>| match r {
            Ok(RunTarget::Prompt { claude_account, .. }) => claude_account,
            other => panic!("expected a prompt, got {other:?}"),
        };
        assert_eq!(picked(account("work", prompt())), Some("work".into()));
        assert_eq!(picked(account("", prompt())), Some(String::new()));
        assert_eq!(picked(account("default", prompt())), Some(String::new()));
        assert_eq!(picked(resolve_run("p", &prompt())), None);
        assert!(account("a/b", prompt()).is_err());
        assert!(account(
            "work",
            RunDef {
                cmd: "make".into(),
                ..Default::default()
            }
        )
        .unwrap_err()
        .contains("only for AI prompts"));
    }

    #[test]
    fn memory_is_only_for_prompts_that_can_write_it() {
        let memory = |run: RunDef| resolve_run("p", &RunDef { memory: true, ..run });
        assert!(matches!(
            memory(RunDef {
                prompt: "any new models?".into(),
                ..Default::default()
            }),
            Ok(RunTarget::Prompt { memory: true, .. })
        ));
        assert!(matches!(
            memory(RunDef {
                prompt: "any new models?".into(),
                access: "read".into(),
                ..Default::default()
            }),
            Ok(RunTarget::Prompt { memory: false, .. })
        ));
        assert!(memory(RunDef {
            cmd: "make".into(),
            ..Default::default()
        })
        .unwrap_err()
        .contains("only for AI prompts"));
    }

    #[test]
    fn a_memory_run_hears_about_its_session_before_the_quiet_marker() {
        let prompt = run_prompt("Check", Some("Use the memory."), true);
        assert!(prompt.starts_with("Check\n\nUse the memory.\n\n"));
        assert!(prompt.ends_with(&format!("{ASK_INSTRUCTION}\n\n{QUIET_INSTRUCTION}")));
    }

    #[test]
    fn a_quiet_run_asks_for_the_marker_and_goes_quiet_only_on_it() {
        assert_eq!(
            run_prompt("Check", None, false),
            format!("Check\n\n{ASK_INSTRUCTION}")
        );
        assert!(run_prompt("Check", None, true).ends_with(QUIET_INSTRUCTION));
        assert!(QUIET_INSTRUCTION.contains(NOTHING_TO_REPORT));

        let nothing = |output: &str| found_nothing(true, COMPLETED, Some(output));
        assert!(nothing("NOTHING_TO_REPORT"));
        assert!(nothing("  `NOTHING_TO_REPORT`.\n"));
        assert!(nothing("**NOTHING_TO_REPORT**"));
        assert!(!nothing("Nothing new today."));
        assert!(!nothing("NOTHING_TO_REPORT\nBut one thing: Opus 5.5 is out."));
        assert!(!nothing("Found two models. NOTHING_TO_REPORT otherwise."));
        assert!(!found_nothing(true, COMPLETED, None));
        assert!(!found_nothing(true, ERROR, Some("NOTHING_TO_REPORT")));
        assert!(!found_nothing(false, COMPLETED, Some("NOTHING_TO_REPORT")));
    }

    #[test]
    fn send_to_defaults_to_lpm_and_takes_only_known_places() {
        let send_to = |v: Option<SendToValue>| resolve_send_to(v.as_ref());
        assert_eq!(send_to(None).unwrap(), vec!["lpm"]);
        assert_eq!(send_to(Some(SendToValue::One("Telegram".into()))).unwrap(), vec!["telegram"]);
        assert_eq!(
            send_to(Some(SendToValue::Many(vec!["lpm".into(), "telegram".into(), "lpm".into()])))
                .unwrap(),
            vec!["lpm", "telegram"]
        );
        assert_eq!(
            send_to(Some(SendToValue::Many(vec!["Telegram:Releases".into(), "telegram:ops".into()])))
                .unwrap(),
            vec!["telegram:releases", "telegram:ops"]
        );
        assert!(send_to(Some(SendToValue::One("telegram:".into()))).is_err());
        assert!(send_to(Some(SendToValue::Many(vec![]))).unwrap_err().contains("at least one"));
        assert!(send_to(Some(SendToValue::One("fax".into()))).unwrap_err().contains("\"fax\""));
    }

    #[test]
    fn a_report_carries_what_the_run_said_and_how_its_check_went() {
        assert_eq!(report_text(Some("  Two new models.\n"), None).as_deref(), Some("Two new models."));
        assert_eq!(
            report_text(Some("Upgraded."), Some(false)).as_deref(),
            Some("Upgraded.\n\nChecks failed.")
        );
        assert_eq!(report_text(None, Some(true)).as_deref(), Some("Checks passed."));
        assert_eq!(report_text(Some(" "), None), None);
    }
}
