//! A paused agent on the phones (pausedturn.rs): the notice that it is still
//! paused, and Mark as finished sent back from the phone.
use super::{alert_payload, mac_alert, PushJob, RemoteHub};
use crate::sound::StatusSound;
use crate::status::STATUS_DONE;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

/// The phone may send `finishPaused`.
pub const FEATURE: &str = "finishPaused";

/// `finishPaused`: the phone marked paused agents finished. No reply — the
/// finish's own `status-changed` refreshes every screen.
pub(super) fn handle(app: &AppHandle, v: &Value) {
    let project = v.get("project").and_then(Value::as_str).unwrap_or_default();
    let keys = v
        .get("keys")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_string)
        .collect();
    crate::pausedturn::finish_paused_agent(app.clone(), project.to_string(), keys);
}

/// Tell the phones that want to hear an agent finish that the one behind
/// `key` is still paused, as `news` words it. It shares the agent's collapse
/// id, so its finish, when it comes, takes the notice's place.
pub(crate) fn push_pause_notice(
    app: &AppHandle,
    project: &str,
    key: &str,
    pane_id: &str,
    news: &StatusSound,
) {
    let Some(hub) = app.try_state::<RemoteHub>() else {
        return;
    };
    let summary = crate::statusbanner::paused_summary(news);
    mac_alert::send_in(
        hub.inner(),
        project,
        key,
        |device| device.wants_in(project, STATUS_DONE),
        |server_id, ts| {
            let job = PushJob {
                terminal: news.terminal.clone(),
                terminal_id: pane_id.to_string(),
                value: news.value.clone(),
                ts,
                key: key.to_string(),
                collapse_id: String::new(),
                actions: Vec::new(),
                turn_start: 0,
            };
            alert_payload(
                server_id,
                project,
                &news.project,
                &job,
                &json!({ "summary": summary }),
            )
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sound::PAUSED_NEWS;

    #[test]
    fn the_notice_reads_as_a_status_push_saying_paused() {
        let job = PushJob {
            terminal: "tests".into(),
            terminal_id: "lpm-1".into(),
            value: PAUSED_NEWS.into(),
            ts: 7,
            key: "claude_code_s1".into(),
            collapse_id: String::new(),
            actions: Vec::new(),
            turn_start: 0,
        };
        let summary = "Paused 15m, waiting on: Run the test suite";
        let payload: Value = serde_json::from_str(&alert_payload(
            "srv",
            "web",
            "Web",
            &job,
            &json!({ "summary": summary }),
        ))
        .unwrap();
        assert_eq!(payload["target"], "terminal");
        assert_eq!(payload["status"], "Paused");
        assert_eq!(payload["key"], "claude_code_s1");
        assert_eq!(payload["terminalId"], "lpm-1");
        assert_eq!(payload["summary"], summary);
        assert!(payload.get("actions").is_none());
    }
}
