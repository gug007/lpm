// Watches ~/.lpm for config edits made by *another* process, so multiple lpm
// instances on one machine (a dev build alongside the prod app) and any connected
// peers converge on external changes. The in-process `projects-changed` /
// `templates-changed` events are only emitted at this instance's own mutation
// sites, so a second instance's writes — or an edit from an editor/CLI — would
// otherwise go unseen. This bridges those filesystem edits back onto the same
// events; listeners are read-only refreshers, so self-echo from our own writes is
// harmless.
use crate::{config, peersync};
use std::path::{Component, Path, PathBuf};
use std::sync::mpsc::{sync_channel, RecvTimeoutError, SyncSender};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const SETTLE: Duration = Duration::from_millis(500);

// Top-level ~/.lpm files that map to the projects category. Everything else at the
// top level (message-history.db, peer.json, lpm.sock, temp files, …) is ignored.
const TOP_LEVEL_ALLOW: [&str; 8] = [
    "global.yml",
    "settings.json",
    "groups.json",
    "composer-actions.json",
    "generators.json",
    "commit-instructions.txt",
    "pr-title-instructions.txt",
    "pr-description-instructions.txt",
];

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Category {
    Projects,
    Templates,
}

#[derive(Default)]
struct Dirty {
    projects: bool,
    templates: bool,
}

/// Map a filesystem event path to the config category it affects, or `None` when
/// the path is outside the watched surface. Pure over `lpm` (the ~/.lpm root) and
/// the event path so it can be unit-tested without touching the filesystem.
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
        [name] => TOP_LEVEL_ALLOW.contains(name).then_some(Category::Projects),
        ["projects", file] => file.ends_with(".yml").then_some(Category::Projects),
        ["templates", ..] => Some(Category::Templates),
        ["generator-icons", ..] => Some(Category::Projects),
        ["zdotdir", ..] => Some(Category::Projects),
        _ => None,
    }
}

fn is_top_level_settings(lpm: &Path, path: &Path) -> bool {
    path.parent() == Some(lpm) && path.file_name().and_then(|n| n.to_str()) == Some("settings.json")
}

/// Whether a settings.json event changed portable content. `prev`/`new` are the
/// cached and freshly computed portable digests (`None` = file unreadable/absent
/// or un-parseable). Repeated read failures must not emit — only a real transition
/// counts. The caller updates the cache to `new` regardless of the result.
fn settings_changed(prev: Option<&str>, new: Option<&str>) -> bool {
    match (prev, new) {
        (_, Some(n)) => prev != Some(n),
        (Some(_), None) => true,
        (None, None) => false,
    }
}

fn portable_settings_digest(path: &Path) -> Option<String> {
    peersync::settings_digest(&std::fs::read(path).ok()?).ok()
}

/// Start the watcher on a background thread. Non-fatal on failure (logged), like
/// socketsrv::start — the app still runs, external edits just won't propagate.
pub fn start(app: AppHandle) {
    let lpm = config::lpm_dir();
    for dir in [
        lpm.clone(),
        config::projects_dir(),
        config::templates_dir(),
        lpm.join("generator-icons"),
        lpm.join("zdotdir"),
    ] {
        if let Err(e) = std::fs::create_dir_all(&dir) {
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
    let settings_cache = Arc::new(Mutex::new(portable_settings_digest(
        &root.join("settings.json"),
    )));
    let dirty = Arc::new(Mutex::new(Dirty::default()));
    let (tx, rx) = sync_channel::<()>(1);

    let cb_root = root.clone();
    let cb_dirty = dirty.clone();
    let cb_cache = settings_cache.clone();
    let cb_tx: SyncSender<()> = tx.clone();
    let mut watcher =
        match notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            let Ok(ev) = res else { return };
            let mut woke = false;
            for p in &ev.paths {
                let Some(cat) = classify(&cb_root, p) else {
                    continue;
                };
                if is_top_level_settings(&cb_root, p) {
                    let new = portable_settings_digest(p);
                    let mut cache = cb_cache.lock().unwrap();
                    let changed = settings_changed(cache.as_deref(), new.as_deref());
                    *cache = new;
                    if !changed {
                        continue;
                    }
                }
                let mut d = cb_dirty.lock().unwrap();
                match cat {
                    Category::Projects => d.projects = true,
                    Category::Templates => d.templates = true,
                }
                woke = true;
            }
            if woke {
                let _ = cb_tx.try_send(());
            }
        }) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("warning: failed to start config watcher: {e}");
                return;
            }
        };

    use notify::{RecursiveMode, Watcher};
    let watches: [(PathBuf, RecursiveMode); 5] = [
        (root.clone(), RecursiveMode::NonRecursive),
        (root.join("projects"), RecursiveMode::NonRecursive),
        (root.join("templates"), RecursiveMode::Recursive),
        (root.join("generator-icons"), RecursiveMode::Recursive),
        (root.join("zdotdir"), RecursiveMode::Recursive),
    ];
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
            classify(&lpm(), &at("settings.json")),
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
