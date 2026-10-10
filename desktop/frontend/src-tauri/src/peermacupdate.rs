// Updating lpm on a paired Mac from this one.
//
// The Mac installs the release itself (peerupdate.rs on its side); this end asks,
// relays each step it reports as `peer-update-progress`, and waits. No result
// comes back from an install that finished: lpm restarts there and the
// connection drops, so a drop is an outcome of its own rather than a failure.
// Whether it was the restart or the network is for the caller to judge from the
// last step it saw.
use crate::peerclient::{PeerClientHub, PEER_DISCONNECTED};
use serde_json::{json, Value};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

/// Covers the check, the download and the swap on a slow connection; the far
/// end gives up on the download itself well before this.
const UPDATE_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const CANCEL_TIMEOUT: Duration = Duration::from_secs(10);
const UNSUPPORTED: &str =
    "that Mac's lpm is too old to be updated from here — update it there once";

/// What became of an update that didn't fail.
const CANCELLED: &str = "cancelled";
const DISCONNECTED: &str = "disconnected";

pub(crate) fn relay_progress(app: &AppHandle, slug: &str, frame: &Value) {
    let _ = app.emit(
        "peer-update-progress",
        json!({
            "slug": slug,
            "phase": frame.get("phase"),
            "progress": frame.get("progress"),
        }),
    );
}

/// Install the latest lpm on a paired Mac, restarting lpm there. Resolves to
/// "cancelled" or "disconnected".
#[tauri::command]
pub async fn peer_update_mac(
    hub: State<'_, PeerClientHub>,
    slug: String,
) -> Result<String, String> {
    let hub = hub.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        if !hub.supports_self_update(&slug) {
            return Err(UNSUPPORTED.to_string());
        }
        let reply = hub.request_blocking(
            &slug,
            UPDATE_TIMEOUT,
            |req| json!({ "t": "selfUpdate", "reqId": req }),
        );
        outcome(reply).map(str::to_string)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Stop an update on a paired Mac while it is still checking or downloading.
/// False once it has started replacing the app, or when none is running.
#[tauri::command]
pub async fn peer_cancel_mac_update(
    hub: State<'_, PeerClientHub>,
    slug: String,
) -> Result<bool, String> {
    let hub = hub.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        hub.request_blocking(
            &slug,
            CANCEL_TIMEOUT,
            |req| json!({ "t": "selfUpdateCancel", "reqId": req }),
        )
        .map(|v| v.as_bool().unwrap_or(false))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn outcome(reply: Result<Value, String>) -> Result<&'static str, String> {
    match reply {
        Ok(v) if v.get("cancelled").and_then(Value::as_bool) == Some(true) => Ok(CANCELLED),
        Ok(_) => Ok(DISCONNECTED),
        Err(e) if e == PEER_DISCONNECTED => Ok(DISCONNECTED),
        Err(e) => Err(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_cancelled_install_says_so() {
        assert_eq!(outcome(Ok(json!({ "cancelled": true }))), Ok(CANCELLED));
    }

    #[test]
    fn the_connection_dropping_is_not_a_failure() {
        assert_eq!(outcome(Err(PEER_DISCONNECTED.into())), Ok(DISCONNECTED));
    }

    #[test]
    fn a_failure_there_comes_back_as_is() {
        assert_eq!(
            outcome(Err("An update is already in progress.".into())),
            Err("An update is already in progress.".into())
        );
    }
}
