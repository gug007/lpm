// How many times in a row CI failing on one branch, or bots reviewing one pull
// request, has started a job. A run that pushes a fix CI also fails would start
// the next, and so on for good, and so would one whose push a review bot answers;
// like Keep fixing until green, a job stops after MAX_ROUNDS until CI passes on
// that branch again, or a person reviews that pull request. Held in memory, so
// quitting lpm clears it too.
use super::events::{AtMost, EventKind, EventSpec};
use super::{
    emit_status, now_secs, push_entry, state_key, with_state, HistoryEntry, JobResolved,
    SKIPPED_CI_ROUNDS, SKIPPED_REVIEW_ROUNDS,
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

/// What keeps starting a job.
pub(super) enum Subject<'a> {
    Branch(&'a str),
    Pull {
        number: u64,
        url: &'a str,
        bots_only: bool,
    },
}

/// Rounds started, by job key, the project it happened in, and the branch CI
/// failed on or the pull request's URL.
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

    fn forget(&mut self, key: &str, project: &str, subject: &str) {
        self.0.remove(&(key.to_string(), project.to_string(), subject.to_string()));
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

/// Whether what happened in `in_project` may start `job` again.
pub(super) fn allows(
    app: &AppHandle,
    project: &str,
    job: &JobResolved,
    spec: &EventSpec,
    in_project: &str,
    subject: Subject,
) -> bool {
    if spec.at_most != AtMost::Commit {
        return true;
    }
    let key = state_key(project, &job.id);
    let (round, result, note) = match (spec.kind, subject) {
        (EventKind::CiFailed, Subject::Branch(branch)) => (
            rounds().lock().unwrap().take(&key, in_project, branch),
            SKIPPED_CI_ROUNDS,
            format!(
                "CI still fails on {branch} after {MAX_ROUNDS} runs of this automation in a row. It runs again once CI passes on {branch}."
            ),
        ),
        (EventKind::PrReviewed, Subject::Pull { number, url, bots_only }) => {
            let mut rounds = rounds().lock().unwrap();
            if !bots_only {
                rounds.forget(&key, in_project, url);
                return true;
            }
            (
                rounds.take(&key, in_project, url),
                SKIPPED_REVIEW_ROUNDS,
                format!(
                    "Only bots reviewed #{number} before and after the last {MAX_ROUNDS} runs of this automation. It runs again once a person reviews #{number}."
                ),
            )
        }
        _ => return true,
    };
    match round {
        Round::Go => true,
        Round::Stop => {
            let _ = with_state(|f| {
                push_entry(
                    f.jobs.entry(key.clone()).or_default(),
                    HistoryEntry {
                        at: now_secs(),
                        result: result.to_string(),
                        output: Some(note),
                        ..HistoryEntry::default()
                    },
                );
            });
            emit_status(app, project, &job.id, result, &None);
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
    fn a_persons_review_starts_the_count_over() {
        let mut rounds = Rounds::default();
        let pull = "https://github.com/o/r/pull/212";
        for _ in 0..=MAX_ROUNDS {
            rounds.take("p/review", "p", pull);
        }
        rounds.passed("p", "main");
        assert_eq!(rounds.take("p/review", "p", pull), Round::Stopped);
        rounds.forget("p/review", "p", pull);
        assert_eq!(rounds.take("p/review", "p", pull), Round::Go);
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
