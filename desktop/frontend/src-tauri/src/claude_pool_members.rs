//! What lpm knows about each account when picking one: sign-in, which Claude
//! account it is and its plan (all from the `.claude.json` Claude Code writes
//! in that account's config dir), plus the last usage reading Claude Code
//! reported. Nothing here touches credentials or the network.
use crate::agent_limits::ProviderLimits;
use crate::claude_dirs::MAIN_LOGIN;
use crate::claude_pool_pick::{Member, Window};
use crate::claude_pool_store::PoolFile;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::SystemTime;

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Ident {
    pub signed_in: bool,
    #[serde(skip)]
    pub identity: Option<String>,
    pub email: String,
    /// "max", "pro", "team", "enterprise", or "" when unknown.
    pub plan: String,
    /// "Max 20x", "Pro", "Team"... for display.
    pub plan_label: String,
}

impl Ident {
    /// Personal subscriptions join automatic lists without an extra step;
    /// anything else needs the user to allow it.
    pub fn personal(&self) -> bool {
        matches!(self.plan.as_str(), "max" | "pro")
    }
}

#[derive(Deserialize)]
struct ClaudeJson {
    #[serde(rename = "oauthAccount")]
    oauth: Option<OauthAccount>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OauthAccount {
    account_uuid: Option<String>,
    organization_uuid: Option<String>,
    email_address: Option<String>,
    organization_type: Option<String>,
    organization_rate_limit_tier: Option<String>,
}

fn ident_from(bytes: &[u8]) -> Ident {
    let Some(oa) = serde_json::from_slice::<ClaudeJson>(bytes)
        .ok()
        .and_then(|j| j.oauth)
    else {
        return Ident::default();
    };
    let plan = match oa.organization_type.as_deref().unwrap_or("") {
        "claude_max" => "max",
        "claude_pro" => "pro",
        "claude_team" => "team",
        "claude_enterprise" => "enterprise",
        _ => "",
    };
    let tier = oa
        .organization_rate_limit_tier
        .as_deref()
        .and_then(|t| t.rsplit('_').next())
        .filter(|t| t.ends_with('x') && t[..t.len() - 1].chars().all(|c| c.is_ascii_digit()))
        .map(str::to_string);
    let plan_label = match (plan, tier) {
        ("max", Some(t)) => format!("Max {t}"),
        ("max", None) => "Max".into(),
        ("pro", _) => "Pro".into(),
        ("team", _) => "Team".into(),
        ("enterprise", _) => "Enterprise".into(),
        _ => String::new(),
    };
    Ident {
        signed_in: true,
        identity: oa
            .account_uuid
            .map(|a| format!("{a}:{}", oa.organization_uuid.unwrap_or_default())),
        email: oa.email_address.unwrap_or_default(),
        plan: plan.into(),
        plan_label,
    }
}

/// Where Claude Code keeps an account's `.claude.json`: inside the account's
/// config dir, or beside `~/.claude` for the main login.
fn claude_json_path(id: &str) -> PathBuf {
    if id == MAIN_LOGIN {
        let base = std::env::var_os(crate::config::CLAUDE_CONFIG_DIR_ENV)
            .filter(|v| !v.is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| dirs::home_dir().unwrap_or_default());
        return base.join(".claude.json");
    }
    crate::config::claude_account_dir(id).join(".claude.json")
}

type Stamp = (Option<SystemTime>, u64);
static CACHE: Mutex<Option<HashMap<PathBuf, (Stamp, Ident)>>> = Mutex::new(None);

/// One account's sign-in facts, re-read only when its file changed (the main
/// login's file is large and Claude Code rewrites it often).
pub fn ident_of(id: &str) -> Ident {
    let path = claude_json_path(id);
    let Ok(meta) = std::fs::metadata(&path) else {
        return Ident::default();
    };
    let stamp = (meta.modified().ok(), meta.len());
    let mut cache = CACHE.lock().unwrap_or_else(|e| e.into_inner());
    let cache = cache.get_or_insert_with(HashMap::new);
    if let Some((s, ident)) = cache.get(&path) {
        if *s == stamp {
            return ident.clone();
        }
    }
    let ident = std::fs::read(&path)
        .map(|b| ident_from(&b))
        .unwrap_or_default();
    cache.insert(path, (stamp, ident.clone()));
    ident
}

fn window(w: &Option<crate::agent_limits::LimitWindow>) -> Option<Window> {
    w.as_ref().map(|w| Window {
        used: w.used_percent,
        resets_at: w.resets_at,
    })
}

/// Picker input for `ids`, in order.
pub fn members(
    ids: &[String],
    file: &PoolFile,
    limits: &HashMap<String, ProviderLimits>,
) -> Vec<Member> {
    ids.iter()
        .map(|id| {
            let ident = ident_of(id);
            let reading = limits.get(&format!("claude:{id}"));
            let block = file.blocked.get(id);
            Member {
                id: id.clone(),
                signed_in: ident.signed_in,
                identity: ident.identity.clone(),
                allowed: ident.personal() || file.allowed.iter().any(|a| a == id),
                confirmed: file.confirmed.iter().any(|c| c == id),
                five_hour: reading.and_then(|r| window(&r.five_hour)),
                weekly: reading.and_then(|r| window(&r.weekly)),
                stopped_until: block.filter(|b| b.kind == "limit").map_or(0, |b| b.until),
                on_hold: file.held.as_deref() == Some(id)
                    || block.is_some_and(|b| b.kind == "hold"),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_plan_and_identity_from_the_account_file() {
        let ident = ident_from(
            br#"{"numStartups":3,"oauthAccount":{"accountUuid":"a1","organizationUuid":"o1",
            "emailAddress":"me@example.com","organizationType":"claude_max",
            "organizationRateLimitTier":"default_claude_max_20x"}}"#,
        );
        assert!(ident.signed_in && ident.personal());
        assert_eq!(ident.identity.as_deref(), Some("a1:o1"));
        assert_eq!(ident.plan_label, "Max 20x");
        assert_eq!(ident.email, "me@example.com");
    }

    #[test]
    fn team_seats_and_unknown_plans_are_not_personal() {
        let team =
            ident_from(br#"{"oauthAccount":{"accountUuid":"a","organizationType":"claude_team"}}"#);
        assert!(team.signed_in && !team.personal());
        assert_eq!(team.plan_label, "Team");
        let unknown = ident_from(br#"{"oauthAccount":{"accountUuid":"a"}}"#);
        assert!(!unknown.personal());
    }

    #[test]
    fn no_login_reads_as_signed_out() {
        assert!(!ident_from(br#"{"oauthAccount":null}"#).signed_in);
        assert!(!ident_from(b"not json").signed_in);
    }
}
