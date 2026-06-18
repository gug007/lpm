// Project CRUD — port of desktop/projects.go create/remove, clone.go, and
// duplicate.go. macOS-only. No new Cargo deps: git/cp run as subprocesses,
// uuid (existing) provides entropy, serde_yaml writes configs.
use crate::config;
use serde::Deserialize;
use serde_yaml::{Mapping, Value as Yaml};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Emitter, Manager};

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
        let candidate = format!("{original}-{}", random_id6());
        let root = parent_dir.join(&candidate);
        if !config::project_exists(&candidate) && !root.exists() {
            return Ok((candidate, root));
        }
    }
    Err("could not generate a unique duplicate name".into())
}

fn is_prunable(name: &std::ffi::OsStr, skip_node_modules: bool) -> bool {
    name.to_str().is_some_and(|s| {
        config::DUPLICATE_SKIP_DIRS.contains(&s) || (skip_node_modules && s == "node_modules")
    })
}

fn subtree_has_prunable(dir: &Path, skip_node_modules: bool) -> bool {
    let Ok(rd) = std::fs::read_dir(dir) else { return false; };
    let mut subdirs = Vec::new();
    for entry in rd.flatten() {
        let name = entry.file_name();
        if is_prunable(&name, skip_node_modules) {
            return true;
        }
        // A kept node_modules is opaque: packages ship dist/build/out we must not strip.
        if name.to_str() == Some("node_modules") {
            continue;
        }
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            subdirs.push(entry.path());
        }
    }
    subdirs.iter().any(|d| subtree_has_prunable(d, skip_node_modules))
}

fn cp_c_r(from: &Path, to: &Path) -> Result<(), String> {
    let out = Command::new("/bin/cp")
        .args(["-c", "-R"])
        .arg(from)
        .arg(to)
        .output()
        .map_err(|e| format!("clone copy failed: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "clone copy failed for {}: {}",
            from.display(),
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(())
}

/// macOS APFS copy-on-write clone (kernel falls back to a full copy off-APFS).
/// Recurses only into dirs holding something prunable, so the rest is cloned whole
/// in one `cp -c -R` and keeps COW. The reinstall variant prunes node_modules and
/// caches at every depth; the default keeps deps and only skips top-level caches.
fn cp_clone(src: &Path, dst: &Path, skip_node_modules: bool) -> Result<(), String> {
    std::fs::create_dir(dst).map_err(|e| format!("create duplicate dir failed: {e}"))?;
    for entry in std::fs::read_dir(src).map_err(|e| format!("read source failed: {e}"))? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name();
        if is_prunable(&name, skip_node_modules) {
            continue;
        }
        let from = entry.path();
        let to = dst.join(&name);
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if skip_node_modules && is_dir && subtree_has_prunable(&from, skip_node_modules) {
            cp_clone(&from, &to, skip_node_modules)?;
        } else {
            cp_c_r(&from, &to)?;
        }
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

#[derive(Clone, Copy)]
enum PackageManager {
    Pnpm,
    Yarn,
    Npm,
    Bun,
}

impl PackageManager {
    fn install_cmd(self) -> &'static str {
        match self {
            PackageManager::Pnpm => "pnpm install",
            PackageManager::Yarn => "yarn install",
            PackageManager::Npm => "npm install",
            PackageManager::Bun => "bun install",
        }
    }

    fn from_name(name: &str) -> Option<Self> {
        match name {
            "pnpm" => Some(Self::Pnpm),
            "yarn" => Some(Self::Yarn),
            "npm" => Some(Self::Npm),
            "bun" => Some(Self::Bun),
            _ => None,
        }
    }
}

fn detect_package_manager(root: &Path) -> Option<PackageManager> {
    if !root.join("package.json").exists() {
        return None;
    }
    if let Ok(text) = std::fs::read_to_string(root.join("package.json")) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
            if let Some(spec) = json.get("packageManager").and_then(|v| v.as_str()) {
                if let Some(pm) = PackageManager::from_name(spec.split('@').next().unwrap_or("")) {
                    return Some(pm);
                }
            }
        }
    }
    let has = |f: &str| root.join(f).exists();
    if has("bun.lockb") || has("bun.lock") {
        Some(PackageManager::Bun)
    } else if has("pnpm-lock.yaml") {
        Some(PackageManager::Pnpm)
    } else if has("yarn.lock") {
        Some(PackageManager::Yarn)
    } else {
        Some(PackageManager::Npm)
    }
}

/// Login shell (`-ilc`) so PATH and version managers (nvm/fnm/volta, corepack)
/// resolve the binary, matching how actions run.
fn run_install(root: &Path, pm: PackageManager) -> Result<(), String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let script = format!(
        "cd {} && {} 2>&1",
        config::shell_quote(&root.to_string_lossy()),
        pm.install_cmd()
    );
    let out = Command::new(shell)
        .arg("-ilc")
        .arg(script)
        .current_dir(root)
        .output()
        .map_err(|e| format!("failed to launch {}: {e}", pm.install_cmd()))?;
    if out.status.success() {
        return Ok(());
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let mut tail: Vec<&str> = text.lines().rev().take(20).collect();
    tail.reverse();
    Err(format!("{} failed:\n{}", pm.install_cmd(), tail.join("\n").trim()))
}

fn duplicate_one(
    app: &AppHandle,
    name: &str,
    desired_name: Option<&str>,
    exclude_uncommitted: bool,
    reinstall_deps: bool,
) -> Result<String, String> {
    let src = load_root_and_parent(name)?;
    if src.root.trim().is_empty() {
        return Err("cannot duplicate an SSH project (no local root)".into());
    }
    let original = src.parent.clone().unwrap_or_else(|| name.to_string());
    let parent_dir = Path::new(&src.root)
        .parent()
        .ok_or("source root has no parent directory")?
        .to_path_buf();

    let (new_name, new_root) = match desired_name.map(str::trim).filter(|d| !d.is_empty()) {
        Some(d) => {
            config::validate_name(d)?;
            let root = parent_dir.join(d);
            if config::project_exists(d) || root.exists() {
                return Err(format!("a project named {d:?} already exists"));
            }
            (d.to_string(), root)
        }
        None => next_available_duplicate(&original, &parent_dir)?,
    };

    if let Err(e) = cp_clone(Path::new(&src.root), &new_root, reinstall_deps) {
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

    if reinstall_deps {
        if let Some(pm) = detect_package_manager(&new_root) {
            run_install(&new_root, pm)?;
        }
    }
    Ok(new_name)
}

#[tauri::command(async)]
pub fn duplicate_project(
    app: AppHandle,
    name: String,
    desired_name: Option<String>,
    exclude_uncommitted: bool,
    reinstall_deps: bool,
) -> Result<String, String> {
    duplicate_one(
        &app,
        &name,
        desired_name.as_deref(),
        exclude_uncommitted,
        reinstall_deps,
    )
}

/// Create `count` copies of a project in one pass (used to spawn a batch of
/// throwaway duplicates to run agents/commands on). Each copy is created via
/// `duplicate_one`, which emits `projects-changed` per copy so the sidebar
/// streams them in. If the very first copy fails the error is surfaced;
/// otherwise the batch stops at the first failure and returns the names
/// created so far so the caller can report a partial result.
#[tauri::command(async)]
pub fn duplicate_projects(
    app: AppHandle,
    name: String,
    count: u32,
    exclude_uncommitted: bool,
    reinstall_deps: bool,
) -> Result<Vec<String>, String> {
    let mut created = Vec::new();
    for _ in 0..count {
        match duplicate_one(&app, &name, None, exclude_uncommitted, reinstall_deps) {
            Ok(new_name) => created.push(new_name),
            Err(e) => {
                if created.is_empty() {
                    return Err(e);
                }
                break;
            }
        }
    }
    Ok(created)
}

// ---- remove -----------------------------------------------------------------

/// Tear down a single project: stop its session/forwards/sync, delete its
/// folder if it's a duplicate (originals keep their source folder), and drop
/// its config + settings references. Does not emit; callers emit once.
fn remove_one(app: &AppHandle, name: &str) -> Result<(), String> {
    let info = load_root_and_parent(name).ok();
    let is_duplicate = info.as_ref().and_then(|i| i.parent.as_ref()).is_some();
    let root = info.as_ref().map(|i| i.root.clone()).unwrap_or_default();

    // Stop the running session before deleting files (session name == file name
    // for created projects), then tear down port forwards/poller + sync mirror.
    let _ = crate::tmux::kill_session(name);
    crate::portforward::stop_project_forwards(app, name); // tunnels + poller + suggestions
    crate::sshsync::remove_project_sync(app, name); // watcher + local cache dir

    if is_duplicate {
        if !root.trim().is_empty() {
            config::remove_dir_all_retry(Path::new(&root))?;
        }
        // Numbered duplicate names get reused; purge per-name state so the
        // next project under this name doesn't inherit the removed one's
        // notes, instructions, or terminal layout.
        app.state::<crate::notes_cmds::NotesState>().purge(name);
        let _ = config::remove_dir_all_retry(&crate::templates::project_instructions_dir(name));
        clean_terminals_entry(name);
    }
    std::fs::remove_file(config::project_path(name)).map_err(|e| e.to_string())?;
    clean_settings_references(name);
    clean_group_references(name);
    Ok(())
}

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
    remove_one(&app, &name)?;
    let _ = app.emit("projects-changed", ());
    Ok(())
}

/// Remove a project together with every duplicate that references it. Each
/// duplicate's folder is deleted from disk (irreversible); the original keeps
/// its source folder. Duplicates are flattened to one level, so a single pass
/// over `duplicates_of` covers them all.
#[tauri::command(async)]
pub fn remove_project_cascade(app: AppHandle, name: String) -> Result<(), String> {
    for dup in config::duplicates_of(&name)? {
        remove_one(&app, &dup)?;
    }
    remove_one(&app, &name)?;
    let _ = app.emit("projects-changed", ());
    Ok(())
}

/// Remove several projects in one pass (used for bulk-pruning duplicates). Each
/// name is torn down via `remove_one`, so running sessions, port forwards, and
/// sync mirrors are stopped and duplicate folders are deleted from disk. A
/// single failure doesn't abort the batch: failed names are collected and
/// returned so the caller can report a partial result. Emits `projects-changed`
/// once at the end to avoid a refresh storm.
#[tauri::command(async)]
pub fn remove_projects(app: AppHandle, names: Vec<String>) -> Result<Vec<String>, String> {
    let mut failed = Vec::new();
    for name in &names {
        if remove_one(&app, name).is_err() {
            failed.push(name.clone());
        }
    }
    let _ = app.emit("projects-changed", ());
    Ok(failed)
}

/// Drop the project's entry from the persisted terminals config so a future
/// project reusing the name doesn't restore this one's pane tree.
fn clean_terminals_entry(name: &str) {
    let path = config::lpm_dir().join("terminals.json");
    let Ok(bytes) = std::fs::read(&path) else { return };
    let Ok(mut v) = serde_json::from_slice::<serde_json::Value>(&bytes) else { return };
    let Some(projects) = v.get_mut("projects").and_then(|p| p.as_object_mut()) else { return };
    if projects.remove(name).is_none() {
        return;
    }
    if let Ok(data) = serde_json::to_vec_pretty(&v) {
        let _ = std::fs::write(&path, data);
    }
}

fn clean_settings_references(name: &str) {
    let mut s = config::load_settings();
    let mut changed = false;
    for key in ["projectOrder", "sidebarOrder"] {
        if let Some(arr) = s.get_mut(key).and_then(|v| v.as_array_mut()) {
            let before = arr.len();
            arr.retain(|x| x.as_str() != Some(name));
            changed |= arr.len() != before;
        }
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

/// Drop the removed project's name from every sidebar folder's `members` in
/// groups.json. Empty folders are kept (the user can refill them).
fn clean_group_references(name: &str) {
    let path = config::groups_path();
    let Ok(bytes) = std::fs::read(&path) else { return };
    let Ok(mut v) = serde_json::from_slice::<serde_json::Value>(&bytes) else { return };
    let Some(groups) = v.get_mut("groups").and_then(|g| g.as_array_mut()) else { return };
    let mut changed = false;
    for group in groups {
        if let Some(members) = group.get_mut("members").and_then(|m| m.as_array_mut()) {
            let before = members.len();
            members.retain(|x| x.as_str() != Some(name));
            changed |= members.len() != before;
        }
    }
    if changed {
        if let Ok(data) = serde_json::to_vec_pretty(&v) {
            let _ = std::fs::write(&path, data);
        }
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
