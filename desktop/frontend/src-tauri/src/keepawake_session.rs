// The Keep awake menu: keep this machine awake while agents work (and for a few
// minutes after the last one finishes), for a set time, or until turned off.
// Saved in ~/.lpm/keep-awake.json, so a restart or an update keeps it.
//
// "Agents working" is every agent on this machine that is working or waiting
// for an answer, in any project: an agent on a connected computer keeps that
// computer awake, not this one.
use crate::keepawake;
use crate::keepawake_headsup::{self, HeadsUp};
use crate::keepawake_hold::supported;
use crate::keepawake_model::{parse_mode, span_minutes, Mode, PrefsPatch, Saved, Session};
use serde_json::{json, Value};
use std::sync::mpsc::{channel, Sender};
use std::sync::{LazyLock, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Listener, Manager};

pub(crate) const CHANGED_EVENT: &str = "keep-awake-changed";

/// Not a mode: adds time to the end that is coming.
const EXTEND: &str = "extend";
// Timers sleep in short steps: a sleeping machine doesn't advance a sleep, and
// one that wakes past a deadline should act on it promptly.
const TIMER_STEP: Duration = Duration::from_secs(30);

// What was last announced: a change to any of it is news.
type Sig = (Saved, usize, Option<i64>, bool, &'static str);

struct Runtime {
    session: Session,
    heads_up: HeadsUp,
    timer: (u64, Option<i64>),
    sent: Option<Sig>,
}

static RUNTIME: LazyLock<Mutex<Runtime>> = LazyLock::new(|| {
    Mutex::new(Runtime {
        session: Session::default(),
        heads_up: HeadsUp::default(),
        timer: (0, None),
        sent: None,
    })
});
static APP: OnceLock<AppHandle> = OnceLock::new();
static RECOUNT_TX: OnceLock<Sender<()>> = OnceLock::new();

fn path() -> std::path::PathBuf {
    crate::config::lpm_dir().join("keep-awake.json")
}

fn load() -> Saved {
    std::fs::read(path())
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn save(saved: &Saved) {
    let Ok(bytes) = serde_json::to_vec_pretty(saved) else {
        return;
    };
    let path = path();
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Err(e) = crate::fsatomic::write(&path, &bytes, crate::fsatomic::Mode::Preserve(0o644)) {
        eprintln!("warning: couldn't save keep-awake settings: {e}");
    }
}

fn now_ms() -> i64 {
    crate::status::now_millis()
}

/// Restores the saved mode and starts following this machine's agents. Called
/// once from lib.rs setup.
pub fn start(app: &AppHandle) {
    let _ = APP.set(app.clone());
    RUNTIME.lock().unwrap().session = Session::new(load());
    let (tx, rx) = channel::<()>();
    let _ = RECOUNT_TX.set(tx);
    // Off the emitting thread: a status change can be announced from anywhere,
    // and many changes in a burst need only one count.
    std::thread::spawn(move || {
        while rx.recv().is_ok() {
            while rx.try_recv().is_ok() {}
            recount();
        }
    });
    app.listen("status-changed", |_| request_recount());
    keepawake::on_change(|| {
        update(|_, _| {});
    });
    request_recount();
}

fn request_recount() {
    if let Some(tx) = RECOUNT_TX.get() {
        let _ = tx.send(());
    }
}

/// How many terminals on this machine have an agent working or waiting.
fn agents_working(app: &AppHandle) -> usize {
    let store = app.state::<std::sync::Arc<crate::status::StatusStore>>();
    let panes: std::collections::BTreeSet<String> = store
        .live_agent_entries()
        .into_iter()
        .map(|(_, entry)| entry.pane_id)
        .collect();
    panes.len()
}

fn recount() {
    let Some(app) = APP.get() else { return };
    let agents = agents_working(app);
    update(|session, now| session.set_agents(agents, now));
}

/// Applies `change`, then saves, holds, re-arms the timer and tells everyone
/// what changed. One at a time, so the hold and what is announced always follow
/// the latest change.
fn update(change: impl FnOnce(&mut Session, i64)) -> Value {
    let now = now_ms();
    let mut rt = RUNTIME.lock().unwrap();
    let before = rt.session.saved;
    change(&mut rt.session, now);
    rt.session.expire(now);
    if rt.session.saved != before {
        save(&rt.session.saved);
    }
    let ends_at = rt.session.ends_at();
    let heads_up = rt
        .heads_up
        .observe(ends_at, now)
        .map(|end| (rt.session.mode_name(), end - now));
    arm_timer(&mut rt);
    keepawake::set_session(rt.session.hold(now));
    let power = keepawake::session_power();
    let session = &rt.session;
    let agents = if session.saved.mode == Mode::Agents {
        session.agents
    } else {
        0
    };
    let sig = (
        session.saved,
        agents,
        session.ends_at(),
        session.active(now),
        power,
    );
    let wire = session.wire(now, power);
    if rt.sent != Some(sig) {
        announce(&wire);
        rt.sent = Some(sig);
    }
    drop(rt);
    if let (Some((reason, left)), Some(app)) = (heads_up, APP.get()) {
        keepawake_headsup::send(app, reason, left);
    }
    wire
}

fn announce(wire: &Value) {
    let Some(app) = APP.get() else { return };
    let _ = app.emit(CHANGED_EVENT, wire);
    crate::remote::broadcast_frame(app, json!({ "t": "keepAwake", "state": wire }));
    let mode = wire["mode"].as_str().unwrap_or("off");
    crate::dockmenu::set_keep_awake(mode, supported());
}

fn arm_timer(rt: &mut Runtime) {
    // Wakes for the coming end, or its heads-up before that. A later one (a set
    // time extended) waits for the armed timer, which re-arms when it fires.
    let Some(at) = rt
        .session
        .ends_at()
        .into_iter()
        .chain(rt.heads_up.next())
        .min()
    else {
        return;
    };
    if rt.timer.1.is_some_and(|armed| armed <= at) {
        return;
    }
    rt.timer = (rt.timer.0 + 1, Some(at));
    let generation = rt.timer.0;
    std::thread::spawn(move || loop {
        if RUNTIME.lock().unwrap().timer.0 != generation {
            return;
        }
        let left = at - now_ms();
        if left <= 0 {
            RUNTIME.lock().unwrap().timer.1 = None;
            recount();
            return;
        }
        std::thread::sleep(Duration::from_millis(left as u64).min(TIMER_STEP));
    });
}

pub(crate) fn state() -> Value {
    update(|_, _| {})
}

pub(crate) fn set_mode(name: &str, minutes: Option<u64>) -> Result<Value, String> {
    if !supported() {
        return Err("Keep awake isn't available on this computer.".into());
    }
    if name == EXTEND {
        let minutes = span_minutes(minutes)?;
        let mut extended = Ok(());
        let wire = update(|session, now| extended = session.extend(minutes, now));
        return extended.map(|()| wire);
    }
    let mode = parse_mode(name, minutes, now_ms())?;
    Ok(update(|session, _| session.set_mode(mode)))
}

pub(crate) fn set_prefs(patch: &PrefsPatch) -> Value {
    update(|session, _| session.set_prefs(patch))
}
