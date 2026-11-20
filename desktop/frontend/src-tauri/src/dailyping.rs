// Only a build made with LPM_PING_URL sends the daily ping (the release
// workflow sets it). What a ping says and how it is counted: ping/README.md.

use crate::config;
use chrono::{DateTime, Datelike, NaiveDate, Utc};
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{Duration, Instant};
use tauri::AppHandle;

/// The settings.json switch. Per machine (syncsurface.rs), like crash reports.
pub(crate) const CONSENT_KEY: &str = "dailyPing";

const STAMP_FILE: &str = "daily-ping.json";
const RETRY_AFTER: Duration = Duration::from_secs(15 * 60);
/// A thread's sleep doesn't count down while the computer sleeps, so a settled
/// day looks at the clock again at least this often.
const MAX_NAP: Duration = Duration::from_secs(60 * 60);
/// A first ping this soon after lpm's folder appeared is a new install; later
/// than that it is one from before pings existed.
const NEW_INSTALL_DAYS: i64 = 3;

static BASE: OnceLock<&'static str> = OnceLock::new();
static GATE: Mutex<Gate> = Mutex::new(Gate {
    settled: None,
    tried: None,
});

struct Gate {
    settled: Option<NaiveDate>,
    tried: Option<Instant>,
}

fn gate() -> MutexGuard<'static, Gate> {
    GATE.lock().unwrap_or_else(|e| e.into_inner())
}

fn url() -> Option<&'static str> {
    option_env!("LPM_PING_URL")
        .map(str::trim)
        .filter(|url| !url.is_empty())
}

fn allows(settings: &Value) -> bool {
    settings.get(CONSENT_KEY) != Some(&Value::Bool(false))
}

fn kind() -> &'static str {
    if crate::sys::headless() {
        "host"
    } else {
        "desktop"
    }
}

#[derive(Debug, Default, PartialEq, Serialize, Deserialize)]
struct Stamp {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    last: Option<NaiveDate>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    installed: Option<NaiveDate>,
}

#[derive(Debug, PartialEq)]
struct Ping {
    weekly: bool,
    monthly: bool,
    new: bool,
    cohort: String,
}

/// What today's ping says, or nothing when today's has been sent. A clock set
/// back sends nothing until it passes the last day sent again.
fn due(last: Option<NaiveDate>, installed: NaiveDate, today: NaiveDate) -> Option<Ping> {
    if last.is_some_and(|last| last >= today) {
        return None;
    }
    Some(Ping {
        weekly: last.is_none_or(|last| last.iso_week() != today.iso_week()),
        monthly: last
            .is_none_or(|last| (last.year(), last.month()) != (today.year(), today.month())),
        new: last.is_none() && (today - installed).num_days() < NEW_INSTALL_DAYS,
        cohort: installed.format("%Y-%m").to_string(),
    })
}

fn ping_url(base: &str, ping: &Ping, kind: &str) -> Option<Url> {
    let flag = |on: bool| if on { "1" } else { "0" };
    let version = crate::commands_real::get_version();
    Url::parse_with_params(
        base,
        &[
            ("v", version.as_str()),
            ("os", std::env::consts::OS),
            ("arch", std::env::consts::ARCH),
            ("kind", kind),
            ("w", flag(ping.weekly)),
            ("m", flag(ping.monthly)),
            ("new", flag(ping.new)),
            ("cohort", ping.cohort.as_str()),
        ],
    )
    .ok()
}

/// Whether today's ping is settled: the server counted it, or refused it for
/// good. A busy server or no network leaves it for a later try.
fn send(url: &Url) -> bool {
    let response = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent("lpm")
        .build()
        .and_then(|client| client.get(url.clone()).send());
    match response {
        Ok(r) => {
            let status = r.status();
            status.is_success() || (status.is_client_error() && status.as_u16() != 429)
        }
        Err(_) => false,
    }
}

fn read_stamp(path: &Path) -> Stamp {
    std::fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn folder_born(dir: &Path) -> Option<NaiveDate> {
    let created = std::fs::metadata(dir).and_then(|m| m.created()).ok()?;
    Some(DateTime::<Utc>::from(created).date_naive())
}

/// Send today's ping when it's due and note it once it's settled. Returns
/// whether today is settled.
fn ping_once(
    dir: &Path,
    base: &str,
    kind: &str,
    today: NaiveDate,
    send: impl Fn(&Url) -> bool,
) -> bool {
    let path = dir.join(STAMP_FILE);
    let stamp = read_stamp(&path);
    let installed = stamp
        .installed
        .or_else(|| folder_born(dir))
        .unwrap_or(today)
        .min(today);
    let Some(url) = due(stamp.last, installed, today).and_then(|p| ping_url(base, &p, kind)) else {
        return true;
    };
    if !send(&url) {
        return false;
    }
    let settled = Stamp {
        last: Some(today),
        installed: Some(installed),
    };
    let bytes = serde_json::to_vec(&settled).unwrap_or_default();
    if let Err(e) = crate::fsatomic::write(&path, &bytes, crate::fsatomic::Mode::Preserve(0o644)) {
        eprintln!("warning: could not note today's ping: {e}");
    }
    true
}

/// Today's try, unless today is settled or the last try was too recent.
fn claim(today: NaiveDate) -> Option<&'static str> {
    let base = *BASE.get()?;
    let mut gate = gate();
    if gate.settled == Some(today) || gate.tried.is_some_and(|at| at.elapsed() < RETRY_AFTER) {
        return None;
    }
    gate.tried = Some(Instant::now());
    Some(base)
}

/// A switch turned off settles the day too, so it is read once a day.
fn attempt(base: &str, today: NaiveDate) {
    let settled = !allows(&config::load_settings())
        || ping_once(&config::lpm_dir(), base, kind(), today, send);
    if settled {
        gate().settled = Some(today);
    }
}

/// How long a settled day sleeps: an hour at most, and past midnight by
/// `spread`, so every computer's next ping isn't sent in the same second.
fn nap(now: DateTime<Utc>, spread: Duration) -> Duration {
    now.date_naive()
        .succ_opt()
        .and_then(|day| day.and_hms_opt(0, 0, 0))
        .and_then(|midnight| (midnight.and_utc() - now).to_std().ok())
        .map_or(MAX_NAP, |until| (until + spread).min(MAX_NAP))
}

/// Ping from this app process from now on. Not called while a lesson records.
pub fn start(app: AppHandle) {
    let Some(base) = url() else { return };
    if BASE.set(base).is_err() {
        return;
    }
    let spread = Duration::from_secs(u64::from(std::process::id()) % RETRY_AFTER.as_secs());
    std::thread::spawn(move || loop {
        let now = Utc::now();
        let today = now.date_naive();
        if gate().settled == Some(today) {
            std::thread::sleep(nap(now, spread));
            continue;
        }
        if crate::sys::headless() || crate::statusnotify::window_attended(&app) {
            if let Some(base) = claim(today) {
                attempt(base, today);
            }
        }
        std::thread::sleep(RETRY_AFTER);
    });
}

pub fn used() {
    let today = Utc::now().date_naive();
    if let Some(base) = claim(today) {
        std::thread::spawn(move || attempt(base, today));
    }
}

#[tauri::command]
pub fn daily_ping_available() -> bool {
    url().is_some()
}

#[cfg(test)]
#[path = "dailyping_tests.rs"]
mod tests;
