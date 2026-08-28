//! Adding and removing a skill folder, and the one declaration of where skills
//! may live. `scan.rs` lists the roots this module enumerates, so a root cannot
//! be listable but undeletable, or deletable but unlisted.
//!
//! A path is accepted only when the exact shape `<root>/<name>/SKILL.md`
//! resolves against that root list — recomputed here, never taken from the
//! caller. `write::writable_root` is deliberately not reused: it returns true
//! for any path with a `.claude` component and for any CLAUDE.md on the disk,
//! which is far too loose to authorise a recursive removal.

use serde::Serialize;
use std::path::{Component, Path, PathBuf};

const MAX_NAME: usize = 64;
/// Mirrors `write.rs`'s own document cap, so a skill lpm writes is always a
/// skill lpm can reopen for editing.
const MAX_CONTENT_BYTES: u64 = 512 * 1024;
const WALK_ENTRIES: u32 = 500;
const WALK_DEPTH: u32 = 4;
const EXTRAS_CAP: usize = 8;

const NOT_A_ROOT: &str = "That is not a folder an agent reads skills from.";
const NOT_A_SKILL: &str = "This is not a skill folder lpm can remove.";
const IS_A_LINK: &str =
    "This skill is a link to a folder somewhere else. Remove it where it lives.";

// ---- where skills may live ---------------------------------------------------

pub(super) struct SkillRoot {
    pub cli: &'static str,
    pub scope: &'static str,
    pub path: PathBuf,
}

/// `$CODEX_HOME` when set and non-empty, else `~/.codex`. Declared here so the
/// scan and the create/delete allowlist can never disagree about it.
pub(super) fn codex_home(home: &Path) -> PathBuf {
    std::env::var("CODEX_HOME")
        .ok()
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".codex"))
}

/// In scan order: claude user, claude project, codex `$CODEX_HOME/skills`,
/// codex `~/.agents/skills`. Non-absolute entries are dropped — `dirs::home_dir()
/// .unwrap_or_default()` yields `""`, which would make `home.join(".claude/skills")`
/// the *relative* path `.claude/skills`. Duplicates are dropped keeping the
/// first — `CODEX_HOME=~/.agents` collapses two entries into one.
pub(super) fn skill_roots_in(
    home: &Path,
    codex_home: &Path,
    project: Option<&Path>,
) -> Vec<SkillRoot> {
    let mut candidates = vec![SkillRoot {
        cli: "claude",
        scope: "user",
        path: home.join(".claude/skills"),
    }];
    if let Some(project) = project {
        candidates.push(SkillRoot {
            cli: "claude",
            scope: "project",
            path: project.join(".claude/skills"),
        });
    }
    candidates.push(SkillRoot {
        cli: "codex",
        scope: "user",
        path: codex_home.join("skills"),
    });
    // lpm installs its own skills here, and Codex reads it as a second root.
    candidates.push(SkillRoot {
        cli: "codex",
        scope: "user",
        path: home.join(".agents/skills"),
    });

    let mut out: Vec<SkillRoot> = Vec::new();
    for candidate in candidates {
        if candidate.path.is_absolute() && !out.iter().any(|r| r.path == candidate.path) {
            out.push(candidate);
        }
    }
    out
}

/// The tauri-facing wrapper: resolves home and `$CODEX_HOME`, and takes the
/// project root only when `cwd` is a non-empty existing directory — the same
/// filter `scan::scan` applies.
pub(super) fn skill_roots(cwd: &str) -> Vec<SkillRoot> {
    let home = dirs::home_dir().unwrap_or_default();
    let codex = codex_home(&home);
    let project = Some(cwd)
        .filter(|c| !c.trim().is_empty())
        .map(PathBuf::from)
        .filter(|p| p.is_dir());
    skill_roots_in(&home, &codex, project.as_deref())
}

// ---- validation --------------------------------------------------------------

/// Non-empty, at most 64 chars, `[a-z0-9-]` only, no leading or trailing `-`,
/// no `--`. That one rule set implicitly rejects `.`, `..`, `/`, whitespace,
/// uppercase and any hidden name, so `~/.codex/skills/.system` can never
/// resolve. Matches both vendors' own validators.
fn validate_skill_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Give the skill a name.".into());
    }
    if name.chars().count() > MAX_NAME {
        return Err("Keep the name to 64 characters or fewer.".into());
    }
    let shaped = name.split('-').all(|part| {
        !part.is_empty()
            && part
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
    });
    if !shaped {
        return Err("Use lowercase letters, numbers and hyphens.".into());
    }
    Ok(())
}

/// The skill folder `path` belongs to, or why it is not one.
fn resolve_skill_dir(path: &Path, roots: &[SkillRoot]) -> Result<PathBuf, String> {
    if !path.is_absolute() || path.components().any(|c| c == Component::ParentDir) {
        return Err(NOT_A_SKILL.into());
    }
    // Case-sensitive: macOS opens the same file for `SKILL.MD`, so a second
    // spelling would be a second way to name a folder lpm is about to remove.
    if path.file_name().and_then(|n| n.to_str()) != Some("SKILL.md") {
        return Err(NOT_A_SKILL.into());
    }
    let dir = path.parent().ok_or(NOT_A_SKILL)?;
    let parent = dir.parent().ok_or(NOT_A_SKILL)?;
    // Equality, never `starts_with`: this one rule enforces depth-exactly-one,
    // excludes every plugin directory (they are never roots), and rejects
    // `~/.claude.json`, `.mcp.json`, `CLAUDE.md` and `<root>/SKILL.md`.
    if !roots.iter().any(|r| r.path == parent) {
        return Err(NOT_A_SKILL.into());
    }
    // Looser than `validate_skill_name`: the scan lists any folder holding a
    // SKILL.md, so a hand-made `Skill_Creator` must stay removable rather than
    // be told it is not a skill. Hidden names are still refused — those are the
    // CLIs' own internals, never something the user added.
    let name = dir.file_name().and_then(|n| n.to_str()).unwrap_or_default();
    if name.is_empty() || name.starts_with('.') {
        return Err(NOT_A_SKILL.into());
    }
    // Dotfile managers symlink individual skill folders; trashing the link
    // orphans the real content, and `move_to_trash`'s existence check follows
    // symlinks and would silently no-op on a dangling one. A folder that is
    // simply gone falls through, so removal stays idempotent.
    match std::fs::symlink_metadata(dir) {
        Ok(meta) if meta.file_type().is_symlink() => Err(IS_A_LINK.into()),
        _ => Ok(dir.to_path_buf()),
    }
}

/// Gate on `cwd`, not the capability path: `match_remote_root` is exact string
/// equality against project roots, so `/srv/app/.claude/skills/x/SKILL.md` never
/// equals `/srv/app` and a path-based gate would let create materialise a
/// phantom tree on the local Mac at the remote's path.
fn ensure_local(cwd: &str, verb: &str) -> Result<(), String> {
    if crate::sshexec::remote_project_for_path(cwd).is_some() {
        return Err(format!(
            "Skills for this project live on a remote host. {verb} it there."
        ));
    }
    // Empty is the no-project-open case, which still has user-scope roots.
    if !cwd.trim().is_empty() && !Path::new(cwd).is_absolute() {
        return Err("cannot use this directory".into());
    }
    Ok(())
}

// ---- commands ----------------------------------------------------------------

/// Ok = the absolute path of the new SKILL.md, so the pane can refresh and
/// open it.
#[tauri::command(async)]
pub fn create_agent_skill(
    cwd: String,
    root: String,
    name: String,
    content: String,
) -> Result<String, String> {
    ensure_local(&cwd, "Create")?;
    let roots = skill_roots(&cwd);
    // The destination is chosen from the allowlist, never freely supplied.
    // Deriving it from (cli, scope) would be ambiguous: Codex has two user roots.
    let root = roots
        .iter()
        .find(|r| r.path == Path::new(&root))
        .ok_or(NOT_A_ROOT)?;
    validate_skill_name(&name)?;

    let dir = root.path.join(&name);
    let skill_md = dir.join("SKILL.md");
    if content.len() as u64 > MAX_CONTENT_BYTES {
        return Err(format!("cannot write {}: too large", skill_md.display()));
    }
    // An absent root is legitimately offerable: the scan records `exists: false`
    // precisely so the pane can create one.
    std::fs::create_dir_all(&root.path)
        .map_err(|e| format!("cannot create {}: {e}", root.path.display()))?;
    // The collision check is this one syscall, so there is no window between
    // asking whether the name is free and claiming it.
    std::fs::create_dir(&dir).map_err(|e| {
        if e.kind() == std::io::ErrorKind::AlreadyExists {
            format!("A skill named {name} is already here.")
        } else {
            format!("cannot create {}: {e}", dir.display())
        }
    })?;
    write_skill_file(&dir, content.as_bytes())?;
    Ok(skill_md.to_string_lossy().into_owned())
}

/// Fill a folder `create_agent_skill` has just claimed. A folder with no
/// SKILL.md is invisible to every scanner, so a failed write gives the name
/// back instead of leaving a husk nothing will ever list again.
fn write_skill_file(dir: &Path, content: &[u8]) -> Result<(), String> {
    let skill_md = dir.join("SKILL.md");
    if let Err(e) =
        crate::fsatomic::write(&skill_md, content, crate::fsatomic::Mode::Preserve(0o644))
    {
        let _ = std::fs::remove_dir_all(dir);
        return Err(format!("cannot write {}: {e}", skill_md.display()));
    }
    Ok(())
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SkillRemoval {
    pub dir: String,
    pub name: String,
    /// Every file inside the folder, SKILL.md included.
    pub files: u32,
    pub bytes: u64,
    /// Names sitting beside SKILL.md, so the confirmation can say what else
    /// goes. Capped for the payload — `extra_count` is the true total, so the
    /// line that says "and N more" cannot quietly undercount.
    pub extras: Vec<String>,
    pub extra_count: u32,
    /// The walk hit its cap, so `files` and `bytes` are lower bounds.
    pub truncated: bool,
}

/// What removing this skill would take with it. Pure read, no side effects —
/// and it grants nothing: `delete_agent_skill` re-runs every check itself.
#[tauri::command(async)]
pub fn preview_agent_skill_delete(cwd: String, path: String) -> Result<SkillRemoval, String> {
    ensure_local(&cwd, "Remove")?;
    let dir = resolve_skill_dir(Path::new(&path), &skill_roots(&cwd))?;
    Ok(summarize(&dir))
}

#[tauri::command(async)]
pub fn delete_agent_skill(cwd: String, path: String) -> Result<(), String> {
    ensure_local(&cwd, "Remove")?;
    let dir = resolve_skill_dir(Path::new(&path), &skill_roots(&cwd))?;
    remove_skill_dir(&dir, &crate::trash::move_to_trash)
}

/// The trash call is injected so `cargo test` never moves real folders into the
/// developer's Trash.
fn remove_skill_dir(dir: &Path, trash: &dyn Fn(&Path) -> Result<(), String>) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }
    trash(dir)
}

fn summarize(dir: &Path) -> SkillRemoval {
    let mut out = SkillRemoval {
        dir: dir.to_string_lossy().into_owned(),
        name: dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .to_string(),
        ..Default::default()
    };
    let Ok(entries) = std::fs::read_dir(dir) else {
        return out;
    };
    let mut extras: Vec<String> = entries
        .filter_map(Result::ok)
        .filter_map(|e| e.file_name().to_str().map(str::to_string))
        .filter(|n| n != "SKILL.md")
        .collect();
    extras.sort();
    out.extra_count = extras.len() as u32;
    extras.truncate(EXTRAS_CAP);
    out.extras = extras;
    walk(dir, 0, &mut 0, &mut out);
    out
}

/// Bounded recursive `read_dir`: the confirmation only needs an order of
/// magnitude, and a skill folder that hides a checkout must not stall the pane.
/// `symlink_metadata` keeps a link a single entry and never follows it.
fn walk(dir: &Path, depth: u32, seen: &mut u32, out: &mut SkillRemoval) {
    if depth > WALK_DEPTH {
        out.truncated = true;
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.filter_map(Result::ok) {
        if *seen >= WALK_ENTRIES {
            out.truncated = true;
            return;
        }
        let path = entry.path();
        let Ok(meta) = std::fs::symlink_metadata(&path) else {
            continue;
        };
        // Every entry counts against the budget, directories included: a folder
        // hiding a wide tree of empty directories must stop the walk too.
        *seen += 1;
        if meta.is_dir() {
            walk(&path, depth + 1, seen, out);
        } else {
            out.files += 1;
            out.bytes += meta.len();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_caps::{AgentCapabilities, KIND_SKILL};
    use std::cell::RefCell;
    use std::collections::BTreeSet;
    use tempfile::tempdir;

    /// A home that never has to exist: `skill_roots_in` is pure path arithmetic,
    /// and no test may touch the developer's real `$HOME`.
    const FAKE_HOME: &str = "/tmp/lpm-skill-tests-home";

    fn roots_for(project: Option<&Path>) -> Vec<SkillRoot> {
        let home = Path::new(FAKE_HOME);
        skill_roots_in(home, &home.join(".codex"), project)
    }

    /// The one invariant that must never drift: a root the scan lists but this
    /// module does not would make a listed skill undeletable, and a root this
    /// module allows but the scan never lists would make an unlisted directory
    /// deletable.
    #[test]
    fn the_roots_match_the_scan() {
        let home = tempdir().unwrap();
        let project = tempdir().unwrap();
        let codex = home.path().join(".codex");
        let declared = skill_roots_in(home.path(), &codex, Some(project.path()));

        let mut out = AgentCapabilities::default();
        super::super::scan::claude(home.path(), Some(project.path()), &declared, &mut out);
        super::super::scan::codex(&codex, Some(project.path()), &declared, &mut out);

        let scanned: BTreeSet<String> = out
            .roots
            .iter()
            .filter(|r| r.kind == KIND_SKILL)
            .map(|r| r.path.clone())
            .collect();
        let listed: BTreeSet<String> = declared
            .iter()
            .map(|r| r.path.to_string_lossy().into_owned())
            .collect();
        assert_eq!(scanned, listed);
    }

    #[test]
    fn roots_are_absolute_and_deduped() {
        // `dirs::home_dir().unwrap_or_default()` is "", which would otherwise
        // turn every user root into a relative path next to the cwd.
        assert!(skill_roots_in(Path::new(""), Path::new(""), None).is_empty());

        let home = Path::new(FAKE_HOME);
        let collapsed = skill_roots_in(home, &home.join(".agents"), None);
        let paths: Vec<PathBuf> = collapsed.iter().map(|r| r.path.clone()).collect();
        assert_eq!(
            paths,
            vec![home.join(".claude/skills"), home.join(".agents/skills")]
        );
        assert!(collapsed.iter().all(|r| r.path.is_absolute()));
    }

    #[test]
    fn skill_name_rules() {
        for good in ["deploy", "lpm-cli", "x2"] {
            assert!(validate_skill_name(good).is_ok(), "{good}");
        }
        for bad in [
            "", ".", "..", ".system", "a/b", "a b", "Deploy", "-x", "x-", "a--b",
        ] {
            assert!(validate_skill_name(bad).is_err(), "{bad:?}");
        }
        assert!(validate_skill_name(&"a".repeat(MAX_NAME)).is_ok());
        assert!(validate_skill_name(&"a".repeat(MAX_NAME + 1)).is_err());
    }

    #[test]
    fn only_a_direct_child_of_a_root_is_a_skill_folder() {
        let project = Path::new("/tmp/lpm-skill-tests-project");
        let roots = roots_for(Some(project));
        let user = Path::new(FAKE_HOME).join(".claude/skills");

        assert_eq!(
            resolve_skill_dir(&user.join("deploy/SKILL.md"), &roots).unwrap(),
            user.join("deploy")
        );
        for bad in [
            user.join("deploy/nested/SKILL.md"),
            user.join("SKILL.md"),
            PathBuf::from("/etc/skills/deploy/SKILL.md"),
            Path::new(FAKE_HOME).join(".claude/plugins/repos/o/r/skills/x/SKILL.md"),
            project.join(".claude/agents/review.md"),
        ] {
            assert!(
                resolve_skill_dir(&bad, &roots).is_err(),
                "{}",
                bad.display()
            );
        }
    }

    /// The scan lists any folder holding a SKILL.md, so a name lpm would not
    /// have chosen itself must still be removable — telling the user their own
    /// visible folder "is not a skill" is the one answer they cannot act on.
    #[test]
    fn a_listed_folder_stays_removable_whatever_its_name() {
        let roots = roots_for(None);
        let user = Path::new(FAKE_HOME).join(".claude/skills");

        for odd in ["Skill_Creator", "my.skill", "a--b", "UPPER"] {
            assert!(
                resolve_skill_dir(&user.join(odd).join("SKILL.md"), &roots).is_ok(),
                "{odd}"
            );
        }
        // Hidden folders are the CLIs' own internals, never something the user
        // added, so they stay out of reach.
        assert!(resolve_skill_dir(&user.join(".system/SKILL.md"), &roots).is_err());
    }

    #[test]
    #[allow(non_snake_case)]
    fn the_file_must_be_named_SKILL_md() {
        let roots = roots_for(None);
        let user = Path::new(FAKE_HOME).join(".claude/skills");
        assert!(resolve_skill_dir(&user.join("deploy/SKILL.md"), &roots).is_ok());
        // macOS opens the same file for either spelling, so only one is accepted.
        assert!(resolve_skill_dir(&user.join("deploy/SKILL.MD"), &roots).is_err());
        assert!(resolve_skill_dir(&user.join("deploy/skill.md"), &roots).is_err());
        assert!(resolve_skill_dir(&user.join("deploy/README.md"), &roots).is_err());
    }

    #[test]
    fn traversal_and_relative_paths_are_rejected() {
        let roots = roots_for(None);
        let user = Path::new(FAKE_HOME).join(".claude/skills");
        assert!(resolve_skill_dir(Path::new(".claude/skills/x/SKILL.md"), &roots).is_err());
        assert!(resolve_skill_dir(&user.join("../../x/SKILL.md"), &roots).is_err());
    }

    // ---- filesystem ----------------------------------------------------------
    //
    // Every one of these works inside a temp project, whose `.claude/skills` is
    // a real root for that cwd, so no test needs to move `$HOME` or `$CODEX_HOME`.

    fn project_root(project: &Path) -> (String, String, PathBuf) {
        let root = project.join(".claude/skills");
        (
            project.to_string_lossy().into_owned(),
            root.to_string_lossy().into_owned(),
            root,
        )
    }

    #[test]
    fn create_claims_the_name_atomically() {
        let project = tempdir().unwrap();
        let (cwd, root_arg, root) = project_root(project.path());

        let made = create_agent_skill(
            cwd.clone(),
            root_arg.clone(),
            "deploy".into(),
            "first".into(),
        )
        .unwrap();
        assert_eq!(Path::new(&made), root.join("deploy/SKILL.md"));

        let err = create_agent_skill(cwd, root_arg, "deploy".into(), "second".into()).unwrap_err();
        assert_eq!(err, "A skill named deploy is already here.");
        assert_eq!(std::fs::read_to_string(&made).unwrap(), "first");
    }

    #[test]
    fn create_makes_a_missing_root() {
        let project = tempdir().unwrap();
        let (cwd, root_arg, root) = project_root(project.path());
        assert!(!root.exists());

        create_agent_skill(cwd, root_arg, "deploy".into(), "body".into()).unwrap();
        assert!(root.join("deploy/SKILL.md").is_file());
    }

    #[test]
    fn a_root_outside_the_allowlist_is_refused() {
        let project = tempdir().unwrap();
        let elsewhere = project.path().join("skills");
        let err = create_agent_skill(
            project.path().to_string_lossy().into_owned(),
            elsewhere.to_string_lossy().into_owned(),
            "deploy".into(),
            "body".into(),
        )
        .unwrap_err();
        assert_eq!(err, NOT_A_ROOT);
        assert!(!elsewhere.exists());
    }

    #[test]
    fn a_failed_write_leaves_no_empty_skill_folder() {
        let project = tempdir().unwrap();
        let dir = project.path().join(".claude/skills/deploy");
        // A directory where the file must land: the rename cannot replace it.
        std::fs::create_dir_all(dir.join("SKILL.md")).unwrap();

        assert!(write_skill_file(&dir, b"body").is_err());
        assert!(!dir.exists());
    }

    #[test]
    fn delete_removes_the_whole_folder_not_just_the_file() {
        let project = tempdir().unwrap();
        let dir = project.path().join(".claude/skills/deploy");
        std::fs::create_dir_all(dir.join("references")).unwrap();
        std::fs::create_dir_all(dir.join("scripts")).unwrap();
        std::fs::write(dir.join("SKILL.md"), "body").unwrap();
        std::fs::write(dir.join("references/a.md"), "a").unwrap();
        std::fs::write(dir.join("scripts/b.py"), "bb").unwrap();

        let trashed = RefCell::new(Vec::new());
        let trash = |p: &Path| -> Result<(), String> {
            trashed.borrow_mut().push(p.to_path_buf());
            Ok(())
        };
        let resolved =
            resolve_skill_dir(&dir.join("SKILL.md"), &roots_for(Some(project.path()))).unwrap();
        remove_skill_dir(&resolved, &trash).unwrap();

        // The folder, not the file: removing only SKILL.md would leave a pile of
        // files no scanner ever surfaces again.
        assert_eq!(trashed.into_inner(), vec![dir]);
    }

    #[test]
    fn a_symlinked_skill_folder_is_refused() {
        let project = tempdir().unwrap();
        let real = project.path().join("dotfiles/deploy");
        std::fs::create_dir_all(&real).unwrap();
        std::fs::write(real.join("SKILL.md"), "body").unwrap();
        let root = project.path().join(".claude/skills");
        std::fs::create_dir_all(&root).unwrap();
        std::os::unix::fs::symlink(&real, root.join("deploy")).unwrap();

        let trash = |_: &Path| -> Result<(), String> { panic!("a link must never be trashed") };
        let outcome = resolve_skill_dir(
            &root.join("deploy/SKILL.md"),
            &roots_for(Some(project.path())),
        )
        .and_then(|dir| remove_skill_dir(&dir, &trash));
        assert_eq!(outcome.unwrap_err(), IS_A_LINK);
        assert!(real.join("SKILL.md").is_file());
    }

    #[test]
    fn a_symlinked_root_is_still_usable() {
        let project = tempdir().unwrap();
        let real = project.path().join("dotfiles/skills");
        std::fs::create_dir_all(real.join("deploy")).unwrap();
        std::fs::write(real.join("deploy/SKILL.md"), "body").unwrap();
        std::fs::create_dir_all(project.path().join(".claude")).unwrap();
        let root = project.path().join(".claude/skills");
        std::os::unix::fs::symlink(&real, &root).unwrap();

        assert_eq!(
            resolve_skill_dir(
                &root.join("deploy/SKILL.md"),
                &roots_for(Some(project.path()))
            )
            .unwrap(),
            root.join("deploy")
        );
    }

    #[test]
    fn preview_counts_every_file_beside_the_skill_file() {
        let project = tempdir().unwrap();
        let dir = project.path().join(".claude/skills/deploy");
        std::fs::create_dir_all(dir.join("references")).unwrap();
        std::fs::create_dir_all(dir.join("scripts")).unwrap();
        std::fs::write(dir.join("SKILL.md"), "body").unwrap();
        std::fs::write(dir.join("references/a.md"), "a").unwrap();
        std::fs::write(dir.join("scripts/b.py"), "bb").unwrap();

        let removal = summarize(&dir);
        assert_eq!(removal.name, "deploy");
        assert_eq!(removal.files, 3);
        assert_eq!(removal.bytes, 7);
        assert_eq!(removal.extras, ["references", "scripts"]);
        assert_eq!(removal.extra_count, 2);
        assert!(!removal.truncated);

        let big = project.path().join(".claude/skills/big");
        std::fs::create_dir_all(&big).unwrap();
        for i in 0..=WALK_ENTRIES {
            std::fs::write(big.join(format!("f{i}")), "").unwrap();
        }
        assert!(summarize(&big).truncated);
    }

    /// The names are capped for the payload; the count the confirmation says
    /// "and N more" from must not be.
    #[test]
    fn extra_count_survives_the_cap_on_the_names() {
        let home = tempdir().unwrap();
        let dir = home.path().join(".claude/skills/deploy");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("SKILL.md"), "body").unwrap();
        for i in 0..(EXTRAS_CAP + 5) {
            std::fs::write(dir.join(format!("ref{i}.md")), "x").unwrap();
        }

        let removal = summarize(&dir);
        assert_eq!(removal.extras.len(), EXTRAS_CAP);
        assert_eq!(removal.extra_count as usize, EXTRAS_CAP + 5);
    }

    #[test]
    fn deleting_something_already_gone_is_not_an_error() {
        let project = tempdir().unwrap();
        let root = project.path().join(".claude/skills");
        std::fs::create_dir_all(&root).unwrap();

        let trash = |_: &Path| -> Result<(), String> { panic!("nothing is there to move") };
        let dir = resolve_skill_dir(
            &root.join("deploy/SKILL.md"),
            &roots_for(Some(project.path())),
        )
        .unwrap();
        assert!(remove_skill_dir(&dir, &trash).is_ok());

        let removal = summarize(&dir);
        assert_eq!(removal.files, 0);
        assert!(removal.extras.is_empty());
    }

    /// Machine-dependent, so it never runs in CI. Kept because "which folders
    /// does this box actually offer" is the first debugging question:
    /// `cargo test agent_caps -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn dump_skill_roots() {
        let cwd = std::env::current_dir().unwrap();
        let cwd = cwd
            .parent()
            .and_then(|p| p.parent())
            .and_then(|p| p.parent())
            .unwrap();
        for r in skill_roots(&cwd.to_string_lossy()) {
            println!(
                "{:<8} {:<8} {:<8} {}",
                r.cli,
                r.scope,
                if r.path.is_dir() { "exists" } else { "absent" },
                r.path.display()
            );
        }
    }
}
