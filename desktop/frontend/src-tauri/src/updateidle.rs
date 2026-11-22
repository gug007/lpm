// Installing an update once its restart would cut nothing off.
//
// `lpm update` without --now asks for one. An agent that runs it is mid-turn
// itself, so the install waits for that turn to end like any other. The
// "Install updates when idle" setting asks for one on its own, so it also waits
// for nobody to have used the computer for a while and for terminals to be back at
// their prompts (updatebusy.rs).
#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

use crate::updatebusy::{self, Busy};
use crate::updates::{Observer, Target};
use serde::Serialize;
use serde_json::Value;
use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const SCHEDULED_EVENT: &str = "update-scheduled";
const SETTING: &str = "installUpdatesWhenIdle";
/// How soon an asked-for install follows the end of the turn it waits on.
const ASKED_TICK: Duration = Duration::from_secs(5);
const IDLE_TICK: Duration = Duration::from_secs(60);
/// How long nobody has used the Mac before an install nobody asked for.
const AWAY_FOR: Duration = Duration::from_secs(10 * 60);
const FAILURE_BACKOFF: Duration = Duration::from_secs(30 * 60);
const MAX_FAILURES: u32 = 3;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Scheduled {
    pub version: String,
    pub stable: bool,
    /// "2 agents in lpm; 1 action in api"
    pub waiting: String,
    #[serde(skip)]
    places: Vec<Busy>,
}

impl Scheduled {
    fn new(version: String, stable: bool, places: Vec<Busy>) -> Self {
        Scheduled {
            version,
            stable,
            waiting: updatebusy::describe(&places),
            places,
        }
    }
}

/// What the setting's installs have run into, kept by the thread that runs them.
#[derive(Default)]
struct Idle {
    failed_version: String,
    failures: u32,
    retry_at: Option<Instant>,
    /// A release whose install someone cancelled: they were here, and said no.
    declined: String,
}

static PENDING: Mutex<Option<Scheduled>> = Mutex::new(None);
static WAKE: OnceLock<Sender<()>> = OnceLock::new();

pub fn start(app: AppHandle) {
    if !crate::updates::replaces_itself() {
        return;
    }
    let (tx, rx) = channel();
    if WAKE.set(tx).is_err() {
        return;
    }
    std::thread::spawn(move || {
        let mut idle = Idle::default();
        let mut wait = Some(Duration::ZERO);
        loop {
            let woke = match wait {
                Some(after) => {
                    !matches!(rx.recv_timeout(after), Err(RecvTimeoutError::Disconnected))
                }
                None => rx.recv().is_ok(),
            };
            if !woke {
                return;
            }
            while rx.try_recv().is_ok() {}
            wait = tick(&app, &mut idle);
        }
    });
}

/// Look again now: an install was asked for, or the setting may have changed.
pub fn nudge() {
    if let Some(wake) = WAKE.get() {
        let _ = wake.send(());
    }
}

/// Install `version` once nothing in `places` is busy any more.
pub fn schedule(app: &AppHandle, target: Target, version: String, places: Vec<Busy>) -> Scheduled {
    let scheduled = Scheduled::new(version, target == Target::Stable, places);
    publish(app, Some(scheduled.clone()));
    nudge();
    scheduled
}

/// The Update button's "When agents finish": what `lpm update` does while an
/// agent is mid-turn. With none busy it installs on the next look.
#[cfg(any(target_os = "macos", windows))]
#[tauri::command(async)]
pub fn schedule_update(app: AppHandle) -> Result<Scheduled, String> {
    let version = crate::updates::pending_version(Target::Newest)?
        .ok_or_else(|| "You're already on the latest version.".to_string())?;
    let places = updatebusy::busy(&app, false);
    Ok(schedule(&app, Target::Newest, version, places))
}

#[cfg(not(any(target_os = "macos", windows)))]
#[tauri::command(async)]
pub fn schedule_update(_app: AppHandle) -> Result<Scheduled, String> {
    Err("This lpm doesn't update itself.".into())
}

pub fn cancel(app: &AppHandle) -> bool {
    let had = PENDING.lock().unwrap().is_some();
    publish(app, None);
    had
}

#[tauri::command(async)]
pub fn scheduled_update() -> Option<Scheduled> {
    PENDING.lock().unwrap().clone()
}

#[tauri::command(async)]
pub fn cancel_scheduled_update(app: AppHandle) -> bool {
    cancel(&app)
}

fn publish(app: &AppHandle, next: Option<Scheduled>) {
    let mut pending = PENDING.lock().unwrap();
    if *pending != next {
        *pending = next.clone();
        let _ = app.emit(SCHEDULED_EVENT, next);
    }
}

/// [`publish`], unless the pending install changed since `seen` was read: it
/// was cancelled or asked for again meanwhile.
fn advance(app: &AppHandle, seen: &Scheduled, next: Option<Scheduled>) -> bool {
    let mut pending = PENDING.lock().unwrap();
    if pending.as_ref() != Some(seen) {
        return false;
    }
    *pending = next.clone();
    let _ = app.emit(SCHEDULED_EVENT, next);
    true
}

/// One look; returns how soon to look again, or None to wait for a nudge.
fn tick(app: &AppHandle, idle: &mut Idle) -> Option<Duration> {
    if crate::updates::installing(&app.state()) {
        return Some(ASKED_TICK);
    }
    let Some(pending) = PENDING.lock().unwrap().clone() else {
        return idle_tick(app, idle);
    };
    let places = updatebusy::busy(app, false);
    if !places.is_empty() {
        if places != pending.places {
            let next = Scheduled::new(pending.version.clone(), pending.stable, places);
            advance(app, &pending, Some(next));
        }
    } else if advance(app, &pending, None) {
        let target = if pending.stable {
            Target::Stable
        } else {
            Target::Newest
        };
        let _ = install(app, target, None);
    }
    Some(ASKED_TICK)
}

fn idle_tick(app: &AppHandle, idle: &mut Idle) -> Option<Duration> {
    if !enabled() || crate::updates::current_version() == "dev" {
        return None;
    }
    let away = away_for();
    if away < AWAY_FOR {
        return Some(AWAY_FOR - away);
    }
    if idle.retry_at.is_some_and(|at| Instant::now() < at)
        || !updatebusy::busy(app, true).is_empty()
    {
        return Some(IDLE_TICK);
    }
    let version = match crate::remote_update::recent_check(false) {
        Ok(info) if info.update_avail => info.latest_version,
        _ => return Some(IDLE_TICK),
    };
    let gave_up = version == idle.failed_version && idle.failures >= MAX_FAILURES;
    if version == idle.declined || gave_up {
        return Some(IDLE_TICK);
    }
    match install(app, Target::Newest, None) {
        Ok(_) => idle.declined = version,
        Err(_) => {
            if idle.failed_version != version {
                idle.failed_version = version;
                idle.failures = 0;
            }
            idle.failures += 1;
            idle.retry_at = Some(Instant::now() + FAILURE_BACKOFF);
        }
    }
    Some(IDLE_TICK)
}

fn enabled() -> bool {
    crate::config::load_settings()
        .get(SETTING)
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

/// Install now. Returns only when it stopped short: cancelled (Ok) or failed.
#[cfg(any(target_os = "macos", windows))]
pub(crate) fn install(
    app: &AppHandle,
    target: Target,
    observer: Option<Observer>,
) -> Result<bool, String> {
    crate::updates::install_observed(app, observer, target)
}

#[cfg(not(any(target_os = "macos", windows)))]
pub(crate) fn install(
    _app: &AppHandle,
    _target: Target,
    _observer: Option<Observer>,
) -> Result<bool, String> {
    Err("This lpm doesn't update itself.".into())
}

/// How long since anyone used the keyboard, mouse or trackpad.
#[cfg(target_os = "macos")]
fn away_for() -> Duration {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(state: i32, event_type: u32) -> f64;
    }
    const COMBINED_SESSION_STATE: i32 = 0;
    const ANY_INPUT_EVENT: u32 = u32::MAX;
    let secs =
        unsafe { CGEventSourceSecondsSinceLastEventType(COMBINED_SESSION_STATE, ANY_INPUT_EVENT) };
    if secs.is_finite() && secs > 0.0 {
        Duration::from_secs_f64(secs)
    } else {
        Duration::ZERO
    }
}

#[cfg(windows)]
fn away_for() -> Duration {
    use windows_sys::Win32::System::SystemInformation::GetTickCount;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    let mut last = LASTINPUTINFO {
        cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
        dwTime: 0,
    };
    if unsafe { GetLastInputInfo(&mut last) } == 0 {
        return Duration::ZERO;
    }
    Duration::from_millis(u64::from(
        unsafe { GetTickCount() }.wrapping_sub(last.dwTime),
    ))
}

#[cfg(not(any(target_os = "macos", windows)))]
fn away_for() -> Duration {
    Duration::ZERO
}
