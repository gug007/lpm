// What Keep awake holds to (keepawake_session.rs runs it): a mode, the choices
// for how it holds, and the agents it follows, with when it ends and what
// holding it means now.
use crate::keepawake::SessionHold;
use crate::keepawake_hold::{screen_supported, supported};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const MINUTE: i64 = 60_000;
pub(crate) const MAX_MINUTES: u64 = 99 * 60 + 59;
const MAX_TAIL_MINUTES: u32 = 120;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum Mode {
    #[default]
    Off,
    Agents,
    Until {
        at: i64,
    },
    Always,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct Prefs {
    pub(crate) tail_minutes: u32,
    pub(crate) screen: bool,
    pub(crate) battery: bool,
    pub(crate) floor: u8,
}

impl Default for Prefs {
    fn default() -> Self {
        Prefs {
            tail_minutes: 5,
            screen: true,
            battery: true,
            floor: 20,
        }
    }
}

#[derive(Deserialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PrefsPatch {
    pub(crate) tail_minutes: Option<u32>,
    pub(crate) screen: Option<bool>,
    pub(crate) battery: Option<bool>,
    pub(crate) floor: Option<u8>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct Saved {
    pub(crate) mode: Mode,
    pub(crate) prefs: Prefs,
}

#[derive(Default, Debug)]
pub(crate) struct Session {
    pub(crate) saved: Saved,
    pub(crate) agents: usize,
    // When the last agent finished, while waiting for agents: the countdown runs
    // from here.
    idle_since: Option<i64>,
}

impl Session {
    pub(crate) fn new(saved: Saved) -> Self {
        Session {
            saved,
            ..Session::default()
        }
    }

    fn tail_until(&self) -> Option<i64> {
        let tail = i64::from(self.saved.prefs.tail_minutes) * MINUTE;
        self.idle_since.map(|since| since + tail)
    }

    pub(crate) fn set_agents(&mut self, agents: usize, now: i64) {
        if agents > 0 {
            self.idle_since = None;
        } else if self.agents > 0 && self.saved.mode == Mode::Agents {
            self.idle_since = Some(now);
        }
        self.agents = agents;
    }

    pub(crate) fn set_mode(&mut self, mode: Mode) {
        self.saved.mode = mode;
        self.idle_since = None;
    }

    pub(crate) fn set_prefs(&mut self, patch: &PrefsPatch) {
        let prefs = &mut self.saved.prefs;
        if let Some(tail) = patch.tail_minutes {
            prefs.tail_minutes = tail.min(MAX_TAIL_MINUTES);
        }
        if let Some(screen) = patch.screen {
            prefs.screen = screen;
        }
        if let Some(battery) = patch.battery {
            prefs.battery = battery;
        }
        if let Some(floor) = patch.floor {
            prefs.floor = floor.min(95);
        }
    }

    /// Pushes back the end that is coming, a set time's or the countdown's
    /// after the last agent, by `minutes`.
    pub(crate) fn extend(&mut self, minutes: u64, now: i64) -> Result<(), String> {
        let by = minutes as i64 * MINUTE;
        match (self.saved.mode, self.ends_at()) {
            (Mode::Until { at }, _) => {
                let latest = now + MAX_MINUTES as i64 * MINUTE;
                self.saved.mode = Mode::Until {
                    at: (at.max(now) + by).min(latest),
                };
            }
            // The countdown runs from when the last agent finished, so moving
            // that later moves its end.
            (Mode::Agents, Some(until)) => {
                let tail = i64::from(self.saved.prefs.tail_minutes) * MINUTE;
                self.idle_since = Some(until.max(now) + by - tail);
            }
            _ => {
                return Err("Keep awake isn't counting down, so there's no time to add to.".into())
            }
        }
        Ok(())
    }

    /// Ends a set time that ran out and a countdown that finished.
    pub(crate) fn expire(&mut self, now: i64) {
        if matches!(self.saved.mode, Mode::Until { at } if at <= now) {
            self.saved.mode = Mode::Off;
        }
        if self.tail_until().is_some_and(|until| until <= now) {
            self.idle_since = None;
        }
    }

    pub(crate) fn active(&self, now: i64) -> bool {
        match self.saved.mode {
            Mode::Off => false,
            Mode::Agents => self.agents > 0 || self.tail_until().is_some_and(|until| until > now),
            Mode::Until { at } => at > now,
            Mode::Always => true,
        }
    }

    /// When it lets go by itself: a set time's end, or the countdown's.
    pub(crate) fn ends_at(&self) -> Option<i64> {
        match self.saved.mode {
            Mode::Until { at } => Some(at),
            Mode::Agents if self.agents == 0 => self.tail_until(),
            _ => None,
        }
    }

    pub(crate) fn hold(&self, now: i64) -> Option<SessionHold> {
        let prefs = self.saved.prefs;
        self.active(now).then_some(SessionHold {
            screen: prefs.screen,
            battery_floor: prefs.battery.then_some(prefs.floor),
        })
    }

    pub(crate) fn mode_name(&self) -> &'static str {
        match self.saved.mode {
            Mode::Off => "off",
            Mode::Agents => "agents",
            Mode::Until { .. } => "timed",
            Mode::Always => "always",
        }
    }

    pub(crate) fn wire(&self, now: i64, power: &str) -> Value {
        let prefs = self.saved.prefs;
        json!({
            "supported": supported(),
            "screenSupported": screen_supported(),
            "mode": self.mode_name(),
            "active": self.active(now),
            "agents": self.agents,
            "endsIn": self.ends_at().map(|at| (at - now).max(0)),
            "tailMinutes": prefs.tail_minutes,
            "screen": prefs.screen,
            "battery": prefs.battery,
            "floor": prefs.floor,
            "power": power,
        })
    }
}

/// The mode a menu, phone or `lpm awake` names: "off", "agents", "always", or
/// "timed" for `minutes`.
pub(crate) fn parse_mode(name: &str, minutes: Option<u64>, now: i64) -> Result<Mode, String> {
    match name {
        "off" => Ok(Mode::Off),
        "agents" => Ok(Mode::Agents),
        "always" => Ok(Mode::Always),
        "timed" => Ok(Mode::Until {
            at: now + span_minutes(minutes)? as i64 * MINUTE,
        }),
        _ => Err(format!("Unknown Keep awake mode \"{name}\".")),
    }
}

pub(crate) fn span_minutes(minutes: Option<u64>) -> Result<u64, String> {
    minutes
        .filter(|m| (1..=MAX_MINUTES).contains(m))
        .ok_or_else(|| "Pick a time between 1 minute and 99 hours 59 minutes.".into())
}

#[cfg(test)]
#[path = "keepawake_model_tests.rs"]
mod tests;
