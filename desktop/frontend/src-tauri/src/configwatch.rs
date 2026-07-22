// Watches ~/.lpm for config edits made by *another* process, so multiple lpm
// instances on one machine (a dev build alongside the prod app) and any connected
// peers converge on external changes. The in-process `projects-changed` /
// `templates-changed` events are only emitted at this instance's own mutation
// sites, so a second instance's writes — or an edit from an editor/CLI — would
// otherwise go unseen. This bridges those filesystem edits back onto the same
// events; listeners are read-only refreshers, so self-echo from our own writes is
// harmless.
use crate::syncsurface::{is_sync_global_dir, is_sync_global_file, sync_global_dirs};
use crate::{config, peersync};
use std::path::{Component, Path, PathBuf};
use std::sync::mpsc::{sync_channel, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const SETTLE: Duration = Duration::from_millis(500);

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Category {
    Projects,
    Templates,
    // settings.json under ~/.lpm: a projects-category file, but its writes are
    // gated on a real portable-digest change (window drags rewrite it constantly).
    Settings,
}

#[derive(Default)]
struct Dirty {
    projects: bool,
    templates: bool,
}

/// Map a filesystem event path to the config category it affects, or `None` when
/// the path is outside the watched surface. The global file/dir lists come from
/// syncsurface so this can't drift from what config sync actually mirrors. Pure
/// over `lpm` and the event path so it can be unit-tested without the filesystem.
fn classify(lpm: &Path, path: &Path) -> Option<Category> {
    let rel = path.strip_prefix(lpm).ok()?;
    let segs: Vec<&str> = rel
        .components()
        .filter_map(|c| match c {
            Component::Normal(s) => s.to_str(),
            _ => None,
        })
        .collect();
    match segs.as_slice() {
        [name] if *name == "settings.json" => Some(Category::Settings),
        [name] => is_sync_global_file(name).then_some(Category::Projects),
        ["projects", file] => file.ends_with(".yml").then_some(Category::Projects),
        ["templates", ..] => Some(Category::Templates),
        [dir, ..] if is_sync_global_dir(dir) => Some(Category::Projects),
        _ => None,
    }
}

/// Whether a settings.json event changed portable content. `prev`/`new` are the
/// cached and freshly computed portable digests (`None` = file unreadable/absent
/// or un-parseable), so a repeated read failure (`None`→`None`) is correctly no
/// change while a real `Some`→`None` transition is. The caller updates the cache
/// to `new` regardless of the result.
fn settings_changed(prev: Option<&str>, new: Option<&str>) -> bool {
    prev != new
}

fn portable_settings_digest(path: &Path) -> Option<String> {
    peersync::settings_digest(&std::fs::read(path).ok()?).ok()
}

/// Start the watcher on a background thread. Non-fatal on failure (logged), like
/// socketsrv::start — the app still runs, external edits just won't propagate.
pub fn start(app: AppHandle) {
    let lpm = config::lpm_dir();
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

    // The callback is the sole owner of the settings-digest cache, so a captured
    // mutable local (recommended_watcher takes an FnMut) suffices — no Arc/Mutex.
    let cb_root = root.clone();
    let cb_dirty = dirty.clone();
    let mut settings_cache = portable_settings_digest(&root.join("settings.json"));
    let mut watcher =
        match notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            let Ok(ev) = res else { return };
            let (mut projects, mut templates) = (false, false);
            for p in &ev.paths {
                match classify(&cb_root, p) {
                    Some(Category::Projects) => projects = true,
                    Some(Category::Templates) => templates = true,
                    Some(Category::Settings) => {
                        let new = portable_settings_digest(p);
                        if settings_changed(settings_cache.as_deref(), new.as_deref()) {
                            projects = true;
                        }
                        settings_cache = new;
                    }
                    None => {}
                }
            }
            if projects || templates {
                let mut d = cb_dirty.lock().unwrap();
                d.projects |= projects;
                d.templates |= templates;
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
            if d.projects {
                let _ = app.emit("projects-changed", ());
            }
            if d.templates {
                let _ = app.emit("templates-changed", ());
            }
            if disconnected {
                return;
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lpm() -> PathBuf {
        PathBuf::from("/Users/x/.lpm")
    }

    fn at(rel: &str) -> PathBuf {
        lpm().join(rel)
    }

    #[test]
    fn top_level_allowlist_honored() {
        assert_eq!(
            classify(&lpm(), &at("global.yml")),
            Some(Category::Projects)
        );
        assert_eq!(
            classify(&lpm(), &at("groups.json")),
            Some(Category::Projects)
        );
        assert_eq!(
            classify(&lpm(), &at("commit-instructions.txt")),
            Some(Category::Projects)
        );
        // branch-name-instructions.txt joined the sync surface (delta 1), so the
        // watcher now classifies it and emits a refresh when it changes.
        assert_eq!(
            classify(&lpm(), &at("branch-name-instructions.txt")),
            Some(Category::Projects)
        );
    }

    #[test]
    fn top_level_settings_is_its_own_category() {
        // settings.json is gated on a portable-digest change, so it classifies
        // distinctly from the byte-replace global files; a nested settings.json
        // (e.g. under a synced dir) is not the gated top-level one.
        assert_eq!(
            classify(&lpm(), &at("settings.json")),
            Some(Category::Settings)
        );
        assert_eq!(
            classify(&lpm(), &at("generator-icons/settings.json")),
            Some(Category::Projects)
        );
    }

    #[test]
    fn top_level_non_allowlisted_ignored() {
        assert_eq!(classify(&lpm(), &at("message-history.db")), None);
        assert_eq!(classify(&lpm(), &at("peer.json")), None);
        assert_eq!(classify(&lpm(), &at("lpm.sock")), None);
        assert_eq!(classify(&lpm(), &at("settings.json.tmp")), None);
    }

    #[test]
    fn projects_only_yml() {
        assert_eq!(
            classify(&lpm(), &at("projects/web.yml")),
            Some(Category::Projects)
        );
        assert_eq!(classify(&lpm(), &at("projects/web.yaml")), None);
        assert_eq!(classify(&lpm(), &at("projects/notes.txt")), None);
    }

    #[test]
    fn templates_recursive_is_templates() {
        assert_eq!(
            classify(&lpm(), &at("templates/base.yml")),
            Some(Category::Templates)
        );
        assert_eq!(
            classify(&lpm(), &at("templates/nested/x.yml")),
            Some(Category::Templates)
        );
    }

    #[test]
    fn synced_dirs_map_to_projects() {
        assert_eq!(
            classify(&lpm(), &at("generator-icons/a.png")),
            Some(Category::Projects)
        );
        assert_eq!(
            classify(&lpm(), &at("zdotdir/.zshrc")),
            Some(Category::Projects)
        );
        assert_eq!(
            classify(&lpm(), &at("zdotdir/nested/f")),
            Some(Category::Projects)
        );
    }

    #[test]
    fn outside_root_is_none() {
        assert_eq!(classify(&lpm(), Path::new("/etc/passwd")), None);
        assert_eq!(classify(&lpm(), &lpm()), None);
    }

    #[test]
    fn settings_gate_transitions() {
        // First observation with a computable digest counts as changed.
        assert!(settings_changed(None, Some("a")));
        // Same digest -> no emit (window drag rewrites bounds only).
        assert!(!settings_changed(Some("a"), Some("a")));
        // Real portable change -> emit.
        assert!(settings_changed(Some("a"), Some("b")));
    }

    #[test]
    fn settings_gate_read_failures_dont_storm() {
        // File became unreadable after having a digest -> one change.
        assert!(settings_changed(Some("a"), None));
        // Repeated failures with no prior digest -> silent.
        assert!(!settings_changed(None, None));
    }
}
