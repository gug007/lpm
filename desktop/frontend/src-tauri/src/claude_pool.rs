//! Account switching: which Claude account a new session starts on, and the
//! state Settings, the project menu and the sidebar show.
//!
//! The account is chosen only when a session starts. A conversation being
//! resumed goes back to the account that holds its transcript; otherwise the
//! project's own pin wins, then its own list, then the main accounts list.
//! Nothing here moves a running session, touches a login, or calls Anthropic:
//! usage comes from what Claude Code reports through the status line.
//!
//! Spawns only read. Every change to which account a pool uses is made by one
//! worker thread (`publish`), so switches are announced once and in order.
use crate::agent_limits::{AgentLimitsStore, ProviderLimits};
use crate::claude_choice::{claude_choice, AccountChoice};
use crate::claude_dirs::MAIN_LOGIN;
use crate::claude_pool_members::{ident_of, members, Ident};
use crate::claude_pool_pick::{pick, Pick, SWITCH_AT};
use crate::claude_pool_store::{self as store, Mode, PoolFile, MAIN_KEY, MAX_MEMBERS};
use crate::config::{self, ClaudeEnv};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::mpsc::{sync_channel, SyncSender};
use std::sync::{Arc, OnceLock};
use tauri::{AppHandle, Emitter, Manager};

static APP: OnceLock<AppHandle> = OnceLock::new();
static WAKE: OnceLock<SyncSender<()>> = OnceLock::new();
/// Whether the user's shell profile exports `CLAUDE_CONFIG_DIR`, which would
/// override the account lpm picks for every terminal.
static PROFILE_DIR: OnceLock<bool> = OnceLock::new();

pub fn init(app: &AppHandle) {
    let _ = APP.set(app.clone());
    let (tx, rx) = sync_channel::<()>(1);
    let _ = WAKE.set(tx);
    std::thread::spawn(move || {
        let _ = PROFILE_DIR.set(
            !crate::sys::headless()
                && crate::sys::capture_login_env(config::CLAUDE_CONFIG_DIR_ENV)
                    .is_some_and(|v| !v.trim().is_empty()),
        );
        publish();
        while rx.recv().is_ok() {
            publish();
        }
    });
}

/// Ask the worker to recompute. A request that arrives while one is already
/// waiting folds into it.
pub fn refresh() {
    if let Some(tx) = WAKE.get() {
        let _ = tx.try_send(());
    }
}

fn now() -> i64 {
    crate::agent_limits::now_millis() / 1000
}

fn limits() -> HashMap<String, ProviderLimits> {
    APP.get()
        .map(|a| a.state::<Arc<AgentLimitsStore>>().snapshot())
        .unwrap_or_default()
}

/// Why switching can't run on this machine at all. A headless host has no one
/// to ask for consent, and with `CLAUDE_CONFIG_DIR` set for lpm or in the
/// shell profile, the dir lpm picks would not be the one Claude Code uses.
pub fn unavailable() -> Option<&'static str> {
    if crate::sys::headless() {
        return Some("headless");
    }
    if std::env::var_os(config::CLAUDE_CONFIG_DIR_ENV).is_some_and(|v| !v.is_empty()) {
        return Some("ambient");
    }
    if PROFILE_DIR.get() == Some(&true) {
        return Some("profile");
    }
    None
}

fn readings_on() -> bool {
    config::load_settings()
        .get("claudeLimitsEnabled")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false)
}

/// Why switching is paused: each pool keeps the account it was on.
fn paused(file: &PoolFile) -> Option<&'static str> {
    if file.held.is_some() {
        Some("hold")
    } else if !readings_on() {
        Some("readings")
    } else {
        None
    }
}

pub(crate) fn active(file: &PoolFile) -> bool {
    file.enabled && file.consented() && unavailable().is_none()
}

/// The main login plus accounts still registered, in the given order.
fn known(ids: &[String]) -> Vec<String> {
    let registered = config::registered_claude_account_ids();
    let mut out: Vec<String> = Vec::new();
    for id in ids {
        if (id == MAIN_LOGIN || registered.contains(id)) && !out.contains(id) {
            out.push(id.clone());
        }
    }
    out
}

fn env_for(id: &str) -> ClaudeEnv {
    if id == MAIN_LOGIN {
        ClaudeEnv::Scrub
    } else {
        config::claude_env_for_account(Some(id))
    }
}

pub struct Spawn {
    pub env: ClaudeEnv,
    /// The account the session runs as, as usage is filed (`default` for the
    /// main login); None for remote projects.
    pub account: Option<String>,
}

fn inherit() -> Spawn {
    Spawn {
        env: ClaudeEnv::Inherit,
        account: Some(config::ambient_limits_account()),
    }
}

fn on(id: &str) -> Spawn {
    Spawn {
        env: env_for(id),
        account: Some(id.to_string()),
    }
}

fn project_key(owner: &str) -> String {
    format!("project:{owner}")
}

/// Where a project's new sessions come from.
enum Source {
    Remote,
    Pinned(String),
    Pool { key: String, ids: Vec<String> },
}

fn source(project: &str, file: &PoolFile) -> Source {
    let main = || Source::Pool {
        key: MAIN_KEY.into(),
        ids: known(&file.main_list()),
    };
    match claude_choice(project) {
        AccountChoice::Remote => Source::Remote,
        AccountChoice::Pin(id) => Source::Pinned(id),
        AccountChoice::List { owner, ids } => {
            let ids = known(&ids);
            if ids.is_empty() {
                main()
            } else {
                Source::Pool {
                    key: project_key(&owner),
                    ids,
                }
            }
        }
        AccountChoice::Main => main(),
    }
}

/// What a pool uses with switching off (or for a scheduled job): a project
/// list's first account, or the main login as it always was.
fn fixed(key: &str, ids: &[String]) -> Option<String> {
    (key != MAIN_KEY).then(|| ids.first().cloned()).flatten()
}

/// The account a pool's new sessions use right now. Pure: callers decide
/// whether to store it.
fn choose(key: &str, ids: &[String], file: &PoolFile, picked: Option<&Pick>) -> Option<String> {
    let stored = file
        .current
        .get(key)
        .filter(|c| ids.contains(c) && ident_of(c).signed_in)
        .cloned();
    // A pause keeps what each pool had; it never takes a fresh account from
    // the picker, which would be moving on from a hold.
    if paused(file).is_some() {
        return stored.or_else(|| fixed(key, ids));
    }
    let picked = picked.map(|p| p.id.clone());
    match file.mode {
        Mode::Ask => stored.or(picked),
        Mode::Auto => picked.or(stored),
    }
}

fn pick_for(
    key: &str,
    ids: &[String],
    file: &PoolFile,
    readings: &HashMap<String, ProviderLimits>,
) -> Option<Pick> {
    pick(
        &members(ids, file, readings),
        now(),
        file.current.get(key).map(String::as_str),
    )
}

/// Spawn-time decision for one project. `resume` is (project root, session id)
/// when the session continues an existing conversation. `switching` is false
/// for scheduled jobs, which never switch accounts.
pub fn spawn_env(project: &str, resume: Option<(&str, &str)>, switching: bool) -> Spawn {
    let file = store::load();
    let src = source(project, &file);
    if matches!(src, Source::Remote) {
        return Spawn {
            env: ClaudeEnv::Inherit,
            account: None,
        };
    }
    if let Some((root, sid)) = resume {
        if let Some((dir, _)) = crate::claude_dirs::find_transcript(root, sid) {
            return Spawn {
                env: dir.kind.env(),
                account: Some(dir.id),
            };
        }
    }
    let (key, ids) = match src {
        Source::Remote => unreachable!(),
        Source::Pinned(id) => {
            let known_id = known(std::slice::from_ref(&id)).into_iter().next();
            return Spawn {
                env: config::claude_env_for_account(Some(&id)),
                account: Some(known_id.unwrap_or_else(|| MAIN_LOGIN.into())),
            };
        }
        Source::Pool { key, ids } => (key, ids),
    };
    if !switching || !active(&file) {
        return fixed(&key, &ids).map(|id| on(&id)).unwrap_or_else(inherit);
    }
    let picked = pick_for(&key, &ids, &file, &limits());
    let Some(id) = choose(&key, &ids, &file, picked.as_ref()) else {
        return inherit();
    };
    if file.current.get(&key) != Some(&id) {
        refresh();
    }
    on(&id)
}

/// The account a project's new sessions would use, for usage lookups.
pub fn account_for_project(project: &str) -> String {
    let file = store::load();
    let (key, ids) = match source(project, &file) {
        Source::Remote => return config::ambient_limits_account(),
        Source::Pinned(id) => {
            return known(std::slice::from_ref(&id))
                .into_iter()
                .next()
                .unwrap_or_else(|| MAIN_LOGIN.into())
        }
        Source::Pool { key, ids } => (key, ids),
    };
    if !active(&file) {
        return fixed(&key, &ids).unwrap_or_else(config::ambient_limits_account);
    }
    let picked = pick_for(&key, &ids, &file, &limits());
    choose(&key, &ids, &file, picked.as_ref()).unwrap_or_else(config::ambient_limits_account)
}

/// Sign an account out through Claude Code itself before its folder goes, so
/// no login outlives it: on macOS the keychain entry is tied to the folder
/// path, not stored inside it. Best effort, bounded by a timeout.
pub fn log_out(id: &str) {
    let ident = ident_of(id);
    if id == MAIN_LOGIN || !ident.signed_in {
        return;
    }
    // Signing out can end the login server-side, which would also sign out
    // another folder signed in as the same Claude account.
    let mut others = vec![MAIN_LOGIN.to_string()];
    others.extend(config::registered_claude_account_ids());
    if others
        .iter()
        .filter(|o| *o != id)
        .any(|o| ident.identity.is_some() && ident_of(o).identity == ident.identity)
    {
        return;
    }
    let Some(dir) = config::claude_config_dir_for_account(id) else {
        return;
    };
    let mut cmd = crate::shellpath::cli_command("claude", &["auth".into(), "logout".into()]);
    cmd.env(config::CLAUDE_CONFIG_DIR_ENV, &dir)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    let Ok(mut child) = cmd.spawn() else {
        return;
    };
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(15);
    loop {
        match child.try_wait() {
            Ok(None) if std::time::Instant::now() < deadline => {
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            Ok(None) | Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return;
            }
            Ok(Some(_)) => return,
        }
    }
}

// ---- shared state ------------------------------------------------------------

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AccountView {
    pub id: String,
    pub confirmed: bool,
    #[serde(flatten)]
    pub ident: Ident,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PoolView {
    pub key: String,
    /// The project whose own list this is; None for the main accounts.
    pub project: Option<String>,
    pub members: Vec<String>,
    pub current: Option<String>,
    pub pick: Option<Pick>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PoolState {
    pub enabled: bool,
    /// Switching actually runs: on, confirmed, and possible on this machine.
    pub active: bool,
    pub mode: Mode,
    pub consented: bool,
    pub unavailable: Option<&'static str>,
    pub paused: Option<&'static str>,
    pub held: Option<String>,
    pub switch_at: f64,
    pub max_members: usize,
    pub main: Vec<String>,
    pub allowed: Vec<String>,
    pub accounts: Vec<AccountView>,
    pub pools: Vec<PoolView>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Switched {
    key: String,
    project: Option<String>,
    from: String,
    to: String,
    pick: Pick,
}

/// Project files that hold their own account list.
fn list_owners() -> Vec<(String, Vec<String>)> {
    config::project_names()
        .into_iter()
        .filter_map(|name| match claude_choice(&name) {
            AccountChoice::List { owner, ids } if owner == name => {
                let ids = known(&ids);
                (!ids.is_empty()).then_some((name, ids))
            }
            _ => None,
        })
        .collect()
}

fn views(file: &PoolFile, readings: &HashMap<String, ProviderLimits>) -> Vec<PoolView> {
    let mut pools = vec![(MAIN_KEY.to_string(), None, known(&file.main_list()))];
    pools.extend(
        list_owners()
            .into_iter()
            .map(|(name, ids)| (project_key(&name), Some(name), ids)),
    );
    pools
        .into_iter()
        .map(|(key, project, ids)| {
            let picked = pick_for(&key, &ids, file, readings);
            let current = if active(file) {
                choose(&key, &ids, file, picked.as_ref())
            } else {
                fixed(&key, &ids)
            };
            PoolView {
                key,
                project,
                members: ids,
                current,
                pick: picked,
            }
        })
        .collect()
}

fn state_of(file: &PoolFile, pools: Vec<PoolView>) -> PoolState {
    let mut ids = vec![MAIN_LOGIN.to_string()];
    ids.extend(config::registered_claude_account_ids());
    PoolState {
        enabled: file.enabled,
        active: active(file),
        mode: file.mode,
        consented: file.consented(),
        unavailable: unavailable(),
        paused: paused(file),
        held: file.held.clone(),
        switch_at: SWITCH_AT,
        max_members: MAX_MEMBERS,
        main: known(&file.main_list()),
        allowed: file.allowed.clone(),
        accounts: ids
            .into_iter()
            .map(|id| AccountView {
                confirmed: file.confirmed.contains(&id),
                ident: ident_of(&id),
                id,
            })
            .collect(),
        pools,
    }
}

fn read_state() -> PoolState {
    let file = store::load();
    let pools = views(&file, &limits());
    state_of(&file, pools)
}

/// The worker's one job: store each pool's account, announce automatic
/// switches, and send the state to the UI.
fn publish() {
    let readings = limits();
    let file = store::load();
    let pools = views(&file, &readings);
    let mut switched = Vec::new();
    if active(&file) {
        let changes: Vec<(String, String)> = pools
            .iter()
            .filter_map(|p| Some((p.key.clone(), p.current.clone()?)))
            .filter(|(k, v)| file.current.get(k) != Some(v))
            .collect();
        let saved = !changes.is_empty()
            && store::update(|f| {
                for (k, v) in &changes {
                    f.current.insert(k.clone(), v.clone());
                }
            })
            .is_ok();
        if saved && file.mode == Mode::Auto {
            for (key, to) in changes {
                let (Some(from), Some(view)) =
                    (file.current.get(&key), pools.iter().find(|p| p.key == key))
                else {
                    continue;
                };
                if let Some(pick) = view.pick.clone() {
                    switched.push(Switched {
                        key,
                        project: view.project.clone(),
                        from: from.clone(),
                        to,
                        pick,
                    });
                }
            }
        }
    }
    let state = state_of(&store::load(), pools);
    if let Some(app) = APP.get() {
        for s in &switched {
            let _ = app.emit("claude-account-switched", s);
        }
        let _ = app.emit("claude-pool-changed", &state);
    }
}

// ---- commands -----------------------------------------------------------------

#[tauri::command(async)]
pub fn claude_pool_state() -> PoolState {
    read_state()
}

#[derive(serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PoolPatch {
    pub enabled: Option<bool>,
    pub mode: Option<Mode>,
    pub main: Option<Vec<String>>,
    pub allowed: Option<Vec<String>>,
    /// True records consent to the current notice.
    pub consent: Option<bool>,
    /// Accounts the user just confirmed are theirs alone.
    pub confirm: Option<Vec<String>>,
}

fn apply_patch(f: &mut PoolFile, patch: PoolPatch, at: i64) -> Result<(), String> {
    if patch.consent == Some(true) {
        f.consent = Some(store::Consent {
            version: store::CONSENT_VERSION,
            at,
        });
    }
    if let Some(ids) = patch.confirm {
        for id in known(&ids) {
            if !f.confirmed.contains(&id) {
                f.confirmed.push(id);
            }
        }
    }
    if let Some(mode) = patch.mode {
        f.mode = mode;
    }
    if let Some(main) = patch.main {
        let main = known(&main);
        if main.len() > MAX_MEMBERS {
            return Err(format!("Up to {MAX_MEMBERS} accounts can take turns."));
        }
        f.main = main;
    }
    if let Some(allowed) = patch.allowed {
        f.allowed = known(&allowed);
    }
    if let Some(enabled) = patch.enabled {
        if enabled && !f.consented() {
            return Err("Confirm the accounts are yours before turning switching on.".into());
        }
        if enabled {
            if let Some(why) = unavailable() {
                return Err(match why {
                    "headless" => "Account switching isn't available on a headless host.".into(),
                    _ => "lpm can't tell your accounts apart while a Claude config folder is set in its environment or your shell profile. Remove it and reopen lpm.".into(),
                });
            }
        }
        f.enabled = enabled;
        if !enabled {
            f.current.clear();
        }
    }
    Ok(())
}

#[tauri::command(async)]
pub fn set_claude_pool(patch: PoolPatch) -> Result<PoolState, String> {
    let at = crate::agent_limits::now_millis();
    store::try_update(|f| apply_patch(f, patch, at))?;
    refresh();
    Ok(read_state())
}

/// Move a pool's new sessions to its current pick (the "Use …" answer to a
/// suggestion in ask mode).
#[tauri::command(async)]
pub fn accept_claude_pool_pick(key: String) -> Result<PoolState, String> {
    let file = store::load();
    if paused(&file).is_some() {
        return Err("Account switching is paused.".into());
    }
    let pick = read_state()
        .pools
        .into_iter()
        .find(|p| p.key == key)
        .and_then(|p| p.pick)
        .map(|p| p.id)
        .ok_or("Nothing to switch to.")?;
    store::update(|f| {
        f.current.insert(key, pick);
    })?;
    refresh();
    Ok(read_state())
}

/// Turn switching back on after a hold was lifted.
#[tauri::command(async)]
pub fn resume_claude_pool() -> Result<PoolState, String> {
    store::update(|f| {
        f.held = None;
        f.blocked.retain(|_, b| b.kind != "hold");
    })?;
    refresh();
    Ok(read_state())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn patch() -> PoolPatch {
        PoolPatch::default()
    }

    #[test]
    fn turning_on_needs_consent_first() {
        let mut f = PoolFile::default();
        let err = apply_patch(
            &mut f,
            PoolPatch {
                enabled: Some(true),
                ..patch()
            },
            1,
        );
        assert!(err.is_err());
        assert!(!f.enabled);
    }

    #[test]
    fn consent_and_turning_on_can_arrive_together() {
        if unavailable().is_some() {
            return;
        }
        let mut f = PoolFile::default();
        apply_patch(
            &mut f,
            PoolPatch {
                enabled: Some(true),
                consent: Some(true),
                confirm: Some(vec!["default".into(), "default".into()]),
                ..patch()
            },
            42,
        )
        .unwrap();
        assert!(f.enabled && f.consented());
        assert_eq!(f.consent.unwrap().at, 42);
        assert_eq!(f.confirmed, vec!["default"]);
    }

    #[test]
    fn turning_off_forgets_the_current_accounts() {
        let mut f = PoolFile {
            enabled: true,
            ..Default::default()
        };
        f.current.insert(MAIN_KEY.into(), "default".into());
        apply_patch(
            &mut f,
            PoolPatch {
                enabled: Some(false),
                ..patch()
            },
            1,
        )
        .unwrap();
        assert!(!f.enabled && f.current.is_empty());
    }

    #[test]
    fn a_held_pool_never_takes_a_fresh_account() {
        let f = PoolFile {
            held: Some("default".into()),
            ..Default::default()
        };
        let ids = vec!["default".to_string()];
        let picked = Pick {
            id: "elsewhere".into(),
            kind: crate::claude_pool_pick::PickKind::First,
            skipped: vec![],
        };
        assert_eq!(choose(MAIN_KEY, &ids, &f, Some(&picked)), None);
        assert_eq!(
            choose("project:api", &ids, &f, Some(&picked)),
            Some("default".to_string())
        );
    }

    #[test]
    fn project_pools_never_share_the_main_key() {
        assert_ne!(project_key(MAIN_KEY), MAIN_KEY);
    }

    #[test]
    fn the_main_login_is_always_known() {
        assert_eq!(
            known(&["default".into(), "default".into()]),
            vec!["default"]
        );
    }
}
