//! What an agent CLI will actually load in a given directory: skills, MCP
//! servers, plugins, subagents, slash commands, instructions and hooks.
//!
//! Read-first by design. lpm resolves and diagnoses; the vendor CLI owns
//! mutation of its own JSON/TOML, so the only writes here are to the markdown
//! files lpm can author safely (see `write`).

mod mcp;
mod plugins;
mod remote;
mod resolve;
mod scan;
mod skills;
mod write;

pub use skills::{create_agent_skill, delete_agent_skill, preview_agent_skill_delete};
pub use write::{read_agent_capability, write_agent_capability};

use serde::Serialize;

/// Markdown-backed kinds are the ones lpm will write; everything else is
/// read-only because another tool owns the file format.
pub const KIND_SKILL: &str = "skill";
pub const KIND_COMMAND: &str = "command";
pub const KIND_SUBAGENT: &str = "subagent";
pub const KIND_INSTRUCTIONS: &str = "instructions";
pub const KIND_MCP: &str = "mcp";
pub const KIND_PLUGIN: &str = "plugin";
pub const KIND_HOOK: &str = "hook";

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentCapability {
    /// `<cli>:<kind>:<scope>:<name>` — stable across refreshes, unique because
    /// the same name in two scopes is genuinely two capabilities.
    pub id: String,
    pub kind: String,
    pub name: String,
    pub cli: String,
    /// "user" | "project" | "local" | "plugin"
    pub scope: String,
    /// The file that defines it. For a JSON/TOML entry this is the file, not
    /// the key — the detail view highlights nothing, it just opens the source.
    pub path: String,
    pub description: String,
    /// One-line supporting text: transport for MCP, version for a plugin.
    pub detail: String,
    pub enabled: bool,
    /// lpm can compare-and-swap this file. False for anything another tool owns.
    pub editable: bool,
    /// Path of the definition that beats this one, "" when this one wins.
    pub shadowed_by: String,
    /// Human-readable reason this capability will not work, "" when fine.
    pub problem: String,
    /// Whether `problem` actually stops it loading. Not every problem does: a
    /// server with a literal API key starts and loads its schemas anyway, and
    /// an ambiguous tie marks every candidate even though one of them wins. The
    /// pane's token estimate must not zero those out, so the two questions —
    /// "is something wrong" and "does it still cost context" — stay separate.
    pub blocking: bool,
    /// Size on disk of the defining file, the basis for the token estimate.
    pub bytes: u64,
}

impl AgentCapability {
    pub fn new(cli: &str, kind: &str, scope: &str, name: &str) -> Self {
        Self {
            id: format!("{cli}:{kind}:{scope}:{name}"),
            kind: kind.to_string(),
            name: name.to_string(),
            cli: cli.to_string(),
            scope: scope.to_string(),
            enabled: true,
            ..Default::default()
        }
    }
}

/// A directory or file the scan looked at, so the pane can say where its answer
/// came from — including the ones that were not there.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityRoot {
    pub cli: String,
    pub scope: String,
    /// Which kind of capability this directory holds, so the pane can offer to
    /// add one. Empty for the MCP config files and instructions files.
    pub kind: String,
    pub path: String,
    pub exists: bool,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentCapabilities {
    pub items: Vec<AgentCapability>,
    pub roots: Vec<CapabilityRoot>,
    /// The scan ran on an SSH host, so paths are remote.
    pub remote: bool,
    /// The file cap was hit — the listing is incomplete and says so.
    pub truncated: bool,
    /// Claude's per-directory trust flag. Untrusted directories never load
    /// `.mcp.json` servers, which is the single most common "installed but not
    /// loaded" case in a fresh duplicate or worktree.
    pub trusted: bool,
}

/// Everything `cli` would load in `cwd`, resolved for shadowing.
///
/// Pure read. Nothing here spawns a process from a config file lpm did not
/// author — probing an MCP server is an explicit, per-row action, never part of
/// a listing refresh.
#[tauri::command(async)]
pub fn list_agent_capabilities(cwd: String) -> Result<AgentCapabilities, String> {
    let mut result = match crate::sshexec::remote_project_for_path(&cwd) {
        Some(ssh) => remote::scan(&ssh, &cwd),
        None => scan::scan(&cwd),
    };
    resolve::mark_shadowed(&mut result.items);
    resolve::sort(&mut result.items);
    Ok(result)
}

#[cfg(test)]
pub(crate) fn mark_shadowed_for_test(items: &mut [AgentCapability]) {
    resolve::mark_shadowed(items);
    resolve::sort(items);
}
