// Service log streaming — port of desktop/log_streaming.go. A per-project
// poller thread captures each pane every 500ms and emits a `log-update` event
// when a pane's content changes. Keyed by project FILE name. Uses a std thread
// + AtomicBool cancel flag (PTY-style; no tokio).
use crate::{config, tmux};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

const CAPTURE_LINES: i64 = 1000;
const POLL_MS: u64 = 500;

#[derive(Clone, Serialize)]
struct LogUpdate {
    project: String,
    pane: usize,
    content: String,
}

// One poller per project, refcounted by viewer. Both the main window and a
// detached mirror can watch the same project's logs; the poller must live while
// EITHER is watching, so a viewer set governs it instead of a bare cancel flag —
// otherwise one window pausing (hidden/deselected) would freeze the other's logs.
pub struct Stream {
    cancel: Arc<AtomicBool>,
    viewers: HashSet<String>,
}

pub struct LogState {
    // keyed by project FILE name -> its poller + active viewers
    pub streams: Mutex<HashMap<String, Stream>>,
}

impl Default for LogState {
    fn default() -> Self {
        Self {
            streams: Mutex::new(HashMap::new()),
        }
    }
}

/// Capture each pane once and emit any that changed since `prev`.
fn emit_changed(app: &AppHandle, project: &str, session: &str, prev: &mut HashMap<usize, String>) {
    for (i, pane_id) in tmux::list_pane_ids(session).iter().enumerate() {
        let content = tmux::capture_pane(pane_id, CAPTURE_LINES).unwrap_or_default();
        if prev.get(&i) != Some(&content) {
            prev.insert(i, content.clone());
            let _ = app.emit(
                "log-update",
                LogUpdate {
                    project: project.to_string(),
                    pane: i,
                    content,
                },
            );
        }
    }
}

#[tauri::command(async)]
pub fn start_log_streaming(
    app: AppHandle,
    state: State<'_, LogState>,
    project_name: String,
    viewer: Option<String>,
) -> Result<(), String> {
    let viewer = viewer.unwrap_or_else(|| "main".to_string());

    {
        let mut streams = state.streams.lock().unwrap();
        // A poller already running for this project just gains a viewer — never
        // respawn (that would double-emit); the existing thread already serves
        // every window listening on the global `log-update` event.
        if let Some(existing) = streams.get_mut(&project_name) {
            existing.viewers.insert(viewer);
            return Ok(());
        }
    }

    // Resolve the session up front; if the project can't be read, no-op.
    let session = match config::spawn_info(&project_name) {
        Ok(info) => info.session,
        Err(_) => return Ok(()),
    };

    let stop = Arc::new(AtomicBool::new(false));
    {
        let mut streams = state.streams.lock().unwrap();
        // Re-check under the lock: a concurrent start may have spawned first.
        if let Some(existing) = streams.get_mut(&project_name) {
            existing.viewers.insert(viewer);
            return Ok(());
        }
        streams.insert(
            project_name.clone(),
            Stream {
                cancel: stop.clone(),
                viewers: HashSet::from([viewer]),
            },
        );
    }

    std::thread::spawn(move || {
        let mut prev: HashMap<usize, String> = HashMap::new();
        emit_changed(&app, &project_name, &session, &mut prev); // initial emit
        while !stop.load(Ordering::SeqCst) {
            std::thread::sleep(Duration::from_millis(POLL_MS));
            if stop.load(Ordering::SeqCst) {
                break;
            }
            emit_changed(&app, &project_name, &session, &mut prev);
        }
    });
    Ok(())
}

#[tauri::command(async)]
pub fn stop_log_streaming(
    state: State<'_, LogState>,
    project_name: String,
    viewer: Option<String>,
) -> Result<(), String> {
    let viewer = viewer.unwrap_or_else(|| "main".to_string());
    let mut streams = state.streams.lock().unwrap();
    let Some(existing) = streams.get_mut(&project_name) else {
        return Ok(());
    };
    existing.viewers.remove(&viewer);
    // Stop the poller only when the last viewer leaves, so one window pausing
    // doesn't freeze the other's live logs.
    if existing.viewers.is_empty() {
        existing.cancel.store(true, Ordering::SeqCst);
        streams.remove(&project_name);
    }
    Ok(())
}

#[tauri::command(async)]
pub fn get_service_logs(
    project_name: String,
    pane_index: i64,
    lines: i64,
) -> Result<String, String> {
    let info = config::spawn_info(&project_name)?;
    let idx = usize::try_from(pane_index).map_err(|_| "invalid pane index".to_string())?;
    let pane_id = tmux::list_pane_ids(&info.session)
        .into_iter()
        .nth(idx)
        .ok_or_else(|| format!("pane index {idx} out of range"))?;
    tmux::capture_pane(&pane_id, lines)
}
