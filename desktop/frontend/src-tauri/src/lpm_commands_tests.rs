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
        keep_out_of_git: None,
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

// ---- running a skill in the agent itself -------------------------------------

fn run_in(l: &Lists, cli: Option<&str>, name: &str, args: &str) -> crate::lpm_commands_expand::Expanded {
    crate::lpm_commands_expand::expand_at("", None, &l.stores, name, args, cli).unwrap()
}

#[cfg(unix)]
#[test]
fn claude_and_codex_get_the_call_so_it_runs_as_a_skill() {
    let l = lists();
    ops::save(&l.stores, input(Scope::Global, None, "review", "Review {{what}}."), None).unwrap();
    assert_eq!(run_in(&l, Some("claude"), "review", "the login flow").text, "/review the login flow");
    assert_eq!(run_in(&l, Some("codex"), "review", " the login flow ").text, "$review the login flow");
    let bare = run_in(&l, Some("claude"), "review", "");
    assert_eq!(bare.text, "/review");
    assert!(bare.missing.is_empty(), "the agent asks for it itself");
}

#[test]
fn an_agent_that_cant_start_it_gets_the_prompt() {
    let l = lists();
    ops::save(&l.stores, input(Scope::Global, None, "review", "Review {{what}}."), None).unwrap();
    for cli in [None, Some("gemini"), Some("opencode")] {
        assert_eq!(run_in(&l, cli, "review", "it").text, "Review it.");
    }
}

#[cfg(unix)]
#[test]
fn a_prompt_only_lpm_can_fill_stays_a_prompt() {
    let l = lists();
    ops::save(&l.stores, input(Scope::Global, None, "kit", "Read {{dir}}/GUIDE.md"), None).unwrap();
    let out = run_in(&l, Some("claude"), "kit", "");
    assert!(out.text.starts_with("Read ") && out.text.ends_with("kit/GUIDE.md"), "{}", out.text);
}

#[cfg(unix)]
#[test]
fn a_name_in_both_lists_stays_a_prompt_so_the_project_s_runs() {
    let l = lists();
    ops::save(&l.stores, input(Scope::Global, None, "ship", "Global ship."), None).unwrap();
    ops::save(&l.stores, input(Scope::Project, None, "ship", "Project ship."), None).unwrap();
    assert_eq!(run_in(&l, Some("claude"), "ship", "").text, "Project ship.");
}

#[test]
fn a_skill_claude_cant_reach_or_finds_someone_elses_stays_a_prompt() {
    let l = lists();
    ops::save(&l.stores, input(Scope::Global, None, "ship", "Mine."), None).unwrap();
    let link = l.global.claude.join("ship");
    let _ = std::fs::remove_file(&link);
    let _ = std::fs::remove_dir_all(&link);
    assert_eq!(run_in(&l, Some("claude"), "ship", "").text, "Mine.", "no link");
    std::fs::create_dir_all(&link).unwrap();
    std::fs::write(link.join("SKILL.md"), "---\nname: ship\ndescription: Theirs\n---\n\nTheirs.\n").unwrap();
    assert_eq!(run_in(&l, Some("claude"), "ship", "").text, "Mine.", "theirs");
    assert_eq!(run_in(&l, Some("codex"), "ship", "").text, "$ship", "Codex reads the shared root");
}

#[test]
fn a_skill_in_one_agent_s_own_folder_runs_only_in_that_agent() {
    let l = lists();
    made_in(&l.project.claude);
    assert_eq!(run_in(&l, Some("claude"), "deploy", "").text, "/deploy");
    assert_eq!(run_in(&l, Some("codex"), "deploy", "").text, "# Deploy\n\nRun it.");
}

// ---- other skills ------------------------------------------------------------

fn others(list: &ScopeList) -> Vec<(&str, Vec<&str>)> {
    list.others.iter().map(|o| (o.name.as_str(), o.agents.iter().map(String::as_str).collect())).collect()
}

fn theirs(root: &Path, name: &str) -> PathBuf {
    let dir = root.join(name);
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("SKILL.md"), format!("---\nname: {name}\ndescription: About {name}\n---\n\nDo {name}.\n")).unwrap();
    dir
}

#[test]
fn each_list_shows_the_skills_lpm_did_not_create_with_who_reads_them() {
    let l = lists();
    theirs(&l.project.claude, "android-cli");
    theirs(&l.global.skills, "lint");
    theirs(&l.global.claude, "find-docs");
    ops::save(&l.stores, input(Scope::Global, None, "mine", "a"), None).unwrap();
    let out = list_stores(&l.stores).unwrap();
    assert_eq!(others(out.project.as_ref().unwrap()), [("android-cli", vec!["claude", "opencode"])]);
    assert_eq!(
        others(&out.global),
        [("find-docs", vec!["claude", "opencode"]), ("lint", vec!["codex", "gemini", "opencode"])]
    );
    let lint = out.global.others.iter().find(|o| o.name == "lint").unwrap();
    assert_eq!(lint.description, "About lint");
    assert_eq!(lint.preview, "Do lint.");
    assert_eq!(lint.path, l.global.skills.join("lint").join("SKILL.md").to_string_lossy());
}

#[test]
fn a_skill_in_both_folders_is_one_row_every_agent_reads() {
    let l = lists();
    theirs(&l.global.skills, "lpm-cli");
    theirs(&l.global.claude, "lpm-cli");
    let out = list_stores(&l.stores).unwrap().global;
    assert_eq!(others(&out), [("lpm-cli", vec!["claude", "codex", "gemini", "opencode"])]);
}

#[cfg(unix)]
#[test]
fn claude_reaching_a_shared_skill_by_a_link_counts_as_reading_it() {
    let l = lists();
    theirs(&l.global.skills, "shared");
    std::fs::create_dir_all(&l.global.claude).unwrap();
    std::os::unix::fs::symlink("../../.agents/skills/shared", l.global.claude.join("shared")).unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert_eq!(others(&out), [("shared", vec!["claude", "codex", "gemini", "opencode"])]);
}

#[cfg(unix)]
#[test]
fn a_dotfile_link_shows_what_it_points_at_and_a_broken_one_only_holds_its_name() {
    let l = lists();
    let elsewhere = tempfile::tempdir().unwrap();
    let real = theirs(elsewhere.path(), "dots");
    std::fs::create_dir_all(&l.global.claude).unwrap();
    std::os::unix::fs::symlink(&real, l.global.claude.join("dots")).unwrap();
    std::os::unix::fs::symlink("/gone/nowhere", l.global.claude.join("broken")).unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert_eq!(others(&out), [("dots", vec!["claude", "opencode"])]);
    assert!(ops::save(&l.stores, input(Scope::Global, None, "broken", "a"), None).is_err());
}

#[test]
fn a_skill_in_codex_s_own_folder_is_read_by_codex_alone() {
    let home = place();
    let codex = tempfile::tempdir().unwrap();
    theirs(codex.path(), "testflight");
    let store = LocalFs::new(home.skills.clone(), home.claude.clone(), home.lpm.clone())
        .with_codex(codex.path().to_path_buf());
    let stores = Stores { global: Box::new(store), project: None };
    assert_eq!(others(&list_stores(&stores).unwrap().global), [("testflight", vec!["codex"])]);
}

#[test]
fn skills_lpm_made_are_never_among_the_others() {
    let l = lists();
    ops::save(&l.stores, input(Scope::Project, None, "mine", "a"), None).unwrap();
    made_in(&l.project.claude);
    assert!(list_stores(&l.stores).unwrap().project.unwrap().others.is_empty());
}

#[test]
fn a_long_skill_comes_as_its_start() {
    let l = lists();
    let dir = l.global.skills.join("long");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("SKILL.md"), format!("---\nname: long\ndescription: x\n---\n\n{}", "é".repeat(5000))).unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    let preview = &out.others[0].preview;
    assert_eq!(preview.chars().count(), 1501);
    assert!(preview.ends_with('…'));
}

#[test]
fn another_skill_moves_into_a_folder_without_its_file_changing() {
    let l = lists();
    let dir = theirs(&l.global.claude, "find-docs");
    let before = std::fs::read_to_string(dir.join("SKILL.md")).unwrap();
    ops::create_folder(&l.stores, Scope::Global, "Docs").unwrap();
    ops::move_other(&l.stores, Scope::Global, "find-docs", Some("docs")).unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert_eq!(out.others[0].folder.as_deref(), Some("Docs"), "the folder's own spelling");
    assert_eq!(std::fs::read_to_string(dir.join("SKILL.md")).unwrap(), before);
    ops::move_other(&l.stores, Scope::Global, "find-docs", None).unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert_eq!(out.others[0].folder, None);
    assert_eq!(out.folders, ["Docs"], "the emptied folder stays");
}

#[test]
fn moving_another_skill_to_a_new_folder_makes_the_folder() {
    let l = lists();
    theirs(&l.project.skills, "lint");
    ops::move_other(&l.stores, Scope::Project, "lint", Some("Tools")).unwrap();
    let out = list_stores(&l.stores).unwrap().project.unwrap();
    assert_eq!(out.folders, ["Tools"]);
    assert_eq!(out.others[0].folder.as_deref(), Some("Tools"));
}

#[test]
fn renaming_and_deleting_a_folder_carry_the_other_skills_in_it() {
    let l = lists();
    theirs(&l.global.skills, "lint");
    ops::move_other(&l.stores, Scope::Global, "lint", Some("Tools")).unwrap();
    ops::rename_folder(&l.stores, Scope::Global, "Tools", "Checks").unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert_eq!(out.others[0].folder.as_deref(), Some("Checks"));
    assert_eq!(out.folders, ["Checks"]);
    ops::delete_folder(&l.stores, Scope::Global, "Checks").unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert_eq!(out.others[0].folder, None);
    assert!(out.folders.is_empty());
}

#[test]
fn another_skill_moves_to_the_top_of_its_list_and_back() {
    let l = lists();
    let dir = theirs(&l.global.claude, "lint");
    let before = std::fs::read_to_string(dir.join("SKILL.md")).unwrap();
    ops::move_other(&l.stores, Scope::Global, "lint", Some("Tools")).unwrap();

    ops::move_other_to_root(&l.stores, Scope::Global, "lint").unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert!(out.others[0].at_root);
    assert_eq!(out.others[0].folder, None);
    assert_eq!(out.folders, ["Tools"], "the folder it left stays");
    assert_eq!(std::fs::read_to_string(dir.join("SKILL.md")).unwrap(), before);

    ops::move_other(&l.stores, Scope::Global, "lint", Some("Tools")).unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert!(!out.others[0].at_root);
    assert_eq!(out.others[0].folder.as_deref(), Some("Tools"));

    ops::move_other_to_root(&l.stores, Scope::Global, "lint").unwrap();
    ops::move_other(&l.stores, Scope::Global, "lint", None).unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert!(!out.others[0].at_root, "no place at all is the Other skills group");
}

#[test]
fn a_folder_change_leaves_a_skill_at_the_top_alone() {
    let l = lists();
    theirs(&l.global.skills, "lint");
    theirs(&l.global.skills, "docs");
    ops::move_other(&l.stores, Scope::Global, "docs", Some("Tools")).unwrap();
    ops::move_other_to_root(&l.stores, Scope::Global, "lint").unwrap();
    ops::rename_folder(&l.stores, Scope::Global, "Tools", "Checks").unwrap();
    ops::delete_folder(&l.stores, Scope::Global, "Checks").unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert!(out.others.iter().find(|o| o.name == "lint").unwrap().at_root);
}

#[test]
fn a_skill_at_the_top_converts_to_one_in_no_folder() {
    let l = lists();
    theirs(&l.global.skills, "lint");
    ops::move_other_to_root(&l.stores, Scope::Global, "lint").unwrap();
    ops::convert(&l.stores, Scope::Global, "lint", true).unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert_eq!(names(&out), [(None, "lint".to_string())]);
    assert!(out.folders.is_empty());
    ops::convert(&l.stores, Scope::Global, "lint", false).unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert!(!out.others[0].at_root, "back in the Other skills group");
}

#[test]
fn only_a_skill_the_list_holds_can_move_to_the_top() {
    let l = lists();
    theirs(&l.global.skills, "lint");
    assert!(ops::move_other_to_root(&l.stores, Scope::Project, "lint").is_err());
    assert!(ops::move_other_to_root(&l.stores, Scope::Global, "gone").is_err());
}

#[test]
fn only_a_skill_the_list_holds_can_move() {
    let l = lists();
    theirs(&l.global.skills, "lint");
    assert!(ops::move_other(&l.stores, Scope::Project, "lint", Some("Tools")).is_err());
    assert!(ops::move_other(&l.stores, Scope::Global, "gone", Some("Tools")).is_err());
    assert!(ops::move_other(&l.stores, Scope::Global, "lint", Some("a:b")).is_err());
}

#[test]
fn another_skill_becomes_lpm_s_and_back_keeping_its_folder_and_text() {
    let l = lists();
    let dir = theirs(&l.global.skills, "lint");
    let original = std::fs::read_to_string(dir.join("SKILL.md")).unwrap();
    ops::move_other(&l.stores, Scope::Global, "lint", Some("Tools")).unwrap();

    ops::convert(&l.stores, Scope::Global, "lint", true).unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert!(out.others.is_empty());
    assert_eq!(names(&out), [(Some("Tools".to_string()), "lint".to_string())]);
    assert_eq!(out.commands[0].description, "About lint");
    assert_eq!(out.commands[0].body, "Do lint.");
    #[cfg(unix)]
    assert!(l.global.claude.join("lint/SKILL.md").exists(), "Claude reaches it like any lpm skill");
    let marked = l.global.skill("lint");
    assert!(!marked.contains("disable-model-invocation"), "who may start it doesn't change: {marked}");

    ops::convert(&l.stores, Scope::Global, "lint", false).unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert!(out.commands.is_empty());
    assert_eq!(out.others[0].folder.as_deref(), Some("Tools"));
    assert_eq!(l.global.skill("lint"), original.replace("\n\nDo", "\n\nDo"));
}

#[test]
fn a_converted_skill_can_be_edited_where_it_lives() {
    let l = lists();
    let dir = theirs(&l.project.claude, "deploy");
    ops::convert(&l.stores, Scope::Project, "deploy", true).unwrap();
    ops::save(&l.stores, input(Scope::Project, None, "deploy", "New."), Some(reference(Scope::Project, None, "deploy")))
        .unwrap();
    assert!(std::fs::read_to_string(dir.join("SKILL.md")).unwrap().ends_with("\nNew.\n"));
    assert!(!dir.is_symlink());
}

#[test]
fn every_copy_of_a_skill_converts_together() {
    let l = lists();
    theirs(&l.global.skills, "lpm-cli");
    let copy = theirs(&l.global.claude, "lpm-cli");
    ops::convert(&l.stores, Scope::Global, "lpm-cli", true).unwrap();
    assert!(std::fs::read_to_string(copy.join("SKILL.md")).unwrap().contains("lpm-created"));
    let out = list_stores(&l.stores).unwrap().global;
    assert_eq!(names(&out), [(None, "lpm-cli".to_string())]);
    ops::save(&l.stores, input(Scope::Global, None, "lpm-cli", "New."), Some(reference(Scope::Global, None, "lpm-cli")))
        .unwrap();
    assert!(std::fs::read_to_string(copy.join("SKILL.md")).unwrap().ends_with("\nNew.\n"), "the copy keeps up");
}

#[cfg(unix)]
#[test]
fn a_skill_behind_someone_s_link_stays_theirs() {
    let l = lists();
    let elsewhere = tempfile::tempdir().unwrap();
    let real = theirs(elsewhere.path(), "dots");
    std::fs::create_dir_all(&l.global.claude).unwrap();
    std::os::unix::fs::symlink(&real, l.global.claude.join("dots")).unwrap();
    let err = ops::convert(&l.stores, Scope::Global, "dots", true).unwrap_err();
    assert!(err.contains("link"), "{err}");
    assert!(!std::fs::read_to_string(real.join("SKILL.md")).unwrap().contains("lpm-created"));
}

#[test]
fn a_name_lpm_could_not_list_is_refused_with_why() {
    let l = lists();
    theirs(&l.global.skills, "Skill_Creator");
    let err = ops::convert(&l.stores, Scope::Global, "Skill_Creator", true).unwrap_err();
    assert!(err.contains("lowercase"), "{err}");
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

// ---- folders inside folders --------------------------------------------------

#[test]
fn a_folder_path_lists_every_level_and_sorts_inside_its_parent() {
    let l = lists();
    ops::create_folder(&l.stores, Scope::Global, "Work notes").unwrap();
    ops::save(&l.stores, input(Scope::Global, Some(" Work / Reviews "), "go", "b"), None).unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert_eq!(out.folders, ["Work", "Work/Reviews", "Work notes"]);
    assert_eq!(out.commands[0].folder.as_deref(), Some("Work/Reviews"));
    assert!(l.global.skill("go").contains("lpm-folder: \"Work/Reviews\""));
    assert!(!l.global.skills.join("Work").exists(), "a folder is still only a label");
}

#[test]
fn a_new_folder_takes_its_parents_spelling() {
    let l = lists();
    ops::create_folder(&l.stores, Scope::Global, "Work").unwrap();
    ops::create_folder(&l.stores, Scope::Global, "work/Reviews").unwrap();
    assert!(ops::create_folder(&l.stores, Scope::Global, "WORK/reviews").is_err());
    ops::save(&l.stores, input(Scope::Global, Some("WORK/REVIEWS"), "go", "b"), None).unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert_eq!(out.folders, ["Work", "Work/Reviews"]);
    assert_eq!(out.commands[0].folder.as_deref(), Some("Work/Reviews"));
}

#[test]
fn a_skill_written_by_hand_lands_in_the_listed_spelling() {
    let l = lists();
    ops::create_folder(&l.stores, Scope::Global, "Work").unwrap();
    let dir = l.global.skills.join("go");
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(
        dir.join("SKILL.md"),
        "---\nname: go\ndescription: x\nmetadata:\n  lpm-created: \"true\"\n  lpm-folder: \"work/deep/er\"\n---\n\nGo.\n",
    )
    .unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert_eq!(out.folders, ["Work", "Work/deep", "Work/deep/er"]);
    assert_eq!(out.commands[0].folder.as_deref(), Some("Work/deep/er"));
}

#[test]
fn renaming_a_folder_carries_all_that_is_inside_it() {
    let l = lists();
    ops::save(&l.stores, input(Scope::Global, Some("Work"), "a", "b"), None).unwrap();
    ops::save(&l.stores, input(Scope::Global, Some("Work/Reviews/Deep"), "c", "b"), None).unwrap();
    ops::save(&l.stores, input(Scope::Global, Some("Workshop"), "d", "b"), None).unwrap();
    foreign(&l.global, "theirs");
    ops::move_other(&l.stores, Scope::Global, "theirs", Some("Work/Reviews")).unwrap();

    ops::rename_folder(&l.stores, Scope::Global, "Work", "Job").unwrap();

    let out = list_stores(&l.stores).unwrap().global;
    assert_eq!(out.folders, ["Job", "Job/Reviews", "Job/Reviews/Deep", "Workshop"]);
    assert_eq!(
        names(&out),
        [
            (Some("Job".to_string()), "a".to_string()),
            (Some("Job/Reviews/Deep".to_string()), "c".to_string()),
            (Some("Workshop".to_string()), "d".to_string()),
        ]
    );
    assert_eq!(out.others[0].folder.as_deref(), Some("Job/Reviews"));
}

#[test]
fn a_folder_moves_with_a_new_path_but_not_into_itself_or_onto_another() {
    let l = lists();
    ops::save(&l.stores, input(Scope::Global, Some("Work/Reviews"), "a", "b"), None).unwrap();
    ops::create_folder(&l.stores, Scope::Global, "Home").unwrap();
    ops::create_folder(&l.stores, Scope::Global, "Home/Reviews").unwrap();

    let err = ops::rename_folder(&l.stores, Scope::Global, "Work", "Work/Reviews/Work").unwrap_err();
    assert!(err.contains("into itself"), "{err}");
    let err = ops::rename_folder(&l.stores, Scope::Global, "Work/Reviews", "Home/Reviews").unwrap_err();
    assert!(err.contains("already exists"), "{err}");

    ops::rename_folder(&l.stores, Scope::Global, "Work/Reviews", "Reviews").unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert_eq!(out.folders, ["Home", "Home/Reviews", "Reviews", "Work"]);
    assert_eq!(out.commands[0].folder.as_deref(), Some("Reviews"));
}

#[test]
fn a_folder_can_change_case_and_a_new_parent_is_made() {
    let l = lists();
    ops::save(&l.stores, input(Scope::Global, Some("Work/Reviews"), "a", "b"), None).unwrap();
    ops::rename_folder(&l.stores, Scope::Global, "Work/Reviews", "work/REVIEWS").unwrap();
    assert_eq!(list_stores(&l.stores).unwrap().global.folders, ["Work", "Work/REVIEWS"]);
    ops::rename_folder(&l.stores, Scope::Global, "Work/REVIEWS", "New/Inner").unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert_eq!(out.folders, ["New", "New/Inner", "Work"]);
}

#[test]
fn deleting_a_folder_moves_what_it_held_up_a_level() {
    let l = lists();
    ops::save(&l.stores, input(Scope::Global, Some("Work"), "a", "b"), None).unwrap();
    ops::save(&l.stores, input(Scope::Global, Some("Work/Reviews"), "c", "b"), None).unwrap();
    ops::save(&l.stores, input(Scope::Global, Some("Work/Reviews/Deep"), "d", "b"), None).unwrap();
    foreign(&l.global, "theirs");
    ops::move_other(&l.stores, Scope::Global, "theirs", Some("Work/Reviews")).unwrap();

    ops::delete_folder(&l.stores, Scope::Global, "Work/Reviews").unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert_eq!(out.folders, ["Work", "Work/Deep"]);
    assert_eq!(
        names(&out),
        [
            (Some("Work".to_string()), "a".to_string()),
            (Some("Work".to_string()), "c".to_string()),
            (Some("Work/Deep".to_string()), "d".to_string()),
        ]
    );
    assert_eq!(out.others[0].folder.as_deref(), Some("Work"));

    ops::delete_folder(&l.stores, Scope::Global, "Work").unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert_eq!(out.folders, ["Deep"]);
    assert_eq!(names(&out)[2], (None, "c".to_string()));
    assert_eq!(out.others[0].folder, None);
}

#[test]
fn a_deleted_folder_inside_another_merges_with_a_folder_of_that_name() {
    let l = lists();
    ops::save(&l.stores, input(Scope::Global, Some("Reviews"), "a", "b"), None).unwrap();
    ops::save(&l.stores, input(Scope::Global, Some("Work/Reviews"), "c", "b"), None).unwrap();
    ops::delete_folder(&l.stores, Scope::Global, "Work").unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert_eq!(out.folders, ["Reviews"]);
    assert_eq!(out.commands.len(), 2);
}

#[test]
fn another_skill_files_in_a_new_folder_inside_another() {
    let l = lists();
    foreign(&l.global, "theirs");
    ops::move_other(&l.stores, Scope::Global, "theirs", Some("Tools/Lint")).unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert_eq!(out.folders, ["Tools", "Tools/Lint"]);
    assert_eq!(out.others[0].folder.as_deref(), Some("Tools/Lint"));
}

#[test]
fn every_level_of_a_folder_path_has_to_be_a_good_name() {
    let l = lists();
    for bad in ["../..", "Work/.git", "Work/a:b", "Work/Notes.", "/", "a/CON"] {
        assert!(ops::create_folder(&l.stores, Scope::Global, bad).is_err(), "{bad}");
    }
    assert!(ops::create_folder(&l.stores, Scope::Global, &"a/".repeat(200)).is_err(), "too deep");
    assert!(list_stores(&l.stores).unwrap().global.folders.is_empty());
}

#[test]
fn slashes_around_a_folder_path_mean_nothing() {
    let l = lists();
    ops::create_folder(&l.stores, Scope::Global, "/Work//Reviews/").unwrap();
    assert_eq!(list_stores(&l.stores).unwrap().global.folders, ["Work", "Work/Reviews"]);
}
