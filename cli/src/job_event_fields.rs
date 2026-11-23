use clap::Args;
use serde_norway::{Mapping, Value};

// An automation started by something that happens instead of by the clock.
// Like the other schedule flags, `--on` replaces the whole schedule.

const SCHEDULE: &str = "Schedule (any of these replaces the whole schedule)";

#[derive(Args, Default)]
pub struct JobEventFields {
    #[arg(
        long,
        value_name = "EVENT",
        value_parser = ["ciFailed", "serviceCrashed", "agentFinished"],
        help_heading = SCHEDULE,
        conflicts_with_all = ["manual", "every", "at", "until", "times", "days", "pick_days", "short_months", "cron"],
        help = "Run when this happens instead of on a clock: CI fails on a push from this computer, a service exits with an error, or an agent finishes its turn"
    )]
    pub on: Option<String>,
    #[arg(
        long,
        value_name = "BRANCHES",
        value_delimiter = ',',
        requires = "on",
        help_heading = SCHEDULE,
        help = "With --on ciFailed: only failures on these branches"
    )]
    pub branches: Vec<String>,
    #[arg(
        long,
        value_name = "SERVICES",
        value_delimiter = ',',
        requires = "on",
        help_heading = SCHEDULE,
        help = "With --on serviceCrashed: only these services"
    )]
    pub services: Vec<String>,
    #[arg(
        long,
        value_name = "PROJECTS",
        value_delimiter = ',',
        requires = "on",
        help_heading = SCHEDULE,
        help = "With --on agentFinished: agents in these projects; default: the automation's own"
    )]
    pub from: Vec<String>,
    #[arg(
        long,
        value_name = "commit|day",
        value_parser = ["commit", "day"],
        requires = "on",
        help_heading = SCHEDULE,
        help = "With --on: run once for each commit the event is about (default) or once a day"
    )]
    pub at_most: Option<String>,
}

impl JobEventFields {
    pub fn given(&self) -> bool {
        self.on.is_some()
    }

    pub fn schedule(&self) -> Option<Mapping> {
        let on = self.on.as_deref()?;
        let mut schedule = Mapping::new();
        schedule.insert("on".into(), Value::String(on.to_string()));
        for (key, list) in [
            ("branches", &self.branches),
            ("services", &self.services),
            ("from", &self.from),
        ] {
            let names: Vec<Value> = list
                .iter()
                .map(|name| name.trim())
                .filter(|name| !name.is_empty())
                .map(|name| Value::String(name.to_string()))
                .collect();
            if !names.is_empty() {
                schedule.insert(key.into(), Value::Sequence(names));
            }
        }
        if let Some(at_most) = self.at_most.as_deref().filter(|v| *v != "commit") {
            schedule.insert("atMost".into(), Value::String(at_most.to_string()));
        }
        Some(schedule)
    }
}
