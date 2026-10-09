// The one update install that may run at a time, and its cancel. An install can
// be cancelled while it checks and downloads; once it starts replacing the app
// it runs on to the restart.
#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::Duration;

const POLL: Duration = Duration::from_millis(100);
const CANCELLED: &str = "Update cancelled.";

#[derive(Default)]
enum Stage {
    #[default]
    Idle,
    Preparing(Arc<AtomicBool>),
    Installing,
}

#[derive(Default)]
pub struct UpdateJob(Mutex<Stage>);

impl UpdateJob {
    /// A cancelled install still winding down doesn't block a new one: it stops
    /// at its next step and leaves the new one's stage alone.
    pub(crate) fn begin(&self) -> Result<JobGuard<'_>, String> {
        let mut stage = self.0.lock().unwrap();
        match &*stage {
            Stage::Preparing(flag) if !flag.load(Ordering::SeqCst) => {
                return Err("An update is already in progress.".into())
            }
            Stage::Installing => return Err("An update is already installing.".into()),
            _ => {}
        }
        let flag = Arc::new(AtomicBool::new(false));
        *stage = Stage::Preparing(flag.clone());
        Ok(JobGuard {
            job: self,
            flag,
            committed: false,
        })
    }

    /// False when there is nothing left to cancel: no install is running, or it
    /// is already replacing the app.
    pub(crate) fn cancel(&self) -> bool {
        match &*self.0.lock().unwrap() {
            Stage::Preparing(flag) => {
                flag.store(true, Ordering::SeqCst);
                true
            }
            _ => false,
        }
    }
}

pub(crate) struct JobGuard<'a> {
    job: &'a UpdateJob,
    flag: Arc<AtomicBool>,
    committed: bool,
}

impl JobGuard<'_> {
    pub(crate) fn cancelled(&self) -> bool {
        self.flag.load(Ordering::SeqCst)
    }

    pub(crate) fn check(&self) -> Result<(), String> {
        if self.cancelled() {
            Err(CANCELLED.into())
        } else {
            Ok(())
        }
    }

    pub(crate) fn flag(&self) -> Arc<AtomicBool> {
        self.flag.clone()
    }

    /// The point of no return: past it, cancel_update reports false.
    pub(crate) fn commit(&mut self) -> Result<(), String> {
        let mut stage = self.job.0.lock().unwrap();
        self.check()?;
        *stage = Stage::Installing;
        self.committed = true;
        Ok(())
    }

    /// Runs `f` on a plain thread (see updates::run_off_worker) and returns as
    /// soon as the install is cancelled, leaving `f` to finish on its own — a
    /// stalled request would otherwise hold the cancel until it timed out.
    pub(crate) fn run<T: Send + 'static>(
        &self,
        f: impl FnOnce() -> Result<T, String> + Send + 'static,
    ) -> Result<T, String> {
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            let _ = tx.send(f());
        });
        loop {
            self.check()?;
            match rx.recv_timeout(POLL) {
                Ok(result) => return result,
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => {
                    return Err("background thread panicked".into())
                }
            }
        }
    }
}

impl Drop for JobGuard<'_> {
    fn drop(&mut self) {
        let mut stage = self.job.0.lock().unwrap();
        let ours = match &*stage {
            Stage::Preparing(flag) => Arc::ptr_eq(flag, &self.flag),
            Stage::Installing => self.committed,
            Stage::Idle => false,
        };
        if ours {
            *stage = Stage::Idle;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn one_install_at_a_time() {
        let job = UpdateJob::default();
        let first = job.begin().unwrap();
        assert!(job.begin().is_err());
        drop(first);
        assert!(job.begin().is_ok());
    }

    #[test]
    fn cancel_stops_before_commit() {
        let job = UpdateJob::default();
        let mut guard = job.begin().unwrap();
        assert!(job.cancel());
        assert!(guard.cancelled());
        assert!(guard.commit().is_err());
    }

    #[test]
    fn nothing_to_cancel_once_committed() {
        let job = UpdateJob::default();
        assert!(!job.cancel());
        let mut guard = job.begin().unwrap();
        guard.commit().unwrap();
        assert!(!job.cancel());
        assert!(!guard.cancelled());
        assert!(job.begin().is_err());
        drop(guard);
        assert!(job.begin().is_ok());
    }

    #[test]
    fn cancelled_install_winding_down_leaves_the_next_alone() {
        let job = UpdateJob::default();
        let old = job.begin().unwrap();
        assert!(job.cancel());
        let new = job.begin().unwrap();
        drop(old);
        assert!(job.begin().is_err());
        assert!(!new.cancelled());
        assert!(job.cancel());
    }

    #[test]
    fn run_returns_on_cancel_without_waiting_for_the_work() {
        let job = Arc::new(UpdateJob::default());
        let guard = job.begin().unwrap();
        let canceller = {
            let job = job.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(50));
                job.cancel()
            })
        };
        let started = Instant::now();
        let result = guard.run(|| {
            std::thread::sleep(Duration::from_secs(5));
            Ok(())
        });
        assert_eq!(result, Err(CANCELLED.to_string()));
        assert!(started.elapsed() < Duration::from_secs(1));
        assert!(canceller.join().unwrap());
    }

    #[test]
    fn run_passes_the_result_through() {
        let job = UpdateJob::default();
        let guard = job.begin().unwrap();
        assert_eq!(guard.run(|| Ok(7)), Ok(7));
        assert_eq!(guard.run(|| Err::<(), _>("boom".to_string())), Err("boom".into()));
    }
}
