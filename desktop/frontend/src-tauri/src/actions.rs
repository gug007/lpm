// Action runners — port of desktop/actions.go (RunAction / RunActionBackground).
//
// One-shot (non-terminal) actions run as `/bin/sh -c <cmd>` in the action's cwd.
// RunAction streams combined stdout+stderr line-by-line via "action-output" and
// finishes with "action-done"; it returns immediately. RunActionBackground runs
// the same command synchronously and returns a trimmed error tail on failure.
// stderr is merged into stdout via dup2(1,2) so lines interleave in write order,
// matching Go's single os.Pipe.
use crate::{config, ports};
use serde::Serialize;
use std::collections::HashMap;
use std::io::BufRead;
use std::os::unix::process::{CommandExt, ExitStatusExt};
use std::process::{Command, ExitStatus, Stdio};
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone)]
struct ActionOutput {
    line: String,
}

#[derive(Serialize, Clone)]
struct ActionDone {
    success: bool,
    #[serde(skip_serializing_if = "String::is_empty")]
    error: String,
}

struct ActionPlan {
    cmd_str: String,
    cwd: String,
    port: i64,
    /// Ran after the action's process exits (e.g. push a sync-mode mirror).
    on_exit: Option<Box<dyn FnOnce() + Send>>,
}

/// resolveActionCommand: resolve the action, substitute {{key}} inputs, and build
/// the local script or the remote ssh command line.
fn resolve_action_command(
    app: &AppHandle,
    project: &str,
    action: &str,
    input_values: &HashMap<String, String>,
) -> Result<ActionPlan, String> {
    let mut a = config::resolve_action_full(project, action)
        .ok_or_else(|| format!("action {action:?} not found in project {project:?}"))?;

    // Literal {{key}} -> value. Tokens are disjoint, so sequential replace is
    // equivalent to Go's single-pass strings.Replacer. Keys are user tokens —
    // no case conversion.
    if !input_values.is_empty() {
        for (k, v) in input_values {
            a.cmd = a.cmd.replace(&format!("{{{{{k}}}}}"), v);
        }
    }

    let info = config::spawn_info(project)?;
    if info.is_remote {
        if a.mode == "sync" {
            // Pull the remote into the local cache, run the action there, push
            // back on exit. The watcher keeps mirroring edits in the meantime.
            let local = crate::sshsync::ensure_project_sync(app, project, &info.ssh)?;
            let sub = a.cwd.trim_start_matches('/'); // action cwd is project-relative
            let cwd = if sub.is_empty() {
                local
            } else {
                std::path::Path::new(&local).join(sub).to_string_lossy().into_owned()
            };
            let app2 = app.clone();
            let project2 = project.to_string();
            return Ok(ActionPlan {
                cmd_str: config::build_local_script(&a.env, &a.cmd),
                cwd,
                port: a.port,
                on_exit: Some(Box::new(move || crate::sshsync::push_after_action(&app2, &project2))),
            });
        }
        Ok(ActionPlan {
            cmd_str: config::ssh_command_line(&info.ssh, &a.cwd, &a.env, &a.cmd),
            cwd: info.root, // local cwd for the ssh client
            port: a.port,
            on_exit: None,
        })
    } else {
        Ok(ActionPlan {
            cmd_str: config::build_local_script(&a.env, &a.cmd),
            cwd: config::resolve_cwd(&info.root, &a.cwd),
            port: a.port,
            on_exit: None,
        })
    }
}

/// Route the child's stderr into its stdout pipe (Go points both at one writer).
fn merge_stderr_into_stdout(cmd: &mut Command) {
    unsafe {
        cmd.pre_exec(|| {
            if libc::dup2(1, 2) == -1 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
}

/// Go ProcessState.String(): "exit status N" / "signal: N".
fn exit_status_string(s: Option<ExitStatus>) -> String {
    match s {
        Some(st) if st.code().is_some() => format!("exit status {}", st.code().unwrap()),
        Some(st) if st.signal().is_some() => format!("signal: {}", st.signal().unwrap()),
        _ => "exit status 1".into(),
    }
}

#[tauri::command(async)]
pub fn run_action(
    app: AppHandle,
    project_name: String,
    action_name: String,
    input_values: HashMap<String, String>,
) -> Result<(), String> {
    let mut plan = resolve_action_command(&app, &project_name, &action_name, &input_values)?;
    ports::format_action_port(&action_name, plan.port)?; // pre-check; no spawn on conflict
    let on_exit = plan.on_exit.take();

    let mut cmd = Command::new("/bin/sh");
    cmd.arg("-c").arg(&plan.cmd_str).current_dir(&plan.cwd).stdout(Stdio::piped());
    merge_stderr_into_stdout(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let stdout = child.stdout.take().ok_or("failed to capture action output")?;

    let app2 = app.clone();
    std::thread::spawn(move || {
        // lines() drops the trailing '\n' and still yields a final newline-less
        // tail — matches Go bufio.Scanner default.
        for line in std::io::BufReader::new(stdout).lines() {
            match line {
                Ok(l) => {
                    let _ = app2.emit("action-output", ActionOutput { line: l });
                }
                Err(_) => break,
            }
        }
        let status = child.wait().ok();
        let success = status.map(|s| s.success()).unwrap_or(false);
        let error = if success { String::new() } else { exit_status_string(status) };
        let _ = app2.emit("action-done", ActionDone { success, error });
        if let Some(f) = on_exit {
            f(); // e.g. push the sync mirror back to the remote
        }
    });
    Ok(())
}

#[tauri::command(async)]
pub fn run_action_background(
    app: AppHandle,
    project_name: String,
    action_name: String,
    input_values: HashMap<String, String>,
) -> Result<(), String> {
    let mut plan = resolve_action_command(&app, &project_name, &action_name, &input_values)?;
    ports::format_action_port(&action_name, plan.port)?;
    let on_exit = plan.on_exit.take();

    let mut cmd = Command::new("/bin/sh");
    cmd.arg("-c").arg(&plan.cmd_str).current_dir(&plan.cwd);
    merge_stderr_into_stdout(&mut cmd); // out.stdout carries combined output
    let out = cmd.output().map_err(|e| e.to_string())?;
    if let Some(f) = on_exit {
        f(); // push the sync mirror regardless of exit status (matches Go)
    }
    if !out.status.success() {
        let run_err = exit_status_string(Some(out.status));
        let tail = config::trim_tail(&out.stdout, 500);
        return Err(if tail.is_empty() { run_err } else { format!("{run_err}: {tail}") });
    }
    Ok(())
}
