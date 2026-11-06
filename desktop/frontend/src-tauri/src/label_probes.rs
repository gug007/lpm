//! Background runs behind dynamic action labels. Each `$(…)` command in a label,
//! and each git query a label makes on an SSH project, is a probe: run on its own interval
//! with a timeout, its first output line kept for the next listing. One ticker
//! thread starts due probes, watches local git and rendered ages, and emits
//! `projects-changed` when any of them moves.

use crate::action_labels::{self, Ctx};
use crate::config::{self, SshSettings};
use std::collections::{BTreeMap, HashMap};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const TICK: Duration = Duration::from_secs(1);
const WATCH_TICKS: u32 = 5;
const STALE: Duration = Duration::from_secs(600);
const REMOTE_GIT_EVERY: Duration = Duration::from_secs(60);
const MAX_RUNNING: usize = 4;
const MAX_CHARS: usize = 60;
/// The most a `labelSvg` command may print; more reads as nothing, so the
/// button falls back to its text label.
const MAX_MARKUP: usize = 32 * 1024;
/// A command printing more than this is stopped and keeps its last output.
const MAX_OUTPUT: usize = 16 * 1024 * 1024;
const HOVER_GAP: Duration = Duration::from_secs(5);
const CHANGE_GAP: Duration = Duration::from_secs(2);

struct Probe {
    ssh: Option<SshSettings>,
    dir: String,
    script: String,
    output: Option<String>,
    /// Keeps everything the command prints (a `labelSvg`), not its first line.
    whole: bool,
    ran_at: Option<Instant>,
    running: bool,
    due: bool,
    seen: Instant,
    /// (project, action id) pairs whose labels show this probe's output, each
    /// with the interval its label asks for; a built-in git query has no action.
    owners: HashMap<(String, String), Duration>,
}

impl Probe {
    /// The shortest interval any label showing it asks for. Each label's own
    /// entry is replaced on every listing, so a changed `labelRefresh` counts
    /// from the next run.
    fn every(&self) -> Duration {
        self.owners.values().min().copied().unwrap_or(Duration::MAX)
    }
}

fn probes() -> &'static Mutex<HashMap<String, Probe>> {
    static PROBES: OnceLock<Mutex<HashMap<String, Probe>>> = OnceLock::new();
    PROBES.get_or_init(|| Mutex::new(HashMap::new()))
}

static DIRTY: AtomicBool = AtomicBool::new(false);

/// A label's `$(…)` command's last output, run in the action's cwd with its env:
/// its first line, or with `whole` all of it, as a `labelSvg` needs.
pub fn read_command(
    ctx: &Ctx,
    action: &str,
    cwd: &str,
    env: &BTreeMap<String, String>,
    cmd: &str,
    every: Duration,
    whole: bool,
) -> String {
    let mut env = env.clone();
    env.insert("LPM_PROJECT_NAME".into(), ctx.project.to_string());
    let dir = match ctx.ssh {
        Some(_) => config::join_remote_dir(ctx.root, cwd),
        None => config::resolve_cwd(ctx.root, cwd),
    };
    read(
        (ctx.project, action),
        ctx.ssh,
        dir,
        config::build_local_script(&env, cmd),
        every,
        whole,
    )
}

/// A built-in query's last output on an SSH project's host.
pub fn read_remote(project: &str, ssh: &SshSettings, dir: &str, script: &str) -> String {
    read(
        (project, ""),
        Some(ssh),
        dir.to_string(),
        script.to_string(),
        REMOTE_GIT_EVERY,
        false,
    )
}

/// The cached output, registering the probe on first sight so the ticker runs
/// it straight away. Never blocks on the command itself.
fn read(
    owner: (&str, &str),
    ssh: Option<&SshSettings>,
    dir: String,
    script: String,
    every: Duration,
    whole: bool,
) -> String {
    let host = ssh
        .map(|s| format!("{}@{}:{}", s.user, s.host, s.port))
        .unwrap_or_default();
    let key = if whole {
        format!("whole\n{host}\n{dir}\n{script}")
    } else {
        format!("{host}\n{dir}\n{script}")
    };
    let mut probes = probes().lock().unwrap();
    let probe = probes.entry(key).or_insert_with(|| Probe {
        ssh: ssh.cloned(),
        dir,
        script,
        output: None,
        whole,
        ran_at: None,
        running: false,
        due: true,
        seen: Instant::now(),
        owners: HashMap::new(),
    });
    probe.seen = Instant::now();
    probe
        .owners
        .insert((owner.0.to_string(), owner.1.to_string()), every);
    probe.output.clone().unwrap_or_default()
}

/// Run the project's label commands again now, after one of its actions ran.
pub fn refresh_project(project: &str) {
    for probe in probes().lock().unwrap().values_mut() {
        if probe.owners.keys().any(|(p, _)| p == project) {
            probe.due = true;
        }
    }
}

fn owned_by(probe: &Probe, project: &str, action: &str) -> bool {
    let nested = format!("{action}:");
    probe
        .owners
        .keys()
        .any(|(p, a)| p == project && (a == action || a.starts_with(&nested)))
}

/// Run the label commands of `action` and the items in its menu again now,
/// unless they ran within `gap`.
fn refresh_action(project: &str, action: &str, gap: Duration) {
    for probe in probes().lock().unwrap().values_mut() {
        if owned_by(probe, project, action) && probe.ran_at.is_none_or(|t| t.elapsed() >= gap) {
            probe.due = true;
        }
    }
}

/// Run the label commands of `action` and its menu again for a change in the
/// project's files. False when one ran a moment ago: a command that writes into
/// the project mustn't rerun itself in a loop, and the caller asks again later
/// instead of dropping the change. A run in progress reruns once it ends.
pub(crate) fn refresh_for_change(project: &str, action: &str) -> bool {
    let mut settled = true;
    for probe in probes().lock().unwrap().values_mut() {
        if !owned_by(probe, project, action) {
            continue;
        }
        if probe.running || probe.ran_at.is_none_or(|t| t.elapsed() >= CHANGE_GAP) {
            probe.due = true;
        } else {
            settled = false;
        }
    }
    settled
}

/// Hovering a `labelRefreshOnHover` button.
#[tauri::command]
pub fn refresh_action_label(project_name: String, action_name: String) {
    refresh_action(&project_name, &action_name, HOVER_GAP);
}

/// `refresh_label <project> [action]` from `lpm refresh-label`: run the label
/// commands of one action and its menu, or of the whole project, now, and
/// redraw so labels built from git read it again too.
pub(crate) fn cmd_refresh_label(args: &[String]) -> String {
    let Some(project) = args.first() else {
        return "ERROR: usage: refresh_label <project> [action]".into();
    };
    if project != config::RESERVED_PROJECT_NAME && !config::project_exists(project) {
        return format!("ERROR: project {project:?} not found");
    }
    match args.get(1).filter(|a| !a.is_empty()) {
        Some(action) => refresh_action(project, action, Duration::ZERO),
        None => refresh_project(project),
    }
    DIRTY.store(true, Ordering::SeqCst);
    "OK".into()
}

pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let mut tick: u32 = 0;
        loop {
            std::thread::sleep(TICK);
            crate::label_watch::flush();
            run_due();
            tick = tick.wrapping_add(1);
            if tick.is_multiple_of(WATCH_TICKS)
                && (crate::label_git::poll() | action_labels::ages_moved())
            {
                DIRTY.store(true, Ordering::SeqCst);
            }
            if DIRTY.swap(false, Ordering::SeqCst) {
                let _ = app.emit("projects-changed", ());
            }
        }
    });
}

fn run_due() {
    let mut probes = probes().lock().unwrap();
    probes.retain(|_, p| p.running || p.seen.elapsed() < STALE);
    let free = MAX_RUNNING.saturating_sub(probes.values().filter(|p| p.running).count());
    let due: Vec<String> = probes
        .iter()
        .filter(|(_, p)| !p.running && (p.due || p.ran_at.is_none_or(|t| t.elapsed() >= p.every())))
        .map(|(key, _)| key.clone())
        .take(free)
        .collect();
    for key in due {
        let Some(probe) = probes.get_mut(&key) else {
            continue;
        };
        probe.running = true;
        probe.due = false;
        let (ssh, dir, script, whole) =
            (probe.ssh.clone(), probe.dir.clone(), probe.script.clone(), probe.whole);
        std::thread::spawn(move || {
            let output = run(ssh.as_ref(), &dir, &script, whole);
            finish(&key, output);
        });
    }
}

/// A run that failed, timed out or couldn't start keeps the last output, so a
/// slow network or a refused API call (whose error body `gh api` prints to
/// stdout) doesn't replace a label that read fine a minute ago.
pub(crate) fn finish(key: &str, output: Option<String>) {
    let mut probes = probes().lock().unwrap();
    let Some(probe) = probes.get_mut(key) else {
        return;
    };
    probe.running = false;
    probe.ran_at = Some(Instant::now());
    let Some(output) = output else {
        return;
    };
    if probe.output.as_deref().unwrap_or_default() != output {
        DIRTY.store(true, Ordering::SeqCst);
    }
    probe.output = Some(output);
}

/// An action's command as its labels and popups run it: in `dir` through the
/// login shell, on an SSH project's host when there is one.
pub(crate) fn command(ssh: Option<&SshSettings>, dir: &str, script: &str) -> Command {
    match ssh {
        Some(ssh) => {
            let line = if dir.trim().is_empty() {
                script.to_string()
            } else {
                format!("cd {} && {script}", config::quote_remote_path(dir.trim()))
            };
            crate::sshexec::remote_login_script(ssh, &line)
        }
        None => local_command(dir, script),
    }
}

fn run(ssh: Option<&SshSettings>, dir: &str, script: &str, whole: bool) -> Option<String> {
    let out = run_with_timeout(command(ssh, dir, script))?;
    let text = String::from_utf8_lossy(&out);
    Some(if whole {
        markup(&text)
    } else {
        first_line(&text)
    })
}

/// What a `labelSvg` command printed, from its `<svg`: a login shell's own line
/// or an XML prolog before it isn't the image. Too much reads as nothing.
fn markup(out: &str) -> String {
    let start = out.find("<svg").unwrap_or(out.len());
    let markup = out[start..].trim();
    if markup.len() > MAX_MARKUP {
        String::new()
    } else {
        markup.to_string()
    }
}

/// The user's interactive login shell, as background actions use, so a label
/// command finds the same PATH and version managers the action itself does.
fn local_command(dir: &str, script: &str) -> Command {
    #[cfg_attr(windows, allow(unused_mut))]
    let mut cmd = crate::shellpath::login_line(Path::new(dir), script);
    #[cfg(unix)]
    crate::osproc::detach(&mut cmd);
    cmd
}

fn run_with_timeout(mut cmd: Command) -> Option<Vec<u8>> {
    cmd.stderr(Stdio::null());
    crate::popup_run::capture(cmd, MAX_OUTPUT).ok()
}

/// The first line with text, cut to fit a button.
pub(crate) fn first_line(out: &str) -> String {
    first_line_within(out, MAX_CHARS).unwrap_or_default()
}

/// The first line with text, without terminal escapes (colors, links, the
/// marks iTerm2's shell integration prints at startup) or control characters,
/// cut to `max` characters with "…" when longer.
pub(crate) fn first_line_within(out: &str, max: usize) -> Option<String> {
    let line = out
        .lines()
        .map(|l| strip_ansi(l).trim().to_string())
        .find(|l| !l.is_empty())?;
    if line.chars().count() <= max {
        return Some(line);
    }
    let cut: String = line.chars().take(max - 1).collect();
    Some(format!("{}…", cut.trim_end()))
}

fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '\u{1b}' {
            if !c.is_control() {
                out.push(c);
            }
            continue;
        }
        match chars.next() {
            Some('[') => {
                for c in chars.by_ref() {
                    if ('@'..='~').contains(&c) {
                        break;
                    }
                }
            }
            Some(']' | 'P' | 'X' | '^' | '_') => {
                while let Some(c) = chars.next() {
                    if c == '\u{7}' {
                        break;
                    }
                    if c == '\u{1b}' {
                        chars.next_if_eq(&'\\');
                        break;
                    }
                }
            }
            _ => {}
        }
    }
    out
}

#[cfg(test)]
#[path = "label_probes_tests.rs"]
mod tests;
