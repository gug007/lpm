// lpm skills: prompts the composer runs by `/name`, kept as Agent Skills so every
// agent reads them itself. Two lists live side by side: global ones in
// ~/.agents/skills and a project's own in <root>/.agents/skills, committed with
// the code. Claude Code reads neither, so each skill also gets a link in its
// .claude/skills. Those roots hold other people's skills too: lpm lists and
// changes only the ones marked as created with lpm (lpm_commands_doc). Agent
// setup can also create a marked skill in Claude's or Codex's own folder; it is
// listed like the rest and stays where it was made.
//
// Every operation goes through `CommandFs`, so an SSH project's list is read and
// written on its host (lpm_commands_remote) by the same rules as a local one.
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;

pub(crate) use crate::lpm_commands_doc::{parse_doc, Doc};
pub(crate) use crate::lpm_commands_local::LocalFs;
pub(crate) use crate::lpm_commands_names::*;

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
    pub name: String,
    pub doc: Doc,
}

/// One entry of a root's .claude/skills.
pub(crate) enum ClaudeEntry {
    Link(String),
    Copy(String),
}

/// What a list's places hold, read but not yet sorted into lpm's and others'.
#[derive(Default)]
pub(crate) struct RawList {
    /// Folder name and SKILL.md of everything in the skills root.
    pub skills: Vec<(String, String)>,
    pub claude: Vec<(String, ClaudeEntry)>,
    /// Folder name and SKILL.md of everything in Codex's own skills folder.
    pub codex: Vec<(String, String)>,
    pub saved_folders: Vec<String>,
    pub legacy: bool,
}

/// A list as it is on disk.
#[derive(Default)]
pub(crate) struct Snapshot {
    /// Every folder: the labels in use and the ones kept while empty.
    pub folders: Vec<String>,
    pub saved_folders: Vec<String>,
    pub files: Vec<CommandFile>,
    /// Names of skills that aren't lpm's, which lpm must never take over.
    pub others: Vec<String>,
    /// An old .lpm/commands list is still waiting to be moved here.
    pub legacy: bool,
}

impl Snapshot {
    fn add(&mut self, name: String, mut doc: Doc) {
        doc.folder = doc.folder.filter(|f| clean_folder(f).is_ok());
        if let Some(folder) = &doc.folder {
            if !self.folders.iter().any(|f| f.eq_ignore_ascii_case(folder)) {
                self.folders.push(folder.clone());
            }
        }
        self.files.push(CommandFile { name, doc });
    }

    /// A skill outside the skills root: lpm's unless it is a copy of one in
    /// `shared`, which is how Claude gets a skill where links aren't allowed.
    fn add_elsewhere(&mut self, name: String, content: &str, shared: &HashSet<String>) {
        let doc = parse_doc(content);
        if !doc.created_with_lpm {
            self.others.push(name);
        } else if valid_name(&name) && !shared.contains(&name) && !self.files.iter().any(|f| f.name == name) {
            self.add(name, doc);
        }
    }
}

impl RawList {
    pub(crate) fn sorted_out(self) -> Snapshot {
        let mut snap = Snapshot {
            folders: self.saved_folders.clone(),
            saved_folders: self.saved_folders,
            legacy: self.legacy,
            ..Snapshot::default()
        };
        let shared: HashSet<String> = self.skills.iter().map(|(name, _)| name.clone()).collect();
        for (name, content) in self.skills {
            let doc = parse_doc(&content);
            if doc.created_with_lpm && valid_name(&name) {
                snap.add(name, doc);
            } else {
                snap.others.push(name);
            }
        }
        for (name, entry) in self.claude {
            match entry {
                ClaudeEntry::Link(target) if is_link_to_skill(&target, &name) => {}
                ClaudeEntry::Link(_) => snap.others.push(name),
                ClaudeEntry::Copy(content) => snap.add_elsewhere(name, &content, &shared),
            }
        }
        for (name, content) in self.codex {
            snap.add_elsewhere(name, &content, &shared);
        }
        snap
    }
}

pub(crate) fn is_link_to_skill(target: &str, name: &str) -> bool {
    target.replace('\\', "/").ends_with(&format!(".agents/skills/{name}"))
}

/// The few filesystem moves a list needs. Paths for `write` are relative to the
/// skills root and written with `/`.
pub(crate) trait CommandFs {
    fn snapshot(&self) -> Result<Snapshot, String>;
    fn write(&self, rel: &str, content: &str) -> Result<(), String>;
    /// Gives Claude Code its way to the skill. Writes nothing over an entry
    /// that isn't lpm's, which `Snapshot::others` has already ruled out.
    fn link_claude(&self, name: &str) -> Result<(), String>;
    fn rename_skill(&self, from: &str, to: &str) -> Result<(), String>;
    /// Removes what lpm wrote; files someone added to the skill's folder stay.
    fn remove_skill(&self, name: &str) -> Result<(), String>;
    fn save_folders(&self, folders: &[String]) -> Result<(), String>;
    /// The skill's folder as the computer holding the list names it.
    fn location(&self, name: &str) -> String;

    fn legacy_list(&self) -> Result<LegacyList, String>;
    /// Copies what sits beside the `commands` of an old folder into a skill's
    /// folder, for prompts that point at files kept next to them.
    fn copy_legacy_files(&self, folder: &str, commands: &[String], skill: &str) -> Result<(), String>;
    fn finish_legacy(&self) -> Result<(), String>;
}

/// One prompt of a .lpm/commands list, or of an agent's own commands folder.
pub(crate) struct LegacyFile {
    pub folder: Option<String>,
    pub name: String,
    pub content: String,
}

#[derive(Default)]
pub(crate) struct LegacyList {
    pub folders: Vec<String>,
    pub files: Vec<LegacyFile>,
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

fn global_store() -> LocalFs {
    let home = dirs::home_dir().unwrap_or_default();
    let claude = crate::agentdirs::claude_config_dir()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| home.join(".claude"));
    let store = LocalFs::new(
        home.join(".agents").join("skills"),
        claude.join("skills"),
        crate::config::lpm_dir(),
    );
    match crate::agentdirs::codex_home() {
        Some(codex) => store.with_codex(codex.join("skills")),
        None => store,
    }
}

fn project_store(root: &Path) -> LocalFs {
    LocalFs::new(
        root.join(".agents").join("skills"),
        root.join(".claude").join("skills"),
        root.join(".lpm"),
    )
}

/// The list a `.agents/skills` root is, for Agent setup, which writes to a root
/// directly; None for any other root.
pub(crate) fn store_of_shared_root(root: &Path) -> Option<LocalFs> {
    if !root.ends_with(Path::new(".agents").join("skills")) {
        return None;
    }
    let owner = root.parent()?.parent()?;
    Some(if dirs::home_dir().as_deref() == Some(owner) {
        global_store()
    } else {
        project_store(owner)
    })
}

pub(crate) fn stores_at(place: Option<&ProjectPlace>) -> Stores {
    let project = place.map(|p| match &p.ssh {
        Some(ssh) => Box::new(crate::lpm_commands_remote::RemoteFs::new(ssh.clone(), &p.root)) as Box<dyn CommandFs>,
        None => Box::new(project_store(Path::new(&p.root))) as Box<dyn CommandFs>,
    });
    Stores {
        global: Box::new(global_store()),
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

/// The list as it stands, moving an old .lpm/commands one in first. A move that
/// fails leaves the old list where it was and is tried again on the next read.
fn current(fs: &dyn CommandFs) -> Result<Snapshot, String> {
    let snap = fs.snapshot()?;
    if !snap.legacy {
        return Ok(snap);
    }
    match crate::lpm_commands_migrate::run(fs) {
        Ok(()) => fs.snapshot(),
        Err(e) => {
            eprintln!("lpm: couldn't move saved commands to skills: {e}");
            Ok(snap)
        }
    }
}

fn read_scope(fs: &dyn CommandFs, scope: Scope) -> Result<ScopeList, String> {
    let Snapshot { mut folders, files, .. } = current(fs)?;
    let mut commands: Vec<LpmCommand> = files
        .into_iter()
        .map(|f| LpmCommand {
            description: f.doc.shown_description(&f.name),
            argument_hint: crate::lpm_commands_expand::argument_hint(&f.doc.body),
            folder: f.doc.folder,
            body: f.doc.body,
            name: f.name,
            scope,
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

#[cfg(test)]
#[path = "lpm_commands_tests.rs"]
mod tests;
