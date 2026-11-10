// This machine's shared automations, written by a paired Mac.
//
// A job in one project lives in that project's config, which a Mac already
// edits through the project. A job across several projects, every project or
// none lives in the global config, which holds far more than jobs. So the job
// editor writes only its `jobs:` here, one job at a time, answered in Rust so a
// host whose page is busy or down still takes it.
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

/// Advertised in `ready`: this host answers SAVE_CMD and DELETE_CMD.
pub(crate) const HOST_JOBS_FEATURE: &str = "hostJobs";
pub(crate) const SAVE_CMD: &str = "host_global_job_save";
pub(crate) const DELETE_CMD: &str = "host_global_job_delete";

const GLOBAL: &str = "global";

fn text(args: &Value, key: &str) -> String {
    args.get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

/// Write `jobs.<id>` from `yaml`, the job's body as the asking Mac's editor
/// wrote it. YAML rather than JSON so its keys keep the editor's order.
pub(crate) fn save(app: &AppHandle, args: &Value) -> Result<Value, String> {
    let body: serde_norway::Value =
        serde_norway::from_str(&text(args, "yaml")).map_err(|e| format!("bad automation: {e}"))?;
    crate::jobs::save_job_value(GLOBAL.into(), String::new(), text(args, "id"), body, true)?;
    changed(app);
    Ok(Value::Null)
}

/// Drop `jobs.<id>`. Its runs' state stays, as a desktop edit that moves a job
/// leaves it; `clear_job_state_global` forgets it.
pub(crate) fn delete(app: &AppHandle, args: &Value) -> Result<Value, String> {
    crate::jobs::remove_job_value(GLOBAL, "", &text(args, "id"))?;
    changed(app);
    Ok(Value::Null)
}

/// This machine's own Automations views and its phones refresh on it.
fn changed(app: &AppHandle) {
    let _ = app.emit("job-status", json!({ "project": "" }));
}
