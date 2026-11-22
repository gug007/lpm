// omp (oh-my-pi): lpm's status plugin (plugin.rs) as an extension in its agent
// folder, which it loads every script in `extensions/` from.
use super::plugin::Plugin;
use super::Agent;
use crate::agentkind::AgentKind;

pub(super) const AGENT: Agent = Agent {
    kind: AgentKind::Omp,
    install,
    install_remote,
    uninstall,
};

const PLUGIN: Plugin = Plugin {
    kind: AgentKind::Omp,
    source: include_str!("omp_plugin.js"),
    path: &["extensions", "lpm-status.js"],
    remote_dir: "${PI_CODING_AGENT_DIR:-$HOME/.omp/agent}",
};

fn install() {
    PLUGIN.install(crate::agentdirs::omp_dir());
}

fn install_remote(ssh: &dyn crate::remoteshell::RemoteShell) -> bool {
    PLUGIN.install_remote(ssh)
}

fn uninstall() -> Result<(), String> {
    PLUGIN.uninstall(crate::agentdirs::omp_dir())
}

#[cfg(test)]
#[path = "omp_tests.rs"]
mod tests;
