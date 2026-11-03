use super::*;
use crate::lpm_commands_ops as ops;

struct Lists {
    _global: tempfile::TempDir,
    _project: tempfile::TempDir,
    global: PathBuf,
    project: PathBuf,
    stores: Stores,
}

fn lists() -> Lists {
    let g = tempfile::tempdir().unwrap();
    let p = tempfile::tempdir().unwrap();
    let global = g.path().join("commands");
    let project = p.path().join(".lpm").join("commands");
    let stores = Stores {
        global: Box::new(LocalFs::new(global.clone())),
        project: Some(Box::new(LocalFs::new(project.clone()))),
    };
    Lists { _global: g, _project: p, global, project, stores }
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

#[test]
fn an_empty_place_lists_nothing() {
    let l = lists();
    let out = list_stores(&l.stores).unwrap();
    assert!(out.global.commands.is_empty() && out.global.folders.is_empty());
    assert!(out.project.unwrap().commands.is_empty());
}

#[test]
fn saving_writes_a_markdown_file_in_its_folder() {
    let l = lists();
    let mut cmd = input(Scope::Project, Some("Bugs"), "fix-ticket", "Fix {{ticket}}.");
    cmd.description = "Fix a ticket".into();
    ops::save(&l.stores, cmd, None).unwrap();
    let text = std::fs::read_to_string(l.project.join("Bugs/fix-ticket.md")).unwrap();
    assert_eq!(text, "---\ndescription: Fix a ticket\n---\n\nFix {{ticket}}.\n");
    let out = list_stores(&l.stores).unwrap().project.unwrap();
    assert_eq!(out.folders, ["Bugs"]);
    assert_eq!(out.commands[0].argument_hint, "<ticket>");
    assert_eq!(out.commands[0].description, "Fix a ticket");
}

#[test]
fn a_command_without_a_description_is_just_its_prompt() {
    let l = lists();
    ops::save(&l.stores, input(Scope::Global, None, "explain", "Explain it."), None).unwrap();
    assert_eq!(std::fs::read_to_string(l.global.join("explain.md")).unwrap(), "Explain it.\n");
}

#[test]
fn names_are_unique_within_a_list_whatever_the_case() {
    let l = lists();
    ops::save(&l.stores, input(Scope::Global, Some("Git"), "commit", "a"), None).unwrap();
    let err = ops::save(&l.stores, input(Scope::Global, None, "Commit", "b"), None).unwrap_err();
    assert!(err.contains("already exists in the Git folder"), "{err}");
    ops::save(&l.stores, input(Scope::Project, None, "commit", "c"), None).unwrap();
}

#[test]
fn editing_renames_and_moves_the_file() {
    let l = lists();
    ops::save(&l.stores, input(Scope::Global, None, "old", "a"), None).unwrap();
    ops::save(
        &l.stores,
        input(Scope::Global, Some("Git"), "new", "b"),
        Some(reference(Scope::Global, None, "old")),
    )
    .unwrap();
    assert!(!l.global.join("old.md").exists());
    assert_eq!(std::fs::read_to_string(l.global.join("Git/new.md")).unwrap(), "b\n");
}

#[test]
fn a_case_only_rename_keeps_the_file() {
    let l = lists();
    ops::save(&l.stores, input(Scope::Global, None, "Review", "a"), None).unwrap();
    ops::save(&l.stores, input(Scope::Global, None, "review", "a"), Some(reference(Scope::Global, None, "Review")))
        .unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert_eq!(names(&out), [(None, "review".to_string())]);
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
    assert!(!l.global.join("Git/ship.md").exists());
    assert!(l.project.join("Release/ship.md").exists());
}

#[test]
fn edits_keep_frontmatter_lpm_does_not_manage() {
    let l = lists();
    std::fs::create_dir_all(&l.global).unwrap();
    std::fs::write(
        l.global.join("pr.md"),
        "---\nallowed-tools: Bash(git:*)\ndescription: Old\n---\n\nWrite a PR.\n",
    )
    .unwrap();
    let mut cmd = input(Scope::Global, None, "pr", "Write a PR description.");
    cmd.description = "New: better".into();
    ops::save(&l.stores, cmd, Some(reference(Scope::Global, None, "pr"))).unwrap();
    let text = std::fs::read_to_string(l.global.join("pr.md")).unwrap();
    assert_eq!(
        text,
        "---\ndescription: \"New: better\"\nallowed-tools: Bash(git:*)\n---\n\nWrite a PR description.\n"
    );
    assert_eq!(parse_doc(&text).description, "New: better");
}

#[test]
fn a_bad_name_or_an_empty_prompt_is_refused() {
    let l = lists();
    assert!(ops::save(&l.stores, input(Scope::Global, None, "two words", "a"), None).is_err());
    assert!(ops::save(&l.stores, input(Scope::Global, None, "-dash", "a"), None).is_err());
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
}

#[test]
fn deleting_a_folder_keeps_its_commands() {
    let l = lists();
    ops::save(&l.stores, input(Scope::Project, Some("Bugs"), "fix", "a"), None).unwrap();
    ops::delete_folder(&l.stores, Scope::Project, "Bugs").unwrap();
    let out = list_stores(&l.stores).unwrap().project.unwrap();
    assert!(out.folders.is_empty());
    assert_eq!(names(&out), [(None, "fix".to_string())]);
}

#[test]
fn deleting_a_command_removes_its_file() {
    let l = lists();
    ops::save(&l.stores, input(Scope::Global, Some("Git"), "ship", "a"), None).unwrap();
    ops::delete(&l.stores, &reference(Scope::Global, Some("Git"), "ship")).unwrap();
    assert!(!l.global.join("Git/ship.md").exists());
    assert!(l.global.join("Git").is_dir());
}

#[test]
fn hidden_folders_and_odd_files_stay_out_of_the_list() {
    let l = lists();
    std::fs::create_dir_all(l.global.join(".git")).unwrap();
    std::fs::create_dir_all(l.global.join("Notes")).unwrap();
    std::fs::write(l.global.join(".git/x.md"), "a").unwrap();
    std::fs::write(l.global.join("Notes/two words.md"), "a").unwrap();
    std::fs::write(l.global.join("readme.txt"), "a").unwrap();
    std::fs::write(l.global.join("ok.md"), "a").unwrap();
    let out = list_stores(&l.stores).unwrap().global;
    assert_eq!(out.folders, ["Notes"]);
    assert_eq!(names(&out), [(None, "ok".to_string())]);
}

#[test]
fn folder_commands_list_before_loose_ones() {
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
    let g = tempfile::tempdir().unwrap();
    let stores = Stores { global: Box::new(LocalFs::new(g.path().to_path_buf())), project: None };
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
fn import_copies_new_commands_into_an_imported_folder() {
    let l = lists();
    let src = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(src.path().join("frontend")).unwrap();
    std::fs::write(src.path().join("review.md"), "---\ndescription: Review\n---\nReview it.\n").unwrap();
    std::fs::write(src.path().join("frontend/component.md"), "Make a component.\n").unwrap();
    std::fs::write(src.path().join("empty.md"), "---\ndescription: x\n---\n").unwrap();
    ops::save(&l.stores, input(Scope::Global, None, "Review", "mine"), None).unwrap();
    let n = crate::lpm_commands_import::import(&l.stores, Scope::Global, &[src.path().to_path_buf()]).unwrap();
    assert_eq!(n, 1);
    assert!(l.global.join("Imported/component.md").exists());
    assert_eq!(std::fs::read_to_string(l.global.join("Review.md")).unwrap(), "mine\n");
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
    let doc = parse_doc("---\ndescription: >-\n  Review the\n  changes\nallowed-tools: X\n---\nBody\n");
    assert_eq!(doc.description, "Review the changes");
    assert_eq!(doc.extra, ["allowed-tools: X"]);
    assert_eq!(
        serialize_doc(&doc.description, &doc.body, &doc.extra),
        "---\ndescription: Review the changes\nallowed-tools: X\n---\n\nBody\n"
    );
}

#[test]
fn names_and_folders_have_to_work_on_every_platform() {
    let l = lists();
    assert!(ops::save(&l.stores, input(Scope::Global, None, "con", "a"), None).is_err());
    assert!(ops::create_folder(&l.stores, Scope::Global, "Notes.").is_err());
    assert!(ops::create_folder(&l.stores, Scope::Global, "a:b").is_err());
    ops::create_folder(&l.stores, Scope::Global, "Release notes").unwrap();
}
