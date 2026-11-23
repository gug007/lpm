// What starts an automation instead of the clock, as its config says it:
// `schedule: { on: …, branches/services/from, atMost }`. What lpm does when
// one happens is in event_runs.rs.
use super::{RunTarget, Schedule, ScheduleDef};
use crate::jobcal::DaysValue;
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub(crate) enum EventKind {
    CiFailed,
    ServiceCrashed,
    AgentFinished,
}

const KINDS: [(EventKind, &str); 3] = [
    (EventKind::CiFailed, "ciFailed"),
    (EventKind::ServiceCrashed, "serviceCrashed"),
    (EventKind::AgentFinished, "agentFinished"),
];

impl EventKind {
    pub(super) fn name(self) -> &'static str {
        KINDS.iter().find(|(k, _)| *k == self).map(|(_, n)| *n).unwrap_or("")
    }

    fn parse(name: &str) -> Option<Self> {
        KINDS.iter().find(|(_, n)| *n == name).map(|(k, _)| *k)
    }
}

/// How often one job reacts: once for each commit the events are about, or
/// once a day whatever they are about.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) enum AtMost {
    Commit,
    Day,
}

#[derive(Clone, Debug, PartialEq)]
pub(super) struct EventSpec {
    pub(super) kind: EventKind,
    pub(super) branches: Vec<String>,
    pub(super) services: Vec<String>,
    /// The projects whose agents count; empty is the job's own project.
    pub(super) from: Vec<String>,
    pub(super) at_most: AtMost,
}

/// `branches: main` or `branches: [main, release]`.
#[derive(Deserialize, Clone)]
#[serde(untagged)]
pub(super) enum NameList {
    One(String),
    Many(Vec<String>),
}

fn names(value: Option<&NameList>) -> Vec<String> {
    let raw: Vec<&str> = match value {
        None => Vec::new(),
        Some(NameList::One(name)) => vec![name.as_str()],
        Some(NameList::Many(list)) => list.iter().map(String::as_str).collect(),
    };
    let mut out: Vec<String> = Vec::new();
    for name in raw.into_iter().map(str::trim).filter(|n| !n.is_empty()) {
        if !out.iter().any(|n| n == name) {
            out.push(name.to_string());
        }
    }
    out
}

pub(super) fn resolve(sched: &ScheduleDef) -> Result<EventSpec, String> {
    let on = sched.on.trim();
    let kind = EventKind::parse(on).ok_or_else(|| {
        format!("{on:?} isn't an event lpm knows: use ciFailed, serviceCrashed or agentFinished.")
    })?;
    let no_days = matches!(&sched.days, DaysValue::List(v) if v.is_empty());
    let timed = sched.manual
        || sched.every.is_some()
        || !sched.at.is_empty()
        || !no_days
        || !sched.until.trim().is_empty()
        || sched.times.is_some()
        || sched.pick_days.is_some()
        || !sched.cron.trim().is_empty();
    if timed {
        return Err("An event says when the job runs on its own — drop at, every, days, cron and manual.".into());
    }
    let spec = EventSpec {
        kind,
        branches: names(sched.branches.as_ref()),
        services: names(sched.services.as_ref()),
        from: names(sched.from.as_ref()),
        at_most: match sched.at_most.trim() {
            "" | "commit" => AtMost::Commit,
            "day" => AtMost::Day,
            other => return Err(format!("atMost is commit or day, not {other:?}.")),
        },
    };
    if !spec.branches.is_empty() && kind != EventKind::CiFailed {
        return Err("Branches go with ciFailed.".into());
    }
    if !spec.services.is_empty() && kind != EventKind::ServiceCrashed {
        return Err("Services go with serviceCrashed.".into());
    }
    if !spec.from.is_empty() && kind != EventKind::AgentFinished {
        return Err("from goes with agentFinished.".into());
    }
    Ok(spec)
}

/// An action's agent reports its own finish, which would start the job again.
/// A prompt runs headless and a command has no agent, so neither can.
pub(super) fn check_run(schedule: &Schedule, run: &RunTarget) -> Result<(), String> {
    match (schedule, run) {
        (Schedule::Event(spec), RunTarget::Action { .. }) if spec.kind == EventKind::AgentFinished => {
            Err("An automation an agent's finish starts runs a prompt or a command, not an action: the action's own agent would start it again.".into())
        }
        _ => Ok(()),
    }
}

pub(super) fn schedule_json(spec: &EventSpec) -> Value {
    let mut v = json!({
        "mode": "event",
        "on": spec.kind.name(),
        "atMost": match spec.at_most {
            AtMost::Commit => "commit",
            AtMost::Day => "day",
        },
    });
    for (key, list) in [
        ("branches", &spec.branches),
        ("services", &spec.services),
        ("from", &spec.from),
    ] {
        if !list.is_empty() {
            v[key] = json!(list);
        }
    }
    v
}

pub(super) fn kind_of(schedule: &Schedule) -> Option<EventKind> {
    match schedule {
        Schedule::Event(spec) => Some(spec.kind),
        _ => None,
    }
}

#[cfg(test)]
#[path = "events_tests.rs"]
mod tests;
