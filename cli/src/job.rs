use crate::config::Ctx;
use crate::control;
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
        job_id: String,
        #[arg(long, short = 'p')]
        project: Option<String>,
        #[arg(long)]
        json: bool,
    },
    #[command(about = "Stop an automation's current run")]
    Stop {
        job_id: String,
        #[arg(long, short = 'p')]
        project: Option<String>,
        #[arg(long)]
        json: bool,
    },
    #[command(about = "Enable a scheduled automation", alias = "resume")]
    Enable {
        job_id: String,
        #[arg(long, short = 'p')]
        project: Option<String>,
        #[arg(long)]
        json: bool,
    },
    #[command(about = "Disable a scheduled automation", alias = "pause")]
    Disable {
        job_id: String,
        #[arg(long, short = 'p')]
        project: Option<String>,
        #[arg(long)]
        json: bool,
    },
    #[command(about = "Show an automation's run and conversation history")]
    History {
        job_id: String,
        #[arg(long, short = 'p')]
        project: Option<String>,
        #[arg(long)]
        json: bool,
    },
    #[command(about = "Print an automation's current live output")]
    Output {
        job_id: String,
        #[arg(long, short = 'p')]
        project: Option<String>,
        #[arg(long)]
        json: bool,
    },
    #[command(about = "Continue an AI automation conversation")]
    Reply {
        job_id: String,
        message: String,
        #[arg(long, short = 'p')]
        project: Option<String>,
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
        Command::Run {
            job_id,
            project,
            json,
        } => run_job(ctx, &job_id, project.as_deref(), json),
        Command::Stop {
            job_id,
            project,
            json,
        } => stop_job(ctx, &job_id, project.as_deref(), json),
        Command::Enable {
            job_id,
            project,
            json,
        } => set_enabled(ctx, &job_id, project.as_deref(), true, json),
        Command::Disable {
            job_id,
            project,
            json,
        } => set_enabled(ctx, &job_id, project.as_deref(), false, json),
        Command::History {
            job_id,
            project,
            json,
        } => history(ctx, &job_id, project.as_deref(), json),
        Command::Output {
            job_id,
            project,
            json,
        } => output(ctx, &job_id, project.as_deref(), json),
        Command::Reply {
            job_id,
            message,
            project,
            at,
            agent,
            model,
            effort,
            json,
        } => reply(
            ctx,
            &job_id,
            &message,
            project.as_deref(),
            at,
            agent.as_deref(),
            model.as_deref(),
            effort.as_deref(),
            json,
        ),
    }
}

fn request_value(ctx: &Ctx, line: &str) -> Result<Value, RunError> {
    let reply = control::send_command(ctx, line)?;
    serde_json::from_str(&reply)
        .map_err(|e| RunError::Internal(format!("unexpected reply from app: {e}: {reply}")))
}

fn project_name(ctx: &Ctx, project: Option<&str>) -> Result<String, RunError> {
    resolve_or_infer(ctx, project)
}

fn list(ctx: &Ctx, project: Option<&str>, all: bool, as_json: bool) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let (scope, mut jobs) = if all {
        let rows = request_value(ctx, "list_all_jobs")?;
        (None, value_array(rows)?)
    } else {
        let project = project_name(ctx, project)?;
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

fn run_job(ctx: &Ctx, job_id: &str, project: Option<&str>, as_json: bool) -> Result<(), RunError> {
    mutate(ctx, "run_job", "running", job_id, project, None, as_json)
}

fn stop_job(ctx: &Ctx, job_id: &str, project: Option<&str>, as_json: bool) -> Result<(), RunError> {
    mutate(ctx, "stop_job", "stopping", job_id, project, None, as_json)
}

fn set_enabled(
    ctx: &Ctx,
    job_id: &str,
    project: Option<&str>,
    enabled: bool,
    as_json: bool,
) -> Result<(), RunError> {
    mutate(
        ctx,
        "set_job_enabled",
        if enabled { "enabled" } else { "disabled" },
        job_id,
        project,
        Some(enabled),
        as_json,
    )
}

fn mutate(
    ctx: &Ctx,
    verb: &str,
    action: &str,
    job_id: &str,
    project: Option<&str>,
    enabled: Option<bool>,
    as_json: bool,
) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let project = project_name(ctx, project)?;
    let mut line = format!("{verb} {} {}", quote_arg(&project), quote_arg(job_id));
    if let Some(enabled) = enabled {
        line.push_str(if enabled { " true" } else { " false" });
    }
    ensure_ok(request_value(ctx, &line)?)?;
    if as_json {
        print_json(&json!({
            "ok": true,
            "project": project,
            "automation": job_id,
            "action": action,
        }));
    } else {
        println!("{action} automation {job_id} in {project}");
        if verb == "run_job" {
            eprintln!("note: fire-and-forget — watch it with `lpm automations list -p {project}`");
        }
    }
    Ok(())
}

fn history(ctx: &Ctx, job_id: &str, project: Option<&str>, as_json: bool) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let project = project_name(ctx, project)?;
    let entries = load_history(ctx, &project, job_id)?;
    if as_json {
        print_json(&json!({ "project": project, "automation": job_id, "history": entries }));
    } else if entries.is_empty() {
        println!("no runs for automation {job_id} in {project}");
    } else {
        let style = Style {
            on: std::io::stdout().is_terminal(),
        };
        print!("{}", render_history(&style, &entries, now_millis()));
    }
    Ok(())
}

fn output(ctx: &Ctx, job_id: &str, project: Option<&str>, as_json: bool) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let project = project_name(ctx, project)?;
    let live = request_value(
        ctx,
        &format!(
            "job_live_output {} {}",
            quote_arg(&project),
            quote_arg(job_id)
        ),
    )?;
    if as_json {
        print_json(&json!({ "project": project, "automation": job_id, "live": live }));
    } else if let Some(text) = live.get("text").and_then(Value::as_str) {
        if text.is_empty() {
            println!("automation {job_id} has not produced output yet");
        } else {
            println!("{text}");
        }
    } else {
        println!("automation {job_id} is not currently producing live output");
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn reply(
    ctx: &Ctx,
    job_id: &str,
    message: &str,
    project: Option<&str>,
    at: Option<u64>,
    agent: Option<&str>,
    model: Option<&str>,
    effort: Option<&str>,
    as_json: bool,
) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let project = project_name(ctx, project)?;
    let at = match at {
        Some(at) => at,
        None => newest_history_at(&load_history(ctx, &project, job_id)?).ok_or_else(|| {
            RunError::NotFound(format!(
                "automation {job_id} has no conversation to continue — run it first"
            ))
        })?,
    };
    let mut line = format!(
        "send_job_followup {} {} {at} --message-hex={}",
        quote_arg(&project),
        quote_arg(job_id),
        hex_encode(message)
    );
    for (key, value) in [("agent", agent), ("model", model), ("effort", effort)] {
        if let Some(value) = value.filter(|value| !value.is_empty()) {
            line.push_str(&format!(" --{key}={}", quote_arg(value)));
        }
    }
    ensure_ok(request_value(ctx, &line)?)?;
    if as_json {
        print_json(&json!({
            "ok": true,
            "project": project,
            "automation": job_id,
            "at": at,
        }));
    } else {
        println!("sent reply to automation {job_id} in {project}");
        eprintln!(
            "note: fire-and-forget — watch it with `lpm automations output {job_id} -p {project}`"
        );
    }
    Ok(())
}

fn load_history(ctx: &Ctx, project: &str, job_id: &str) -> Result<Vec<Value>, RunError> {
    value_array(request_value(
        ctx,
        &format!("job_history {} {}", quote_arg(project), quote_arg(job_id)),
    )?)
}

fn value_array(value: Value) -> Result<Vec<Value>, RunError> {
    value
        .as_array()
        .cloned()
        .ok_or_else(|| RunError::Internal("unexpected non-array reply from app".into()))
}

fn ensure_ok(value: Value) -> Result<(), RunError> {
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

fn newest_history_at(entries: &[Value]) -> Option<u64> {
    entries
        .iter()
        .filter_map(|entry| entry.get("at")?.as_u64())
        .max()
}

fn hex_encode(text: &str) -> String {
    text.as_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn value_text<'a>(value: &'a Value, key: &str) -> &'a str {
    value.get(key).and_then(Value::as_str).unwrap_or("")
}

fn render_table(style: &Style, jobs: &[Value], now_secs: i64) -> String {
    let rows: Vec<[String; 7]> = jobs
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
                ];
            }
            let name = match value_text(job, "label") {
                "" => id.clone(),
                label => label.to_string(),
            };
            let state = if job.get("running").and_then(Value::as_bool).unwrap_or(false) {
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
            [
                value_text(job, "project").to_string(),
                id,
                name,
                state.into(),
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
                    (3, "enabled") => style.green(&padded),
                    (3, "invalid") => style.red(&padded),
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

fn render_history(style: &Style, entries: &[Value], now_ms: i64) -> String {
    let mut output = String::new();
    for entry in entries.iter().rev() {
        let at = entry.get("at").and_then(Value::as_i64).unwrap_or_default();
        let result = value_text(entry, "result");
        let mut meta = vec![relative(at * 1000, now_ms)];
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
        output.push('\n');
    }
    output
}

fn humanize_schedule(schedule: &Value) -> String {
    match schedule.get("mode").and_then(Value::as_str) {
        Some("interval") => {
            let seconds = schedule
                .get("everySecs")
                .and_then(Value::as_i64)
                .unwrap_or_default();
            if seconds > 0 && seconds % 86_400 == 0 {
                format!("every {}d", seconds / 86_400)
            } else {
                format!("every {}h", seconds / 3600)
            }
        }
        Some("calendar") => {
            let at = schedule
                .get("atMinutes")
                .and_then(Value::as_i64)
                .unwrap_or_default();
            let time = format!("{:02}:{:02}", at / 60, at % 60);
            let days = schedule
                .get("days")
                .and_then(Value::as_array)
                .map(|days| days.iter().filter_map(Value::as_str).collect::<Vec<_>>())
                .unwrap_or_default();
            if days.is_empty() {
                format!("daily at {time}")
            } else {
                format!("{} at {time}", days.join(","))
            }
        }
        _ => "—".into(),
    }
}

fn humanize_until(seconds: i64) -> String {
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
    fn newest_history_timestamp_and_message_hex_are_stable() {
        let entries = vec![
            json!({ "at": 10 }),
            json!({ "at": 30 }),
            json!({ "at": 20 }),
        ];
        assert_eq!(newest_history_at(&entries), Some(30));
        assert_eq!(hex_encode("don't"), "646f6e2774");
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
}
