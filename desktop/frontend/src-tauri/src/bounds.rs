// Window-bounds helpers shared by the main window (mainwindow.rs) and detached
// windows (detached.rs): size validation + the physical->logical conversion
// (Tauri getters report physical pixels; builders/setters take logical).
use tauri::WebviewWindow;

pub const MIN_W: f64 = 700.0;
pub const MIN_H: f64 = 500.0;
pub const MAX_W: f64 = 7680.0;
pub const MAX_H: f64 = 4320.0;

pub fn valid_bounds(w: f64, h: f64) -> bool {
    w >= MIN_W && h >= MIN_H && w <= MAX_W && h <= MAX_H
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
