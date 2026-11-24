// What the restart an update ends in would cut off. Agents mid-turn (working,
// or stopped on a question) and background actions hold any install back. One
// nobody is there to start also waits for terminals running a program that
// isn't an agent — an editor, ssh, a test run: a tab brings its agent back
// after a restart, but not those.
use crate::pty::PtyState;
use crate::status::StatusStore;
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;
use tauri::{AppHandle, Manager};

#[derive(Clone, Debug, PartialEq)]
pub struct Busy {
    pub project: String,
    pub agents: usize,
    pub actions: usize,
    pub terminals: usize,
}

#[derive(Default)]
struct Counts {
    agent_panes: BTreeSet<String>,
    actions: usize,
    terminals: usize,
}

pub fn busy(app: &AppHandle, with_terminals: bool) -> Vec<Busy> {
    let mut places: BTreeMap<String, Counts> = BTreeMap::new();
    let store = app.state::<Arc<StatusStore>>();
    for (project, entry) in store.live_agent_entries() {
        places
            .entry(project)
            .or_default()
            .agent_panes
            .insert(entry.pane_id);
    }
    for project in crate::actions::running_background_projects() {
        places.entry(project).or_default().actions += 1;
    }
    if with_terminals {
        let jobs = front_jobs(&app.state::<PtyState>(), None);
        for job in jobs.into_iter().filter(|job| job.busy == Some(true)) {
            let counts = places.entry(job.project).or_default();
            if !counts.agent_panes.contains(&job.pane) {
                counts.terminals += 1;
            }
        }
    }
    places
        .into_iter()
        .map(|(project, counts)| Busy {
            project,
            agents: counts.agent_panes.len(),
            actions: counts.actions,
            terminals: counts.terminals,
        })
        .collect()
}

pub(crate) struct FrontJob {
    pub project: String,
    pub pane: String,
    /// Whether a job that won't come back by itself is in front of the shell;
    /// None where that can't be told, as on another machine.
    pub busy: Option<bool>,
}

/// What each terminal's shell has in front of it, of one project or of all.
pub(crate) fn front_jobs(ptys: &PtyState, project: Option<&str>) -> Vec<FrontJob> {
    let sessions: Vec<_> = ptys
        .sessions
        .lock()
        .unwrap()
        .values()
        .filter(|sess| project.is_none_or(|p| sess.project() == p))
        .cloned()
        .collect();
    #[cfg(windows)]
    let table = crate::procwin::snapshot();
    sessions
        .into_iter()
        .map(|sess| {
            let at_prompt = sess.shell_at_prompt_now();
            // A program with its own window isn't on the console its shell waits at.
            #[cfg(windows)]
            let at_prompt = at_prompt.map(|idle| {
                idle && !crate::pty::local_session_pid(ptys, &sess.id).is_some_and(|shell| {
                    crate::panestop::runs_job(&table, shell as u32, crate::procwin::created)
                })
            });
            FrontJob {
                project: sess.project(),
                pane: sess.id.clone(),
                busy: at_prompt.map(|idle| !idle && !crate::agentexit::resumes(&sess.id)),
            }
        })
        .collect()
}

/// "2 agents in lpm; 1 action in api" — what an install is waiting for.
pub fn describe(places: &[Busy]) -> String {
    let count = |n: usize, one: &str| match n {
        0 => None,
        1 => Some(format!("1 {one}")),
        n => Some(format!("{n} {one}s")),
    };
    places
        .iter()
        .map(|place| {
            let parts: Vec<String> = [
                count(place.agents, "agent"),
                count(place.actions, "action"),
                count(place.terminals, "terminal"),
            ]
            .into_iter()
            .flatten()
            .collect();
            let name = crate::config::project_display_name(&place.project);
            format!("{} in {name}", parts.join(", "))
        })
        .collect::<Vec<_>>()
        .join("; ")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn place(project: &str, agents: usize, actions: usize, terminals: usize) -> Busy {
        Busy {
            project: project.into(),
            agents,
            actions,
            terminals,
        }
    }

    #[test]
    fn describes_each_place_by_what_holds_it() {
        let text = describe(&[
            place("no-such-project-a", 2, 0, 0),
            place("no-such-project-b", 1, 1, 3),
        ]);
        assert_eq!(
            text,
            "2 agents in no-such-project-a; 1 agent, 1 action, 3 terminals in no-such-project-b"
        );
    }
}
