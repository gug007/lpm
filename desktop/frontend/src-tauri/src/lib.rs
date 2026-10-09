mod actions;
mod adopt;
mod agent_last_answer;
mod agent_last_answer_codex;
mod agent_limits;
mod agent_session_titles;
mod agent_sessions;
mod agent_sessions_claude;
mod agent_sessions_codex;
mod agent_usage;
mod agent_usage_claude;
mod agent_usage_codex;
mod agent_caps;
mod agentnest;
mod aigen;
mod autosync;
mod bounds;
mod browser;
mod claude_account_pin;
mod cli_install;
#[cfg(any(target_os = "linux", all(unix, test)))]
mod cli_install_linux;
#[cfg(any(windows, test))]
mod cli_install_windows;
mod claude_session_state;
mod clipboard;
mod codex_statusline;
mod commands_real;
mod config;
mod config_cmds;
mod config_edit;
mod configclassify;
mod configwatch;
#[cfg(any(windows, test))]
mod conptyreply;
mod control;
mod daemonize;
mod daemonlaunch;
mod detached;
mod detect;
#[cfg(any(windows, test))]
mod dirdelete;
mod dockmenu;
mod file_browser;
mod files;
mod firstlaunch;
mod fonts;
mod fsatomic;
mod fslink;
mod fsname;
mod fsperm;
mod generated_commands;
mod git;
mod gitignore;
mod gitorigin;
mod gitbring;
mod gitbringapply;
mod gitbringhost;
mod gitbringrun;
mod gitfollow;
mod gitfollowrun;
mod gitfollowstore;
mod gitpush;
mod gitsync;
mod gitwatchhost;
mod gitworkstate;
mod hookform;
mod hooks;
mod hostautoupdate;
mod ipc;
mod jobs;
#[cfg(any(target_os = "linux", test))]
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
mod kokoro_venv;
mod lesson;
mod lifecycle;
mod log_streaming;
mod mainwindow;
mod mdns;
mod mediacache;
mod mediahttp;
mod mediapeer;
mod mediaproto;
mod menu;
mod message_history;
mod msysmounts;
mod keepawake;
mod sleepwatch;
mod netif;
mod notes_blobs;
mod notes_cmds;
mod notes_store;
mod openin;
mod osproc;
#[cfg(any(windows, test))]
mod panestop;
mod peer;
mod peerclient;
mod peercopy;
mod peerdiscovery;
mod peeropen;
mod peerread;
mod peerssh;
mod peersshrun;
mod peersync;
mod peertls;
mod peertunnel;
mod peeruploadhost;
mod peeruploadrun;
mod phonefile;
mod portforward;
mod ports;
mod portsprobe;
#[cfg(any(windows, test))]
mod portsprobe_windows;
mod procinfo;
mod proctree;
mod procwin;
mod projects_crud;
mod pty;
mod pull_request;
mod ptymodes;
mod ptyring;
mod remote;
mod remotepresence;
mod remote_git_auto;
mod remote_machines;
mod remote_memory;
mod remote_notes;
mod remotessh;
mod remotestore;
mod remotetls;
#[cfg(windows)]
mod runjob;
mod send_later;
mod send_later_model;
mod services;
mod sessionclient;
mod sessiond;
mod sessionpane;
mod sessionproto;
mod sessions;
mod session_memory;
mod session_memory_files;
mod session_memory_scope;
mod shellpath;
mod skill_install;
mod skill_install_remote;
mod sockdeliver;
mod socketsrv;
mod sound;
mod sshconfig;
mod sshexec;
#[cfg(windows)]
mod sshjob;
mod sshprobe;
mod sshsync;
#[cfg(any(windows, test))]
mod sshsync_tar;
mod status;
mod statusfwd;
mod statusnotify;
#[cfg(any(windows, test))]
mod statusrelay;
mod syncstate;
mod syncsurface;
mod sys;
mod tailnet;
mod tailnet_cmds;
mod tailnet_dial;
mod templates;
mod termgrid;
mod termvt;
mod textinput;
mod tmuxmigrate;
mod transfer;
mod trash;
#[cfg(any(windows, test))]
mod treecopy;
mod openaitts;
mod secrets;
mod tts;
mod uninstall;
mod updatejob;
#[cfg(any(not(target_os = "macos"), test))]
mod updatenotice;
mod updates;
mod upload;
mod vault;
#[cfg(target_os = "macos")]
mod vaultkeychain;
#[cfg(windows)]
mod vaultcred;
#[cfg(all(unix, not(target_os = "macos")))]
mod vaultkeyfile;
mod voicetotext;
mod watchfilter;
mod webengine;
#[cfg(windows)]
mod wincred;
#[cfg(windows)]
mod winfocus;
#[cfg(windows)]
mod winhandoff;
#[cfg(windows)]
mod winpath;
mod zone_layers;
mod zones;

// Bring every command fn into scope so the generated `all_command_handlers!`
// macro (which lists them unqualified) resolves the hand-written real
// commands and the generated stubs.
use actions::*;
use agent_last_answer::*;
use agent_limits::*;
use agent_session_titles::*;
use agent_sessions::*;
use agent_usage::*;
use agent_caps::{
    create_agent_skill, delete_agent_skill, generate_agent_skill, list_agent_capabilities,
    preview_agent_skill_delete, read_agent_capability, update_agent_skill, write_agent_capability,
};
use aigen::*;
use browser::*;
use claude_account_pin::*;
use claude_session_state::*;
use cli_install::*;
use clipboard::*;
use codex_statusline::*;
use commands_real::*;
use config_cmds::*;
use control::*;
use detached::*;
use file_browser::*;
use files::*;
use fonts::*;
#[allow(unused_imports)]
use generated_commands::*;
use git::*;
use pull_request::*;
use gitfollow::{follow_list, follow_pause, follow_resume, follow_stop};
use gitorigin::git_origin_status;
use gitpush::git_push_rebasing;
use gitsync::{sync_project_cancel, sync_project_start};
use hooks::*;
use jobs::*;
use lesson::*;
use lifecycle::quit_app;
use log_streaming::*;
use mediahttp::media_http_base;
use message_history::*;
use msysmounts::get_msys_mounts;
use notes_cmds::*;
use openin::*;
use peer::{
    peer_dispatch_reply, peer_host_cancel_pairing, peer_host_respond_pairing,
    peer_host_revoke_device, peer_host_set_config, peer_host_start_pairing, peer_state,
};
use peerclient::{
    peer_add, peer_add_ssh_host, peer_invoke, peer_pair_cancel, peer_pair_request, peer_reconnect,
    peer_remote_pair, peer_remove, peer_set_alias, peer_set_auto_sync, peer_set_enabled,
    peer_sync_run, peer_sync_status, peer_term_attach, peer_term_detach, peer_uninstall_host,
    peer_update_host,
};
use peerdiscovery::{peer_discovery_start, peer_discovery_stop};
use peeruploadrun::peer_upload_file;
use portforward::*;
use ports::*;
use projects_crud::*;
use pty::*;
use remote::*;
use send_later::*;
use services::*;
use session_memory_files::{
    delete_memory_session, read_memory_sessions, rename_memory_session, write_memory_session,
};
use skill_install::*;
use sound::*;
use sshconfig::*;
use status::*;
use statusnotify::notify_unattended;
use tailnet_cmds::{tailnet_set_enabled, tailnet_sign_in, tailnet_sign_out, tailnet_state};
use tauri::Manager;
use templates::*;
use transfer::*;
use tts::*;
use uninstall::*;
use updates::*;
use upload::*;
use voicetotext::*;

/// The argument that turns this binary into the session daemon (sessiond.rs)
/// rather than the app. main.rs checks for it before anything else starts.
pub use crate::sessiond::DAEMON_ARG;

/// Become the session daemon and never return. See sessiond.rs for why the
/// daemon is this binary re-exec'd rather than a separate one.
pub fn run_session_daemon() -> ! {
    sessiond::run()
}

/// The argument that stops every service and retires the daemon. For uninstall,
/// which is the one moment lpm is supposed to end the work it started.
pub const STOP_SESSIONS_ARG: &str = "--stop-sessions";

/// Stop every service on this machine and exit. Prints nothing on success so it
/// composes in a shell script; a real failure goes to stderr with status 1.
pub fn stop_sessions_and_exit() -> ! {
    match sessions::shutdown_daemon() {
        Ok(()) => std::process::exit(0),
        Err(error) => {
            eprintln!("lpm: could not stop services: {error}");
            std::process::exit(1)
        }
    }
}

/// The argument the Windows uninstaller runs before deleting the app: the hooks
/// lpm wrote call the CLI beside the app by absolute path, so they have to go
/// with it rather than fail in every agent session afterwards.
#[cfg(windows)]
pub const REMOVE_AGENT_HOOKS_ARG: &str = "--remove-agent-hooks";

/// Run by the Windows uninstaller when an installer upgrades lpm: take out only
/// the agent hook entries that point at the exe about to be deleted. Services,
/// the CLI copy and skills stay; the newer lpm puts the hooks back on its first
/// start.
#[cfg(windows)]
pub fn remove_agent_hooks_and_exit() -> ! {
    hooks::remove_agent_hook_entries();
    let _ = session_memory::remove_for_uninstall();
    std::process::exit(0)
}

/// The argument the Windows uninstaller runs instead when lpm is being removed
/// rather than upgraded.
#[cfg(windows)]
pub const UNINSTALL_ARG: &str = "--uninstall";

/// Stop every service, then take out what Settings > Remove app would: hooks,
/// skills, and the CLI copy with its Path entry.
#[cfg(windows)]
pub fn uninstall_and_exit() -> ! {
    let stopped = sessions::shutdown_daemon();
    uninstall::remove_footprint();
    std::process::exit(i32::from(stopped.is_err()))
}

// The attribute belongs to `run` — it is the app's entry point. Anything added
// above must stay above this line.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    webengine::prepare_linux_env();

    // Finder-launched apps have a minimal PATH; restore Homebrew locations so
    // ssh/git/gh lookups work (matches the Go app's tmux.init()).
    sys::ensure_path();
    #[cfg(windows)]
    sys::drop_unusable_std_handles();
    #[cfg(windows)]
    sys::keep_std_handles_from_children();

    // Turn off macOS smart substitutions before any webview is created so the
    // composer never rewrites typed text (e.g. double space -> ". ").
    textinput::disable_smart_substitutions();

    // Both peer roles share one ~/.lpm/peer.json behind a single in-memory lock:
    // the host device list (peer.rs) and the client peer list (peerclient.rs).
    let peer_hub = peer::PeerHub::default();
    let peer_client_hub = peerclient::PeerClientHub::new(peer_hub.config_arc());

    let builder = tauri::Builder::default();
    #[cfg(not(target_os = "macos"))]
    let builder = lifecycle::with_single_instance(builder);

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .register_asynchronous_uri_scheme_protocol(mediaproto::SCHEME, mediaproto::handle)
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
        .manage(std::sync::Arc::new(send_later::SendLaterStore::default()))
        .manage(updates::UpdateState::default())
        .manage(tts::TtsState::default())
        .manage(portforward::PortFwdState::default())
        .manage(statusfwd::StatusFwdState::default())
        .manage(sshsync::SyncState::default())
        .manage(browser::BrowserState::default())
        .manage(remote::RemoteHub::default())
        .manage(lesson::LessonState::default())
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
                    #[cfg(not(target_os = "macos"))]
                    if lifecycle::close_quits() {
                        window.app_handle().exit(0);
                        return;
                    }
                    let _ = window.hide();
                    #[cfg(not(target_os = "macos"))]
                    lifecycle::explain_hidden_once(window.app_handle());
                }
            }
        })
        .setup(|app| {
            firstlaunch::seed_global_actions();
            let handle = app.handle().clone();
            lesson::start(handle.clone());
            #[cfg(target_os = "macos")]
            if let Err(e) = menu::build_and_set(&handle) {
                eprintln!("warning: failed to set app menu: {e}");
            }
            dockmenu::install(&handle);
            // Restore the saved main-window bounds, then persist on move/resize.
            if let Some(win) = handle.get_webview_window("main") {
                webengine::harden(&win);
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
            // Keep each SSH host's `ssh -R` status forward alive for as long as it
            // has a live pane — without it a dropped forward silently ends remote
            // agent status (and its sound) for the rest of the session.
            statusfwd::start_watchdog(handle.clone());

            // Watch ~/.lpm so config edits by another lpm instance or an external
            // editor re-emit projects-changed / templates-changed here.
            configwatch::start(handle.clone());

            // Live usage-limit meters: scan Codex's newest rollout and watch
            // ~/.codex/sessions; Claude limits arrive via the statusline
            // forwarder over the status socket once the user opts in.
            agent_limits::start(handle.clone());

            // Built-in Tailscale node, when it is switched on: the mobile and
            // peer servers below point their ports at it as they start.
            tailnet::start(&handle);

            // Mobile remote-control server (the phone app connects here). Reads
            // its own ~/.lpm/remote.json; a no-op until enabled + paired.
            let hub = app.state::<remote::RemoteHub>().inner().clone();
            remote::start(hub.clone(), handle.clone());
            sleepwatch::start(move || remote::farewell(&hub, "sleep"));

            // Peer host + client servers (Mac-to-Mac control). Load the shared
            // ~/.lpm/peer.json once into the lock both roles hold, then start the
            // host listener and open a connection for every enabled peer.
            let peer_hub = app.state::<peer::PeerHub>().inner().clone();
            *peer_hub.config_arc().lock().unwrap() = peer::load_config();
            peer::start(peer_hub, handle.clone());
            let peer_client_hub = app.state::<peerclient::PeerClientHub>().inner().clone();
            hostautoupdate::start(peer_client_hub.clone());
            peerclient::start(peer_client_hub.clone(), handle.clone());
            // Per-peer auto-sync engine: drives the same sync path unattended when
            // a peer has auto-sync on. Managed so the config watcher and the peer
            // client can nudge it; runs on its own scheduler + anti-entropy threads.
            let autosync = autosync::Engine::new(std::sync::Arc::new(peer_client_hub.clone()));
            autosync.start();
            app.manage(autosync);
            // Followed projects: polls each one's Mac for a cheap working-state
            // fingerprint and lands a transfer only when it changed.
            let follow = gitfollow::Engine::new(handle.clone(), peer_client_hub);
            follow.start();
            app.manage(follow);

            // A lesson recording runs on a throwaway data directory and has to
            // leave the rest of the machine alone: nothing below that writes into
            // the user's own Claude/Codex setup, CLI symlink or tmux runs there.
            let chores = !lesson::active();

            // Install agent status hooks (Claude Code / Codex) so they report to
            // the socket. Backgrounded — touches files, never blocks startup.
            if chores {
                std::thread::spawn(hooks::install_agent_hooks);
            }

            // Silently refresh what the user already opted into installing:
            // stale agent skills and active status-line presets get re-written,
            // and a stale CLI symlink gets repointed. Foreign installs stay alone.
            // On a headless host the skills are installed here outright — there
            // is no pane to opt in from; see refresh_at_startup.
            std::thread::spawn(move || {
                if chores {
                    skill_install::refresh_at_startup();
                    cli_install::repair_symlink_quietly();
                    hooks::reapply_claude_limits_if_enabled();
                    hooks::refresh_active_claude_statusline_template();
                }
                session_memory::cleanup_at_startup();
                session_memory_scope::adopt_duplicate_memory_at_startup();
            });

            // Check for updates on startup, then every 24h while the app runs
            // (the window may be hidden). The Sidebar also pulls on mount, so the
            // launch notification never depends on the startup emit's timing.
            // A lesson recording must not surface an update banner mid-video.
            if chores {
                updates::start_auto_check(handle.clone());
            }

            // Scheduled-jobs runner: a wall-clock tick that fires per-project
            // jobs on their schedule. Same sleep-survival model as the updater.
            jobs::start_scheduler(handle.clone());

            // Prompts scheduled to send later: owns the list and the clock that
            // marks each one due or missed; the main window does the sending.
            send_later::start(handle.clone());

            // Backgrounded startup chores: reap stale clipboard image temp files,
            // drop sync caches for deleted projects, and resume port pollers for
            // remote projects whose session is still alive. All touch the
            // filesystem or the session daemon, so off the main thread.
            let h2 = handle.clone();
            std::thread::spawn(move || {
                // Before anything else on this thread: services left running by
                // the tmux-era build are invisible to this one, and a start
                // would collide with the ports they still hold.
                if chores {
                    tmuxmigrate::run_once();
                }
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
                pty::kill_all_trees(&app.state::<pty::PtyState>()); // reap in-app terminal trees (services stay up)
                tts::stop_on_exit(app); // kill any suspended python TTS child
                portforward::stop_all_forwards(app); // kill ssh -L tunnels + pollers
                statusfwd::stop_all(app); // kill ssh -R status forwards
                sshsync::stop_all_sync_watchers(app); // drop rsync mirror watchers
                remote::farewell(&app.state::<remote::RemoteHub>(), "quit"); // tell phones lpm is closing
                remote::stop(&app.state::<remote::RemoteHub>()); // retire the mobile server threads
                app.state::<autosync::Engine>().stop(); // retire the auto-sync scheduler
                app.state::<gitfollow::Engine>().stop(); // retire the follow scheduler
                peer::stop(&app.state::<peer::PeerHub>()); // retire the peer host threads
                peerclient::stop(&app.state::<peerclient::PeerClientHub>()); // drop peer client conns
                tailnet::stop(); // take the built-in Tailscale node offline
                keepawake::set(false); // let this machine sleep again
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
