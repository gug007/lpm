// SSH sync (rsync mirror) — port of desktop/sshsync.go. Backs actions with
// `mode: sync` on a remote project: pull the remote dir into a local cache,
// run the action against that cache, then push changes back. A file watcher
// keeps pushing edits (debounced) so the remote stays in sync while you work.
//
// rsync uses a plain `ssh [-p PORT] [-i KEY]` transport (NOT the ControlMaster
// mux that terminals/scp share) — matching Go's rsyncShell exactly. Pull/push
// use `--update` (never clobber a newer file on the other side) + `--force`.
use crate::config::{self, SshSettings};
use notify::{RecursiveMode, Watcher};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::mpsc::{channel, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const PULL_TTL: Duration = Duration::from_secs(5); // skip re-pull within this window
const SYNC_DEBOUNCE: Duration = Duration::from_millis(1500); // coalesce fs bursts

// Dirs never mirrored (build output, deps, editor state). Mirrors watcher.go's
// set. NOTE: `.git` is intentionally NOT here — local commits propagate.
const IGNORED_DIRS: &[&str] = &[
    "node_modules", "dist", "build", "out", "target", "vendor", ".next", ".nuxt",
    ".svelte-kit", ".turbo", ".cache", ".parcel-cache", ".yarn", ".pnpm-store",
    ".venv", "venv", "__pycache__", ".mypy_cache", ".pytest_cache", ".gradle",
    ".idea", ".vscode",
];

struct ProjectSync {
    path: String,             // ~/.lpm/sync/<project>
    inner: Mutex<SyncInner>,  // serializes pull/push (Go's per-project mu)
}
struct SyncInner {
    last_pull: Option<Instant>,
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

fn remote_ref(ssh: &SshSettings) -> String {
    format!("{}@{}:{}", ssh.user, ssh.host, ssh.dir)
}

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

fn rsync_available() -> bool {
    Command::new("rsync")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Pull the remote dir into the local cache (skipping if pulled within the TTL),
/// start the watcher, and return the local cache path. Called from action
/// resolution for `mode: sync`.
pub fn ensure_project_sync(app: &AppHandle, project: &str, ssh: &SshSettings) -> Result<String, String> {
    if ssh.dir.trim().is_empty() {
        return Err("sync-mode actions require a remote directory (ssh.dir) to be set".into());
    }
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
                    inner: Mutex::new(SyncInner { last_pull: None }),
                })
            })
            .clone()
    };
    std::fs::create_dir_all(&entry.path).map_err(|e| format!("create sync dir: {e}"))?;

    {
        let mut inner = entry.inner.lock().unwrap();
        let fresh = inner.last_pull.map(|t| t.elapsed() < PULL_TTL).unwrap_or(false);
        if !fresh {
            let src = format!("{}/", remote_ref(ssh));
            let dst = format!("{}/", entry.path);
            let out = Command::new("rsync")
                .args(rsync_args(ssh, &src, &dst))
                .output()
                .map_err(|e| format!("rsync pull: {e}"))?;
            if !out.status.success() {
                let tail = config::trim_tail(&out.stderr, 500);
                return Err(format!("rsync pull failed: {tail}"));
            }
            inner.last_pull = Some(Instant::now());
        }
    }

    start_watcher(app, project, &entry);
    Ok(entry.path.clone())
}

/// Push the local cache back to the remote (local → remote). Serialized with
/// pull via the per-project lock. Emits "sync-error" on failure.
fn push_project_sync(app: &AppHandle, ssh: &SshSettings, entry: &Arc<ProjectSync>) {
    let _guard = entry.inner.lock().unwrap();
    let src = format!("{}/", entry.path);
    let dst = format!("{}/", remote_ref(ssh));
    match Command::new("rsync").args(rsync_args(ssh, &src, &dst)).output() {
        Ok(out) if out.status.success() => {}
        Ok(out) => {
            let tail = config::trim_tail(&out.stderr, 500);
            let _ = app.emit("sync-error", format!("rsync push failed: {tail}"));
        }
        Err(e) => {
            let _ = app.emit("sync-error", format!("rsync push: {e}"));
        }
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
    let (tx, rx) = channel::<notify::Result<notify::Event>>();
    let mut watcher = match notify::recommended_watcher(move |res| {
        let _ = tx.send(res);
    }) {
        Ok(w) => w,
        Err(_) => return, // matches Go: watch error is non-fatal, just no live sync
    };
    if watcher.watch(Path::new(&entry.path), RecursiveMode::Recursive).is_err() {
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
    rx: std::sync::mpsc::Receiver<notify::Result<notify::Event>>,
    app: AppHandle,
    project: String,
    entry: Arc<ProjectSync>,
) {
    let idle = Duration::from_secs(3600); // long wait when nothing is pending
    let mut pending = false;
    loop {
        let timeout = if pending { SYNC_DEBOUNCE } else { idle };
        match rx.recv_timeout(timeout) {
            Ok(Ok(event)) => {
                if !ignore_sync_event(&entry.path, &event) {
                    pending = true; // (re)arm debounce; recv_timeout restarts the wait
                }
            }
            Ok(Err(_)) => {} // watch error — ignore, keep going
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
                if IGNORED_DIRS.contains(&s) {
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
    let Ok(entries) = std::fs::read_dir(&base) else { return };
    for e in entries.flatten() {
        if let Some(name) = e.file_name().to_str() {
            if !existing.contains(name) {
                let _ = std::fs::remove_dir_all(e.path());
            }
        }
    }
}
