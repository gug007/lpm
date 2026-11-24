//! Where a path someone typed or a terminal printed leads, on the computer that
//! holds the project: this one, or an SSH project's host. The files a listing
//! hands back are the project's own (file_browser.rs); these can be anywhere.
use crate::config::{expand_home, SshSettings};
use crate::file_browser::{entries_of, parse_tagged_listing, DirEntryInfo};
use crate::sshexec::{remote_output, remote_project_for_path};
use std::path::{Component, Path, PathBuf};

#[derive(Debug, Clone, Copy, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PathKind {
    File,
    Dir,
    /// Nothing there, or nothing that opens: a socket, a pipe, a device.
    Missing,
}

#[derive(Debug, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocatedPath {
    pub kind: PathKind,
    /// Absolute on the computer that holds the project; as typed when missing
    /// from an SSH host.
    pub path: String,
    /// Its `/`-separated place in the project, "" for the project's folder;
    /// None outside it.
    pub rel: Option<String>,
}

/// `path` is absolute, under the home folder (`~/`), or relative to the project.
/// Runs off the UI thread: an SSH project's answer comes from its host.
#[tauri::command(async)]
pub fn locate_path(root: String, path: String) -> Result<LocatedPath, String> {
    if root.trim().is_empty() || path.is_empty() {
        return Err("empty path".into());
    }
    match remote_project_for_path(&root) {
        Some(ssh) => locate_on_host(&ssh, &root, &path),
        None => Ok(locate_here(&root, &path)),
    }
}

/// Which of `paths` are files, in order; a host that can't be reached has none
/// of them. One call for all of a terminal row's candidates, since each call to
/// an SSH host is a round trip.
#[tauri::command]
pub async fn files_exist(root: String, paths: Vec<String>) -> Vec<bool> {
    tauri::async_runtime::spawn_blocking(move || which_are_files(&root, &paths))
        .await
        .unwrap_or_default()
}

fn which_are_files(root: &str, paths: &[String]) -> Vec<bool> {
    let mut found = match remote_project_for_path(root) {
        Some(ssh) => files_on_host(&ssh, root, paths).unwrap_or_default(),
        None => paths.iter().map(|p| full_path(root, p).is_file()).collect(),
    };
    found.resize(paths.len(), false);
    found
}

/// What the folder at `path` holds, unsorted, wherever it is on the computer that
/// holds the project: `path` is absolute, as locate_path found it.
#[tauri::command(async)]
pub fn list_folder(root: String, path: String) -> Result<Vec<DirEntryInfo>, String> {
    if root.trim().is_empty() || path.is_empty() {
        return Err("empty path".into());
    }
    match remote_project_for_path(&root) {
        Some(ssh) => list_on_host(&ssh, &root, &path),
        None => entries_of(&full_path(&root, &path)),
    }
}

fn full_path(root: &str, path: &str) -> PathBuf {
    fold(&PathBuf::from(expand_home(root)).join(expand_home(path)))
}

/// Without `.` and `..`, read the way they are written.
fn fold(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

fn locate_here(root: &str, path: &str) -> LocatedPath {
    let base = fold(Path::new(&expand_home(root)));
    let full = full_path(root, path);
    let kind = match std::fs::metadata(&full) {
        Ok(meta) if meta.is_dir() => PathKind::Dir,
        Ok(meta) if meta.is_file() => PathKind::File,
        _ => PathKind::Missing,
    };
    LocatedPath {
        kind,
        path: full.to_string_lossy().into_owned(),
        rel: place_in(&base, &full),
    }
}

/// Where `path` is in the folder at `root`, `/`-separated; "" for the folder
/// itself, None outside it. As named first, so a link inside the folder keeps its
/// place there; then with both sides resolved, since `/tmp` is `/private/tmp`.
pub(crate) fn place_in(root: &Path, path: &Path) -> Option<String> {
    relative(path, root).or_else(|| {
        let path = dunce::canonicalize(path).ok()?;
        relative(&path, &dunce::canonicalize(root).ok()?)
    })
}

fn relative(path: &Path, root: &Path) -> Option<String> {
    let mut parts = Vec::new();
    for component in path.strip_prefix(root).ok()?.components() {
        match component {
            Component::Normal(name) => parts.push(name.to_string_lossy()),
            Component::CurDir => {}
            _ => return None,
        }
    }
    Some(parts.join("/"))
}

/// What a login profile prints comes before this, so the answer is what follows.
const MARK: &[u8] = b"lpm-path:";

fn after_mark(stdout: &[u8]) -> Option<&[u8]> {
    let at = stdout.windows(MARK.len()).rposition(|w| w == MARK)?;
    Some(&stdout[at + MARK.len()..])
}

/// Prints the kind, then, for what is there, the project's folder and the path's,
/// each as named and with links resolved, and the file's name, all NUL-ended. A
/// folder there is no going into is still where it is.
const LOCATE_SCRIPT: &str = r#"unset CDPATH
p=$1
case $p in
  '~') p=$HOME ;;
  '~/'*) p=$HOME/${p#'~/'} ;;
  /*) ;;
  *) p=./$p ;;
esac
if [ -d "$p" ]; then kind=d dir=$p name=
elif [ -f "$p" ]; then kind=f dir=${p%/*}/ name=${p##*/}
else printf 'lpm-path:m\0'; exit
fi
printf 'lpm-path:%s\0%s\0%s\0' "$kind" "$(pwd -L)" "$(pwd -P)"
cd "$dir" 2>/dev/null || {
  case $p in /*) ;; *) p=$(pwd -L)/$p ;; esac
  printf '%s\0%s\0\0' "$p" "$p"
  exit
}
printf '%s\0%s\0%s\0' "$(pwd -L)" "$(pwd -P)" "$name""#;

fn locate_on_host(ssh: &SshSettings, root: &str, path: &str) -> Result<LocatedPath, String> {
    let out = remote_output(ssh, root, "sh", &["-c", LOCATE_SCRIPT, "sh", path])?;
    parse_located(&out, path).ok_or_else(|| "The host gave no answer for this path".to_string())
}

fn parse_located(stdout: &[u8], typed: &str) -> Option<LocatedPath> {
    let text = String::from_utf8_lossy(after_mark(stdout)?);
    let mut fields = text.split('\0');
    let kind = match fields.next()? {
        "d" => PathKind::Dir,
        "f" => PathKind::File,
        _ => PathKind::Missing,
    };
    if kind == PathKind::Missing {
        return Some(LocatedPath {
            kind,
            path: typed.to_string(),
            rel: None,
        });
    }
    let (root, real_root) = (fields.next()?, fields.next()?);
    let (dir, real_dir, name) = (fields.next()?, fields.next()?, fields.next()?);
    let path = join_posix(dir, name);
    let rel = relative_posix(&path, root)
        .or_else(|| relative_posix(&join_posix(real_dir, name), real_root));
    Some(LocatedPath { kind, path, rel })
}

/// Without `.` and `..`, which are only there when the host couldn't go in and
/// say where it was.
fn join_posix(dir: &str, name: &str) -> String {
    let mut parts: Vec<&str> = Vec::new();
    for part in dir.split('/').chain([name]) {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            part => parts.push(part),
        }
    }
    format!("/{}", parts.join("/"))
}

fn relative_posix(path: &str, root: &str) -> Option<String> {
    let rest = path.strip_prefix(root.trim_end_matches('/'))?;
    if rest.is_empty() {
        return Some(String::new());
    }
    rest.strip_prefix('/').map(str::to_string)
}

const EXIST_SCRIPT: &str = r#"printf 'lpm-path:'
for p do
  case $p in '~/'*) p=$HOME/${p#'~/'} ;; esac
  if [ -f "$p" ]; then printf 1; else printf 0; fi
done"#;

fn files_on_host(ssh: &SshSettings, root: &str, paths: &[String]) -> Option<Vec<bool>> {
    if paths.is_empty() {
        return Some(Vec::new());
    }
    let mut args = vec!["-c", EXIST_SCRIPT, "sh"];
    args.extend(paths.iter().map(String::as_str));
    let out = remote_output(ssh, root, "sh", &args).ok()?;
    Some(after_mark(&out)?.iter().map(|b| *b == b'1').collect())
}

/// Links are followed, so one to a folder reads as a folder: `/bin` and `/lib` are
/// links on most hosts. What `find` can't reach is left out rather than failing the
/// rest, such as a process that ended in `/proc`.
const LIST_SCRIPT: &str = r#"unset CDPATH
cd "$1" 2>/dev/null && [ -r . ] || {
  if [ -d "$1" ]; then echo 'Permission denied'; else echo 'No such folder'; fi >&2
  exit 1
}
printf 'lpm-path:'
find -L . -mindepth 1 -maxdepth 1 -type d -exec printf 'd\0%s\0' {} + -o -exec printf 'f\0%s\0' {} + 2>/dev/null
exit 0"#;

fn list_on_host(ssh: &SshSettings, root: &str, path: &str) -> Result<Vec<DirEntryInfo>, String> {
    if !path.starts_with('/') {
        return Err(format!("not an absolute path: {path}"));
    }
    let out = remote_output(ssh, root, "sh", &["-c", LIST_SCRIPT, "sh", path])?;
    let listed = after_mark(&out).ok_or("The host gave no answer for this folder")?;
    Ok(parse_tagged_listing(&String::from_utf8_lossy(listed)))
}

#[cfg(test)]
#[path = "project_paths_tests.rs"]
mod tests;
