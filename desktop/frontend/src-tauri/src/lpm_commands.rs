// lpm skills: prompts the composer runs by `/name`, kept as Agent Skills so every
// agent reads them itself. Two lists live side by side: global ones in
// ~/.agents/skills and a project's own in <root>/.agents/skills, committed with
// the code. Claude Code reads neither, so each skill also gets a link in its
// .claude/skills. Those roots hold other people's skills too: lpm lists and
// changes only the ones marked as created with lpm (lpm_commands_doc). Agent
// setup can also create a marked skill in Claude's or Codex's own folder; it is
// listed like the rest and stays where it was made. Folders aren't in any of those
// roots: see lpm_commands_layout. A duplicate or worktree shares its original's
// list: see lpm_commands_shared.
//
// Every operation goes through `CommandFs`, so an SSH project's list is read and
// written on its host (lpm_commands_remote) by the same rules as a local one.
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;

pub(crate) use crate::lpm_commands_doc::{parse_doc, Doc};
use crate::lpm_commands_folds::SkillFolds;
pub(crate) use crate::lpm_commands_layout::{Layout, AT_ROOT};
pub(crate) use crate::lpm_commands_local::{copy_tree, link_dir, LocalFs};
pub(crate) use crate::lpm_commands_names::*;
pub(crate) use crate::lpm_commands_snapshot::*;

pub(crate) const MAX_FILE_BYTES: usize = 256 * 1024;

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Scope {
    Global,
    Project,
}

/// Which agents find a skill on their own.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Reach {
    pub claude: bool,
    pub codex: bool,
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
    #[serde(skip)]
    pub reach: Reach,
    /// Git ignores it and holds none of its files.
    pub kept_out_of_git: bool,
    /// Git holds some of its files.
    pub tracked: bool,
    /// Kept out, but the last commit still holds it until the removal is committed.
    pub awaiting_commit: bool,
    /// Its SKILL.md, as the computer holding the list names it.
    pub path: String,
    /// How many times it ran on this computer (lpm_commands_usage), and when it
    /// last did in unix millis; None before its first run.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runs: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_run_at: Option<u64>,
}

/// A skill in one of a list's places that lpm didn't create: listed so the user
/// can see it, and never changed here.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OtherSkill {
    pub name: String,
    pub description: String,
    pub preview: String,
    /// The agents that read it, as `AICLI` names them.
    pub agents: Vec<String>,
    pub path: String,
    pub folder: Option<String>,
    /// Shown with the list's skills in no folder, out of the Other skills group.
    pub at_root: bool,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScopeList {
    pub folders: Vec<String>,
    pub commands: Vec<LpmCommand>,
    pub others: Vec<OtherSkill>,
    /// The list belongs to a git repo, so its skills can be kept out of it.
    pub in_repo: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LpmCommands {
    pub global: ScopeList,
    /// None for a terminal outside any project, or when the project's list
    /// could not be read (`project_error` says why).
    pub project: Option<ScopeList>,
    pub project_error: Option<String>,
    /// Here so that a folder and its fold arrive together, whoever moved it.
    pub folds: SkillFolds,
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
    /// None leaves it as it is, which is what an older phone or a move sends.
    #[serde(default)]
    pub keep_out_of_git: Option<bool>,
}

#[derive(Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CommandRef {
    pub scope: Scope,
    #[serde(default)]
    pub folder: Option<String>,
    pub name: String,
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
    /// The file is on this computer, whichever computer holds the skills.
    fn update_layout(&self, edit: &mut dyn FnMut(&mut Layout)) -> Result<(), String> {
        crate::lpm_commands_layout::update(self.layout_path(), edit)
    }
    /// None for a list that keeps no folders of its own.
    fn layout_path(&self) -> Option<&Path>;
    /// Every real SKILL.md a skill has, as (path, content): a skill copied into
    /// two roots has two, and one behind someone's link has none here.
    fn skill_files(&self, name: &str) -> Result<Vec<(String, String)>, String>;
    /// Writes over a file `skill_files` named.
    fn rewrite(&self, path: &str, content: &str) -> Result<(), String>;
    /// The skill's folder as the computer holding the list names it.
    fn location(&self, name: &str) -> String;
    /// `git` in the project's folder, its trimmed output; refused for a list
    /// outside a project.
    fn git(&self, args: &[&str]) -> Result<String, String>;
    /// A file `git rev-parse --git-path` named, "" when it isn't there yet.
    fn read_git_file(&self, path: &str) -> Result<String, String>;
    fn write_git_file(&self, path: &str, text: &str) -> Result<(), String>;

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
    pub name: String,
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
        name: project.to_string(),
        root,
        ssh: info.is_remote.then_some(info.ssh),
    }))
}

pub(crate) fn global_store() -> LocalFs {
    let home = dirs::home_dir().unwrap_or_default();
    let claude = crate::agentdirs::claude_config_dir()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| home.join(".claude"));
    let store = LocalFs::new(
        home.join(".agents").join("skills"),
        claude.join("skills"),
        crate::config::lpm_dir(),
    )
    .with_layout(crate::lpm_commands_layout::global_path());
    match crate::agentdirs::codex_home() {
        Some(codex) => store.with_codex(codex.join("skills")),
        None => store,
    }
}

/// Without asking git, for a read that only needs what's on disk.
pub(crate) fn project_files(root: &Path) -> LocalFs {
    LocalFs::new(
        root.join(".agents").join("skills"),
        root.join(".claude").join("skills"),
        root.join(".lpm"),
    )
}

/// With no layout, which is all linking and syncing skills need: `stores_at` adds it.
pub(crate) fn project_store(root: &Path) -> LocalFs {
    project_files(root).with_repo(root.to_path_buf())
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
    let project = place.map(|p| {
        let layout = crate::lpm_commands_layout::project_path(&p.name);
        match &p.ssh {
            Some(ssh) => Box::new(crate::lpm_commands_remote::RemoteFs::new(ssh.clone(), &p.root).with_layout(layout))
                as Box<dyn CommandFs>,
            None => Box::new(project_store(Path::new(&p.root)).with_layout(layout)) as Box<dyn CommandFs>,
        }
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
        folds: crate::lpm_commands_folds::of(stores),
    })
}

/// The list as it stands, moving an old .lpm/commands one in first. A move that
/// fails leaves the old list where it was and is tried again on the next read.
pub(crate) fn current(fs: &dyn CommandFs) -> Result<Snapshot, String> {
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
    let Snapshot { mut folders, files, listed_others: mut others, in_repo, .. } = current(fs)?;
    let mut commands: Vec<LpmCommand> = files
        .into_iter()
        .map(|f| LpmCommand {
            path: skill_md_at(&fs.location(&f.name)),
            runs: None,
            last_run_at: None,
            description: f.doc.shown_description(&f.name),
            argument_hint: crate::lpm_commands_expand::argument_hint(&f.doc.body),
            folder: f.folder,
            body: f.doc.body,
            name: f.name,
            scope,
            reach: f.reach,
            kept_out_of_git: f.git.kept_out,
            tracked: f.git.tracked,
            awaiting_commit: f.git.awaiting_commit,
        })
        .collect();
    folders.sort_by_key(|f| folder_order(f));
    commands.sort_by(|a, b| {
        let key = |c: &LpmCommand| (c.folder.is_none(), c.folder.as_deref().map(folder_order));
        key(a).cmp(&key(b)).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    others.sort_by_key(|o| o.name.to_lowercase());
    Ok(ScopeList { folders, commands, others, in_repo })
}

/// The SKILL.md in a skill's folder, written the way that folder is: a Windows
/// path on Windows, and `/` for one an SSH host names.
fn skill_md_at(dir: &str) -> String {
    let sep = if dir.contains('\\') && !dir.contains('/') { '\\' } else { '/' };
    format!("{}{sep}SKILL.md", dir.trim_end_matches(sep))
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
