//! Kitty: `key value` lines, with `include` pulling in other files such as
//! the theme `kitty +kitten themes` writes.
use super::{first_existing, hex, home, read, xdg_config, Palette, TerminalLook};
use std::path::{Path, PathBuf};

const MAX_INCLUDE_DEPTH: usize = 3;

fn config_path() -> Option<PathBuf> {
    let mut paths = Vec::new();
    if let Some(dir) = std::env::var_os("KITTY_CONFIG_DIRECTORY") {
        paths.push(PathBuf::from(dir).join("kitty.conf"));
    }
    paths.push(xdg_config().join("kitty/kitty.conf"));
    if cfg!(target_os = "macos") {
        paths.push(home().join("Library/Preferences/kitty/kitty.conf"));
    }
    first_existing(paths)
}

/// Every `key value` line, an `include`'s lines where it sits.
pub(super) fn lines(text: &str, dir: &Path, load: &dyn Fn(&Path) -> Option<String>, depth: usize) -> Vec<(String, String)> {
    let mut out = Vec::new();
    for line in text.lines().map(str::trim) {
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let (key, value) = line.split_once(char::is_whitespace).unwrap_or((line, ""));
        let value = value.trim().to_string();
        if key == "include" && depth < MAX_INCLUDE_DEPTH {
            let path = dir.join(&value);
            if let Some(text) = load(&path) {
                out.extend(lines(&text, path.parent().unwrap_or(dir), load, depth + 1));
            }
            continue;
        }
        out.push((key.to_string(), value));
    }
    out
}

pub(super) fn look_from(pairs: &[(String, String)]) -> TerminalLook {
    let last = |key: &str| pairs.iter().rev().find(|(k, _)| k == key).map(|(_, v)| v.clone());
    let mut palette = Palette::default();
    for (key, value) in pairs {
        match key.as_str() {
            "background" => palette.background = hex(value).or(palette.background.take()),
            "foreground" => palette.foreground = hex(value).or(palette.foreground.take()),
            "cursor" => palette.cursor = hex(value).or(palette.cursor.take()),
            "selection_background" => palette.selection = hex(value).or(palette.selection.take()),
            _ => {
                if let Some(n) = key.strip_prefix("color").and_then(|n| n.parse::<usize>().ok()) {
                    if n < 16 {
                        palette.ansi[n] = hex(value).or(palette.ansi[n].take());
                    }
                }
            }
        }
    }
    TerminalLook {
        app: "Kitty".into(),
        font_family: last("font_family").filter(|f| !f.is_empty() && f != "monospace"),
        font_size: last("font_size").and_then(|s| s.parse().ok()),
        theme_name: None,
        colors: palette.finish(),
    }
}

pub(super) fn look() -> Option<TerminalLook> {
    let path = config_path()?;
    let text = read(&path)?;
    let dir = path.parent()?.to_path_buf();
    Some(look_from(&lines(&text, &dir, &|p| read(p), 0)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_config_and_the_theme_it_includes() {
        let conf = "font_family      Fira Code\nfont_size 14.0\ninclude current-theme.conf\ncolor1 #ff0000\n";
        let theme = "background #282a36\nforeground #f8f8f2\ncolor1 #aa0000\ncolor9 #ff6e6e\nselection_background #44475a\n";
        let pairs = lines(conf, Path::new("/k"), &|p| (p == Path::new("/k/current-theme.conf")).then(|| theme.to_string()), 0);
        let look = look_from(&pairs);
        assert_eq!(look.font_family.as_deref(), Some("Fira Code"));
        assert_eq!(look.font_size, Some(14.0));
        let colors = look.colors.unwrap();
        assert_eq!(colors.background, "#282a36");
        assert_eq!(colors.ansi[1], "#ff0000");
        assert_eq!(colors.ansi[9], "#ff6e6e");
        assert_eq!(colors.selection.as_deref(), Some("#44475a"));
    }
}
