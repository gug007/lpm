// In-pane browser via Tauri multiwebview (`unstable`): each browser tab owns a
// child Webview of the main window (keyed by `id`), positioned over a "hole" in
// the React UI whose pixel rect the frontend reports.
//
// Commands are `(async)` to run off the main thread: Window::add_child /
// set_position hop to the main thread and block, which would DEADLOCK if the
// command itself ran on main. The webviews load external content and are
// deliberately not in any capability, so visited pages can't reach our commands.
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, State, WebviewBuilder, WebviewUrl};

/// A full page navigation reverts the webview to the window (app) appearance, so
/// the chosen light/dark is kept here and re-asserted on each navigation.
#[derive(Default)]
pub struct BrowserState {
    theme: Mutex<HashMap<String, bool>>,
}

const OFFSCREEN: f64 = -32000.0; // park here to hide without destroying page state

// WKWebView's default app UA omits the "Version/… Safari/…" tokens, so UA-sniffing
// sites (Google) serve a stripped-down page; a real Safari UA gets the modern site.
const SAFARI_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UrlChanged {
    id: String,
    url: String,
}

fn place(wv: &tauri::Webview, x: f64, y: f64, width: f64, height: f64) -> Result<(), String> {
    wv.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
    wv.set_size(LogicalSize::new(width.max(1.0), height.max(1.0))).map_err(|e| e.to_string())?;
    Ok(())
}

fn parse_url(url: &str) -> Result<tauri::Url, String> {
    let target = if url.trim().is_empty() { "about:blank" } else { url.trim() };
    target.parse().map_err(|e| format!("invalid URL {target:?}: {e}"))
}

#[tauri::command(async)]
pub fn open_browser(
    app: AppHandle,
    id: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    if let Some(wv) = app.get_webview(&id) {
        if !url.trim().is_empty() {
            wv.navigate(parse_url(&url)?).map_err(|e| e.to_string())?;
        }
        return place(&wv, x, y, width, height);
    }
    let win = app.get_window("main").ok_or("main window not found")?;
    let (app2, id2) = (app.clone(), id.clone());
    let builder = WebviewBuilder::new(&id, WebviewUrl::External(parse_url(&url)?))
        .user_agent(SAFARI_UA)
        .on_navigation(move |u| {
            let _ = app2.emit("browser-url-changed", UrlChanged { id: id2.clone(), url: u.to_string() });
            // Re-assert appearance on a worker thread: apply_webview_appearance →
            // with_webview blocks the main thread, and this callback runs on main.
            if let Some(dark) = app2.state::<BrowserState>().theme.lock().unwrap().get(&id2).copied() {
                let (app3, id3) = (app2.clone(), id2.clone());
                std::thread::spawn(move || {
                    if let Some(wv) = app3.get_webview(&id3) {
                        apply_webview_appearance(&wv, dark);
                    }
                });
            }
            true
        });
    win.add_child(
        builder,
        LogicalPosition::new(x, y),
        LogicalSize::new(width.max(1.0), height.max(1.0)),
    )
    .map_err(|e| format!("add_child: {e}"))?;
    Ok(())
}

#[tauri::command(async)]
pub fn set_browser_bounds(app: AppHandle, id: String, x: f64, y: f64, width: f64, height: f64) -> Result<(), String> {
    match app.get_webview(&id) {
        Some(wv) => place(&wv, x, y, width, height),
        None => Ok(()),
    }
}

#[tauri::command(async)]
pub fn hide_browser(app: AppHandle, id: String) -> Result<(), String> {
    if let Some(wv) = app.get_webview(&id) {
        wv.set_position(LogicalPosition::new(OFFSCREEN, OFFSCREEN)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command(async)]
pub fn navigate_browser(app: AppHandle, id: String, url: String) -> Result<(), String> {
    match app.get_webview(&id) {
        Some(wv) => wv.navigate(parse_url(&url)?).map_err(|e| e.to_string()),
        None => Err("browser is not open".into()),
    }
}

#[tauri::command(async)]
pub fn browser_back(app: AppHandle, id: String) -> Result<(), String> {
    eval(&app, &id, "history.back()")
}

#[tauri::command(async)]
pub fn browser_forward(app: AppHandle, id: String) -> Result<(), String> {
    eval(&app, &id, "history.forward()")
}

#[tauri::command(async)]
pub fn browser_reload(app: AppHandle, id: String) -> Result<(), String> {
    eval(&app, &id, "location.reload()")
}

fn eval(app: &AppHandle, id: &str, js: &str) -> Result<(), String> {
    match app.get_webview(id) {
        Some(wv) => wv.eval(js).map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

#[tauri::command(async)]
pub fn close_browser(app: AppHandle, state: State<'_, BrowserState>, id: String) -> Result<(), String> {
    state.theme.lock().unwrap().remove(&id);
    if let Some(wv) = app.get_webview(&id) {
        wv.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Overrides ONLY this webview's NSAppearance — the window-level theme is
/// app-wide on macOS, which we don't want. This drives the webview's
/// prefers-color-scheme without touching the rest of the app.
#[tauri::command(async)]
pub fn set_browser_theme(
    app: AppHandle,
    state: State<'_, BrowserState>,
    id: String,
    dark: bool,
) -> Result<(), String> {
    state.theme.lock().unwrap().insert(id.clone(), dark);
    if let Some(wv) = app.get_webview(&id) {
        apply_webview_appearance(&wv, dark);
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn apply_webview_appearance(wv: &tauri::Webview, dark: bool) {
    use objc2::{class, msg_send, runtime::AnyObject};
    use objc2_foundation::NSString;
    // NSAppearanceName values are plain NSStrings; built by literal to avoid
    // objc2-app-kit's per-type feature gates.
    let name = if dark { "NSAppearanceNameDarkAqua" } else { "NSAppearanceNameAqua" };
    let _ = wv.with_webview(move |pv| unsafe {
        let view: *mut AnyObject = pv.inner().cast();
        if view.is_null() {
            return;
        }
        let ns_name = NSString::from_str(name);
        let appearance: *mut AnyObject = msg_send![class!(NSAppearance), appearanceNamed: &*ns_name];
        let _: () = msg_send![view, setAppearance: appearance];
    });
}

#[cfg(not(target_os = "macos"))]
fn apply_webview_appearance(_wv: &tauri::Webview, _dark: bool) {}
