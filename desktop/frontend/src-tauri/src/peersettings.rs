// The settings of a paired machine, read and changed from another one.
//
// Settings are on the invoke denylist, and most of them are how the machine
// someone sits at shows things, which is that machine's business. So the asking
// Mac gets dedicated frames that reach only the few that belong to this one:
// where its new projects go, whether it fetches in the background, and how its
// own sidebar starts a project. `settingsGet` answers with those; `settingsSet`
// writes a patch of them and refreshes this machine's UI.
use crate::peer::result_frame;
use crate::peerclient::PeerClientHub;
use serde_json::{json, Map, Value};
use std::sync::mpsc::SyncSender;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

/// Advertised in `ready` by a host that answers the settings frames. A client
/// never sends them to a host without it.
pub(crate) const HOST_SETTINGS_FEATURE: &str = "hostSettings";

const DEFAULT_DIR: &str = "defaultProjectDirectory";
const CHECK_ORIGIN: &str = "checkOrigin";
const DOUBLE_CLICK: &str = "doubleClickToToggle";
const SHARED: &[&str] = &[DEFAULT_DIR, CHECK_ORIGIN, DOUBLE_CLICK];

const MAX_PATH_LEN: usize = 4096;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
const UNSUPPORTED: &str =
    "that machine's lpm is too old to share its settings — update it there first";

pub(crate) fn handle(app: &AppHandle, out: &SyncSender<String>, t: &str, v: &Value) {
    let req_id = v.get("reqId").cloned().unwrap_or(Value::Null);
    let reply = match t {
        "settingsGet" => Ok(shared_view(&crate::config::load_settings())),
        "settingsSet" => write(app, v.get("patch").unwrap_or(&Value::Null)),
        _ => return,
    };
    let frame = match reply {
        Ok(value) => result_frame(&req_id, true, value),
        Err(e) => result_frame(&req_id, false, Value::String(e)),
    };
    let _ = out.try_send(frame);
}

fn write(app: &AppHandle, patch: &Value) -> Result<Value, String> {
    let mut settings = crate::config::load_settings();
    apply_patch(&mut settings, patch)?;
    crate::config::save_settings(&settings)?;
    let _ = app.emit("peer-settings-changed", ());
    Ok(shared_view(&settings))
}

/// Only the fields another machine may see, and only those that are set: an
/// unset field means the default, which the asking Mac knows as well as this one.
fn shared_view(settings: &Value) -> Value {
    let mut view = Map::new();
    for key in SHARED {
        if let Some(value) = settings.get(*key) {
            view.insert((*key).to_string(), value.clone());
        }
    }
    Value::Object(view)
}

/// Every field is checked before any is written, so a patch with one bad field
/// changes nothing.
fn apply_patch(settings: &mut Value, patch: &Value) -> Result<(), String> {
    let patch = patch
        .as_object()
        .ok_or("the settings to change must be an object")?;
    let changes = patch
        .iter()
        .map(|(key, value)| Ok((key.as_str(), checked(key, value)?)))
        .collect::<Result<Vec<_>, String>>()?;
    let settings = settings
        .as_object_mut()
        .ok_or("this machine's settings file isn't an object")?;
    for (key, value) in changes {
        match value {
            Some(value) => settings.insert(key.to_string(), value),
            None => settings.remove(key),
        };
    }
    Ok(())
}

/// What to store for one patched field; `None` clears it back to its default.
fn checked(key: &str, value: &Value) -> Result<Option<Value>, String> {
    match key {
        DEFAULT_DIR => match value {
            Value::Null => Ok(None),
            Value::String(s) if s.is_empty() => Ok(None),
            Value::String(s) if s.len() <= MAX_PATH_LEN && !s.contains('\0') => {
                Ok(Some(value.clone()))
            }
            _ => Err(format!("{key} must be a folder path")),
        },
        CHECK_ORIGIN | DOUBLE_CLICK => match value {
            Value::Bool(_) => Ok(Some(value.clone())),
            _ => Err(format!("{key} must be true or false")),
        },
        _ => Err(format!("{key} can't be changed from another machine")),
    }
}

/// A paired machine's own settings, as far as another machine may see them.
#[tauri::command]
pub async fn peer_settings_get(
    hub: State<'_, PeerClientHub>,
    slug: String,
) -> Result<Value, String> {
    let hub = hub.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        request(&hub, &slug, json!({ "t": "settingsGet" }))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Change some of a paired machine's own settings. Resolves to what they are now.
#[tauri::command]
pub async fn peer_settings_set(
    hub: State<'_, PeerClientHub>,
    slug: String,
    patch: Value,
) -> Result<Value, String> {
    let hub = hub.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        request(&hub, &slug, json!({ "t": "settingsSet", "patch": patch }))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn request(hub: &PeerClientHub, slug: &str, mut frame: Value) -> Result<Value, String> {
    if !hub.supports_host_settings(slug) {
        return Err(UNSUPPORTED.to_string());
    }
    hub.request_blocking(slug, REQUEST_TIMEOUT, |req| {
        frame["reqId"] = json!(req);
        frame
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_shared_fields_are_shown() {
        let settings = json!({
            "theme": "dark",
            "defaultProjectDirectory": "/Users/me/Code",
            "checkOrigin": false,
            "hotkeys": { "settings": "cmd+," },
        });
        assert_eq!(
            shared_view(&settings),
            json!({ "defaultProjectDirectory": "/Users/me/Code", "checkOrigin": false })
        );
    }

    #[test]
    fn a_patch_sets_and_clears_fields() {
        let mut settings = json!({ "theme": "dark", "defaultProjectDirectory": "/old" });
        apply_patch(
            &mut settings,
            &json!({ "defaultProjectDirectory": null, "doubleClickToToggle": true }),
        )
        .unwrap();
        assert_eq!(settings, json!({ "theme": "dark", "doubleClickToToggle": true }));
    }

    #[test]
    fn an_empty_folder_clears_it() {
        let mut settings = json!({ "defaultProjectDirectory": "/old" });
        apply_patch(&mut settings, &json!({ "defaultProjectDirectory": "" })).unwrap();
        assert_eq!(settings, json!({}));
    }

    #[test]
    fn a_field_that_is_not_shared_changes_nothing() {
        let mut settings = json!({ "theme": "dark" });
        let err = apply_patch(&mut settings, &json!({ "checkOrigin": false, "theme": "light" }))
            .unwrap_err();
        assert!(err.contains("theme"));
        assert_eq!(settings, json!({ "theme": "dark" }));
    }

    #[test]
    fn a_field_of_the_wrong_kind_is_refused() {
        let mut settings = json!({});
        assert!(apply_patch(&mut settings, &json!({ "checkOrigin": "no" })).is_err());
        assert!(apply_patch(&mut settings, &json!({ "defaultProjectDirectory": 3 })).is_err());
        assert!(apply_patch(&mut settings, &json!({ "defaultProjectDirectory": "/a\0b" })).is_err());
        assert!(apply_patch(&mut settings, &json!(["checkOrigin"])).is_err());
        assert_eq!(settings, json!({}));
    }
}
