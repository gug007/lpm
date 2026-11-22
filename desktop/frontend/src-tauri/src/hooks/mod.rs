// Agent status hooks — port of desktop/agent_detect.go.
//
// Installs hooks into each agent CLI's own settings that pipe
// `set_status`/`clear_status` to the lpm status socket (socketsrv.rs) as the
// agent runs. Without this, the socket server has no clients and status badges
// stay dark. Install is idempotent via a `# lpm-hook` marker and only ever
// touches lpm's own hook entries — every other setting is preserved
// (serde_json::Value round-trips losslessly; key ordering alphabetizes exactly
// as Go's map+MarshalIndent did).
//
// Adding an agent:
// 1. agentkind.rs: an AgentKind and its Spec — id, status-key prefix, Running
//    look, and whether its keys name a session or the pane.
// 2. A module here with where its hooks go, the events it reports and the hook
//    for each (sh.rs builds the sh form, `Frames` the usual states; hookform.rs
//    the Windows form, `lpm hook <id> <event>`), and its entry in AGENTS. An
//    agent that runs no hook commands but loads scripts of its own gets lpm's
//    plugin instead (plugin.rs): only its half, following its turns, is new.
// 3. cli/src/hook: a module mapping the same events to the same frames.
// 4. The names people see, read from the key prefix: the frontend's
//    agentStatus.ts and the phone's ActivityModel.swift.
use crate::agentkind::AgentKind;
use serde_json::{json, Map, Value};
use std::path::Path;

mod claude;
mod codex;
mod cursor;
mod gemini;
mod omp;
mod opencode;
mod plugin;
mod sh;

pub use claude::*;

const MARKER: &str = "# lpm-hook";

/// An agent CLI lpm installs status hooks for.
struct Agent {
    kind: AgentKind,
    /// Writes lpm's hooks into this machine's settings, when the agent is here.
    install: fn(),
    /// The same on an SSH host. False leaves the host to be tried again: it was
    /// unreachable, or the agent isn't installed there yet.
    install_remote: fn(&dyn crate::remoteshell::RemoteShell) -> bool,
    /// Strips lpm's entries, keeping the user's own.
    uninstall: fn() -> Result<(), String>,
}

static AGENTS: [Agent; 6] = [
    claude::AGENT,
    codex::AGENT,
    gemini::AGENT,
    cursor::AGENT,
    opencode::AGENT,
    omp::AGENT,
];

/// Fired async at startup (app.go: `go a.installAgentHooks()`), and again from
/// [`refresh_agent_hooks`]. Writes only what changed.
pub fn install_agent_hooks() {
    LAST_INSTALL.store(crate::status::now_millis(), std::sync::atomic::Ordering::Relaxed);
    for agent in &AGENTS {
        (agent.install)();
    }
}

static LAST_INSTALL: std::sync::atomic::AtomicI64 = std::sync::atomic::AtomicI64::new(0);

/// Install the hooks again when a terminal opens, at most once a minute: an
/// agent installed, or first run, after lpm started had no hooks until lpm's
/// next launch. Off the caller's thread; a lesson recording leaves the user's
/// agent setup alone.
pub fn refresh_agent_hooks() {
    use std::sync::atomic::Ordering;
    let now = crate::status::now_millis();
    let last = LAST_INSTALL.load(Ordering::Relaxed);
    // 0: the startup install hasn't run yet and will (lib.rs), in order with the
    // status-line writes that share Claude's settings file.
    if last == 0 || now - last < 60_000 || crate::lesson::active() {
        return;
    }
    if LAST_INSTALL
        .compare_exchange(last, now, Ordering::Relaxed, Ordering::Relaxed)
        .is_ok()
    {
        std::thread::spawn(install_agent_hooks);
    }
}

/// App uninstall: restore the user's Claude status line, then strip the lpm
/// hooks from every agent's settings. Every step runs regardless of earlier
/// failures; the first error is returned for surfacing.
pub fn remove_agent_hooks_for_uninstall() -> Result<(), String> {
    let statusline = crate::claude_statusline::restore_for_uninstall();
    AGENTS
        .iter()
        .fold(statusline, |first, agent| first.and((agent.uninstall)()))
}

/// The hook and forwarder entries alone, leaving the user's chosen status line:
/// what the Windows uninstaller strips so no agent event runs a deleted exe.
#[cfg(windows)]
pub fn remove_agent_hook_entries() {
    crate::claude_statusline::remove_forwarders();
    for agent in &AGENTS {
        let _ = (agent.uninstall)();
    }
}

/// Remove the lpm-marked hook entries from a `{"hooks": {event: [entries]}}`
/// JSON document (the shape every agent's hook settings use), returning
/// Some(new bytes) only on change. User hooks and every other key are preserved.
fn strip_hooks_json(data: &[u8]) -> Option<Vec<u8>> {
    let mut settings = serde_json::from_slice::<Value>(data).ok()?;
    let original = settings.clone();
    let hooks = settings.get_mut("hooks")?.as_object_mut()?;
    strip_lpm_hooks(hooks);
    if settings == original {
        return None;
    }
    serde_json::to_string_pretty(&settings)
        .ok()
        .map(String::into_bytes)
}

fn strip_hooks_json_at(path: &Path) -> Result<(), String> {
    let Ok(data) = std::fs::read(path) else {
        return Ok(()); // no file -> nothing to strip
    };
    if let Some(out) = strip_hooks_json(&data) {
        crate::fsatomic::write(path, &out, crate::fsatomic::Mode::Preserve(0o644))
            .map_err(|e| format!("cannot write {}: {e}", path.display()))?;
    }
    Ok(())
}

fn changed_json(settings: &Value, original: &Value) -> Option<Vec<u8>> {
    if settings == original {
        return None;
    }
    serde_json::to_string_pretty(settings)
        .ok()
        .map(String::into_bytes)
}

fn has_marker(hooks: &Value) -> bool {
    serde_json::to_string(hooks)
        .map(|s| s.contains(MARKER))
        .unwrap_or(false)
}

/// Remove lpm-installed hook entries (command carries MARKER), keeping the user's own.
fn strip_lpm_hooks(hooks: &mut Map<String, Value>) {
    let events: Vec<String> = hooks.keys().cloned().collect();
    for ev in events {
        let Some(arr) = hooks.get_mut(&ev).and_then(Value::as_array_mut) else {
            continue;
        };
        arr.retain(|entry| !has_marker(entry));
        if arr.is_empty() {
            hooks.remove(&ev);
        }
    }
}

/// Append `entry` to hooks[event], creating/overwriting a non-array with [entry].
fn append_hook(hooks: &mut Map<String, Value>, event: &str, entry: Value) {
    match hooks.get_mut(event).and_then(Value::as_array_mut) {
        Some(arr) => arr.push(entry),
        None => {
            hooks.insert(event.to_string(), Value::Array(vec![entry]));
        }
    }
}

/// Pure: a `{"hooks": {event: [entries]}}` document with lpm's entry for each of
/// `events` in place of any earlier ones, or None when unchanged. Empty input
/// starts the document, which `prepare` can add the agent's own keys to;
/// anything that isn't a JSON object (agents that also read comments, which
/// serde can't keep) is left alone.
fn merge_hooks_json(
    data: &[u8],
    events: &[&str],
    prepare: impl FnOnce(&mut Map<String, Value>),
    entry: impl Fn(&str) -> Value,
) -> Option<Vec<u8>> {
    let mut settings = if data.iter().all(u8::is_ascii_whitespace) {
        json!({})
    } else {
        serde_json::from_slice::<Value>(data).ok()?
    };
    let original = serde_json::from_slice::<Value>(data).unwrap_or(Value::Null);
    let obj = settings.as_object_mut()?;
    prepare(obj);
    if !obj.get("hooks").is_some_and(Value::is_object) {
        obj.insert("hooks".into(), json!({}));
    }
    let hooks = obj.get_mut("hooks")?.as_object_mut()?;
    strip_lpm_hooks(hooks);
    for event in events {
        append_hook(hooks, event, entry(event));
    }
    changed_json(&settings, &original)
}

/// Merge lpm's hooks into a JSON settings file with `merge`, writing only on
/// change. A missing file is started from nothing when its folder exists — the
/// agent is installed but hasn't written it yet; without the folder the agent
/// isn't here, and nothing is created.
fn install_json_at(path: &Path, merge: impl Fn(&[u8]) -> Option<Vec<u8>>) -> Result<(), String> {
    let data = match std::fs::read(path) {
        Ok(data) => data,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound && path.parent().is_some_and(Path::is_dir) => {
            Vec::new()
        }
        Err(_) => return Ok(()),
    };
    if let Some(out) = merge(&data) {
        crate::fsatomic::write(path, &out, crate::fsatomic::Mode::Preserve(0o644))
            .map_err(|e| format!("cannot write {}: {e}", path.display()))?;
    }
    Ok(())
}

/// `install_json_at` on an SSH host, for the paths its login shell expands
/// (`dir_expr`, `file_expr`, quoted). Whether the host is now installed: a host
/// without the agent's folder is not (the agent may arrive later), and neither
/// is one unreachable, whose file couldn't be read, or holds something other
/// than JSON — which is never overwritten.
fn install_remote_json(
    ssh: &dyn crate::remoteshell::RemoteShell,
    dir_expr: &str,
    file_expr: &str,
    merge: fn(&[u8]) -> Option<Vec<u8>>,
) -> bool {
    let Some(data) = read_remote_agent_file(ssh, dir_expr, file_expr) else {
        return false;
    };
    if !data.iter().all(u8::is_ascii_whitespace) && serde_json::from_slice::<Value>(&data).is_err() {
        return false;
    }
    match merge(&data) {
        Some(merged) => write_remote_file(ssh, file_expr, &merged),
        None => true,
    }
}

/// A host's copy of an agent file (empty when there is none yet), or None when
/// the host is unreachable or the agent's folder isn't there.
fn read_remote_agent_file(ssh: &dyn crate::remoteshell::RemoteShell, dir_expr: &str, file_expr: &str) -> Option<Vec<u8>> {
    let script = format!("[ -d {dir_expr} ] || exit 3; if [ -e {file_expr} ]; then cat {file_expr}; fi");
    let out = ssh.login_script(&script).output().ok()?;
    out.status.success().then_some(out.stdout)
}

/// Write a file lpm owns outright (its `content` carries MARKER) once the
/// agent's folder exists, creating the folders between. Writes only on change.
fn install_owned_file(agent_dir: &Path, path: &Path, content: &str) -> Result<(), String> {
    if !agent_dir.is_dir() || std::fs::read(path).is_ok_and(|old| old == content.as_bytes()) {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("cannot create {}: {e}", parent.display()))?;
    }
    crate::fsatomic::write(path, content.as_bytes(), crate::fsatomic::Mode::Preserve(0o644))
        .map_err(|e| format!("cannot write {}: {e}", path.display()))
}

/// Delete a file `install_owned_file` wrote, never one without the marker.
fn remove_owned_file(path: &Path) -> Result<(), String> {
    match std::fs::read_to_string(path) {
        Ok(text) if text.contains(MARKER) => {
            std::fs::remove_file(path).map_err(|e| format!("cannot remove {}: {e}", path.display()))
        }
        _ => Ok(()),
    }
}

/// `install_owned_file` on an SSH host. Whether the host now has the file: not
/// when it is unreachable or the agent's folder isn't there yet.
fn install_remote_owned_file(ssh: &dyn crate::remoteshell::RemoteShell, dir_expr: &str, file_expr: &str, content: &str) -> bool {
    match read_remote_agent_file(ssh, dir_expr, file_expr) {
        Some(current) if current == content.as_bytes() => true,
        Some(_) => write_remote_file(ssh, file_expr, content.as_bytes()),
        None => false,
    }
}

/// Overwrite a remote file atomically (temp + rename) with `bytes` piped over
/// stdin, creating the parent directory first. `path_expr` is a shell expression
/// the remote login shell expands — callers pass it quoted, e.g.
/// `"$HOME/.claude/settings.json"`. The byte-count check keeps a connection
/// dropped mid-pipe from renaming a truncated temp file over the real one.
/// Returns whether the remote write succeeded.
pub fn write_remote_file(ssh: &dyn crate::remoteshell::RemoteShell, path_expr: &str, bytes: &[u8]) -> bool {
    let script = format!(
        "mkdir -p \"$(dirname {path_expr})\" && t={path_expr}.lpmtmp && cat > \"$t\" && [ \"$(wc -c < \"$t\")\" -eq {} ] && mv -f \"$t\" {path_expr}",
        bytes.len()
    );
    let child = ssh
        .login_script(&script)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn();
    let Ok(mut child) = child else { return false };
    if let Some(mut stdin) = child.stdin.take() {
        use std::io::Write;
        let _ = stdin.write_all(bytes); // stdin drops here -> EOF so `cat` finishes
    }
    child.wait().map(|s| s.success()).unwrap_or(false)
}

#[derive(Default)]
struct HookInstallState {
    /// `<agent>:<host>` for each agent whose hooks a host has.
    done: std::collections::HashSet<String>,
    in_flight: std::collections::HashSet<String>,
    tried: std::collections::HashMap<String, std::time::Instant>,
}

/// How long an unfinished remote install waits before a new terminal retries it.
const REMOTE_RETRY: std::time::Duration = std::time::Duration::from_secs(300);

fn hook_install_state() -> &'static std::sync::Mutex<HookInstallState> {
    static STATE: std::sync::OnceLock<std::sync::Mutex<HookInstallState>> =
        std::sync::OnceLock::new();
    STATE.get_or_init(Default::default)
}

fn done_key(agent: &Agent, host: &str) -> String {
    format!("{}:{host}", agent.kind.id())
}

/// Install the remote agent hooks per host per app run (best-effort,
/// off-thread). Called on every remote terminal spawn: an agent is recorded for
/// a host only after its install succeeds, so one that didn't finish — the host
/// briefly unreachable, or the agent not installed there yet — is retried by a
/// later spawn, at most every [`REMOTE_RETRY`], without redoing the agents that
/// are done. An in-flight guard keeps concurrent spawns from running two
/// installs for one host at once.
pub fn install_remote_agent_hooks_once(ssh: &crate::config::SshSettings) {
    let host = format!("{}@{}:{}", ssh.user, ssh.host, ssh.port);
    install_once(host, std::sync::Arc::new(ssh.clone()));
}

/// The same for a WSL distro, whose agents run in its own Linux home.
#[cfg(windows)]
pub fn install_wsl_agent_hooks_once(distro: &str) {
    let shell = crate::remoteshell::Wsl(distro.to_string());
    install_once(format!("wsl:{distro}"), std::sync::Arc::new(shell));
}

fn install_once(host: String, shell: std::sync::Arc<dyn crate::remoteshell::RemoteShell>) {
    let pending: Vec<&'static Agent> = {
        let mut st = hook_install_state().lock().unwrap();
        let pending: Vec<_> = AGENTS
            .iter()
            .filter(|agent| !st.done.contains(&done_key(agent, &host)))
            .collect();
        let recent = st.tried.get(&host).is_some_and(|at| at.elapsed() < REMOTE_RETRY);
        if pending.is_empty() || recent || !st.in_flight.insert(host.clone()) {
            return; // installed, tried a moment ago, or an install is running
        }
        st.tried.insert(host.clone(), std::time::Instant::now());
        pending
    };
    std::thread::spawn(move || {
        let installed: Vec<String> = pending
            .into_iter()
            .filter(|agent| (agent.install_remote)(shell.as_ref()))
            .map(|agent| done_key(agent, &host))
            .collect();
        let mut st = hook_install_state().lock().unwrap();
        st.in_flight.remove(&host);
        st.done.extend(installed);
    });
}

#[cfg(test)]
pub(crate) mod test_support;

#[cfg(test)]
mod tests;

#[cfg(test)]
mod cli_tests;
