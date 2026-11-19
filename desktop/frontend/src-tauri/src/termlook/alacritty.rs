//! Alacritty: TOML, with `import` (or `general.import`) files under it, the
//! config's own keys winning.
use super::{first_existing, hex, home, read, xdg_config, Palette, TerminalLook, ANSI_NAMES};
use std::path::PathBuf;
use toml_edit::{DocumentMut, Item};

fn config_path() -> Option<PathBuf> {
    let mut paths = vec![
        xdg_config().join("alacritty/alacritty.toml"),
        home().join(".alacritty.toml"),
    ];
    if cfg!(windows) {
        if let Some(appdata) = std::env::var_os("APPDATA") {
            paths.insert(0, PathBuf::from(appdata).join("alacritty/alacritty.toml"));
        }
    }
    first_existing(paths)
}

fn get<'a>(doc: &'a DocumentMut, path: &[&str]) -> Option<&'a Item> {
    let mut item = doc.as_item();
    for key in path {
        item = item.get(key)?;
    }
    Some(item)
}

fn text(doc: &DocumentMut, path: &[&str]) -> Option<String> {
    get(doc, path)?.as_str().map(str::to_string)
}

fn imports(doc: &DocumentMut) -> Vec<String> {
    [&["general", "import"][..], &["import"][..]]
        .iter()
        .filter_map(|p| get(doc, p)?.as_array())
        .flat_map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)))
        .collect()
}

fn apply(doc: &DocumentMut, palette: &mut Palette, font: &mut (Option<String>, Option<f64>)) {
    let color = |path: &[&str]| text(doc, path).and_then(|c| hex(&c));
    palette.background = color(&["colors", "primary", "background"]).or(palette.background.take());
    palette.foreground = color(&["colors", "primary", "foreground"]).or(palette.foreground.take());
    palette.cursor = color(&["colors", "cursor", "cursor"]).or(palette.cursor.take());
    palette.selection = color(&["colors", "selection", "background"]).or(palette.selection.take());
    for (i, name) in ANSI_NAMES.iter().enumerate() {
        palette.ansi[i] = color(&["colors", "normal", name]).or(palette.ansi[i].take());
        palette.ansi[i + 8] = color(&["colors", "bright", name]).or(palette.ansi[i + 8].take());
    }
    if let Some(family) = text(doc, &["font", "normal", "family"]) {
        font.0 = Some(family);
    }
    if let Some(size) = get(doc, &["font", "size"]).and_then(|s| s.as_float().or(s.as_integer().map(|i| i as f64))) {
        font.1 = Some(size);
    }
}

pub(super) fn look_from(config: &str, load: impl Fn(&str) -> Option<String>) -> Option<TerminalLook> {
    let doc: DocumentMut = config.parse().ok()?;
    let mut palette = Palette::default();
    let mut font = (None, None);
    for path in imports(&doc) {
        if let Some(theme) = load(&path).and_then(|t| t.parse::<DocumentMut>().ok()) {
            apply(&theme, &mut palette, &mut font);
        }
    }
    apply(&doc, &mut palette, &mut font);
    Some(TerminalLook {
        app: "Alacritty".into(),
        font_family: font.0,
        font_size: font.1,
        theme_name: None,
        colors: palette.finish(),
    })
}

pub(super) fn look() -> Option<TerminalLook> {
    let path = config_path()?;
    let dir = path.parent()?.to_path_buf();
    look_from(&read(&path)?, |p| {
        let p = p.strip_prefix("~/").map(|rest| home().join(rest)).unwrap_or_else(|| dir.join(p));
        read(&p)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_config_over_the_theme_it_imports() {
        let config = "[general]\nimport = [\"themes/nord.toml\"]\n\n[font]\nsize = 13.5\n\n[font.normal]\nfamily = \"Hack\"\n\n[colors.primary]\nbackground = \"0x101010\"\n";
        let theme = "[colors.primary]\nbackground = \"#2e3440\"\nforeground = \"#d8dee9\"\n\n[colors.normal]\nred = \"#bf616a\"\n\n[colors.bright]\nred = \"#d08770\"\n";
        let look = look_from(config, |p| (p == "themes/nord.toml").then(|| theme.to_string())).unwrap();
        assert_eq!(look.font_family.as_deref(), Some("Hack"));
        assert_eq!(look.font_size, Some(13.5));
        let colors = look.colors.unwrap();
        assert_eq!(colors.background, "#101010");
        assert_eq!(colors.foreground, "#d8dee9");
        assert_eq!(colors.ansi[1], "#bf616a");
        assert_eq!(colors.ansi[9], "#d08770");
    }
}
