//! System notifications for work that finished while nobody was watching.
//!
//! The in-app badge and the chime both assume someone is at the machine. When
//! the window is behind something else — or the Mac is unattended entirely — a
//! banner is the only thing that survives until the user comes back, so agent
//! transitions and automation outcomes both route through here.

use crate::config;
use crate::status::{STATUS_DONE, STATUS_ERROR, STATUS_WAITING};
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

/// Some window of the app is on screen and frontmost — someone is looking at it
/// right now, and the badge in the tab strip is notice enough. Detached terminal
/// windows count: a user watching one is as present as one at the main window.
/// No window at all (headless host, closed to the dock) is unattended.
pub fn window_attended(app: &AppHandle) -> bool {
    app.webview_windows()
        .values()
        .any(|w| w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false))
}

fn enabled() -> bool {
    config::load_settings()
        .get("systemNotifications")
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

/// Both gates every banner passes: the user wants them, and isn't already here.
pub fn should_notify(app: &AppHandle) -> bool {
    enabled() && !window_attended(app)
}

pub fn notify(app: &AppHandle, title: &str, body: &str) {
    let _ = app.notification().builder().title(title).body(body).show();
}

fn status_copy(value: &str) -> Option<(&'static str, &'static str)> {
    match value {
        STATUS_DONE => Some(("Agent finished", "is done")),
        STATUS_WAITING => Some(("Agent needs you", "is waiting for your approval")),
        STATUS_ERROR => Some(("Agent hit a problem", "stopped with an error")),
        _ => None,
    }
}

/// Named after the tab when the frontend has told us what it's called, since a
/// project can have several agents running at once.
fn status_body(terminal: Option<&str>, project: &str, verb: &str) -> String {
    let subject = match terminal {
        Some(t) if !t.is_empty() => format!("\"{t}\""),
        _ => "An agent".to_string(),
    };
    let at = if project.is_empty() {
        String::new()
    } else {
        format!(" in {project}")
    };
    format!("{subject}{at} {verb}.")
}

/// One banner per status transition worth interrupting for. Running is a
/// progress detail, never a notification.
pub fn notify_status(app: &AppHandle, project: &str, value: &str, pane_id: &str) {
    let Some((title, verb)) = status_copy(value) else {
        return;
    };
    if !should_notify(app) {
        return;
    }
    let terminal = crate::remote::terminal_label(app, pane_id);
    notify(app, title, &status_body(terminal.as_deref(), project, verb));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_copy_covers_interrupting_statuses_only() {
        assert!(status_copy(STATUS_DONE).is_some());
        assert!(status_copy(STATUS_WAITING).is_some());
        assert!(status_copy(STATUS_ERROR).is_some());
        assert_eq!(status_copy("Running"), None);
        assert_eq!(status_copy(""), None);
    }

    #[test]
    fn body_names_the_terminal_when_known() {
        assert_eq!(
            status_body(Some("refactor auth"), "myapp", "is done"),
            "\"refactor auth\" in myapp is done."
        );
    }

    #[test]
    fn body_falls_back_when_terminal_or_project_is_unknown() {
        assert_eq!(
            status_body(None, "myapp", "is done"),
            "An agent in myapp is done."
        );
        assert_eq!(
            status_body(Some(""), "myapp", "is done"),
            "An agent in myapp is done."
        );
        assert_eq!(status_body(None, "", "is done"), "An agent is done.");
    }
}
