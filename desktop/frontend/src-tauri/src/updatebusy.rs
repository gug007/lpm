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
        for (project, pane) in busy_terminals(&app.state::<PtyState>()) {
            let counts = places.entry(project).or_default();
            if !counts.agent_panes.contains(&pane) {
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

/// (project, pane) of each local terminal whose shell has a job in front of it
/// that won't come back by itself.
fn busy_terminals(ptys: &PtyState) -> Vec<(String, String)> {
    let sessions: Vec<_> = ptys.sessions.lock().unwrap().values().cloned().collect();
    #[cfg(windows)]
    let table = crate::procwin::snapshot();
    sessions
        .into_iter()
        .filter(|sess| {
            let at_prompt = sess.shell_at_prompt();
            // Windows has no foreground group: a job is a program under the shell.
            #[cfg(windows)]
            let at_prompt = at_prompt.or_else(|| {
                let shell = crate::pty::local_session_pid(ptys, &sess.id)? as u32;
                Some(crate::procwin::foreground(&table, shell, crate::procwin::created) == shell)
            });
            at_prompt == Some(false) && !crate::agentexit::resumes(&sess.id)
        })
        .map(|sess| (sess.project(), sess.id.clone()))
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
