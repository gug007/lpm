//! Prompts the user scheduled to send later. The list and the clock live here so
//! a hidden or throttled window can't make a prompt late: this side decides when
//! each one is due — or missed, when the Mac slept or lpm was closed past its
//! time — and the main window does the typing, since pasting into a terminal
//! lives there.

use crate::config;
use crate::send_later_model::{
    check_due_at, next_wait, settle, settle_after_launch, NewPrompt, PromptState, ScheduledPrompt,
    Snapshot,
};
use std::collections::{BTreeMap, HashSet};
use std::os::fd::AsRawFd;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

pub const CHANGED_EVENT: &str = "send-later-changed";

const GONE: &str = "That prompt is no longer scheduled.";
const NOT_SENDER: &str =
    "Another copy of lpm that is open is sending scheduled prompts. Schedule it from that one.";

/// The longest single wait. The monotonic clock stops while the Mac sleeps, so a
/// long wait would fire late by the length of the nap; short waits checked
/// against the wall clock notice a missed time within a minute of waking.
const TICK: Duration = Duration::from_secs(60);

/// Image copies outlive their prompt this long: a sent prompt's history entry,
/// or the draft a closed terminal's prompt became, still points at them.
const IMAGE_RETENTION: Duration = Duration::from_secs(30 * 24 * 60 * 60);

#[derive(Default)]
struct Schedule {
    items: Vec<ScheduledPrompt>,
    rev: u64,
}

#[derive(Default)]
pub struct SendLaterStore {
    schedule: Mutex<Schedule>,
    wake: Mutex<Option<Sender<()>>>,
    // Held for the life of the process by the one copy of lpm that sends. A
    // second copy on the same data directory (a dev build beside the app) shows
    // the list but leaves the sending, and the file, to the first.
    lock: Mutex<Option<std::fs::File>>,
}

impl SendLaterStore {
    fn is_sender(&self) -> bool {
        self.lock.lock().unwrap().is_some()
    }

    fn snapshot(&self, schedule: &Schedule) -> Snapshot {
        Snapshot {
            rev: schedule.rev,
            sender: self.is_sender(),
            items: schedule.items.clone(),
        }
    }

    /// Apply a change, persist it, and tell every window — emitting under the
    /// lock so snapshots leave in the order the changes happened. A change that
    /// can't be saved is rolled back, so nothing is promised that a restart
    /// would lose.
    fn mutate<T>(
        &self,
        app: &AppHandle,
        change: impl FnOnce(&mut Vec<ScheduledPrompt>) -> Result<T, String>,
    ) -> Result<T, String> {
        if !self.is_sender() {
            return Err(NOT_SENDER.into());
        }
        let mut schedule = self.schedule.lock().unwrap();
        let before = schedule.items.clone();
        let out = change(&mut schedule.items)?;
        if let Err(e) = save(&schedule.items) {
            schedule.items = before;
            return Err(format!("Couldn't save the schedule: {e}"));
        }
        schedule.rev += 1;
        let _ = app.emit(CHANGED_EVENT, self.snapshot(&schedule));
        drop(schedule);
        if let Some(tx) = self.wake.lock().unwrap().as_ref() {
            let _ = tx.send(());
        }
        Ok(out)
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

fn save(items: &[ScheduledPrompt]) -> Result<(), String> {
    let data = serde_json::to_vec_pretty(items).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(config::lpm_dir()).map_err(|e| e.to_string())?;
    crate::fsatomic::write(&store_path(), &data, crate::fsatomic::Mode::Preserve(0o600))
        .map_err(|e| e.to_string())
}

/// An exclusive lock on a file beside the schedule, or None when another copy
/// of lpm already holds it.
fn take_sender_lock() -> Option<std::fs::File> {
    std::fs::create_dir_all(config::lpm_dir()).ok()?;
    let file = std::fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(config::lpm_dir().join("send-later.lock"))
        .ok()?;
    // SAFETY: flock only reads the descriptor, which `file` keeps open.
    let held = unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } == 0;
    held.then_some(file)
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
            let kept = src.file_name().filter(|_| src.is_file()).and_then(|name| {
                std::fs::create_dir_all(&dir).ok()?;
                let dest = dir.join(format!("{token}-{}", name.to_string_lossy()));
                std::fs::copy(src, &dest).ok()?;
                Some(dest.to_string_lossy().into_owned())
            });
            (token.clone(), kept.unwrap_or_else(|| path.clone()))
        })
        .collect()
}

/// Restart a prompt's image copies' retention from now: they are kept for a
/// while after it leaves the schedule, not after it joined it. Writing a file
/// inside moves the folder's modification time, which is what pruning reads.
fn release_images(id: &str) {
    let dir = images_root().join(id);
    if dir.is_dir() {
        let _ = std::fs::write(dir.join(".released"), b"");
    }
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
    *store.lock.lock().unwrap() = take_sender_lock();
    {
        let mut schedule = store.schedule.lock().unwrap();
        schedule.items = load();
        if store.is_sender() && settle_after_launch(&mut schedule.items, now_ms()) {
            if let Err(e) = save(&schedule.items) {
                eprintln!("send later: couldn't save the schedule: {e}");
            }
        }
    }
    if !store.is_sender() {
        return;
    }
    let (tx, rx) = mpsc::channel::<()>();
    *store.wake.lock().unwrap() = Some(tx);
    std::thread::spawn(move || {
        let live: HashSet<String> = store
            .schedule
            .lock()
            .unwrap()
            .items
            .iter()
            .map(|i| i.id.clone())
            .collect();
        prune_image_dirs(&live);
        loop {
            let wait = {
                let mut schedule = store.schedule.lock().unwrap();
                let now = now_ms();
                if settle(&mut schedule.items, now) {
                    if let Err(e) = save(&schedule.items) {
                        eprintln!("send later: couldn't save the schedule: {e}");
                    }
                    schedule.rev += 1;
                    let _ = app.emit(CHANGED_EVENT, store.snapshot(&schedule));
                }
                next_wait(&schedule.items, now)
            };
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
pub fn send_later_list(store: State<'_, Arc<SendLaterStore>>) -> Snapshot {
    let schedule = store.schedule.lock().unwrap();
    store.snapshot(&schedule)
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
    check_due_at(prompt.due_at, now_ms())?;
    if !store.is_sender() {
        return Err(NOT_SENDER.into());
    }
    let id = uuid::Uuid::new_v4().to_string();
    let item = ScheduledPrompt {
        images: keep_images(&id, &prompt.images),
        id,
        project_name: prompt.project_name,
        history_key: prompt.history_key,
        terminal_label: prompt.terminal_label,
        agent: prompt.agent,
        text: prompt.text,
        due_at: prompt.due_at,
        created_at: now_ms(),
        state: PromptState::Scheduled,
        kind: if prompt.kind.is_empty() {
            "time".into()
        } else {
            prompt.kind
        },
        force: false,
    };
    store.mutate(&app, |items| {
        items.push(item.clone());
        Ok(())
    })?;
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
    check_due_at(due_at, now_ms())?;
    store.mutate(&app, |items| {
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
    store.mutate(&app, |items| {
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
) -> Result<Option<ScheduledPrompt>, String> {
    let removed = store.mutate(&app, |items| {
        Ok(items
            .iter()
            .position(|i| i.id == id)
            .map(|idx| items.remove(idx)))
    })?;
    if removed.is_some() {
        release_images(&id);
    }
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn images_that_are_not_local_files_keep_their_path() {
        let mut images = BTreeMap::new();
        images.insert(
            "1".to_string(),
            "/nonexistent/lpm-send-later-test.png".to_string(),
        );
        let kept = keep_images("test-id", &images);
        assert_eq!(kept["1"], "/nonexistent/lpm-send-later-test.png");
    }
}
