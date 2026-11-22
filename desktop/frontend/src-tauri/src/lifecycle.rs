// Closing the main window hides it on every platform, so terminals and agents
// keep running. macOS brings it back from the Dock; Linux and Windows have no
// Dock, so launching lpm again shows the running instance's window instead, and
// quitting is an explicit action (Ctrl+Shift+Q or the app menu). An instance a
// second launch can't reach has no way back to a hidden window, so closing quits it.
#[cfg(not(target_os = "macos"))]
use std::sync::atomic::AtomicBool;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[cfg(not(target_os = "macos"))]
static RELAUNCH_REOPENS: AtomicBool = AtomicBool::new(false);

static QUIT_ASKED: AtomicU64 = AtomicU64::new(0);
static QUIT_HEARD: AtomicU64 = AtomicU64::new(0);

/// How long the window gets to take a quit request before lpm quits anyway, so
/// a hung or still-loading window can never keep ⌘Q from working.
const QUIT_HEARD_WITHIN: Duration = Duration::from_secs(2);

/// Everything quitting ends, run on RunEvent::Exit. Services live in the session
/// daemon and keep running. `farewell` tells phones lpm is closing; an update
/// leaves it out, since they expect lpm back.
pub fn teardown(app: &AppHandle, farewell: bool) {
    use crate::{
        agentexit, autosync, gitfollow, ignoredkeep, keepawake, mainwindow, peer, peerclient,
        portforward, pty, remote, socketsrv, sshsync, statusfwd, tailnet, telegrampoll, tts,
    };
    use tauri::Manager;
    mainwindow::persist_now(app); // capture the final window bounds before teardown
    agentexit::stop(); // the agents dying below are not the user quitting them
    if farewell {
        remote::farewell(&app.state::<remote::RemoteHub>(), "quit"); // before the terminals end
    }
    pty::kill_all_trees(&app.state::<pty::PtyState>()); // reap in-app terminal trees (services stay up)
    tts::stop_on_exit(app); // kill any suspended python TTS child
    portforward::stop_on_exit(app); // kill ssh -L tunnels + pollers
    statusfwd::stop_all(app); // kill ssh -R status forwards
    sshsync::stop_all_sync_watchers(app); // drop rsync mirror watchers
    remote::stop(&app.state::<remote::RemoteHub>()); // retire the mobile server threads
    app.state::<autosync::Engine>().stop(); // retire the auto-sync scheduler
    app.state::<gitfollow::Engine>().stop(); // retire the follow scheduler
    app.state::<ignoredkeep::Engine>().stop(); // stop keeping files in step
    peer::stop(&app.state::<peer::PeerHub>()); // retire the peer host threads
    peerclient::stop(&app.state::<peerclient::PeerClientHub>()); // drop peer client conns
    tailnet::stop(); // take the built-in Tailscale node offline
    keepawake::release(); // let this machine sleep again
    telegrampoll::stop(); // stop reading Telegram for answers
    socketsrv::release();
}

/// Quit for real: runs `teardown` through RunEvent::Exit.
#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// The app menu's Quit: the window checks for agents still at work and asks
/// before ending them (quitGuard.ts), then calls `quit_app`.
pub fn request_quit(app: &AppHandle) {
    let seq = QUIT_ASKED.fetch_add(1, Ordering::SeqCst) + 1;
    show_main(app);
    let _ = app.emit("menu-quit", seq);
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(QUIT_HEARD_WITHIN);
        if QUIT_HEARD.load(Ordering::SeqCst) < seq {
            app.exit(0);
        }
    });
}

/// The window took quit request `seq` and decides from here.
#[tauri::command]
pub fn quit_request_heard(seq: u64) {
    QUIT_HEARD.fetch_max(seq, Ordering::SeqCst);
}

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
