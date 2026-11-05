use super::*;
use crate::lpm_commands::{list_stores, CommandInput, CommandRef, Scope, ScopeList};
use crate::lpm_commands_ops as ops;
use std::process::Command;

fn run_git(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .args(["-c", "user.email=t@example.com", "-c", "user.name=t"])
        .args(args)
        .current_dir(dir)
        .output()
        .unwrap();
    assert!(out.status.success(), "git {args:?}: {}", String::from_utf8_lossy(&out.stderr));
    String::from_utf8_lossy(&out.stdout).into_owned()
}

fn input(name: &str, body: &str, keep: Option<bool>) -> CommandInput {
    CommandInput {
        scope: Scope::Project,
        folder: None,
        name: name.to_string(),
        description: String::new(),
        body: body.to_string(),
        keep_out_of_git: keep,
    }
}

fn reference(name: &str) -> CommandRef {
    CommandRef { scope: Scope::Project, folder: None, name: name.to_string() }
}

fn stores_of(home: &Path, root: &Path) -> Stores {
    let global = LocalFs::new(home.join("skills"), home.join("claude"), home.join("lpm"));
    Stores { global: Box::new(global), project: Some(Box::new(project_store(root))) }
}

fn list_of(home: &Path, root: &Path) -> ScopeList {
    list_stores(&stores_of(home, root)).unwrap().project.unwrap()
}

struct Family {
    dir: tempfile::TempDir,
    original: PathBuf,
    worktree: PathBuf,
    copy: PathBuf,
}

impl Family {
    fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        let original = dir.path().join("web");
        std::fs::create_dir_all(&original).unwrap();
        run_git(&original, &["init", "-q", "-b", "main"]);
        std::fs::write(original.join("README.md"), "hi\n").unwrap();
        run_git(&original, &["add", "README.md"]);
        run_git(&original, &["commit", "-qm", "init"]);
        let worktree = dir.path().join("web-wt");
        run_git(&original, &["worktree", "add", "-q", "-b", "wt", worktree.to_str().unwrap()]);
        let copy = dir.path().join("web-copy");
        run_git(dir.path(), &["clone", "-q", original.to_str().unwrap(), copy.to_str().unwrap()]);
        Self { dir, original, worktree, copy }
    }

    fn home(&self) -> PathBuf {
        self.dir.path().join("home")
    }

    fn save(&self, root: &Path, name: &str, body: &str, keep: Option<bool>) {
        ops::save(&stores_of(&self.home(), root), input(name, body, keep), None).unwrap();
    }

    fn sync(&self) {
        for checkout in [&self.worktree, &self.copy] {
            sync_checkout(&self.original, checkout).unwrap();
        }
    }

    fn names(&self, root: &Path) -> Vec<String> {
        list_of(&self.home(), root).commands.into_iter().map(|c| c.name).collect()
    }

    fn assert_clean(&self, root: &Path) {
        assert_eq!(run_git(root, &["status", "--porcelain", "-uall"]), "", "{root:?}");
    }
}

fn read(path: PathBuf) -> String {
    std::fs::read_to_string(path).unwrap()
}

#[test]
fn a_skill_made_after_the_copy_reaches_every_checkout() {
    let family = Family::new();
    family.save(&family.original, "later", "Do it.\n", Some(true));
    family.save(&family.original, "open", "Commit me.\n", None);
    family.sync();
    for checkout in [&family.worktree, &family.copy] {
        assert_eq!(family.names(checkout), ["later", "open"], "{checkout:?}");
        for agent in [".agents/skills", ".claude/skills"] {
            assert!(checkout.join(agent).join("later/SKILL.md").is_file(), "{agent}");
            assert!(checkout.join(agent).join("open/SKILL.md").is_file(), "{agent}");
        }
    }
}

#[test]
fn links_leave_every_checkouts_git_alone_and_the_original_can_still_commit() {
    let family = Family::new();
    family.save(&family.original, "open", "Commit me.\n", None);
    family.save(&family.original, "kept", "Not me.\n", Some(true));
    family.sync();
    family.assert_clean(&family.worktree);
    family.assert_clean(&family.copy);
    let status = run_git(&family.original, &["status", "--porcelain", "-uall"]);
    assert!(status.contains(".agents/skills/open/SKILL.md"), "{status}");
    assert!(status.contains(".claude/skills/open"), "{status}");
    assert!(!status.contains("kept"), "{status}");
}

#[test]
fn an_edit_in_the_original_shows_in_every_checkout_at_once() {
    let family = Family::new();
    family.save(&family.original, "shared", "One.\n", Some(true));
    family.sync();
    let stores = stores_of(&family.home(), &family.original);
    ops::save(&stores, input("shared", "Two.\n", None), Some(reference("shared"))).unwrap();
    assert!(read(family.copy.join(".agents/skills/shared/SKILL.md")).contains("Two."));
    assert!(read(family.worktree.join(".claude/skills/shared/SKILL.md")).contains("Two."));
}

#[test]
fn writing_through_a_link_changes_the_one_file() {
    let family = Family::new();
    family.save(&family.original, "shared", "One.\n", Some(true));
    family.sync();
    let path = family.worktree.join(".agents/skills/shared/SKILL.md");
    crate::fsatomic::write(&path, b"edited", crate::fsatomic::Mode::Preserve(0o644)).unwrap();
    assert_eq!(read(family.original.join(".agents/skills/shared/SKILL.md")), "edited");
    assert!(std::fs::symlink_metadata(family.worktree.join(".agents/skills/shared")).unwrap().file_type().is_symlink());
}

#[test]
fn a_skill_deleted_in_the_original_goes_from_every_checkout() {
    let family = Family::new();
    family.save(&family.original, "gone", "Bye.\n", Some(true));
    family.save(&family.original, "stays", "Hi.\n", Some(true));
    family.sync();
    ops::delete(&stores_of(&family.home(), &family.original), &reference("gone")).unwrap();
    family.sync();
    for checkout in [&family.worktree, &family.copy] {
        assert_eq!(family.names(checkout), ["stays"]);
        assert!(std::fs::symlink_metadata(checkout.join(".agents/skills/gone")).is_err());
        assert!(std::fs::symlink_metadata(checkout.join(".claude/skills/gone")).is_err());
        assert_eq!(shared_names(checkout).into_iter().collect::<Vec<_>>(), ["stays"]);
    }
}

#[test]
fn a_renamed_skill_is_renamed_in_every_checkout() {
    let family = Family::new();
    family.save(&family.original, "old", "Same.\n", Some(true));
    family.sync();
    let stores = stores_of(&family.home(), &family.original);
    ops::save(&stores, input("new", "Same.\n", None), Some(reference("old"))).unwrap();
    family.sync();
    for checkout in [&family.worktree, &family.copy] {
        assert_eq!(family.names(checkout), ["new"]);
        assert!(std::fs::symlink_metadata(checkout.join(".claude/skills/old")).is_err());
        family.assert_clean(checkout);
    }
}

#[test]
fn the_last_shared_skill_leaving_takes_the_rules_file_with_it() {
    let family = Family::new();
    family.save(&family.original, "only", "Hi.\n", Some(true));
    family.sync();
    assert!(family.copy.join(".agents/skills/.gitignore").is_file());
    ops::delete(&stores_of(&family.home(), &family.original), &reference("only")).unwrap();
    family.sync();
    assert!(!family.copy.join(".agents/skills/.gitignore").exists());
    assert!(!family.copy.join(".claude/skills/.gitignore").exists());
}

#[test]
fn a_commit_reaching_a_checkout_replaces_the_link_with_gits_copy() {
    let family = Family::new();
    family.save(&family.original, "open", "Commit me.\n", None);
    family.sync();
    run_git(&family.original, &["add", "-A"]);
    run_git(&family.original, &["-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-qm", "skill"]);

    run_git(&family.worktree, &["merge", "-q", "main"]);
    run_git(&family.copy, &["pull", "-q", "origin", "main"]);
    family.sync();

    for checkout in [&family.worktree, &family.copy] {
        let place = checkout.join(".agents/skills/open");
        assert!(!std::fs::symlink_metadata(&place).unwrap().file_type().is_symlink(), "{checkout:?}");
        assert!(place.join("SKILL.md").is_file());
        assert!(shared_names(checkout).is_empty());
        assert_eq!(family.names(checkout), ["open"]);
        family.assert_clean(checkout);
    }
}

#[test]
fn a_skill_git_holds_on_the_checkouts_branch_stays_that_branchs() {
    let family = Family::new();
    family.save(&family.worktree, "branch", "Mine.\n", None);
    run_git(&family.worktree, &["add", "-A"]);
    family.save(&family.original, "branch", "Theirs.\n", None);
    family.sync();
    assert!(read(family.worktree.join(".agents/skills/branch/SKILL.md")).contains("Mine."));
    assert!(read(family.original.join(".agents/skills/branch/SKILL.md")).contains("Theirs."));
    assert!(shared_names(&family.worktree).is_empty());
}

#[test]
fn a_skill_only_a_checkout_has_moves_to_the_original_and_outlives_it() {
    let family = Family::new();
    family.save(&family.worktree, "mine", "Made here.\n", None);
    std::fs::write(family.worktree.join(".agents/skills/mine/notes.txt"), "beside it\n").unwrap();
    family.sync();
    assert!(read(family.original.join(".agents/skills/mine/SKILL.md")).contains("Made here."));
    assert_eq!(family.names(&family.copy), ["mine"]);
    family.assert_clean(&family.worktree);

    run_git(&family.original, &["worktree", "remove", "--force", family.worktree.to_str().unwrap()]);
    assert!(family.original.join(".agents/skills/mine/notes.txt").is_file());
    assert!(family.original.join(".claude/skills/mine/SKILL.md").is_file());
}

#[test]
fn a_folder_in_the_way_in_the_original_costs_the_checkout_nothing() {
    let family = Family::new();
    family.save(&family.worktree, "mine", "Only copy.\n", None);
    std::fs::create_dir_all(family.original.join(".agents/skills/mine")).unwrap();
    std::fs::write(family.original.join(".agents/skills/mine/draft.txt"), "not a skill\n").unwrap();
    sync_checkout(&family.original, &family.worktree).unwrap();
    assert!(read(family.worktree.join(".agents/skills/mine/SKILL.md")).contains("Only copy."));
    assert_eq!(read(family.original.join(".agents/skills/mine/draft.txt")), "not a skill\n");
}

#[test]
fn a_skill_kept_out_in_a_copy_stays_out_in_the_original() {
    let family = Family::new();
    family.save(&family.copy, "secret", "Quiet.\n", Some(true));
    family.sync();
    family.assert_clean(&family.original);
    assert!(list_of(&family.home(), &family.original).commands[0].kept_out_of_git);
}

#[test]
fn an_identical_copy_becomes_a_link_and_one_that_differs_is_left_alone() {
    let family = Family::new();
    family.save(&family.original, "same", "Same.\n", Some(true));
    family.save(&family.original, "edited", "Original.\n", Some(true));
    family.save(&family.copy, "same", "Same.\n", Some(true));
    family.save(&family.copy, "edited", "My version.\n", Some(true));
    family.sync();

    let same = family.copy.join(".agents/skills/same");
    assert!(std::fs::symlink_metadata(same).unwrap().file_type().is_symlink());
    let edited = family.copy.join(".agents/skills/edited");
    assert!(!std::fs::symlink_metadata(&edited).unwrap().file_type().is_symlink());
    assert!(read(edited.join("SKILL.md")).contains("My version."));
    assert!(read(family.original.join(".agents/skills/edited/SKILL.md")).contains("Original."));
}

#[test]
fn a_skill_lpm_did_not_make_under_that_name_is_never_replaced() {
    let family = Family::new();
    family.save(&family.original, "taken", "Mine.\n", Some(true));
    let theirs = family.copy.join(".agents/skills/taken");
    std::fs::create_dir_all(&theirs).unwrap();
    std::fs::write(theirs.join("SKILL.md"), "---\nname: taken\ndescription: Theirs\n---\n\nTheirs.\n").unwrap();
    family.sync();
    assert!(read(theirs.join("SKILL.md")).contains("Theirs."));
    assert!(!shared_names(&family.copy).contains("taken"));
}

#[test]
fn removing_a_checkout_leaves_the_originals_skill() {
    let family = Family::new();
    family.save(&family.original, "kept", "Hi.\n", Some(true));
    family.sync();
    run_git(&family.original, &["worktree", "remove", "--force", family.worktree.to_str().unwrap()]);
    std::fs::remove_dir_all(&family.copy).unwrap();
    assert!(read(family.original.join(".agents/skills/kept/SKILL.md")).contains("Hi."));
}

#[test]
fn a_link_broken_by_the_original_moving_is_pointed_at_it_again() {
    let family = Family::new();
    family.save(&family.original, "kept", "Hi.\n", Some(true));
    family.sync();
    let moved = family.dir.path().join("web-moved");
    std::fs::rename(&family.original, &moved).unwrap();
    sync_checkout(&moved, &family.copy).unwrap();
    assert!(read(family.copy.join(".agents/skills/kept/SKILL.md")).contains("Hi."));
}

#[test]
fn a_claude_folder_that_links_to_the_shared_one_keeps_the_link_whole() {
    let family = Family::new();
    family.save(&family.original, "kept", "Hi.\n", Some(true));
    std::fs::create_dir_all(family.copy.join(".agents/skills")).unwrap();
    std::fs::create_dir_all(family.copy.join(".claude")).unwrap();
    link_dir(Path::new("../.agents/skills"), &family.copy.join(".claude/skills")).unwrap();
    sync_checkout(&family.original, &family.copy).unwrap();
    sync_checkout(&family.original, &family.copy).unwrap();
    assert!(read(family.copy.join(".agents/skills/kept/SKILL.md")).contains("Hi."));
    assert!(read(family.copy.join(".claude/skills/kept/SKILL.md")).contains("Hi."));
}

#[test]
fn saving_never_empties_a_skill_behind_a_claude_folder_link() {
    let family = Family::new();
    std::fs::create_dir_all(family.original.join(".agents/skills")).unwrap();
    std::fs::create_dir_all(family.original.join(".claude")).unwrap();
    link_dir(Path::new("../.agents/skills"), &family.original.join(".claude/skills")).unwrap();
    family.save(&family.original, "mine", "Keep me.\n", None);
    assert!(read(family.original.join(".agents/skills/mine/SKILL.md")).contains("Keep me."));
}

#[test]
fn rules_someone_wrote_above_ours_stay() {
    let names: BTreeSet<String> = ["one".to_string()].into();
    let text = with_rules("*.log\n", &names);
    assert_eq!(rules_in(&text), names);
    assert_eq!(with_rules(&text, &BTreeSet::new()), "*.log\n");
    assert!(rules_in("/looks-like-ours\n").is_empty());
}
