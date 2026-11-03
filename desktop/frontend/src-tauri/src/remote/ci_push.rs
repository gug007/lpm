//! CI on a commit pushed from this Mac (ci_watch.rs) on the phones: failed, or
//! passing again. A tap opens the project.
use super::{mac_alert, notify_levels, RemoteHub};
use crate::ci_watch::CiResult;
use serde_json::json;
use tauri::{AppHandle, Manager};

fn payload(server_id: &str, result: &CiResult, ts: i64) -> String {
    json!({
        "serverId": server_id,
        "target": "ci",
        "project": result.project,
        "projectLabel": result.project_label(),
        "title": result.headline(None),
        "body": result.body(),
        "ts": ts,
        "key": key(result),
    })
    .to_string()
}

fn key(result: &CiResult) -> String {
    format!("ci:{}/{}", result.project, result.branch())
}

/// To every phone with CI alerts on, and the project not quieted, that isn't
/// showing the app right now. A newer result for the branch replaces the last one.
pub(crate) fn push_ci_result(app: &AppHandle, result: &CiResult) {
    let Some(hub) = app.try_state::<RemoteHub>() else {
        return;
    };
    mac_alert::send(
        hub.inner(),
        &key(result),
        |device| device.push_ci && notify_levels::allows(&device.projects, &result.project, false),
        |server_id, ts| payload(server_id, result, ts),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn the_alert_says_what_the_banner_does_and_opens_the_project() {
        let result: CiResult = serde_json::from_value(json!({
            "project": "lpm", "projectLabel": "lpm", "branch": "main", "sha": "fcb454f",
            "title": "feat(cli): add remote command execution", "url": "", "passed": false,
            "failed": [], "summary": "CI failed: Linux host",
        }))
        .unwrap();
        let v: Value = serde_json::from_str(&payload("srv", &result, 5)).unwrap();
        assert_eq!(v["target"], "ci");
        assert_eq!(v["project"], "lpm");
        assert_eq!(v["title"], "lpm · main");
        assert_eq!(
            v["body"],
            "CI failed: Linux host\nfcb454f feat(cli): add remote command execution"
        );
        assert_eq!(v["key"], "ci:lpm/main");
        assert_eq!(v["ts"], 5);
    }
}
