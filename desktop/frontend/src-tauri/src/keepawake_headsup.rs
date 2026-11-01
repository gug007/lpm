// A heads-up five minutes before Keep awake lets go by itself — a set time
// running out, or the countdown after the last agent — so there's still time
// to add an hour: a toast in the app, a banner when nobody is at it, and a
// notification on the phones. A connected computer's heads-up shows here too.
use crate::notifychannels::NotificationEvent;
use crate::statusnotify::{notify, should_notify};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

pub(crate) const HEADS_UP_EVENT: &str = "keep-awake-heads-up";
// A connected computer's, under a name of its own: forwarding it on as this
// machine's own would bounce it between two computers paired both ways.
const PEER_HEADS_UP_EVENT: &str = "peer-keep-awake-heads-up";
const LEAD_MS: i64 = 5 * 60_000;

/// When the heads-up for the coming end is due. Only an end that was further
/// off than the lead when it was set gets one, so a short countdown doesn't
/// warn the moment it starts.
#[derive(Default, Debug)]
pub(crate) struct HeadsUp {
    end: Option<i64>,
    due: Option<i64>,
}

impl HeadsUp {
    /// Follows the coming end, and returns it once its heads-up is due.
    pub(crate) fn observe(&mut self, end: Option<i64>, now: i64) -> Option<i64> {
        if end != self.end {
            self.end = end;
            self.due = end.filter(|at| at - now > LEAD_MS).map(|at| at - LEAD_MS);
        }
        let end = self.end?;
        if !self.due.is_some_and(|due| due <= now) || end <= now {
            return None;
        }
        self.due = None;
        Some(end)
    }

    pub(crate) fn next(&self) -> Option<i64> {
        self.due
    }
}

fn title(machine: &str, left_ms: i64) -> String {
    let minutes = (left_ms.max(0) + 59_999) / 60_000;
    format!("{machine} can sleep in {minutes} min")
}

fn reason_text(reason: &str) -> &'static str {
    if reason == "timed" {
        "The time you set is running out."
    } else {
        "Agents finished, and the time after them is running out."
    }
}

fn banner(app: &AppHandle, machine: &str, reason: &str, left_ms: i64) {
    if should_notify(app, NotificationEvent::KeepAwake) {
        let body = format!("{} Open lpm to add an hour.", reason_text(reason));
        notify(app, &title(machine, left_ms), &body);
    }
}

fn phone_payload(server_id: &str, machine: &str, reason: &str, left_ms: i64, ts: i64) -> String {
    json!({
        "serverId": server_id,
        "target": "keepAwake",
        "title": title(machine, left_ms),
        "body": reason_text(reason),
        "ts": ts,
        "key": "keepAwake",
    })
    .to_string()
}

/// This machine's heads-up. `reason` is the mode that ends: "timed" or "agents".
pub(crate) fn send(app: &AppHandle, reason: &'static str, left_ms: i64) {
    let _ = app.emit(
        HEADS_UP_EVENT,
        json!({ "reason": reason, "endsIn": left_ms }),
    );
    let this = if cfg!(target_os = "macos") {
        "This Mac"
    } else {
        "This computer"
    };
    banner(app, this, reason, left_ms);
    if let Some(hub) = app.try_state::<crate::remote::RemoteHub>() {
        let machine = crate::sys::machine_name();
        crate::remote::send_mac_alert(hub.inner(), "keepAwake", |server_id, ts| {
            phone_payload(server_id, &machine, reason, left_ms, ts)
        });
    }
}

/// A connected computer's heads-up, which it forwarded here.
pub(crate) fn from_peer(app: &AppHandle, slug: &str, payload: &Value) {
    let Some(hub) = app.try_state::<crate::peerclient::PeerClientHub>() else {
        return;
    };
    let machine = crate::ignoredsync::machine_name(hub.inner(), slug);
    let reason = payload["reason"].as_str().unwrap_or("agents");
    let left_ms = payload["endsIn"].as_i64().unwrap_or(LEAD_MS);
    let _ = app.emit(
        PEER_HEADS_UP_EVENT,
        json!({ "slug": slug, "machine": machine, "reason": reason, "endsIn": left_ms }),
    );
    banner(app, &machine, reason, left_ms);
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIN: i64 = 60_000;

    #[test]
    fn warns_once_five_minutes_before_the_end() {
        let mut heads_up = HeadsUp::default();
        assert_eq!(heads_up.observe(Some(60 * MIN), 0), None);
        assert_eq!(heads_up.next(), Some(55 * MIN));
        assert_eq!(heads_up.observe(Some(60 * MIN), 54 * MIN), None);
        assert_eq!(heads_up.observe(Some(60 * MIN), 55 * MIN), Some(60 * MIN));
        assert_eq!(heads_up.observe(Some(60 * MIN), 56 * MIN), None);
        assert_eq!(heads_up.next(), None);
    }

    #[test]
    fn a_short_countdown_gets_none() {
        let mut heads_up = HeadsUp::default();
        assert_eq!(heads_up.observe(Some(5 * MIN), 0), None);
        assert_eq!(heads_up.next(), None);
        assert_eq!(heads_up.observe(Some(5 * MIN), 4 * MIN), None);
    }

    #[test]
    fn a_later_end_warns_again() {
        let mut heads_up = HeadsUp::default();
        heads_up.observe(Some(60 * MIN), 0);
        assert!(heads_up.observe(Some(60 * MIN), 55 * MIN).is_some());
        heads_up.observe(Some(120 * MIN), 56 * MIN);
        assert_eq!(heads_up.next(), Some(115 * MIN));
        assert_eq!(
            heads_up.observe(Some(120 * MIN), 115 * MIN),
            Some(120 * MIN)
        );
    }

    #[test]
    fn an_end_slept_through_is_not_announced() {
        let mut heads_up = HeadsUp::default();
        heads_up.observe(Some(60 * MIN), 0);
        assert_eq!(heads_up.observe(Some(60 * MIN), 61 * MIN), None);
    }

    #[test]
    fn no_end_means_no_heads_up() {
        let mut heads_up = HeadsUp::default();
        heads_up.observe(Some(60 * MIN), 0);
        assert_eq!(heads_up.observe(None, 10 * MIN), None);
        assert_eq!(heads_up.next(), None);
    }

    #[test]
    fn the_phone_hears_which_machine_and_why() {
        let payload: Value =
            serde_json::from_str(&phone_payload("srv", "Studio", "timed", 5 * MIN, 7)).unwrap();
        assert_eq!(payload["target"], "keepAwake");
        assert_eq!(payload["title"], "Studio can sleep in 5 min");
        assert_eq!(payload["body"], "The time you set is running out.");
        assert_eq!(payload["key"], "keepAwake");
        assert_eq!(payload["serverId"], "srv");
    }
}
