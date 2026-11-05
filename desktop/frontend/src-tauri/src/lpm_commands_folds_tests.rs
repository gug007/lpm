use super::*;
use crate::lpm_commands::{LocalFs, Scope, Stores};
use crate::lpm_commands_ops as ops;

struct List {
    dir: tempfile::TempDir,
    stores: Stores,
}

fn store_at(dir: &Path, list: &str) -> Box<LocalFs> {
    let root = dir.join(list);
    let store = LocalFs::new(root.join(".agents/skills"), root.join(".claude/skills"), root.join(".lpm"));
    Box::new(store.with_layout(dir.join("layouts").join(format!("{list}.json"))))
}

fn list() -> List {
    let dir = tempfile::tempdir().unwrap();
    let stores = Stores { global: store_at(dir.path(), "global"), project: Some(store_at(dir.path(), "project")) };
    List { dir, stores }
}

fn closed(folders: &[&str]) -> BTreeSet<String> {
    folders.iter().map(|f| f.to_string()).collect()
}

impl List {
    fn layout(&self) -> Option<&Path> {
        self.stores.get(Scope::Project).unwrap().layout_path()
    }

    fn folds_file(&self) -> PathBuf {
        self.dir.path().join("layouts/folds/project.json")
    }

    fn close(&self, folder: &str) {
        set(self.layout(), Some(folder), false).unwrap();
    }

    fn closed(&self) -> BTreeSet<String> {
        of(&self.stores).project.closed
    }

    fn folders(&self, names: &[&str]) {
        for name in names {
            ops::create_folder(&self.stores, Scope::Project, name).unwrap();
        }
    }
}

#[test]
fn a_closed_folder_stays_closed_until_it_is_opened() {
    let l = list();
    l.close("Work");
    assert_eq!(l.closed(), closed(&["Work"]));
    set(l.layout(), Some("Work"), true).unwrap();
    assert_eq!(l.closed(), closed(&[]));
}

#[test]
fn nothing_to_remember_leaves_no_file() {
    let l = list();
    l.close("Work");
    assert!(l.folds_file().exists());
    set(l.layout(), Some("Work"), true).unwrap();
    assert!(!l.folds_file().exists());
}

#[test]
fn the_other_skills_group_is_kept_apart_from_the_folders() {
    let l = list();
    set(l.layout(), None, true).unwrap();
    let folds = of(&l.stores).project;
    assert!(folds.others_open);
    assert!(folds.closed.is_empty());
    set(l.layout(), None, false).unwrap();
    assert!(!l.folds_file().exists());
}

#[test]
fn each_list_keeps_its_own() {
    let l = list();
    l.close("Work");
    assert_eq!(of(&l.stores).global, ListFolds::default());
}

#[test]
fn folding_never_touches_the_layout() {
    let l = list();
    l.folders(&["Work"]);
    let layout_file = l.layout().unwrap().to_path_buf();
    let before = std::fs::read(&layout_file).unwrap();
    l.close("Work");
    assert_eq!(std::fs::read(&layout_file).unwrap(), before);
}

#[test]
fn folds_sit_where_a_sync_of_the_layouts_finds_them() {
    let layout = Path::new("skill-layout/web.json");
    let at = path_of(layout).unwrap();
    assert_eq!(at, Path::new("skill-layout/folds/web.json"));
    assert!(crate::lpm_commands_layout::is_layout_file(at.to_str().unwrap()));
    assert!(is_folds_file(at.to_str().unwrap()));
    assert!(!is_folds_file(layout.to_str().unwrap()));
}

#[test]
fn a_list_answer_carries_its_folds() {
    let l = list();
    l.close("Work");
    let lists = crate::lpm_commands::list_stores(&l.stores).unwrap();
    assert_eq!(lists.folds.project.closed, closed(&["Work"]));
}

#[test]
fn a_renamed_folder_stays_closed_and_so_does_what_is_inside() {
    let l = list();
    l.folders(&["Work", "Work/Reviews", "Home"]);
    l.close("Work");
    l.close("Work/Reviews");
    l.close("Home");
    ops::rename_folder(&l.stores, Scope::Project, "Work", "Jobs").unwrap();
    assert_eq!(l.closed(), closed(&["Home", "Jobs", "Jobs/Reviews"]));
}

#[test]
fn a_folder_moved_into_another_stays_closed() {
    let l = list();
    l.folders(&["Work", "Home"]);
    l.close("Work");
    ops::rename_folder(&l.stores, Scope::Project, "Work", "Home/Work").unwrap();
    assert_eq!(l.closed(), closed(&["Home/Work"]));
}

#[test]
fn changing_the_case_of_a_name_keeps_it_closed() {
    let l = list();
    l.folders(&["work"]);
    l.close("work");
    ops::rename_folder(&l.stores, Scope::Project, "work", "Work").unwrap();
    assert_eq!(l.closed(), closed(&["Work"]));
}

#[test]
fn a_deleted_folder_is_forgotten_and_what_it_held_keeps_its_fold() {
    let l = list();
    l.folders(&["Work", "Work/Reviews"]);
    l.close("Work");
    l.close("Work/Reviews");
    ops::delete_folder(&l.stores, Scope::Project, "Work").unwrap();
    assert_eq!(l.closed(), closed(&["Reviews"]));
}

#[test]
fn deleting_a_closed_folder_does_not_close_its_parent() {
    let l = list();
    l.folders(&["Work", "Work/Reviews"]);
    l.close("Work/Reviews");
    ops::delete_folder(&l.stores, Scope::Project, "Work/Reviews").unwrap();
    assert_eq!(l.closed(), closed(&[]));
}

#[test]
fn deleting_a_folder_leaves_a_closed_parent_closed() {
    let l = list();
    l.folders(&["Work", "Work/Reviews"]);
    l.close("Work");
    ops::delete_folder(&l.stores, Scope::Project, "Work/Reviews").unwrap();
    assert_eq!(l.closed(), closed(&["Work"]));
}

#[test]
fn a_folder_that_shares_only_a_prefix_is_left_alone() {
    let l = list();
    l.folders(&["Work", "Work notes"]);
    l.close("Work notes");
    ops::rename_folder(&l.stores, Scope::Project, "Work", "Jobs").unwrap();
    assert_eq!(l.closed(), closed(&["Work notes"]));
}

#[test]
fn a_file_that_cant_be_read_opens_everything_and_harms_nothing() {
    let l = list();
    l.close("Work");
    std::fs::write(l.folds_file(), "not json").unwrap();
    assert_eq!(l.closed(), closed(&[]));
    l.close("Home");
    assert_eq!(l.closed(), closed(&["Home"]));
}

#[test]
fn a_newer_file_still_reads() {
    let l = list();
    l.close("Work");
    std::fs::write(l.folds_file(), r#"{"closed":["Work"],"pinned":["Home"]}"#).unwrap();
    assert_eq!(l.closed(), closed(&["Work"]));
}

#[test]
fn a_bad_folder_name_is_refused() {
    let l = list();
    assert!(set(l.layout(), Some(" / "), false).is_err());
    assert!(!l.folds_file().exists());
}

#[test]
fn a_list_with_no_layout_keeps_nothing_and_says_nothing() {
    assert_eq!(set(None, Some("Work"), false), Ok(()));
    assert_eq!(read(None), ListFolds::default());
}

#[test]
fn outside_a_project_there_are_only_the_global_folds() {
    let dir = tempfile::tempdir().unwrap();
    let stores = Stores { global: store_at(dir.path(), "global"), project: None };
    set(stores.global.layout_path(), Some("Work"), false).unwrap();
    let folds = of(&stores);
    assert_eq!(folds.global.closed, closed(&["Work"]));
    assert_eq!(folds.project, ListFolds::default());
}

#[test]
fn the_wire_names_are_camel_case() {
    let folds = ListFolds { closed: closed(&["Work"]), others_open: true };
    assert_eq!(serde_json::to_value(&folds).unwrap(), serde_json::json!({ "closed": ["Work"], "othersOpen": true }));
}
