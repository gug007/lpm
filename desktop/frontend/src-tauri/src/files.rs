// File operations + native folder picker — port of desktop/openin.go file ops
// and BrowseFolder. BrowseFolder uses tauri-plugin-dialog's blocking picker.
use crate::config::expand_home;
use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, FilePath};

const READ_FILE_MAX_BYTES: usize = 5 * 1024 * 1024;

/// Run a native file/folder picker off the main thread and return the chosen
/// path (None if cancelled). The plugin's `blocking_pick_*` calls must NOT run
/// on the UI thread — their result is delivered via the main event loop, so
/// blocking it deadlocks and the app beachballs. `build` constructs and shows
/// the dialog; it runs on a blocking-pool thread.
pub(crate) async fn pick_path<F>(app: AppHandle, build: F) -> Result<Option<PathBuf>, String>
where
    F: FnOnce(AppHandle) -> Option<FilePath> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || build(app))
        .await
        .map_err(|e| e.to_string())?
        .map(|fp| fp.into_path().map_err(|e| e.to_string()))
        .transpose()
}

/// Resolve `~` and require the path to be an existing file/dir.
fn resolve_existing(abs: &str) -> Result<String, String> {
    if abs.is_empty() {
        return Err("empty file path".into());
    }
    let r = expand_home(abs);
    std::fs::metadata(&r).map_err(|_| format!("file not found: {r}"))?;
    Ok(r)
}

#[tauri::command]
pub async fn browse_folder(app: AppHandle, default_dir: Option<String>) -> Result<String, String> {
    let start = default_dir
        .map(|d| expand_home(&d))
        .filter(|d| !d.is_empty() && std::path::Path::new(d).is_dir());
    let picked = pick_path(app, move |app| {
        let mut builder = app.dialog().file().set_title("Select project folder");
        if let Some(dir) = start {
            builder = builder.set_directory(dir);
        }
        builder.blocking_pick_folder()
    })
    .await?;
    match picked {
        Some(p) => Ok(p.to_string_lossy().into_owned()),
        None => Ok(String::new()), // cancel -> "" (matches Go)
    }
}

/// One level of a filesystem browse: the resolved directory, its parent (None at
/// the root), and the names of its immediate child directories.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirListing {
    pub path: String,
    pub parent: Option<String>,
    pub dirs: Vec<String>,
}

/// List the immediate child directories of `path`, for browsing a filesystem
/// remotely (over the peer proxy) without a native dialog. An empty path, `~`,
/// or `~/...` resolves to $HOME; any other value is taken as an absolute path.
/// Returns the canonicalized path, its parent, and the sorted names of child
/// directories, skipping dot-directories and non-directories. Symlinks are
/// followed via metadata(); entries that error (broken links, unreadable) are
/// skipped. Runs off the UI thread — the fs walk must never block the main loop.
#[tauri::command(async)]
pub fn list_dirs(path: String) -> Result<DirListing, String> {
    let trimmed = path.trim();
    let raw = if trimmed.is_empty() {
        expand_home("~")
    } else {
        expand_home(trimmed)
    };
    let canon = std::fs::canonicalize(&raw).map_err(|e| format!("cannot open {raw}: {e}"))?;
    if !canon.is_dir() {
        return Err(format!("not a directory: {}", canon.display()));
    }
    let mut dirs: Vec<String> = Vec::new();
    for entry in std::fs::read_dir(&canon).map_err(|e| e.to_string())? {
        let Ok(entry) = entry else { continue };
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        match std::fs::metadata(entry.path()) {
            Ok(meta) if meta.is_dir() => dirs.push(name),
            _ => {}
        }
    }
    dirs.sort_by_key(|n| n.to_lowercase());
    let parent = canon.parent().map(|p| p.to_string_lossy().into_owned());
    Ok(DirListing {
        path: canon.to_string_lossy().into_owned(),
        parent,
        dirs,
    })
}

#[tauri::command]
pub async fn pick_image_file(app: AppHandle) -> Result<String, String> {
    let picked = pick_path(app, |app| {
        app.dialog()
            .file()
            .set_title("Select an image")
            .add_filter("Images", &["png", "jpg", "jpeg", "webp", "gif", "svg"])
            .blocking_pick_file()
    })
    .await?;
    match picked {
        Some(p) => Ok(p.to_string_lossy().into_owned()),
        None => Ok(String::new()),
    }
}

#[tauri::command]
pub async fn save_text_file(
    app: AppHandle,
    default_name: String,
    content: String,
) -> Result<bool, String> {
    // Bounded by the terminal's scrollback, but a wide buffer can still be a
    // few MB — cap generously so a real save is never rejected.
    if content.len() > 64 * 1024 * 1024 {
        return Err(format!("content too large ({} bytes)", content.len()));
    }
    let Some(path) = pick_path(app, move |app| {
        let mut builder = app.dialog().file().set_file_name(&default_name);
        if let Ok(dir) = app.path().download_dir() {
            builder = builder.set_directory(dir);
        }
        builder.blocking_save_file()
    })
    .await?
    else {
        return Ok(false);
    };
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn file_exists(abs_path: String) -> bool {
    if abs_path.is_empty() {
        return false;
    }
    std::fs::metadata(expand_home(&abs_path))
        .map(|m| m.is_file())
        .unwrap_or(false)
}

/// One entry under a project's working dir, for the composer's `@`-mention
/// picker. `path` is relative to the listed root.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirFileEntry {
    pub path: String,
    pub is_dir: bool,
}

/// Directory names never worth surfacing in the picker — large, generated, or
/// VCS-internal. Skipped wholesale, contents and all.
const MENTION_SKIP_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    ".nuxt",
    ".turbo",
    ".cache",
    ".venv",
    "venv",
    "__pycache__",
    "vendor",
    "Pods",
    ".idea",
    ".gradle",
    "DerivedData",
    ".svelte-kit",
    "coverage",
];

/// Cap on entries so a giant tree can't stall the picker or balloon the IPC
/// payload; the client filters this list as the user types.
const MENTION_FILE_CAP: usize = 20_000;

/// List files and folders under `root` (a terminal's working dir) for the
/// composer's `@`-mention autocomplete, as paths relative to `root`. Walks
/// recursively, skipping MENTION_SKIP_DIRS and following no symlinks (read_dir's
/// file_type doesn't), so cycles can't trap it. Runs off the UI thread — a deep
/// tree walk must never block the main loop.
#[tauri::command(async)]
pub fn list_dir_files(root: String) -> Result<Vec<DirFileEntry>, String> {
    if root.is_empty() {
        return Ok(Vec::new());
    }
    if let Some(ssh) = crate::sshexec::remote_project_for_path(&root) {
        return Ok(remote_dir_files(&ssh, &root));
    }
    let base = expand_home(&root);
    let base_path = std::path::Path::new(&base);
    if !base_path.is_dir() {
        return Ok(Vec::new());
    }
    let mut out: Vec<DirFileEntry> = Vec::new();
    let mut stack = vec![base_path.to_path_buf()];
    while let Some(dir) = stack.pop() {
        if out.len() >= MENTION_FILE_CAP {
            break;
        }
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.filter_map(|e| e.ok()) {
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            let is_dir = file_type.is_dir();
            let name = entry.file_name();
            if is_dir && MENTION_SKIP_DIRS.contains(&name.to_string_lossy().as_ref()) {
                continue;
            }
            let path = entry.path();
            let Ok(rel) = path.strip_prefix(base_path) else {
                continue;
            };
            out.push(DirFileEntry {
                path: rel.to_string_lossy().into_owned(),
                is_dir,
            });
            if is_dir {
                stack.push(path);
            }
        }
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

/// Remote mirror of `list_dir_files`: one `find` over SSH per entry kind (dirs,
/// then non-dirs) reproduces the local walk — same skip dirs (pruned as whole
/// subtrees), same relative paths, same cap. Symlinks report `is_dir: false`,
/// matching the local read_dir file_type. Any failure degrades to an empty list
/// so the mention picker never errors out.
fn remote_dir_files(ssh: &crate::config::SshSettings, dir: &str) -> Vec<DirFileEntry> {
    let mut prune: Vec<String> = vec![
        ".".into(),
        "-mindepth".into(),
        "1".into(),
        "(".into(),
        "-type".into(),
        "d".into(),
        "(".into(),
    ];
    for (i, name) in MENTION_SKIP_DIRS.iter().enumerate() {
        if i > 0 {
            prune.push("-o".into());
        }
        prune.push("-name".into());
        prune.push((*name).into());
    }
    prune.push(")".into());
    prune.push(")".into());
    prune.push("-prune".into());
    prune.push("-o".into());

    let mut out: Vec<DirFileEntry> = Vec::new();
    for p in remote_find(ssh, dir, &prune, &["-type", "d", "-print0"]) {
        out.push(DirFileEntry {
            path: p,
            is_dir: true,
        });
    }
    for p in remote_find(ssh, dir, &prune, &["!", "-type", "d", "-print0"]) {
        out.push(DirFileEntry {
            path: p,
            is_dir: false,
        });
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    out.truncate(MENTION_FILE_CAP);
    out
}

fn remote_find(
    ssh: &crate::config::SshSettings,
    dir: &str,
    prune: &[String],
    tail: &[&str],
) -> Vec<String> {
    let mut args: Vec<&str> = prune.iter().map(String::as_str).collect();
    args.extend_from_slice(tail);
    let Some(out) = crate::sshexec::remote_command(ssh, dir, "find", &args, &[])
        .output()
        .ok()
        .filter(|o| o.status.success())
    else {
        return Vec::new();
    };
    String::from_utf8_lossy(&out.stdout)
        .split('\0')
        .filter_map(|p| {
            let p = p.strip_prefix("./").unwrap_or(p);
            (!p.is_empty()).then(|| p.to_string())
        })
        .collect()
}

#[tauri::command(async)]
pub fn read_file(abs_path: String) -> Result<String, String> {
    if abs_path.is_empty() {
        return Err("empty file path".into());
    }
    let path = expand_home(&abs_path);
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    if bytes.len() > READ_FILE_MAX_BYTES {
        return Err(format!("file too large to preview ({} bytes)", bytes.len()));
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[tauri::command(async)]
pub fn write_file(abs_path: String, content: String) -> Result<(), String> {
    if abs_path.is_empty() {
        return Err("empty file path".into());
    }
    if content.len() > READ_FILE_MAX_BYTES {
        return Err(format!("content too large ({} bytes)", content.len()));
    }
    let path = expand_home(&abs_path);
    if let Ok(meta) = std::fs::metadata(&path) {
        if meta.is_dir() {
            return Err(format!("not a file: {abs_path}"));
        }
    }
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteResult {
    pub written: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_content: Option<String>,
}

/// Compare-and-swap write: overwrite only when the file's on-disk content still
/// matches `expected_content` (what the caller loaded). The read, compare, and
/// write happen in one call so a concurrent writer — e.g. a coding agent
/// rewriting the same file in the terminal — can't silently clobber newer
/// changes through a check/write gap. On mismatch the write is skipped and the
/// current on-disk content is returned so the caller can resolve the conflict.
#[tauri::command(async)]
pub fn write_file_if_unchanged(
    abs_path: String,
    expected_content: String,
    content: String,
) -> Result<WriteResult, String> {
    if abs_path.is_empty() {
        return Err("empty file path".into());
    }
    if content.len() > READ_FILE_MAX_BYTES {
        return Err(format!("content too large ({} bytes)", content.len()));
    }
    let path = expand_home(&abs_path);
    if let Ok(meta) = std::fs::metadata(&path) {
        if meta.is_dir() {
            return Err(format!("not a file: {abs_path}"));
        }
    }
    let current = match std::fs::read(&path) {
        Ok(bytes) => String::from_utf8_lossy(&bytes).into_owned(),
        // A freshly-created file the caller loaded as empty may not be on disk
        // yet; treat a missing file as an empty baseline.
        Err(ref e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(e) => return Err(e.to_string()),
    };
    if current != expected_content {
        return Ok(WriteResult {
            written: false,
            current_content: Some(current),
        });
    }
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(WriteResult {
        written: true,
        current_content: None,
    })
}

#[tauri::command(async)]
pub fn open_path_in_default_app(abs_path: String) -> Result<(), String> {
    let resolved = resolve_existing(&abs_path)?;
    let status = Command::new("open")
        .arg(&resolved)
        .status()
        .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("open failed".into());
    }
    Ok(())
}

/// Shared with openin.rs.
pub(crate) fn resolve_existing_file(abs: &str) -> Result<String, String> {
    resolve_existing(abs)
}
