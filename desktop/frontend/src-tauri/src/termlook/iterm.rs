//! iTerm2: its preferences plist, the default profile's font and colors.
use super::{home, LookColors, Palette, TerminalLook};
use plist::{Dictionary, Value};

fn component(color: &Dictionary, key: &str) -> Option<u8> {
    let v = color.get(key)?.as_real()?;
    Some((v.clamp(0.0, 1.0) * 255.0).round() as u8)
}

fn color(profile: &Dictionary, key: &str, dark: bool) -> Option<String> {
    let dict = dark
        .then(|| profile.get(&format!("{key} (Dark)")))
        .flatten()
        .or_else(|| profile.get(key))?
        .as_dictionary()?;
    let (r, g, b) = (
        component(dict, "Red Component")?,
        component(dict, "Green Component")?,
        component(dict, "Blue Component")?,
    );
    Some(format!("#{r:02x}{g:02x}{b:02x}"))
}

fn colors(profile: &Dictionary) -> Option<LookColors> {
    let dark = profile
        .get("Use Separate Colors for Light and Dark Mode")
        .and_then(Value::as_boolean)
        .unwrap_or(false);
    let mut palette = Palette {
        background: color(profile, "Background Color", dark),
        foreground: color(profile, "Foreground Color", dark),
        cursor: color(profile, "Cursor Color", dark),
        selection: color(profile, "Selection Color", dark),
        ..Default::default()
    };
    for (n, slot) in palette.ansi.iter_mut().enumerate() {
        *slot = color(profile, &format!("Ansi {n} Color"), dark);
    }
    palette.finish()
}

/// "MesloLGS-NF-Regular 12": the font's own name, and its size.
fn font(profile: &Dictionary) -> (Option<String>, Option<f64>) {
    let Some(spec) = profile.get("Normal Font").and_then(Value::as_string) else {
        return (None, None);
    };
    match spec.rsplit_once(' ') {
        Some((name, size)) if size.parse::<f64>().is_ok() => (Some(name.to_string()), size.parse().ok()),
        _ => (Some(spec.to_string()), None),
    }
}

pub(super) fn look_from(root: &Value) -> Option<TerminalLook> {
    let root = root.as_dictionary()?;
    let profiles = root.get("New Bookmarks")?.as_array()?;
    let guid = root.get("Default Bookmark Guid").and_then(Value::as_string);
    let profile = profiles
        .iter()
        .filter_map(Value::as_dictionary)
        .find(|p| guid.is_some() && p.get("Guid").and_then(Value::as_string) == guid)
        .or_else(|| profiles.first().and_then(Value::as_dictionary))?;
    let (font_family, font_size) = font(profile);
    Some(TerminalLook {
        app: "iTerm2".into(),
        font_family,
        font_size,
        theme_name: None,
        colors: colors(profile),
    })
}

pub(super) fn look() -> Option<TerminalLook> {
    let path = home().join("Library/Preferences/com.googlecode.iterm2.plist");
    look_from(&Value::from_file(path).ok()?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rgb(r: f64, g: f64, b: f64) -> Value {
        let mut d = Dictionary::new();
        d.insert("Red Component".into(), Value::Real(r));
        d.insert("Green Component".into(), Value::Real(g));
        d.insert("Blue Component".into(), Value::Real(b));
        Value::Dictionary(d)
    }

    #[test]
    fn reads_the_default_profiles_font_and_colors() {
        let mut other = Dictionary::new();
        other.insert("Guid".into(), Value::String("a".into()));
        other.insert("Normal Font".into(), Value::String("Menlo-Regular 11".into()));
        let mut main = Dictionary::new();
        main.insert("Guid".into(), Value::String("b".into()));
        main.insert("Normal Font".into(), Value::String("MesloLGS-NF-Regular 12".into()));
        main.insert("Background Color".into(), rgb(0.0, 0.168, 0.212));
        main.insert("Foreground Color".into(), rgb(0.514, 0.580, 0.588));
        main.insert("Ansi 1 Color".into(), rgb(0.863, 0.196, 0.184));
        let mut root = Dictionary::new();
        root.insert("Default Bookmark Guid".into(), Value::String("b".into()));
        root.insert(
            "New Bookmarks".into(),
            Value::Array(vec![Value::Dictionary(other), Value::Dictionary(main)]),
        );
        let look = look_from(&Value::Dictionary(root)).unwrap();
        assert_eq!(look.font_family.as_deref(), Some("MesloLGS-NF-Regular"));
        assert_eq!(look.font_size, Some(12.0));
        let colors = look.colors.unwrap();
        assert_eq!(colors.background, "#002b36");
        assert_eq!(colors.ansi[1], "#dc322f");
    }
}
