// A terminal in a WSL project: the distro user's own login shell in the
// folder, carrying what lpm's agent hooks in the distro need to report back.
use crate::wsl::Target;
use portable_pty::CommandBuilder;
use std::collections::BTreeMap;
use tauri::AppHandle;

/// The login shell, from the account database when nothing set $SHELL.
const LOGIN_SHELL: &str = r#"s="${SHELL:-$(getent passwd "$(id -un)" | cut -d: -f7)}"; exec "${s:-/bin/bash}" -l"#;

pub(crate) fn builder(
    app: &AppHandle,
    target: &Target,
    project_name: &str,
    pane_id: &str,
    extra_env: &BTreeMap<String, String>,
) -> CommandBuilder {
    crate::wslstatus::ensure_bridge(app, &target.distro);
    crate::hooks::install_wsl_agent_hooks_once(&target.distro);
    let mut env: BTreeMap<String, String> = BTreeMap::new();
    env.insert("TERM".into(), "xterm-256color".into());
    env.insert("TERM_PROGRAM".into(), "kitty".into());
    env.insert("LPM_PROJECT_NAME".into(), project_name.to_string());
    env.insert("LPM_PANE_ID".into(), pane_id.to_string());
    if let Some(dir) = crate::session_memory_scope::memory_dir(project_name)
        .ok()
        .and_then(|dir| crate::wsl::linux_path(&dir.to_string_lossy()))
    {
        env.insert("LPM_MEMORY_DIR".into(), dir);
    }
    for (k, v) in extra_env {
        env.insert(k.clone(), v.clone());
    }
    let inner = format!("{} && {LOGIN_SHELL}", crate::wslstatus::socket_export());
    let script = crate::wsl::script(&target.linux, &env, &inner);
    let mut builder = CommandBuilder::new(crate::wsl::exe());
    builder.args(crate::wsl::login_args(&target.distro, &script));
    builder.cwd(crate::config::remote_local_spawn_dir(""));
    for (k, v) in std::env::vars() {
        builder.env(k, v);
    }
    builder
}
