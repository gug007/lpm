// Which folder each skill of a list sits in. Folders are how one person sorts a
// list, so they live in lpm's own folder, not beside the skills, and sorting never
// changes a repo. A duplicate or worktree shares its original's layout, and an SSH
// project's stays on this computer.
//
// A skill keeps its place by name. A rename adds the new name and leaves the old
// one, because another checkout may still use it; a name no skill answers to does
// nothing.
use crate::config;
use crate::lpm_commands::{add_folder, folder_order, moved_folder};
use crate::lpm_commands_local::missing_is_fine;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub(crate) const LAYOUT_DIR: &str = "skill-layout";

/// The folder saved for an other skill kept at the top of its list.
pub(crate) const AT_ROOT: &str = "";

/// Every change rewrites the whole file, so two at once could lose one.
static UPDATING: Mutex<()> = Mutex::new(());

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub(crate) struct Layout {
    /// Every folder, which is what keeps an empty one.
    #[serde(default)]
    pub folders: Vec<String>,
    /// Skill to folder.
    #[serde(default)]
    pub skills: BTreeMap<String, String>,
}

impl Layout {
    /// The folders go on existing as they stood, a skill's move out of one leaving
    /// it empty rather than gone.
    pub(crate) fn keep(&mut self, folders: &[String]) {
        for folder in folders {
            add_folder(&mut self.folders, folder);
        }
    }

    pub(crate) fn file(&mut self, name: &str, folder: Option<&str>) {
        match folder {
            Some(folder) => self.skills.insert(name.to_string(), folder.to_string()),
            None => self.skills.remove(name),
        };
    }

    /// Moves the folder `from` and all that's inside it to `to`, or for None to the
    /// top of the list. Two folders that land on one name become one.
    pub(crate) fn move_folder(&mut self, from: &str, to: Option<&str>) {
        let mut folders = Vec::new();
        for folder in &self.folders {
            if let Some(moved) = moved_folder(folder, from, to).unwrap_or_else(|| Some(folder.clone())) {
                add_folder(&mut folders, &moved);
            }
        }
        self.folders = folders;
        self.skills = std::mem::take(&mut self.skills)
            .into_iter()
            .filter_map(|(name, folder)| match moved_folder(&folder, from, to) {
                None => Some((name, folder)),
                Some(moved) => moved.map(|folder| (name, folder)),
            })
            .collect();
    }
}

fn path_of(owner: &str) -> PathBuf {
    config::lpm_dir().join(LAYOUT_DIR).join(format!("{owner}.json"))
}

pub(crate) fn global_path() -> PathBuf {
    path_of(config::RESERVED_PROJECT_NAME)
}

pub(crate) fn project_path(project: &str) -> PathBuf {
    path_of(&crate::session_memory_scope::memory_owner(project))
}

/// Whether a path inside lpm's folder is a layout.
pub(crate) fn is_layout_file(rel: &str) -> bool {
    Path::new(rel).starts_with(LAYOUT_DIR)
}

/// What's saved. A file that can't be read costs the list its folders, not its skills.
pub(crate) fn read<T: DeserializeOwned + Default>(path: Option<&Path>) -> T {
    path.and_then(|p| std::fs::read(p).ok())
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

/// Reads the file fresh, so a change can't undo one saved since its caller looked.
/// Nothing left to keep means no file.
pub(crate) fn rewrite<T>(path: Option<&Path>, edit: &mut dyn FnMut(&mut T)) -> Result<(), String>
where
    T: Serialize + DeserializeOwned + Default + Clone + PartialEq,
{
    let _updating = UPDATING.lock().unwrap_or_else(|e| e.into_inner());
    let before: T = read(path);
    let mut value = before.clone();
    edit(&mut value);
    if value == before {
        return Ok(());
    }
    let path = path.ok_or("This list can't keep folders.")?;
    if value == T::default() {
        return missing_is_fine(std::fs::remove_file(path));
    }
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?;
    crate::fsatomic::write(path, format!("{text}\n").as_bytes(), crate::fsatomic::Mode::Preserve(0o644))
        .map_err(|e| e.to_string())
}

/// Sorted, so two computers holding the same layout hold the same file.
pub(crate) fn update(path: Option<&Path>, edit: &mut dyn FnMut(&mut Layout)) -> Result<(), String> {
    rewrite(path, &mut |layout: &mut Layout| {
        edit(layout);
        layout.folders.sort_by_key(|f| folder_order(f));
    })
}

#[cfg(test)]
#[path = "lpm_commands_layout_tests.rs"]
mod tests;
