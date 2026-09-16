// First-launch seeding of ~/.lpm/global.yml.
//
// A fresh install has no actions anywhere, so the header of every project
// starts empty. Seeding a Claude Code and a Codex terminal action into the
// global layer gives each agent a one-click button in every project from the
// first launch, without touching any project's own config.
//
// This runs exactly once: the marker retires it for good, and an ~/.lpm that
// already holds a global.yml, settings, or any project belongs to an existing
// install and is left alone — those users already shaped their actions.
use std::path::Path;
use std::time::{Duration, UNIX_EPOCH};

const MARKER: &str = ".global-defaults-seeded";

// Peer sync resolves the first exchange between two Macs by file mtime with no
// conflict (newest wins). A file seeded on a new Mac would otherwise be the
// newest global.yml in the pair and overwrite the config the user actually
// wrote on the other one, so the seeded file is dated 2000-01-01: any real
// config on any peer is newer and wins.
const SEEDED_MTIME_SECS: u64 = 946_684_800;

pub const DEFAULT_GLOBAL_YML: &str = "actions:
  claude:
    label: Claude
    emoji: ✻
    cmd: claude
    type: terminal
    color: claude
  codex:
    label: Codex
    emoji: ◆
    cmd: codex
    type: terminal
    color: cyan-deep
";

pub fn seed_global_actions() {
    if let Err(e) = seed_at(&crate::config::lpm_dir()) {
        eprintln!("warning: failed to seed default global actions: {e}");
    }
}

fn seed_at(dir: &Path) -> std::io::Result<bool> {
    if dir.join(MARKER).exists() || !is_fresh_install(dir) {
        return Ok(false);
    }
    std::fs::create_dir_all(dir)?;
    let path = dir.join("global.yml");
    crate::fsatomic::write(
        &path,
        DEFAULT_GLOBAL_YML.as_bytes(),
        crate::fsatomic::Mode::Preserve(0o644),
    )?;
    std::fs::File::options()
        .write(true)
        .open(&path)?
        .set_modified(UNIX_EPOCH + Duration::from_secs(SEEDED_MTIME_SECS))?;
    std::fs::write(dir.join(MARKER), b"")?;
    Ok(true)
}

fn is_fresh_install(dir: &Path) -> bool {
    if dir.join("global.yml").exists() || dir.join("settings.json").exists() {
        return false;
    }
    match std::fs::read_dir(dir.join("projects")) {
        Ok(entries) => !entries
            .flatten()
            .any(|e| e.path().extension().and_then(|s| s.to_str()) == Some("yml")),
        Err(_) => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh_dir() -> (tempfile::TempDir, std::path::PathBuf) {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join(".lpm");
        (tmp, dir)
    }

    #[test]
    fn seeds_a_fresh_install_and_backdates_the_file() {
        let (_tmp, dir) = fresh_dir();
        assert!(seed_at(&dir).unwrap());
        let path = dir.join("global.yml");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), DEFAULT_GLOBAL_YML);
        assert!(dir.join(MARKER).exists());
        let mtime = std::fs::metadata(&path).unwrap().modified().unwrap();
        assert_eq!(
            mtime.duration_since(UNIX_EPOCH).unwrap().as_secs(),
            SEEDED_MTIME_SECS
        );
    }

    #[test]
    fn seeded_yaml_defines_both_agents_as_terminal_actions() {
        let doc: serde_norway::Value = serde_norway::from_str(DEFAULT_GLOBAL_YML).unwrap();
        let actions = doc.get("actions").unwrap();
        for (key, cmd) in [("claude", "claude"), ("codex", "codex")] {
            let action = actions.get(key).unwrap();
            assert_eq!(action.get("cmd").unwrap().as_str(), Some(cmd));
            assert_eq!(action.get("type").unwrap().as_str(), Some("terminal"));
            assert!(!action.get("label").unwrap().as_str().unwrap().is_empty());
        }
    }

    #[test]
    fn leaves_an_existing_global_yml_alone() {
        let (_tmp, dir) = fresh_dir();
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("global.yml"), "actions:\n  mine:\n    cmd: echo\n").unwrap();
        assert!(!seed_at(&dir).unwrap());
        assert_eq!(
            std::fs::read_to_string(dir.join("global.yml")).unwrap(),
            "actions:\n  mine:\n    cmd: echo\n"
        );
        assert!(!dir.join(MARKER).exists());
    }

    #[test]
    fn skips_an_install_that_has_settings() {
        let (_tmp, dir) = fresh_dir();
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("settings.json"), "{}").unwrap();
        assert!(!seed_at(&dir).unwrap());
        assert!(!dir.join("global.yml").exists());
    }

    #[test]
    fn skips_an_install_that_has_projects() {
        let (_tmp, dir) = fresh_dir();
        std::fs::create_dir_all(dir.join("projects")).unwrap();
        std::fs::write(dir.join("projects").join("app.yml"), "root: ~/app\n").unwrap();
        assert!(!seed_at(&dir).unwrap());
        assert!(!dir.join("global.yml").exists());
    }

    #[test]
    fn empty_projects_dir_still_counts_as_fresh() {
        let (_tmp, dir) = fresh_dir();
        std::fs::create_dir_all(dir.join("projects")).unwrap();
        assert!(seed_at(&dir).unwrap());
    }

    #[test]
    fn never_seeds_twice() {
        let (_tmp, dir) = fresh_dir();
        assert!(seed_at(&dir).unwrap());
        std::fs::remove_file(dir.join("global.yml")).unwrap();
        assert!(!seed_at(&dir).unwrap());
        assert!(!dir.join("global.yml").exists());
    }
}
