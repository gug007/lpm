// The Files tab: browse a project one directory at a time and read one file
// with the verdicts the editor needs up front (binary, too large). Local
// projects read the disk; SSH projects run the same listing and read on the
// host through sshexec, the way list_dir_files does for the mention picker.
use crate::config::{expand_home, SshSettings};
use crate::sshexec::{remote_command, remote_project_for_path};
use std::path::{Component, Path, PathBuf};

/// Same ceiling as files.rs's read_file, so the editor and the file viewer
/// agree on what "too large" means.
const READ_MAX_BYTES: usize = 5 * 1024 * 1024;
/// A NUL in the first 8 KiB is the classic binary tell (what git uses).
const BINARY_SNIFF_BYTES: usize = 8 * 1024;
/// VCS internals are never worth browsing and are dangerous to edit by hand.
const HIDDEN_DIRS: &[&str] = &[".git", ".svn", ".hg"];

#[derive(Debug, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DirEntryInfo {
    pub name: String,
    pub is_dir: bool,
    pub is_symlink: bool,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFileContent {
    pub content: String,
    pub binary: bool,
    pub too_large: bool,
    pub size: u64,
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

fn looks_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(BINARY_SNIFF_BYTES).any(|&b| b == 0)
}

fn hidden(name: &str, is_dir: bool) -> bool {
    is_dir && HIDDEN_DIRS.contains(&name)
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
        });
    }
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
    if meta.len() > READ_MAX_BYTES as u64 {
        return Ok(verdict(false, true, meta.len()));
    }
    let bytes = std::fs::read(&path).map_err(|e| format!("cannot read {rel}: {e}"))?;
    Ok(content_of(bytes))
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

fn verdict(binary: bool, too_large: bool, size: u64) -> ProjectFileContent {
    ProjectFileContent {
        content: String::new(),
        binary,
        too_large,
        size,
    }
}

fn content_of(bytes: Vec<u8>) -> ProjectFileContent {
    let size = bytes.len() as u64;
    if bytes.len() > READ_MAX_BYTES {
        return verdict(false, true, size);
    }
    if looks_binary(&bytes) {
        return verdict(true, false, size);
    }
    ProjectFileContent {
        content: String::from_utf8_lossy(&bytes).into_owned(),
        binary: false,
        too_large: false,
        size,
    }
}

fn join_remote(root: &str, rel: &str) -> String {
    if rel.is_empty() {
        root.to_string()
    } else {
        format!("{}/{rel}", root.trim_end_matches('/'))
    }
}

fn run_remote(
    ssh: &SshSettings,
    dir: &str,
    program: &str,
    args: &[&str],
) -> Result<Vec<u8>, String> {
    let out = remote_command(ssh, dir, program, args, &[])
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if err.is_empty() {
            format!("{program} failed on the host")
        } else {
            err
        });
    }
    Ok(out.stdout)
}

/// One `find` per entry kind, as remote_dir_files does, but one level deep.
/// Symlinks report as files: `-type d` doesn't follow them.
fn remote_list(ssh: &SshSettings, root: &str, rel: &str) -> Result<Vec<DirEntryInfo>, String> {
    let dir = join_remote(root, &checked_rel(rel)?);
    let mut out = Vec::new();
    let kinds: [(bool, &[&str]); 2] = [(true, &["-type", "d"]), (false, &["!", "-type", "d"])];
    for (is_dir, kind) in kinds {
        let mut args = vec![".", "-mindepth", "1", "-maxdepth", "1"];
        args.extend_from_slice(kind);
        args.push("-print0");
        let stdout = run_remote(ssh, &dir, "find", &args)?;
        for name in String::from_utf8_lossy(&stdout).split('\0') {
            let name = name.strip_prefix("./").unwrap_or(name);
            if name.is_empty() || hidden(name, is_dir) {
                continue;
            }
            out.push(DirEntryInfo {
                name: name.to_string(),
                is_dir,
                is_symlink: false,
            });
        }
    }
    Ok(out)
}

/// `head -c` caps the transfer at the same ceiling the local read enforces; one
/// byte over marks the file too large without pulling the rest across.
fn remote_read(ssh: &SshSettings, root: &str, rel: &str) -> Result<ProjectFileContent, String> {
    let rel = checked_rel(rel)?;
    if rel.is_empty() {
        return Err("not a file".into());
    }
    let limit = (READ_MAX_BYTES + 1).to_string();
    let target = format!("./{rel}");
    let bytes = run_remote(ssh, root, "head", &["-c", &limit, &target])?;
    Ok(content_of(bytes))
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
    fn binary_sniff_reads_only_the_head() {
        assert!(!looks_binary(b"plain text\n"));
        assert!(looks_binary(b"\x89PNG\0\0"));
        let mut late = vec![b'a'; BINARY_SNIFF_BYTES + 1];
        late.push(0);
        assert!(!looks_binary(&late));
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
    fn reads_text_and_flags_binary_and_oversize() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.txt"), "hello").unwrap();
        std::fs::write(dir.path().join("b.bin"), b"\0\x01\x02").unwrap();
        let root = dir.path().to_string_lossy().into_owned();
        let text = read_project_file(root.clone(), "a.txt".into()).unwrap();
        assert_eq!(text.content, "hello");
        assert!(!text.binary && !text.too_large);
        assert_eq!(text.size, 5);
        let bin = read_project_file(root.clone(), "b.bin".into()).unwrap();
        assert!(bin.binary);
        assert!(bin.content.is_empty());
        assert!(read_project_file(root, String::new()).is_err());
        let big = content_of(vec![b'x'; READ_MAX_BYTES + 1]);
        assert!(big.too_large);
        assert!(big.content.is_empty());
    }

    #[test]
    fn remote_paths_join_under_the_root() {
        assert_eq!(join_remote("/srv/app", ""), "/srv/app");
        assert_eq!(join_remote("/srv/app/", "src"), "/srv/app/src");
    }
}
