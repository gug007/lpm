// Which forge a checkout's origin lives on, so the pull request flows speak
// GitLab through `glab` where they speak GitHub through `gh`. Anything that
// isn't GitLab stays GitHub, as every remote was before GitLab was known. A
// self-hosted GitLab is one whose host says "gitlab", or one `glab` is signed
// in to.
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

/// An origin can change under a checkout; a minute is soon enough to notice.
const FRESH: Duration = Duration::from_secs(60);

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Forge {
    GitHub,
    GitLab(GitLabRepo),
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct GitLabRepo {
    /// The host as `glab` names it, with a port only for an https origin.
    pub host: String,
    /// `group/subgroup/project`.
    pub path: String,
}

impl GitLabRepo {
    /// The project as GitLab's REST API names it: its path, URL-encoded.
    pub fn api_project(&self) -> String {
        urlencoding::encode(&self.path).into_owned()
    }
}

fn cache() -> &'static Mutex<HashMap<String, (Forge, Instant)>> {
    static CACHE: OnceLock<Mutex<HashMap<String, (Forge, Instant)>>> = OnceLock::new();
    CACHE.get_or_init(Default::default)
}

/// The forge of `cwd`'s origin.
pub(crate) fn forge(cwd: &str) -> Forge {
    if let Some((forge, at)) = cache().lock().unwrap().get(cwd) {
        if at.elapsed() < FRESH {
            return forge.clone();
        }
    }
    let url = crate::git::git_out(cwd, &["remote", "get-url", "origin"]).unwrap_or_default();
    let local = crate::sshexec::remote_project_for_path(cwd).is_none();
    let forge = forge_of_url(&url, |host| local && glab_signed_in_to(host));
    cache()
        .lock()
        .unwrap()
        .insert(cwd.to_string(), (forge.clone(), Instant::now()));
    forge
}

/// The GitLab repository `cwd` pushes to, if its origin is on GitLab.
pub(crate) fn gitlab(cwd: &str) -> Option<GitLabRepo> {
    match forge(cwd) {
        Forge::GitLab(repo) => Some(repo),
        Forge::GitHub => None,
    }
}

fn forge_of_url(url: &str, signed_in: impl Fn(&str) -> bool) -> Forge {
    let Some((host, path)) = origin_parts(url) else {
        return Forge::GitHub;
    };
    let name = host.split(':').next().unwrap_or(&host).to_lowercase();
    if name.contains("github") {
        return Forge::GitHub;
    }
    if name.contains("gitlab") || signed_in(&host) || signed_in(&name) {
        return Forge::GitLab(GitLabRepo { host, path });
    }
    Forge::GitHub
}

/// An origin URL's host and repository path: `git@host:group/repo.git`,
/// `ssh://git@host:2222/group/repo.git` and `https://user@host:8443/group/repo`
/// alike. An SSH port is no use to the web API, so only an https one is kept.
pub(crate) fn origin_parts(url: &str) -> Option<(String, String)> {
    let url = url.trim();
    if url.is_empty() {
        return None;
    }
    let (scheme, rest) = match url.split_once("://") {
        Some((scheme, rest)) => (scheme.to_lowercase(), rest.to_string()),
        None if url.contains(':') && !url.starts_with('/') => {
            ("scp".to_string(), url.replacen(':', "/", 1))
        }
        None => return None,
    };
    if scheme == "file" {
        return None;
    }
    let (authority, path) = rest.split_once('/')?;
    let host = authority.rsplit('@').next().unwrap_or(authority);
    let host = if scheme.starts_with("http") {
        host.to_string()
    } else {
        host.split(':').next().unwrap_or(host).to_string()
    };
    let path = path
        .trim_end_matches('/')
        .trim_end_matches(".git")
        .to_string();
    (!host.is_empty() && path.contains('/')).then_some((host, path))
}

/// The hosts `glab` keeps a sign-in for, read from its config file. Every
/// version keeps it in `glab-cli/config.yml` under one of these folders.
fn glab_hosts() -> Vec<String> {
    static HOSTS: OnceLock<Mutex<(Vec<String>, Option<Instant>)>> = OnceLock::new();
    let slot = HOSTS.get_or_init(|| Mutex::new((Vec::new(), None)));
    let mut slot = slot.lock().unwrap();
    if slot.1.is_some_and(|at| at.elapsed() < FRESH) {
        return slot.0.clone();
    }
    let mut hosts: Vec<String> = Vec::new();
    for file in glab_config_files() {
        if let Ok(text) = std::fs::read_to_string(&file) {
            for host in hosts_in_config(&text) {
                if !hosts.contains(&host) {
                    hosts.push(host);
                }
            }
        }
    }
    if let Ok(host) = std::env::var("GITLAB_HOST") {
        let host = host
            .trim()
            .trim_start_matches("https://")
            .trim_end_matches('/');
        if !host.is_empty() {
            hosts.push(host.to_string());
        }
    }
    *slot = (hosts.clone(), Some(Instant::now()));
    hosts
}

fn glab_signed_in_to(host: &str) -> bool {
    glab_hosts().iter().any(|h| h.eq_ignore_ascii_case(host))
}

fn glab_config_files() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Ok(dir) = std::env::var("GLAB_CONFIG_DIR") {
        dirs.push(PathBuf::from(dir));
    }
    if let Ok(dir) = std::env::var("XDG_CONFIG_HOME") {
        dirs.push(PathBuf::from(dir).join("glab-cli"));
    }
    if let Some(dir) = dirs::config_dir() {
        dirs.push(dir.join("glab-cli"));
    }
    if let Some(home) = dirs::home_dir() {
        dirs.push(home.join(".config").join("glab-cli"));
    }
    dirs.into_iter().map(|d| d.join("config.yml")).collect()
}

/// The keys of the top-level `hosts:` map of glab's config.yml.
fn hosts_in_config(text: &str) -> Vec<String> {
    let mut hosts = Vec::new();
    let mut inside = false;
    let mut indent: Option<usize> = None;
    for line in text.lines() {
        let trimmed = line.trim_end();
        if trimmed.trim_start().is_empty() || trimmed.trim_start().starts_with('#') {
            continue;
        }
        let depth = trimmed.len() - trimmed.trim_start().len();
        if depth == 0 {
            inside = trimmed == "hosts:";
            indent = None;
            continue;
        }
        if !inside {
            continue;
        }
        let level = *indent.get_or_insert(depth);
        if depth != level {
            continue;
        }
        if let Some(key) = trimmed.trim_start().strip_suffix(':') {
            let key = key.trim_matches(|c| c == '"' || c == '\'');
            if !key.is_empty() {
                hosts.push(key.to_string());
            }
        }
    }
    hosts
}

/// Whether the `glab` CLI is on PATH. Asked again after a while, so installing
/// it while lpm runs is noticed without a restart.
pub(crate) fn glab_installed() -> bool {
    static SEEN: OnceLock<Mutex<Option<(bool, Instant)>>> = OnceLock::new();
    let slot = SEEN.get_or_init(|| Mutex::new(None));
    let mut slot = slot.lock().unwrap();
    if let Some((found, at)) = *slot {
        if at.elapsed() < Duration::from_secs(30) {
            return found;
        }
    }
    let found = crate::sys::which("glab");
    *slot = Some((found, Instant::now()));
    found
}

/// Run `glab` in `cwd` without prompts or update notices. A local checkout
/// without `glab` installed fails before anything is spawned.
pub(crate) fn glab_out(cwd: &str, args: &[&str]) -> Result<String, String> {
    let local = crate::sshexec::remote_project_for_path(cwd).is_none();
    if local && !glab_installed() {
        return Err("Install the GitLab CLI (glab) to work with merge requests".into());
    }
    crate::git::tool_out(
        cwd,
        "glab",
        args,
        &[
            ("NO_PROMPT", "1"),
            ("GLAB_CHECK_UPDATE", "false"),
            ("NO_COLOR", "1"),
        ],
    )
    .map_err(|e| tidy_error(&e))
}

/// `glab api` against `repo`'s own instance: `endpoint` is a REST v4 path.
pub(crate) fn glab_api(
    cwd: &str,
    repo: &GitLabRepo,
    endpoint: &str,
    extra: &[&str],
) -> Result<String, String> {
    let mut args = vec!["api", "--hostname", repo.host.as_str(), endpoint];
    args.extend_from_slice(extra);
    glab_out(cwd, &args).map_err(|e| {
        if e.contains("401") || e.contains("Unauthorized") {
            format!(
                "glab isn't signed in to {0}. Run `glab auth login --hostname {0}` in a terminal.",
                repo.host
            )
        } else {
            e
        }
    })
}

/// glab prints the API's JSON error after its own prefix; keep the message.
fn tidy_error(err: &str) -> String {
    let text = err.trim().trim_start_matches("glab:").trim();
    serde_json::from_str::<serde_json::Value>(text)
        .ok()
        .and_then(|v| {
            v.get("message")
                .or_else(|| v.get("error"))
                .map(message_text)
        })
        .filter(|m| !m.is_empty())
        .unwrap_or_else(|| text.to_string())
}

/// GitLab's `message` is a string, a list, or field → reasons.
fn message_text(value: &serde_json::Value) -> String {
    use serde_json::Value;
    match value {
        Value::String(s) => s.clone(),
        Value::Array(items) => items
            .iter()
            .map(message_text)
            .collect::<Vec<_>>()
            .join("; "),
        Value::Object(fields) => fields
            .iter()
            .map(|(field, why)| format!("{field} {}", message_text(why)))
            .collect::<Vec<_>>()
            .join("; "),
        other => other.to_string(),
    }
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GitHostInfo {
    /// "github" or "gitlab".
    pub kind: &'static str,
    /// A GitLab origin's host, as a dialog names it; empty on GitHub.
    pub host: String,
    /// Whether `gh` or `glab` is installed here; always true for an SSH
    /// project, whose CLI runs on its server.
    pub cli_found: bool,
}

/// Which forge `cwd` pushes to and whether its CLI is here, for the dialogs
/// that name it before there's a pull request to ask about.
#[tauri::command(async)]
pub fn git_host_info(cwd: String) -> GitHostInfo {
    let local = crate::sshexec::remote_project_for_path(&cwd).is_none();
    match forge(&cwd) {
        Forge::GitLab(repo) => GitHostInfo {
            kind: "gitlab",
            host: repo.host,
            cli_found: !local || glab_installed(),
        },
        Forge::GitHub => GitHostInfo {
            kind: "github",
            host: String::new(),
            cli_found: !local || crate::git::check_ghcli(),
        },
    }
}

#[cfg(test)]
#[path = "githost_tests.rs"]
mod tests;
