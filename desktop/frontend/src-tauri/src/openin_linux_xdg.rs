// Desktop entries and icons the way freedesktop.org specifies them: where
// they live (XDG data dirs), what `Exec=` means, and which icon an entry names.
use std::path::{Path, PathBuf};

pub(super) fn home() -> PathBuf {
    dirs::home_dir().unwrap_or_default()
}

/// `$XDG_DATA_HOME` then `$XDG_DATA_DIRS`, plus the Flatpak and snap export
/// trees a session sometimes doesn't list.
fn data_dirs() -> Vec<PathBuf> {
    let home = home();
    let mut dirs = vec![std::env::var_os("XDG_DATA_HOME")
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".local/share"))];
    let shared = std::env::var("XDG_DATA_DIRS")
        .ok()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "/usr/local/share:/usr/share".into());
    dirs.extend(
        shared
            .split(':')
            .filter(|d| !d.is_empty())
            .map(PathBuf::from),
    );
    dirs.extend([
        home.join(".local/share/flatpak/exports/share"),
        PathBuf::from("/var/lib/flatpak/exports/share"),
        PathBuf::from("/var/lib/snapd/desktop"),
    ]);
    let mut seen = std::collections::HashSet::new();
    dirs.retain(|d| seen.insert(d.clone()));
    dirs
}

fn resolves(program: &str) -> bool {
    if program.contains('/') {
        Path::new(program).is_file()
    } else {
        crate::sys::which(program)
    }
}

#[derive(Debug, Default, PartialEq)]
pub(super) struct DesktopEntry {
    exec: Vec<String>,
    try_exec: Option<String>,
    pub(super) icon: Option<String>,
    hidden: bool,
}

impl DesktopEntry {
    /// The entry's command line, when its program is actually installed.
    pub(super) fn launcher(&self) -> Option<String> {
        let program = match self.exec.first().map(String::as_str) {
            Some("env" | "/usr/bin/env") => self.exec.iter().skip(1).find(|a| !a.contains('='))?,
            Some(p) => p,
            None => return None,
        };
        let installed = resolves(program) && self.try_exec.as_deref().is_none_or(resolves);
        (installed && !self.hidden).then(|| self.exec.join("\0"))
    }
}

fn parse_desktop_entry(text: &str) -> DesktopEntry {
    let mut entry = DesktopEntry::default();
    let mut in_main = false;
    for line in text.lines().map(str::trim) {
        if line.starts_with('[') {
            in_main = line == "[Desktop Entry]";
            continue;
        }
        if !in_main {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let value = unescape_value(value.trim());
        match key.trim() {
            "Exec" => entry.exec = exec_argv(&value),
            "TryExec" => entry.try_exec = Some(value),
            "Icon" => entry.icon = Some(value),
            "Hidden" => entry.hidden = value == "true",
            _ => {}
        }
    }
    entry
}

/// The desktop-entry spec's string escapes (`\s`, `\n`, `\t`, `\r`, `\\`).
fn unescape_value(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut chars = value.chars();
    while let Some(c) = chars.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('s') => out.push(' '),
            Some('n') => out.push('\n'),
            Some('t') => out.push('\t'),
            Some('r') => out.push('\r'),
            Some('\\') => out.push('\\'),
            Some(other) => {
                out.push('\\');
                out.push(other);
            }
            None => out.push('\\'),
        }
    }
    out
}

/// An `Exec=` value split into arguments with its field codes (`%f`, `%U`, …)
/// and Flatpak's `@@` file-forwarding markers dropped: lpm appends its own.
fn exec_argv(exec: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut cur = String::new();
    let mut in_arg = false;
    let mut quoted = false;
    let mut chars = exec.chars();
    while let Some(c) = chars.next() {
        match c {
            '"' => {
                quoted = !quoted;
                in_arg = true;
            }
            '\\' if quoted => match chars.next() {
                Some(e @ ('"' | '`' | '$' | '\\')) => cur.push(e),
                Some(other) => {
                    cur.push('\\');
                    cur.push(other);
                }
                None => cur.push('\\'),
            },
            c if c.is_whitespace() && !quoted => {
                if in_arg {
                    args.push(std::mem::take(&mut cur));
                    in_arg = false;
                }
            }
            c => {
                cur.push(c);
                in_arg = true;
            }
        }
    }
    if in_arg {
        args.push(cur);
    }
    args.into_iter()
        .filter(|a| !matches!(a.as_str(), "@@" | "@@u"))
        .filter_map(|a| expand_field_codes(&a))
        .collect()
}

/// `%%` is a literal percent; an argument carrying any other field code stands
/// for something lpm doesn't supply and is dropped.
fn expand_field_codes(arg: &str) -> Option<String> {
    let mut out = String::with_capacity(arg.len());
    let mut chars = arg.chars();
    while let Some(c) = chars.next() {
        if c != '%' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('%') => out.push('%'),
            _ => return None,
        }
    }
    Some(out)
}

fn desktop_matches(pattern: &str, file_name: &str) -> bool {
    match pattern.strip_suffix('*') {
        Some(prefix) => file_name.starts_with(prefix) && file_name.ends_with(".desktop"),
        None => file_name == pattern,
    }
}

/// The first installed desktop entry matching `patterns`, in pattern order and
/// then XDG precedence.
pub(super) fn find_desktop(patterns: &[&str]) -> Option<DesktopEntry> {
    let dirs: Vec<PathBuf> = data_dirs()
        .into_iter()
        .map(|d| d.join("applications"))
        .collect();
    for pattern in patterns {
        for dir in &dirs {
            let mut files: Vec<PathBuf> = if pattern.ends_with('*') {
                std::fs::read_dir(dir)
                    .into_iter()
                    .flatten()
                    .flatten()
                    .filter(|e| desktop_matches(pattern, &e.file_name().to_string_lossy()))
                    .map(|e| e.path())
                    .collect()
            } else {
                vec![dir.join(pattern)]
            };
            files.sort();
            for file in files {
                let Ok(text) = std::fs::read_to_string(&file) else {
                    continue;
                };
                let entry = parse_desktop_entry(&text);
                if entry.launcher().is_some() {
                    return Some(entry);
                }
            }
        }
    }
    None
}

/// The named icon from the hicolor theme or pixmaps, as a data: URI.
pub(super) fn icon_uri(name: &str) -> Option<String> {
    data_uri(&resolve_icon(name)?)
}

fn resolve_icon(name: &str) -> Option<PathBuf> {
    if name.starts_with('/') {
        return Some(PathBuf::from(name)).filter(|p| p.is_file());
    }
    let mut roots: Vec<PathBuf> = vec![home().join(".icons")];
    roots.extend(data_dirs().into_iter().map(|d| d.join("icons")));
    const SIZES: [&str; 6] = ["scalable", "256x256", "128x128", "96x96", "64x64", "48x48"];
    for root in &roots {
        for size in SIZES {
            for ext in ["svg", "png"] {
                let p = root.join(format!("hicolor/{size}/apps/{name}.{ext}"));
                if p.is_file() {
                    return Some(p);
                }
            }
        }
    }
    ["png", "svg"]
        .iter()
        .map(|ext| PathBuf::from(format!("/usr/share/pixmaps/{name}.{ext}")))
        .find(|p| p.is_file())
}

fn data_uri(path: &Path) -> Option<String> {
    use base64::Engine;
    let mime = match path.extension()?.to_str()? {
        "png" => "image/png",
        "svg" => "image/svg+xml",
        _ => return None,
    };
    if std::fs::metadata(path).ok()?.len() > 1024 * 1024 {
        return None;
    }
    let bytes = std::fs::read(path).ok()?;
    Some(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exec_drops_field_codes_and_keeps_fixed_flags() {
        assert_eq!(
            exec_argv("/opt/Cursor/cursor.AppImage --no-sandbox %U"),
            vec!["/opt/Cursor/cursor.AppImage", "--no-sandbox"]
        );
        assert_eq!(
            exec_argv(
                "/usr/bin/flatpak run --branch=stable --file-forwarding com.visualstudio.code @@ %F @@"
            ),
            vec![
                "/usr/bin/flatpak",
                "run",
                "--branch=stable",
                "--file-forwarding",
                "com.visualstudio.code"
            ]
        );
        assert_eq!(exec_argv("app --name=%c 100%%"), vec!["app", "100%"]);
    }

    #[test]
    fn exec_honours_quotes_and_escapes() {
        assert_eq!(
            exec_argv(r#""/home/u/My Apps/idea.sh" "say \"hi\"" %f"#),
            vec!["/home/u/My Apps/idea.sh", "say \"hi\""]
        );
        assert_eq!(unescape_value(r"a\sb\\c"), r"a b\c");
    }

    #[test]
    fn parses_only_the_main_section() {
        let entry = parse_desktop_entry(
            "[Desktop Entry]\nName=Code\nExec=/usr/share/code/code %F\nIcon=vscode\n\n[Desktop Action new-empty-window]\nExec=/usr/share/code/code --new-window %F\nIcon=other\n",
        );
        assert_eq!(entry.exec, vec!["/usr/share/code/code"]);
        assert_eq!(entry.icon.as_deref(), Some("vscode"));
        assert!(!entry.hidden);
    }

    #[test]
    fn a_hidden_or_missing_program_is_not_installed() {
        let missing = DesktopEntry {
            exec: vec!["/nonexistent/lpm-test-app".into()],
            ..Default::default()
        };
        assert_eq!(missing.launcher(), None);
        let hidden = DesktopEntry {
            exec: vec!["/bin/sh".into(), "-c".into(), "true".into()],
            hidden: true,
            ..Default::default()
        };
        assert_eq!(hidden.launcher(), None);
        let shown = DesktopEntry {
            hidden: false,
            ..hidden
        };
        assert_eq!(shown.launcher().as_deref(), Some("/bin/sh\0-c\0true"));
    }

    #[test]
    fn env_prefixed_exec_checks_the_real_program() {
        let entry = DesktopEntry {
            exec: vec![
                "env".into(),
                "BAMF_DESKTOP_FILE_HINT=/x.desktop".into(),
                "/nonexistent/lpm-test-code".into(),
            ],
            ..Default::default()
        };
        assert_eq!(entry.launcher(), None);
    }

    #[test]
    fn desktop_patterns_match_exactly_or_by_prefix() {
        assert!(desktop_matches("code.desktop", "code.desktop"));
        assert!(!desktop_matches("code.desktop", "code-url-handler.desktop"));
        assert!(desktop_matches(
            "jetbrains-idea*",
            "jetbrains-idea-1a2b.desktop"
        ));
        assert!(!desktop_matches(
            "jetbrains-idea*",
            "jetbrains-idea-1a2b.png"
        ));
    }
}
