use super::*;
use crate::config::popup::PopupDef;

fn site(root: &std::path::Path, def: PopupDef) -> PopupSite {
    PopupSite {
        def: PopupDef {
            width: 360,
            height: 220,
            ..def
        },
        cwd: String::new(),
        env: BTreeMap::new(),
        root: root.to_string_lossy().into_owned(),
        ssh: None,
        held: Default::default(),
    }
}

fn html(source: &str) -> PopupDef {
    PopupDef {
        format: "html".into(),
        source: source.into(),
        ..Default::default()
    }
}

#[test]
fn a_command_is_the_whole_value_or_nothing() {
    assert_eq!(command_of("$(./page.sh --x)"), Some("./page.sh --x"));
    assert_eq!(command_of("  $( echo (a) )  "), Some("echo (a)"));
    assert_eq!(command_of("page.html"), None);
    assert_eq!(command_of("$()"), None);
    assert_eq!(command_of("v $(x)"), None);
}

#[test]
fn json_is_found_after_a_line_the_shell_printed_first() {
    assert_eq!(parse_json(" {\"a\": 1}\n"), Some(serde_json::json!({ "a": 1 })));
    assert_eq!(
        parse_json("Restored session\n[1, 2]\n"),
        Some(serde_json::json!([1, 2]))
    );
    assert_eq!(parse_json("12 commits"), None);
}

#[test]
fn a_page_file_comes_with_where_it_is() {
    let tmp = tempfile::tempdir().unwrap();
    std::fs::write(tmp.path().join("stars.html"), "<h1>stars</h1>").unwrap();
    let out = make("p", "stars", &site(tmp.path(), html("stars.html")));
    assert_eq!(out.html.as_deref(), Some("<h1>stars</h1>"));
    assert!(out.file.unwrap().ends_with("stars.html"));
    assert!(out.error.is_empty());
    assert_eq!(out.data, Value::Null);
}

#[test]
fn a_page_written_in_the_config_is_the_page() {
    let tmp = tempfile::tempdir().unwrap();
    let out = make("p", "a", &site(tmp.path(), html("<p>hi</p>")));
    assert_eq!(out.html.as_deref(), Some("<p>hi</p>"));
    assert_eq!(out.file, None);
}

#[test]
fn a_missing_page_is_an_error_the_card_shows() {
    let tmp = tempfile::tempdir().unwrap();
    let out = make("p", "a", &site(tmp.path(), html("gone.html")));
    assert_eq!(out.html, None);
    assert_eq!(out.error, "Can't find gone.html.");
}

#[test]
fn a_config_problem_or_a_format_not_shown_yet_reads_as_an_error() {
    let tmp = tempfile::tempdir().unwrap();
    let broken = PopupDef {
        problem: "This popup's config needs a format key.".into(),
        ..Default::default()
    };
    let out = make("p", "a", &site(tmp.path(), broken));
    assert_eq!(out.error, "This popup's config needs a format key.");
    let vega = PopupDef {
        format: "vega".into(),
        source: "b.vl.json".into(),
        ..Default::default()
    };
    let out = make("p", "a", &site(tmp.path(), vega));
    assert!(out.error.contains("can't show `vega`"), "{}", out.error);
}

#[test]
fn inline_data_arrives_as_written() {
    let tmp = tempfile::tempdir().unwrap();
    let def = PopupDef {
        data: PopupData::Inline(serde_json::json!({ "n": 1 })),
        ..html("<p></p>")
    };
    let out = make("p", "a", &site(tmp.path(), def));
    assert_eq!(out.data, serde_json::json!({ "n": 1 }));
}

#[cfg(unix)]
mod commands {
    use super::*;

    fn with_data(source: &str) -> PopupDef {
        PopupDef {
            data: PopupData::Source(source.into()),
            ..html("<p></p>")
        }
    }

    #[test]
    fn json_output_is_data_and_other_output_is_text() {
        let tmp = tempfile::tempdir().unwrap();
        let out = make("p", "a", &site(tmp.path(), with_data("$(echo '{\"total\": 3}')")));
        assert_eq!(out.data, serde_json::json!({ "total": 3 }));
        assert!(out.text.is_empty());
        let out = make("p", "a", &site(tmp.path(), with_data("$(echo 12 commits)")));
        assert_eq!(out.data, Value::Null);
        assert_eq!(out.text.trim(), "12 commits");
    }

    #[test]
    fn a_failing_data_command_keeps_the_page() {
        let tmp = tempfile::tempdir().unwrap();
        let out = make("p", "a", &site(tmp.path(), with_data("$(echo 'bad token' >&2; exit 1)")));
        assert_eq!(out.html.as_deref(), Some("<p></p>"));
        assert_eq!(out.data_error, "The data command exited with 1: bad token.");
    }

    #[test]
    fn the_page_command_sees_the_project_and_action() {
        let tmp = tempfile::tempdir().unwrap();
        let def = html("$(printf '<p>%s %s</p>' \"$LPM_PROJECT_NAME\" \"$LPM_ACTION\")");
        let out = make("web", "stars", &site(tmp.path(), def));
        assert_eq!(out.html.as_deref(), Some("<p>web stars</p>"));
    }

    #[test]
    fn a_page_command_that_prints_nothing_is_an_error() {
        let tmp = tempfile::tempdir().unwrap();
        let out = make("p", "a", &site(tmp.path(), html("$(true)")));
        assert_eq!(out.error, "The page is empty.");
    }
}

#[test]
fn a_held_command_says_why_and_runs_nothing() {
    let tmp = tempfile::tempdir().unwrap();
    let marker = tmp.path().join("ran");
    let command = format!("touch {}", marker.display());
    let mut held_site = site(tmp.path(), html(&format!("$({command})")));
    held_site.held.insert(command);
    let out = make("p", "a", &held_site);
    assert!(out.error.contains("wait until you allow them"), "{}", out.error);
    assert!(out.html.is_none());
    assert!(!marker.exists());
}
