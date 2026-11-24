use super::*;

fn entry(name: &str, is_dir: bool) -> DirEntryInfo {
    DirEntryInfo {
        name: name.into(),
        is_dir,
        is_symlink: false,
        is_ignored: false,
    }
}

fn changed(path: &str, status: &str) -> ChangedFile {
    ChangedFile {
        path: path.into(),
        status: status.into(),
        staged: false,
    }
}

#[test]
fn a_typed_path_is_answered_with_where_it_leads() {
    use crate::project_paths::PathKind;
    let found = LocatedPath {
        kind: PathKind::Dir,
        path: "/work/shop/src".into(),
        rel: Some("src".into()),
    };
    assert_eq!(
        locate_reply("shop", "./src", Ok(found)),
        json!({ "t": "locatePath", "project": "shop", "path": "./src", "ok": true,
                "kind": "dir", "at": "/work/shop/src", "rel": "src" })
    );
    let outside = LocatedPath {
        kind: PathKind::File,
        path: "/var/log/app.log".into(),
        rel: None,
    };
    assert!(locate_reply("shop", "/var/log/app.log", Ok(outside))["rel"].is_null());
    let failed = locate_reply("shop", "/x", Err("no such project".into()));
    assert_eq!((&failed["ok"], &failed["error"]), (&json!(false), &json!("no such project")));
}

#[test]
fn a_folder_outside_the_project_is_listed_by_its_absolute_path() {
    let (project, other) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
    std::fs::write(other.path().join("notes 10.md"), "x").unwrap();
    std::fs::write(other.path().join("notes 2.md"), "x").unwrap();
    std::fs::create_dir(other.path().join("sub")).unwrap();
    let root = project.path().to_string_lossy().into_owned();
    let rows = outside_rows(&root, &other.path().to_string_lossy()).unwrap();
    let names: Vec<&str> = rows.iter().filter_map(|r| r["name"].as_str()).collect();
    assert_eq!(names, ["sub", "notes 2.md", "notes 10.md"]);
    assert_eq!(rows[0], json!({ "name": "sub", "dir": true, "ignored": false }));

    // Trimmed to a project folder of that name, it isn't there.
    assert!(project_rows(&root, &other.path().to_string_lossy()).is_err());
    assert!(outside_rows(&root, "/no/such/folder").is_err());
}

#[test]
fn folders_come_first_then_names_in_natural_order() {
    let mut list = vec![
        entry("file10.ts", false),
        entry("b", true),
        entry("File2.ts", false),
        entry("A", true),
        entry("file1.ts", false),
    ];
    list.sort_by(compare_entries);
    let names: Vec<&str> = list.iter().map(|e| e.name.as_str()).collect();
    assert_eq!(names, ["A", "b", "file1.ts", "File2.ts", "file10.ts"]);
}

#[test]
fn leading_zeros_and_case_still_order_stably() {
    assert_eq!(natural_cmp("a01", "a1"), Ordering::Equal);
    assert_eq!(natural_cmp("a2", "a10"), Ordering::Less);
    assert_eq!(natural_cmp("Zeta", "alpha"), Ordering::Greater);
    assert_eq!(natural_cmp("é", "e"), Ordering::Greater);
}

#[test]
fn a_changed_file_carries_its_status_and_a_folder_its_count() {
    let changes = [
        changed("src/app/page.tsx", "modified"),
        changed("src/app/checkout/pay.tsx", "added"),
        changed("src/app/checkout/tax.ts", "modified"),
        changed("src/application.ts", "modified"),
    ];
    let file = entry_json(&entry("page.tsx", false), "src/app/page.tsx", &changes);
    assert_eq!(file["status"], "modified");
    assert!(file.get("changed").is_none());

    let folder = entry_json(&entry("checkout", true), "src/app/checkout", &changes);
    assert_eq!(folder["changed"], 2);
    assert!(folder.get("status").is_none());

    let app = entry_json(&entry("app", true), "src/app", &changes);
    assert_eq!(app["changed"], 3);

    let clean = entry_json(&entry("README.md", false), "README.md", &changes);
    assert_eq!(
        clean,
        json!({ "name": "README.md", "dir": false, "ignored": false })
    );
}
