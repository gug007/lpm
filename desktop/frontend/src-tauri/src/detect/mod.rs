//! Services a folder can run, read off its manifests: what adopting or cloning
//! a project writes instead of the `configure me` placeholder. Deterministic
//! and local — no AI, no network — so adding a project stays instant and two
//! machines agree on the answer.
//!
//! The root is scanned first, then every workspace member and a short list of
//! conventional subfolders (`backend/`, `apps/*`, …). A subfolder's service is
//! named after the folder, which is what the user calls it.

mod node;
mod python;
mod stacks;
#[cfg(test)]
mod tests;

use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::{Path, PathBuf};

pub use node::{package_manager_of, PackageManager};

/// Enough to cover a large workspace without turning a monorepo into a wall.
const MAX_SERVICES: usize = 20;

const CONVENTIONAL_DIRS: &[&str] = &[
    "api", "app", "backend", "client", "frontend", "server", "ui", "web", "www",
];
const CONVENTIONAL_GLOBS: &[&str] = &["apps/*", "services/*"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DetectedService {
    pub name: String,
    pub cmd: String,
    /// Relative to the project root; empty at the root itself.
    pub cwd: String,
    pub port: Option<u16>,
}

/// A service as one scanner sees it inside a single directory, before it is
/// placed under the project root and given its final name.
#[derive(Debug, Clone)]
pub(crate) struct Candidate {
    pub name: String,
    pub cmd: String,
    pub port: Option<u16>,
    pub stack: &'static str,
}

impl Candidate {
    pub(crate) fn new(
        name: impl Into<String>,
        cmd: impl Into<String>,
        stack: &'static str,
    ) -> Self {
        let cmd = cmd.into();
        let port = port_in_command(&cmd);
        Self {
            name: name.into(),
            cmd,
            port,
            stack,
        }
    }

    /// A port to fall back on when the command itself names none.
    pub(crate) fn or_port(mut self, port: Option<u16>) -> Self {
        if self.port.is_none() {
            self.port = port;
        }
        self
    }
}

pub fn detect_services(root: &Path) -> Vec<DetectedService> {
    let mut at_root = scan_dir(root, root);
    let workspace = node::workspace(root);
    let members = workspace.members;
    let mut dirs: BTreeMap<String, PathBuf> = BTreeMap::new();
    let sweep = conventional_dirs(root).into_iter().filter(|dir| {
        !workspace.excluded.contains(dir) && !mentioned_by_procfile(&at_root, root, dir)
    });
    for dir in members.iter().cloned().chain(sweep) {
        if let Some(rel) = relative(root, &dir).filter(|rel| !rel.is_empty()) {
            dirs.entry(rel).or_insert(dir);
        }
    }

    let nested: Vec<(String, Vec<Candidate>)> = dirs
        .into_iter()
        .map(|(rel, dir)| (rel, scan_dir(&dir, root)))
        .filter(|(_, found)| !found.is_empty())
        .collect();

    // A workspace root's own script (`turbo dev`, `nx serve`) runs the members
    // that were just found; listing both would start everything twice.
    let members_run = nested
        .iter()
        .any(|(_, found)| found.iter().any(|c| c.stack == "node"));
    if !members.is_empty() && members_run {
        at_root.retain(|c| c.stack != "node");
    }

    let mut taken = HashSet::new();
    let mut out = Vec::new();
    for (rel, found) in std::iter::once((String::new(), at_root)).chain(nested) {
        out.extend(place(&rel, found, &mut taken));
    }
    out.truncate(MAX_SERVICES);
    out
}

fn scan_dir(dir: &Path, root: &Path) -> Vec<Candidate> {
    let mut found = stacks::procfile(dir);
    if found.is_empty() {
        let pm = node::package_manager(dir, root);
        found.extend(node::scan(dir, pm).or_else(|| node::scan_deno(dir)));
        found.extend(python::scan(dir));
        found.extend(stacks::rails(dir));
        found.extend(stacks::laravel(dir));
        found.extend(stacks::phoenix(dir));
        found.extend(stacks::spring(dir));
        found.extend(stacks::dotnet(dir));
        found.extend(stacks::go(dir));
        found.extend(stacks::cargo(dir));
    }
    found.extend(stacks::compose(dir));
    if found.is_empty() {
        found.extend(stacks::task_runner(dir));
    }
    found
}

/// A root Procfile that already runs a folder (`yarn --cwd client start`,
/// `cd api && …`) describes it better than a second look inside would.
fn mentioned_by_procfile(at_root: &[Candidate], root: &Path, dir: &Path) -> bool {
    let Some(rel) = relative(root, dir) else {
        return false;
    };
    at_root
        .iter()
        .filter(|c| c.stack == "proc")
        .flat_map(|c| c.cmd.split(|ch: char| ch.is_whitespace() || ch == '='))
        .map(|token| token.trim_start_matches("./").trim_end_matches('/'))
        .any(|token| token == rel || token.starts_with(&format!("{rel}/")))
}

fn conventional_dirs(root: &Path) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = CONVENTIONAL_DIRS
        .iter()
        .map(|name| root.join(name))
        .filter(|dir| dir.is_dir())
        .collect();
    for pattern in CONVENTIONAL_GLOBS {
        dirs.extend(expand(root, pattern));
    }
    dirs
}

/// Directories under `root` matching a workspace-style glob (`apps/*`), minus
/// hidden folders and `node_modules`. `**` is treated as one level: nothing
/// runnable hides deeper, and walking a whole tree would make adding slow.
pub(crate) fn expand(root: &Path, pattern: &str) -> Vec<PathBuf> {
    let pattern = pattern.trim_end_matches('/').replace("**", "*");
    let full = format!(
        "{}/{}",
        glob::Pattern::escape(&root.to_string_lossy()),
        pattern
    );
    glob::glob(&full)
        .map(|paths| {
            paths
                .filter_map(Result::ok)
                .filter(|p| p.is_dir() && !skipped(root, p))
                .collect()
        })
        .unwrap_or_default()
}

fn skipped(root: &Path, dir: &Path) -> bool {
    dir.strip_prefix(root)
        .map(|rel| {
            rel.components().any(|c| {
                let part = c.as_os_str().to_string_lossy();
                part == "node_modules" || part.starts_with('.')
            })
        })
        .unwrap_or(true)
}

fn relative(root: &Path, dir: &Path) -> Option<String> {
    dir.strip_prefix(root)
        .ok()
        .map(|rel| rel.to_string_lossy().into_owned())
}

/// Final names: at the root a candidate keeps its own; in a subfolder a lone
/// candidate takes the folder's name and several share it as a prefix.
fn place(
    rel: &str,
    mut found: Vec<Candidate>,
    taken: &mut HashSet<String>,
) -> Vec<DetectedService> {
    disambiguate(&mut found);
    let folder = rel.rsplit('/').next().map(sanitize).unwrap_or_default();
    let solo = found.len() == 1;
    found
        .into_iter()
        .map(|c| {
            let base = if rel.is_empty() {
                sanitize(&c.name)
            } else if solo {
                folder.clone()
            } else {
                format!("{folder}-{}", sanitize(&c.name))
            };
            DetectedService {
                name: unique(base, taken),
                cmd: c.cmd,
                cwd: rel.to_string(),
                port: c.port,
            }
        })
        .collect()
}

/// Two stacks in one folder claiming the same role (a Django app with a Node
/// asset server, say) are told apart by their stack.
fn disambiguate(found: &mut [Candidate]) {
    let mut counts: HashMap<String, usize> = HashMap::new();
    for c in found.iter() {
        *counts.entry(c.name.clone()).or_default() += 1;
    }
    for c in found.iter_mut() {
        if counts[&c.name] > 1 {
            c.name = format!("{}-{}", c.name, c.stack);
        }
    }
}

fn unique(base: String, taken: &mut HashSet<String>) -> String {
    let name = if taken.contains(&base) {
        (2..)
            .map(|n| format!("{base}-{n}"))
            .find(|candidate| !taken.contains(candidate))
            .expect("an unbounded sequence of candidates always has a free one")
    } else {
        base
    };
    taken.insert(name.clone());
    name
}

/// A YAML-key-safe, shell-safe service name: lowercase ASCII words joined by
/// single dashes.
pub(crate) fn sanitize(name: &str) -> String {
    let mut out = String::new();
    for ch in name.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
        } else if !out.is_empty() && !out.ends_with('-') {
            out.push('-');
        }
    }
    let trimmed = out.trim_end_matches('-');
    if trimmed.is_empty() {
        "app".to_string()
    } else {
        trimmed.to_string()
    }
}

/// The port a command pins explicitly: `--port 3001`, `--port=3001`, `-p 3001`,
/// `PORT=3001 …`, `runserver 0.0.0.0:8080`, or a `localhost:5173`-style host.
pub(crate) fn port_in_command(cmd: &str) -> Option<u16> {
    let tokens: Vec<&str> = cmd.split_whitespace().collect();
    for (i, token) in tokens.iter().enumerate() {
        let next = tokens.get(i + 1).copied();
        let found = if let Some(value) = token.strip_prefix("--port=") {
            parse_port(value)
        } else if let Some(value) = token.strip_prefix("PORT=") {
            parse_port(value)
        } else if matches!(*token, "--port" | "-p" | "runserver") {
            next.and_then(parse_port)
        } else {
            host_port(token)
        };
        if found.is_some() {
            return found;
        }
    }
    None
}

fn parse_port(value: &str) -> Option<u16> {
    let value = value.trim_matches(|c| c == '"' || c == '\'');
    let value = value.rsplit(':').next().unwrap_or(value);
    value.parse::<u16>().ok().filter(|port| *port > 0)
}

fn host_port(token: &str) -> Option<u16> {
    let (host, port) = token.rsplit_once(':')?;
    let host = host
        .trim_start_matches("http://")
        .trim_start_matches("https://");
    if matches!(
        host,
        "localhost" | "0.0.0.0" | "127.0.0.1" | "[::]" | "[::1]"
    ) {
        parse_port(port)
    } else {
        None
    }
}
