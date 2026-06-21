// File operations + native folder picker — port of desktop/openin.go file ops
// and BrowseFolder. BrowseFolder uses tauri-plugin-dialog's blocking picker.
use crate::config::expand_home;
use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, FilePath};

const READ_FILE_MAX_BYTES: usize = 5 * 1024 * 1024;

/// Run a native file/folder picker off the main thread and return the chosen
/// path (None if cancelled). The plugin's `blocking_pick_*` calls must NOT run
/// on the UI thread — their result is delivered via the main event loop, so
/// blocking it deadlocks and the app beachballs. `build` constructs and shows
/// the dialog; it runs on a blocking-pool thread.
pub(crate) async fn pick_path<F>(app: AppHandle, build: F) -> Result<Option<PathBuf>, String>
where
    F: FnOnce(AppHandle) -> Option<FilePath> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || build(app))
        .await
        .map_err(|e| e.to_string())?
        .map(|fp| fp.into_path().map_err(|e| e.to_string()))
        .transpose()
}

/// Resolve `~` and require the path to be an existing file/dir.
fn resolve_existing(abs: &str) -> Result<String, String> {
    if abs.is_empty() {
        return Err("empty file path".into());
    }
    let r = expand_home(abs);
    std::fs::metadata(&r).map_err(|_| format!("file not found: {r}"))?;
    Ok(r)
}

#[tauri::command]
pub async fn browse_folder(
    app: AppHandle,
    default_dir: Option<String>,
) -> Result<String, String> {
    let start = default_dir
        .map(|d| expand_home(&d))
        .filter(|d| !d.is_empty() && std::path::Path::new(d).is_dir());
    let picked = pick_path(app, move |app| {
        let mut builder = app.dialog().file().set_title("Select project folder");
        if let Some(dir) = start {
            builder = builder.set_directory(dir);
        }
        builder.blocking_pick_folder()
    })
    .await?;
    match picked {
        Some(p) => Ok(p.to_string_lossy().into_owned()),
        None => Ok(String::new()), // cancel -> "" (matches Go)
    }
}

#[tauri::command]
pub async fn save_text_file(
    app: AppHandle,
    default_name: String,
    content: String,
) -> Result<bool, String> {
    // Bounded by the terminal's scrollback, but a wide buffer can still be a
    // few MB — cap generously so a real save is never rejected.
    if content.len() > 64 * 1024 * 1024 {
        return Err(format!("content too large ({} bytes)", content.len()));
    }
    let Some(path) = pick_path(app, move |app| {
        let mut builder = app
            .dialog()
            .file()
            .set_file_name(&default_name);
        if let Ok(dir) = app.path().download_dir() {
            builder = builder.set_directory(dir);
        }
        builder.blocking_save_file()
    })
    .await?
    else {
        return Ok(false);
    };
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn file_exists(abs_path: String) -> bool {
    if abs_path.is_empty() {
        return false;
    }
    std::fs::metadata(expand_home(&abs_path))
        .map(|m| m.is_file())
        .unwrap_or(false)
}

#[tauri::command(async)]
pub fn read_file(abs_path: String) -> Result<String, String> {
    if abs_path.is_empty() {
        return Err("empty file path".into());
    }
    let path = expand_home(&abs_path);
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    if bytes.len() > READ_FILE_MAX_BYTES {
        return Err(format!("file too large to preview ({} bytes)", bytes.len()));
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[tauri::command(async)]
pub fn write_file(abs_path: String, content: String) -> Result<(), String> {
    if abs_path.is_empty() {
        return Err("empty file path".into());
    }
    if content.len() > READ_FILE_MAX_BYTES {
        return Err(format!("content too large ({} bytes)", content.len()));
    }
    let path = expand_home(&abs_path);
    if let Ok(meta) = std::fs::metadata(&path) {
        if meta.is_dir() {
            return Err(format!("not a file: {abs_path}"));
        }
    }
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command(async)]
pub fn open_path_in_default_app(abs_path: String) -> Result<(), String> {
    let resolved = resolve_existing(&abs_path)?;
    let status = Command::new("open")
        .arg(&resolved)
        .status()
        .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("open failed".into());
    }
    Ok(())
}

/// Shared with openin.rs.
pub(crate) fn resolve_existing_file(abs: &str) -> Result<String, String> {
    resolve_existing(abs)
}
