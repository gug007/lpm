// Config export/import — port of desktop/transfer.go.
//
// ExportConfig writes a tar.gz of the portable subset of ~/.lpm (projects/,
// zdotdir/, a few top-level files, sanitized settings.json). Notes (encrypted
// db + blobs) and templates/ are deliberately EXCLUDED. ImportConfig snapshots
// the current config to ~/.lpm.backup-<ts> first, then merges the archive in:
// projects honor `overwrite` (kept ones reported as skipped); top-level files
// always clobber; settings.json always merges (preserving per-machine keys).
use crate::config;
use serde::Serialize;
use serde_json::{Map, Value};
use std::collections::HashSet;
use std::io::Write;
use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt, PermissionsExt};
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Emitter};

const TOP_LEVEL_FILES: [&str; 5] = [
    "global.yml",
    "terminals.json",
    "commit-instructions.txt",
    "pr-title-instructions.txt",
    "pr-description-instructions.txt",
];
const PER_MACHINE_KEYS: [&str; 4] =
    ["windowWidth", "windowHeight", "sidebarWidth", "lastSelectedProject"];
// Hardening Go lacks: bound extraction so a crafted archive can't exhaust disk.
const MAX_ENTRY_BYTES: u64 = 256 * 1024 * 1024;
const MAX_TOTAL_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub imported: Vec<String>,
    pub skipped: Vec<String>,
    pub missing_roots: Vec<MissingRoot>,
    pub missing_tools: Vec<String>,
    pub backup_path: String,
}

#[derive(Serialize, Default)]
pub struct MissingRoot {
    pub project: String,
    pub root: String,
}

// ---- export ----------------------------------------------------------------

#[tauri::command]
pub async fn export_config(app: AppHandle) -> Result<String, String> {
    use tauri_plugin_dialog::DialogExt;
    let Some(dir) = crate::files::pick_path(app, |app| {
        app.dialog()
            .file()
            .set_title("Choose export folder")
            .blocking_pick_folder()
    })
    .await?
    else {
        return Ok(String::new());
    };
    let filename = format!(
        "lpm-config-{}-{}.tar.gz",
        config::sanitize_host(&config::hostname_or_mac()),
        chrono::Local::now().format("%Y%m%d-%H%M%S")
    );
    let path = dir.join(filename);
    match build_archive(&path) {
        Ok(()) => Ok(path.to_string_lossy().into_owned()),
        Err(e) => {
            let _ = std::fs::remove_file(&path);
            Err(e)
        }
    }
}

fn build_archive(path: &Path) -> Result<(), String> {
    let file = std::fs::File::create(path).map_err(|e| e.to_string())?;
    let gz = flate2::write::GzEncoder::new(file, flate2::Compression::default());
    let mut tw = tar::Builder::new(gz);
    tw.follow_symlinks(false); // archive symlinks as links (dropped on extract), never follow

    let root = config::lpm_dir();

    let projects = config::projects_dir();
    if projects.is_dir() {
        tw.append_dir_all("projects", &projects).map_err(|e| e.to_string())?;
    }
    let zdot = root.join("zdotdir");
    if zdot.is_dir() {
        tw.append_dir_all("zdotdir", &zdot).map_err(|e| e.to_string())?;
    }
    for name in TOP_LEVEL_FILES {
        let p = root.join(name);
        if p.is_file() {
            tw.append_path_with_name(&p, name).map_err(|e| e.to_string())?;
        }
    }
    if let Some(data) = sanitized_settings()? {
        let mut h = tar::Header::new_gnu();
        h.set_mode(0o644);
        h.set_size(data.len() as u64);
        h.set_mtime(now_secs());
        tw.append_data(&mut h, "settings.json", data.as_slice())
            .map_err(|e| e.to_string())?;
    }

    let gz = tw.into_inner().map_err(|e| e.to_string())?; // finish tar
    let file = gz.finish().map_err(|e| e.to_string())?; // finish gzip
    file.sync_all().ok();
    Ok(())
}

/// settings.json with per-machine keys stripped, 2-space JSON. None if absent.
fn sanitized_settings() -> Result<Option<Vec<u8>>, String> {
    let data = match std::fs::read(config::settings_path()) {
        Ok(d) => d,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };
    let mut raw: Map<String, Value> = serde_json::from_slice(&data).map_err(|e| e.to_string())?;
    for k in PER_MACHINE_KEYS {
        raw.remove(k);
    }
    let out = serde_json::to_string_pretty(&Value::Object(raw)).map_err(|e| e.to_string())?;
    Ok(Some(out.into_bytes()))
}

// ---- import ----------------------------------------------------------------

#[tauri::command]
pub async fn import_config(app: AppHandle, overwrite: bool) -> Result<Option<ImportReport>, String> {
    use tauri_plugin_dialog::DialogExt;
    // Clone: the original `app` is still needed for the projects-changed emit below.
    let Some(archive) = crate::files::pick_path(app.clone(), |app| {
        app.dialog()
            .file()
            .set_title("Import lpm config")
            .blocking_pick_file()
    })
    .await?
    else {
        return Ok(None);
    };

    let tmp = tempfile::Builder::new()
        .prefix("lpm-import-")
        .tempdir()
        .map_err(|e| e.to_string())?;
    extract_tar_gz(&archive, tmp.path()).map_err(|e| format!("extract archive: {e}"))?;

    let valid = std::iter::once("projects")
        .chain(std::iter::once("settings.json"))
        .chain(TOP_LEVEL_FILES)
        .any(|n| tmp.path().join(n).exists());
    if !valid {
        return Err("archive does not contain an lpm config".into());
    }

    let backup = format!(
        "{}.backup-{}",
        config::lpm_dir().to_string_lossy(),
        chrono::Local::now().format("%Y%m%d-%H%M%S")
    );
    snapshot_lpm(&config::lpm_dir(), Path::new(&backup))
        .map_err(|e| format!("snapshot existing config: {e}"))?;

    let mut report = ImportReport {
        backup_path: backup,
        ..Default::default()
    };
    apply_import(tmp.path(), overwrite, &mut report)?;
    let (roots, tools) = detect_import_issues();
    report.missing_roots = roots;
    report.missing_tools = tools;

    let _ = app.emit("projects-changed", ());
    Ok(Some(report))
}

fn extract_tar_gz(src: &Path, dst: &Path) -> Result<(), String> {
    let f = std::fs::File::open(src).map_err(|e| e.to_string())?;
    let gz = flate2::read::GzDecoder::new(f);
    let mut ar = tar::Archive::new(gz);
    let mut total: u64 = 0;
    for entry in ar.entries().map_err(|e| e.to_string())? {
        let mut entry = entry.map_err(|e| e.to_string())?;
        let raw = entry.path().map_err(|e| e.to_string())?.into_owned();
        let rel = match safe_relative(&raw) {
            Some(r) if !r.as_os_str().is_empty() => r,
            Some(_) => continue,                                        // "." / empty
            None => return Err(format!("unsafe archive entry {:?}", raw.to_string_lossy())),
        };
        let target = dst.join(&rel);
        let mode = entry.header().mode().unwrap_or(0o644) & 0o777;
        match entry.header().entry_type() {
            tar::EntryType::Directory => {
                std::fs::DirBuilder::new()
                    .recursive(true)
                    .mode(mode)
                    .create(&target)
                    .map_err(|e| e.to_string())?;
            }
            tar::EntryType::Regular => {
                let size = entry.header().size().unwrap_or(0);
                if size > MAX_ENTRY_BYTES {
                    return Err("archive entry too large".into());
                }
                total += size;
                if total > MAX_TOTAL_BYTES {
                    return Err("archive too large".into());
                }
                if let Some(p) = target.parent() {
                    std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
                }
                let mut out = std::fs::OpenOptions::new()
                    .create(true)
                    .write(true)
                    .truncate(true)
                    .mode(mode)
                    .open(&target)
                    .map_err(|e| e.to_string())?;
                std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
            }
            _ => {} // symlinks / hardlinks / special: silently ignored (matches Go)
        }
    }
    Ok(())
}

/// Lexical safety: returns the normalized relative path, or None if the entry
/// is absolute or escapes via `..`. CurDir segments are dropped.
fn safe_relative(name: &Path) -> Option<PathBuf> {
    let mut rel = PathBuf::new();
    for comp in name.components() {
        match comp {
            Component::Normal(s) => rel.push(s),
            Component::CurDir => {}
            _ => return None, // ParentDir / RootDir / Prefix
        }
    }
    Some(rel)
}

fn snapshot_lpm(src: &Path, dst: &Path) -> Result<(), String> {
    let info = match std::fs::metadata(src) {
        Ok(i) => i,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e.to_string()),
    };
    mkdir_mode(dst, info.permissions().mode())?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if name_str == "lpm.sock" || name_str.ends_with(".sock") {
            continue;
        }
        let sp = entry.path();
        let dp = dst.join(&name);
        let meta = std::fs::symlink_metadata(&sp).map_err(|e| e.to_string())?;
        if meta.file_type().is_symlink() {
            continue; // top-level symlinks skipped (Go: !IsDir && !IsRegular)
        } else if meta.is_dir() {
            copy_tree(&sp, &dp, meta.permissions().mode())?;
        } else if meta.is_file() {
            copy_file(&sp, &dp, meta.permissions().mode())?;
        }
    }
    Ok(())
}

fn apply_import(tmp: &Path, overwrite: bool, report: &mut ImportReport) -> Result<(), String> {
    let dst = config::lpm_dir();
    std::fs::create_dir_all(&dst).map_err(|e| e.to_string())?;

    // Projects: skip existing when !overwrite (reported skipped); else copy.
    let proj_src = tmp.join("projects");
    if let Ok(entries) = std::fs::read_dir(&proj_src) {
        std::fs::create_dir_all(config::projects_dir()).map_err(|e| e.to_string())?;
        let mut names: Vec<String> = entries
            .flatten()
            .filter(|e| {
                e.path().extension().and_then(|x| x.to_str()) == Some("yml")
                    && e.path().is_file()
            })
            .filter_map(|e| e.file_name().to_str().map(String::from))
            .collect();
        names.sort();
        for file in names {
            let stem = file.trim_end_matches(".yml").to_string();
            let dst_file = config::projects_dir().join(&file);
            if dst_file.exists() && !overwrite {
                report.skipped.push(stem);
                continue;
            }
            copy_file(&proj_src.join(&file), &dst_file, 0o644)?;
            report.imported.push(stem);
        }
    }

    // Top-level files: always clobber (overwrite ignored).
    for n in TOP_LEVEL_FILES {
        let src = tmp.join(n);
        if src.is_file() {
            copy_file(&src, &dst.join(n), 0o644)?;
        }
    }

    // settings.json: always merge (preserving per-machine keys).
    let settings_src = tmp.join("settings.json");
    if settings_src.is_file() {
        merge_settings_file(&settings_src, &config::settings_path())?;
    }

    // zdotdir: copy when absent or overwriting (replacing the old tree).
    let zdot_src = tmp.join("zdotdir");
    if zdot_src.is_dir() {
        let zdot_dst = dst.join("zdotdir");
        let exists = zdot_dst.exists();
        if !exists || overwrite {
            if exists {
                std::fs::remove_dir_all(&zdot_dst).map_err(|e| e.to_string())?;
            }
            let mode = std::fs::metadata(&zdot_src).map_err(|e| e.to_string())?.permissions().mode();
            copy_tree(&zdot_src, &zdot_dst, mode)?;
        }
    }
    Ok(())
}

fn merge_settings_file(src: &Path, dst: &Path) -> Result<(), String> {
    let incoming: Map<String, Value> =
        serde_json::from_slice(&std::fs::read(src).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    let mut current: Map<String, Value> = std::fs::read(dst)
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default();
    let keep: Vec<(String, Value)> = PER_MACHINE_KEYS
        .iter()
        .filter_map(|k| current.get(*k).map(|v| (k.to_string(), v.clone())))
        .collect();
    for (k, v) in incoming {
        current.insert(k, v); // incoming wins
    }
    for (k, v) in keep {
        current.insert(k, v); // per-machine values re-applied last
    }
    let out = serde_json::to_string_pretty(&Value::Object(current)).map_err(|e| e.to_string())?;
    write_mode(dst, out.as_bytes(), 0o644)
}

/// Advisory lists for the import report: local projects whose root is gone, and
/// referenced command tools missing from PATH. Never blocks import.
fn detect_import_issues() -> (Vec<MissingRoot>, Vec<String>) {
    let mut missing_roots = Vec::new();
    let mut missing_tools = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    for name in config::project_names() {
        if let Ok((root, is_remote)) = config::project_root(&name) {
            if !is_remote && !root.is_empty() && !Path::new(&root).is_dir() {
                missing_roots.push(MissingRoot { project: name.clone(), root });
            }
        }
        for cmd in config::project_cmd_strings(&name) {
            if let Some(tool) = program_token(&cmd) {
                if tool.contains('/') || !seen.insert(tool.clone()) {
                    continue;
                }
                if !crate::sys::which(&tool) {
                    missing_tools.push(tool);
                }
            }
        }
    }
    missing_roots.sort_by(|a, b| a.project.cmp(&b.project));
    missing_tools.sort();
    (missing_roots, missing_tools)
}

/// First whitespace token that isn't a `VAR=val` env assignment (programToken).
fn program_token(cmd: &str) -> Option<String> {
    cmd.split_whitespace()
        .find(|f| !f.contains('='))
        .map(String::from)
}

// ---- fs helpers (port of duplicate.go copyFile/copyTree) --------------------

fn copy_file(src: &Path, dst: &Path, mode: u32) -> Result<(), String> {
    let data = std::fs::read(src).map_err(|e| e.to_string())?;
    write_mode(dst, &data, mode & 0o777)
}

fn write_mode(dst: &Path, data: &[u8], mode: u32) -> Result<(), String> {
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .mode(mode)
        .open(dst)
        .map_err(|e| e.to_string())?;
    f.write_all(data).map_err(|e| e.to_string())
}

fn copy_tree(src: &Path, dst: &Path, mode: u32) -> Result<(), String> {
    mkdir_mode(dst, mode)?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let sp = entry.path();
        let dp = dst.join(entry.file_name());
        let meta = std::fs::symlink_metadata(&sp).map_err(|e| e.to_string())?;
        if meta.file_type().is_symlink() {
            let target = std::fs::read_link(&sp).map_err(|e| e.to_string())?;
            std::os::unix::fs::symlink(target, &dp).map_err(|e| e.to_string())?;
        } else if meta.is_dir() {
            copy_tree(&sp, &dp, meta.permissions().mode())?;
        } else {
            copy_file(&sp, &dp, meta.permissions().mode())?;
        }
    }
    Ok(())
}

fn mkdir_mode(dir: &Path, mode: u32) -> Result<(), String> {
    std::fs::DirBuilder::new()
        .recursive(true)
        .mode(mode & 0o777)
        .create(dir)
        .map_err(|e| e.to_string())
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_relative_blocks_traversal() {
        assert_eq!(safe_relative(Path::new("projects/a.yml")), Some(PathBuf::from("projects/a.yml")));
        assert_eq!(safe_relative(Path::new("./x")), Some(PathBuf::from("x")));
        assert_eq!(safe_relative(Path::new(".")), Some(PathBuf::new())); // empty -> skipped by caller
        assert_eq!(safe_relative(Path::new("../etc/passwd")), None);
        assert_eq!(safe_relative(Path::new("/abs/path")), None);
        assert_eq!(safe_relative(Path::new("a/../../b")), None);
    }

    #[test]
    fn extract_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let archive = dir.path().join("c.tar.gz");
        {
            let f = std::fs::File::create(&archive).unwrap();
            let gz = flate2::write::GzEncoder::new(f, flate2::Compression::default());
            let mut tw = tar::Builder::new(gz);
            for (name, body) in [("global.yml", &b"root: ~/x"[..]), ("projects/a.yml", &b"hi"[..])] {
                let mut h = tar::Header::new_gnu();
                h.set_mode(0o644);
                h.set_size(body.len() as u64);
                h.set_mtime(0);
                tw.append_data(&mut h, name, body).unwrap();
            }
            tw.into_inner().unwrap().finish().unwrap();
        }
        let out = dir.path().join("extracted");
        std::fs::create_dir_all(&out).unwrap();
        extract_tar_gz(&archive, &out).unwrap();
        assert_eq!(std::fs::read_to_string(out.join("global.yml")).unwrap(), "root: ~/x");
        assert_eq!(std::fs::read_to_string(out.join("projects/a.yml")).unwrap(), "hi"); // nested dir created
    }

    #[test]
    fn merge_settings_preserves_per_machine_and_incoming_wins() {
        let dir = tempfile::tempdir().unwrap();
        let dst = dir.path().join("settings.json");
        std::fs::write(&dst, r#"{"windowWidth":1,"theme":"dark","sidebarWidth":250}"#).unwrap();
        let src = dir.path().join("incoming.json");
        std::fs::write(&src, r#"{"theme":"light","model":"opus","windowWidth":9999}"#).unwrap();
        merge_settings_file(&src, &dst).unwrap();
        let v: Value = serde_json::from_slice(&std::fs::read(&dst).unwrap()).unwrap();
        assert_eq!(v["theme"], "light"); // incoming wins
        assert_eq!(v["model"], "opus"); // incoming added
        assert_eq!(v["windowWidth"], 1); // per-machine preserved despite incoming 9999
        assert_eq!(v["sidebarWidth"], 250);
    }
}
