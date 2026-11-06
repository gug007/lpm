// `lpm rename` and `lpm work-status`, over the socket. An agent names a project
// and sets its status through the same commands the sidebar's menus use, so
// open windows, phones and paired computers hear about it the same way.
//
//   rename_project <project> --label=NAME     (empty goes back to its own name)
//   set_project_status <project> --status=NAME [--note=X] [--emoji=X]
//   set_project_status <project> --clear
use crate::commands_real::{set_project_label, set_work_status, WorkStatusPatch};
use crate::config::{self, WORK_STATES, WORK_STATE_CUSTOM};
use crate::socketsrv::{parse_options, reply};
use serde_json::Value;
use tauri::AppHandle;

const USAGE: &str = "ERROR: usage: set_project_status <project> --status=NAME [--note=X] [--emoji=X] | --clear";

pub fn cmd_rename_project(args: &[String], app: &AppHandle) -> String {
    let (positional, options) = parse_options(args);
    let (Some(project), Some(label)) = (positional.first(), options.get("label")) else {
        return "ERROR: usage: rename_project <project> --label=NAME".into();
    };
    reply(set_project_label(app.clone(), project.clone(), label.clone()))
}

fn folded(name: &str) -> String {
    name.trim().to_lowercase().replace(['_', '-'], " ")
}

/// What the word names: a state, a status the app's menu lists, or a new one.
fn status_patch(
    status: &str,
    emoji: Option<&str>,
    note: Option<&str>,
    palette: &Value,
) -> WorkStatusPatch {
    let name = folded(status);
    let note = note.map(str::to_string);
    let state = WORK_STATES
        .iter()
        .find(|state| **state != WORK_STATE_CUSTOM && folded(state) == name);
    if let Some(state) = state {
        return WorkStatusPatch {
            state: state.to_string(),
            label: None,
            emoji: None,
            note,
        };
    }
    let listed = palette["custom"].as_array().and_then(|entries| {
        entries
            .iter()
            .find(|e| e["label"].as_str().is_some_and(|l| folded(l) == name))
    });
    let label = listed.and_then(|e| e["label"].as_str()).unwrap_or(status.trim());
    WorkStatusPatch {
        state: WORK_STATE_CUSTOM.to_string(),
        label: Some(label.to_string()),
        emoji: emoji
            .or(listed.and_then(|e| e["emoji"].as_str()))
            .map(str::to_string),
        note,
    }
}

pub fn cmd_set_project_status(args: &[String], app: &AppHandle) -> String {
    let (positional, options) = parse_options(args);
    let Some(project) = positional.first() else {
        return USAGE.into();
    };
    if options.contains_key("clear") {
        return reply(set_work_status(app.clone(), project.clone(), None));
    }
    let Some(status) = options.get("status").filter(|s| !s.trim().is_empty()) else {
        return USAGE.into();
    };
    let patch = status_patch(
        status,
        options.get("emoji").map(String::as_str),
        options.get("note").map(String::as_str),
        &config::load_work_statuses(),
    );
    reply(set_work_status(app.clone(), project.clone(), Some(patch)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn palette() -> Value {
        json!({ "custom": [
            { "label": "Review", "emoji": "👀" },
            { "label": "Needs decision", "emoji": "❓" },
            { "label": "QA", "emoji": "🧪" },
        ] })
    }

    fn patch(status: &str) -> WorkStatusPatch {
        status_patch(status, None, None, &palette())
    }

    fn custom(label: &str, emoji: Option<&str>, note: Option<&str>) -> WorkStatusPatch {
        WorkStatusPatch {
            state: "custom".into(),
            label: Some(label.into()),
            emoji: emoji.map(str::to_string),
            note: note.map(str::to_string),
        }
    }

    #[test]
    fn a_state_is_named_however_it_is_written() {
        for word in ["in_progress", "In progress", "in-progress", " IN PROGRESS "] {
            assert_eq!(patch(word).state, "in_progress", "{word}");
        }
        assert_eq!(patch("Blocked").state, "blocked");
        assert_eq!(patch("done").state, "done");
    }

    #[test]
    fn a_status_the_menu_lists_keeps_its_own_name_and_emoji() {
        assert_eq!(patch("needs_decision"), custom("Needs decision", Some("❓"), None));
        assert_eq!(patch("review"), custom("Review", Some("👀"), None));
        assert_eq!(patch("qa").label.as_deref(), Some("QA"));
    }

    #[test]
    fn anything_else_is_a_new_status_with_the_emoji_it_was_given() {
        assert_eq!(
            status_patch(" Shipping ", Some("🚢"), Some("PR 12"), &palette()),
            custom("Shipping", Some("🚢"), Some("PR 12"))
        );
        assert_eq!(patch("custom"), custom("custom", None, None));
    }
}
