// Following a Mac: keep a local project matching another Mac's working state
// without asking each time.
//
// This is the scheduler and its command surface. A follow is one persisted record
// (`gitfollowstore`) plus in-memory pacing; every cycle asks the other Mac for a
// cheap working-state fingerprint and only pays for a transfer when that answer
// changed. `gitfollowrun` does the asking and the landing.
//
// Two rules shape everything here. A synced folder is a mirror of the other Mac —
// the work happens over there, this copy exists to be built and tested — so the
// incoming state always wins, and whatever it replaces is committed to a recovery
// ref rather than lost. And a Mac that is unreachable is not a failure: it is
// simply not eligible this cycle, so no backoff builds up while a laptop is closed.
use crate::gitfollowrun::Outcome;
use crate::gitfollowstore::{self as store, Follow};
use crate::peerclient::PeerClientHub;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

/// How often to ask a Mac that cannot tell us itself. The answer has to be
/// measured the same way on both Macs to be comparable, which means a real index
/// build over there — around 0.15s of CPU for a thousand-file repo, scaling with
/// the file count. Only followed projects poll, and only while connected.
const POLL: Duration = Duration::from_secs(10);
/// How often to ask a Mac that pushes its changes. It has already told us about
/// anything that moved, so this only has to catch what a file watcher can miss —
/// and asking it a minute apart costs a sixth of what polling did.
const HEARTBEAT: Duration = Duration::from_secs(60);
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
/// engine stopping on something it cannot resolve alone.
const PAUSED_BY_USER: &str = "paused by you";

#[derive(Default)]
struct Runtime {
    next_at: Option<Instant>,
    errors: u32,
    running: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FollowView {
    project: String,
    slug: String,
    source_root: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    paused: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    last_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    last_branch: Option<String>,
    last_synced_at: i64,
    files: u64,
    syncing: bool,
}

/// One Mac's due follows for this cycle.
struct SourceBatch {
    slug: String,
    /// That Mac pushes changes, so this cycle is a heartbeat and its folders can be
    /// asked about in one frame.
    pushes: bool,
    follows: Vec<Follow>,
}

struct Inner {
    runtimes: HashMap<String, Runtime>,
    /// The folder set we believe each Mac is watching for us, so it is only told
    /// when that changes.
    watched: HashMap<String, HashSet<String>>,
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
                    watched: HashMap::new(),
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
        // A reconnected Mac remembers nothing about what we follow, so whatever we
        // believed it was watching is void.
        inner.watched.clear();
        inner.woken = true;
        self.core.cv.notify_all();
    }

    /// A Mac says one of its folders moved. Only a wake-up: the cycle it triggers
    /// still asks what the state is before acting on it.
    pub fn note_remote_change(&self, slug: &str, cwd: &str) {
        let projects: Vec<String> = store::load()
            .into_iter()
            .filter(|f| f.slug == slug && f.source_root == cwd)
            .map(|f| f.project)
            .collect();
        if projects.is_empty() {
            return;
        }
        let mut inner = self.core.inner.lock().unwrap();
        for project in projects {
            let rt = inner.runtimes.entry(project).or_default();
            rt.next_at = None;
            rt.errors = 0;
        }
        inner.woken = true;
        self.core.cv.notify_all();
    }

    fn run(&self) {
        loop {
            let (batches, any) = self.claim_due();
            for batch in batches {
                let engine = self.clone();
                std::thread::spawn(move || engine.sync_source(batch));
            }
            let inner = self.core.inner.lock().unwrap();
            if inner.shutdown {
                return;
            }
            if !inner.woken {
                // Wake often enough to serve the shortest cadence any Mac needs;
                // each follow's own next instant decides whether it actually runs.
                let wait = if any { POLL } else { IDLE };
                let _ = self.core.cv.wait_timeout(inner, wait).unwrap();
            }
        }
    }

    /// The work for this cycle, grouped by the Mac it comes from — one batch per
    /// Mac, so its folders are asked about in one frame and land one at a time
    /// rather than making it pack several at once. Members are marked running
    /// before the lock is released, so a slow transfer is never started twice.
    ///
    /// Eligibility is resolved before the engine lock is taken: it reads peer
    /// connection state, and the peer client nudges this engine, so the two locks
    /// must never nest.
    fn claim_due(&self) -> (Vec<SourceBatch>, bool) {
        let live = store::prune_missing(&crate::config::project_names());
        let ready: Vec<Follow> = live
            .iter()
            .filter(|f| !f.is_paused() && self.core.hub.require_git_follow(&f.slug).is_ok())
            .cloned()
            .collect();
        let pushes: HashMap<String, bool> = ready
            .iter()
            .map(|f| (f.slug.clone(), self.core.hub.can_push_changes(&f.slug)))
            .collect();
        self.register_watches(&ready, &pushes);

        let now = Instant::now();
        let mut inner = self.core.inner.lock().unwrap();
        if inner.shutdown {
            return (Vec::new(), false);
        }
        inner.woken = false;
        inner
            .runtimes
            .retain(|project, _| live.iter().any(|f| &f.project == project));

        let mut batches: Vec<SourceBatch> = Vec::new();
        for follow in ready {
            let rt = inner.runtimes.entry(follow.project.clone()).or_default();
            if rt.running || !is_due(rt.next_at, now) {
                continue;
            }
            rt.running = true;
            let pushed = pushes.get(&follow.slug).copied().unwrap_or(false);
            match batches.iter_mut().find(|b| b.slug == follow.slug) {
                Some(batch) => batch.follows.push(follow),
                None => batches.push(SourceBatch {
                    slug: follow.slug.clone(),
                    pushes: pushed,
                    follows: vec![follow],
                }),
            }
        }
        (batches, !live.is_empty())
    }

    /// Tell each Mac which of its folders we follow, so it can push their changes
    /// instead of being asked. Only sent when the set actually changed — a
    /// reconnect clears what we believe it knows, so it is told again.
    fn register_watches(&self, ready: &[Follow], pushes: &HashMap<String, bool>) {
        let mut wanted: HashMap<String, HashSet<String>> = HashMap::new();
        for follow in ready {
            if pushes.get(&follow.slug).copied().unwrap_or(false) {
                wanted
                    .entry(follow.slug.clone())
                    .or_default()
                    .insert(follow.source_root.clone());
            }
        }
        let stale: Vec<(String, HashSet<String>)> = {
            let mut inner = self.core.inner.lock().unwrap();
            // A Mac we no longer follow anything on is told so, once.
            for slug in inner.watched.keys().cloned().collect::<Vec<_>>() {
                wanted.entry(slug).or_default();
            }
            let changed: Vec<(String, HashSet<String>)> = wanted
                .into_iter()
                .filter(|(slug, cwds)| inner.watched.get(slug) != Some(cwds))
                .collect();
            for (slug, cwds) in &changed {
                if cwds.is_empty() {
                    inner.watched.remove(slug);
                } else {
                    inner.watched.insert(slug.clone(), cwds.clone());
                }
            }
            changed
        };
        for (slug, cwds) in stale {
            let list: Vec<&String> = cwds.iter().collect();
            let sent = self
                .core
                .hub
                .notify_peer(&slug, serde_json::json!({ "t": "gitFollowWatch", "cwds": list }));
            // Unsent means the connection went away; forget it so the next cycle
            // registers again rather than assuming that Mac is watching.
            if sent.is_err() {
                self.core.inner.lock().unwrap().watched.remove(&slug);
            }
        }
    }

    /// One Mac's turn: ask what it holds for every folder we follow from it, then
    /// land the ones that moved, one after another.
    fn sync_source(&self, batch: SourceBatch) {
        let cadence = if batch.pushes { HEARTBEAT } else { POLL };
        let cwds: Vec<String> = batch
            .follows
            .iter()
            .map(|f| f.source_root.clone())
            .collect();
        let answers =
            crate::gitfollowrun::remote_states(&self.core.hub, &batch.slug, &cwds, batch.pushes);
        let mut changed_anything = false;
        for follow in &batch.follows {
            let outcome = match &answers {
                // The whole exchange failed, so every folder in it is unresolved.
                Err(e) => crate::gitfollowrun::classify(follow, e.clone()),
                Ok(answers) => match answers.states.get(&follow.source_root) {
                    Some(state) if state.matches(follow) => Outcome::Unchanged,
                    Some(_) => self.land(follow),
                    None => crate::gitfollowrun::classify(
                        follow,
                        answers
                            .errors
                            .get(&follow.source_root)
                            .cloned()
                            .unwrap_or_else(|| "that folder was not answered for".into()),
                    ),
                },
            };
            if let Outcome::Paused(reason) = &outcome {
                let _ = self.core.app.emit(
                    "follow-paused",
                    serde_json::json!({ "project": follow.project, "reason": reason }),
                );
            }
            changed_anything |= !matches!(outcome, Outcome::Unchanged);
            self.finish(&follow.project, &outcome, cadence);
        }
        // A cycle that found nothing to do changed nothing worth re-rendering for,
        // and with a heartbeat there is one of those for every quiet minute.
        if changed_anything {
            self.emit_state();
        }
    }

    fn land(&self, follow: &Follow) -> Outcome {
        crate::gitfollowrun::land(
            &self.core.app,
            &self.core.hub,
            follow,
            // The row is already marked running, so this is what puts the syncing
            // state on screen for a transfer long enough to notice.
            &|| self.emit_state(),
        )
    }

    fn finish(&self, project: &str, outcome: &Outcome, cadence: Duration) {
        let now = Instant::now();
        let mut inner = self.core.inner.lock().unwrap();
        let Some(rt) = inner.runtimes.get_mut(project) else {
            return;
        };
        rt.running = false;
        match outcome {
            Outcome::Unchanged | Outcome::Synced => {
                rt.errors = 0;
                rt.next_at = Some(now + cadence);
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
    store::update(&project, |f| f.pause(PAUSED_BY_USER.to_string()))?;
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

/// Pick syncing back up after a pause.
#[tauri::command(async)]
pub fn follow_resume(app: AppHandle, project: String) -> Result<(), String> {
    let project = crate::gitbring::unmark(project.trim()).to_string();
    store::update(&project, |f| f.clear_pause())?;
    let e = engine(&app);
    {
        let mut inner = e.core.inner.lock().unwrap();
        let rt = inner.runtimes.entry(project).or_default();
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
