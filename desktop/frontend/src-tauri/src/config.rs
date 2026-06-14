// Partial port of internal/config + desktop/projects.go toProjectInfo.
// Phase 2 covers services, profiles, running state, and settings persistence.
// Deferred to later phases: actions (with children/inputs), `extends`
// inheritance, and the global-config terminal merge — actions stay [] for now,
// which the UI renders safely.
use crate::services::RunState;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::PathBuf;

pub fn lpm_dir() -> PathBuf {
    dirs::home_dir().unwrap_or_default().join(".lpm")
}

pub fn projects_dir() -> PathBuf {
    lpm_dir().join("projects")
}

pub fn templates_dir() -> PathBuf {
    lpm_dir().join("templates")
}

pub fn notes_dir(project: &str) -> PathBuf {
    lpm_dir().join("notes").join(project)
}

pub fn global_path() -> PathBuf {
    lpm_dir().join("global.yml")
}

pub fn project_path(name: &str) -> PathBuf {
    projects_dir().join(format!("{name}.yml"))
}

pub fn settings_path() -> PathBuf {
    lpm_dir().join("settings.json")
}

const RESERVED_PROJECT_NAME: &str = "__global__";

/// Mirrors config.EnsureDirs: create the projects + templates dirs.
pub fn ensure_dirs() -> Result<(), String> {
    std::fs::create_dir_all(projects_dir()).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(templates_dir()).map_err(|e| e.to_string())?;
    Ok(())
}

/// Recursive delete with backoff for transiently-held files (e.g. a process
/// still flushing inside the tree). Missing path is success.
pub fn remove_dir_all_retry(p: &std::path::Path) -> Result<(), String> {
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
    Err(format!("failed to remove {}: {last}", p.display()))
}

/// Write a config file, preserving the existing mode on overwrite (else 0644).
pub fn write_config_file(path: &std::path::Path, content: &str) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let mode = std::fs::metadata(path)
        .map(|m| m.permissions().mode())
        .unwrap_or(0o644);
    std::fs::write(path, content).map_err(|e| e.to_string())?;
    let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode));
    Ok(())
}

/// config.PeekParent: a project's `parent_name`, or None when absent/empty/unreadable.
pub fn peek_parent(name: &str) -> Option<String> {
    let y = parse_project_yaml(name).ok()?;
    if y.parent_name.is_empty() {
        None
    } else {
        Some(y.parent_name)
    }
}

/// Project file names whose `parent_name` == `name` (i.e. duplicates of it).
pub fn duplicates_of(name: &str) -> Result<Vec<String>, String> {
    Ok(project_names()
        .into_iter()
        .filter(|n| peek_parent(n).as_deref() == Some(name))
        .collect())
}

pub fn project_exists(name: &str) -> bool {
    project_path(name).exists()
}

/// config.ValidateName: reject empty, path separators, `.`/`..`, and the
/// reserved global name.
pub fn validate_name(name: &str) -> Result<(), String> {
    if name.is_empty()
        || name.contains('/')
        || name.contains('\\')
        || name == "."
        || name == ".."
        || name == RESERVED_PROJECT_NAME
    {
        return Err(format!("invalid project name: {name:?}"));
    }
    Ok(())
}

#[derive(Deserialize, Default)]
pub struct NameOnly {
    #[serde(default)]
    pub name: String,
}

/// config.RepoPath for a project: <expanded root>/.lpm.yml. Errors for SSH
/// projects or when root is empty.
pub fn repo_path_for_project(name: &str) -> Result<PathBuf, String> {
    let y = parse_project_yaml(name)?;
    let is_remote = y
        .ssh
        .as_ref()
        .map(|s| !s.host.is_empty() && !s.user.is_empty())
        .unwrap_or(false);
    if is_remote {
        return Err("repo config is not available for SSH projects".into());
    }
    if y.root.trim().is_empty() {
        return Err(format!("project {name:?} has no root"));
    }
    Ok(std::path::Path::new(&expand_home(&y.root)).join(".lpm.yml"))
}

/// Mirrors config.ExpandHome: leading `~` resolves to the home directory.
pub fn expand_home(p: &str) -> String {
    if p == "~" {
        return dirs::home_dir().unwrap_or_default().to_string_lossy().into_owned();
    }
    if let Some(rest) = p.strip_prefix("~/") {
        return dirs::home_dir()
            .unwrap_or_default()
            .join(rest)
            .to_string_lossy()
            .into_owned();
    }
    p.to_string()
}

/// Inverse of expand_home: collapse a $HOME-prefixed path to `~` / `~/rest`.
pub fn collapse_home(p: &str) -> String {
    if p.is_empty() {
        return String::new();
    }
    let home = dirs::home_dir().unwrap_or_default();
    let home = home.to_string_lossy();
    if p == home {
        return "~".into();
    }
    if let Some(rest) = p.strip_prefix(&format!("{home}/")) {
        return format!("~/{rest}");
    }
    p.to_string()
}

// ---- settings ---------------------------------------------------------------

fn default_settings() -> Value {
    json!({
        "theme": "dark",
        "doubleClickToToggle": false,
        "terminalTheme": "claude-dark"
    })
}

pub fn load_settings() -> Value {
    match std::fs::read(settings_path()) {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_else(|_| default_settings()),
        Err(_) => default_settings(),
    }
}

pub fn save_settings(s: &Value) -> Result<(), String> {
    std::fs::create_dir_all(lpm_dir()).map_err(|e| e.to_string())?;
    let data = serde_json::to_vec_pretty(s).map_err(|e| e.to_string())?;
    std::fs::write(settings_path(), data).map_err(|e| e.to_string())
}

/// Read-modify-write a single field (used by SaveWindowSize).
pub fn merge_settings(patch: Value) -> Result<(), String> {
    let mut current = load_settings();
    if let (Some(obj), Some(p)) = (current.as_object_mut(), patch.as_object()) {
        for (k, v) in p {
            obj.insert(k.clone(), v.clone());
        }
    }
    save_settings(&current)
}

// ---- project config ---------------------------------------------------------

/// A service is either a bare command string or a full map (config.Service's
/// custom UnmarshalYAML).
#[derive(Deserialize)]
#[serde(untagged)]
enum ServiceDef {
    Cmd(String),
    Full(ServiceFull),
}

#[derive(Deserialize, Default, Clone)]
pub struct ServiceFull {
    #[serde(default)]
    pub cmd: String,
    #[serde(default)]
    pub cwd: String,
    #[serde(default)]
    pub port: i64,
    #[serde(rename = "portConflict", default)]
    pub port_conflict: String,
    #[serde(default)]
    pub env: BTreeMap<String, String>,
}

impl ServiceDef {
    fn into_full(self) -> ServiceFull {
        match self {
            ServiceDef::Cmd(cmd) => ServiceFull { cmd, ..Default::default() },
            ServiceDef::Full(f) => f,
        }
    }
}

#[derive(Deserialize, Clone, Default)]
pub struct SshSettings {
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

impl SshSettings {
    pub fn is_remote(&self) -> bool {
        !self.host.is_empty() && !self.user.is_empty()
    }
}

/// An action/terminal entry is either a bare command string or a full map
/// (config.Action's custom UnmarshalYAML).
#[derive(Deserialize, Clone)]
#[serde(untagged)]
enum ActionDef {
    Cmd(String),
    Full(ActionFull),
}

/// A single `port` entry: a bare port number, or a string holding either one
/// port (`"3000"`) or an inclusive range (`"3002-3010"`).
#[derive(Deserialize, Clone)]
#[serde(untagged)]
enum PortEntry {
    Num(i64),
    Text(String),
}

/// An action's `port` is either a single entry or a list of them. A scalar
/// integer stays back-compatible with the long-standing `port: 3000` form;
/// string entries allow inclusive ranges, e.g. `port: [3000, "3002-3010"]`.
#[derive(Deserialize, Clone)]
#[serde(untagged)]
enum PortSpec {
    One(PortEntry),
    Many(Vec<PortEntry>),
}

impl Default for PortSpec {
    fn default() -> Self {
        PortSpec::Many(Vec::new())
    }
}

/// Upper bound on ports a single range may expand to, to keep a stray
/// `"1-65535"` from ballooning the conflict set.
const PORT_RANGE_MAX: usize = 1024;

fn push_port(out: &mut Vec<i64>, p: i64) {
    if p > 0 && p <= 65535 {
        out.push(p);
    }
}

/// Expands one string entry: an inclusive `lo-hi` range, or a single number.
/// Reversed ranges (`hi-lo`) are normalized; out-of-range ends are clamped to
/// 1..=65535; the expansion is capped at PORT_RANGE_MAX ports.
fn expand_port_text(s: &str, out: &mut Vec<i64>) {
    let s = s.trim();
    if let Some((lo, hi)) = s.split_once('-') {
        if let (Ok(lo), Ok(hi)) = (lo.trim().parse::<i64>(), hi.trim().parse::<i64>()) {
            let (lo, hi) = if lo <= hi { (lo, hi) } else { (hi, lo) };
            let lo = lo.max(1);
            let hi = hi.min(65535);
            if lo <= hi {
                let last = (lo + PORT_RANGE_MAX as i64 - 1).min(hi);
                for p in lo..=last {
                    out.push(p);
                }
            }
        }
        return;
    }
    if let Ok(p) = s.parse::<i64>() {
        push_port(out, p);
    }
}

fn expand_port_entry(e: &PortEntry, out: &mut Vec<i64>) {
    match e {
        PortEntry::Num(p) => push_port(out, *p),
        PortEntry::Text(s) => expand_port_text(s, out),
    }
}

impl PortSpec {
    fn to_vec(&self) -> Vec<i64> {
        let mut out = Vec::new();
        match self {
            PortSpec::One(e) => expand_port_entry(e, &mut out),
            PortSpec::Many(v) => {
                for e in v {
                    expand_port_entry(e, &mut out);
                }
            }
        }
        out
    }

    fn is_empty(&self) -> bool {
        self.to_vec().is_empty()
    }
}

#[derive(Deserialize, Default, Clone)]
struct ActionFull {
    #[serde(default)]
    cmd: String,
    #[serde(default)]
    label: String,
    #[serde(default)]
    emoji: String,
    #[serde(default)]
    cwd: String,
    #[serde(default)]
    port: PortSpec,
    #[serde(rename = "portConflict", default)]
    port_conflict: String,
    #[serde(default)]
    env: BTreeMap<String, String>,
    #[serde(default)]
    confirm: bool,
    #[serde(default)]
    display: String,
    #[serde(rename = "type", default)]
    kind: String,
    #[serde(default)]
    reuse: bool,
    #[serde(default)]
    mode: String,
    #[serde(default)]
    position: Option<f64>,
    #[serde(default)]
    inputs: BTreeMap<String, ActionInputDef>,
    #[serde(default)]
    actions: BTreeMap<String, ActionDef>, // children
}

impl ActionDef {
    fn into_full(self) -> ActionFull {
        match self {
            ActionDef::Cmd(cmd) => ActionFull { cmd, ..Default::default() },
            ActionDef::Full(f) => f,
        }
    }
}

#[derive(Deserialize, Default, Clone)]
struct ActionInputDef {
    #[serde(default)]
    label: String,
    #[serde(rename = "type", default)]
    kind: String,
    #[serde(default)]
    required: bool,
    #[serde(default)]
    placeholder: String,
    #[serde(default)]
    default: String,
    #[serde(default)]
    options: Vec<ActionInputOptionDef>,
}

#[derive(Deserialize, Clone)]
#[serde(untagged)]
enum ActionInputOptionDef {
    Scalar(String),
    Full { label: String, value: String },
}

#[derive(Deserialize, Default)]
struct ProjectYaml {
    #[serde(default)]
    name: String,
    #[serde(default)]
    root: String,
    #[serde(default)]
    label: String,
    #[serde(default)]
    parent_name: String,
    ssh: Option<SshSettings>,
    #[serde(default)]
    services: BTreeMap<String, ServiceDef>,
    #[serde(default)]
    profiles: BTreeMap<String, Vec<String>>,
}

/// Parsed separately from ProjectYaml so a malformed action section can never
/// regress the sidebar's ListProjects (it only fails the start-terminal call).
#[derive(Deserialize, Default)]
struct ActionsYaml {
    #[serde(default)]
    extends: Vec<String>,
    #[serde(default)]
    terminals: BTreeMap<String, ActionDef>,
    #[serde(default)]
    actions: BTreeMap<String, ActionDef>,
}

fn parse_project_yaml(name: &str) -> Result<ProjectYaml, String> {
    let path = projects_dir().join(format!("{name}.yml"));
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    serde_yaml::from_slice::<ProjectYaml>(&bytes).map_err(|e| e.to_string())
}

/// config.ResolveCwd: absolute cwd as-is, empty -> root, else root/cwd.
pub fn resolve_cwd(root: &str, cwd: &str) -> String {
    if cwd.is_empty() {
        return root.to_string();
    }
    if std::path::Path::new(cwd).is_absolute() {
        return cwd.to_string();
    }
    std::path::Path::new(root)
        .join(cwd)
        .to_string_lossy()
        .into_owned()
}

// ---- SSH command building (port of internal/config/config.go) ---------------

/// Single-quote wrap, escaping embedded single quotes as '\''.
pub fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// /tmp/lpm-<uid> — short path keeps the ControlPath socket under sun_path's limit.
pub fn ssh_control_dir() -> String {
    let uid = unsafe { libc::getuid() };
    format!("/tmp/lpm-{uid}")
}

pub fn ssh_control_path() -> String {
    format!("{}/cm-%C", ssh_control_dir())
}

pub fn ensure_ssh_control_dir() -> Result<(), String> {
    use std::os::unix::fs::DirBuilderExt;
    std::fs::DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(ssh_control_dir())
        .map_err(|e| e.to_string())
}

/// ssh connection args (no leading "ssh", no trailing command). -t always; -p
/// only when port>0 && !=22; -i only when key set (~-expanded for the local client).
pub fn ssh_args(ssh: &SshSettings) -> Vec<String> {
    let mut args = vec![
        "-t".into(),
        "-o".into(),
        "ControlMaster=auto".into(),
        "-o".into(),
        format!("ControlPath={}", ssh_control_path()),
        "-o".into(),
        "ControlPersist=10m".into(),
    ];
    if ssh.port > 0 && ssh.port != 22 {
        args.push("-p".into());
        args.push(ssh.port.to_string());
    }
    let key = ssh.key.trim();
    if !key.is_empty() {
        args.push("-i".into());
        args.push(expand_home(key));
    }
    args.push(format!("{}@{}", ssh.user, ssh.host));
    args
}

/// scp options that piggyback on the same ControlMaster socket ssh_args uses,
/// so an scp call from a long-lived terminal session reuses the auth. Note `-P`
/// (capital) for the port, unlike ssh's `-p`; no `-t`.
pub fn scp_args(ssh: &SshSettings) -> Vec<String> {
    let mut args = vec![
        "-o".into(),
        "ControlMaster=auto".into(),
        "-o".into(),
        format!("ControlPath={}", ssh_control_path()),
        "-o".into(),
        "ControlPersist=10m".into(),
    ];
    if ssh.port > 0 && ssh.port != 22 {
        args.push("-P".into());
        args.push(ssh.port.to_string());
    }
    let key = ssh.key.trim();
    if !key.is_empty() {
        args.push("-i".into());
        args.push(expand_home(key));
    }
    args
}

/// Local hostname (libc gethostname), "" on failure.
pub fn hostname() -> String {
    let mut buf = [0u8; 256];
    let rc = unsafe { libc::gethostname(buf.as_mut_ptr() as *mut libc::c_char, buf.len()) };
    if rc != 0 {
        return String::new();
    }
    let end = buf.iter().position(|&b| b == 0).unwrap_or(buf.len());
    String::from_utf8_lossy(&buf[..end]).into_owned()
}

pub fn hostname_or_mac() -> String {
    let h = hostname();
    if h.is_empty() {
        "mac".into()
    } else {
        h
    }
}

/// Keep [A-Za-z0-9-_]; map everything else to '-'. Empty result -> "mac".
pub fn sanitize_host(host: &str) -> String {
    let mut out = String::with_capacity(host.len());
    for c in host.chars() {
        if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
            out.push(c);
        } else {
            out.push('-');
        }
    }
    if out.is_empty() {
        "mac".into()
    } else {
        out
    }
}

/// All command strings for a project (services + actions + child actions),
/// for the import-issue tool scan. Uses the resolved map (incl. extends/global).
pub fn project_cmd_strings(file_name: &str) -> Vec<String> {
    let mut out = Vec::new();
    if let Ok(info) = spawn_info(file_name) {
        for s in info.services.values() {
            out.push(s.cmd.clone());
        }
    }
    for a in resolve_action_map(file_name).values() {
        out.push(a.cmd.clone());
        for child in a.actions.values() {
            out.push(child.clone().into_full().cmd);
        }
    }
    out
}

/// Tilde paths emit a "$HOME" segment the REMOTE shell expands; else literal.
fn quote_remote_path(p: &str) -> String {
    if p.is_empty() {
        return String::new();
    }
    if p == "~" {
        return "\"$HOME\"".into();
    }
    if let Some(rest) = p.strip_prefix("~/") {
        return format!("\"$HOME\"{}", shell_quote(&format!("/{rest}")));
    }
    shell_quote(p)
}

/// Resolve cwd against the remote base dir; absolute/tilde cwd wins verbatim.
fn join_remote_dir(dir: &str, cwd: &str) -> String {
    let cwd = cwd.trim().trim_end_matches('/');
    let dir = dir.trim().trim_end_matches('/');
    if cwd.is_empty() {
        return dir.to_string();
    }
    if cwd.starts_with('/') || cwd.starts_with('~') {
        return cwd.to_string();
    }
    if dir.is_empty() {
        return cwd.to_string();
    }
    format!("{dir}/{cwd}")
}

pub fn build_local_script(env: &BTreeMap<String, String>, cmd: &str) -> String {
    let mut parts: Vec<String> = Vec::new();
    for (k, v) in env {
        parts.push(format!("export {k}={}", shell_quote(v)));
    }
    let cmd = cmd.trim();
    if !cmd.is_empty() {
        parts.push(cmd.to_string());
    }
    parts.join(" && ")
}

/// config.TrimTail: trim whitespace, then keep the last `n` bytes prefixed with
/// "...". Go byte-slices; we walk forward to the next char boundary to avoid a
/// panic on a multibyte tail (stays within the n-byte budget).
pub fn trim_tail(out: &[u8], n: usize) -> String {
    let lossy = String::from_utf8_lossy(out);
    let s = lossy.trim();
    if s.len() <= n {
        return s.to_string();
    }
    let mut start = s.len() - n;
    while start < s.len() && !s.is_char_boundary(start) {
        start += 1;
    }
    format!("...{}", &s[start..])
}

fn build_remote_script(remote_dir: &str, env: &BTreeMap<String, String>, cmd: &str) -> String {
    let body = build_local_script(env, cmd);
    if remote_dir.is_empty() {
        return body;
    }
    let cd = format!("cd {}", quote_remote_path(remote_dir));
    if body.is_empty() {
        return cd;
    }
    format!("{cd} && {body}")
}

fn wrap_as_login_shell(script: &str) -> String {
    if script.trim().is_empty() {
        return String::new();
    }
    format!("bash -ilc {}", shell_quote(script))
}

/// Local cwd for the ssh client / tmux spawn ($HOME preferred, else root).
pub fn remote_local_spawn_dir(root: &str) -> String {
    match dirs::home_dir() {
        Some(h) if !h.as_os_str().is_empty() => h.to_string_lossy().into_owned(),
        _ => root.to_string(),
    }
}

/// Full ssh argv for spawning in a PTY (terminals).
pub fn ssh_command_argv(
    ssh: &SshSettings,
    cwd: &str,
    env: &BTreeMap<String, String>,
    inner_cmd: &str,
) -> Vec<String> {
    let mut argv = vec!["ssh".to_string()];
    argv.extend(ssh_args(ssh));
    let script = build_remote_script(&join_remote_dir(&ssh.dir, cwd), env, inner_cmd);
    let wrapped = wrap_as_login_shell(&script);
    if !wrapped.is_empty() {
        argv.push(wrapped);
    }
    argv
}

/// Same as ssh_command_argv but as one shell line (the wrapped script quoted
/// again) for tmux send-keys, which re-parses the line into argv.
pub fn ssh_command_line(
    ssh: &SshSettings,
    cwd: &str,
    env: &BTreeMap<String, String>,
    inner_cmd: &str,
) -> String {
    let mut argv = vec!["ssh".to_string()];
    argv.extend(ssh_args(ssh));
    let script = build_remote_script(&join_remote_dir(&ssh.dir, cwd), env, inner_cmd);
    let wrapped = wrap_as_login_shell(&script);
    if !wrapped.is_empty() {
        argv.push(shell_quote(&wrapped));
    }
    argv.join(" ")
}

/// desktop/socket.go SocketPath().
pub fn socket_path() -> String {
    lpm_dir().join("lpm.sock").to_string_lossy().into_owned()
}

/// (expanded root, is_remote) for a project, for terminal spawning.
pub fn project_root(name: &str) -> Result<(String, bool), String> {
    let y = parse_project_yaml(name)?;
    let is_remote = y
        .ssh
        .as_ref()
        .map(|s| !s.host.is_empty() && !s.user.is_empty())
        .unwrap_or(false);
    Ok((expand_home(&y.root), is_remote))
}

pub struct TerminalSpawn {
    pub cmd: String,
    pub cwd: String,
    pub env: BTreeMap<String, String>,
}

/// Resolve a named terminal action: an entry under `terminals:` (implicitly a
/// terminal) or one under `actions:` with `type: terminal`. The name may be a
/// `parent:child` composite (a nested action) — same lookup as
/// action_ports_and_conflict / resolve_action_full. Returns None when the name resolves to a non-terminal
/// action or doesn't exist at all (callers fall back to a plain shell).
pub fn resolve_terminal_action(
    project: &str,
    name: &str,
) -> Result<Option<TerminalSpawn>, String> {
    // Use the fully resolved map so global/extends terminal entries launch too.
    let map = resolve_action_map(project);
    Ok(lookup_action(&map, name)
        .filter(|a| a.kind == "terminal")
        .map(|a| TerminalSpawn {
            cmd: a.cmd,
            cwd: a.cwd,
            env: a.env,
        }))
}

/// Look up an action by name in an already-resolved map, handling the
/// `parent:child` composite form (a nested action, with parent inheritance
/// applied). Shared by every action consumer so they treat names identically.
fn lookup_action(map: &BTreeMap<String, ActionFull>, name: &str) -> Option<ActionFull> {
    match name.split_once(':') {
        Some((parent, child)) => {
            let p = map.get(parent)?;
            let c = p.actions.get(child)?.clone().into_full();
            Some(resolved_child(p, &c))
        }
        None => map.get(name).cloned(),
    }
}

// ---- action resolution engine (config.ResolvedActions / toProjectInfo) ------
// Bounded port: project actions+terminals (+ one extends-template flatten),
// duplicate->parent inheritance, the repo .lpm.yml merge, and the global.yml
// merge. DEFERRED: recursive template extends, grandchild actions, repo-level
// extends resolved relative to the repo dir.

#[derive(serde::Serialize, Clone)]
pub struct ActionInputOption {
    pub label: String,
    pub value: String,
}

#[derive(serde::Serialize, Clone)]
pub struct ActionInputInfo {
    pub key: String,
    pub label: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub required: bool,
    pub placeholder: String,
    pub default: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub options: Vec<ActionInputOption>,
}

#[derive(serde::Serialize, Clone)]
pub struct ActionInfo {
    pub name: String,
    pub label: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub emoji: String,
    pub cmd: String,
    pub cwd: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub port: Vec<i64>,
    #[serde(rename = "portConflict", skip_serializing_if = "String::is_empty")]
    pub port_conflict: String,
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub env: BTreeMap<String, String>,
    pub confirm: bool,
    pub display: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub reuse: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position: Option<f64>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub inputs: Vec<ActionInputInfo>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<ActionInfo>,
}

fn terminal_to_action(mut a: ActionFull) -> ActionFull {
    if a.kind.is_empty() {
        a.kind = "terminal".into();
    }
    a
}

fn load_actions_yaml(path: &std::path::Path) -> Option<ActionsYaml> {
    serde_yaml::from_slice(&std::fs::read(path).ok()?).ok()
}

fn template_actions_path(name: &str) -> Option<PathBuf> {
    for ext in ["yml", "yaml"] {
        let p = templates_dir().join(format!("{name}.{ext}"));
        if p.exists() {
            return Some(p);
        }
    }
    None
}

/// actions (highest) over terminals (kind defaults to "terminal").
fn build_base_layer(y: &ActionsYaml) -> BTreeMap<String, ActionFull> {
    let mut m: BTreeMap<String, ActionFull> = BTreeMap::new();
    for (k, def) in &y.actions {
        m.insert(k.clone(), def.clone().into_full());
    }
    for (k, def) in &y.terminals {
        m.entry(k.clone())
            .or_insert_with(|| terminal_to_action(def.clone().into_full()));
    }
    m
}

/// A layer + one flatten pass of its `extends` templates (declaring layer wins).
fn build_layer(y: &ActionsYaml) -> BTreeMap<String, ActionFull> {
    let mut m = build_base_layer(y);
    for tref in &y.extends {
        if let Some(tp) = template_actions_path(tref) {
            if let Some(ty) = load_actions_yaml(&tp) {
                merge_action_fallback(&mut m, build_base_layer(&ty));
            }
        }
    }
    m
}

/// `dst` (higher precedence) wins; missing keys come from `src`, present keys
/// inherit only zero-valued `dst` fields.
fn merge_action_fallback(dst: &mut BTreeMap<String, ActionFull>, src: BTreeMap<String, ActionFull>) {
    for (k, s) in src {
        match dst.get_mut(&k) {
            None => {
                dst.insert(k, s);
            }
            Some(d) => merge_action(d, &s),
        }
    }
}

fn merge_action(d: &mut ActionFull, s: &ActionFull) {
    if d.cmd.is_empty() {
        d.cmd = s.cmd.clone();
    }
    if d.label.is_empty() {
        d.label = s.label.clone();
    }
    if d.emoji.is_empty() {
        d.emoji = s.emoji.clone();
    }
    if d.cwd.is_empty() {
        d.cwd = s.cwd.clone();
    }
    if d.port.is_empty() {
        d.port = s.port.clone();
    }
    if d.port_conflict.is_empty() {
        d.port_conflict = s.port_conflict.clone();
    }
    if d.env.is_empty() {
        d.env = s.env.clone();
    }
    if !d.confirm {
        d.confirm = s.confirm; // false = inherit (can't flip true->false; faithful to Go)
    }
    if d.display.is_empty() {
        d.display = s.display.clone();
    }
    if d.kind.is_empty() {
        d.kind = s.kind.clone();
    }
    if !d.reuse {
        d.reuse = s.reuse;
    }
    if d.mode.is_empty() {
        d.mode = s.mode.clone();
    }
    if d.position.is_none() {
        d.position = s.position;
    }
    if d.inputs.is_empty() {
        d.inputs = s.inputs.clone();
    }
    if d.actions.is_empty() {
        d.actions = s.actions.clone();
    }
}

/// Resolved action map: project (+extends) > parent (duplicate) > global.
fn resolve_action_map(file_name: &str) -> BTreeMap<String, ActionFull> {
    let mut map = match load_actions_yaml(&project_path(file_name)) {
        Some(y) => build_layer(&y),
        None => BTreeMap::new(),
    };
    if let Some(parent) = peek_parent(file_name) {
        if let Some(py) = load_actions_yaml(&project_path(&parent)) {
            merge_action_fallback(&mut map, build_layer(&py));
        }
    }
    // Repo <root>/.lpm.yml actions/terminals (local projects only): under the
    // user project, over global. Matches Go ApplyDefaults' repo layer.
    if let Ok((root, is_remote)) = project_root(file_name) {
        if !is_remote && !root.is_empty() {
            if let Some(ry) = load_actions_yaml(&std::path::Path::new(&root).join(".lpm.yml")) {
                merge_action_fallback(&mut map, build_layer(&ry));
            }
        }
    }
    if let Some(gy) = load_actions_yaml(&global_path()) {
        merge_action_fallback(&mut map, build_layer(&gy));
    }
    map
}

/// Working-tree dirs never worth watching/syncing (build output, deps, editor
/// state). Shared by the git file-watcher (git.rs) and the sshsync rsync mirror.
pub const IGNORED_WATCH_DIRS: &[&str] = &[
    "node_modules", "dist", "build", "out", "target", "vendor", ".next", ".nuxt",
    ".svelte-kit", ".turbo", ".cache", ".parcel-cache", ".yarn", ".pnpm-store",
    ".venv", "venv", "__pycache__", ".mypy_cache", ".pytest_cache", ".gradle",
    ".idea", ".vscode",
];

/// Build outputs and compiler/tool caches: regenerable and tied to the source's
/// absolute path. Skipped when duplicating a project — cloning a stale .next /
/// Turbopack cache from the original path forces a full cold recompile on the
/// copy's first run, which saturates CPU. Dependency dirs (node_modules, .venv,
/// …) are deliberately absent so a duplicate still runs without a reinstall.
pub const DUPLICATE_SKIP_DIRS: &[&str] = &[
    ".next", ".nuxt", ".svelte-kit", ".turbo", ".swc", ".cache", ".parcel-cache",
    "dist", "build", "out", "target", "__pycache__", ".mypy_cache", ".pytest_cache",
    ".gradle",
];

/// Declared service ports (port > 0) of an already-loaded project — the set the
/// port poller / PTY sniffer auto-forwards (vs. merely suggesting).
pub fn declared_service_ports_of(info: &SpawnInfo) -> std::collections::HashSet<u16> {
    info.services
        .values()
        .filter(|s| s.port > 0 && s.port <= 65535)
        .map(|s| s.port as u16)
        .collect()
}

/// As above, by project name (re-loads config). Empty on error.
pub fn declared_service_ports(name: &str) -> std::collections::HashSet<u16> {
    spawn_info(name).map(|i| declared_service_ports_of(&i)).unwrap_or_default()
}

/// config.mergeService: project fields win; empty ones fall back to the repo.
fn merge_service(dst: &mut ServiceFull, src: &ServiceFull) {
    if dst.cmd.is_empty() {
        dst.cmd = src.cmd.clone();
    }
    if dst.cwd.is_empty() {
        dst.cwd = src.cwd.clone();
    }
    if dst.port == 0 {
        dst.port = src.port;
    }
    if dst.port_conflict.is_empty() {
        dst.port_conflict = src.port_conflict.clone();
    }
    if dst.env.is_empty() {
        dst.env = src.env.clone();
    }
}

/// Parse <root>/.lpm.yml as a project-shaped doc for its `services`/`profiles`
/// (actions/terminals/extends are read separately by resolve_action_map).
/// Missing or invalid -> empty. config.LoadRepo equivalent (services+profiles).
fn load_repo_yaml(root: &str) -> ProjectYaml {
    if root.is_empty() {
        return ProjectYaml::default();
    }
    let path = std::path::Path::new(root).join(".lpm.yml");
    std::fs::read(&path)
        .ok()
        .and_then(|b| serde_yaml::from_slice::<ProjectYaml>(&b).ok())
        .unwrap_or_default()
}

/// Merge repo <root>/.lpm.yml services + profiles UNDER the given maps (project
/// wins; empty service fields fall back to repo). No-op for remote/empty root.
/// `root` must already be expanded. Shared by spawn_info + to_project_info.
fn merge_repo_services_profiles(
    root: &str,
    is_remote: bool,
    services: &mut BTreeMap<String, ServiceFull>,
    profiles: &mut BTreeMap<String, Vec<String>>,
) {
    if is_remote || root.is_empty() {
        return;
    }
    let repo = load_repo_yaml(root);
    for (n, d) in repo.services {
        let full = d.into_full();
        match services.get_mut(&n) {
            Some(existing) => merge_service(existing, &full),
            None => {
                services.insert(n, full);
            }
        }
    }
    for (k, v) in repo.profiles {
        profiles.entry(k).or_insert(v);
    }
}

/// Merge a duplicate's parent project services + profiles UNDER the given maps
/// (the duplicate's own config wins). resolve_actions already inherits actions
/// from the parent; without the same for services a duplicate has no services
/// and loses its Start button.
fn merge_parent_services_profiles(
    file_name: &str,
    services: &mut BTreeMap<String, ServiceFull>,
    profiles: &mut BTreeMap<String, Vec<String>>,
) {
    let Some(parent) = peek_parent(file_name) else {
        return;
    };
    let Ok(parent_yaml) = parse_project_yaml(&parent) else {
        return;
    };
    for (n, d) in parent_yaml.services {
        let full = d.into_full();
        match services.get_mut(&n) {
            Some(existing) => merge_service(existing, &full),
            None => {
                services.insert(n, full);
            }
        }
    }
    for (k, v) in parent_yaml.profiles {
        profiles.entry(k).or_insert(v);
    }
}

/// config.Action.ResolvedChild: child inherits parent cwd/mode; env overlaid.
fn resolved_child(parent: &ActionFull, child: &ActionFull) -> ActionFull {
    let mut c = child.clone();
    if c.cwd.is_empty() {
        c.cwd = parent.cwd.clone();
    }
    if c.mode.is_empty() {
        c.mode = parent.mode.clone();
    }
    if c.port_conflict.is_empty() {
        c.port_conflict = parent.port_conflict.clone();
    }
    // A child under a terminal parent is itself a terminal unless it says
    // otherwise — without this it serializes as a plain (non-terminal) action and
    // resolve_terminal_action's kind filter would drop it. Mirrors cwd/mode above.
    if c.kind.is_empty() {
        c.kind = parent.kind.clone();
    }
    let mut env = parent.env.clone();
    for (k, v) in &child.env {
        env.insert(k.clone(), v.clone());
    }
    c.env = env;
    c
}

fn build_input_infos(inputs: &BTreeMap<String, ActionInputDef>) -> Vec<ActionInputInfo> {
    inputs
        .iter()
        .map(|(key, inp)| {
            let kind = if inp.kind.is_empty() {
                "text".to_string()
            } else {
                inp.kind.clone()
            };
            let label = if inp.label.is_empty() {
                key.clone()
            } else {
                inp.label.clone()
            };
            let options = inp
                .options
                .iter()
                .map(|o| match o {
                    ActionInputOptionDef::Scalar(s) => ActionInputOption {
                        label: s.clone(),
                        value: s.clone(),
                    },
                    ActionInputOptionDef::Full { label, value } => ActionInputOption {
                        label: label.clone(),
                        value: value.clone(),
                    },
                })
                .collect();
            ActionInputInfo {
                key: key.clone(),
                label,
                kind,
                required: inp.required,
                placeholder: inp.placeholder.clone(),
                default: inp.default.clone(),
                options,
            }
        })
        .collect()
}

fn sort_action_names(names: &mut [String], pos_of: impl Fn(&str) -> Option<f64>) {
    names.sort_by(|a, b| match (pos_of(a), pos_of(b)) {
        (Some(pa), Some(pb)) => pa
            .partial_cmp(&pb)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.cmp(b)),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => a.cmp(b),
    });
}

// `id` may be composite (`parent:child`) for menu children; `name` is the
// plain action name the label falls back to.
fn action_to_info(id: &str, name: &str, act: &ActionFull) -> ActionInfo {
    let label = if act.label.is_empty() {
        name.to_string()
    } else {
        act.label.clone()
    };
    ActionInfo {
        name: id.to_string(),
        label,
        emoji: act.emoji.clone(),
        cmd: act.cmd.clone(),
        cwd: act.cwd.clone(),
        port: act.port.to_vec(),
        port_conflict: act.port_conflict.clone(),
        env: act.env.clone(),
        confirm: act.confirm,
        display: act.display.clone(),
        kind: act.kind.clone(),
        reuse: act.reuse,
        position: act.position,
        inputs: build_input_infos(&act.inputs),
        children: vec![],
    }
}

/// Sorted ActionInfo list (one level of children) as JSON values.
pub fn resolve_actions(file_name: &str) -> Vec<Value> {
    let resolved = resolve_action_map(file_name);
    let mut names: Vec<String> = resolved.keys().cloned().collect();
    sort_action_names(&mut names, |n| resolved.get(n).and_then(|a| a.position));

    let mut out: Vec<ActionInfo> = Vec::with_capacity(names.len());
    for name in &names {
        let act = &resolved[name];
        let mut info = action_to_info(name, name, act);
        if !act.actions.is_empty() {
            let children: BTreeMap<String, ActionFull> = act
                .actions
                .iter()
                .map(|(k, d)| (k.clone(), resolved_child(act, &d.clone().into_full())))
                .collect();
            let mut cnames: Vec<String> = children.keys().cloned().collect();
            sort_action_names(&mut cnames, |cn| children.get(cn).and_then(|a| a.position));
            info.children = cnames
                .iter()
                .map(|cn| action_to_info(&format!("{name}:{cn}"), cn, &children[cn]))
                .collect();
        }
        out.push(info);
    }
    out.into_iter()
        .map(|a| serde_json::to_value(a).unwrap_or(Value::Null))
        .collect()
}

// ---- run-state resolution (projects.go / config.go) -------------------------

/// config.ServicesForProfile: empty profile -> "default"; explicit profile list
/// when defined; else all service names (sorted — caller passes sorted slice).
pub fn services_for_profile(
    profiles: &BTreeMap<String, Vec<String>>,
    all_names: &[String],
    profile: &str,
) -> Vec<String> {
    let p = if profile.is_empty() { "default" } else { profile };
    match profiles.get(p) {
        Some(names) => names.clone(),
        None => all_names.to_vec(),
    }
}

fn running_service_names(
    profiles: &BTreeMap<String, Vec<String>>,
    all_names: &[String],
    state: &RunState,
) -> Vec<String> {
    if !state.services.is_empty() {
        return state.services.clone();
    }
    services_for_profile(profiles, all_names, &state.profile)
}

/// projects.go matchProfile: the profile whose service set exactly equals the
/// running set, or "" if none matches.
fn match_profile(profiles: &BTreeMap<String, Vec<String>>, running: &[String]) -> String {
    if running.is_empty() {
        return String::new();
    }
    let runset: HashSet<&String> = running.iter().collect();
    for (name, svcs) in profiles {
        if svcs.len() == running.len() && svcs.iter().all(|s| runset.contains(s)) {
            return name.clone();
        }
    }
    String::new()
}

/// Builds a ProjectInfo JSON object (camelCase, matching desktop/projects.go).
/// Arrays are always present so the frontend's `.length`/`.map` calls are safe.
fn to_project_info(file_name: &str, mut yaml: ProjectYaml, running: bool, state: &RunState) -> Value {
    let session = if yaml.name.is_empty() {
        file_name.to_string()
    } else {
        yaml.name.clone()
    };
    let root = expand_home(&yaml.root);
    let is_remote = yaml
        .ssh
        .as_ref()
        .map(|s| !s.host.is_empty() && !s.user.is_empty())
        .unwrap_or(false);

    // Normalize services into a name->full map (BTreeMap keys are sorted).
    let mut services: BTreeMap<String, ServiceFull> = yaml
        .services
        .into_iter()
        .map(|(n, d)| (n, d.into_full()))
        .collect();
    // Merge the repo <root>/.lpm.yml services + profiles UNDER the user project.
    // Without this, projects whose services live in committed repo config show
    // no services -> no Start button.
    merge_parent_services_profiles(file_name, &mut services, &mut yaml.profiles);
    merge_repo_services_profiles(&root, is_remote, &mut services, &mut yaml.profiles);
    let all_names: Vec<String> = services.keys().cloned().collect();

    let service_info = |name: &str| -> Value {
        let svc = services.get(name).cloned().unwrap_or_default();
        json!({
            "name": name,
            "cmd": svc.cmd,
            "cwd": svc.cwd,
            "port": svc.port,
            "portConflict": svc.port_conflict,
            "env": svc.env,
        })
    };
    let all_services: Vec<Value> = all_names.iter().map(|n| service_info(n)).collect();

    // services == the resolved running list (frontend gates display on `running`).
    let running_names = running_service_names(&yaml.profiles, &all_names, state);
    let running_services: Vec<Value> = running_names.iter().map(|n| service_info(n)).collect();

    let active_profile = if !state.profile.is_empty() {
        state.profile.clone()
    } else if running {
        match_profile(&yaml.profiles, &running_names)
    } else {
        String::new()
    };

    let profiles: Vec<Value> = yaml
        .profiles
        .iter()
        .map(|(pname, names)| json!({ "name": pname, "services": names }))
        .collect();

    json!({
        "name": file_name,
        "session": session,
        "root": root,
        "label": yaml.label,
        "running": running,
        "services": running_services,
        "allServices": all_services,
        "actions": resolve_actions(file_name),
        "profiles": profiles,
        "activeProfile": active_profile,
        "statusEntries": [],
        "parentName": yaml.parent_name,
        "isRemote": is_remote,
    })
}

fn read_project(
    file_name: &str,
    running: &HashSet<String>,
    run: &HashMap<String, RunState>,
) -> Value {
    let path = projects_dir().join(format!("{file_name}.yml"));
    match std::fs::read(&path) {
        Ok(bytes) => match serde_yaml::from_slice::<ProjectYaml>(&bytes) {
            Ok(y) => {
                let session = if y.name.is_empty() {
                    file_name.to_string()
                } else {
                    y.name.clone()
                };
                let is_running = running.contains(&session);
                let state = run.get(file_name).cloned().unwrap_or_default();
                to_project_info(file_name, y, is_running, &state)
            }
            Err(e) => config_error_info(file_name, &e.to_string()),
        },
        Err(e) => config_error_info(file_name, &e.to_string()),
    }
}

/// Matches the Go fallback: empty arrays + configError so the UI can show the
/// error without crashing on null.
fn config_error_info(file_name: &str, err: &str) -> Value {
    json!({
        "name": file_name,
        "session": "",
        "root": "",
        "running": false,
        "services": [],
        "allServices": [],
        "actions": [],
        "profiles": [],
        "activeProfile": "",
        "statusEntries": [],
        "configError": err,
        "isRemote": false,
    })
}

pub(crate) fn project_names() -> Vec<String> {
    let mut names: Vec<String> = match std::fs::read_dir(projects_dir()) {
        Ok(entries) => entries
            .flatten()
            .filter_map(|e| {
                let p = e.path();
                if p.extension().and_then(|s| s.to_str()) == Some("yml") {
                    p.file_stem().and_then(|s| s.to_str()).map(String::from)
                } else {
                    None
                }
            })
            .collect(),
        Err(_) => Vec::new(),
    };
    names.sort();
    names
}

/// Saved project order from settings (`projectOrder`).
fn project_order() -> Vec<String> {
    load_settings()
        .get("projectOrder")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
        .unwrap_or_default()
}

fn name_of(p: &Value) -> &str {
    p.get("name").and_then(|n| n.as_str()).unwrap_or("")
}

/// Ordered names first (in saved order), then the rest in filesystem order,
/// then duplicates regrouped under their parents.
fn apply_project_order(projects: Vec<Value>, order: &[String]) -> Vec<Value> {
    let mut by_name: HashMap<String, Value> = projects
        .iter()
        .map(|p| (name_of(p).to_string(), p.clone()))
        .collect();
    let mut ordered: Vec<Value> = Vec::with_capacity(projects.len());
    for n in order {
        if let Some(p) = by_name.remove(n) {
            ordered.push(p);
        }
    }
    for p in &projects {
        if by_name.remove(name_of(p)).is_some() {
            ordered.push(p.clone());
        }
    }
    group_duplicates_after_parents(ordered)
}

/// Place each duplicate immediately after its parent (projects.go).
fn group_duplicates_after_parents(projects: Vec<Value>) -> Vec<Value> {
    let names: HashSet<String> = projects.iter().map(|p| name_of(p).to_string()).collect();
    let mut children: HashMap<String, Vec<Value>> = HashMap::new();
    let mut stripped: Vec<Value> = Vec::new();
    for p in projects {
        let parent = p
            .get("parentName")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if !parent.is_empty() && names.contains(&parent) {
            children.entry(parent).or_default().push(p);
        } else {
            stripped.push(p);
        }
    }
    if children.is_empty() {
        return stripped;
    }
    let mut out: Vec<Value> = Vec::new();
    for p in stripped {
        let n = name_of(&p).to_string();
        out.push(p);
        if let Some(kids) = children.remove(&n) {
            out.extend(kids);
        }
    }
    out
}

pub fn list_projects(run: &HashMap<String, RunState>) -> Result<Vec<Value>, String> {
    let running = crate::tmux::running_sessions();
    let projects: Vec<Value> = project_names()
        .iter()
        .map(|name| read_project(name, &running, run))
        .collect();
    Ok(apply_project_order(projects, &project_order()))
}

pub fn get_project(name: &str, run: &HashMap<String, RunState>) -> Result<Option<Value>, String> {
    if name == RESERVED_PROJECT_NAME {
        return Ok(Some(global_project_info()));
    }
    if !project_names().iter().any(|n| n == name) {
        return Ok(None);
    }
    let running = crate::tmux::running_sessions();
    Ok(Some(read_project(name, &running, run)))
}

/// The reserved global project has no YAML file of its own — it's a
/// home-rooted local shell host whose only config-driven content is the
/// global.yml actions. spawn_info/get_project synthesize it rather than
/// reading from disk (a disk read would fail and break new-terminal + the
/// Global Actions row in the Terminals view).
fn global_root() -> String {
    dirs::home_dir().unwrap_or_default().to_string_lossy().into_owned()
}

fn global_project_info() -> Value {
    json!({
        "name": RESERVED_PROJECT_NAME,
        "session": RESERVED_PROJECT_NAME,
        "root": global_root(),
        "running": false,
        "services": [],
        "allServices": [],
        "actions": resolve_actions(RESERVED_PROJECT_NAME),
        "profiles": [],
        "activeProfile": "",
        "statusEntries": [],
        "isRemote": false,
    })
}

// ---- spawn info (for service start/stop) ------------------------------------

/// Everything the service commands need from a project's YAML, parsed once.
pub struct SpawnInfo {
    pub file_name: String,
    pub session: String,
    pub root: String,
    pub is_remote: bool,
    pub ssh: SshSettings, // zero-valued when local
    pub services: BTreeMap<String, ServiceFull>,
    pub profiles: BTreeMap<String, Vec<String>>,
}

pub fn spawn_info(name: &str) -> Result<SpawnInfo, String> {
    if name == RESERVED_PROJECT_NAME {
        return Ok(SpawnInfo {
            file_name: RESERVED_PROJECT_NAME.to_string(),
            session: RESERVED_PROJECT_NAME.to_string(),
            root: global_root(),
            is_remote: false,
            ssh: SshSettings::default(),
            services: BTreeMap::new(),
            profiles: BTreeMap::new(),
        });
    }
    let y = parse_project_yaml(name)?;
    let session = if y.name.is_empty() {
        name.to_string()
    } else {
        y.name.clone()
    };
    let ssh = y.ssh.clone().unwrap_or_default();
    let is_remote = ssh.is_remote();
    let root = expand_home(&y.root);
    let mut services: BTreeMap<String, ServiceFull> =
        y.services.into_iter().map(|(n, d)| (n, d.into_full())).collect();
    let mut profiles = y.profiles;
    // Repo .lpm.yml services/profiles must also feed the start path, else a
    // shown Start button would have nothing to launch.
    merge_parent_services_profiles(name, &mut services, &mut profiles);
    merge_repo_services_profiles(&root, is_remote, &mut services, &mut profiles);
    Ok(SpawnInfo {
        file_name: name.to_string(),
        session,
        root,
        is_remote,
        ssh,
        services,
        profiles,
    })
}

/// The resolved port list + `portConflict` policy for an action (or
/// `parent:child`), from a single config resolve. None when the action doesn't
/// exist; an empty vec / empty policy when unset (callers treat "" as "ask").
pub fn action_ports_and_conflict(
    file_name: &str,
    action_name: &str,
) -> Option<(Vec<i64>, String)> {
    let map = resolve_action_map(file_name);
    let act = lookup_action(&map, action_name)?;
    Some((act.port.to_vec(), act.port_conflict))
}

/// Fully resolved action fields needed to run it (RunAction/RunActionBackground).
/// Mirrors action_ports_and_conflict's lookup incl. `parent:child` resolution.
pub struct ActionResolved {
    pub cmd: String,
    pub cwd: String,
    pub ports: Vec<i64>,
    pub env: BTreeMap<String, String>,
    pub mode: String, // "" | "remote" | "sync"
}

pub fn resolve_action_full(file_name: &str, action_name: &str) -> Option<ActionResolved> {
    let map = resolve_action_map(file_name);
    let act = lookup_action(&map, action_name)?;
    Some(ActionResolved {
        cmd: act.cmd,
        cwd: act.cwd,
        ports: act.port.to_vec(),
        env: act.env,
        mode: act.mode,
    })
}

/// Resolve the running-service name list for a project given its run-state.
pub fn resolve_running_services(info: &SpawnInfo, state: &RunState) -> Vec<String> {
    let all: Vec<String> = info.services.keys().cloned().collect();
    running_service_names(&info.profiles, &all, state)
}

#[cfg(test)]
mod port_spec_tests {
    use super::*;

    fn ports(yaml: &str) -> Vec<i64> {
        serde_yaml::from_str::<PortSpec>(yaml).unwrap().to_vec()
    }

    #[test]
    fn scalar_and_list_stay_backcompat() {
        assert_eq!(ports("3000"), vec![3000]);
        assert_eq!(ports("[3000, 3001, 3002]"), vec![3000, 3001, 3002]);
    }

    #[test]
    fn string_range_expands_inclusive() {
        assert_eq!(ports("\"3002-3005\""), vec![3002, 3003, 3004, 3005]);
    }

    #[test]
    fn list_mixes_numbers_and_ranges() {
        assert_eq!(
            ports("[3000, '3002-3004', 4000, '5001-5003']"),
            vec![3000, 3002, 3003, 3004, 4000, 5001, 5002, 5003],
        );
    }

    #[test]
    fn range_is_normalized_and_clamped() {
        assert_eq!(ports("\"3005-3002\""), vec![3002, 3003, 3004, 3005]);
        assert_eq!(ports("\"0-3\""), vec![1, 2, 3]);
        assert!(ports("\"70000-70010\"").is_empty());
    }

    #[test]
    fn oversized_range_is_capped() {
        assert_eq!(ports("\"1-65535\"").len(), PORT_RANGE_MAX);
    }

    #[test]
    fn invalid_or_empty_entries_are_dropped() {
        assert!(ports("0").is_empty());
        assert!(ports("\"\"").is_empty());
        assert!(ports("\"abc\"").is_empty());
        assert_eq!(ports("[3000, 'nope', 3001]"), vec![3000, 3001]);
    }
}

#[cfg(test)]
mod repo_merge_tests {
    use super::*;

    #[test]
    fn repo_services_and_profiles_merge_under_project() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join(".lpm.yml"),
            "services:\n  web:\n    cmd: npm run dev\n    port: 3000\n  db: docker compose up\nprofiles:\n  default: [web, db]\n",
        )
        .unwrap();
        let root = dir.path().to_string_lossy().into_owned();

        // Project pre-defines `web` with only a cwd; repo should fill cmd+port.
        let mut services = BTreeMap::new();
        services.insert("web".to_string(), ServiceFull { cwd: "frontend".into(), ..Default::default() });
        let mut profiles: BTreeMap<String, Vec<String>> = BTreeMap::new();

        merge_repo_services_profiles(&root, false, &mut services, &mut profiles);

        // `db` added wholesale from the repo (scalar cmd form).
        assert_eq!(services.get("db").unwrap().cmd, "docker compose up");
        // `web`: project cwd kept, repo cmd+port filled (field-level fallback).
        let web = services.get("web").unwrap();
        assert_eq!(web.cwd, "frontend");
        assert_eq!(web.cmd, "npm run dev");
        assert_eq!(web.port, 3000);
        // profile pulled from the repo.
        assert_eq!(profiles.get("default").unwrap(), &vec!["web".to_string(), "db".to_string()]);
    }

    #[test]
    fn remote_projects_skip_repo_merge() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(".lpm.yml"), "services:\n  web: cmd\n").unwrap();
        let mut services = BTreeMap::new();
        let mut profiles = BTreeMap::new();
        merge_repo_services_profiles(&dir.path().to_string_lossy(), true, &mut services, &mut profiles);
        assert!(services.is_empty(), "remote repo file lives on the remote; never merged locally");
    }
}

#[cfg(test)]
mod action_lookup_tests {
    use super::*;

    fn terminal_action(cmd: &str) -> ActionFull {
        ActionFull { cmd: cmd.into(), kind: "terminal".into(), ..Default::default() }
    }

    fn parent_with_child(child_name: &str, child: ActionFull) -> BTreeMap<String, ActionFull> {
        let mut parent = ActionFull {
            display: "menu".into(),
            cwd: "app".into(),
            ..Default::default()
        };
        parent.actions.insert(child_name.into(), ActionDef::Full(child));
        let mut map = BTreeMap::new();
        map.insert("Run".to_string(), parent);
        map
    }

    #[test]
    fn resolves_nested_terminal_by_composite_name() {
        let map = parent_with_child("hellphone", terminal_action("make run"));
        let got = lookup_action(&map, "Run:hellphone").expect("child resolves");
        assert_eq!(got.cmd, "make run");
        assert_eq!(got.kind, "terminal");
        assert_eq!(got.cwd, "app", "child inherits the parent cwd");
    }

    #[test]
    fn missing_parent_or_child_returns_none() {
        let map = parent_with_child("hellphone", terminal_action("make run"));
        assert!(lookup_action(&map, "Run:ghost").is_none(), "unknown child");
        assert!(lookup_action(&map, "Ghost:hellphone").is_none(), "unknown parent");
        assert!(lookup_action(&map, "ghost").is_none(), "unknown top-level");
    }

    #[test]
    fn nested_child_inherits_terminal_kind_from_parent() {
        // Parent under `terminals:` has kind defaulted to "terminal"; a child
        // with no explicit type must inherit it (else it'd launch a bare shell).
        let mut parent = ActionFull { kind: "terminal".into(), cwd: "app".into(), ..Default::default() };
        parent.actions.insert("hellphone".into(), ActionDef::Cmd("make run".into()));
        let mut map = BTreeMap::new();
        map.insert("Run".to_string(), parent);

        let got = lookup_action(&map, "Run:hellphone").expect("child resolves");
        assert_eq!(got.kind, "terminal", "empty-kind child inherits parent terminal kind");
        assert_eq!(got.cmd, "make run");
    }

    #[test]
    fn top_level_lookup_still_works() {
        let mut map = BTreeMap::new();
        map.insert("build".to_string(), terminal_action("make"));
        assert_eq!(lookup_action(&map, "build").unwrap().cmd, "make");
    }
}
