//! A notification about this Mac rather than one of its projects: the weekly
//! recap, a limit reminder.
use super::{
    alert_recipients, on_screen_devices, push_collapse_id, scoped_devices, send_alerts, PushDevice,
    RemoteHub,
};
use crate::remotestore::load_config;
use std::sync::atomic::Ordering;

/// Sends the payload `build` makes from the server id and the time to every
/// phone that `wants` it and isn't showing the app right now. Sending one with
/// the same `key` again replaces it.
pub(super) fn send(
    hub: &RemoteHub,
    key: &str,
    wants: impl Fn(&PushDevice) -> bool,
    build: impl FnOnce(&str, i64) -> String,
) {
    if !hub.inner.enabled.load(Ordering::Relaxed) || !hub.inner.running.load(Ordering::Relaxed) {
        return;
    }
    let connected = on_screen_devices(hub);
    let cfg = load_config();
    let server_id = cfg.flavor_server_id();
    let recipients: Vec<PushDevice> = alert_recipients(&scoped_devices(&cfg), &connected)
        .into_iter()
        .filter(|device| wants(device))
        .collect();
    if recipients.is_empty() {
        return;
    }
    let plaintext = build(&server_id, crate::status::now_millis());
    let collapse_id = push_collapse_id(&server_id, "", key);
    send_alerts(hub, cfg.effective_relay(), recipients, plaintext, collapse_id);
}
