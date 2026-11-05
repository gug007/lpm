// Which folders of a skills list are closed, and whether its Other skills group is
// open. It syncs and is shared like the layout, but in a file of its own: folding
// happens all the time, and it must never cost a folder move to a sync conflict.
// For the same reason a click has an event of its own: no skill changed, so no list
// is read again, and an SSH project's read is a round trip to its host.
use crate::lpm_commands::{clean_folder_opt, moved_folder, Stores};
use crate::lpm_commands_layout::{self as list_file, LAYOUT_DIR};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

/// Inside the layouts' directory, so every computer that takes a layout takes this,
/// with no new path for an older build to refuse.
const FOLDS_DIR: &str = "folds";

pub(crate) const CHANGED_EVENT: &str = "skill-folds-changed";

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct ListFolds {
    /// Folders start open, so only the closed ones are kept.
    pub closed: BTreeSet<String>,
    /// The Other skills group starts closed.
    pub others_open: bool,
}

impl ListFolds {
    /// The same move the folder made: it stays closed under its new name, and so do
    /// the closed ones inside it.
    pub(crate) fn move_folder(&mut self, from: &str, to: Option<&str>) {
        self.closed = std::mem::take(&mut self.closed)
            .into_iter()
            .filter_map(|folder| moved_folder(&folder, from, to).unwrap_or(Some(folder)))
            .collect();
    }

    /// For a deleted folder, ahead of what it held moving up: moved like the rest,
    /// its own fold would land on its parent and close that.
    pub(crate) fn forget(&mut self, folder: &str) {
        self.closed.retain(|f| !f.eq_ignore_ascii_case(folder));
    }
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
pub struct SkillFolds {
    pub global: ListFolds,
    /// Empty outside a project.
    pub project: ListFolds,
}

/// The folds beside a list's layout file, named the same.
fn path_of(layout: &Path) -> Option<PathBuf> {
    Some(layout.parent()?.join(FOLDS_DIR).join(layout.file_name()?))
}

/// Whether a path inside lpm's folder is one of these files.
pub(crate) fn is_folds_file(rel: impl AsRef<Path>) -> bool {
    rel.as_ref().starts_with(Path::new(LAYOUT_DIR).join(FOLDS_DIR))
}

fn read(layout: Option<&Path>) -> ListFolds {
    list_file::read(layout.and_then(path_of).as_deref())
}

pub(crate) fn of(stores: &Stores) -> SkillFolds {
    SkillFolds {
        global: read(stores.global.layout_path()),
        project: stores
            .project
            .as_ref()
            .map(|fs| read(fs.layout_path()))
            .unwrap_or_default(),
    }
}

/// A list with no layout keeps nothing, which folding doesn't have to complain about.
pub(crate) fn update(layout: Option<&Path>, edit: &mut dyn FnMut(&mut ListFolds)) -> Result<(), String> {
    let Some(path) = layout.and_then(path_of) else {
        return Ok(());
    };
    list_file::rewrite(Some(&path), edit)
}

/// Opens or closes a folder, or with no folder the Other skills group.
pub(crate) fn set(layout: Option<&Path>, folder: Option<&str>, open: bool) -> Result<(), String> {
    let folder = clean_folder_opt(folder)?;
    update(layout, &mut |folds| match &folder {
        None => folds.others_open = open,
        Some(folder) if open => {
            folds.closed.remove(folder);
        }
        Some(folder) => {
            folds.closed.insert(folder.clone());
        }
    })
}

#[cfg(test)]
#[path = "lpm_commands_folds_tests.rs"]
mod tests;
