use crate::config;
use serde_norway::Value as Yaml;
use tauri::{AppHandle, Emitter};

const KEY: &str = "claudeAccount";

/// Pin a project to a Claude account in its own YAML, so a copy can run on a
/// different account than its parent. `None` drops the pin (a copy follows its
/// parent again); `Some("")` is the main login, which a copy has to state
/// explicitly or it would inherit the parent's pin.
fn apply_claude_account(
    doc: &mut Yaml,
    account: Option<&str>,
    has_parent: bool,
) -> Result<bool, String> {
    let map = doc
        .as_mapping_mut()
        .ok_or_else(|| "The config file isn't valid.".to_string())?;
    let next = match account {
        Some("") if !has_parent => None,
        Some(id) => Some(Yaml::from(id)),
        None => None,
    };
    if map.get(KEY) == next.as_ref() {
        return Ok(false);
    }
    match next {
        Some(v) => {
            map.insert(KEY.into(), v);
        }
        None => {
            map.remove(KEY);
        }
    }
    Ok(true)
}

#[tauri::command(async)]
pub fn set_claude_account(
    app: AppHandle,
    name: String,
    account: Option<String>,
) -> Result<(), String> {
    if let Some(id) = account.as_deref().filter(|id| !id.is_empty()) {
        if !config::valid_claude_account_id(id) {
            return Err(format!("invalid account id {id:?}"));
        }
    }
    let has_parent = config::peek_parent(&name).is_some();
    let wrote = config::edit_project_yaml(&name, |doc| {
        apply_claude_account(doc, account.as_deref(), has_parent)
    })?;
    if wrote {
        let _ = app.emit("projects-changed", ());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn doc(yaml: &str) -> Yaml {
        serde_norway::from_str(yaml).unwrap()
    }

    fn pin(d: &Yaml) -> Option<&str> {
        d.get(KEY).map(|v| v.as_str().unwrap())
    }

    #[test]
    fn pins_an_account_and_keeps_the_rest() {
        let mut d = doc("name: api\nroot: /tmp/api\n");
        assert!(apply_claude_account(&mut d, Some("work"), false).unwrap());
        assert_eq!(pin(&d), Some("work"));
        assert_eq!(d.get("root").and_then(Yaml::as_str), Some("/tmp/api"));
    }

    #[test]
    fn main_login_drops_the_key_on_a_project() {
        let mut d = doc("name: api\nclaudeAccount: work\n");
        assert!(apply_claude_account(&mut d, Some(""), false).unwrap());
        assert_eq!(pin(&d), None);
    }

    #[test]
    fn main_login_is_explicit_on_a_copy() {
        let mut d = doc("name: api-1\nparent_name: api\n");
        assert!(apply_claude_account(&mut d, Some(""), true).unwrap());
        assert_eq!(pin(&d), Some(""));
    }

    #[test]
    fn following_the_parent_drops_the_key() {
        let mut d = doc("name: api-1\nparent_name: api\nclaudeAccount: work\n");
        assert!(apply_claude_account(&mut d, None, true).unwrap());
        assert_eq!(pin(&d), None);
    }

    #[test]
    fn an_unchanged_pin_writes_nothing() {
        let mut d = doc("name: api\nclaudeAccount: work\n");
        assert!(!apply_claude_account(&mut d, Some("work"), false).unwrap());
        let mut d = doc("name: api\n");
        assert!(!apply_claude_account(&mut d, Some(""), false).unwrap());
    }
}
