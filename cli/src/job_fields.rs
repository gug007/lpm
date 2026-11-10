use clap::Args;
use serde_norway::{Mapping, Value};

// Every field of an automation as a flag. `add` builds an entry from them and
// `edit` changes only the fields given, an empty value clearing one. Schedule
// shapes exclude each other, so any schedule flag replaces the whole schedule.

const SCHEDULE: &str = "Schedule (any of these replaces the whole schedule)";
const RUN: &str = "What it runs";
const STEPS: &str = "Check, copy, verify, delivery";

#[derive(Args, Default)]
pub struct JobFields {
    #[arg(long, help = "Name shown in the app; defaults to the id")]
    pub label: Option<String>,
    #[arg(long)]
    pub emoji: Option<String>,

    #[arg(
        long,
        help_heading = SCHEDULE,
        conflicts_with_all = ["every", "at", "until", "times", "days", "pick_days", "short_months", "cron"],
        help = "Run only when started by hand"
    )]
    pub manual: bool,
    #[arg(
        long,
        value_name = "LENGTH",
        help_heading = SCHEDULE,
        help = "Gap between runs: 30m, 6h, 2d, or a random band like 4h-8h (5m minimum)"
    )]
    pub every: Option<String>,
    #[arg(
        long,
        value_name = "HH:MM",
        value_delimiter = ',',
        help_heading = SCHEDULE,
        help = "Time of day; comma-separate several times"
    )]
    pub at: Vec<String>,
    #[arg(
        long,
        value_name = "HH:MM",
        help_heading = SCHEDULE,
        help = "End of a window from --at: a run lands in it at random (with --every: the hours it runs in)"
    )]
    pub until: Option<String>,
    #[arg(long, value_name = "N", help_heading = SCHEDULE, help = "Runs a day, spread across the window")]
    pub times: Option<u32>,
    #[arg(
        long,
        value_name = "DAYS",
        help_heading = SCHEDULE,
        help = "Weekdays (mon,thu), dates of the month (1,15,last), dates (2026-10-20), or a position (\"first mon\", \"last weekday\")"
    )]
    pub days: Option<String>,
    #[arg(long, value_name = "N", help_heading = SCHEDULE, help = "Use only N of --days each week, picked at random")]
    pub pick_days: Option<u32>,
    #[arg(
        long,
        value_name = "skip|last",
        value_parser = ["skip", "last"],
        help_heading = SCHEDULE,
        help = "A date a month lacks (the 31st): skip that month or run on its last day"
    )]
    pub short_months: Option<String>,
    #[arg(
        long,
        value_name = "LINE",
        help_heading = SCHEDULE,
        conflicts_with_all = ["every", "at", "until", "times", "days", "pick_days", "short_months"],
        help = "Five-field cron line in local time, or @hourly, @daily, @weekly, @monthly"
    )]
    pub cron: Option<String>,

    #[arg(
        long,
        value_name = "COMMAND",
        help_heading = RUN,
        conflicts_with_all = ["action", "prompt", "agent", "model", "effort", "access", "quiet", "memory", "claude_account"],
        help = "Shell command, run in the project"
    )]
    pub cmd: Option<String>,
    #[arg(long, value_name = "NAME", help_heading = RUN, help = "Project action; a --prompt goes to the agent terminal it opens")]
    pub action: Option<String>,
    #[arg(long, value_name = "TEXT", help_heading = RUN, help = "Task for a headless AI agent")]
    pub prompt: Option<String>,
    #[arg(long, value_name = "NAME", help_heading = RUN, help = "claude, codex, gemini or opencode; default: the app's")]
    pub agent: Option<String>,
    #[arg(long, help_heading = RUN)]
    pub model: Option<String>,
    #[arg(long, help_heading = RUN)]
    pub effort: Option<String>,
    #[arg(
        long,
        value_name = "full|read",
        help_heading = RUN,
        help = "full (default) lets the agent edit files and run commands; read only reports"
    )]
    pub access: Option<String>,
    #[arg(
        long,
        value_name = "BOOL",
        num_args = 0..=1,
        default_missing_value = "true",
        help_heading = RUN,
        help = "Leave no trace when the agent finds nothing to report"
    )]
    pub quiet: Option<bool>,
    #[arg(
        long,
        value_name = "BOOL",
        num_args = 0..=1,
        default_missing_value = "true",
        help_heading = RUN,
        help = "Each run reads what earlier runs did and found, then adds its own (needs full access)"
    )]
    pub memory: Option<bool>,
    #[arg(
        long,
        value_name = "ID",
        help_heading = RUN,
        help = "Claude account its runs use: an account id, or default for the main login. Default: the project's"
    )]
    pub claude_account: Option<String>,

    #[arg(
        long,
        value_name = "COMMAND",
        help_heading = STEPS,
        help = "Runs first, in the project: exit 0 means there is work, anything else ends the run"
    )]
    pub check: Option<String>,
    #[arg(long, value_name = "COMMAND", help_heading = STEPS, help = "Runs after: exit 0 means the checks passed")]
    pub verify: Option<String>,
    #[arg(
        long,
        value_name = "COMMAND",
        help_heading = STEPS,
        help = "Runs in the project when a question asked with lpm ask --key is answered, with LPM_ASK_KEY and LPM_ANSWER set"
    )]
    pub on_answer: Option<String>,
    #[arg(
        long,
        value_name = "MODE",
        value_parser = ["copy", "worktree", "off"],
        help_heading = STEPS,
        help = "Run in a fresh copy or Git worktree of the project"
    )]
    pub duplicate: Option<String>,
    #[arg(long, value_name = "BOOL", num_args = 0..=1, default_missing_value = "true", help_heading = STEPS, help = "Reinstall dependencies in the copy")]
    pub reinstall_deps: Option<bool>,
    #[arg(long, value_name = "BOOL", num_args = 0..=1, default_missing_value = "true", help_heading = STEPS, help = "Pull the latest commits into a copy first (default true)")]
    pub pull_latest: Option<bool>,
    #[arg(long, value_name = "BOOL", num_args = 0..=1, default_missing_value = "true", help_heading = STEPS, help = "Leave uncommitted changes out of a copy")]
    pub exclude_uncommitted: Option<bool>,
    #[arg(
        long,
        value_name = "DEST",
        value_delimiter = ',',
        help_heading = STEPS,
        help = "Where results go: lpm (default), telegram, telegram:<target>"
    )]
    pub send_to: Option<Vec<String>>,
    #[arg(
        long,
        value_name = "MACHINES",
        value_delimiter = ',',
        help_heading = STEPS,
        help = "Computers it runs on, best first: this, a paired computer's name, or any (any other one that's on); the first one on runs it. Default: this one; empty: every computer that has it"
    )]
    pub machines: Option<Vec<String>>,
}

impl JobFields {
    pub fn schedule_given(&self) -> bool {
        self.manual
            || self.every.is_some()
            || !self.at.is_empty()
            || self.until.is_some()
            || self.times.is_some()
            || self.days.is_some()
            || self.pick_days.is_some()
            || self.short_months.is_some()
            || self.cron.is_some()
    }

    pub fn run_target_given(&self) -> bool {
        [&self.cmd, &self.action, &self.prompt]
            .iter()
            .any(|value| value.as_deref().is_some_and(|v| !v.trim().is_empty()))
    }

    fn run_given(&self) -> bool {
        [
            &self.cmd,
            &self.action,
            &self.prompt,
            &self.agent,
            &self.model,
            &self.effort,
            &self.access,
            &self.claude_account,
        ]
        .iter()
        .any(|value| value.is_some())
            || self.quiet.is_some()
            || self.memory.is_some()
    }

    fn copy_options_given(&self) -> bool {
        self.reinstall_deps.is_some()
            || self.pull_latest.is_some()
            || self.exclude_uncommitted.is_some()
    }

    pub fn is_empty(&self) -> bool {
        !self.schedule_given()
            && !self.run_given()
            && !self.copy_options_given()
            && [
                &self.label,
                &self.emoji,
                &self.check,
                &self.verify,
                &self.on_answer,
                &self.duplicate,
            ]
            .iter()
            .all(|value| value.is_none())
            && self.send_to.is_none()
            && self.machines.is_none()
    }

    /// Writes the given fields into `job` in the order the app writes them, so a
    /// new entry reads like one made in the app; an edited key keeps its place.
    pub fn apply(&self, job: &mut Mapping) -> Result<(), String> {
        put(job, "label", self.label.as_deref());
        put(job, "emoji", self.emoji.as_deref());
        if self.schedule_given() {
            job.insert("schedule".into(), Value::Mapping(self.schedule()));
        }
        put(job, "check", self.check.as_deref());
        put(job, "verify", self.verify.as_deref());
        put(job, "onAnswer", self.on_answer.as_deref());
        self.apply_duplicate(job)?;
        if self.run_given() {
            let mut run = match job.get("run") {
                Some(Value::Mapping(run)) => run.clone(),
                _ => Mapping::new(),
            };
            self.apply_run(&mut run);
            job.insert("run".into(), Value::Mapping(run));
        }
        if let Some(destinations) = &self.send_to {
            let destinations: Vec<Value> = destinations
                .iter()
                .map(|d| d.trim())
                .filter(|d| !d.is_empty())
                .map(|d| Value::String(d.to_string()))
                .collect();
            match destinations.as_slice() {
                [] => {
                    job.shift_remove("sendTo");
                }
                [one] => {
                    job.insert("sendTo".into(), one.clone());
                }
                _ => {
                    job.insert("sendTo".into(), Value::Sequence(destinations));
                }
            }
        }
        // The app turns names into hostIds, and reads an empty list as every
        // computer that has the automation.
        if let Some(machines) = &self.machines {
            let machines: Vec<Value> = machines
                .iter()
                .map(|m| m.trim())
                .filter(|m| !m.is_empty())
                .map(|m| Value::String(m.to_string()))
                .collect();
            job.insert("machines".into(), Value::Sequence(machines));
        }
        Ok(())
    }

    fn schedule(&self) -> Mapping {
        let mut schedule = Mapping::new();
        if self.manual {
            schedule.insert("manual".into(), Value::Bool(true));
            return schedule;
        }
        if let Some(cron) = &self.cron {
            put(&mut schedule, "cron", Some(cron));
            return schedule;
        }
        let ats: Vec<Value> = self
            .at
            .iter()
            .map(|at| at.trim())
            .filter(|at| !at.is_empty())
            .map(|at| Value::String(at.to_string()))
            .collect();
        match ats.as_slice() {
            [] => {}
            [one] => {
                schedule.insert("at".into(), one.clone());
            }
            _ => {
                schedule.insert("at".into(), Value::Sequence(ats));
            }
        }
        put(&mut schedule, "until", self.until.as_deref());
        if let Some(times) = self.times {
            schedule.insert("times".into(), Value::Number(times.into()));
        }
        if let Some(days) = self.days.as_deref().and_then(days_value) {
            schedule.insert("days".into(), days);
        }
        if let Some(pick) = self.pick_days {
            schedule.insert("pickDays".into(), Value::Number(pick.into()));
        }
        put(&mut schedule, "shortMonths", self.short_months.as_deref());
        put(&mut schedule, "every", self.every.as_deref());
        schedule
    }

    // The target flags switch what the automation runs: `--cmd` replaces the
    // run outright, `--action` drops the AI fields, and `--prompt` alone keeps
    // an action (handing its terminal the prompt) or the agent settings.
    fn apply_run(&self, run: &mut Mapping) {
        if let Some(cmd) = &self.cmd {
            run.clear();
            put(run, "cmd", Some(cmd));
        }
        if let Some(action) = &self.action {
            for key in [
                "cmd",
                "prompt",
                "agent",
                "model",
                "effort",
                "access",
                "quiet",
                "memory",
                "claudeAccount",
            ] {
                run.shift_remove(key);
            }
            put(run, "action", Some(action));
        }
        if let Some(prompt) = &self.prompt {
            run.shift_remove("cmd");
            put(run, "prompt", Some(prompt));
        }
        put(run, "agent", self.agent.as_deref());
        put(run, "model", self.model.as_deref());
        put(run, "effort", self.effort.as_deref());
        put(run, "access", self.access.as_deref());
        for (key, value) in [("quiet", self.quiet), ("memory", self.memory)] {
            match value {
                Some(true) => {
                    run.insert(key.into(), Value::Bool(true));
                }
                Some(false) => {
                    run.shift_remove(key);
                }
                None => {}
            }
        }
        // The app writes the main login as `''`, which an empty flag can't say.
        match self.claude_account.as_deref().map(str::trim) {
            None => {}
            Some("") => {
                run.shift_remove("claudeAccount");
            }
            Some("default") => {
                run.insert("claudeAccount".into(), Value::String(String::new()));
            }
            Some(id) => {
                run.insert("claudeAccount".into(), Value::String(id.to_string()));
            }
        }
    }

    fn apply_duplicate(&self, job: &mut Mapping) -> Result<(), String> {
        if self.duplicate.is_none() && !self.copy_options_given() {
            return Ok(());
        }
        let mut options = match job.get("duplicate") {
            Some(Value::Mapping(options)) => options.clone(),
            _ => Mapping::new(),
        };
        let copies = matches!(
            job.get("duplicate"),
            Some(Value::Bool(true) | Value::Mapping(_))
        );
        match self.duplicate.as_deref() {
            Some("off") if self.copy_options_given() => {
                return Err("--duplicate off takes no copy options".into())
            }
            Some("off") => {
                job.shift_remove("duplicate");
                return Ok(());
            }
            Some("worktree") => {
                options.insert("mode".into(), Value::String("worktree".into()));
            }
            Some(_) => {
                options.shift_remove("mode");
            }
            None if !copies => {
                return Err("copy options need --duplicate copy or --duplicate worktree".into())
            }
            None => {}
        }
        for (key, value) in [
            ("reinstallDeps", self.reinstall_deps),
            ("pullLatest", self.pull_latest),
            ("excludeUncommitted", self.exclude_uncommitted),
        ] {
            if let Some(value) = value {
                options.insert(key.into(), Value::Bool(value));
            }
        }
        // A worktree shares the original's history and working files, so the
        // app ignores these for it.
        if options.get("mode").and_then(Value::as_str) == Some("worktree") {
            if self.pull_latest.is_some() || self.exclude_uncommitted.is_some() {
                return Err("--pull-latest and --exclude-uncommitted only apply to a copy".into());
            }
            options.shift_remove("pullLatest");
            options.shift_remove("excludeUncommitted");
        }
        let value = if options.is_empty() {
            Value::Bool(true)
        } else {
            Value::Mapping(options)
        };
        job.insert("duplicate".into(), value);
        Ok(())
    }
}

/// Sets a text field, or removes it when the value is empty.
fn put(map: &mut Mapping, key: &str, value: Option<&str>) {
    match value.map(str::trim) {
        None => {}
        Some("") => {
            map.shift_remove(key);
        }
        Some(value) => {
            map.insert(key.into(), Value::String(value.to_string()));
        }
    }
}

/// `mon,thu` and `1,15,last` become lists, as the app writes them; a phrase
/// with a space (`first mon`) stays one value.
fn days_value(text: &str) -> Option<Value> {
    let text = text.trim().to_lowercase();
    if text.is_empty() {
        return None;
    }
    if !text.contains(',') && text.contains(char::is_whitespace) {
        return Some(Value::String(text));
    }
    let items = text
        .split(',')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(|item| match item.parse::<u64>() {
            Ok(date) => Value::Number(date.into()),
            Err(_) => Value::String(item.to_string()),
        })
        .collect();
    Some(Value::Sequence(items))
}

#[cfg(test)]
#[path = "job_fields_tests.rs"]
mod tests;
