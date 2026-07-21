use serde::Serialize;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use toml_edit::{value, Array, DocumentMut, Item, Table};

const DEFAULT_ITEMS: [&str; 2] = ["model-with-reasoning", "current-dir"];
static RESOLVED_CODEX_HOME: OnceLock<Result<PathBuf, String>> = OnceLock::new();

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexStatuslineState {
    items: Vec<String>,
    configured: bool,
    use_colors: bool,
}

fn config_path() -> Result<PathBuf, String> {
    let codex_home = RESOLVED_CODEX_HOME
        .get_or_init(|| {
            crate::sys::capture_login_env("CODEX_HOME")
                .map(PathBuf::from)
                .or_else(|| {
                    std::env::var_os("CODEX_HOME")
                        .filter(|value| !value.is_empty())
                        .map(PathBuf::from)
                })
                .or_else(|| dirs::home_dir().map(|home| home.join(".codex")))
                .ok_or_else(|| "cannot resolve the Codex config directory".to_string())
        })
        .clone()?;
    Ok(codex_home.join("config.toml"))
}

fn read_document(path: &Path) -> Result<DocumentMut, String> {
    match std::fs::read_to_string(path) {
        Ok(content) => content
            .parse::<DocumentMut>()
            .map_err(|error| format!("invalid Codex config: {error}")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(DocumentMut::new()),
        Err(error) => Err(format!("cannot read Codex config: {error}")),
    }
}

fn statusline_state_at(path: &Path) -> Result<CodexStatuslineState, String> {
    let document = read_document(path)?;
    let Some(tui_item) = document.as_table().get("tui") else {
        return Ok(CodexStatuslineState {
            items: DEFAULT_ITEMS
                .iter()
                .map(|item| (*item).to_string())
                .collect(),
            configured: false,
            use_colors: true,
        });
    };
    let tui = tui_item
        .as_table_like()
        .ok_or_else(|| "invalid Codex config: tui must be a table".to_string())?;
    let configured = tui.contains_key("status_line");
    let items = match tui.get("status_line") {
        Some(item) => item
            .as_array()
            .ok_or_else(|| "invalid Codex config: tui.status_line must be an array".to_string())?
            .iter()
            .map(|value| {
                value.as_str().map(str::to_string).ok_or_else(|| {
                    "invalid Codex config: tui.status_line entries must be strings".to_string()
                })
            })
            .collect::<Result<Vec<_>, _>>()?,
        None => DEFAULT_ITEMS
            .iter()
            .map(|item| (*item).to_string())
            .collect(),
    };
    let use_colors = match tui.get("status_line_use_colors") {
        Some(item) => item.as_bool().ok_or_else(|| {
            "invalid Codex config: tui.status_line_use_colors must be a boolean".to_string()
        })?,
        None => true,
    };
    Ok(CodexStatuslineState {
        items,
        configured,
        use_colors,
    })
}

fn write_document(path: &Path, document: &DocumentMut) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Codex config path has no parent directory".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|error| format!("cannot create Codex config directory: {error}"))?;
    let mut temp = tempfile::NamedTempFile::new_in(parent)
        .map_err(|error| format!("cannot create temporary Codex config: {error}"))?;
    if let Ok(metadata) = std::fs::metadata(path) {
        temp.as_file()
            .set_permissions(metadata.permissions())
            .map_err(|error| format!("cannot preserve Codex config permissions: {error}"))?;
    }
    temp.write_all(document.to_string().as_bytes())
        .map_err(|error| format!("cannot write Codex config: {error}"))?;
    temp.as_file()
        .sync_all()
        .map_err(|error| format!("cannot sync Codex config: {error}"))?;
    temp.persist(path)
        .map_err(|error| format!("cannot replace Codex config: {}", error.error))?;
    Ok(())
}

fn writable_config_path(path: &Path) -> Result<PathBuf, String> {
    match std::fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => std::fs::canonicalize(path)
            .map_err(|error| format!("cannot resolve Codex config symlink: {error}")),
        Ok(_) => Ok(path.to_path_buf()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(path.to_path_buf()),
        Err(error) => Err(format!("cannot inspect Codex config: {error}")),
    }
}

fn apply_statusline_at(path: &Path, items: &[String], use_colors: bool) -> Result<(), String> {
    let path = writable_config_path(path)?;
    let mut document = read_document(&path)?;
    let tui_item = document
        .as_table_mut()
        .entry("tui")
        .or_insert(Item::Table(Table::new()));
    let tui = tui_item
        .as_table_like_mut()
        .ok_or_else(|| "invalid Codex config: tui must be a table".to_string())?;
    let mut status_line = Array::new();
    for item in items {
        status_line.push(item.as_str());
    }
    tui.insert("status_line", value(status_line));
    tui.insert("status_line_use_colors", value(use_colors));
    write_document(&path, &document)
}

#[tauri::command(async)]
pub fn get_codex_statusline_state() -> Result<CodexStatuslineState, String> {
    statusline_state_at(&config_path()?)
}

#[tauri::command(async)]
pub fn apply_codex_statusline(items: Vec<String>, use_colors: bool) -> Result<(), String> {
    apply_statusline_at(&config_path()?, &items, use_colors)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_config_uses_codex_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let state = statusline_state_at(&dir.path().join("config.toml")).unwrap();
        assert_eq!(state.items, DEFAULT_ITEMS);
        assert!(!state.configured);
        assert!(state.use_colors);
    }

    #[test]
    fn reads_explicit_statusline_settings() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        std::fs::write(
            &path,
            "[tui]\nstatus_line = [\"git-branch\", \"future-item\"]\nstatus_line_use_colors = false\n",
        )
        .unwrap();
        let state = statusline_state_at(&path).unwrap();
        assert_eq!(state.items, ["git-branch", "future-item"]);
        assert!(state.configured);
        assert!(!state.use_colors);
    }

    #[test]
    fn empty_statusline_is_preserved_as_off() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        apply_statusline_at(&path, &[], true).unwrap();
        let state = statusline_state_at(&path).unwrap();
        assert!(state.items.is_empty());
        assert!(state.configured);
    }

    #[test]
    fn apply_preserves_unrelated_config_and_comments() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        std::fs::write(
            &path,
            "# personal config\nmodel = \"gpt-5.5\"\n\n[features]\nhooks = true\n",
        )
        .unwrap();
        apply_statusline_at(
            &path,
            &["model".to_string(), "future-item".to_string()],
            false,
        )
        .unwrap();
        let content = std::fs::read_to_string(&path).unwrap();
        assert!(content.contains("# personal config"));
        assert!(content.contains("model = \"gpt-5.5\""));
        assert!(content.contains("[features]"));
        assert!(content.contains("hooks = true"));
        let state = statusline_state_at(&path).unwrap();
        assert_eq!(state.items, ["model", "future-item"]);
        assert!(!state.use_colors);
    }

    #[test]
    fn apply_preserves_inline_tui_table() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        std::fs::write(
            &path,
            "tui = { alternate_screen = \"never\", status_line = [\"model\"] }\n",
        )
        .unwrap();
        apply_statusline_at(&path, &["git-branch".to_string()], false).unwrap();
        let content = std::fs::read_to_string(&path).unwrap();
        assert!(content.contains("alternate_screen = \"never\""));
        let state = statusline_state_at(&path).unwrap();
        assert_eq!(state.items, ["git-branch"]);
        assert!(!state.use_colors);
    }

    #[test]
    fn apply_updates_symlink_target_without_replacing_link() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("shared.toml");
        let path = dir.path().join("config.toml");
        std::fs::write(&target, "model = \"gpt-5.2-codex\"\n").unwrap();
        std::os::unix::fs::symlink(&target, &path).unwrap();
        apply_statusline_at(&path, &["model".to_string()], true).unwrap();
        assert!(std::fs::symlink_metadata(&path)
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(statusline_state_at(&target).unwrap().items, ["model"]);
    }

    #[test]
    fn invalid_config_is_not_replaced() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        let invalid = "[tui\nstatus_line = []\n";
        std::fs::write(&path, invalid).unwrap();
        assert!(apply_statusline_at(&path, &["model".to_string()], true).is_err());
        assert_eq!(std::fs::read_to_string(path).unwrap(), invalid);
    }
}
