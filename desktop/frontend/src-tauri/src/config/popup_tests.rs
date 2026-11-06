use super::*;

fn yaml(text: &str) -> Value {
    serde_norway::from_str(text).unwrap()
}

#[test]
fn a_file_name_alone_picks_its_format_from_the_ending() {
    let def = parse(&yaml("popups/stars.html")).unwrap();
    assert_eq!(def.format, "html");
    assert_eq!(def.source, "popups/stars.html");
    assert_eq!((def.width, def.height), DEFAULT_SIZE);
    assert!(def.problem.is_empty());
    assert_eq!(parse(&yaml("https://example.com/x")).unwrap().format, "url");
}

#[test]
fn a_short_form_it_cant_read_says_how_to_name_the_format() {
    let def = parse(&yaml("$(./page.sh)")).unwrap();
    assert!(def.format.is_empty());
    assert!(def.problem.contains("html:"), "{}", def.problem);
}

#[test]
fn nothing_written_means_no_popup() {
    assert_eq!(parse(&Value::Null), None);
    assert_eq!(parse(&yaml("''")), None);
}

#[test]
fn a_map_reads_its_format_and_settings() {
    let def = parse(&yaml(
        "html: popups/stars.html\ndata: $(./scripts/stars.sh)\ntitle: GitHub stars\nsize: 380x200\nrefresh: 1m\n",
    ))
    .unwrap();
    assert_eq!(def.format, "html");
    assert_eq!(def.source, "popups/stars.html");
    assert_eq!(def.data, PopupData::Source("$(./scripts/stars.sh)".into()));
    assert_eq!(def.title, "GitHub stars");
    assert_eq!((def.width, def.height), (380, 200));
    assert_eq!(def.refresh, 60);
    assert!(def.problem.is_empty());
}

#[test]
fn data_written_in_the_config_arrives_as_json() {
    let def = parse(&yaml("html: page.html\ndata:\n  total: 3\n  names: [a, b]\n")).unwrap();
    assert_eq!(
        def.data,
        PopupData::Inline(serde_json::json!({ "total": 3, "names": ["a", "b"] }))
    );
}

#[test]
fn a_format_this_build_cant_show_still_reads() {
    let def = parse(&yaml("vega: popups/bundle.vl.json")).unwrap();
    assert_eq!(def.format, "vega");
    assert!(def.problem.is_empty());
    assert!(!SHOWN.contains(&def.format.as_str()));
}

#[test]
fn mistakes_become_problems_not_errors() {
    let none = parse(&yaml("title: Stars\n")).unwrap();
    assert!(none.problem.contains("format key"), "{}", none.problem);
    let two = parse(&yaml("html: a.html\nvega: b.vl.json\n")).unwrap();
    assert!(two.problem.contains("keep one"), "{}", two.problem);
    let empty = parse(&yaml("html: ''\n")).unwrap();
    assert!(empty.problem.contains("needs a page"), "{}", empty.problem);
    let list = parse(&yaml("[a, b]")).unwrap();
    assert!(!list.problem.is_empty());
}

#[test]
fn a_size_is_held_to_what_fits_and_a_bad_one_keeps_the_default() {
    assert_eq!(parse_size("380x220"), Some((380, 220)));
    assert_eq!(parse_size("5000 × 10"), Some((WIDTH.1, HEIGHT.0)));
    assert_eq!(parse_size("wide"), None);
    let def = parse(&yaml("html: a.html\nsize: big\n")).unwrap();
    assert_eq!((def.width, def.height), DEFAULT_SIZE);
}

#[test]
fn cache_keeps_a_result_for_its_time_or_thirty_seconds() {
    let def = parse(&yaml("html: a.html\ncache: 1m\n")).unwrap();
    assert_eq!(def.cache, 60);
    assert_eq!(parse(&yaml("html: a.html\ncache: 1\n")).unwrap().cache, MIN_CACHE_SECS);
    assert_eq!(parse(&yaml("html: a.html\ncache: soon\n")).unwrap().cache, DEFAULT_CACHE_SECS);
    assert_eq!(parse(&yaml("a.html")).unwrap().cache, DEFAULT_CACHE_SECS);
}

#[test]
fn refresh_runs_on_open_unless_it_names_an_interval() {
    assert_eq!(parse_refresh("open"), 0);
    assert_eq!(parse_refresh(""), 0);
    assert_eq!(parse_refresh("30"), 30);
    assert_eq!(parse_refresh("2s"), MIN_REFRESH_SECS);
    assert_eq!(parse_refresh("5m"), 300);
    assert_eq!(parse_refresh("1h"), 3600);
    assert_eq!(parse_refresh("soon"), 0);
}

#[test]
fn the_button_learns_the_popups_size_and_problem_but_not_its_commands() {
    let actions: BTreeMap<String, super::super::ActionDef> = serde_norway::from_str(
        "stars:\n  cmd: gh repo view --web\n  popup:\n    html: popups/stars.html\n    data: $(./stars.sh)\n    size: 380x200\n",
    )
    .unwrap();
    let info = super::super::action_to_info("stars", "stars", &actions["stars"].clone().into_full());
    let json = serde_json::to_value(info).unwrap();
    assert_eq!(
        json["popup"],
        serde_json::json!({ "format": "html", "width": 380, "height": 200 })
    );
}

#[test]
fn a_broken_popup_keeps_its_action() {
    let actions: BTreeMap<String, super::super::ActionDef> = serde_norway::from_str(
        "build:\n  cmd: make\n  popup: [not, a, page]\nship:\n  cmd: ./ship.sh\n  popup: 42\n",
    )
    .unwrap();
    let build = actions["build"].clone().into_full();
    assert_eq!(build.cmd, "make");
    assert!(!build.popup.unwrap().problem.is_empty());
    assert_eq!(actions["ship"].clone().into_full().cmd, "./ship.sh");
}
