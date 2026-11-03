// How a paired computer's link is doing between connect and drop: how long its
// last ping took to come back, and whether one is going unanswered. The read
// loop only calls a link dead after SILENCE_LIMIT, so this is what lets a slow
// or silent machine show as such well before then.
use serde_json::{json, Value};
use std::sync::atomic::{AtomicU64, AtomicU8, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// A round trip this long is slow enough that typing in its terminals lags.
const SLOW_MS: u64 = 1_000;
/// A ping unanswered this long means the machine has stopped responding.
const SILENT_AFTER: Duration = Duration::from_secs(8);

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum Health {
    Ok = 0,
    Slow = 1,
    Silent = 2,
}

impl Health {
    fn as_str(self) -> &'static str {
        match self {
            Health::Ok => "ok",
            Health::Slow => "slow",
            Health::Silent => "silent",
        }
    }
}

/// Coarse steps of the round trip, so the UI hears about a real change in
/// speed and not about every ping.
fn band(ms: u64) -> u8 {
    match ms {
        0 => 0,
        1..=49 => 1,
        50..=149 => 2,
        150..=399 => 3,
        400..=999 => 4,
        _ => 5,
    }
}

#[derive(Default)]
pub(crate) struct LinkHealth {
    ping_sent: Mutex<Option<Instant>>,
    rtt_ms: AtomicU64,
    shown: AtomicU8,
}

impl LinkHealth {
    pub(crate) fn reset(&self) {
        *self.ping_sent.lock().unwrap() = None;
        self.rtt_ms.store(0, Ordering::Relaxed);
        self.shown.store(0, Ordering::Relaxed);
    }

    /// A ping went out. An unanswered one keeps its time, so the wait counts
    /// from the first ping that went unanswered.
    pub(crate) fn pinged(&self) {
        self.ping_sent
            .lock()
            .unwrap()
            .get_or_insert_with(Instant::now);
    }

    pub(crate) fn ponged(&self) {
        if let Some(sent) = self.ping_sent.lock().unwrap().take() {
            let ms = (sent.elapsed().as_millis() as u64).max(1);
            self.rtt_ms.store(ms, Ordering::Relaxed);
        }
    }

    fn waiting(&self) -> Option<Duration> {
        self.ping_sent.lock().unwrap().map(|t| t.elapsed())
    }

    pub(crate) fn health(&self) -> Health {
        if self.waiting().is_some_and(|w| w >= SILENT_AFTER) {
            Health::Silent
        } else if self.rtt_ms.load(Ordering::Relaxed) >= SLOW_MS {
            Health::Slow
        } else {
            Health::Ok
        }
    }

    /// Whether what the UI shows is out of date: the health changed, or the
    /// round trip moved to another band.
    pub(crate) fn changed(&self) -> bool {
        let now = ((self.health() as u8) << 4) | band(self.rtt_ms.load(Ordering::Relaxed));
        self.shown.swap(now, Ordering::Relaxed) != now
    }

    pub(crate) fn json(&self) -> Value {
        let rtt = self.rtt_ms.load(Ordering::Relaxed);
        json!({
            "health": self.health().as_str(),
            "rttMs": (rtt > 0).then_some(rtt),
            "waitingSecs": self.waiting().map(|w| w.as_secs()),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_pong_times_the_ping_that_was_waiting() {
        let link = LinkHealth::default();
        assert_eq!(link.json()["rttMs"], Value::Null);
        link.pinged();
        std::thread::sleep(Duration::from_millis(5));
        link.pinged();
        link.ponged();
        assert!(link.rtt_ms.load(Ordering::Relaxed) >= 5);
        assert_eq!(link.health(), Health::Ok);
        assert_eq!(link.json()["waitingSecs"], Value::Null);
    }

    #[test]
    fn slow_and_silent_links_say_so() {
        let link = LinkHealth::default();
        link.rtt_ms.store(1_400, Ordering::Relaxed);
        assert_eq!(link.health(), Health::Slow);
        *link.ping_sent.lock().unwrap() = Instant::now().checked_sub(SILENT_AFTER);
        assert_eq!(link.health(), Health::Silent);
        assert_eq!(link.json()["health"], "silent");
        link.ponged();
        assert_eq!(link.health(), Health::Slow);
    }

    #[test]
    fn the_ui_hears_only_about_real_changes() {
        let link = LinkHealth::default();
        assert!(!link.changed());
        link.rtt_ms.store(30, Ordering::Relaxed);
        assert!(link.changed());
        link.rtt_ms.store(42, Ordering::Relaxed);
        assert!(!link.changed());
        link.rtt_ms.store(180, Ordering::Relaxed);
        assert!(link.changed());
        link.rtt_ms.store(1_200, Ordering::Relaxed);
        assert!(link.changed());
        assert!(!link.changed());
    }
}
