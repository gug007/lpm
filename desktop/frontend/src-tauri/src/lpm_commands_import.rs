// Import: turn the custom commands the agent CLIs already have into skills in an
// Imported folder, so a library built up in Claude Code or Codex works in every
// agent. The global list takes the user's own (Claude's commands folder, Codex's
// prompts folder); a project's list takes the project's .claude/commands.
use crate::lpm_commands::{parse_doc, skill_name, Scope, Stores};
use crate::lpm_commands_local::read_md_list;
use crate::lpm_commands_ops::create_skill;
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

/// Copy what isn't in the list yet; a name another skill holds is skipped. A
/// source's own folders are flattened into Imported. Returns how many skills
/// were added.
pub(crate) fn import(stores: &Stores, scope: Scope, from: &[PathBuf]) -> Result<usize, String> {
    let fs = stores.get(scope)?;
    let snap = fs.snapshot()?;
    let mut taken: HashSet<String> = snap
        .files
        .iter()
        .map(|f| f.name.clone())
        .chain(snap.others.iter().map(|n| n.to_lowercase()))
        .collect();
    let mut added = Vec::new();
    for dir in from {
        for file in read_md_list(dir).files {
            let doc = parse_doc(&file.content);
            let Some(name) = skill_name(&file.name).filter(|_| !doc.body.trim().is_empty()) else {
                continue;
            };
            if !taken.insert(name.clone()) {
                continue;
            }
            create_skill(fs, &name, doc.made_by_lpm())?;
            added.push(name);
        }
    }
    if !added.is_empty() {
        fs.update_layout(&mut |layout| {
            layout.keep(&snap.folders);
            layout.keep(&[IMPORT_FOLDER.to_string()]);
            for name in &added {
                layout.file(name, Some(IMPORT_FOLDER));
            }
        })?;
    }
    Ok(added.len())
}
