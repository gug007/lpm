// Hand-implemented commands. Listed in REAL in scripts/gen-tauri-bindings.mjs
// so they are excluded from the generated stubs but still in the handler list.
use crate::config;
use crate::services::ServiceState;
use crate::status::StatusStore;
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};

/// Overwrite a ProjectInfo's `statusEntries` ([] by default) with the live
/// per-pane status rows so badges render. Keyed by the project file name.
fn inject_status(p: &mut Value, status: &StatusStore) {
    if let Some(name) = p.get("name").and_then(|n| n.as_str()).map(String::from) {
        if let Ok(v) = serde_json::to_value(status.list(&name)) {
            p["statusEntries"] = v;
        }
    }
}

#[tauri::command]
pub fn get_version() -> String {
    // "dev" by default (matches Go's Version var); release builds inject LPM_VERSION.
    option_env!("LPM_VERSION").unwrap_or("dev").to_string()
}

#[tauri::command]
pub fn get_platform() -> String {
    // Match Go's runtime.GOOS/GOARCH spelling so update-asset selection keeps working.
    let os = match std::env::consts::OS {
        "macos" => "darwin",
        other => other,
    };
    let arch = match std::env::consts::ARCH {
        "aarch64" => "arm64",
        "x86_64" => "amd64",
        other => other,
    };
    format!("{os}/{arch}")
}

#[tauri::command]
pub fn load_settings() -> Value {
    config::load_settings()
}

#[tauri::command]
pub fn save_settings(s: Value) -> Result<(), String> {
    config::save_settings(&s)
}

#[tauri::command]
pub fn load_generators() -> Value {
    config::load_generators()
}

#[tauri::command]
pub fn save_generators(g: Value) -> Result<(), String> {
    config::save_generators(&g)
}

#[tauri::command]
pub fn load_work_statuses() -> Value {
    config::load_work_statuses()
}

#[tauri::command]
pub fn save_work_statuses(doc: Value) -> Result<(), String> {
    config::save_work_statuses(&doc)
}

#[tauri::command]
pub fn load_claude_accounts() -> Value {
    config::load_claude_accounts()
}

#[tauri::command]
pub fn save_claude_accounts(a: Value) -> Result<(), String> {
    config::save_claude_accounts(&a)
}

#[tauri::command]
pub fn remove_claude_account(id: String) -> Result<(), String> {
    config::remove_claude_account(&id)
}

#[tauri::command]
pub fn claude_accounts_status() -> Value {
    config::claude_accounts_status()
}

#[tauri::command]
pub fn claude_account_usage() -> Value {
    config::claude_account_usage()
}

#[tauri::command]
pub fn save_generator_icon(src_path: String, id: String) -> Result<String, String> {
    config::save_generator_icon(&src_path, &id)
}

#[tauri::command]
pub fn save_window_size(width: i64, height: i64) -> Result<(), String> {
    config::merge_settings(json!({ "windowWidth": width, "windowHeight": height }))
}

#[tauri::command]
pub fn load_terminals() -> Value {
    // Persisted pane tree (~/.lpm/terminals.json). Opaque JSON the frontend owns;
    // we just round-trip it, guaranteeing a `projects` object so the UI is safe.
    let path = config::lpm_dir().join("terminals.json");
    let mut v: Value = match std::fs::read(&path) {
        Ok(b) => serde_json::from_slice(&b).unwrap_or_else(|_| json!({ "projects": {} })),
        Err(_) => json!({ "projects": {} }),
    };
    let has_projects = v.get("projects").map(|p| p.is_object()).unwrap_or(false);
    if !has_projects {
        match v.as_object_mut() {
            Some(o) => {
                o.insert("projects".into(), json!({}));
            }
            None => v = json!({ "projects": {} }),
        }
    }
    v
}

#[tauri::command]
pub fn save_terminals(c: Value) -> Result<(), String> {
    config::ensure_dirs()?;
    let path = config::lpm_dir().join("terminals.json");
    let data = serde_json::to_vec_pretty(&c).map_err(|e| e.to_string())?;
    crate::fsatomic::write(&path, &data, crate::fsatomic::Mode::Preserve(0o644))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_groups() -> Value {
    // Sidebar folders (~/.lpm/groups.json). Opaque JSON the frontend owns; we
    // round-trip it, guaranteeing a `groups` array so the UI is safe.
    let mut v: Value = match std::fs::read(config::groups_path()) {
        Ok(b) => serde_json::from_slice(&b).unwrap_or_else(|_| json!({ "groups": [] })),
        Err(_) => json!({ "groups": [] }),
    };
    let has_groups = v.get("groups").map(|g| g.is_array()).unwrap_or(false);
    if !has_groups {
        match v.as_object_mut() {
            Some(o) => {
                o.insert("groups".into(), json!([]));
            }
            None => v = json!({ "groups": [] }),
        }
    }
    v
}

#[tauri::command]
pub fn save_groups(groups: Value) -> Result<(), String> {
    config::ensure_dirs()?;
    let data = serde_json::to_vec_pretty(&groups).map_err(|e| e.to_string())?;
    crate::fsatomic::write(
        &config::groups_path(),
        &data,
        crate::fsatomic::Mode::Preserve(0o644),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_composer_actions() -> Value {
    // Composer actions (~/.lpm/composer-actions.json). Opaque JSON the frontend
    // owns; returns Null when the file is absent so the frontend can seed its
    // defaults (distinct from a saved-but-empty list).
    match std::fs::read(config::composer_actions_path()) {
        Ok(b) => serde_json::from_slice(&b).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

#[tauri::command]
pub fn save_composer_actions(actions: Value) -> Result<(), String> {
    config::ensure_dirs()?;
    let data = serde_json::to_vec_pretty(&actions).map_err(|e| e.to_string())?;
    crate::fsatomic::write(
        &config::composer_actions_path(),
        &data,
        crate::fsatomic::Mode::Preserve(0o644),
    )
    .map_err(|e| e.to_string())
}

// (async): config::list_projects reads every project file and asks the session
// daemon what is running (both blocking), and this runs on a hot path (mount +
// 10s poll + every projects/status event), so it must stay off the main thread
// or the UI beachballs on each refresh.
#[tauri::command(async)]
pub fn list_projects(
    svc: State<'_, ServiceState>,
    status: State<'_, Arc<StatusStore>>,
) -> Result<Vec<Value>, String> {
    let mut projects = config::list_projects(&svc.snapshot())?;
    for p in &mut projects {
        inject_status(p, &status);
    }
    let dock: Vec<(String, bool)> = projects
        .iter()
        .map(|p| {
            (
                p.get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
                p.get("running").and_then(|v| v.as_bool()).unwrap_or(false),
            )
        })
        .collect();
    crate::dockmenu::refresh(&dock);
    Ok(projects)
}

// (async): config::get_project can query the session daemon (blocking) for a
// real project name, so keep it off the main thread like list_projects.
#[tauri::command(async)]
pub fn get_project(
    svc: State<'_, ServiceState>,
    status: State<'_, Arc<StatusStore>>,
    name: String,
) -> Result<Option<Value>, String> {
    let mut proj = config::get_project(&name, &svc.snapshot())?;
    if let Some(p) = proj.as_mut() {
        inject_status(p, &status);
    }
    Ok(proj)
}

#[tauri::command]
pub fn focus_main_window(
    app: AppHandle,
    project: Option<String>,
    view: Option<String>,
    add_project: Option<bool>,
) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    }
    if let Some(p) = project {
        let _ = app.emit("dock-project-selected", p);
    }
    if let Some(v) = view {
        let _ = app.emit("navigate-main-view", v);
    }
    if add_project == Some(true) {
        let _ = app.emit("open-new-project", ());
    }
    Ok(())
}

#[tauri::command]
pub fn reorder_projects(app: AppHandle, order: Vec<String>) -> Result<(), String> {
    config::merge_settings(json!({ "projectOrder": order }))?;
    let _ = app.emit("projects-changed", ());
    Ok(())
}

#[tauri::command(async)]
pub fn set_project_label(app: AppHandle, name: String, label: String) -> Result<(), String> {
    // Write to the project's own file: list_projects reads each label per-file,
    // so routing a duplicate's label to its parent would rename the parent.
    let wrote = config::edit_project_yaml(&name, |doc| {
        let trimmed = label.trim();
        let Some(map) = doc.as_mapping_mut() else {
            return Ok(false);
        };
        if map.get("label").and_then(|v| v.as_str()).unwrap_or("") == trimmed {
            return Ok(false);
        }
        if trimmed.is_empty() {
            map.shift_remove("label"); // empty clears the label -> falls back to name
        } else {
            map.insert("label".into(), trimmed.into());
        }
        Ok(true)
    })?;
    if wrote {
        let _ = app.emit("projects-changed", ());
    }
    Ok(())
}

/// What the UI sends to set a status. `state` is required; the rest describe a
/// custom one, and a missing or blank one of those clears that field. Clearing
/// the whole block is a missing `status`, not an empty patch.
#[derive(serde::Deserialize)]
pub struct WorkStatusPatch {
    state: String,
    #[serde(default)]
    label: Option<String>,
    #[serde(default)]
    emoji: Option<String>,
    #[serde(default)]
    note: Option<String>,
}

/// Rewrites the doc's `work_status` block; returns whether anything changed, so
/// the caller can skip the write and the reload it triggers. `patch: None` clears.
fn apply_work_status(
    doc: &mut serde_norway::Value,
    patch: Option<&WorkStatusPatch>,
    now_ms: u64,
) -> Result<bool, String> {
    let Some(patch) = patch else {
        return Ok(doc
            .as_mapping_mut()
            // shift_remove: `remove` is a swap_remove, which would reshuffle the
            // rest of the user's project file.
            .is_some_and(|m| m.shift_remove("work_status").is_some()));
    };
    let mut next = config::WorkStatus {
        state: patch.state.clone(),
        label: patch.label.clone(),
        emoji: patch.emoji.clone(),
        note: patch.note.clone(),
        since: 0,
    }
    .normalize()?;
    if doc.is_null() {
        *doc = serde_norway::Value::Mapping(serde_norway::Mapping::new());
    }
    let map = doc
        .as_mapping_mut()
        .ok_or_else(|| "project config is not a map".to_string())?;
    let current = map
        .get("work_status")
        .cloned()
        .and_then(|v| serde_norway::from_value::<config::WorkStatus>(v).ok())
        .and_then(|ws| ws.normalize().ok());
    // A note or emoji edit keeps the original timestamp: only entering a state
    // restarts the clock the UI counts from, and one custom label is a different
    // state from another.
    next.since = current
        .filter(|c| c.state == next.state && c.label == next.label)
        .map(|c| c.since)
        .filter(|since| *since != 0)
        .unwrap_or(now_ms);

    let next = serde_norway::to_value(&next).map_err(|e| e.to_string())?;
    if map.get("work_status") == Some(&next) {
        return Ok(false);
    }
    map.insert("work_status".into(), next);
    Ok(true)
}

#[tauri::command(async)]
pub fn set_work_status(
    app: AppHandle,
    name: String,
    status: Option<WorkStatusPatch>,
) -> Result<(), String> {
    let now_ms = crate::status::now_millis() as u64;
    let wrote =
        config::edit_project_yaml(&name, |doc| apply_work_status(doc, status.as_ref(), now_ms))?;
    if wrote {
        let _ = app.emit("projects-changed", ());
    }
    Ok(())
}

#[cfg(test)]
mod work_status_tests {
    use super::*;

    fn doc(yaml: &str) -> serde_norway::Value {
        serde_norway::from_str(yaml).unwrap()
    }

    /// Goes through the patch the frontend actually sends, so the tests pin the
    /// wire shape as well as the rules.
    fn set(d: &mut serde_norway::Value, status: Value, now_ms: u64) -> Result<bool, String> {
        let patch: WorkStatusPatch = serde_json::from_value(status).unwrap();
        apply_work_status(d, Some(&patch), now_ms)
    }

    fn clear(d: &mut serde_norway::Value) -> Result<bool, String> {
        apply_work_status(d, None, 9_000)
    }

    fn keys(v: &serde_norway::Value) -> Vec<&str> {
        v.as_mapping()
            .unwrap()
            .keys()
            .filter_map(|k| k.as_str())
            .collect()
    }

    fn status(v: &serde_norway::Value) -> &serde_norway::Value {
        v.get("work_status").expect("work_status must be present")
    }

    fn field(v: &serde_norway::Value, key: &str) -> Option<String> {
        status(v).get(key).map(|f| {
            f.as_str()
                .map(String::from)
                .unwrap_or_else(|| f.as_u64().unwrap().to_string())
        })
    }

    #[test]
    fn sets_state_note_and_since_on_a_fresh_doc() {
        let mut d = doc("name: solo\nroot: /tmp/solo\n");
        assert!(set(
            &mut d,
            json!({ "state": "blocked", "note": "  waiting  " }),
            1_000
        )
        .unwrap());
        assert_eq!(field(&d, "state").as_deref(), Some("blocked"));
        assert_eq!(field(&d, "note").as_deref(), Some("waiting"));
        assert_eq!(field(&d, "since").as_deref(), Some("1000"));
        assert_eq!(keys(status(&d)), vec!["state", "note", "since"]);
        assert_eq!(d.get("root").and_then(|v| v.as_str()), Some("/tmp/solo"));
    }

    #[test]
    fn state_is_the_only_required_field() {
        let mut d = doc("name: solo\n");
        assert!(set(&mut d, json!({ "state": "done" }), 1).unwrap());
        assert_eq!(keys(status(&d)), vec!["state", "since"]);
    }

    #[test]
    fn note_only_edit_keeps_since() {
        let mut d = doc("work_status:\n  state: blocked\n  note: old\n  since: 500\n");
        assert!(set(&mut d, json!({ "state": "blocked", "note": "new" }), 9_000).unwrap());
        assert_eq!(field(&d, "note").as_deref(), Some("new"));
        assert_eq!(field(&d, "since").as_deref(), Some("500"));
    }

    #[test]
    fn state_change_restarts_since() {
        let mut d = doc("work_status:\n  state: blocked\n  since: 500\n");
        assert!(set(&mut d, json!({ "state": "done" }), 9_000).unwrap());
        assert_eq!(field(&d, "state").as_deref(), Some("done"));
        assert_eq!(field(&d, "since").as_deref(), Some("9000"));
    }

    #[test]
    fn a_block_with_no_since_restarts_the_clock() {
        let mut d = doc("work_status:\n  state: blocked\n");
        assert!(set(&mut d, json!({ "state": "blocked" }), 9_000).unwrap());
        assert_eq!(field(&d, "since").as_deref(), Some("9000"));
    }

    #[test]
    fn identical_input_reports_no_change() {
        let mut d = doc("work_status:\n  state: in_progress\n  note: shipping\n  since: 500\n");
        assert!(!set(
            &mut d,
            json!({ "state": "in_progress", "note": "shipping" }),
            9_000
        )
        .unwrap());
        assert_eq!(field(&d, "since").as_deref(), Some("500"));
        // Same state, note dropped: still a change.
        assert!(set(&mut d, json!({ "state": "in_progress" }), 9_000).unwrap());
        assert!(status(&d).get("note").is_none());
    }

    #[test]
    fn blank_note_omits_the_key() {
        let mut d = doc("name: solo\n");
        assert!(set(&mut d, json!({ "state": "done", "note": "   " }), 1).unwrap());
        assert!(status(&d).get("note").is_none());
        assert_eq!(keys(status(&d)), vec!["state", "since"]);
    }

    #[test]
    fn a_missing_status_clears_and_keeps_sibling_order() {
        let mut d = doc(
            "name: solo\nwork_status:\n  state: done\n  since: 5\nlabel: Solo\nroot: /tmp/solo\n",
        );
        assert!(clear(&mut d).unwrap());
        assert!(d.get("work_status").is_none());
        assert_eq!(keys(&d), vec!["name", "label", "root"]);
        assert!(
            !clear(&mut d).unwrap(),
            "clearing an absent status writes nothing"
        );
    }

    #[test]
    fn unknown_state_is_an_error() {
        let mut d = doc("name: solo\n");
        let err = set(&mut d, json!({ "state": "paused" }), 1).unwrap_err();
        assert!(err.contains("paused"), "{err}");
        assert!(d.get("work_status").is_none());
    }

    #[test]
    fn empty_project_file_gains_a_mapping() {
        let mut d = serde_norway::Value::Null;
        assert!(set(&mut d, json!({ "state": "done" }), 1).unwrap());
        assert_eq!(field(&d, "state").as_deref(), Some("done"));
        assert!(!clear(&mut serde_norway::Value::Null).unwrap());
    }

    #[test]
    fn custom_carries_its_own_label_and_emoji() {
        let mut d = doc("name: solo\n");
        let patch = json!({
            "state": "custom",
            "note": "second pass",
            "label": "  Review  ",
            "emoji": " 🔍 ",
        });
        assert!(set(&mut d, patch, 1_000).unwrap());
        assert_eq!(field(&d, "label").as_deref(), Some("Review"));
        assert_eq!(field(&d, "emoji").as_deref(), Some("🔍"));
        assert_eq!(
            keys(status(&d)),
            vec!["state", "label", "emoji", "note", "since"]
        );
    }

    #[test]
    fn custom_without_a_label_is_an_error() {
        let mut d = doc("name: solo\n");
        assert!(set(&mut d, json!({ "state": "custom", "label": "  " }), 1).is_err());
        assert!(set(&mut d, json!({ "state": "custom" }), 1).is_err());
        assert!(d.get("work_status").is_none());
    }

    #[test]
    fn built_in_states_drop_a_stray_label_and_emoji() {
        let mut d = doc("name: solo\n");
        let patch = json!({ "state": "done", "label": "Review", "emoji": "🔍" });
        assert!(set(&mut d, patch, 1).unwrap());
        assert_eq!(keys(status(&d)), vec!["state", "since"]);
    }

    #[test]
    fn unusable_emoji_is_an_error() {
        let mut d = doc("name: solo\n");
        let long = "🔍".repeat(65);
        for emoji in ["🔍 🔎", "🔍\u{7}", long.as_str()] {
            let patch = json!({ "state": "custom", "label": "Review", "emoji": emoji });
            let err = set(&mut d, patch, 1).unwrap_err();
            assert!(err.contains("emoji"), "{err}");
        }
        assert!(d.get("work_status").is_none());
        // A blank emoji is not an error: it just goes unwritten.
        let patch = json!({ "state": "custom", "label": "Review", "emoji": "  " });
        assert!(set(&mut d, patch, 1).unwrap());
        assert!(status(&d).get("emoji").is_none());
    }

    #[test]
    fn a_joined_emoji_is_one_mark() {
        // ZWJ and variation selectors are neither whitespace nor control chars,
        // so a multi-scalar emoji survives the check whole.
        let mut d = doc("name: solo\n");
        for emoji in ["👩‍💻", "❤️", "👍🏽"] {
            let patch = json!({ "state": "custom", "label": "Review", "emoji": emoji });
            assert!(set(&mut d, patch, 1).unwrap());
            assert_eq!(field(&d, "emoji").as_deref(), Some(emoji));
        }
    }

    #[test]
    fn a_new_label_restarts_since_but_a_note_edit_does_not() {
        let mut d =
            doc("work_status:\n  state: custom\n  label: Review\n  note: old\n  since: 500\n");
        let patch = json!({ "state": "custom", "label": "Review", "note": "new" });
        assert!(set(&mut d, patch, 9_000).unwrap());
        assert_eq!(field(&d, "since").as_deref(), Some("500"));

        let patch = json!({ "state": "custom", "label": "Shipping", "note": "new" });
        assert!(set(&mut d, patch, 9_000).unwrap());
        assert_eq!(field(&d, "label").as_deref(), Some("Shipping"));
        assert_eq!(field(&d, "since").as_deref(), Some("9000"));
    }

    #[test]
    fn written_yaml_keeps_the_documented_shape() {
        let mut d = doc("name: solo\nroot: /tmp/solo\n");
        set(
            &mut d,
            json!({ "state": "blocked", "note": "waiting on the key" }),
            1_757_520_000_000,
        )
        .unwrap();
        assert_eq!(
            serde_norway::to_string(&d).unwrap(),
            "name: solo\nroot: /tmp/solo\nwork_status:\n  state: blocked\n  note: waiting on the key\n  since: 1757520000000\n",
        );

        let mut d = doc("name: solo\n");
        let patch = json!({
            "state": "custom",
            "note": "second pass",
            "label": "Review",
            "emoji": "🔍",
        });
        set(&mut d, patch, 1_757_520_000_000).unwrap();
        assert_eq!(
            serde_norway::to_string(&d).unwrap(),
            "name: solo\nwork_status:\n  state: custom\n  label: Review\n  emoji: 🔍\n  note: second pass\n  since: 1757520000000\n",
        );
    }
}
