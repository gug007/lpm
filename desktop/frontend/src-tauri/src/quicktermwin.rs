// The quick terminal's window: frameless, above every other window, along the
// top of the screen the pointer is on. Hiding keeps it (and its shell) alive for
// the next press; the app that was in front before gets the keyboard back.
use std::sync::Mutex;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

pub const LABEL: &str = "quick-terminal";
const EVENT_SHOWN: &str = "quick-terminal-shown";
const EVENT_HIDDEN: &str = "quick-terminal-hidden";
const WIDTH_SHARE: f64 = 0.9;
const HEIGHT_SHARE: f64 = 0.4;

/// The app that was in front when the window dropped down (macOS only: elsewhere
/// the window manager hands focus back by itself).
static PREVIOUS_APP: Mutex<Option<i32>> = Mutex::new(None);

pub fn toggle(app: &AppHandle) {
    let Some(win) = app.get_webview_window(LABEL) else {
        // Off the thread that delivers the key: on Windows that is the main
        // thread, where WebView2 can't finish creating a view inside a callback.
        let app = app.clone();
        std::thread::spawn(move || match create(&app) {
            Ok(win) => show(&app, &win),
            Err(e) => eprintln!("quick terminal: {e}"),
        });
        return;
    };
    let visible = win.is_visible().unwrap_or(false);
    let focused = win.is_focused().unwrap_or(false);
    if visible && focused {
        hide(app);
    } else {
        show(app, &win);
    }
}

pub fn hide(app: &AppHandle) {
    let Some(win) = app.get_webview_window(LABEL) else {
        return;
    };
    if !win.is_visible().unwrap_or(false) {
        return;
    }
    let _ = win.hide();
    let _ = app.emit(EVENT_HIDDEN, ());
    if let Some(pid) = PREVIOUS_APP.lock().unwrap().take() {
        activate_app(pid);
    }
}

fn show(app: &AppHandle, win: &WebviewWindow) {
    if !win.is_visible().unwrap_or(false) {
        *PREVIOUS_APP.lock().unwrap() = frontmost_other_app();
    }
    place(app, win);
    let _ = win.show();
    let _ = win.set_focus();
    let _ = app.emit(EVENT_SHOWN, ());
}

fn create(app: &AppHandle) -> Result<WebviewWindow, String> {
    let url = WebviewUrl::App("index.html?quickterm=1".into());
    let win = WebviewWindowBuilder::new(app, LABEL, url)
        .title("Quick terminal")
        .decorations(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(true)
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?;
    crate::webengine::harden(&win);
    let handle = app.clone();
    win.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            hide(&handle);
        }
    });
    Ok(win)
}

fn place(app: &AppHandle, win: &WebviewWindow) {
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return;
    };
    let area = monitor.work_area();
    let (x, y, w, h) = frame(area.position.x, area.position.y, area.size.width, area.size.height);
    let _ = win.set_size(PhysicalSize::new(w, h));
    let _ = win.set_position(PhysicalPosition::new(x, y));
}

/// The window's frame inside a screen's work area: centred, flush with the top.
fn frame(x: i32, y: i32, width: u32, height: u32) -> (i32, i32, u32, u32) {
    let w = (f64::from(width) * WIDTH_SHARE).round() as u32;
    let h = (f64::from(height) * HEIGHT_SHARE).round() as u32;
    let left = x + ((width - w) / 2) as i32;
    (left, y, w, h)
}

#[cfg(target_os = "macos")]
fn frontmost_other_app() -> Option<i32> {
    use objc2::runtime::AnyObject;
    use objc2::{class, msg_send};
    let pid: i32 = unsafe {
        let workspace: *mut AnyObject = msg_send![class!(NSWorkspace), sharedWorkspace];
        if workspace.is_null() {
            return None;
        }
        let front: *mut AnyObject = msg_send![workspace, frontmostApplication];
        if front.is_null() {
            return None;
        }
        msg_send![front, processIdentifier]
    };
    (pid > 0 && pid as u32 != std::process::id()).then_some(pid)
}

#[cfg(not(target_os = "macos"))]
fn frontmost_other_app() -> Option<i32> {
    None
}

#[cfg(target_os = "macos")]
fn activate_app(pid: i32) {
    use objc2::runtime::{AnyObject, Bool};
    use objc2::{class, msg_send};
    unsafe {
        let running: *mut AnyObject = msg_send![
            class!(NSRunningApplication),
            runningApplicationWithProcessIdentifier: pid
        ];
        if !running.is_null() {
            let _: Bool = msg_send![running, activateWithOptions: 0usize];
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn activate_app(_pid: i32) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frame_is_centred_along_the_top() {
        assert_eq!(frame(0, 25, 2000, 1000), (100, 25, 1800, 400));
        assert_eq!(frame(-1920, 0, 1920, 1080), (-1824, 0, 1728, 432));
    }
}
