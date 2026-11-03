// lpm commands: prompts saved as Markdown files that the composer runs by
// `/name`. Two lists live side by side: global ones in ~/.lpm/commands and a
// project's own in <root>/.lpm/commands, committed with the code. A folder in
// the UI is a real folder one level down; a file's stem is the command's name.
//
// Every operation goes through `CommandFs`, so an SSH project's list is read and
// written on its host (lpm_commands_remote) by the same rules as a local one.
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

pub(crate) use crate::lpm_commands_doc::{parse_doc, serialize_doc};
pub(crate) use crate::lpm_commands_local::LocalFs;

const MAX_NAME_LEN: usize = 64;
const MAX_FOLDER_LEN: usize = 64;
pub(crate) const MAX_FILE_BYTES: usize = 256 * 1024;

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Scope {
    Global,
    Project,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LpmCommand {
    pub name: String,
    pub folder: Option<String>,
    pub description: String,
    pub body: String,
    pub scope: Scope,
    /// `<ticket>` for a prompt that asks for a ticket: shown after `/name `.
    pub argument_hint: String,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct ScopeList {
    pub folders: Vec<String>,
    pub commands: Vec<LpmCommand>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LpmCommands {
    pub global: ScopeList,
    /// None for a terminal outside any project, or when the project's list
    /// could not be read (`project_error` says why).
    pub project: Option<ScopeList>,
    pub project_error: Option<String>,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CommandInput {
    pub scope: Scope,
    #[serde(default)]
    pub folder: Option<String>,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub body: String,
}

#[derive(Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CommandRef {
    pub scope: Scope,
    #[serde(default)]
    pub folder: Option<String>,
    pub name: String,
}

pub(crate) struct CommandFile {
    pub folder: Option<String>,
    pub name: String,
    pub content: String,
}

/// A list as it is on disk: every folder, empty ones too, and every command file.
#[derive(Default)]
pub(crate) struct Snapshot {
    pub folders: Vec<String>,
    pub files: Vec<CommandFile>,
}

/// The few filesystem moves a list needs, over paths relative to its root
/// written with `/`.
pub(crate) trait CommandFs {
    fn snapshot(&self) -> Result<Snapshot, String>;
    fn write(&self, rel: &str, content: &str) -> Result<(), String>;
    fn remove_file(&self, rel: &str) -> Result<(), String>;
    fn create_dir(&self, rel: &str) -> Result<(), String>;
    fn rename(&self, from: &str, to: &str) -> Result<(), String>;
    fn remove_dir(&self, rel: &str) -> Result<(), String>;
}

pub(crate) struct Stores {
    pub global: Box<dyn CommandFs>,
    pub project: Option<Box<dyn CommandFs>>,
}

impl Stores {
    pub(crate) fn get(&self, scope: Scope) -> Result<&dyn CommandFs, String> {
        match scope {
            Scope::Global => Ok(self.global.as_ref()),
            Scope::Project => self
                .project
                .as_deref()
                .ok_or_else(|| "This terminal isn't in a project.".to_string()),
        }
    }
}

// ---- where the lists live ----------------------------------------------------

pub(crate) struct ProjectPlace {
    pub root: String,
    pub ssh: Option<crate::config::SshSettings>,
}

/// The project's root as the frontend sees it, with its SSH host when the
/// project lives on one. None for the global Terminals or an empty name.
pub(crate) fn project_place(project: &str) -> Result<Option<ProjectPlace>, String> {
    if project.is_empty() || project == crate::config::RESERVED_PROJECT_NAME {
        return Ok(None);
    }
    let info = crate::config::spawn_info(project)?;
    let root = if info.is_remote {
        crate::config::frontend_root("", &info.ssh)
    } else {
        info.root
    };
    if root.is_empty() {
        return Ok(None);
    }
    Ok(Some(ProjectPlace {
        root,
        ssh: info.is_remote.then_some(info.ssh),
    }))
}

pub(crate) fn global_dir() -> PathBuf {
    crate::config::lpm_dir().join("commands")
}

pub(crate) fn stores_at(place: Option<&ProjectPlace>) -> Stores {
    let project = place.map(|p| match &p.ssh {
        Some(ssh) => Box::new(crate::lpm_commands_remote::RemoteFs::new(ssh.clone(), &p.root)) as Box<dyn CommandFs>,
        None => Box::new(LocalFs::new(Path::new(&p.root).join(".lpm").join("commands"))) as Box<dyn CommandFs>,
    });
    Stores {
        global: Box::new(LocalFs::new(global_dir())),
        project,
    }
}

pub(crate) fn stores_for(project: &str) -> Result<Stores, String> {
    Ok(stores_at(project_place(project)?.as_ref()))
}

// ---- reading -----------------------------------------------------------------

pub(crate) fn list_stores(stores: &Stores) -> Result<LpmCommands, String> {
    let global = read_scope(stores.global.as_ref(), Scope::Global)?;
    let (project, project_error) = match &stores.project {
        None => (None, None),
        Some(fs) => match read_scope(fs.as_ref(), Scope::Project) {
            Ok(list) => (Some(list), None),
            Err(e) => (None, Some(e)),
        },
    };
    Ok(LpmCommands {
        global,
        project,
        project_error,
    })
}

fn read_scope(fs: &dyn CommandFs, scope: Scope) -> Result<ScopeList, String> {
    let Snapshot { mut folders, files } = fs.snapshot()?;
    let mut commands: Vec<LpmCommand> = files
        .into_iter()
        .map(|f| {
            let doc = parse_doc(&f.content);
            LpmCommand {
                name: f.name,
                folder: f.folder,
                description: doc.description,
                argument_hint: crate::lpm_commands_expand::argument_hint(&doc.body),
                body: doc.body,
                scope,
            }
        })
        .collect();
    folders.sort_by_key(|f| f.to_lowercase());
    commands.sort_by(|a, b| {
        let key = |c: &LpmCommand| (c.folder.is_none(), c.folder.as_deref().map(str::to_lowercase));
        key(a).cmp(&key(b)).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(ScopeList { folders, commands })
}

/// What `/name` runs, in menu order: the project's commands, then the global
/// ones whose name the project doesn't take. Names match whatever their case.
pub(crate) fn effective(list: &LpmCommands) -> impl Iterator<Item = &LpmCommand> {
    let mut seen = HashSet::new();
    list.project
        .iter()
        .flat_map(|p| p.commands.iter())
        .chain(list.global.commands.iter())
        .filter(move |c| seen.insert(c.name.to_lowercase()))
}

/// Which entries a snapshot holds as commands: only `*.md` files named the way
/// a `/name` can be typed, at the root or one folder down.
pub(crate) fn command_name_of(file_name: &str) -> Option<&str> {
    let stem = file_name.strip_suffix(".md")?;
    valid_name(stem).then_some(stem)
}

pub(crate) fn is_visible_folder(name: &str) -> bool {
    !name.is_empty() && !name.starts_with('.')
}

// ---- names -----------------------------------------------------------------------

/// A name is also a file name in a folder that may be committed and checked
/// out anywhere, so it has to work on every platform.
pub(crate) fn valid_name(name: &str) -> bool {
    name.len() <= MAX_NAME_LEN
        && name.chars().next().is_some_and(|c| c.is_ascii_alphanumeric())
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        && crate::fsname::is_portable_everywhere(name)
}

pub(crate) fn check_name(name: &str) -> Result<(), String> {
    if valid_name(name) {
        Ok(())
    } else {
        Err("Use letters, numbers, - and _ for the name, starting with a letter or number.".into())
    }
}

pub(crate) fn clean_folder(folder: &str) -> Result<String, String> {
    let folder = folder.trim();
    if folder.is_empty() {
        return Err("Give the folder a name.".into());
    }
    if folder.chars().count() > MAX_FOLDER_LEN
        || folder.starts_with('.')
        || !crate::fsname::is_portable_everywhere(folder)
    {
        return Err(
            "A folder name can't start or end with a dot, or hold any of / \\ : * ? \" < > |.".into(),
        );
    }
    Ok(folder.to_string())
}

pub(crate) fn clean_folder_opt(folder: Option<&str>) -> Result<Option<String>, String> {
    match folder.map(str::trim).filter(|f| !f.is_empty()) {
        Some(f) => clean_folder(f).map(Some),
        None => Ok(None),
    }
}

pub(crate) fn rel_path(folder: Option<&str>, name: &str) -> String {
    match folder {
        Some(f) => format!("{f}/{name}.md"),
        None => format!("{name}.md"),
    }
}

pub(crate) fn place_label(folder: Option<&str>) -> String {
    match folder {
        Some(f) => format!("the {f} folder"),
        None => "No folder".to_string(),
    }
}

#[cfg(test)]
#[path = "lpm_commands_tests.rs"]
mod tests;
