// Templates + AI-instruction files — port of desktop/templates.go and the
// instruction R/W in desktop/aigen.go. DEFERRED: save_template's
// ValidateTemplateRefs (needs the unported extends/template-resolution graph)
// — we validate YAML syntax only.
use crate::config;
use serde::Serialize;
use std::io::ErrorKind;
use tauri::{AppHandle, Emitter};

#[derive(Serialize)]
pub struct TemplateInfo {
    pub name: String,
    pub path: String,
}

fn template_file(name: &str) -> Option<std::path::PathBuf> {
    for ext in ["yml", "yaml"] {
        let p = config::templates_dir().join(format!("{name}.{ext}"));
        if p.exists() {
            return Some(p);
        }
    }
    None
}

#[tauri::command]
pub fn list_templates() -> Result<Vec<TemplateInfo>, String> {
    let dir = config::templates_dir();
    let entries = match std::fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return Ok(vec![]),
    };
    let mut out: Vec<TemplateInfo> = entries
        .flatten()
        .filter_map(|e| {
            let p = e.path();
            let ext = p.extension().and_then(|s| s.to_str());
            if ext != Some("yml") && ext != Some("yaml") {
                return None;
            }
            let name = p.file_stem()?.to_str()?.to_string();
            if name.is_empty() {
                return None;
            }
            Some(TemplateInfo {
                name,
                path: p.to_string_lossy().into_owned(),
            })
        })
        .collect();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

#[tauri::command]
pub fn read_template(name: String) -> Result<String, String> {
    match template_file(&name) {
        Some(p) => std::fs::read_to_string(&p).map_err(|e| e.to_string()),
        None => Ok(String::new()), // blank canvas
    }
}

#[tauri::command]
pub fn save_template(app: AppHandle, name: String, content: String) -> Result<(), String> {
    serde_yaml::from_str::<serde_yaml::Value>(&content).map_err(|e| format!("invalid YAML: {e}"))?;
    config::ensure_dirs()?;
    let path = config::templates_dir().join(format!("{name}.yml"));
    config::write_config_file(&path, &content)?;
    let _ = app.emit("templates-changed", ());
    Ok(())
}

#[tauri::command]
pub fn create_template(app: AppHandle, name: String) -> Result<(), String> {
    if template_file(&name).is_some() {
        return Err(format!("template {name:?} already exists"));
    }
    config::ensure_dirs()?;
    let path = config::templates_dir().join(format!("{name}.yml"));
    std::fs::write(&path, "").map_err(|e| e.to_string())?;
    let _ = app.emit("templates-changed", ());
    Ok(())
}

#[tauri::command]
pub fn delete_template(app: AppHandle, name: String) -> Result<(), String> {
    for ext in ["yml", "yaml"] {
        let p = config::templates_dir().join(format!("{name}.{ext}"));
        match std::fs::remove_file(&p) {
            Ok(_) => {}
            Err(e) if e.kind() == ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    let _ = app.emit("templates-changed", ());
    Ok(())
}

#[tauri::command]
pub fn rename_template(app: AppHandle, old_name: String, new_name: String) -> Result<(), String> {
    if template_file(&new_name).is_some() {
        return Err(format!("template {new_name:?} already exists"));
    }
    let src = template_file(&old_name).ok_or_else(|| format!("template {old_name:?} not found"))?;
    let ext = src.extension().and_then(|s| s.to_str()).unwrap_or("yml");
    let dst = config::templates_dir().join(format!("{new_name}.{ext}"));
    std::fs::rename(&src, &dst).map_err(|e| e.to_string())?;
    let _ = app.emit("templates-changed", ());
    Ok(())
}

// ---- AI instruction files (~/.lpm/<key>-instructions.txt) -------------------

fn instructions_path(key: &str) -> std::path::PathBuf {
    config::lpm_dir().join(format!("{key}-instructions.txt"))
}

fn read_instructions(key: &str) -> Result<String, String> {
    match std::fs::read_to_string(instructions_path(key)) {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e.to_string()),
    }
}

fn save_instructions(key: &str, content: &str) -> Result<(), String> {
    config::ensure_dirs()?;
    std::fs::write(instructions_path(key), content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_commit_instructions() -> Result<String, String> {
    read_instructions("commit")
}
#[tauri::command]
pub fn save_commit_instructions(content: String) -> Result<(), String> {
    save_instructions("commit", &content)
}
#[tauri::command]
pub fn read_pr_title_instructions() -> Result<String, String> {
    read_instructions("pr-title")
}
#[tauri::command]
pub fn save_pr_title_instructions(content: String) -> Result<(), String> {
    save_instructions("pr-title", &content)
}
#[tauri::command]
pub fn read_pr_description_instructions() -> Result<String, String> {
    read_instructions("pr-description")
}
#[tauri::command]
pub fn save_pr_description_instructions(content: String) -> Result<(), String> {
    save_instructions("pr-description", &content)
}
#[tauri::command]
pub fn read_branch_name_instructions() -> Result<String, String> {
    read_instructions("branch-name")
}
#[tauri::command]
pub fn save_branch_name_instructions(content: String) -> Result<(), String> {
    save_instructions("branch-name", &content)
}
