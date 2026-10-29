//! How much a phone hears about each project: everything its notification
//! settings ask for, only what needs the user, or nothing. The phone sends the
//! levels it has set in `notify.projects`, keyed by project name; a project it
//! doesn't name hears everything, and a duplicate hears what its original does.
use serde_json::Value;
use std::collections::BTreeMap;

pub(crate) type ProjectLevels = BTreeMap<String, String>;

/// Only an agent waiting on the user, or an automation run asking a question.
const NEEDS_YOU: &str = "waiting";
const OFF: &str = "off";

/// The levels in a registration's `notify` object. "all" is the default, so only
/// the other two are kept.
pub(super) fn parse(notify: Option<&Value>) -> ProjectLevels {
    notify
        .and_then(|n| n.get("projects"))
        .and_then(Value::as_object)
        .map(|levels| {
            levels
                .iter()
                .filter(|(project, _)| !project.is_empty())
                .filter_map(|(project, level)| {
                    let level = level.as_str()?;
                    matches!(level, NEEDS_YOU | OFF).then(|| (project.clone(), level.to_string()))
                })
                .collect()
        })
        .unwrap_or_default()
}

/// The level for `project`; a duplicate the phone doesn't name follows the
/// project it was made from.
fn level_of<'a>(levels: &'a ProjectLevels, project: &str) -> Option<&'a str> {
    if levels.is_empty() {
        return None;
    }
    levels
        .get(project)
        .or_else(|| crate::config::peek_parent(project).and_then(|parent| levels.get(&parent)))
        .map(String::as_str)
}

/// Whether an alert about `project` may reach a phone with these levels;
/// `needs_you` for an agent waiting on the user or an automation run asking.
pub(super) fn allows(levels: &ProjectLevels, project: &str, needs_you: bool) -> bool {
    match level_of(levels, project) {
        Some(OFF) => false,
        Some(NEEDS_YOU) => needs_you,
        _ => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parse_keeps_only_known_levels() {
        let notify = json!({
            "waiting": true,
            "projects": {
                "storefront": "waiting",
                "blog": "off",
                "api": "all",
                "docs": "loud",
                "": "off",
                "web": 3,
            },
        });
        let levels = parse(Some(&notify));
        assert_eq!(levels.len(), 2);
        assert_eq!(levels["storefront"], "waiting");
        assert_eq!(levels["blog"], "off");
        assert!(parse(None).is_empty());
        assert!(parse(Some(&json!({ "projects": [] }))).is_empty());
    }

    #[test]
    fn alerts_follow_the_project_level() {
        let levels = parse(Some(&json!({
            "projects": { "storefront": "waiting", "blog": "off" },
        })));
        for needs_you in [true, false] {
            assert!(allows(&levels, "api", needs_you), "unnamed hears all");
            assert!(!allows(&levels, "blog", needs_you), "off hears nothing");
        }
        assert!(allows(&levels, "storefront", true));
        assert!(!allows(&levels, "storefront", false));
    }
}
