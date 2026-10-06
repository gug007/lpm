// Closing the main window hides it on every platform, so terminals and agents
// keep running. macOS brings it back from the Dock; Linux and Windows have no
// Dock, so launching lpm again shows the running instance's window instead, and
// quitting is an explicit action (Ctrl+Shift+Q or the app menu). An instance a
// second launch can't reach has no way back to a hidden window, so closing quits it.
#[cfg(not(target_os = "macos"))]
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::AppHandle;

#[cfg(not(target_os = "macos"))]
static RELAUNCH_REOPENS: AtomicBool = AtomicBool::new(false);

/// Quit for real: runs the RunEvent::Exit teardown in lib.rs, the same path as
/// the macOS app menu's Quit.
#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[cfg(not(target_os = "macos"))]
pub fn show_main(app: &AppHandle) {
    use tauri::Manager;
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

/// A second launch hands off to the running instance and exits. Skipped on a
/// headless host (no window to show, possibly no session bus) and for a
/// separate data directory, which is a separate instance by design.
#[cfg(not(target_os = "macos"))]
pub fn with_single_instance(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    let own_data_dir = std::env::var_os(crate::config::DIR_ENV).is_some_and(|v| !v.is_empty());
    // The plugin unwraps the bus address it parses, so a blank one would panic.
    let blank_bus = std::env::var_os("DBUS_SESSION_BUS_ADDRESS").is_some_and(|v| v.is_empty());
    if !hands_off(crate::sys::headless(), own_data_dir, blank_bus) {
        return builder;
    }
    RELAUNCH_REOPENS.store(true, Ordering::Relaxed);
    #[cfg(windows)]
    let builder = builder.plugin(crate::winhandoff::plugin());
    builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        show_main(app)
    }))
}

#[cfg(any(not(target_os = "macos"), test))]
fn hands_off(headless: bool, own_data_dir: bool, blank_bus: bool) -> bool {
    !(headless || own_data_dir || blank_bus)
}

/// Closing the main window hides it only when launching lpm again can show it
/// back; otherwise (its own data directory, no session bus) closing quits. A
/// headless host has no window to bring back and keeps running.
#[cfg(not(target_os = "macos"))]
pub fn close_quits() -> bool {
    !RELAUNCH_REOPENS.load(Ordering::Relaxed) && !crate::sys::headless()
}

#[cfg(not(target_os = "macos"))]
const HIDDEN_NOTICE_KEY: &str = "closeKeepsRunningNoticeShown";

/// The first close-to-hide gets a system notification: without a Dock icon the
/// window would otherwise just vanish with lpm still running. Once per machine.
#[cfg(not(target_os = "macos"))]
pub fn explain_hidden_once(app: &AppHandle) {
    use std::sync::atomic::{AtomicBool, Ordering};
    static SENT: AtomicBool = AtomicBool::new(false);
    if crate::sys::headless() || SENT.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let mut settings = crate::config::load_settings();
        let Some(obj) = settings.as_object_mut() else {
            return;
        };
        if obj.get(HIDDEN_NOTICE_KEY).and_then(|v| v.as_bool()) == Some(true) {
            return;
        }
        obj.insert(HIDDEN_NOTICE_KEY.into(), true.into());
        if crate::config::save_settings(&settings).is_err() {
            return;
        }
        crate::statusnotify::notify(
            &app,
            "lpm is still running",
            "Open lpm again to bring the window back. Ctrl+Shift+Q quits.",
        );
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_shared_desktop_instance_hands_off() {
        assert!(hands_off(false, false, false));
        assert!(!hands_off(true, false, false));
        assert!(!hands_off(false, true, false));
        assert!(!hands_off(false, false, true));
    }
}
