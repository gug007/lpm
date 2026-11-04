// What a list's places hold: read by `CommandFs`, here sorted into lpm's skills,
// the skills that aren't lpm's, and the names lpm must leave alone.
use crate::lpm_commands::{add_folder, clean_folder, parse_doc, valid_name, Doc, OtherSkill, Reach};
use crate::lpm_commands_git::{GitView, SkillGit, CLAUDE_ROOT, SHARED_ROOT};
use std::collections::HashSet;

/// The folder saved for an other skill kept at the top of its list. An lpm that
/// doesn't know it reads no folder, and shows the skill under Other skills.
pub(crate) const AT_ROOT: &str = "";

/// What of another skill a list carries: lists are read often, and a skill's
/// whole file can run to tens of kilobytes.
const OTHER_PREVIEW_CHARS: usize = 1500;

const SHARED_READERS: &[&str] = &["codex", "gemini", "opencode"];
const CLAUDE_READERS: &[&str] = &["claude", "opencode"];
const CODEX_READERS: &[&str] = &["codex"];
const READER_ORDER: &[&str] = &["claude", "codex", "gemini", "opencode"];

pub(crate) struct CommandFile {
    pub name: String,
    pub doc: Doc,
    pub reach: Reach,
    pub git: SkillGit,
}

/// One entry of a root's .claude/skills.
pub(crate) enum ClaudeEntry {
    /// Where it points, and the SKILL.md there when that could be read.
    Link(String, Option<String>),
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
    pub other_folders: Vec<(String, String)>,
    pub legacy: bool,
    pub skills_dir: String,
    pub claude_dir: String,
    pub codex_dir: String,
    /// What git says of a project's skills; None outside a repo.
    pub git: Option<GitView>,
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
    /// The ones of those that could be read, to show.
    pub listed_others: Vec<OtherSkill>,
    /// Which of them sit in which folder, as saved.
    pub other_folders: Vec<(String, String)>,
    /// An old .lpm/commands list is still waiting to be moved here.
    pub legacy: bool,
    pub in_repo: bool,
}

impl ClaudeEntry {
    fn is_lpms(&self, name: &str) -> bool {
        match self {
            ClaudeEntry::Link(target, _) => is_link_to_skill(target, name),
            ClaudeEntry::Copy(content) => parse_doc(content).created_with_lpm,
        }
    }
}

impl Snapshot {
    fn add(&mut self, name: String, mut doc: Doc, reach: Reach) {
        doc.folder = doc
            .folder
            .and_then(|f| clean_folder(&f).ok())
            .map(|f| add_folder(&mut self.folders, &f));
        self.files.push(CommandFile { name, doc, reach, git: SkillGit::default() });
    }

    /// A skill lpm didn't create. The same name in two places is one skill that
    /// more agents read.
    fn add_other(&mut self, name: String, doc: &Doc, path: String, readers: &[&str]) {
        if !self.listed_others.iter().any(|o| o.name == name) {
            self.listed_others.push(OtherSkill {
                name: name.clone(),
                description: doc.description.clone(),
                preview: preview_of(&doc.body),
                agents: Vec::new(),
                path,
                folder: None,
                at_root: false,
            });
        }
        self.also_read_by(&name, readers);
        self.others.push(name);
    }

    fn also_read_by(&mut self, name: &str, readers: &[&str]) {
        if let Some(other) = self.listed_others.iter_mut().find(|o| o.name == name) {
            other.agents.extend(readers.iter().map(|r| r.to_string()));
            other.agents.sort_by_key(|a| READER_ORDER.iter().position(|r| r == a));
            other.agents.dedup();
        }
    }

    /// Puts each other skill in its folder. One whose skill has gone is left in
    /// the saved list, in case the skill comes back.
    fn file_others(&mut self) {
        for other in &mut self.listed_others {
            let filed = self.other_folders.iter().find(|(name, _)| *name == other.name);
            other.folder = filed
                .and_then(|(_, f)| clean_folder(f).ok())
                .map(|f| add_folder(&mut self.folders, &f));
            other.at_root = filed.is_some_and(|(_, f)| f == AT_ROOT);
        }
    }

    /// A skill outside the skills root: lpm's unless it is a copy of one in
    /// `shared`, which is how Claude gets a skill where links aren't allowed.
    fn add_elsewhere(&mut self, name: String, content: &str, shared: &HashSet<String>, place: Elsewhere) {
        let doc = parse_doc(content);
        if !doc.created_with_lpm {
            self.add_other(name, &doc, place.path, place.readers);
        } else if valid_name(&name) && !shared.contains(&name) && !self.files.iter().any(|f| f.name == name) {
            self.add(name, doc, place.reach);
        }
    }
}

/// Where a skill outside the skills root sits, and so who reads it.
struct Elsewhere {
    path: String,
    readers: &'static [&'static str],
    reach: Reach,
}

fn preview_of(body: &str) -> String {
    match body.char_indices().nth(OTHER_PREVIEW_CHARS) {
        Some((cut, _)) => format!("{}…", body[..cut].trim_end()),
        None => body.to_string(),
    }
}

fn skill_path(root: &str, name: &str) -> String {
    format!("{}/{name}/SKILL.md", root.trim_end_matches('/'))
}

impl RawList {
    pub(crate) fn sorted_out(self) -> Snapshot {
        let mut folders = Vec::new();
        for folder in &self.saved_folders {
            add_folder(&mut folders, &clean_folder(folder).unwrap_or_else(|_| folder.clone()));
        }
        let mut snap = Snapshot {
            folders,
            saved_folders: self.saved_folders,
            other_folders: self.other_folders,
            legacy: self.legacy,
            ..Snapshot::default()
        };
        let shared: HashSet<String> = self.skills.iter().map(|(name, _)| name.clone()).collect();
        let claude_finds: HashSet<&str> = self
            .claude
            .iter()
            .filter(|(name, entry)| entry.is_lpms(name))
            .map(|(name, _)| name.as_str())
            .collect();
        for (name, content) in self.skills {
            let doc = parse_doc(&content);
            if doc.created_with_lpm && valid_name(&name) {
                let reach = Reach { claude: claude_finds.contains(name.as_str()), codex: true };
                snap.add(name, doc, reach);
            } else {
                let path = skill_path(&self.skills_dir, &name);
                snap.add_other(name, &doc, path, SHARED_READERS);
            }
        }
        for (name, entry) in &self.claude {
            let path = skill_path(&self.claude_dir, name);
            match entry {
                ClaudeEntry::Link(target, _) if is_link_to_skill(target, name) => {
                    snap.also_read_by(name, CLAUDE_READERS);
                }
                ClaudeEntry::Link(_, Some(content)) => {
                    snap.add_other(name.clone(), &parse_doc(content), path, CLAUDE_READERS);
                }
                ClaudeEntry::Link(_, None) => snap.others.push(name.clone()),
                ClaudeEntry::Copy(content) => {
                    let reach = Reach { claude: true, codex: false };
                    let place = Elsewhere { path, readers: CLAUDE_READERS, reach };
                    snap.add_elsewhere(name.clone(), content, &shared, place);
                }
            }
        }
        for (name, content) in self.codex {
            let reach = Reach { claude: false, codex: true };
            let place = Elsewhere { path: skill_path(&self.codex_dir, &name), readers: CODEX_READERS, reach };
            snap.add_elsewhere(name, &content, &shared, place);
        }
        snap.file_others();
        if let Some(git) = &self.git {
            snap.in_repo = true;
            let in_claude: HashSet<&str> = self.claude.iter().map(|(name, _)| name.as_str()).collect();
            for file in &mut snap.files {
                let name = file.name.as_str();
                let places = [
                    shared.contains(name).then(|| format!("{SHARED_ROOT}/{name}")),
                    in_claude.contains(name).then(|| format!("{CLAUDE_ROOT}/{name}")),
                ];
                file.git = git.skill(&places.into_iter().flatten().collect::<Vec<_>>());
            }
        }
        snap
    }
}

pub(crate) fn is_link_to_skill(target: &str, name: &str) -> bool {
    target.replace('\\', "/").ends_with(&format!(".agents/skills/{name}"))
}
