// An action's popup for lpm Link, and its app: the same page and data the
// desktop shows, made here and rendered by the phone. Its commands may take a
// while, so it answers through the out-queue from a worker thread.
use crate::config::popup::View;
use serde_json::{json, Value};
use std::sync::mpsc::SyncSender;

/// The phone may send `actionPopup`, and offers a popup for actions that have one.
pub const FEATURE: &str = "actionPopup";
/// The phone may send `actionApp`, and opens the app of an action that has one.
pub const APP_FEATURE: &str = "actionApp";

pub fn handle(out: &SyncSender<String>, v: &Value, view: View) {
    let out = out.clone();
    let v = v.clone();
    std::thread::spawn(move || {
        let project = v["project"].as_str().unwrap_or_default().to_string();
        let action = v["action"].as_str().unwrap_or_default().to_string();
        let fresh = v["fresh"].as_bool().unwrap_or(false);
        let _ = out.try_send(reply(&project, &action, fresh, view).to_string());
    });
}

fn reply(project: &str, action: &str, fresh: bool, view: View) -> Value {
    let (t, field) = match view {
        View::Popup => ("actionPopup", "popup"),
        View::App => ("actionApp", "app"),
    };
    let mut reply = match crate::popup_content::content(project, action, fresh, view) {
        Ok(mut page) => {
            page.file = None;
            json!({ "ok": true, field: page })
        }
        Err(error) => json!({ "ok": false, "error": error }),
    };
    reply["t"] = json!(t);
    reply["project"] = json!(project);
    reply["action"] = json!(action);
    reply
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_unknown_project_answers_with_an_error_not_a_page() {
        let v = reply("no-such-project-for-popup-test", "no-such-action-for-popup-test", false, View::Popup);
        assert_eq!(v["t"], "actionPopup");
        assert_eq!(v["ok"], false);
        assert!(v.get("popup").is_none());
    }

    #[test]
    fn an_app_answers_under_its_own_name() {
        let v = reply("no-such-project-for-popup-test", "no-such-action-for-popup-test", false, View::App);
        assert_eq!(v["t"], "actionApp");
        assert_eq!(v["ok"], false);
        assert!(v.get("app").is_none());
    }
}
