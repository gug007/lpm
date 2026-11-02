//! The phone's tab menu › Claude account: which of this Mac's Claude accounts a
//! tab's conversation runs as, and moving it to another, as the desktop's tab
//! menu does. Which tabs offer it is the desktop's call, reported with each tab.
use serde_json::{json, Map, Value};

/// The phone may send `switchTerminalAccount`.
pub(super) const FEATURE: &str = "tabAccount";

#[derive(Clone, Default, PartialEq, Eq, Debug)]
pub(super) struct TabAccount {
    /// The desktop's tab menu offers Claude account for the tab.
    can_switch: bool,
    /// While the tab moves to another account: that account's name. The desktop
    /// covers the tab until Claude is back there, and the phone does the same.
    switching_to: Option<String>,
    /// … and the terminal the tab ran before, which a phone showing it follows
    /// to this one.
    switched_from: Option<String>,
}

impl TabAccount {
    /// Read from one tab of the frontend's label push.
    pub(super) fn from_value(item: &Value) -> Self {
        let text = |k: &str| {
            item.get(k)
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
        };
        Self {
            can_switch: item
                .get("canSwitchAccount")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            switching_to: text("switchingTo"),
            switched_from: text("switchedFrom"),
        }
    }

    /// Add to a terminal as the phone lists it, with the account its shell was
    /// started for.
    pub(super) fn write(&self, terminal: &mut Map<String, Value>, account: Option<&str>) {
        terminal.insert("canSwitchAccount".into(), json!(self.can_switch));
        if let Some(account) = account.filter(|_| self.can_switch) {
            terminal.insert("claudeAccount".into(), json!(account));
        }
        if let Some(to) = &self.switching_to {
            terminal.insert("switchingTo".into(), json!(to));
        }
        if let Some(from) = &self.switched_from {
            terminal.insert("switchedFrom".into(), json!(from));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_claude_tab_lists_its_account_and_a_move_in_progress() {
        let tab = TabAccount::from_value(
            &json!({ "canSwitchAccount": true, "switchingTo": "Work", "switchedFrom": "app-3" }),
        );
        let mut terminal = Map::new();
        tab.write(&mut terminal, Some("acct-1"));
        assert_eq!(terminal["canSwitchAccount"], json!(true));
        assert_eq!(terminal["claudeAccount"], json!("acct-1"));
        assert_eq!(terminal["switchingTo"], json!("Work"));
        assert_eq!(terminal["switchedFrom"], json!("app-3"));
    }

    #[test]
    fn other_tabs_name_no_account() {
        let mut terminal = Map::new();
        TabAccount::from_value(&json!({ "switchingTo": "" })).write(&mut terminal, Some("default"));
        assert_eq!(terminal["canSwitchAccount"], json!(false));
        assert!(!terminal.contains_key("claudeAccount"));
        assert!(!terminal.contains_key("switchingTo"));
    }
}
