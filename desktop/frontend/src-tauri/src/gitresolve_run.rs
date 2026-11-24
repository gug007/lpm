//! One AI at a time on a project's merge conflicts, whoever asked for it: the
//! desktop's Merge dialog or a phone. Phones are told each step
//! (remote/conflicts.rs), so one that was locked meanwhile finds it still going.
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

/// A run started, said what it's doing, or ended.
pub(crate) const EVENT: &str = "merge-conflict-run";

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Step {
    pub(crate) project: String,
    pub(crate) running: bool,
    /// What the AI is doing, as it says it.
    #[serde(skip_serializing_if = "String::is_empty")]
    pub(crate) line: String,
    /// Ended: the files that still have conflicts.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) left: Option<usize>,
    /// Ended: a merge is still to be committed, rather than a rebase or a stash.
    pub(crate) merging: bool,
    /// Ended: what went wrong, except when it was stopped.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) error: Option<String>,
}

/// What the AI is doing, as `MergeState` carries it.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub(crate) struct Resolving {
    pub(crate) line: String,
}

struct Active {
    gen_id: String,
    step: Step,
    stopping: bool,
}

fn active() -> &'static Mutex<HashMap<String, Active>> {
    static RUNS: OnceLock<Mutex<HashMap<String, Active>>> = OnceLock::new();
    RUNS.get_or_init(Default::default)
}

/// What the AI at `cwd`'s conflicts is doing, while one is.
pub(crate) fn resolving(cwd: &str) -> Option<Resolving> {
    let runs = active().lock().unwrap();
    runs.get(cwd).map(|run| Resolving {
        line: run.step.line.clone(),
    })
}

/// Refuses what would change the files under a running AI.
pub(crate) fn check_idle(cwd: &str) -> Result<(), String> {
    match resolving(cwd) {
        Some(_) => Err("AI is still resolving the conflicts. Stop it first.".into()),
        None => Ok(()),
    }
}

/// Stops the AI at `cwd`'s conflicts, whoever set it on them; what it staged stays.
#[tauri::command(async)]
pub fn git_stop_conflict_ai(cwd: String) -> Result<(), String> {
    let gen_id = {
        let mut runs = active().lock().unwrap();
        let run = runs
            .get_mut(&cwd)
            .ok_or("AI isn't resolving these conflicts.")?;
        // One whose agent hasn't started yet stops at its first word (`say`).
        run.stopping = true;
        run.gen_id.clone()
    };
    crate::aigen::cancel_ai_generate(gen_id);
    Ok(())
}

fn claim(cwd: &str, project: &str, gen_id: &str) -> Result<Step, String> {
    let mut runs = active().lock().unwrap();
    if runs.contains_key(cwd) {
        return Err("AI is already resolving these conflicts.".into());
    }
    let step = Step {
        project: project.to_string(),
        running: true,
        ..Step::default()
    };
    let gen_id = gen_id.to_string();
    let run = Active {
        gen_id,
        step: step.clone(),
        stopping: false,
    };
    runs.insert(cwd.to_string(), run);
    Ok(step)
}

/// The run's new step, and whether it was told to stop.
fn say(cwd: &str, line: &str) -> Option<(Step, bool)> {
    let mut runs = active().lock().unwrap();
    let run = runs.get_mut(cwd)?;
    run.step.line = line.to_string();
    Some((run.step.clone(), run.stopping))
}

fn ended(project: &str, outcome: &Result<String, String>, left: usize, merging: bool) -> Step {
    let canceled = matches!(outcome, Err(e) if e == crate::aigen::AI_CANCELED);
    Step {
        project: project.to_string(),
        left: outcome.is_ok().then_some(left),
        merging,
        error: outcome.as_ref().err().filter(|_| !canceled).cloned(),
        ..Step::default()
    }
}

/// A run in progress: dropped, its conflicts are free again.
pub(crate) struct Run {
    app: AppHandle,
    pub(crate) cwd: String,
    /// The project it was asked for in, when it was one's.
    pub(crate) project: Option<String>,
    pub(crate) gen_id: String,
}

impl Run {
    pub(crate) fn begin(
        app: &AppHandle,
        project: Option<&str>,
        cwd: &str,
        gen_id: &str,
    ) -> Result<Self, String> {
        let started = claim(cwd, project.unwrap_or_default(), gen_id)?;
        let _ = app.emit(EVENT, started);
        Ok(Self {
            app: app.clone(),
            cwd: cwd.to_string(),
            project: project.map(String::from),
            gen_id: gen_id.to_string(),
        })
    }

    pub(crate) fn say(&self, line: &str) {
        let Some((step, stopping)) = say(&self.cwd, line) else {
            return;
        };
        if stopping {
            crate::aigen::cancel_ai_generate(self.gen_id.clone());
        }
        let _ = self.app.emit(EVENT, step);
    }

    /// Frees the conflicts and tells everyone how it went.
    pub(crate) fn finish(self, outcome: &Result<String, String>) {
        let state = crate::gitresolve::git_merge_state(self.cwd.clone());
        let left = state.files.iter().filter(|f| !f.resolved).count();
        let project = self.project.as_deref().unwrap_or_default();
        let step = ended(project, outcome, left, state.merging);
        let (app, cwd) = (self.app.clone(), self.cwd.clone());
        drop(self);
        let _ = app.emit(EVENT, step);
        crate::gitmoved::announce(&cwd);
    }
}

impl Drop for Run {
    fn drop(&mut self) {
        active().lock().unwrap().remove(&self.cwd);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_run_at_a_time_holds_a_projects_conflicts() {
        let cwd = "/test/one-run";
        assert!(check_idle(cwd).is_ok());
        assert!(claim(cwd, "api", "g1").unwrap().running);
        assert!(claim(cwd, "api", "g2").unwrap_err().contains("already"));
        assert!(check_idle(cwd).unwrap_err().contains("Stop it first"));
        let (step, stopping) = say(cwd, "Editing a.ts").unwrap();
        assert_eq!((step.line.as_str(), stopping), ("Editing a.ts", false));
        assert_eq!(resolving(cwd).unwrap().line, "Editing a.ts");
        active().lock().unwrap().remove(cwd);
        assert_eq!(resolving(cwd), None);
        assert_eq!(say(cwd, "late"), None);
    }

    #[test]
    fn a_run_is_told_to_stop_even_before_its_agent_started() {
        let cwd = "/test/stop";
        assert!(git_stop_conflict_ai(cwd.into()).is_err());
        claim(cwd, "api", "never-registered").unwrap();
        git_stop_conflict_ai(cwd.into()).unwrap();
        assert!(say(cwd, "Starting claude…").unwrap().1);
        active().lock().unwrap().remove(cwd);
    }

    #[test]
    fn the_end_tells_what_is_left_or_what_went_wrong() {
        let done = ended("api", &Ok("ok".into()), 1, true);
        assert_eq!((done.left, done.merging, done.error), (Some(1), true, None));
        let failed = ended("api", &Err("claude failed".into()), 2, true);
        assert_eq!(failed.left, None);
        assert_eq!(failed.error.as_deref(), Some("claude failed"));
        let stopped = ended("api", &Err(crate::aigen::AI_CANCELED.into()), 2, true);
        assert!(stopped.left.is_none() && stopped.error.is_none());
    }
}
