// Which Claude account a usage reading belongs to. A profile is a folder that
// holds one Claude login, but `/login` inside it swaps that login for another,
// and two profiles can end up holding the same account. Readings are taken
// under the login a profile holds at the time, so after a swap its old ones are
// another account's, and a reply on either of two same-login profiles is news
// for both: they share one plan.
use crate::agent_limits::AgentLimitsStore;
use std::collections::HashMap;

/// The Claude account `id` is signed in as now, or None when it isn't.
pub fn identity_of(id: &str) -> Option<String> {
    crate::claude_pool_members::ident_of(id).identity
}

/// Whether a reading taken as `stored` belongs to another account than
/// `current`. A side that doesn't know its account says nothing.
pub fn switched(stored: Option<&str>, current: Option<&str>) -> bool {
    matches!((stored, current), (Some(a), Some(b)) if a != b)
}

/// Every profile here other than `id` signed in as `identity`.
pub fn other_profiles_like(id: &str, identity: Option<&str>) -> Vec<String> {
    let Some(identity) = identity else {
        return Vec::new();
    };
    crate::agent_limits_share::local_identities()
        .into_iter()
        .filter(|(other, theirs)| other != id && theirs == identity)
        .map(|(other, _)| other)
        .collect()
}

/// Drops the readings of an account their profile no longer holds; true when
/// any were dropped.
pub fn drop_switched(store: &AgentLimitsStore) -> bool {
    let stale = switched_keys(&store.snapshot(), identity_of);
    store.remove(&stale)
}

fn switched_keys(
    snapshot: &HashMap<String, crate::agent_limits::ProviderLimits>,
    current: impl Fn(&str) -> Option<String>,
) -> Vec<String> {
    snapshot
        .iter()
        .filter_map(|(key, reading)| {
            let id = key.strip_prefix("claude:")?;
            switched(reading.identity.as_deref(), current(id).as_deref()).then(|| key.clone())
        })
        .collect()
}

/// The main login, then each account added in Settings.
pub fn login_ids() -> impl Iterator<Item = String> {
    std::iter::once(crate::claude_dirs::MAIN_LOGIN.to_string()).chain(crate::config::registered_claude_account_ids())
}

/// `same_login_as` over this computer's logins as they are signed in now.
pub fn same_logins() -> HashMap<String, String> {
    same_login_as(&login_ids().collect::<Vec<_>>(), identity_of)
}

/// For each profile signed in as the same Claude account as one before it in
/// `order`, that earlier profile: the one whose card speaks for the account.
pub fn same_login_as(order: &[String], current: impl Fn(&str) -> Option<String>) -> HashMap<String, String> {
    let mut first: HashMap<String, String> = HashMap::new();
    let mut out = HashMap::new();
    for id in order {
        let Some(identity) = current(id) else { continue };
        match first.get(&identity) {
            Some(earlier) => {
                out.insert(id.clone(), earlier.clone());
            }
            None => {
                first.insert(identity, id.clone());
            }
        }
    }
    out
}

#[cfg(test)]
#[path = "agent_limits_login_tests.rs"]
mod tests;
