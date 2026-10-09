//! Account switching settings, kept in `~/.lpm/claude-pool.json`. Machine-local
//! on purpose: account ids, logins and consent mean nothing on another Mac, so
//! this file is never synced, exported or imported. It is separate from
//! accounts.json because older builds rewrite that file and would drop these
//! keys.
use crate::claude_dirs::MAIN_LOGIN;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Mutex;

/// Bumped whenever the consent wording changes, so people are asked again.
pub const CONSENT_VERSION: u32 = 1;
/// The pool key of the main accounts list; project lists use the owning
/// project's file name.
pub const MAIN_KEY: &str = "__main__";
pub const MAX_MEMBERS: usize = 3;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    /// lpm suggests a better account and waits for the user.
    #[default]
    Ask,
    /// lpm moves new sessions on its own and says so.
    Auto,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Consent {
    pub version: u32,
    pub at: i64,
}

/// An account that reported a hard stop (usage limit or hold), until `until`
/// (unix seconds; 0 = until the user clears it).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Block {
    pub kind: String,
    pub until: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PoolFile {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub mode: Mode,
    #[serde(default)]
    pub main: Vec<String>,
    /// Members whose plan isn't a personal Pro/Max (team seats, unknown) that
    /// the user allowed into automatic lists.
    #[serde(default)]
    pub allowed: Vec<String>,
    #[serde(default)]
    pub consent: Option<Consent>,
    /// Accounts the user confirmed are theirs alone. Only these take turns,
    /// whichever list (Settings or a project's own) names them.
    #[serde(default)]
    pub confirmed: Vec<String>,
    /// Pool key -> the account new sessions in that pool start on.
    #[serde(default)]
    pub current: BTreeMap<String, String>,
    /// Account id -> a hard stop it reported.
    #[serde(default)]
    pub blocked: BTreeMap<String, Block>,
    /// Set when an account was put on hold: every pool stops switching until
    /// the user turns it back on.
    #[serde(default)]
    pub held: Option<String>,
}

impl PoolFile {
    /// The main accounts in order; the main login alone when none were set.
    pub fn main_list(&self) -> Vec<String> {
        if self.main.is_empty() {
            vec![MAIN_LOGIN.to_string()]
        } else {
            self.main.clone()
        }
    }

    pub fn consented(&self) -> bool {
        self.consent
            .as_ref()
            .is_some_and(|c| c.version >= CONSENT_VERSION)
    }
}

static LOCK: Mutex<()> = Mutex::new(());

pub fn path() -> PathBuf {
    crate::config::lpm_dir().join("claude-pool.json")
}

pub fn load() -> PoolFile {
    std::fs::read(path())
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

/// Read-modify-write; writes only when `f` changed something. Returns what `f`
/// returned and whether the file changed.
pub fn update<R>(f: impl FnOnce(&mut PoolFile) -> R) -> Result<(R, bool), String> {
    try_update(|file| Ok(f(file)))
}

/// Like `update`, but nothing is written when `f` fails.
pub fn try_update<R>(
    f: impl FnOnce(&mut PoolFile) -> Result<R, String>,
) -> Result<(R, bool), String> {
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let before = load();
    let mut file = before.clone();
    let out = f(&mut file)?;
    if file == before {
        return Ok((out, false));
    }
    std::fs::create_dir_all(crate::config::lpm_dir()).map_err(|e| e.to_string())?;
    let data = serde_json::to_vec_pretty(&file).map_err(|e| e.to_string())?;
    crate::fsatomic::write(&path(), &data, crate::fsatomic::Mode::Preserve(0o644))
        .map_err(|e| e.to_string())?;
    Ok((out, true))
}

/// Drop every trace of a removed account.
pub fn forget_account(id: &str) -> Result<(), String> {
    update(|f| forget_in(f, id)).map(|_| ())
}

/// A hold stays recorded: removing the account doesn't mean the hold was
/// lifted, so switching stays paused until the user turns it back on.
fn forget_in(f: &mut PoolFile, id: &str) {
    f.main.retain(|m| m != id);
    f.allowed.retain(|m| m != id);
    f.confirmed.retain(|m| m != id);
    f.current.retain(|_, v| v != id);
    f.blocked.retain(|k, b| k != id || b.kind == "hold");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_empty_list_is_the_main_login() {
        assert_eq!(PoolFile::default().main_list(), vec!["default"]);
    }

    #[test]
    fn consent_must_match_the_current_wording() {
        let mut f = PoolFile::default();
        assert!(!f.consented());
        f.consent = Some(Consent { version: 0, at: 1 });
        assert!(!f.consented());
        f.consent = Some(Consent {
            version: CONSENT_VERSION,
            at: 1,
        });
        assert!(f.consented());
    }

    #[test]
    fn forgetting_an_account_clears_every_reference() {
        let mut f = PoolFile {
            main: vec!["default".into(), "work".into()],
            allowed: vec!["work".into()],
            confirmed: vec!["default".into(), "work".into()],
            held: Some("work".into()),
            ..Default::default()
        };
        f.current.insert(MAIN_KEY.into(), "work".into());
        f.blocked.insert(
            "work".into(),
            Block {
                kind: "limit".into(),
                until: 9,
            },
        );
        forget_in(&mut f, "work");
        assert_eq!(f.main, vec!["default"]);
        assert_eq!(f.confirmed, vec!["default"]);
        assert!(f.allowed.is_empty() && f.current.is_empty() && f.blocked.is_empty());
        assert_eq!(f.held.as_deref(), Some("work"));
    }

    #[test]
    fn unknown_fields_and_missing_keys_still_load() {
        let f: PoolFile = serde_json::from_str(r#"{"enabled":true,"future":1}"#).unwrap();
        assert!(f.enabled);
        assert_eq!(f.mode, Mode::Ask);
    }
}
