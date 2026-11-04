// Keeping one project skill out of git. The rules go in the repo's info/exclude,
// so nothing is committed to say so and the skill's name stays off the repo.
// A skill git already holds has its removal staged, for the user to commit: lpm
// never commits. A rule names both places a skill can sit, so Claude's link is
// covered even when it is made later.
use crate::lpm_commands::{current, project_store, CommandFs};
use crate::lpm_commands_snapshot::RawList;
use std::collections::HashSet;
use std::path::Path;

pub(crate) const SHARED_ROOT: &str = ".agents/skills";
pub(crate) const CLAUDE_ROOT: &str = ".claude/skills";
const EXCLUDE: &str = "info/exclude";
const NOT_A_REPO: &str = "not a git repository";
const STAGED_DIFFERENT: &str = "staged content different";

/// Where git stands on one skill.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub(crate) struct SkillGit {
    pub kept_out: bool,
    pub tracked: bool,
}

/// What git says of a list's folders, by paths from the project's folder.
#[derive(Debug, Default)]
pub(crate) struct GitView {
    pub ignored: HashSet<String>,
    pub tracked: Vec<String>,
}

impl GitView {
    /// A skill by the `places` it has: a folder, and a link for Claude when
    /// it has one. All of them must be out, or a commit would still carry part of it.
    pub(crate) fn skill(&self, places: &[String]) -> SkillGit {
        let holds = |place: &String| {
            let inside = format!("{place}/");
            self.tracked.iter().any(|t| t == place || t.starts_with(&inside))
        };
        let tracked = places.iter().any(holds);
        let ignored = places.iter().all(|p| self.ignored.contains(p));
        SkillGit { tracked, kept_out: !tracked && !places.is_empty() && ignored }
    }
}

/// None outside a repo, which is also how a project without git reads.
pub(crate) fn read_view(root: &Path, raw: &RawList) -> Option<GitView> {
    let shared = raw.skills.iter().map(|(name, _)| format!("{SHARED_ROOT}/{name}"));
    let claude = raw.claude.iter().map(|(name, _)| format!("{CLAUDE_ROOT}/{name}"));
    let places: Vec<String> = shared.chain(claude).collect();
    let asked: Vec<&str> = places.iter().map(String::as_str).collect();
    let ignored = crate::gitignore::ignored_in_repo(root, &asked)?;
    let listed = crate::git::git_out(
        &root.to_string_lossy(),
        &["ls-files", "-z", "--", SHARED_ROOT, CLAUDE_ROOT],
    )
    .unwrap_or_default();
    let tracked = listed.split('\0').filter(|p| !p.is_empty()).map(str::to_string).collect();
    Some(GitView { ignored, tracked })
}

fn places(name: &str) -> [String; 2] {
    [format!("{SHARED_ROOT}/{name}"), format!("{CLAUDE_ROOT}/{name}")]
}

fn escaped(path: &str) -> String {
    let mut out = String::with_capacity(path.len());
    for c in path.chars() {
        if matches!(c, '\\' | '*' | '?' | '[') {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

/// Rules are read from the repo's top, which a project in a subfolder isn't.
/// The leading `/` holds each to that one spot, and there's no trailing `/`
/// because a rule ending in one doesn't match a link.
fn rules(prefix: &str, name: &str) -> [String; 2] {
    places(name).map(|place| format!("/{}{place}", escaped(prefix)))
}

fn with_rules(text: &str, rules: &[String]) -> String {
    let mut out = text.to_string();
    for rule in rules {
        if text.lines().any(|line| line.trim() == rule) {
            continue;
        }
        if !out.is_empty() && !out.ends_with('\n') {
            out.push('\n');
        }
        out.push_str(rule);
        out.push('\n');
    }
    out
}

/// Takes the rule however it's written, so one added by hand goes too. Every
/// other line stays as it was.
fn without_rules(text: &str, rules: &[String]) -> String {
    let bare = |line: &str| line.trim().trim_matches('/').to_string();
    let gone: HashSet<String> = rules.iter().map(|rule| bare(rule)).collect();
    text.split_inclusive('\n').filter(|line| !gone.contains(&bare(line))).collect()
}

fn friendly(error: String) -> String {
    if error.contains(NOT_A_REPO) {
        return "This project isn't in a Git repository.".into();
    }
    error
}

fn edit_exclude(fs: &dyn CommandFs, edit: impl Fn(&str, &str) -> String) -> Result<(), String> {
    let path = fs.git(&["rev-parse", "--git-path", EXCLUDE]).map_err(friendly)?;
    let prefix = fs.git(&["rev-parse", "--show-prefix"]).map_err(friendly)?;
    let text = fs.read_git_file(&path)?;
    let next = edit(&text, &prefix);
    if next == text {
        return Ok(());
    }
    fs.write_git_file(&path, &next)
}

fn keep_out(fs: &dyn CommandFs, name: &str) -> Result<(), String> {
    let [shared, claude] = places(name);
    fs.git(&["rm", "-r", "-q", "--cached", "--ignore-unmatch", "--", &shared, &claude])
        .map_err(|e| {
            if e.contains(STAGED_DIFFERENT) {
                format!("Git has staged changes to /{name} that differ from its file. Commit or unstage them first.")
            } else {
                friendly(e)
            }
        })?;
    edit_exclude(fs, |text, prefix| with_rules(text, &rules(prefix, name)))
}

/// Undoes a removal not committed yet, so the skill goes back to how git had it.
fn let_in(fs: &dyn CommandFs, name: &str) -> Result<(), String> {
    edit_exclude(fs, |text, prefix| without_rules(text, &rules(prefix, name)))?;
    let [shared, claude] = places(name);
    let _ = fs.git(&["reset", "-q", "--", &shared, &claude]);
    let snap = current(fs)?;
    if snap.files.iter().any(|f| f.name == name && f.git.kept_out) {
        return Err(format!("Another ignore rule still keeps /{name} out of Git."));
    }
    Ok(())
}

/// Moves a saved skill to where the form asks. `want` None leaves it there.
pub(crate) fn apply(fs: &dyn CommandFs, name: &str, is_out: bool, want: Option<bool>) -> Result<(), String> {
    match want {
        Some(true) if !is_out => keep_out(fs, name),
        Some(false) if is_out => let_in(fs, name),
        _ => Ok(()),
    }
}

pub(crate) fn move_rules(fs: &dyn CommandFs, from: &str, to: &str) -> Result<(), String> {
    edit_exclude(fs, |text, prefix| {
        with_rules(&without_rules(text, &rules(prefix, from)), &rules(prefix, to))
    })
}

/// A skill's rules go with it, unless files someone added stayed in its folder,
/// which would otherwise surface in the next commit. A rule left behind only
/// keeps out a name that isn't in use, so this can fail quietly.
pub(crate) fn forget_removed(fs: &dyn CommandFs, name: &str) {
    let [shared, claude] = places(name);
    let left = fs.git(&["ls-files", "--others", "--ignored", "--exclude-standard", "--", &shared, &claude]);
    if left.is_ok_and(|files| files.is_empty()) {
        let _ = edit_exclude(fs, |text, prefix| without_rules(text, &rules(prefix, name)));
    }
}

/// A linked worktree shares its repo's rules but not ignored files, so skills kept
/// out would be missing there. Returns the ones that couldn't be brought.
pub(crate) fn bring_kept_out(from: &Path, dest: &Path) -> Vec<String> {
    let Ok(snap) = project_store(from).snapshot() else {
        return Vec::new();
    };
    let target = project_store(dest);
    let mut failed = Vec::new();
    for file in snap.files.iter().filter(|f| f.git.kept_out) {
        let copied = places(&file.name).iter().try_for_each(|place| {
            let source = from.join(place);
            if source.exists() {
                crate::lpm_commands::copy_tree(&source, &dest.join(place)).map_err(|e| e.to_string())
            } else {
                Ok(())
            }
        });
        if let Err(e) = copied.and_then(|()| target.link_claude(&file.name)) {
            failed.push(format!("{}: {e}", file.name));
        }
    }
    failed
}

#[cfg(test)]
#[path = "lpm_commands_git_tests.rs"]
mod tests;
