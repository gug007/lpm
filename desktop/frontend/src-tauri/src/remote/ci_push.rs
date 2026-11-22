//! CI on a commit pushed from this Mac (ci_watch.rs) on the phones: failed, or
//! passing again. A tap opens the project.
use super::{mac_alert, notify_levels, RemoteHub};
use crate::ci_watch::CiResult;
use serde_json::json;
use tauri::{AppHandle, Manager};

struct Alert<'a> {
    project: &'a str,
    label: &'a str,
    branch: &'a str,
    title: &'a str,
    body: &'a str,
}

impl Alert<'_> {
    fn key(&self) -> String {
        format!("ci:{}/{}", self.project, self.branch)
    }

    fn payload(&self, server_id: &str, ts: i64) -> String {
        json!({
            "serverId": server_id,
            "target": "ci",
            "project": self.project,
            "projectLabel": self.label,
            "title": self.title,
            "body": self.body,
            "ts": ts,
            "key": self.key(),
        })
        .to_string()
    }
}

/// To every phone with CI alerts on, and the project not quieted, that isn't
/// showing the app right now. A newer alert for the branch replaces the last one.
fn send(app: &AppHandle, alert: &Alert) {
    let Some(hub) = app.try_state::<RemoteHub>() else {
        return;
    };
    mac_alert::send(
        hub.inner(),
        &alert.key(),
        |device| device.push_ci && notify_levels::allows(&device.projects, alert.project, false),
        |server_id, ts| alert.payload(server_id, ts),
    );
}

pub(crate) fn push_ci_result(app: &AppHandle, result: &CiResult) {
    let (title, body) = (result.headline(None), result.body());
    send(
        app,
        &Alert {
            project: &result.project,
            label: result.project_label(),
            branch: result.branch(),
            title: &title,
            body: &body,
        },
    );
}

/// How a Keep fixing until green loop ended (ci_fix_loop.rs), under the
/// branch's CI key so it replaces that branch's last CI alert.
pub(crate) fn push_fix_loop_result(app: &AppHandle, project: &str, branch: &str, title: &str, body: &str) {
    let label = crate::config::project_display_name(project);
    send(
        app,
        &Alert {
            project,
            label: &label,
            branch,
            title,
            body,
        },
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
        let (title, body) = (result.headline(None), result.body());
        let alert = Alert {
            project: &result.project,
            label: result.project_label(),
            branch: result.branch(),
            title: &title,
            body: &body,
        };
        let v: Value = serde_json::from_str(&alert.payload("srv", 5)).unwrap();
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
