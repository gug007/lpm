// The rules Keep fixing until green follows (ci_fix_loop.rs): what a loop
// looks like to the apps, what the agent is told each round, and how the agent
// and a push's checks are read. Pure, so they're tested without GitHub or a tab.
use crate::ci_watch::{outcome, Outcome};
use crate::pull_request::PrCheck;
use crate::status::{is_live, StatusEntry, STATUS_DONE, STATUS_WAITING};
use serde::Serialize;
use std::time::Duration;

pub const MAX_ROUNDS: u32 = 3;

/// An agent whose turn ended this long ago without a push isn't going to push.
const DONE_GRACE: Duration = Duration::from_secs(3 * 60);
/// A shell back at its prompt this soon after the tab opened is the agent still
/// starting, not one that quit.
const START_GRACE: Duration = Duration::from_secs(90);
const FIX_WITHIN: Duration = Duration::from_secs(90 * 60);

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    Starting,
    Fixing,
    Watching,
    Passed,
    Stopped,
    Cancelled,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FixLoop {
    pub project: String,
    /// The agent fixing, as the Fix with … row named it.
    pub agent: String,
    pub branch: String,
    pub round: u32,
    pub max_rounds: u32,
    pub state: Phase,
    /// The pushed commit being fixed or watched.
    pub sha: String,
    /// Where it stands, in one line.
    pub detail: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// How far along the rounds it is, 0 to 1.
    pub progress: f64,
}

impl FixLoop {
    pub fn running(&self) -> bool {
        matches!(self.state, Phase::Starting | Phase::Fixing | Phase::Watching)
    }
}

/// What the agent is first told: the failing checks, and to push the fix.
pub fn first_prompt(fix_prompt: &str) -> String {
    round_prompt(fix_prompt, 1)
}

pub(crate) fn round_prompt(fix_prompt: &str, round: u32) -> String {
    format!(
        "{}\n\nWhen it's fixed, commit and push. lpm is watching CI on this branch and will send you any check that still fails (round {round} of {MAX_ROUNDS}).",
        fix_prompt.trim_end()
    )
}

/// What the agent in the fix tab is up to.
#[derive(Debug, PartialEq)]
pub(crate) enum Agent {
    Gone,
    Exited,
    Waiting,
    Working,
    /// Finished a turn, at this time (unix millis).
    Done(i64),
    /// Hasn't said anything yet.
    Quiet,
}

/// The agent's state from its status reports since `since`, and whether its
/// shell is back at a prompt.
pub(crate) fn read_agent(
    entries: &[StatusEntry],
    terminal: &str,
    since: i64,
    shell_at_prompt: Option<bool>,
) -> Agent {
    let on_pane: Vec<&StatusEntry> = entries
        .iter()
        .filter(|e| e.pane_id == terminal && crate::agentkind::AgentKind::of_key(&e.key).is_some())
        .collect();
    if on_pane.iter().any(|e| e.value == STATUS_WAITING) {
        return Agent::Waiting;
    }
    if on_pane.iter().any(|e| is_live(&e.value)) {
        return Agent::Working;
    }
    if shell_at_prompt == Some(true) {
        return Agent::Exited;
    }
    on_pane
        .iter()
        .filter(|e| e.value == STATUS_DONE && e.timestamp >= since)
        .map(|e| e.timestamp)
        .max()
        .map_or(Agent::Quiet, Agent::Done)
}

/// Why `name`, the agent, can't take the loop any further: its tab closed, or
/// it's asking the person something.
fn cant_go_on(agent: &Agent, name: &str) -> Option<String> {
    match agent {
        Agent::Gone => Some(format!("The {name} tab was closed.")),
        Agent::Waiting => Some(format!("{name} is asking you something.")),
        _ => None,
    }
}

/// What becomes of the next failure.
#[derive(Debug, PartialEq)]
pub(crate) enum Handover {
    Send,
    Wait,
    Stop(String),
}

/// A failure goes only to an agent still in its tab: once it quit, the tab is a
/// shell that would run the text as commands. Its status can't show that, since a
/// finish nobody has seen outlives the agent.
pub(crate) fn hand_over(agent: &Agent, shell_at_prompt: Option<bool>, name: &str) -> Handover {
    if let Some(reason) = cant_go_on(agent, name) {
        return Handover::Stop(reason);
    }
    match agent {
        Agent::Working => Handover::Wait,
        Agent::Exited => {
            Handover::Stop(format!("{name} quit, so the next failure can't go to it."))
        }
        _ if shell_at_prompt.is_none() => Handover::Stop(format!(
            "lpm can't tell whether {name} is still in its tab, so the next failure wasn't sent."
        )),
        _ => Handover::Send,
    }
}

/// Why the loop ends while the agent hasn't pushed; None to keep waiting.
pub(crate) fn fix_verdict(agent: Agent, name: &str, waited: Duration, now: i64) -> Option<String> {
    let done_grace = DONE_GRACE.as_millis() as i64;
    if let Some(reason) = cant_go_on(&agent, name) {
        return Some(reason);
    }
    match agent {
        Agent::Exited if waited >= START_GRACE => Some(format!("{name} quit before pushing a fix.")),
        Agent::Done(at) if now - at >= done_grace => {
            Some(format!("{name} finished without pushing a fix."))
        }
        _ if waited >= FIX_WITHIN => Some("No fix was pushed within 90 minutes.".into()),
        _ => None,
    }
}

/// How a push's own checks stand, the way the push watcher reads them.
#[derive(Debug, PartialEq)]
pub(crate) enum Checks {
    Nothing,
    Running,
    Passed,
    Failed,
    /// Its own checks passed, but an older failure didn't run again.
    Stale(String),
}

pub(crate) fn read_checks(checks: &[PrCheck]) -> Checks {
    match outcome(checks) {
        Outcome::Nothing => Checks::Nothing,
        Outcome::Running => Checks::Running,
        Outcome::Failed => Checks::Failed,
        Outcome::Passed => match checks.iter().find(|c| c.state == "fail") {
            Some(old) => Checks::Stale(old.name.clone()),
            None => Checks::Passed,
        },
    }
}

pub(crate) fn describe(view: &mut FixLoop) {
    let (agent, round, max) = (view.agent.as_str(), view.round, view.max_rounds.max(1));
    let (detail, step) = match view.state {
        Phase::Starting => (format!("Opening the {agent} tab…"), 0.0),
        Phase::Fixing => (format!("{agent} is fixing {}", view.sha), 1.0),
        Phase::Watching => (
            format!("{agent} pushed {} · watching the new run", view.sha),
            2.0,
        ),
        Phase::Passed => (
            match round {
                1 => "CI passed after one round".into(),
                n => format!("CI passed after {n} rounds"),
            },
            3.0,
        ),
        Phase::Cancelled => ("Stopped".into(), 3.0),
        Phase::Stopped => (view.reason.clone().unwrap_or_else(|| "Stopped".into()), 3.0),
    };
    view.detail = detail;
    view.progress = if view.running() {
        ((round - 1) as f64 + step / 3.0) / max as f64
    } else {
        1.0
    };
}

pub(crate) fn alert_text(view: &FixLoop) -> (String, String) {
    let title = format!(
        "{} · {}",
        crate::config::project_display_name(&view.project),
        view.branch
    );
    let body = if view.state == Phase::Passed {
        format!("{} · fixed by {}", view.detail, view.agent)
    } else {
        format!("Stopped fixing CI: {}", view.detail)
    };
    (title, body)
}

#[cfg(test)]
#[path = "ci_fix_loop_tests.rs"]
mod tests;
