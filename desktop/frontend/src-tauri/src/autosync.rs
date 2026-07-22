// Per-peer auto-sync engine (Phase 4 of Mac-to-Mac config sync).
//
// The manual "Sync now" button drives one sync on demand (peerclient::sync_run).
// This engine drives that same path unattended: when a peer has auto-sync on, a
// change on either Mac — or a reconnect, or a periodic anti-entropy nudge —
// schedules a run shortly after. It lives in Rust (not the Settings UI) because
// the Settings pane is not always mounted, and unattended sync must keep running
// regardless of what the user is looking at.
//
// The design splits cleanly into a pure scheduler and a thin I/O shell so the
// scheduling can be table-tested without threads or sockets:
//   * `should_run` / `backoff_delay` and the `apply_*` state transitions are pure
//     over (state, gates, now) — every pacing and gating rule is a unit test.
//   * `Engine` wraps them in one scheduler thread + one anti-entropy ticker,
//     talking to the outside world only through the injectable `AutoSyncHost`
//     trait (production impl: PeerClientHub).
//
// Gating: an auto run happens ONLY when auto-sync is on AND the peer is enabled,
// connected, speaks configSync2, and is identity-pinned. Unattended mode never
// travels the legacy mtime path and never an unpinned/plaintext channel; when the
// toggle is on but a gate fails the engine does nothing quietly (the UI hints).
use std::collections::HashMap;
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

/// Quiet-period debounce: a slug's run waits this long after its last trigger, so
/// a burst of edits coalesces into one run.
const QUIET_PERIOD: Duration = Duration::from_secs(2);
/// Hard rate floor: consecutive runs for one slug start at least this far apart,
/// the safety valve against a convergence pull→push turning into a hot loop.
const RATE_FLOOR: Duration = Duration::from_secs(5);
/// Anti-entropy nudge for every enabled+connected auto peer — the safety net that
/// makes a dropped lossy event only ever a delay, never a lost change.
const TICK_INTERVAL: Duration = Duration::from_secs(30 * 60);
/// Longest the scheduler parks with nothing scheduled (bounds wake latency).
const MAX_IDLE: Duration = Duration::from_secs(60);
/// Exponential backoff after consecutive run failures: 30s, 2min, then 10min
/// (capped). Reset on the next success or reconnect.
const BACKOFF_STEPS: [Duration; 3] = [
    Duration::from_secs(30),
    Duration::from_secs(120),
    Duration::from_secs(600),
];

/// Tunable timings, injected so tests can run the real loop at millisecond scale.
/// `Default` is the production schedule above.
#[derive(Clone, Copy)]
pub struct Timings {
    pub quiet_period: Duration,
    pub rate_floor: Duration,
    pub tick_interval: Duration,
    pub max_idle: Duration,
    pub backoff: [Duration; 3],
}

impl Default for Timings {
    fn default() -> Self {
        Timings {
            quiet_period: QUIET_PERIOD,
            rate_floor: RATE_FLOOR,
            tick_interval: TICK_INTERVAL,
            max_idle: MAX_IDLE,
            backoff: BACKOFF_STEPS,
        }
    }
}

/// One completed run's outcome, surfaced to the frontend as `peer-autosync-result`.
/// `conflicts` are plan items that resolved as a both-sides change (the newer won,
/// a backup was kept) — successful resolutions, never failures.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct RunReport {
    pub applied: u64,
    pub pushed: u64,
    pub errors: Vec<String>,
    pub conflicts: Vec<String>,
}

impl RunReport {
    fn from_error(msg: String) -> Self {
        RunReport {
            errors: vec![msg],
            ..Default::default()
        }
    }

    /// A run counts as failed for backoff when anything errored — a hard failure
    /// (couldn't run) or a per-item failure. Conflicts do not count.
    fn failed(&self) -> bool {
        !self.errors.is_empty()
    }
}

/// The five conditions that must all hold for an auto run, snapshotted per tick.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Gates {
    pub auto_sync: bool,
    pub enabled: bool,
    pub connected: bool,
    pub supports_sync2: bool,
    pub pinned: bool,
}

impl Gates {
    /// The first unmet gate in priority order, or None when all hold.
    fn first_failure(&self) -> Option<SkipReason> {
        if !self.auto_sync {
            Some(SkipReason::AutoSyncOff)
        } else if !self.enabled {
            Some(SkipReason::Disabled)
        } else if !self.connected {
            Some(SkipReason::Disconnected)
        } else if !self.supports_sync2 {
            Some(SkipReason::Unsupported)
        } else if !self.pinned {
            Some(SkipReason::Unpinned)
        } else {
            None
        }
    }
}

/// Why `should_run` declined to run now (for tests / reasoning; not user-facing).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum SkipReason {
    NoPending,
    Running,
    AutoSyncOff,
    Disabled,
    Disconnected,
    Unsupported,
    Unpinned,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Decision {
    Run,
    Skip(SkipReason),
    Defer(Instant),
}

/// Per-slug scheduling bookkeeping. Pacing is stored as absolute instants already
/// folded with their durations, so `should_run` needs no timings — only `now`.
#[derive(Clone, Debug, Default)]
struct SlugState {
    pending: bool,
    running: bool,
    quiet_until: Option<Instant>,   // debounce target (now + quiet_period)
    rate_until: Option<Instant>,    // last run start + rate_floor
    backoff_until: Option<Instant>, // set while backing off after a failure
    consecutive_errors: u32,
}

impl SlugState {
    /// The earliest instant a pending, eligible run may start — the latest of the
    /// debounce, rate-floor, and backoff constraints. None = no constraint.
    fn earliest_start(&self) -> Option<Instant> {
        [self.quiet_until, self.rate_until, self.backoff_until]
            .into_iter()
            .flatten()
            .max()
    }
}

/// Pure scheduling decision for one slug. The signature the whole engine turns on;
/// exhaustively table-tested.
fn should_run(st: &SlugState, gates: &Gates, now: Instant) -> Decision {
    if !st.pending {
        return Decision::Skip(SkipReason::NoPending);
    }
    if st.running {
        return Decision::Skip(SkipReason::Running);
    }
    if let Some(reason) = gates.first_failure() {
        return Decision::Skip(reason);
    }
    if let Some(t) = st.earliest_start() {
        if now < t {
            return Decision::Defer(t);
        }
    }
    Decision::Run
}

/// Backoff delay after `errors` consecutive failures (>=1), clamped to the last
/// step. Pure over the step table.
fn backoff_delay(errors: u32, steps: &[Duration]) -> Duration {
    let last = steps.len().saturating_sub(1);
    let idx = (errors.max(1) as usize - 1).min(last);
    steps[idx]
}

/// A trigger arrived for a slug: mark it pending and (re)arm the debounce. A
/// reconnect additionally clears any backoff so the retry is prompt.
fn apply_notify(st: &mut SlugState, reconnect: bool, timings: &Timings, now: Instant) {
    st.pending = true;
    st.quiet_until = Some(now + timings.quiet_period);
    if reconnect {
        st.consecutive_errors = 0;
        st.backoff_until = None;
    }
}

/// Evaluate one slug and, when it decides to run, transition it into the running
/// state (clearing the debounce, arming the rate floor for the next run). Returns
/// the decision so the caller knows to actually launch a run / when to re-wake.
fn apply_tick(st: &mut SlugState, gates: &Gates, timings: &Timings, now: Instant) -> Decision {
    let decision = should_run(st, gates, now);
    match decision {
        Decision::Run => {
            st.running = true;
            st.pending = false;
            st.quiet_until = None;
            st.rate_until = Some(now + timings.rate_floor);
        }
        // An ineligible or no-longer-pending slug drops its pending flag so the
        // scheduler doesn't spin; a reconnect / tick / change re-triggers it.
        // A running slug keeps pending so it reruns once the current run ends.
        Decision::Skip(SkipReason::Running) => {}
        Decision::Skip(_) => st.pending = false,
        Decision::Defer(_) => {}
    }
    decision
}

/// A run finished. On failure, bump the error count, arm exponential backoff, and
/// leave the slug pending so it retries after the backoff. On success, reset the
/// error state and leave `pending` as the run left it — a trigger that arrived
/// mid-run reruns (rate-floored, for convergence); otherwise it stays idle.
fn apply_complete(st: &mut SlugState, failed: bool, timings: &Timings, now: Instant) {
    st.running = false;
    if failed {
        st.consecutive_errors = st.consecutive_errors.saturating_add(1);
        st.backoff_until = Some(now + backoff_delay(st.consecutive_errors, &timings.backoff));
        st.pending = true;
    } else {
        st.consecutive_errors = 0;
        st.backoff_until = None;
    }
}

/// The engine's I/O surface, injected so scheduling is tested without sockets.
pub trait AutoSyncHost: Send + Sync + 'static {
    /// Slugs of every peer whose auto-sync toggle is on (connectivity aside).
    fn auto_slugs(&self) -> Vec<String>;
    /// The current gates for one slug.
    fn gates(&self, slug: &str) -> Gates;
    /// Run one sync both directions — the manual "Sync now" path with an empty
    /// hint (the plan is recomputed against a fresh digest exchange).
    fn run_sync(&self, slug: &str) -> Result<RunReport, String>;
    /// Surface a completed run to the frontend.
    fn emit_result(&self, slug: &str, report: &RunReport);
}

enum Target {
    One(String),
    All,
}

struct Inner {
    slugs: HashMap<String, SlugState>,
    woken: bool,
    shutdown: bool,
}

struct EngineCore {
    inner: Mutex<Inner>,
    cv: Condvar,
    host: Arc<dyn AutoSyncHost>,
    timings: Timings,
}

/// A cheap-to-clone handle to the running engine. Stored as Tauri state so the
/// config watcher, the peer client, and the toggle command can all nudge it.
#[derive(Clone)]
pub struct Engine {
    core: Arc<EngineCore>,
}

impl Engine {
    pub fn new(host: Arc<dyn AutoSyncHost>) -> Self {
        Self::with_timings(host, Timings::default())
    }

    pub fn with_timings(host: Arc<dyn AutoSyncHost>, timings: Timings) -> Self {
        Engine {
            core: Arc::new(EngineCore {
                inner: Mutex::new(Inner {
                    slugs: HashMap::new(),
                    woken: false,
                    shutdown: false,
                }),
                cv: Condvar::new(),
                host,
                timings,
            }),
        }
    }

    /// Spawn the scheduler + anti-entropy ticker threads. Call once.
    pub fn start(&self) {
        let sched = self.clone();
        std::thread::spawn(move || sched.run_scheduler());
        let tick = self.clone();
        std::thread::spawn(move || tick.run_ticker());
    }

    /// Signal both threads to exit (app teardown).
    pub fn stop(&self) {
        let mut inner = self.core.inner.lock().unwrap();
        inner.shutdown = true;
        inner.woken = true;
        self.core.cv.notify_all();
    }

    /// A local config edit landed — nudge every auto-enabled peer.
    pub fn notify_local_change(&self) {
        self.notify(Target::All, false);
    }

    /// A peer's host reported a config change — nudge that peer.
    pub fn notify_remote_change(&self, slug: &str) {
        self.notify(Target::One(slug.to_string()), false);
    }

    /// A peer session reached ready (feature flags stored) — nudge it and clear
    /// any backoff so a reconnect retries promptly.
    pub fn notify_connected(&self, slug: &str) {
        self.notify(Target::One(slug.to_string()), true);
    }

    /// A peer's auto-sync toggle was just switched on — reconcile it now (if it is
    /// eligible; the scheduler gates it either way).
    pub fn notify_auto_enabled(&self, slug: &str) {
        self.notify(Target::One(slug.to_string()), false);
    }

    fn notify(&self, target: Target, reconnect: bool) {
        let now = Instant::now();
        // Resolve Target::All before taking the lock — auto_slugs() reads the peer
        // config, and the lock order is always engine-inner then config.
        let slugs = match target {
            Target::One(s) => vec![s],
            Target::All => self.core.host.auto_slugs(),
        };
        if slugs.is_empty() {
            return;
        }
        let mut inner = self.core.inner.lock().unwrap();
        for slug in slugs {
            let st = inner.slugs.entry(slug).or_default();
            apply_notify(st, reconnect, &self.core.timings, now);
        }
        inner.woken = true;
        self.core.cv.notify_all();
    }

    fn on_complete(&self, slug: &str, failed: bool) {
        let now = Instant::now();
        let mut inner = self.core.inner.lock().unwrap();
        if let Some(st) = inner.slugs.get_mut(slug) {
            apply_complete(st, failed, &self.core.timings, now);
        }
        inner.woken = true;
        self.core.cv.notify_all();
    }

    fn run_scheduler(&self) {
        loop {
            let (to_run, wait) = {
                let mut inner = self.core.inner.lock().unwrap();
                if inner.shutdown {
                    return;
                }
                inner.woken = false;
                let now = Instant::now();
                let mut to_run: Vec<String> = Vec::new();
                let mut next_wake: Option<Instant> = None;
                // gates() reads config/conns and never re-enters the engine, so
                // calling it under the inner lock keeps the engine-then-config
                // order and can't deadlock.
                let slugs: Vec<String> = inner.slugs.keys().cloned().collect();
                for slug in slugs {
                    let gates = self.core.host.gates(&slug);
                    let st = inner.slugs.get_mut(&slug).expect("just listed");
                    match apply_tick(st, &gates, &self.core.timings, now) {
                        Decision::Run => to_run.push(slug),
                        Decision::Defer(t) => {
                            next_wake = Some(next_wake.map_or(t, |w: Instant| w.min(t)));
                        }
                        Decision::Skip(_) => {}
                    }
                }
                let wait = next_wake
                    .map(|t| t.saturating_duration_since(now).min(self.core.timings.max_idle))
                    .unwrap_or(self.core.timings.max_idle);
                (to_run, wait)
            };

            for slug in to_run {
                self.spawn_run(slug);
            }

            let inner = self.core.inner.lock().unwrap();
            if inner.shutdown {
                return;
            }
            if !inner.woken {
                // A worker completing between the two locks sets `woken`, so a
                // wakeup is never lost; otherwise park until the next scheduled
                // instant or a fresh notify.
                let _ = self.core.cv.wait_timeout(inner, wait).unwrap();
            }
        }
    }

    fn run_ticker(&self) {
        let step = Duration::from_secs(10).min(self.core.timings.tick_interval);
        let mut elapsed = Duration::ZERO;
        loop {
            std::thread::sleep(step);
            if self.core.inner.lock().unwrap().shutdown {
                return;
            }
            elapsed += step;
            if elapsed >= self.core.timings.tick_interval {
                elapsed = Duration::ZERO;
                self.notify(Target::All, false);
            }
        }
    }

    fn spawn_run(&self, slug: String) {
        let engine = self.clone();
        std::thread::spawn(move || {
            let report = match engine.core.host.run_sync(&slug) {
                Ok(r) => r,
                Err(e) => RunReport::from_error(e),
            };
            engine.core.host.emit_result(&slug, &report);
            engine.on_complete(&slug, report.failed());
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    fn all_gates_open() -> Gates {
        Gates {
            auto_sync: true,
            enabled: true,
            connected: true,
            supports_sync2: true,
            pinned: true,
        }
    }

    fn pending() -> SlugState {
        SlugState {
            pending: true,
            ..Default::default()
        }
    }

    // ---- should_run gating table ---------------------------------------------

    #[test]
    fn should_run_all_gates_open_and_pending_runs() {
        let now = Instant::now();
        assert_eq!(should_run(&pending(), &all_gates_open(), now), Decision::Run);
    }

    #[test]
    fn should_run_not_pending_skips() {
        let now = Instant::now();
        let st = SlugState::default();
        assert_eq!(
            should_run(&st, &all_gates_open(), now),
            Decision::Skip(SkipReason::NoPending)
        );
    }

    #[test]
    fn should_run_running_skips_even_when_pending() {
        let now = Instant::now();
        let st = SlugState {
            pending: true,
            running: true,
            ..Default::default()
        };
        assert_eq!(
            should_run(&st, &all_gates_open(), now),
            Decision::Skip(SkipReason::Running)
        );
    }

    #[test]
    fn should_run_each_gate_independently_false_skips_with_its_reason() {
        let now = Instant::now();
        let cases = [
            (
                Gates {
                    auto_sync: false,
                    ..all_gates_open()
                },
                SkipReason::AutoSyncOff,
            ),
            (
                Gates {
                    enabled: false,
                    ..all_gates_open()
                },
                SkipReason::Disabled,
            ),
            (
                Gates {
                    connected: false,
                    ..all_gates_open()
                },
                SkipReason::Disconnected,
            ),
            (
                Gates {
                    supports_sync2: false,
                    ..all_gates_open()
                },
                SkipReason::Unsupported,
            ),
            (
                Gates {
                    pinned: false,
                    ..all_gates_open()
                },
                SkipReason::Unpinned,
            ),
        ];
        for (gates, reason) in cases {
            assert_eq!(
                should_run(&pending(), &gates, now),
                Decision::Skip(reason),
                "gate {reason:?}"
            );
        }
    }

    #[test]
    fn should_run_gate_priority_reports_the_first_failure() {
        let now = Instant::now();
        // auto_sync off AND disconnected -> auto-sync reported first.
        let gates = Gates {
            auto_sync: false,
            connected: false,
            ..all_gates_open()
        };
        assert_eq!(
            should_run(&pending(), &gates, now),
            Decision::Skip(SkipReason::AutoSyncOff)
        );
    }

    // ---- pacing: debounce, rate floor, backoff -------------------------------

    #[test]
    fn should_run_defers_until_debounce_then_runs() {
        let now = Instant::now();
        let st = SlugState {
            pending: true,
            quiet_until: Some(now + Duration::from_secs(2)),
            ..Default::default()
        };
        assert_eq!(
            should_run(&st, &all_gates_open(), now),
            Decision::Defer(now + Duration::from_secs(2))
        );
        // At/after the debounce target it runs.
        assert_eq!(
            should_run(&st, &all_gates_open(), now + Duration::from_secs(2)),
            Decision::Run
        );
    }

    #[test]
    fn earliest_start_takes_the_latest_constraint() {
        let now = Instant::now();
        // Debounce done, but the rate floor is furthest out -> defer to it.
        let st = SlugState {
            pending: true,
            quiet_until: Some(now + Duration::from_secs(1)),
            rate_until: Some(now + Duration::from_secs(5)),
            backoff_until: Some(now + Duration::from_secs(3)),
            ..Default::default()
        };
        assert_eq!(
            should_run(&st, &all_gates_open(), now),
            Decision::Defer(now + Duration::from_secs(5))
        );
    }

    #[test]
    fn backoff_delay_progression_and_cap() {
        let steps = Timings::default().backoff;
        assert_eq!(backoff_delay(1, &steps), Duration::from_secs(30));
        assert_eq!(backoff_delay(2, &steps), Duration::from_secs(120));
        assert_eq!(backoff_delay(3, &steps), Duration::from_secs(600));
        // Capped at the last step.
        assert_eq!(backoff_delay(4, &steps), Duration::from_secs(600));
        assert_eq!(backoff_delay(99, &steps), Duration::from_secs(600));
        // Defensive: 0 folds to the first step.
        assert_eq!(backoff_delay(0, &steps), Duration::from_secs(30));
    }

    // ---- apply_* state transitions -------------------------------------------

    #[test]
    fn apply_notify_arms_debounce_and_pending() {
        let t = Timings::default();
        let now = Instant::now();
        let mut st = SlugState::default();
        apply_notify(&mut st, false, &t, now);
        assert!(st.pending);
        assert_eq!(st.quiet_until, Some(now + t.quiet_period));
    }

    #[test]
    fn apply_notify_reconnect_clears_backoff() {
        let t = Timings::default();
        let now = Instant::now();
        let mut st = SlugState {
            consecutive_errors: 3,
            backoff_until: Some(now + Duration::from_secs(600)),
            ..Default::default()
        };
        apply_notify(&mut st, true, &t, now);
        assert_eq!(st.consecutive_errors, 0);
        assert_eq!(st.backoff_until, None);
        assert!(st.pending);
    }

    #[test]
    fn apply_tick_run_arms_rate_floor_and_marks_running() {
        let t = Timings::default();
        let now = Instant::now();
        let mut st = pending();
        let decision = apply_tick(&mut st, &all_gates_open(), &t, now);
        assert_eq!(decision, Decision::Run);
        assert!(st.running && !st.pending);
        assert_eq!(st.rate_until, Some(now + t.rate_floor));
        assert_eq!(st.quiet_until, None);
    }

    #[test]
    fn apply_tick_ineligible_drops_pending_but_running_keeps_it() {
        let t = Timings::default();
        let now = Instant::now();
        // Ineligible (disconnected) -> pending dropped, no spin.
        let mut st = pending();
        let gates = Gates {
            connected: false,
            ..all_gates_open()
        };
        apply_tick(&mut st, &gates, &t, now);
        assert!(!st.pending);
        // Already running -> pending kept so it reruns after completion.
        let mut st2 = SlugState {
            pending: true,
            running: true,
            ..Default::default()
        };
        apply_tick(&mut st2, &all_gates_open(), &t, now);
        assert!(st2.pending);
    }

    #[test]
    fn apply_complete_success_resets_errors_and_keeps_pending_flag() {
        let t = Timings::default();
        let now = Instant::now();
        // Success with a mid-run trigger (pending set) -> rerun-after (pending stays).
        let mut st = SlugState {
            running: true,
            pending: true,
            consecutive_errors: 2,
            backoff_until: Some(now),
            ..Default::default()
        };
        apply_complete(&mut st, false, &t, now);
        assert!(!st.running);
        assert!(st.pending, "mid-run trigger reruns after");
        assert_eq!(st.consecutive_errors, 0);
        assert_eq!(st.backoff_until, None);
        // Success with no mid-run trigger -> idle.
        let mut idle = SlugState {
            running: true,
            pending: false,
            ..Default::default()
        };
        apply_complete(&mut idle, false, &t, now);
        assert!(!idle.pending);
    }

    #[test]
    fn apply_complete_failure_backs_off_and_stays_pending() {
        let t = Timings::default();
        let now = Instant::now();
        let mut st = SlugState {
            running: true,
            ..Default::default()
        };
        apply_complete(&mut st, true, &t, now);
        assert_eq!(st.consecutive_errors, 1);
        assert_eq!(st.backoff_until, Some(now + Duration::from_secs(30)));
        assert!(st.pending, "failed run retries");
        // A second failure escalates the backoff.
        st.running = true;
        let later = now + Duration::from_secs(30);
        apply_complete(&mut st, true, &t, later);
        assert_eq!(st.consecutive_errors, 2);
        assert_eq!(st.backoff_until, Some(later + Duration::from_secs(120)));
    }

    #[test]
    fn failure_then_success_resets_backoff_progression() {
        let t = Timings::default();
        let now = Instant::now();
        let mut st = SlugState {
            running: true,
            ..Default::default()
        };
        apply_complete(&mut st, true, &t, now); // errors=1
        apply_complete(&mut st, false, &t, now); // reset
        assert_eq!(st.consecutive_errors, 0);
        // The next failure starts at the first step again, not the second.
        st.running = true;
        apply_complete(&mut st, true, &t, now);
        assert_eq!(st.backoff_until, Some(now + Duration::from_secs(30)));
    }

    // ---- engine loop with an injected runner (no sockets) --------------------

    struct FakeHost {
        runs: Arc<Mutex<Vec<String>>>,
        gates: Mutex<Gates>,
        // Optional gate a run blocks on, so a test can hold one run open.
        block: Mutex<Option<mpsc::Receiver<()>>>,
        started: mpsc::SyncSender<()>,
    }

    impl AutoSyncHost for FakeHost {
        fn auto_slugs(&self) -> Vec<String> {
            vec!["web".to_string()]
        }
        fn gates(&self, _slug: &str) -> Gates {
            *self.gates.lock().unwrap()
        }
        fn run_sync(&self, slug: &str) -> Result<RunReport, String> {
            let _ = self.started.try_send(());
            if let Some(rx) = self.block.lock().unwrap().take() {
                let _ = rx.recv();
            }
            self.runs.lock().unwrap().push(slug.to_string());
            Ok(RunReport::default())
        }
        fn emit_result(&self, _slug: &str, _report: &RunReport) {}
    }

    fn fast_timings() -> Timings {
        Timings {
            quiet_period: Duration::from_millis(5),
            rate_floor: Duration::from_millis(10),
            tick_interval: Duration::from_secs(3600),
            max_idle: Duration::from_millis(50),
            backoff: [Duration::from_millis(20); 3],
        }
    }

    #[test]
    fn engine_runs_after_a_local_change() {
        let runs = Arc::new(Mutex::new(Vec::new()));
        let (started_tx, started_rx) = mpsc::sync_channel(8);
        let host = Arc::new(FakeHost {
            runs: runs.clone(),
            gates: Mutex::new(all_gates_open()),
            block: Mutex::new(None),
            started: started_tx,
        });
        let engine = Engine::with_timings(host, fast_timings());
        engine.start();
        engine.notify_local_change();
        // The debounce + one run should complete well within this window.
        started_rx
            .recv_timeout(Duration::from_secs(2))
            .expect("a run started");
        std::thread::sleep(Duration::from_millis(30));
        engine.stop();
        assert_eq!(runs.lock().unwrap().as_slice(), ["web"]);
    }

    #[test]
    fn engine_reruns_when_a_trigger_arrives_mid_run() {
        let runs = Arc::new(Mutex::new(Vec::new()));
        let (started_tx, started_rx) = mpsc::sync_channel(8);
        let (release_tx, release_rx) = mpsc::channel();
        let host = Arc::new(FakeHost {
            runs: runs.clone(),
            gates: Mutex::new(all_gates_open()),
            block: Mutex::new(Some(release_rx)),
            started: started_tx,
        });
        let engine = Engine::with_timings(host, fast_timings());
        engine.start();
        engine.notify_local_change();
        // First run has started and is now blocked inside run_sync.
        started_rx
            .recv_timeout(Duration::from_secs(2))
            .expect("first run started");
        // A trigger during the run must schedule a second run after this one.
        engine.notify_local_change();
        release_tx.send(()).unwrap(); // let the first run finish
        started_rx
            .recv_timeout(Duration::from_secs(2))
            .expect("second run started after the first");
        std::thread::sleep(Duration::from_millis(30));
        engine.stop();
        assert_eq!(runs.lock().unwrap().len(), 2, "reran after mid-run trigger");
    }

    #[test]
    fn engine_does_not_run_while_a_gate_is_closed() {
        let runs = Arc::new(Mutex::new(Vec::new()));
        let (started_tx, _started_rx) = mpsc::sync_channel(8);
        let host = Arc::new(FakeHost {
            runs: runs.clone(),
            gates: Mutex::new(Gates {
                connected: false,
                ..all_gates_open()
            }),
            block: Mutex::new(None),
            started: started_tx,
        });
        let engine = Engine::with_timings(host, fast_timings());
        engine.start();
        engine.notify_local_change();
        std::thread::sleep(Duration::from_millis(60));
        engine.stop();
        assert!(runs.lock().unwrap().is_empty(), "gated out, no run");
    }
}
