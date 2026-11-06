use super::*;

#[test]
fn first_line_skips_blank_lines_and_colors() {
    assert_eq!(
        first_line("\n  \n\u{1b}[32mv1.2.0\u{1b}[0m\nmore\n"),
        "v1.2.0"
    );
    assert_eq!(first_line(""), "");
}

#[test]
fn first_line_drops_what_a_login_shell_prints_before_the_command() {
    assert_eq!(
        first_line(
            "\u{1b}]1337;RemoteHost=u@mac.local\u{7}\u{1b}]1337;CurrentDir=/x\u{7}154\n"
        ),
        "154"
    );
    assert_eq!(
        first_line("\u{1b}]8;;https://x.dev\u{1b}\\v1.2\u{1b}]8;;\u{1b}\\\n"),
        "v1.2"
    );
}

#[test]
fn first_line_cuts_long_output() {
    let long = "x".repeat(100);
    let line = first_line(&long);
    assert_eq!(line.chars().count(), MAX_CHARS);
    assert!(line.ends_with('…'));
}

#[test]
fn a_probe_is_shared_and_refreshed_by_project() {
    let ssh = None;
    let out = read(
        ("p1", "a"),
        ssh,
        "/tmp/x".into(),
        "echo shared-probe".into(),
        Duration::from_secs(60),
        false,
    );
    assert_eq!(out, "");
    read(
        ("p2", "a"),
        ssh,
        "/tmp/x".into(),
        "echo shared-probe".into(),
        Duration::from_secs(30),
        false,
    );
    let key = "\n/tmp/x\necho shared-probe";
    {
        let mut probes = probes().lock().unwrap();
        let probe = probes.get_mut(key).unwrap();
        assert_eq!(probe.every(), Duration::from_secs(30));
        assert!(probe.owners.contains_key(&("p1".into(), "a".into())));
        assert!(probe.owners.contains_key(&("p2".into(), "a".into())));
        probe.due = false;
    }
    refresh_project("p2");
    assert!(probes().lock().unwrap()[key].due);
}

#[test]
fn a_changed_interval_replaces_the_old_one() {
    let key = "\n/tmp/w\necho interval";
    let listing = |every| {
        read(
            ("p", "stars"),
            None,
            "/tmp/w".into(),
            "echo interval".into(),
            every,
            false,
        )
    };
    listing(Duration::from_secs(60));
    listing(Duration::from_secs(600));
    assert_eq!(
        probes().lock().unwrap()[key].every(),
        Duration::from_secs(600)
    );
}

#[test]
fn finish_keeps_the_last_output_when_a_run_fails() {
    let key = "\n/tmp/y\necho keep";
    read(
        ("p", "a"),
        None,
        "/tmp/y".into(),
        "echo keep".into(),
        Duration::from_secs(60),
        false,
    );
    finish(key, Some("v1".into()));
    finish(key, None);
    assert_eq!(probes().lock().unwrap()[key].output.as_deref(), Some("v1"));
}

#[cfg(unix)]
#[test]
fn a_command_that_exits_non_zero_is_a_failed_run() {
    let counted = crate::shellpath::sh_script("echo 3");
    assert_eq!(run_with_timeout(counted).as_deref(), Some(&b"3\n"[..]));
    let refused = crate::shellpath::sh_script(
        "printf '{\\n  \"message\": \"You have exceeded a secondary rate limit.\"\\n}\\n'; exit 1",
    );
    assert_eq!(run_with_timeout(refused), None);
}

#[test]
fn hovering_refreshes_the_action_and_its_menu_unless_it_just_ran() {
    let every = Duration::from_secs(60);
    for (action, script) in [
        ("rel", "echo h1"),
        ("rel:patch", "echo h2"),
        ("relx", "echo h3"),
    ] {
        read(("hp", action), None, "/tmp/h".into(), script.into(), every, false);
    }
    let keys = [
        "\n/tmp/h\necho h1",
        "\n/tmp/h\necho h2",
        "\n/tmp/h\necho h3",
    ];
    for key in keys {
        let mut probes = probes().lock().unwrap();
        let probe = probes.get_mut(key).unwrap();
        probe.due = false;
        probe.ran_at = Some(Instant::now() - HOVER_GAP);
    }
    refresh_action("hp", "rel", HOVER_GAP);
    let due: Vec<bool> = keys
        .iter()
        .map(|k| probes().lock().unwrap()[*k].due)
        .collect();
    assert_eq!(due, [true, true, false]);

    probes().lock().unwrap().get_mut(keys[0]).unwrap().due = false;
    probes().lock().unwrap().get_mut(keys[0]).unwrap().ran_at = Some(Instant::now());
    refresh_action("hp", "rel", HOVER_GAP);
    assert!(!probes().lock().unwrap()[keys[0]].due);
    refresh_action("hp", "rel", Duration::ZERO);
    assert!(probes().lock().unwrap()[keys[0]].due);
}

#[test]
fn a_change_reruns_the_commands_but_defers_one_that_just_ran() {
    let every = Duration::from_secs(60);
    for (action, script) in [
        ("todos", "echo c1"),
        ("todos:open", "echo c2"),
        ("other", "echo c3"),
    ] {
        read(("cp", action), None, "/tmp/c".into(), script.into(), every, false);
    }
    let keys = [
        "\n/tmp/c\necho c1",
        "\n/tmp/c\necho c2",
        "\n/tmp/c\necho c3",
    ];
    for key in keys {
        let mut probes = probes().lock().unwrap();
        let probe = probes.get_mut(key).unwrap();
        probe.due = false;
        probe.ran_at = Some(Instant::now() - CHANGE_GAP);
    }
    assert!(refresh_for_change("cp", "todos"));
    let due: Vec<bool> = keys
        .iter()
        .map(|k| probes().lock().unwrap()[*k].due)
        .collect();
    assert_eq!(due, [true, true, false]);

    for key in &keys[..2] {
        let mut probes = probes().lock().unwrap();
        let probe = probes.get_mut(*key).unwrap();
        probe.due = false;
        probe.ran_at = Some(Instant::now());
    }
    assert!(!refresh_for_change("cp", "todos"));
    assert!(!probes().lock().unwrap()[keys[0]].due);

    probes().lock().unwrap().get_mut(keys[0]).unwrap().running = true;
    probes().lock().unwrap().get_mut(keys[1]).unwrap().ran_at = Some(Instant::now() - CHANGE_GAP);
    assert!(refresh_for_change("cp", "todos"));
    assert!(probes().lock().unwrap()[keys[0]].due);
}

#[test]
fn markup_keeps_every_line_from_the_first_tag() {
    assert_eq!(markup("Restored session\n<svg>\n<rect/></svg>\n"), "<svg>\n<rect/></svg>");
    assert_eq!(markup("<?xml version=\"1.0\"?>\n<svg></svg>"), "<svg></svg>");
    assert_eq!(markup("loaded <3 plugins\n<svg></svg>"), "<svg></svg>");
    assert_eq!(markup("<div>149</div>"), "");
    assert_eq!(markup("no markup here"), "");
    assert_eq!(markup(&format!("<svg>{}</svg>", "x".repeat(MAX_MARKUP))), "");
}
