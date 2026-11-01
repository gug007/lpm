// Pinned projects from the phone: the desktop sidebar's Pin to top and Unpin
// (pinnedProjects.ts). The pins live in settings.json as `pinnedProjects`, in
// the order they were pinned, kept per machine.
use crate::config;
use serde_json::{json, Value};

/// The phone may send `sidebarPin`, and every sidebar reply carries `pins`.
pub const FEATURE: &str = "projectPins";

const KEY: &str = "pinnedProjects";

/// The pinned project names in pinned order, each once.
pub fn pins() -> Vec<String> {
    pins_in(&config::load_settings())
}

fn pins_in(settings: &Value) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let names = settings
        .get(KEY)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str);
    for name in names {
        if !out.iter().any(|n| n == name) {
            out.push(name.to_string());
        }
    }
    out
}

/// `pins` with `name` pinned at the end, or unpinned, as the desktop's
/// `withPin` does. A pin whose project is gone keeps its place.
fn with_pin(pins: &[String], name: &str, pinned: bool) -> Vec<String> {
    let mut next: Vec<String> = pins.iter().filter(|n| *n != name).cloned().collect();
    if pinned {
        next.push(name.to_string());
    }
    next
}

/// Pin or unpin `name`. The setting drops out of the file once nothing is
/// pinned, as it does on the desktop.
pub fn set_pinned(name: &str, pinned: bool) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("Project required.".into());
    }
    let mut settings = config::load_settings();
    let next = with_pin(&pins_in(&settings), name, pinned);
    let obj = settings
        .as_object_mut()
        .ok_or("settings.json malformed")?;
    if next.is_empty() {
        obj.remove(KEY);
    } else {
        obj.insert(KEY.into(), json!(next));
    }
    config::save_settings(&settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn pins_at_the_end_and_unpins_in_place() {
        let pins = names(&["api", "web"]);
        assert_eq!(with_pin(&pins, "docs", true), names(&["api", "web", "docs"]));
        assert_eq!(with_pin(&pins, "api", true), names(&["web", "api"]));
        assert_eq!(with_pin(&pins, "api", false), names(&["web"]));
        assert!(with_pin(&names(&["api"]), "api", false).is_empty());
    }

    #[test]
    fn reads_each_pin_once_and_skips_what_is_not_a_name() {
        let settings = json!({ "pinnedProjects": ["api", 3, "web", "api"] });
        assert_eq!(pins_in(&settings), names(&["api", "web"]));
        assert!(pins_in(&json!({})).is_empty());
    }
}
