// The socket verbs behind `lpm update`. They run the same check and install as
// the app's Update button; an install nobody said to start now waits for
// agents to finish their turns (updateidle.rs).
#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

use crate::ipc::UnixStream;
use crate::updateidle::Scheduled;
use crate::updates::{Observer, Target};
use serde_json::{json, Value};
use std::io::Write;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};

/// `update_check` → the release check, the build the services run on, and any
/// install waiting to start. A check that fails says why in `error`; the rest
/// is this machine's own and still answers.
pub fn cmd_update_check() -> String {
    let mut reply = match crate::updates::check_for_update() {
        Ok(info) => serde_json::to_value(info).unwrap_or_default(),
        Err(e) => json!({
            "currentVersion": crate::updates::current_version(),
            "error": e,
        }),
    };
    reply["services"] = json!(crate::servicesbuild::services_build());
    reply["scheduled"] = json!(crate::updateidle::scheduled_update());
    reply.to_string()
}

enum Plan {
    Current(String),
    Waiting(Scheduled),
    Install(String),
}

/// `update_install [--now] [--stable]` → one JSON line, unless it installs:
/// then `PROGRESS` lines follow the steps, and the connection closes when the
/// app restarts, or ends with `ERROR:` or a cancelled state.
pub fn cmd_update_install(
    args: &[String],
    app: &AppHandle,
    w: &mut UnixStream,
) -> std::io::Result<()> {
    let (_, options) = crate::socketsrv::parse_options(args);
    let target = if options.contains_key("stable") {
        Target::Stable
    } else {
        Target::Newest
    };
    let version = match plan(app, target, options.contains_key("now")) {
        Err(e) => return writeln!(w, "ERROR: {e}"),
        Ok(Plan::Current(version)) => {
            return writeln!(w, "{}", json!({ "state": "current", "version": version }))
        }
        Ok(Plan::Waiting(scheduled)) => {
            let mut reply = json!(scheduled);
            reply["state"] = json!("scheduled");
            return writeln!(w, "{reply}");
        }
        Ok(Plan::Install(version)) => version,
    };
    writeln!(w, "PROGRESS start {version}")?;
    let result = crate::updateidle::install(app, target, Some(progress_lines(w.try_clone()?)));
    match result {
        Ok(true) => writeln!(w, "{}", json!({ "state": "cancelled", "version": version })),
        Ok(false) => writeln!(w, "{}", json!({ "state": "installed", "version": version })),
        Err(e) => writeln!(w, "ERROR: {e}"),
    }
}

fn progress_lines(sink: UnixStream) -> Observer {
    let sink = Mutex::new(sink);
    Arc::new(move |event, payload| {
        let line = match (event, &payload) {
            ("update-status", Value::String(phase)) if phase != "idle" => {
                format!("PROGRESS {phase}")
            }
            ("update-progress", Value::Number(pct)) => format!("PROGRESS downloading {pct}"),
            _ => return,
        };
        let _ = writeln!(sink.lock().unwrap(), "{line}");
    })
}

#[cfg(any(target_os = "macos", windows))]
fn plan(app: &AppHandle, target: Target, now: bool) -> Result<Plan, String> {
    if !crate::updates::replaces_itself() {
        return notice(target);
    }
    if crate::updates::current_version() == "dev" {
        return Err(crate::updates::DEV_BUILD.into());
    }
    let Some(version) = crate::updates::pending_version(target)? else {
        return Ok(Plan::Current(crate::updates::current_version()));
    };
    let places = crate::updatebusy::busy(app, false);
    if !now && !places.is_empty() {
        let scheduled = crate::updateidle::schedule(app, target, version, places);
        return Ok(Plan::Waiting(scheduled));
    }
    crate::updateidle::cancel(app);
    Ok(Plan::Install(version))
}

#[cfg(not(any(target_os = "macos", windows)))]
fn plan(_app: &AppHandle, target: Target, _now: bool) -> Result<Plan, String> {
    notice(target)
}

/// Where lpm doesn't replace itself: says where the new release is.
fn notice(target: Target) -> Result<Plan, String> {
    let info = crate::updates::check_for_update()?;
    if target == Target::Stable || !info.update_avail {
        return Ok(Plan::Current(info.current_version));
    }
    Err(match info.download_url {
        Some(url) => format!(
            "This lpm doesn't install updates by itself. Download lpm {} from {url}",
            info.latest_version
        ),
        None => format!(
            "lpm {} is out. Install it the way you installed lpm.",
            info.latest_version
        ),
    })
}

/// `update_cancel` → stop an install waiting to start, or one still checking
/// or downloading.
pub fn cmd_update_cancel(app: &AppHandle) -> String {
    let waiting = crate::updateidle::cancel(app);
    let running = crate::updates::cancel_update(app.state());
    json!({ "ok": true, "cancelled": waiting || running }).to_string()
}

/// `services_build` → the build the services run on.
pub fn cmd_services_build() -> String {
    json!(crate::servicesbuild::services_build()).to_string()
}

/// `restart_services` → every service stopped and started again on this build.
pub fn cmd_restart_services(app: &AppHandle) -> String {
    let state = app.state::<crate::services::ServiceState>();
    match crate::servicesbuild::restart(app, &state) {
        Ok(()) => {
            json!({ "ok": true, "services": crate::servicesbuild::services_build() }).to_string()
        }
        Err(e) => format!("ERROR: {e}"),
    }
}
