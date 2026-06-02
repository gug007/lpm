// Detached windows — port of desktop/detached.go. Each detached project gets
// its own Tauri WebviewWindow loading the same frontend with ?detached=<name>
// (so React renders DetachedApp). Window bounds persist in
// settings.detachedWindows; windows reopen on launch. The per-window file-drop
// bridge is handled entirely by the runtime.js shim (per-webview), so no
// backend file-drop registration is needed (unlike the Go version).
use crate::bounds;
use crate::config;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};

const EVENT_CHANGED: &str = "detached-changed";
const LABEL_PREFIX: &str = "detached-";
const DEFAULT_W: f64 = 900.0;
const DEFAULT_H: f64 = 700.0;
const CASCADE_STEP: f64 = 28.0;

/// Live registry of open detached windows: project FILE name -> window label.
/// (settings.detachedWindows[name].detached is the separate "should reopen"
/// source of truth.)
#[derive(Default)]
pub struct DetachedState {
    pub labels: Mutex<HashMap<String, String>>,
}

/// Tauri window labels allow only `[a-zA-Z0-9-/:_. ]`; sanitize and append a
/// stable per-run hash so distinct names can't collide after sanitization. We
/// always look up by project name (never reverse-parse the label).
fn label_for(name: &str) -> String {
    let safe: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.') {
                c
            } else {
                '_'
            }
        })
        .collect();
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    name.hash(&mut hasher);
    format!("{LABEL_PREFIX}{safe}-{:08x}", hasher.finish())
}

// ---- commands ---------------------------------------------------------------

#[tauri::command]
pub fn detach_project(
    app: AppHandle,
    state: State<'_, DetachedState>,
    project_name: String,
) -> Result<(), String> {
    if project_name.is_empty() {
        return Err("empty project name".into());
    }
    if !config::project_exists(&project_name) {
        return Err(format!("project not found: {project_name}"));
    }
    // Already open -> focus and return.
    let existing = state.labels.lock().unwrap().get(&project_name).cloned();
    if let Some(label) = existing {
        if let Some(win) = app.get_webview_window(&label) {
            let _ = win.show();
            let _ = win.set_focus();
            return Ok(());
        }
        state.labels.lock().unwrap().remove(&project_name); // stale -> recreate
    }
    let bounds = saved_bounds(&project_name);
    open_window(&app, &state, &project_name, bounds)?;
    persist_detached_flag(&project_name, true);
    let _ = app.emit(EVENT_CHANGED, ());
    Ok(())
}

#[tauri::command]
pub fn attach_project(
    app: AppHandle,
    state: State<'_, DetachedState>,
    project_name: String,
) -> Result<(), String> {
    let label = state.labels.lock().unwrap().get(&project_name).cloned();
    if let Some(label) = label {
        if let Some(win) = app.get_webview_window(&label) {
            let _ = win.close(); // CloseRequested handler clears flag + emits
            return Ok(());
        }
        state.labels.lock().unwrap().remove(&project_name);
    }
    persist_detached_flag(&project_name, false);
    let _ = app.emit(EVENT_CHANGED, ());
    Ok(())
}

#[tauri::command]
pub fn focus_detached_window(
    app: AppHandle,
    state: State<'_, DetachedState>,
    project_name: String,
) -> bool {
    let Some(label) = state.labels.lock().unwrap().get(&project_name).cloned() else {
        return false;
    };
    match app.get_webview_window(&label) {
        Some(win) => {
            let _ = win.show();
            win.set_focus().is_ok()
        }
        None => false,
    }
}

#[tauri::command]
pub fn list_detached_projects(state: State<'_, DetachedState>) -> Vec<String> {
    state.labels.lock().unwrap().keys().cloned().collect()
}

#[tauri::command]
pub fn restore_detached_windows(app: AppHandle, state: State<'_, DetachedState>) {
    restore_impl(&app, &state);
}

/// Reopen a window for every settings entry with detached==true whose project
/// still exists. Idempotent. Shared by the command and the setup hook.
pub fn restore_impl(app: &AppHandle, state: &DetachedState) {
    let settings = config::load_settings();
    let to_open: Vec<String> = match settings.get("detachedWindows").and_then(|v| v.as_object()) {
        Some(map) => map
            .iter()
            .filter(|(_, v)| v.get("detached").and_then(|d| d.as_bool()).unwrap_or(false))
            .map(|(k, _)| k.clone())
            .collect(),
        None => return,
    };
    for name in to_open {
        if !config::project_exists(&name) {
            clear_detached_entry(&name);
            continue;
        }
        if state.labels.lock().unwrap().contains_key(&name) {
            continue;
        }
        let bounds = saved_bounds(&name);
        let _ = open_window(app, state, &name, bounds);
    }
    let _ = app.emit(EVENT_CHANGED, ());
}

// ---- window creation + events ----------------------------------------------

fn open_window(
    app: &AppHandle,
    state: &DetachedState,
    project_name: &str,
    bounds: Option<(f64, f64, f64, f64)>,
) -> Result<(), String> {
    let label = label_for(project_name);
    // WebviewUrl::App preserves the query string (the "index.html" fast-path
    // only matches the exact literal); a relative path joins against devUrl in
    // dev / tauri://localhost in prod.
    let encoded = urlencoding::encode(project_name);
    let url = WebviewUrl::App(format!("index.html?detached={encoded}").into());

    // Match the main window's chrome (tauri.conf.json): an overlay title bar with
    // a hidden title so the traffic lights sit inside the React header and content
    // starts from the top, instead of a native title bar pushing it down.
    let mut builder = WebviewWindowBuilder::new(app, &label, url)
        .title(project_name)
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .min_inner_size(bounds::MIN_W, bounds::MIN_H)
        .resizable(true);

    builder = match bounds {
        Some((x, y, w, h)) => builder.position(x, y).inner_size(w, h),
        None => {
            let n = state.labels.lock().unwrap().len() as f64;
            let offset = CASCADE_STEP * (n % 8.0);
            builder
                .inner_size(DEFAULT_W, DEFAULT_H)
                .position(40.0 + offset, 40.0 + offset)
        }
    };

    let win = builder.build().map_err(|e| e.to_string())?;
    attach_events(app, project_name, &label, &win);
    state
        .labels
        .lock()
        .unwrap()
        .insert(project_name.to_string(), label);
    Ok(())
}

fn attach_events(app: &AppHandle, project_name: &str, label: &str, win: &tauri::WebviewWindow) {
    let app = app.clone();
    let name = project_name.to_string();
    let label = label.to_string();
    win.on_window_event(move |event| match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
            if let Some(w) = app.get_webview_window(&label) {
                if let Some((x, y, ww, hh)) = bounds::read_logical_bounds(&w) {
                    persist_detached_bounds(&name, x, y, ww, hh);
                }
            }
        }
        WindowEvent::CloseRequested { .. } => {
            app.state::<DetachedState>().labels.lock().unwrap().remove(&name);
            persist_detached_flag(&name, false);
            let _ = app.emit(EVENT_CHANGED, ());
        }
        WindowEvent::Destroyed => {
            app.state::<DetachedState>().labels.lock().unwrap().remove(&name);
        }
        _ => {}
    });
}

// ---- settings persistence (read-modify-write with change detection) ---------

fn saved_bounds(name: &str) -> Option<(f64, f64, f64, f64)> {
    let s = config::load_settings();
    let e = s.get("detachedWindows")?.get(name)?;
    let g = |k: &str| e.get(k).and_then(|v| v.as_i64());
    let (w, h) = (g("width")? as f64, g("height")? as f64);
    if !bounds::valid_bounds(w, h) {
        return None;
    }
    Some((g("x").unwrap_or(0) as f64, g("y").unwrap_or(0) as f64, w, h))
}

fn persist_detached_flag(name: &str, detached: bool) {
    mutate_entry(name, |e| {
        let cur = e.get("detached").and_then(|v| v.as_bool()).unwrap_or(false);
        if cur == detached {
            return false;
        }
        e.insert("detached".into(), serde_json::Value::Bool(detached));
        true
    });
}

fn persist_detached_bounds(name: &str, x: f64, y: f64, w: f64, h: f64) {
    let (xi, yi, wi, hi) = (x as i64, y as i64, w as i64, h as i64);
    mutate_entry(name, |e| {
        let g = |k: &str| e.get(k).and_then(|v| v.as_i64());
        if g("x") == Some(xi) && g("y") == Some(yi) && g("width") == Some(wi) && g("height") == Some(hi) {
            return false;
        }
        e.insert("x".into(), xi.into());
        e.insert("y".into(), yi.into());
        e.insert("width".into(), wi.into());
        e.insert("height".into(), hi.into());
        true
    });
}

fn clear_detached_entry(name: &str) {
    let mut s = config::load_settings();
    let changed = s
        .get_mut("detachedWindows")
        .and_then(|v| v.as_object_mut())
        .map(|m| m.remove(name).is_some())
        .unwrap_or(false);
    if changed {
        let _ = config::save_settings(&s);
    }
}

fn mutate_entry(
    name: &str,
    f: impl FnOnce(&mut serde_json::Map<String, serde_json::Value>) -> bool,
) {
    let mut s = config::load_settings();
    let Some(root) = s.as_object_mut() else { return };
    let dw = root
        .entry("detachedWindows")
        .or_insert_with(|| serde_json::Value::Object(Default::default()));
    let Some(dw) = dw.as_object_mut() else { return };
    let entry = dw
        .entry(name.to_string())
        .or_insert_with(|| serde_json::Value::Object(Default::default()));
    let Some(entry) = entry.as_object_mut() else { return };
    if f(entry) {
        let _ = config::save_settings(&s);
    }
}
