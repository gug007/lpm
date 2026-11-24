use super::{text_at, validate_choice, Mapping, Report, Value};

pub(super) const EVENT_FIELDS: [&str; 5] = ["on", "branches", "services", "from", "atMost"];
const EVENTS: [&str; 5] = ["ciFailed", "serviceCrashed", "agentFinished", "prReviewed", "prOpened"];
const CLOCK_FIELDS: [&str; 9] = [
    "at",
    "until",
    "times",
    "days",
    "shortMonths",
    "pickDays",
    "every",
    "manual",
    "cron",
];
const FILTERS: [(&str, &[&str]); 3] = [
    ("branches", &["ciFailed", "prReviewed", "prOpened"]),
    ("services", &["serviceCrashed"]),
    ("from", &["agentFinished"]),
];

fn has(map: &Mapping, key: &str) -> bool {
    map.contains_key(Value::String(key.into()))
}

/// Checks an event's keys; false when the schedule isn't an event's, which
/// leaves it to the clock's checks.
pub(super) fn validate_event(map: &Mapping, path: &str, report: &mut Report) -> bool {
    if !has(map, "on") {
        for key in ["branches", "services", "from", "atMost"] {
            if has(map, key) {
                report.error(&format!("{path}.{key}"), "goes with on");
            }
        }
        return false;
    }
    let on = text_at(map, "on");
    if !EVENTS.contains(&on) {
        report.error(
            &format!("{path}.on"),
            format!("expected one of: {}", EVENTS.join(", ")),
        );
    }
    if CLOCK_FIELDS.iter().any(|key| has(map, key)) {
        report.error(path, "an event replaces at, every, days, cron and manual; drop them");
    }
    for (key, events) in FILTERS {
        let Some(value) = map.get(Value::String(key.into())) else {
            continue;
        };
        let names = match value {
            Value::Sequence(list) => list.iter().all(|v| v.as_str().is_some()),
            other => other.as_str().is_some(),
        };
        if !events.contains(&on) {
            report.error(
                &format!("{path}.{key}"),
                format!("goes with on: {}", events.join(", ")),
            );
        } else if !names {
            report.error(&format!("{path}.{key}"), "expected a name or a list of names");
        }
    }
    validate_choice(map, "atMost", &["commit", "day"], path, report);
    true
}

/// An action's agent reports its own finish, which would start the
/// automation again.
pub(super) fn starts_itself(schedule: &Mapping, run: &Mapping) -> bool {
    text_at(schedule, "on") == "agentFinished" && !text_at(run, "action").is_empty()
}
