// What the task list a Claude Stop carries (`background_tasks`) says about the
// work still going after it: background shells that will wake the session when
// they exit, and which sub-agents are still alive (donehold.rs, agentchildren.rs).
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};

type Id = (String, String);

fn id(project: &str, key: &str) -> Id {
    (project.to_string(), key.to_string())
}

/// A background task as Claude's Stop payload lists it.
#[derive(Deserialize)]
struct Task {
    #[serde(default)]
    id: String,
    #[serde(rename = "type", default)]
    kind: String,
    #[serde(default)]
    status: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    command: String,
}

/// The background shells seen running at a Stop of each session, those of
/// them that no longer keep a Done back, what the last Stop waits on (id and
/// label), and the ones a pause notice already named.
#[derive(Default)]
struct Shells {
    seen: HashSet<String>,
    settled: HashSet<String>,
    waited: Vec<(String, String)>,
    noticed: HashSet<String>,
}

fn shells() -> &'static Mutex<HashMap<Id, Shells>> {
    static SHELLS: OnceLock<Mutex<HashMap<Id, Shells>>> = OnceLock::new();
    SHELLS.get_or_init(Default::default)
}

fn tasks(background_tasks: &str) -> Vec<Task> {
    serde_json::from_str::<Vec<Task>>(background_tasks).unwrap_or_default()
}

fn running_shells(tasks: &[Task]) -> impl Iterator<Item = &Task> {
    tasks
        .iter()
        .filter(|t| t.kind == "shell" && t.live() && !t.id.is_empty())
}

impl Task {
    fn live(&self) -> bool {
        matches!(self.status.as_str(), "running" | "pending")
    }

    /// What the shell is doing, in the model's words; its command when it
    /// gave none.
    fn label(&self) -> String {
        let text = if self.description.trim().is_empty() {
            &self.command
        } else {
            &self.description
        };
        let line = text.lines().next().unwrap_or_default().trim();
        line.chars().take(LABEL_CHARS).collect()
    }
}

/// Long enough for a sentence, short enough for a tooltip row.
const LABEL_CHARS: usize = 120;

/// The running shells whose exit a stopped turn waits for: not one that was
/// running when the user last prompted, nor one that runs until stopped.
fn waited<'a>(
    tasks: &'a [Task],
    settled: Option<&'a HashSet<String>>,
) -> impl Iterator<Item = &'a Task> {
    running_shells(tasks).filter(move |t| {
        !settled.is_some_and(|s| s.contains(&t.id)) && !long_lived(&t.description, &t.command)
    })
}

/// Background task types that finish without anyone being woken, or that only
/// watch: none of them is a sub-agent at work.
const NOT_AGENTS: [&str; 6] = [
    "shell",
    "monitor",
    "dream",
    "auto-mode scan",
    "memory import",
    "subagent",
];

/// What a Stop's task list (`background_tasks`, as JSON) says about the work
/// still going: the shells running now, the ones the turn waits on, and which
/// sub-agents are still alive —
/// one Claude stopped without a SubagentStop (Ctrl+C stops every background
/// agent silently) is gone from the list. A teammate is listed under an id of
/// its own, so while any teammate (or other agent work) is listed every
/// sub-agent is kept.
pub fn stopped_beside(project: &str, key: &str, background_tasks: &str) {
    let tasks = tasks(background_tasks);
    let mut all = shells().lock().unwrap();
    let shells = all.entry(id(project, key)).or_default();
    shells
        .seen
        .extend(running_shells(&tasks).map(|t| t.id.clone()));
    shells.waited = waited(&tasks, Some(&shells.settled))
        .map(|t| (t.id.clone(), t.label()))
        .collect();
    drop(all);
    if tasks
        .iter()
        .any(|t| t.live() && !NOT_AGENTS.contains(&t.kind.as_str()))
    {
        return;
    }
    let listed: HashSet<&str> = tasks
        .iter()
        .filter(|t| t.kind == "subagent" && t.live())
        .map(|t| t.id.as_str())
        .collect();
    crate::agentchildren::retain(project, key, |child| listed.contains(child));
}

/// Whether the turn that stopped left a background shell running that will
/// wake the session. `background_tasks` is the Stop payload's list, as JSON.
pub fn waits_on_shells(project: &str, key: &str, background_tasks: &str) -> bool {
    let tasks = tasks(background_tasks);
    let all = shells().lock().unwrap();
    let settled = all.get(&id(project, key)).map(|s| &s.settled);
    let waits = waited(&tasks, settled).next().is_some();
    waits
}

/// The shells the turn that last stopped waits on, each as the model described
/// it — what a UI names while the finish is held for them.
pub fn waited_on(project: &str, key: &str) -> Vec<String> {
    shells()
        .lock()
        .unwrap()
        .get(&id(project, key))
        .map(|s| s.waited.iter().map(|(_, label)| label.clone()).collect())
        .unwrap_or_default()
}

/// The shells to name in a notice that the turn is still paused: all it waits
/// on, once one of them is new to such a notice. A session woken now and then
/// beside the same long shell hears about it once.
pub fn take_unnoticed(project: &str, key: &str) -> Option<Vec<String>> {
    let mut all = shells().lock().unwrap();
    let shells = all.get_mut(&id(project, key))?;
    let mut new = false;
    for (id, _) in &shells.waited {
        new |= shells.noticed.insert(id.clone());
    }
    new.then(|| shells.waited.iter().map(|(_, label)| label.clone()).collect())
}

/// Every shell seen running so far keeps no later Done back. The user marked
/// the work finished, or sent a prompt (not a wake-up): whatever shell was
/// running before it is the background the session works beside — a server, a
/// watcher — not something a later turn waits on.
pub fn settle(project: &str, key: &str) {
    if let Some(shells) = shells().lock().unwrap().get_mut(&id(project, key)) {
        let seen = std::mem::take(&mut shells.seen);
        shells.settled.extend(seen);
    }
}

/// Words a model describes a long-lived background command with. Not "watch":
/// that is how it describes a Monitor watch, which wakes the session as it fires
/// and ends; a watcher that never ends shows in its command.
const LONG_LIVED_WORDS: [&str; 14] = [
    "dev", "serve", "serves", "serving", "server", "servers", "start", "starts", "launch",
    "launches", "listen", "listener", "daemon", "preview",
];

/// Commands that run until they are stopped.
const LONG_LIVED_COMMANDS: [&str; 26] = [
    "http.server",
    "tail -f",
    "tail -F",
    "--watch",
    "--reload",
    "run dev",
    "run watch",
    "next dev",
    "tauri dev",
    "vite dev",
    "wrangler dev",
    "nodemon",
    "npm start",
    "yarn start",
    "pnpm start",
    "docker compose up",
    "docker-compose up",
    "uvicorn",
    "flask run",
    "runserver",
    "rails s",
    "bootRun",
    "dotnet watch",
    "cargo watch",
    "ngrok",
    "port-forward",
];

/// A shell that runs until stopped: a dev server, a watcher, a launched app.
/// Guessed that way wrongly, the turn is announced the moment it stops, as
/// every turn beside a background shell used to be; missed, the turn stays
/// paused until the user prompts or marks it finished.
fn long_lived(description: &str, command: &str) -> bool {
    let description = description.to_lowercase();
    description
        .split(|c: char| !c.is_ascii_alphanumeric())
        .any(|word| LONG_LIVED_WORDS.contains(&word))
        || LONG_LIVED_COMMANDS.iter().any(|c| command.contains(c))
}

/// The session ended: its shells are nothing to wait on any more.
pub fn forget(project: &str, key: &str) {
    shells().lock().unwrap().remove(&id(project, key));
}

#[cfg(test)]
#[path = "bgtasks_tests.rs"]
mod tests;
