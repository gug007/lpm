//! Locking or sleeping this computer from a phone, and Sleep When Agents Finish:
//! once no agent here works or waits for an answer and no automation runs, the
//! computer tells the phones and goes to sleep.
use crate::syspower::{can_lock, can_sleep, lock_screen, sleep_now};
use serde_json::{json, Value};
use std::collections::BTreeSet;
use std::sync::mpsc::{channel, Sender, SyncSender};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Listener, Manager};

/// The phone may send `power`, `lockScreen`, `sleepNow` and `sleepWhenIdle`.
pub(super) const FEATURE: &str = "power";

const POLL: Duration = Duration::from_secs(5);
/// How long everything has to stay quiet before it sleeps: an agent that
/// answers and starts its next turn, or the next automation in a chain, isn't
/// done.
const QUIET_MS: i64 = 30_000;
/// Time for the reply to reach the phone before the network goes down.
const REPLY_GRACE: Duration = Duration::from_millis(1500);
/// Time for the push to leave before the network goes down.
const PUSH_GRACE: Duration = Duration::from_secs(5);
const PUSH_KEY: &str = "power";
/// Opens that Mac's connection page, which says it is asleep and offers Wake.
const PUSH_TARGET: &str = "keepAwake";

/// What is working on this computer now: agent terminals and automations.
#[derive(Default, Clone, PartialEq, Debug)]
pub(super) struct Busy {
    pub agents: BTreeSet<String>,
    pub automations: BTreeSet<String>,
}

impl Busy {
    fn idle(&self) -> bool {
        self.agents.is_empty() && self.automations.is_empty()
    }
}

/// Sleep When Agents Finish while it waits: everything it has seen working, so
/// the push can say what finished.
#[derive(Default, Debug)]
pub(super) struct Armed {
    pub seen: Busy,
    quiet_since: Option<i64>,
}

impl Armed {
    pub(super) fn new(busy: &Busy) -> Self {
        Self {
            seen: busy.clone(),
            quiet_since: None,
        }
    }

    /// Whether it is time to sleep: everything has been quiet for `QUIET_MS`.
    pub(super) fn observe(&mut self, busy: &Busy, now: i64) -> bool {
        self.seen.agents.extend(busy.agents.iter().cloned());
        self.seen
            .automations
            .extend(busy.automations.iter().cloned());
        if !busy.idle() {
            self.quiet_since = None;
            return false;
        }
        now - *self.quiet_since.get_or_insert(now) >= QUIET_MS
    }
}

#[derive(Default)]
struct State {
    armed: Option<Armed>,
    generation: u64,
    sent: Option<Value>,
}

fn state() -> &'static Mutex<State> {
    static STATE: OnceLock<Mutex<State>> = OnceLock::new();
    STATE.get_or_init(Mutex::default)
}

fn busy(app: &AppHandle) -> Busy {
    let agents = app
        .try_state::<Arc<crate::status::StatusStore>>()
        .map(|store| {
            store
                .live_agent_entries()
                .into_iter()
                .map(|(_, entry)| entry.pane_id)
                .collect()
        })
        .unwrap_or_default();
    Busy {
        agents,
        automations: crate::jobs::running_keys(),
    }
}

pub(super) fn wire(lock: bool, sleep: bool, armed: bool, busy: &Busy) -> Value {
    json!({
        "lock": lock,
        "sleep": sleep,
        "armed": armed,
        "agents": busy.agents.len(),
        "automations": busy.automations.len(),
    })
}

fn current(app: &AppHandle) -> Value {
    let armed = state().lock().unwrap().armed.is_some();
    wire(can_lock(), can_sleep(), armed, &busy(app))
}

/// Tells every phone, once per change.
fn announce(app: &AppHandle) -> Value {
    let wire = current(app);
    let mut st = state().lock().unwrap();
    if st.sent.as_ref() != Some(&wire) {
        st.sent = Some(wire.clone());
        drop(st);
        super::broadcast_frame(app, json!({ "t": "power", "state": wire }));
    }
    wire
}

/// Follows agents and automations so a phone's menu says how many are working,
/// starting the first time a phone asks. Off the emitting thread, and one count
/// for a burst of changes.
fn follow(app: &AppHandle) {
    static TX: OnceLock<Sender<()>> = OnceLock::new();
    if TX.get().is_some() {
        return;
    }
    let (tx, rx) = channel::<()>();
    if TX.set(tx).is_err() {
        return;
    }
    let worker = app.clone();
    std::thread::spawn(move || {
        while rx.recv().is_ok() {
            while rx.try_recv().is_ok() {}
            announce(&worker);
        }
    });
    for event in ["status-changed", "job-status"] {
        app.listen(event, |_| {
            if let Some(tx) = TX.get() {
                let _ = tx.send(());
            }
        });
    }
}

pub(super) fn handle(app: &AppHandle, out: &SyncSender<String>, t: &str, v: &Value) {
    follow(app);
    let reply = match t {
        "power" => json!({ "t": t, "state": current(app) }),
        "lockScreen" => outcome(t, lock_screen()),
        "sleepNow" => outcome(t, sleep_soon()),
        "sleepWhenIdle" => {
            let on = v["on"].as_bool().unwrap_or(true);
            let mut reply = outcome(t, set_armed(app, on));
            reply["state"] = announce(app);
            reply
        }
        _ => return,
    };
    let _ = out.try_send(reply.to_string());
}

fn outcome(t: &str, result: Result<(), String>) -> Value {
    match result {
        Ok(()) => json!({ "t": t, "ok": true }),
        Err(error) => json!({ "t": t, "ok": false, "error": error }),
    }
}

/// Sleeps once the reply is on its way.
fn sleep_soon() -> Result<(), String> {
    if !can_sleep() {
        return sleep_now();
    }
    std::thread::spawn(|| {
        std::thread::sleep(REPLY_GRACE);
        if let Err(e) = sleep_now() {
            eprintln!("warning: sleep now: {e}");
        }
    });
    Ok(())
}

fn set_armed(app: &AppHandle, on: bool) -> Result<(), String> {
    let mut st = state().lock().unwrap();
    if !on {
        st.armed = None;
        st.generation += 1;
        return Ok(());
    }
    if st.armed.is_some() {
        return Ok(());
    }
    if !can_sleep() {
        return Err(format!(
            "This {} can't be put to sleep from lpm.",
            crate::sys::MACHINE
        ));
    }
    let now = busy(app);
    if now.idle() {
        return Err("No agent or automation is working right now. Use Sleep Now instead.".into());
    }
    st.armed = Some(Armed::new(&now));
    st.generation += 1;
    let generation = st.generation;
    let app = app.clone();
    std::thread::spawn(move || watch(app, generation));
    Ok(())
}

fn watch(app: AppHandle, generation: u64) {
    loop {
        std::thread::sleep(POLL);
        let now = busy(&app);
        let mut st = state().lock().unwrap();
        if st.generation != generation {
            return;
        }
        let Some(armed) = st.armed.as_mut() else {
            return;
        };
        if !armed.observe(&now, crate::status::now_millis()) {
            continue;
        }
        let seen = std::mem::take(&mut armed.seen);
        st.armed = None;
        st.generation += 1;
        drop(st);
        announce(&app);
        let machine = crate::sys::machine_name();
        push(&app, &format!("{machine} is asleep"), &finished_text(&seen));
        std::thread::sleep(PUSH_GRACE);
        if let Err(e) = sleep_now() {
            push(&app, &format!("Couldn't put {machine} to sleep"), &e);
        }
        return;
    }
}

/// "3 agents finished.", "1 agent and 2 automations finished."
pub(super) fn finished_text(seen: &Busy) -> String {
    let count = |n: usize, one: &str| {
        if n == 1 {
            format!("1 {one}")
        } else {
            format!("{n} {one}s")
        }
    };
    let (agents, automations) = (seen.agents.len(), seen.automations.len());
    match (agents, automations) {
        (0, 0) => "Nothing was left running.".into(),
        (a, 0) => format!("{} finished.", count(a, "agent")),
        (0, m) => format!("{} finished.", count(m, "automation")),
        (a, m) => format!(
            "{} and {} finished.",
            count(a, "agent"),
            count(m, "automation")
        ),
    }
}

fn push(app: &AppHandle, title: &str, body: &str) {
    let Some(hub) = app.try_state::<super::RemoteHub>() else {
        return;
    };
    super::send_mac_alert(hub.inner(), PUSH_KEY, |server_id, ts| {
        json!({
            "serverId": server_id,
            "target": PUSH_TARGET,
            "title": title,
            "body": body,
            "ts": ts,
            "key": PUSH_KEY,
        })
        .to_string()
    });
}

#[cfg(test)]
#[path = "power_tests.rs"]
mod tests;
