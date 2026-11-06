use crate::config::Ctx;
use crate::control;
use crate::job_edit;
use crate::job_open;
use crate::job_runtime::{self, Target};
use crate::error::{resolve_or_infer, RunError};
use crate::statussock::quote_arg;
use crate::style::Style;
use crate::util::{now_millis, print_json, relative};
use clap::Subcommand;
use serde_json::{json, Value};
use std::io::IsTerminal;

#[derive(Subcommand)]
pub enum Command {
    #[command(about = "List automations and their current state")]
    List {
        #[arg(
            long,
            short = 'p',
            conflicts_with = "all",
            help = "Limit the list to one project"
        )]
        project: Option<String>,
        #[arg(long, help = "List automations across every project")]
        all: bool,
        #[arg(long, help = "Emit machine-readable JSON")]
        json: bool,
    },
    #[command(about = "Run an automation immediately")]
    Run {
        #[command(flatten)]
        target: Target,
        #[arg(long)]
        json: bool,
    },
    #[command(about = "Stop an automation's current run")]
    Stop {
        #[command(flatten)]
        target: Target,
        #[arg(long)]
        json: bool,
    },
    #[command(
        about = "Stop a running Claude automation and carry its conversation on in a terminal"
    )]
    TakeOver {
        #[command(flatten)]
        target: Target,
        #[arg(long)]
        json: bool,
    },
    #[command(about = "Enable a scheduled automation", alias = "resume")]
    Enable {
        #[command(flatten)]
        target: Target,
        #[arg(long)]
        json: bool,
    },
    #[command(about = "Disable a scheduled automation", alias = "pause")]
    Disable {
        #[command(flatten)]
        target: Target,
        #[arg(long)]
        json: bool,
    },
    #[command(about = "Show an automation's run and conversation history")]
    History {
        #[command(flatten)]
        target: Target,
        #[arg(long, short = 'n', help = "Show only the newest N runs")]
        limit: Option<usize>,
        #[arg(long)]
        json: bool,
    },
    #[command(about = "Print an automation's current live output")]
    Output {
        #[command(flatten)]
        target: Target,
        #[arg(long)]
        json: bool,
    },
    #[command(about = "Print an automation's definition")]
    Show(job_edit::ShowArgs),
    #[command(about = "Open an automation's page in the app")]
    Open(job_open::OpenArgs),
    #[command(about = "Create an automation", alias = "create")]
    Add(Box<job_edit::AddArgs>),
    #[command(about = "Change an automation's definition")]
    Edit(Box<job_edit::EditArgs>),
    #[command(
        about = "Delete an automation and its run history",
        visible_alias = "rm",
        alias = "delete"
    )]
    Remove(job_edit::RemoveArgs),
    #[command(about = "Answer or dismiss the question an automation is waiting on")]
    Answer(crate::job_answer::AnswerArgs),
    #[command(
        name = "remove-run",
        about = "Remove one run (or one message of it) from an automation's history"
    )]
    RemoveRun(crate::job_manage::RemoveRunArgs),
    #[command(name = "mark-read", about = "Mark an automation's runs read, or every automation's")]
    MarkRead(crate::job_manage::MarkReadArgs),
    #[command(
        name = "test-check",
        about = "Try an automation's check command now, the way a scheduled run would"
    )]
    TestCheck(crate::job_manage::TestCheckArgs),
    #[command(about = "Continue an AI automation conversation")]
    Reply {
        #[command(flatten)]
        target: Target,
        message: String,
        #[arg(
            long,
            help = "History entry timestamp to continue; defaults to the newest conversation"
        )]
        at: Option<u64>,
        #[arg(long)]
        agent: Option<String>,
        #[arg(long)]
        model: Option<String>,
        #[arg(long)]
        effort: Option<String>,
        #[arg(long)]
        json: bool,
    },
}

pub fn run(ctx: &Ctx, command: Command) -> Result<(), RunError> {
    match command {
        Command::List { project, all, json } => list(ctx, project.as_deref(), all, json),
        Command::Run { target, json } => {
            job_runtime::mutate(ctx, "run_job", "running", &target, "", json)
        }
        Command::Stop { target, json } => {
            job_runtime::mutate(ctx, "stop_job", "stopping", &target, "", json)
        }
        Command::TakeOver { target, json } => {
            job_runtime::mutate(ctx, "take_over_job", "taking over", &target, "", json)
        }
        Command::Enable { target, json } => {
            job_runtime::mutate(ctx, "set_job_enabled", "enabled", &target, "true", json)
        }
        Command::Disable { target, json } => {
            job_runtime::mutate(ctx, "set_job_enabled", "disabled", &target, "false", json)
        }
        Command::History {
            target,
            limit,
            json,
        } => job_runtime::history(ctx, &target, limit, json),
        Command::Output { target, json } => job_runtime::output(ctx, &target, json),
        Command::Show(args) => job_edit::show(ctx, args),
        Command::Open(args) => job_open::open(ctx, args),
        Command::Add(args) => job_edit::add(ctx, *args),
        Command::Edit(args) => job_edit::edit(ctx, *args),
        Command::Remove(args) => job_edit::remove(ctx, args),
        Command::Answer(args) => crate::job_answer::answer(ctx, args),
        Command::RemoveRun(args) => crate::job_manage::remove_run(ctx, args),
        Command::MarkRead(args) => crate::job_manage::mark_read(ctx, args),
        Command::TestCheck(args) => crate::job_manage::test_check(ctx, args),
        Command::Reply {
            target,
            message,
            at,
            agent,
            model,
            effort,
            json,
        } => job_runtime::reply(
            ctx,
            &target,
            &message,
            at,
            agent.as_deref(),
            model.as_deref(),
            effort.as_deref(),
            json,
        ),
    }
}

pub(crate) fn request_value(ctx: &Ctx, line: &str) -> Result<Value, RunError> {
    let reply = control::send_command(ctx, line)?;
    serde_json::from_str(&reply)
        .map_err(|e| RunError::Internal(format!("unexpected reply from app: {e}: {reply}")))
}

fn list(ctx: &Ctx, project: Option<&str>, all: bool, as_json: bool) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let (scope, mut jobs) = if all {
        let rows = request_value(ctx, "list_all_jobs")?;
        (None, value_array(rows)?)
    } else {
        let project = resolve_or_infer(ctx, project)?;
        let rows = request_value(ctx, &format!("list_jobs {}", quote_arg(&project)))?;
        let mut jobs = value_array(rows)?;
        for job in &mut jobs {
            job["project"] = json!(project);
        }
        (Some(project), jobs)
    };
    jobs.sort_by(|a, b| {
        value_text(a, "project")
            .cmp(value_text(b, "project"))
            .then_with(|| value_text(a, "id").cmp(value_text(b, "id")))
    });

    if as_json {
        print_json(&json!({ "project": scope, "automations": jobs }));
    } else if jobs.is_empty() {
        match scope {
            Some(project) => println!("no automations in {project}"),
            None => println!("no automations"),
        }
    } else {
        let style = Style {
            on: std::io::stdout().is_terminal(),
        };
        print!("{}", render_table(&style, &jobs, now_millis() / 1000));
    }
    Ok(())
}

pub(crate) fn value_array(value: Value) -> Result<Vec<Value>, RunError> {
    value
        .as_array()
        .cloned()
        .ok_or_else(|| RunError::Internal("unexpected non-array reply from app".into()))
}

pub(crate) fn ensure_ok(value: Value) -> Result<(), RunError> {
    if value.get("ok").and_then(Value::as_bool).unwrap_or(false) {
        return Ok(());
    }
    Err(RunError::Internal(
        value
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("automation command failed")
            .to_string(),
    ))
}

pub(crate) fn value_text<'a>(value: &'a Value, key: &str) -> &'a str {
    value.get(key).and_then(Value::as_str).unwrap_or("")
}

fn render_table(style: &Style, jobs: &[Value], now_secs: i64) -> String {
    let rows: Vec<[String; 8]> = jobs
        .iter()
        .map(|job| {
            let id = value_text(job, "id").to_string();
            if !job.get("valid").and_then(Value::as_bool).unwrap_or(false) {
                return [
                    value_text(job, "project").to_string(),
                    id,
                    value_text(job, "error").to_string(),
                    "invalid".into(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                ];
            }
            let name = match value_text(job, "label") {
                "" => id.clone(),
                label => label.to_string(),
            };
            let state = if job.get("ask").is_some_and(Value::is_object) {
                "waiting"
            } else if job.get("running").and_then(Value::as_bool).unwrap_or(false) {
                "running"
            } else if job.get("enabled").and_then(Value::as_bool).unwrap_or(false) {
                "enabled"
            } else {
                "paused"
            };
            let next = job
                .get("nextFireAt")
                .and_then(Value::as_i64)
                .map(|at| humanize_until(at - now_secs))
                .unwrap_or_else(|| "—".into());
            let unread = job.get("unread").and_then(Value::as_u64).unwrap_or(0);
            [
                value_text(job, "project").to_string(),
                id,
                name,
                state.into(),
                if unread > 0 { unread.to_string() } else { String::new() },
                humanize_schedule(job.get("schedule").unwrap_or(&Value::Null)),
                value_text(job, "lastResult").to_string(),
                next,
            ]
        })
        .collect();
    let headers = [
        "PROJECT",
        "ID",
        "AUTOMATION",
        "STATE",
        "NEW",
        "SCHEDULE",
        "LAST",
        "NEXT",
    ];
    let mut widths = headers.map(str::len);
    for row in &rows {
        for (index, cell) in row.iter().enumerate() {
            widths[index] = widths[index].max(cell.chars().count());
        }
    }
    let header = headers
        .iter()
        .enumerate()
        .map(|(index, value)| format!("{value:<width$}", width = widths[index]))
        .collect::<Vec<_>>()
        .join("  ");
    let mut output = format!("{}\n", style.bold(&header));
    for row in rows {
        let cells = row
            .iter()
            .enumerate()
            .map(|(index, value)| {
                let padded = format!("{value:<width$}", width = widths[index]);
                match (index, value.as_str()) {
                    (1, _) => style.bold(&padded),
                    (3, "running") => style.green(&padded),
                    (3, "waiting") => style.yellow(&padded),
                    (3, "enabled") => style.green(&padded),
                    (3, "invalid") => style.red(&padded),
                    (4, count) if !count.is_empty() => style.bold(&padded),
                    _ => style.dim(&padded),
                }
            })
            .collect::<Vec<_>>()
            .join("  ");
        output.push_str(&cells);
        output.push('\n');
    }
    output
}

pub(crate) fn render_history(style: &Style, entries: &[Value], now_ms: i64) -> String {
    let mut output = String::new();
    for entry in entries.iter().rev() {
        let at = entry.get("at").and_then(Value::as_i64).unwrap_or_default();
        let result = value_text(entry, "result");
        let mut meta = vec![relative(at * 1000, now_ms)];
        if let Some(project) = entry.get("project").and_then(Value::as_str) {
            meta.push(project.to_string());
        }
        if let Some(duration) = entry.get("durationSecs").and_then(Value::as_u64) {
            meta.push(format!("{duration}s"));
        }
        if let Some(cost) = entry.get("costUsd").and_then(Value::as_f64) {
            meta.push(format!("${cost:.4}"));
        }
        if let Some(copy) = entry.get("copy").and_then(Value::as_str) {
            meta.push(copy.to_string());
        }
        output.push_str(&format!(
            "{}  {}  {}\n",
            style.bold(&at.to_string()),
            result,
            style.dim(&meta.join(" · "))
        ));
        if let Some(question) = entry.get("question").and_then(Value::as_str) {
            for line in question.lines() {
                output.push_str(&format!("  > {line}\n"));
            }
        }
        if let Some(text) = entry.get("output").and_then(Value::as_str) {
            for line in text.lines() {
                output.push_str(&format!("  {line}\n"));
            }
        }
        for ask in entry.get("asks").and_then(Value::as_array).into_iter().flatten() {
            output.push_str(&render_ask(ask));
        }
        output.push('\n');
    }
    output
}

/// A yes/no question's button label for `yes`: the run's own, or Yes / No.
pub(crate) fn confirm_label(q: &Value, yes: bool) -> String {
    let (key, fallback) = if yes { ("yes", "Yes") } else { ("no", "No") };
    match value_text(q, key) {
        "" => fallback.to_string(),
        label => label.to_string(),
    }
}

/// A run's question with how it ended: the answers, or why there were none.
fn render_ask(ask: &Value) -> String {
    let answers = ask.get("answers");
    let mut out = String::new();
    for q in ask.get("questions").and_then(Value::as_array).into_iter().flatten() {
        let answer = answers.and_then(|a| a.get(value_text(q, "id")));
        let shown = match (value_text(q, "type"), answer) {
            ("confirm", Some(Value::Bool(yes))) => confirm_label(q, *yes),
            (_, Some(Value::Array(picks))) => picks
                .iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>()
                .join(", "),
            (_, Some(Value::String(text))) => text.clone(),
            _ => String::new(),
        };
        let line = if shown.is_empty() {
            value_text(q, "text").to_string()
        } else {
            format!("{} → {shown}", value_text(q, "text"))
        };
        out.push_str(&format!("  ? {line}\n"));
    }
    let status = match value_text(ask, "status") {
        "open" => Some("waiting for your answer — lpm automations answer"),
        "dismissed" => Some("dismissed"),
        "unanswered" => Some("no answer"),
        _ if value_text(ask, "reply") != "" => Some("answered in a reply"),
        _ => None,
    };
    if let Some(status) = status {
        out.push_str(&format!("    ({status})\n"));
    }
    out
}

fn humanize_schedule(schedule: &Value) -> String {
    let strings = |key: &str| -> Vec<String> {
        schedule
            .get(key)
            .and_then(Value::as_array)
            .map(|items| items.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default()
    };
    let clock = |minutes: i64| format!("{:02}:{:02}", minutes / 60, minutes % 60);
    match schedule.get("mode").and_then(Value::as_str) {
        Some("interval") => {
            let seconds = schedule
                .get("everySecs")
                .and_then(Value::as_i64)
                .unwrap_or_default();
            let mut text = if seconds > 0 && seconds % 86_400 == 0 {
                format!("every {}d", seconds / 86_400)
            } else if seconds > 0 && seconds < 3_600 {
                format!("every {}m", (seconds / 60).max(1))
            } else {
                format!("every {}h", seconds / 3600)
            };
            let from = schedule.get("fromMinutes").and_then(Value::as_i64);
            let until = schedule.get("untilMinutes").and_then(Value::as_i64);
            if let (Some(from), Some(until)) = (from, until) {
                text.push_str(&format!(" {}-{}", clock(from), clock(until)));
            }
            let days = strings("days");
            if !days.is_empty() {
                text.push_str(&format!(" {}", days.join(",")));
            }
            text
        }
        Some("calendar") => {
            let at = schedule
                .get("atMinutes")
                .and_then(Value::as_i64)
                .unwrap_or_default();
            let mut times = vec![clock(at)];
            if let Some(more) = schedule.get("alsoAtMinutes").and_then(Value::as_array) {
                times.extend(more.iter().filter_map(Value::as_i64).map(clock));
            }
            let time = times.join(",");
            let mut month_days: Vec<String> = schedule
                .get("monthDays")
                .and_then(Value::as_array)
                .map(|items| items.iter().filter_map(Value::as_i64).map(|d| d.to_string()).collect())
                .unwrap_or_default();
            if schedule.get("lastDay").and_then(Value::as_bool) == Some(true) {
                month_days.push("last".into());
            }
            let on_dates = strings("onDates");
            let nth = schedule.get("nth").and_then(Value::as_str);
            let nth_of = schedule.get("nthOf").and_then(Value::as_str);
            let days = strings("days");
            if !on_dates.is_empty() {
                format!("once on {} at {time}", on_dates.join(","))
            } else if let (Some(nth), Some(of)) = (nth, nth_of) {
                format!("{nth} {of} monthly at {time}")
            } else if !month_days.is_empty() {
                format!("monthly on {} at {time}", month_days.join(","))
            } else if days.is_empty() {
                format!("daily at {time}")
            } else {
                format!("{} at {time}", days.join(","))
            }
        }
        Some("cron") => match schedule.get("cron").and_then(Value::as_str) {
            Some(line) => format!("cron {line}"),
            None => "—".into(),
        },
        Some("manual") => "manual".into(),
        _ => "—".into(),
    }
}

pub(crate) fn humanize_until(seconds: i64) -> String {
    if seconds <= 0 {
        return "due".into();
    }
    let (amount, unit) = if seconds < 3600 {
        ((seconds / 60).max(1), "m")
    } else if seconds < 86_400 {
        (seconds / 3600, "h")
    } else {
        (seconds / 86_400, "d")
    };
    format!("in {amount}{unit}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schedule_words_cover_interval_and_calendar() {
        assert_eq!(
            humanize_schedule(&json!({ "mode": "interval", "everySecs": 6 * 3600 })),
            "every 6h"
        );
        assert_eq!(
            humanize_schedule(
                &json!({ "mode": "calendar", "atMinutes": 450, "days": ["mon", "thu"] })
            ),
            "mon,thu at 07:30"
        );
        assert_eq!(
            humanize_schedule(&json!({ "mode": "cron", "cron": "0 18 * * 5" })),
            "cron 0 18 * * 5"
        );
        assert_eq!(humanize_schedule(&json!({ "mode": "manual" })), "manual");
    }

    #[test]
    fn schedule_words_cover_monthly_once_and_limits() {
        assert_eq!(
            humanize_schedule(&json!({
                "mode": "calendar", "atMinutes": 540, "alsoAtMinutes": [1020],
                "days": [], "monthDays": [1, 15], "lastDay": true,
            })),
            "monthly on 1,15,last at 09:00,17:00"
        );
        assert_eq!(
            humanize_schedule(&json!({
                "mode": "calendar", "atMinutes": 600, "days": [], "nth": "first", "nthOf": "mon",
            })),
            "first mon monthly at 10:00"
        );
        assert_eq!(
            humanize_schedule(&json!({
                "mode": "calendar", "atMinutes": 840, "days": [], "onDates": ["2026-10-20"],
            })),
            "once on 2026-10-20 at 14:00"
        );
        assert_eq!(
            humanize_schedule(&json!({
                "mode": "interval", "everySecs": 1800, "fromMinutes": 540, "untilMinutes": 1080,
                "days": ["mon", "fri"],
            })),
            "every 30m 09:00-18:00 mon,fri"
        );
    }

    #[test]
    fn table_includes_project_name_state_and_invalid_rows() {
        let style = Style { on: false };
        let jobs = vec![
            json!({
                "project": "app", "id": "updates", "label": "Dependency updates",
                "valid": true, "enabled": true, "running": false,
                "schedule": { "mode": "interval", "everySecs": 6 * 3600 },
                "lastResult": "completed", "nextFireAt": 4600,
            }),
            json!({ "project": "app", "id": "broken", "valid": false, "error": "bad schedule" }),
        ];
        let output = render_table(&style, &jobs, 1000);
        assert!(output.contains("PROJECT"));
        assert!(output.contains("Dependency updates"));
        assert!(output.contains("enabled"));
        assert!(output.contains("bad schedule"));
    }

    #[test]
    fn history_renders_questions_and_outputs() {
        let style = Style { on: false };
        let output = render_history(
            &style,
            &[
                json!({ "at": 100, "result": "completed", "question": "continue", "output": "done" }),
            ],
            100_000,
        );
        assert!(output.contains("> continue"));
        assert!(output.contains("done"));
    }

    #[test]
    fn history_shows_a_runs_question_and_its_answer() {
        let style = Style { on: false };
        let ask = |status: &str, answers: Value| {
            json!({ "at": 100, "result": "completed", "asks": [{
                "id": "a", "status": status, "answers": answers,
                "questions": [{ "id": "q1", "type": "confirm", "text": "Deploy?", "yes": "Ship" }],
            }]})
        };
        let open = render_history(&style, &[ask("open", json!({}))], 100_000);
        assert!(open.contains("? Deploy?\n"));
        assert!(open.contains("waiting for your answer"));
        let answered = render_history(&style, &[ask("answered", json!({ "q1": true }))], 100_000);
        assert!(answered.contains("? Deploy? → Ship"));
    }
}
