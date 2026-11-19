//! Windows Terminal: its settings.json (JSON with comments), the default
//! profile's font and color scheme over the profile defaults.
use super::{Palette, TerminalLook, ANSI_NAMES};
use serde_json::Value;

#[cfg(windows)]
fn settings_paths() -> Vec<std::path::PathBuf> {
    let Some(local) = std::env::var_os("LOCALAPPDATA").map(std::path::PathBuf::from) else {
        return Vec::new();
    };
    vec![
        local.join("Packages/Microsoft.WindowsTerminal_8wekyb3d8bbwe/LocalState/settings.json"),
        local.join("Packages/Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe/LocalState/settings.json"),
        local.join("Microsoft/Windows Terminal/settings.json"),
    ]
}

/// JSON from JSON with comments and trailing commas.
pub(super) fn strip_jsonc(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    let (mut i, mut in_string) = (0, false);
    while i < chars.len() {
        let c = chars[i];
        if in_string {
            out.push(c);
            if c == '\\' && i + 1 < chars.len() {
                out.push(chars[i + 1]);
                i += 1;
            } else if c == '"' {
                in_string = false;
            }
        } else if c == '"' {
            in_string = true;
            out.push(c);
        } else if c == '/' && chars.get(i + 1) == Some(&'/') {
            while i < chars.len() && chars[i] != '\n' {
                i += 1;
            }
            continue;
        } else if c == '/' && chars.get(i + 1) == Some(&'*') {
            i += 2;
            while i + 1 < chars.len() && !(chars[i] == '*' && chars[i + 1] == '/') {
                i += 1;
            }
            i += 2;
            continue;
        } else if c == ',' {
            let next = chars[i + 1..].iter().find(|c| !c.is_whitespace());
            if !matches!(next, Some('}') | Some(']')) {
                out.push(c);
            }
        } else {
            out.push(c);
        }
        i += 1;
    }
    out
}

fn scheme_name(value: &Value) -> Option<String> {
    value
        .as_str()
        .or_else(|| value.get("dark").and_then(Value::as_str))
        .map(str::to_string)
}

pub(super) fn look_from(settings: &Value) -> Option<TerminalLook> {
    let profiles = settings.get("profiles")?;
    let defaults = profiles.get("defaults");
    let default_guid = settings.get("defaultProfile").and_then(Value::as_str);
    let main = profiles.get("list").and_then(Value::as_array).and_then(|list| {
        list.iter()
            .find(|p| default_guid.is_some() && p.get("guid").and_then(Value::as_str) == default_guid)
    });
    let pick = |key: &str| main.and_then(|p| p.get(key)).or_else(|| defaults.and_then(|d| d.get(key)));
    let font = |key: &str, legacy: &str| {
        main.and_then(|p| p.get("font").and_then(|f| f.get(key)).or_else(|| p.get(legacy)))
            .or_else(|| defaults.and_then(|d| d.get("font").and_then(|f| f.get(key)).or_else(|| d.get(legacy))))
    };
    let theme = pick("colorScheme").and_then(scheme_name);
    let scheme = theme.as_ref().and_then(|name| {
        settings
            .get("schemes")?
            .as_array()?
            .iter()
            .find(|s| s.get("name").and_then(Value::as_str) == Some(name))
    });
    let colors = scheme.and_then(|s| {
        let color = |key: &str| s.get(key).and_then(Value::as_str).and_then(super::hex);
        let mut palette = Palette {
            background: color("background"),
            foreground: color("foreground"),
            cursor: color("cursorColor"),
            selection: color("selectionBackground"),
            ..Default::default()
        };
        for (i, name) in ANSI_NAMES.iter().enumerate() {
            let name = if *name == "magenta" { "purple" } else { name };
            palette.ansi[i] = color(name);
            let bright = format!("bright{}{}", name[..1].to_uppercase(), &name[1..]);
            palette.ansi[i + 8] = color(&bright);
        }
        palette.finish()
    });
    Some(TerminalLook {
        app: "Windows Terminal".into(),
        font_family: font("face", "fontFace").and_then(Value::as_str).map(str::to_string),
        font_size: font("size", "fontSize").and_then(Value::as_f64),
        theme_name: theme,
        colors,
    })
}

#[cfg(windows)]
pub(super) fn look() -> Option<TerminalLook> {
    let path = super::first_existing(settings_paths())?;
    let settings: Value = serde_json::from_str(&strip_jsonc(&super::read(&path)?)).ok()?;
    look_from(&settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_jsonc_and_the_default_profiles_scheme() {
        let text = r##"{
            // the profile that opens
            "defaultProfile": "{b}",
            "profiles": {
                "defaults": { "font": { "face": "Cascadia Code", "size": 12 }, "colorScheme": "Campbell" },
                "list": [ { "guid": "{b}", "colorScheme": "One Half Dark", }, ]
            },
            /* custom */
            "schemes": [ { "name": "One Half Dark", "background": "#282C34", "foreground": "#DCDFE4",
                "purple": "#C678DD", "brightRed": "#E06C75", "url": "http://x//y" } ]
        }"##;
        let settings: Value = serde_json::from_str(&strip_jsonc(text)).unwrap();
        let look = look_from(&settings).unwrap();
        assert_eq!(look.font_family.as_deref(), Some("Cascadia Code"));
        assert_eq!(look.font_size, Some(12.0));
        assert_eq!(look.theme_name.as_deref(), Some("One Half Dark"));
        let colors = look.colors.unwrap();
        assert_eq!(colors.background, "#282c34");
        assert_eq!(colors.ansi[5], "#c678dd");
        assert_eq!(colors.ansi[9], "#e06c75");
    }
}
