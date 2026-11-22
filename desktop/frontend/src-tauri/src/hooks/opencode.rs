// OpenCode: lpm's status plugin (plugin.rs) in its global plugins folder, which
// it loads every script from. OpenCode 1 reports from that script; OpenCode 2
// runs it in a background service every terminal shares and reports from the
// terminal plugin it finds in the folder beside it.
use super::plugin::Plugin;
use super::Agent;
use crate::agentkind::AgentKind;

pub(super) const AGENT: Agent = Agent {
    kind: AgentKind::OpenCode,
    install,
    install_remote,
    uninstall,
};

const REMOTE_DIR: &str = "${XDG_CONFIG_HOME:-$HOME/.config}/opencode";

const SERVER: Plugin = Plugin {
    kind: AgentKind::OpenCode,
    source: include_str!("opencode_plugin.js"),
    path: &["plugins", "lpm-status.js"],
    remote_dir: REMOTE_DIR,
};

const TUI: Plugin = Plugin {
    kind: AgentKind::OpenCode,
    source: include_str!("opencode_tui_plugin.js"),
    path: &["plugins", "lpm-status", "tui.js"],
    remote_dir: REMOTE_DIR,
};

const PLUGINS: [Plugin; 2] = [SERVER, TUI];

fn install() {
    for plugin in &PLUGINS {
        plugin.install(crate::agentdirs::opencode_dir());
    }
}

fn install_remote(ssh: &dyn crate::remoteshell::RemoteShell) -> bool {
    PLUGINS
        .iter()
        .fold(true, |installed, plugin| plugin.install_remote(ssh) && installed)
}

fn uninstall() -> Result<(), String> {
    PLUGINS.iter().fold(Ok(()), |first, plugin| {
        first.and(plugin.uninstall(crate::agentdirs::opencode_dir()))
    })
}

#[cfg(test)]
#[path = "opencode_tests.rs"]
mod tests;
