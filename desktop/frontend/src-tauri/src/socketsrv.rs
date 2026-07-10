// Unix-socket status server — port of desktop/socket.go.
//
// Agents inside panes (via installed Claude/Codex hooks) and the `lpm` CLI
// connect to ~/.lpm/lpm.sock and send shell-quoted text commands:
//   ping
//   set_status <project> <key> <value> [--icon=X] [--color=X] [--priority=N] [--pid=N] [--pane=X]
//   clear_status <project> <key>
//   list_status <project>
//   start_project <project> [--profile=X]
//   stop_project <project>
//   start_service <project> <service>
//   stop_service <project> <service>
//   restart_service <project> <service>
// Each line gets a single-line reply. set_status/clear_status mutate the
// StatusStore and emit "status-changed"; a Done/Waiting/Error transition also
// plays the configured native notification sound (sound.rs). The start/stop/
// service verbs delegate to `services::*` (the app stays the single owner of
// run-state, port forwards, and UI events) and reply OK / ERROR: <msg>.
// std::thread (no tokio), matching the pty/tmux house style.
use crate::status::{now_millis, StatusEntry, StatusStore};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::{UnixListener, UnixStream};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

/// Bind the socket and serve forever on a background thread. Failure is logged,
/// not fatal — the rest of the app still runs (badges just stay dark).
pub fn start(socket_path: String, store: Arc<StatusStore>, app: AppHandle) {
    let _ = std::fs::remove_file(&socket_path); // clear a stale socket from an unclean exit
    let listener = match UnixListener::bind(&socket_path) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("warning: failed to start status socket server: {e}");
            return;
        }
    };
    if let Err(e) = std::fs::set_permissions(&socket_path, std::fs::Permissions::from_mode(0o600)) {
        eprintln!("warning: failed to set socket permissions: {e}");
        let _ = std::fs::remove_file(&socket_path);
        return;
    }
    std::thread::spawn(move || {
        for conn in listener.incoming() {
            let Ok(stream) = conn else { continue };
            let (store, app) = (store.clone(), app.clone());
            std::thread::spawn(move || handle_client(stream, &store, &app));
        }
    });
}

fn handle_client(stream: UnixStream, store: &StatusStore, app: &AppHandle) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(30)));
    let Ok(mut writer) = stream.try_clone() else { return };
    let reader = BufReader::new(stream);
    for line in reader.lines() {
        let Ok(line) = line else { break };
        if line.is_empty() {
            continue;
        }
        let resp = process_command(&line, store, app);
        if writeln!(writer, "{resp}").is_err() {
            break;
        }
    }
}

fn process_command(line: &str, store: &StatusStore, app: &AppHandle) -> String {
    let parts = shell_split(line);
    if parts.is_empty() {
        return "ERROR: empty command".into();
    }
    let command = parts[0].to_lowercase();
    let args = &parts[1..];
    match command.as_str() {
        "ping" => "PONG".into(),
        "set_status" => cmd_set_status(args, store, app),
        "clear_status" => cmd_clear_status(args, store, app),
        "list_status" => cmd_list_status(args, store),
        "start_project" => cmd_start_project(args, app),
        "stop_project" => cmd_stop_project(args, app),
        "start_service" => cmd_set_service(args, app, true),
        "stop_service" => cmd_set_service(args, app, false),
        "restart_service" => cmd_restart_service(args, app),
        _ => "ERROR: unknown command".into(),
    }
}

/// `OK` on success, `ERROR: <msg>` otherwise. Shared reply shape for the control
/// verbs so failures pass the underlying `services::*` text straight through.
fn reply(r: Result<(), String>) -> String {
    match r {
        Ok(()) => "OK".into(),
        Err(e) => format!("ERROR: {e}"),
    }
}

fn cmd_start_project(args: &[String], app: &AppHandle) -> String {
    let (positional, options) = parse_options(args);
    if positional.is_empty() {
        return "ERROR: usage: start_project <project> [--profile=X]".into();
    }
    let profile = options.get("profile").cloned().unwrap_or_default();
    reply(crate::services::start_project(
        app.clone(),
        app.state::<crate::services::ServiceState>(),
        positional[0].clone(),
        profile,
    ))
}

fn cmd_stop_project(args: &[String], app: &AppHandle) -> String {
    let (positional, _) = parse_options(args);
    if positional.is_empty() {
        return "ERROR: usage: stop_project <project>".into();
    }
    let project = &positional[0];
    // Idempotent: a project whose session is already gone is treated as stopped,
    // since `do_stop_project` would otherwise error on the missing tmux session.
    match crate::config::spawn_info(project) {
        Ok(info) if !crate::tmux::session_exists(&info.session) => return "OK".into(),
        Err(e) => return format!("ERROR: {e}"),
        _ => {}
    }
    reply(crate::services::stop_project_internal(
        app,
        &app.state::<crate::services::ServiceState>(),
        project,
    ))
}

fn cmd_set_service(args: &[String], app: &AppHandle, on: bool) -> String {
    let (positional, _) = parse_options(args);
    if positional.len() < 2 {
        let verb = if on { "start_service" } else { "stop_service" };
        return format!("ERROR: usage: {verb} <project> <service>");
    }
    reply(crate::services::set_service_running(
        app,
        &app.state::<crate::services::ServiceState>(),
        &positional[0],
        &positional[1],
        on,
    ))
}

fn cmd_restart_service(args: &[String], app: &AppHandle) -> String {
    let (positional, _) = parse_options(args);
    if positional.len() < 2 {
        return "ERROR: usage: restart_service <project> <service>".into();
    }
    reply(crate::services::restart_service_by_name(
        &app.state::<crate::services::ServiceState>(),
        &positional[0],
        &positional[1],
    ))
}

fn cmd_set_status(args: &[String], store: &StatusStore, app: &AppHandle) -> String {
    let (positional, options) = parse_options(args);
    if positional.len() < 3 {
        return "ERROR: usage: set_status <project> <key> <value> [--icon=X] [--color=X] [--priority=N] [--pid=N]".into();
    }
    let project = &positional[0];
    let value = positional[2].clone();
    let entry = StatusEntry {
        key: positional[1].clone(),
        value: value.clone(),
        icon: options.get("icon").cloned().unwrap_or_default(),
        color: options.get("color").cloned().unwrap_or_default(),
        priority: options.get("priority").and_then(|p| p.parse().ok()).unwrap_or(0),
        timestamp: now_millis(),
        agent_pid: options.get("pid").and_then(|p| p.parse().ok()).unwrap_or(0),
        pane_id: options.get("pane").cloned().unwrap_or_default(),
    };
    if store.set(project, entry) {
        let _ = app.emit("status-changed", project);
        crate::sound::play_status_sound(&value);
    }
    "OK".into()
}

fn cmd_clear_status(args: &[String], store: &StatusStore, app: &AppHandle) -> String {
    let (positional, _) = parse_options(args);
    if positional.len() < 2 {
        return "ERROR: usage: clear_status <project> <key>".into();
    }
    if store.clear(&positional[0], &positional[1]) {
        let _ = app.emit("status-changed", &positional[0]);
    }
    "OK".into()
}

fn cmd_list_status(args: &[String], store: &StatusStore) -> String {
    let (positional, _) = parse_options(args);
    if positional.is_empty() {
        return "ERROR: usage: list_status <project>".into();
    }
    match serde_json::to_string(&store.list(&positional[0])) {
        Ok(s) => s,
        Err(e) => format!("ERROR: {e}"),
    }
}

/// Splits on unquoted spaces, honoring '…' and "…" spans (quotes deleted, no
/// escapes; unbalanced quotes run to end-of-line). Mirrors socket.go shellSplit.
fn shell_split(s: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut current = String::new();
    let (mut in_single, mut in_double) = (false, false);
    for r in s.chars() {
        if r == '\'' && !in_double {
            in_single = !in_single;
        } else if r == '"' && !in_single {
            in_double = !in_double;
        } else if r == ' ' && !in_single && !in_double {
            if !current.is_empty() {
                parts.push(std::mem::take(&mut current));
            }
        } else {
            current.push(r);
        }
    }
    if !current.is_empty() {
        parts.push(current);
    }
    parts
}

/// Handles --key=value and --key value forms; everything else is positional
/// (order preserved). Mirrors socket.go parseOptions.
fn parse_options(args: &[String]) -> (Vec<String>, HashMap<String, String>) {
    let mut positional = Vec::new();
    let mut options = HashMap::new();
    let mut i = 0;
    while i < args.len() {
        let arg = &args[i];
        if let Some(key) = arg.strip_prefix("--") {
            if let Some(idx) = key.find('=') {
                options.insert(key[..idx].to_string(), key[idx + 1..].to_string());
            } else if i + 1 < args.len() && !args[i + 1].starts_with("--") {
                options.insert(key.to_string(), args[i + 1].clone());
                i += 1;
            } else {
                options.insert(key.to_string(), String::new());
            }
        } else {
            positional.push(arg.clone());
        }
        i += 1;
    }
    (positional, options)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shell_split_quotes() {
        assert_eq!(shell_split("set_status 'a b' k Running"), ["set_status", "a b", "k", "Running"]);
        assert_eq!(shell_split(r#"x "y z" w"#), ["x", "y z", "w"]);
        assert_eq!(shell_split("   "), Vec::<String>::new());
    }

    #[test]
    fn parse_options_forms() {
        let a: Vec<String> = ["p", "k", "Running", "--icon=bolt", "--color", "#fff", "--pane=p-1"]
            .iter().map(|s| s.to_string()).collect();
        let (pos, opts) = parse_options(&a);
        assert_eq!(pos, ["p", "k", "Running"]);
        assert_eq!(opts.get("icon").unwrap(), "bolt");
        assert_eq!(opts.get("color").unwrap(), "#fff");
        assert_eq!(opts.get("pane").unwrap(), "p-1");
    }

    #[test]
    fn flag_without_value_is_empty() {
        let a: Vec<String> = ["--color", "--pane=x"].iter().map(|s| s.to_string()).collect();
        let (_, opts) = parse_options(&a);
        assert_eq!(opts.get("color").unwrap(), "");
        assert_eq!(opts.get("pane").unwrap(), "x");
    }

    #[test]
    fn start_project_parses_profile_flag() {
        let a: Vec<String> = ["myproj", "--profile=staging"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        let (pos, opts) = parse_options(&a);
        assert_eq!(pos, ["myproj"]);
        assert_eq!(opts.get("profile").unwrap(), "staging");
    }
}
