// The machine end of a relayed phone. A phone paired with another Mac opens
// this machine's projects through that Mac (remote/relay.rs), which carries its
// frames here over the peer link: `phoneOpen` starts a session, `phoneIn` is one
// frame from the phone, `phoneClose` ends it, and everything the session sends
// goes back as `phoneOut`. Past opening it is the same session a phone on this
// machine's own socket gets — the Mac it came through is a paired peer, trusted
// with far more than this, and it already checked the phone's credential.
//
// Each session is a channel of the peer connection it came in on, and ends with
// that connection.
use super::{
    handle_msg, phone_features, release_session, server_name, Client, PhoneSink, RemoteHub,
    RemoteWatch, OUT_QUEUE,
};
use crate::remotepresence::Route;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::atomic::Ordering;
use std::sync::mpsc::{self, Receiver, SyncSender};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Manager};

/// Advertised in the peer `ready`: this machine runs phones relayed to it.
pub(crate) const PHONE_RELAY_FEATURE: &str = "phoneRelay";
const INBOX: usize = 1024;
/// The largest frame the Mac on the other end reads (tungstenite's default).
/// A phone frame is escaped once more to ride inside `phoneOut`, so the very
/// largest replies no longer fit.
const LINK_FRAME_MAX: usize = 16 << 20;

/// Each open session's inbound frames, by peer connection and channel.
type Inboxes = Mutex<HashMap<(u64, u64), SyncSender<String>>>;

fn inboxes() -> &'static Inboxes {
    static INBOXES: OnceLock<Inboxes> = OnceLock::new();
    INBOXES.get_or_init(Default::default)
}

/// One peer-link frame for a relayed phone. `conn_id` is the peer connection it
/// came in on and `out` that connection's queue.
pub(crate) fn handle(app: &AppHandle, out: &SyncSender<String>, conn_id: u64, t: &str, v: &Value) {
    let Some(ch) = v.get("ch").and_then(Value::as_u64) else {
        return;
    };
    let str_field = |k: &str| v.get(k).and_then(Value::as_str).unwrap_or_default();
    match t {
        "phoneOpen" => open(
            app,
            out,
            conn_id,
            ch,
            str_field("device"),
            str_field("phone"),
            str_field("name"),
        ),
        "phoneIn" => {
            let inbox = inboxes().lock().unwrap().get(&(conn_id, ch)).cloned();
            // A session too far behind to take another frame is ended rather than
            // left to lose them: the phone reconnects to a fresh one.
            if inbox.is_some_and(|tx| tx.try_send(str_field("d").to_string()).is_err())
                && inboxes().lock().unwrap().remove(&(conn_id, ch)).is_some()
            {
                let _ = out.try_send(close_frame(ch));
            }
        }
        "phoneClose" => {
            inboxes().lock().unwrap().remove(&(conn_id, ch));
        }
        _ => {}
    }
}

/// The peer connection is gone: end every phone that came in on it.
pub(crate) fn drop_conn(conn_id: u64) {
    inboxes()
        .lock()
        .unwrap()
        .retain(|(conn, _), _| *conn != conn_id);
}

fn close_frame(ch: u64) -> String {
    json!({ "t": "phoneClose", "ch": ch }).to_string()
}

fn open(
    app: &AppHandle,
    out: &SyncSender<String>,
    conn_id: u64,
    ch: u64,
    device_id: &str,
    phone_id: &str,
    name: &str,
) {
    let hub = app.try_state::<RemoteHub>().map(|hub| hub.inner().clone());
    // The phone answers to the id its own Mac knows it by, which is what it
    // compares a terminal's owner against. That id must never be one of this
    // machine's own phones, whose push registration it could then rewrite.
    let Some(hub) = hub.filter(|hub| !device_id.is_empty() && !hub.device_exists(device_id)) else {
        let _ = out.try_send(close_frame(ch));
        return;
    };
    // Removed here, it stays out whichever Mac carries it.
    if hub.phone_revoked(phone_id) {
        let refusal = json!({ "t": "error", "error": "revoked" }).to_string();
        let _ = out.try_send(json!({ "t": "phoneOut", "ch": ch, "d": refusal }).to_string());
        let _ = out.try_send(close_frame(ch));
        return;
    }
    let (tx, rx) = mpsc::sync_channel::<String>(OUT_QUEUE);
    let (inbox_tx, inbox_rx) = mpsc::sync_channel::<String>(INBOX);
    let mut session = Session::open(hub, app.clone(), device_id, name, tx);
    inboxes().lock().unwrap().insert((conn_id, ch), inbox_tx);
    let peer = out.clone();
    std::thread::spawn(move || forward(rx, &peer, ch));
    let peer = out.clone();
    std::thread::spawn(move || {
        while let Ok(frame) = inbox_rx.recv() {
            if session.handle(&frame).is_err() {
                break;
            }
        }
        drop(session);
        if inboxes().lock().unwrap().remove(&(conn_id, ch)).is_some() {
            let _ = peer.try_send(close_frame(ch));
        }
    });
}

/// Everything the session sends, in order, onto the peer link. Runs until the
/// session and every worker answering for it are done; a link that is gone or
/// backed up drops frames, which the phone notices as it would on its own
/// socket and resyncs. A frame too large for the link is dropped too: the Mac
/// would refuse it by closing the whole link, and every phone on it with it.
fn forward(rx: Receiver<String>, peer: &SyncSender<String>, ch: u64) {
    while let Ok(frame) = rx.recv() {
        let wrapped = json!({ "t": "phoneOut", "ch": ch, "d": frame }).to_string();
        if wrapped.len() < LINK_FRAME_MAX {
            let _ = peer.try_send(wrapped);
        }
    }
}

/// A relayed phone's place among this machine's phones. Its replies share the
/// queue its pushed output goes through, so the phone hears them in the order
/// a socket of its own would deliver them.
struct Session {
    hub: RemoteHub,
    app: AppHandle,
    conn_id: u64,
    device_id: String,
    out: SyncSender<String>,
    subs: Arc<Mutex<HashSet<String>>>,
    watches: HashMap<String, RemoteWatch>,
}

impl Session {
    fn open(
        hub: RemoteHub,
        app: AppHandle,
        device_id: &str,
        name: &str,
        out: SyncSender<String>,
    ) -> Self {
        let ready = crate::remote_update::with_build(json!({
            "t": "ready",
            "serverId": hub.server_id(),
            "serverName": server_name(),
            "platform": crate::peer::platform_id(),
            "features": phone_features(),
        }));
        let _ = out.try_send(ready.to_string());
        hub.inner
            .relay_names
            .lock()
            .unwrap()
            .insert(device_id.to_string(), name.to_string());
        let subs = Arc::new(Mutex::new(HashSet::new()));
        let conn_id = hub.inner.next_id.fetch_add(1, Ordering::SeqCst) + 1;
        hub.inner.clients.lock().unwrap().insert(
            conn_id,
            Client {
                tx: out.clone(),
                subs: subs.clone(),
                device_id: device_id.to_string(),
                route: Route::Local,
                relayed: true,
            },
        );
        hub.inner.away.lock().unwrap().remove(device_id);
        Session {
            hub,
            app,
            conn_id,
            device_id: device_id.to_string(),
            out,
            subs,
            watches: HashMap::new(),
        }
    }

    fn handle(&mut self, frame: &str) -> Result<(), ()> {
        let mut sink = Queue(&self.out);
        handle_msg(
            &mut sink,
            frame,
            &self.hub,
            &self.app,
            &self.subs,
            &self.device_id,
            &self.out,
            &mut self.watches,
        )
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        for (_, w) in self.watches.drain() {
            w.stop.store(true, Ordering::SeqCst);
        }
        if !release_session(&self.hub, &self.app, self.conn_id, &self.device_id) {
            self.hub
                .inner
                .relay_names
                .lock()
                .unwrap()
                .remove(&self.device_id);
            self.hub.inner.away.lock().unwrap().remove(&self.device_id);
        }
    }
}

/// A direct reply waits for room rather than being dropped: the forwarder is
/// always draining, so the wait is short, and the phone is waiting on it.
struct Queue<'a>(&'a SyncSender<String>);

impl PhoneSink for Queue<'_> {
    fn send_text(&mut self, text: String) -> Result<(), ()> {
        self.0.send(text).map_err(|_| ())
    }
}
