//! Plugins and hooks — the two capability kinds lpm reports but never touches.
//!
//! A plugin bundles skills, commands, subagents, hooks and MCP servers behind
//! one enable flag, so a disabled plugin silently takes all of them with it.
//! Hooks are read-only on purpose: `src-tauri/src/hooks.rs` already owns three
//! marked regions in `~/.claude/settings.json`, and a second writer would fight
//! lpm's own features.

use super::mcp::{from_plugin_json, read_json, str_array};
use super::{AgentCapabilities, AgentCapability};
use super::{KIND_HOOK, KIND_PLUGIN};
use serde_json::Value;
use std::path::{Path, PathBuf};

/// `(plugin@marketplace, installPath)` for every installed plugin.
pub fn installed_plugins(home: &Path) -> Vec<(String, PathBuf)> {
    let Some(json) = read_json(&home.join(".claude/plugins/installed_plugins.json")) else {
        return Vec::new();
    };
    let Some(map) = json.get("plugins").and_then(Value::as_object) else {
        return Vec::new();
    };
    map.iter()
        .filter_map(|(name, installs)| {
            let path = installs
                .as_array()?
                .first()?
                .get("installPath")?
                .as_str()?
                .to_string();
            Some((name.clone(), PathBuf::from(path)))
        })
        .collect()
}

/// `enabledPlugins` ships as an object map of `name -> bool`. An array of names
/// is accepted too, because being wrong here silently reports every plugin as
/// disabled — the exact failure this pane exists to catch.
fn plugin_enabled(settings: Option<&Value>, name: &str) -> bool {
    let Some(field) = settings.and_then(|j| j.get("enabledPlugins")) else {
        return false;
    };
    if let Some(map) = field.as_object() {
        return map.get(name).and_then(Value::as_bool).unwrap_or(false);
    }
    str_array(Some(field)).iter().any(|e| e == name)
}

fn claude_plugins(home: &Path, out: &mut AgentCapabilities) {
    let settings = read_json(&home.join(".claude/settings.json"));
    for (name, install_path) in installed_plugins(home) {
        let on = plugin_enabled(settings.as_ref(), &name);
        let marketplace = name.split_once('@').map(|(_, m)| m.to_string()).unwrap_or_default();
        let mut cap = AgentCapability::new("claude", KIND_PLUGIN, "user", &name);
        cap.path = install_path.to_string_lossy().into_owned();
        cap.enabled = on;
        cap.detail = marketplace;
        cap.description = if on {
            "Enabled in ~/.claude/settings.json".into()
        } else {
            "Installed but not listed in enabledPlugins".into()
        };
        out.items.push(cap);

        // A plugin's own servers, which `claude mcp list` prints as
        // `plugin:<plugin>:<server>`. They are a large share of the tools an
        // agent actually loads, and appear in no other config file.
        let short = name.split('@').next().unwrap_or(&name).to_string();
        let plugin_mcp = install_path.join(".mcp.json");
        let Some(json) = read_json(&plugin_mcp) else {
            continue;
        };
        for mut server in from_plugin_json(&json, &plugin_mcp.to_string_lossy()) {
            server.name = format!("plugin:{short}:{}", server.name);
            server.id = format!("claude:mcp:plugin:{}", server.name);
            server.detail = name.clone();
            server.enabled = on;
            if !on {
                server.problem = format!("{name} is not enabled, so this server never starts");
            }
            out.items.push(server);
        }
    }
}

/// Hooks are listed, never edited: `src-tauri/src/hooks.rs` already owns three
/// marked regions in this same file, and a second writer would fight it.
fn claude_hooks(home: &Path, root: Option<&Path>, out: &mut AgentCapabilities) {
    let mut files = vec![(home.join(".claude/settings.json"), "user")];
    if let Some(root) = root {
        files.push((root.join(".claude/settings.json"), "project"));
        files.push((root.join(".claude/settings.local.json"), "local"));
    }
    for (path, scope) in files {
        let Some(hooks) = read_json(&path).and_then(|j| j.get("hooks").cloned()) else {
            continue;
        };
        let Some(events) = hooks.as_object() else {
            continue;
        };
        for (event, matchers) in events {
            let count = matchers.as_array().map(Vec::len).unwrap_or(0);
            let lpm_owned = matchers.to_string().contains("lpm-hook");
            let mut cap = AgentCapability::new("claude", KIND_HOOK, scope, event);
            cap.path = path.to_string_lossy().into_owned();
            cap.detail = if lpm_owned { "installed by lpm".into() } else { String::new() };
            cap.description = format!("{count} matcher{}", if count == 1 { "" } else { "s" });
            out.items.push(cap);
        }
    }
}


pub fn scan(home: &Path, root: Option<&Path>, out: &mut AgentCapabilities) {
    claude_plugins(home, out);
    claude_hooks(home, root, out);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enabled_plugins_reads_the_object_map_it_actually_ships_as() {
        let settings = serde_json::json!({
            "enabledPlugins": { "figma@official": true, "old@official": false }
        });
        assert!(plugin_enabled(Some(&settings), "figma@official"));
        assert!(!plugin_enabled(Some(&settings), "old@official"));
        assert!(!plugin_enabled(Some(&settings), "absent@official"));
    }

    #[test]
    fn an_array_of_names_is_accepted_too() {
        let settings = serde_json::json!({ "enabledPlugins": ["figma@official"] });
        assert!(plugin_enabled(Some(&settings), "figma@official"));
        assert!(!plugin_enabled(Some(&settings), "other@official"));
    }

    #[test]
    fn missing_settings_disables_rather_than_panicking() {
        assert!(!plugin_enabled(None, "figma@official"));
        assert!(!plugin_enabled(Some(&serde_json::json!({})), "figma@official"));
    }

    #[test]
    fn a_plugin_mcp_file_parses_wrapped_or_flat() {
        let wrapped = serde_json::json!({
            "mcpServers": { "figma": { "type": "http", "url": "https://mcp.figma.com/mcp" } }
        });
        let flat = serde_json::json!({
            "context7": { "command": "npx", "args": ["-y", "@upstash/context7-mcp"] }
        });
        assert_eq!(from_plugin_json(&wrapped, "/p/.mcp.json")[0].name, "figma");
        assert_eq!(from_plugin_json(&flat, "/p/.mcp.json")[0].name, "context7");
    }

    #[test]
    fn a_flat_file_ignores_keys_that_are_not_server_definitions() {
        let noise = serde_json::json!({ "$schema": "https://example/schema.json", "version": 2 });
        assert!(from_plugin_json(&noise, "/p/.mcp.json").is_empty());
    }

}
