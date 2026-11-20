//! `lpm generate` requests on the phone (generate/approval.rs): the list waiting
//! for a yes, kept in step on every phone as it changes, the answer from the
//! phone, and a notification when one arrives while the phone is away. A tap on
//! it opens the app, which shows the request.
use super::{broadcast, has_clients, mac_alert, RemoteHub};
use crate::generate::approval::{self, Request};
use serde_json::{json, Value};
use std::sync::mpsc::SyncSender;
use tauri::{AppHandle, Listener, Manager};

/// The phone may send `generateRequests` and `answerGenerate`.
pub(super) const FEATURE: &str = "generateApproval";

pub(super) fn frame() -> Value {
    json!({ "t": "generateRequests", "requests": approval::generate_requests() })
}

/// `answerGenerate`: off the read loop, since a key typed on the phone goes to
/// the Keychain first.
pub(super) fn answer(app: &AppHandle, out: &SyncSender<String>, v: &Value) {
    let field = |k: &str| v.get(k).and_then(Value::as_str).map(str::to_string);
    let id = field("id").unwrap_or_default();
    let decision = field("decision").unwrap_or_default();
    let (prompt, key) = (field("prompt"), field("key"));
    let (app, out) = (app.clone(), out.clone());
    std::thread::spawn(move || {
        let mut reply = json!({ "t": "answerGenerate", "id": id, "ok": true });
        if let Err(e) = approval::answer(&app, &id, &decision, prompt, key) {
            reply["ok"] = json!(false);
            reply["error"] = json!(e);
        }
        let _ = out.try_send(reply.to_string());
    });
}

/// Every phone with the app open hears each change to the list.
pub(super) fn install(hub: &RemoteHub, app: &AppHandle) {
    let h = hub.clone();
    app.listen(approval::REQUEST_EVENT, move |_| {
        if has_clients(&h) {
            broadcast(&h, frame());
        }
    });
}

/// The notification for a request that just arrived, to every phone that shows
/// these and isn't showing the app right now.
pub(crate) fn push_generate_request(app: &AppHandle, req: &Request) {
    let Some(hub) = app.try_state::<RemoteHub>() else {
        return;
    };
    mac_alert::send(
        hub.inner(),
        &key(req),
        |device| device.wants_generate_in(&req.project),
        |server_id, ts| alert_payload(server_id, req, ts),
    );
}

fn key(req: &Request) -> String {
    format!("generate:{}", req.id)
}

fn alert_payload(server_id: &str, req: &Request, ts: i64) -> String {
    let (title, body) = approval::notice_words(req);
    json!({
        "serverId": server_id,
        "target": "generate",
        "project": req.project,
        "title": title,
        "body": body,
        "ts": ts,
        "key": key(req),
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_alert_names_who_asks_and_opens_the_request() {
        let req = Request {
            id: "g1".into(),
            kind: "image",
            agent: "Claude".into(),
            project: "web".into(),
            prompt: "A giraffe flying a plane".into(),
            model: String::new(),
            provider: "Google",
            details: Vec::new(),
            cost: String::new(),
            out: String::new(),
            needs_key: None,
            key_label: "Google Gemini",
            project_grant: true,
            over_limit: false,
            today: String::new(),
        };
        let payload: Value = serde_json::from_str(&alert_payload("srv", &req, 5)).unwrap();
        assert_eq!(payload["target"], "generate");
        assert_eq!(payload["serverId"], "srv");
        assert_eq!(payload["project"], "web");
        assert_eq!(payload["title"], "Claude wants to make an image");
        assert_eq!(payload["body"], "web: A giraffe flying a plane");
        assert_eq!(payload["key"], "generate:g1");
    }
}
