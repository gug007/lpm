use super::*;
use crate::lpm_commands::{list_stores, project_store, CommandInput, CommandRef, LocalFs, ScopeList, Scope, Stores};
use crate::lpm_commands_ops as ops;
use std::path::{Path, PathBuf};
use std::process::Command;

const MARKED: &str = "---\nname: mine\ndescription: Mine\nmetadata:\n  lpm-created: \"true\"\n---\n\nDo it.\n";

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

struct Repo {
    _dir: tempfile::TempDir,
    top: PathBuf,
    root: PathBuf,
    stores: Stores,
}

impl Repo {
    fn at(subfolder: &str) -> Self {
        let dir = tempfile::tempdir().unwrap();
        let top = dir.path().join("repo");
        std::fs::create_dir_all(&top).unwrap();
        run_git(&top, &["init", "-q"]);
        let root = top.join(subfolder);
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(top.join("README.md"), "hi\n").unwrap();
        run_git(&top, &["add", "README.md"]);
        run_git(&top, &["commit", "-qm", "init"]);
        let stores = stores_at(&dir.path().join("home"), &root);
        Self { _dir: dir, top, root, stores }
    }

    fn new() -> Self {
        Self::at("")
    }

    fn save(&self, name: &str, keep: Option<bool>) {
        ops::save(&self.stores, input(name, keep), None).unwrap();
    }

    fn edit(&self, from: &str, name: &str, keep: Option<bool>) -> Result<(), String> {
        ops::save(&self.stores, input(name, keep), Some(reference(Scope::Project, from)))
    }

    fn list(&self) -> ScopeList {
        list_stores(&self.stores).unwrap().project.unwrap()
    }

    fn skill(&self, name: &str) -> crate::lpm_commands::LpmCommand {
        self.list().commands.into_iter().find(|c| c.name == name).unwrap()
    }

    fn status(&self) -> String {
        run_git(&self.top, &["status", "--porcelain", "-uall"])
    }

    fn exclude(&self) -> String {
        std::fs::read_to_string(self.top.join(".git/info/exclude")).unwrap_or_default()
    }

    /// A skill kept in Claude's folder and committed, the way a repo's own skills are.
    fn committed_claude_skill(&self, name: &str) {
        let dir = self.root.join(".claude/skills").join(name);
        std::fs::create_dir_all(dir.join("scripts")).unwrap();
        std::fs::write(dir.join("SKILL.md"), MARKED.replace("mine", name)).unwrap();
        std::fs::write(dir.join("scripts/run.sh"), "echo hi\n").unwrap();
        self.edit(name, name, None).unwrap();
        run_git(&self.top, &["add", "-A"]);
        run_git(&self.top, &["commit", "-qm", "add skill"]);
    }
}

fn stores_at(home: &Path, root: &Path) -> Stores {
    Stores {
        global: Box::new(LocalFs::new(
            home.join(".agents/skills"),
            home.join(".claude/skills"),
            home.join(".lpm"),
        )),
        project: Some(Box::new(project_store(root))),
    }
}

fn input(name: &str, keep: Option<bool>) -> CommandInput {
    CommandInput {
        scope: Scope::Project,
        folder: None,
        name: name.to_string(),
        description: String::new(),
        body: "Do it.".to_string(),
        keep_out_of_git: keep,
    }
}

fn reference(scope: Scope, name: &str) -> CommandRef {
    CommandRef { scope, folder: None, name: name.to_string() }
}

#[test]
fn a_new_skill_kept_out_never_shows_in_git_and_agents_still_have_it() {
    let repo = Repo::new();
    repo.save("mine", Some(true));
    assert_eq!(repo.status(), "");
    assert!(repo.skill("mine").kept_out_of_git);
    assert!(!repo.skill("mine").tracked);
    assert!(repo.root.join(".agents/skills/mine/SKILL.md").is_file());
    assert!(repo.root.join(".claude/skills/mine/SKILL.md").is_file());
    assert_eq!(repo.exclude().lines().filter(|l| l.contains("mine")).count(), 2);
}

#[test]
fn an_ordinary_skill_is_left_for_git_and_its_neighbour_is_not_touched() {
    let repo = Repo::new();
    repo.save("shared", None);
    repo.save("mine", Some(true));
    let status = repo.status();
    assert!(status.contains(".agents/skills/shared/SKILL.md"), "{status}");
    assert!(status.contains(".claude/skills/shared"), "{status}");
    assert!(!status.contains("mine"), "{status}");
    assert!(!repo.skill("shared").kept_out_of_git);
    assert!(repo.list().in_repo);
}

#[test]
fn a_committed_skill_has_its_removal_staged_and_stays_on_disk() {
    let repo = Repo::new();
    repo.committed_claude_skill("mine");
    assert!(repo.skill("mine").tracked);
    repo.edit("mine", "mine", Some(true)).unwrap();

    let status = repo.status();
    assert!(status.contains("D  .claude/skills/mine/SKILL.md"), "{status}");
    assert!(status.contains("D  .claude/skills/mine/scripts/run.sh"), "{status}");
    assert!(repo.root.join(".claude/skills/mine/scripts/run.sh").is_file());
    let skill = repo.skill("mine");
    assert!(skill.kept_out_of_git && !skill.tracked);
    assert_eq!(run_git(&repo.top, &["log", "-1", "--format=%s"]).trim(), "add skill", "lpm doesn't commit");
}

#[test]
fn a_committed_skill_waits_for_a_commit_until_its_removal_is_committed() {
    let repo = Repo::new();
    repo.committed_claude_skill("mine");
    assert!(!repo.skill("mine").awaiting_commit, "still in git, nothing to finish");
    repo.edit("mine", "mine", Some(true)).unwrap();
    assert!(repo.skill("mine").awaiting_commit, "the last commit still holds it");
    run_git(&repo.top, &["commit", "-qm", "stop tracking"]);
    assert!(!repo.skill("mine").awaiting_commit, "the commit finished it");
    assert!(repo.skill("mine").kept_out_of_git);
}

#[test]
fn turning_it_off_ends_the_wait() {
    let repo = Repo::new();
    repo.committed_claude_skill("mine");
    repo.edit("mine", "mine", Some(true)).unwrap();
    repo.edit("mine", "mine", Some(false)).unwrap();
    assert!(!repo.skill("mine").awaiting_commit);
}

#[test]
fn a_skill_git_never_held_has_nothing_to_wait_for() {
    let repo = Repo::new();
    repo.save("mine", Some(true));
    assert!(repo.skill("mine").kept_out_of_git);
    assert!(!repo.skill("mine").awaiting_commit);
}

#[test]
fn a_repo_without_a_commit_has_nothing_to_wait_for() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("repo");
    std::fs::create_dir_all(&root).unwrap();
    run_git(&root, &["init", "-q"]);
    let stores = stores_at(&dir.path().join("home"), &root);
    ops::save(&stores, input("mine", Some(true)), None).unwrap();
    let list = list_stores(&stores).unwrap().project.unwrap();
    assert!(list.commands[0].kept_out_of_git);
    assert!(!list.commands[0].awaiting_commit);
}

#[test]
fn a_project_in_a_subfolder_waits_too() {
    let repo = Repo::at("apps/web");
    repo.committed_claude_skill("mine");
    repo.edit("mine", "mine", Some(true)).unwrap();
    assert!(repo.skill("mine").awaiting_commit);
}

#[test]
fn turning_it_off_before_committing_puts_git_back_as_it_was() {
    let repo = Repo::new();
    repo.committed_claude_skill("mine");
    repo.edit("mine", "mine", Some(true)).unwrap();
    repo.edit("mine", "mine", Some(false)).unwrap();
    assert_eq!(repo.status(), "");
    assert!(repo.skill("mine").tracked);
    assert_eq!(repo.exclude().lines().filter(|l| l.contains("mine")).count(), 0);
}

#[test]
fn turning_it_off_after_committing_leaves_a_new_file_for_git_to_see() {
    let repo = Repo::new();
    repo.committed_claude_skill("mine");
    repo.edit("mine", "mine", Some(true)).unwrap();
    run_git(&repo.top, &["commit", "-qm", "stop tracking"]);
    assert_eq!(repo.status(), "");
    repo.edit("mine", "mine", Some(false)).unwrap();
    assert!(repo.status().contains("?? .claude/skills/mine/SKILL.md"), "{}", repo.status());
    assert!(!repo.skill("mine").kept_out_of_git);
}

#[test]
fn changing_only_the_prompt_leaves_it_kept_out() {
    let repo = Repo::new();
    repo.save("mine", Some(true));
    repo.edit("mine", "mine", None).unwrap();
    assert!(repo.skill("mine").kept_out_of_git);
    repo.edit("mine", "mine", Some(true)).unwrap();
    assert_eq!(repo.exclude().lines().filter(|l| l.contains("mine")).count(), 2);
    assert_eq!(repo.status(), "");
}

#[test]
fn a_rename_stays_out_and_leaves_no_rule_behind() {
    let repo = Repo::new();
    repo.save("mine", Some(true));
    repo.edit("mine", "renamed", None).unwrap();
    assert_eq!(repo.status(), "");
    assert!(repo.skill("renamed").kept_out_of_git);
    assert!(!repo.exclude().contains("mine"), "{}", repo.exclude());
}

#[test]
fn a_rename_can_let_it_in_at_the_same_time() {
    let repo = Repo::new();
    repo.save("mine", Some(true));
    repo.edit("mine", "renamed", Some(false)).unwrap();
    assert!(repo.status().contains(".agents/skills/renamed/SKILL.md"));
    assert!(!repo.exclude().contains("skills/"), "{}", repo.exclude());
}

#[test]
fn deleting_a_skill_removes_its_rules() {
    let repo = Repo::new();
    repo.save("mine", Some(true));
    ops::delete(&repo.stores, &reference(Scope::Project, "mine")).unwrap();
    assert!(!repo.exclude().contains("mine"));
}

#[test]
fn files_left_behind_by_a_delete_stay_out_of_git() {
    let repo = Repo::new();
    repo.save("mine", Some(true));
    std::fs::write(repo.root.join(".agents/skills/mine/notes.txt"), "private\n").unwrap();
    ops::delete(&repo.stores, &reference(Scope::Project, "mine")).unwrap();
    assert!(repo.root.join(".agents/skills/mine/notes.txt").is_file());
    assert_eq!(repo.status(), "");
}

#[test]
fn moving_to_the_global_list_takes_its_rules_away() {
    let repo = Repo::new();
    repo.save("mine", Some(true));
    let global = CommandInput { scope: Scope::Global, ..input("mine", Some(true)) };
    ops::save(&repo.stores, global, Some(reference(Scope::Project, "mine"))).unwrap();
    assert!(!repo.exclude().contains("mine"));
    assert_eq!(repo.status(), "");
    assert!(!list_stores(&repo.stores).unwrap().global.commands[0].kept_out_of_git);
}

#[test]
fn a_project_in_a_subfolder_gets_rules_from_the_top_of_the_repo() {
    let repo = Repo::at("apps/web");
    repo.save("mine", Some(true));
    assert!(repo.exclude().contains("/apps/web/.agents/skills/mine"), "{}", repo.exclude());
    assert_eq!(repo.status(), "");
    assert!(repo.skill("mine").kept_out_of_git);
}

#[test]
fn glob_characters_in_a_folder_name_are_taken_literally() {
    let repo = Repo::at("apps/[web]");
    repo.save("mine", Some(true));
    assert_eq!(repo.status(), "");
    assert!(repo.skill("mine").kept_out_of_git);
}

#[test]
fn a_linked_worktree_uses_the_repos_shared_rules() {
    let repo = Repo::new();
    let linked = repo.top.parent().unwrap().join("linked");
    run_git(&repo.top, &["worktree", "add", "-q", "-b", "wt", linked.to_str().unwrap()]);
    let stores = stores_at(&repo.top.parent().unwrap().join("home"), &linked);
    ops::save(&stores, input("mine", Some(true)), None).unwrap();
    assert_eq!(run_git(&linked, &["status", "--porcelain", "-uall"]), "");
    assert!(repo.exclude().contains("/.agents/skills/mine"), "{}", repo.exclude());
}

#[test]
fn another_ignore_rule_is_named_instead_of_flipping_silently() {
    let repo = Repo::new();
    repo.save("mine", Some(true));
    std::fs::write(repo.top.join(".gitignore"), ".agents/\n.claude/\n").unwrap();
    let error = repo.edit("mine", "mine", Some(false)).unwrap_err();
    assert!(error.contains("Another ignore rule"), "{error}");
}

#[test]
fn rules_the_user_wrote_stay_and_one_written_by_hand_can_be_turned_off() {
    let repo = Repo::new();
    std::fs::write(repo.top.join(".git/info/exclude"), "# mine\n*.log\n.claude/skills/mine\n.agents/skills/mine/").unwrap();
    repo.save("mine", None);
    assert!(repo.skill("mine").kept_out_of_git);
    repo.edit("mine", "mine", Some(false)).unwrap();
    assert_eq!(repo.exclude(), "# mine\n*.log\n");
}

#[test]
fn a_skill_with_staged_changes_of_its_own_is_refused_and_nothing_changes() {
    let repo = Repo::new();
    repo.committed_claude_skill("mine");
    let file = repo.root.join(".claude/skills/mine/scripts/run.sh");
    std::fs::write(&file, "echo staged\n").unwrap();
    run_git(&repo.top, &["add", "-A"]);
    std::fs::write(&file, "echo newer\n").unwrap();
    let error = repo.edit("mine", "mine", Some(true)).unwrap_err();
    assert!(error.contains("staged changes"), "{error}");
    assert!(!repo.exclude().contains("mine"));
    assert_eq!(std::fs::read_to_string(&file).unwrap(), "echo newer\n");
}

#[test]
fn outside_a_repo_the_list_says_so_and_a_request_is_refused() {
    let dir = tempfile::tempdir().unwrap();
    let stores = stores_at(&dir.path().join("home"), &dir.path().join("project"));
    std::fs::create_dir_all(dir.path().join("project")).unwrap();
    assert!(!list_stores(&stores).unwrap().project.unwrap().in_repo);
    let error = ops::save(&stores, input("mine", Some(true)), None).unwrap_err();
    assert_eq!(error, "This project isn't in a Git repository.");
}

#[test]
fn the_global_list_ignores_the_switch() {
    let repo = Repo::new();
    let global = CommandInput { scope: Scope::Global, ..input("mine", Some(true)) };
    ops::save(&repo.stores, global, None).unwrap();
    assert!(!repo.exclude().contains("mine"));
    assert!(!list_stores(&repo.stores).unwrap().global.in_repo);
}

#[test]
fn a_rule_ending_in_a_slash_is_not_what_we_write() {
    let rules = rules("", "mine");
    assert_eq!(rules, ["/.agents/skills/mine", "/.claude/skills/mine"]);
}

#[test]
fn view_needs_every_place_out_and_nothing_tracked() {
    let view = GitView {
        ignored: [".agents/skills/a".to_string()].into(),
        tracked: vec![".claude/skills/b/SKILL.md".to_string()],
        ..GitView::default()
    };
    let a = [".agents/skills/a".to_string(), ".claude/skills/a".to_string()];
    assert_eq!(view.skill(&a), SkillGit::default());
    assert_eq!(view.skill(&a[..1]), SkillGit { kept_out: true, ..SkillGit::default() });
    let b = [".claude/skills/b".to_string()];
    assert_eq!(view.skill(&b), SkillGit { tracked: true, ..SkillGit::default() });
    assert_eq!(view.skill(&[".claude/skills/bb".to_string()]).tracked, false);
    assert_eq!(view.skill(&[]), SkillGit::default());
}

#[test]
fn only_a_kept_out_skill_the_last_commit_holds_is_waiting() {
    let place = ".claude/skills/a".to_string();
    let file = format!("{place}/SKILL.md");
    let waiting = GitView { ignored: [place.clone()].into(), tracked: vec![], committed: vec![file.clone()] };
    let done = GitView { ignored: [place.clone()].into(), ..GitView::default() };
    let in_git = GitView { tracked: vec![file.clone()], committed: vec![file], ..GitView::default() };
    let places = [place];
    assert_eq!(waiting.skill(&places), SkillGit { kept_out: true, tracked: false, awaiting_commit: true });
    assert!(!done.skill(&places).awaiting_commit);
    assert!(!in_git.skill(&places).awaiting_commit);
}

#[test]
fn the_wire_names_are_the_ones_every_client_reads() {
    let input: CommandInput = serde_json::from_value(serde_json::json!({
        "scope": "project", "folder": null, "name": "mine", "body": "x", "keepOutOfGit": true,
    }))
    .unwrap();
    assert_eq!(input.keep_out_of_git, Some(true));
    let older: CommandInput =
        serde_json::from_value(serde_json::json!({ "scope": "project", "name": "mine", "body": "x" })).unwrap();
    assert_eq!(older.keep_out_of_git, None);

    let repo = Repo::new();
    repo.save("mine", Some(true));
    let list = serde_json::to_value(repo.list()).unwrap();
    assert_eq!(list["inRepo"], true);
    assert_eq!(list["commands"][0]["keptOutOfGit"], true);
    assert_eq!(list["commands"][0]["tracked"], false);
    assert_eq!(list["commands"][0]["awaitingCommit"], false);
}
