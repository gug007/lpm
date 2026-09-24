//! Prompts the user scheduled to send later. The list and the clock live here so
//! a hidden or throttled window can't make a prompt late: this side decides when
//! each one is due — or missed, when the Mac slept or lpm was closed past its
//! time — and the main window does the typing, since pasting into a terminal
//! lives there.

use crate::config;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

pub const CHANGED_EVENT: &str = "send-later-changed";

const GONE: &str = "That prompt is no longer scheduled.";

/// How late a prompt may still go out. Past this the Mac was asleep or lpm was
/// closed at its time, and a prompt typed long after the moment it was meant for
/// can land in the wrong conversation, so it waits for the user instead.
const GRACE_MS: i64 = 5 * 60 * 1000;

/// The longest single wait. The monotonic clock stops while the Mac sleeps, so a
/// long wait would fire late by the length of the nap; short waits checked
/// against the wall clock notice a missed time within a minute of waking.
const TICK: Duration = Duration::from_secs(60);

/// Image copies outlive their prompt this long: a sent prompt's history entry,
/// or the draft a closed terminal's prompt became, still points at them.
const IMAGE_RETENTION: Duration = Duration::from_secs(30 * 24 * 60 * 60);

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PromptState {
    Scheduled,
    Due,
    Missed,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledPrompt {
    pub id: String,
    pub project_name: String,
    /// The terminal tab's persisted key; its pty id changes on every launch.
    pub history_key: String,
    #[serde(default)]
    pub terminal_label: String,
    pub text: String,
    #[serde(default)]
    pub images: BTreeMap<String, String>,
    pub due_at: i64,
    pub created_at: i64,
    pub state: PromptState,
    /// "limit" when it was set for the agent's usage limit to reset, else "time".
    #[serde(default)]
    pub kind: String,
    /// Send now: goes out without waiting for the agent to finish its turn.
    #[serde(default)]
    pub force: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewPrompt {
    pub project_name: String,
    pub history_key: String,
    #[serde(default)]
    pub terminal_label: String,
    pub text: String,
    #[serde(default)]
    pub images: BTreeMap<String, String>,
    pub due_at: i64,
    #[serde(default)]
    pub kind: String,
}

#[derive(Default)]
pub struct SendLaterStore {
    items: Mutex<Vec<ScheduledPrompt>>,
    wake: Mutex<Option<Sender<()>>>,
}

impl SendLaterStore {
    /// Apply a change, persist it, tell every window, and let the clock thread
    /// re-plan its next wake-up around the new list.
    fn mutate<T>(
        &self,
        app: &AppHandle,
        change: impl FnOnce(&mut Vec<ScheduledPrompt>) -> T,
    ) -> T {
        let (out, list) = {
            let mut items = self.items.lock().unwrap();
            let out = change(&mut items);
            save(&items);
            (out, items.clone())
        };
        let _ = app.emit(CHANGED_EVENT, list);
        if let Some(tx) = self.wake.lock().unwrap().as_ref() {
            let _ = tx.send(());
        }
        out
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn store_path() -> PathBuf {
    config::lpm_dir().join("send-later.json")
}

fn images_root() -> PathBuf {
    config::lpm_dir().join("send-later")
}

fn load() -> Vec<ScheduledPrompt> {
    std::fs::read(store_path())
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

fn save(items: &[ScheduledPrompt]) {
    let Ok(data) = serde_json::to_vec_pretty(items) else {
        return;
    };
    if std::fs::create_dir_all(config::lpm_dir()).is_err() {
        return;
    }
    if let Err(e) = crate::fsatomic::write(
        &store_path(),
        &data,
        crate::fsatomic::Mode::Preserve(0o600),
    ) {
        eprintln!("send later: couldn't save the schedule: {e}");
    }
}

/// Move every prompt whose time has come to Due, or to Missed when the tick that
/// noticed it came too late for it to count as on time.
fn settle(items: &mut [ScheduledPrompt], now: i64) -> bool {
    let mut changed = false;
    for item in items.iter_mut() {
        if item.state != PromptState::Scheduled || item.due_at > now {
            continue;
        }
        item.state = if now - item.due_at > GRACE_MS {
            PromptState::Missed
        } else {
            PromptState::Due
        };
        changed = true;
    }
    changed
}

/// On launch lpm was, by definition, closed for a while: anything already past
/// its time, and anything that was still waiting on its agent, is Missed.
fn settle_after_launch(items: &mut [ScheduledPrompt], now: i64) -> bool {
    let mut changed = false;
    for item in items.iter_mut() {
        let overdue = item.state == PromptState::Scheduled && now - item.due_at > GRACE_MS;
        if overdue || item.state == PromptState::Due {
            item.state = PromptState::Missed;
            item.force = false;
            changed = true;
        }
    }
    changed
}

/// How long to sleep before the next prompt comes due; None when nothing is
/// scheduled, so an empty list costs no wake-ups at all.
fn next_wait(items: &[ScheduledPrompt], now: i64) -> Option<Duration> {
    items
        .iter()
        .filter(|i| i.state == PromptState::Scheduled)
        .map(|i| (i.due_at - now).max(0) as u64)
        .min()
        .map(Duration::from_millis)
}

/// Copy the prompt's images somewhere that lasts: pasted images sit in the temp
/// directory, which lpm clears of anything older than a day. A path that isn't
/// a file here (a peer Mac's upload, an image already gone) is kept as it is.
fn keep_images(id: &str, images: &BTreeMap<String, String>) -> BTreeMap<String, String> {
    let dir = images_root().join(id);
    images
        .iter()
        .map(|(token, path)| {
            let src = Path::new(path);
            let kept = src
                .file_name()
                .filter(|_| src.is_file())
                .and_then(|name| {
                    std::fs::create_dir_all(&dir).ok()?;
                    let dest = dir.join(format!("{token}-{}", name.to_string_lossy()));
                    std::fs::copy(src, &dest).ok()?;
                    Some(dest.to_string_lossy().into_owned())
                });
            (token.clone(), kept.unwrap_or_else(|| path.clone()))
        })
        .collect()
}

fn prune_image_dirs(live: &HashSet<String>) {
    let Ok(entries) = std::fs::read_dir(images_root()) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if live.contains(&name) {
            continue;
        }
        let stale = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|m| m.elapsed().ok())
            .is_some_and(|age| age > IMAGE_RETENTION);
        if stale {
            let _ = std::fs::remove_dir_all(entry.path());
        }
    }
}

pub fn start(app: AppHandle) {
    let store = app.state::<Arc<SendLaterStore>>().inner().clone();
    let (tx, rx) = mpsc::channel::<()>();
    *store.wake.lock().unwrap() = Some(tx);
    {
        let mut items = store.items.lock().unwrap();
        *items = load();
        if settle_after_launch(&mut items, now_ms()) {
            save(&items);
        }
    }
    std::thread::spawn(move || {
        let live: HashSet<String> = store.items.lock().unwrap().iter().map(|i| i.id.clone()).collect();
        prune_image_dirs(&live);
        loop {
            let (changed, wait) = {
                let mut items = store.items.lock().unwrap();
                let now = now_ms();
                let changed = settle(&mut items, now);
                if changed {
                    save(&items);
                }
                (changed.then(|| items.clone()), next_wait(&items, now))
            };
            if let Some(list) = changed {
                let _ = app.emit(CHANGED_EVENT, list);
            }
            let woke = match wait {
                Some(d) => rx.recv_timeout(d.min(TICK)),
                None => rx.recv().map_err(|_| RecvTimeoutError::Disconnected),
            };
            if let Err(RecvTimeoutError::Disconnected) = woke {
                break;
            }
        }
    });
}

#[tauri::command(async)]
pub fn send_later_list(store: State<'_, Arc<SendLaterStore>>) -> Vec<ScheduledPrompt> {
    store.items.lock().unwrap().clone()
}

#[tauri::command(async)]
pub fn send_later_add(
    app: AppHandle,
    store: State<'_, Arc<SendLaterStore>>,
    prompt: NewPrompt,
) -> Result<ScheduledPrompt, String> {
    if prompt.text.trim().is_empty() {
        return Err("There's nothing to send.".into());
    }
    let id = uuid::Uuid::new_v4().to_string();
    let item = ScheduledPrompt {
        images: keep_images(&id, &prompt.images),
        id,
        project_name: prompt.project_name,
        history_key: prompt.history_key,
        terminal_label: prompt.terminal_label,
        text: prompt.text,
        due_at: prompt.due_at,
        created_at: now_ms(),
        state: PromptState::Scheduled,
        kind: if prompt.kind.is_empty() { "time".into() } else { prompt.kind },
        force: false,
    };
    store.mutate(&app, |items| items.push(item.clone()));
    Ok(item)
}

#[tauri::command(async)]
pub fn send_later_reschedule(
    app: AppHandle,
    store: State<'_, Arc<SendLaterStore>>,
    id: String,
    due_at: i64,
    kind: Option<String>,
) -> Result<(), String> {
    store.mutate(&app, |items| -> Result<(), String> {
        let item = items
            .iter_mut()
            .find(|i| i.id == id)
            .ok_or_else(|| GONE.to_string())?;
        item.due_at = due_at;
        item.state = PromptState::Scheduled;
        item.force = false;
        if let Some(kind) = kind {
            item.kind = kind;
        }
        Ok(())
    })
}

#[tauri::command(async)]
pub fn send_later_send_now(
    app: AppHandle,
    store: State<'_, Arc<SendLaterStore>>,
    id: String,
) -> Result<(), String> {
    store.mutate(&app, |items| -> Result<(), String> {
        let item = items
            .iter_mut()
            .find(|i| i.id == id)
            .ok_or_else(|| GONE.to_string())?;
        item.state = PromptState::Due;
        item.force = true;
        Ok(())
    })
}

#[tauri::command(async)]
pub fn send_later_remove(
    app: AppHandle,
    store: State<'_, Arc<SendLaterStore>>,
    id: String,
) -> Option<ScheduledPrompt> {
    store.mutate(&app, |items| {
        let idx = items.iter().position(|i| i.id == id)?;
        Some(items.remove(idx))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIN: i64 = 60 * 1000;

    fn prompt(id: &str, due_at: i64, state: PromptState) -> ScheduledPrompt {
        ScheduledPrompt {
            id: id.into(),
            project_name: "lpm".into(),
            history_key: "k".into(),
            terminal_label: "Claude".into(),
            text: "run the tests".into(),
            images: BTreeMap::new(),
            due_at,
            created_at: 0,
            state,
            kind: "time".into(),
            force: false,
        }
    }

    #[test]
    fn a_prompt_reached_on_time_is_due() {
        let mut items = vec![prompt("a", 1_000 * MIN, PromptState::Scheduled)];
        assert!(settle(&mut items, 1_000 * MIN + 30_000));
        assert_eq!(items[0].state, PromptState::Due);
    }

    #[test]
    fn a_prompt_noticed_after_the_grace_is_missed() {
        let mut items = vec![prompt("a", 1_000 * MIN, PromptState::Scheduled)];
        assert!(settle(&mut items, 1_000 * MIN + GRACE_MS + 1));
        assert_eq!(items[0].state, PromptState::Missed);
    }

    #[test]
    fn settle_leaves_future_and_finished_prompts_alone() {
        let mut items = vec![
            prompt("future", 2_000 * MIN, PromptState::Scheduled),
            prompt("due", 10 * MIN, PromptState::Due),
            prompt("missed", 10 * MIN, PromptState::Missed),
        ];
        assert!(!settle(&mut items, 1_000 * MIN));
        assert_eq!(items[0].state, PromptState::Scheduled);
        assert_eq!(items[1].state, PromptState::Due);
    }

    #[test]
    fn launch_misses_overdue_and_waiting_prompts_but_keeps_future_ones() {
        let mut due = prompt("due", 990 * MIN, PromptState::Due);
        due.force = true;
        let mut items = vec![
            prompt("overdue", 900 * MIN, PromptState::Scheduled),
            due,
            prompt("future", 1_100 * MIN, PromptState::Scheduled),
            prompt("just", 1_000 * MIN - MIN, PromptState::Scheduled),
        ];
        assert!(settle_after_launch(&mut items, 1_000 * MIN));
        assert_eq!(items[0].state, PromptState::Missed);
        assert_eq!(items[1].state, PromptState::Missed);
        assert!(!items[1].force);
        assert_eq!(items[2].state, PromptState::Scheduled);
        assert_eq!(items[3].state, PromptState::Scheduled);
    }

    #[test]
    fn next_wait_is_the_soonest_scheduled_prompt() {
        let items = vec![
            prompt("later", 1_060 * MIN, PromptState::Scheduled),
            prompt("sooner", 1_010 * MIN, PromptState::Scheduled),
            prompt("due", 900 * MIN, PromptState::Due),
        ];
        assert_eq!(
            next_wait(&items, 1_000 * MIN),
            Some(Duration::from_millis(10 * MIN as u64))
        );
        assert_eq!(next_wait(&items[2..], 1_000 * MIN), None);
    }

    #[test]
    fn overdue_scheduled_prompts_wait_zero() {
        let items = vec![prompt("a", 900 * MIN, PromptState::Scheduled)];
        assert_eq!(next_wait(&items, 1_000 * MIN), Some(Duration::ZERO));
    }

    #[test]
    fn serializes_camel_case_with_lowercase_state() {
        let json = serde_json::to_value(prompt("a", 5, PromptState::Due)).unwrap();
        assert_eq!(json["historyKey"], "k");
        assert_eq!(json["dueAt"], 5);
        assert_eq!(json["state"], "due");
    }

    #[test]
    fn missing_optional_fields_read_as_defaults() {
        let raw = r#"[{"id":"a","projectName":"p","historyKey":"k","text":"t","dueAt":1,"createdAt":0,"state":"scheduled"}]"#;
        let items: Vec<ScheduledPrompt> = serde_json::from_str(raw).unwrap();
        assert!(items[0].images.is_empty());
        assert!(!items[0].force);
        assert_eq!(items[0].terminal_label, "");
    }

    #[test]
    fn images_that_are_not_local_files_keep_their_path() {
        let mut images = BTreeMap::new();
        images.insert("1".to_string(), "/nonexistent/lpm-send-later-test.png".to_string());
        let kept = keep_images("test-id", &images);
        assert_eq!(kept["1"], "/nonexistent/lpm-send-later-test.png");
    }
}
