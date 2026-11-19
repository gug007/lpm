//! The look of a terminal the person already uses, read from its own config so
//! Settings › Terminal can offer it: font, size and colors. Nothing in the
//! other app is changed.
mod alacritty;
mod ghostty;
#[cfg(target_os = "macos")]
mod iterm;
mod kitty;
#[cfg_attr(not(windows), allow(dead_code))]
mod winterm;

use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize, Default, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TerminalLook {
    pub app: String,
    /// As the app names it: a family, or for iTerm2 the font's own name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_family: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_size: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub theme_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub colors: Option<LookColors>,
}

#[derive(Serialize, Default, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LookColors {
    pub background: String,
    pub foreground: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selection: Option<String>,
    /// The 16 ANSI colors, black to bright white; "" where the app sets none.
    pub ansi: Vec<String>,
}

/// Colors as they are gathered, before the background and text are known.
#[derive(Default, Clone, Debug)]
pub(crate) struct Palette {
    pub background: Option<String>,
    pub foreground: Option<String>,
    pub cursor: Option<String>,
    pub selection: Option<String>,
    pub ansi: [Option<String>; 16],
}

impl Palette {
    pub fn finish(self) -> Option<LookColors> {
        Some(LookColors {
            background: self.background?,
            foreground: self.foreground?,
            cursor: self.cursor,
            selection: self.selection,
            ansi: self.ansi.into_iter().map(Option::unwrap_or_default).collect(),
        })
    }
}

impl TerminalLook {
    fn is_empty(&self) -> bool {
        self.font_family.is_none() && self.font_size.is_none() && self.colors.is_none()
    }
}

/// `#rrggbb` from `#rgb`, `#rrggbb`, `rrggbb` or `0xrrggbb`; None for anything else.
pub(crate) fn hex(value: &str) -> Option<String> {
    let v = value.trim().trim_matches(|c| c == '"' || c == '\'');
    let v = v
        .strip_prefix('#')
        .or_else(|| v.strip_prefix("0x"))
        .or_else(|| v.strip_prefix("0X"))
        .unwrap_or(v);
    if !v.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    match v.len() {
        6 => Some(format!("#{}", v.to_ascii_lowercase())),
        3 => Some(format!(
            "#{}",
            v.chars()
                .flat_map(|c| [c, c])
                .collect::<String>()
                .to_ascii_lowercase()
        )),
        _ => None,
    }
}

/// The ANSI names in order, as Alacritty and Windows Terminal spell them.
pub(crate) const ANSI_NAMES: [&str; 8] = [
    "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
];

pub(crate) fn home() -> PathBuf {
    dirs::home_dir().unwrap_or_default()
}

/// `$XDG_CONFIG_HOME`, or `~/.config`, as the Unix-born terminals read it on
/// every system.
pub(crate) fn xdg_config() -> PathBuf {
    std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .unwrap_or_else(|| home().join(".config"))
}

pub(crate) fn read(path: &Path) -> Option<String> {
    std::fs::read_to_string(path).ok()
}

pub(crate) fn first_existing(paths: impl IntoIterator<Item = PathBuf>) -> Option<PathBuf> {
    paths.into_iter().find(|p| p.is_file())
}

fn gather() -> Vec<TerminalLook> {
    let mut looks = vec![ghostty::look(), kitty::look(), alacritty::look()];
    #[cfg(target_os = "macos")]
    looks.push(iterm::look());
    #[cfg(windows)]
    looks.push(winterm::look());
    looks
        .into_iter()
        .flatten()
        .filter(|l| !l.is_empty())
        .collect()
}

/// The terminals on this computer with a look of their own.
#[tauri::command]
pub async fn list_terminal_looks() -> Vec<TerminalLook> {
    tauri::async_runtime::spawn_blocking(gather)
        .await
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn colors_come_in_one_spelling() {
        assert_eq!(hex("#1D1F21").as_deref(), Some("#1d1f21"));
        assert_eq!(hex("1d1f21").as_deref(), Some("#1d1f21"));
        assert_eq!(hex("0x1d1f21").as_deref(), Some("#1d1f21"));
        assert_eq!(hex("'#abc'").as_deref(), Some("#aabbcc"));
        assert_eq!(hex("red"), None);
        assert_eq!(hex("#12345"), None);
    }

    #[test]
    fn colors_need_a_background_and_text() {
        let mut p = Palette::default();
        p.background = Some("#000000".into());
        assert_eq!(p.clone().finish(), None);
        p.foreground = Some("#ffffff".into());
        p.ansi[1] = Some("#ff0000".into());
        let colors = p.finish().unwrap();
        assert_eq!(colors.ansi.len(), 16);
        assert_eq!(colors.ansi[1], "#ff0000");
        assert_eq!(colors.ansi[0], "");
    }
}
