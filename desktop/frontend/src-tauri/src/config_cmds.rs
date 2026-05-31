// Config read/write commands — port of desktop/projects.go config R/W.
// DEFERRED (flagged): save_config does NOT run the Go ApplyDefaults() (extends
// flatten + global/repo merge) or structural Validate() (root/cwd existence,
// port uniqueness, SSH checks) — those depend on the unported extends/global
// machinery. We validate YAML syntax + do the full rename/parent/duplicate
// routing (the editor-visible contract); the Go runtime re-validates on start.
use crate::config;
use std::io::ErrorKind;
use tauri::{AppHandle, Emitter};

fn read_to_string(path: &std::path::Path) -> Result<String, String> {
    match std::fs::read_to_string(path) {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(String::new()), // blank canvas
        Err(e) => Err(e.to_string()),
    }
}

fn validate_yaml(content: &str) -> Result<(), String> {
    serde_yaml::from_str::<serde_yaml::Value>(content).map_err(|e| format!("invalid YAML: {e}"))?;
    Ok(())
}

#[tauri::command(async)]
pub fn read_config(name: String) -> Result<String, String> {
    // A duplicate routes to its parent's config file.
    let target = config::peek_parent(&name).unwrap_or(name);
    std::fs::read_to_string(config::project_path(&target)).map_err(|e| e.to_string())
}

#[tauri::command(async)]
pub fn save_config(app: AppHandle, name: String, content: String) -> Result<String, String> {
    let parsed: config::NameOnly =
        serde_yaml::from_str(&content).map_err(|e| format!("invalid YAML: {e}"))?;

    // Duplicate -> write to the parent's file, keep the duplicate's name.
    if let Some(parent) = config::peek_parent(&name) {
        config::write_config_file(&config::project_path(&parent), &content)?;
        let _ = app.emit("projects-changed", ());
        return Ok(name);
    }

    let new_name = if parsed.name.is_empty() {
        name.clone()
    } else {
        parsed.name
    };
    if new_name == name {
        config::write_config_file(&config::project_path(&name), &content)?;
        let _ = app.emit("projects-changed", ());
        return Ok(name);
    }

    // Rename path.
    if !config::duplicates_of(&name)?.is_empty() {
        return Err(format!("cannot rename {name:?} while duplicates exist"));
    }
    config::validate_name(&new_name)?;
    if config::project_exists(&new_name) {
        return Err(format!("project {new_name:?} already exists"));
    }
    config::write_config_file(&config::project_path(&new_name), &content)?;
    let _ = std::fs::remove_file(config::project_path(&name));
    let _ = app.emit("projects-changed", ());
    Ok(new_name)
}

#[tauri::command(async)]
pub fn read_global_config() -> Result<String, String> {
    read_to_string(&config::global_path())
}

#[tauri::command(async)]
pub fn save_global_config(app: AppHandle, content: String) -> Result<(), String> {
    validate_yaml(&content)?;
    config::ensure_dirs()?;
    config::write_config_file(&config::global_path(), &content)?;
    let _ = app.emit("projects-changed", ());
    Ok(())
}

#[tauri::command(async)]
pub fn read_repo_config(name: String) -> Result<String, String> {
    let path = config::repo_path_for_project(&name)?;
    read_to_string(&path)
}

#[tauri::command(async)]
pub fn save_repo_config(app: AppHandle, name: String, content: String) -> Result<(), String> {
    let path = config::repo_path_for_project(&name)?;
    validate_yaml(&content)?;
    config::write_config_file(&path, &content)?;
    let _ = app.emit("projects-changed", ());
    Ok(())
}
