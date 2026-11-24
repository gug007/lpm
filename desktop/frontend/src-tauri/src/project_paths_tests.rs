use super::*;

fn root_of(dir: &tempfile::TempDir) -> String {
    dir.path().to_string_lossy().into_owned()
}

#[test]
fn a_path_in_the_project_says_where_in_it() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("src/api")).unwrap();
    std::fs::write(dir.path().join("src/api/server.ts"), "x").unwrap();
    let root = root_of(&dir);

    let abs = format!("{root}/src/api/server.ts");
    let found = locate_path(root.clone(), abs).unwrap();
    assert_eq!(found.kind, PathKind::File);
    assert_eq!(found.rel.as_deref(), Some("src/api/server.ts"));

    let found = locate_path(root.clone(), "./src/../src/api".into()).unwrap();
    assert_eq!(found.kind, PathKind::Dir);
    assert_eq!(found.rel.as_deref(), Some("src/api"));

    let found = locate_path(root.clone(), root.clone()).unwrap();
    assert_eq!(
        (found.kind, found.rel.as_deref()),
        (PathKind::Dir, Some(""))
    );
}

#[test]
fn a_path_outside_the_project_has_no_place_in_it() {
    let dir = tempfile::tempdir().unwrap();
    let other = tempfile::tempdir().unwrap();
    std::fs::write(other.path().join("app.log"), "x").unwrap();
    let abs = other.path().join("app.log");
    let found = locate_path(root_of(&dir), abs.to_string_lossy().into_owned()).unwrap();
    assert_eq!(found.kind, PathKind::File);
    assert_eq!(found.rel, None);
    assert_eq!(PathBuf::from(found.path), abs);

    let beside = format!("{}-other", root_of(&dir));
    assert_eq!(
        locate_path(root_of(&dir), beside).unwrap().kind,
        PathKind::Missing
    );
}

#[cfg(unix)]
#[test]
fn a_project_reached_through_a_link_is_still_the_project() {
    let dir = tempfile::tempdir().unwrap();
    let real = dir.path().join("real");
    std::fs::create_dir(&real).unwrap();
    std::fs::write(real.join("a.txt"), "x").unwrap();
    let link = dir.path().join("link");
    std::os::unix::fs::symlink(&real, &link).unwrap();
    let found = locate_path(
        link.to_string_lossy().into_owned(),
        real.join("a.txt").to_string_lossy().into_owned(),
    )
    .unwrap();
    assert_eq!(found.rel.as_deref(), Some("a.txt"));
}

#[test]
fn tells_files_from_folders_and_nothing() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("a b.csv"), "x").unwrap();
    std::fs::create_dir(dir.path().join("sub")).unwrap();
    let asked = ["a b.csv", "sub", "gone"].map(String::from).to_vec();
    assert_eq!(which_are_files(&root_of(&dir), &asked), [true, false, false]);
}

#[test]
fn lists_a_folder_outside_the_project() {
    let (dir, other) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
    std::fs::create_dir_all(other.path().join("api/.git")).unwrap();
    std::fs::create_dir(other.path().join(".git")).unwrap();
    std::fs::write(other.path().join("it's a.log"), "x").unwrap();
    let list = |path: &Path| list_folder(root_of(&dir), path.to_string_lossy().into_owned());
    let mut names: Vec<(String, bool)> = list(other.path())
        .unwrap()
        .into_iter()
        .map(|e| (e.name, e.is_dir))
        .collect();
    names.sort();
    assert_eq!(names, [("api".into(), true), ("it's a.log".into(), false)]);
    assert!(list(&other.path().join("gone")).is_err());
    assert!(list(&other.path().join("it's a.log")).is_err());
    assert!(list_folder(root_of(&dir), String::new()).is_err());
}

fn answer(fields: &[&str]) -> Vec<u8> {
    format!("Welcome back\nlpm-path:{}\0", fields.join("\0")).into_bytes()
}

#[test]
fn reads_a_hosts_answer_past_what_its_profile_printed() {
    let out = answer(&["f", "/srv/api", "/srv/api", "/var/log", "/var/log", "api.log"]);
    let found = parse_located(&out, "/var/log/api.log").unwrap();
    assert_eq!(found.kind, PathKind::File);
    assert_eq!(found.path, "/var/log/api.log");
    assert_eq!(found.rel, None);
}

#[test]
fn a_host_path_is_in_the_project_as_named_or_as_resolved() {
    let named = answer(&["f", "/srv/api", "/data/api", "/srv/api/cur", "/data/r5", "x.ts"]);
    let found = parse_located(&named, "cur/x.ts").unwrap();
    assert_eq!(found.rel.as_deref(), Some("cur/x.ts"));

    let resolved = answer(&["d", "/home/me/app", "/data/app", "/data/app/src", "/data/app/src", ""]);
    let found = parse_located(&resolved, "/data/app/src").unwrap();
    assert_eq!(found.rel.as_deref(), Some("src"));
    assert_eq!(found.path, "/data/app/src");

    let root = answer(&["d", "/srv/api", "/srv/api", "/srv/api", "/srv/api", ""]);
    assert_eq!(
        parse_located(&root, "/srv/api").unwrap().rel.as_deref(),
        Some("")
    );

    let sibling = answer(&["d", "/srv/api", "/srv/api", "/srv/api2", "/srv/api2", ""]);
    assert_eq!(parse_located(&sibling, "/srv/api2").unwrap().rel, None);
}

#[test]
fn a_file_at_a_hosts_top_level_keeps_one_slash() {
    let out = answer(&["f", "/", "/", "/", "/", "vmlinuz"]);
    let found = parse_located(&out, "/vmlinuz").unwrap();
    assert_eq!(found.path, "/vmlinuz");
    assert_eq!(found.rel.as_deref(), Some("vmlinuz"));
}

#[test]
fn what_a_host_lacks_is_missing_and_no_answer_is_none() {
    let out = answer(&["m", "/srv/api", "/srv/api", "/srv/api", "/srv/api", ""]);
    let found = parse_located(&out, "~/gone").unwrap();
    assert_eq!((found.kind, found.path.as_str()), (PathKind::Missing, "~/gone"));
    assert_eq!(parse_located(b"only a banner\n", "/x"), None);
}

/// The scripts themselves, run by this machine's `sh` as a host would.
#[cfg(unix)]
mod scripts {
    use super::*;
    use std::process::Command;

    fn output(script: &str, dir: &Path, home: &Path, args: &[&str]) -> std::process::Output {
        Command::new("sh")
            .args(["-c", script, "sh"])
            .args(args)
            .current_dir(dir)
            .env("HOME", home)
            .env_remove("PWD")
            .output()
            .unwrap()
    }

    fn run(script: &str, dir: &Path, home: &Path, args: &[&str]) -> Vec<u8> {
        let out = output(script, dir, home, args);
        assert!(out.status.success(), "{out:?}");
        out.stdout
    }

    fn host() -> (tempfile::TempDir, PathBuf, PathBuf) {
        let top = tempfile::tempdir().unwrap();
        let base = top.path().canonicalize().unwrap();
        let (project, home) = (base.join("srv/my app"), base.join("home"));
        std::fs::create_dir_all(project.join("src")).unwrap();
        std::fs::create_dir_all(home.join(".config")).unwrap();
        std::fs::write(project.join("src/it's.ts"), "x").unwrap();
        std::fs::write(home.join(".config/app.json"), "{}").unwrap();
        (top, project, home)
    }

    #[test]
    fn locate_finds_a_file_a_folder_and_nothing() {
        let (_top, project, home) = host();
        let at = |typed: &str| {
            parse_located(&run(LOCATE_SCRIPT, &project, &home, &[typed]), typed).unwrap()
        };
        let file = at("src/it's.ts");
        assert_eq!(file.kind, PathKind::File);
        assert_eq!(file.rel.as_deref(), Some("src/it's.ts"));
        assert_eq!(PathBuf::from(&file.path), project.join("src/it's.ts"));
        assert_eq!(at("./src").rel.as_deref(), Some("src"));
        assert_eq!(at(".").rel.as_deref(), Some(""));
        assert_eq!(at(&project.to_string_lossy()).rel.as_deref(), Some(""));

        let outside = at("~/.config/app.json");
        assert_eq!(outside.kind, PathKind::File);
        assert_eq!(PathBuf::from(&outside.path), home.join(".config/app.json"));
        assert_eq!(outside.rel, None);
        assert_eq!(at("~").kind, PathKind::Dir);
        assert_eq!(at("-n").kind, PathKind::Missing);
        assert_eq!(at("/no/such/file").kind, PathKind::Missing);
        assert_eq!(at("src/it's.ts/").kind, PathKind::Missing);
    }

    #[test]
    fn locate_finds_a_folder_it_cant_go_into() {
        use std::os::unix::fs::PermissionsExt;
        let (_top, project, home) = host();
        let outside = (home.join("locked"), "~/locked/", None);
        let inside = (project.join("shut"), "./src/../shut", Some("shut"));
        for (locked, typed, rel) in [outside, inside] {
            std::fs::create_dir(&locked).unwrap();
            std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o600)).unwrap();
            let found = parse_located(&run(LOCATE_SCRIPT, &project, &home, &[typed]), typed).unwrap();
            assert_eq!((found.kind, PathBuf::from(&found.path)), (PathKind::Dir, locked.clone()));
            assert_eq!(found.rel.as_deref(), rel);
            std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o700)).unwrap();
        }
    }

    #[test]
    fn list_reads_links_to_folders_as_folders_and_says_why_it_cant() {
        let (_top, project, home) = host();
        std::fs::create_dir_all(home.join("-n/it's here")).unwrap();
        std::fs::write(home.join("-n/a b.log"), "x").unwrap();
        std::os::unix::fs::symlink(home.join("-n/it's here"), home.join("-n/cur")).unwrap();
        std::os::unix::fs::symlink("gone", home.join("-n/broken")).unwrap();
        let list = |path: &Path| output(LIST_SCRIPT, &project, &home, &[&path.to_string_lossy()]);

        let out = list(&home.join("-n"));
        let listed = String::from_utf8_lossy(after_mark(&out.stdout).unwrap()).into_owned();
        let mut names: Vec<(String, bool)> = parse_tagged_listing(&listed)
            .into_iter()
            .map(|e| (e.name, e.is_dir))
            .collect();
        names.sort();
        let expected = [("a b.log", false), ("broken", false), ("cur", true), ("it's here", true)];
        assert_eq!(names, expected.map(|(n, d)| (n.to_string(), d)));

        let empty = list(&home.join("-n/it's here"));
        assert!(empty.status.success());
        assert_eq!(after_mark(&empty.stdout), Some(&b""[..]));

        let refused = |path: &Path| {
            let out = list(path);
            assert!(!out.status.success());
            String::from_utf8_lossy(&out.stderr).trim().to_string()
        };
        assert_eq!(refused(&home.join("gone")), "No such folder");
        assert_eq!(refused(&home.join("-n/a b.log")), "No such folder");

        use std::os::unix::fs::PermissionsExt;
        let locked = home.join("locked");
        std::fs::create_dir(&locked).unwrap();
        for mode in [0o311, 0o600] {
            std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(mode)).unwrap();
            // Root opens it all the same.
            if std::fs::metadata(locked.join(".")).is_err() || std::fs::read_dir(&locked).is_err() {
                assert_eq!(refused(&locked), "Permission denied");
            }
        }
    }

    #[test]
    fn exist_answers_each_path_in_order() {
        let (_top, project, home) = host();
        let args = ["src/it's.ts", "src", "~/.config/app.json", "/no/such"];
        let out = run(EXIST_SCRIPT, &project, &home, &args);
        assert_eq!(after_mark(&out).unwrap(), b"1010");
    }
}
