// How often each lpm skill ran and when it last did, kept on the computer that
// expands it (~/.lpm/skill-runs.json): from the composer, a phone, a paired Mac
// or `lpm`. Lists carry it so the Skills tab can show which skills get used.
// A project's skills are counted once across its duplicates and worktrees, which
// share them, and the global ones once.
use crate::lpm_commands::{LpmCommands, Scope, ScopeList};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq)]
pub(crate) struct Runs {
    pub count: u32,
    /// Unix millis.
    pub last: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub(crate) struct RunLog {
    #[serde(default)]
    pub global: BTreeMap<String, Runs>,
    /// By project name, then skill name.
    #[serde(default)]
    pub projects: BTreeMap<String, BTreeMap<String, Runs>>,
}

impl RunLog {
    fn of(&self, project: &str, scope: Scope) -> Option<&BTreeMap<String, Runs>> {
        match scope {
            Scope::Global => Some(&self.global),
            Scope::Project => self.projects.get(project),
        }
    }

    fn of_mut(&mut self, project: &str, scope: Scope) -> &mut BTreeMap<String, Runs> {
        match scope {
            Scope::Global => &mut self.global,
            Scope::Project => self.projects.entry(project.to_string()).or_default(),
        }
    }

    pub(crate) fn record(&mut self, project: &str, scope: Scope, name: &str, now: u64) {
        let runs = self.of_mut(project, scope).entry(name.to_lowercase()).or_default();
        runs.count = runs.count.saturating_add(1);
        runs.last = runs.last.max(now);
    }

    /// Keeps a skill's runs when it's renamed or moved to the other list.
    pub(crate) fn rename(&mut self, project: &str, from: (Scope, &str), to: (Scope, &str)) {
        let Some(runs) = self.of_mut(project, from.0).remove(&from.1.to_lowercase()) else {
            return;
        };
        let into = self.of_mut(project, to.0).entry(to.1.to_lowercase()).or_default();
        into.count = into.count.saturating_add(runs.count);
        into.last = into.last.max(runs.last);
        self.prune(project);
    }

    pub(crate) fn forget(&mut self, project: &str, scope: Scope, name: &str) {
        self.of_mut(project, scope).remove(&name.to_lowercase());
        self.prune(project);
    }

    fn prune(&mut self, project: &str) {
        if self.projects.get(project).is_some_and(BTreeMap::is_empty) {
            self.projects.remove(project);
        }
    }

    pub(crate) fn annotate(&self, project: &str, lists: &mut LpmCommands) {
        let fill = |list: &mut ScopeList, scope: Scope| {
            let runs = self.of(project, scope);
            for command in &mut list.commands {
                let found = runs.and_then(|r| r.get(&command.name.to_lowercase()));
                command.runs = found.map(|r| r.count);
                command.last_run_at = found.map(|r| r.last);
            }
        };
        fill(&mut lists.global, Scope::Global);
        if let Some(own) = lists.project.as_mut() {
            fill(own, Scope::Project);
        }
    }
}

static LOCK: Mutex<()> = Mutex::new(());

fn path() -> PathBuf {
    crate::config::lpm_dir().join("skill-runs.json")
}

fn load() -> RunLog {
    std::fs::read(path())
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

fn update(f: impl FnOnce(&mut RunLog)) {
    // Tests expand skills too, and must leave the user's own log alone.
    if cfg!(test) {
        return;
    }
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let before = load();
    let mut log = before.clone();
    f(&mut log);
    if log == before {
        return;
    }
    let written = std::fs::create_dir_all(crate::config::lpm_dir())
        .map_err(|e| e.to_string())
        .and_then(|()| serde_json::to_vec(&log).map_err(|e| e.to_string()))
        .and_then(|data| {
            crate::fsatomic::write(&path(), &data, crate::fsatomic::Mode::Preserve(0o644)).map_err(|e| e.to_string())
        });
    if let Err(e) = written {
        eprintln!("lpm: couldn't save skill runs: {e}");
    }
}

fn now_millis() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64)
}

fn owner(project: &str) -> String {
    crate::session_memory_scope::memory_owner(project)
}

pub(crate) fn record(project: &str, scope: Scope, name: &str) {
    let now = now_millis();
    update(|log| log.record(&owner(project), scope, name, now));
}

pub(crate) fn rename(project: &str, from: (Scope, &str), to: (Scope, &str)) {
    if from.0 == to.0 && from.1.eq_ignore_ascii_case(to.1) {
        return;
    }
    update(|log| log.rename(&owner(project), from, to));
}

pub(crate) fn forget(project: &str, scope: Scope, name: &str) {
    update(|log| log.forget(&owner(project), scope, name));
}

pub(crate) fn annotate(project: &str, lists: &mut LpmCommands) {
    load().annotate(&owner(project), lists);
}

#[cfg(test)]
#[path = "lpm_commands_usage_tests.rs"]
mod tests;
