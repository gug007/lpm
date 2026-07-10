// One-click installer for the bundled lpm agent skills. Writes the skill files
// into ~/.claude/skills/ so Claude Code can author lpm configs and drive the CLI.
// The skill sources are embedded at build time so the packaged app is
// self-contained.
use serde_json::{json, Value};
use std::path::PathBuf;

const LPM_CONFIG_SKILL: &str = include_str!("../../../../lpm-config/SKILL.md");
const LPM_CONFIG_YAML_SCHEMA: &str = include_str!("../../../../lpm-config/references/yaml-schema.md");
const LPM_CLI_SKILL: &str = include_str!("../../../../lpm-cli/SKILL.md");

struct SkillFile {
    rel_path: &'static str,
    content: &'static str,
}

const SKILL_FILES: &[SkillFile] = &[
    SkillFile { rel_path: "lpm-config/SKILL.md", content: LPM_CONFIG_SKILL },
    SkillFile { rel_path: "lpm-config/references/yaml-schema.md", content: LPM_CONFIG_YAML_SCHEMA },
    SkillFile { rel_path: "lpm-cli/SKILL.md", content: LPM_CLI_SKILL },
];

const ENTRY_SKILLS: &[&str] = &["lpm-config/SKILL.md", "lpm-cli/SKILL.md"];

fn skills_dir() -> PathBuf {
    dirs::home_dir().unwrap_or_default().join(".claude").join("skills")
}

fn status_at(dir: &std::path::Path) -> &'static str {
    let missing_entry = ENTRY_SKILLS.iter().any(|rel| !dir.join(rel).exists());
    if missing_entry {
        return "not-installed";
    }
    let outdated = SKILL_FILES.iter().any(|f| {
        std::fs::read_to_string(dir.join(f.rel_path))
            .map(|existing| existing != f.content)
            .unwrap_or(true)
    });
    if outdated {
        "outdated"
    } else {
        "installed"
    }
}

fn install_at(dir: &std::path::Path) -> Result<(), String> {
    for f in SKILL_FILES {
        let dest = dir.join(f.rel_path);
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("cannot create {}: {e}", parent.display()))?;
        }
        std::fs::write(&dest, f.content)
            .map_err(|e| format!("cannot write {}: {e}", dest.display()))?;
    }
    Ok(())
}

#[tauri::command(async)]
pub fn agent_skill_status() -> Result<Value, String> {
    Ok(json!({ "status": status_at(&skills_dir()) }))
}

#[tauri::command(async)]
pub fn install_agent_skill() -> Result<(), String> {
    install_at(&skills_dir())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn not_installed_when_entry_missing() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(status_at(dir.path()), "not-installed");
    }

    #[test]
    fn installed_after_install() {
        let dir = tempfile::tempdir().unwrap();
        install_at(dir.path()).unwrap();
        assert_eq!(status_at(dir.path()), "installed");
        for f in SKILL_FILES {
            assert!(dir.path().join(f.rel_path).exists(), "missing {}", f.rel_path);
        }
    }

    #[test]
    fn outdated_when_content_differs() {
        let dir = tempfile::tempdir().unwrap();
        install_at(dir.path()).unwrap();
        std::fs::write(dir.path().join("lpm-cli/SKILL.md"), "stale").unwrap();
        assert_eq!(status_at(dir.path()), "outdated");
    }

    #[test]
    fn install_overwrites_existing() {
        let dir = tempfile::tempdir().unwrap();
        install_at(dir.path()).unwrap();
        std::fs::write(dir.path().join("lpm-cli/SKILL.md"), "stale").unwrap();
        install_at(dir.path()).unwrap();
        assert_eq!(status_at(dir.path()), "installed");
    }
}
