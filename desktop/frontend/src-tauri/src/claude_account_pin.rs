use crate::claude_dirs::MAIN_LOGIN;
use crate::claude_pool_store::MAX_MEMBERS;
use crate::config;
use serde::Deserialize;
use serde_norway::Value as Yaml;
use tauri::{AppHandle, Emitter};

const PIN: &str = "claudeAccount";
const LIST: &str = "claudeAccounts";

/// What a project's new Claude sessions use, as chosen in the project menu or
/// the config editor. Written into the project's own YAML as both keys at once,
/// so an old pin can never outrank a new list (or the reverse).
#[derive(Deserialize, Debug, Clone, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AccountChoiceArg {
    /// A copy follows its parent again.
    Parent,
    /// The main accounts from Settings.
    Main,
    /// Always one account; `""` is the main login.
    Pin { id: String },
    /// Pick from these accounts, in order.
    List { ids: Vec<String> },
}

fn valid_member(id: &str) -> bool {
    id == MAIN_LOGIN || config::valid_claude_account_id(id)
}

fn apply_choice(
    doc: &mut Yaml,
    choice: &AccountChoiceArg,
    has_parent: bool,
) -> Result<bool, String> {
    let map = doc
        .as_mapping_mut()
        .ok_or_else(|| "The config file isn't valid.".to_string())?;
    let (pin, list): (Option<Yaml>, Option<Yaml>) = match choice {
        AccountChoiceArg::Parent => (None, None),
        AccountChoiceArg::Main => (None, has_parent.then(|| Yaml::Sequence(Vec::new()))),
        AccountChoiceArg::Pin { id } => {
            if !id.is_empty() && !config::valid_claude_account_id(id) {
                return Err(format!("invalid account id {id:?}"));
            }
            (Some(Yaml::from(id.as_str())), None)
        }
        AccountChoiceArg::List { ids } => {
            let mut out: Vec<Yaml> = Vec::new();
            for id in ids {
                if !valid_member(id) {
                    return Err(format!("invalid account id {id:?}"));
                }
                let v = Yaml::from(id.as_str());
                if !out.contains(&v) {
                    out.push(v);
                }
            }
            if out.is_empty() || out.len() > MAX_MEMBERS {
                return Err(format!("Choose between 1 and {MAX_MEMBERS} accounts."));
            }
            (None, Some(Yaml::Sequence(out)))
        }
    };
    let mut changed = false;
    for (key, next) in [(PIN, pin), (LIST, list)] {
        if map.get(key) == next.as_ref() {
            continue;
        }
        changed = true;
        match next {
            Some(v) => {
                map.insert(key.into(), v);
            }
            None => {
                map.remove(key);
            }
        }
    }
    Ok(changed)
}

#[tauri::command(async)]
pub fn set_claude_account_choice(
    app: AppHandle,
    name: String,
    choice: AccountChoiceArg,
) -> Result<(), String> {
    let has_parent = config::peek_parent(&name).is_some();
    let wrote = config::edit_project_yaml(&name, |doc| apply_choice(doc, &choice, has_parent))?;
    if wrote {
        let _ = app.emit("projects-changed", ());
        crate::claude_pool::refresh();
    }
    Ok(())
}

/// The older single-account setter, kept for peers on earlier builds:
/// `Some(id)` pins (`""` = main login), `None` follows the parent.
#[tauri::command(async)]
pub fn set_claude_account(
    app: AppHandle,
    name: String,
    account: Option<String>,
) -> Result<(), String> {
    let choice = match account {
        Some(id) => AccountChoiceArg::Pin { id },
        None => AccountChoiceArg::Parent,
    };
    set_claude_account_choice(app, name, choice)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn doc(yaml: &str) -> Yaml {
        serde_norway::from_str(yaml).unwrap()
    }

    fn pin(d: &Yaml) -> Option<&str> {
        d.get(PIN).map(|v| v.as_str().unwrap())
    }

    fn list(d: &Yaml) -> Option<Vec<&str>> {
        d.get(LIST).map(|v| {
            v.as_sequence()
                .unwrap()
                .iter()
                .map(|i| i.as_str().unwrap())
                .collect()
        })
    }

    fn pin_to(id: &str) -> AccountChoiceArg {
        AccountChoiceArg::Pin { id: id.into() }
    }

    #[test]
    fn pins_an_account_and_keeps_the_rest() {
        let mut d = doc("name: api\nroot: /tmp/api\n");
        assert!(apply_choice(&mut d, &pin_to("work"), false).unwrap());
        assert_eq!(pin(&d), Some("work"));
        assert_eq!(d.get("root").and_then(Yaml::as_str), Some("/tmp/api"));
    }

    #[test]
    fn main_login_only_is_written_out_on_every_project() {
        let mut d = doc("name: api\nclaudeAccount: work\n");
        assert!(apply_choice(&mut d, &pin_to(""), false).unwrap());
        assert_eq!(pin(&d), Some(""));
        let mut d = doc("name: api-1\nparent_name: api\n");
        assert!(apply_choice(&mut d, &pin_to(""), true).unwrap());
        assert_eq!(pin(&d), Some(""));
    }

    #[test]
    fn main_accounts_drop_both_keys_on_a_project() {
        let mut d = doc("name: api\nclaudeAccount: work\nclaudeAccounts: [side]\n");
        assert!(apply_choice(&mut d, &AccountChoiceArg::Main, false).unwrap());
        assert_eq!((pin(&d), list(&d)), (None, None));
    }

    #[test]
    fn main_accounts_on_a_copy_stop_following_the_parent() {
        let mut d = doc("name: api-1\nparent_name: api\nclaudeAccount: work\n");
        assert!(apply_choice(&mut d, &AccountChoiceArg::Main, true).unwrap());
        assert_eq!(pin(&d), None);
        assert_eq!(list(&d), Some(vec![]));
    }

    #[test]
    fn a_list_replaces_a_pin() {
        let mut d = doc("name: api\nclaudeAccount: work\n");
        let choice = AccountChoiceArg::List {
            ids: vec!["work".into(), "default".into(), "work".into()],
        };
        assert!(apply_choice(&mut d, &choice, false).unwrap());
        assert_eq!(pin(&d), None);
        assert_eq!(list(&d), Some(vec!["work", "default"]));
    }

    #[test]
    fn rejects_lists_that_are_empty_too_long_or_unsafe() {
        let mut d = doc("name: api\n");
        let too_long = AccountChoiceArg::List {
            ids: vec!["a".into(), "b".into(), "c".into(), "d".into()],
        };
        assert!(apply_choice(&mut d, &too_long, false).is_err());
        assert!(apply_choice(&mut d, &AccountChoiceArg::List { ids: vec![] }, false).is_err());
        let unsafe_id = AccountChoiceArg::List {
            ids: vec!["../x".into()],
        };
        assert!(apply_choice(&mut d, &unsafe_id, false).is_err());
    }

    #[test]
    fn following_the_parent_drops_both_keys() {
        let mut d = doc("name: api-1\nparent_name: api\nclaudeAccounts: [work]\n");
        assert!(apply_choice(&mut d, &AccountChoiceArg::Parent, true).unwrap());
        assert_eq!((pin(&d), list(&d)), (None, None));
    }

    #[test]
    fn an_unchanged_choice_writes_nothing() {
        let mut d = doc("name: api\nclaudeAccount: work\n");
        assert!(!apply_choice(&mut d, &pin_to("work"), false).unwrap());
        let mut d = doc("name: api\n");
        assert!(!apply_choice(&mut d, &AccountChoiceArg::Main, false).unwrap());
    }
}
