// A terminal's conversation on the phone: the list its Conversation view shows
// in place of the terminal (agent_conversation.rs).
//
// `conversationWatch` pushes the newest entries at once and then whatever
// changes, on the cadence of the live service logs: an agent at work appends to
// its transcript all the time, and only what was appended is read and sent.
// `conversationPage` answers with what came before an entry, and
// `conversationDetail` with what one tool call was given and returned.
//
// As with `answers`, the phone names a terminal and never a session. The session
// is looked up again on every tick: /clear starts another one, and a Codex tab
// has none before its first hook.
use super::RemoteHub;
use crate::agent_conversation::{locate, Item, Polled, Reader, Transcript};
use crate::ignoredhost::str_arg;
use crate::remote_answers::AgentSession;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{SyncSender, TrySendError};
use std::sync::Arc;
use std::time::{Duration, Instant};

pub(crate) const FEATURE: &str = "agentConversation";

const POLL: Duration = Duration::from_millis(500);
/// A transcript that isn't there yet is looked for less often: the search walks
/// every account's folder.
const LOOK_AGAIN: Duration = Duration::from_secs(2);
const DEFAULT_LIMIT: usize = 80;
const MAX_LIMIT: usize = 200;
/// What one frame may carry over a phone's link. The newest entry always goes
/// out, whatever its size.
const FRAME_BUDGET: usize = 512 << 10;

/// The connection's watch-map key for one terminal's conversation.
pub(super) fn key(terminal: &str) -> String {
    format!("conversation\u{0}{terminal}")
}

pub(super) fn watch(hub: &RemoteHub, out: SyncSender<String>, v: &Value) -> Arc<AtomicBool> {
    let stop = Arc::new(AtomicBool::new(false));
    let stopped = stop.clone();
    let hub = hub.clone();
    let (id, project) = (
        str_arg(v, "id").to_string(),
        str_arg(v, "project").to_string(),
    );
    let limit = limit(v);
    std::thread::spawn(move || {
        let mut feed = Feed::new(id.clone(), project, limit);
        while !stopped.load(Ordering::SeqCst) {
            let session = hub.inner.agent_sessions.lock().unwrap().get(&id).cloned();
            feed.read(session);
            if let Some((frame, sent)) = feed.frame() {
                match out.try_send(frame.to_string()) {
                    Ok(()) => feed.sent(sent),
                    // The phone is behind; this goes out on the next tick.
                    Err(TrySendError::Full(_)) => {}
                    Err(TrySendError::Disconnected(_)) => return,
                }
            }
            std::thread::sleep(POLL);
        }
    });
    stop
}

pub(super) fn handle(hub: &RemoteHub, out: &SyncSender<String>, t: &str, v: &Value) {
    let (id, project) = (
        str_arg(v, "id").to_string(),
        str_arg(v, "project").to_string(),
    );
    let session = hub.inner.agent_sessions.lock().unwrap().get(&id).cloned();
    let (t, v, out) = (t.to_string(), v.clone(), out.clone());
    std::thread::spawn(move || {
        let answer = match t.as_str() {
            "conversationPage" => page(&project, session, str_arg(&v, "before"), limit(&v)),
            _ => detail(&project, session, str_arg(&v, "item")),
        };
        let mut reply = answer.unwrap_or_else(|e| json!({ "ok": false, "error": e }));
        reply["t"] = json!(t);
        reply["id"] = json!(id);
        if let Some(req_id) = v.get("reqId") {
            reply["reqId"] = req_id.clone();
        }
        let _ = out.try_send(reply.to_string());
    });
}

/// What a phone has been sent: the conversation, and its entries from `first` on.
struct Sent {
    session: Option<AgentSession>,
    items: Vec<Item>,
    error: Option<String>,
}

/// One terminal's conversation, kept current for one phone.
struct Feed {
    id: String,
    project: String,
    limit: usize,
    session: Option<AgentSession>,
    reader: Option<Reader>,
    looked: Option<Instant>,
    error: Option<String>,
    /// The entry the list starts at, so a reader that holds more never grows it
    /// backwards. Set when the conversation is first read.
    first: Option<String>,
    sent: Option<Sent>,
    /// Something was read since the last frame went out.
    dirty: bool,
}

impl Feed {
    fn new(id: String, project: String, limit: usize) -> Self {
        Self {
            id,
            project,
            limit,
            session: None,
            reader: None,
            looked: None,
            error: None,
            first: None,
            sent: None,
            dirty: true,
        }
    }

    fn read(&mut self, session: Option<AgentSession>) {
        if session != self.session {
            self.session = session;
            self.close();
        }
        match self.reader.as_mut().map(Reader::poll) {
            Some(Polled::Same) => {}
            Some(Polled::Grown) => self.dirty = true,
            Some(Polled::Gone) => {
                self.close();
                self.open();
            }
            None => self.open(),
        }
    }

    fn close(&mut self) {
        self.reader = None;
        self.looked = None;
        self.first = None;
        self.error = None;
        self.dirty = true;
    }

    fn open(&mut self) {
        let Some(session) = &self.session else {
            return;
        };
        if self.looked.is_some_and(|at| at.elapsed() < LOOK_AGAIN) {
            return;
        }
        self.looked = Some(Instant::now());
        self.dirty = true;
        let opened = transcript(&self.project, session).and_then(|found| {
            let reader = found.map(|transcript| Reader::open(transcript, self.limit));
            reader.transpose().map_err(|e| e.to_string())
        });
        match opened {
            Ok(reader) => {
                self.reader = reader;
                self.error = None;
            }
            Err(e) => self.error = Some(e),
        }
    }

    /// The entries the phone should have, and whether there are earlier ones.
    fn entries(&mut self) -> (Vec<Item>, bool) {
        let Some(reader) = &self.reader else {
            return (Vec::new(), false);
        };
        let items = reader.items();
        let known = self.first.as_ref();
        let start = known
            .and_then(|first| items.iter().position(|item| item.id == *first))
            .unwrap_or_else(|| newest(items, self.limit, FRAME_BUDGET));
        self.first = items.get(start).map(|item| item.id.clone());
        (items[start..].to_vec(), start > 0 || reader.partial())
    }

    fn sent(&mut self, sent: Sent) {
        self.sent = Some(sent);
        self.dirty = false;
    }

    /// What to send, and what the phone has once it's through; `None` while it
    /// has everything.
    fn frame(&mut self) -> Option<(Value, Sent)> {
        if !self.dirty {
            return None;
        }
        let (items, _) = self.entries();
        let mut now = Sent {
            session: self.session.clone(),
            items,
            error: self.error.clone(),
        };
        let mut frame = json!({ "t": "conversation", "id": self.id, "project": self.project });
        if let Some(error) = &now.error {
            if self
                .sent
                .as_ref()
                .is_some_and(|sent| sent.error == now.error)
            {
                self.dirty = false;
                return None;
            }
            frame["ok"] = json!(false);
            frame["error"] = json!(error);
            return Some((frame, now));
        }
        frame["ok"] = json!(true);
        match self.sent.as_ref().and_then(|sent| changes(sent, &now)) {
            // Agents end a turn on records that show nothing.
            Some(items) if items.is_empty() => {
                self.dirty = false;
                return None;
            }
            Some(items) => {
                frame["reset"] = json!(false);
                frame["items"] = json!(items);
            }
            None => {
                // A list sent again holds the newest entries, like the first one.
                self.first = None;
                let (items, more) = self.entries();
                frame["reset"] = json!(true);
                frame["items"] = json!(items);
                frame["more"] = json!(more);
                now.items = items;
            }
        }
        Some((frame, now))
    }
}

/// The entries of `now` a phone that has `sent` is missing: changed ones and new
/// ones, in order. `None` when it isn't the same list further on (another
/// session, a prompt taken back), which takes sending it all again.
fn changes(sent: &Sent, now: &Sent) -> Option<Vec<Item>> {
    if sent.session != now.session || sent.error.is_some() || now.items.len() < sent.items.len() {
        return None;
    }
    let same = sent.items.iter().zip(&now.items).all(|(a, b)| a.id == b.id);
    // An empty list says nothing of whether there were earlier entries.
    if !same || (sent.items.is_empty() && !now.items.is_empty()) {
        return None;
    }
    let changed = sent
        .items
        .iter()
        .zip(&now.items)
        .filter(|(a, b)| a != b)
        .map(|(_, b)| b.clone());
    Some(
        changed
            .chain(now.items[sent.items.len()..].iter().cloned())
            .collect(),
    )
}

/// Where the newest `limit` entries start, fewer when they'd go over `budget`.
fn newest(items: &[Item], limit: usize, budget: usize) -> usize {
    let mut used = 0;
    let kept = items
        .iter()
        .rev()
        .take(limit)
        .enumerate()
        .take_while(|(i, item)| {
            used += serde_json::to_string(item).map_or(0, |text| text.len());
            *i == 0 || used <= budget
        })
        .count();
    items.len() - kept
}

fn transcript(project: &str, session: &AgentSession) -> Result<Option<Transcript>, String> {
    locate(project, &session.provider, &session.session_id)
}

/// The entries before `before`, oldest first.
fn page(
    project: &str,
    session: Option<AgentSession>,
    before: &str,
    limit: usize,
) -> Result<Value, String> {
    let gone = || "The conversation has moved on. Open it again.".to_string();
    let transcript = transcript(project, &session.ok_or_else(gone)?)?.ok_or_else(gone)?;
    let reader = Reader::open_whole(transcript).map_err(|e| e.to_string())?;
    let items = reader.items();
    let end = items
        .iter()
        .position(|item| item.id == before)
        .ok_or_else(gone)?;
    let start = newest(&items[..end], limit, FRAME_BUDGET);
    Ok(json!({ "ok": true, "items": items[start..end], "more": start > 0 }))
}

fn detail(project: &str, session: Option<AgentSession>, item: &str) -> Result<Value, String> {
    let gone = || "This isn't in the conversation any more.".to_string();
    let transcript = transcript(project, &session.ok_or_else(gone)?)?.ok_or_else(gone)?;
    let parts = crate::agent_conversation_detail::read(&transcript, item)
        .map_err(|e| e.to_string())?
        .ok_or_else(gone)?;
    Ok(json!({ "ok": true, "item": item, "parts": parts }))
}

fn limit(v: &Value) -> usize {
    let asked = v.get("limit").and_then(Value::as_u64);
    asked
        .map_or(DEFAULT_LIMIT, |n| usize::try_from(n).unwrap_or(MAX_LIMIT))
        .clamp(1, MAX_LIMIT)
}

#[cfg(test)]
#[path = "conversation_tests.rs"]
mod tests;
