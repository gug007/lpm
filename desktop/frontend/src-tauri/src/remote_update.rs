// Updating lpm on this computer from a paired phone: the `updateCheck`,
// `updateInstall` and `updateCancel` verbs behind lpm Link's update bar.
//
// The phone runs the same install as the app's own Update button. Every step of
// every install, whoever started it, goes to all phones as `updateProgress`: a
// locked phone drops its socket long before a download finishes, and the one
// that comes back asks `updateCheck` to catch up. A finished install restarts
// lpm, so a phone learns it landed from the version on its next `ready`.
#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

use crate::updatechannel::Channel;
use crate::updates::UpdateInfo;
use serde_json::{json, Value};
use std::sync::mpsc::SyncSender;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

/// A phone asks on every connect; GitHub answers 60 unauthenticated checks an
/// hour, shared with the app's own. A phone's Check for Updates (`force`) skips it.
const CHECK_MAX_AGE: Duration = Duration::from_secs(60 * 60);
const UNSUPPORTED: &str = "lpm on this machine can't be updated from a phone.";

#[derive(Clone, Copy, PartialEq, Debug)]
struct Step {
    phase: &'static str,
    progress: i64,
}

const IDLE: Step = Step {
    phase: "idle",
    progress: -1,
};

static STEP: Mutex<Step> = Mutex::new(IDLE);
static LAST_CHECK: Mutex<Option<(Instant, UpdateInfo)>> = Mutex::new(None);

/// Only a release build that replaces itself: macOS, or Windows from the installer.
pub(crate) fn offered() -> bool {
    crate::peerupdate::advertised() && crate::updates::current_version() != "dev"
}

/// Adds what a phone needs to offer an update to a `ready` or `paired` frame.
pub(crate) fn with_build(mut frame: Value) -> Value {
    frame["version"] = json!(crate::updates::current_version());
    frame["selfUpdate"] = json!(offered());
    frame
}

pub fn handle(app: &AppHandle, out: &SyncSender<String>, t: &str, v: &Value) {
    let verb = t.to_string();
    let force = v["force"].as_bool().unwrap_or(false);
    if !offered() {
        let _ = out.try_send(json!({ "t": verb, "ok": false, "error": UNSUPPORTED }).to_string());
        return;
    }
    let app = app.clone();
    let out = out.clone();
    std::thread::spawn(move || {
        let mut reply = match verb.as_str() {
            "updateCheck" => check(force),
            "updateInstall" => install(&app),
            _ => json!({ "ok": true, "stopping": crate::updates::cancel_update(app.state()) }),
        };
        reply["t"] = json!(verb);
        let _ = out.try_send(reply.to_string());
    });
}

/// The release this Mac could move to, and the install running now, if any.
fn check(force: bool) -> Value {
    let mut reply = match recent_check(force) {
        Ok(info) => json!({
            "ok": true,
            "currentVersion": info.current_version,
            "latestVersion": info.latest_version,
            "updateAvail": info.update_avail,
        }),
        Err(e) => json!({ "ok": false, "error": e }),
    };
    let step = *STEP.lock().unwrap();
    reply["phase"] = json!(step.phase);
    reply["progress"] = json!(step.progress);
    reply
}

/// A cached answer stands only for the update channel it was asked on.
pub(crate) fn recent_check(force: bool) -> Result<UpdateInfo, String> {
    if !force {
        if let Some((at, info)) = &*LAST_CHECK.lock().unwrap() {
            if at.elapsed() < CHECK_MAX_AGE && info.channel == Channel::current().as_str() {
                return Ok(info.clone());
            }
        }
    }
    let info = crate::updates::check_for_update()?;
    *LAST_CHECK.lock().unwrap() = Some((Instant::now(), info.clone()));
    Ok(info)
}

/// Returns only when the install stopped short; a finished one restarts lpm.
fn install(app: &AppHandle) -> Value {
    #[cfg(any(target_os = "macos", windows))]
    let result = crate::updates::install_for_peer(app, None);
    #[cfg(not(any(target_os = "macos", windows)))]
    let result: Result<bool, String> = {
        let _ = app;
        Err(UNSUPPORTED.into())
    };
    match result {
        Ok(cancelled) => json!({ "ok": true, "cancelled": cancelled }),
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

/// Passes one step of an install on to every phone, as the whole state.
pub(crate) fn relay(app: &AppHandle, event: &str, payload: &Value) {
    let Some(next) = advance(event, payload) else {
        return;
    };
    *STEP.lock().unwrap() = next;
    crate::remote::broadcast_frame(
        app,
        json!({ "t": "updateProgress", "phase": next.phase, "progress": next.progress }),
    );
}

fn advance(event: &str, payload: &Value) -> Option<Step> {
    match event {
        "update-status" => {
            let phase = match payload.as_str()? {
                "checking" => "checking",
                "downloading" => "downloading",
                "installing" => "installing",
                "idle" => "idle",
                _ => return None,
            };
            Some(Step {
                phase,
                progress: -1,
            })
        }
        "update-progress" => Some(Step {
            phase: "downloading",
            progress: payload.as_i64()?,
        }),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_status_starts_its_phase_with_no_progress() {
        assert_eq!(
            advance("update-status", &json!("downloading")),
            Some(Step {
                phase: "downloading",
                progress: -1
            })
        );
        assert_eq!(advance("update-status", &json!("idle")), Some(IDLE));
    }

    #[test]
    fn a_percent_is_the_download_moving() {
        assert_eq!(
            advance("update-progress", &json!(42)),
            Some(Step {
                phase: "downloading",
                progress: 42
            })
        );
    }

    #[test]
    fn anything_else_is_not_a_step() {
        assert_eq!(advance("update-status", &json!("restarting")), None);
        assert_eq!(advance("update-available", &json!({})), None);
        assert_eq!(advance("update-progress", &json!("42")), None);
    }

    #[test]
    fn the_build_rides_the_frame() {
        let frame = with_build(json!({ "t": "ready" }));
        assert_eq!(frame["version"], json!(crate::updates::current_version()));
        assert_eq!(frame["selfUpdate"], json!(offered()));
        assert_eq!(frame["t"], "ready");
    }
}
