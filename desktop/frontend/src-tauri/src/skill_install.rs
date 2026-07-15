// One-click installer for the bundled lpm agent skills. Writes the skill files
// into ~/.claude/skills (Claude Code) and ~/.agents/skills (the open-standard
// dir read by Codex, Gemini CLI, and OpenCode). The skill sources are embedded
// at build time so the packaged app is self-contained.
use serde_json::{json, Value};
use std::path::PathBuf;

const LPM_CONFIG_SKILL: &str = include_str!("../../../../lpm-config/SKILL.md");
const LPM_CONFIG_CORE: &str = include_str!("../../../../lpm-config/references/core.md");
const LPM_CONFIG_ACTIONS: &str = include_str!("../../../../lpm-config/references/actions.md");
const LPM_CONFIG_SHARING: &str = include_str!("../../../../lpm-config/references/sharing.md");
const LPM_CONFIG_SSH: &str = include_str!("../../../../lpm-config/references/ssh.md");
const LPM_CONFIG_VALIDATION: &str = include_str!("../../../../lpm-config/references/validation.md");
const LPM_CONFIG_OPENAI: &str = include_str!("../../../../lpm-config/agents/openai.yaml");
const LPM_CLI_SKILL: &str = include_str!("../../../../lpm-cli/SKILL.md");
const LPM_CLI_OPENAI: &str = include_str!("../../../../lpm-cli/agents/openai.yaml");
const LPM_SHORTCUT_SKILL: &str = include_str!("../../../../lpm/SKILL.md");
const LPM_SHORTCUT_OPENAI: &str = include_str!("../../../../lpm/agents/openai.yaml");

struct SkillFile {
    rel_path: &'static str,
    content: &'static str,
}

const SKILL_FILES: &[SkillFile] = &[
    SkillFile { rel_path: "lpm-config/SKILL.md", content: LPM_CONFIG_SKILL },
    SkillFile { rel_path: "lpm-config/references/core.md", content: LPM_CONFIG_CORE },
    SkillFile { rel_path: "lpm-config/references/actions.md", content: LPM_CONFIG_ACTIONS },
    SkillFile { rel_path: "lpm-config/references/sharing.md", content: LPM_CONFIG_SHARING },
    SkillFile { rel_path: "lpm-config/references/ssh.md", content: LPM_CONFIG_SSH },
    SkillFile { rel_path: "lpm-config/references/validation.md", content: LPM_CONFIG_VALIDATION },
    SkillFile { rel_path: "lpm-config/agents/openai.yaml", content: LPM_CONFIG_OPENAI },
    SkillFile { rel_path: "lpm-cli/SKILL.md", content: LPM_CLI_SKILL },
    SkillFile { rel_path: "lpm-cli/agents/openai.yaml", content: LPM_CLI_OPENAI },
    SkillFile { rel_path: "lpm/SKILL.md", content: LPM_SHORTCUT_SKILL },
    SkillFile { rel_path: "lpm/agents/openai.yaml", content: LPM_SHORTCUT_OPENAI },
];

const ENTRY_SKILLS: &[&str] = &["lpm-config/SKILL.md", "lpm-cli/SKILL.md"];
const REMOVED_SKILL_FILES: &[&str] = &["lpm-config/references/yaml-schema.md"];

fn targets() -> [PathBuf; 2] {
    let home = dirs::home_dir().unwrap_or_default();
    [
        home.join(".claude").join("skills"),
        home.join(".agents").join("skills"),
    ]
}

fn status_at(dir: &std::path::Path) -> &'static str {
    let missing_entry = ENTRY_SKILLS.iter().any(|rel| !dir.join(rel).exists());
    if missing_entry {
        return "not-installed";
    }
    if REMOVED_SKILL_FILES.iter().any(|rel| dir.join(rel).exists()) {
        return "outdated";
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
    for rel in REMOVED_SKILL_FILES {
        let path = dir.join(rel);
        if path.exists() {
            std::fs::remove_file(&path)
                .map_err(|e| format!("cannot remove {}: {e}", path.display()))?;
        }
    }
    Ok(())
}

/// Opted in = any entry skill present in any target. A partial presence still
/// counts so an install predating the second target dir upgrades gracefully:
/// it reads as "outdated" and Update/refresh fills both dirs, instead of
/// reading as never opted in.
fn opted_in(dirs: &[PathBuf]) -> bool {
    dirs.iter()
        .any(|d| ENTRY_SKILLS.iter().any(|rel| d.join(rel).exists()))
}

fn overall_status(dirs: &[PathBuf]) -> &'static str {
    if !opted_in(dirs) {
        return "not-installed";
    }
    if dirs.iter().all(|d| status_at(d) == "installed") {
        "installed"
    } else {
        "outdated"
    }
}

fn refresh_all(dirs: &[PathBuf]) {
    if overall_status(dirs) != "outdated" {
        return;
    }
    for d in dirs {
        if let Err(e) = install_at(d) {
            eprintln!("warning: agent skill refresh failed: {e}");
        }
    }
}

/// Startup repair: silently re-write the skills only when a previous install
/// exists but is stale or incomplete. Never installs fresh — absence means the
/// user never opted in (or removed them deliberately).
pub fn refresh_if_outdated() {
    refresh_all(&targets());
}

#[tauri::command(async)]
pub fn agent_skill_status() -> Result<Value, String> {
    Ok(json!({ "status": overall_status(&targets()) }))
}

#[tauri::command(async)]
pub fn install_agent_skill() -> Result<(), String> {
    for d in targets() {
        install_at(&d)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pair(a: &tempfile::TempDir, b: &tempfile::TempDir) -> Vec<PathBuf> {
        vec![a.path().to_path_buf(), b.path().to_path_buf()]
    }

    fn is_empty(dir: &std::path::Path) -> bool {
        std::fs::read_dir(dir).unwrap().next().is_none()
    }

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

    #[test]
    fn install_removes_replaced_schema() {
        let dir = tempfile::tempdir().unwrap();
        install_at(dir.path()).unwrap();
        let stale = dir.path().join(REMOVED_SKILL_FILES[0]);
        std::fs::create_dir_all(stale.parent().unwrap()).unwrap();
        std::fs::write(&stale, "stale").unwrap();
        assert_eq!(status_at(dir.path()), "outdated");
        install_at(dir.path()).unwrap();
        assert!(!stale.exists());
        assert_eq!(status_at(dir.path()), "installed");
    }

    #[test]
    fn nothing_anywhere_is_not_installed_and_refresh_noop() {
        let a = tempfile::tempdir().unwrap();
        let b = tempfile::tempdir().unwrap();
        let dirs = pair(&a, &b);
        assert_eq!(overall_status(&dirs), "not-installed");
        refresh_all(&dirs);
        assert!(is_empty(a.path()) && is_empty(b.path()));
    }

    #[test]
    fn one_dir_installed_other_empty_is_outdated_and_refresh_fills() {
        let a = tempfile::tempdir().unwrap();
        let b = tempfile::tempdir().unwrap();
        install_at(a.path()).unwrap();
        let dirs = pair(&a, &b);
        assert_eq!(overall_status(&dirs), "outdated");
        refresh_all(&dirs);
        assert_eq!(overall_status(&dirs), "installed");
        assert_eq!(status_at(b.path()), "installed");
    }

    #[test]
    fn one_stale_dir_is_outdated_and_refresh_fixes() {
        let a = tempfile::tempdir().unwrap();
        let b = tempfile::tempdir().unwrap();
        install_at(a.path()).unwrap();
        install_at(b.path()).unwrap();
        std::fs::write(b.path().join("lpm-cli/SKILL.md"), "stale").unwrap();
        let dirs = pair(&a, &b);
        assert_eq!(overall_status(&dirs), "outdated");
        refresh_all(&dirs);
        assert_eq!(overall_status(&dirs), "installed");
    }

    #[test]
    fn both_current_is_installed_and_refresh_noop() {
        let a = tempfile::tempdir().unwrap();
        let b = tempfile::tempdir().unwrap();
        install_at(a.path()).unwrap();
        install_at(b.path()).unwrap();
        let dirs = pair(&a, &b);
        assert_eq!(overall_status(&dirs), "installed");
        refresh_all(&dirs);
        assert_eq!(overall_status(&dirs), "installed");
    }
}
