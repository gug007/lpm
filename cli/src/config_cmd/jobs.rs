use super::{
    string_at, string_keys, validate_bool_field, validate_choice, validate_keys,
    validate_string_field, ConfigKind, Mapping, Report, Value,
};

// Mirrors the app's job rules (jobs.rs, jobcal.rs). Whether `run.action`
// exists, and whether a cron line keeps runs 5 minutes apart, depend on more
// than this file: `lpm automations list` shows those as invalid rows.

const JOB_FIELDS: [&str; 12] = [
    "label",
    "emoji",
    "schedule",
    "check",
    "verify",
    "onAnswer",
    "duplicate",
    "run",
    "enabled",
    "projects",
    "sendTo",
    "machines",
];
const RUN_FIELDS: [&str; 10] = [
    "action",
    "cmd",
    "prompt",
    "agent",
    "model",
    "effort",
    "access",
    "quiet",
    "memory",
    "claudeAccount",
];
const DUPLICATE_FIELDS: [&str; 4] = ["mode", "pullLatest", "reinstallDeps", "excludeUncommitted"];
const AGENTS: [&str; 4] = ["claude", "codex", "gemini", "opencode"];
const SEND_TO_SERVICES: [&str; 1] = ["telegram"];

#[path = "job_schedule.rs"]
mod schedule;

/// One automation checked on its own, for `lpm automations add|edit`. Paths in
/// the messages are relative to the entry (`schedule.every: ...`).
pub(crate) fn validate_entry(
    id: &str,
    body: &Value,
    source: &str,
    is_remote: bool,
) -> (Vec<String>, Vec<String>) {
    let kind = match source {
        "global" => ConfigKind::Global,
        "repo" => ConfigKind::Repo,
        _ => ConfigKind::Project,
    };
    let mut jobs = Mapping::new();
    jobs.insert(Value::String(id.into()), body.clone());
    let mut root = Mapping::new();
    root.insert(Value::String("jobs".into()), Value::Mapping(jobs));
    let mut report = Report::new();
    validate_jobs(&root, kind, is_remote, &mut report);
    let prefix = format!("config.jobs.{id}.");
    let relative = |message: String| match message.strip_prefix(&prefix) {
        Some(rest) => rest.to_string(),
        None => message,
    };
    (
        report.errors.into_iter().map(relative).collect(),
        report.warnings.into_iter().map(relative).collect(),
    )
}

pub(super) fn validate_jobs(
    root: &Mapping,
    kind: ConfigKind,
    is_remote: bool,
    report: &mut Report,
) {
    let Some(value) = root.get(Value::String("jobs".into())) else {
        return;
    };
    let Some(jobs) = value.as_mapping() else {
        report.error("config.jobs", "expected a mapping");
        return;
    };
    if is_remote && !jobs.is_empty() {
        report.error("config.jobs", "automations don't run on SSH projects");
    }
    string_keys(jobs, "config.jobs", report);
    for (key, value) in jobs {
        let Some(id) = key.as_str() else {
            continue;
        };
        let path = format!("config.jobs.{id}");
        if id.trim().is_empty() {
            report.error(&path, "automation ids can't be empty");
            continue;
        }
        let Some(map) = value.as_mapping() else {
            report.error(&path, "expected a mapping");
            continue;
        };
        validate_job(map, kind, &path, report);
    }
}

fn validate_job(map: &Mapping, kind: ConfigKind, path: &str, report: &mut Report) {
    validate_keys(map, &JOB_FIELDS, path, report);
    for key in ["label", "emoji", "check", "verify", "onAnswer"] {
        validate_string_field(map, key, &format!("{path}.{key}"), report);
    }
    validate_bool_field(map, "enabled", path, report);
    match map.get(Value::String("schedule".into())) {
        None => report.error(
            &format!("{path}.schedule"),
            "an automation needs a schedule",
        ),
        Some(value) => match value.as_mapping() {
            Some(schedule) => {
                schedule::validate_schedule(schedule, &format!("{path}.schedule"), report)
            }
            None => report.error(&format!("{path}.schedule"), "expected a mapping"),
        },
    }
    match map.get(Value::String("run".into())) {
        None => report.error(
            &format!("{path}.run"),
            "an automation needs something to run",
        ),
        Some(value) => match value.as_mapping() {
            Some(run) => {
                validate_run(run, &format!("{path}.run"), report);
                let verify = string_at(map, "verify").unwrap_or("").trim();
                if !verify.is_empty() && !text_at(run, "action").is_empty() {
                    report.error(
                        &format!("{path}.verify"),
                        "a check after the run isn't available for actions",
                    );
                }
            }
            None => report.error(&format!("{path}.run"), "expected a mapping"),
        },
    }
    if let Some(value) = map.get(Value::String("duplicate".into())) {
        validate_duplicate(value, &format!("{path}.duplicate"), report);
    }
    if let Some(value) = map.get(Value::String("sendTo".into())) {
        validate_send_to(value, &format!("{path}.sendTo"), report);
    }
    if let Some(value) = map.get(Value::String("machines".into())) {
        let names = match value {
            Value::Sequence(list) => list.iter().all(|v| v.as_str().is_some()),
            other => other.as_str().is_some(),
        };
        if !names {
            report.error(&format!("{path}.machines"), "expected a list of computers");
        }
    }
    if let Some(value) = map.get(Value::String("projects".into())) {
        let field = format!("{path}.projects");
        if !value
            .as_sequence()
            .is_some_and(|list| list.iter().all(|v| v.as_str().is_some()))
        {
            report.error(&field, "expected a list of project names");
        } else if kind != ConfigKind::Global {
            report.warning(
                &field,
                "ignored outside global.yml; this automation runs only in its own project",
            );
        }
    }
}

fn validate_run(map: &Mapping, path: &str, report: &mut Report) {
    validate_keys(map, &RUN_FIELDS, path, report);
    for key in [
        "action",
        "cmd",
        "prompt",
        "agent",
        "model",
        "effort",
        "access",
        "claudeAccount",
    ] {
        validate_string_field(map, key, &format!("{path}.{key}"), report);
    }
    validate_bool_field(map, "quiet", path, report);
    validate_bool_field(map, "memory", path, report);
    let (action, cmd, prompt) = (
        text_at(map, "action"),
        text_at(map, "cmd"),
        text_at(map, "prompt"),
    );
    // A prompt can ride along with an action that opens an agent terminal.
    let count = [
        !action.is_empty(),
        !cmd.is_empty(),
        !prompt.is_empty() && action.is_empty(),
    ]
    .iter()
    .filter(|set| **set)
    .count();
    if count == 0 {
        report.error(path, "set one of action, cmd or prompt");
        return;
    }
    if count > 1 {
        report.error(path, "set only one of action, cmd or prompt");
        return;
    }
    for key in ["quiet", "memory"] {
        let on = map.get(Value::String(key.into())).and_then(Value::as_bool) == Some(true);
        if on && prompt.is_empty() {
            report.error(
                &format!("{path}.{key}"),
                format!("{key} only goes with an AI prompt"),
            );
        }
    }
    validate_claude_account(map, path, action.is_empty() && cmd.is_empty(), report);
    let agent = text_at(map, "agent").to_lowercase();
    if !agent.is_empty() && !AGENTS.contains(&agent.as_str()) {
        report.error(
            &format!("{path}.agent"),
            format!("expected one of: {}", AGENTS.join(", ")),
        );
    }
    validate_choice(map, "access", &["full", "read"], path, report);
    if agent == "opencode" && text_at(map, "access").eq_ignore_ascii_case("read") {
        report.error(
            &format!("{path}.access"),
            "opencode always runs with full access; pick another agent for read-only",
        );
    }
    let memory = map.get(Value::String("memory".into())).and_then(Value::as_bool) == Some(true);
    if memory && text_at(map, "access").eq_ignore_ascii_case("read") {
        report.warning(
            &format!("{path}.memory"),
            "a read-only run can't save its memory, so each run starts fresh",
        );
    }
}

// The account its runs use, as a project's `claudeAccount`: `''` (or
// `default`) is the main login.
fn validate_claude_account(map: &Mapping, path: &str, prompt: bool, report: &mut Report) {
    if !map.contains_key(Value::String("claudeAccount".into())) {
        return;
    }
    let field = format!("{path}.claudeAccount");
    if !prompt {
        report.error(&field, "claudeAccount only goes with an AI prompt");
        return;
    }
    let id = text_at(map, "claudeAccount");
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        report.error(
            &field,
            "expected an account id of letters, digits, '-' or '_'",
        );
    }
}

fn validate_duplicate(value: &Value, path: &str, report: &mut Report) {
    if value.as_bool().is_some() {
        return;
    }
    let Some(map) = value.as_mapping() else {
        report.error(path, "expected true, false or a mapping");
        return;
    };
    validate_keys(map, &DUPLICATE_FIELDS, path, report);
    validate_choice(map, "mode", &["copy", "worktree"], path, report);
    for key in ["pullLatest", "reinstallDeps", "excludeUncommitted"] {
        validate_bool_field(map, key, path, report);
    }
}

fn validate_send_to(value: &Value, path: &str, report: &mut Report) {
    let ids: Vec<&Value> = match value {
        Value::Sequence(list) => list.iter().collect(),
        other => vec![other],
    };
    if ids.is_empty() {
        report.error(path, "choose at least one destination");
    }
    for id in ids {
        let known = id.as_str().is_some_and(|id| {
            let id = id.trim().to_lowercase();
            match id.split_once(':') {
                None => id == "lpm" || SEND_TO_SERVICES.contains(&id.as_str()),
                Some((service, target)) => {
                    SEND_TO_SERVICES.contains(&service) && !target.is_empty()
                }
            }
        });
        if !known {
            report.error(path, "expected lpm, telegram or telegram:<target>");
        }
    }
}

fn text_at<'a>(map: &'a Mapping, key: &str) -> &'a str {
    string_at(map, key).unwrap_or("").trim()
}

#[cfg(test)]
#[path = "jobs_tests.rs"]
mod tests;
