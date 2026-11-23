// How many times in a row CI failing on one branch has started a job. A run
// that pushes a fix CI also fails would start the next, and so on for good;
// like Keep fixing until green, a job stops after MAX_ROUNDS until CI passes on
// that branch again. Held in memory, so quitting lpm clears it too.
use super::events::{AtMost, EventKind, EventSpec};
use super::{
    emit_status, now_secs, push_entry, state_key, with_state, HistoryEntry, JobResolved,
    SKIPPED_CI_ROUNDS,
};
use crate::ci_fix_loop_rules::MAX_ROUNDS;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use tauri::AppHandle;

#[derive(Debug, PartialEq)]
enum Round {
    Go,
    /// The job has had its rounds, which its history says once.
    Stop,
    Stopped,
}

/// Rounds started, by job key, the project CI failed in, and the branch.
#[derive(Default)]
struct Rounds(HashMap<(String, String, String), u32>);

impl Rounds {
    fn take(&mut self, key: &str, project: &str, branch: &str) -> Round {
        let started = self
            .0
            .entry((key.to_string(), project.to_string(), branch.to_string()))
            .or_insert(0);
        if *started > MAX_ROUNDS {
            return Round::Stopped;
        }
        *started += 1;
        if *started > MAX_ROUNDS {
            Round::Stop
        } else {
            Round::Go
        }
    }

    fn passed(&mut self, project: &str, branch: &str) {
        self.0.retain(|(_, p, b), _| p != project || b != branch);
    }
}

fn rounds() -> &'static Mutex<Rounds> {
    static ROUNDS: OnceLock<Mutex<Rounds>> = OnceLock::new();
    ROUNDS.get_or_init(Default::default)
}

pub(crate) fn ci_passed(project: &str, branch: &str) {
    rounds().lock().unwrap().passed(project, branch);
}

/// Whether CI failing on `branch` in `ci_project` may start `job` again.
pub(super) fn allows(
    app: &AppHandle,
    project: &str,
    job: &JobResolved,
    spec: &EventSpec,
    ci_project: &str,
    branch: &str,
) -> bool {
    if spec.kind != EventKind::CiFailed || spec.at_most != AtMost::Commit {
        return true;
    }
    let key = state_key(project, &job.id);
    let round = rounds().lock().unwrap().take(&key, ci_project, branch);
    match round {
        Round::Go => true,
        Round::Stop => {
            let note = format!(
                "CI still fails on {branch} after {MAX_ROUNDS} runs of this automation in a row. It runs again once CI passes on {branch}."
            );
            let _ = with_state(|f| {
                push_entry(
                    f.jobs.entry(key.clone()).or_default(),
                    HistoryEntry {
                        at: now_secs(),
                        result: SKIPPED_CI_ROUNDS.to_string(),
                        output: Some(note),
                        ..HistoryEntry::default()
                    },
                );
            });
            emit_status(app, project, &job.id, SKIPPED_CI_ROUNDS, &None);
            false
        }
        Round::Stopped => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_branch_starts_a_job_max_rounds_times_then_says_so_once() {
        let mut rounds = Rounds::default();
        for _ in 0..MAX_ROUNDS {
            assert_eq!(rounds.take("p/fix", "p", "main"), Round::Go);
        }
        assert_eq!(rounds.take("p/fix", "p", "main"), Round::Stop);
        assert_eq!(rounds.take("p/fix", "p", "main"), Round::Stopped);
        assert_eq!(rounds.take("p/fix", "p", "main"), Round::Stopped);
    }

    #[test]
    fn ci_passing_on_the_branch_starts_the_count_over() {
        let mut rounds = Rounds::default();
        for _ in 0..=MAX_ROUNDS {
            rounds.take("p/fix", "p", "main");
        }
        rounds.passed("p", "dev");
        assert_eq!(rounds.take("p/fix", "p", "main"), Round::Stopped);
        rounds.passed("p", "main");
        assert_eq!(rounds.take("p/fix", "p", "main"), Round::Go);
    }

    #[test]
    fn each_job_and_branch_counts_on_its_own() {
        let mut rounds = Rounds::default();
        for _ in 0..=MAX_ROUNDS {
            rounds.take("p/fix", "p", "main");
        }
        assert_eq!(rounds.take("p/fix", "p", "dev"), Round::Go);
        assert_eq!(rounds.take("p/other", "p", "main"), Round::Go);
        assert_eq!(rounds.take("/fix", "q", "main"), Round::Go);
    }
}
