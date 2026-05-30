// Hand-implemented commands. Listed in REAL in scripts/gen-tauri-bindings.mjs
// so they are excluded from the generated stubs but still in the handler list.
use crate::config;
use crate::services::ServiceState;
use crate::status::StatusStore;
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

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
pub fn tmux_installed() -> bool {
    // Gates the entire app render (App.tsx: tmuxReady === null shows a blank
    // loading view), so it must return a real boolean, not the stub null.
    crate::sys::which("tmux")
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
    std::fs::write(path, data).map_err(|e| e.to_string())
}

#[tauri::command]
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
                p.get("name").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                p.get("running").and_then(|v| v.as_bool()).unwrap_or(false),
            )
        })
        .collect();
    crate::dockmenu::refresh(&dock);
    Ok(projects)
}

#[tauri::command]
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
pub fn reorder_projects(app: AppHandle, order: Vec<String>) -> Result<(), String> {
    config::merge_settings(json!({ "projectOrder": order }))?;
    let _ = app.emit("projects-changed", ());
    Ok(())
}

#[tauri::command]
pub fn set_project_label(app: AppHandle, name: String, label: String) -> Result<(), String> {
    // A duplicate's label routes to its parent's config file (matches read_config).
    let target = config::peek_parent(&name).unwrap_or_else(|| name.clone());
    let path = config::project_path(&target);
    let mut doc: serde_yaml::Value =
        serde_yaml::from_slice(&std::fs::read(&path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    let trimmed = label.trim();
    let current = doc.get("label").and_then(|v| v.as_str()).unwrap_or("");
    if current == trimmed {
        return Ok(());
    }
    if let Some(map) = doc.as_mapping_mut() {
        if trimmed.is_empty() {
            map.remove("label"); // empty clears the label -> falls back to name
        } else {
            map.insert("label".into(), trimmed.into());
        }
    }
    let out = serde_yaml::to_string(&doc).map_err(|e| e.to_string())?;
    config::write_config_file(&path, &out)?;
    let _ = app.emit("projects-changed", ());
    Ok(())
}
