// File operations + native folder picker — port of desktop/openin.go file ops
// and BrowseFolder. BrowseFolder uses tauri-plugin-dialog's blocking picker.
use crate::config::expand_home;
use std::process::Command;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

const READ_FILE_MAX_BYTES: usize = 5 * 1024 * 1024;

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
pub fn browse_folder(app: AppHandle) -> Result<String, String> {
    match app
        .dialog()
        .file()
        .set_title("Select project folder")
        .blocking_pick_folder()
    {
        Some(fp) => Ok(fp
            .into_path()
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .into_owned()),
        None => Ok(String::new()), // cancel -> "" (matches Go)
    }
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
