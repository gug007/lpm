// SSH host discovery — port of desktop/sshconfig.go. Reads ~/.ssh/config and
// any Include'd files, returning non-wildcard Host aliases for the Add-SSH-
// project picker. Missing config is not an error (returns []).
use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone)]
pub struct SshConfigHost {
    pub name: String,
    #[serde(rename = "hostName")]
    pub host_name: String,
    pub user: String,
    pub port: i64,
    #[serde(rename = "identityFile")]
    pub identity_file: String,
}

const SSH_INCLUDE_MAX_DEPTH: usize = 4;

#[tauri::command]
pub fn list_ssh_hosts() -> Result<Vec<SshConfigHost>, String> {
    let Some(home) = dirs::home_dir().filter(|h| !h.as_os_str().is_empty()) else {
        return Ok(vec![]);
    };
    let mut hosts = parse_ssh_config(&home.join(".ssh").join("config"), &home, 0)?;
    dedupe_hosts(&mut hosts);
    hosts.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(hosts)
}

#[derive(Default)]
struct Block {
    names: Vec<String>,
    host_name: String,
    user: String,
    port: i64,
    identity_file: String,
}

fn parse_ssh_config(path: &Path, home: &Path, depth: usize) -> Result<Vec<SshConfigHost>, String> {
    if depth > SSH_INCLUDE_MAX_DEPTH {
        return Ok(vec![]);
    }
    let file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(e.to_string()),
    };

    let mut hosts: Vec<SshConfigHost> = vec![];
    let mut blocks: Vec<Block> = vec![];
    let mut current: Option<usize> = None;
    // `Match` predicates can't be evaluated without ssh's connection state, so
    // skip any block under `Match` until the next `Host`.
    let mut skip_match = false;

    for line in BufReader::new(file).lines() {
        let line = line.map_err(|e| e.to_string())?;
        let Some((key, val)) = parse_line(&line) else {
            continue;
        };
        match key.to_lowercase().as_str() {
            "host" => {
                skip_match = false;
                let names: Vec<String> = split_fields(&val)
                    .into_iter()
                    .filter(|n| !is_wildcard_host(n))
                    .collect();
                if names.is_empty() {
                    current = None;
                    continue;
                }
                blocks.push(Block {
                    names,
                    ..Block::default()
                });
                current = Some(blocks.len() - 1);
            }
            "match" => {
                skip_match = true;
                current = None;
            }
            "include" => {
                for pat in split_fields(&val) {
                    let glob_pat = expand_include_path(&pat, home);
                    let Ok(paths) = glob::glob(&glob_pat.to_string_lossy()) else {
                        continue;
                    };
                    for m in paths.flatten() {
                        if let Ok(sub) = parse_ssh_config(&m, home, depth + 1) {
                            hosts.extend(sub);
                        }
                    }
                }
            }
            other => {
                if skip_match {
                    continue;
                }
                let Some(idx) = current else { continue };
                let b = &mut blocks[idx];
                match other {
                    "user" if b.user.is_empty() => b.user = val.trim().to_string(),
                    "port" if b.port == 0 => {
                        if let Ok(n) = first_field(&val).parse::<i64>() {
                            if n > 0 {
                                b.port = n;
                            }
                        }
                    }
                    "identityfile" if b.identity_file.is_empty() => {
                        b.identity_file = first_field(&val);
                    }
                    "hostname" if b.host_name.is_empty() => {
                        b.host_name = first_field(&val);
                    }
                    _ => {}
                }
            }
        }
    }

    for b in &blocks {
        for name in &b.names {
            hosts.push(SshConfigHost {
                name: name.clone(),
                host_name: b.host_name.clone(),
                user: b.user.clone(),
                port: b.port,
                identity_file: b.identity_file.clone(),
            });
        }
    }
    Ok(hosts)
}

/// (key, value); None for blank/comment lines or lines without a separator.
fn parse_line(line: &str) -> Option<(String, String)> {
    let line = line.trim();
    if line.is_empty() || line.starts_with('#') {
        return None;
    }
    let idx = line.find([' ', '\t', '='])?;
    let key = line[..idx].to_string();
    let rest = line[idx..].trim_start();
    let rest = rest.strip_prefix('=').unwrap_or(rest);
    Some((key, rest.trim().to_string()))
}

/// Splits on whitespace, honouring double-quoted spans.
fn split_fields(s: &str) -> Vec<String> {
    let mut out = vec![];
    let mut cur = String::new();
    let mut in_quotes = false;
    for c in s.chars() {
        match c {
            '"' => in_quotes = !in_quotes,
            ' ' | '\t' if !in_quotes => {
                if !cur.is_empty() {
                    out.push(std::mem::take(&mut cur));
                }
            }
            _ => cur.push(c),
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

fn first_field(s: &str) -> String {
    split_fields(s).into_iter().next().unwrap_or_default()
}

fn is_wildcard_host(name: &str) -> bool {
    name.is_empty() || name.starts_with('!') || name.contains(['*', '?'])
}

fn expand_include_path(pat: &str, home: &Path) -> PathBuf {
    let p = Path::new(pat);
    if p.is_absolute() {
        return p.to_path_buf();
    }
    if let Some(rest) = pat.strip_prefix("~/") {
        return home.join(rest);
    }
    home.join(".ssh").join(pat)
}

/// Keep the first occurrence of each Host name (ssh's first-match-wins).
fn dedupe_hosts(hosts: &mut Vec<SshConfigHost>) {
    let mut seen = std::collections::HashSet::new();
    hosts.retain(|h| seen.insert(h.name.clone()));
}
