mod actions;
mod aigen;
mod browser;
mod clipboard;
mod commands_real;
mod config;
mod config_cmds;
mod detached;
mod dockmenu;
mod files;
mod generated_commands;
mod git;
mod hooks;
mod log_streaming;
mod menu;
mod notes_blobs;
mod notes_cmds;
mod notes_store;
mod openin;
mod portforward;
mod ports;
mod projects_crud;
mod pty;
mod services;
mod socketsrv;
mod sshconfig;
mod sshsync;
mod status;
mod sys;
mod templates;
mod tmux;
mod transfer;
mod tts;
mod updates;
mod upload;
mod vault;

// Bring every command fn into scope so the generated `all_command_handlers!`
// macro (which lists them unqualified) resolves the hand-written real
// commands and the generated stubs.
use actions::*;
use aigen::*;
use browser::*;
use clipboard::*;
use commands_real::*;
use config_cmds::*;
use detached::*;
use files::*;
use git::*;
use hooks::*;
use log_streaming::*;
use notes_cmds::*;
use openin::*;
use portforward::*;
use ports::*;
use projects_crud::*;
use pty::*;
use services::*;
use sshconfig::*;
use status::*;
use tauri::Manager;
use transfer::*;
use tts::*;
use updates::*;
use upload::*;
use templates::*;
#[allow(unused_imports)]
use generated_commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Finder-launched apps have a minimal PATH; restore Homebrew locations so
    // tmux/ssh/git/gh lookups work (matches the Go app's tmux.init()).
    sys::ensure_path();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(pty::PtyState::default())
        .manage(services::ServiceState::default())
        .manage(log_streaming::LogState::default())
        .manage(git::WatchState::default())
        .manage(detached::DetachedState::default())
        .manage(notes_cmds::NotesState::default())
        .manage(std::sync::Arc::new(status::StatusStore::new()))
        .manage(updates::UpdateState::default())
        .manage(tts::TtsState::default())
        .manage(portforward::PortFwdState::default())
        .manage(sshsync::SyncState::default())
        .manage(browser::BrowserState::default())
        .on_menu_event(menu::handle_event)
        .on_window_event(|window, event| {
            // Closing the main window hides it instead of quitting, so terminals,
            // port forwards, sync watchers and the status socket keep running
            // (matches the Wails app). Detached project windows close normally.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();
            if let Err(e) = menu::build_and_set(&handle) {
                eprintln!("warning: failed to set app menu: {e}");
            }
            dockmenu::install(&handle);
            // Restore the saved main-window size (settings.windowWidth/Height).
            if let Some(win) = handle.get_webview_window("main") {
                let s = config::load_settings();
                let g = |k: &str| s.get(k).and_then(|v| v.as_i64());
                if let (Some(w), Some(h)) = (g("windowWidth"), g("windowHeight")) {
                    if w >= 700 && h >= 500 && w <= 7680 && h <= 4320 {
                        let _ = win.set_size(tauri::LogicalSize::new(w as f64, h as f64));
                    }
                }
            }
            // Reopen any windows that were detached when the app last closed.
            let state = app.state::<detached::DetachedState>();
            detached::restore_impl(&handle, &state);

            // Status socket server (agents in panes report status here) + the
            // dead-PID sweep. Both run on background threads.
            let store = app.state::<std::sync::Arc<status::StatusStore>>().inner().clone();
            socketsrv::start(config::socket_path(), store.clone(), handle.clone());
            status::start_pid_sweep(store, handle.clone());

            // Install agent status hooks (Claude Code / Codex) so they report to
            // the socket. Backgrounded — touches files, never blocks startup.
            std::thread::spawn(hooks::install_agent_hooks);

            // Backgrounded startup chores: drop sync caches for deleted projects
            // and resume port pollers for remote projects whose tmux session is
            // still alive. Both read configs/tmux, so off the main thread.
            let h2 = handle.clone();
            std::thread::spawn(move || {
                sshsync::prune_orphan_sync_dirs(&config::project_names().into_iter().collect());
                portforward::resume_port_pollers(&h2);
            });
            Ok(())
        })
        .invoke_handler(crate::all_command_handlers!())
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            tauri::RunEvent::Exit => {
                tts::stop_on_exit(app); // kill any suspended python TTS child
                portforward::stop_all_forwards(app); // kill ssh -L tunnels + pollers
                sshsync::stop_all_sync_watchers(app); // drop rsync mirror watchers
                let _ = std::fs::remove_file(config::socket_path());
            }
            // Dock-icon click with no visible window restores the hidden main
            // window — otherwise it would stay hidden after the close button.
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { has_visible_windows, .. } => {
                if !has_visible_windows {
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
            }
            _ => {}
        });
}
