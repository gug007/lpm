//! A question only the window that owns the tabs can answer, such as which tab a
//! task opened, asked from a thread that waits for the reply.
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{sync_channel, Receiver, SyncSender};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Long enough for a project not shown since lpm started to bring its saved tabs
/// back first.
const WAIT: Duration = Duration::from_secs(20);

static NEXT: AtomicU64 = AtomicU64::new(1);

fn waiting() -> &'static Mutex<HashMap<u64, SyncSender<Value>>> {
    static WAITING: OnceLock<Mutex<HashMap<u64, SyncSender<Value>>>> = OnceLock::new();
    WAITING.get_or_init(Default::default)
}

fn open() -> (u64, Receiver<Value>) {
    let request = NEXT.fetch_add(1, Ordering::SeqCst);
    let (tx, rx) = sync_channel(1);
    waiting().lock().unwrap().insert(request, tx);
    (request, rx)
}

/// Emits `event` with `payload` and the `request` its answer names, then waits
/// for that answer. None when the window gives none in time.
pub fn ask(app: &AppHandle, event: &str, mut payload: Value) -> Option<Value> {
    let (request, answer) = open();
    payload["request"] = json!(request);
    let given = app
        .emit(event, payload)
        .is_ok()
        .then(|| answer.recv_timeout(WAIT).ok())
        .flatten();
    waiting().lock().unwrap().remove(&request);
    given
}

#[tauri::command]
pub fn answer_tab_request(request: u64, answer: Value) {
    if let Some(tx) = waiting().lock().unwrap().remove(&request) {
        let _ = tx.try_send(answer);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_answer_reaches_the_one_who_asked_once() {
        let (first, a) = open();
        let (second, b) = open();
        assert_ne!(first, second);
        answer_tab_request(second, json!({ "tab": "t2" }));
        answer_tab_request(second, json!({ "tab": "late" }));
        answer_tab_request(first, json!({ "tab": "t1" }));
        assert_eq!(a.recv().unwrap()["tab"], "t1");
        assert_eq!(b.recv().unwrap()["tab"], "t2");
        assert!(b.recv().is_err());
    }

    #[test]
    fn an_answer_nobody_waits_for_is_dropped() {
        answer_tab_request(u64::MAX, json!(null));
    }
}
