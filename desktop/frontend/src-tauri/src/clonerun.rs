// `git clone` that reports how far it got and can be stopped. git's progress
// on stderr becomes `clone-progress` events for the clone's id, and a cancel
// ends git's whole process tree so the caller can delete the partial folder.
use crate::cloneprogress::{self, Progress};
use std::collections::{HashMap, VecDeque};
use std::io::Read;
use std::path::Path;
use std::process::{ExitStatus, Stdio};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

pub(crate) const PROGRESS_EVENT: &str = "clone-progress";
pub(crate) const CANCELLED: &str = "Clone cancelled.";

const EMIT_EVERY: Duration = Duration::from_millis(120);
const TICK: Duration = Duration::from_millis(100);
/// A helper git started can keep stderr open after git itself exits.
const DRAIN_GRACE: Duration = Duration::from_millis(500);
const TAIL_LINES: usize = 40;

pub(crate) enum Failure {
    Cancelled,
    /// What git said that wasn't progress: the error, in git's words.
    Git(String),
}

/// A clone checks its folder and git's settings before it starts, so a cancel
/// can arrive first. The last few such cancels are kept for their clone to find.
const EARLY_CANCELS_KEPT: usize = 32;

#[derive(Default)]
struct Run {
    pid: u32,
    cancelled: bool,
}

#[derive(Default)]
struct Runs {
    running: HashMap<String, Run>,
    early_cancels: VecDeque<String>,
}

fn runs() -> MutexGuard<'static, Runs> {
    static RUNS: OnceLock<Mutex<Runs>> = OnceLock::new();
    RUNS.get_or_init(Default::default)
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

fn with_run<T>(id: &str, f: impl FnOnce(&mut Run) -> T) -> Option<T> {
    runs().running.get_mut(id).map(f)
}

struct Registered(String);

impl Registered {
    fn new(id: &str) -> Result<Self, Failure> {
        let mut runs = runs();
        if let Some(at) = runs.early_cancels.iter().position(|c| c == id) {
            runs.early_cancels.remove(at);
            return Err(Failure::Cancelled);
        }
        if runs.running.contains_key(id) {
            return Err(Failure::Git(format!(
                "a clone with id {id} is already running"
            )));
        }
        runs.running.insert(id.to_string(), Run::default());
        Ok(Self(id.to_string()))
    }

    fn cancelled(&self) -> bool {
        with_run(&self.0, |r| r.cancelled).unwrap_or(false)
    }
}

impl Drop for Registered {
    fn drop(&mut self) {
        runs().running.remove(&self.0);
    }
}

fn end_tree(pid: u32) {
    crate::proctree::kill_pids(&crate::proctree::trees(&[pid as i32]));
}

/// Stop the clone `id`: end git and everything it started. The clone's own
/// thread then deletes the partial folder and answers `CANCELLED`. False when
/// no clone by that id is running: one that already finished is left alone,
/// and one that hasn't started yet stops as soon as it does.
#[tauri::command(async)]
pub fn cancel_clone(id: String) -> bool {
    let pid = {
        let mut runs = runs();
        let Some(run) = runs.running.get_mut(&id) else {
            if runs.early_cancels.len() == EARLY_CANCELS_KEPT {
                runs.early_cancels.pop_front();
            }
            runs.early_cancels.push_back(id);
            return false;
        };
        run.cancelled = true;
        run.pid
    };
    if pid > 0 {
        end_tree(pid);
    }
    true
}

/// The environment that keeps a clone from waiting on a prompt nobody can
/// answer: no terminal prompts for a user name or password, ssh in batch mode
/// unless the user picked their own ssh command, and English messages so the
/// progress and errors read the same on every machine.
pub(crate) fn quiet_env() -> Vec<(&'static str, String)> {
    let mut env = vec![
        ("GIT_TERMINAL_PROMPT", "0".to_string()),
        ("LC_ALL", "C".to_string()),
    ];
    if crate::sys::headless() {
        env.push(("GCM_INTERACTIVE", "never".to_string()));
    }
    if !own_ssh_command() {
        env.push((
            "GIT_SSH_COMMAND",
            "ssh -o BatchMode=yes -o ConnectTimeout=15".to_string(),
        ));
    }
    env
}

fn own_ssh_command() -> bool {
    std::env::var_os("GIT_SSH_COMMAND").is_some()
        || std::env::var_os("GIT_SSH").is_some()
        || crate::osproc::command("git")
            .args(["config", "--get", "core.sshCommand"])
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output()
            .is_ok_and(|o| o.status.success() && !o.stdout.trim_ascii().is_empty())
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProgressEvent<'a> {
    id: &'a str,
    #[serde(flatten)]
    progress: &'a Progress,
}

/// Run `git <argv>` as clone `id`, sending its progress as `clone-progress`
/// events. With no id nobody is listening (the phone's clone), so none are sent
/// and the clone can't be cancelled.
pub(crate) fn clone_for_app(
    app: &AppHandle,
    id: Option<&str>,
    argv: &[String],
) -> Result<(), Failure> {
    let env = quiet_env();
    match id {
        Some(id) => run(id, argv, &env, |progress| {
            let _ = app.emit(PROGRESS_EVENT, ProgressEvent { id, progress });
        }),
        None => run(&uuid::Uuid::new_v4().to_string(), argv, &env, |_| {}),
    }
}

/// Run `git <argv>` until it exits or `cancel_clone(id)` stops it, handing
/// each progress update (at most every EMIT_EVERY, and on every phase change)
/// to `on_progress`.
pub(crate) fn run(
    id: &str,
    argv: &[String],
    env: &[(&str, String)],
    mut on_progress: impl FnMut(&Progress),
) -> Result<(), Failure> {
    let registered = Registered::new(id)?;
    let mut cmd = crate::osproc::command("git");
    cmd.args(argv)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    for (k, v) in env {
        cmd.env(k, v);
    }
    // Its own session: a cancel ends the whole group, and with no controlling
    // terminal nothing git starts can stop to ask on one. Windows walks the tree.
    #[cfg(unix)]
    crate::osproc::detach(&mut cmd);
    if registered.cancelled() {
        return Err(Failure::Cancelled);
    }
    let mut child = cmd
        .spawn()
        .map_err(|e| Failure::Git(format!("could not run git: {e}")))?;
    let cancelled_during_spawn = with_run(id, |r| {
        r.pid = child.id();
        r.cancelled
    })
    .unwrap_or(false);
    if cancelled_during_spawn {
        crate::proctree::kill_tree_async(child.id() as i32);
    }

    let (tx, rx) = mpsc::channel::<String>();
    if let Some(mut stderr) = child.stderr.take() {
        std::thread::spawn(move || {
            let mut lines = cloneprogress::Lines::default();
            let mut buf = [0u8; 4096];
            while let Ok(n) = stderr.read(&mut buf) {
                if n == 0 {
                    break;
                }
                for line in lines.push(&buf[..n]) {
                    if tx.send(line).is_err() {
                        return;
                    }
                }
            }
            if let Some(line) = lines.finish() {
                let _ = tx.send(line);
            }
        });
    }

    let mut reader = Reader::default();
    let status = wait_reading(&mut child, &rx, &mut reader, &mut on_progress);
    if let Some(p) = reader.pending.take() {
        on_progress(&p);
    }
    if registered.cancelled() {
        return Err(Failure::Cancelled);
    }
    match status {
        Ok(s) if s.success() => Ok(()),
        Ok(_) => Err(Failure::Git(reader.messages())),
        Err(e) => Err(Failure::Git(format!("git failed: {e}"))),
    }
}

fn wait_reading(
    child: &mut std::process::Child,
    rx: &mpsc::Receiver<String>,
    reader: &mut Reader,
    on_progress: &mut impl FnMut(&Progress),
) -> std::io::Result<ExitStatus> {
    loop {
        match rx.recv_timeout(TICK) {
            Ok(line) => reader.line(line, on_progress),
            Err(RecvTimeoutError::Disconnected) => return child.wait(),
            Err(RecvTimeoutError::Timeout) => reader.flush(on_progress),
        }
        if let Some(status) = child.try_wait()? {
            let deadline = Instant::now() + DRAIN_GRACE;
            while let Some(left) = deadline.checked_duration_since(Instant::now()) {
                match rx.recv_timeout(left) {
                    Ok(line) => reader.line(line, on_progress),
                    Err(_) => break,
                }
            }
            return Ok(status);
        }
    }
}

#[derive(Default)]
struct Reader {
    tail: VecDeque<String>,
    last: Option<(Progress, Instant)>,
    pending: Option<Progress>,
}

impl Reader {
    fn line(&mut self, line: String, on_progress: &mut impl FnMut(&Progress)) {
        let Some(progress) = cloneprogress::parse(&line) else {
            if line.starts_with("Cloning into") {
                return;
            }
            if self.tail.len() == TAIL_LINES {
                self.tail.pop_front();
            }
            self.tail.push_back(line);
            return;
        };
        let due = match &self.last {
            None => true,
            Some((last, at)) => {
                last.phase != progress.phase
                    || progress.finished != last.finished
                    || at.elapsed() >= EMIT_EVERY
            }
        };
        if due {
            self.emit(progress, on_progress);
        } else {
            self.pending = Some(progress);
        }
    }

    fn flush(&mut self, on_progress: &mut impl FnMut(&Progress)) {
        if let Some(p) = self.pending.take() {
            self.emit(p, on_progress);
        }
    }

    fn emit(&mut self, progress: Progress, on_progress: &mut impl FnMut(&Progress)) {
        on_progress(&progress);
        self.pending = None;
        self.last = Some((progress, Instant::now()));
    }

    fn messages(&self) -> String {
        self.tail.iter().cloned().collect::<Vec<_>>().join("\n")
    }
}

/// Delete a clone's folder. Only for a folder the clone itself created: a
/// process git started may still hold a file for a moment after a cancel, so
/// this retries briefly.
pub(crate) fn remove_partial(dest: &Path) {
    for _ in 0..20 {
        match std::fs::remove_dir_all(dest) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => {
                std::thread::sleep(Duration::from_millis(100))
            }
            _ => return,
        }
    }
}

pub(crate) fn map_clone_error(msg: &str) -> String {
    let m = msg.to_lowercase();
    let friendly = if m.contains("could not resolve host") || m.contains("couldn't resolve") {
        "Network error: could not reach the repository host."
    } else if m.contains("terminal prompts disabled")
        || m.contains("could not read username")
        || m.contains("could not read password")
    {
        "The repository asked for a sign-in, and git can't ask you for one here. Check the URL, then sign in through a Git credential helper or use an SSH URL with a key in ssh-agent."
    } else if m.contains("host key verification failed") {
        "SSH doesn't know this host's key yet. Connect to it once from a terminal (for example ssh -T git@github.com) to trust it, then try again."
    } else if m.contains("permission denied")
        || m.contains("publickey")
        || m.contains("authentication failed")
    {
        "Authentication failed. Check your credentials or SSH key."
    } else if m.contains("repository not found") || m.contains("does not exist") {
        "Repository not found. Check the URL and your access."
    } else if m.contains("remote branch") && m.contains("not found") {
        "Branch not found in the remote repository."
    } else if m.contains("already exists and is not an empty directory") {
        "Destination already exists and is not empty."
    } else if m.contains("ssl certificate") || m.contains("certificate verify failed") {
        "TLS certificate error connecting to the repository."
    } else {
        return format!(
            "clone failed: {}",
            msg.chars().take(2048).collect::<String>()
        );
    };
    friendly.to_string()
}

#[cfg(test)]
#[path = "clonerun_tests.rs"]
mod tests;
