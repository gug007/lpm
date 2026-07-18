// Persist/restore the main window's bounds in settings.json, mirroring detached.rs.
// Hidden (not destroyed) on close, so we save on every Moved/Resized. Single writer
// of windowX/Y/Width/Height in logical px — the frontend resize-saver was removed to
// avoid two writers using different coordinate spaces for the same keys.
use crate::bounds::{self, read_logical_bounds, valid_bounds};
use crate::config;
use std::sync::Arc;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewWindow, WindowEvent};

pub fn attach(win: &WebviewWindow) {
    let app = win.app_handle().clone();
    let bounds_tx = bounds::spawn_bounds_saver(app.clone(), {
        let app = app.clone();
        Arc::new(move || persist_now(&app))
    });
    win.on_window_event(move |event| {
        if matches!(
            event,
            WindowEvent::Moved(_)
                | WindowEvent::Resized(_)
                | WindowEvent::ScaleFactorChanged { .. }
        ) {
            let _ = bounds_tx.try_send(());
        }
    });
}

// Synchronous flush of the current main-window bounds. Called on the debounce
// worker's main-thread hop, and directly on window close + app exit so the last
// position is never lost between settle windows. No-op if the window is gone.
pub fn persist_now(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        persist(&win);
    }
}

fn persist(win: &WebviewWindow) {
    if win.is_fullscreen().unwrap_or(false) {
        return;
    }
    let Some((x, y, w, h)) = read_logical_bounds(win) else {
        return;
    };
    let (xi, yi, wi, hi) = (
        x.round() as i64,
        y.round() as i64,
        w.round() as i64,
        h.round() as i64,
    );
    let mut s = config::load_settings();
    let Some(obj) = s.as_object_mut() else {
        return;
    };
    let g = |k: &str| obj.get(k).and_then(|v| v.as_i64());
    if g("windowX") == Some(xi)
        && g("windowY") == Some(yi)
        && g("windowWidth") == Some(wi)
        && g("windowHeight") == Some(hi)
    {
        return;
    }
    obj.insert("windowX".into(), xi.into());
    obj.insert("windowY".into(), yi.into());
    obj.insert("windowWidth".into(), wi.into());
    obj.insert("windowHeight".into(), hi.into());
    let _ = config::save_settings(&s);
}

pub fn restore(win: &WebviewWindow) {
    let s = config::load_settings();
    let g = |k: &str| s.get(k).and_then(|v| v.as_i64());
    let (Some(w), Some(h)) = (g("windowWidth"), g("windowHeight")) else {
        return;
    };
    let (w, h) = (w as f64, h as f64);
    if !valid_bounds(w, h) {
        return;
    }
    let _ = win.set_size(LogicalSize::new(w, h));
    // set_size grows the window from the default frame's top-left corner, so
    // without an explicit position it ends up off-center (or off-screen).
    // Re-center when there is no usable saved position: legacy size-only
    // settings, or a saved spot that's off-screen after a display change.
    let (Some(x), Some(y)) = (g("windowX"), g("windowY")) else {
        let _ = win.center();
        return;
    };
    let (x, y) = (x as f64, y as f64);
    if position_on_screen(win, x, y, w) {
        let _ = win.set_position(LogicalPosition::new(x, y));
    } else {
        let _ = win.center();
    }
}

/// Guards against restoring a window fully off-screen after a display change.
fn position_on_screen(win: &WebviewWindow, x: f64, y: f64, w: f64) -> bool {
    let Ok(monitors) = win.available_monitors() else {
        return true;
    };
    if monitors.is_empty() {
        return true;
    }
    const MARGIN: f64 = 48.0;
    monitors.iter().any(|m| {
        let scale = m.scale_factor();
        let mp = m.position();
        let ms = m.size();
        let mx0 = mp.x as f64 / scale;
        let my0 = mp.y as f64 / scale;
        let mx1 = mx0 + ms.width as f64 / scale;
        let my1 = my0 + ms.height as f64 / scale;
        x + w - MARGIN > mx0 && x + MARGIN < mx1 && y + MARGIN > my0 && y < my1
    })
}
