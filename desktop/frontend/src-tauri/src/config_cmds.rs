// Config read/write commands — port of desktop/projects.go config R/W.
// DEFERRED (flagged): save_config does NOT run the Go ApplyDefaults() (extends
// flatten + global/repo merge) or structural Validate() (root/cwd existence,
// port uniqueness, SSH checks) — those depend on the unported extends/global
// machinery. We validate YAML syntax + do the full rename/parent/duplicate
// routing (the editor-visible contract); the Go runtime re-validates on start.
//
// The raw-text bodies below are shared, non-command fns so the mobile remote's
// readConfig/saveConfig verbs (remote.rs) round-trip through the exact same
// logic as the desktop commands — no duplicate-parent/rename drift.
use crate::config;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::ErrorKind;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

static CONFIG_APPLY_LOCK: Mutex<()> = Mutex::new(());

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

/// The raw text of a project's registry config, routing a duplicate to its
/// parent's file (the project layer the editors read/write).
pub fn read_project_config(name: &str) -> Result<String, String> {
    // A duplicate routes to its parent's config file.
    let target = config::peek_parent(name).unwrap_or_else(|| name.to_string());
    std::fs::read_to_string(config::project_path(&target)).map_err(|e| e.to_string())
}

/// Write a project's registry config with the same duplicate-parent + rename
/// routing the desktop editor relies on. Returns the (possibly renamed) project
/// name. Emits `projects-changed` on success so the desktop + phones refresh.
pub fn write_project_config(
    app: &AppHandle,
    name: String,
    content: String,
) -> Result<String, String> {
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

/// Read the global config text (missing file -> "").
pub fn read_global_config_body() -> Result<String, String> {
    read_to_string(&config::global_path())
}

/// Validate + write the global config text, emitting `projects-changed`.
pub fn write_global_config(app: &AppHandle, content: &str) -> Result<(), String> {
    validate_yaml(content)?;
    config::ensure_dirs()?;
    config::write_config_file(&config::global_path(), content)?;
    let _ = app.emit("projects-changed", ());
    Ok(())
}

/// The repo config path for a project, or Err for SSH/rootless projects (no
/// local `.lpm.yml`).
pub fn repo_config_path(name: &str) -> Result<std::path::PathBuf, String> {
    config::repo_path_for_project(name)
}

/// Read a project's repo (`<root>/.lpm.yml`) config text (missing file -> "").
pub fn read_repo_config_body(name: &str) -> Result<String, String> {
    let path = repo_config_path(name)?;
    read_to_string(&path)
}

/// Validate + write a project's repo config text, emitting `projects-changed`.
pub fn write_repo_config(app: &AppHandle, name: &str, content: &str) -> Result<(), String> {
    let path = repo_config_path(name)?;
    validate_yaml(content)?;
    config::write_config_file(&path, content)?;
    let _ = app.emit("projects-changed", ());
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigSnapshot {
    pub layer: String,
    pub project: String,
    pub template: String,
    pub path: String,
    pub exists: bool,
    pub content: String,
    pub revision: String,
}

fn template_config_path(name: &str) -> Result<PathBuf, String> {
    config::validate_name(name)?;
    for ext in ["yml", "yaml"] {
        let path = config::templates_dir().join(format!("{name}.{ext}"));
        if path.exists() {
            return Ok(path);
        }
    }
    Ok(config::templates_dir().join(format!("{name}.yml")))
}

fn config_target_path(project: &str, layer: &str, template: &str) -> Result<PathBuf, String> {
    match layer {
        "project" => {
            config::validate_name(project)?;
            let target = config::peek_parent(project).unwrap_or_else(|| project.to_string());
            Ok(config::project_path(&target))
        }
        "repo" => {
            config::validate_name(project)?;
            repo_config_path(project)
        }
        "global" => Ok(config::global_path()),
        "template" => template_config_path(template),
        _ => Err(format!("unknown config layer: {layer:?}")),
    }
}

fn content_revision(content: &str) -> String {
    hex::encode(Sha256::digest(content.as_bytes()))
}

fn apply_file_at_revision(
    path: &std::path::Path,
    expected_revision: &str,
    content: &str,
) -> Result<String, String> {
    let current = read_to_string(path)?;
    let current_revision = content_revision(&current);
    if current_revision != expected_revision {
        return Err(format!(
            "revision conflict: expected {expected_revision}, current revision is {current_revision}"
        ));
    }
    validate_yaml(content)?;
    config::write_config_file(path, content)?;
    Ok(content_revision(content))
}

pub fn config_snapshot(
    project: &str,
    layer: &str,
    template: &str,
) -> Result<ConfigSnapshot, String> {
    let path = config_target_path(project, layer, template)?;
    let exists = path.exists();
    let content = read_to_string(&path)?;
    let revision = content_revision(&content);
    Ok(ConfigSnapshot {
        layer: layer.to_string(),
        project: project.to_string(),
        template: template.to_string(),
        path: path.to_string_lossy().into_owned(),
        exists,
        content,
        revision,
    })
}

pub fn apply_config_candidate(
    app: &AppHandle,
    project: &str,
    layer: &str,
    template: &str,
    expected_revision: &str,
    content: &str,
) -> Result<ConfigSnapshot, String> {
    let _guard = CONFIG_APPLY_LOCK
        .lock()
        .map_err(|_| "config apply lock is unavailable".to_string())?;
    let before = config_snapshot(project, layer, template)?;
    if before.revision != expected_revision {
        return Err(format!(
            "revision conflict: expected {expected_revision}, current revision is {}",
            before.revision
        ));
    }
    validate_yaml(content)?;
    config::ensure_dirs()?;
    let applied_project = match layer {
        "project" => write_project_config(app, project.to_string(), content.to_string())?,
        "repo" => {
            apply_file_at_revision(
                &config_target_path(project, layer, template)?,
                expected_revision,
                content,
            )?;
            let _ = app.emit("projects-changed", ());
            project.to_string()
        }
        "global" => {
            apply_file_at_revision(
                &config_target_path(project, layer, template)?,
                expected_revision,
                content,
            )?;
            let _ = app.emit("projects-changed", ());
            project.to_string()
        }
        "template" => {
            let path = template_config_path(template)?;
            apply_file_at_revision(&path, expected_revision, content)?;
            let _ = app.emit("templates-changed", ());
            let _ = app.emit("projects-changed", ());
            project.to_string()
        }
        _ => return Err(format!("unknown config layer: {layer:?}")),
    };
    config_snapshot(&applied_project, layer, template)
}

#[tauri::command(async)]
pub fn read_config(name: String) -> Result<String, String> {
    read_project_config(&name)
}

#[tauri::command(async)]
pub fn save_config(app: AppHandle, name: String, content: String) -> Result<String, String> {
    write_project_config(&app, name, content)
}

#[tauri::command(async)]
pub fn read_global_config() -> Result<String, String> {
    read_global_config_body()
}

#[tauri::command(async)]
pub fn save_global_config(app: AppHandle, content: String) -> Result<(), String> {
    write_global_config(&app, &content)
}

#[tauri::command(async)]
pub fn read_repo_config(name: String) -> Result<String, String> {
    read_repo_config_body(&name)
}

#[tauri::command(async)]
pub fn save_repo_config(app: AppHandle, name: String, content: String) -> Result<(), String> {
    write_repo_config(&app, &name, &content)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalid_yaml_never_replaces_the_destination() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.yml");
        let original = "actions:\n  test: npm test\n";
        std::fs::write(&path, original).unwrap();
        let revision = content_revision(original);
        let invalid = "actions:\n  review:\n    cmd: claude \"Review: {{prs}}\"\n";

        let error = apply_file_at_revision(&path, &revision, invalid).unwrap_err();

        assert!(error.contains("invalid YAML"));
        assert_eq!(std::fs::read_to_string(path).unwrap(), original);
    }

    #[test]
    fn stale_revision_never_replaces_the_destination() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.yml");
        let original = "actions:\n  test: npm test\n";
        std::fs::write(&path, original).unwrap();

        let error =
            apply_file_at_revision(&path, &content_revision("older"), "actions: {}\n").unwrap_err();

        assert!(error.contains("revision conflict"));
        assert_eq!(std::fs::read_to_string(path).unwrap(), original);
    }

    #[test]
    fn valid_yaml_atomically_replaces_the_destination() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.yml");
        let original = "actions:\n  test: npm test\n";
        let replacement = "actions:\n  lint: npm run lint\n";
        std::fs::write(&path, original).unwrap();

        let revision =
            apply_file_at_revision(&path, &content_revision(original), replacement).unwrap();

        assert_eq!(revision, content_revision(replacement));
        assert_eq!(std::fs::read_to_string(path).unwrap(), replacement);
    }
}
