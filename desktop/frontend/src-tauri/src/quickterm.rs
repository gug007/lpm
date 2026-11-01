// The quick terminal: an optional global key that drops a terminal over
// whatever app is in front. Off by default — the global-shortcut plugin is only
// added once the user turns it on, so nothing changes for anyone who doesn't.
// The window itself lives in quicktermwin.rs.
use crate::config;
use crate::quicktermwin;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State, Wry};
use tauri_plugin_global_shortcut::{GlobalShortcut, GlobalShortcutExt, Shortcut, ShortcutState};

const SETTINGS_KEY: &str = "quickTerminal";

#[cfg(target_os = "macos")]
pub const DEFAULT_KEY: &str = "ctrl+alt+super+KeyT";
#[cfg(not(target_os = "macos"))]
pub const DEFAULT_KEY: &str = "ctrl+alt+shift+KeyT";

#[derive(Default)]
pub struct QuickTermState {
    active: Mutex<Option<Shortcut>>,
    problem: Mutex<Option<Problem>>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "kind", content = "detail", rename_all = "lowercase")]
pub enum Problem {
    Held,
    #[cfg_attr(not(target_os = "linux"), allow(dead_code))]
    Wayland,
    Headless,
    Invalid,
    Failed(String),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickTermStatus {
    registered: bool,
    problem: Option<Problem>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct QuickTermSetting {
    enabled: bool,
    key: String,
}

fn saved_setting() -> QuickTermSetting {
    config::load_settings()
        .get(SETTINGS_KEY)
        .cloned()
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

pub fn parse_key(key: &str) -> Option<Shortcut> {
    let shortcut = Shortcut::from_str(key).ok()?;
    let mods = shortcut.mods;
    use tauri_plugin_global_shortcut::Modifiers as M;
    let strong = [M::CONTROL, M::ALT, M::SUPER]
        .iter()
        .filter(|m| mods.contains(**m))
        .count();
    (strong >= 2).then_some(shortcut)
}

fn session_blocker() -> Option<Problem> {
    if crate::sys::headless() {
        return Some(Problem::Headless);
    }
    #[cfg(target_os = "linux")]
    if wayland_session(
        std::env::var("XDG_SESSION_TYPE").ok().as_deref(),
        std::env::var_os("WAYLAND_DISPLAY").is_some_and(|v| !v.is_empty()),
    ) {
        return Some(Problem::Wayland);
    }
    None
}

#[cfg(any(target_os = "linux", test))]
fn wayland_session(session_type: Option<&str>, wayland_display: bool) -> bool {
    wayland_display || session_type.is_some_and(|t| t.eq_ignore_ascii_case("wayland"))
}

fn ensure_plugin(app: &AppHandle) -> Result<(), Problem> {
    if app.try_state::<GlobalShortcut<Wry>>().is_some() {
        return Ok(());
    }
    let plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                quicktermwin::toggle(app);
            }
        })
        .build();
    app.plugin(plugin).map_err(|e| Problem::Failed(e.to_string()))
}

fn release(app: &AppHandle, state: &QuickTermState) {
    let Some(shortcut) = state.active.lock().unwrap().take() else {
        return;
    };
    if app.try_state::<GlobalShortcut<Wry>>().is_some() {
        let _ = app.global_shortcut().unregister(shortcut);
    }
}

fn apply(app: &AppHandle, state: &QuickTermState, enabled: bool, key: &str) -> Option<Problem> {
    release(app, state);
    if !enabled {
        return None;
    }
    if let Some(blocker) = session_blocker() {
        return Some(blocker);
    }
    let Some(shortcut) = parse_key(key) else {
        return Some(Problem::Invalid);
    };
    if let Err(problem) = ensure_plugin(app) {
        return Some(problem);
    }
    match app.global_shortcut().register(shortcut) {
        Ok(()) => {
            *state.active.lock().unwrap() = Some(shortcut);
            None
        }
        // The key parsed above, so what the OS turns down here is the key
        // itself: another app registered it first.
        Err(tauri_plugin_global_shortcut::Error::GlobalHotkey(_)) => Some(Problem::Held),
        Err(e) => Some(Problem::Failed(e.to_string())),
    }
}

fn status(state: &QuickTermState) -> QuickTermStatus {
    QuickTermStatus {
        registered: state.active.lock().unwrap().is_some(),
        problem: state.problem.lock().unwrap().clone(),
    }
}

/// Registers the saved key at launch, when the user has turned it on.
pub fn init(app: &AppHandle) {
    app.manage(QuickTermState::default());
    let setting = saved_setting();
    if !setting.enabled {
        return;
    }
    let key = if setting.key.is_empty() { DEFAULT_KEY } else { &setting.key };
    let state = app.state::<QuickTermState>();
    let problem = apply(app, &state, true, key);
    *state.problem.lock().unwrap() = problem;
}

/// Turns the key on or off, or moves it. The frontend saves the setting after
/// reading the status back, so a key another app holds is never saved as on.
#[tauri::command]
pub fn set_quick_terminal(
    app: AppHandle,
    state: State<'_, QuickTermState>,
    enabled: bool,
    key: String,
) -> QuickTermStatus {
    let problem = apply(&app, &state, enabled, &key);
    *state.problem.lock().unwrap() = problem;
    if !enabled {
        quicktermwin::hide(&app);
    }
    status(&state)
}

#[tauri::command]
pub fn quick_terminal_status(state: State<'_, QuickTermState>) -> QuickTermStatus {
    status(&state)
}

#[tauri::command]
pub fn hide_quick_terminal(app: AppHandle) {
    quicktermwin::hide(&app);
}

/// Where a new quick terminal starts: the folder of the project last open in
/// lpm, when it's a folder on this computer, otherwise home.
#[tauri::command(async)]
pub fn quick_terminal_cwd() -> String {
    let last = config::load_settings()
        .get("lastSelectedProject")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let root = last
        .and_then(|name| config::spawn_info(&name).ok())
        .filter(|info| !info.is_remote)
        .map(|info| info.root)
        .filter(|root| !root.is_empty() && std::path::Path::new(root).is_dir());
    root.unwrap_or_else(|| config::expand_home("~"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_key_parses() {
        assert!(parse_key(DEFAULT_KEY).is_some());
    }

    #[test]
    fn keys_need_two_modifiers_besides_shift() {
        assert!(parse_key("ctrl+alt+KeyT").is_some());
        assert!(parse_key("ctrl+alt+super+KeyT").is_some());
        assert!(parse_key("ctrl+alt+shift+KeyT").is_some());
        assert!(parse_key("ctrl+shift+KeyT").is_none());
        assert!(parse_key("super+KeyT").is_none());
        assert!(parse_key("shift+KeyT").is_none());
        assert!(parse_key("KeyT").is_none());
        assert!(parse_key("ctrl+alt+NotAKey").is_none());
    }

    #[test]
    fn wayland_is_told_by_the_display_or_the_session_type() {
        assert!(wayland_session(None, true));
        assert!(wayland_session(Some("wayland"), false));
        assert!(!wayland_session(Some("x11"), false));
        assert!(!wayland_session(None, false));
    }

    #[test]
    fn problems_serialize_for_the_frontend() {
        let held = serde_json::to_value(Problem::Held).unwrap();
        assert_eq!(held, serde_json::json!({ "kind": "held" }));
        let failed = serde_json::to_value(Problem::Failed("x".into())).unwrap();
        assert_eq!(failed, serde_json::json!({ "kind": "failed", "detail": "x" }));
    }
}
