// Import: copy the custom commands the agent CLIs already have into an
// Imported folder, so a library built up in Claude Code or Codex works in
// every agent. The global list takes the user's own (Claude's commands folder,
// Codex's prompts folder); a project's list takes the project's .claude/commands.
use crate::lpm_commands::{parse_doc, rel_path, serialize_doc, CommandFs, LocalFs, Scope, Stores};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

pub(crate) const IMPORT_FOLDER: &str = "Imported";

pub(crate) fn sources(scope: Scope, project_root: Option<&str>) -> Vec<PathBuf> {
    match scope {
        Scope::Global => {
            let home = dirs::home_dir().unwrap_or_default();
            let claude = crate::agentdirs::claude_config_dir()
                .map(Path::to_path_buf)
                .unwrap_or_else(|| home.join(".claude"));
            let codex = crate::agentdirs::codex_home()
                .map(Path::to_path_buf)
                .unwrap_or_else(|| home.join(".codex"));
            vec![claude.join("commands"), codex.join("prompts")]
        }
        Scope::Project => project_root
            .map(|root| vec![Path::new(root).join(".claude").join("commands")])
            .unwrap_or_default(),
    }
}

/// Copy what isn't in the list yet; a name the list already has is skipped.
/// A source's own folders are flattened into Imported. Returns how many
/// commands were added.
pub(crate) fn import(stores: &Stores, scope: Scope, from: &[PathBuf]) -> Result<usize, String> {
    let fs: &dyn CommandFs = stores.get(scope)?;
    let mut taken: HashSet<String> = fs.snapshot()?.files.into_iter().map(|f| f.name.to_lowercase()).collect();
    let mut added = 0;
    for dir in from {
        for file in LocalFs::new(dir.clone()).snapshot()?.files {
            let doc = parse_doc(&file.content);
            if doc.body.trim().is_empty() || !taken.insert(file.name.to_lowercase()) {
                continue;
            }
            let text = serialize_doc(&doc.description, &doc.body, &doc.extra);
            fs.write(&rel_path(Some(IMPORT_FOLDER), &file.name), &text)?;
            added += 1;
        }
    }
    Ok(added)
}
