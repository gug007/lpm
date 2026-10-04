use super::{
    string_at, string_keys, validate_keys, validate_number_field, validate_string_field, Mapping,
    Report, Value,
};

// Any name can be a zone: the CLI checks one file at a time and can't see
// zones declared in the others. The app shows a button whose zone is missing
// in the header.
pub(super) fn validate_display(map: &Mapping, path: &str, report: &mut Report) {
    let Some(display) = string_at(map, "display") else {
        return;
    };
    let field = format!("{path}.display");
    if display == "button" {
        report.error(&field, "button is deprecated; use header");
    } else if display.contains(':') {
        report.error(&field, "expected header, footer or a zone name without ':'");
    }
}

pub(super) fn validate_zones(root: &Mapping, report: &mut Report) {
    let Some(value) = root.get(Value::String("zones".into())) else {
        return;
    };
    let Some(zones) = value.as_mapping() else {
        report.error("config.zones", "expected a mapping");
        return;
    };
    string_keys(zones, "config.zones", report);
    for (key, value) in zones {
        let Some(name) = key.as_str() else {
            continue;
        };
        let path = format!("config.zones.{name}");
        if matches!(name, "" | "header" | "footer" | "menu" | "button") || name.contains([':', '/'])
        {
            report.error(
                &path,
                "zone names can't be header, footer, menu or button, be empty, or contain ':' or '/'",
            );
            continue;
        }
        let Some(map) = value.as_mapping() else {
            report.error(&path, "expected a mapping");
            continue;
        };
        validate_keys(
            map,
            &["rows", "label", "position", "display", "layers"],
            &path,
            report,
        );
        if let Some(rows) = map.get(Value::String("rows".into())) {
            if !matches!(rows.as_i64(), Some(1..=3)) {
                report.error(&format!("{path}.rows"), "expected 1, 2 or 3");
            }
        }
        validate_string_field(map, "label", &format!("{path}.label"), report);
        validate_number_field(map, "position", &format!("{path}.position"), report);
        if let Some(display) = map.get(Value::String("display".into())) {
            if !matches!(display.as_str(), Some("header" | "footer")) {
                report.error(&format!("{path}.display"), "expected header or footer");
            }
        }
        if let Some(layers) = map.get(Value::String("layers".into())) {
            validate_layers(layers, &format!("{path}.layers"), report);
        }
    }
}

fn validate_layers(value: &Value, path: &str, report: &mut Report) {
    let Some(layers) = value.as_mapping() else {
        report.error(path, "expected a mapping");
        return;
    };
    string_keys(layers, path, report);
    for (key, value) in layers {
        let Some(name) = key.as_str() else {
            continue;
        };
        let layer_path = format!("{path}.{name}");
        if name.is_empty() || name.contains([':', '/']) {
            report.error(
                &layer_path,
                "layer names can't be empty or contain ':' or '/'",
            );
            continue;
        }
        let Some(map) = value.as_mapping() else {
            report.error(&layer_path, "expected a mapping");
            continue;
        };
        validate_keys(map, &["label", "position"], &layer_path, report);
        validate_string_field(map, "label", &format!("{layer_path}.label"), report);
        validate_number_field(map, "position", &format!("{layer_path}.position"), report);
    }
}

#[cfg(test)]
mod tests {
    use super::super::tests::context;
    use super::super::{validate_action, validate_value, ConfigKind};
    use super::*;

    fn check(display: &str) -> Report {
        let action: Value =
            serde_norway::from_str(&format!("cmd: make ios\ndisplay: {display}\n")).unwrap();
        let mut report = Report::new();
        validate_action(
            &action,
            "config.actions.ios",
            None,
            false,
            false,
            &mut report,
        );
        report
    }

    #[test]
    fn a_display_that_is_not_a_string_is_rejected_once() {
        for display in ["[build]", "{x: 1}", "true", "3"] {
            let report = check(display);
            assert_eq!(
                report.errors,
                vec!["config.actions.ios.display: expected a string"],
                "display: {display}"
            );
        }
    }

    #[test]
    fn header_footer_and_a_zone_name_are_accepted() {
        for display in ["header", "footer", "build"] {
            let report = check(display);
            assert!(report.errors.is_empty(), "{display}: {:?}", report.errors);
            assert!(
                report.warnings.is_empty(),
                "{display}: {:?}",
                report.warnings
            );
        }
    }

    #[test]
    fn the_legacy_menu_display_is_accepted_with_a_warning() {
        let report = check("menu");
        assert!(report.errors.is_empty(), "{:?}", report.errors);
        assert_eq!(
            report.warnings,
            vec!["config.actions.ios.display: menu is legacy; prefer header or footer"]
        );
    }

    fn zone_report(yaml: &str) -> Report {
        let root: Value = serde_norway::from_str(yaml).unwrap();
        let mut report = Report::new();
        validate_zones(root.as_mapping().unwrap(), &mut report);
        report
    }

    #[test]
    fn a_zone_sits_in_the_header_or_the_footer() {
        for display in ["header", "footer"] {
            let report = zone_report(&format!(
                "zones:\n  deploy:\n    rows: 2\n    display: {display}\n"
            ));
            assert!(report.errors.is_empty(), "{display}: {:?}", report.errors);
        }
    }

    #[test]
    fn a_display_note_without_rows_is_accepted() {
        let report = zone_report("zones:\n  deploy:\n    display: footer\n    position: 3\n");
        assert!(report.errors.is_empty(), "{:?}", report.errors);
    }

    #[test]
    fn any_other_zone_display_is_rejected() {
        for display in ["menu", "sidebar", "build", "''", "3", "[footer]"] {
            let report = zone_report(&format!(
                "zones:\n  deploy:\n    rows: 2\n    display: {display}\n"
            ));
            assert_eq!(
                report.errors,
                vec!["config.zones.deploy.display: expected header or footer"],
                "display: {display}"
            );
        }
    }

    #[test]
    fn layers_accept_label_and_position() {
        let report = zone_report(
            "zones:\n  build:\n    rows: 2\n    layers:\n      mobile:\n        label: Mobile\n        position: 1\n      web: {}\n",
        );
        assert!(report.errors.is_empty(), "{:?}", report.errors);
    }

    #[test]
    fn layers_reject_bad_shapes() {
        let report = zone_report(
            "zones:\n  build:\n    rows: 2\n    layers:\n      a:b: {}\n      c/d: {}\n      e:\n        label: 3\n        position: x\n        color: red\n      f: nope\n",
        );
        for needle in [
            "config.zones.build.layers.a:b",
            "config.zones.build.layers.c/d",
            "config.zones.build.layers.e.label",
            "config.zones.build.layers.e.position",
            "config.zones.build.layers.e.color",
            "config.zones.build.layers.f",
        ] {
            assert!(
                report.errors.iter().any(|error| error.contains(needle)),
                "missing {needle}: {:?}",
                report.errors
            );
        }
    }

    #[test]
    fn layers_must_be_a_mapping() {
        let report = zone_report("zones:\n  build:\n    rows: 1\n    layers: [a, b]\n");
        assert_eq!(
            report.errors,
            vec!["config.zones.build.layers: expected a mapping"]
        );
    }

    #[test]
    fn a_zone_name_with_a_slash_is_an_error() {
        let report = zone_report("zones:\n  a/b:\n    rows: 1\n");
        assert!(!report.errors.is_empty());
    }

    #[test]
    fn an_action_layer_must_be_a_string() {
        let bad: Value =
            serde_norway::from_str("cmd: make ios\ndisplay: build\nlayer: [x]\n").unwrap();
        let mut report = Report::new();
        validate_action(&bad, "config.actions.ios", None, false, false, &mut report);
        assert_eq!(
            report.errors,
            vec!["config.actions.ios.layer: expected a string"]
        );
        let good: Value =
            serde_norway::from_str("cmd: make ios\ndisplay: build\nlayer: web\n").unwrap();
        let mut report = Report::new();
        validate_action(&good, "config.actions.ios", None, false, false, &mut report);
        assert!(report.errors.is_empty() && report.warnings.is_empty());
    }

    #[test]
    fn validator_accepts_zones_and_zone_displays() {
        let (_dir, ctx) = context();
        let path = ctx.project_path("web");
        let value: Value = serde_norway::from_str(
            "root: /tmp\nzones:\n  build:\n    rows: 2\n    label: Build\n    position: 3\n  agents:\n    position: 1\nactions:\n  ios:\n    cmd: make ios\n    display: build\n",
        )
        .unwrap();
        let report = validate_value(&ctx, &path, ConfigKind::Project, &value);
        assert!(report.errors.is_empty(), "{:?}", report.errors);
    }

    #[test]
    fn validator_rejects_bad_zone_fields() {
        let (_dir, ctx) = context();
        let path = ctx.project_path("web");
        let value: Value = serde_norway::from_str(
            "root: /tmp\nzones:\n  build:\n    rows: 4\n    position: first\n    color: red\n  footer:\n    rows: 1\n",
        )
        .unwrap();
        let report = validate_value(&ctx, &path, ConfigKind::Project, &value);
        for needle in [
            "zones.build.rows",
            "zones.build.position",
            "zones.build.color",
            "zones.footer",
        ] {
            assert!(
                report.errors.iter().any(|error| error.contains(needle)),
                "missing {needle}: {:?}",
                report.errors
            );
        }
    }

    #[test]
    fn validator_allows_zones_in_global_and_repo_files() {
        let (dir, ctx) = context();
        let value: Value = serde_norway::from_str("zones:\n  agents:\n    rows: 1\n").unwrap();
        let global = validate_value(&ctx, &ctx.global_path(), ConfigKind::Global, &value);
        assert!(global.errors.is_empty(), "{:?}", global.errors);
        let repo = validate_value(&ctx, &dir.path().join(".lpm.yml"), ConfigKind::Repo, &value);
        assert!(repo.errors.is_empty(), "{:?}", repo.errors);
    }

    #[test]
    fn validator_rejects_the_deprecated_button_display() {
        let (_dir, ctx) = context();
        let path = ctx.project_path("web");
        let value: Value = serde_norway::from_str(
            "root: /tmp\nactions:\n  test:\n    cmd: npm test\n    display: button\n",
        )
        .unwrap();
        let report = validate_value(&ctx, &path, ConfigKind::Project, &value);
        assert!(report
            .errors
            .iter()
            .any(|error| error.contains("actions.test.display")));
    }

    #[test]
    fn validator_allows_a_display_zone_declared_in_another_file() {
        let (_dir, ctx) = context();
        let path = ctx.project_path("web");
        let value: Value = serde_norway::from_str(
            "root: /tmp\nactions:\n  ios:\n    cmd: make ios\n    display: build\n",
        )
        .unwrap();
        let report = validate_value(&ctx, &path, ConfigKind::Project, &value);
        assert!(report.errors.is_empty(), "{:?}", report.errors);
    }

    #[test]
    fn validator_rejects_zones_in_duplicate_projects() {
        let (_dir, ctx) = context();
        std::fs::write(ctx.project_path("base"), "root: /tmp/base\n").unwrap();
        let path = ctx.project_path("copy");
        let value: Value = serde_norway::from_str(
            "parent_name: base\nroot: /tmp/copy\nzones:\n  build:\n    rows: 1\n",
        )
        .unwrap();
        let report = validate_value(&ctx, &path, ConfigKind::Project, &value);
        assert!(report
            .errors
            .iter()
            .any(|error| error.contains("duplicate projects cannot define zones")));
    }

    #[test]
    fn validator_reports_zone_mistakes_on_the_offending_path() {
        let (_dir, ctx) = context();
        let path = ctx.project_path("web");
        let bad_name =
            "zone names can't be header, footer, menu or button, be empty, or contain ':' or '/'";
        let cases = [
            (
                ConfigKind::Project,
                "root: /tmp\nzones:\n  '':\n    rows: 1\n",
                "config.zones.",
                bad_name,
            ),
            (
                ConfigKind::Project,
                "root: /tmp\nzones:\n  header:\n    rows: 1\n",
                "config.zones.header",
                bad_name,
            ),
            (
                ConfigKind::Project,
                "root: /tmp\nzones:\n  footer:\n    rows: 1\n",
                "config.zones.footer",
                bad_name,
            ),
            (
                ConfigKind::Project,
                "root: /tmp\nzones:\n  menu:\n    rows: 1\n",
                "config.zones.menu",
                bad_name,
            ),
            (
                ConfigKind::Project,
                "root: /tmp\nzones:\n  button:\n    rows: 1\n",
                "config.zones.button",
                bad_name,
            ),
            (
                ConfigKind::Project,
                "root: /tmp\nzones:\n  'a:b':\n    rows: 1\n",
                "config.zones.a:b",
                bad_name,
            ),
            (
                ConfigKind::Project,
                "root: /tmp\nactions:\n  ios:\n    cmd: make ios\n    display: 'a:b'\n",
                "config.actions.ios.display",
                "expected header, footer or a zone name without ':'",
            ),
            (
                ConfigKind::Project,
                "root: /tmp\nzones: [a]\n",
                "config.zones",
                "expected a mapping",
            ),
            (
                ConfigKind::Project,
                "root: /tmp\nzones:\n  build: 3\n",
                "config.zones.build",
                "expected a mapping",
            ),
            (
                ConfigKind::Project,
                "root: /tmp\nzones:\n  build:\n    label: 3\n",
                "config.zones.build.label",
                "expected a string",
            ),
            (
                ConfigKind::Template,
                "zones:\n  build:\n    rows: 1\n",
                "config.zones",
                "unknown field",
            ),
        ];
        for (kind, source, error_path, message) in cases {
            let value: Value = serde_norway::from_str(source).unwrap();
            let report = validate_value(&ctx, &path, kind, &value);
            let expected = format!("{error_path}: {message}");
            assert!(
                report.errors.contains(&expected),
                "missing {expected:?} for {source:?}: {:?}",
                report.errors
            );
        }
    }
}
