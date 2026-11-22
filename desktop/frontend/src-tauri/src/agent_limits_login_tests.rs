use super::*;
use crate::agent_limits::{LimitWindow, ProviderLimits};

fn reading(id: &str, identity: Option<&str>, weekly: f64) -> ProviderLimits {
    ProviderLimits {
        provider: "claude".into(),
        account_id: Some(id.into()),
        weekly: Some(LimitWindow {
            used_percent: weekly,
            resets_at: 9_999_999_999,
            ..Default::default()
        }),
        updated_at: 1,
        identity: identity.map(str::to_string),
        ..Default::default()
    }
}

#[test]
fn only_two_known_accounts_that_differ_are_a_switch() {
    assert!(switched(Some("a:o"), Some("b:o")));
    assert!(!switched(Some("a:o"), Some("a:o")));
    assert!(!switched(None, Some("a:o")), "a reading that never said is kept");
    assert!(!switched(Some("a:o"), None), "a profile signed out says nothing");
}

#[test]
fn readings_of_a_login_the_profile_no_longer_holds_are_found() {
    let mut snapshot = HashMap::new();
    snapshot.insert("claude:default".to_string(), reading("default", Some("main:o"), 100.0));
    snapshot.insert("claude:second".to_string(), reading("second", Some("second:o"), 48.0));
    snapshot.insert("codex".to_string(), ProviderLimits { provider: "codex".into(), ..Default::default() });
    let now = |_: &str| Some("main:o".to_string());
    assert_eq!(switched_keys(&snapshot, now), vec!["claude:second".to_string()]);
}

#[test]
fn a_reading_of_another_account_replaces_rather_than_merges() {
    let store = AgentLimitsStore::new();
    store.set("claude:second", reading("second", Some("second:o"), 84.0), 100, true);
    store.set("claude:second", reading("second", Some("main:o"), 30.0), 200, true);
    let weekly = store.snapshot()["claude:second"].weekly.clone().unwrap().used_percent;
    assert_eq!(weekly, 30.0, "the old account's observed 84% must not win the merge");
    assert_eq!(store.snapshot()["claude:second"].identity.as_deref(), Some("main:o"));
}

#[test]
fn the_first_profile_of_an_account_speaks_for_it() {
    let order = ["default".to_string(), "second".to_string(), "third".to_string()];
    let now = |id: &str| match id {
        "default" | "second" => Some("main:o".to_string()),
        "third" => Some("third:o".to_string()),
        _ => None,
    };
    let same = same_login_as(&order, now);
    assert_eq!(same.get("second").map(String::as_str), Some("default"));
    assert!(!same.contains_key("default"));
    assert!(!same.contains_key("third"));
}

#[test]
fn signed_out_profiles_are_nobodys_duplicate() {
    let order = ["default".to_string(), "second".to_string()];
    assert!(same_login_as(&order, |_| None).is_empty());
}
