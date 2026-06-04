// PTY subsystem — port of desktop/pty.go onto portable-pty. Phase 3 covers
// LOCAL terminals end-to-end: spawn, output streaming with high/low-watermark
// flow control, the hex-encoded input workaround, resize, stop, and exit.
// Remote (ssh) terminals need the SSH-argv port and are a later sub-phase;
// start_* reject remote projects with a clear error for now.
//
// portable-pty's master/writer/child are blocking and not meant to cross
// .await, so the reader uses two std threads (read -> bounded channel ->
// flush) mirroring pty.go's two goroutines, and commands are sync fns.
use crate::config;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{sync_channel, RecvTimeoutError};
use std::sync::{Arc, Condvar, Mutex, RwLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

// Constants mirror pty.go exactly (watermarks count UTF-8 runes, not bytes).
const HEX_MARKER: &str = "\u{0}HEX:"; // null + "HEX:" (pty.go:23)
const HIGH_WATERMARK: i64 = 100_000; // pause when unacked > this (pty.go:28)
const LOW_WATERMARK: i64 = 5_000; // resume when unacked < this (pty.go:29)
const READ_BUF: usize = 16_384;
const FLUSH_SIZE: usize = 32_768;
const FLUSH_MS: u64 = 4;
const PENDING_CAP: usize = 65_536;

struct FlowState {
    unacked: i64,
    paused: bool,
}

pub struct PtySession {
    pub id: String,
    pub remote: bool,
    // SSH settings for remote panes (None when local) — used by terminal upload
    // (scp). Mirrors Go's sess.ssh; the id "project-N" isn't reversibly parseable
    // to a project, so we stash it at spawn rather than re-resolving.
    pub ssh: Option<config::SshSettings>,
    // Owning project + its declared service ports — for the remote port sniffer
    // (flush() scans output for localhost URLs to auto-forward / suggest).
    pub project_name: String,
    pub declared: HashSet<u16>,
    writer: Mutex<Box<dyn Write + Send>>,
    master: Mutex<Box<dyn MasterPty + Send>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
    // flow (Mutex) + resume (Condvar) == Go mu+cond; closed (RwLock) == Go
    // closeMu+closed. Kept separate so a write/resize never blocks the reader's
    // flow-control wait and vice versa.
    flow: Mutex<FlowState>,
    resume: Condvar,
    closed: RwLock<bool>,
}

type SessionMap = Arc<Mutex<HashMap<String, Arc<PtySession>>>>;

pub struct PtyState {
    pub sessions: SessionMap,
    pub counter: AtomicU64,
}

impl Default for PtyState {
    fn default() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            counter: AtomicU64::new(0),
        }
    }
}

#[derive(Serialize)]
pub struct TerminalLaunch {
    pub id: String,
    #[serde(rename = "startCmd")]
    pub start_cmd: String,
    #[serde(rename = "resumeCmd", skip_serializing_if = "String::is_empty")]
    pub resume_cmd: String,
}

fn lookup(state: &State<'_, PtyState>, id: &str) -> Result<Arc<PtySession>, String> {
    state
        .sessions
        .lock()
        .unwrap()
        .get(id)
        .cloned()
        .ok_or_else(|| format!("terminal not found: {id}"))
}

fn add_unacked(sess: &Arc<PtySession>, n: i64) {
    let mut f = sess.flow.lock().unwrap();
    f.unacked += n;
    if !f.paused && f.unacked > HIGH_WATERMARK {
        f.paused = true;
    }
}

fn flush(pending: &mut Vec<u8>, app: &AppHandle, sess: &Arc<PtySession>) {
    if pending.is_empty() {
        return;
    }
    // from_utf8_lossy == strings.ToValidUTF8(..., "\u{FFFD}"): invalid byte runs
    // (incl. partial multibyte chars at a chunk boundary) become U+FFFD.
    let text = String::from_utf8_lossy(pending).into_owned();
    let runes = text.chars().count() as i64; // RuneCountInString — MUST be runes
    let _ = app.emit(&format!("pty-output-{}", sess.id), &text);
    // Remote panes: sniff localhost URLs in output to auto-forward declared
    // ports / surface undeclared ones (port poller's no-poll-needed path).
    if sess.remote {
        crate::portforward::sniff_pane_output(app, &sess.project_name, &sess.declared, &text);
    }
    pending.clear();
    add_unacked(sess, runes);
}

fn spawn_io_threads(
    app: AppHandle,
    sess: Arc<PtySession>,
    sessions: SessionMap,
    reader: Box<dyn Read + Send>,
) {
    let (tx, rx) = sync_channel::<Result<Vec<u8>, ()>>(8);

    // Inner read thread: blocking read() -> channel. Pauses BETWEEN reads when
    // backpressured (so one buffer can always be produced first, like Go).
    {
        let sess = sess.clone();
        std::thread::spawn(move || {
            let mut reader = reader;
            let mut buf = vec![0u8; READ_BUF];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => {
                        let _ = tx.send(Err(()));
                        return;
                    }
                    Ok(n) => {
                        if tx.send(Ok(buf[..n].to_vec())).is_err() {
                            return;
                        }
                        let mut f = sess.flow.lock().unwrap();
                        while f.paused {
                            f = sess.resume.wait(f).unwrap();
                        }
                    }
                }
            }
        });
    }

    // Flush thread: accumulate, flush on >=32KB or after 4ms idle (recv_timeout
    // collapses Go's one-shot timer). On EOF, wait the child and emit exit.
    std::thread::spawn(move || {
        let mut pending: Vec<u8> = Vec::with_capacity(PENDING_CAP);
        loop {
            match rx.recv_timeout(Duration::from_millis(FLUSH_MS)) {
                Ok(Ok(chunk)) => {
                    pending.extend_from_slice(&chunk);
                    if pending.len() >= FLUSH_SIZE {
                        flush(&mut pending, &app, &sess);
                    }
                }
                Ok(Err(())) | Err(RecvTimeoutError::Disconnected) => {
                    flush(&mut pending, &app, &sess);
                    break;
                }
                Err(RecvTimeoutError::Timeout) => flush(&mut pending, &app, &sess),
            }
        }
        let code = sess
            .child
            .lock()
            .unwrap()
            .wait()
            .map(|s| s.exit_code() as i32)
            .unwrap_or(0);
        let _ = app.emit(&format!("pty-exit-{}", sess.id), code);
        sessions.lock().unwrap().remove(&sess.id);
    });
}

fn start_internal(
    app: &AppHandle,
    state: &State<'_, PtyState>,
    project_name: &str,
    root: &str,
    raw_cwd: &str,
    extra_env: &BTreeMap<String, String>,
    ssh: Option<&config::SshSettings>,
) -> Result<String, String> {
    let n = state.counter.fetch_add(1, Ordering::SeqCst) + 1;
    let id = format!("{project_name}-{n}");
    let is_remote = ssh.is_some();

    let mut builder;
    if let Some(ssh) = ssh {
        // REMOTE: ssh -t ... bash -ilc 'cd <dir> && export ... && exec "$SHELL" -l'.
        // TERM_PROGRAM is forced (ssh doesn't forward it); extra_env is baked into
        // the remote script, NOT the local ssh process env. raw_cwd stays
        // project-relative so join_remote_dir/quote_remote_path can expand ~.
        config::ensure_ssh_control_dir()?;
        let mut remote_env: BTreeMap<String, String> = BTreeMap::new();
        remote_env.insert("TERM_PROGRAM".into(), "kitty".into());
        for (k, v) in extra_env {
            remote_env.insert(k.clone(), v.clone());
        }
        let argv = config::ssh_command_argv(ssh, raw_cwd, &remote_env, "exec \"$SHELL\" -l");
        builder = CommandBuilder::new(&argv[0]);
        for a in &argv[1..] {
            builder.arg(a);
        }
        builder.cwd(config::remote_local_spawn_dir(root)); // LOCAL cwd for ssh client
        for (k, v) in std::env::vars() {
            builder.env(k, v);
        }
        builder.env("TERM", "xterm-256color");
        builder.env("TERM_PROGRAM", "kitty");
        builder.env("LPM_SOCKET_PATH", config::socket_path());
        builder.env("LPM_PROJECT_NAME", project_name);
        builder.env("LPM_PANE_ID", &id);
    } else {
        let dir = config::resolve_cwd(root, raw_cwd);
        if dir.is_empty() {
            return Err("project has no root directory".into());
        }
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
        builder = CommandBuilder::new(&shell);
        builder.arg("-l"); // login shell, matches Go exec.Command(shell, "-l")
        builder.cwd(&dir);
        // Inherit the full parent env (== Go os.Environ()); CommandBuilder otherwise
        // passes only what we set, which would drop PATH and break the shell.
        for (k, v) in std::env::vars() {
            builder.env(k, v);
        }
        builder.env("TERM", "xterm-256color");
        builder.env("TERM_PROGRAM", "kitty");
        builder.env("LPM_SOCKET_PATH", config::socket_path());
        builder.env("LPM_PROJECT_NAME", project_name);
        builder.env("LPM_PANE_ID", &id);
        for (k, v) in extra_env {
            builder.env(k, v);
        }
    }

    let pair = native_pty_system()
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;
    let child = pair.slave.spawn_command(builder).map_err(|e| e.to_string())?;
    drop(pair.slave); // close slave in parent so EOF propagates on child exit
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    let sess = Arc::new(PtySession {
        id: id.clone(),
        remote: is_remote,
        ssh: ssh.cloned(),
        project_name: project_name.to_string(),
        declared: if is_remote { config::declared_service_ports(project_name) } else { HashSet::new() },
        writer: Mutex::new(writer),
        master: Mutex::new(pair.master),
        child: Mutex::new(child),
        flow: Mutex::new(FlowState {
            unacked: 0,
            paused: false,
        }),
        resume: Condvar::new(),
        closed: RwLock::new(false),
    });
    state.sessions.lock().unwrap().insert(id.clone(), sess.clone());
    spawn_io_threads(app.clone(), sess, state.sessions.clone(), reader);
    Ok(id)
}

// --- resume-command rewrite (terminal_resume.go) -----------------------------

/// Index of the first whitespace-token that isn't a `KEY=value` env assignment.
fn program_index(fields: &[&str]) -> Option<usize> {
    fields.iter().position(|f| !f.contains('='))
}

/// Insert `[flag, value]` immediately after the program token.
fn inject_args(cmd: &str, flag: &str, value: &str) -> String {
    let fields: Vec<&str> = cmd.split_whitespace().collect();
    match program_index(&fields) {
        Some(idx) => {
            let mut out: Vec<String> = fields.iter().map(|s| s.to_string()).collect();
            out.insert(idx + 1, value.to_string());
            out.insert(idx + 1, flag.to_string());
            out.join(" ")
        }
        None => cmd.to_string(),
    }
}

/// (startCmd, resumeCmd). Known recipe: claude --session-id/--resume <uuid>.
/// Unknown programs return an empty resumeCmd (not persisted).
fn resolve_restore_cmds(cmd: &str) -> (String, String) {
    let fields: Vec<&str> = cmd.split_whitespace().collect();
    let prog = program_index(&fields).map(|i| fields[i]).unwrap_or("");
    match prog {
        "claude" => {
            let id = uuid::Uuid::new_v4().to_string();
            (
                inject_args(cmd, "--session-id", &id),
                inject_args(cmd, "--resume", &id),
            )
        }
        _ => (cmd.to_string(), String::new()),
    }
}

// --- commands ----------------------------------------------------------------

/// (root, ssh) for a project; ssh is Some(..) only when remote.
fn resolve_spawn(project_name: &str) -> Result<(String, Option<config::SshSettings>), String> {
    let info = config::spawn_info(project_name)?;
    let ssh = if info.is_remote { Some(info.ssh) } else { None };
    Ok((info.root, ssh))
}

/// (cwd, env, cmd) for a named terminal action, falling back to a plain shell
/// (all empty) when the action was renamed/removed or a stale tab still
/// references it — so the terminal still opens instead of erroring.
fn resolve_terminal_spawn(
    project: &str,
    name: &str,
) -> Result<(String, BTreeMap<String, String>, String), String> {
    Ok(match config::resolve_terminal_action(project, name)? {
        Some(t) => (t.cwd, t.env, t.cmd),
        None => (String::new(), BTreeMap::new(), String::new()),
    })
}

#[tauri::command]
pub fn start_terminal(
    app: AppHandle,
    state: State<'_, PtyState>,
    project_name: String,
) -> Result<String, String> {
    let (root, ssh) = resolve_spawn(&project_name)?;
    start_internal(&app, &state, &project_name, &root, "", &BTreeMap::new(), ssh.as_ref())
}

#[tauri::command]
pub fn start_terminal_with_cwd_env(
    app: AppHandle,
    state: State<'_, PtyState>,
    project_name: String,
    cwd: String,
    env: HashMap<String, String>,
) -> Result<String, String> {
    let (root, ssh) = resolve_spawn(&project_name)?;
    let env: BTreeMap<String, String> = env.into_iter().collect();
    start_internal(&app, &state, &project_name, &root, &cwd, &env, ssh.as_ref())
}

#[tauri::command]
pub fn start_terminal_for_restore(
    app: AppHandle,
    state: State<'_, PtyState>,
    project_name: String,
    terminal_name: String,
) -> Result<String, String> {
    let (root, ssh) = resolve_spawn(&project_name)?;
    let (cwd, env, _) = resolve_terminal_spawn(&project_name, &terminal_name)?;
    start_internal(&app, &state, &project_name, &root, &cwd, &env, ssh.as_ref())
}

#[tauri::command]
pub fn start_terminal_for_config(
    app: AppHandle,
    state: State<'_, PtyState>,
    project_name: String,
    terminal_name: String,
) -> Result<TerminalLaunch, String> {
    let (root, ssh) = resolve_spawn(&project_name)?;
    // On the plain-shell fallback `cmd` is empty, so startCmd is empty and the
    // frontend injects nothing.
    let (cwd, env, cmd) = resolve_terminal_spawn(&project_name, &terminal_name)?;
    let id = start_internal(&app, &state, &project_name, &root, &cwd, &env, ssh.as_ref())?;
    let (start_cmd, resume_cmd) = resolve_restore_cmds(&cmd);
    Ok(TerminalLaunch {
        id,
        start_cmd,
        resume_cmd,
    })
}

#[tauri::command]
pub fn write_terminal(state: State<'_, PtyState>, id: String, data: String) -> Result<(), String> {
    let sess = lookup(&state, &id)?;
    if *sess.closed.read().unwrap() {
        return Err(format!("terminal closed: {id}"));
    }
    let buf: Vec<u8> = match data.strip_prefix(HEX_MARKER) {
        Some(hexpart) => hex::decode(hexpart).map_err(|e| format!("decode hex: {e}"))?,
        None => data.into_bytes(),
    };
    // Bind to a statement so the writer guard drops before `sess`.
    let r = sess.writer.lock().unwrap().write_all(&buf).map_err(|e| e.to_string());
    r
}

#[tauri::command]
pub fn resize_terminal(
    state: State<'_, PtyState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sess = lookup(&state, &id)?;
    if *sess.closed.read().unwrap() {
        return Err(format!("terminal closed: {id}"));
    }
    let r = sess
        .master
        .lock()
        .unwrap()
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string());
    r
}

#[tauri::command]
pub fn ack_terminal_data(state: State<'_, PtyState>, id: String, char_count: i64) -> Result<(), String> {
    let sess = state.sessions.lock().unwrap().get(&id).cloned();
    if let Some(sess) = sess {
        let mut f = sess.flow.lock().unwrap();
        f.unacked -= char_count;
        if f.unacked < 0 {
            f.unacked = 0;
        }
        if f.paused && f.unacked < LOW_WATERMARK {
            f.paused = false;
            sess.resume.notify_one();
        }
    }
    Ok(())
}

#[tauri::command]
pub fn stop_terminal(state: State<'_, PtyState>, id: String) -> Result<(), String> {
    // remove first so no new I/O can grab the session, then wake the reader,
    // mark closed, and kill the child (which closes the fd -> reader EOF).
    let sess = state.sessions.lock().unwrap().remove(&id);
    let Some(sess) = sess else {
        return Ok(());
    };
    {
        let mut f = sess.flow.lock().unwrap();
        f.paused = false;
        sess.resume.notify_one();
    }
    *sess.closed.write().unwrap() = true;
    let _ = sess.child.lock().unwrap().kill();
    Ok(())
}

#[tauri::command]
pub fn is_terminal_remote(state: State<'_, PtyState>, id: String) -> bool {
    state
        .sessions
        .lock()
        .unwrap()
        .get(&id)
        .map(|s| s.remote)
        .unwrap_or(false)
}

/// (remote, ssh) for a terminal id, or None if no such session. Used by the
/// terminal upload command to decide local-quote vs scp.
pub fn session_remote_ssh(
    state: &State<'_, PtyState>,
    id: &str,
) -> Option<(bool, Option<config::SshSettings>)> {
    state
        .sessions
        .lock()
        .unwrap()
        .get(id)
        .map(|s| (s.remote, s.ssh.clone()))
}
