//! An action popup's page on the desktop: a webview of its own laid over the
//! card's frame. It runs in its own web process, so a page that hangs or
//! crashes takes only itself down, and it closes with the card. The page loads
//! as a `data:` URL, an origin Tauri treats as remote, so it can't reach the
//! app's commands; its own files load from lpm-preview through the `<base>` the
//! frontend writes into it. The webview waits off screen until the page has
//! loaded, and one that hasn't within `LOAD_WITHIN` is closed and the card told
//! why. At most one is open. Linux has no child webviews over the app (see
//! browser.rs), so the frontend draws the page in a sandboxed frame there.
use base64::Engine;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;
use tauri::webview::{Color, NewWindowResponse, PageLoadEvent};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, State, Url, WebviewBuilder,
    WebviewUrl,
};

use crate::browser::{EMBEDDED, OFFSCREEN};

const PREFIX: &str = "popup-";
// macOS can't color a webview before its page paints, so a loaded page gets a
// moment to draw before the webview moves on screen.
const PAINT_WAIT: Duration = Duration::from_millis(60);
const LOAD_WITHIN: Duration = Duration::from_secs(8);

#[derive(Clone, Copy)]
struct Rect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

/// Where the card wants each popup that's still loading.
#[derive(Default)]
pub struct PopupPages(Mutex<HashMap<String, Rect>>);

pub(crate) fn is_popup_label(label: &str) -> bool {
    label.starts_with(PREFIX)
}

fn label_of(id: &str) -> Result<String, String> {
    let ok = !id.is_empty()
        && id.len() <= 64
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    if ok {
        Ok(format!("{PREFIX}{id}"))
    } else {
        Err(format!("invalid popup id {id:?}"))
    }
}

#[allow(clippy::too_many_arguments)]
#[tauri::command(async)]
pub fn popup_view_open(
    app: AppHandle,
    pages: State<'_, PopupPages>,
    id: String,
    html: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    background: String,
) -> Result<(), String> {
    if !EMBEDDED {
        return Err("popups draw in the app's own frame on this system".into());
    }
    let label = label_of(&id)?;
    let page = page_url(&html)?;
    close_all(&app, &pages);
    pages
        .0
        .lock()
        .unwrap()
        .insert(label.clone(), Rect { x, y, width, height });
    let win = app.get_window("main").ok_or("main window not found")?;
    let blank: Url = "about:blank".parse().map_err(|e| format!("{e}"))?;
    let loads = app.clone();
    let links = app.clone();
    let builder = WebviewBuilder::new(&label, WebviewUrl::External(blank))
        .focused(false)
        .background_color(parse_color(&background))
        .on_page_load(move |webview, payload| {
            if payload.event() != PageLoadEvent::Finished || payload.url().scheme() != "data" {
                return;
            }
            let rect = loads
                .state::<PopupPages>()
                .0
                .lock()
                .unwrap()
                .remove(webview.label());
            if let Some(rect) = rect {
                std::thread::spawn(move || {
                    std::thread::sleep(PAINT_WAIT);
                    let _ = place(&webview, rect);
                });
            }
        })
        .on_navigation(allowed)
        .on_new_window(move |url, _| {
            open_link(&links, &url);
            NewWindowResponse::Deny
        });
    win.add_child(
        builder,
        LogicalPosition::new(OFFSCREEN, OFFSCREEN),
        LogicalSize::new(width.max(1.0), height.max(1.0)),
    )
    .map_err(|e| format!("add_child: {e}"))?;
    // Tauri only loads a `data:` page by navigating to it; the about:blank the
    // webview starts on never reports a load.
    app.get_webview(&label)
        .ok_or("popup webview missing")?
        .navigate(page)
        .map_err(|e| e.to_string())?;
    std::thread::spawn(move || {
        std::thread::sleep(LOAD_WITHIN);
        give_up_unless_loaded(&app, &label);
    });
    Ok(())
}

/// A page still loading after `LOAD_WITHIN` (its script stuck, or a library it
/// waits on never arriving) is closed, and the card says so.
fn give_up_unless_loaded(app: &AppHandle, label: &str) {
    if app.state::<PopupPages>().0.lock().unwrap().remove(label).is_none() {
        return;
    }
    if let Some(webview) = app.get_webview(label) {
        let _ = webview.close();
    }
    let _ = app.emit(
        "popup-view-failed",
        serde_json::json!({
            "id": label.trim_start_matches(PREFIX),
            "error": format!(
                "The page didn't finish loading within {} seconds, so it was closed.",
                LOAD_WITHIN.as_secs()
            ),
        }),
    );
}

#[tauri::command(async)]
pub fn popup_view_place(
    app: AppHandle,
    pages: State<'_, PopupPages>,
    id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let label = label_of(&id)?;
    let rect = Rect { x, y, width, height };
    if let Some(waiting) = pages.0.lock().unwrap().get_mut(&label) {
        *waiting = rect;
        return Ok(());
    }
    match app.get_webview(&label) {
        Some(webview) => place(&webview, rect),
        None => Ok(()),
    }
}

/// New data for the open page, which hands it to `lpm.onData`.
#[tauri::command(async)]
pub fn popup_view_push(app: AppHandle, id: String, payload: String) -> Result<(), String> {
    let Some(webview) = app.get_webview(&label_of(&id)?) else {
        return Ok(());
    };
    let payload = serde_json::value::RawValue::from_string(payload).map_err(|e| e.to_string())?;
    webview
        .eval(format!("window.__lpmPush && window.__lpmPush({})", payload.get()))
        .map_err(|e| e.to_string())
}

#[tauri::command(async)]
pub fn popup_view_close(app: AppHandle, pages: State<'_, PopupPages>, id: String) -> Result<(), String> {
    let label = label_of(&id)?;
    pages.0.lock().unwrap().remove(&label);
    if let Some(webview) = app.get_webview(&label) {
        webview.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn place(webview: &tauri::Webview, rect: Rect) -> Result<(), String> {
    crate::browser::place(webview, rect.x, rect.y, rect.width, rect.height)
}

fn close_all(app: &AppHandle, pages: &PopupPages) {
    pages.0.lock().unwrap().clear();
    for (label, webview) in app.webviews() {
        if is_popup_label(&label) {
            let _ = webview.close();
        }
    }
}

fn page_url(html: &str) -> Result<Url, String> {
    let encoded = base64::engine::general_purpose::STANDARD.encode(html);
    format!("data:text/html;charset=utf-8;base64,{encoded}")
        .parse()
        .map_err(|e| format!("{e}"))
}

/// Where the page itself and its frames may go: never to the app's own schemes
/// or a localhost page, which Tauri would trust as the app.
fn allowed(url: &Url) -> bool {
    match url.scheme() {
        "about" | "data" | "blob" => true,
        "http" | "https" => !url.host_str().is_some_and(is_local_host),
        _ => false,
    }
}

fn is_local_host(host: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    host.ends_with(".localhost")
        || crate::remote_machines::is_loopback(host.trim_matches(['[', ']']))
}

fn open_link(app: &AppHandle, url: &Url) {
    if !matches!(url.scheme(), "http" | "https") {
        return;
    }
    use tauri_plugin_opener::OpenerExt;
    let _ = app.opener().open_url(url.as_str(), None::<&str>);
}

/// `#rrggbb`, else the card's dark surface.
fn parse_color(hex: &str) -> Color {
    hex.parse().unwrap_or(Color(38, 38, 38, 255))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(s: &str) -> Url {
        s.parse().unwrap()
    }

    #[test]
    fn the_page_stays_off_the_apps_own_origins() {
        assert!(allowed(&url("about:blank")));
        assert!(allowed(&url("https://cdn.jsdelivr.net/npm/chart.js")));
        assert!(allowed(&url("data:text/html,hi")));
        assert!(!allowed(&url("lpm-preview://localhost/abc/page.html")));
        assert!(!allowed(&url("tauri://localhost/")));
        assert!(!allowed(&url("http://lpm-preview.localhost/abc/page.html")));
        assert!(!allowed(&url("http://localhost:1420/")));
        assert!(!allowed(&url("http://127.0.0.1:3000/")));
        assert!(!allowed(&url("http://127.0.0.2/")));
        assert!(!allowed(&url("http://[::1]:3000/")));
        assert!(!allowed(&url("http://0.0.0.0:3000/")));
        assert!(!allowed(&url("file:///etc/passwd")));
    }

    #[test]
    fn ids_are_plain_names() {
        assert_eq!(label_of("a-1").unwrap(), "popup-a-1");
        assert!(label_of("../x").is_err());
        assert!(label_of("").is_err());
    }

    #[test]
    fn the_page_travels_whole_in_its_url() {
        let page = page_url("<p>héllo \"</p>").unwrap();
        assert_eq!(page.scheme(), "data");
        let encoded = page.as_str().rsplit(',').next().unwrap();
        let decoded = base64::engine::general_purpose::STANDARD.decode(encoded).unwrap();
        assert_eq!(String::from_utf8(decoded).unwrap(), "<p>héllo \"</p>");
    }

    #[test]
    fn colors_read_hex_and_fall_back() {
        assert_eq!(parse_color("#102030"), Color(16, 32, 48, 255));
        assert_eq!(parse_color("rgb(1,2,3)"), Color(38, 38, 38, 255));
    }
}
