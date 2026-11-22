// How much disk a project's folder takes, and how much of that a reinstall or a
// build would recreate, for the Archive page. The walk never follows a symlink,
// and an answer is kept for a few minutes so reopening the page doesn't walk
// node_modules again.
use crate::config;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const FRESH: Duration = Duration::from_secs(300);

/// Folders an install recreates, whatever the project.
const ALWAYS: &[&str] = &[
    "node_modules",
    ".venv",
    "__pycache__",
    ".next",
    ".nuxt",
    ".turbo",
    ".svelte-kit",
    ".parcel-cache",
];
/// Build output by convention only: counted when git tracks nothing inside.
const IF_UNTRACKED: &[&str] = &["target", "dist", "build", "venv"];

#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct Sized {
    pub bytes: u64,
    /// Rebuildable folders, as paths relative to the root, with their sizes.
    pub rebuildable: Vec<(PathBuf, u64)>,
}

fn cache() -> &'static Mutex<HashMap<PathBuf, (Sized, Instant)>> {
    static CACHE: OnceLock<Mutex<HashMap<PathBuf, (Sized, Instant)>>> = OnceLock::new();
    CACHE.get_or_init(Default::default)
}

/// The bytes of every file under `root`. Folders it can't read count as empty.
pub(crate) fn dir_size(root: &Path) -> u64 {
    let mut total = 0u64;
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            // DirEntry::metadata doesn't follow symlinks, so a link to a folder
            // outside the project (or back up into it) is never walked.
            let Ok(meta) = entry.metadata() else { continue };
            if meta.is_dir() {
                stack.push(entry.path());
            } else if meta.is_file() {
                total += meta.len();
            }
        }
    }
    total
}

fn candidate(name: &str) -> bool {
    ALWAYS.contains(&name) || IF_UNTRACKED.contains(&name)
}

/// The paths among `dirs` that git tracks something inside. Outside a git
/// repository every one counts as tracked, so only the ALWAYS names are freed.
pub(crate) fn tracked(root: &Path, dirs: &[PathBuf]) -> Vec<PathBuf> {
    if dirs.is_empty() {
        return Vec::new();
    }
    let mut args: Vec<String> = vec!["ls-files".into(), "-z".into(), "--".into()];
    args.extend(dirs.iter().map(|d| d.to_string_lossy().into_owned()));
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    match crate::git::git_out(&root.to_string_lossy(), &refs) {
        Ok(out) => dirs
            .iter()
            .filter(|d| out.split('\0').any(|f| Path::new(f).starts_with(d)))
            .cloned()
            .collect(),
        Err(_) => dirs.to_vec(),
    }
}

/// Walk `root` once: its size, and each rebuildable folder with its own.
/// A rebuildable folder is never searched for more of them.
pub(crate) fn measure(root: &Path) -> Sized {
    let mut total = 0u64;
    let mut found: Vec<PathBuf> = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(meta) = entry.metadata() else { continue };
            if meta.is_file() {
                total += meta.len();
            } else if meta.is_dir() {
                let path = entry.path();
                if entry.file_name().to_str().is_some_and(candidate) {
                    if let Ok(rel) = path.strip_prefix(root) {
                        found.push(rel.to_path_buf());
                        continue;
                    }
                }
                stack.push(path);
            }
        }
    }
    let conditional: Vec<PathBuf> = found
        .iter()
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| IF_UNTRACKED.contains(&n))
        })
        .cloned()
        .collect();
    let kept = tracked(root, &conditional);
    let mut rebuildable = Vec::new();
    for rel in found {
        let bytes = dir_size(&root.join(&rel));
        total += bytes;
        if !kept.contains(&rel) && bytes > 0 {
            rebuildable.push((rel, bytes));
        }
    }
    rebuildable.sort_by(|a, b| b.1.cmp(&a.1));
    Sized {
        bytes: total,
        rebuildable,
    }
}

/// The project's folder on this machine; none for an SSH project or a folder
/// that's gone.
pub(crate) fn local_root(name: &str) -> Result<Option<PathBuf>, String> {
    let (root, is_remote) = config::project_root(name)?;
    let root = PathBuf::from(root.trim());
    Ok((!is_remote && !root.as_os_str().is_empty() && root.is_dir()).then_some(root))
}

/// Measure `root` afresh next time, after something under it was freed.
pub(crate) fn forget(root: &Path) {
    cache().lock().unwrap().remove(root);
}

fn measured(root: &Path) -> Sized {
    if let Some((sized, at)) = cache().lock().unwrap().get(root) {
        if at.elapsed() < FRESH {
            return sized.clone();
        }
    }
    let sized = measure(root);
    cache()
        .lock()
        .unwrap()
        .insert(root.to_path_buf(), (sized.clone(), Instant::now()));
    sized
}

/// The size of the project's folder on this machine.
#[tauri::command(async)]
pub fn project_disk_size(name: String) -> Result<Option<u64>, String> {
    Ok(local_root(&name)?.map(|root| measured(&root).bytes))
}

/// The folder's size with what a reinstall or build would recreate:
/// `{ bytes, rebuildable: [{ path, bytes }] }`, biggest first.
#[tauri::command(async)]
pub fn project_size_breakdown(name: String) -> Result<Option<Value>, String> {
    Ok(local_root(&name)?.map(|root| {
        let sized = measured(&root);
        json!({
            "bytes": sized.bytes,
            "rebuildable": sized.rebuildable.iter().map(|(path, bytes)| json!({
                "path": path.to_string_lossy(),
                "bytes": bytes,
            })).collect::<Vec<_>>(),
        })
    }))
}

/// Move an archived project's rebuildable folders to the Trash and answer with
/// the bytes freed. The folders are found again here, never taken from the
/// caller, and only an archived project qualifies: nothing of it is running.
#[tauri::command(async)]
pub fn free_project_space(name: String) -> Result<u64, String> {
    if !crate::project_archive::hidden_names().contains(&name) {
        return Err(format!("{name:?} isn't archived"));
    }
    let Some(root) = local_root(&name)? else {
        return Ok(0);
    };
    let mut freed = 0u64;
    let mut failed: Option<String> = None;
    for (rel, bytes) in measure(&root).rebuildable {
        match crate::trash::move_to_trash(&root.join(&rel)) {
            Ok(()) => freed += bytes,
            Err(e) => failed = Some(format!("{}: {e}", rel.display())),
        }
    }
    cache().lock().unwrap().remove(&root);
    match failed {
        Some(e) if freed == 0 => Err(e),
        _ => Ok(freed),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(root: &Path, rel: &str, bytes: usize) {
        let path = root.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, vec![b'x'; bytes]).unwrap();
    }

    #[test]
    fn adds_up_nested_files() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "a.txt", 5);
        write(dir.path(), "src/deep/b.txt", 3);
        assert_eq!(dir_size(dir.path()), 8);
    }

    #[cfg(unix)]
    #[test]
    fn never_follows_a_symlink() {
        let outside = tempfile::tempdir().unwrap();
        write(outside.path(), "big.bin", 4096);
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "a.txt", 2);
        std::os::unix::fs::symlink(outside.path(), dir.path().join("link")).unwrap();
        std::os::unix::fs::symlink(dir.path(), dir.path().join("loop")).unwrap();
        assert_eq!(dir_size(dir.path()), 2);
    }

    #[test]
    fn a_missing_folder_is_empty() {
        assert_eq!(dir_size(Path::new("/definitely/not/here")), 0);
    }

    #[test]
    fn finds_install_folders_at_any_depth_and_counts_them_in_the_total() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "src/main.ts", 10);
        write(dir.path(), "node_modules/a/index.js", 100);
        write(dir.path(), "node_modules/a/node_modules/b/x.js", 50);
        write(dir.path(), "packages/web/node_modules/c.js", 30);
        let sized = measure(dir.path());
        assert_eq!(sized.bytes, 190);
        assert_eq!(
            sized.rebuildable,
            vec![
                (PathBuf::from("node_modules"), 150),
                (PathBuf::from("packages/web/node_modules"), 30),
            ]
        );
    }

    #[test]
    fn build_output_outside_git_is_left_alone() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "dist/app.js", 40);
        write(dir.path(), "target/debug/bin", 60);
        let sized = measure(dir.path());
        assert_eq!(sized.bytes, 100);
        assert!(sized.rebuildable.is_empty());
    }

    #[test]
    fn build_output_counts_only_when_git_tracks_nothing_inside() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_string_lossy().into_owned();
        let git = |args: &[&str]| crate::git::git_out(&root, args).unwrap();
        git(&["init", "-q"]);
        write(dir.path(), "dist/kept.js", 40);
        write(dir.path(), "build/out.js", 25);
        write(dir.path(), ".gitignore", 0);
        std::fs::write(dir.path().join(".gitignore"), "build/\n").unwrap();
        git(&["add", "dist/kept.js", ".gitignore"]);
        let sized = measure(dir.path());
        assert_eq!(sized.rebuildable, vec![(PathBuf::from("build"), 25)]);
    }
}
