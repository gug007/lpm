// Prevents an extra console window on Windows in release — harmless on macOS.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // The session daemon is this same binary under a flag, so it can never
    // drift from the app's idea of the protocol and there is no second
    // executable to install or sign. It has to be decided here, before any of
    // the app starts: the daemon forks itself into its own session, and fork in
    // a process that has already spawned threads copies only the caller.
    match std::env::args().nth(1).as_deref() {
        Some(lpm_desktop_lib::DAEMON_ARG) => lpm_desktop_lib::run_session_daemon(),
        // Uninstall's "stop everything on this machine", which needs no app and
        // no CLI — the binary being removed can end its own work.
        Some(lpm_desktop_lib::STOP_SESSIONS_ARG) => lpm_desktop_lib::stop_sessions_and_exit(),
        _ => {}
    }
    lpm_desktop_lib::run();
}
