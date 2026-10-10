// A paired Mac updating lpm here.
//
// The updater is on the invoke denylist, so the asking Mac gets dedicated frames
// instead: `selfUpdate` runs the same install as this app's own Update button,
// and `selfUpdateCancel` stops it while it can still be stopped. The install runs
// in Rust on its own thread and tells the asking Mac each step as it goes. Its
// `result` only comes when it stops short — a finished install restarts lpm here,
// and the asking Mac reads the connection dropping as exactly that.
use crate::peer::result_frame;
use serde_json::{json, Value};
use std::sync::mpsc::SyncSender;
use tauri::AppHandle;

/// Advertised in `ready` by a host whose lpm can install its own updates. A
/// client never sends the frames to a host without it.
pub(crate) const SELF_UPDATE_FEATURE: &str = "selfUpdate";

/// Only the macOS build replaces itself; elsewhere lpm is updated the way it was
/// installed, so the feature is not offered at all.
pub(crate) fn advertised() -> bool {
    cfg!(target_os = "macos")
}

pub(crate) fn handle_start(app: &AppHandle, out: &SyncSender<String>, v: &Value) {
    let req_id = v.get("reqId").cloned().unwrap_or(Value::Null);
    #[cfg(target_os = "macos")]
    {
        let app = app.clone();
        let out = out.clone();
        std::thread::spawn(move || {
            let steps = out.clone();
            let step_req = req_id.clone();
            let observer: crate::updates::Observer = std::sync::Arc::new(move |event, payload| {
                if let Some(frame) = progress_frame(&step_req, event, payload) {
                    let _ = steps.try_send(frame);
                }
            });
            let frame = match crate::updates::install_for_peer(&app, observer) {
                Ok(cancelled) => result_frame(&req_id, true, json!({ "cancelled": cancelled })),
                Err(e) => result_frame(&req_id, false, Value::String(e)),
            };
            let _ = out.try_send(frame);
        });
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        let _ = out.try_send(result_frame(
            &req_id,
            false,
            Value::String("lpm updates itself only on macOS.".into()),
        ));
    }
}

pub(crate) fn handle_cancel(app: &AppHandle, out: &SyncSender<String>, v: &Value) {
    use tauri::Manager;
    let req_id = v.get("reqId").cloned().unwrap_or(Value::Null);
    let stopping = crate::updates::cancel_update(app.state());
    let _ = out.try_send(result_frame(&req_id, true, Value::Bool(stopping)));
}

/// One install step as the frame the asking Mac reads: `update-status` becomes
/// `phase`, `update-progress` becomes `progress` (whole percent).
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn progress_frame(req_id: &Value, event: &str, payload: Value) -> Option<String> {
    let field = match event {
        "update-status" => "phase",
        "update-progress" => "progress",
        _ => return None,
    };
    Some(json!({ "t": "selfUpdateProgress", "reqId": req_id, field: payload }).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(frame: Option<String>) -> Value {
        serde_json::from_str(&frame.expect("a frame")).unwrap()
    }

    #[test]
    fn a_status_step_becomes_the_phase() {
        let v = parse(progress_frame(
            &json!(4),
            "update-status",
            json!("downloading"),
        ));
        assert_eq!(v["t"], "selfUpdateProgress");
        assert_eq!(v["reqId"], 4);
        assert_eq!(v["phase"], "downloading");
        assert!(v.get("progress").is_none());
    }

    #[test]
    fn a_progress_step_becomes_the_percent() {
        let v = parse(progress_frame(&json!(4), "update-progress", json!(37)));
        assert_eq!(v["progress"], 37);
        assert!(v.get("phase").is_none());
    }

    #[test]
    fn other_events_are_not_sent() {
        assert!(progress_frame(&json!(4), "update-available", json!({})).is_none());
    }

    #[test]
    fn offered_only_where_lpm_replaces_itself() {
        assert_eq!(advertised(), cfg!(target_os = "macos"));
    }
}
