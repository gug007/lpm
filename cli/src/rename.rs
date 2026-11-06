//! `lpm rename` and `lpm work-status`: what a person does from a project's menu,
//! for an agent that has just picked up a ticket. Both go through the running
//! app, which keeps the rules and tells every window and phone.

use crate::config::Ctx;
use crate::control;
use crate::error::{resolve_run_target, RunError};
use crate::statussock::{checked_arg, text_opt};
use crate::util::print_json;
use serde_json::json;

fn project_arg(name: &str) -> Result<String, RunError> {
    checked_arg("project name", name).map_err(RunError::NotFound)
}

pub fn run_rename(
    ctx: &Ctx,
    name: Option<&str>,
    project: Option<&str>,
    as_json: bool,
) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let file_name = resolve_run_target(ctx, project)?;
    let label = name.unwrap_or_default();
    control::send_command(
        ctx,
        &format!(
            "rename_project {}{}",
            project_arg(&file_name)?,
            text_opt("label", label)
        ),
    )?;
    if as_json {
        print_json(&json!({ "ok": true, "project": file_name, "label": label }));
    } else if label.is_empty() {
        println!("{file_name} shows its own name again");
    } else {
        println!("renamed {file_name} to {label}");
    }
    Ok(())
}

pub struct StatusChange<'a> {
    pub status: Option<&'a str>,
    pub note: Option<&'a str>,
    pub emoji: Option<&'a str>,
}

fn status_line(project: &str, change: &StatusChange) -> Result<String, RunError> {
    let mut line = format!("set_project_status {}", project_arg(project)?);
    let Some(status) = change.status else {
        line.push_str(" --clear");
        return Ok(line);
    };
    line.push_str(&text_opt("status", status));
    if let Some(note) = change.note {
        line.push_str(&text_opt("note", note));
    }
    if let Some(emoji) = change.emoji {
        line.push_str(&text_opt("emoji", emoji));
    }
    Ok(line)
}

pub fn run_status(
    ctx: &Ctx,
    change: StatusChange,
    project: Option<&str>,
    as_json: bool,
) -> Result<(), RunError> {
    control::require_app(ctx)?;
    let file_name = resolve_run_target(ctx, project)?;
    control::send_command(ctx, &status_line(&file_name, &change)?)?;
    if as_json {
        print_json(&json!({ "ok": true, "project": file_name, "status": change.status }));
    } else if let Some(status) = change.status {
        println!("set {file_name} to {status}");
    } else {
        println!("cleared the status on {file_name}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_status_line_carries_what_it_was_given() {
        let line = status_line(
            "app-x1",
            &StatusChange {
                status: Some("Review"),
                note: Some("PR 12"),
                emoji: None,
            },
        )
        .unwrap();
        assert!(line.starts_with("set_project_status 'app-x1' --status='Review' --status-hex="));
        assert!(line.contains(" --note='PR 12' --note-hex="));
        assert!(!line.contains("--emoji"));
    }

    #[test]
    fn no_status_clears_it() {
        let clear = StatusChange {
            status: None,
            note: None,
            emoji: None,
        };
        assert_eq!(
            status_line("app", &clear).unwrap(),
            "set_project_status 'app' --clear"
        );
    }
}
