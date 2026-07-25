// Read-only view over a project's shared agent memory (.lpm/memory/*.md).
// The files are written by agent CLIs via the lpm-memory skill; lpm displays
// them but never writes them.
use serde::Serialize;
use std::path::Path;
use std::time::UNIX_EPOCH;

const MAX_DOC_BYTES: u64 = 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryDoc {
    pub name: String,
    pub content: String,
    pub updated_at: i64,
    pub size: u64,
}

#[tauri::command(async)]
pub fn read_project_memory(root: String) -> Result<Vec<MemoryDoc>, String> {
    let dir = Path::new(&root).join(".lpm").join("memory");
    let entries = match std::fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(_) => return Ok(Vec::new()),
    };
    let mut docs = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let Some(name) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if name.is_empty() || name.starts_with('.') {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        if !meta.is_file() {
            continue;
        }
        let content = if meta.len() > MAX_DOC_BYTES {
            "_This memory is too large to display._".to_string()
        } else {
            match std::fs::read_to_string(&path) {
                Ok(content) => content,
                Err(_) => continue,
            }
        };
        let updated_at = meta
            .modified()
            .ok()
            .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        docs.push(MemoryDoc {
            name: name.to_string(),
            content,
            updated_at,
            size: meta.len(),
        });
    }
    docs.sort_by(|a, b| b.updated_at.cmp(&a.updated_at).then(a.name.cmp(&b.name)));
    Ok(docs)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root(dir: &tempfile::TempDir) -> String {
        dir.path().to_string_lossy().into_owned()
    }

    #[test]
    fn missing_dir_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read_project_memory(root(&dir)).unwrap().is_empty());
    }

    #[test]
    fn lists_only_visible_md_files() {
        let dir = tempfile::tempdir().unwrap();
        let mem = dir.path().join(".lpm").join("memory");
        std::fs::create_dir_all(&mem).unwrap();
        std::fs::write(mem.join("auth-refactor.md"), "# Auth refactor").unwrap();
        std::fs::write(mem.join("fix-freeze.md"), "# Fix freeze").unwrap();
        std::fs::write(mem.join("notes.txt"), "skip").unwrap();
        std::fs::write(mem.join(".hidden.md"), "skip").unwrap();
        std::fs::create_dir(mem.join("sub.md")).unwrap();
        let docs = read_project_memory(root(&dir)).unwrap();
        let mut names: Vec<&str> = docs.iter().map(|d| d.name.as_str()).collect();
        names.sort();
        assert_eq!(names, ["auth-refactor", "fix-freeze"]);
        let auth = docs.iter().find(|d| d.name == "auth-refactor").unwrap();
        assert_eq!(auth.content, "# Auth refactor");
        assert!(auth.updated_at > 0);
        assert_eq!(auth.size, "# Auth refactor".len() as u64);
    }
}
