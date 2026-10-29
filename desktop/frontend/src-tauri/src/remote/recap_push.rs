//! Monday's "Your week in lpm is ready", sent on to the phones that asked for
//! it when the desktop shows its own toast. Tapping it opens the phone's
//! weekly recap.
use super::{mac_alert, RemoteHub};
use serde_json::json;

fn recap_alert_payload(server_id: &str, week: &str, title: &str, body: &str, ts: i64) -> String {
    json!({
        "serverId": server_id,
        "target": "recap",
        "week": week,
        "title": title,
        "body": body,
        "ts": ts,
        "key": format!("recap:{week}"),
    })
    .to_string()
}

/// One notification per week (`week` is its Monday): sending it again replaces it.
pub(crate) fn send_weekly_recap(hub: &RemoteHub, week: &str, title: &str, body: &str) {
    if week.is_empty() {
        return;
    }
    mac_alert::send(
        hub,
        &format!("recap:{week}"),
        |device| device.push_weekly_recap,
        |server_id, ts| recap_alert_payload(server_id, week, title, body, ts),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn names_the_week_it_opens() {
        let payload: Value = serde_json::from_str(&recap_alert_payload(
            "srv",
            "2026-10-12",
            "Your week in lpm is ready",
            "31h 20m of agents working for you · Oct 12 – 18",
            7,
        ))
        .unwrap();
        assert_eq!(payload["target"], "recap");
        assert_eq!(payload["week"], "2026-10-12");
        assert_eq!(payload["key"], "recap:2026-10-12");
        assert_eq!(payload["serverId"], "srv");
        assert_eq!(payload["title"], "Your week in lpm is ready");
    }
}
