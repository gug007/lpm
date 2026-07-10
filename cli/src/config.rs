//! Project config loading + merge, mirroring the desktop app's
//! `src-tauri/src/config.rs` semantics for the read-only CLI.
//!
//! Precedence (highest first): project `<name>.yml` (+ its `extends` templates),
//! a duplicate's `parent_name` project, the repo `<root>/.lpm.yml`, then
//! `global.yml`. Lower layers only fill fields the higher layers left empty —
//! matching `merge_service` / `merge_action` in the app. Duplicated here on
//! purpose (v1): the CLI stays self-contained rather than sharing a crate with
//! src-tauri.

use serde::Deserialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// Filesystem locations the CLI reads from. Injectable so tests can point at a
/// tempdir instead of the real `~/.lpm`.
#[derive(Clone)]
pub struct Ctx {
    pub lpm_dir: PathBuf,
}

impl Ctx {
    /// The real `~/.lpm` (falls back to `./.lpm` if there's no home dir).
    pub fn from_home() -> Self {
        let lpm_dir = dirs::home_dir().unwrap_or_default().join(".lpm");
        Ctx { lpm_dir }
    }

    pub fn projects_dir(&self) -> PathBuf {
        self.lpm_dir.join("projects")
    }
    pub fn templates_dir(&self) -> PathBuf {
        self.lpm_dir.join("templates")
    }
    pub fn global_path(&self) -> PathBuf {
        self.lpm_dir.join("global.yml")
    }
    pub fn project_path(&self, name: &str) -> PathBuf {
        self.projects_dir().join(format!("{name}.yml"))
    }
    pub fn terminals_path(&self) -> PathBuf {
        self.lpm_dir.join("terminals.json")
    }
    pub fn socket_path(&self) -> PathBuf {
        self.lpm_dir.join("lpm.sock")
    }
}

/// Mirrors `config.ExpandHome`: a leading `~` resolves to the home directory.
pub fn expand_home(p: &str) -> String {
    if p == "~" {
        return dirs::home_dir()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
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

/// `config.ResolveCwd`: absolute cwd as-is, empty -> root, else root/cwd.
pub fn resolve_cwd(root: &str, cwd: &str) -> String {
    if cwd.is_empty() {
        return root.to_string();
    }
    if Path::new(cwd).is_absolute() {
        return cwd.to_string();
    }
    Path::new(root).join(cwd).to_string_lossy().into_owned()
}

// ---- raw YAML shapes --------------------------------------------------------

/// A service is either a bare command string or a full map (the app's
/// `config.Service` custom UnmarshalYAML).
#[derive(Deserialize, Clone)]
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
            ServiceDef::Cmd(cmd) => ServiceFull {
                cmd,
                ..Default::default()
            },
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
}

impl SshSettings {
    pub fn is_remote(&self) -> bool {
        !self.host.is_empty() && !self.user.is_empty()
    }
}

/// A `port` field: bare number, `"3000"`, or an inclusive range `"3002-3010"`,
/// as a single entry or a list. Mirrors the app's `PortSpec`.
#[derive(Deserialize, Clone)]
#[serde(untagged)]
enum PortEntry {
    Num(i64),
    Text(String),
}

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

const PORT_RANGE_MAX: usize = 1024;

fn push_port(out: &mut Vec<i64>, p: i64) {
    if p > 0 && p <= 65535 {
        out.push(p);
    }
}

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
            PortSpec::Many(v) => v.iter().for_each(|e| expand_port_entry(e, &mut out)),
        }
        out
    }

    fn is_empty(&self) -> bool {
        self.to_vec().is_empty()
    }
}

/// An action/terminal entry: bare command string or full map.
#[derive(Deserialize, Clone)]
#[serde(untagged)]
enum ActionDef {
    Cmd(String),
    Full(Box<ActionFull>),
}

#[derive(Deserialize, Default, Clone)]
pub struct ActionFull {
    #[serde(default)]
    pub cmd: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub emoji: String,
    #[serde(default)]
    pub shortcut: String,
    #[serde(default)]
    pub cwd: String,
    #[serde(default)]
    port: PortSpec,
    #[serde(rename = "portConflict", default)]
    pub port_conflict: String,
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    #[serde(default)]
    pub confirm: bool,
    #[serde(default)]
    pub display: String,
    #[serde(rename = "type", default)]
    pub kind: String,
    #[serde(default)]
    pub reuse: bool,
    #[serde(default)]
    pub mode: String,
    #[serde(default)]
    pub position: Option<f64>,
    #[serde(default)]
    actions: BTreeMap<String, ActionDef>, // children
    /// Set during layer building, not parsed: true when the entry came from a
    /// `terminals:` block (used to split the Terminals vs Actions sections).
    #[serde(skip)]
    pub from_terminals: bool,
}

impl ActionDef {
    fn into_full(self) -> ActionFull {
        match self {
            ActionDef::Cmd(cmd) => ActionFull {
                cmd,
                ..Default::default()
            },
            ActionDef::Full(f) => *f,
        }
    }
}

impl ActionFull {
    pub fn ports(&self) -> Vec<i64> {
        self.port.to_vec()
    }
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

/// Actions section parsed separately (mirrors the app: a malformed action block
/// never regresses the rest of the project view).
#[derive(Deserialize, Default)]
struct ActionsYaml {
    #[serde(default)]
    extends: Vec<String>,
    #[serde(default)]
    terminals: BTreeMap<String, ActionDef>,
    #[serde(default)]
    actions: BTreeMap<String, ActionDef>,
}

#[derive(Deserialize, Default)]
struct NameOnly {
    #[serde(default)]
    name: String,
}

// ---- parse helpers ----------------------------------------------------------

fn read_yaml<T: for<'de> Deserialize<'de>>(path: &Path) -> Option<T> {
    serde_yaml::from_slice(&std::fs::read(path).ok()?).ok()
}

fn parse_project_yaml(ctx: &Ctx, name: &str) -> Result<ProjectYaml, String> {
    let path = ctx.project_path(name);
    let bytes = std::fs::read(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    serde_yaml::from_slice::<ProjectYaml>(&bytes).map_err(|e| e.to_string())
}

/// `config.PeekParent`: a project's non-empty `parent_name`, or None.
fn peek_parent(ctx: &Ctx, name: &str) -> Option<String> {
    let y = parse_project_yaml(ctx, name).ok()?;
    (!y.parent_name.is_empty()).then_some(y.parent_name)
}

/// Project file-name stems in `~/.lpm/projects`, sorted.
pub fn project_names(ctx: &Ctx) -> Vec<String> {
    let mut names: Vec<String> = match std::fs::read_dir(ctx.projects_dir()) {
        Ok(entries) => entries
            .flatten()
            .filter_map(|e| {
                let p = e.path();
                (p.extension().and_then(|s| s.to_str()) == Some("yml"))
                    .then(|| p.file_stem().and_then(|s| s.to_str()).map(String::from))
                    .flatten()
            })
            .collect(),
        Err(_) => Vec::new(),
    };
    names.sort();
    names
}

fn name_field(ctx: &Ctx, stem: &str) -> String {
    read_yaml::<NameOnly>(&ctx.project_path(stem))
        .map(|n| n.name)
        .unwrap_or_default()
}

// ---- name resolution --------------------------------------------------------

#[derive(Debug)]
pub enum ResolveError {
    /// No project matched. Carries the list of available stems.
    NotFound {
        query: String,
        available: Vec<String>,
    },
    /// Prefix matched more than one project. Carries the candidate stems.
    Ambiguous {
        query: String,
        candidates: Vec<String>,
    },
}

/// Resolve `<name>` to a project file-name stem. Matches an exact stem, an exact
/// `name:` field, or an unambiguous prefix of either.
pub fn resolve_project_name(ctx: &Ctx, query: &str) -> Result<String, ResolveError> {
    let stems = project_names(ctx);
    // Exact file-stem match wins outright.
    if stems.iter().any(|s| s == query) {
        return Ok(query.to_string());
    }
    // Exact `name:` field match.
    let by_name: Vec<String> = stems
        .iter()
        .filter(|s| name_field(ctx, s) == query)
        .cloned()
        .collect();
    if by_name.len() == 1 {
        return Ok(by_name.into_iter().next().unwrap());
    }
    if by_name.len() > 1 {
        return Err(ResolveError::Ambiguous {
            query: query.to_string(),
            candidates: by_name,
        });
    }
    // Prefix match on stem or name field.
    let cands: Vec<String> = stems
        .iter()
        .filter(|s| s.starts_with(query) || name_field(ctx, s).starts_with(query))
        .cloned()
        .collect();
    match cands.len() {
        1 => Ok(cands.into_iter().next().unwrap()),
        0 => Err(ResolveError::NotFound {
            query: query.to_string(),
            available: stems,
        }),
        _ => Err(ResolveError::Ambiguous {
            query: query.to_string(),
            candidates: cands,
        }),
    }
}

// ---- service merge ----------------------------------------------------------

/// `config.mergeService`: `dst` (higher precedence) wins; empty fields fall back.
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

/// Merge `src` services UNDER `dst` (dst wins; new keys added; shared keys get
/// field-level fallback). Also fills profiles that dst lacks.
fn merge_services_under(
    dst: &mut BTreeMap<String, ServiceFull>,
    dst_profiles: &mut BTreeMap<String, Vec<String>>,
    src: BTreeMap<String, ServiceFull>,
    src_profiles: BTreeMap<String, Vec<String>>,
) {
    for (n, s) in src {
        match dst.get_mut(&n) {
            Some(existing) => merge_service(existing, &s),
            None => {
                dst.insert(n, s);
            }
        }
    }
    for (k, v) in src_profiles {
        dst_profiles.entry(k).or_insert(v);
    }
}

// ---- action merge (mirrors config::resolve_action_map) ----------------------

fn terminal_to_action(mut a: ActionFull) -> ActionFull {
    if a.kind.is_empty() {
        a.kind = "terminal".into();
    }
    a.from_terminals = true;
    a
}

/// actions (highest) over terminals; `terminals:` entries carry `from_terminals`.
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
fn build_layer(ctx: &Ctx, y: &ActionsYaml) -> BTreeMap<String, ActionFull> {
    let mut m = build_base_layer(y);
    for tref in &y.extends {
        for ext in ["yml", "yaml"] {
            let tp = ctx.templates_dir().join(format!("{tref}.{ext}"));
            if let Some(ty) = read_yaml::<ActionsYaml>(&tp) {
                merge_action_fallback(&mut m, build_base_layer(&ty));
                break;
            }
        }
    }
    m
}

fn merge_action_fallback(
    dst: &mut BTreeMap<String, ActionFull>,
    src: BTreeMap<String, ActionFull>,
) {
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
    if d.shortcut.is_empty() {
        d.shortcut = s.shortcut.clone();
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
        d.confirm = s.confirm;
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
    if d.actions.is_empty() {
        d.actions = s.actions.clone();
    }
}

/// `config.Action.ResolvedChild`: child inherits parent cwd/mode/kind; env overlaid.
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

// ---- resolved project assembly ---------------------------------------------

pub struct ResolvedService {
    pub name: String,
    pub cmd: String,
    pub cwd: String,
    pub port: i64,
    pub port_conflict: String,
    pub env: BTreeMap<String, String>,
}

pub struct ResolvedAction {
    pub name: String,
    pub label: String,
    pub emoji: String,
    pub shortcut: String,
    pub cmd: String,
    pub cwd: String,
    pub ports: Vec<i64>,
    pub kind: String,
    pub display: String,
    pub confirm: bool,
    pub reuse: bool,
    pub position: Option<f64>,
    pub env: BTreeMap<String, String>,
    pub children: Vec<ResolvedAction>,
}

pub struct ResolvedProject {
    pub file_name: String,
    /// tmux session name == `name:` field, or the file stem when unset.
    pub session: String,
    pub root: String,
    pub label: String,
    pub is_remote: bool,
    pub parent_name: String,
    pub services: Vec<ResolvedService>,
    pub profiles: BTreeMap<String, Vec<String>>,
    /// Merged entries from `terminals:` blocks (launchable terminals).
    pub terminals: Vec<ResolvedAction>,
    /// Merged entries from `actions:` blocks.
    pub actions: Vec<ResolvedAction>,
}

fn to_resolved_action(name: &str, a: &ActionFull) -> ResolvedAction {
    let label = if a.label.is_empty() {
        name.to_string()
    } else {
        a.label.clone()
    };
    let children = sorted_children(a)
        .into_iter()
        .map(|(cname, cact)| to_resolved_action(&cname, &cact))
        .collect();
    ResolvedAction {
        name: name.to_string(),
        label,
        emoji: a.emoji.clone(),
        shortcut: a.shortcut.clone(),
        cmd: a.cmd.clone(),
        cwd: a.cwd.clone(),
        ports: a.ports(),
        kind: a.kind.clone(),
        display: a.display.clone(),
        confirm: a.confirm,
        reuse: a.reuse,
        position: a.position,
        env: a.env.clone(),
        children,
    }
}

fn sorted_children(a: &ActionFull) -> Vec<(String, ActionFull)> {
    let resolved: BTreeMap<String, ActionFull> = a
        .actions
        .iter()
        .map(|(k, d)| (k.clone(), resolved_child(a, &d.clone().into_full())))
        .collect();
    let mut names: Vec<String> = resolved.keys().cloned().collect();
    sort_by_position(&mut names, |n| resolved.get(n).and_then(|x| x.position));
    names
        .into_iter()
        .map(|n| (n.clone(), resolved[&n].clone()))
        .collect()
}

/// Position asc (None last), tie broken by name.
pub fn sort_by_position(names: &mut [String], pos_of: impl Fn(&str) -> Option<f64>) {
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

/// Fully resolve a project by file-name stem: services + actions/terminals
/// merged across all layers, ready to render.
pub fn resolve_project(ctx: &Ctx, file_name: &str) -> Result<ResolvedProject, String> {
    let y = parse_project_yaml(ctx, file_name)?;
    let session = if y.name.is_empty() {
        file_name.to_string()
    } else {
        y.name.clone()
    };
    let ssh = y.ssh.clone().unwrap_or_default();
    let is_remote = ssh.is_remote();
    let root = expand_home(&y.root);

    // ---- services: project -> parent -> repo .lpm.yml -> global ----
    let mut services: BTreeMap<String, ServiceFull> = y
        .services
        .into_iter()
        .map(|(n, d)| (n, d.into_full()))
        .collect();
    let mut profiles = y.profiles;

    if let Some(parent) = peek_parent(ctx, file_name) {
        if let Ok(py) = parse_project_yaml(ctx, &parent) {
            let ps: BTreeMap<String, ServiceFull> = py
                .services
                .into_iter()
                .map(|(n, d)| (n, d.into_full()))
                .collect();
            merge_services_under(&mut services, &mut profiles, ps, py.profiles);
        }
    }
    if !is_remote && !root.is_empty() {
        if let Some(ry) = read_yaml::<ProjectYaml>(&Path::new(&root).join(".lpm.yml")) {
            let rs: BTreeMap<String, ServiceFull> = ry
                .services
                .into_iter()
                .map(|(n, d)| (n, d.into_full()))
                .collect();
            merge_services_under(&mut services, &mut profiles, rs, ry.profiles);
        }
    }
    if let Some(gy) = read_yaml::<ProjectYaml>(&ctx.global_path()) {
        let gs: BTreeMap<String, ServiceFull> = gy
            .services
            .into_iter()
            .map(|(n, d)| (n, d.into_full()))
            .collect();
        merge_services_under(&mut services, &mut profiles, gs, gy.profiles);
    }

    let services: Vec<ResolvedService> = services
        .into_iter()
        .map(|(name, s)| ResolvedService {
            name,
            cmd: s.cmd,
            cwd: s.cwd,
            port: s.port,
            port_conflict: s.port_conflict,
            env: s.env,
        })
        .collect();

    // ---- actions/terminals: project(+extends) -> parent -> repo -> global ----
    let mut amap: BTreeMap<String, ActionFull> =
        match read_yaml::<ActionsYaml>(&ctx.project_path(file_name)) {
            Some(ay) => build_layer(ctx, &ay),
            None => BTreeMap::new(),
        };
    if let Some(parent) = peek_parent(ctx, file_name) {
        if let Some(py) = read_yaml::<ActionsYaml>(&ctx.project_path(&parent)) {
            merge_action_fallback(&mut amap, build_layer(ctx, &py));
        }
    }
    if !is_remote && !root.is_empty() {
        if let Some(ry) = read_yaml::<ActionsYaml>(&Path::new(&root).join(".lpm.yml")) {
            merge_action_fallback(&mut amap, build_layer(ctx, &ry));
        }
    }
    if let Some(gy) = read_yaml::<ActionsYaml>(&ctx.global_path()) {
        merge_action_fallback(&mut amap, build_layer(ctx, &gy));
    }

    let (terminals, actions) = split_actions(&amap);

    Ok(ResolvedProject {
        file_name: file_name.to_string(),
        session,
        root,
        label: y.label,
        is_remote,
        parent_name: y.parent_name,
        services,
        profiles,
        terminals,
        actions,
    })
}

/// Split the merged action map into (terminals, actions) by origin block, each
/// sorted by position. Entries first declared under `terminals:` land in the
/// terminals list; everything else in actions.
fn split_actions(
    amap: &BTreeMap<String, ActionFull>,
) -> (Vec<ResolvedAction>, Vec<ResolvedAction>) {
    let mut term_names: Vec<String> = amap
        .iter()
        .filter(|(_, a)| a.from_terminals)
        .map(|(k, _)| k.clone())
        .collect();
    let mut act_names: Vec<String> = amap
        .iter()
        .filter(|(_, a)| !a.from_terminals)
        .map(|(k, _)| k.clone())
        .collect();
    sort_by_position(&mut term_names, |n| amap.get(n).and_then(|a| a.position));
    sort_by_position(&mut act_names, |n| amap.get(n).and_then(|a| a.position));
    let terminals = term_names
        .iter()
        .map(|n| to_resolved_action(n, &amap[n]))
        .collect();
    let actions = act_names
        .iter()
        .map(|n| to_resolved_action(n, &amap[n]))
        .collect();
    (terminals, actions)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx_with(files: &[(&str, &str)], global: Option<&str>) -> (tempfile::TempDir, Ctx) {
        let dir = tempfile::tempdir().unwrap();
        let ctx = Ctx {
            lpm_dir: dir.path().to_path_buf(),
        };
        std::fs::create_dir_all(ctx.projects_dir()).unwrap();
        for (name, body) in files {
            std::fs::write(ctx.project_path(name), body).unwrap();
        }
        if let Some(g) = global {
            std::fs::write(ctx.global_path(), g).unwrap();
        }
        (dir, ctx)
    }

    #[test]
    fn resolve_exact_stem() {
        let (_d, ctx) = ctx_with(&[("web", "name: web-app\n"), ("api", "name: api\n")], None);
        assert_eq!(resolve_project_name(&ctx, "web").unwrap(), "web");
    }

    #[test]
    fn resolve_by_name_field() {
        let (_d, ctx) = ctx_with(&[("proj-Ab12", "name: karucapatoxic\n")], None);
        assert_eq!(
            resolve_project_name(&ctx, "karucapatoxic").unwrap(),
            "proj-Ab12"
        );
    }

    #[test]
    fn resolve_unambiguous_prefix() {
        let (_d, ctx) = ctx_with(
            &[
                ("karucapatoxic", "name: karucapatoxic\n"),
                ("lpm", "name: lpm\n"),
            ],
            None,
        );
        assert_eq!(resolve_project_name(&ctx, "karu").unwrap(), "karucapatoxic");
    }

    #[test]
    fn resolve_ambiguous_prefix_lists_candidates() {
        let (_d, ctx) = ctx_with(
            &[("lpm", "name: lpm\n"), ("lpm-GmwAKj", "name: lpm-GmwAKj\n")],
            None,
        );
        match resolve_project_name(&ctx, "lp") {
            Err(ResolveError::Ambiguous { candidates, .. }) => {
                assert_eq!(
                    candidates,
                    vec!["lpm".to_string(), "lpm-GmwAKj".to_string()]
                );
            }
            _ => panic!("expected ambiguous"),
        }
    }

    #[test]
    fn resolve_exact_stem_beats_prefix_of_another() {
        // "lpm" is also a prefix of "lpm-GmwAKj"; an exact stem match must win
        // rather than erroring as ambiguous.
        let (_d, ctx) = ctx_with(
            &[("lpm", "name: lpm\n"), ("lpm-GmwAKj", "name: lpm-GmwAKj\n")],
            None,
        );
        assert_eq!(resolve_project_name(&ctx, "lpm").unwrap(), "lpm");
    }

    #[test]
    fn resolve_unknown_lists_available() {
        let (_d, ctx) = ctx_with(&[("web", "name: web\n")], None);
        match resolve_project_name(&ctx, "ghost") {
            Err(ResolveError::NotFound { available, .. }) => {
                assert_eq!(available, vec!["web".to_string()])
            }
            _ => panic!("expected not found"),
        }
    }

    #[test]
    fn service_merge_fills_empty_fields_from_repo_layer() {
        let mut services = BTreeMap::new();
        services.insert(
            "web".to_string(),
            ServiceFull {
                cwd: "frontend".into(),
                ..Default::default()
            },
        );
        let mut profiles: BTreeMap<String, Vec<String>> = BTreeMap::new();
        let mut repo = BTreeMap::new();
        repo.insert(
            "web".to_string(),
            ServiceFull {
                cmd: "npm run dev".into(),
                port: 3000,
                ..Default::default()
            },
        );
        repo.insert(
            "db".to_string(),
            ServiceFull {
                cmd: "docker compose up".into(),
                ..Default::default()
            },
        );
        let mut repo_prof = BTreeMap::new();
        repo_prof.insert(
            "default".to_string(),
            vec!["web".to_string(), "db".to_string()],
        );

        merge_services_under(&mut services, &mut profiles, repo, repo_prof);

        let web = services.get("web").unwrap();
        assert_eq!(web.cwd, "frontend"); // project field kept
        assert_eq!(web.cmd, "npm run dev"); // repo filled the empty cmd
        assert_eq!(web.port, 3000);
        assert_eq!(services.get("db").unwrap().cmd, "docker compose up"); // added wholesale
        assert_eq!(
            profiles.get("default").unwrap(),
            &vec!["web".to_string(), "db".to_string()]
        );
    }

    #[test]
    fn terminals_block_becomes_terminal_kind_and_origin() {
        let ay: ActionsYaml =
            serde_yaml::from_str("terminals:\n  codex:\n    position: 2\n").unwrap();
        let layer = build_base_layer(&ay);
        let codex = layer.get("codex").unwrap();
        assert_eq!(codex.kind, "terminal");
        assert!(codex.from_terminals);
    }

    #[test]
    fn actions_win_over_terminals_but_origin_stays_terminal_on_project_layer() {
        // Project declares `codex` under terminals:; global declares it under
        // actions:. Project (higher) wins, so origin stays "terminals" and the
        // merged entry inherits the global cmd for its empty field.
        let proj_files = [(
            "p",
            "name: p\nroot: /nonexistent-root\nterminals:\n  codex:\n    position: 2\n",
        )];
        let global = "actions:\n  codex:\n    cmd: codex\n    type: terminal\n";
        let (_d, ctx) = ctx_with(&proj_files, Some(global));
        let rp = resolve_project(&ctx, "p").unwrap();
        assert!(rp
            .terminals
            .iter()
            .any(|t| t.name == "codex" && t.cmd == "codex"));
        assert!(!rp.actions.iter().any(|a| a.name == "codex"));
    }

    #[test]
    fn merged_child_actions_inherit_parent() {
        // claude-max (terminals block) gets children from a global actions entry.
        let proj = [(
            "p",
            "name: p\nroot: /nonexistent-root\nterminals:\n  claude-max:\n    position: 3\n",
        )];
        let global = "actions:\n  claude-max:\n    cmd: claude\n    type: terminal\n    cwd: app\n    actions:\n      fable:\n        cmd: claude --model fable\n        type: terminal\n";
        let (_d, ctx) = ctx_with(&proj, Some(global));
        let rp = resolve_project(&ctx, "p").unwrap();
        let cm = rp
            .terminals
            .iter()
            .find(|t| t.name == "claude-max")
            .unwrap();
        assert_eq!(cm.cmd, "claude");
        let fable = cm.children.iter().find(|c| c.name == "fable").unwrap();
        assert_eq!(fable.cmd, "claude --model fable");
        assert_eq!(fable.cwd, "app", "child inherits parent cwd");
    }
}
