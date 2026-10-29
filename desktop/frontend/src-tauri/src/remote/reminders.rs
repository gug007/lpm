//! Limit reminders (limit_reminders.rs) on the phone: reading and setting them
//! from its Usage screen, the list kept in step on every phone as it changes,
//! and the notification a reminder sends when its limit resets. A tap on it
//! opens the phone's Usage screen.
use super::{broadcast, has_clients, mac_alert, RemoteHub};
use crate::limit_reminders::{self, LimitReminder};
use serde_json::{json, Value};
use tauri::{AppHandle, Listener, Manager};

/// The phone may send `limitReminders`, `setLimitReminder` and
/// `clearLimitReminder`.
pub(super) const FEATURE: &str = "limitReminders";

fn frame(items: &[LimitReminder]) -> Value {
    json!({ "t": "limitReminders", "reminders": items })
}

/// The reply to one of the three verbs: the whole list, and the error when a
/// change was refused.
pub(super) fn handle(app: &AppHandle, t: &str, v: &Value) -> Value {
    let field = |k: &str| v.get(k).and_then(Value::as_str).unwrap_or_default();
    let result = match t {
        "setLimitReminder" => limit_reminders::set(
            app,
            field("limit"),
            field("window"),
            v.get("resetsAt").and_then(Value::as_i64).unwrap_or(0),
            field("name"),
        ),
        "clearLimitReminder" => limit_reminders::clear(app, field("limit"), field("window")),
        _ => Ok(limit_reminders::list()),
    };
    let (items, error) = match result {
        Ok(items) => (items, None),
        Err(error) => (limit_reminders::list(), Some(error)),
    };
    let mut reply = frame(&items);
    reply["ok"] = json!(error.is_none());
    if let Some(error) = error {
        reply["error"] = json!(error);
    }
    reply
}

/// Every phone with the app open hears each change, whichever screen made it.
pub(super) fn install(hub: &RemoteHub, app: &AppHandle) {
    let h = hub.clone();
    app.listen(limit_reminders::CHANGED_EVENT, move |e| {
        if !has_clients(&h) {
            return;
        }
        let items: Vec<LimitReminder> = serde_json::from_str(e.payload()).unwrap_or_default();
        broadcast(&h, frame(&items));
    });
}

fn alert_payload(server_id: &str, reminder: &LimitReminder, title: &str, body: &str, ts: i64) -> String {
    json!({
        "serverId": server_id,
        "target": "usage",
        "title": title,
        "body": body,
        "ts": ts,
        "key": key(reminder),
    })
    .to_string()
}

fn key(reminder: &LimitReminder) -> String {
    format!("reminder:{}/{}", reminder.limit, reminder.window)
}

/// The notification for a reminder that fired, to every phone with notifications
/// on that isn't showing the app right now.
pub(crate) fn push_limit_reminder(app: &AppHandle, reminder: &LimitReminder, title: &str, body: &str) {
    let Some(hub) = app.try_state::<RemoteHub>() else {
        return;
    };
    mac_alert::send(
        hub.inner(),
        &key(reminder),
        |_| true,
        |server_id, ts| alert_payload(server_id, reminder, title, body, ts),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_alert_opens_usage() {
        let reminder = LimitReminder {
            limit: "claude:work".into(),
            window: "fiveHour".into(),
            resets_at: 10,
            name: "Work".into(),
        };
        let payload: Value =
            serde_json::from_str(&alert_payload("srv", &reminder, "Work", "Reset.", 5)).unwrap();
        assert_eq!(payload["target"], "usage");
        assert_eq!(payload["serverId"], "srv");
        assert_eq!(payload["title"], "Work");
        assert_eq!(payload["body"], "Reset.");
        assert_eq!(payload["key"], "reminder:claude:work/fiveHour");
    }

    #[test]
    fn the_list_frame_names_its_fields() {
        let items = vec![LimitReminder {
            limit: "codex".into(),
            window: "weekly".into(),
            resets_at: 99,
            name: "Codex".into(),
        }];
        let f = frame(&items);
        assert_eq!(f["t"], "limitReminders");
        assert_eq!(f["reminders"][0]["resetsAt"], 99);
        assert_eq!(f["reminders"][0]["window"], "weekly");
    }
}
