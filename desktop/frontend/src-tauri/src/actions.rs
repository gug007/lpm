// Action runners — port of desktop/actions.go (RunAction / RunActionBackground).
//
// One-shot (non-terminal) local actions run through the user's interactive login
// shell (`$SHELL -ilc`) in the action's cwd, so shell init (nvm, version
// managers, PATH tweaks) is loaded — matching the terminal and tmux service
// panes. A GUI launch otherwise inherits launchd's minimal PATH and would pick
// up the wrong toolchain. Remote actions keep `/bin/sh -c`: the ssh command line
// resolves its environment on the far side.
// RunAction streams combined stdout+stderr line-by-line via "action-output" and
// finishes with "action-done"; it returns immediately. RunActionBackground runs
// the same command synchronously, streaming lines via "action-bg-output" (keyed
// by run id) and returning a trimmed error tail on failure; each run registers
// under a caller-supplied run id so CancelActionBackground can reap its process
// tree mid-flight.
// stderr is merged into stdout via dup2(1,2) so lines interleave in write order,
// matching Go's single os.Pipe.
use crate::{config, ports, proctree};
use serde::Serialize;
use std::collections::HashMap;
use std::io::BufRead;
use std::os::unix::process::{CommandExt, ExitStatusExt};
use std::process::{Command, ExitStatus, Stdio};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

pub const CANCELLED_ERR: &str = "cancelled";

struct BackgroundRun {
    pid: i32,
    cancelled: bool,
}

static BACKGROUND_RUNS: OnceLock<Mutex<HashMap<String, BackgroundRun>>> = OnceLock::new();

fn background_runs() -> &'static Mutex<HashMap<String, BackgroundRun>> {
    BACKGROUND_RUNS.get_or_init(|| Mutex::new(HashMap::new()))
}

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

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ActionBgOutput {
    run_id: String,
    line: String,
}

struct ActionPlan {
    cmd_str: String,
    cwd: String,
    ports: Vec<i64>,
    /// Run the command through the user's interactive login shell (local actions),
    /// vs. plain `/bin/sh -c` (remote actions, where cmd_str is an ssh line).
    login_shell: bool,
    /// Claude account env decision for local actions (Inherit for remote). An
    /// explicit CLAUDE_CONFIG_DIR in the action's own env is inlined into cmd_str
    /// and still wins over this process env.
    claude_env: config::ClaudeEnv,
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
                ports: a.ports,
                login_shell: false,
                claude_env: config::ClaudeEnv::Inherit,
                on_exit: Some(Box::new(move || crate::sshsync::push_after_action(&app2, &project2))),
            });
        }
        Ok(ActionPlan {
            cmd_str: config::ssh_command_line(&info.ssh, &a.cwd, &a.env, &a.cmd),
            cwd: info.root, // local cwd for the ssh client
            ports: a.ports,
            login_shell: false,
            claude_env: config::ClaudeEnv::Inherit,
            on_exit: None,
        })
    } else {
        Ok(ActionPlan {
            cmd_str: config::build_local_script(&a.env, &a.cmd),
            cwd: config::resolve_cwd(&info.root, &a.cwd),
            ports: a.ports,
            login_shell: true,
            claude_env: config::claude_env_for_account(info.claude_account.as_deref()),
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

/// Build the child process for an action. Local actions run through the user's
/// interactive login shell so shell init (nvm, version managers, PATH) is loaded;
/// the cwd is set with an explicit `cd` so the user's rc can't redirect it.
/// Remote actions keep `/bin/sh -c` — cmd_str is an ssh line that resolves its
/// environment on the far side.
fn action_command(plan: &ActionPlan) -> Command {
    let mut cmd = if plan.login_shell {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        let script = format!("cd {} && {}", config::shell_quote(&plan.cwd), plan.cmd_str);
        let mut cmd = Command::new(shell);
        cmd.arg("-ilc").arg(script).current_dir(&plan.cwd);
        cmd
    } else {
        let mut cmd = Command::new("/bin/sh");
        cmd.arg("-c").arg(&plan.cmd_str).current_dir(&plan.cwd);
        cmd
    };
    plan.claude_env.apply(&mut cmd);
    cmd
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
    ports::format_action_port(&action_name, &plan.ports)?; // pre-check; no spawn on conflict
    let on_exit = plan.on_exit.take();

    let mut cmd = action_command(&plan);
    cmd.stdout(Stdio::piped());
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
    run_id: String,
) -> Result<(), String> {
    let mut plan = resolve_action_command(&app, &project_name, &action_name, &input_values)?;
    ports::format_action_port(&action_name, &plan.ports)?;
    let on_exit = plan.on_exit.take();

    let mut cmd = action_command(&plan);
    cmd.stdin(Stdio::null());
    cmd.stdout(Stdio::piped());
    merge_stderr_into_stdout(&mut cmd); // stdout carries combined output
    // New session: own group so a cancel can signal the whole tree without
    // touching us, and — unlike process_group(0) — no controlling terminal.
    // With one (app launched from a terminal, e.g. `tauri dev`) the interactive
    // login shell sees its group in the background and self-stops with SIGTTIN
    // before running the command; it opens /dev/tty directly, so a null stdin
    // alone doesn't prevent that.
    unsafe {
        cmd.pre_exec(|| {
            if libc::setsid() == -1 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let stdout = child.stdout.take().ok_or("failed to capture action output")?;
    background_runs()
        .lock()
        .unwrap()
        .insert(run_id.clone(), BackgroundRun { pid: child.id() as i32, cancelled: false });

    // Stream lines so the run toast can preview output live; keep a bounded
    // tail for the failure message.
    let mut tail: Vec<u8> = Vec::new();
    for line in std::io::BufReader::new(stdout).lines() {
        let Ok(l) = line else { break };
        tail.extend_from_slice(l.as_bytes());
        tail.push(b'\n');
        if tail.len() > 4096 {
            let cut = tail.len() - 2048;
            tail.drain(..cut);
        }
        let _ = app.emit("action-bg-output", ActionBgOutput { run_id: run_id.clone(), line: l });
    }
    let status = child.wait();
    let cancelled = background_runs()
        .lock()
        .unwrap()
        .remove(&run_id)
        .map(|r| r.cancelled)
        .unwrap_or(false);
    let status = status.map_err(|e| e.to_string())?;
    if let Some(f) = on_exit {
        f(); // push the sync mirror regardless of exit status (matches Go)
    }
    if cancelled {
        return Err(CANCELLED_ERR.into());
    }
    if !status.success() {
        let run_err = exit_status_string(Some(status));
        let tail = config::trim_tail(&tail, 500);
        return Err(if tail.is_empty() { run_err } else { format!("{run_err}: {tail}") });
    }
    Ok(())
}

#[tauri::command(async)]
pub fn cancel_action_background(run_id: String) -> Result<(), String> {
    let pid = {
        let mut runs = background_runs().lock().unwrap();
        match runs.get_mut(&run_id) {
            Some(run) => {
                run.cancelled = true;
                run.pid
            }
            None => return Ok(()), // already finished
        }
    };
    proctree::kill_tree_async(pid);
    Ok(())
}
