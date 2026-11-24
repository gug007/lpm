//! The phone's tab menu beyond close / rename / pin: forking a tab's agent
//! conversation, here or into a fresh copy of the project, giving a tab back its
//! conversation title, closing every other tab, and a close that waits for the
//! tab's agent to finish. Which of these a tab offers, and whether one waits to
//! close, is the desktop's call, reported with each tab and passed on to the phone.
use serde_json::{json, Map, Value};

/// The phone may send `forkTerminal`, `forkTerminalCopy`, `titleTerminal` and
/// `closeOtherTerminals`.
pub(super) const FEATURE: &str = "tabMenu";

/// The phone may send `moveTerminal`: a tab to another project on this Mac.
pub(super) const MOVE_FEATURE: &str = "moveTab";

/// The phone may send `whenDone` with `closeTerminal` and `closeOtherTerminals`,
/// and `keepTerminal`.
pub(super) const CLOSE_WHEN_DONE_FEATURE: &str = "closeWhenDone";

#[derive(Clone, Copy, Default, PartialEq, Eq, Debug)]
pub(super) struct TabCaps {
    fork: bool,
    fork_copy: bool,
    title: bool,
    closes_when_done: bool,
}

impl TabCaps {
    /// Read from one tab of the frontend's label push.
    pub(super) fn from_value(item: &Value) -> Self {
        let flag = |k: &str| item.get(k).and_then(Value::as_bool).unwrap_or(false);
        Self {
            fork: flag("canFork"),
            fork_copy: flag("canForkCopy"),
            title: flag("canTitle"),
            closes_when_done: flag("closesWhenDone"),
        }
    }

    /// Add the flags to a terminal as the phone lists it.
    pub(super) fn write(self, terminal: &mut Map<String, Value>) {
        terminal.insert("canFork".into(), json!(self.fork));
        terminal.insert("canForkCopy".into(), json!(self.fork_copy));
        terminal.insert("canTitle".into(), json!(self.title));
        terminal.insert("closesWhenDone".into(), json!(self.closes_when_done));
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
        "keepTerminal" => Some("keepOpen"),
        _ => None,
    }
}

/// A close the phone asked for with `whenDone` waits for the agents it would end.
pub(super) fn when_done(op: &'static str, msg: &Value) -> &'static str {
    if msg.get("whenDone").and_then(Value::as_bool) != Some(true) {
        return op;
    }
    match op {
        "close" => "closeWhenDone",
        "closeOthers" => "closeOthersWhenDone",
        _ => op,
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
        assert_eq!(terminal["closesWhenDone"], json!(false));

        TabCaps::from_value(&json!({ "closesWhenDone": true })).write(&mut terminal);
        assert_eq!(terminal["closesWhenDone"], json!(true));
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
        assert_eq!(op("keepTerminal"), Some("keepOpen"));
        assert_eq!(op("closeTerminal"), None);
    }

    #[test]
    fn only_a_close_waits_and_only_when_asked() {
        let asked = json!({ "whenDone": true });
        assert_eq!(when_done("close", &asked), "closeWhenDone");
        assert_eq!(when_done("closeOthers", &asked), "closeOthersWhenDone");
        assert_eq!(when_done("pin", &asked), "pin");
        assert_eq!(when_done("close", &json!({})), "close");
        assert_eq!(when_done("close", &json!({ "whenDone": false })), "close");
    }
}
