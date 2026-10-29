//! Reminders that a usage limit has reset, set from the desktop's Usage page or
//! a phone's Usage screen. The list and the clock live here, so a reminder set
//! anywhere fires once: a banner on this machine and a notification on every
//! paired phone. The file is the only copy, read on every change, because a dev
//! build and the app share it; only the copy holding the lock beside it fires.
use crate::agent_limits::now_secs;
use crate::config;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub const CHANGED_EVENT: &str = "limit-reminders-changed";

/// Short waits against the wall clock, so a Mac waking from sleep fires a
/// reminder that came due while it slept within one tick.
const TICK: Duration = Duration::from_secs(20);

/// A window's reset time is the tool's own; give its servers a moment past it.
const AFTER_RESET_SECS: i64 = 30;

const WINDOWS: [&str; 2] = ["fiveHour", "weekly"];

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LimitReminder {
    /// The usage-limits key: `claude:<account>` or `codex`.
    pub limit: String,
    /// `fiveHour` or `weekly`.
    pub window: String,
    /// Unix seconds, as the tool reported the window's reset.
    pub resets_at: i64,
    /// What the screen that set it calls the limit ("Claude", "Codex", "Work").
    pub name: String,
}

/// Serializes read-modify-write on the file within this process.
static FILE_LOCK: Mutex<()> = Mutex::new(());

fn store_path() -> PathBuf {
    config::lpm_dir().join("limit-reminders.json")
}

fn load() -> Vec<LimitReminder> {
    std::fs::read(store_path())
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

fn save(items: &[LimitReminder]) -> Result<(), String> {
    let data = serde_json::to_vec_pretty(items).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(config::lpm_dir()).map_err(|e| e.to_string())?;
    crate::fsatomic::write(&store_path(), &data, crate::fsatomic::Mode::Preserve(0o600))
        .map_err(|e| e.to_string())
}

/// The reminder a request asks for, or why it can't be set.
fn validate(limit: &str, window: &str, resets_at: i64, name: &str, now: i64) -> Result<LimitReminder, String> {
    let limit = limit.trim();
    if limit.is_empty() || limit.len() > 200 {
        return Err("That limit isn't one lpm knows.".into());
    }
    if !WINDOWS.contains(&window) {
        return Err("That limit window isn't one lpm knows.".into());
    }
    if resets_at <= now {
        return Err("That limit has already reset.".into());
    }
    let name: String = name.trim().chars().take(80).collect();
    Ok(LimitReminder {
        limit: limit.to_string(),
        window: window.to_string(),
        resets_at,
        name: if name.is_empty() { limit.to_string() } else { name },
    })
}

/// Adds `reminder`, replacing the one for the same limit and window.
fn upsert(items: &mut Vec<LimitReminder>, reminder: LimitReminder) {
    items.retain(|r| !(r.limit == reminder.limit && r.window == reminder.window));
    items.push(reminder);
    items.sort_by_key(|r| r.resets_at);
}

fn remove(items: &mut Vec<LimitReminder>, limit: &str, window: &str) -> bool {
    let before = items.len();
    items.retain(|r| !(r.limit == limit && r.window == window));
    items.len() != before
}

/// Splits off the reminders whose reset has passed.
fn take_due(items: &mut Vec<LimitReminder>, now: i64) -> Vec<LimitReminder> {
    let (due, waiting): (Vec<_>, Vec<_>) = std::mem::take(items)
        .into_iter()
        .partition(|r| r.resets_at + AFTER_RESET_SECS <= now);
    *items = waiting;
    due
}

/// What the banner and the phone notification say.
pub(crate) fn wording(reminder: &LimitReminder) -> (String, String) {
    let window = if reminder.window == "weekly" { "weekly" } else { "5-hour" };
    (
        reminder.name.clone(),
        format!("The {window} limit has reset. You can pick up where you left off."),
    )
}

fn changed(app: &AppHandle, items: &[LimitReminder]) {
    let _ = app.emit(CHANGED_EVENT, items);
}

pub(crate) fn list() -> Vec<LimitReminder> {
    let _guard = FILE_LOCK.lock().unwrap();
    load()
}

pub(crate) fn set(
    app: &AppHandle,
    limit: &str,
    window: &str,
    resets_at: i64,
    name: &str,
) -> Result<Vec<LimitReminder>, String> {
    let reminder = validate(limit, window, resets_at, name, now_secs())?;
    let items = {
        let _guard = FILE_LOCK.lock().unwrap();
        let mut items = load();
        upsert(&mut items, reminder);
        save(&items)?;
        items
    };
    changed(app, &items);
    Ok(items)
}

pub(crate) fn clear(app: &AppHandle, limit: &str, window: &str) -> Result<Vec<LimitReminder>, String> {
    let items = {
        let _guard = FILE_LOCK.lock().unwrap();
        let mut items = load();
        if !remove(&mut items, limit, window) {
            return Ok(items);
        }
        save(&items)?;
        items
    };
    changed(app, &items);
    Ok(items)
}

#[tauri::command(async)]
pub fn limit_reminders() -> Vec<LimitReminder> {
    list()
}

#[tauri::command(async)]
pub fn set_limit_reminder(
    app: AppHandle,
    limit: String,
    window: String,
    resets_at: i64,
    name: String,
) -> Result<Vec<LimitReminder>, String> {
    set(&app, &limit, &window, resets_at, &name)
}

#[tauri::command(async)]
pub fn clear_limit_reminder(
    app: AppHandle,
    limit: String,
    window: String,
) -> Result<Vec<LimitReminder>, String> {
    clear(&app, &limit, &window)
}

/// An exclusive lock beside the list, or None when another copy of lpm holds it
/// and fires the reminders.
fn take_fire_lock() -> Option<crate::daemonize::Lock> {
    std::fs::create_dir_all(config::lpm_dir()).ok()?;
    crate::daemonize::acquire(&config::lpm_dir().join("limit-reminders.lock"))
}

/// Fires reminders as they come due, for as long as the app runs.
pub fn start(app: AppHandle) {
    std::thread::Builder::new()
        .name("limit-reminders".into())
        .spawn(move || {
            let mut lock = None;
            loop {
                if lock.is_none() {
                    lock = take_fire_lock();
                }
                if lock.is_some() {
                    fire_due(&app);
                }
                std::thread::sleep(TICK);
            }
        })
        .ok();
}

fn fire_due(app: &AppHandle) {
    let (due, items) = {
        let _guard = FILE_LOCK.lock().unwrap();
        let mut items = load();
        let due = take_due(&mut items, now_secs());
        if due.is_empty() || save(&items).is_err() {
            return;
        }
        (due, items)
    };
    for reminder in &due {
        let (title, body) = wording(reminder);
        crate::statusnotify::notify(app, &title, &body);
        crate::remote::push_limit_reminder(app, reminder, &title, &body);
    }
    changed(app, &items);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reminder(limit: &str, window: &str, resets_at: i64) -> LimitReminder {
        LimitReminder {
            limit: limit.into(),
            window: window.into(),
            resets_at,
            name: "Claude".into(),
        }
    }

    #[test]
    fn validate_checks_the_window_and_the_time() {
        assert!(validate("claude:work", "fiveHour", 2_000, "Work", 1_000).is_ok());
        assert!(validate("codex", "weekly", 2_000, "Codex", 1_000).is_ok());
        assert_eq!(
            validate("codex", "daily", 2_000, "Codex", 1_000).unwrap_err(),
            "That limit window isn't one lpm knows."
        );
        assert_eq!(
            validate("codex", "weekly", 1_000, "Codex", 1_000).unwrap_err(),
            "That limit has already reset."
        );
        assert!(validate("  ", "weekly", 2_000, "", 1_000).is_err());
        let unnamed = validate("codex", "weekly", 2_000, "  ", 1_000).unwrap();
        assert_eq!(unnamed.name, "codex");
    }

    #[test]
    fn one_reminder_per_limit_and_window() {
        let mut items = Vec::new();
        upsert(&mut items, reminder("claude:work", "fiveHour", 300));
        upsert(&mut items, reminder("claude:work", "weekly", 900));
        upsert(&mut items, reminder("claude:work", "fiveHour", 200));
        upsert(&mut items, reminder("codex", "fiveHour", 100));
        assert_eq!(items.len(), 3);
        assert_eq!(
            items.iter().map(|r| r.resets_at).collect::<Vec<_>>(),
            [100, 200, 900],
            "kept in the order they fire"
        );
        assert!(remove(&mut items, "claude:work", "weekly"));
        assert!(!remove(&mut items, "claude:work", "weekly"));
        assert_eq!(items.len(), 2);
    }

    #[test]
    fn due_reminders_wait_past_the_reset() {
        let mut items = vec![reminder("codex", "fiveHour", 1_000), reminder("claude:a", "weekly", 5_000)];
        assert!(take_due(&mut items, 1_000).is_empty(), "the servers get a moment");
        let due = take_due(&mut items, 1_000 + AFTER_RESET_SECS);
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].limit, "codex");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].limit, "claude:a");
    }

    #[test]
    fn wording_names_the_limit_and_window() {
        let (title, body) = wording(&reminder("codex", "weekly", 1));
        assert_eq!(title, "Claude");
        assert_eq!(body, "The weekly limit has reset. You can pick up where you left off.");
        let (_, body) = wording(&reminder("codex", "fiveHour", 1));
        assert!(body.starts_with("The 5-hour limit"));
    }
}
