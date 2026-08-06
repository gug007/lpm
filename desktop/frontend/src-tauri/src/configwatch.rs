// Watches ~/.lpm for config edits made by *another* process, so multiple lpm
// instances on one machine (a dev build alongside the prod app) and any connected
// peers converge on external changes. The in-process `projects-changed` /
// `templates-changed` events are only emitted at this instance's own mutation
// sites, so a second instance's writes — or an edit from an editor/CLI — would
// otherwise go unseen. This bridges those filesystem edits back onto the same
// events; listeners are read-only refreshers, so self-echo from our own writes is
// harmless.
use crate::config;
use crate::configclassify::{fold_event, portable_settings_digest, settings_changed, Dirty};
use crate::syncsurface::sync_global_dirs;
use std::path::PathBuf;
use std::sync::mpsc::{sync_channel, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

const SETTLE: Duration = Duration::from_millis(500);

/// Start the watcher on a background thread. Non-fatal on failure (logged), like
/// socketsrv::start — the app still runs, external edits just won't propagate.
pub fn start(app: AppHandle) {
    let lpm = config::lpm_dir();
    // The synced dirs (memory among them) are created here rather than on first
    // write: notify can only watch a path that exists, and they are our own.
    let mut dirs = vec![lpm.clone(), config::projects_dir(), config::templates_dir()];
    dirs.extend(sync_global_dirs().map(|d| lpm.join(d)));
    for dir in &dirs {
        if let Err(e) = std::fs::create_dir_all(dir) {
            eprintln!(
                "warning: config watcher could not create {}: {e}",
                dir.display()
            );
            return;
        }
    }

    // FSEvents delivers canonical absolute paths; canonicalize the root so
    // strip_prefix matches (mirrors git.rs).
    let root = std::fs::canonicalize(&lpm).unwrap_or(lpm);
    let dirty = Arc::new(Mutex::new(Dirty::default()));
    let (tx, rx) = sync_channel::<()>(1);

    let cb_root = root.clone();
    let cb_dirty = dirty.clone();
    // Seeded before any watch is armed, so this read cannot produce an event. From
    // here on the digest belongs to the debounce thread alone.
    let settings_path = root.join("settings.json");
    let mut settings_cache = portable_settings_digest(&settings_path);
    let mut watcher =
        match notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            let Ok(ev) = res else { return };
            let d = fold_event(&cb_root, &ev);
            if d.any() {
                cb_dirty.lock().unwrap().merge(d);
                let _ = tx.try_send(());
            }
        }) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("warning: failed to start config watcher: {e}");
                return;
            }
        };

    use notify::{RecursiveMode, Watcher};
    let mut watches: Vec<(PathBuf, RecursiveMode)> = vec![
        (root.clone(), RecursiveMode::NonRecursive),
        (root.join("projects"), RecursiveMode::NonRecursive),
        (root.join("templates"), RecursiveMode::Recursive),
    ];
    watches.extend(sync_global_dirs().map(|d| (root.join(d), RecursiveMode::Recursive)));
    for (path, mode) in &watches {
        if let Err(e) = watcher.watch(path, *mode) {
            eprintln!(
                "warning: config watcher could not watch {}: {e}",
                path.display()
            );
            return;
        }
    }

    // Coalesce a burst (a peersync apply writes many files at once) into one emit
    // per category after ~500ms of quiet. The watcher is moved in so it lives as
    // long as this thread — i.e. the app's lifetime.
    std::thread::spawn(move || {
        let _watcher = watcher;
        loop {
            if rx.recv().is_err() {
                return;
            }
            let disconnected = loop {
                match rx.recv_timeout(SETTLE) {
                    Ok(()) => {}
                    Err(RecvTimeoutError::Timeout) => break false,
                    Err(RecvTimeoutError::Disconnected) => break true,
                }
            };
            let d = std::mem::take(&mut *dirty.lock().unwrap());
            // One read per quiet window at most, off the event thread, and still
            // gated so the constant window-bounds rewrites don't emit. Any event
            // this read generates is an open, which fold_event drops.
            let mut projects = d.projects;
            if d.settings {
                let new = portable_settings_digest(&settings_path);
                if settings_changed(settings_cache.as_deref(), new.as_deref()) {
                    projects = true;
                }
                settings_cache = new;
            }
            if projects {
                let _ = app.emit("projects-changed", ());
            }
            if d.templates {
                let _ = app.emit("templates-changed", ());
            }
            if d.sidebar {
                let _ = app.emit("sidebar-changed", ());
            }
            // One emit per memory folder that changed; the payload names the
            // folder's owner, which a pane on a duplicate matches against the
            // owner it already resolved.
            let memory_changed = !d.memory.is_empty();
            for project in d.memory {
                let _ = app.emit("memory-changed", project);
            }
            // Same debounced classification that emits the events also nudges the
            // auto-sync engine: a local config edit reconciles every auto-enabled
            // peer shortly after. A no-op until the engine is set up. Sidebar
            // changes don't participate — groups.json is off the sync surface.
            // Memory does: its own category classifies before the synced-dir arm,
            // so without this a session save would only sync when some unrelated
            // config edit happened to trigger a run.
            if projects || d.templates || memory_changed {
                if let Some(engine) = app.try_state::<crate::autosync::Engine>() {
                    engine.notify_local_change();
                }
            }
            if disconnected {
                return;
            }
        }
    });
}
