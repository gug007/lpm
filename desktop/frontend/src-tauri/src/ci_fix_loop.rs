// Keep fixing until green, for the checks menu on the desktop and the CI sheet
// on the phones. The tab a Fix with … opens is followed: once its agent pushes,
// the new run is watched, and a failure goes back to the same agent with the
// checks that broke, until the checks pass, three rounds are used, or the agent
// needs the person. One loop per project, in memory for as long as lpm runs; it
// ends with a single alert.
use crate::ci_checks::{commit_checks, short_sha, upstream_head};
use crate::ci_fix_loop_rules::{
    alert_text, describe, fix_verdict, hand_over, read_agent, read_checks, round_prompt, Agent,
    Checks, Handover,
};
pub use crate::ci_fix_loop_rules::{first_prompt, FixLoop, Phase, MAX_ROUNDS};
use crate::notifychannels::NotificationEvent;
use crate::pull_request::branch_pull_request_with_merge;
use crate::status::{is_live, now_millis, StatusStore};
use crate::statusnotify::{notify, should_notify};
use serde_json::json;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

pub const EVENT: &str = "ci-fix-loop";

const POLL_EVERY: Duration = Duration::from_secs(15);
/// The fix tab has this long to show up after the loop is armed.
const OPEN_WITHIN: Duration = Duration::from_secs(2 * 60);
const NO_CHECKS: Duration = Duration::from_secs(10 * 60);
const RUN_WITHIN: Duration = Duration::from_secs(3 * 60 * 60);
const MAX_MISSES: u32 = 15;
/// How long an ended loop still shows, and keeps the push watcher's own CI
/// alerts for its branch quiet: the loop's alert already said how it went.
const SHOWN_FOR: Duration = Duration::from_secs(10 * 60);

#[derive(Clone)]
struct Run {
    id: u64,
    view: FixLoop,
    path: String,
    terminal: Option<String>,
    /// The project's terminals when it was armed: the fix tab is a new one.
    known: Vec<String>,
    /// The pushed commit whose failure the agent is fixing.
    failed: String,
    /// The commit pushed since, whose checks are followed.
    watched: String,
    phase_since: Instant,
    phase_started: i64,
    misses: u32,
}

#[derive(Default)]
struct Loops {
    runs: HashMap<String, Run>,
    ended: HashMap<String, (FixLoop, Instant)>,
}

fn loops() -> &'static Mutex<Loops> {
    static LOOPS: OnceLock<Mutex<Loops>> = OnceLock::new();
    LOOPS.get_or_init(Default::default)
}

/// Signalled whenever a run is replaced or removed, so a follower asleep on
/// one wakes at once instead of finishing its wait.
static RUNS_CHANGED: Condvar = Condvar::new();

/// The loop running for `project`, else the one that ended there lately.
pub fn current(project: &str) -> Option<FixLoop> {
    let loops = loops().lock().unwrap();
    loops.runs.get(project).map(|r| r.view.clone()).or_else(|| {
        loops
            .ended
            .get(project)
            .filter(|(_, at)| at.elapsed() < SHOWN_FOR)
            .map(|(view, _)| view.clone())
    })
}

/// Whether the push watcher should leave `branch` of `project` to the loop.
pub(crate) fn quiets(project: &str, branch: &str) -> bool {
    current(project).is_some_and(|view| view.branch == branch)
}

/// Arms the loop for `project`, replacing any running there; the fix tab is
/// the next one the project opens.
pub fn start(app: &AppHandle, project: &str, agent: &str) -> Result<FixLoop, String> {
    let (path, remote) = crate::config::project_root(project)?;
    if remote {
        return Err("Keep fixing until green works for projects on this computer only.".into());
    }
    let (sha, branch) = upstream_head(&path).ok_or("This branch isn't pushed to GitHub.")?;
    let agent = if agent.trim().is_empty() {
        "The agent"
    } else {
        agent.trim()
    };
    static NEXT_ID: AtomicU64 = AtomicU64::new(1);
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let mut view = FixLoop {
        project: project.to_string(),
        agent: agent.to_string(),
        branch,
        round: 1,
        max_rounds: MAX_ROUNDS,
        state: Phase::Starting,
        sha: short_sha(&sha).to_string(),
        detail: String::new(),
        reason: None,
        progress: 0.0,
    };
    describe(&mut view);
    let run = Run {
        id,
        view: view.clone(),
        path,
        terminal: None,
        known: terminal_ids(app, project),
        failed: sha.clone(),
        watched: sha,
        phase_since: Instant::now(),
        phase_started: now_millis(),
        misses: 0,
    };
    {
        let mut loops = loops().lock().unwrap();
        loops.ended.remove(project);
        loops.runs.insert(project.to_string(), run);
        RUNS_CHANGED.notify_all();
    }
    announce(app, &view);
    let (app, project) = (app.clone(), project.to_string());
    std::thread::spawn(move || follow(app, project, id));
    Ok(view)
}

pub fn cancel(app: &AppHandle, project: &str) -> Option<FixLoop> {
    let run = loops().lock().unwrap().runs.remove(project)?;
    RUNS_CHANGED.notify_all();
    Some(end(app, run, Phase::Cancelled, None))
}

fn terminal_ids(app: &AppHandle, project: &str) -> Vec<String> {
    let state = app.state::<crate::pty::PtyState>();
    crate::pty::remote_terminals(&state, project)
        .into_iter()
        .map(|t| t.id)
        .collect()
}

fn follow(app: AppHandle, project: String, id: u64) {
    loop {
        sleep_while_current(&project, id, POLL_EVERY);
        let Some(run) = running(&project, id) else {
            return;
        };
        let step = match run.view.state {
            Phase::Starting => bind(&app, &run),
            Phase::Fixing => fixing(&app, &run),
            Phase::Watching => watching(&app, &run),
            Phase::Passed | Phase::Stopped | Phase::Cancelled => return,
        };
        let mut loops = loops().lock().unwrap();
        if loops.runs.get(&project).is_none_or(|r| r.id != id) {
            return;
        }
        match step {
            Step::Stay(misses) => {
                if let Some(r) = loops.runs.get_mut(&project) {
                    r.misses = misses;
                }
            }
            Step::Next(mut next) => {
                describe(&mut next.view);
                let view = next.view.clone();
                loops.runs.insert(project.clone(), *next);
                drop(loops);
                announce(&app, &view);
            }
            Step::End(state, reason) => {
                let Some(run) = loops.runs.remove(&project) else {
                    return;
                };
                drop(loops);
                end(&app, run, state, reason);
                return;
            }
        }
    }
}

fn running(project: &str, id: u64) -> Option<Run> {
    let loops = loops().lock().unwrap();
    loops.runs.get(project).filter(|r| r.id == id).cloned()
}

fn sleep_while_current(project: &str, id: u64, total: Duration) {
    let deadline = Instant::now() + total;
    let mut loops = loops().lock().unwrap();
    while loops.runs.get(project).is_some_and(|r| r.id == id) {
        let left = deadline.saturating_duration_since(Instant::now());
        if left.is_zero() {
            return;
        }
        loops = RUNS_CHANGED.wait_timeout(loops, left).unwrap().0;
    }
}

enum Step {
    Stay(u32),
    Next(Box<Run>),
    End(Phase, Option<String>),
}

fn stop(reason: String) -> Step {
    Step::End(Phase::Stopped, Some(reason))
}

fn phase(run: &Run, state: Phase) -> Run {
    let mut next = run.clone();
    next.view.state = state;
    next.phase_since = Instant::now();
    next.phase_started = now_millis();
    next.misses = 0;
    next
}

/// Waits for the tab Fix with … opens: a new terminal in the project, else
/// one whose agent picked up work after the loop was armed (a reused tab).
fn bind(app: &AppHandle, run: &Run) -> Step {
    let ids = terminal_ids(app, &run.view.project);
    let entries = app.state::<Arc<StatusStore>>().list(&run.view.project);
    let found = ids
        .iter()
        .find(|id| !run.known.contains(id))
        .cloned()
        .or_else(|| {
            entries
                .iter()
                .find(|e| {
                    e.timestamp >= run.phase_started
                        && is_live(&e.value)
                        && ids.contains(&e.pane_id)
                })
                .map(|e| e.pane_id.clone())
        });
    match found {
        Some(terminal) => {
            let mut next = phase(run, Phase::Fixing);
            next.terminal = Some(terminal);
            Step::Next(Box::new(next))
        }
        None if run.phase_since.elapsed() >= OPEN_WITHIN => {
            stop(format!("The {} tab didn't open.", run.view.agent))
        }
        None => Step::Stay(0),
    }
}

/// The agent in the fix tab, and whether that tab's shell is back at its prompt.
fn agent_now(app: &AppHandle, run: &Run) -> (Agent, Option<bool>) {
    let Some(terminal) = run.terminal.as_deref() else {
        return (Agent::Quiet, None);
    };
    let Some(session) = crate::pty::session(&app.state::<crate::pty::PtyState>(), terminal) else {
        return (Agent::Gone, None);
    };
    let entries = app.state::<Arc<StatusStore>>().list(&run.view.project);
    let at_prompt = session.shell_at_prompt_now();
    let agent = read_agent(&entries, terminal, run.phase_started, at_prompt);
    (agent, at_prompt)
}

/// A push since `sha`: its checks are the ones to watch now.
fn new_push(run: &Run, sha: &str) -> Option<Step> {
    let (pushed, _) = upstream_head(&run.path).filter(|(pushed, _)| pushed != sha)?;
    let mut next = phase(run, Phase::Watching);
    next.view.sha = short_sha(&pushed).to_string();
    next.watched = pushed;
    Some(Step::Next(Box::new(next)))
}

/// The agent is fixing: wait for its push, unless it can't get there.
fn fixing(app: &AppHandle, run: &Run) -> Step {
    if let Some(step) = new_push(run, &run.failed) {
        return step;
    }
    let verdict = fix_verdict(
        agent_now(app, run).0,
        &run.view.agent,
        run.phase_since.elapsed(),
        now_millis(),
    );
    verdict.map_or(Step::Stay(0), stop)
}

/// The new push's checks: wait for them, then pass, stop, or hand the next
/// failure to the agent.
fn watching(app: &AppHandle, run: &Run) -> Step {
    if let Some(step) = new_push(run, &run.watched) {
        return step;
    }
    let age = run.phase_since.elapsed();
    let info = match commit_checks(&run.path, &run.watched, &run.view.branch) {
        Ok(info) => info,
        Err(_) if run.misses + 1 >= MAX_MISSES => {
            return stop("lpm couldn't read the checks from GitHub.".into())
        }
        Err(_) => return Step::Stay(run.misses + 1),
    };
    let checks = info
        .as_ref()
        .map(|i| i.checks.as_slice())
        .unwrap_or_default();
    match read_checks(checks) {
        Checks::Nothing if age >= NO_CHECKS => stop(format!("Nothing ran on {}.", run.view.sha)),
        Checks::Running if age >= RUN_WITHIN => {
            stop("The checks were still running after 3 hours.".into())
        }
        Checks::Nothing | Checks::Running => Step::Stay(0),
        Checks::Passed => Step::End(Phase::Passed, None),
        Checks::Stale(name) => stop(format!("{name} didn't run again on {}.", run.view.sha)),
        Checks::Failed if run.view.round >= MAX_ROUNDS => {
            stop(format!("CI still fails after {MAX_ROUNDS} rounds."))
        }
        Checks::Failed => next_round(app, run, info.and_then(|i| i.fix_prompt)),
    }
}

fn next_round(app: &AppHandle, run: &Run, commit_prompt: Option<String>) -> Step {
    let agent = &run.view.agent;
    let (now, at_prompt) = agent_now(app, run);
    match hand_over(&now, at_prompt, agent) {
        Handover::Stop(reason) => return stop(reason),
        Handover::Wait => return Step::Stay(0),
        Handover::Send => {}
    }
    let pr = branch_pull_request_with_merge(&run.path).filter(|pr| pr.state == "OPEN");
    let Some(prompt) = pr.and_then(|pr| pr.fix_prompt).or(commit_prompt) else {
        return Step::Stay(0);
    };
    let round = run.view.round + 1;
    let terminal = run.terminal.as_deref().unwrap_or_default();
    if let Err(e) = crate::remote::answer::type_prompt(app, terminal, &round_prompt(&prompt, round))
    {
        return stop(format!("The next failure couldn't be sent: {e}"));
    }
    let mut next = phase(run, Phase::Fixing);
    next.view.round = round;
    next.failed = run.watched.clone();
    Step::Next(Box::new(next))
}

fn end(app: &AppHandle, run: Run, state: Phase, reason: Option<String>) -> FixLoop {
    let mut view = FixLoop {
        state,
        reason,
        ..run.view
    };
    describe(&mut view);
    loops()
        .lock()
        .unwrap()
        .ended
        .insert(view.project.clone(), (view.clone(), Instant::now()));
    announce(app, &view);
    if state != Phase::Cancelled {
        let (title, body) = alert_text(&view);
        if should_notify(app, NotificationEvent::Ci) {
            notify(app, &title, &body);
        }
        crate::remote::push_fix_loop_result(app, &view.project, &view.branch, &title, &body);
    }
    view
}

fn announce(app: &AppHandle, view: &FixLoop) {
    let _ = app.emit(EVENT, view);
    crate::remote::broadcast_frame(
        app,
        json!({ "t": "ciFixLoop", "project": view.project, "ok": true, "loop": view }),
    );
}

#[tauri::command(async)]
pub fn start_ci_fix_loop(
    app: AppHandle,
    project_name: String,
    agent: String,
    prompt: String,
) -> Result<String, String> {
    start(&app, &project_name, &agent)?;
    Ok(first_prompt(&prompt))
}

#[tauri::command]
pub fn cancel_ci_fix_loop(app: AppHandle, project_name: String) {
    cancel(&app, &project_name);
}

#[tauri::command]
pub fn ci_fix_loop_state(project_name: String) -> Option<FixLoop> {
    current(&project_name)
}
