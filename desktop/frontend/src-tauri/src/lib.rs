mod actions;
mod agent_limits;
mod agent_usage;
mod aigen;
mod bounds;
mod browser;
mod cli_install;
mod clipboard;
mod codex_statusline;
mod commands_real;
mod config;
mod config_cmds;
mod config_edit;
mod configwatch;
mod control;
mod detached;
mod dockmenu;
mod files;
mod fsatomic;
mod generated_commands;
mod git;
mod hooks;
mod jobs;
mod log_streaming;
mod mainwindow;
mod mdns;
mod menu;
mod message_history;
mod notes_blobs;
mod notes_cmds;
mod notes_store;
mod openin;
mod peer;
mod peerclient;
mod peersync;
mod portforward;
mod ports;
mod proctree;
mod projects_crud;
mod pty;
mod remote;
mod remotetls;
mod services;
mod skill_install;
mod socketsrv;
mod sound;
mod sshconfig;
mod sshexec;
mod sshsync;
mod status;
mod statusfwd;
mod syncstate;
mod syncsurface;
mod sys;
mod templates;
mod textinput;
mod tmux;
mod transfer;
mod tts;
mod updates;
mod upload;
mod vault;
mod voicetotext;

// Bring every command fn into scope so the generated `all_command_handlers!`
// macro (which lists them unqualified) resolves the hand-written real
// commands and the generated stubs.
use actions::*;
use agent_limits::*;
use agent_usage::*;
use aigen::*;
use browser::*;
use cli_install::*;
use clipboard::*;
use codex_statusline::*;
use commands_real::*;
use config_cmds::*;
use control::*;
use detached::*;
use files::*;
#[allow(unused_imports)]
use generated_commands::*;
use git::*;
use hooks::*;
use jobs::*;
use log_streaming::*;
use message_history::*;
use notes_cmds::*;
use openin::*;
use peer::{
    peer_dispatch_reply, peer_host_cancel_pairing, peer_host_revoke_device, peer_host_set_config,
    peer_host_start_pairing, peer_state,
};
use peerclient::{
    peer_add, peer_invoke, peer_remove, peer_set_enabled, peer_sync_run, peer_sync_status,
    peer_term_attach, peer_term_detach,
};
use portforward::*;
use ports::*;
use projects_crud::*;
use pty::*;
use remote::*;
use services::*;
use skill_install::*;
use sound::*;
use sshconfig::*;
use status::*;
use tauri::Manager;
use templates::*;
use transfer::*;
use tts::*;
use updates::*;
use upload::*;
use voicetotext::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Finder-launched apps have a minimal PATH; restore Homebrew locations so
    // tmux/ssh/git/gh lookups work (matches the Go app's tmux.init()).
    sys::ensure_path();

    // Turn off macOS smart substitutions before any webview is created so the
    // composer never rewrites typed text (e.g. double space -> ". ").
    textinput::disable_smart_substitutions();

    // Both peer roles share one ~/.lpm/peer.json behind a single in-memory lock:
    // the host device list (peer.rs) and the client peer list (peerclient.rs).
    let peer_hub = peer::PeerHub::default();
    let peer_client_hub = peerclient::PeerClientHub::new(peer_hub.config_arc());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(pty::PtyState::default())
        .manage(services::ServiceState::default())
        .manage(log_streaming::LogState::default())
        .manage(git::WatchState::default())
        .manage(detached::DetachedState::default())
        .manage(control::ControlState::default())
        .manage(notes_cmds::NotesState::default())
        .manage(message_history::MessageHistoryState::default())
        .manage(std::sync::Arc::new(status::StatusStore::new()))
        .manage(std::sync::Arc::new(agent_limits::AgentLimitsStore::new()))
        .manage(updates::UpdateState::default())
        .manage(tts::TtsState::default())
        .manage(portforward::PortFwdState::default())
        .manage(statusfwd::StatusFwdState::default())
        .manage(sshsync::SyncState::default())
        .manage(browser::BrowserState::default())
        .manage(remote::RemoteHub::default())
        .manage(peer_hub.clone())
        .manage(peer_client_hub)
        .on_menu_event(menu::handle_event)
        .on_window_event(|window, event| {
            // Closing the main window hides it instead of quitting, so terminals,
            // port forwards, sync watchers and the status socket keep running
            // (matches the Wails app). Detached project windows close normally.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    mainwindow::persist_now(window.app_handle());
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
            // Restore the saved main-window bounds, then persist on move/resize.
            if let Some(win) = handle.get_webview_window("main") {
                mainwindow::restore(&win);
                mainwindow::attach(&win);
            }
            // Reopen any windows that were detached when the app last closed.
            let state = app.state::<detached::DetachedState>();
            detached::restore_impl(&handle, &state);

            // Status socket server (agents in panes report status here) + the
            // dead-PID sweep. Both run on background threads.
            let store = app
                .state::<std::sync::Arc<status::StatusStore>>()
                .inner()
                .clone();
            socketsrv::start(config::socket_path(), store.clone(), handle.clone(), false);
            // Second, restricted socket that SSH hosts reach over `ssh -R` — status
            // verbs only, so a remote host can never control the Mac.
            socketsrv::start(
                config::remote_socket_path(),
                store.clone(),
                handle.clone(),
                true,
            );
            status::start_pid_sweep(store, handle.clone());

            // Watch ~/.lpm so config edits by another lpm instance or an external
            // editor re-emit projects-changed / templates-changed here.
            configwatch::start(handle.clone());

            // Live usage-limit meters: scan Codex's newest rollout and watch
            // ~/.codex/sessions; Claude limits arrive via the statusline
            // forwarder over the status socket once the user opts in.
            agent_limits::start(handle.clone());

            // Mobile remote-control server (the phone app connects here). Reads
            // its own ~/.lpm/remote.json; a no-op until enabled + paired.
            let hub = app.state::<remote::RemoteHub>().inner().clone();
            remote::start(hub, handle.clone());

            // Peer host + client servers (Mac-to-Mac control). Load the shared
            // ~/.lpm/peer.json once into the lock both roles hold, then start the
            // host listener and open a connection for every enabled peer.
            let peer_hub = app.state::<peer::PeerHub>().inner().clone();
            *peer_hub.config_arc().lock().unwrap() = peer::load_config();
            peer::start(peer_hub, handle.clone());
            let peer_client_hub = app.state::<peerclient::PeerClientHub>().inner().clone();
            peerclient::start(peer_client_hub, handle.clone());

            // Install agent status hooks (Claude Code / Codex) so they report to
            // the socket. Backgrounded — touches files, never blocks startup.
            std::thread::spawn(hooks::install_agent_hooks);

            // Silently refresh what the user already opted into installing:
            // stale agent skills and active status-line presets get re-written,
            // and a stale CLI symlink gets repointed. Foreign installs stay alone.
            std::thread::spawn(|| {
                skill_install::refresh_if_outdated();
                cli_install::repair_symlink_quietly();
                hooks::reapply_claude_limits_if_enabled();
                hooks::refresh_active_claude_statusline_template();
            });

            // Check for updates on startup, then every 24h while the app runs
            // (the window may be hidden). The Sidebar also pulls on mount, so the
            // launch notification never depends on the startup emit's timing.
            updates::start_auto_check(handle.clone());

            // Scheduled-jobs runner: a wall-clock tick that fires per-project
            // jobs on their schedule. Same sleep-survival model as the updater.
            jobs::start_scheduler(handle.clone());

            // Backgrounded startup chores: reap stale clipboard image temp files,
            // drop sync caches for deleted projects, and resume port pollers for
            // remote projects whose tmux session is still alive. All touch the
            // filesystem/tmux, so off the main thread.
            let h2 = handle.clone();
            std::thread::spawn(move || {
                clipboard::reap_stale_clipboard_images();
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
                mainwindow::persist_now(app); // capture the final window bounds before teardown
                tts::stop_on_exit(app); // kill any suspended python TTS child
                portforward::stop_all_forwards(app); // kill ssh -L tunnels + pollers
                statusfwd::stop_all(app); // kill ssh -R status forwards
                sshsync::stop_all_sync_watchers(app); // drop rsync mirror watchers
                remote::stop(&app.state::<remote::RemoteHub>()); // retire the mobile server threads
                peer::stop(&app.state::<peer::PeerHub>()); // retire the peer host threads
                peerclient::stop(&app.state::<peerclient::PeerClientHub>()); // drop peer client conns
                let _ = std::fs::remove_file(config::socket_path());
                let _ = std::fs::remove_file(config::remote_socket_path());
            }
            // Dock-icon click with no visible window restores the hidden main
            // window — otherwise it would stay hidden after the close button.
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen {
                has_visible_windows,
                ..
            } => {
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
