// The settings of a paired machine, read and changed from another one.
//
// Settings are on the invoke denylist, so the asking Mac gets dedicated frames
// that reach exactly the settings its Settings view shows for this machine
// (SHARED) and nothing else: window geometry, sidebar order and the rest of what
// this machine keeps for itself stay out of reach. `settingsGet` answers with
// those; `settingsSet` writes a patch of them and refreshes this machine's UI.
use crate::peer::result_frame;
use crate::peerclient::PeerClientHub;
use serde_json::{json, Map, Value};
use std::sync::mpsc::SyncSender;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

/// Advertised in `ready` for clients from when only the default project
/// directory, `checkOrigin` and `doubleClickToToggle` were shared. Those are
/// still in SHARED, so such a client keeps working.
pub(crate) const HOST_SETTINGS_FEATURE: &str = "hostSettings";

/// Advertised in `ready` by a host that shares every setting in SHARED. A
/// client never sends the settings frames to a host without it.
pub(crate) const ALL_HOST_SETTINGS_FEATURE: &str = "hostSettingsAll";

/// What a shared setting may hold. `null` clears any of them back to its default.
enum Kind {
    Flag,
    /// A path on this machine; `""` clears it too.
    Path,
    /// A font, voice or theme name; `""` clears it too.
    Name,
    Number { min: f64, max: f64 },
    OneOf(&'static [&'static str]),
    /// Hotkey id to key combo.
    Shortcuts,
    /// Notification event to channel to on/off (notifychannels.rs).
    NotificationChannels,
    /// "never", or an amount and a unit (status/seen.rs).
    ArchiveAfter,
    /// A list of distinct names, each one of these.
    Ids(&'static [&'static str]),
    /// An object with some of these fields.
    Fields(&'static [(&'static str, Field)]),
}

/// One field of a `Kind::Fields` object.
enum Field {
    Flag,
    OneOf(&'static [&'static str]),
}

const SHARED: &[(&str, Kind)] = &[
    ("theme", Kind::OneOf(&["light", "dark", "system"])),
    ("doubleClickToToggle", Kind::Flag),
    ("checkOrigin", Kind::Flag),
    ("keepFinishedAgents", Kind::Flag),
    ("autoArchiveAgentsAfter", Kind::ArchiveAfter),
    ("seenAgentsShown", Kind::Number { min: 1.0, max: 10.0 }),
    ("autoPull", Kind::OneOf(&["off", "chosen", "all"])),
    (
        "gitPull",
        Kind::Fields(&[
            ("strategy", Field::OneOf(&["ff", "ff-only", "rebase"])),
            ("autostash", Field::Flag),
            ("noVerify", Field::Flag),
        ]),
    ),
    (
        "gitPush",
        Kind::Fields(&[
            ("mode", Field::OneOf(&["default", "force-with-lease"])),
            ("noVerify", Field::Flag),
            ("tags", Field::Flag),
        ]),
    ),
    (
        "gitFetch",
        Kind::Fields(&[
            ("all", Field::Flag),
            ("prune", Field::Flag),
            ("pruneTags", Field::Flag),
            ("tags", Field::Flag),
        ]),
    ),
    ("aiCli", Kind::Name),
    ("aiModel", Kind::Name),
    ("aiEffort", Kind::Name),
    ("aiFast", Kind::Flag),
    ("autoGenerateCommitMessage", Kind::Flag),
    ("autoGeneratePRDescription", Kind::Flag),
    ("updateChannel", Kind::OneOf(&["stable", "beta"])),
    ("defaultProjectDirectory", Kind::Path),
    ("systemNotifications", Kind::Flag),
    ("soundNotifications", Kind::Flag),
    (crate::notifychannels::SETTINGS_KEY, Kind::NotificationChannels),
    ("holdToastsWhileTyping", Kind::Flag),
    ("doneSound", Kind::Path),
    ("waitingSound", Kind::Path),
    ("errorSound", Kind::Path),
    ("terminalFontFamily", Kind::Name),
    ("terminalFontSize", Kind::Number { min: 8.0, max: 24.0 }),
    ("terminalLineHeight", Kind::Number { min: 1.0, max: 2.0 }),
    ("terminalTheme", Kind::Name),
    ("terminalOpenInDefaultApp", Kind::Flag),
    ("composerOpen", Kind::Flag),
    ("filesTreeSide", Kind::OneOf(&["left", "right"])),
    ("autoCloseComposerOnSend", Kind::Flag),
    ("pickAgentOnNewTab", Kind::Flag),
    ("appTipsDismissed", Kind::Flag),
    ("hotkeys", Kind::Shortcuts),
    ("experimentalTTS", Kind::Flag),
    ("ttsEnabled", Kind::Flag),
    ("ttsEngine", Kind::OneOf(&["kokoro", "openai"])),
    ("ttsVoice", Kind::Name),
    ("ttsOpenAiVoice", Kind::Name),
    ("ttsSpeed", Kind::Number { min: 0.5, max: 3.0 }),
    (CLAUDE_LIMITS, Kind::Flag),
    ("usageInSidebar", Kind::Flag),
    ("usageSidebarTools", Kind::Ids(&["claude", "codex"])),
    ("usageSidebarWindow", Kind::OneOf(&["fiveHour", "weekly", "higher"])),
];

/// Claude usage readings, which switching accounts needs. Its forwarder is
/// installed or removed with it (claude_statusline), as this machine's own
/// toggle does.
const CLAUDE_LIMITS: &str = "claudeLimitsEnabled";

const MAX_PATH_LEN: usize = 4096;
const MAX_NAME_LEN: usize = 256;
const MAX_SHORTCUTS: usize = 64;
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
    if let Some(enabled) = patch.get(CLAUDE_LIMITS) {
        crate::claude_statusline::apply_claude_limits(
            app.clone(),
            enabled.as_bool().unwrap_or(false),
        )?;
    }
    crate::config::save_settings(&settings)?;
    crate::status::seen::nudge();
    let _ = app.emit("peer-settings-changed", ());
    Ok(shared_view(&settings))
}

/// Only the fields another machine may see, and only those that are set: an
/// unset field means the default, which the asking Mac knows as well as this one.
fn shared_view(settings: &Value) -> Value {
    let mut view = Map::new();
    for (key, _) in SHARED {
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
    let kind = SHARED
        .iter()
        .find_map(|(shared, kind)| (*shared == key).then_some(kind))
        .ok_or_else(|| format!("{key} can't be changed from another machine"))?;
    if value.is_null() {
        return Ok(None);
    }
    let (valid, expected) = match kind {
        Kind::Flag => (value.is_boolean(), "true or false".to_string()),
        Kind::Path | Kind::Name if value.as_str() == Some("") => return Ok(None),
        Kind::Path => (is_text(value, MAX_PATH_LEN), "a path".to_string()),
        Kind::Name => (is_text(value, MAX_NAME_LEN), "a name".to_string()),
        Kind::Number { min, max } => (
            value.as_f64().is_some_and(|n| (*min..=*max).contains(&n)),
            format!("a number from {min} to {max}"),
        ),
        Kind::OneOf(choices) => (
            value.as_str().is_some_and(|s| choices.contains(&s)),
            format!("one of {}", choices.join(", ")),
        ),
        Kind::Shortcuts => (
            is_shortcuts(value),
            "a map of shortcut names to keys".to_string(),
        ),
        Kind::NotificationChannels => (
            crate::notifychannels::is_valid_choices(value),
            "a map of notification events to channels switched on or off".to_string(),
        ),
        Kind::ArchiveAfter => (
            value.as_str().is_some_and(crate::status::seen::is_archive_after),
            "never, or an amount and a unit such as 90m, 8h, 2d or 1w".to_string(),
        ),
        Kind::Ids(choices) => (
            is_ids(value, choices),
            format!("a list of distinct names from {}", choices.join(", ")),
        ),
        Kind::Fields(fields) => (
            is_fields(value, fields),
            format!(
                "an object with some of {}",
                fields.iter().map(|(name, _)| *name).collect::<Vec<_>>().join(", ")
            ),
        ),
    };
    if valid {
        Ok(Some(value.clone()))
    } else {
        Err(format!("{key} must be {expected}"))
    }
}

fn is_text(value: &Value, max_len: usize) -> bool {
    value
        .as_str()
        .is_some_and(|s| s.len() <= max_len && !s.contains('\0'))
}

fn is_shortcuts(value: &Value) -> bool {
    value.as_object().is_some_and(|map| {
        map.len() <= MAX_SHORTCUTS
            && map
                .iter()
                .all(|(id, keys)| id.len() <= MAX_NAME_LEN && is_text(keys, MAX_NAME_LEN))
    })
}

fn is_ids(value: &Value, choices: &[&str]) -> bool {
    value.as_array().is_some_and(|items| {
        items.iter().enumerate().all(|(i, item)| {
            item.as_str().is_some_and(|s| choices.contains(&s))
                && !items[..i].contains(item)
        })
    })
}

fn is_fields(value: &Value, fields: &[(&str, Field)]) -> bool {
    value.as_object().is_some_and(|map| {
        map.iter().all(|(name, v)| {
            fields
                .iter()
                .find(|(field, _)| field == name)
                .is_some_and(|(_, field)| match field {
                    Field::Flag => v.is_boolean(),
                    Field::OneOf(choices) => v.as_str().is_some_and(|s| choices.contains(&s)),
                })
        })
    })
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
        let sets_channel = patch.get("updateChannel").is_some();
        let stored = request(&hub, &slug, json!({ "t": "settingsSet", "patch": patch }))?;
        if sets_channel {
            let beta = stored.get("updateChannel").and_then(Value::as_str) == Some("beta");
            hub.note_update_channel(&slug, beta);
        }
        Ok(stored)
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
            "windowWidth": 1200,
            "sidebarOrder": ["web"],
        });
        assert_eq!(
            shared_view(&settings),
            json!({
                "theme": "dark",
                "defaultProjectDirectory": "/Users/me/Code",
                "checkOrigin": false,
            })
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
    fn an_empty_path_or_name_clears_it() {
        let mut settings = json!({ "defaultProjectDirectory": "/old", "terminalFontFamily": "Menlo" });
        apply_patch(
            &mut settings,
            &json!({ "defaultProjectDirectory": "", "terminalFontFamily": "" }),
        )
        .unwrap();
        assert_eq!(settings, json!({}));
    }

    #[test]
    fn every_kind_takes_what_the_settings_view_writes() {
        let mut settings = json!({});
        let patch = json!({
            "theme": "light",
            "autoPull": "chosen",
            "updateChannel": "beta",
            "doneSound": "/Users/me/ding.aiff",
            "terminalFontFamily": "JetBrains Mono",
            "terminalFontSize": 14,
            "terminalLineHeight": 1.2,
            "filesTreeSide": "left",
            "hotkeys": { "renameProject": "cmd+shift+r" },
            "ttsSpeed": 1.5,
            "notificationChannels": { "agentDone": { "banner": false, "sound": true } },
            "holdToastsWhileTyping": false,
            "seenAgentsShown": 5,
            "usageSidebarTools": ["claude"],
            "gitPull": { "strategy": "rebase", "autostash": true },
            "gitFetch": { "prune": false },
            "aiModel": "sonnet",
        });
        apply_patch(&mut settings, &patch).unwrap();
        assert_eq!(settings, patch);
    }

    #[test]
    fn a_field_that_is_not_shared_changes_nothing() {
        let mut settings = json!({ "windowWidth": 1200 });
        let err = apply_patch(&mut settings, &json!({ "checkOrigin": false, "windowWidth": 800 }))
            .unwrap_err();
        assert!(err.contains("windowWidth"));
        assert_eq!(settings, json!({ "windowWidth": 1200 }));
    }

    #[test]
    fn a_field_of_the_wrong_kind_is_refused() {
        let mut settings = json!({});
        for bad in [
            json!({ "checkOrigin": "no" }),
            json!({ "defaultProjectDirectory": 3 }),
            json!({ "defaultProjectDirectory": "/a\0b" }),
            json!({ "theme": "sepia" }),
            json!({ "terminalFontSize": 99 }),
            json!({ "terminalLineHeight": "tall" }),
            json!({ "hotkeys": { "renameProject": 1 } }),
            json!({ "hotkeys": "cmd+r" }),
            json!({ "notificationChannels": { "agentDone": { "banner": "off" } } }),
            json!({ "notificationChannels": { "agentDone": { "phone": false } } }),
            json!({ "notificationChannels": { "deploys": { "banner": false } } }),
            json!({ "notificationChannels": ["agentDone"] }),
            json!({ "holdToastsWhileTyping": 1 }),
            json!({ "usageSidebarTools": ["claude", "claude"] }),
            json!({ "usageSidebarTools": "claude" }),
            json!({ "gitPull": { "strategy": "squash" } }),
            json!({ "gitPush": { "force": true } }),
            json!({ "gitFetch": ["prune"] }),
            json!({ "seenAgentsShown": 0 }),
            json!(["checkOrigin"]),
        ] {
            assert!(apply_patch(&mut settings, &bad).is_err(), "{bad} was accepted");
        }
        assert_eq!(settings, json!({}));
    }
}
