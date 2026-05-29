// Project CRUD — port of desktop/projects.go create/remove, clone.go, and
// duplicate.go. macOS-only. No new Cargo deps: git/cp run as subprocesses,
// uuid (existing) provides entropy, serde_yaml writes configs.
use crate::config;
use serde::Deserialize;
use serde_yaml::{Mapping, Value as Yaml};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Emitter};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConfig {
    #[serde(default)]
    pub host: String,
    #[serde(default)]
    pub user: String,
    #[serde(default)]
    pub port: i64,
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub dir: String,
}

fn yset(m: &mut Mapping, k: &str, v: impl Into<Yaml>) {
    m.insert(Yaml::from(k), v.into());
}

fn write_project_yaml(name: &str, build: impl FnOnce(&mut Mapping)) -> Result<(), String> {
    config::ensure_dirs()?;
    let mut m = Mapping::new();
    build(&mut m);
    let out = serde_yaml::to_string(&Yaml::Mapping(m)).map_err(|e| e.to_string())?;
    config::write_config_file(&config::project_path(name), &out)
}

fn dev_services() -> Yaml {
    let mut svcs = Mapping::new();
    let mut dev = Mapping::new();
    yset(&mut dev, "cmd", "echo 'configure me'");
    svcs.insert(Yaml::from("dev"), Yaml::Mapping(dev));
    Yaml::Mapping(svcs)
}

// ---- create -----------------------------------------------------------------

#[tauri::command(async)]
pub fn create_project(app: AppHandle, name: String, root: String) -> Result<(), String> {
    config::validate_name(&name)?;
    if config::project_exists(&name) {
        return Err(format!("project {name:?} already exists"));
    }
    write_project_yaml(&name, |m| {
        yset(m, "name", name.as_str());
        yset(m, "root", config::collapse_home(&root).as_str());
        m.insert(Yaml::from("services"), dev_services());
    })?;
    let _ = app.emit("projects-changed", ());
    Ok(())
}

#[tauri::command(async)]
pub fn create_ssh_project(app: AppHandle, name: String, ssh: SshConfig) -> Result<(), String> {
    config::validate_name(&name)?;
    if config::project_exists(&name) {
        return Err(format!("project {name:?} already exists"));
    }
    if ssh.host.trim().is_empty() {
        return Err("ssh host is required".into());
    }
    if ssh.user.trim().is_empty() {
        return Err("ssh user is required".into());
    }
    if ssh.port < 0 || ssh.port > 65535 {
        return Err(format!("invalid ssh port: {}", ssh.port));
    }
    write_project_yaml(&name, |m| {
        yset(m, "name", name.as_str());
        let mut s = Mapping::new();
        yset(&mut s, "host", ssh.host.as_str());
        yset(&mut s, "user", ssh.user.as_str());
        if ssh.port != 0 {
            yset(&mut s, "port", ssh.port);
        }
        if !ssh.key.trim().is_empty() {
            yset(&mut s, "key", config::collapse_home(&ssh.key).as_str());
        }
        if !ssh.dir.trim().is_empty() {
            yset(&mut s, "dir", ssh.dir.as_str()); // remote path: verbatim
        }
        m.insert(Yaml::from("ssh"), Yaml::Mapping(s));
        let mut svcs = Mapping::new();
        let mut shell = Mapping::new();
        yset(&mut shell, "cmd", "exec \"$SHELL\" -l");
        svcs.insert(Yaml::from("shell"), Yaml::Mapping(shell));
        m.insert(Yaml::from("services"), Yaml::Mapping(svcs));
    })?;
    let _ = app.emit("projects-changed", ());
    Ok(())
}

// ---- clone ------------------------------------------------------------------

#[tauri::command(async)]
pub fn create_project_from_clone(
    app: AppHandle,
    name: String,
    url: String,
    branch: String,
    dest_parent: String,
) -> Result<(), String> {
    config::validate_name(&name)?;
    if config::project_exists(&name) {
        return Err(format!("project {name:?} already exists"));
    }
    validate_clone_url(&url)?;
    let branch = branch.trim().to_string();
    if !branch.is_empty() {
        validate_branch_name(&branch)?;
    }

    let parent = Path::new(&dest_parent);
    let meta = std::fs::metadata(parent)
        .map_err(|_| format!("destination parent does not exist: {dest_parent}"))?;
    if !meta.is_dir() {
        return Err(format!("destination parent is not a directory: {dest_parent}"));
    }
    check_writable(parent)?;

    let dest = parent.join(&name);
    if dest.exists() {
        return Err(format!("destination folder: {} already exists", dest.display()));
    }

    let mut argv: Vec<String> = vec!["clone".into(), "--progress".into()];
    if !branch.is_empty() {
        argv.push("--branch".into());
        argv.push(branch.clone());
        argv.push("--single-branch".into());
    }
    argv.push("--".into());
    argv.push(url.clone());
    argv.push(dest.to_string_lossy().into_owned());

    let out = Command::new("git")
        .args(&argv)
        .output()
        .map_err(|e| format!("clone failed: {e}"))?;
    if !out.status.success() {
        let mut combined = out.stdout.clone();
        combined.extend_from_slice(&out.stderr);
        let msg = clean_git_output(&String::from_utf8_lossy(&combined));
        clone_cleanup(&dest);
        return Err(map_clone_error(&msg));
    }

    let write = write_project_yaml(&name, |m| {
        yset(m, "name", name.as_str());
        yset(m, "root", config::collapse_home(&dest.to_string_lossy()).as_str());
        m.insert(Yaml::from("services"), dev_services());
    });
    if let Err(e) = write {
        clone_cleanup(&dest);
        return Err(e);
    }
    let _ = app.emit("projects-changed", ());
    Ok(())
}

// ---- duplicate --------------------------------------------------------------

struct SrcInfo {
    root: String,
    parent: Option<String>,
}

fn load_root_and_parent(name: &str) -> Result<SrcInfo, String> {
    let (root, is_remote) = config::project_root(name)?;
    if is_remote {
        return Err("cannot duplicate an SSH project (no local root)".into());
    }
    Ok(SrcInfo {
        root,
        parent: config::peek_parent(name),
    })
}

const ALPHABET: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

fn random_id6() -> String {
    let bytes = uuid::Uuid::new_v4().into_bytes();
    (0..6)
        .map(|i| ALPHABET[bytes[i] as usize % ALPHABET.len()] as char)
        .collect()
}

fn next_available_duplicate(original: &str, parent_dir: &Path) -> Result<(String, PathBuf), String> {
    for _ in 0..10 {
        let candidate = format!("{original}-copy-{}", random_id6());
        let root = parent_dir.join(&candidate);
        if !config::project_exists(&candidate) && !root.exists() {
            return Ok((candidate, root));
        }
    }
    Err("could not generate a unique duplicate name".into())
}

/// macOS APFS copy-on-write clone (kernel falls back to a full copy off-APFS).
fn cp_clone(src: &Path, dst: &Path) -> Result<(), String> {
    let out = Command::new("/bin/cp")
        .args(["-c", "-R"])
        .arg(src)
        .arg(dst)
        .output()
        .map_err(|e| format!("clone copy failed: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "clone copy failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(())
}

fn git_in(dir: &Path, args: &[&str]) -> Result<(), String> {
    let out = Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(())
}

fn strip_uncommitted(root: &Path) -> Result<(), String> {
    if !root.join(".git").exists() {
        return Ok(());
    }
    git_in(root, &["reset", "--hard", "HEAD"]).map_err(|e| format!("reset: {e}"))?;
    git_in(root, &["clean", "-fd"]).map_err(|e| format!("clean: {e}"))?;
    Ok(())
}

#[tauri::command(async)]
pub fn duplicate_project(
    app: AppHandle,
    name: String,
    exclude_uncommitted: bool,
) -> Result<String, String> {
    let src = load_root_and_parent(&name)?;
    if src.root.trim().is_empty() {
        return Err("cannot duplicate an SSH project (no local root)".into());
    }
    let original = src.parent.clone().unwrap_or_else(|| name.clone());
    let parent_dir = Path::new(&src.root)
        .parent()
        .ok_or("source root has no parent directory")?
        .to_path_buf();

    let (new_name, new_root) = next_available_duplicate(&original, &parent_dir)?;

    if let Err(e) = cp_clone(Path::new(&src.root), &new_root) {
        let _ = std::fs::remove_dir_all(&new_root);
        return Err(e);
    }
    // Drop worktree registrations copied from the source (stale refs).
    let _ = std::fs::remove_dir_all(new_root.join(".git").join("worktrees"));

    if exclude_uncommitted {
        if let Err(e) = strip_uncommitted(&new_root) {
            let _ = std::fs::remove_dir_all(&new_root);
            return Err(e);
        }
    }

    let write = write_project_yaml(&new_name, |m| {
        yset(m, "name", new_name.as_str());
        yset(m, "root", config::collapse_home(&new_root.to_string_lossy()).as_str());
        yset(m, "parent_name", original.as_str());
    });
    if let Err(e) = write {
        let _ = std::fs::remove_dir_all(&new_root);
        return Err(e);
    }
    let _ = app.emit("projects-changed", ());
    Ok(new_name)
}

// ---- remove -----------------------------------------------------------------

#[tauri::command(async)]
pub fn remove_project(app: AppHandle, name: String) -> Result<(), String> {
    let dups = config::duplicates_of(&name)?;
    if !dups.is_empty() {
        return Err(format!(
            "cannot remove {name:?}: {} duplicate(s) still reference it ({})",
            dups.len(),
            dups.join(", ")
        ));
    }

    let info = load_root_and_parent(&name).ok();
    let is_duplicate = info.as_ref().and_then(|i| i.parent.as_ref()).is_some();
    let root = info.as_ref().map(|i| i.root.clone()).unwrap_or_default();

    // Stop the running session before deleting files (session name == file name
    // for created projects), then tear down port forwards/poller + sync mirror.
    let _ = crate::tmux::kill_session(&name);
    crate::portforward::stop_project_forwards(&app, &name); // tunnels + poller + suggestions
    crate::sshsync::remove_project_sync(&app, &name); // watcher + local cache dir

    if is_duplicate && !root.trim().is_empty() {
        remove_dir_all_retry(Path::new(&root))?;
    }
    std::fs::remove_file(config::project_path(&name)).map_err(|e| e.to_string())?;
    clean_settings_references(&name);

    let _ = app.emit("projects-changed", ());
    Ok(())
}

fn remove_dir_all_retry(p: &Path) -> Result<(), String> {
    use std::io::ErrorKind;
    let base = std::time::Duration::from_millis(100);
    let mut last = String::new();
    for attempt in 0..5u32 {
        match std::fs::remove_dir_all(p) {
            Ok(()) => return Ok(()),
            Err(e) if e.kind() == ErrorKind::NotFound => return Ok(()),
            Err(e) => {
                last = e.to_string();
                std::thread::sleep(base * (attempt + 1));
            }
        }
    }
    Err(format!("failed to remove duplicate folder: {last}"))
}

fn clean_settings_references(name: &str) {
    let mut s = config::load_settings();
    let mut changed = false;
    if let Some(arr) = s.get_mut("projectOrder").and_then(|v| v.as_array_mut()) {
        let before = arr.len();
        arr.retain(|x| x.as_str() != Some(name));
        changed |= arr.len() != before;
    }
    if s.get("lastSelectedProject").and_then(|v| v.as_str()) == Some(name) {
        if let Some(obj) = s.as_object_mut() {
            obj.remove("lastSelectedProject");
            changed = true;
        }
    }
    if let Some(dw) = s.get_mut("detachedWindows").and_then(|v| v.as_object_mut()) {
        changed |= dw.remove(name).is_some();
    }
    if changed {
        let _ = config::save_settings(&s);
    }
}

// ---- clone validation / sanitization ---------------------------------------

fn validate_clone_url(url: &str) -> Result<(), String> {
    let u = url.trim();
    if u.is_empty() {
        return Err("repository URL is required".into());
    }
    if u.contains('\r') || u.contains('\n') {
        return Err("invalid repository URL".into());
    }
    const BAD: &[char] = &['`', '$', ';', '&', '|', '<', '>', '(', ')', '\\', '"', '\''];
    if u.chars().any(|c| BAD.contains(&c)) {
        return Err("repository URL contains invalid characters".into());
    }
    let ok = u.starts_with("https://")
        || u.starts_with("http://")
        || u.starts_with("ssh://")
        || u.starts_with("git://")
        || is_scp_like(u);
    if !ok {
        return Err("unsupported repository URL".into());
    }
    Ok(())
}

fn is_scp_like(u: &str) -> bool {
    // user@host:path
    if let Some(at) = u.find('@') {
        let rest = &u[at + 1..];
        if let Some(colon) = rest.find(':') {
            return colon > 0 && colon < rest.len() - 1;
        }
    }
    false
}

fn validate_branch_name(b: &str) -> Result<(), String> {
    let bad = || Err("invalid branch name".to_string());
    if b.is_empty()
        || b.starts_with('-')
        || b.starts_with('/')
        || b.ends_with('/')
        || b.ends_with('.')
        || b.ends_with(".lock")
        || b.contains("..")
        || b.contains("@{")
        || b.contains("//")
    {
        return bad();
    }
    for c in b.chars() {
        if c.is_control()
            || c.is_whitespace()
            || matches!(c, '~' | '^' | ':' | '?' | '*' | '[' | '\\' | ']')
        {
            return bad();
        }
    }
    Ok(())
}

fn check_writable(dir: &Path) -> Result<(), String> {
    let probe = dir.join(format!(".lpm-write-test-{}", uuid::Uuid::new_v4()));
    std::fs::write(&probe, b"")
        .map_err(|_| "destination parent is not writable".to_string())?;
    let _ = std::fs::remove_file(&probe);
    Ok(())
}

fn clean_git_output(s: &str) -> String {
    let mut out = String::new();
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' {
            if chars.peek() == Some(&'[') {
                chars.next();
                while let Some(&nc) = chars.peek() {
                    chars.next();
                    if ('\u{40}'..='\u{7e}').contains(&nc) {
                        break;
                    }
                }
            }
            continue;
        }
        let mapped = if c == '\r' { '\n' } else { c };
        if mapped == '\n' || mapped == '\t' || !mapped.is_control() {
            out.push(mapped);
        }
    }
    out.trim().chars().take(2048).collect()
}

fn clone_cleanup(dest: &Path) {
    if dest.join(".git").exists() {
        let _ = std::fs::remove_dir_all(dest);
    } else if dest.read_dir().map(|mut d| d.next().is_none()).unwrap_or(false) {
        let _ = std::fs::remove_dir(dest);
    }
}

fn map_clone_error(msg: &str) -> String {
    let m = msg.to_lowercase();
    let friendly = if m.contains("could not resolve host") || m.contains("couldn't resolve") {
        "Network error: could not reach the repository host."
    } else if m.contains("permission denied")
        || m.contains("publickey")
        || m.contains("authentication failed")
    {
        "Authentication failed. Check your credentials or SSH key."
    } else if m.contains("repository not found") || m.contains("does not exist") {
        "Repository not found. Check the URL and your access."
    } else if m.contains("remote branch") && m.contains("not found") {
        "Branch not found in the remote repository."
    } else if m.contains("already exists and is not an empty directory") {
        "Destination already exists and is not empty."
    } else if m.contains("ssl certificate") || m.contains("certificate verify failed") {
        "TLS certificate error connecting to the repository."
    } else {
        return format!("clone failed: {msg}");
    };
    friendly.to_string()
}
