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
