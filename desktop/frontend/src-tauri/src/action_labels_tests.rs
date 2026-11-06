use super::*;

fn action(name: &str, label: &str) -> ActionInfo {
    ActionInfo {
        name: name.into(),
        label: label.into(),
        ..Default::default()
    }
}

/// Settles what a `$(cmd)` in `root` printed, as a finished run would.
fn settle(project: &str, root: &str, cmd: &str, out: &str) {
    let mut env = std::collections::BTreeMap::new();
    env.insert("LPM_PROJECT_NAME".to_string(), project.to_string());
    let script = config::build_local_script(&env, cmd);
    crate::label_probes::finish(&format!("\n{root}\n{script}"), Some(out.into()));
}

#[test]
fn format_age_uses_one_coarse_unit() {
    assert_eq!(format_age(-5), "just now");
    assert_eq!(format_age(59), "just now");
    assert_eq!(format_age(60), "1m ago");
    assert_eq!(format_age(3 * 3600 + 59), "3h ago");
    assert_eq!(format_age(2 * 86_400), "2d ago");
    assert_eq!(format_age(15 * 86_400), "2w ago");
    assert_eq!(format_age(60 * 86_400), "2mo ago");
    assert_eq!(format_age(800 * 86_400), "2y ago");
}

#[test]
fn parse_every_reads_units_and_keeps_a_floor() {
    assert_eq!(parse_every(""), Duration::from_secs(60));
    assert_eq!(parse_every("30"), Duration::from_secs(30));
    assert_eq!(parse_every("45s"), Duration::from_secs(45));
    assert_eq!(parse_every("10m"), Duration::from_secs(600));
    assert_eq!(parse_every("2h"), Duration::from_secs(7200));
    assert_eq!(parse_every("1"), Duration::from_secs(5));
    assert_eq!(parse_every("soon"), Duration::from_secs(60));
    assert_eq!(parse_every("5d"), Duration::from_secs(60));
}

#[test]
fn apply_renders_labels_down_the_tree_and_keeps_the_template() {
    let dir = tempfile::tempdir().unwrap();
    let git = dir.path().join(".git");
    std::fs::create_dir_all(&git).unwrap();
    std::fs::write(git.join("HEAD"), "ref: refs/heads/feature/x\n").unwrap();
    let root = dir.path().to_str().unwrap();
    let ctx = Ctx {
        project: "app",
        root,
        ssh: None,
        held: &Default::default(),
    };
    let mut parent = action("deploy", "Deploy {{git.branch}}");
    parent.children = vec![
        action("deploy:staging", "Staging"),
        action("deploy:prod", "{{bump}}"),
    ];
    let mut list = vec![parent, action("build", "Build")];
    apply(&ctx, &mut list);

    assert_eq!(list[0].label, "Deploy feature/x");
    assert_eq!(list[0].config_label, "Deploy {{git.branch}}");
    assert_eq!(list[0].children[0].label, "Staging");
    assert_eq!(list[0].children[0].config_label, "");
    assert_eq!(list[0].children[1].label, "{{bump}}");
    assert_eq!(list[0].children[1].config_label, "");
    assert_eq!(list[1].config_label, "");

    let json = serde_json::to_value(&list[0]).unwrap();
    assert_eq!(json["label"], "Deploy feature/x");
    assert_eq!(json["configLabel"], "Deploy {{git.branch}}");
    assert!(serde_json::to_value(&list[1])
        .unwrap()
        .get("configLabel")
        .is_none());
}

#[test]
fn apply_falls_back_to_the_key_when_nothing_is_left() {
    let ctx = Ctx {
        project: "app",
        root: "",
        ssh: None,
        held: &Default::default(),
    };
    let mut list = vec![action("menu:release", "{{git.tag}}")];
    apply(&ctx, &mut list);
    assert_eq!(list[0].label, "release");
    assert_eq!(list[0].config_label, "{{git.tag}}");
}

#[test]
fn ages_moved_reports_a_changed_reading_once() {
    let key = "test|ages|".to_string();
    let at = now_unix() - 120;
    assert_eq!(age_of(key.clone(), at), "2m ago");
    ages().lock().unwrap().get_mut(&key).unwrap().at = at - 120;
    assert!(ages_moved());
    assert_eq!(ages().lock().unwrap()[&key].text, "4m ago");
}

#[test]
fn apply_renders_input_and_option_labels_and_keeps_their_templates() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    let git = |args: &[&str]| {
        crate::git::git_out_env(root, args, &crate::gitworkstate::LPM_IDENTITY).unwrap()
    };
    git(&["init", "-q", "-b", "main"]);
    git(&["commit", "-q", "--allow-empty", "-m", "one"]);
    git(&["tag", "v0.7.13"]);
    git(&["tag", "v0.7.2"]);
    git(&["tag", "docs-1"]);
    let ctx = Ctx {
        project: "app",
        root,
        ssh: None,
        held: &Default::default(),
    };
    let option = |label: &str, value: &str| crate::config::ActionInputOption {
        label: label.into(),
        value: value.into(),
        ..Default::default()
    };
    let mut release = action("release", "🚀 Release");
    release.inputs = vec![crate::config::ActionInputInfo {
        key: "bump".into(),
        label: "Release from {{git.branch}}".into(),
        options: vec![
            option("Patch — bug fixes ({{git.nextPatch:v*}})", "patch"),
            option("Minor — new features ({{git.nextMinor:v*}})", "minor"),
            option("Major", "major"),
        ],
        ..Default::default()
    }];
    let mut list = vec![release];
    apply(&ctx, &mut list);

    let input = &list[0].inputs[0];
    assert_eq!(input.label, "Release from main");
    assert_eq!(input.config_label, "Release from {{git.branch}}");
    assert_eq!(input.options[0].label, "Patch — bug fixes (v0.7.14)");
    assert_eq!(
        input.options[0].config_label,
        "Patch — bug fixes ({{git.nextPatch:v*}})"
    );
    assert_eq!(input.options[1].label, "Minor — new features (v0.8.0)");
    assert_eq!(input.options[2].label, "Major");
    assert_eq!(input.options[2].config_label, "");
    assert_eq!(list[0].config_label, "");

    let json = serde_json::to_value(&list[0]).unwrap();
    assert_eq!(
        json["inputs"][0]["configLabel"],
        "Release from {{git.branch}}"
    );
    assert_eq!(
        json["inputs"][0]["options"][1]["label"],
        "Minor — new features (v0.8.0)"
    );
    assert!(json["inputs"][0]["options"][2].get("configLabel").is_none());
}

#[test]
fn the_emoji_takes_variables() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join(".git")).unwrap();
    std::fs::write(
        dir.path().join(".git").join("HEAD"),
        "ref: refs/heads/main\n",
    )
    .unwrap();
    let ctx = Ctx {
        project: "app",
        root: dir.path().to_str().unwrap(),
        ssh: None,
        held: &Default::default(),
    };
    let mut deploy = action("deploy", "Deploy");
    deploy.emoji = "{{git.branch}}".into();
    let mut list = vec![deploy];
    apply(&ctx, &mut list);
    assert_eq!(list[0].emoji, "main");
    assert_eq!(list[0].config_emoji.as_deref(), Some("{{git.branch}}"));
}

#[test]
fn commands_fill_the_label_emoji_and_options_once_they_have_run() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_str().unwrap();
    let ctx = Ctx {
        project: "commands-test",
        root,
        ssh: None,
        held: &Default::default(),
    };
    let build = || {
        let mut release = action("release", "Release · $(git describe --tags)");
        release.emoji = "$(./pending.sh)".into();
        release.inputs = vec![crate::config::ActionInputInfo {
            key: "bump".into(),
            label: "bump".into(),
            options: vec![crate::config::ActionInputOption {
                label: "Patch ($(./next.sh patch))".into(),
                value: "patch".into(),
                ..Default::default()
            }],
            ..Default::default()
        }];
        let mut ship = action("ship", "Ship");
        ship.emoji = "🚀".into();
        vec![release, ship]
    };
    let mut list = build();
    apply(&ctx, &mut list);
    assert_eq!(list[0].label, "Release");
    assert_eq!(list[0].config_label, "Release · $(git describe --tags)");
    assert_eq!(list[0].emoji, "");
    assert_eq!(list[0].config_emoji.as_deref(), Some("$(./pending.sh)"));
    assert_eq!(list[0].inputs[0].options[0].label, "Patch");
    let json = serde_json::to_value(&list[0]).unwrap();
    assert!(json.get("emoji").is_none());
    assert_eq!(json["configEmoji"], "$(./pending.sh)");

    settle("commands-test", root, "git describe --tags", "v0.7.13");
    settle("commands-test", root, "./pending.sh", "🟡 3 unreleased");
    settle("commands-test", root, "./next.sh patch", "v0.7.14");
    let mut list = build();
    apply(&ctx, &mut list);
    assert_eq!(list[0].label, "Release · v0.7.13");
    assert_eq!(list[0].emoji, "🟡");
    assert_eq!(list[0].inputs[0].options[0].label, "Patch (v0.7.14)");
    assert_eq!(
        list[0].inputs[0].options[0].config_label,
        "Patch ($(./next.sh patch))"
    );
    assert_eq!(list[1].emoji, "🚀");
    assert_eq!(list[1].config_emoji, None);
}

#[test]
fn a_held_command_reads_as_empty_even_after_it_ran() {
    let held: BTreeSet<String> = ["./stars.sh".to_string()].into();
    let ctx = Ctx {
        project: "held-test",
        root: "",
        ssh: None,
        held: &held,
    };
    settle("held-test", "", "./stars.sh", "248");
    let mut stars = action("stars", "Stars $(./stars.sh)");
    stars.label_svg = "$(./stars.sh)".into();
    let mut list = vec![stars];
    apply(&ctx, &mut list);
    assert_eq!(list[0].label, "Stars");
    assert_eq!(list[0].config_label, "Stars $(./stars.sh)");
    assert_eq!(list[0].label_svg, "");
}
