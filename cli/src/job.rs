//! `lpm job list [-p project]` / `lpm job run <job-id> [-p project]` — inspect and
//! fire a project's scheduled jobs via the running app. Jobs live in the app's
//! `~/.lpm/jobs-state.json`; the CLI only asks the app over the status socket, so
//! the app stays the single owner of the scheduler.

use crate::config::Ctx;
use crate::control;
use crate::error::{resolve_or_infer, RunError};
use crate::statussock::{self, quote_arg};
use crate::style::Style;
use crate::util::now_millis;
use clap::Subcommand;
use serde_json::Value;
use std::io::IsTerminal;

#[derive(Subcommand)]
pub enum Command {
    /// List a project's scheduled jobs: schedule, enabled state, last result, next run.
    List {
        /// Project to read from; omit to infer from the environment / cwd.
        #[arg(long, short = 'p')]
        project: Option<String>,
    },
    /// Run one job now (same as the app's "run now"), regardless of its schedule.
    Run {
        /// Job id, as shown by `lpm job list`.
        job_id: String,
        /// Project the job belongs to; omit to infer from the environment / cwd.
        #[arg(long, short = 'p')]
        project: Option<String>,
    },
}

pub fn run(ctx: &Ctx, command: Command) -> Result<(), RunError> {
    match command {
        Command::List { project } => list(ctx, project.as_deref()),
        Command::Run { job_id, project } => run_job(ctx, &job_id, project.as_deref()),
    }
}

fn list(ctx: &Ctx, project: Option<&str>) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let file_name = resolve_or_infer(ctx, project)?;
    let reply = statussock::request(&ctx.socket_path(), &format!("list_jobs {}", quote_arg(&file_name)))
        .map_err(RunError::Internal)?;
    if let Some(rest) = reply.strip_prefix("ERROR:") {
        return Err(RunError::Internal(rest.trim().to_string()));
    }
    let jobs: Vec<Value> = serde_json::from_str(&reply)
        .map_err(|e| RunError::Internal(format!("unexpected reply from app: {e}: {reply}")))?;

    if jobs.is_empty() {
        println!("no scheduled jobs in {file_name}");
        return Ok(());
    }
    let style = Style {
        on: std::io::stdout().is_terminal(),
    };
    print!("{}", render_table(&style, &jobs, now_millis() / 1000));
    Ok(())
}

fn run_job(ctx: &Ctx, job_id: &str, project: Option<&str>) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let file_name = resolve_or_infer(ctx, project)?;
    let line = format!("run_job {} {}", quote_arg(&file_name), quote_arg(job_id));
    let reply = statussock::request(&ctx.socket_path(), &line).map_err(RunError::Internal)?;
    let parsed: Value = serde_json::from_str(&reply)
        .map_err(|e| RunError::Internal(format!("unexpected reply from app: {e}: {reply}")))?;
    if parsed.get("ok").and_then(Value::as_bool).unwrap_or(false) {
        println!("running job {job_id} in {file_name}");
        eprintln!("note: fire-and-forget — watch it with `lpm job list` / `lpm status`");
        Ok(())
    } else {
        let msg = parsed
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("couldn't run the job");
        Err(RunError::Internal(msg.to_string()))
    }
}

/// Render the job rows as a padded table. Widths are measured on the plain text
/// and color is applied after padding, so ANSI codes never break the columns.
fn render_table(s: &Style, jobs: &[Value], now_secs: i64) -> String {
    let rows: Vec<[String; 5]> = jobs
        .iter()
        .map(|j| {
            let id = j.get("id").and_then(Value::as_str).unwrap_or("").to_string();
            if !j.get("valid").and_then(Value::as_bool).unwrap_or(false) {
                let err = j.get("error").and_then(Value::as_str).unwrap_or("invalid");
                return [id, format!("(invalid: {err})"), String::new(), String::new(), String::new()];
            }
            let schedule = humanize_schedule(j.get("schedule").unwrap_or(&Value::Null));
            let enabled = if j.get("enabled").and_then(Value::as_bool).unwrap_or(false) {
                "on".to_string()
            } else {
                "off".to_string()
            };
            let last = j.get("lastResult").and_then(Value::as_str).unwrap_or("—").to_string();
            let next = j
                .get("nextFireAt")
                .and_then(Value::as_i64)
                .map(|t| humanize_until(t - now_secs))
                .unwrap_or_else(|| "—".to_string());
            [id, schedule, enabled, last, next]
        })
        .collect();

    let headers = ["ID", "SCHEDULE", "ENABLED", "LAST", "NEXT"];
    let mut widths = headers.map(str::len);
    for r in &rows {
        for (i, cell) in r.iter().enumerate() {
            widths[i] = widths[i].max(cell.len());
        }
    }

    let mut o = String::new();
    let header: Vec<String> = headers
        .iter()
        .enumerate()
        .map(|(i, h)| format!("{:<width$}", h, width = widths[i]))
        .collect();
    o.push_str(&format!("{}\n", s.bold(&header.join("  "))));
    for r in &rows {
        let padded: Vec<String> = r
            .iter()
            .enumerate()
            .map(|(i, cell)| {
                let text = format!("{:<width$}", cell, width = widths[i]);
                match i {
                    0 => s.bold(&text),
                    2 => enabled_cell(s, cell, &text),
                    _ => s.dim(&text),
                }
            })
            .collect();
        o.push_str(&format!("{}\n", padded.join("  ")));
    }
    o
}

fn enabled_cell(s: &Style, value: &str, padded: &str) -> String {
    match value {
        "on" => s.green(padded),
        "off" => s.dim(padded),
        _ => padded.to_string(),
    }
}

fn humanize_schedule(sched: &Value) -> String {
    match sched.get("mode").and_then(Value::as_str) {
        Some("interval") => {
            let secs = sched.get("everySecs").and_then(Value::as_i64).unwrap_or(0);
            if secs > 0 && secs % 86_400 == 0 {
                format!("every {}d", secs / 86_400)
            } else {
                format!("every {}h", secs / 3600)
            }
        }
        Some("calendar") => {
            let at = sched.get("atMinutes").and_then(Value::as_i64).unwrap_or(0);
            let time = format!("{:02}:{:02}", at / 60, at % 60);
            let days: Vec<&str> = sched
                .get("days")
                .and_then(Value::as_array)
                .map(|a| a.iter().filter_map(Value::as_str).collect())
                .unwrap_or_default();
            if days.is_empty() {
                format!("daily at {time}")
            } else {
                format!("{} at {time}", days.join(","))
            }
        }
        _ => "—".to_string(),
    }
}

/// Plain-words countdown to the next fire, from a signed seconds delta.
fn humanize_until(secs_from_now: i64) -> String {
    if secs_from_now <= 0 {
        return "due".to_string();
    }
    let (n, unit) = if secs_from_now < 3600 {
        ((secs_from_now / 60).max(1), "m")
    } else if secs_from_now < 86_400 {
        (secs_from_now / 3600, "h")
    } else {
        (secs_from_now / 86_400, "d")
    };
    format!("in {n}{unit}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn schedule_words_cover_interval_and_calendar() {
        assert_eq!(
            humanize_schedule(&json!({ "mode": "interval", "everySecs": 6 * 3600 })),
            "every 6h"
        );
        assert_eq!(
            humanize_schedule(&json!({ "mode": "interval", "everySecs": 2 * 86_400 })),
            "every 2d"
        );
        assert_eq!(
            humanize_schedule(&json!({ "mode": "calendar", "atMinutes": 540, "days": [] })),
            "daily at 09:00"
        );
        assert_eq!(
            humanize_schedule(&json!({ "mode": "calendar", "atMinutes": 450, "days": ["mon", "thu"] })),
            "mon,thu at 07:30"
        );
    }

    #[test]
    fn until_buckets_and_due() {
        assert_eq!(humanize_until(-5), "due");
        assert_eq!(humanize_until(0), "due");
        assert_eq!(humanize_until(90), "in 1m");
        assert_eq!(humanize_until(3 * 3600), "in 3h");
        assert_eq!(humanize_until(2 * 86_400), "in 2d");
    }

    #[test]
    fn table_aligns_and_marks_invalid() {
        let s = Style { on: false };
        let jobs = vec![
            json!({
                "id": "dep-updates", "valid": true, "enabled": true,
                "schedule": { "mode": "interval", "everySecs": 6 * 3600 },
                "lastResult": "found-work", "nextFireAt": 1000 + 3600,
            }),
            json!({ "id": "broken", "valid": false, "error": "Give this job a schedule." }),
        ];
        let out = render_table(&s, &jobs, 1000);
        assert!(out.contains("ID"));
        assert!(out.contains("dep-updates"));
        assert!(out.contains("every 6h"));
        assert!(out.contains("in 1h"));
        assert!(out.contains("(invalid: Give this job a schedule.)"));
    }
}
