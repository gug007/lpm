// The interface size: a zoom on every page lpm draws itself (its windows and
// the pages popups show), remembered per computer in settings.json. Browser
// panes show other sites and keep their own size. Every window applies the
// saved size when it starts; a change made in one reaches the others here.
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime, Webview};

/// The sizes Settings offers, smallest first.
const SIZES: [f64; 4] = [0.9, 1.0, 1.1, 1.25];

/// Every window learns the size in effect, so its own measurements follow.
const EVENT: &str = "interface-size";

static ZOOM: Mutex<f64> = Mutex::new(1.0);

/// The offered size nearest `size`; anything unreadable is 100%.
fn snap(size: f64) -> f64 {
    if !size.is_finite() {
        return 1.0;
    }
    SIZES
        .iter()
        .copied()
        .min_by(|a, b| (a - size).abs().total_cmp(&(b - size).abs()))
        .unwrap_or(1.0)
}

/// A page lpm drew: a window of its own or a popup's page, never a browser pane.
fn own_page(label: &str) -> bool {
    label == "main"
        || label == crate::quicktermwin::LABEL
        || label.starts_with(crate::detached::LABEL_PREFIX)
        || label.starts_with(crate::popup_view::PREFIX)
}

fn current() -> f64 {
    *ZOOM.lock().unwrap_or_else(|e| e.into_inner())
}

/// A popup's page opens at the size the window around it is drawn at.
pub(crate) fn zoom_new<R: Runtime>(webview: &Webview<R>) {
    let zoom = current();
    if zoom != 1.0 {
        let _ = webview.set_zoom(zoom);
    }
}

/// Draw every page lpm owns at `size` and answer with the size applied. A
/// window starting up asks for the size already in effect: only it is drawn.
#[tauri::command(async)]
pub fn set_interface_size(app: AppHandle, webview: Webview, size: f64) -> f64 {
    let zoom = snap(size);
    let was = std::mem::replace(&mut *ZOOM.lock().unwrap_or_else(|e| e.into_inner()), zoom);
    if was == zoom {
        let _ = webview.set_zoom(zoom);
        return zoom;
    }
    for (label, webview) in app.webviews() {
        if own_page(&label) {
            let _ = webview.set_zoom(zoom);
        }
    }
    let _ = app.emit(EVENT, zoom);
    zoom
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snaps_to_an_offered_size() {
        assert_eq!(snap(1.0), 1.0);
        assert_eq!(snap(1.12), 1.1);
        assert_eq!(snap(1.2), 1.25);
        assert_eq!(snap(3.0), 1.25);
        assert_eq!(snap(0.5), 0.9);
        assert_eq!(snap(f64::NAN), 1.0);
        assert_eq!(snap(f64::INFINITY), 1.0);
    }

    #[test]
    fn zooms_only_pages_lpm_draws() {
        assert!(own_page("main"));
        assert!(own_page("quick-terminal"));
        assert!(own_page("detached-saas-app"));
        assert!(own_page("popup-a1b2"));
        assert!(own_page("popup-tab-a1b2"));
        assert!(!own_page("browser-1"));
        assert!(!own_page("mainly"));
    }
}
