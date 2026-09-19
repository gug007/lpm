//! Node and Deno projects: the dev script, run through whichever package
//! manager the repo declares or locks, named by what the dependencies say the
//! app is (`web`, `api`, or just `app`).

use super::{expand, port_in_command, Candidate};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

const DEV_SCRIPTS: &[&str] = &["dev", "start", "serve"];

/// Frameworks that identify a frontend, first match wins, with the port their
/// dev server binds unless the script says otherwise. `vite` stays last: the
/// meta-frameworks above it run on vite but own the port.
const FRONTEND: &[(&str, Option<u16>)] = &[
    ("next", Some(3000)),
    ("nuxt", Some(3000)),
    ("astro", Some(4321)),
    ("@sveltejs/kit", Some(5173)),
    ("@angular/core", Some(4200)),
    ("gatsby", Some(8000)),
    ("@docusaurus/core", Some(3000)),
    ("react-scripts", Some(3000)),
    ("@vue/cli-service", Some(8080)),
    ("@remix-run/dev", None),
    ("parcel", Some(1234)),
    ("webpack-dev-server", None),
    ("@11ty/eleventy", Some(8080)),
    ("vite", Some(5173)),
];

const BACKEND: &[(&str, Option<u16>)] = &[
    ("@nestjs/core", Some(3000)),
    ("@adonisjs/core", Some(3333)),
    ("@strapi/strapi", Some(1337)),
    ("@keystone-6/core", Some(3000)),
    ("directus", Some(8055)),
    ("sails", Some(1337)),
    ("express", None),
    ("fastify", None),
    ("koa", None),
    ("hono", None),
    ("@hapi/hapi", None),
    ("@apollo/server", None),
    ("apollo-server", None),
    ("restify", None),
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PackageManager {
    Npm,
    Yarn,
    Pnpm,
    Bun,
}

impl PackageManager {
    fn from_name(name: &str) -> Option<Self> {
        match name {
            "npm" => Some(Self::Npm),
            "yarn" => Some(Self::Yarn),
            "pnpm" => Some(Self::Pnpm),
            "bun" => Some(Self::Bun),
            _ => None,
        }
    }

    pub fn run(self, script: &str) -> String {
        match self {
            Self::Npm if script == "start" => "npm start".to_string(),
            Self::Npm => format!("npm run {script}"),
            Self::Yarn => format!("yarn {script}"),
            Self::Pnpm => format!("pnpm {script}"),
            Self::Bun => format!("bun run {script}"),
        }
    }

    pub fn install_cmd(self) -> &'static str {
        match self {
            Self::Npm => "npm install",
            Self::Yarn => "yarn install",
            Self::Pnpm => "pnpm install",
            Self::Bun => "bun install",
        }
    }
}

fn read_json(path: &Path) -> Option<serde_json::Value> {
    serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()
}

fn declared_manager(dir: &Path) -> Option<PackageManager> {
    let pkg = read_json(&dir.join("package.json"))?;
    let spec = pkg.get("packageManager")?.as_str()?;
    PackageManager::from_name(spec.split('@').next().unwrap_or(""))
}

fn lockfile_manager(dir: &Path) -> Option<PackageManager> {
    let has = |file: &str| dir.join(file).exists();
    if has("bun.lockb") || has("bun.lock") {
        Some(PackageManager::Bun)
    } else if has("pnpm-lock.yaml") {
        Some(PackageManager::Pnpm)
    } else if has("yarn.lock") {
        Some(PackageManager::Yarn)
    } else if has("package-lock.json") || has("npm-shrinkwrap.json") {
        Some(PackageManager::Npm)
    } else {
        None
    }
}

/// The manager for `dir`, falling back to the workspace root's, which is where
/// a monorepo keeps its lockfile.
pub(crate) fn package_manager(dir: &Path, root: &Path) -> PackageManager {
    declared_manager(dir)
        .or_else(|| declared_manager(root))
        .or_else(|| lockfile_manager(dir))
        .or_else(|| lockfile_manager(root))
        .unwrap_or(PackageManager::Npm)
}

/// The manager a Node project installs with, or nothing for a non-Node folder.
pub fn package_manager_of(root: &Path) -> Option<PackageManager> {
    root.join("package.json")
        .exists()
        .then(|| package_manager(root, root))
}

/// What a package.json / pnpm workspace declares: its member folders (those
/// holding a package.json) and the folders its `!` patterns rule out.
pub(crate) struct Workspace {
    pub members: Vec<PathBuf>,
    pub excluded: HashSet<PathBuf>,
}

pub(crate) fn workspace(root: &Path) -> Workspace {
    let mut patterns: Vec<String> = Vec::new();
    if let Some(pkg) = read_json(&root.join("package.json")) {
        let ws = pkg.get("workspaces");
        let list = ws.and_then(|w| w.as_array()).or_else(|| {
            ws.and_then(|w| w.get("packages"))
                .and_then(|p| p.as_array())
        });
        patterns.extend(
            list.into_iter()
                .flatten()
                .filter_map(|v| v.as_str().map(str::to_string)),
        );
    }
    if let Ok(text) = std::fs::read_to_string(root.join("pnpm-workspace.yaml")) {
        if let Ok(doc) = serde_norway::from_str::<serde_norway::Value>(&text) {
            patterns.extend(
                doc.get("packages")
                    .and_then(|p| p.as_sequence())
                    .into_iter()
                    .flatten()
                    .filter_map(|v| v.as_str().map(str::to_string)),
            );
        }
    }
    let (excluded, included): (Vec<&String>, Vec<&String>) =
        patterns.iter().partition(|p| p.starts_with('!'));
    let excluded: HashSet<PathBuf> = excluded
        .iter()
        .flat_map(|p| expand(root, &p[1..]))
        .collect();
    let mut members: Vec<PathBuf> = included
        .iter()
        .flat_map(|p| expand(root, p))
        .filter(|dir| !excluded.contains(dir) && dir.join("package.json").exists())
        .collect();
    members.sort();
    members.dedup();
    Workspace { members, excluded }
}

pub(crate) fn scan(dir: &Path, pm: PackageManager) -> Option<Candidate> {
    let pkg = read_json(&dir.join("package.json"))?;
    let scripts = pkg.get("scripts")?.as_object()?;
    let (script, body) = DEV_SCRIPTS.iter().find_map(|name| {
        scripts
            .get(*name)
            .and_then(|v| v.as_str())
            .filter(|body| !body.trim().is_empty())
            .map(|body| (*name, body))
    })?;
    let (role, default_port) = classify(&dependency_names(&pkg));
    Some(
        Candidate::new(role, pm.run(script), "node")
            .or_port(port_in_command(body))
            .or_port(default_port),
    )
}

pub(crate) fn scan_deno(dir: &Path) -> Option<Candidate> {
    let cfg = read_json(&dir.join("deno.json"))?;
    let tasks = cfg.get("tasks")?.as_object()?;
    let (task, body) = DEV_SCRIPTS.iter().find_map(|name| {
        tasks
            .get(*name)
            .and_then(|v| v.as_str())
            .map(|b| (*name, b))
    })?;
    Some(Candidate::new("app", format!("deno task {task}"), "deno").or_port(port_in_command(body)))
}

fn dependency_names(pkg: &serde_json::Value) -> HashSet<String> {
    ["dependencies", "devDependencies"]
        .iter()
        .filter_map(|key| pkg.get(*key).and_then(|d| d.as_object()))
        .flat_map(|deps| deps.keys().cloned())
        .collect()
}

fn classify(deps: &HashSet<String>) -> (&'static str, Option<u16>) {
    if let Some((_, port)) = FRONTEND.iter().find(|(dep, _)| deps.contains(*dep)) {
        return ("web", *port);
    }
    if let Some((_, port)) = BACKEND.iter().find(|(dep, _)| deps.contains(*dep)) {
        return ("api", *port);
    }
    ("app", None)
}
