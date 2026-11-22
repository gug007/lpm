//! The phone's tab menu beyond close / rename / pin: forking a tab's agent
//! conversation, here or into a fresh copy of the project, giving a tab back its
//! conversation title, and closing every other tab. Which of these a tab offers
//! is the desktop's call, reported with each tab and passed on to the phone.
use serde_json::{json, Map, Value};

/// The phone may send `forkTerminal`, `forkTerminalCopy`, `titleTerminal` and
/// `closeOtherTerminals`.
pub(super) const FEATURE: &str = "tabMenu";

/// The phone may send `moveTerminal`: a tab to another project on this Mac.
pub(super) const MOVE_FEATURE: &str = "moveTab";

#[derive(Clone, Copy, Default, PartialEq, Eq, Debug)]
pub(super) struct TabCaps {
    fork: bool,
    fork_copy: bool,
    title: bool,
}

impl TabCaps {
    /// Read from one tab of the frontend's label push.
    pub(super) fn from_value(item: &Value) -> Self {
        let flag = |k: &str| item.get(k).and_then(Value::as_bool).unwrap_or(false);
        Self {
            fork: flag("canFork"),
            fork_copy: flag("canForkCopy"),
            title: flag("canTitle"),
        }
    }

    /// Add the flags to a terminal as the phone lists it.
    pub(super) fn write(self, terminal: &mut Map<String, Value>) {
        terminal.insert("canFork".into(), json!(self.fork));
        terminal.insert("canForkCopy".into(), json!(self.fork_copy));
        terminal.insert("canTitle".into(), json!(self.title));
    }
}

/// The tab op a phone verb relays to the tab tree, for the verbs this module adds.
pub(super) fn op(verb: &str) -> Option<&'static str> {
    match verb {
        "forkTerminal" => Some("fork"),
        "forkTerminalCopy" => Some("forkCopy"),
        "titleTerminal" => Some("title"),
        "closeOtherTerminals" => Some("closeOthers"),
        "moveTerminal" => Some("move"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn caps_round_trip_to_the_phone() {
        let caps = TabCaps::from_value(&json!({ "canFork": true, "canTitle": true }));
        let mut terminal = Map::new();
        caps.write(&mut terminal);
        assert_eq!(terminal["canFork"], json!(true));
        assert_eq!(terminal["canForkCopy"], json!(false));
        assert_eq!(terminal["canTitle"], json!(true));
    }

    #[test]
    fn missing_flags_offer_nothing() {
        assert_eq!(
            TabCaps::from_value(&json!({ "id": "t1" })),
            TabCaps::default()
        );
    }

    #[test]
    fn verbs_map_to_tab_ops() {
        assert_eq!(op("forkTerminal"), Some("fork"));
        assert_eq!(op("forkTerminalCopy"), Some("forkCopy"));
        assert_eq!(op("titleTerminal"), Some("title"));
        assert_eq!(op("closeOtherTerminals"), Some("closeOthers"));
        assert_eq!(op("moveTerminal"), Some("move"));
        assert_eq!(op("closeTerminal"), None);
    }
}
