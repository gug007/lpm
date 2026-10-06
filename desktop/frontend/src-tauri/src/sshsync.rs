// SSH sync (rsync mirror) — port of desktop/sshsync.go. Backs actions with
// `mode: sync` on a remote project: pull the remote dir into a local cache,
// run the action against that cache, then push changes back. A file watcher
// keeps pushing edits (debounced) so the remote stays in sync while you work.
//
// rsync uses a plain `ssh [-p PORT] [-i KEY]` transport (NOT the ControlMaster
// mux that terminals/scp share) — matching Go's rsyncShell exactly. Pull/push
// use `--update` (never clobber a newer file on the other side) + `--force`.
// Windows has no usable rsync and moves tar streams instead (sshsync_tar.rs).
use crate::config::{self, SshSettings};
use notify::{RecursiveMode, Watcher};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
#[cfg(unix)]
use std::process::Command;
use std::sync::mpsc::{channel, RecvTimeoutError};
#[cfg(unix)]
use std::sync::OnceLock;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const PULL_TTL: Duration = Duration::from_secs(5); // skip re-pull within this window
const SYNC_DEBOUNCE: Duration = Duration::from_millis(1500); // coalesce fs bursts

struct ProjectSync {
    path: String,            // ~/.lpm/sync/<project>
    inner: Mutex<SyncInner>, // serializes pull/push (Go's per-project mu)
}
struct SyncInner {
    last_pull: Option<Instant>,
    #[cfg(windows)]
    manifest: crate::sshsync_tar::Manifest,
}

#[derive(Default)]
pub struct SyncState {
    projects: Mutex<HashMap<String, Arc<ProjectSync>>>,
    // Keeping the Watcher alive keeps notifications flowing; dropping it (on
    // remove/stop) disconnects the channel and ends the debounce thread.
    watchers: Mutex<HashMap<String, notify::RecommendedWatcher>>,
}

fn sync_dir(project: &str) -> PathBuf {
    config::lpm_dir().join("sync").join(project)
}

/// `ssh [-p PORT] [-i KEY]` for rsync's `-e` (Go rsyncShell). Plain ssh, no mux.
#[cfg(unix)]
fn rsync_shell(ssh: &SshSettings) -> String {
    let mut parts = vec!["ssh".to_string()];
    if ssh.port > 0 && ssh.port != 22 {
        parts.push("-p".into());
        parts.push(ssh.port.to_string());
    }
    let key = ssh.key.trim();
    if !key.is_empty() {
        parts.push("-i".into());
        parts.push(config::expand_home(key));
    }
    parts.join(" ")
}

#[cfg(unix)]
fn remote_ref(ssh: &SshSettings) -> String {
    format!("{}@{}:{}", ssh.user, ssh.host, ssh.dir)
}

#[cfg(unix)]
fn rsync_args(ssh: &SshSettings, src: &str, dst: &str) -> Vec<String> {
    vec![
        "-az".into(),
        "--update".into(),
        "--force".into(),
        "-e".into(),
        rsync_shell(ssh),
        src.into(),
        dst.into(),
    ]
}

#[cfg(unix)]
fn rsync_available() -> bool {
    // rsync's presence on PATH doesn't change during a session — probe once.
    static AVAILABLE: OnceLock<bool> = OnceLock::new();
    *AVAILABLE.get_or_init(|| {
        Command::new("rsync")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    })
}

/// Pull the remote dir into the local cache (skipping if pulled within the TTL),
/// start the watcher, and return the local cache path. Called from action
/// resolution for `mode: sync`.
pub fn ensure_project_sync(
    app: &AppHandle,
    project: &str,
    ssh: &SshSettings,
) -> Result<String, String> {
    if ssh.dir.trim().is_empty() {
        return Err("sync-mode actions require a remote directory (ssh.dir) to be set".into());
    }
    #[cfg(unix)]
    if !rsync_available() {
        return Err("rsync was not found on PATH — required for sync-mode actions".into());
    }

    let state = app.state::<SyncState>();
    let entry = {
        let mut m = state.projects.lock().unwrap();
        m.entry(project.to_string())
            .or_insert_with(|| {
                Arc::new(ProjectSync {
                    path: sync_dir(project).to_string_lossy().into_owned(),
                    inner: Mutex::new(SyncInner {
                        last_pull: None,
                        #[cfg(windows)]
                        manifest: Default::default(),
                    }),
                })
            })
            .clone()
    };
    std::fs::create_dir_all(&entry.path).map_err(|e| format!("create sync dir: {e}"))?;

    {
        let mut inner = entry.inner.lock().unwrap();
        let fresh = inner
            .last_pull
            .map(|t| t.elapsed() < PULL_TTL)
            .unwrap_or(false);
        if !fresh {
            pull(ssh, &entry.path, &mut inner)?;
            inner.last_pull = Some(Instant::now());
        }
    }

    start_watcher(app, project, &entry);
    Ok(entry.path.clone())
}

#[cfg(unix)]
fn pull(ssh: &SshSettings, path: &str, _inner: &mut SyncInner) -> Result<(), String> {
    let src = format!("{}/", remote_ref(ssh));
    let dst = format!("{path}/");
    let out = crate::osproc::command("rsync")
        .args(rsync_args(ssh, &src, &dst))
        .output()
        .map_err(|e| format!("rsync pull: {e}"))?;
    if !out.status.success() {
        let tail = config::trim_tail(&out.stderr, 500);
        return Err(format!("rsync pull failed: {tail}"));
    }
    Ok(())
}

#[cfg(windows)]
fn pull(ssh: &SshSettings, path: &str, inner: &mut SyncInner) -> Result<(), String> {
    crate::sshsync_tar::pull(ssh, Path::new(path), &mut inner.manifest)
}

#[cfg(unix)]
fn push(ssh: &SshSettings, path: &str, _inner: &mut SyncInner) -> Result<(), String> {
    let src = format!("{path}/");
    let dst = format!("{}/", remote_ref(ssh));
    match crate::osproc::command("rsync")
        .args(rsync_args(ssh, &src, &dst))
        .output()
    {
        Ok(out) if out.status.success() => Ok(()),
        Ok(out) => {
            let tail = config::trim_tail(&out.stderr, 500);
            Err(format!("rsync push failed: {tail}"))
        }
        Err(e) => Err(format!("rsync push: {e}")),
    }
}

#[cfg(windows)]
fn push(ssh: &SshSettings, path: &str, inner: &mut SyncInner) -> Result<(), String> {
    crate::sshsync_tar::push(ssh, Path::new(path), &mut inner.manifest)
}

/// Push the local cache back to the remote (local → remote). Serialized with
/// pull via the per-project lock. Emits "sync-error" on failure.
fn push_project_sync(app: &AppHandle, ssh: &SshSettings, entry: &Arc<ProjectSync>) {
    let mut inner = entry.inner.lock().unwrap();
    if let Err(e) = push(ssh, &entry.path, &mut inner) {
        let _ = app.emit("sync-error", e);
    }
}

/// Push after a sync action finishes (actionPlan.onExit). Reloads ssh from the
/// project config so the action plan doesn't have to carry it. No-op if the
/// project never started a sync.
pub fn push_after_action(app: &AppHandle, project: &str) {
    let state = app.state::<SyncState>();
    let entry = state.projects.lock().unwrap().get(project).cloned();
    let Some(entry) = entry else { return };
    let app = app.clone();
    let project = project.to_string();
    std::thread::spawn(move || {
        if let Ok(info) = config::spawn_info(&project) {
            if info.is_remote {
                push_project_sync(&app, &info.ssh, &entry);
            }
        }
    });
}

/// Start a recursive watcher on the cache that pushes (debounced) on change.
/// Idempotent: a second call while one is running is a no-op.
fn start_watcher(app: &AppHandle, project: &str, entry: &Arc<ProjectSync>) {
    let state = app.state::<SyncState>();
    let mut watchers = state.watchers.lock().unwrap();
    if watchers.contains_key(project) {
        return;
    }
    let (tx, rx) = channel::<()>();
    let watch_root = entry.path.clone();
    let mut watcher =
        match notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            if res.is_ok_and(|ev| should_push(&watch_root, &ev)) {
                let _ = tx.send(());
            }
        }) {
            Ok(w) => w,
            Err(_) => return, // matches Go: watch error is non-fatal, just no live sync
        };
    if watcher
        .watch(Path::new(&entry.path), RecursiveMode::Recursive)
        .is_err()
    {
        return;
    }

    let app2 = app.clone();
    let project2 = project.to_string();
    let entry2 = entry.clone();
    std::thread::spawn(move || run_watcher(rx, app2, project2, entry2));
    watchers.insert(project.to_string(), watcher);
}

/// Debounce loop: push SYNC_DEBOUNCE after the last relevant fs event. Exits
/// when the channel disconnects (watcher dropped on remove/stop).
fn run_watcher(
    rx: std::sync::mpsc::Receiver<()>,
    app: AppHandle,
    project: String,
    entry: Arc<ProjectSync>,
) {
    let idle = Duration::from_secs(3600); // long wait when nothing is pending
    let mut pending = false;
    loop {
        let timeout = if pending { SYNC_DEBOUNCE } else { idle };
        match rx.recv_timeout(timeout) {
            Ok(()) => pending = true, // (re)arm debounce; recv_timeout restarts the wait
            Err(RecvTimeoutError::Timeout) => {
                if pending {
                    pending = false;
                    if let Ok(info) = config::spawn_info(&project) {
                        if info.is_remote {
                            push_project_sync(&app, &info.ssh, &entry);
                        }
                    }
                }
            }
            Err(RecvTimeoutError::Disconnected) => return,
        }
    }
}

/// Whether an event should arm a push. Applied in the watcher callback, not the
/// worker: rsync's sender opens every file under the cache root, and on Linux
/// those opens come straight back as events.
fn should_push(root: &str, ev: &notify::Event) -> bool {
    !crate::watchfilter::is_read_only(ev) && !ignore_sync_event(root, ev)
}

/// True when none of the event's paths are worth syncing (all in ignored dirs,
/// outside the root, or the root itself).
fn ignore_sync_event(root: &str, event: &notify::Event) -> bool {
    event.paths.iter().all(|p| ignore_path(root, p))
}

fn ignore_path(root: &str, p: &Path) -> bool {
    let Ok(rel) = p.strip_prefix(root) else {
        return true; // outside the cache root
    };
    let mut has_segment = false;
    for comp in rel.components() {
        if let std::path::Component::Normal(seg) = comp {
            has_segment = true;
            if let Some(s) = seg.to_str() {
                // .git is intentionally NOT ignored here — local commits propagate.
                if config::IGNORED_WATCH_DIRS.contains(&s) {
                    return true;
                }
            }
        }
    }
    !has_segment // rel == "" / "." → the root itself, ignore
}

/// Tear down a project's sync: drop the watcher, drop state, delete the cache.
/// Mirrors Go removeProjectSync (called when a project is removed).
pub fn remove_project_sync(app: &AppHandle, project: &str) {
    let state = app.state::<SyncState>();
    state.watchers.lock().unwrap().remove(project); // drop → debounce thread exits
    let entry = state.projects.lock().unwrap().remove(project);
    let path = entry
        .map(|e| e.path.clone())
        .unwrap_or_else(|| sync_dir(project).to_string_lossy().into_owned());
    let _ = std::fs::remove_dir_all(&path);
}

/// Drop every watcher (app shutdown). Caches persist on disk for next launch.
pub fn stop_all_sync_watchers(app: &AppHandle) {
    if let Some(state) = app.try_state::<SyncState>() {
        state.watchers.lock().unwrap().clear();
    }
}

/// Delete cache dirs for projects that no longer exist (startup cleanup).
/// Mirrors Go pruneOrphanSyncDirs.
pub fn prune_orphan_sync_dirs(existing: &std::collections::HashSet<String>) {
    let base = config::lpm_dir().join("sync");
    let Ok(entries) = std::fs::read_dir(&base) else {
        return;
    };
    for e in entries.flatten() {
        if let Some(name) = e.file_name().to_str() {
            if !existing.contains(name) {
                let _ = std::fs::remove_dir_all(e.path());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{AccessKind, AccessMode, CreateKind};
    use notify::EventKind;

    fn ev(kind: EventKind, path: &str) -> notify::Event {
        notify::Event::new(kind).add_path(PathBuf::from(path))
    }

    /// rsync's sender opens every file it pushes; those opens arrive as events on
    /// the very tree the push was triggered by.
    #[test]
    fn rsync_reading_the_cache_does_not_arm_another_push() {
        let e = ev(
            EventKind::Access(AccessKind::Open(AccessMode::Any)),
            "/home/x/.lpm/sync/web/src/main.rs",
        );
        assert!(!should_push("/home/x/.lpm/sync/web", &e));
    }

    #[test]
    fn a_real_edit_arms_a_push() {
        let e = ev(
            EventKind::Create(CreateKind::File),
            "/home/x/.lpm/sync/web/src/main.rs",
        );
        assert!(should_push("/home/x/.lpm/sync/web", &e));
    }

    #[test]
    fn build_output_never_arms_a_push() {
        let e = ev(
            EventKind::Create(CreateKind::File),
            "/home/x/.lpm/sync/web/node_modules/x/y.js",
        );
        assert!(!should_push("/home/x/.lpm/sync/web", &e));
    }
}
