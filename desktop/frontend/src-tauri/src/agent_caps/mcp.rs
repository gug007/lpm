//! The JSON- and TOML-backed capabilities: MCP servers, plugins and hooks.
//!
//! All read-only. These files are rewritten continuously by the agent CLIs
//! themselves, so lpm parses them and never writes them back — mutation goes
//! through the vendor's own command.

use super::{AgentCapabilities, AgentCapability, CapabilityRoot};
use super::KIND_MCP;
use serde_json::Value;
use std::path::{Path, PathBuf};

/// `~/.claude.json` grows with every project ever opened — hundreds of KB on a
/// long-lived install — so it is parsed once per scan and shared below.
pub(super) fn read_json(path: &Path) -> Option<Value> {
    serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()
}

pub(super) fn str_array(v: Option<&Value>) -> Vec<String> {
    v.and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

/// stdio servers summarise as their command line, remote ones as their URL.
fn transport_detail(def: &Value) -> String {
    if let Some(url) = def.get("url").and_then(Value::as_str) {
        let kind = def
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or("http")
            .to_uppercase();
        return format!("{url} ({kind})");
    }
    let command = def.get("command").and_then(Value::as_str).unwrap_or("");
    let args = str_array(def.get("args")).join(" ");
    format!("{command} {args}").trim().to_string()
}

/// A literal-looking secret in a committed config is worth flagging even though
/// v0 cannot fix it — the value is in telling the user before they push.
fn secret_warning(def: &Value) -> String {
    let env = def.get("env").or_else(|| def.get("headers"));
    let Some(map) = env.and_then(Value::as_object) else {
        return String::new();
    };
    const SECRETISH: [&str; 4] = ["key", "token", "secret", "authorization"];
    for (key, value) in map {
        let Some(raw) = value.as_str() else { continue };
        let looks_literal = raw.len() > 16 && !raw.contains("${");
        let lower = key.to_lowercase();
        if looks_literal && SECRETISH.iter().any(|s| lower.contains(s)) {
            return format!("{key} holds a literal value, not a ${{VAR}} reference");
        }
    }
    String::new()
}

fn mcp_entry(cli: &str, scope: &str, name: &str, def: &Value, path: &str) -> AgentCapability {
    let mut cap = AgentCapability::new(cli, KIND_MCP, scope, name);
    cap.path = path.to_string();
    cap.detail = transport_detail(def);
    cap.description = cap.detail.clone();
    cap.problem = secret_warning(def);
    cap.bytes = def.to_string().len() as u64;
    cap
}

fn is_server_def(def: &Value) -> bool {
    def.get("command").is_some() || def.get("url").is_some()
}

/// Every server under a `mcpServers` key. Shared by the local scan and the SSH
/// one, which streams the same `.mcp.json` back as bytes.
pub fn from_json(json: &Value, cli: &str, scope: &str, path: &str) -> Vec<AgentCapability> {
    json.get("mcpServers")
        .and_then(Value::as_object)
        .map(|servers| {
            servers
                .iter()
                .map(|(name, def)| mcp_entry(cli, scope, name, def, path))
                .collect()
        })
        .unwrap_or_default()
}

/// A plugin's own `.mcp.json` comes in two shapes in the wild: wrapped in
/// `mcpServers` (figma) or a bare map of name to definition (context7). Reading
/// only the wrapped form silently drops half the plugin servers an agent loads.
pub fn from_plugin_json(json: &Value, path: &str) -> Vec<AgentCapability> {
    if json.get("mcpServers").is_some() {
        return from_json(json, "claude", "plugin", path);
    }
    json.as_object()
        .map(|servers| {
            servers
                .iter()
                .filter(|(_, def)| is_server_def(def))
                .map(|(name, def)| mcp_entry("claude", "plugin", name, def, path))
                .collect()
        })
        .unwrap_or_default()
}

/// Every `[mcp_servers.<name>]` table in a Codex `config.toml`.
pub fn from_toml(text: &str, path: &str) -> Vec<AgentCapability> {
    let Ok(doc) = text.parse::<toml_edit::DocumentMut>() else {
        return Vec::new();
    };
    let Some(servers) = doc.get("mcp_servers").and_then(toml_edit::Item::as_table) else {
        return Vec::new();
    };
    servers
        .iter()
        .filter_map(|(name, item)| {
            let table = item.as_table()?;
            let get = |k: &str| table.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let args = table
                .get("args")
                .and_then(|v| v.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|x| x.as_str())
                        .collect::<Vec<_>>()
                        .join(" ")
                })
                .unwrap_or_default();
            let url = get("url");
            let mut cap = AgentCapability::new("codex", KIND_MCP, "user", name);
            cap.path = path.to_string();
            cap.detail = if url.is_empty() {
                format!("{} {args}", get("command")).trim().to_string()
            } else {
                url
            };
            cap.description = cap.detail.clone();
            cap.enabled = table
                .get("enabled")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            cap.bytes = table.to_string().len() as u64;
            Some(cap)
        })
        .collect()
}

// ---- claude ------------------------------------------------------------------

fn claude_mcp(home: &Path, cwd: &str, root: Option<&Path>, out: &mut AgentCapabilities) {
    let claude_json_path = home.join(".claude.json");
    let claude_json = read_json(&claude_json_path);
    let json_path = claude_json_path.to_string_lossy().into_owned();
    let project = claude_json
        .as_ref()
        .and_then(|j| j.get("projects")?.get(cwd));

    // An untrusted directory never loads .mcp.json servers — the usual reason a
    // fresh duplicate or worktree looks configured but has no tools.
    out.trusted = project
        .and_then(|p| p.get("hasTrustDialogAccepted")?.as_bool())
        .unwrap_or(false);

    // User scope: every project sees these.
    if let Some(json) = claude_json.as_ref() {
        out.items
            .extend(from_json(json, "claude", "user", &json_path));
    }

    // Local scope: this directory only, and invisible to anyone else.
    if let Some(project) = project {
        out.items
            .extend(from_json(project, "claude", "local", &json_path));
    }

    // Project scope: committed, and therefore gated on directory trust.
    let Some(root) = root else { return };
    let mcp_json = root.join(".mcp.json");
    out.roots.push(CapabilityRoot {
        cli: "claude".into(),
        scope: "project".into(),
        path: mcp_json.to_string_lossy().into_owned(),
        exists: mcp_json.exists(),
    });
    let Some(json) = read_json(&mcp_json) else {
        return;
    };
    let disabled = str_array(project.and_then(|p| p.get("disabledMcpjsonServers")));
    let trusted = out.trusted;
    for mut cap in from_json(
        &json,
        "claude",
        "project",
        &mcp_json.to_string_lossy(),
    ) {
        if disabled.iter().any(|d| d == &cap.name) {
            cap.enabled = false;
        } else if !trusted && cap.problem.is_empty() {
            cap.problem = "pending approval — this directory is not trusted yet".into();
            cap.blocking = true;
        }
        out.items.push(cap);
    }
}

// ---- codex -------------------------------------------------------------------

/// `[mcp_servers.<name>]` in `~/.codex/config.toml`. Codex also offers
/// `codex mcp list --json`, but that is a spawn — a listing refresh stays pure.
fn codex_mcp(home: &Path, out: &mut AgentCapabilities) {
    let codex_home = std::env::var("CODEX_HOME")
        .ok()
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".codex"));
    let config = codex_home.join("config.toml");
    out.roots.push(CapabilityRoot {
        cli: "codex".into(),
        scope: "user".into(),
        path: config.to_string_lossy().into_owned(),
        exists: config.exists(),
    });
    let Ok(text) = std::fs::read_to_string(&config) else {
        return;
    };
    out.items
        .extend(from_toml(&text, &config.to_string_lossy()));
}

pub fn scan(home: &Path, cwd: &str, root: Option<&Path>, out: &mut AgentCapabilities) {
    claude_mcp(home, cwd, root, out);
    super::plugins::scan(home, root, out);
    codex_mcp(home, out);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transport_detail_covers_stdio_and_remote() {
        let stdio = serde_json::json!({ "command": "npx", "args": ["-y", "@upstash/context7-mcp"] });
        assert_eq!(transport_detail(&stdio), "npx -y @upstash/context7-mcp");
        let http = serde_json::json!({ "type": "http", "url": "https://mcp.figma.com/mcp" });
        assert_eq!(transport_detail(&http), "https://mcp.figma.com/mcp (HTTP)");
    }

    #[test]
    fn a_literal_secret_is_flagged_but_a_var_reference_is_not() {
        let literal = serde_json::json!({ "env": { "API_KEY": "sk-live-0123456789abcdef" } });
        assert!(secret_warning(&literal).contains("API_KEY"));
        let referenced = serde_json::json!({ "env": { "API_KEY": "${FIGMA_TOKEN}" } });
        assert!(secret_warning(&referenced).is_empty());
    }

    #[test]
    fn codex_toml_servers_parse_with_their_enabled_flag() {
        let toml = r#"
[mcp_servers.node_repl]
command = "node"
args = ["repl.js"]

[mcp_servers.computer-use]
command = "./client"
enabled = false
"#;
        let caps = from_toml(toml, "/h/.codex/config.toml");
        assert_eq!(caps.len(), 2);
        let repl = caps.iter().find(|c| c.name == "node_repl").unwrap();
        assert_eq!(repl.detail, "node repl.js");
        assert!(repl.enabled);
        assert!(!caps.iter().find(|c| c.name == "computer-use").unwrap().enabled);
    }
}
