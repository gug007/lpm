use super::{string_at, validate_bool_field, Mapping, Report, Value};

const VARIABLES: &[&str] = &["project", "git.branch"];
const PATTERN_VARIABLES: &[&str] = &[
    "git.tag",
    "git.tagAge",
    "git.nextPatch",
    "git.nextMinor",
    "git.nextMajor",
];

pub(super) fn validate_action_label(map: &Mapping, path: &str, report: &mut Report) {
    validate_bool_field(map, "labelRefreshOnHover", path, report);
    validate_bool_field(map, "labelRefreshOnChange", path, report);
    validate_every(map, path, report);
    for field in ["label", "labelSvg", "emoji"] {
        validate_text(map, field, path, report);
    }
    validate_svg(map, path, report);
}

// A template's output is only known when it runs; anything else is what the
// button gets.
fn validate_svg(map: &Mapping, path: &str, report: &mut Report) {
    let Some(text) = string_at(map, "labelSvg") else {
        return;
    };
    let text = text.trim();
    if text.is_empty() || text.starts_with("<svg") || text.contains("$(") || text.contains("{{") {
        return;
    }
    report.warning(
        &format!("{path}.labelSvg"),
        "isn't an <svg>, so the button shows its text label",
    );
}

pub(super) fn validate_label_text(map: &Mapping, path: &str, report: &mut Report) {
    validate_text(map, "label", path, report);
}

// The app shows an unknown `{{…}}`, or a `$(` that never closes, as written, so
// either only earns a warning. A command's own text isn't checked: the app runs
// it as written, `{{…}}` and all.
fn validate_text(map: &Mapping, field: &str, path: &str, report: &mut Report) {
    let Some(text) = string_at(map, field) else {
        return;
    };
    let field_path = format!("{path}.{field}");
    let mut rest = text;
    loop {
        let (at, is_cmd) = match (rest.find("{{"), rest.find("$(")) {
            (None, None) => return,
            (Some(var), Some(cmd)) => (var.min(cmd), cmd < var),
            (Some(var), None) => (var, false),
            (None, Some(cmd)) => (cmd, true),
        };
        let after = &rest[at + 2..];
        if is_cmd {
            let Some(close) = command_end(after) else {
                report.warning(&field_path, "$( is never closed and shows as written");
                return;
            };
            rest = &after[close + 1..];
        } else {
            let Some(close) = after.find("}}") else {
                return;
            };
            let token = after[..close].trim();
            if !is_variable(token) {
                report.warning(
                    &field_path,
                    format!("{{{{{token}}}}} is not a label variable and shows as written"),
                );
            }
            rest = &after[close + 2..];
        }
    }
}

fn is_variable(token: &str) -> bool {
    match token.split_once(':') {
        Some((name, _)) => PATTERN_VARIABLES.contains(&name.trim()),
        None => VARIABLES.contains(&token) || PATTERN_VARIABLES.contains(&token),
    }
}

// The app's own rule for where a `$(` command ends (label_template.rs): quotes,
// escapes, nested `$(…)` and parentheses inside it don't end it.
fn command_end(s: &str) -> Option<usize> {
    let bytes = s.as_bytes();
    let mut quoted = vec![false];
    let mut i = 0;
    while i < bytes.len() {
        let in_quotes = quoted.last() == Some(&true);
        match bytes[i] {
            b'\\' => i += 1,
            b'"' if in_quotes => {
                quoted.pop();
            }
            b'"' => quoted.push(true),
            b'$' if in_quotes && bytes.get(i + 1) == Some(&b'(') => {
                quoted.push(false);
                i += 1;
            }
            b'\'' if !in_quotes => i += s[i + 1..].find('\'')? + 1,
            b'(' if !in_quotes => quoted.push(false),
            b')' if !in_quotes => {
                quoted.pop();
                if quoted.is_empty() {
                    return Some(i);
                }
            }
            _ => {}
        }
        i += 1;
    }
    None
}

fn validate_every(map: &Mapping, path: &str, report: &mut Report) {
    let Some(value) = map.get(Value::String("labelRefresh".into())) else {
        return;
    };
    let ok = match value {
        Value::Number(n) => n.as_u64().is_some(),
        Value::String(s) => is_interval(s),
        _ => false,
    };
    if !ok {
        report.error(
            &format!("{path}.labelRefresh"),
            "expected seconds or a number with s, m or h, like 30s or 5m",
        );
    }
}

pub(super) fn is_interval(s: &str) -> bool {
    let s = s.trim();
    let digits = s.strip_suffix(['s', 'm', 'h']).unwrap_or(s).trim_end();
    !digits.is_empty() && digits.bytes().all(|b| b.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use super::super::tests::context;
    use super::super::{validate_value, ConfigKind};
    use serde_norway::Value;

    fn report_for(action: &str) -> super::Report {
        let (_dir, ctx) = context();
        let path = ctx.project_path("web");
        let source = format!("root: /tmp\nactions:\n  release:\n{action}");
        let value: Value = serde_norway::from_str(&source).unwrap();
        validate_value(&ctx, &path, ConfigKind::Project, &value)
    }

    fn assert_clean(report: &super::Report) {
        assert!(report.errors.is_empty(), "{:?}", report.errors);
        assert!(report.warnings.is_empty(), "{:?}", report.warnings);
    }

    fn warned(report: &super::Report, field: &str, text: &str) -> bool {
        report
            .warnings
            .iter()
            .any(|w| w.contains(field) && w.contains(text))
    }

    #[test]
    fn accepts_variables_and_commands_in_every_label() {
        let report = report_for(concat!(
            "    cmd: ./release.sh {{bump}}\n",
            "    label: \"Release · $(git describe --tags) · {{git.tagAge:v*}} {{project}}\"\n",
            "    emoji: '$([ -n \"$(git log \"$(git describe --tags)\"..HEAD)\" ] && echo 🟡 || echo 🟢)'\n",
            "    labelRefresh: 5m\n",
            "    labelRefreshOnHover: true\n",
            "    labelRefreshOnChange: true\n",
            "    inputs:\n",
            "      bump:\n",
            "        label: Release from {{git.branch}}\n",
            "        type: radio\n",
            "        default: patch\n",
            "        options:\n",
            "          - label: \"Patch ({{git.nextPatch:v*}})\"\n",
            "            value: patch\n",
            "          - label: \"Minor ($(./next.sh minor))\"\n",
            "            value: minor\n",
        ));
        assert_clean(&report);
        assert_clean(&report_for(
            "    cmd: x\n    label: $(jq -r '.{{name}}' v.json)\n    labelRefresh: 30\n",
        ));
    }

    #[test]
    fn a_label_svg_must_be_an_svg_unless_a_command_prints_it() {
        assert_clean(&report_for("    cmd: x\n    labelSvg: <svg width='30'></svg>\n"));
        assert_clean(&report_for("    cmd: x\n    labelSvg: $(./button.sh)\n"));
        let report = report_for("    cmd: x\n    labelSvg: <div>149</div>\n");
        assert!(warned(&report, "labelSvg", "isn't an <svg>"), "{:?}", report.warnings);
    }

    #[test]
    fn warns_on_unknown_variables_and_unclosed_commands() {
        let report = report_for(concat!(
            "    cmd: ./release.sh {{bump}}\n",
            "    label: Release {{bump}} {{output}}\n",
            "    emoji: $(./pending.sh\n",
            "    inputs:\n",
            "      bump:\n",
            "        label: Pick {{nope}}\n",
            "        type: radio\n",
            "        options:\n",
            "          - label: Patch {{bump}}\n",
            "            value: patch\n",
        ));
        assert!(report.errors.is_empty(), "{:?}", report.errors);
        assert!(
            warned(&report, "release.label", "{{bump}}"),
            "{:?}",
            report.warnings
        );
        assert!(
            warned(&report, "release.label", "{{output}}"),
            "{:?}",
            report.warnings
        );
        assert!(
            warned(&report, "release.emoji", "never closed"),
            "{:?}",
            report.warnings
        );
        assert!(
            warned(&report, "inputs.bump.label", "{{nope}}"),
            "{:?}",
            report.warnings
        );
        assert!(
            warned(&report, "options[0].label", "{{bump}}"),
            "{:?}",
            report.warnings
        );
    }

    #[test]
    fn rejects_a_bad_interval_hover_flag_or_retired_command_fields() {
        for bad in ["soon", "5d", "m", "5mm", "-3", "5 s s"] {
            let report = report_for(&format!("    cmd: x\n    labelRefresh: \"{bad}\"\n"));
            assert!(
                report.errors.iter().any(|e| e.contains("labelRefresh")),
                "{bad}: {:?}",
                report.errors
            );
        }
        let report = report_for(concat!(
            "    cmd: x\n",
            "    labelRefreshOnHover: yes please\n",
            "    labelRefreshOnChange: 1\n",
            "    labelCmd: git describe\n",
            "    emojiCmd: ./pending.sh\n",
            "    inputs:\n",
            "      bump:\n",
            "        type: radio\n",
            "        options:\n",
            "          - label: Patch\n",
            "            value: patch\n",
            "            labelCmd: ./next.sh\n",
        ));
        for expected in [
            "release.labelRefreshOnHover",
            "release.labelRefreshOnChange",
            "release.labelCmd: unknown",
            "release.emojiCmd: unknown",
            "options[0].labelCmd: unknown",
        ] {
            assert!(
                report.errors.iter().any(|e| e.contains(expected)),
                "{expected}: {:?}",
                report.errors
            );
        }
    }
}
