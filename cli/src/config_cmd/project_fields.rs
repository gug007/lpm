use super::{string_at, validate_keys, validate_string_field, Mapping, Report, Value};

const WORK_STATES: [&str; 4] = ["in_progress", "blocked", "done", "custom"];

// The app turns an id into a directory name under ~/.lpm/claude-accounts; an
// empty id means the main login and stops a duplicate inheriting its parent's.
pub(super) fn validate_claude_account(root: &Mapping, report: &mut Report) {
    if !root.contains_key(Value::String("claudeAccount".into())) {
        return;
    }
    validate_string_field(root, "claudeAccount", "config.claudeAccount", report);
    let Some(id) = string_at(root, "claudeAccount") else {
        return;
    };
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        report.error(
            "config.claudeAccount",
            "expected an account id of letters, digits, '-' or '_'",
        );
    }
}

const MAX_CLAUDE_ACCOUNTS: usize = 3;

// An ordered list the app picks new Claude sessions from; `default` is the
// main login. Ids become directory names, like `claudeAccount`.
pub(super) fn validate_claude_accounts(root: &Mapping, report: &mut Report) {
    let Some(value) = root.get(Value::String("claudeAccounts".into())) else {
        return;
    };
    let path = "config.claudeAccounts";
    let Some(list) = value.as_sequence() else {
        report.error(path, "expected a list of account ids");
        return;
    };
    if list.len() > MAX_CLAUDE_ACCOUNTS {
        report.error(path, format!("expected at most {MAX_CLAUDE_ACCOUNTS} accounts"));
    }
    let mut seen: Vec<&str> = Vec::new();
    for (i, item) in list.iter().enumerate() {
        let item_path = format!("{path}[{i}]");
        let Some(id) = item.as_str() else {
            report.error(&item_path, "expected an account id");
            continue;
        };
        if id.is_empty()
            || !id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        {
            report.error(
                &item_path,
                "expected an account id of letters, digits, '-' or '_'",
            );
        } else if seen.contains(&id) {
            report.error(&item_path, format!("{id:?} is listed twice"));
        }
        seen.push(id);
    }
}

// The project's status badge, written by the app's status menu.
pub(super) fn validate_work_status(root: &Mapping, report: &mut Report) {
    let Some(value) = root.get(Value::String("work_status".into())) else {
        return;
    };
    let path = "config.work_status";
    let Some(map) = value.as_mapping() else {
        report.error(path, "expected a mapping");
        return;
    };
    validate_keys(
        map,
        &["state", "label", "emoji", "note", "since"],
        path,
        report,
    );
    for key in ["state", "label", "emoji", "note"] {
        validate_string_field(map, key, &format!("{path}.{key}"), report);
    }
    match string_at(map, "state") {
        None if !map.contains_key(Value::String("state".into())) => {
            report.error(&format!("{path}.state"), "required");
        }
        Some(state) if !WORK_STATES.contains(&state) => {
            report.error(
                &format!("{path}.state"),
                format!("expected one of: {}", WORK_STATES.join(", ")),
            );
        }
        Some("custom")
            if string_at(map, "label")
                .unwrap_or_default()
                .trim()
                .is_empty() =>
        {
            report.error(&format!("{path}.label"), "a custom status needs a label");
        }
        _ => {}
    }
    if let Some(since) = map.get(Value::String("since".into())) {
        if since.as_u64().is_none() {
            report.error(&format!("{path}.since"), "expected a non-negative integer");
        }
    }
}
