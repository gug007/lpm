// Following a Mac: keep a local project matching another Mac's working state
// without asking each time.
//
// This is the scheduler and its command surface. A follow is one persisted record
// (`gitfollowstore`) plus in-memory pacing; every cycle asks the other Mac for a
// cheap working-state fingerprint and only pays for a transfer when that answer
// changed. `gitfollowrun` does the asking and the landing.
//
// Two rules shape everything here. A follow never writes over work of the user's
// own — it pauses and says so instead. And a Mac that is unreachable is not a
// failure: it is simply not eligible this cycle, so no backoff builds up while a
// laptop is closed.
use crate::gitfollowrun::Outcome;
use crate::gitfollowstore::{self as store, Follow};
use crate::peerclient::PeerClientHub;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

/// How often a followed project asks the other Mac what it holds.
///
/// The answer has to be measured the same way on both Macs to be comparable, which
/// means a real index build over there — around 0.15s of CPU for a thousand-file
/// repo, scaling with the file count. Ten seconds keeps that in the noise while
/// still landing another Mac's work about as fast as it can be noticed. Only
/// followed projects poll, and only while their Mac is connected.
const POLL: Duration = Duration::from_secs(10);
/// After a run fails for a reason retrying might fix, back off through these
/// before returning to the normal cadence.
const BACKOFF: [Duration; 3] = [
    Duration::from_secs(30),
    Duration::from_secs(120),
    Duration::from_secs(600),
];
/// How long the scheduler parks when nothing is being followed. It is woken
/// directly when that changes, so this is only a backstop.
const IDLE: Duration = Duration::from_secs(60);
/// Reason recorded when the user pauses syncing themselves, as opposed to the
/// engine stopping because their work is in the way.
const PAUSED_BY_USER: &str = "paused by you";

#[derive(Default)]
struct Runtime {
    next_at: Option<Instant>,
    errors: u32,
    running: bool,
    /// Set by an explicit "discard mine and resume": licenses the next run to
    /// overwrite local edits. Deliberately not persisted — if the app restarts
    /// first, the follow pauses again rather than quietly destroying work.
    discard_once: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FollowView {
    project: String,
    slug: String,
    source_root: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    paused: Option<String>,
    paused_by_user: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    last_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    last_branch: Option<String>,
    last_synced_at: i64,
    files: u64,
    syncing: bool,
}

struct Inner {
    runtimes: HashMap<String, Runtime>,
    woken: bool,
    shutdown: bool,
}

struct Core {
    app: AppHandle,
    hub: PeerClientHub,
    inner: Mutex<Inner>,
    cv: Condvar,
}

/// A cheap-to-clone handle to the running scheduler, held as Tauri state so the
/// commands and the peer client can nudge it.
#[derive(Clone)]
pub struct Engine {
    core: Arc<Core>,
}

impl Engine {
    pub fn new(app: AppHandle, hub: PeerClientHub) -> Self {
        Engine {
            core: Arc::new(Core {
                app,
                hub,
                inner: Mutex::new(Inner {
                    runtimes: HashMap::new(),
                    woken: false,
                    shutdown: false,
                }),
                cv: Condvar::new(),
            }),
        }
    }

    /// Spawn the scheduler thread. Call once.
    pub fn start(&self) {
        let engine = self.clone();
        std::thread::spawn(move || engine.run());
    }

    pub fn stop(&self) {
        let mut inner = self.core.inner.lock().unwrap();
        inner.shutdown = true;
        inner.woken = true;
        self.core.cv.notify_all();
    }

    /// Check now rather than at the next cycle — a follow was just set up, or a
    /// peer reconnected and its backoff should not outlive the outage.
    pub fn nudge(&self) {
        let mut inner = self.core.inner.lock().unwrap();
        for rt in inner.runtimes.values_mut() {
            rt.next_at = None;
            rt.errors = 0;
        }
        inner.woken = true;
        self.core.cv.notify_all();
    }

    fn run(&self) {
        loop {
            let (due, any) = self.claim_due();
            for follow in due {
                let engine = self.clone();
                std::thread::spawn(move || engine.sync(follow));
            }
            let inner = self.core.inner.lock().unwrap();
            if inner.shutdown {
                return;
            }
            if !inner.woken {
                let wait = if any { POLL } else { IDLE };
                let _ = self.core.cv.wait_timeout(inner, wait).unwrap();
            }
        }
    }

    /// The follows to check this cycle — marked running before the lock is
    /// released, so a slow transfer is never started twice — and whether anything
    /// is being followed at all.
    ///
    /// Eligibility is resolved before the engine lock is taken: it reads peer
    /// connection state, and the peer client nudges this engine, so the two locks
    /// must never nest.
    fn claim_due(&self) -> (Vec<Follow>, bool) {
        let live = store::prune_missing(&crate::config::project_names());
        let ready: Vec<Follow> = live
            .iter()
            .filter(|f| !f.is_paused() && self.core.hub.require_git_follow(&f.slug).is_ok())
            .cloned()
            .collect();

        let now = Instant::now();
        let mut inner = self.core.inner.lock().unwrap();
        if inner.shutdown {
            return (Vec::new(), false);
        }
        inner.woken = false;
        inner
            .runtimes
            .retain(|project, _| live.iter().any(|f| &f.project == project));
        let due = ready
            .into_iter()
            .filter(|follow| {
                let rt = inner.runtimes.entry(follow.project.clone()).or_default();
                let go = !rt.running && is_due(rt.next_at, now);
                if go {
                    rt.running = true;
                }
                go
            })
            .collect();
        (due, !live.is_empty())
    }

    fn sync(&self, follow: Follow) {
        let discard = self.take_discard(&follow.project);
        let outcome = crate::gitfollowrun::sync(
            &self.core.app,
            &self.core.hub,
            &follow,
            discard,
            // The row is already marked running, so this is what puts the syncing
            // state on screen for a transfer long enough to notice.
            &|| self.emit_state(),
        );
        if let Outcome::Paused(reason) = &outcome {
            let _ = self.core.app.emit(
                "follow-paused",
                serde_json::json!({ "project": follow.project, "reason": reason }),
            );
        }
        let quiet = matches!(outcome, Outcome::Unchanged);
        self.finish(&follow.project, &outcome);
        // A cycle that found nothing to do changed nothing worth re-rendering for,
        // and there is one of those every few seconds per followed project.
        if !quiet {
            self.emit_state();
        }
    }

    fn take_discard(&self, project: &str) -> bool {
        let mut inner = self.core.inner.lock().unwrap();
        inner
            .runtimes
            .get_mut(project)
            .map(|rt| std::mem::take(&mut rt.discard_once))
            .unwrap_or(false)
    }

    fn finish(&self, project: &str, outcome: &Outcome) {
        let now = Instant::now();
        let mut inner = self.core.inner.lock().unwrap();
        let Some(rt) = inner.runtimes.get_mut(project) else {
            return;
        };
        rt.running = false;
        match outcome {
            Outcome::Unchanged | Outcome::Synced => {
                rt.errors = 0;
                rt.next_at = Some(now + POLL);
            }
            Outcome::Retry => {
                rt.errors = rt.errors.saturating_add(1);
                rt.next_at = Some(now + backoff(rt.errors));
            }
            // A pause is recorded on the follow itself and nothing runs again until
            // the user resumes, so there is no next instant to set.
            Outcome::Paused(_) => {
                rt.errors = 0;
                rt.next_at = None;
            }
        }
        inner.woken = true;
        self.core.cv.notify_all();
    }

    fn views(&self) -> Vec<FollowView> {
        let follows = store::load();
        let inner = self.core.inner.lock().unwrap();
        follows
            .into_iter()
            .map(|f| FollowView {
                syncing: inner
                    .runtimes
                    .get(&f.project)
                    .map(|rt| rt.running)
                    .unwrap_or(false),
                project: f.project,
                slug: f.slug,
                source_root: f.source_root,
                paused: f.paused,
                paused_by_user: f.paused_by_user,
                last_error: f.last_error,
                last_branch: f.last_branch,
                last_synced_at: f.last_synced_at,
                files: f.files,
            })
            .collect()
    }

    fn emit_state(&self) {
        let _ = self.core.app.emit("follow-changed", self.views());
    }
}

fn is_due(next_at: Option<Instant>, now: Instant) -> bool {
    next_at.map(|t| now >= t).unwrap_or(true)
}

fn backoff(errors: u32) -> Duration {
    let step = (errors.max(1) as usize - 1).min(BACKOFF.len() - 1);
    BACKOFF[step]
}

fn engine(app: &AppHandle) -> Engine {
    app.state::<Engine>().inner().clone()
}

/// Every follow on this Mac, for the sidebar and the dialog.
#[tauri::command(async)]
pub fn follow_list(app: AppHandle) -> Vec<FollowView> {
    engine(&app).views()
}

#[tauri::command(async)]
pub fn follow_pause(app: AppHandle, project: String) -> Result<(), String> {
    let project = crate::gitbring::unmark(project.trim()).to_string();
    store::update(&project, |f| f.pause(PAUSED_BY_USER.to_string(), true))?;
    engine(&app).emit_state();
    Ok(())
}

#[tauri::command(async)]
pub fn follow_stop(app: AppHandle, project: String) -> Result<(), String> {
    store::remove(crate::gitbring::unmark(project.trim()))?;
    let e = engine(&app);
    e.nudge();
    e.emit_state();
    Ok(())
}

/// Clear a pause. `discard_local` licenses the next run to overwrite the edits
/// that caused it — the explicit answer to the "your work is in the way" notice.
#[tauri::command(async)]
pub fn follow_resume(app: AppHandle, project: String, discard_local: bool) -> Result<(), String> {
    let project = crate::gitbring::unmark(project.trim()).to_string();
    store::update(&project, |f| f.clear_pause())?;
    let e = engine(&app);
    {
        let mut inner = e.core.inner.lock().unwrap();
        let rt = inner.runtimes.entry(project).or_default();
        rt.discard_once = discard_local;
        rt.errors = 0;
        rt.next_at = None;
        inner.woken = true;
    }
    e.core.cv.notify_all();
    e.emit_state();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_follow_with_no_scheduled_time_runs_immediately() {
        assert!(is_due(None, Instant::now()));
    }

    #[test]
    fn a_scheduled_follow_waits_for_its_instant() {
        let now = Instant::now();
        assert!(!is_due(Some(now + POLL), now));
        assert!(is_due(Some(now), now));
        assert!(is_due(Some(now - POLL), now));
    }

    #[test]
    fn repeated_failures_climb_the_backoff_and_then_hold() {
        assert_eq!(backoff(1), BACKOFF[0]);
        assert_eq!(backoff(2), BACKOFF[1]);
        assert_eq!(backoff(3), BACKOFF[2]);
        assert_eq!(backoff(9), BACKOFF[2]);
        // A count of zero should never reach here, but must not panic if it does.
        assert_eq!(backoff(0), BACKOFF[0]);
    }
}
