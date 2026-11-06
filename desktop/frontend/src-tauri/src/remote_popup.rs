// An action's popup for lpm Link: the same page and data the desktop card
// shows, made here and rendered by the phone. Its commands may take a while,
// so it answers through the out-queue from a worker thread.
use serde_json::{json, Value};
use std::sync::mpsc::SyncSender;

/// The phone may send `actionPopup`, and offers a popup for actions that have one.
pub const FEATURE: &str = "actionPopup";

pub fn handle(out: &SyncSender<String>, v: &Value) {
    let out = out.clone();
    let v = v.clone();
    std::thread::spawn(move || {
        let project = v["project"].as_str().unwrap_or_default().to_string();
        let action = v["action"].as_str().unwrap_or_default().to_string();
        let fresh = v["fresh"].as_bool().unwrap_or(false);
        let _ = out.try_send(reply(&project, &action, fresh).to_string());
    });
}

fn reply(project: &str, action: &str, fresh: bool) -> Value {
    let mut reply = match crate::popup_content::content(project, action, fresh) {
        Ok(mut popup) => {
            popup.file = None;
            json!({ "ok": true, "popup": popup })
        }
        Err(error) => json!({ "ok": false, "error": error }),
    };
    reply["t"] = json!("actionPopup");
    reply["project"] = json!(project);
    reply["action"] = json!(action);
    reply
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_unknown_project_answers_with_an_error_not_a_page() {
        let v = reply("no-such-project-for-popup-test", "no-such-action-for-popup-test", false);
        assert_eq!(v["t"], "actionPopup");
        assert_eq!(v["ok"], false);
        assert!(v.get("popup").is_none());
    }
}
