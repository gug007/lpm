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
//   duplicate_project|duplicate_worktree <project> [--count=N] [--group=NAME]
//                     [--exclude-uncommitted=BOOL] [--reinstall-deps=BOOL]
//                     [--pull-latest=BOOL] [--run-action=X | --run-command=X]
//                     [--prompt=TEXT]
//   remove_project <project>
//   run_task <project> [--action=X | --command=X] [--prompt=TEXT]
//   set_resume <project> <pane_id> <session_id>
//   list_jobs <project>
//   run_job <project> <job_id>
// Each line gets a single-line reply, EXCEPT the duplicate verbs, which stream
// zero or more `PROGRESS <done> <total> <copy-name>` lines and then a final JSON
// line (`{"ok":true,"names":[...]}` / `{"ok":false,"error":...}`) — cloning N
// copies can take minutes. set_status/clear_status mutate the StatusStore and
// emit "status-changed"; a Done/Waiting/Error transition also plays the
// configured native notification sound (sound.rs). The start/stop/service verbs
// delegate to `services::*` and duplicate/remove/run to `projects_crud::*` +
// `remote-run-task` (the app stays the single owner of run-state, port forwards,
// and UI events) and reply OK / ERROR: <msg>. std::thread (no tokio), matching
// the pty/tmux house style.
use crate::status::{now_millis, StatusEntry, StatusStore};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::{UnixListener, UnixStream};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

/// Bind the socket and serve forever on a background thread. Failure is logged,
/// not fatal — the rest of the app still runs (badges just stay dark). When
/// `restricted`, only the status verbs are served (the socket a remote SSH host
/// reaches over `ssh -R`); every control verb is refused so a remote host can
/// never drive the Mac.
pub fn start(socket_path: String, store: Arc<StatusStore>, app: AppHandle, restricted: bool) {
    // Probe before stealing: `remove_file` can't tell a stale socket (unclean
    // exit) from a live one owned by another lpm instance. Only a definitive
    // PONG proves an owner is alive — decline in that case so first-wins is
    // deterministic and the owner keeps working. A probe that connects but never
    // answers (wedged peer) is treated as not-alive so a hung socket can't stall
    // startup; we proceed to steal it.
    if socket_is_live(&socket_path) {
        eprintln!(
            "warning: another lpm instance already owns {socket_path}; this instance will not receive agent status on it"
        );
        return;
    }
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
            std::thread::spawn(move || handle_client(stream, &store, &app, restricted));
        }
    });
}

/// Probe an existing socket path: connect, send `ping\n`, read one line, and
/// return `true` only on an exact `PONG` reply within a short timeout. A missing
/// file, connection refusal (stale socket / dead peer), or a read that times out
/// without a clean PONG all return `false`, so only a definitively-alive owner
/// blocks us from binding.
fn socket_is_live(path: &str) -> bool {
    let timeout = Duration::from_millis(400);
    let Ok(mut stream) = UnixStream::connect(path) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(timeout));
    let _ = stream.set_write_timeout(Some(timeout));
    if stream.write_all(b"ping\n").is_err() {
        return false;
    }
    let mut reply = String::new();
    if BufReader::new(stream).read_line(&mut reply).is_err() {
        return false;
    }
    reply.trim_end() == "PONG"
}

/// Verbs a remote host is allowed to send on the restricted socket: status and
/// session-id reporting only, never project control. set_resume is safe here
/// because parse_resume_args rejects any session id that isn't a plain token —
/// the id ends up inside a command typed into a terminal, so a hostile host
/// must not be able to smuggle shell text through it.
fn remote_allowed(command: &str) -> bool {
    matches!(
        command,
        "ping" | "set_status" | "clear_status" | "list_status" | "set_resume"
    )
}

fn handle_client(stream: UnixStream, store: &StatusStore, app: &AppHandle, restricted: bool) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(30)));
    let Ok(mut writer) = stream.try_clone() else {
        return;
    };
    let reader = BufReader::new(stream);
    for line in reader.lines() {
        let Ok(line) = line else { break };
        if line.is_empty() {
            continue;
        }
        // Duplicate commands stream their own PROGRESS lines + final JSON; every
        // other verb maps one request line to exactly one reply line.
        let first = shell_split(&line)
            .into_iter()
            .next()
            .unwrap_or_default()
            .to_lowercase();
        let write_result = if restricted && !remote_allowed(&first) {
            writeln!(writer, "ERROR: not allowed on remote socket")
        } else if first == "duplicate_project" || first == "duplicate_worktree" {
            cmd_duplicate_project(&line, app, &mut writer, first == "duplicate_worktree")
        } else {
            writeln!(writer, "{}", process_command(&line, store, app))
        };
        if write_result.is_err() {
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
        "config_get" => cmd_config_get(args),
        "config_apply" => cmd_config_apply(args, app),
        "remove_project" => cmd_remove_project(args, app),
        "run_task" => cmd_run_task(args, app),
        "set_resume" => cmd_set_resume(args, app),
        "agent_limits" => cmd_agent_limits(args, app),
        "list_jobs" => cmd_list_jobs(args),
        "list_all_jobs" => cmd_list_all_jobs(),
        "run_job" => cmd_run_job(args, app),
        "stop_job" => cmd_stop_job(args),
        "set_job_enabled" => cmd_set_job_enabled(args),
        "job_history" => cmd_job_history(args),
        "job_live_output" => cmd_job_live_output(args),
        "send_job_followup" => cmd_send_job_followup(args, app),
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

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConfigGetPayload {
    layer: String,
    #[serde(default)]
    project: String,
    #[serde(default)]
    template: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConfigApplyPayload {
    layer: String,
    #[serde(default)]
    project: String,
    #[serde(default)]
    template: String,
    expected_revision: String,
    content: String,
}

fn decode_config_payload<T: serde::de::DeserializeOwned>(args: &[String]) -> Result<T, String> {
    let (_, options) = parse_options(args);
    let encoded = options
        .get("payload-hex")
        .ok_or_else(|| "missing --payload-hex".to_string())?;
    let payload = hex_decode(encoded).ok_or_else(|| "invalid payload encoding".to_string())?;
    serde_json::from_str(&payload).map_err(|e| format!("invalid config payload: {e}"))
}

fn config_error(error: String) -> String {
    let code = if error.starts_with("revision conflict:") {
        "revision_conflict"
    } else if error.starts_with("invalid YAML:") {
        "invalid_yaml"
    } else {
        "config_error"
    };
    serde_json::json!({ "ok": false, "code": code, "error": error }).to_string()
}

fn cmd_config_get(args: &[String]) -> String {
    let payload = match decode_config_payload::<ConfigGetPayload>(args) {
        Ok(payload) => payload,
        Err(error) => return config_error(error),
    };
    match crate::config_cmds::config_snapshot(&payload.project, &payload.layer, &payload.template) {
        Ok(snapshot) => serde_json::json!({ "ok": true, "snapshot": snapshot }).to_string(),
        Err(error) => config_error(error),
    }
}

fn cmd_config_apply(args: &[String], app: &AppHandle) -> String {
    let payload = match decode_config_payload::<ConfigApplyPayload>(args) {
        Ok(payload) => payload,
        Err(error) => return config_error(error),
    };
    match crate::config_cmds::apply_config_candidate(
        app,
        &payload.project,
        &payload.layer,
        &payload.template,
        &payload.expected_revision,
        &payload.content,
    ) {
        Ok(snapshot) => serde_json::json!({ "ok": true, "snapshot": snapshot }).to_string(),
        Err(error) => config_error(error),
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

/// Resolve a boolean socket option: an explicit `true`/`false` wins, anything
/// else (absent or unparseable) falls back to the persisted-settings default.
fn bool_opt(options: &HashMap<String, String>, key: &str, default: bool) -> bool {
    match options.get(key).map(String::as_str) {
        Some("true") => true,
        Some("false") => false,
        _ => default,
    }
}

/// Streaming duplicate: clone N copies one at a time (each a disk clone), write a
/// `PROGRESS <done> <total> <name>` line per copy, then a final JSON line.
/// Mirrors the `remote.rs` "duplicate" handler exactly (stop at first failure,
/// keep copies made, optional group + run-task relay). Returns the last write's
/// result so `handle_client` can drop a dead connection like the other verbs.
fn cmd_duplicate_project(
    line: &str,
    app: &AppHandle,
    w: &mut impl Write,
    worktree: bool,
) -> std::io::Result<()> {
    let parts = shell_split(line);
    let (positional, options) = parse_options(&parts[1..]);
    let Some(name) = positional.first().cloned() else {
        let command = if worktree {
            "duplicate_worktree"
        } else {
            "duplicate_project"
        };
        let error = format!("usage: {command} <project> [--count=N] ...");
        return writeln!(
            w,
            "{}",
            serde_json::json!({ "ok": false, "error": error })
        );
    };
    let count = options
        .get("count")
        .and_then(|c| c.parse::<u64>().ok())
        .unwrap_or(1)
        .clamp(1, 50) as u32;

    let settings = crate::config::load_settings();
    let sb = |k: &str, d: bool| {
        settings
            .get(k)
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(d)
    };
    let exclude_uncommitted = bool_opt(
        &options,
        "exclude-uncommitted",
        sb("duplicateExcludeUncommitted", false),
    );
    let reinstall_deps = bool_opt(
        &options,
        "reinstall-deps",
        sb("duplicateReinstallDeps", false),
    );
    let pull_latest = bool_opt(&options, "pull-latest", sb("duplicatePullLatest", true));

    let group_name = options.get("group").cloned().unwrap_or_default();
    let labels: Vec<String> = options
        .get("labels")
        .and_then(|value| serde_json::from_str(value).ok())
        .unwrap_or_default();
    let run_action = options.get("run-action").cloned().filter(|s| !s.is_empty());
    let run_command = options
        .get("run-command")
        .cloned()
        .filter(|s| !s.is_empty());
    let prompt = options
        .get("prompt")
        .cloned()
        .filter(|p| !p.trim().is_empty());

    let mut created: Vec<String> = Vec::new();
    let mut err: Option<String> = None;
    for i in 0..count as usize {
        let label = labels
            .get(i)
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let result = if worktree {
            crate::projects_crud::duplicate_worktree_project(
                app.clone(),
                name.clone(),
                label,
                reinstall_deps,
            )
        } else {
            crate::projects_crud::duplicate_project(
                app.clone(),
                name.clone(),
                label,
                exclude_uncommitted,
                reinstall_deps,
                pull_latest,
            )
        };
        match result {
            Ok(n) => {
                created.push(n.clone());
                writeln!(w, "PROGRESS {} {} {}", created.len(), count, n)?;
                w.flush()?;
            }
            Err(e) => {
                err = Some(e);
                break;
            }
        }
    }

    if created.is_empty() {
        let msg = err.unwrap_or_else(|| "Couldn't duplicate the project.".into());
        return writeln!(w, "{}", serde_json::json!({ "ok": false, "error": msg }));
    }

    if !group_name.trim().is_empty() {
        let _ = crate::remote::group_copies_into_folder(&name, group_name.trim(), &created);
        let _ = app.emit("projects-changed", ());
    }

    let mut warning: Option<String> = None;
    let run_task = if run_action.is_some() {
        Some(serde_json::json!({ "kind": "action", "actionName": run_action, "prompt": prompt }))
    } else if run_command.is_some() {
        Some(serde_json::json!({ "kind": "command", "command": run_command, "prompt": prompt }))
    } else {
        None
    };
    if let Some(task) = run_task {
        if app.get_webview_window("main").is_some() {
            // Select the first copy so its ProjectDetail mounts and the queued
            // action actually fires — otherwise the task sits queued until the
            // user clicks the copy (unlike the in-app duplicate, which selects).
            for (i, copy) in created.iter().enumerate() {
                let _ = app.emit(
                    "remote-run-task",
                    serde_json::json!({ "project": copy, "task": task, "select": i == 0 }),
                );
            }
        } else {
            warning = Some(
                "Copies created, but open the lpm app on your Mac to run the task on them."
                    .to_string(),
            );
        }
    }
    if let Some(e) = err {
        warning = Some(format!("Stopped after {} — {}", created.len(), e));
    }

    let mut reply = serde_json::json!({ "ok": true, "names": created });
    if let Some(wn) = warning {
        reply["warning"] = serde_json::json!(wn);
    }
    writeln!(w, "{reply}")
}

fn cmd_remove_project(args: &[String], app: &AppHandle) -> String {
    let (positional, _) = parse_options(args);
    if positional.is_empty() {
        return "ERROR: usage: remove_project <project>".into();
    }
    reply(crate::projects_crud::remove_project(
        app.clone(),
        positional[0].clone(),
    ))
}

fn cmd_run_task(args: &[String], app: &AppHandle) -> String {
    let (positional, options) = parse_options(args);
    if positional.is_empty() {
        return "ERROR: usage: run_task <project> [--action=X | --command=X] [--prompt=TEXT]"
            .into();
    }
    let action = options.get("action").cloned().filter(|s| !s.is_empty());
    let command = options.get("command").cloned().filter(|s| !s.is_empty());
    let prompt = options
        .get("prompt")
        .cloned()
        .filter(|p| !p.trim().is_empty());
    let task = match (action, command) {
        (Some(_), Some(_)) => {
            return "ERROR: run_task takes exactly one of --action / --command".into()
        }
        (None, None) => return "ERROR: run_task needs --action=X or --command=X".into(),
        (Some(a), None) => {
            serde_json::json!({ "kind": "action", "actionName": a, "prompt": prompt })
        }
        (None, Some(c)) => serde_json::json!({ "kind": "command", "command": c, "prompt": prompt }),
    };
    if app.get_webview_window("main").is_none() {
        return "ERROR: open the lpm app to run actions".into();
    }
    let _ = app.emit(
        "remote-run-task",
        serde_json::json!({ "project": positional[0], "task": task }),
    );
    "OK".into()
}

/// Codex's SessionStart hook reports the real session id here (Codex has no
/// launch-time session id). Validated separately from the emit so the parsing
/// path is testable without an AppHandle.
struct ResumeArgs {
    project: String,
    pane_id: String,
    session_id: String,
}

fn parse_resume_args(args: &[String]) -> Result<ResumeArgs, String> {
    let (positional, _) = parse_options(args);
    if positional.len() < 3 {
        return Err("usage: set_resume <project> <pane> <session-id>".into());
    }
    // The session id is embedded in a resume command the app later types into a
    // terminal, and set_resume is reachable from remote hosts on the restricted
    // socket — only a plain token (Codex ids are UUIDs) may pass.
    if !valid_session_id(&positional[2]) {
        return Err("session id must be alphanumeric/-/_ (max 128 chars)".into());
    }
    Ok(ResumeArgs {
        project: positional[0].clone(),
        pane_id: positional[1].clone(),
        session_id: positional[2].clone(),
    })
}

fn valid_session_id(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 128
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// `agent_limits <account> --payload-b64=<base64 statusline JSON>` — the Claude
/// usage-limit forwarder reports here. Decodes into the AgentLimitsStore and
/// emits `agent-limits-changed` on a real change.
fn cmd_agent_limits(args: &[String], app: &AppHandle) -> String {
    let (positional, options) = parse_options(args);
    let store = app.state::<Arc<crate::agent_limits::AgentLimitsStore>>();
    crate::agent_limits::ingest_from_socket(
        app,
        &store,
        &positional,
        options.get("payload-b64").map(String::as_str),
    )
}

fn cmd_set_resume(args: &[String], app: &AppHandle) -> String {
    match parse_resume_args(args) {
        Ok(a) => {
            let _ = app.emit(
                "codex-session",
                serde_json::json!({
                    "project": a.project,
                    "paneId": a.pane_id,
                    "sessionId": a.session_id,
                }),
            );
            "OK".into()
        }
        Err(e) => format!("ERROR: {e}"),
    }
}

/// `list_jobs <project>` → one JSON line, the same array `list_jobs` returns to
/// the app (per-job id / schedule / enabled / last result / next run).
fn cmd_list_jobs(args: &[String]) -> String {
    let (positional, _) = parse_options(args);
    if positional.is_empty() {
        return "ERROR: usage: list_jobs <project>".into();
    }
    match crate::jobs::list_jobs(positional[0].clone()) {
        Ok(jobs) => serde_json::to_string(&jobs).unwrap_or_else(|e| format!("ERROR: {e}")),
        Err(e) => format!("ERROR: {e}"),
    }
}

/// `run_job <project> <job_id>` → fire a job immediately (same as the app's
/// "run now"), replying `{ok:true}` or `{ok:false,error}`. The run itself is
/// fire-and-forget on a worker thread; a job that finds work while no window is
/// open parks its task like the scheduler would.
fn cmd_run_job(args: &[String], app: &AppHandle) -> String {
    let (positional, _) = parse_options(args);
    if positional.len() < 2 {
        return serde_json::json!({ "ok": false, "error": "usage: run_job <project> <job_id>" })
            .to_string();
    }
    match crate::jobs::run_job_now(app.clone(), positional[0].clone(), positional[1].clone()) {
        Ok(()) => serde_json::json!({ "ok": true }).to_string(),
        Err(e) => serde_json::json!({ "ok": false, "error": e }).to_string(),
    }
}

fn cmd_list_all_jobs() -> String {
    match crate::jobs::list_all_jobs() {
        Ok(jobs) => serde_json::to_string(&jobs).unwrap_or_else(|e| format!("ERROR: {e}")),
        Err(e) => format!("ERROR: {e}"),
    }
}

fn job_result(r: Result<(), String>) -> String {
    match r {
        Ok(()) => serde_json::json!({ "ok": true }).to_string(),
        Err(e) => serde_json::json!({ "ok": false, "error": e }).to_string(),
    }
}

fn ensure_job_exists(project: &str, job_id: &str) -> Result<(), String> {
    if crate::jobs::list_jobs(project.to_string())?
        .iter()
        .any(|job| job.get("id").and_then(serde_json::Value::as_str) == Some(job_id))
    {
        Ok(())
    } else {
        Err("That automation doesn't exist.".into())
    }
}

fn cmd_stop_job(args: &[String]) -> String {
    let (positional, _) = parse_options(args);
    if positional.len() < 2 {
        return serde_json::json!({ "ok": false, "error": "usage: stop_job <project> <job_id>" })
            .to_string();
    }
    job_result(
        ensure_job_exists(&positional[0], &positional[1])
            .and_then(|_| crate::jobs::stop_job_run(positional[0].clone(), positional[1].clone())),
    )
}

fn cmd_set_job_enabled(args: &[String]) -> String {
    let (positional, _) = parse_options(args);
    if positional.len() < 3 {
        return serde_json::json!({ "ok": false, "error": "usage: set_job_enabled <project> <job_id> <true|false>" })
            .to_string();
    }
    let Ok(enabled) = positional[2].parse::<bool>() else {
        return serde_json::json!({ "ok": false, "error": "enabled must be true or false" })
            .to_string();
    };
    job_result(
        ensure_job_exists(&positional[0], &positional[1]).and_then(|_| {
            crate::jobs::set_job_enabled(positional[0].clone(), positional[1].clone(), enabled)
        }),
    )
}

fn cmd_job_history(args: &[String]) -> String {
    let (positional, _) = parse_options(args);
    if positional.len() < 2 {
        return "ERROR: usage: job_history <project> <job_id>".into();
    }
    if let Err(error) = ensure_job_exists(&positional[0], &positional[1]) {
        return format!("ERROR: {error}");
    }
    match crate::jobs::job_history(positional[0].clone(), positional[1].clone()) {
        Ok(history) => serde_json::to_string(&history).unwrap_or_else(|e| format!("ERROR: {e}")),
        Err(e) => format!("ERROR: {e}"),
    }
}

fn cmd_job_live_output(args: &[String]) -> String {
    let (positional, _) = parse_options(args);
    if positional.len() < 2 {
        return "ERROR: usage: job_live_output <project> <job_id>".into();
    }
    if let Err(error) = ensure_job_exists(&positional[0], &positional[1]) {
        return format!("ERROR: {error}");
    }
    match crate::jobs::job_live_output(positional[0].clone(), positional[1].clone()) {
        Ok(live) => serde_json::to_string(&live).unwrap_or_else(|e| format!("ERROR: {e}")),
        Err(e) => format!("ERROR: {e}"),
    }
}

fn cmd_send_job_followup(args: &[String], app: &AppHandle) -> String {
    let (positional, options) = parse_options(args);
    if positional.len() < 3 {
        return serde_json::json!({ "ok": false, "error": "usage: send_job_followup <project> <job_id> <at> <message> [--agent=X] [--model=X] [--effort=X]" })
            .to_string();
    }
    let Ok(at) = positional[2].parse::<u64>() else {
        return serde_json::json!({ "ok": false, "error": "at must be a unix timestamp" })
            .to_string();
    };
    let message = match options.get("message-hex") {
        Some(value) => match hex_decode(value) {
            Some(message) => message,
            None => {
                return serde_json::json!({ "ok": false, "error": "message-hex is invalid" })
                    .to_string()
            }
        },
        None => positional.get(3).cloned().unwrap_or_default(),
    };
    if let Err(error) = ensure_job_exists(&positional[0], &positional[1]) {
        return serde_json::json!({ "ok": false, "error": error }).to_string();
    }
    job_result(crate::jobs::send_job_followup(
        app.clone(),
        positional[0].clone(),
        positional[1].clone(),
        at,
        message,
        options.get("agent").cloned().unwrap_or_default(),
        options.get("model").cloned().unwrap_or_default(),
        options.get("effort").cloned().unwrap_or_default(),
    ))
}

fn hex_decode(value: &str) -> Option<String> {
    let encoded = value.as_bytes();
    if encoded.len() % 2 != 0 {
        return None;
    }
    let bytes: Option<Vec<_>> = encoded
        .chunks_exact(2)
        .map(|pair| {
            std::str::from_utf8(pair)
                .ok()
                .and_then(|pair| u8::from_str_radix(pair, 16).ok())
        })
        .collect();
    String::from_utf8(bytes?).ok()
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
        priority: options
            .get("priority")
            .and_then(|p| p.parse().ok())
            .unwrap_or(0),
        timestamp: now_millis(),
        agent_pid: options.get("pid").and_then(|p| p.parse().ok()).unwrap_or(0),
        pane_id: options.get("pane").cloned().unwrap_or_default(),
    };
    // Hook frames arrive async (backgrounded `nc`), so a Done/Error can land
    // after its pane was closed and cleaned up — drop those instead of storing
    // an entry nothing can ever clear.
    if !entry.pane_id.is_empty()
        && !crate::pty::session_exists(&app.state::<crate::pty::PtyState>(), &entry.pane_id)
    {
        return "OK".into();
    }
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
        assert_eq!(
            shell_split("set_status 'a b' k Running"),
            ["set_status", "a b", "k", "Running"]
        );
        assert_eq!(shell_split(r#"x "y z" w"#), ["x", "y z", "w"]);
        assert_eq!(shell_split("   "), Vec::<String>::new());
    }

    #[test]
    fn parse_options_forms() {
        let a: Vec<String> = [
            "p",
            "k",
            "Running",
            "--icon=bolt",
            "--color",
            "#fff",
            "--pane=p-1",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect();
        let (pos, opts) = parse_options(&a);
        assert_eq!(pos, ["p", "k", "Running"]);
        assert_eq!(opts.get("icon").unwrap(), "bolt");
        assert_eq!(opts.get("color").unwrap(), "#fff");
        assert_eq!(opts.get("pane").unwrap(), "p-1");
    }

    #[test]
    fn flag_without_value_is_empty() {
        let a: Vec<String> = ["--color", "--pane=x"]
            .iter()
            .map(|s| s.to_string())
            .collect();
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

    #[test]
    fn restricted_socket_allows_only_status_verbs() {
        for ok in [
            "ping",
            "set_status",
            "clear_status",
            "list_status",
            "set_resume",
        ] {
            assert!(
                remote_allowed(ok),
                "{ok} should be allowed on the remote socket"
            );
        }
        for bad in [
            "start_project",
            "stop_project",
            "start_service",
            "stop_service",
            "restart_service",
            "config_get",
            "config_apply",
            "remove_project",
            "run_task",
            "duplicate_project",
            "duplicate_worktree",
            "list_jobs",
            "list_all_jobs",
            "run_job",
            "stop_job",
            "set_job_enabled",
            "job_history",
            "job_live_output",
            "send_job_followup",
            "unknown",
        ] {
            assert!(
                !remote_allowed(bad),
                "{bad} must be refused on the remote socket"
            );
        }
    }

    #[test]
    fn set_resume_requires_three_positionals() {
        let mk = |a: &[&str]| a.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert!(parse_resume_args(&mk(&["proj", "pane-1"])).is_err());
        assert!(parse_resume_args(&mk(&["proj"])).is_err());
        let ok = parse_resume_args(&mk(&["proj", "pane-1", "sess-abc"])).unwrap();
        assert_eq!(ok.project, "proj");
        assert_eq!(ok.pane_id, "pane-1");
        assert_eq!(ok.session_id, "sess-abc");
    }

    #[test]
    fn set_resume_rejects_non_token_session_ids() {
        // The id lands inside a command later typed into a terminal, and remote
        // hosts can send set_resume — shell text must never pass.
        let mk = |a: &[&str]| a.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        for bad in [
            "a;rm -rf ~",
            "$(whoami)",
            "id`x`",
            "a b",
            "",
            &"x".repeat(129),
        ] {
            assert!(
                parse_resume_args(&mk(&["proj", "pane-1", bad])).is_err(),
                "{bad:?} must be rejected"
            );
        }
        assert!(valid_session_id("019820c4-2f9a-7a11-b4d2-0242ac120002"));
        assert!(valid_session_id("sess_ABC-123"));
    }

    #[test]
    fn bool_opt_prefers_explicit_then_default() {
        let mut o: HashMap<String, String> = HashMap::new();
        assert!(bool_opt(&o, "x", true)); // absent -> default true
        assert!(!bool_opt(&o, "x", false)); // absent -> default false
        o.insert("x".into(), "false".into());
        assert!(!bool_opt(&o, "x", true)); // explicit false beats default true
        o.insert("x".into(), "true".into());
        assert!(bool_opt(&o, "x", false)); // explicit true beats default false
        o.insert("x".into(), "garbage".into());
        assert!(bool_opt(&o, "x", true)); // unparseable -> default
    }

    #[test]
    fn duplicate_labels_preserve_order_and_apostrophes() {
        let parts =
            shell_split(r#"duplicate_project app --labels='["First copy","O\u0027Brien"]'"#);
        let (_, options) = parse_options(&parts[1..]);
        let labels: Vec<String> = serde_json::from_str(options.get("labels").unwrap()).unwrap();
        assert_eq!(labels, ["First copy", "O'Brien"]);
    }

    #[test]
    fn followup_hex_preserves_message_text() {
        assert_eq!(hex_decode("646f6e2774").as_deref(), Some("don't"));
        assert!(hex_decode("xyz").is_none());
    }

    #[test]
    fn config_payload_preserves_yaml_source() {
        let content = "actions:\n  review:\n    cmd: |\n      claude \"Review: {{prs}}\"\n";
        let payload = serde_json::json!({
            "layer": "repo",
            "project": "web",
            "expectedRevision": "abc",
            "content": content,
        })
        .to_string();
        let encoded = payload
            .as_bytes()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        let parsed =
            decode_config_payload::<ConfigApplyPayload>(&[format!("--payload-hex={encoded}")])
                .unwrap();
        assert_eq!(parsed.layer, "repo");
        assert_eq!(parsed.project, "web");
        assert_eq!(parsed.expected_revision, "abc");
        assert_eq!(parsed.content, content);
    }

    use std::sync::atomic::{AtomicU32, Ordering};

    /// A unique temp path (never ~/.lpm) so socket tests stay hermetic and can
    /// run in parallel without colliding.
    fn temp_sock_path(tag: &str) -> std::path::PathBuf {
        static N: AtomicU32 = AtomicU32::new(0);
        let n = N.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "lpm-socktest-{}-{}-{}.sock",
            std::process::id(),
            tag,
            n
        ))
    }

    /// Accept one connection and answer `PONG` to a `ping` line, mirroring the
    /// real `process_command` reply. `reply` gates whether we answer at all so a
    /// test can simulate a wedged peer that accepts but never responds.
    fn spawn_ping_server(path: std::path::PathBuf, reply: bool) -> std::thread::JoinHandle<()> {
        let listener = UnixListener::bind(&path).unwrap();
        std::thread::spawn(move || {
            if let Some(Ok(stream)) = listener.incoming().next() {
                if !reply {
                    // Hold the connection open briefly without replying so the
                    // prober's read timeout fires.
                    std::thread::sleep(Duration::from_millis(700));
                    return;
                }
                let mut w = stream.try_clone().unwrap();
                let mut line = String::new();
                let _ = BufReader::new(stream).read_line(&mut line);
                if line.trim_end() == "ping" {
                    let _ = writeln!(w, "PONG");
                }
            }
        })
    }

    #[test]
    fn socket_is_live_true_for_ponging_server() {
        let path = temp_sock_path("live");
        let handle = spawn_ping_server(path.clone(), true);
        assert!(socket_is_live(path.to_str().unwrap()));
        let _ = handle.join();
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn socket_is_live_false_for_missing_file() {
        let path = temp_sock_path("missing");
        assert!(!socket_is_live(path.to_str().unwrap()));
    }

    #[test]
    fn socket_is_live_false_for_dead_socket_file() {
        // Bind then drop the listener, leaving the file behind: connect() now
        // gets ECONNREFUSED, so the path looks stale, not live.
        let path = temp_sock_path("dead");
        {
            let _listener = UnixListener::bind(&path).unwrap();
        }
        assert!(!socket_is_live(path.to_str().unwrap()));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn socket_is_live_false_for_plain_file() {
        let path = temp_sock_path("plainfile");
        std::fs::write(&path, b"not a socket").unwrap();
        assert!(!socket_is_live(path.to_str().unwrap()));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn socket_is_live_false_when_peer_never_replies() {
        // A peer that accepts but stays silent must resolve to false within the
        // probe timeout — the whole test is guarded so it can't hang CI.
        let path = temp_sock_path("wedged");
        let handle = spawn_ping_server(path.clone(), false);
        let probe = {
            let p = path.clone();
            std::thread::spawn(move || socket_is_live(p.to_str().unwrap()))
        };
        let started = std::time::Instant::now();
        while !probe.is_finished() {
            assert!(
                started.elapsed() < Duration::from_secs(3),
                "socket_is_live hung on a silent peer"
            );
            std::thread::sleep(Duration::from_millis(20));
        }
        assert!(!probe.join().unwrap());
        let _ = handle.join();
        let _ = std::fs::remove_file(&path);
    }
}
