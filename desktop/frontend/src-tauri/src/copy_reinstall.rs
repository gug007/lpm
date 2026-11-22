// Copies whose dependencies were removed to free space (copy_space), and the
// folders they were removed from. The copy's next Start installs them again
// before any service runs, so freeing space never leaves a copy that can't start.
use crate::config;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const FILE: &str = "reinstall.json";

/// Kept only around reading and writing the file, never across an install.
static LOCK: Mutex<()> = Mutex::new(());

type Pending = BTreeMap<String, Vec<String>>;

fn file() -> PathBuf {
    config::lpm_dir().join(FILE)
}

fn load() -> Pending {
    std::fs::read(file())
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn save(pending: &Pending) -> Result<(), String> {
    let path = file();
    if pending.is_empty() {
        return match std::fs::remove_file(&path) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
            _ => Ok(()),
        };
    }
    let bytes = serde_json::to_vec_pretty(pending).map_err(|e| e.to_string())?;
    crate::fsatomic::write(&path, &bytes, crate::fsatomic::Mode::Preserve(0o644))
        .map_err(|e| format!("couldn't save {FILE}: {e}"))
}

fn key(rel: &Path) -> String {
    rel.to_string_lossy().replace('\\', "/")
}

/// Note that `dirs` (relative to the copy's root) lost their node_modules.
pub(crate) fn remember(name: &str, dirs: &[PathBuf]) -> Result<(), String> {
    if dirs.is_empty() {
        return Ok(());
    }
    let _guard = LOCK.lock().unwrap();
    let mut pending = load();
    let entry = pending.entry(name.to_string()).or_default();
    for dir in dirs {
        let k = key(dir);
        if !entry.contains(&k) {
            entry.push(k);
        }
    }
    save(&pending)
}

/// The folders to install in, shallowest first. Once the root has installed, a
/// folder without a lockfile of its own is a workspace member the root's
/// install already covered, so it's skipped rather than installed on its own.
pub(crate) fn install_order(root: &Path, dirs: &[String]) -> Vec<PathBuf> {
    let mut sorted: Vec<&String> = dirs.iter().collect();
    sorted.sort_by_key(|d| (d.matches('/').count() + usize::from(!d.is_empty()), d.as_str()));
    let root_listed = sorted.first().is_some_and(|d| d.is_empty());
    sorted
        .into_iter()
        .map(|d| if d.is_empty() { root.to_path_buf() } else { root.join(d) })
        .filter(|dir| dir == root || !root_listed || crate::detect::node::lockfile_manager(dir).is_some())
        .collect()
}

/// Before `name` starts: install the dependencies freeing space removed. A
/// failed install stops the start and is tried again next time.
pub(crate) fn reinstall_before_start(name: &str) -> Result<(), String> {
    let dirs = {
        let _guard = LOCK.lock().unwrap();
        match load().remove(name) {
            Some(dirs) => dirs,
            None => return Ok(()),
        }
    };
    if let Some(root) = crate::project_size::local_root(name)? {
        for dir in install_order(&root, &dirs) {
            if dir.join(crate::copy_space::DEPENDENCIES).is_dir() {
                continue;
            }
            let Some(pm) = crate::detect::package_manager_of(&dir) else {
                continue;
            };
            crate::projects_crud::run_install(&dir, pm)
                .map_err(|e| format!("Couldn't install dependencies before starting: {e}"))?;
        }
    }
    let _guard = LOCK.lock().unwrap();
    let mut pending = load();
    pending.remove(name);
    save(&pending)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn touch(path: &Path) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, "").unwrap();
    }

    #[test]
    fn installs_the_root_first_and_skips_workspace_members() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        touch(&root.join("website/package-lock.json"));
        let dirs = vec!["packages/ui".to_string(), String::new(), "website".to_string()];
        assert_eq!(
            install_order(root, &dirs),
            vec![root.to_path_buf(), root.join("website")]
        );
    }

    #[test]
    fn installs_nested_folders_when_the_root_had_none() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let dirs = vec!["b".to_string(), "a/c".to_string()];
        assert_eq!(install_order(root, &dirs), vec![root.join("b"), root.join("a/c")]);
    }
}
