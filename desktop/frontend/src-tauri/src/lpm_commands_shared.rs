// A project's skills are one list across its checkouts. A skill Git holds in a
// checkout stays there, at that branch's version. Any other, kept out of Git or not
// committed yet, sits in the original and is linked into each duplicate and worktree:
// every agent finds it in its own checkout, and a change made in any of them lands
// in one file. The original holds it because a copy is usually thrown away, and lpm
// won't remove an original while copies of it remain.
//
// A link is one checkout's business, but worktrees share info/exclude, where a rule
// would also keep the skill out of the original's commits. So a checkout ignores its
// links in a .gitignore beside them, which ignores itself too and says which names
// are shared. A commit of the skill reaching the checkout replaces the link, because
// Git overwrites ignored files.
use crate::config;
use crate::lpm_commands::{
    copy_tree, is_link_to_skill, link_dir, project_files, project_place, project_store, stores_at, CommandFs,
    LocalFs, LpmCommands, ProjectPlace, Snapshot, Stores,
};
use crate::lpm_commands_git::{self as git, CLAUDE_ROOT, SHARED_ROOT};
use crate::lpm_commands_local::missing_is_fine;
use crate::session_memory_scope::memory_owner;
use std::collections::{BTreeSet, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const RULES_FILE: &str = ".gitignore";
const RULES_MARK: &str = "# lpm: skills shared from the original project";

/// A list being read and a change landing would otherwise link one skill twice.
static SHARING: Mutex<()> = Mutex::new(());

fn local_place(project: &str) -> Option<ProjectPlace> {
    project_place(project).ok()?.filter(|p| p.ssh.is_none() && Path::new(&p.root).is_dir())
}

/// None for an original.
fn original_of(project: &str) -> Option<ProjectPlace> {
    let owner = memory_owner(project);
    if owner == project {
        None
    } else {
        local_place(&owner)
    }
}

/// `project` and every other checkout of its list.
pub(crate) fn family(project: &str) -> Vec<String> {
    let owner = memory_owner(project);
    let copies = config::duplicates_of(&owner).unwrap_or_default();
    std::iter::once(owner).chain(copies).collect()
}

fn rules_in(text: &str) -> BTreeSet<String> {
    text.lines()
        .skip_while(|line| *line != RULES_MARK)
        .skip(1)
        .filter_map(|line| line.strip_prefix('/'))
        .filter(|name| *name != RULES_FILE)
        .map(str::to_string)
        .collect()
}

/// Lines above the mark aren't lpm's and stay.
fn with_rules(text: &str, names: &BTreeSet<String>) -> String {
    let above: String = text.lines().take_while(|line| *line != RULES_MARK).map(|line| format!("{line}\n")).collect();
    if names.is_empty() {
        return above;
    }
    let rules: String = names.iter().map(|name| format!("/{name}\n")).collect();
    format!("{above}{RULES_MARK}\n/{RULES_FILE}\n{rules}")
}

fn shared_names(root: &Path) -> BTreeSet<String> {
    rules_in(&std::fs::read_to_string(root.join(SHARED_ROOT).join(RULES_FILE)).unwrap_or_default())
}

fn write_rules(dir: &Path, names: &BTreeSet<String>) -> Result<(), String> {
    let path = dir.join(RULES_FILE);
    let text = std::fs::read_to_string(&path).unwrap_or_default();
    let next = with_rules(&text, names);
    if next == text {
        return Ok(());
    }
    if next.is_empty() {
        return missing_is_fine(std::fs::remove_file(&path));
    }
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    crate::fsatomic::write(&path, next.as_bytes(), crate::fsatomic::Mode::Preserve(0o644)).map_err(|e| e.to_string())
}

/// Skills with a file in the checkout's index, which Git brings and updates itself.
fn held_by_git(root: &Path) -> HashSet<String> {
    let args = ["ls-files", "-z", "--", SHARED_ROOT, CLAUDE_ROOT];
    let listed = crate::git::git_out(&root.to_string_lossy(), &args).unwrap_or_default();
    crate::gitconflict::nul_separated(listed.as_bytes())
        .iter()
        .filter_map(|path| path.split('/').nth(2).map(str::to_string))
        .collect()
}

fn same_tree(a: &Path, b: &Path) -> bool {
    let (Ok(meta_a), Ok(meta_b)) = (std::fs::symlink_metadata(a), std::fs::symlink_metadata(b)) else {
        return false;
    };
    if meta_a.is_file() && meta_b.is_file() {
        return meta_a.len() == meta_b.len() && std::fs::read(a).ok() == std::fs::read(b).ok();
    }
    let names = |dir: &Path| -> BTreeSet<_> {
        std::fs::read_dir(dir).into_iter().flatten().flatten().map(|e| e.file_name()).collect()
    };
    meta_a.is_dir()
        && meta_b.is_dir()
        && names(a) == names(b)
        && names(a).iter().all(|name| same_tree(&a.join(name), &b.join(name)))
}

fn remove_entry(path: &Path) -> Result<(), String> {
    let Ok(meta) = std::fs::symlink_metadata(path) else {
        return Ok(());
    };
    let removed = if meta.file_type().is_symlink() {
        std::fs::remove_file(path).or_else(|_| std::fs::remove_dir(path))
    } else {
        std::fs::remove_dir_all(path)
    };
    removed.map_err(|e| e.to_string())
}

/// A link of ours: to the original, or left broken by the original's folder moving.
fn is_our_link(place: &Path, original: &Path, name: &str) -> bool {
    let Ok(target) = std::fs::read_link(place) else {
        return false;
    };
    target.starts_with(original) || (!place.exists() && is_link_to_skill(&target.to_string_lossy(), name))
}

/// Windows refuses links without Developer Mode, so a shared skill can be a copy
/// there, which only lpm writes to.
fn is_our_copy(place: &Path) -> bool {
    cfg!(windows) && place.is_dir()
}

fn move_tree(from: &Path, to: &Path) -> Result<(), String> {
    if let Some(dir) = to.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    if std::fs::rename(from, to).is_ok() {
        return Ok(());
    }
    copy_tree(from, to).map_err(|e| e.to_string())?;
    if same_tree(from, to) {
        return remove_entry(from);
    }
    remove_entry(to)?;
    Err(format!("couldn't move {} to {}", from.display(), to.display()))
}

/// A skill only this checkout has goes to the original, with its rule if Git is to
/// stay away from it, so it outlives the checkout and the others get it.
fn adopt(original: &Path, root: &Path, name: &str) -> Result<(), String> {
    let own = project_store(root);
    let to = project_store(original);
    if own.snapshot()?.files.iter().any(|f| f.name == name && f.git.kept_out) {
        git::keep_landing(&to, name)?;
    }
    move_tree(Path::new(&own.location(name)), Path::new(&to.location(name)))?;
    own.unlink_claude(name)?;
    to.link_claude(name)
}

fn adopt_own(original: &Path, root: &Path, held: &HashSet<String>, shared: &BTreeSet<String>) -> Result<(), String> {
    let own = project_files(root);
    let theirs = project_files(original);
    for file in own.snapshot()?.files {
        let name = file.name.as_str();
        let real = std::fs::symlink_metadata(own.location(name)).is_ok_and(|m| m.is_dir());
        let free = std::fs::symlink_metadata(theirs.location(name)).is_err();
        if real && free && !held.contains(name) && !shared.contains(name) {
            if let Err(e) = adopt(original, root, name) {
                eprintln!("lpm: couldn't move /{name} to the original project: {e}");
            }
        }
    }
    Ok(())
}

/// Whether the checkout can take the original's skill in place of what it has. A
/// real folder goes only if it says the same: one that differs is someone's work.
fn can_share(own: &LocalFs, original: &Path, target: &Path, name: &str, shared: bool) -> bool {
    let here = PathBuf::from(own.location(name));
    match std::fs::symlink_metadata(&here) {
        Err(_) => true,
        Ok(meta) if meta.file_type().is_symlink() => is_our_link(&here, original, name),
        Ok(_) => (shared && is_our_copy(&here)) || same_tree(&here, target),
    }
}

fn share(own: &LocalFs, root: &Path, target: &Path, name: &str) -> Result<(), String> {
    let place = root.join(SHARED_ROOT).join(name);
    let linked = std::fs::read_link(&place).is_ok_and(|t| t == target);
    if !linked {
        if is_our_copy(&place) && same_tree(&place, target) {
            return own.link_claude(name);
        }
        remove_entry(Path::new(&own.location(name)))?;
        std::fs::create_dir_all(root.join(SHARED_ROOT)).map_err(|e| e.to_string())?;
        if link_dir(target, &place).is_err() {
            copy_tree(target, &place).map_err(|e| e.to_string())?;
        }
    }
    if !linked || std::fs::symlink_metadata(root.join(CLAUDE_ROOT).join(name)).is_err() {
        own.link_claude(name)?;
    }
    Ok(())
}

fn withdraw(own: &LocalFs, original: &Path, root: &Path, name: &str) -> Result<(), String> {
    let place = root.join(SHARED_ROOT).join(name);
    if is_our_link(&place, original, name) || is_our_copy(&place) {
        own.unlink_claude(name)?;
        remove_entry(&place)?;
    }
    Ok(())
}

/// Puts one checkout in step with its original. Called on every read of its list,
/// so a skill that came by a pull or an agent is found too.
fn sync_checkout(original: &Path, root: &Path) -> Result<(), String> {
    if project_files(original).is_unreadable() {
        return Ok(());
    }
    let held = held_by_git(root);
    let was_shared = shared_names(root);
    adopt_own(original, root, &held, &was_shared)?;

    let from = project_files(original);
    let own = project_files(root);
    let Snapshot { files, .. } = from.snapshot()?;
    let others = own.snapshot()?.others;
    let mut shared = BTreeSet::new();
    for name in files.into_iter().map(|f| f.name) {
        let target = PathBuf::from(from.location(&name));
        let free = !held.contains(&name) && !others.contains(&name);
        if free && can_share(&own, original, &target, &name, was_shared.contains(&name)) {
            shared.insert(name);
        }
    }
    for name in was_shared.iter().filter(|name| !shared.contains(*name) && !held.contains(*name)) {
        withdraw(&own, original, root, name)?;
    }
    for dir in [SHARED_ROOT, CLAUDE_ROOT] {
        write_rules(&root.join(dir), &shared)?;
    }
    shared.iter().try_for_each(|name| share(&own, root, &PathBuf::from(from.location(name)), name))
}

fn sync(original: &ProjectPlace, checkout: &ProjectPlace) {
    let _sharing = SHARING.lock().unwrap_or_else(|e| e.into_inner());
    if let Err(e) = sync_checkout(Path::new(&original.root), Path::new(&checkout.root)) {
        eprintln!("lpm: couldn't share skills with {}: {e}", checkout.name);
    }
}

/// Brings `project` up to date if it's a duplicate or worktree.
pub(crate) fn refresh(project: &str) {
    if let (Some(original), Some(own)) = (original_of(project), local_place(project)) {
        sync(&original, &own);
    }
}

/// After a change every checkout of `project`'s list has to see.
pub(crate) fn refresh_all(project: &str) {
    let owner = memory_owner(project);
    let Some(original) = local_place(&owner) else {
        return;
    };
    for copy in config::duplicates_of(&owner).unwrap_or_default() {
        if let Some(checkout) = local_place(&copy) {
            sync(&original, &checkout);
        }
    }
}

/// The project and lists to change `name` through from `project`: the original's
/// for a skill shared here. None leaves it with the project's own.
pub(crate) fn holder(project: &str, name: &str) -> Option<(String, Stores)> {
    let own = local_place(project)?;
    let original = original_of(project)?;
    shared_names(Path::new(&own.root)).contains(name).then(|| {
        let stores = stores_at(Some(&original));
        (original.name, stores)
    })
}

/// A shared skill reads as ignored in a checkout, whatever the original's Git says
/// of it, and the original's is what the list shows and the switch changes.
pub(crate) fn show_original_git(project: &str, lists: &mut LpmCommands) {
    let (Some(list), Some(own)) = (lists.project.as_mut(), local_place(project)) else {
        return;
    };
    let names = shared_names(Path::new(&own.root));
    if names.is_empty() {
        return;
    }
    let Some(snap) = original_of(project).and_then(|o| project_store(Path::new(&o.root)).snapshot().ok()) else {
        return;
    };
    for command in list.commands.iter_mut().filter(|c| names.contains(&c.name)) {
        let git = snap.files.iter().find(|f| f.name == command.name).map(|f| f.git).unwrap_or_default();
        command.kept_out_of_git = git.kept_out;
        command.tracked = git.tracked;
        command.awaiting_commit = git.awaiting_commit;
    }
}

#[cfg(test)]
#[path = "lpm_commands_shared_tests.rs"]
mod tests;
