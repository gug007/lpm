// Changes to a commands list: saving (create, edit, rename, move between
// folders or lists) and deleting commands, and creating, renaming and removing
// folders. Each one checks the list as it is on disk first, so two commands in
// one list never share a name, whatever case the filesystem keeps.
use crate::lpm_commands::{
    check_name, clean_folder, clean_folder_opt, parse_doc, place_label, rel_path, serialize_doc,
    CommandFile, CommandInput, CommandRef, Scope, Snapshot, Stores, MAX_FILE_BYTES,
};

fn existing_folder(snap: &Snapshot, folder: &str) -> Option<String> {
    snap.folders
        .iter()
        .find(|f| f.eq_ignore_ascii_case(folder))
        .cloned()
}

fn is_at(file: &CommandFile, folder: Option<&str>, name: &str) -> bool {
    file.folder.as_deref() == folder && file.name == name
}

/// Create or update a command; with `previous` it is an edit, which may also
/// rename it or move it to another folder or the other list. Writing a file
/// creates its folder, so a new folder needs no step of its own.
pub(crate) fn save(stores: &Stores, input: CommandInput, previous: Option<CommandRef>) -> Result<(), String> {
    check_name(&input.name)?;
    if input.body.trim().is_empty() {
        return Err("Write the prompt first.".into());
    }
    // The previous place becomes a path too, so it gets the same checks.
    if let Some(p) = &previous {
        check_name(&p.name)?;
        clean_folder_opt(p.folder.as_deref())?;
    }
    let fs = stores.get(input.scope)?;
    let snap = fs.snapshot()?;
    let same_list = previous.as_ref().filter(|p| p.scope == input.scope);
    let is_previous = |f: &CommandFile| same_list.is_some_and(|p| is_at(f, p.folder.as_deref(), &p.name));
    if let Some(clash) = snap
        .files
        .iter()
        .find(|f| f.name.eq_ignore_ascii_case(&input.name) && !is_previous(f))
    {
        return Err(format!("/{} already exists in {}.", clash.name, place_label(clash.folder.as_deref())));
    }
    let folder = clean_folder_opt(input.folder.as_deref())?
        .map(|f| existing_folder(&snap, &f).unwrap_or(f));
    let target = rel_path(folder.as_deref(), &input.name);
    let previous_file = |files: &[CommandFile], p: &CommandRef| {
        files
            .iter()
            .find(|f| is_at(f, p.folder.as_deref(), &p.name))
            .map(|f| parse_doc(&f.content).extra)
    };
    // A list reads MAX_FILE_BYTES of a file, so a longer one would come back cut.
    let document = |extra: &[String]| {
        let content = serialize_doc(&input.description, &input.body, extra);
        if content.len() > MAX_FILE_BYTES {
            return Err("That prompt is too long to save.".to_string());
        }
        Ok(content)
    };
    match previous {
        Some(p) if p.scope == input.scope => {
            let extra = previous_file(&snap.files, &p);
            let content = document(extra.as_deref().unwrap_or_default())?;
            let from = rel_path(p.folder.as_deref(), &p.name);
            if from != target && extra.is_some() {
                fs.rename(&from, &target)?;
            }
            fs.write(&target, &content)
        }
        Some(p) => {
            let other = stores.get(p.scope)?;
            let extra = previous_file(&other.snapshot()?.files, &p).unwrap_or_default();
            fs.write(&target, &document(&extra)?)?;
            other.remove_file(&rel_path(p.folder.as_deref(), &p.name))
        }
        None => fs.write(&target, &document(&[])?),
    }
}

pub(crate) fn delete(stores: &Stores, target: &CommandRef) -> Result<(), String> {
    check_name(&target.name)?;
    let folder = clean_folder_opt(target.folder.as_deref())?;
    stores
        .get(target.scope)?
        .remove_file(&rel_path(folder.as_deref(), &target.name))
}

pub(crate) fn create_folder(stores: &Stores, scope: Scope, name: &str) -> Result<(), String> {
    let name = clean_folder(name)?;
    let fs = stores.get(scope)?;
    if existing_folder(&fs.snapshot()?, &name).is_some() {
        return Err(format!("A folder named {name} already exists."));
    }
    fs.create_dir(&name)
}

pub(crate) fn rename_folder(stores: &Stores, scope: Scope, from: &str, to: &str) -> Result<(), String> {
    let from = clean_folder(from)?;
    let to = clean_folder(to)?;
    if from == to {
        return Ok(());
    }
    let fs = stores.get(scope)?;
    let snap = fs.snapshot()?;
    let Some(current) = existing_folder(&snap, &from) else {
        return Err(format!("The {from} folder is gone."));
    };
    if !from.eq_ignore_ascii_case(&to) && existing_folder(&snap, &to).is_some() {
        return Err(format!("A folder named {to} already exists."));
    }
    fs.rename(&current, &to)
}

/// Remove a folder but keep what it held: its commands move to No folder.
pub(crate) fn delete_folder(stores: &Stores, scope: Scope, name: &str) -> Result<(), String> {
    let name = clean_folder(name)?;
    let fs = stores.get(scope)?;
    let snap = fs.snapshot()?;
    let Some(current) = existing_folder(&snap, &name) else {
        return Ok(());
    };
    let (inside, outside): (Vec<&CommandFile>, Vec<&CommandFile>) = snap
        .files
        .iter()
        .partition(|f| f.folder.as_deref() == Some(current.as_str()));
    if let Some(clash) = outside
        .iter()
        .find(|o| inside.iter().any(|i| i.name.eq_ignore_ascii_case(&o.name)))
    {
        return Err(format!(
            "/{} is also in {}; rename one of them first.",
            clash.name,
            place_label(clash.folder.as_deref())
        ));
    }
    for file in inside {
        fs.rename(&rel_path(Some(&current), &file.name), &rel_path(None, &file.name))?;
    }
    fs.remove_dir(&current)
        .map_err(|_| format!("The {current} folder still holds other files, so it was left in place."))
}
