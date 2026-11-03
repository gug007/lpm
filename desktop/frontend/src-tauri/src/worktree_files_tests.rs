use super::*;

fn repo() -> (tempfile::TempDir, String) {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_string_lossy().to_string();
    git_out(&root, &["init", "-q"]).unwrap();
    let write = |file: &str, body: &str| {
        let path = Path::new(&root).join(file);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, body).unwrap();
    };
    write(
        ".gitignore",
        ".env\n.env.local\n*.log\nnode_modules/\nconfig/master.key\n.env.example.ignored\n",
    );
    write(".env", "DATABASE_URL=postgres://localhost/app\n");
    write(".env.local", "DEBUG=1\n");
    write("config/master.key", "abc123\n");
    write("debug.log", "noise\n");
    write("node_modules/pkg/index.js", "module.exports = 1\n");
    write("README.md", "tracked later\n");
    (dir, root)
}

#[test]
fn candidates_are_ignored_files_with_local_ones_first() {
    let (_dir, root) = repo();
    let list = candidates(&root);
    let paths: Vec<&str> = list.iter().map(|c| c.path.as_str()).collect();
    assert_eq!(
        paths,
        [".env", ".env.local", "config/master.key", "debug.log"]
    );
    assert!(list[..3].iter().all(|c| c.suggested));
    assert!(!list[3].suggested);
    assert_eq!(
        list[0].size,
        "DATABASE_URL=postgres://localhost/app\n".len() as u64
    );
}

#[test]
fn without_a_choice_the_local_looking_files_come_along() {
    let (_dir, root) = repo();
    assert_eq!(
        suggested(&candidates(&root)).copy,
        [".env", ".env.local", "config/master.key"]
    );
}

#[test]
fn templates_and_build_output_dont_look_local() {
    assert!(looks_local(".env"));
    assert!(looks_local("apps/web/.env.production"));
    assert!(looks_local("settings.local.json"));
    assert!(looks_local("certs/dev.pem"));
    assert!(!looks_local(".env.example"));
    assert!(!looks_local("config/database.yml.sample"));
    assert!(!looks_local("dist/app.js"));
}

#[test]
fn paths_must_stay_inside_the_project() {
    assert!(safe_relative(".env"));
    assert!(safe_relative("config/master.key"));
    assert!(!safe_relative("../other/.env"));
    assert!(!safe_relative("/etc/passwd"));
    assert!(!safe_relative("./.env"));
    assert!(!safe_relative(" "));
}

#[test]
fn the_choice_is_written_and_cleared_in_place() {
    let mut doc: Yaml = serde_norway::from_str("name: app\nroot: /tmp/app\n").unwrap();
    let files = WorktreeFiles {
        copy: vec![".env".into()],
        link: vec!["config/master.key".into()],
    };
    assert!(apply(&mut doc, &files).unwrap());
    assert!(!apply(&mut doc, &files).unwrap());
    let text = serde_norway::to_string(&doc).unwrap();
    assert!(
        text.contains("worktreeFiles:\n  copy:\n  - .env\n  link:\n  - config/master.key\n"),
        "{text}"
    );
    assert_eq!(
        serde_norway::from_value::<WorktreeFiles>(doc.get(KEY).unwrap().clone()).unwrap(),
        files
    );

    assert!(apply(&mut doc, &WorktreeFiles::default()).unwrap());
    assert_eq!(doc.get(KEY), Some(&Yaml::Mapping(Mapping::new())));
    assert_eq!(doc.get("name").and_then(Yaml::as_str), Some("app"));
}

#[test]
fn bringing_copies_or_links_and_never_overwrites() {
    let (_dir, src) = repo();
    let dest = tempfile::tempdir().unwrap();
    std::fs::write(dest.path().join(".env.local"), "MINE=1\n").unwrap();
    let sources = [Path::new(&src)];

    bring_one(".env", &sources, dest.path(), false).unwrap();
    bring_one(".env.local", &sources, dest.path(), false).unwrap();
    bring_one("config/master.key", &sources, dest.path(), true).unwrap();
    bring_one("missing.key", &sources, dest.path(), false).unwrap();

    let read = |p: &str| std::fs::read_to_string(dest.path().join(p)).unwrap();
    assert_eq!(read(".env"), "DATABASE_URL=postgres://localhost/app\n");
    assert_eq!(read(".env.local"), "MINE=1\n");
    assert_eq!(read("config/master.key"), "abc123\n");
    assert!(!dest.path().join("missing.key").exists());
    #[cfg(unix)]
    assert!(dest
        .path()
        .join("config/master.key")
        .symlink_metadata()
        .unwrap()
        .file_type()
        .is_symlink());
}
