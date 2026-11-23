// In-pane browser via Tauri multiwebview (`unstable`): each browser tab owns a
// child Webview of the main window (keyed by `id`), positioned over a "hole" in
// the React UI whose pixel rect the frontend reports.
//
// Commands are `(async)` to run off the main thread: Window::add_child /
// set_position hop to the main thread and block, which would DEADLOCK if the
// command itself ran on main. The webviews load external content and are
// deliberately not in any capability, so visited pages can't reach our commands.
//
// Linux has no in-pane browser: GTK packs a child webview into the window's box
// beside the app instead of floating it over the pane, and ignores its bounds
// (tauri#16132). Pages open in the system browser there, and the frontend shows
// its own fallback pane (ExternalBrowserPane.tsx).
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, State, WebviewBuilder, WebviewUrl,
};

/// A full page navigation reverts the webview to the window (app) appearance, so
/// the chosen light/dark is kept here and re-asserted on each navigation.
#[derive(Default)]
pub struct BrowserState {
    theme: Mutex<HashMap<String, bool>>,
}

pub(crate) const OFFSCREEN: f64 = -32000.0; // park here to hide without destroying page state

pub(crate) const EMBEDDED: bool = !cfg!(target_os = "linux");

// WKWebView's default app UA omits the "Version/… Safari/…" tokens, so UA-sniffing
// sites (Google) serve a stripped-down page; a real Safari UA gets the modern site.
#[cfg(target_os = "macos")]
const SAFARI_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UrlChanged {
    id: String,
    url: String,
}

pub(crate) fn place(wv: &tauri::Webview, x: f64, y: f64, width: f64, height: f64) -> Result<(), String> {
    wv.set_position(LogicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    wv.set_size(LogicalSize::new(width.max(1.0), height.max(1.0)))
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub(crate) fn open_externally(app: &AppHandle, url: &str) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let target = parse_url(url)?;
    if target.scheme() == "about" {
        return Ok(());
    }
    app.opener()
        .open_url(target.as_str(), None::<&str>)
        .map_err(|e| e.to_string())
}

fn parse_url(url: &str) -> Result<tauri::Url, String> {
    let target = if url.trim().is_empty() {
        "about:blank"
    } else {
        url.trim()
    };
    target
        .parse()
        .map_err(|e| format!("invalid URL {target:?}: {e}"))
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
    if !EMBEDDED {
        return open_externally(&app, &url);
    }
    if let Some(wv) = app.get_webview(&id) {
        if !url.trim().is_empty() {
            wv.navigate(parse_url(&url)?).map_err(|e| e.to_string())?;
        }
        return place(&wv, x, y, width, height);
    }
    let win = app.get_window("main").ok_or("main window not found")?;
    let (app2, id2) = (app.clone(), id.clone());
    let (app_pl, id_pl) = (app.clone(), id.clone());
    let builder = WebviewBuilder::new(&id, WebviewUrl::External(parse_url(&url)?))
        // Main-frame loads only, so the address bar follows the page itself — not
        // the iframes/widgets a site embeds (Google's account switcher, etc.).
        .on_page_load(move |_wv, payload| {
            let _ = app_pl.emit(
                "browser-url-changed",
                UrlChanged {
                    id: id_pl.clone(),
                    url: payload.url().to_string(),
                },
            );
        })
        .on_navigation(move |_u| {
            // Re-assert appearance on a worker thread: apply_webview_appearance →
            // with_webview blocks the main thread, and this callback runs on main.
            if let Some(dark) = app2
                .state::<BrowserState>()
                .theme
                .lock()
                .unwrap()
                .get(&id2)
                .copied()
            {
                let (app3, id3) = (app2.clone(), id2.clone());
                std::thread::spawn(move || {
                    if let Some(wv) = app3.get_webview(&id3) {
                        apply_webview_appearance(&wv, dark);
                    }
                });
            }
            true
        });
    // Other engines already send their own browser's UA.
    #[cfg(target_os = "macos")]
    let builder = builder.user_agent(SAFARI_UA);
    // Off here as in a release build, so a dev build takes the same path:
    // allow_inspector turns it on for this page alone.
    let builder = builder.devtools(false);
    let wv = win
        .add_child(
            builder,
            LogicalPosition::new(x, y),
            LogicalSize::new(width.max(1.0), height.max(1.0)),
        )
        .map_err(|e| format!("add_child: {e}"))?;
    allow_inspector(&wv, false);
    Ok(())
}

/// Opens the web engine's own inspector on a browser tab's page.
#[tauri::command(async)]
pub fn inspect_browser(app: AppHandle, id: String) -> Result<(), String> {
    let wv = app
        .get_webview(&id)
        .ok_or("Open a page first, then inspect it.")?;
    allow_inspector(&wv, true);
    Ok(())
}

/// Lets the engine's inspector reach this page, and with `show` opens it. Only
/// the browser tabs' pages get this: the app's own windows stay closed to it,
/// which is why it isn't Tauri's app-wide `devtools` feature.
#[cfg(target_os = "macos")]
fn allow_inspector(wv: &tauri::Webview, show: bool) {
    use objc2::{class, msg_send, runtime::AnyObject, sel};
    use objc2_foundation::NSString;
    let _ = wv.with_webview(move |pv| unsafe {
        let view: *mut AnyObject = pv.inner().cast();
        if view.is_null() {
            return;
        }
        // WKWebView's inspectable switch arrived in macOS 13.3; before it the
        // developer-extras preference alone governs the inspector.
        let inspectable: bool = msg_send![view, respondsToSelector: sel!(setInspectable:)];
        if inspectable {
            let _: () = msg_send![view, setInspectable: true];
        }
        let config: *mut AnyObject = msg_send![view, configuration];
        let prefs: *mut AnyObject = msg_send![config, preferences];
        if !prefs.is_null() {
            let yes: *mut AnyObject = msg_send![class!(NSNumber), numberWithBool: true];
            let key = NSString::from_str("developerExtrasEnabled");
            let _: () = msg_send![prefs, setValue: yes, forKey: &*key];
        }
        if show {
            let inspector: *mut AnyObject = msg_send![view, _inspector];
            if !inspector.is_null() {
                let _: () = msg_send![inspector, show];
            }
        }
    });
}

#[cfg(windows)]
fn allow_inspector(wv: &tauri::Webview, show: bool) {
    let _ = wv.with_webview(move |pv| unsafe {
        let Ok(core) = pv.controller().CoreWebView2() else {
            return;
        };
        if let Ok(settings) = core.Settings() {
            let _ = settings.SetAreDevToolsEnabled(true);
        }
        if show {
            let _ = core.OpenDevToolsWindow();
        }
    });
}

// Linux has no in-pane page (see the top of this file): its pages open in the
// system browser, which brings its own inspector.
#[cfg(target_os = "linux")]
fn allow_inspector(_wv: &tauri::Webview, _show: bool) {}

#[tauri::command(async)]
pub fn set_browser_bounds(
    app: AppHandle,
    id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    match app.get_webview(&id) {
        Some(wv) => place(&wv, x, y, width, height),
        None => Ok(()),
    }
}

#[tauri::command(async)]
pub fn hide_browser(app: AppHandle, id: String) -> Result<(), String> {
    if let Some(wv) = app.get_webview(&id) {
        wv.set_position(LogicalPosition::new(OFFSCREEN, OFFSCREEN))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command(async)]
pub fn navigate_browser(app: AppHandle, id: String, url: String) -> Result<(), String> {
    if !EMBEDDED {
        return open_externally(&app, &url);
    }
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
pub fn close_browser(
    app: AppHandle,
    state: State<'_, BrowserState>,
    id: String,
) -> Result<(), String> {
    state.theme.lock().unwrap().remove(&id);
    crate::browser_pick::cancel_pick(&id);
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
    let name = if dark {
        "NSAppearanceNameDarkAqua"
    } else {
        "NSAppearanceNameAqua"
    };
    let _ = wv.with_webview(move |pv| unsafe {
        let view: *mut AnyObject = pv.inner().cast();
        if view.is_null() {
            return;
        }
        let ns_name = NSString::from_str(name);
        let appearance: *mut AnyObject =
            msg_send![class!(NSAppearance), appearanceNamed: &*ns_name];
        let _: () = msg_send![view, setAppearance: appearance];
    });
}

#[cfg(not(target_os = "macos"))]
fn apply_webview_appearance(_wv: &tauri::Webview, _dark: bool) {}
