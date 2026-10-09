//! Which Claude account(s) a project's new sessions may use, from its two keys:
//! `claudeAccount` (one account, `''` = the main login only) and
//! `claudeAccounts` (an ordered list lpm picks from). Neither key means the
//! main accounts from Settings. A copy follows its parent's keys as one setting
//! unless it sets either key itself; `claudeAccounts: []` on a copy means "the
//! main accounts, not the parent's choice".
use crate::claude_dirs::MAIN_LOGIN;
use crate::config;

#[derive(Debug, Clone, PartialEq)]
pub enum AccountChoice {
    /// SSH projects run on the far side under its own login.
    Remote,
    /// The main accounts list (or just the main login while switching is off).
    Main,
    /// Always this account; `""` is the main login.
    Pin(String),
    /// Pick from these, in order. `owner` is the project whose file holds the
    /// list, so every copy of it shares one current choice.
    List { owner: String, ids: Vec<String> },
}

/// Ids in a `claudeAccounts` value, read leniently: a single string counts as
/// a one-item list, anything that can't be an account id is dropped, and
/// duplicates keep their first position.
pub fn account_list(value: &serde_norway::Value) -> Vec<String> {
    let items: Vec<&str> = match value {
        serde_norway::Value::String(s) => vec![s.as_str()],
        serde_norway::Value::Sequence(seq) => seq.iter().filter_map(|v| v.as_str()).collect(),
        _ => Vec::new(),
    };
    let mut out: Vec<String> = Vec::new();
    for id in items {
        let id = id.trim();
        if (id == MAIN_LOGIN || config::valid_claude_account_id(id)) && !out.iter().any(|o| o == id)
        {
            out.push(id.to_string());
        }
    }
    out
}

fn own_choice(keys: &config::ClaudeKeys, owner: &str) -> Option<AccountChoice> {
    if let Some(id) = &keys.account {
        return Some(AccountChoice::Pin(id.clone()));
    }
    let list = account_list(keys.accounts.as_ref()?);
    Some(if list.is_empty() {
        AccountChoice::Main
    } else {
        AccountChoice::List {
            owner: owner.to_string(),
            ids: list,
        }
    })
}

pub fn claude_choice(project: &str) -> AccountChoice {
    if config::is_global_project(project) {
        return AccountChoice::Main;
    }
    let Some(keys) = config::claude_keys(project) else {
        return AccountChoice::Main;
    };
    if keys.remote {
        return AccountChoice::Remote;
    }
    if let Some(choice) = own_choice(&keys, project) {
        return choice;
    }
    if keys.parent.is_empty() {
        return AccountChoice::Main;
    }
    config::claude_keys(&keys.parent)
        .and_then(|parent| own_choice(&parent, &keys.parent))
        .unwrap_or(AccountChoice::Main)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn yaml(s: &str) -> serde_norway::Value {
        serde_norway::from_str(s).unwrap()
    }

    fn keys(account: Option<&str>, accounts: Option<&str>) -> config::ClaudeKeys {
        config::ClaudeKeys {
            account: account.map(str::to_string),
            accounts: accounts.map(yaml),
            parent: String::new(),
            remote: false,
        }
    }

    #[test]
    fn reads_lists_leniently() {
        assert_eq!(
            account_list(&yaml("[work, side, work]")),
            vec!["work", "side"]
        );
        assert_eq!(account_list(&yaml("work")), vec!["work"]);
        assert_eq!(account_list(&yaml("[default, '../x', 3]")), vec!["default"]);
        assert!(account_list(&yaml("{a: b}")).is_empty());
    }

    #[test]
    fn a_pin_beats_a_list_in_the_same_file() {
        assert_eq!(
            own_choice(&keys(Some("work"), Some("[side]")), "api"),
            Some(AccountChoice::Pin("work".into()))
        );
    }

    #[test]
    fn an_empty_list_means_the_main_accounts() {
        assert_eq!(
            own_choice(&keys(None, Some("[]")), "api"),
            Some(AccountChoice::Main)
        );
        assert_eq!(own_choice(&keys(None, None), "api"), None);
    }

    #[test]
    fn a_list_names_its_owner() {
        assert_eq!(
            own_choice(&keys(None, Some("[work, default]")), "api"),
            Some(AccountChoice::List {
                owner: "api".into(),
                ids: vec!["work".into(), "default".into()],
            })
        );
    }
}
