//! Reading any capability's defining file, and writing back the markdown ones.
//!
//! Writes are deliberately narrow: markdown only, under a known capability
//! root, compare-and-swap against the content the pane loaded. The JSON and
//! TOML files are rewritten by the agent CLIs continuously, so lpm never
//! read-modify-writes them and cannot lose another tool's changes.

use serde::Serialize;
use std::path::{Component, Path, PathBuf};

const MAX_DOC_BYTES: u64 = 512 * 1024;
const TOO_LARGE: &str = "This file is too large to show here. Open it in an editor.";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityDoc {
    pub path: String,
    pub content: String,
    /// False means the pane offers a read-only source view with no save.
    pub editable: bool,
    pub truncated: bool,
}

/// Absolute, no traversal, and inside a directory lpm knows the meaning of.
/// The project root is included so a project-scoped skill is editable, and the
/// check is on the literal path because a symlinked skill dir is still the
/// user's own file.
fn writable_root(path: &Path) -> bool {
    if !path.is_absolute() || path.components().any(|c| c == Component::ParentDir) {
        return false;
    }
    let home = dirs::home_dir().unwrap_or_default();
    let roots: Vec<PathBuf> = vec![
        home.join(".claude"),
        home.join(".codex"),
        home.join(".agents"),
    ];
    if roots.iter().any(|r| path.starts_with(r)) {
        return true;
    }
    // Project scope: a capability file inside a checkout, never the checkout
    // at large — `.claude/…`, `CLAUDE.md` and `AGENTS.md` only.
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    if name == "CLAUDE.md" || name == "AGENTS.md" {
        return true;
    }
    path.components()
        .any(|c| c.as_os_str() == ".claude" || c.as_os_str() == ".codex")
}

fn is_editable(path: &Path) -> bool {
    path.extension().and_then(|e| e.to_str()) == Some("md") && writable_root(path)
}

/// Reading is allowed for every file the scan can list — including the JSON and
/// TOML ones, which the pane shows read-only. Editing is the narrower gate.
#[tauri::command(async)]
pub fn read_agent_capability(path: String) -> Result<CapabilityDoc, String> {
    let p = PathBuf::from(&path);
    if !p.is_absolute() || p.components().any(|c| c == Component::ParentDir) {
        return Err("A capability path must be absolute.".into());
    }
    if crate::sshexec::remote_project_for_path(&path).is_some() {
        return Err("This capability lives on a remote host. Open it there to edit it.".into());
    }
    let meta = std::fs::metadata(&p).map_err(|e| format!("cannot read {path}: {e}"))?;
    let truncated = meta.len() > MAX_DOC_BYTES;
    let content = if truncated {
        TOO_LARGE.to_string()
    } else {
        std::fs::read_to_string(&p).map_err(|e| format!("cannot read {path}: {e}"))?
    };
    Ok(CapabilityDoc {
        path,
        content,
        editable: !truncated && is_editable(&p),
        truncated,
    })
}

/// `baseline` is what the pane last loaded. `Err("modified")` means another
/// writer — usually the agent itself — got there first, and the pane offers to
/// reload rather than clobbering.
#[tauri::command(async)]
pub fn write_agent_capability(
    path: String,
    content: String,
    baseline: Option<String>,
) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if crate::sshexec::remote_project_for_path(&path).is_some() {
        return Err("This capability lives on a remote host. Open it there to edit it.".into());
    }
    if !is_editable(&p) {
        return Err(
            "lpm only edits markdown capability files. Change this one with the agent's own \
             command so the CLI keeps ownership of its config format."
                .into(),
        );
    }
    if let Some(expected) = baseline {
        let current = match std::fs::read(&p) {
            Ok(bytes) => Some(String::from_utf8_lossy(&bytes).into_owned()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
            Err(e) => return Err(format!("cannot read {path}: {e}")),
        };
        let unchanged = match current {
            Some(ref on_disk) => *on_disk == expected,
            None => expected.is_empty(),
        };
        if !unchanged {
            return Err("modified".into());
        }
    }
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
    }
    crate::fsatomic::write(
        &p,
        content.as_bytes(),
        crate::fsatomic::Mode::Preserve(0o644),
    )
    .map_err(|e| format!("cannot write {path}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_markdown_under_a_known_root_is_editable() {
        let home = dirs::home_dir().unwrap_or_default();
        assert!(is_editable(&home.join(".claude/skills/deploy/SKILL.md")));
        assert!(is_editable(&home.join(".agents/skills/lpm/SKILL.md")));
        assert!(is_editable(Path::new("/repo/proj/.claude/agents/review.md")));
        assert!(is_editable(Path::new("/repo/proj/CLAUDE.md")));
    }

    #[test]
    fn config_files_other_tools_own_are_not_editable() {
        let home = dirs::home_dir().unwrap_or_default();
        assert!(!is_editable(&home.join(".claude.json")));
        assert!(!is_editable(&home.join(".codex/config.toml")));
        assert!(!is_editable(Path::new("/repo/proj/.mcp.json")));
    }

    #[test]
    fn traversal_and_relative_paths_are_rejected() {
        assert!(!is_editable(Path::new("../../etc/passwd.md")));
        assert!(!is_editable(Path::new("relative/SKILL.md")));
        assert!(!is_editable(Path::new("/repo/proj/.claude/../../x.md")));
    }

    #[test]
    fn an_ordinary_repo_file_is_not_a_capability() {
        assert!(!is_editable(Path::new("/repo/proj/src/main.md")));
        assert!(!is_editable(Path::new("/repo/proj/README.md")));
    }
}
