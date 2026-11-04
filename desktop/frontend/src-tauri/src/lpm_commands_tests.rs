use super::*;
use crate::lpm_commands_ops as ops;
use std::path::PathBuf;

struct Place {
    _dir: tempfile::TempDir,
    skills: PathBuf,
    claude: PathBuf,
    lpm: PathBuf,
}

impl Place {
    fn store(&self) -> Box<dyn CommandFs> {
        Box::new(LocalFs::new(self.skills.clone(), self.claude.clone(), self.lpm.clone()))
    }

    fn skill(&self, name: &str) -> String {
        std::fs::read_to_string(self.skills.join(name).join("SKILL.md")).unwrap()
    }
}

fn place() -> Place {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_path_buf();
    Place {
        skills: root.join(".agents").join("skills"),
        claude: root.join(".claude").join("skills"),
        lpm: root.join(".lpm"),
        _dir: dir,
    }
}

struct Lists {
    global: Place,
    project: Place,
    stores: Stores,
}

fn lists() -> Lists {
    let global = place();
    let project = place();
    let stores = Stores { global: global.store(), project: Some(project.store()) };
    Lists { global, project, stores }
}

fn input(scope: Scope, folder: Option<&str>, name: &str, body: &str) -> CommandInput {
    CommandInput {
        scope,
        folder: folder.map(str::to_string),
        name: name.to_string(),
        description: String::new(),
        body: body.to_string(),
    }
}

fn reference(scope: Scope, folder: Option<&str>, name: &str) -> CommandRef {
    CommandRef { scope, folder: folder.map(str::to_string), name: name.to_string() }
}

fn names(list: &ScopeList) -> Vec<(Option<String>, String)> {
    list.commands.iter().map(|c| (c.folder.clone(), c.name.clone())).collect()
}

fn foreign(place: &Place, name: &str) {
    let dir = place.skills.join(name);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("SKILL.md"), format!("---\nname: {name}\ndescription: Theirs\n---\n\nTheirs.\n")).unwrap();
}

#[test]
fn an_empty_place_lists_nothing() {
    let l = lists();
    let out = list_stores(&l.stores).unwrap();
    assert!(out.global.commands.is_empty() && out.global.folders.is_empty());
    assert!(out.project.unwrap().commands.is_empty());
}

#[test]
fn saving_writes_a_marked_skill_every_agent_can_read() {
    let l = lists();
    let mut cmd = input(Scope::Project, Some("Bugs"), "fix-ticket", "Fix {{ticket}}.");
    cmd.description = "Fix a ticket".into();
    ops::save(&l.stores, cmd, None).unwrap();
    assert_eq!(
        l.project.skill("fix-ticket"),
        "---\nname: fix-ticket\ndescription: Fix a ticket\ndisable-model-invocation: true\nmetadata:\n  lpm-created: \"true\"\n  lpm-folder: \"Bugs\"\n---\n\nFix {{ticket}}.\n"
    );
    let policy = l.project.skills.join("fix-ticket/agents/openai.yaml");
    assert_eq!(std::fs::read_to_string(policy).unwrap(), crate::agent_caps::CODEX_OPT_OUT);
    let out = list_stores(&l.stores).unwrap().project.unwrap();
    assert_eq!(out.folders, ["Bugs"]);
    assert_eq!(out.commands[0].argument_hint, "<ticket>");
    assert_eq!(out.commands[0].description, "Fix a ticket");
}

#[cfg(unix)]
#[test]
fn claude_reaches_a_project_skill_through_a_relative_link() {
    let l = lists();
    ops::save(&l.stores, input(Scope::Project, None, "ship", "Ship it."), None).unwrap();
    let link = l.project.claude.join("ship");
    assert_eq!(std::fs::read_link(&link).unwrap(), Path::new("../../.agents/skills/ship"));
    assert!(std::fs::read_to_string(link.join("SKILL.md")).unwrap().contains("Ship it."));
}

#[cfg(unix)]
#[test]
fn a_claude_folder_elsewhere_gets_an_absolute_link() {
    let home = place();
    let other = tempfile::tempdir().unwrap();
    let claude = other.path().join("account").join("skills");
    let stores = Stores {
        global: Box::new(LocalFs::new(home.skills.clone(), claude.clone(), home.lpm.clone())),
        project: None,
    };
    ops::save(&stores, input(Scope::Global, None, "ship", "Ship it."), None).unwrap();
    assert_eq!(std::fs::read_link(claude.join("ship")).unwrap(), home.skills.join("ship"));
}

#[test]
fn skills_lpm_did_not_create_stay_out_of_the_list_and_are_never_overwritten() {
    let l = lists();
    foreign(&l.global, "lint");
    assert!(list_stores(&l.stores).unwrap().global.commands.is_empty());
    let err = ops::save(&l.stores, input(Scope::Global, None, "lint", "Mine."), None).unwrap_err();
    assert!(err.contains("not created in lpm"), "{err}");
    assert!(l.global.skill("lint").contains("Theirs."));
    ops::delete(&l.stores, &reference(Scope::Global, None, "lint")).unwrap();
    assert!(l.global.skill("lint").contains("Theirs."));
}

#[test]
fn a_name_only_claude_has_is_taken_too() {
    let l = lists();
    let dir = l.global.claude.join("deploy");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("SKILL.md"), "---\nname: deploy\ndescription: Theirs\n---\n\nTheirs.\n").unwrap();
    assert!(ops::save(&l.stores, input(Scope::Global, None, "deploy", "Mine."), None).is_err());
    assert!(std::fs::read_to_string(dir.join("SKILL.md")).unwrap().contains("Theirs."));
}

#[cfg(unix)]
#[test]
fn a_link_to_somewhere_else_is_left_alone() {
    let l = lists();
    ops::save(&l.stores, input(Scope::Global, Some("Git"), "ship", "a"), None).unwrap();
    let link = l.global.claude.join("ship");
    std::fs::remove_file(&link).unwrap();
    std::os::unix::fs::symlink("/somewhere/dotfiles/ship", &link).unwrap();
    assert!(ops::save(&l.stores, input(Scope::Global, None, "ship", "b"), Some(reference(Scope::Global, Some("Git"), "ship"))).is_err());
    ops::rename_folder(&l.stores, Scope::Global, "Git", "Release").unwrap();
    ops::delete(&l.stores, &reference(Scope::Global, Some("Release"), "ship")).unwrap();
    assert_eq!(std::fs::read_link(&link).unwrap(), Path::new("/somewhere/dotfiles/ship"));
}

#[test]
fn a_prompt_too_long_to_read_back_is_refused() {
    let l = lists();
    let cmd = input(Scope::Global, None, "huge", &"x".repeat(MAX_FILE_BYTES));
    assert!(ops::save(&l.stores, cmd, None).unwrap_err().contains("too long"));
    assert!(!l.global.skills.join("huge").exists());
}

#[test]
fn the_frontmatter_an_edit_keeps_counts_toward_the_limit() {
    let l = lists();
    ops::save(&l.stores, input(Scope::Global, None, "big", "Short."), None).unwrap();
    let padding = "x".repeat(MAX_FILE_BYTES - 256);
    let path = l.global.skills.join("big/SKILL.md");
    let text = std::fs::read_to_string(&path).unwrap().replacen("metadata:", &format!("model: {padding}\nmetadata:"), 1);
    std::fs::write(&path, text).unwrap();
    let edit = input(Scope::Global, None, "moved", &"y".repeat(512));
    let err = ops::save(&l.stores, edit, Some(reference(Scope::Global, None, "big"))).unwrap_err();
    assert!(err.contains("too long"));
    assert!(path.exists(), "a refused edit moves nothing");
}

#[test]
fn a_skill_without_a_description_reads_back_without_one() {
    let l = lists();
    ops::save(&l.stores, input(Scope::Global, None, "explain", "Explain it."), None).unwrap();
    assert!(l.global.skill("explain").contains("description: explain\n"), "the standard requires one");
    assert_eq!(list_stores(&l.stores).unwrap().global.commands[0].description, "");
}

#[test]
fn a_description_past_the_standard_limit_is_refused() {
    let l = lists();
    let mut cmd = input(Scope::Global, None, "long", "a");
    cmd.description = "x".repeat(1025);
    assert!(ops::save(&l.stores, cmd, None).is_err());
}

#[test]
fn names_are_unique_within_a_list_whatever_the_folder() {
    let l = lists();
    ops::save(&l.stores, input(Scope::Global, Some("Git"), "commit", "a"), None).unwrap();
    let err = ops::save(&l.stores, input(Scope::Global, None, "commit", "b"), None).unwrap_err();
    assert!(err.contains("already exists in the Git folder"), "{err}");
    ops::save(&l.stores, input(Scope::Project, None, "commit", "c"), None).unwrap();
}

#[test]
fn editing_renames_the_skill_and_its_link_and_keeps_files_beside_it() {
    let l = lists();
    ops::save(&l.stores, input(Scope::Global, None, "old", "a"), None).unwrap();
    std::fs::create_dir_all(l.global.skills.join("old/scripts")).unwrap();
    std::fs::write(l.global.skills.join("old/scripts/run.sh"), "x").unwrap();
    ops::save(
        &l.stores,
        input(Scope::Global, Some("Git"), "new", "b"),
        Some(reference(Scope::Global, None, "old")),
    )
    .unwrap();
    assert!(!l.global.skills.join("old").exists());
    assert!(!l.global.claude.join("old").exists());
    assert!(l.global.skills.join("new/scripts/run.sh").exists());
    assert!(l.global.skills.join("new/agents/openai.yaml").exists());
    let text = l.global.skill("new");
    assert!(text.contains("name: new\n") && text.contains("lpm-folder: \"Git\"") && text.ends_with("\nb\n"), "{text}");
    #[cfg(unix)]
    assert!(l.global.claude.join("new/SKILL.md").exists());
}

#[test]
fn moving_a_skill_between_folders_only_changes_its_label() {
    let l = lists();
    ops::save(&l.stores, input(Scope::Global, Some("Git"), "ship", "a"), None).unwrap();
    ops::save(&l.stores, input(Scope::Global, None, "ship", "a"), Some(reference(Scope::Global, Some("Git"), "ship")))
        .unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert_eq!(names(&out), [(None, "ship".to_string())]);
    assert_eq!(out.folders, ["Git"], "the emptied folder stays");
}

#[test]
fn moving_between_lists_leaves_no_copy_behind() {
    let l = lists();
    ops::save(&l.stores, input(Scope::Global, Some("Git"), "ship", "a"), None).unwrap();
    ops::save(
        &l.stores,
        input(Scope::Project, Some("Release"), "ship", "a"),
        Some(reference(Scope::Global, Some("Git"), "ship")),
    )
    .unwrap();
    assert!(!l.global.skills.join("ship").exists());
    assert!(!l.global.claude.join("ship").exists());
    assert!(l.project.skill("ship").contains("lpm-folder: \"Release\""));
    assert_eq!(list_stores(&l.stores).unwrap().global.folders, ["Git"]);
}

#[test]
fn edits_keep_frontmatter_lpm_does_not_manage() {
    let l = lists();
    ops::save(&l.stores, input(Scope::Global, None, "pr", "Write a PR."), None).unwrap();
    let path = l.global.skills.join("pr/SKILL.md");
    let text = std::fs::read_to_string(&path).unwrap();
    let text = text
        .replace("disable-model-invocation: true", "disable-model-invocation: false\nallowed-tools: Bash(git:*)")
        .replace("metadata:\n", "metadata:\n  author: me\n");
    std::fs::write(&path, text).unwrap();
    let mut cmd = input(Scope::Global, None, "pr", "Write a PR description.");
    cmd.description = "New: better".into();
    ops::save(&l.stores, cmd, Some(reference(Scope::Global, None, "pr"))).unwrap();
    let text = l.global.skill("pr");
    assert_eq!(
        text,
        "---\nname: pr\ndescription: \"New: better\"\ndisable-model-invocation: false\nallowed-tools: Bash(git:*)\nmetadata:\n  author: \"me\"\n  lpm-created: \"true\"\n---\n\nWrite a PR description.\n"
    );
    assert_eq!(parse_doc(&text).description, "New: better");
}

#[test]
fn a_bad_name_or_an_empty_prompt_is_refused() {
    let l = lists();
    for name in ["two words", "-dash", "dash-", "two--dashes", "Upper", "under_score", ""] {
        assert!(ops::save(&l.stores, input(Scope::Global, None, name, "a"), None).is_err(), "{name}");
    }
    assert!(ops::save(&l.stores, input(Scope::Global, None, "ok", "   "), None).is_err());
    assert!(ops::save(&l.stores, input(Scope::Global, Some("../up"), "ok", "a"), None).is_err());
}

#[test]
fn folders_are_created_renamed_and_kept_when_empty() {
    let l = lists();
    ops::create_folder(&l.stores, Scope::Global, "Writing").unwrap();
    assert!(ops::create_folder(&l.stores, Scope::Global, "writing").is_err());
    ops::save(&l.stores, input(Scope::Global, Some("Writing"), "blog", "a"), None).unwrap();
    ops::rename_folder(&l.stores, Scope::Global, "Writing", "Posts").unwrap();
    ops::create_folder(&l.stores, Scope::Global, "Empty").unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert_eq!(out.folders, ["Empty", "Posts"]);
    assert_eq!(names(&out), [(Some("Posts".to_string()), "blog".to_string())]);
    assert!(!l.global.skills.join("Posts").exists(), "a folder is only a label");
}

#[test]
fn deleting_a_folder_keeps_its_skills() {
    let l = lists();
    ops::save(&l.stores, input(Scope::Project, Some("Bugs"), "fix", "a"), None).unwrap();
    ops::delete_folder(&l.stores, Scope::Project, "Bugs").unwrap();
    let out = list_stores(&l.stores).unwrap().project.unwrap();
    assert!(out.folders.is_empty());
    assert_eq!(names(&out), [(None, "fix".to_string())]);
}

#[test]
fn deleting_a_skill_removes_what_lpm_wrote_and_keeps_added_files() {
    let l = lists();
    ops::save(&l.stores, input(Scope::Global, Some("Git"), "ship", "a"), None).unwrap();
    ops::save(&l.stores, input(Scope::Global, None, "kit", "a"), None).unwrap();
    std::fs::write(l.global.skills.join("kit/notes.txt"), "mine").unwrap();
    ops::delete(&l.stores, &reference(Scope::Global, Some("Git"), "ship")).unwrap();
    ops::delete(&l.stores, &reference(Scope::Global, None, "kit")).unwrap();
    assert!(!l.global.skills.join("ship").exists());
    assert!(!l.global.claude.join("ship").exists());
    assert!(l.global.skills.join("kit/notes.txt").exists());
    assert!(!l.global.skills.join("kit/SKILL.md").exists());
    assert_eq!(list_stores(&l.stores).unwrap().global.folders, ["Git"]);
}

#[test]
fn folder_skills_list_before_loose_ones() {
    let l = lists();
    ops::save(&l.stores, input(Scope::Global, None, "a-loose", "a"), None).unwrap();
    ops::save(&l.stores, input(Scope::Global, Some("Zed"), "z", "a"), None).unwrap();
    ops::save(&l.stores, input(Scope::Global, Some("alpha"), "b", "a"), None).unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert_eq!(
        names(&out),
        [
            (Some("alpha".to_string()), "b".to_string()),
            (Some("Zed".to_string()), "z".to_string()),
            (None, "a-loose".to_string()),
        ]
    );
}

#[test]
fn a_terminal_outside_projects_has_no_project_list() {
    let g = place();
    let stores = Stores { global: g.store(), project: None };
    assert!(ops::save(&stores, input(Scope::Project, None, "x", "a"), None).is_err());
    assert!(list_stores(&stores).unwrap().project.is_none());
}

#[test]
fn frontmatter_parsing_handles_crlf_and_unclosed_blocks() {
    let doc = parse_doc("---\r\ndescription: 'It''s here'\r\n---\r\n\r\nBody\r\n");
    assert_eq!(doc.description, "It's here");
    assert_eq!(doc.body, "Body");
    let open = parse_doc("---\nno end\n");
    assert_eq!(open.description, "");
    assert_eq!(open.body, "---\nno end");
}

#[test]
fn import_turns_new_commands_into_skills_in_an_imported_folder() {
    let l = lists();
    let src = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(src.path().join("frontend")).unwrap();
    std::fs::write(src.path().join("review.md"), "---\ndescription: Review\n---\nReview it.\n").unwrap();
    std::fs::write(src.path().join("frontend/Make_Component.md"), "---\nmodel: opus\n---\nMake a component.\n").unwrap();
    std::fs::write(src.path().join("empty.md"), "---\ndescription: x\n---\n").unwrap();
    std::fs::write(src.path().join("lint.md"), "Lint.").unwrap();
    foreign(&l.global, "lint");
    ops::save(&l.stores, input(Scope::Global, None, "review", "mine"), None).unwrap();
    let n = crate::lpm_commands_import::import(&l.stores, Scope::Global, &[src.path().to_path_buf()]).unwrap();
    assert_eq!(n, 1);
    let text = l.global.skill("make-component");
    assert!(text.contains("model: opus\n") && text.contains("lpm-folder: \"Imported\""), "{text}");
    assert!(l.global.skill("review").ends_with("\nmine\n"));
    assert!(l.global.skill("lint").contains("Theirs."));
    assert_eq!(list_stores(&l.stores).unwrap().global.folders, ["Imported"]);
}

#[test]
fn a_previous_place_outside_the_list_is_refused() {
    let l = lists();
    let escape = CommandRef { scope: Scope::Global, folder: Some("../..".into()), name: "x".into() };
    assert!(ops::save(&l.stores, input(Scope::Global, None, "ok", "a"), Some(escape)).is_err());
    let bad_name = reference(Scope::Global, None, "../x");
    assert!(ops::save(&l.stores, input(Scope::Global, None, "ok", "a"), Some(bad_name)).is_err());
}

#[test]
fn a_folded_description_reads_whole_and_is_written_back_plain() {
    let doc = parse_doc("---\nname: old\ndescription: >-\n  Review the\n  changes\nallowed-tools: X\n---\nBody\n");
    assert_eq!(doc.description, "Review the changes");
    assert_eq!(doc.extra, ["allowed-tools: X"]);
    assert_eq!(
        doc.made_by_lpm().to_skill("new"),
        "---\nname: new\ndescription: Review the changes\ndisable-model-invocation: true\nallowed-tools: X\nmetadata:\n  lpm-created: \"true\"\n---\n\nBody\n"
    );
}

#[test]
fn a_description_yaml_would_misread_is_quoted() {
    for text in ["true", "123", "a: b", "- list", "[x", "#tag"] {
        let doc = Doc::new(text, "Body", None);
        assert_eq!(parse_doc(&doc.to_skill("x")).description, text);
    }
}

#[test]
fn the_mark_has_to_be_lpms() {
    let doc = |meta: &str| parse_doc(&format!("---\nname: x\n{meta}\n---\n\nBody\n")).created_with_lpm;
    assert!(doc("metadata:\n  lpm-created: \"true\""));
    assert!(doc("metadata: {lpm-created: true}"));
    assert!(!doc("metadata:\n  lpm-created: \"false\""));
    assert!(!doc("metadata:\n  author: lpm"));
    assert!(!doc("lpm-created: \"true\""));
}

#[test]
fn names_and_folders_have_to_work_on_every_platform() {
    let l = lists();
    assert!(ops::save(&l.stores, input(Scope::Global, None, "con", "a"), None).is_err());
    assert!(ops::create_folder(&l.stores, Scope::Global, "Notes.").is_err());
    assert!(ops::create_folder(&l.stores, Scope::Global, "a:b").is_err());
    ops::create_folder(&l.stores, Scope::Global, "Release notes").unwrap();
}

#[test]
fn looser_names_map_to_the_closest_valid_one() {
    assert_eq!(skill_name("Fix_Ticket").as_deref(), Some("fix-ticket"));
    assert_eq!(skill_name("a--b_").as_deref(), Some("a-b"));
    assert_eq!(skill_name("---"), None);
    assert_eq!(skill_name("con"), None);
}

// ---- skills Agent setup made in an agent's own folder ------------------------

const MADE_THERE: &str = "---\nname: \"deploy\"\ndescription: Ship it.\nmetadata:\n  lpm-created: \"true\"\n---\n\n# Deploy\n\nRun it.\n";

fn made_in(root: &Path) -> PathBuf {
    let dir = root.join("deploy");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("SKILL.md"), MADE_THERE).unwrap();
    dir
}

#[test]
fn a_skill_made_in_claudes_folder_is_listed_and_edited_where_it_is() {
    let l = lists();
    let dir = made_in(&l.project.claude);
    let list = list_stores(&l.stores).unwrap().project.unwrap();
    assert_eq!(names(&list), [(None, "deploy".to_string())]);
    assert_eq!(list.commands[0].description, "Ship it.");

    let mut edit = input(Scope::Project, Some("Ops"), "deploy", "Run it again.");
    edit.description = "Ship it.".into();
    ops::save(&l.stores, edit, Some(reference(Scope::Project, None, "deploy"))).unwrap();
    let text = std::fs::read_to_string(dir.join("SKILL.md")).unwrap();
    assert!(text.contains("Run it again.") && text.contains("lpm-folder: \"Ops\""), "{text}");
    assert!(!dir.is_symlink(), "it stays a real folder");
    assert!(!l.project.skills.join("deploy").exists(), "nothing appears in the shared root");
}

#[test]
fn renaming_and_deleting_a_skill_made_in_claudes_folder_stay_there() {
    let l = lists();
    made_in(&l.project.claude);
    ops::save(
        &l.stores,
        input(Scope::Project, None, "ship", "Run it."),
        Some(reference(Scope::Project, None, "deploy")),
    )
    .unwrap();
    assert!(!l.project.claude.join("deploy").exists());
    assert!(l.project.claude.join("ship/SKILL.md").is_file());
    ops::delete(&l.stores, &reference(Scope::Project, None, "ship")).unwrap();
    assert!(!l.project.claude.join("ship").exists());
    assert!(list_stores(&l.stores).unwrap().project.unwrap().commands.is_empty());
}

#[test]
fn a_skill_made_in_codexs_folder_is_listed_and_edited_where_it_is() {
    let home = place();
    let codex = tempfile::tempdir().unwrap();
    let dir = made_in(codex.path());
    let store = LocalFs::new(home.skills.clone(), home.claude.clone(), home.lpm.clone())
        .with_codex(codex.path().to_path_buf());
    let stores = Stores { global: Box::new(store), project: None };
    assert_eq!(names(&list_stores(&stores).unwrap().global), [(None, "deploy".to_string())]);
    ops::save(&stores, input(Scope::Global, None, "deploy", "New."), Some(reference(Scope::Global, None, "deploy")))
        .unwrap();
    assert!(std::fs::read_to_string(dir.join("SKILL.md")).unwrap().ends_with("\nNew.\n"));
    assert!(!home.claude.join("deploy").exists(), "Codex's skill gets no link for Claude");
    assert!(stores.global.location("deploy").starts_with(&*codex.path().to_string_lossy()));
}

#[test]
fn a_copy_for_claude_is_not_a_second_skill() {
    let l = lists();
    ops::save(&l.stores, input(Scope::Project, None, "deploy", "Run it."), None).unwrap();
    let link = l.project.claude.join("deploy");
    let _ = std::fs::remove_file(&link);
    let _ = std::fs::remove_dir_all(&link);
    std::fs::create_dir_all(&link).unwrap();
    std::fs::copy(l.project.skills.join("deploy/SKILL.md"), link.join("SKILL.md")).unwrap();
    assert_eq!(list_stores(&l.stores).unwrap().project.unwrap().commands.len(), 1);
    ops::save(&l.stores, input(Scope::Project, None, "deploy", "Newer."), Some(reference(Scope::Project, None, "deploy")))
        .unwrap();
    assert!(std::fs::read_to_string(link.join("SKILL.md")).unwrap().ends_with("\nNewer.\n"));
}

#[test]
fn an_unmarked_skill_in_an_agents_folder_stays_someone_elses() {
    let l = lists();
    let dir = l.project.claude.join("deploy");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("SKILL.md"), "---\nname: deploy\ndescription: Theirs\n---\n\nTheirs.\n").unwrap();
    assert!(list_stores(&l.stores).unwrap().project.unwrap().commands.is_empty());
    assert!(ops::save(&l.stores, input(Scope::Project, None, "deploy", "Mine."), None).is_err());
}

#[test]
fn a_shared_root_names_its_list() {
    let p = place();
    assert!(store_of_shared_root(&p.skills).is_some());
    assert!(store_of_shared_root(&p.claude).is_none());
    assert!(store_of_shared_root(Path::new("/x/.codex/skills")).is_none());
}

// ---- moving an old list ------------------------------------------------------

fn old_list(place: &Place) -> PathBuf {
    let dir = place.lpm.join("commands");
    std::fs::create_dir_all(dir.join("Review")).unwrap();
    std::fs::create_dir_all(dir.join("Empty")).unwrap();
    dir
}

#[test]
fn an_old_list_moves_to_skills_once_and_stays_on_disk() {
    let l = lists();
    let dir = old_list(&l.global);
    std::fs::write(dir.join("Explain_It.md"), "---\ndescription: Explain\n---\n\nExplain {{what}}.\n").unwrap();
    std::fs::write(dir.join("Review/pr.md"), "Review the PR.\n").unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert_eq!(out.folders, ["Empty", "Review"]);
    assert_eq!(
        names(&out),
        [(Some("Review".to_string()), "pr".to_string()), (None, "explain-it".to_string())]
    );
    let text = l.global.skill("explain-it");
    assert!(text.contains("description: Explain\n") && text.contains("lpm-created: \"true\""), "{text}");
    assert!(text.contains("disable-model-invocation: true"));
    assert!(l.global.skills.join("pr/agents/openai.yaml").exists());
    assert!(dir.join("Review/pr.md").exists(), "the old file stays");
    #[cfg(unix)]
    assert!(l.global.claude.join("pr/SKILL.md").exists());

    ops::delete(&l.stores, &reference(Scope::Global, Some("Review"), "pr")).unwrap();
    let again = list_stores(&l.stores).unwrap().global;
    assert_eq!(names(&again), [(None, "explain-it".to_string())], "a deleted skill doesn't come back");
}

#[test]
fn a_name_another_skill_holds_gets_a_number_rather_than_being_lost() {
    let l = lists();
    let dir = old_list(&l.global);
    foreign(&l.global, "lint");
    std::fs::write(dir.join("lint.md"), "My lint.\n").unwrap();
    std::fs::write(dir.join("LINT_.md"), "My other lint.\n").unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    let mut bodies: Vec<_> = out.commands.iter().map(|c| c.name.as_str()).collect();
    bodies.sort();
    assert_eq!(bodies, ["lint-2", "lint-3"]);
    assert!(l.global.skill("lint").contains("Theirs."));
}

#[test]
fn files_kept_beside_a_folder_command_go_with_it() {
    let l = lists();
    let dir = l.global.lpm.join("commands");
    std::fs::create_dir_all(dir.join("walkthrough/scripts")).unwrap();
    std::fs::write(dir.join("walkthrough/walkthrough.md"), "Read {{dir}}/scripts/GUIDE.md\n").unwrap();
    std::fs::write(dir.join("walkthrough/scripts/GUIDE.md"), "The guide.\n").unwrap();
    std::fs::write(dir.join("walkthrough/scripts/run.sh"), "#!/bin/sh\n").unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert_eq!(names(&out), [(Some("walkthrough".to_string()), "walkthrough".to_string())]);
    let skill = l.global.skills.join("walkthrough");
    assert_eq!(std::fs::read_to_string(skill.join("scripts/GUIDE.md")).unwrap(), "The guide.\n");
    assert!(skill.join("scripts/run.sh").exists());
    assert!(!skill.join("walkthrough.md").exists());
}

#[test]
fn a_move_cut_short_finishes_without_doubling_up() {
    let l = lists();
    let dir = old_list(&l.global);
    std::fs::write(dir.join("one.md"), "One.\n").unwrap();
    let fs = l.global.store();
    crate::lpm_commands_ops::create_skill(fs.as_ref(), "one", Doc::new("", "One.", None)).unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert_eq!(names(&out), [(None, "one".to_string())]);
}
