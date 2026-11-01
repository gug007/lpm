// Where Keep awake is reached from: the app's own commands, a paired computer, a
// phone, `lpm awake` on the status socket, and the Dock menu.
use crate::keepawake_model::PrefsPatch;
use crate::keepawake_session::{set_mode, set_prefs, state};
use serde_json::{json, Value};

/// The phone may send `keepAwake` and `keepAwakeSet`.
pub(crate) const PHONE_FEATURE: &str = "keepAwake";

#[tauri::command(async)]
pub fn keep_awake_state() -> Value {
    state()
}

#[tauri::command(async)]
pub fn keep_awake_set(mode: String, minutes: Option<u64>) -> Result<Value, String> {
    set_mode(&mode, minutes)
}

#[tauri::command(async)]
pub fn keep_awake_set_prefs(prefs: PrefsPatch) -> Value {
    set_prefs(&prefs)
}

/// The same commands from a paired computer, answered here so they work while
/// this machine's window is still loading.
pub(crate) fn answer_peer(cmd: &str, args: &Value) -> Option<Result<Value, String>> {
    match cmd {
        "keep_awake_state" => Some(Ok(state())),
        "keep_awake_set" => Some(set_mode(
            args["mode"].as_str().unwrap_or_default(),
            args["minutes"].as_u64(),
        )),
        "keep_awake_set_prefs" => Some(Ok(set_prefs(
            &serde_json::from_value(args["prefs"].clone()).unwrap_or_default(),
        ))),
        _ => None,
    }
}

/// `keepAwake` and `keepAwakeSet` from a phone.
pub(crate) fn answer_phone(t: &str, v: &Value) -> Value {
    if t == "keepAwake" {
        return json!({ "t": "keepAwake", "state": state() });
    }
    match set_mode(
        v["mode"].as_str().unwrap_or_default(),
        v["minutes"].as_u64(),
    ) {
        Ok(wire) => json!({ "t": t, "ok": true, "state": wire }),
        Err(error) => json!({ "t": t, "ok": false, "error": error, "state": state() }),
    }
}

/// `keep_awake [<mode> [<minutes>]] [--tail <minutes>]` from `lpm awake`: the
/// state as JSON after any change.
pub(crate) fn cmd_keep_awake(args: &[String]) -> String {
    let (positional, options) = crate::socketsrv::parse_options(args);
    if let Some(tail) = options.get("tail") {
        let Ok(minutes) = tail.parse::<u32>() else {
            return "ERROR: --tail needs a number of minutes".into();
        };
        set_prefs(&PrefsPatch {
            tail_minutes: Some(minutes),
            ..PrefsPatch::default()
        });
    }
    let result = match positional.as_slice() {
        [] => Ok(state()),
        [mode] => set_mode(mode, None),
        [mode, minutes] => match minutes.parse::<u64>() {
            Ok(m) => set_mode(mode, Some(m)),
            Err(_) => Err(format!("\"{minutes}\" isn't a number of minutes.")),
        },
        _ => Err("too many arguments".into()),
    };
    match result {
        Ok(wire) => wire.to_string(),
        Err(e) => format!("ERROR: {e}"),
    }
}

/// A choice from the Dock menu's Keep Awake submenu: a mode, or minutes.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub(crate) fn choose_from_dock(choice: &str) {
    let result = match choice.parse::<u64>() {
        Ok(minutes) => set_mode("timed", Some(minutes)),
        Err(_) => set_mode(choice, None),
    };
    if let Err(e) = result {
        eprintln!("warning: keep awake: {e}");
    }
}
