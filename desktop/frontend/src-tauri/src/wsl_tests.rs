use super::*;

fn target(distro: &str, linux: &str) -> Option<Target> {
    Some(Target {
        distro: distro.into(),
        linux: linux.into(),
    })
}

#[test]
fn reads_every_name_windows_gives_a_wsl_folder() {
    let want = target("Ubuntu", "/home/dana/app");
    assert_eq!(parse(r"\\wsl.localhost\Ubuntu\home\dana\app"), want);
    assert_eq!(parse(r"\\wsl$\Ubuntu\home\dana\app\"), want);
    assert_eq!(parse("//wsl.localhost/Ubuntu/home/dana/app"), want);
    assert_eq!(parse(r"\\?\UNC\wsl.localhost\Ubuntu\home\dana\app"), want);
    assert_eq!(parse(r"\\WSL.LOCALHOST\Ubuntu\home\dana\app"), want);
    assert_eq!(parse(r"\\wsl.localhost\Ubuntu-24.04"), target("Ubuntu-24.04", "/"));
}

#[test]
fn anything_else_is_not_wsl() {
    assert_eq!(parse(r"C:\Users\dana\app"), None);
    assert_eq!(parse(r"\\server\share\app"), None);
    assert_eq!(parse(r"\\wsl.localhost"), None);
    assert_eq!(parse("/home/dana/app"), None);
    assert_eq!(parse("~/Projects/app"), None);
}

#[test]
fn windows_names_for_linux_paths() {
    assert_eq!(windows_path("Ubuntu", "/home/dana/app"), r"\\wsl.localhost\Ubuntu\home\dana\app");
    assert_eq!(windows_path("Ubuntu", "/"), r"\\wsl.localhost\Ubuntu");
    assert_eq!(windows_path("Ubuntu", "/mnt/c/Users/dana"), r"C:\Users\dana");
    assert_eq!(windows_path("Ubuntu", "/mnt/d"), r"D:\");
    assert_eq!(windows_path("Ubuntu", "/mnt/wsl/shared"), r"\\wsl.localhost\Ubuntu\mnt\wsl\shared");
}

#[test]
fn linux_names_for_windows_paths() {
    assert_eq!(linux_path(r"\\wsl$\Debian\srv\app").as_deref(), Some("/srv/app"));
    assert_eq!(linux_path(r"C:\Users\dana\app").as_deref(), Some("/mnt/c/Users/dana/app"));
    assert_eq!(linux_path("D:/work/").as_deref(), Some("/mnt/d/work"));
    assert_eq!(linux_path(r"E:\").as_deref(), Some("/mnt/e"));
    assert_eq!(linux_path(r"\\server\share"), None);
    assert_eq!(linux_path("relative/dir"), None);
}

#[test]
fn a_round_trip_lands_where_it_started() {
    for path in [r"\\wsl.localhost\Ubuntu\home\dana\app", r"C:\Users\dana\app"] {
        let linux = linux_path(path).unwrap();
        assert_eq!(windows_path("Ubuntu", &linux), path);
    }
}

#[test]
fn a_cwd_joins_the_linux_root() {
    assert_eq!(join("/home/dana/app", ""), "/home/dana/app");
    assert_eq!(join("/home/dana/app/", "web"), "/home/dana/app/web");
    assert_eq!(join("/home/dana/app", r"packages\api\"), "/home/dana/app/packages/api");
    assert_eq!(join("/home/dana/app", "/srv/other"), "/srv/other");
}

#[test]
fn lists_the_distros_whatever_the_language() {
    let english = "  NAME            STATE           VERSION\n* Ubuntu-24.04    Running         2\n  Debian          Stopped         2\n  docker-desktop  Running         2\n  Legacy          Stopped         1\n";
    assert_eq!(
        parse_list(english),
        vec![
            Distro { name: "Ubuntu-24.04".into(), is_default: true, version: 2, running: true },
            Distro { name: "Debian".into(), is_default: false, version: 2, running: false },
            Distro { name: "Legacy".into(), is_default: false, version: 1, running: false },
        ]
    );
    let german = "  NAME      STATUS         VERSION\n* Ubuntu    Wird ausgeführt    2\n";
    let list = parse_list(german);
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].name, "Ubuntu");
    assert!(list[0].is_default);
}

#[test]
fn no_wsl_lists_nothing() {
    assert!(parse_list("").is_empty());
    assert!(parse_list("Windows Subsystem for Linux has no installed distributions.\n").is_empty());
}

#[test]
fn decodes_wsl_exe_output_either_way() {
    let text = "* Ubuntu Running 2\r\n";
    let utf16: Vec<u8> = text.encode_utf16().flat_map(u16::to_le_bytes).collect();
    assert_eq!(decode(&utf16), text);
    assert_eq!(decode(text.as_bytes()), text);
}

#[test]
fn a_service_line_runs_in_the_distro_login_shell() {
    let mut env = BTreeMap::new();
    env.insert("PORT".to_string(), "3000".to_string());
    let script = script("/home/dana/app/web", &env, "pnpm dev");
    assert_eq!(script, "cd '/home/dana/app/web' && export PORT='3000' && pnpm dev");
    assert_eq!(
        login_args("Ubuntu", &script),
        ["-d", "Ubuntu", "--exec", "bash", "-ilc", script.as_str()]
    );
    assert_eq!(
        pane_line("Ubuntu", "cd '/srv' && ls"),
        r#"MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' wsl.exe '-d' 'Ubuntu' '--exec' 'bash' '-ilc' 'cd '\''/srv'\'' && ls'"#
    );
}

#[test]
fn git_runs_straight_and_other_tools_through_a_login_shell() {
    assert_eq!(
        tool_args("Ubuntu", "/home/dana/app", "git", &["status", "--porcelain"], &[("GIT_OPTIONAL_LOCKS", "0")]),
        ["-d", "Ubuntu", "--cd", "/home/dana/app", "--exec", "env", "GIT_OPTIONAL_LOCKS=0", "git", "status", "--porcelain"]
    );
    let gh = tool_args("Ubuntu", "/srv", "gh", &["pr", "view"], &[]);
    assert_eq!(&gh[..5], ["-d", "Ubuntu", "--cd", "/srv", "--exec"]);
    assert_eq!(&gh[5..8], ["sh", "-c", LOGIN_EXEC]);
    assert_eq!(&gh[8..], ["sh", "env", "gh", "pr", "view"]);
}

#[cfg(unix)]
#[test]
fn the_login_exec_runs_the_tool_with_its_arguments_and_env() {
    let out = std::process::Command::new("sh")
        .args(["-c", LOGIN_EXEC, "sh", "env", "LPM_T=it works", "sh", "-c", "printf '%s|%s' \"$LPM_T\" \"$1\"", "x", "two words"])
        .output()
        .unwrap();
    assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
    assert_eq!(String::from_utf8_lossy(&out.stdout), "it works|two words");
}
