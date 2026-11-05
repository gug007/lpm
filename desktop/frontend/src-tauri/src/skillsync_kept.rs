// Project skills kept out of Git, on config sync. Git can't carry them, so each one
// crosses as one unit, the way a global skill does, to the same project on the other
// computer: the same name and the same repository. The rules that keep it out of Git
// land before it does, so it never shows up there as a file to commit.
//
// Unlike a global skill, a missing one says nothing: `git clean -X` or a fresh clone
// takes every kept-out skill at once without anyone meaning to delete them. So only a
// delete made in lpm crosses, and a skill that is merely gone comes back from the other
// computer.
use crate::config;
use crate::lpm_commands::{project_place, project_store, CommandFs, LocalFs};
use crate::lpm_commands_cmds::CHANGED_EVENT;
use crate::lpm_commands_snapshot::CommandFile;
use crate::peersync::{item_key, ItemDigest, WireItem};
use crate::skillsync;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

pub(crate) const KIND: &str = "kept-skill";

/// One computer's side of it. A unit is `<project>/<skill>`.
#[derive(Serialize, Deserialize, Default, Clone, Debug)]
pub struct KeptSkills {
    /// Each project read here and which repository it is, without any credentials
    /// an `origin` can hold. Nothing crosses for a project missing from either list.
    pub repos: BTreeMap<String, String>,
    pub skills: BTreeMap<String, ItemDigest>,
    /// Units that must stay as they are here: someone else's skill, one in Git, and a
    /// kept-out one that can't cross.
    pub held: Vec<String>,
}

fn unit(project: &str, name: &str) -> String {
    format!("{project}/{name}")
}

fn split(unit: &str) -> Result<(&str, &str), String> {
    unit.rsplit_once('/').ok_or_else(|| format!("not a project skill: {unit}"))
}

fn paired(a: &KeptSkills, b: &KeptSkills, unit: &str) -> bool {
    split(unit).is_ok_and(|(project, _)| {
        matches!((a.repos.get(project), b.repos.get(project)), (Some(x), Some(y)) if x == y)
    })
}

/// What a sync between two computers may touch.
pub(crate) fn shared_units<'a>(a: &'a KeptSkills, b: &'a KeptSkills) -> BTreeSet<&'a String> {
    a.skills
        .keys()
        .chain(b.skills.keys())
        .filter(|u| paired(a, b, u) && !a.held.contains(u) && !b.held.contains(u))
        .collect()
}

/// The names of skills left on one computer because the other holds that name.
pub(crate) fn skipped(a: &KeptSkills, b: &KeptSkills) -> Vec<String> {
    let blocked = |from: &KeptSkills, by: &KeptSkills| -> Vec<String> {
        from.skills
            .iter()
            .filter(|(u, d)| !d.deleted && by.held.contains(u) && paired(a, b, u))
            .filter_map(|(u, _)| split(u).ok())
            .map(|(_, name)| name.to_string())
            .collect()
    };
    let mut names = blocked(a, b);
    names.extend(blocked(b, a));
    names
}

fn local_project(project: &str) -> Option<(PathBuf, LocalFs)> {
    config::validate_name(project).ok()?;
    let place = project_place(project).ok()??;
    if place.ssh.is_some() {
        return None;
    }
    let root = PathBuf::from(place.root);
    root.is_dir().then(|| {
        let fs = project_store(&root);
        (root, fs)
    })
}

fn project_of(unit: &str) -> Result<(LocalFs, &str), String> {
    let (project, name) = split(unit)?;
    let (_, fs) = local_project(project)
        .ok_or_else(|| format!("{project} isn't a project on this computer"))?;
    Ok((fs, name))
}

/// Most projects have no skills, and asking git about them would run on every sync.
fn add_project(project: &str, repo: String, fs: &LocalFs, out: &mut KeptSkills) {
    if fs.is_unreadable() {
        return;
    }
    if !fs.roots().iter().any(|root| root.is_dir()) {
        out.repos.insert(project.to_string(), repo);
        return;
    }
    let Ok(snap) = fs.snapshot() else {
        return;
    };
    let list = skillsync::sorted_out(fs, &snap, is_kept_out);
    out.repos.insert(project.to_string(), repo);
    out.skills.extend(list.skills.into_iter().map(|(name, item)| (unit(project, &name), item)));
    out.held.extend(list.held.iter().map(|name| unit(project, name)));
}

fn is_kept_out(file: &CommandFile) -> bool {
    file.git.kept_out
}

fn repo_of(root: &Path) -> Option<String> {
    crate::ignoredpath::origin_of(root).map(|url| crate::ignoredpath::repo_key(&url))
}

/// Every project here that sits in a repository, and its kept-out skills.
pub(crate) fn local_list<'a>(projects: impl Iterator<Item = &'a String>) -> KeptSkills {
    let mut out = KeptSkills::default();
    // A duplicate's are its original's, and would cross twice under another name.
    for project in projects.filter(|p| config::peek_parent(p).is_none()) {
        if let Some((root, fs)) = local_project(project) {
            if let Some(repo) = repo_of(&root) {
                add_project(project, repo, &fs, &mut out);
            }
        }
    }
    out
}

fn holds(fs: &LocalFs, name: &str, test: impl Fn(&CommandFile) -> bool) -> Result<bool, String> {
    Ok(fs.snapshot()?.files.iter().any(|f| f.name == name && test(f)))
}

fn item_in(fs: &LocalFs, unit: &str, name: &str) -> Result<WireItem, String> {
    if !holds(fs, name, is_kept_out)? {
        return Err(format!("/{name} isn't kept out of Git on this computer"));
    }
    let item = skillsync::item_from(fs, name)?;
    Ok(WireItem { kind: KIND.into(), name: unit.into(), ..item })
}

fn apply_in(fs: &LocalFs, name: &str, json: &[u8]) -> Result<String, String> {
    skillsync::apply_after(fs, name, json, || {
        if holds(fs, name, |f| !is_kept_out(f))? {
            return Err(format!("/{name} is in Git on this computer"));
        }
        crate::lpm_commands_git::keep_landing(fs, name)
    })
}

/// A skill in Git here belongs to the repo, whatever the other computer did with its
/// own copy.
fn delete_in(fs: &LocalFs, name: &str) -> Result<(), String> {
    if holds(fs, name, is_kept_out)? {
        fs.remove_skill(name)?;
        crate::lpm_commands_git::forget_removed(fs, name);
    }
    Ok(())
}

pub(crate) fn read_item(unit: &str) -> Result<WireItem, String> {
    let (fs, name) = project_of(unit)?;
    item_in(&fs, unit, name)
}

pub(crate) fn apply(unit: &str, json: &[u8]) -> Result<String, String> {
    let (fs, name) = project_of(unit)?;
    apply_in(&fs, name, json)
}

pub(crate) fn delete(unit: &str) -> Result<(), String> {
    let (fs, name) = project_of(unit)?;
    delete_in(&fs, name)
}

/// The user deleted or renamed a project's skill, or moved it to another list, which
/// is the one way a kept-out skill's absence means something.
pub(crate) fn note_removed(project: &str, name: &str) {
    let key = item_key(KIND, &unit(project, name));
    crate::syncstate::mutate(|state| (state.tombstone(&key), ()));
}

/// Git holds no copy of these, so the backup is the only way back from a sync.
pub(crate) fn back_up(dst: &Path) -> Result<(), String> {
    for project in config::project_names() {
        if let Some((_, fs)) = local_project(&project) {
            skillsync::back_up_where(&fs, &dst.join(&project), is_kept_out)?;
        }
    }
    Ok(())
}

/// A sync writes into project folders, which nothing watches, so the lists showing
/// what landed are told here.
pub(crate) fn announce<'a>(app: &AppHandle, items: impl Iterator<Item = (&'a str, &'a str)>) {
    let projects: BTreeSet<&str> = items
        .filter(|(kind, _)| *kind == KIND)
        .filter_map(|(_, unit)| split(unit).ok())
        .map(|(project, _)| project)
        .collect();
    for project in projects {
        crate::lpm_commands_shared::refresh_all(project);
        for named in crate::lpm_commands_shared::family(project) {
            let _ = app.emit(CHANGED_EVENT, named);
        }
    }
}

#[cfg(test)]
#[path = "skillsync_kept_tests.rs"]
mod tests;
