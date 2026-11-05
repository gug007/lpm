// The git-ignored files a new worktree brings from its project — `.env` and the
// like, which a fresh checkout never has. The project that owns its worktrees
// (the original, for a worktree of a worktree) keeps the choice in its config:
//
//   worktreeFiles:
//     copy: [.env, .env.local]
//     link: [config/master.key]
//
// Without the key, worktrees copy the ignored files that look like local
// configuration; `worktreeFiles: {}` brings nothing.
use crate::config;
use crate::git::git_out;
use serde::{Deserialize, Serialize};
use serde_norway::{Mapping, Value as Yaml};
use std::path::{Component, Path};

const KEY: &str = "worktreeFiles";
const MAX_FILE_BYTES: u64 = 1024 * 1024;
const MAX_CANDIDATES: usize = 40;

#[derive(Serialize, Deserialize, Default, Clone, Debug, PartialEq)]
pub struct WorktreeFiles {
    #[serde(default)]
    pub copy: Vec<String>,
    #[serde(default)]
    pub link: Vec<String>,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub path: String,
    pub size: u64,
    pub suggested: bool,
}

#[derive(Serialize)]
pub struct WorktreeFileChoice {
    candidates: Vec<Candidate>,
    copy: Vec<String>,
    link: Vec<String>,
}

fn owner(name: &str) -> String {
    config::peek_parent(name).unwrap_or_else(|| name.to_string())
}

fn safe_relative(path: &str) -> bool {
    let p = Path::new(path);
    !path.trim().is_empty() && p.components().all(|c| matches!(c, Component::Normal(_)))
}

fn saved(owner: &str) -> Option<WorktreeFiles> {
    let bytes = std::fs::read(config::project_path(owner)).ok()?;
    let doc: Yaml = serde_norway::from_slice(&bytes).ok()?;
    let mut files: WorktreeFiles =
        serde_norway::from_value(doc.get(KEY)?.clone()).unwrap_or_default();
    files.copy.retain(|p| safe_relative(p));
    files.link.retain(|p| safe_relative(p));
    Some(files)
}

fn suggested(candidates: &[Candidate]) -> WorktreeFiles {
    WorktreeFiles {
        copy: candidates
            .iter()
            .filter(|c| c.suggested)
            .map(|c| c.path.clone())
            .collect(),
        link: Vec::new(),
    }
}

/// Whether a file name reads like local configuration or a secret, the kind a
/// worktree needs to start: env files, `*.local` overrides, keys.
fn looks_local(path: &str) -> bool {
    let name = path.rsplit('/').next().unwrap_or(path).to_ascii_lowercase();
    let template = [".example", ".sample", ".template", ".dist"]
        .iter()
        .any(|s| name.ends_with(s));
    if template {
        return false;
    }
    name == ".env"
        || name.starts_with(".env.")
        || name.ends_with(".local")
        || name.contains(".local.")
        || name.ends_with(".key")
        || name.ends_with(".pem")
        || name.starts_with("credentials")
        || name.starts_with("secrets")
}

/// The ignored files in `root` small enough to copy, local-looking ones first.
/// Ignored folders (node_modules, build output) are left out whole.
pub fn candidates(root: &str) -> Vec<Candidate> {
    let out = git_out(
        root,
        &[
            "ls-files",
            "--others",
            "--ignored",
            "--exclude-standard",
            "--directory",
            "-z",
        ],
    )
    .unwrap_or_default();
    let mut list: Vec<Candidate> = out
        .split('\0')
        .map(str::trim)
        .filter(|p| !p.is_empty() && !p.ends_with('/') && safe_relative(p))
        .filter_map(|p| {
            let meta = std::fs::metadata(Path::new(root).join(p)).ok()?;
            (meta.is_file() && meta.len() <= MAX_FILE_BYTES).then(|| Candidate {
                path: p.to_string(),
                size: meta.len(),
                suggested: looks_local(p),
            })
        })
        .collect();
    list.sort_by(|a, b| {
        b.suggested
            .cmp(&a.suggested)
            .then_with(|| a.path.cmp(&b.path))
    });
    list.truncate(MAX_CANDIDATES);
    list
}

/// The ignored files `name`'s worktrees can bring, and which ones they do.
#[tauri::command(async)]
pub fn worktree_files(name: String) -> Result<WorktreeFileChoice, String> {
    let (root, is_remote) = config::project_root(&name)?;
    if is_remote {
        return Err("An SSH project has no worktrees.".into());
    }
    let found = candidates(&root);
    let chosen = saved(&owner(&name)).unwrap_or_else(|| suggested(&found));
    Ok(WorktreeFileChoice {
        candidates: found,
        copy: chosen.copy,
        link: chosen.link,
    })
}

fn apply(doc: &mut Yaml, files: &WorktreeFiles) -> Result<bool, String> {
    let map = doc
        .as_mapping_mut()
        .ok_or_else(|| "The config file isn't valid.".to_string())?;
    let list =
        |paths: &[String]| Yaml::Sequence(paths.iter().map(|p| Yaml::from(p.as_str())).collect());
    let mut next = Mapping::new();
    if !files.copy.is_empty() {
        next.insert("copy".into(), list(&files.copy));
    }
    if !files.link.is_empty() {
        next.insert("link".into(), list(&files.link));
    }
    let next = Yaml::Mapping(next);
    if map.get(KEY) == Some(&next) {
        return Ok(false);
    }
    map.insert(KEY.into(), next);
    Ok(true)
}

/// Saves which ignored files `name`'s worktrees bring, in the config of the
/// project that owns them.
#[tauri::command(async)]
pub fn set_worktree_files(
    name: String,
    copy: Vec<String>,
    link: Vec<String>,
) -> Result<(), String> {
    if let Some(bad) = copy.iter().chain(&link).find(|p| !safe_relative(p)) {
        return Err(format!("{bad} isn't a path inside the project."));
    }
    let files = WorktreeFiles { copy, link };
    config::edit_project_yaml(&owner(&name), |doc| apply(doc, &files))?;
    Ok(())
}

#[cfg(unix)]
fn link_file(from: &Path, to: &Path) -> std::io::Result<()> {
    std::os::unix::fs::symlink(from, to)
}

// Windows lets only developer-mode or elevated users make symlinks, so a link
// that can't be made is a copy instead.
#[cfg(windows)]
fn link_file(from: &Path, to: &Path) -> std::io::Result<()> {
    std::os::windows::fs::symlink_file(from, to).or_else(|_| std::fs::copy(from, to).map(|_| ()))
}

fn bring_one(path: &str, sources: &[&Path], dest: &Path, link: bool) -> Result<(), String> {
    let target = dest.join(path);
    if target.symlink_metadata().is_ok() {
        return Ok(());
    }
    let Some(from) = sources.iter().map(|s| s.join(path)).find(|p| p.is_file()) else {
        return Ok(());
    };
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("{path}: {e}"))?;
    }
    let made = if link {
        link_file(&from, &target)
    } else {
        std::fs::copy(&from, &target).map(|_| ())
    };
    made.map_err(|e| format!("{path}: {e}"))
}

/// Puts `owner`'s chosen ignored files into a new worktree at `dest`, from the
/// tree it was made from or else the owner's own folder. Files already there are
/// left alone; returns the ones that couldn't be brought.
pub fn bring(owner: &str, from: &Path, dest: &Path) -> Vec<String> {
    let files = saved(owner).unwrap_or_else(|| suggested(&candidates(&from.to_string_lossy())));
    if files.copy.is_empty() && files.link.is_empty() {
        return Vec::new();
    }
    let owner_root = config::project_root(owner).ok().map(|(root, _)| root);
    let mut sources = vec![from];
    if let Some(root) = owner_root.as_deref() {
        sources.push(Path::new(root));
    }
    let copies = files.copy.iter().map(|p| (p, false));
    let links = files.link.iter().map(|p| (p, true));
    copies
        .chain(links)
        .filter_map(|(path, link)| bring_one(path, &sources, dest, link).err())
        .collect()
}

#[cfg(test)]
#[path = "worktree_files_tests.rs"]
mod tests;
