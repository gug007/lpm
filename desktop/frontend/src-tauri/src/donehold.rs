// Dones held until the work they report is over.
//
// An agent's Stop fires at every turn boundary, and a boundary is not always the
// end of the work. Claude starts the next turn by itself when a background shell
// it waits on exits, when a teammate or background sub-agent reports back, or
// when a task notification was already due — sometimes 40 ms after the Stop.
// Codex carries on with a /goal's next turn, or past a Stop another hook
// blocked, with no hook at all. Announced at once, each of those is an "Agent
// finished" chime, banner and phone push while the work goes on, and another
// when it ends. So a Done waits here, the tab keeping what it showed, until
// nothing that could still continue the work is left:
//
// - a short grace, for a next turn that was already due;
// - sub-agents and teammates still working (agentchildren.rs);
// - a sub-agent's open question (statusask.rs);
// - a background shell the turn started, which wakes the session when it
//   exits (bgtasks.rs). A dev server or a watcher never exits, so a shell that
//   looks like one, one already running when the user last sent a prompt, and
//   one still running after WAIT_CAP settle the turn as before;
// - for a prompt queued behind the turn, and for Codex, the pane still drawing.
//
// Any newer report from the agent drops the held Done: the next turn speaks for
// the session, and its own Stop reports the finish.
use crate::agentkind::AgentKind;
use crate::status::{
    is_live, now_millis, StatusEntry, StatusStore, STATUS_RUNNING, STATUS_WAITING,
};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

/// Longer than Claude takes to start a turn that was due when the last one
/// stopped (observed: 20-40 ms); shorter than anyone waits on a chime.
const GRACE_MS: i64 = 1_500;
/// How long a background shell the turn left running may keep its Done back:
/// longer than most builds and test runs take, short enough that a server that
/// doesn't look like one costs minutes.
const WAIT_CAP_MS: i64 = 15 * 60_000;
/// How long a Claude pane that keeps drawing may keep a queued prompt's Done
/// back: a teammate's footer animates while it sits idle.
const DRAW_CAP_MS: i64 = 60_000;
/// Output this recent means the pane is still at work.
const DRAWING_MS: i64 = 1_000;
const TICK: Duration = Duration::from_millis(250);

/// What may still continue the work a Done reports.
#[derive(Clone, Copy, Default, PartialEq, Debug)]
pub struct Why {
    /// A background shell the turn left running, which will wake the session.
    pub waits: bool,
    /// A next turn that may have started without a hook of its own.
    pub drawing: bool,
}

struct Pending {
    token: u64,
    rev: u64,
    since: i64,
    why: Why,
    done: StatusEntry,
    /// The tab showed the turn working when it stopped.
    was_running: bool,
    /// Work went on after the Stop, so the finish is dated when that ended.
    extended: bool,
    /// Nothing but a background shell holds the finish now: the session sits
    /// idle until the shell ends.
    paused: bool,
}

type Id = (String, String);

fn pending() -> &'static Mutex<HashMap<Id, Pending>> {
    static PENDING: OnceLock<Mutex<HashMap<Id, Pending>>> = OnceLock::new();
    PENDING.get_or_init(Default::default)
}

fn id(project: &str, key: &str) -> Id {
    (project.to_string(), key.to_string())
}

/// Why `done` must wait, or None when it goes out at once: only agents' Dones
/// are held, and only those of agents that can carry on after a Stop.
pub fn why(
    store: &StatusStore,
    project: &str,
    done: &StatusEntry,
    background: Option<&str>,
) -> Option<Why> {
    let agent = AgentKind::of_key(&done.key);
    let claude = agent == Some(AgentKind::Claude);
    let queued = store.take_queued_prompt(project, &done.key);
    let carries_on = claude || queued || agent == Some(AgentKind::Codex);
    if !carries_on && !crate::agentchildren::busy(project, &done.key) {
        return None;
    }
    Some(Why {
        waits: claude
            && background
                .is_some_and(|tasks| crate::bgtasks::waits_on_shells(project, &done.key, tasks)),
        drawing: queued || agent == Some(AgentKind::Codex),
    })
}

/// Publish `done` once nothing in `why` holds it back, unless the agent reports
/// again first. A newer Done for the same key replaces this one.
pub fn hold(app: &AppHandle, project: &str, done: StatusEntry, why: Why) {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let token = NEXT.fetch_add(1, Ordering::Relaxed);
    let store = app.state::<Arc<StatusStore>>();
    let key = id(project, &done.key);
    let held = Pending {
        token,
        rev: store.rev(project, &done.key),
        since: now_millis(),
        why,
        was_running: store
            .get(project, &done.key)
            .is_some_and(|e| e.value == STATUS_RUNNING),
        extended: false,
        paused: false,
        done,
    };
    pending().lock().unwrap().insert(key.clone(), held);
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(TICK);
        let store = app.state::<Arc<StatusStore>>();
        let Some(observed) = observe(&app, &store, &key, token) else {
            return;
        };
        match verdict(&observed) {
            Verdict::Hold => {
                if observed.work_goes_on() {
                    extend(&key, token);
                }
                // The tab reads differently while paused, and no report says so.
                if mark_paused(&key, token, observed.paused()) {
                    let _ = app.emit("status-changed", &key.0);
                }
            }
            Verdict::Drop => {
                // The next turn's first report can leave the tab's status as it
                // was, and the pause still ends with it.
                if take(&key, token).is_some_and(|p| p.paused) {
                    let _ = app.emit("status-changed", &key.0);
                }
                return;
            }
            Verdict::Publish => {
                if let Some(p) = take(&key, token) {
                    crate::socketsrv::publish(&app, &store, &key.0, released(&store, p));
                }
                return;
            }
        }
    });
}

/// The Done a hold lets go of, on the tab its pane is now, dated when the work
/// it reports ended: the Stop, unless something after it kept the work going.
fn released(store: &StatusStore, p: Pending) -> StatusEntry {
    StatusEntry {
        pane_id: store.current_pane(&p.done.pane_id),
        timestamp: if p.extended {
            now_millis()
        } else {
            p.done.timestamp
        },
        ..p.done
    }
}

/// What the hold for `key` sees right now, while it is still the one holding.
fn observe(app: &AppHandle, store: &StatusStore, key: &Id, token: u64) -> Option<Observed> {
    let (project, agent_key) = key;
    let (rev, since, why, was_running, pane) = {
        let held = pending().lock().unwrap();
        let p = held.get(key).filter(|p| p.token == token)?;
        (p.rev, p.since, p.why, p.was_running, p.done.pane_id.clone())
    };
    let now = now_millis();
    let pane = store.current_pane(&pane);
    let drawing = crate::pty::session(&app.state::<crate::pty::PtyState>(), &pane)
        .is_some_and(|sess| now - sess.last_output() < DRAWING_MS);
    let agent = AgentKind::of_key(agent_key);
    let taken_over = agent.is_some_and(|agent| {
        store
            .live_agent_entries_on(project, &pane)
            .iter()
            .any(|e| e.key != *agent_key && e.key.starts_with(agent.key_prefix()))
    });
    let shown = store.get(project, agent_key);
    // A question raised after the Stop, or one a sub-agent raised, is still
    // open: the finish must not land on top of it.
    let asking = shown.as_ref().is_some_and(|e| {
        e.value == STATUS_WAITING && (e.sub_agent_asking() || e.timestamp >= since)
    });
    Some(Observed {
        age: now - since,
        rev_moved: store.rev(project, agent_key) != rev,
        taken_over,
        gone: was_running && !shown.is_some_and(|e| is_live(&e.value)),
        children: crate::agentchildren::busy(project, agent_key),
        children_quiet: crate::agentchildren::quiet_since(project, agent_key).map(|at| now - at),
        asking,
        drawing,
        why,
        capped_drawing: agent == Some(AgentKind::Claude),
    })
}

#[derive(Debug, PartialEq)]
enum Verdict {
    Hold,
    Drop,
    Publish,
}

#[derive(Default)]
struct Observed {
    age: i64,
    /// The agent reported since the Done: its next turn is under way.
    rev_moved: bool,
    /// Another session of the same agent is working on the tab now.
    taken_over: bool,
    /// What the tab showed the turn doing is gone: the agent quit or was
    /// interrupted, or the tab closed.
    gone: bool,
    children: bool,
    /// How long ago the last sub-agent stopped. The lead takes up its report
    /// in a turn that may start without a hook.
    children_quiet: Option<i64>,
    asking: bool,
    drawing: bool,
    why: Why,
    /// The drawing hold ends at DRAW_CAP_MS.
    capped_drawing: bool,
}

impl Observed {
    fn handing_back(&self) -> bool {
        self.children_quiet
            .is_some_and(|ago| ago < GRACE_MS || (self.drawing && ago < DRAW_CAP_MS))
    }

    fn drawing_on(&self) -> bool {
        self.why.drawing && self.drawing && !(self.capped_drawing && self.age >= DRAW_CAP_MS)
    }

    /// Whether the work goes on past the Stop, rather than the hold only
    /// making sure it doesn't.
    fn work_goes_on(&self) -> bool {
        self.children || self.asking || self.handing_back() || self.drawing_on()
    }

    /// Whether a background shell is all the finish still waits for.
    fn paused(&self) -> bool {
        self.why.waits && (GRACE_MS..WAIT_CAP_MS).contains(&self.age) && !self.work_goes_on()
    }
}

fn verdict(o: &Observed) -> Verdict {
    if o.rev_moved || o.taken_over || o.gone {
        return Verdict::Drop;
    }
    let waiting = o.why.waits && o.age < WAIT_CAP_MS;
    if o.age < GRACE_MS || waiting || o.work_goes_on() {
        return Verdict::Hold;
    }
    Verdict::Publish
}

fn take(key: &Id, token: u64) -> Option<Pending> {
    let mut held = pending().lock().unwrap();
    if held.get(key).is_some_and(|p| p.token == token) {
        held.remove(key)
    } else {
        None
    }
}

fn extend(key: &Id, token: u64) {
    if let Some(p) = pending()
        .lock()
        .unwrap()
        .get_mut(key)
        .filter(|p| p.token == token)
    {
        p.extended = true;
    }
}

/// Records whether the hold is a pause now. True when that changed.
fn mark_paused(key: &Id, token: u64, paused: bool) -> bool {
    pending()
        .lock()
        .unwrap()
        .get_mut(key)
        .filter(|p| p.token == token)
        .is_some_and(|p| std::mem::replace(&mut p.paused, paused) != paused)
}

/// A turn that stopped beside background shells and sits idle until one ends.
pub struct Paused {
    /// When the turn stopped.
    pub since: i64,
    /// The shells it waits on, as the model described each.
    pub shells: Vec<String>,
}

/// What `key`'s tab shows in place of working while its finish waits for
/// background shells only. The entry itself stays Running throughout.
pub fn paused(project: &str, key: &str) -> Option<Paused> {
    let since = pending()
        .lock()
        .unwrap()
        .get(&id(project, key))
        .filter(|p| p.paused)
        .map(|p| p.since)?;
    let shells = crate::bgtasks::waited_on(project, key);
    (!shells.is_empty()).then_some(Paused { since, shells })
}

/// Whether a Done for `key` is being held: the session's work may go on, and
/// what the tab shows meanwhile is not to be retired for looking idle.
pub fn held(project: &str, key: &str) -> bool {
    pending().lock().unwrap().contains_key(&id(project, key))
}

/// Whether the session is idle at its prompt while its Done is held — waiting
/// on background work rather than possibly at work on a next turn.
pub fn idle(project: &str, key: &str) -> bool {
    pending()
        .lock()
        .unwrap()
        .get(&id(project, key))
        .is_some_and(|p| !p.why.drawing)
}

/// The user interrupted the session: whatever its held Done was waiting for
/// was cut short, and nothing finished.
pub fn cancel(project: &str, key: &str) {
    pending().lock().unwrap().remove(&id(project, key));
}

/// The session ended. A finish it reported goes out now, unless the hold was
/// for work that ends with it: a background shell, or a next turn that may
/// already have started.
pub fn end_session(app: &AppHandle, store: &StatusStore, project: &str, key: &str) {
    crate::bgtasks::forget(project, key);
    let Some(p) = pending().lock().unwrap().remove(&id(project, key)) else {
        return;
    };
    if !p.why.waits && !p.why.drawing && store.rev(project, key) == p.rev {
        crate::socketsrv::publish(app, store, project, released(store, p));
    }
}

/// The agent behind `key` is gone without saying so (killed, crashed): its
/// held finish, its sub-agents and whatever it showed as happening go with it.
pub fn session_gone(app: &AppHandle, project: &str, key: &str) {
    crate::bgtasks::forget(project, key);
    cancel(project, key);
    crate::agentchildren::forget(project, key);
    let store = app.state::<Arc<StatusStore>>();
    if store.clear_live(project, key) {
        let _ = app.emit("status-changed", project);
    }
}

#[cfg(test)]
#[path = "donehold_tests.rs"]
mod tests;
