// Keeps this machine from idle-sleeping, for either of two reasons:
//
// - Keep awake while reachable: the switch is on and something may reach it from
//   elsewhere (phones while remote control is on, other computers while Allow
//   control is on), so either still finds it away from home. Only on power.
// - A Keep awake session (keepawake_session.rs): while agents work, for a set
//   time, or until turned off. On battery too when the session allows it, down
//   to its battery floor.
//
// Closing a laptop's lid still sleeps it either way.
use crate::keepawake_hold::{self as platform, Flags, Hold};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;

const POLL: Duration = Duration::from_secs(30);
// After a hold fails, wait this many checks before trying again, so a helper
// the system refuses isn't started every 30 seconds.
const RETRY_POLLS: u32 = 10;

/// What a running Keep awake session asks of the hold.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct SessionHold {
    pub(crate) screen: bool,
    /// Hold on battery while it is above this charge; `None` holds on power only.
    pub(crate) battery_floor: Option<u8>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct Power {
    on_power: bool,
    level: Option<u8>,
}

impl Power {
    fn read(session: Option<SessionHold>) -> Self {
        let on_power = platform::on_power();
        let wants_level = session.is_some_and(|s| s.battery_floor.is_some());
        Power {
            on_power,
            level: (!on_power && wants_level)
                .then(platform::battery_level)
                .flatten(),
        }
    }
}

#[derive(Default)]
struct State {
    switch_on: bool,
    phones: bool,
    computers: bool,
    session: Option<SessionHold>,
    want: bool,
    // The flags the running watch holds with, while it wants a hold. A change
    // starts a new watch; a new battery floor alone doesn't, the watch reads it.
    held: Option<Flags>,
    generation: u64,
    hold: Option<Hold>,
    failed: bool,
    cooldown: u32,
}

impl State {
    fn reachable(&self) -> bool {
        self.phones || self.computers
    }

    fn reach_wants(&self) -> bool {
        self.switch_on && self.reachable()
    }

    fn wants(&self) -> bool {
        self.reach_wants() || self.session.is_some()
    }

    fn flags(&self) -> Flags {
        self.session
            .map(|s| Flags {
                screen: s.screen,
                battery: s.battery_floor.is_some(),
            })
            .unwrap_or_default()
    }

    /// Whether to hold right now, given the power source.
    fn holds_now(&self, power: Power) -> bool {
        let session = self.session.is_some_and(|s| {
            power.on_power
                || s.battery_floor
                    .is_some_and(|floor| power.level.is_none_or(|level| level > floor))
        });
        session || (self.reach_wants() && power.on_power)
    }

    fn low_battery(&self, power: Power) -> bool {
        !power.on_power
            && self.session.is_some_and(|s| {
                s.battery_floor
                    .zip(power.level)
                    .is_some_and(|(floor, level)| level <= floor)
            })
    }

    fn report(&self, on_power: impl FnOnce() -> bool) -> &'static str {
        if !self.switch_on {
            "off"
        } else if !self.reachable() {
            "paused"
        } else if self.failed {
            "failed"
        } else if on_power() {
            "awake"
        } else {
            "battery"
        }
    }

    /// How the session's hold is doing: "idle" without a session, "failed",
    /// "awake", "battery" (on battery, which the session doesn't hold on) or
    /// "low" (below its battery floor).
    fn session_report(&self, power: Power) -> &'static str {
        let Some(session) = self.session else {
            return "idle";
        };
        if self.failed {
            "failed"
        } else if power.on_power {
            "awake"
        } else if session.battery_floor.is_none() {
            "battery"
        } else if self.low_battery(power) {
            "low"
        } else {
            "awake"
        }
    }

    /// Applies `change`, dropping the hold when what it holds for changes.
    /// Returns whether that changed, and whether what `status` reports changed;
    /// the power source is the same throughout.
    fn apply(&mut self, change: impl FnOnce(&mut Self)) -> (bool, bool) {
        let before = self.report(|| true);
        change(self);
        let want = self.wants();
        let held = want.then(|| self.flags());
        let changed = self.held != held;
        if changed {
            self.held = held;
            self.want = want;
            self.generation += 1;
            self.hold = None;
            self.failed = false;
            self.cooldown = 0;
        }
        (changed, self.report(|| true) != before)
    }
}

static STATE: LazyLock<Mutex<State>> = LazyLock::new(Mutex::default);
type Listener = Arc<dyn Fn() + Send + Sync>;
static LISTENERS: Mutex<Vec<Listener>> = Mutex::new(Vec::new());

/// Called when what `status` or `session_power` reports changes by itself: the
/// machine was plugged in or unplugged, the battery ran low, the hold failed,
/// or Allow control was turned on or off.
pub(crate) fn on_change(f: impl Fn() + Send + Sync + 'static) {
    LISTENERS.lock().unwrap().push(Arc::new(f));
}

fn notify() {
    let listeners = LISTENERS.lock().unwrap().clone();
    for listener in listeners {
        listener();
    }
}

/// The Keep awake switch and whether phones may reach this machine (remote
/// control on), both saved with the phone settings. Safe to call repeatedly.
pub(crate) fn set_for_phones(switch_on: bool, remote_on: bool) {
    update(|st| {
        st.switch_on = switch_on;
        st.phones = remote_on;
    });
}

/// Whether other computers may reach this machine (Allow control on). Safe to
/// call repeatedly.
pub(crate) fn set_for_computers(allow_control: bool) {
    if update(|st| st.computers = allow_control) {
        notify();
    }
}

/// What a Keep awake session needs held now, or `None` when it needs nothing.
pub(crate) fn set_session(session: Option<SessionHold>) {
    update(|st| st.session = session);
}

/// Let this machine sleep again, whatever the settings say.
pub(crate) fn release() {
    update(|st| {
        st.switch_on = false;
        st.session = None;
    });
}

/// Applies `change`, then takes or drops the hold to match. Returns whether
/// that changed what `status` reports.
fn update(change: impl FnOnce(&mut State)) -> bool {
    let mut st = STATE.lock().unwrap();
    let (changed, status_changed) = st.apply(change);
    if changed && st.want && platform::supported() {
        let generation = st.generation;
        let flags = st.flags();
        std::thread::spawn(move || watch(generation, flags));
    }
    status_changed
}

#[cfg(test)]
pub(crate) fn allows_computers() -> bool {
    STATE.lock().unwrap().computers
}

/// Re-checks the power source now and then: the hold is taken while
/// `holds_now` says so and dropped otherwise.
fn watch(generation: u64, flags: Flags) {
    let mut reported: Option<(bool, bool, bool)> = None;
    loop {
        let (acquire_now, power) = {
            let mut st = STATE.lock().unwrap();
            if st.generation != generation {
                return;
            }
            let power = Power::read(st.session);
            let acquire_now = if !st.holds_now(power) {
                st.hold = None;
                false
            } else if st.hold.as_mut().is_some_and(Hold::refresh) {
                false
            } else {
                if st.hold.take().is_some() {
                    st.failed = true;
                    st.cooldown = RETRY_POLLS;
                }
                if st.cooldown > 0 {
                    st.cooldown -= 1;
                    false
                } else {
                    true
                }
            };
            (acquire_now, power)
        };
        if acquire_now {
            let hold = platform::acquire(flags);
            let mut st = STATE.lock().unwrap();
            if st.generation != generation {
                return;
            }
            st.failed = hold.is_none();
            if st.failed {
                st.cooldown = RETRY_POLLS;
            }
            st.hold = hold;
        }
        let now = {
            let st = STATE.lock().unwrap();
            (power.on_power, st.failed, st.low_battery(power))
        };
        // Readers last saw the hold as not failed, before the first try to take it.
        if now != reported.unwrap_or((now.0, false, now.2)) {
            notify();
        }
        reported = Some(now);
        std::thread::sleep(POLL);
    }
}

/// What Settings says about Keep awake while reachable: "unsupported", "off"
/// (switch off), "paused" (neither remote control nor Allow control on),
/// "failed", "awake" or "battery".
pub(crate) fn status() -> &'static str {
    if !platform::supported() {
        return "unsupported";
    }
    STATE.lock().unwrap().report(platform::on_power)
}

/// How a Keep awake session's hold is doing: "unsupported", "idle" (no session
/// holding), "failed", "awake", "battery" or "low".
pub(crate) fn session_power() -> &'static str {
    if !platform::supported() {
        return "unsupported";
    }
    let st = STATE.lock().unwrap();
    if st.session.is_none() {
        return "idle";
    }
    st.session_report(Power::read(st.session))
}

#[cfg(test)]
#[path = "keepawake_tests.rs"]
mod tests;
