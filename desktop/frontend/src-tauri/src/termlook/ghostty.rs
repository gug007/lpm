//! Ghostty: `key = value` lines, a named theme file under it, and the
//! config's own colors over the theme's.
use super::{first_existing, hex, home, read, xdg_config, Palette, TerminalLook};
use std::path::PathBuf;

fn config_paths() -> Vec<PathBuf> {
    let mut dirs = vec![xdg_config().join("ghostty")];
    if cfg!(target_os = "macos") {
        dirs.push(home().join("Library/Application Support/com.mitchellh.ghostty"));
    }
    dirs.into_iter()
        .flat_map(|d| [d.join("config.ghostty"), d.join("config")])
        .collect()
}

fn theme_dirs() -> Vec<PathBuf> {
    let mut dirs = vec![xdg_config().join("ghostty/themes")];
    if cfg!(target_os = "macos") {
        dirs.push(PathBuf::from("/Applications/Ghostty.app/Contents/Resources/ghostty/themes"));
    } else {
        dirs.push(PathBuf::from("/usr/share/ghostty/themes"));
        dirs.push(PathBuf::from("/usr/local/share/ghostty/themes"));
    }
    dirs
}

pub(super) fn pairs(text: &str) -> Vec<(String, String)> {
    text.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .filter_map(|l| l.split_once('='))
        .map(|(k, v)| (k.trim().to_string(), v.trim().trim_matches('"').to_string()))
        .collect()
}

/// The theme a `theme =` line names: `Name`, or for `light:A,dark:B` the dark one.
pub(super) fn theme_name(value: &str) -> String {
    let parts: Vec<&str> = value.split(',').map(str::trim).collect();
    parts
        .iter()
        .find_map(|p| p.strip_prefix("dark:"))
        .or_else(|| parts.iter().find_map(|p| p.strip_prefix("light:")))
        .unwrap_or(value)
        .trim()
        .to_string()
}

pub(super) fn apply_colors(palette: &mut Palette, pairs: &[(String, String)]) {
    for (key, value) in pairs {
        match key.as_str() {
            "background" => palette.background = hex(value).or(palette.background.take()),
            "foreground" => palette.foreground = hex(value).or(palette.foreground.take()),
            "cursor-color" => palette.cursor = hex(value).or(palette.cursor.take()),
            "selection-background" => palette.selection = hex(value).or(palette.selection.take()),
            "palette" => {
                if let Some((n, color)) = value.split_once('=') {
                    if let (Ok(n), Some(color)) = (n.trim().parse::<usize>(), hex(color)) {
                        if n < 16 {
                            palette.ansi[n] = Some(color);
                        }
                    }
                }
            }
            _ => {}
        }
    }
}

pub(super) fn look_from(config: &str, theme_file: impl Fn(&str) -> Option<String>) -> TerminalLook {
    let config = pairs(config);
    let value = |key: &str| config.iter().find(|(k, _)| k == key).map(|(_, v)| v.clone());
    let theme = value("theme").map(|v| theme_name(&v));
    let mut palette = Palette::default();
    if let Some(text) = theme.as_deref().and_then(&theme_file) {
        apply_colors(&mut palette, &pairs(&text));
    }
    apply_colors(&mut palette, &config);
    TerminalLook {
        app: "Ghostty".into(),
        font_family: value("font-family").filter(|f| !f.is_empty()),
        font_size: value("font-size").and_then(|s| s.parse().ok()),
        theme_name: theme,
        colors: palette.finish(),
    }
}

pub(super) fn look() -> Option<TerminalLook> {
    let config = read(&first_existing(config_paths())?)?;
    Some(look_from(&config, |name| {
        theme_dirs().into_iter().find_map(|d| read(&d.join(name)))
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_font_the_theme_and_the_config_over_it() {
        let config = "# mine\nfont-family = \"JetBrains Mono\"\nfont-size = 13\ntheme = light:Day,dark:Night\nbackground = 101010\npalette = 1=#ff5555\n";
        let theme = "background = #1e1e2e\nforeground = #cdd6f4\npalette = 0=#45475a\npalette = 1=#f38ba8\ncursor-color = #f5e0dc\n";
        let look = look_from(config, |name| (name == "Night").then(|| theme.to_string()));
        assert_eq!(look.font_family.as_deref(), Some("JetBrains Mono"));
        assert_eq!(look.font_size, Some(13.0));
        assert_eq!(look.theme_name.as_deref(), Some("Night"));
        let colors = look.colors.unwrap();
        assert_eq!(colors.background, "#101010");
        assert_eq!(colors.foreground, "#cdd6f4");
        assert_eq!(colors.ansi[0], "#45475a");
        assert_eq!(colors.ansi[1], "#ff5555");
        assert_eq!(colors.cursor.as_deref(), Some("#f5e0dc"));
    }

    #[test]
    fn a_theme_it_cannot_find_leaves_the_colors_out() {
        let look = look_from("theme = Gone\nfont-size = 12\n", |_| None);
        assert_eq!(look.theme_name.as_deref(), Some("Gone"));
        assert_eq!(look.colors, None);
        assert_eq!(look.font_size, Some(12.0));
    }
}
