use super::*;
use crate::lpm_commands::{list_stores, CommandInput, CommandRef, LocalFs, Scope, ScopeList, Stores};
use crate::lpm_commands_ops as ops;
use serde_json::json;
use std::path::PathBuf;

struct List {
    dir: tempfile::TempDir,
    stores: Stores,
}

fn file_at(dir: &Path, list: &str) -> PathBuf {
    dir.join("lpm").join(format!("{list}.json"))
}

fn store_at(dir: &Path, list: &str) -> Box<LocalFs> {
    let root = dir.join(list);
    let store = LocalFs::new(root.join(".agents/skills"), root.join(".claude/skills"), root.join(".lpm"));
    Box::new(store.with_layout(file_at(dir, list)))
}

fn list() -> List {
    let dir = tempfile::tempdir().unwrap();
    let stores = Stores { global: store_at(dir.path(), "global"), project: Some(store_at(dir.path(), "project")) };
    List { dir, stores }
}

impl List {
    fn root(&self) -> PathBuf {
        self.dir.path().join("project")
    }

    fn skill_md(&self, name: &str) -> PathBuf {
        self.root().join(".agents/skills").join(name).join("SKILL.md")
    }

    fn write_skill(&self, name: &str, text: &str) {
        std::fs::create_dir_all(self.skill_md(name).parent().unwrap()).unwrap();
        std::fs::write(self.skill_md(name), text).unwrap();
    }

    fn saved(&self) -> serde_json::Value {
        serde_json::from_slice(&std::fs::read(file_at(self.dir.path(), "project")).unwrap()).unwrap()
    }

    fn listed(&self) -> ScopeList {
        list_stores(&self.stores).unwrap().project.unwrap()
    }

    fn folder_of(&self, name: &str) -> Option<String> {
        self.listed().commands.into_iter().find(|c| c.name == name)?.folder
    }

    /// With the description as listed, the way the app sends a skill back.
    fn save(&self, name: &str, folder: Option<&str>, body: &str, previous: Option<&str>) {
        let listed = self.listed().commands.into_iter().find(|c| Some(c.name.as_str()) == previous);
        let input = CommandInput {
            scope: Scope::Project,
            folder: folder.map(str::to_string),
            name: name.to_string(),
            description: listed.map(|c| c.description).unwrap_or_default(),
            body: body.to_string(),
            keep_out_of_git: None,
        };
        let previous = previous.map(|name| target(name));
        ops::save(&self.stores, input, previous).unwrap();
    }
}

fn target(name: &str) -> CommandRef {
    CommandRef { scope: Scope::Project, folder: None, name: name.to_string() }
}

/// Valid, but not how lpm would write it: rewriting changes these bytes.
const HAND_WRITTEN: &str =
    "---\ndescription: \"Ship it\"\nname: ship\nmetadata:\n  lpm-created: 'true'\n---\n\nShip it.\n";

#[test]
fn sorting_a_skill_writes_nothing_beside_it() {
    let l = list();
    l.save("ship", Some("Release"), "Ship it.", None);
    assert_eq!(l.saved(), json!({ "folders": ["Release"], "skills": { "ship": "Release" } }));
    let text = std::fs::read_to_string(l.skill_md("ship")).unwrap();
    assert!(!text.contains("Release"), "{text}");
    assert!(!l.root().join(".lpm").exists(), "{:?}", l.root());
}

#[test]
fn moving_a_skill_leaves_its_file_exactly_as_it_was() {
    let l = list();
    l.write_skill("ship", HAND_WRITTEN);
    l.save("ship", Some("Release"), "Ship it.", Some("ship"));
    assert_eq!(std::fs::read_to_string(l.skill_md("ship")).unwrap(), HAND_WRITTEN);
    assert_eq!(l.folder_of("ship").as_deref(), Some("Release"));
}

#[test]
fn renaming_a_folder_leaves_every_file_exactly_as_it_was() {
    let l = list();
    l.write_skill("ship", HAND_WRITTEN);
    l.save("ship", Some("Release"), "Ship it.", Some("ship"));
    ops::rename_folder(&l.stores, Scope::Project, "Release", "Deploy").unwrap();
    assert_eq!(std::fs::read_to_string(l.skill_md("ship")).unwrap(), HAND_WRITTEN);
    assert_eq!(l.folder_of("ship").as_deref(), Some("Deploy"));
}

#[test]
fn editing_a_skill_still_writes_its_file() {
    let l = list();
    l.write_skill("ship", HAND_WRITTEN);
    l.save("ship", None, "Ship it twice.", Some("ship"));
    assert!(std::fs::read_to_string(l.skill_md("ship")).unwrap().ends_with("\nShip it twice.\n"));
}

#[test]
fn a_rename_in_lpm_keeps_the_folder_and_the_old_name_for_other_checkouts() {
    let l = list();
    l.save("old", Some("Git"), "a", None);
    l.save("new", Some("Git"), "a", Some("old"));
    assert_eq!(l.folder_of("new").as_deref(), Some("Git"));
    assert_eq!(l.saved()["skills"], json!({ "old": "Git", "new": "Git" }));
}

#[test]
fn an_old_name_left_behind_moves_with_its_folder() {
    let l = list();
    l.save("old", Some("Git"), "a", None);
    l.save("new", Some("Git"), "a", Some("old"));
    ops::rename_folder(&l.stores, Scope::Project, "Git", "Source").unwrap();
    assert_eq!(l.saved()["skills"], json!({ "old": "Source", "new": "Source" }));
}

#[test]
fn a_new_skill_under_an_old_name_goes_where_it_was_asked_to() {
    let l = list();
    l.save("old", Some("Git"), "a", None);
    l.save("new", Some("Git"), "a", Some("old"));
    l.save("old", None, "b", None);
    assert_eq!(l.folder_of("old"), None);
}

#[test]
fn a_rename_outside_lpm_loses_the_folder_until_it_is_renamed_back() {
    let l = list();
    l.save("old", Some("Git"), "a", None);
    let skills = l.root().join(".agents/skills");
    std::fs::rename(skills.join("old"), skills.join("new")).unwrap();
    let doc = std::fs::read_to_string(skills.join("new/SKILL.md")).unwrap().replace("name: old", "name: new");
    std::fs::write(skills.join("new/SKILL.md"), doc).unwrap();
    assert_eq!(l.folder_of("new"), None);
    std::fs::rename(skills.join("new"), skills.join("old")).unwrap();
    assert_eq!(l.folder_of("old").as_deref(), Some("Git"));
}

#[test]
fn a_skill_changing_lists_takes_its_place_out_of_the_old_one() {
    let l = list();
    l.save("ship", Some("Git"), "a", None);
    let input = CommandInput {
        scope: Scope::Global,
        folder: Some("Release".to_string()),
        name: "ship".to_string(),
        description: String::new(),
        body: "a".to_string(),
        keep_out_of_git: None,
    };
    ops::save(&l.stores, input, Some(target("ship"))).unwrap();
    assert_eq!(l.saved(), json!({ "folders": ["Git"], "skills": {} }));
    let global = list_stores(&l.stores).unwrap().global;
    assert_eq!(global.commands[0].folder.as_deref(), Some("Release"));
}

#[test]
fn deleting_a_skill_forgets_its_place_but_not_its_folder() {
    let l = list();
    l.save("ship", Some("Git"), "a", None);
    ops::delete(&l.stores, &target("ship")).unwrap();
    assert_eq!(l.saved(), json!({ "folders": ["Git"], "skills": {} }));
}

#[test]
fn the_file_goes_once_it_holds_nothing() {
    let l = list();
    ops::create_folder(&l.stores, Scope::Project, "Git").unwrap();
    ops::delete_folder(&l.stores, Scope::Project, "Git").unwrap();
    assert!(!file_at(l.dir.path(), "project").exists());
}

#[test]
fn a_place_saved_in_another_case_moves_with_its_folder() {
    let l = list();
    l.save("ship", Some("Work/Deep"), "a", None);
    let file = file_at(l.dir.path(), "project");
    let layout = json!({ "folders": ["Work", "Work/Deep"], "skills": { "ship": "work/deep" } });
    std::fs::write(&file, layout.to_string()).unwrap();
    ops::rename_folder(&l.stores, Scope::Project, "Work", "Job").unwrap();
    assert_eq!(l.folder_of("ship").as_deref(), Some("Job/Deep"));
    assert_eq!(l.listed().folders, ["Job", "Job/Deep"]);
}

#[test]
fn folders_are_saved_in_one_order_whichever_came_first() {
    let dir = tempfile::tempdir().unwrap();
    let saved = |file: &str, order: &[&str]| {
        let path = dir.path().join(file);
        for folder in order {
            update(Some(&path), &mut |layout| layout.keep(&[folder.to_string()])).unwrap();
        }
        std::fs::read(path).unwrap()
    };
    assert_eq!(saved("a.json", &["Zed", "Alpha/Inner"]), saved("b.json", &["Alpha", "Alpha/Inner", "Zed"]));
}

#[test]
fn a_change_with_nothing_to_save_leaves_the_file_alone() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("layout.json");
    update(Some(&path), &mut |_| {}).unwrap();
    assert!(!path.exists());
}

#[test]
fn a_list_with_no_layout_reads_empty_and_refuses_only_a_real_change() {
    assert_eq!(read(None), Layout::default());
    update(None, &mut |_| {}).unwrap();
    assert!(update(None, &mut |layout| layout.keep(&["Git".to_string()])).is_err());
}

#[test]
fn a_damaged_file_costs_the_folders_and_not_the_skills() {
    let l = list();
    l.save("ship", Some("Git"), "a", None);
    std::fs::write(file_at(l.dir.path(), "project"), "{ not json").unwrap();
    let out = l.listed();
    assert_eq!(out.commands[0].name, "ship");
    assert_eq!(out.commands[0].folder, None);
    assert!(out.folders.is_empty());
}

#[test]
fn changes_at_once_lose_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("layout.json");
    std::thread::scope(|scope| {
        for n in 0..16 {
            let path = &path;
            scope.spawn(move || {
                update(Some(path), &mut |layout| layout.file(&format!("skill-{n}"), Some("Git"))).unwrap();
            });
        }
    });
    assert_eq!(read(Some(&path)).skills.len(), 16);
}

#[test]
fn only_paths_inside_the_folder_are_layouts() {
    assert!(is_layout_file("skill-layout/web.json"));
    assert!(!is_layout_file("skill-layout-old/web.json"));
    assert!(!is_layout_file("memory/web/a.md"));
}
