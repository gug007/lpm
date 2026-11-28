//! The phone's Talk button. `talkPlan` sorts one sentence into a plan on a
//! worker, since the AI CLI takes seconds; `talkRun` hands an approved plan to
//! the main window, which runs it as its own Approve does.
use super::RemoteHub;
use crate::sys::MACHINE;
use serde_json::{json, Value};
use std::sync::mpsc::SyncSender;
use tauri::{AppHandle, Manager};

/// The phone may send `talkPlan` and `talkRun`.
pub const FEATURE: &str = "talk";

fn stamped(verb: &str, mut reply: Value, v: &Value) -> Value {
    reply["t"] = json!(verb);
    if let Some(req) = v.get("reqId").filter(|r| !r.is_null()) {
        reply["reqId"] = req.clone();
    }
    reply
}

pub(super) fn plan(out: &SyncSender<String>, app: &AppHandle, v: &Value) {
    let (out, app, v) = (out.clone(), app.clone(), v.clone());
    std::thread::spawn(move || {
        let (projects, agents) = crate::talkplan::local_context(&app);
        let text = v["text"].as_str().unwrap_or_default();
        let reply = crate::talkplan::plan(&app, text, &projects, &agents, "");
        let _ = out.try_send(stamped("talkPlan", reply, &v).to_string());
    });
}

pub(super) fn run(hub: &RemoteHub, app: &AppHandle, v: &Value) -> Value {
    let reply = if app.get_webview_window("main").is_none() {
        json!({ "ok": false, "error": format!("Open the lpm app on your {MACHINE} to run a plan.") })
    } else {
        let (projects, agents) = crate::talkplan::local_context(app);
        match crate::talkplan::checked(&v["plan"], &projects, &agents) {
            Ok(plan) => {
                super::queue_run_action(hub, app, json!({ "talk": plan }));
                json!({ "ok": true })
            }
            Err(error) => json!({ "ok": false, "error": error }),
        }
    };
    stamped("talkRun", reply, v)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_reply_names_the_request_it_answers() {
        let r = stamped("talkRun", json!({ "ok": true }), &json!({ "reqId": "r1" }));
        assert_eq!(r, json!({ "t": "talkRun", "ok": true, "reqId": "r1" }));
        assert!(stamped("talkPlan", json!({}), &json!({})).get("reqId").is_none());
    }
}
