// Window-bounds helpers shared by the main window (mainwindow.rs) and detached
// windows (detached.rs): size validation + the physical->logical conversion
// (Tauri getters report physical pixels; builders/setters take logical).
use std::sync::mpsc::{sync_channel, RecvTimeoutError, SyncSender};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, WebviewWindow};

const BOUNDS_SETTLE: Duration = Duration::from_millis(300);

pub const MIN_W: f64 = 700.0;
pub const MIN_H: f64 = 500.0;
pub const MAX_W: f64 = 7680.0;
pub const MAX_H: f64 = 4320.0;

pub fn valid_bounds(w: f64, h: f64) -> bool {
    w >= MIN_W && h >= MIN_H && w <= MAX_W && h <= MAX_H
}

/// Wayland compositors place windows themselves: set_position is ignored and
/// outer_position reads 0,0, so a position saved there would only misplace the
/// window in a later X11 session.
pub fn positions_supported() -> bool {
    #[cfg(target_os = "linux")]
    {
        let display = std::env::var_os("WAYLAND_DISPLAY").is_some_and(|v| !v.is_empty());
        !gtk_uses_wayland(std::env::var("GDK_BACKEND").ok().as_deref(), display)
    }
    #[cfg(not(target_os = "linux"))]
    {
        true
    }
}

#[cfg(any(target_os = "linux", test))]
fn gtk_uses_wayland(gdk_backend: Option<&str>, wayland_display: bool) -> bool {
    wayland_display && !gdk_backend.is_some_and(|b| b.trim_start().starts_with("x11"))
}

// Coalesce a burst of window move/resize/scale events into at most one persist
// per ~300ms of quiet, off the window-event hot path (which fires many times a
// second during a drag and must not do a settings read-modify-write each time).
// Fire `try_send(())` from the event handler. `persist` runs on the main thread
// (it reads window getters) after the burst settles, and once more if events
// were still pending when the sender dropped. The worker exits when the returned
// sender is dropped (window closed / app quit).
pub fn spawn_bounds_saver(app: AppHandle, persist: Arc<dyn Fn() + Send + Sync>) -> SyncSender<()> {
    let (tx, rx) = sync_channel(1);
    std::thread::spawn(move || loop {
        if rx.recv().is_err() {
            return;
        }
        let disconnected = loop {
            match rx.recv_timeout(BOUNDS_SETTLE) {
                Ok(()) => {}
                Err(RecvTimeoutError::Timeout) => break false,
                Err(RecvTimeoutError::Disconnected) => break true,
            }
        };
        let p = persist.clone();
        let _ = app.run_on_main_thread(move || p());
        if disconnected {
            return;
        }
    });
    tx
}

pub fn read_logical_bounds(win: &WebviewWindow) -> Option<(f64, f64, f64, f64)> {
    let scale = win.scale_factor().ok()?;
    let pos = win.outer_position().ok()?;
    let size = win.inner_size().ok()?;
    let (x, y) = (pos.x as f64 / scale, pos.y as f64 / scale);
    let (w, h) = (size.width as f64 / scale, size.height as f64 / scale);
    if !valid_bounds(w, h) {
        return None;
    }
    Some((x, y, w, h))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gtk_picks_wayland_only_with_a_display_and_no_x11_override() {
        assert!(gtk_uses_wayland(None, true));
        assert!(gtk_uses_wayland(Some("wayland,x11"), true));
        assert!(gtk_uses_wayland(Some(""), true));
        assert!(!gtk_uses_wayland(Some("x11"), true));
        assert!(!gtk_uses_wayland(Some("x11,wayland"), true));
        assert!(!gtk_uses_wayland(None, false));
        assert!(!gtk_uses_wayland(Some("wayland"), false));
    }
}
