// Socket verbs `lpm automations show|add|edit|remove` author a job's config
// through: the CLI's counterpart of the phone's saveJob / deleteJob. The CLI
// validates a body before sending it; the scheduler still has the last word on
// the next read, as with every other way a job gets written.
//
//   job_body <source> <id> [project]                 → {ok, yaml}
//   save_job <source> <id> [project] --yaml-hex=HEX  → {ok}
//   delete_job <source> <id> [project] [--delete-copies | --keep-state] → {ok}
//
// `source` is project, repo or global; global needs no project. `--keep-state`
// drops only the entry, for an automation moving to another layer: its runs
// stay with it.
//
// And for a job's runs (`<project> <id>`, or `<id> --no-project`):
//
//   delete_job_history <project> <id> <at> [--thread] [--delete-copies] → {ok}
//   mark_job_seen <project> <id> [at]                → {ok}
//   mark_all_jobs_seen                               → {ok}
//   test_job_check <project> --check-hex=HEX         → {ok, work, output}

use crate::socketsrv::parse_options;
use serde_json::json;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};

struct Target {
    source: String,
    id: String,
    project: String,
}

fn target(args: &[String], verb: &str) -> Result<(Target, HashMap<String, String>), String> {
    let (positional, options) = parse_options(args);
    let usage = || format!("usage: {verb} <project|repo|global> <id> [project]");
    let [source, id, rest @ ..] = positional.as_slice() else {
        return Err(usage());
    };
    let project = rest.first().cloned().unwrap_or_default();
    match source.as_str() {
        "global" => {}
        "project" | "repo" if !project.is_empty() => {}
        _ => return Err(usage()),
    }
    Ok((
        Target {
            source: source.clone(),
            id: id.clone(),
            project,
        },
        options,
    ))
}

/// The job a runtime verb (run_job, stop_job, job_history, ...) acts on:
/// `<project> <id> [rest]`, or `<id> [rest] --no-project` for a global job with
/// no project, whose run state sits under the empty project — shell_split drops
/// an empty `''` argument, so it can't stand in for that project.
pub(crate) struct JobRef<'a> {
    pub project: &'a str,
    pub id: &'a str,
    pub rest: &'a [String],
}

pub(crate) fn job_ref<'a>(
    positional: &'a [String],
    options: &HashMap<String, String>,
) -> Option<JobRef<'a>> {
    match (options.contains_key("no-project"), positional) {
        (true, [id, rest @ ..]) => Some(JobRef {
            project: "",
            id,
            rest,
        }),
        (false, [project, id, rest @ ..]) => Some(JobRef { project, id, rest }),
        _ => None,
    }
}

pub(crate) fn failure(error: impl Into<String>) -> String {
    json!({ "ok": false, "error": error.into() }).to_string()
}

fn finish(app: &AppHandle, project: &str, result: Result<(), String>) -> String {
    match result {
        Ok(()) => {
            let _ = app.emit("job-status", json!({ "project": project }));
            json!({ "ok": true }).to_string()
        }
        Err(error) => failure(error),
    }
}

pub fn cmd_job_body(args: &[String]) -> String {
    let (t, _) = match target(args, "job_body") {
        Ok(parsed) => parsed,
        Err(error) => return failure(error),
    };
    match crate::jobs::read_job_yaml(t.project, t.source, t.id) {
        Ok(yaml) => json!({ "ok": true, "yaml": yaml }).to_string(),
        Err(error) => failure(error),
    }
}

pub fn cmd_save_job(args: &[String], app: &AppHandle) -> String {
    let (t, options) = match target(args, "save_job") {
        Ok(parsed) => parsed,
        Err(error) => return failure(error),
    };
    let Some(yaml) = options.get("yaml") else {
        return failure("save_job needs --yaml-hex");
    };
    let body = match serde_norway::from_str::<serde_norway::Value>(yaml) {
        Ok(body) => body,
        Err(error) => return failure(format!("The automation isn't valid YAML: {error}")),
    };
    let result = crate::jobs::save_job_value(t.source, t.project.clone(), t.id, body, false);
    finish(app, &t.project, result)
}

pub fn cmd_delete_job(args: &[String], app: &AppHandle) -> String {
    let (t, options) = match target(args, "delete_job") {
        Ok(parsed) => parsed,
        Err(error) => return failure(error),
    };
    let project = t.project.clone();
    let result = if options.contains_key("keep-state") {
        crate::jobs::remove_job_value(&t.source, &t.project, &t.id)
    } else {
        let delete_copies = options.contains_key("delete-copies");
        crate::jobs::delete_job_body(app.clone(), t.source, t.project, t.id, delete_copies)
    };
    finish(app, &project, result)
}

/// The job a runs verb names, with the verb's usage when it names none.
fn runs_job<'a>(
    positional: &'a [String],
    options: &HashMap<String, String>,
    usage: &str,
) -> Result<JobRef<'a>, String> {
    job_ref(positional, options).ok_or_else(|| format!("usage: {usage}"))
}

pub fn cmd_delete_job_history(args: &[String], app: &AppHandle) -> String {
    let (positional, options) = parse_options(args);
    let usage = "delete_job_history <project> <job_id> <at> [--thread] [--delete-copies]";
    let result = runs_job(&positional, &options, usage).and_then(|job| {
        let at = job
            .rest
            .first()
            .and_then(|at| at.parse::<u64>().ok())
            .ok_or_else(|| format!("usage: {usage}"))?;
        crate::jobs::delete_job_history(
            app.clone(),
            job.project.to_string(),
            job.id.to_string(),
            at,
            options.contains_key("thread"),
            options.contains_key("delete-copies"),
        )
        .map(|()| job.project)
    });
    match result {
        Ok(project) => finish(app, project, Ok(())),
        Err(error) => failure(error),
    }
}

pub fn cmd_mark_job_seen(args: &[String], app: &AppHandle) -> String {
    let (positional, options) = parse_options(args);
    let result = runs_job(&positional, &options, "mark_job_seen <project> <job_id> [at]").and_then(
        |job| {
            let at = job.rest.first().and_then(|at| at.parse::<u64>().ok());
            crate::jobs::mark_job_seen(app.clone(), job.project.to_string(), job.id.to_string(), at)
        },
    );
    crate::socketsrv::job_result(result)
}

pub fn cmd_mark_all_jobs_seen(app: &AppHandle) -> String {
    crate::socketsrv::job_result(crate::jobs::mark_all_jobs_seen(app.clone()))
}

pub fn cmd_test_job_check(args: &[String]) -> String {
    let (positional, options) = parse_options(args);
    let (Some(project), Some(check)) = (positional.first(), options.get("check")) else {
        return failure("usage: test_job_check <project> --check-hex=HEX");
    };
    match crate::jobs::test_job_check(project.clone(), check.clone()) {
        Ok(outcome) => {
            let mut reply = outcome;
            reply["ok"] = json!(true);
            reply.to_string()
        }
        Err(error) => failure(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(line: &[&str]) -> Vec<String> {
        line.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn a_project_layer_needs_a_project_and_global_does_not() {
        assert!(target(&args(&["global", "nightly"]), "job_body").is_ok());
        assert!(target(&args(&["project", "nightly", "web"]), "job_body").is_ok());
        assert!(target(&args(&["project", "nightly"]), "job_body").is_err());
        assert!(target(&args(&["template", "nightly", "web"]), "job_body").is_err());
        assert!(target(&args(&["global"]), "job_body").is_err());
    }

    #[test]
    fn a_job_with_no_project_is_named_by_its_id_alone() {
        let (positional, options) = parse_options(&args(&["nightly", "true", "--no-project"]));
        let job = job_ref(&positional, &options).unwrap();
        assert_eq!(
            (job.project, job.id, job.rest),
            ("", "nightly", &args(&["true"])[..])
        );

        let (positional, options) = parse_options(&args(&["web", "nightly", "true"]));
        let job = job_ref(&positional, &options).unwrap();
        assert_eq!(
            (job.project, job.id, job.rest),
            ("web", "nightly", &args(&["true"])[..])
        );

        let (positional, options) = parse_options(&args(&["nightly"]));
        assert!(job_ref(&positional, &options).is_none());
    }
}
