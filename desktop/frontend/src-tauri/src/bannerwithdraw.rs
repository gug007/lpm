// Taking back a banner once its news is over.
//
// A "needs you" or "finished" banner stays in Notification Center after the
// agent got its answer, went back to work, or its tab closed — still saying
// what is no longer true. Each status banner is remembered with the status it
// announced; on every status change of its project, one whose status is gone
// from its tab is withdrawn.
//
// macOS only: there the app can read back what it delivered. The notification
// plugin keeps no handle on Windows or Linux, so banners there stay as before.
use crate::status::StatusStore;
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Listener, Manager};

struct Announced {
    project: String,
    pane: String,
    value: String,
    body: String,
}

fn announced() -> &'static Mutex<Vec<Announced>> {
    static ANNOUNCED: OnceLock<Mutex<Vec<Announced>>> = OnceLock::new();
    ANNOUNCED.get_or_init(Default::default)
}

/// A banner went out for `value` on `pane`.
pub fn record(project: &str, pane: &str, value: &str, body: &str) {
    if pane.is_empty() || !cfg!(target_os = "macos") {
        return;
    }
    announced().lock().unwrap().push(Announced {
        project: project.to_string(),
        pane: pane.to_string(),
        value: value.to_string(),
        body: body.to_string(),
    });
}

/// Check the project's banners on every status change, wherever it came from.
pub fn start(app: &AppHandle) {
    let handle = app.clone();
    app.listen_any("status-changed", move |event| {
        let Ok(project) = serde_json::from_str::<String>(event.payload()) else {
            return;
        };
        withdraw_settled(&handle, &project);
    });
}

fn withdraw_settled(app: &AppHandle, project: &str) {
    let over: Vec<String> = {
        let mut list = announced().lock().unwrap();
        if !list.iter().any(|a| a.project == project) {
            return;
        }
        let entries = app.state::<Arc<StatusStore>>().list(project);
        let still = |a: &Announced| {
            entries
                .iter()
                .any(|e| e.pane_id == a.pane && e.value == a.value)
        };
        let (gone, kept): (Vec<_>, Vec<_>) = list
            .drain(..)
            .partition(|a| a.project == project && !still(a));
        *list = kept;
        gone.into_iter().map(|a| a.body).collect()
    };
    if !over.is_empty() {
        remove_delivered(&over);
    }
}

// The notification plugin delivers through NSUserNotificationCenter on macOS,
// so that is where its banners are found again.
#[cfg(target_os = "macos")]
#[allow(deprecated)]
fn remove_delivered(bodies: &[String]) {
    use objc2_foundation::NSUserNotificationCenter;
    let center = NSUserNotificationCenter::defaultUserNotificationCenter();
    for banner in center.deliveredNotifications().iter() {
        let text = banner.informativeText().map(|t| t.to_string());
        if text.is_some_and(|text| bodies.contains(&text)) {
            center.removeDeliveredNotification(&banner);
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn remove_delivered(_bodies: &[String]) {}
