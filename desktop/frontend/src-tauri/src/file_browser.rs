// The Files tab: browse a project one directory at a time and read one file
// with the verdicts the editor needs up front (binary, too large, writable).
// Local projects read the disk; SSH projects run the same listing and read on
// the host through sshexec, the way list_dir_files does for the mention picker.
use crate::config::{expand_home, SshSettings};
use crate::files::READ_FILE_MAX_BYTES;
use crate::git::is_binary;
use crate::gitignore::{ignored_names, remote_ignored_names};
use crate::sshexec::{remote_output, remote_project_for_path};
use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};

/// VCS internals are never worth browsing and are dangerous to edit by hand.
const HIDDEN_DIRS: &[&str] = &[".git", ".svn", ".hg"];

#[derive(Debug, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DirEntryInfo {
    pub name: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    /// Matched by a .gitignore rule and not tracked: shown greyed, like VS Code.
    pub is_ignored: bool,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFileContent {
    pub content: String,
    pub binary: bool,
    pub too_large: bool,
    pub size: u64,
    /// False on an SSH host, where nothing writes files back yet.
    pub writable: bool,
}

/// A project-relative path handed back from a listing, normalised and confined
/// to the root: no absolute paths, no `..`, no empty segments.
fn checked_rel(rel: &str) -> Result<String, String> {
    let mut parts: Vec<&str> = Vec::new();
    for component in Path::new(rel).components() {
        match component {
            Component::Normal(part) => {
                parts.push(part.to_str().ok_or_else(|| "invalid path".to_string())?)
            }
            Component::CurDir => {}
            _ => return Err(format!("path escapes the project: {rel}")),
        }
    }
    Ok(parts.join("/"))
}

fn resolve(root: &str, rel: &str) -> Result<PathBuf, String> {
    if root.trim().is_empty() {
        return Err("empty project root".into());
    }
    let base = expand_home(root);
    Ok(Path::new(&base).join(checked_rel(rel)?))
}

fn hidden(name: &str, is_dir: bool) -> bool {
    is_dir && HIDDEN_DIRS.contains(&name)
}

fn names_of(entries: &[DirEntryInfo]) -> Vec<&str> {
    entries.iter().map(|e| e.name.as_str()).collect()
}

fn mark_ignored(entries: &mut [DirEntryInfo], ignored: &HashSet<String>) {
    for entry in entries {
        entry.is_ignored = ignored.contains(&entry.name);
    }
}

/// The immediate children of `root/rel`, unsorted — the frontend orders them
/// (folders first, natural order) so that rule lives in one testable place. A
/// symlink to a directory browses like one; nothing below it is walked until it
/// is opened, so a cycle costs nothing. Runs off the UI thread.
#[tauri::command(async)]
pub fn list_dir_entries(root: String, rel: String) -> Result<Vec<DirEntryInfo>, String> {
    if let Some(ssh) = remote_project_for_path(&root) {
        return remote_list(&ssh, &root, &rel);
    }
    let dir = resolve(&root, &rel)?;
    let entries =
        std::fs::read_dir(&dir).map_err(|e| format!("cannot open {}: {e}", dir.display()))?;
    let mut out = Vec::new();
    for entry in entries.filter_map(Result::ok) {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        let is_symlink = file_type.is_symlink();
        let is_dir = if is_symlink {
            std::fs::metadata(entry.path())
                .map(|m| m.is_dir())
                .unwrap_or(false)
        } else {
            file_type.is_dir()
        };
        let name = entry.file_name().to_string_lossy().into_owned();
        if hidden(&name, is_dir) {
            continue;
        }
        out.push(DirEntryInfo {
            name,
            is_dir,
            is_symlink,
            is_ignored: false,
        });
    }
    let ignored = ignored_names(&dir, &names_of(&out));
    mark_ignored(&mut out, &ignored);
    Ok(out)
}

/// One file's text, or the verdict that it can't be shown as text. Read lossily
/// so the string matches what write_file_if_unchanged compares against.
#[tauri::command(async)]
pub fn read_project_file(root: String, rel: String) -> Result<ProjectFileContent, String> {
    if let Some(ssh) = remote_project_for_path(&root) {
        return remote_read(&ssh, &root, &rel);
    }
    let path = resolve(&root, &rel)?;
    let meta = std::fs::metadata(&path).map_err(|e| format!("cannot read {rel}: {e}"))?;
    if meta.is_dir() {
        return Err(format!("not a file: {rel}"));
    }
    if meta.len() > READ_FILE_MAX_BYTES as u64 {
        return Ok(verdict(false, true, meta.len(), true));
    }
    let bytes = std::fs::read(&path).map_err(|e| format!("cannot read {rel}: {e}"))?;
    Ok(content_of(bytes, true))
}

/// Show the file in Finder, selected. macOS only — a Linux host reports that
/// plainly rather than shelling out to a command it doesn't have.
#[tauri::command(async)]
pub fn reveal_in_finder(abs_path: String) -> Result<(), String> {
    let resolved = crate::files::resolve_existing_file(&abs_path)?;
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("open")
            .arg("-R")
            .arg(&resolved)
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err("could not reveal in Finder".into());
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = resolved;
        Err("Reveal in Finder is only available on macOS".into())
    }
}

fn verdict(binary: bool, too_large: bool, size: u64, writable: bool) -> ProjectFileContent {
    ProjectFileContent {
        content: String::new(),
        binary,
        too_large,
        size,
        writable,
    }
}

fn content_of(bytes: Vec<u8>, writable: bool) -> ProjectFileContent {
    let size = bytes.len() as u64;
    if bytes.len() > READ_FILE_MAX_BYTES {
        return verdict(false, true, size, writable);
    }
    if is_binary(&bytes) {
        return verdict(true, false, size, writable);
    }
    ProjectFileContent {
        content: String::from_utf8_lossy(&bytes).into_owned(),
        binary: false,
        too_large: false,
        size,
        writable,
    }
}

fn join_remote(root: &str, rel: &str) -> String {
    if rel.is_empty() {
        root.to_string()
    } else {
        format!("{}/{rel}", root.trim_end_matches('/'))
    }
}

/// One `find` per folder: each entry comes back as a kind tag and its path,
/// NUL-separated, via POSIX `-exec … {} +`. Symlinks report as files, since
/// `-type d` doesn't follow them.
fn remote_list(ssh: &SshSettings, root: &str, rel: &str) -> Result<Vec<DirEntryInfo>, String> {
    let dir = join_remote(root, &checked_rel(rel)?);
    let args = [
        ".",
        "-mindepth",
        "1",
        "-maxdepth",
        "1",
        "-type",
        "d",
        "-exec",
        "printf",
        "d\\0%s\\0",
        "{}",
        "+",
        "-o",
        "-exec",
        "printf",
        "f\\0%s\\0",
        "{}",
        "+",
    ];
    let stdout = remote_output(ssh, &dir, "find", &args)?;
    let mut entries = parse_tagged_listing(&String::from_utf8_lossy(&stdout));
    let ignored = remote_ignored_names(ssh, &dir, &names_of(&entries));
    mark_ignored(&mut entries, &ignored);
    Ok(entries)
}

fn parse_tagged_listing(text: &str) -> Vec<DirEntryInfo> {
    let mut out = Vec::new();
    let mut fields = text.split('\0');
    while let (Some(kind), Some(path)) = (fields.next(), fields.next()) {
        let is_dir = kind == "d";
        let name = path.strip_prefix("./").unwrap_or(path);
        if name.is_empty() || hidden(name, is_dir) {
            continue;
        }
        out.push(DirEntryInfo {
            name: name.to_string(),
            is_dir,
            is_symlink: false,
            is_ignored: false,
        });
    }
    out
}

/// `head -c` caps the transfer at the same ceiling the local read enforces; one
/// byte over marks the file too large without pulling the rest across.
fn remote_read(ssh: &SshSettings, root: &str, rel: &str) -> Result<ProjectFileContent, String> {
    let rel = checked_rel(rel)?;
    if rel.is_empty() {
        return Err("not a file".into());
    }
    let limit = (READ_FILE_MAX_BYTES + 1).to_string();
    let target = format!("./{rel}");
    let bytes = remote_output(ssh, root, "head", &["-c", &limit, &target])?;
    Ok(content_of(bytes, false))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checked_rel_confines_paths_to_the_root() {
        assert_eq!(checked_rel("").unwrap(), "");
        assert_eq!(checked_rel("./src/a.rs").unwrap(), "src/a.rs");
        assert_eq!(checked_rel("src//a.rs").unwrap(), "src/a.rs");
        assert!(checked_rel("../x").is_err());
        assert!(checked_rel("src/../../x").is_err());
        assert!(checked_rel("/etc/passwd").is_err());
    }

    #[test]
    fn lists_children_and_hides_vcs_internals() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("src")).unwrap();
        std::fs::create_dir(dir.path().join(".git")).unwrap();
        std::fs::write(dir.path().join("README.md"), "hi").unwrap();
        std::fs::write(dir.path().join(".gitignore"), "x").unwrap();
        let root = dir.path().to_string_lossy().into_owned();
        let mut names: Vec<(String, bool)> = list_dir_entries(root.clone(), String::new())
            .unwrap()
            .into_iter()
            .map(|e| (e.name, e.is_dir))
            .collect();
        names.sort();
        assert_eq!(
            names,
            vec![
                (".gitignore".to_string(), false),
                ("README.md".to_string(), false),
                ("src".to_string(), true),
            ]
        );
        assert!(list_dir_entries(root.clone(), "../".into()).is_err());
        assert!(list_dir_entries(root, "missing".into()).is_err());
    }

    #[test]
    fn greys_what_the_repo_ignores() {
        let dir = tempfile::tempdir().unwrap();
        let ok = std::process::Command::new("git")
            .args(["init", "-q"])
            .current_dir(dir.path())
            .status()
            .unwrap()
            .success();
        assert!(ok);
        std::fs::write(dir.path().join(".gitignore"), "dist/\n").unwrap();
        std::fs::create_dir(dir.path().join("dist")).unwrap();
        std::fs::create_dir(dir.path().join("src")).unwrap();
        let root = dir.path().to_string_lossy().into_owned();
        let mut flags: Vec<(String, bool)> = list_dir_entries(root, String::new())
            .unwrap()
            .into_iter()
            .map(|e| (e.name, e.is_ignored))
            .collect();
        flags.sort();
        assert_eq!(
            flags,
            vec![
                (".gitignore".to_string(), false),
                ("dist".to_string(), true),
                ("src".to_string(), false),
            ]
        );
    }

    #[test]
    fn reads_text_and_flags_binary_and_oversize() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.txt"), "hello").unwrap();
        std::fs::write(dir.path().join("b.bin"), b"\0\x01\x02").unwrap();
        let root = dir.path().to_string_lossy().into_owned();
        let text = read_project_file(root.clone(), "a.txt".into()).unwrap();
        assert_eq!(text.content, "hello");
        assert!(!text.binary && !text.too_large && text.writable);
        assert_eq!(text.size, 5);
        let bin = read_project_file(root.clone(), "b.bin".into()).unwrap();
        assert!(bin.binary);
        assert!(bin.content.is_empty());
        assert!(read_project_file(root, String::new()).is_err());
        let big = content_of(vec![b'x'; READ_FILE_MAX_BYTES + 1], false);
        assert!(big.too_large && !big.writable);
        assert!(big.content.is_empty());
    }

    #[test]
    fn tagged_listing_parses_kinds_and_hides_vcs_internals() {
        let entries = parse_tagged_listing("d\0./src\0d\0./.git\0f\0./a.rs\0f\0./.env\0");
        let names: Vec<(String, bool)> = entries.into_iter().map(|e| (e.name, e.is_dir)).collect();
        assert_eq!(
            names,
            vec![
                ("src".to_string(), true),
                ("a.rs".to_string(), false),
                (".env".to_string(), false),
            ]
        );
        assert!(parse_tagged_listing("").is_empty());
    }

    #[test]
    fn remote_paths_join_under_the_root() {
        assert_eq!(join_remote("/srv/app", ""), "/srv/app");
        assert_eq!(join_remote("/srv/app/", "src"), "/srv/app/src");
    }
}
