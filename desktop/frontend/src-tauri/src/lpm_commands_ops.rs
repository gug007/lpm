// Changes to a skills list: saving (create, edit, rename, move between folders
// or lists) and deleting skills, and creating, renaming and removing folders.
// Each one checks the list as it is on disk first, so two skills in one list
// never share a name and a skill lpm didn't create is never written over.
use crate::lpm_commands::{
    add_folder, check_name, clean_folder, clean_folder_opt, codex_policy_file, moved_folder, parse_doc, place_label,
    skill_file, CommandFile, CommandFs, CommandInput, CommandRef, Doc, MAX_FILE_BYTES, Scope, Snapshot, Stores,
    AT_ROOT, FOLDER_SEP,
};
use crate::lpm_commands_doc::MAX_DESCRIPTION_CHARS;
use crate::lpm_commands_git as git;

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
    let mut folders = snap.folders.clone();
    let folder = clean_folder_opt(input.folder.as_deref())?.map(|f| add_folder(&mut folders, &f));
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
    let want_out = input.keep_out_of_git.filter(|_| input.scope == Scope::Project);
    let mut is_out = false;
    match previous {
        Some(p) if p.scope == input.scope => {
            let Some(old) = find(&snap, &p.name) else {
                create_skill(fs, &input.name, doc(None)?)?;
                keep_folders(fs, &snap, folders)?;
                return git::apply(fs, &input.name, false, want_out);
            };
            let doc = doc(Some(&old.doc))?;
            is_out = old.git.kept_out;
            if p.name != input.name {
                // Rules first: a renamed skill must not spend a moment in git's view.
                if is_out {
                    git::move_rules(fs, &p.name, &input.name)?;
                }
                fs.rename_skill(&p.name, &input.name)?;
            }
            fs.write(&skill_file(&input.name), &doc.to_skill(&input.name))?;
            fs.link_claude(&input.name)?;
        }
        Some(p) => {
            let other = stores.get(p.scope)?;
            let other_snap = other.snapshot()?;
            let moved = find(&other_snap, &p.name);
            create_skill(fs, &input.name, doc(moved.map(|f| &f.doc))?)?;
            if let Some(moved) = moved {
                other.remove_skill(&p.name)?;
                if moved.git.kept_out {
                    git::forget_removed(other, &p.name);
                }
            }
            keep_folders(other, &other_snap, other_snap.folders.clone())?;
        }
        None => create_skill(fs, &input.name, doc(None)?)?,
    }
    keep_folders(fs, &snap, folders)?;
    git::apply(fs, &input.name, is_out, want_out)
}

/// Only a skill the list holds, so a name that isn't lpm's can't be removed.
pub(crate) fn delete(stores: &Stores, target: &CommandRef) -> Result<(), String> {
    check_name(&target.name)?;
    clean_folder_opt(target.folder.as_deref())?;
    let fs = stores.get(target.scope)?;
    let snap = fs.snapshot()?;
    let Some(file) = find(&snap, &target.name) else {
        return Ok(());
    };
    fs.remove_skill(&target.name)?;
    if file.git.kept_out {
        git::forget_removed(fs, &target.name);
    }
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
    add_folder(&mut folders, &name);
    keep_folders(fs, &snap, folders)
}

/// Files a skill lpm didn't create under a folder, or back out of one with None.
/// Its own file isn't touched: the list keeps the label.
pub(crate) fn move_other(stores: &Stores, scope: Scope, name: &str, folder: Option<&str>) -> Result<(), String> {
    let fs = stores.get(scope)?;
    let snap = fs.snapshot()?;
    if !snap.listed_others.iter().any(|o| o.name == name) {
        return Err(format!("/{name} isn't in this list any more."));
    }
    let mut folders = snap.folders.clone();
    let folder = clean_folder_opt(folder)?.map(|f| add_folder(&mut folders, &f));
    let mut filed: Vec<(String, String)> = snap.other_folders.iter().filter(|(n, _)| n != name).cloned().collect();
    if let Some(folder) = folder {
        filed.push((name.to_string(), folder));
    }
    fs.save_other_folders(&filed)?;
    keep_folders(fs, &snap, folders)
}

/// Shows a skill lpm didn't create with the list's skills in no folder, out of the
/// Other skills group. Its own file isn't touched here either.
pub(crate) fn move_other_to_root(stores: &Stores, scope: Scope, name: &str) -> Result<(), String> {
    let fs = stores.get(scope)?;
    let snap = fs.snapshot()?;
    if !snap.listed_others.iter().any(|o| o.name == name) {
        return Err(format!("/{name} isn't in this list any more."));
    }
    let mut filed: Vec<(String, String)> = snap.other_folders.iter().filter(|(n, _)| n != name).cloned().collect();
    filed.push((name.to_string(), AT_ROOT.to_string()));
    fs.save_other_folders(&filed)?;
    keep_folders(fs, &snap, snap.folders.clone())
}

/// Turns another skill into one of lpm's, or one of lpm's back: the mark in its
/// file, in every copy it has, decides. It keeps its folder and where it lives.
pub(crate) fn convert(stores: &Stores, scope: Scope, name: &str, to_lpm: bool) -> Result<(), String> {
    let fs = stores.get(scope)?;
    let snap = fs.snapshot()?;
    let folder = if to_lpm {
        check_name(name)?;
        if !snap.listed_others.iter().any(|o| o.name == name) {
            return Err(format!("/{name} isn't in this list any more."));
        }
        snap.other_folders.iter().find(|(n, _)| n == name).map(|(_, f)| f.clone()).filter(|f| f != AT_ROOT)
    } else {
        let file = find(&snap, name).ok_or_else(|| format!("/{name} isn't in this list any more."))?;
        file.doc.folder.clone()
    };
    let files = fs.skill_files(name)?;
    if files.is_empty() {
        return Err("This skill is a link to a folder somewhere else. Change it where it lives.".into());
    }
    if files.iter().any(|(_, content)| content.len() > MAX_FILE_BYTES) {
        return Err("That skill is too long to convert.".into());
    }
    for (path, content) in &files {
        let doc = Doc {
            created_with_lpm: to_lpm,
            folder: folder.clone().filter(|_| to_lpm),
            ..parse_doc(content)
        };
        fs.rewrite(path, &doc.to_skill(name))?;
    }
    let mut filed: Vec<(String, String)> = snap.other_folders.iter().filter(|(n, _)| n != name).cloned().collect();
    if let Some(folder) = folder.filter(|_| !to_lpm) {
        filed.push((name.to_string(), folder));
    }
    if filed != snap.other_folders {
        fs.save_other_folders(&filed)?;
    }
    if to_lpm {
        fs.link_claude(name)?;
    }
    keep_folders(fs, &snap, snap.folders.clone())
}

/// Moves the folder `from` and all that's inside it to `to`, or for None to the top
/// of the list. A file is only rewritten for a skill that moves.
fn relabel(fs: &dyn CommandFs, snap: &Snapshot, from: &str, to: Option<&str>) -> Result<(), String> {
    let filed: Vec<(String, String)> = snap
        .other_folders
        .iter()
        .filter_map(|(name, folder)| match moved_folder(folder, from, to) {
            None => Some((name.clone(), folder.clone())),
            Some(moved) => moved.map(|folder| (name.clone(), folder)),
        })
        .collect();
    if filed != snap.other_folders {
        fs.save_other_folders(&filed)?;
    }
    for file in &snap.files {
        let Some(folder) = file.doc.folder.as_deref().and_then(|f| moved_folder(f, from, to)) else {
            continue;
        };
        let doc = Doc { folder, ..file.doc.clone() };
        fs.write(&skill_file(&file.name), &doc.to_skill(&file.name))?;
        fs.link_claude(&file.name)?;
    }
    Ok(())
}

/// The list's folders after that move. Two that land on one name become one.
fn moved_folders(folders: &[String], from: &str, to: Option<&str>) -> Vec<String> {
    let mut out = Vec::new();
    for folder in folders {
        if let Some(moved) = moved_folder(folder, from, to).unwrap_or_else(|| Some(folder.clone())) {
            add_folder(&mut out, &moved);
        }
    }
    out
}

/// Gives a folder a new name or, with a new path, a new place in the list. What's
/// inside goes with it.
pub(crate) fn rename_folder(stores: &Stores, scope: Scope, from: &str, to: &str) -> Result<(), String> {
    let from = clean_folder(from)?;
    let to = clean_folder(to)?;
    let fs = stores.get(scope)?;
    let snap = fs.snapshot()?;
    let Some(current) = existing_folder(&snap.folders, &from) else {
        return Err(format!("The {from} folder is gone."));
    };
    // Only the levels above it: changing the case of its own name is a rename.
    let to = match to.rsplit_once(FOLDER_SEP) {
        Some((parent, name)) => format!("{}{FOLDER_SEP}{name}", add_folder(&mut snap.folders.clone(), parent)),
        None => to,
    };
    if to == current {
        return Ok(());
    }
    if to.to_lowercase().starts_with(&format!("{}{FOLDER_SEP}", current.to_lowercase())) {
        return Err("A folder can't move into itself.".into());
    }
    if !current.eq_ignore_ascii_case(&to) && existing_folder(&snap.folders, &to).is_some() {
        return Err(format!("A folder named {to} already exists."));
    }
    relabel(fs, &snap, &current, Some(&to))?;
    keep_folders(fs, &snap, moved_folders(&snap.folders, &current, Some(&to)))
}

/// Remove a folder but keep what it held: its skills and folders move up a level.
pub(crate) fn delete_folder(stores: &Stores, scope: Scope, name: &str) -> Result<(), String> {
    let name = clean_folder(name)?;
    let fs = stores.get(scope)?;
    let snap = fs.snapshot()?;
    let Some(current) = existing_folder(&snap.folders, &name) else {
        return Ok(());
    };
    let parent = current.rsplit_once(FOLDER_SEP).map(|(parent, _)| parent);
    relabel(fs, &snap, &current, parent)?;
    keep_folders(fs, &snap, moved_folders(&snap.folders, &current, parent))
}
