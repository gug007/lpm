// Moving a running terminal to another project on this computer: the tab
// changes project while its shell, and any agent in it, keeps running in the
// folder it started in. What the tab's agents report goes with it.
use crate::status::StatusStore;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

/// Files terminal `id` under project `to`, returning the folder its shell
/// started in, where it keeps running.
#[tauri::command]
pub fn move_terminal(app: AppHandle, id: String, to: String) -> Result<String, String> {
    if to != crate::config::RESERVED_PROJECT_NAME {
        if !crate::config::project_exists(&to) {
            return Err(format!("No project named “{to}”."));
        }
        if crate::config::spawn_info(&to).is_ok_and(|info| info.is_remote) {
            return Err("A terminal can't move to a project on a remote host.".into());
        }
    }
    let from = crate::pty::move_to_project(&app.state::<crate::pty::PtyState>(), &id, &to)?;
    let folder = crate::config::spawn_info(&from).map(|info| info.root).unwrap_or_default();
    if from == to {
        return Ok(folder);
    }
    if app.state::<Arc<StatusStore>>().move_pane_project(&id, &from, &to) {
        let _ = app.emit("status-changed", &from);
        let _ = app.emit("status-changed", &to);
    }
    let _ = app.emit(crate::remote::TERMINALS_CHANGED_EVENT, &from);
    let _ = app.emit(crate::remote::TERMINALS_CHANGED_EVENT, &to);
    Ok(folder)
}
