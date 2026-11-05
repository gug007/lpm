// A skills list on this computer: its skills root, the .claude/skills beside it
// and the .lpm folder an old list of commands sits in.
use crate::lpm_commands::{
    is_link_to_skill, is_visible_folder, legacy_name_of, parse_doc, ClaudeEntry, CommandFs, LegacyFile,
    LegacyList, RawList, Snapshot, MAX_FILE_BYTES,
};
use crate::lpm_commands_layout as layout;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

pub(crate) const LEGACY_DIR: &str = "commands";
pub(crate) const LEGACY_DONE: &str = ".migrated";
pub(crate) const LEGACY_DONE_NOTE: &str = "Moved to skills. lpm doesn't read this folder any more.\n";

pub(crate) struct LocalFs {
    skills: PathBuf,
    claude: PathBuf,
    codex: Option<PathBuf>,
    lpm: PathBuf,
    repo: Option<PathBuf>,
    layout: Option<PathBuf>,
}

fn read_capped(path: &Path) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    let end = bytes.len().min(MAX_FILE_BYTES);
    Some(String::from_utf8_lossy(&bytes[..end]).into_owned())
}

fn visible_entries(dir: &Path) -> Vec<(String, PathBuf)> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter_map(|e| Some((e.file_name().to_str()?.to_string(), e.path())))
        .filter(|(name, _)| is_visible_folder(name))
        .collect()
}

pub(crate) fn missing_is_fine(result: std::io::Result<()>) -> Result<(), String> {
    match result {
        Err(e) if e.kind() != ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

#[cfg(unix)]
pub(crate) fn link_dir(target: &Path, link: &Path) -> std::io::Result<()> {
    std::os::unix::fs::symlink(target, link)
}

#[cfg(windows)]
pub(crate) fn link_dir(target: &Path, link: &Path) -> std::io::Result<()> {
    std::os::windows::fs::symlink_dir(target, link)
}

pub(crate) fn copy_tree(from: &Path, to: &Path) -> std::io::Result<()> {
    if to.exists() {
        return Ok(());
    }
    let kind = std::fs::symlink_metadata(from)?.file_type();
    if kind.is_dir() {
        std::fs::create_dir_all(to)?;
        for entry in std::fs::read_dir(from)?.flatten() {
            copy_tree(&entry.path(), &to.join(entry.file_name()))?;
        }
    } else if kind.is_file() {
        std::fs::copy(from, to)?;
    }
    Ok(())
}

fn md_files(dir: &Path, folder: Option<&str>, out: &mut Vec<LegacyFile>) {
    for (file_name, path) in visible_entries(dir) {
        if let (Some(name), true) = (legacy_name_of(&file_name), path.is_file()) {
            if let Some(content) = read_capped(&path) {
                out.push(LegacyFile {
                    folder: folder.map(str::to_string),
                    name: name.to_string(),
                    content,
                });
            }
        }
    }
}

/// A folder of `*.md` prompts, at its top and one folder down: an old lpm list,
/// or an agent's own commands.
pub(crate) fn read_md_list(base: &Path) -> LegacyList {
    let mut out = LegacyList::default();
    for (name, path) in visible_entries(base) {
        if path.is_dir() {
            md_files(&path, Some(&name), &mut out.files);
            out.folders.push(name);
        }
    }
    md_files(base, None, &mut out.files);
    out
}

impl LocalFs {
    pub fn new(skills: PathBuf, claude: PathBuf, lpm: PathBuf) -> Self {
        Self { skills, claude, codex: None, lpm, repo: None, layout: None }
    }

    pub fn with_codex(mut self, dir: PathBuf) -> Self {
        self.codex = Some(dir);
        self
    }

    /// The project folder a project's list answers to git from.
    pub fn with_repo(mut self, root: PathBuf) -> Self {
        self.repo = Some(root);
        self
    }

    pub fn with_layout(mut self, path: PathBuf) -> Self {
        self.layout = Some(path);
        self
    }

    /// Whether the skills root is there but can't be read, when every skill in it
    /// would look gone.
    pub(crate) fn is_unreadable(&self) -> bool {
        matches!(std::fs::read_dir(&self.skills), Err(e) if e.kind() != ErrorKind::NotFound)
    }

    /// Every root a skill of this list can sit in.
    pub(crate) fn roots(&self) -> Vec<PathBuf> {
        [Some(&self.skills), Some(&self.claude), self.codex.as_ref()]
            .into_iter()
            .flatten()
            .cloned()
            .collect()
    }

    /// The root that holds the skill: the skills root, unless Agent setup made
    /// it in Claude's or Codex's own folder. A new skill goes in the skills root.
    fn home_of(&self, name: &str) -> &Path {
        let holds = |root: &Path| {
            let dir = root.join(name);
            dir.join("SKILL.md").is_file()
                && !std::fs::symlink_metadata(&dir).is_ok_and(|m| m.file_type().is_symlink())
        };
        if self.skills.join(name).join("SKILL.md").is_file() {
            return &self.skills;
        }
        [Some(&self.claude), self.codex.as_ref()]
            .into_iter()
            .flatten()
            .find(|root| holds(root))
            .map_or(self.skills.as_path(), PathBuf::as_path)
    }

    fn path(&self, rel: &str) -> PathBuf {
        let name = rel.split('/').next().unwrap_or_default();
        rel.split('/').fold(self.home_of(name).to_path_buf(), |p, part| p.join(part))
    }

    fn legacy_dir(&self) -> PathBuf {
        self.lpm.join(LEGACY_DIR)
    }

    /// git names its own files from the project's folder, or in full from a
    /// linked worktree.
    fn in_repo_folder(&self, path: &str) -> PathBuf {
        self.repo.as_deref().unwrap_or(Path::new("")).join(path)
    }

    /// Relative when the link and the skill share a root, so it survives a
    /// clone; absolute for a Claude folder kept somewhere else.
    fn link_target(&self, name: &str) -> PathBuf {
        let root_of = |dir: &Path| dir.parent().and_then(Path::parent).map(Path::to_path_buf);
        if root_of(&self.claude).is_some() && root_of(&self.claude) == root_of(&self.skills) {
            Path::new("..").join("..").join(".agents").join("skills").join(name)
        } else {
            self.skills.join(name)
        }
    }

    fn copy_for_claude(&self, name: &str, link: &Path) -> Result<(), String> {
        std::fs::create_dir_all(link).map_err(|e| e.to_string())?;
        std::fs::copy(self.path(name).join("SKILL.md"), link.join("SKILL.md"))
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    /// A repo can make Claude's folder a link to the shared one, and then a skill
    /// is already there: anything written for Claude would land on the skill.
    fn claude_is_skills_root(&self) -> bool {
        matches!(
            (std::fs::canonicalize(&self.claude), std::fs::canonicalize(&self.skills)),
            (Ok(claude), Ok(skills)) if claude == skills
        )
    }

    pub(crate) fn unlink_claude(&self, name: &str) -> Result<(), String> {
        if self.claude_is_skills_root() {
            return Ok(());
        }
        let link = self.claude.join(name);
        let Ok(meta) = std::fs::symlink_metadata(&link) else {
            return Ok(());
        };
        if meta.file_type().is_symlink() {
            let target = std::fs::read_link(&link).map_err(|e| e.to_string())?;
            if !is_link_to_skill(&target.to_string_lossy(), name) {
                return Ok(());
            }
            return std::fs::remove_file(&link)
                .or_else(|_| std::fs::remove_dir(&link))
                .map_err(|e| e.to_string());
        }
        let file = link.join("SKILL.md");
        if read_capped(&file).is_some_and(|c| parse_doc(&c).created_with_lpm) {
            missing_is_fine(std::fs::remove_file(&file))?;
            let _ = std::fs::remove_dir(&link);
        }
        Ok(())
    }
}

impl CommandFs for LocalFs {
    fn snapshot(&self) -> Result<Snapshot, String> {
        let mut raw = RawList {
            legacy: self.legacy_dir().is_dir() && !self.legacy_dir().join(LEGACY_DONE).exists(),
            skills_dir: self.skills.to_string_lossy().into_owned(),
            claude_dir: self.claude.to_string_lossy().into_owned(),
            codex_dir: self.codex.as_ref().map(|d| d.to_string_lossy().into_owned()).unwrap_or_default(),
            layout: layout::read(self.layout.as_deref()),
            ..RawList::default()
        };
        for (name, path) in visible_entries(&self.skills) {
            if let Some(content) = read_capped(&path.join("SKILL.md")) {
                raw.skills.push((name, content));
            }
        }
        for (name, path) in visible_entries(&self.claude) {
            if let Ok(target) = std::fs::read_link(&path) {
                let content = read_capped(&path.join("SKILL.md"));
                raw.claude.push((name, ClaudeEntry::Link(target.to_string_lossy().into_owned(), content)));
            } else if let Some(content) = read_capped(&path.join("SKILL.md")) {
                raw.claude.push((name, ClaudeEntry::Copy(content)));
            }
        }
        for (name, path) in self.codex.iter().flat_map(|dir| visible_entries(dir)) {
            if let Some(content) = read_capped(&path.join("SKILL.md")) {
                raw.codex.push((name, content));
            }
        }
        if let Some(root) = &self.repo {
            raw.git = crate::lpm_commands_git::read_view(root, &raw);
        }
        Ok(raw.sorted_out())
    }

    fn write(&self, rel: &str, content: &str) -> Result<(), String> {
        let path = self.path(rel);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        crate::fsatomic::write(&path, content.as_bytes(), crate::fsatomic::Mode::Preserve(0o644))
            .map_err(|e| e.to_string())
    }

    fn link_claude(&self, name: &str) -> Result<(), String> {
        // A skill living in Claude's or Codex's own folder has no link to make,
        // and the copy below would write a file in Claude's over itself.
        if self.home_of(name) != self.skills || self.claude_is_skills_root() {
            return Ok(());
        }
        std::fs::create_dir_all(&self.claude).map_err(|e| e.to_string())?;
        let link = self.claude.join(name);
        match std::fs::symlink_metadata(&link) {
            Ok(meta) if meta.file_type().is_symlink() => {
                if !is_link_to_skill(&std::fs::read_link(&link).unwrap_or_default().to_string_lossy(), name) {
                    return Ok(());
                }
                std::fs::remove_file(&link)
                    .or_else(|_| std::fs::remove_dir(&link))
                    .map_err(|e| e.to_string())?;
            }
            Ok(_) => {
                let ours = read_capped(&link.join("SKILL.md")).is_some_and(|c| parse_doc(&c).created_with_lpm);
                return if ours { self.copy_for_claude(name, &link) } else { Ok(()) };
            }
            Err(_) => {}
        }
        // Windows refuses links without Developer Mode, and a copy works there.
        if link_dir(&self.link_target(name), &link).is_err() {
            return self.copy_for_claude(name, &link);
        }
        Ok(())
    }

    fn rename_skill(&self, from: &str, to: &str) -> Result<(), String> {
        let home = self.home_of(from).to_path_buf();
        std::fs::rename(home.join(from), home.join(to)).map_err(|e| e.to_string())?;
        self.unlink_claude(from)
    }

    fn remove_skill(&self, name: &str) -> Result<(), String> {
        let dir = self.path(name);
        missing_is_fine(std::fs::remove_file(dir.join("SKILL.md")))?;
        missing_is_fine(std::fs::remove_file(dir.join("agents").join("openai.yaml")))?;
        let _ = std::fs::remove_dir(dir.join("agents"));
        let _ = std::fs::remove_dir(&dir);
        self.unlink_claude(name)
    }

    fn layout_path(&self) -> Option<&Path> {
        self.layout.as_deref()
    }

    fn skill_files(&self, name: &str) -> Result<Vec<(String, String)>, String> {
        let roots = [Some(&self.skills), Some(&self.claude), self.codex.as_ref()];
        Ok(roots
            .into_iter()
            .flatten()
            .map(|root| root.join(name))
            .filter(|dir| !std::fs::symlink_metadata(dir).is_ok_and(|m| m.file_type().is_symlink()))
            .filter_map(|dir| {
                let path = dir.join("SKILL.md");
                let content = std::fs::read_to_string(&path).ok()?;
                Some((path.to_string_lossy().into_owned(), content))
            })
            .collect())
    }

    fn rewrite(&self, path: &str, content: &str) -> Result<(), String> {
        crate::fsatomic::write(Path::new(path), content.as_bytes(), crate::fsatomic::Mode::Preserve(0o644))
            .map_err(|e| e.to_string())
    }

    fn location(&self, name: &str) -> String {
        self.home_of(name).join(name).to_string_lossy().into_owned()
    }

    fn git(&self, args: &[&str]) -> Result<String, String> {
        let root = self.repo.as_ref().ok_or("Only a project's skills can be kept out of Git.")?;
        crate::git::git_out(&root.to_string_lossy(), args)
    }

    fn read_git_file(&self, path: &str) -> Result<String, String> {
        match std::fs::read_to_string(self.in_repo_folder(path)) {
            Ok(text) => Ok(text),
            Err(e) if e.kind() == ErrorKind::NotFound => Ok(String::new()),
            Err(e) => Err(e.to_string()),
        }
    }

    fn write_git_file(&self, path: &str, text: &str) -> Result<(), String> {
        let path = self.in_repo_folder(path);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        crate::fsatomic::write(&path, text.as_bytes(), crate::fsatomic::Mode::Preserve(0o644))
            .map_err(|e| e.to_string())
    }

    fn legacy_list(&self) -> Result<LegacyList, String> {
        Ok(read_md_list(&self.legacy_dir()))
    }

    fn copy_legacy_files(&self, folder: &str, commands: &[String], skill: &str) -> Result<(), String> {
        let beside: Vec<String> = commands.iter().map(|c| format!("{c}.md")).collect();
        let Ok(entries) = std::fs::read_dir(self.legacy_dir().join(folder)) else {
            return Ok(());
        };
        for entry in entries.flatten() {
            let name = entry.file_name();
            if !beside.iter().any(|b| name.to_str() == Some(b)) {
                copy_tree(&entry.path(), &self.path(skill).join(&name)).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }

    fn finish_legacy(&self) -> Result<(), String> {
        std::fs::write(self.legacy_dir().join(LEGACY_DONE), LEGACY_DONE_NOTE).map_err(|e| e.to_string())
    }
}
