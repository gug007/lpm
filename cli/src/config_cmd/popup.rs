// An action's `popup`: one key naming the page's format, plus `data`, `title`,
// `size` and `refresh` beside it. The app shows a popup it can't read as words
// in the card, never dropping the action, but a config that says nothing it
// can use is still an error here, where it can be fixed before it's applied.
use super::labels::validate_interval;
use super::{config, string_at, validate_string_field, Mapping, Report, Value};
use std::path::{Path, PathBuf};

const FORMATS: &[&str] = &["html", "widgets", "vega", "markdown", "image", "terminal", "url"];
const SHOWN: &[&str] = &["html"];
const SETTINGS: &[&str] = &["data", "title", "size", "refresh", "cache"];
const WIDTH: (u32, u32) = (200, 720);
const HEIGHT: (u32, u32) = (80, 560);

pub(super) fn validate_popup(
    map: &Mapping,
    path: &str,
    local_root: Option<&Path>,
    report: &mut Report,
) {
    let Some(value) = map.get(Value::String("popup".into())) else {
        return;
    };
    let dir = local_root.map(|root| action_dir(root, string_at(map, "cwd").unwrap_or_default()));
    let path = format!("{path}.popup");
    match value {
        Value::Null => {}
        Value::String(s) if s.trim().is_empty() => {}
        Value::String(s) => match format_of(s.trim()) {
            Some(format) => {
                warn_unshown(format, &path, report);
                check_page(format, s.trim(), &path, dir.as_deref(), report);
            }
            None => report.error(
                &path,
                format!(
                    "can't tell what {:?} is; name its format, as in `html: {}`",
                    s.trim(),
                    s.trim()
                ),
            ),
        },
        Value::Mapping(popup) => validate_map(popup, &path, dir.as_deref(), report),
        _ => report.error(
            &path,
            "expected a page's file name, or a mapping with html and the popup's settings",
        ),
    }
}

fn validate_map(popup: &Mapping, path: &str, dir: Option<&Path>, report: &mut Report) {
    let mut named = Vec::new();
    for key in popup.keys() {
        match key.as_str() {
            Some(key) if FORMATS.contains(&key) => named.push(key),
            Some(key) if SETTINGS.contains(&key) => {}
            Some(key) => report.error(&format!("{path}.{key}"), "unknown field"),
            None => report.error(path, "expected string keys"),
        }
    }
    match named.as_slice() {
        [] => report.error(path, "needs a format key, as in `html: scripts/stars/popup.html`"),
        [format] => match string_at(popup, format).map(str::trim) {
            Some(source) if !source.is_empty() => {
                warn_unshown(format, path, report);
                check_page(format, source, &format!("{path}.{format}"), dir, report);
            }
            _ => report.error(
                &format!("{path}.{format}"),
                "needs a page: a file name, the page itself, or $(a command that prints it)",
            ),
        },
        many => report.error(
            path,
            format!("names {} formats ({}); keep one", many.len(), many.join(", ")),
        ),
    }
    validate_string_field(popup, "title", &format!("{path}.title"), report);
    validate_size(popup, path, report);
    validate_interval(popup, "refresh", path, true, report);
    validate_interval(popup, "cache", path, false, report);
}

fn validate_size(popup: &Mapping, path: &str, report: &mut Report) {
    let Some(value) = popup.get(Value::String("size".into())) else {
        return;
    };
    let path = format!("{path}.size");
    let Some((w, h)) = value.as_str().and_then(parse_size) else {
        report.error(&path, "expected WIDTHxHEIGHT, like 380x220");
        return;
    };
    let held = |n: u32, (lo, hi): (u32, u32)| n.clamp(lo, hi) != n;
    if held(w, WIDTH) || held(h, HEIGHT) {
        report.warning(
            &path,
            format!(
                "is held to {}–{} wide and {}–{} tall",
                WIDTH.0, WIDTH.1, HEIGHT.0, HEIGHT.1
            ),
        );
    }
}

fn parse_size(size: &str) -> Option<(u32, u32)> {
    let lower = size.trim().to_lowercase();
    let (w, h) = lower.split_once('x').or_else(|| lower.split_once('×'))?;
    Some((w.trim().parse().ok()?, h.trim().parse().ok()?))
}

fn warn_unshown(format: &str, path: &str, report: &mut Report) {
    if !SHOWN.contains(&format) {
        report.warning(
            path,
            format!("this lpm shows only html popups; a `{format}` one asks to update lpm"),
        );
    }
}

// A page named by file should exist; one a command prints, or one written
// in place, can't be checked.
fn check_page(format: &str, source: &str, path: &str, dir: Option<&Path>, report: &mut Report) {
    if format != "html" || source.starts_with("$(") || source.contains('\n') || source.starts_with('<') {
        return;
    }
    let Some(dir) = dir else {
        return;
    };
    let file = dir.join(config::expand_home(source));
    if !file.is_file() {
        report.warning(path, format!("file does not exist: {}", file.display()));
    }
}

fn format_of(source: &str) -> Option<&'static str> {
    let lower = source.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        return Some("url");
    }
    [
        (".html", "html"),
        (".htm", "html"),
        (".vl.json", "vega"),
        (".md", "markdown"),
        (".png", "image"),
        (".jpg", "image"),
        (".jpeg", "image"),
        (".gif", "image"),
        (".svg", "image"),
        (".webp", "image"),
    ]
    .iter()
    .find(|(ending, _)| lower.ends_with(ending))
    .map(|(_, format)| *format)
}

fn action_dir(root: &Path, cwd: &str) -> PathBuf {
    let cwd = config::expand_home(cwd);
    config::resolve_cwd(&root.to_string_lossy(), &cwd).into()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn check(yaml: &str, root: Option<&Path>) -> Report {
        let map: Mapping = serde_norway::from_str(yaml).unwrap();
        let mut report = Report::new();
        validate_popup(&map, "config.actions.stars", root, &mut report);
        report
    }

    #[test]
    fn a_full_popup_is_fine() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir(tmp.path().join("popups")).unwrap();
        std::fs::write(tmp.path().join("popups/stars.html"), "<p></p>").unwrap();
        let report = check(
            "popup:\n  html: popups/stars.html\n  data: $(./stars.sh)\n  title: Stars\n  size: 380x220\n  refresh: 5m\n  cache: 1m\n",
            Some(tmp.path()),
        );
        assert!(report.errors.is_empty(), "{:?}", report.errors);
        assert!(report.warnings.is_empty(), "{:?}", report.warnings);
    }

    #[test]
    fn a_missing_page_file_is_a_warning() {
        let tmp = tempfile::tempdir().unwrap();
        let report = check("popup: popups/gone.html\n", Some(tmp.path()));
        assert!(report.errors.is_empty());
        assert!(report.warnings[0].contains("file does not exist"), "{:?}", report.warnings);
    }

    #[test]
    fn shapes_it_cant_use_are_errors() {
        let report = check("popup:\n  title: Stars\n", None);
        assert!(report.errors[0].contains("needs a format key"), "{:?}", report.errors);
        let report = check("popup:\n  html: a.html\n  vega: b.vl.json\n", None);
        assert!(report.errors.iter().any(|e| e.contains("keep one")), "{:?}", report.errors);
        let report = check("popup:\n  html: a.html\n  colour: red\n", None);
        assert!(report.errors[0].ends_with("popup.colour: unknown field"), "{:?}", report.errors);
        let report = check("popup:\n  html: a.html\n  size: big\n  refresh: soon\n  cache: later\n", None);
        assert_eq!(report.errors.len(), 3, "{:?}", report.errors);
        let report = check("popup: $(./page.sh)\n", None);
        assert!(report.errors[0].contains("name its format"), "{:?}", report.errors);
    }

    #[test]
    fn a_format_this_lpm_cant_draw_yet_is_a_warning() {
        let report = check("popup:\n  vega: bundle.vl.json\n", None);
        assert!(report.errors.is_empty());
        assert!(report.warnings[0].contains("update lpm"), "{:?}", report.warnings);
    }

    #[test]
    fn a_size_past_the_limits_is_held() {
        let report = check("popup:\n  html: <p></p>\n  size: 2000x40\n", None);
        assert!(report.errors.is_empty());
        assert!(report.warnings[0].contains("is held to"), "{:?}", report.warnings);
    }
}
