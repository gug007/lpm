//! A repo's own `.lpm.yml` runs no command by itself until its user allows it.
//! Labels, `labelSvg` and popups run their `$(…)` commands without a click,
//! and its automations run on their schedule, so a repo cloned from someone
//! else would otherwise run its code as soon as its project is open. Until
//! they're allowed for the folder, they're held: a label reads as if its
//! command printed nothing, a popup says why it's empty, and an automation
//! doesn't run. What's allowed is the commands themselves and each automation
//! as written, so one the repo adds or changes later is held again.
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, Mutex};

use super::{ActionFull, ActionInputOptionDef, ActionsYaml};
use crate::label_template::{render, Part};

const FILE: &str = "allowed-repo-commands.json";

type Allowed = BTreeMap<String, BTreeSet<String>>;
type Memo<T> = Mutex<HashMap<PathBuf, (Vec<u8>, Arc<T>)>>;

static REPO_COMMANDS: LazyLock<Memo<BTreeSet<String>>> = LazyLock::new(Default::default);
static ALLOWED: LazyLock<Memo<Allowed>> = LazyLock::new(Default::default);

/// What `path` holds, parsed again only when its bytes change: every project
/// listing asks, and a file reads far quicker than it parses. Compares the bytes
/// and not a timestamp, so a held command can't slip through on a stale answer.
fn parsed<T: Default>(memo: &Memo<T>, path: PathBuf, parse: impl FnOnce(&[u8]) -> T) -> Arc<T> {
    let Ok(bytes) = std::fs::read(&path) else {
        memo.lock().unwrap().remove(&path);
        return Arc::default();
    };
    if let Some((seen, value)) = memo.lock().unwrap().get(&path) {
        if *seen == bytes {
            return value.clone();
        }
    }
    let value = Arc::new(parse(&bytes));
    memo.lock().unwrap().insert(path, (bytes, value.clone()));
    value
}

/// The commands the project's `.lpm.yml` would run by itself that haven't been
/// allowed. Empty for a remote project, whose repo layer lpm doesn't read.
pub(crate) fn held(root: &str, is_remote: bool) -> BTreeSet<String> {
    held_in(&super::lpm_dir(), root, is_remote)
}

/// Allows every command the project's `.lpm.yml` runs by itself now.
pub(crate) fn allow(root: &str) -> Result<(), String> {
    allow_in(&super::lpm_dir(), root)
}

fn held_in(dir: &Path, root: &str, is_remote: bool) -> BTreeSet<String> {
    if is_remote || root.is_empty() {
        return BTreeSet::new();
    }
    let commands = repo_commands(root);
    if commands.is_empty() {
        return BTreeSet::new();
    }
    let all = load(dir);
    match all.get(&key(root)) {
        Some(allowed) => commands.difference(allowed).cloned().collect(),
        None => (*commands).clone(),
    }
}

fn allow_in(dir: &Path, root: &str) -> Result<(), String> {
    let mut all = (*load(dir)).clone();
    all.entry(key(root))
        .or_default()
        .extend(repo_commands(root).iter().cloned());
    save(dir, &all)
}

/// Whether the repo's automation `id`, as it reads now, is held.
pub(crate) fn holds_job(held: &BTreeSet<String>, id: &str) -> bool {
    let prefix = job_prefix(id);
    held.iter().any(|entry| entry.starts_with(&prefix))
}

fn job_prefix(id: &str) -> String {
    format!("automation {id}: ")
}

fn repo_commands(root: &str) -> Arc<BTreeSet<String>> {
    parsed(&REPO_COMMANDS, Path::new(root).join(".lpm.yml"), commands_of)
}

fn commands_of(bytes: &[u8]) -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    if let Ok(yaml) = serde_norway::from_slice::<ActionsYaml>(bytes) {
        for action in super::build_base_layer(&yaml).values() {
            collect(action, &mut out);
        }
    }
    for (id, def) in crate::jobs::raw_jobs(bytes) {
        let written = serde_json::to_string(&def)
            .or_else(|_| serde_norway::to_string(&def).map(|y| y.trim().replace('\n', " ")))
            .unwrap_or_default();
        out.insert(format!("{}{written}", job_prefix(&id)));
    }
    out
}

fn collect(action: &ActionFull, out: &mut BTreeSet<String>) {
    for text in [&action.label, &action.emoji, &action.label_svg] {
        commands_in(text, out);
    }
    for input in action.inputs.values() {
        commands_in(&input.label, out);
        for option in &input.options {
            match option {
                ActionInputOptionDef::Scalar(label) | ActionInputOptionDef::Full { label, .. } => {
                    commands_in(label, out)
                }
            }
        }
    }
    if let Some(popup) = &action.popup {
        out.extend(popup.commands().map(str::to_string));
    }
    for child in action.actions.values() {
        collect(&child.clone().into_full(), out);
    }
}

/// The `$(…)` commands in a label, as the label renderer finds them.
fn commands_in(text: &str, out: &mut BTreeSet<String>) {
    render(text, |part| {
        if let Part::Cmd(command) = part {
            out.insert((*command).to_string());
        }
        String::new()
    });
}

fn key(root: &str) -> String {
    crate::agent_usage::normalize_path(Path::new(root))
        .to_string_lossy()
        .into_owned()
}

fn load(dir: &Path) -> Arc<Allowed> {
    parsed(&ALLOWED, dir.join(FILE), |bytes| {
        serde_json::from_slice(bytes).unwrap_or_default()
    })
}

fn save(dir: &Path, all: &Allowed) -> Result<(), String> {
    let text = serde_json::to_vec_pretty(all).map_err(|e| e.to_string())?;
    crate::fsatomic::write(&dir.join(FILE), &text, crate::fsatomic::Mode::Preserve(0o644))
        .map_err(|e| e.to_string())
}

#[cfg(test)]
#[path = "repo_trust_tests.rs"]
mod tests;
