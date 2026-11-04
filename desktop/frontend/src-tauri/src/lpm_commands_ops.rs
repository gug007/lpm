// Changes to a skills list: saving (create, edit, rename, move between folders
// or lists) and deleting skills, and creating, renaming and removing folders.
// Each one checks the list as it is on disk first, so two skills in one list
// never share a name and a skill lpm didn't create is never written over.
use crate::lpm_commands::{
    check_name, clean_folder, clean_folder_opt, codex_policy_file, place_label, skill_file, CommandFile,
    CommandFs, CommandInput, CommandRef, Doc, Scope, Snapshot, Stores, MAX_FILE_BYTES,
};
use crate::lpm_commands_doc::MAX_DESCRIPTION_CHARS;

fn existing_folder(folders: &[String], folder: &str) -> Option<String> {
    folders.iter().find(|f| f.eq_ignore_ascii_case(folder)).cloned()
}

fn find<'a>(snap: &'a Snapshot, name: &str) -> Option<&'a CommandFile> {
    snap.files.iter().find(|f| f.name == name)
}

/// The list's folders go on existing as they stood, a skill's move out of its
/// folder leaving it empty rather than gone.
fn keep_folders(fs: &dyn CommandFs, snap: &Snapshot, folders: Vec<String>) -> Result<(), String> {
    if folders == snap.saved_folders {
        return Ok(());
    }
    fs.save_folders(&folders)
}

/// A new skill: its file, what keeps Codex from starting it on its own, and
/// Claude's link.
pub(crate) fn create_skill(fs: &dyn CommandFs, name: &str, doc: Doc) -> Result<(), String> {
    fs.write(&skill_file(name), &doc.to_skill(name))?;
    fs.write(&codex_policy_file(name), crate::agent_caps::CODEX_OPT_OUT)?;
    fs.link_claude(name)
}

/// Create or update a skill; with `previous` it is an edit, which may also
/// rename it or move it to another folder or the other list.
pub(crate) fn save(stores: &Stores, input: CommandInput, previous: Option<CommandRef>) -> Result<(), String> {
    check_name(&input.name)?;
    if input.body.trim().is_empty() {
        return Err("Write the prompt first.".into());
    }
    if input.description.chars().count() > MAX_DESCRIPTION_CHARS {
        return Err(format!("Keep the description to {MAX_DESCRIPTION_CHARS} characters."));
    }
    if let Some(p) = &previous {
        check_name(&p.name)?;
        clean_folder_opt(p.folder.as_deref())?;
    }
    let fs = stores.get(input.scope)?;
    let snap = fs.snapshot()?;
    let same_list = previous.as_ref().filter(|p| p.scope == input.scope);
    let is_previous = |name: &str| same_list.is_some_and(|p| p.name == name);
    if let Some(clash) = snap.files.iter().find(|f| f.name == input.name && !is_previous(&f.name)) {
        return Err(format!("/{} already exists in {}.", clash.name, place_label(clash.doc.folder.as_deref())));
    }
    if snap.others.iter().any(|n| n.eq_ignore_ascii_case(&input.name)) {
        return Err(format!("A skill named {} already exists, not created in lpm.", input.name));
    }
    let folder = clean_folder_opt(input.folder.as_deref())?
        .map(|f| existing_folder(&snap.folders, &f).unwrap_or(f));
    let mut folders = snap.folders.clone();
    if let Some(f) = folder.as_ref().filter(|f| !folders.contains(f)) {
        folders.push(f.clone());
    }
    let doc = |base: Option<&Doc>| {
        let doc = match base {
            Some(old) => Doc {
                description: input.description.clone(),
                body: input.body.clone(),
                folder: folder.clone(),
                ..old.clone()
            },
            None => Doc::new(&input.description, &input.body, folder.clone()),
        };
        // A list reads MAX_FILE_BYTES of a file, so a longer one would come back cut.
        if doc.to_skill(&input.name).len() > MAX_FILE_BYTES {
            return Err("That prompt is too long to save.".to_string());
        }
        Ok(doc)
    };
    match previous {
        Some(p) if p.scope == input.scope => {
            let Some(old) = find(&snap, &p.name) else {
                create_skill(fs, &input.name, doc(None)?)?;
                return keep_folders(fs, &snap, folders);
            };
            let doc = doc(Some(&old.doc))?;
            if p.name != input.name {
                fs.rename_skill(&p.name, &input.name)?;
            }
            fs.write(&skill_file(&input.name), &doc.to_skill(&input.name))?;
            fs.link_claude(&input.name)?;
        }
        Some(p) => {
            let other = stores.get(p.scope)?;
            let other_snap = other.snapshot()?;
            create_skill(fs, &input.name, doc(find(&other_snap, &p.name).map(|f| &f.doc))?)?;
            if find(&other_snap, &p.name).is_some() {
                other.remove_skill(&p.name)?;
            }
            keep_folders(other, &other_snap, other_snap.folders.clone())?;
        }
        None => create_skill(fs, &input.name, doc(None)?)?,
    }
    keep_folders(fs, &snap, folders)
}

/// Only a skill the list holds, so a name that isn't lpm's can't be removed.
pub(crate) fn delete(stores: &Stores, target: &CommandRef) -> Result<(), String> {
    check_name(&target.name)?;
    clean_folder_opt(target.folder.as_deref())?;
    let fs = stores.get(target.scope)?;
    let snap = fs.snapshot()?;
    if find(&snap, &target.name).is_none() {
        return Ok(());
    }
    fs.remove_skill(&target.name)?;
    keep_folders(fs, &snap, snap.folders.clone())
}

pub(crate) fn create_folder(stores: &Stores, scope: Scope, name: &str) -> Result<(), String> {
    let name = clean_folder(name)?;
    let fs = stores.get(scope)?;
    let snap = fs.snapshot()?;
    if existing_folder(&snap.folders, &name).is_some() {
        return Err(format!("A folder named {name} already exists."));
    }
    let mut folders = snap.folders.clone();
    folders.push(name);
    keep_folders(fs, &snap, folders)
}

fn relabel(fs: &dyn CommandFs, snap: &Snapshot, from: &str, to: Option<&str>) -> Result<(), String> {
    for file in snap.files.iter().filter(|f| f.doc.folder.as_deref() == Some(from)) {
        let doc = Doc { folder: to.map(str::to_string), ..file.doc.clone() };
        fs.write(&skill_file(&file.name), &doc.to_skill(&file.name))?;
        fs.link_claude(&file.name)?;
    }
    Ok(())
}

pub(crate) fn rename_folder(stores: &Stores, scope: Scope, from: &str, to: &str) -> Result<(), String> {
    let from = clean_folder(from)?;
    let to = clean_folder(to)?;
    if from == to {
        return Ok(());
    }
    let fs = stores.get(scope)?;
    let snap = fs.snapshot()?;
    let Some(current) = existing_folder(&snap.folders, &from) else {
        return Err(format!("The {from} folder is gone."));
    };
    if !from.eq_ignore_ascii_case(&to) && existing_folder(&snap.folders, &to).is_some() {
        return Err(format!("A folder named {to} already exists."));
    }
    relabel(fs, &snap, &current, Some(&to))?;
    let folders = snap
        .folders
        .iter()
        .map(|f| if *f == current { to.clone() } else { f.clone() })
        .collect();
    keep_folders(fs, &snap, folders)
}

/// Remove a folder but keep what it held: its skills move to No folder.
pub(crate) fn delete_folder(stores: &Stores, scope: Scope, name: &str) -> Result<(), String> {
    let name = clean_folder(name)?;
    let fs = stores.get(scope)?;
    let snap = fs.snapshot()?;
    let Some(current) = existing_folder(&snap.folders, &name) else {
        return Ok(());
    };
    relabel(fs, &snap, &current, None)?;
    let folders = snap.folders.iter().filter(|f| **f != current).cloned().collect();
    keep_folders(fs, &snap, folders)
}
