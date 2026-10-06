//! `lpm hook <agent> <event>` — the agent status hooks as a program rather than
//! a POSIX-sh one-liner. The desktop app installs this form where the sh hooks
//! cannot reach its socket (Windows: no `nc -U`, no AF_UNIX in Python, an MSYS
//! `$PPID`), and the frames it sends are the ones the sh hooks build
//! (desktop hooks.rs), so the app cannot tell the two apart.
//!
//! `lpm hook claude statusline` is the usage-limit forwarder: it reports the
//! statusline payload as `agent_limits <account> --payload-b64=…`.
//!
//! A hook must never get in the agent's way, so this prints nothing and the
//! caller exits 0 whatever happens: Claude Code reads exit 2 as "block this tool
//! call" and adds SessionStart stdout to the model's context.

#[path = "hook_transport.rs"]
mod transport;

use crate::statussock::quote_arg;
use serde_json::Value;
use std::fs::File;
use std::io::{BufRead, BufReader, IsTerminal, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use transport::{deliver, is_socket, parent_pid, status_socket};

const CLAUDE_RUNNING: &str = "Running --icon=bolt --color=#4C8DFF";
const CODEX_RUNNING: &str = "Running --icon=sparkle --color=#10A37F";
const WAITING: &str = "Waiting --icon=bell --color=#f59e0b";
const ERROR: &str = "Error --icon=warning --color=#ef4444";
const DONE: &str = "Done --icon=checkmark --color=#4ade80";

/// Background task types a Claude turn can end beside and still be finished:
/// an idle-but-registered teammate, a wake-on-event monitor, a backgrounded
/// shell. Anything else in `background_tasks` means the turn only paused.
const SETTLED_TASK_TYPES: [&str; 3] = ["teammate", "monitor", "shell"];

/// Tail windows searched for a Codex rollout's last `turn_context` before the
/// whole file: large tool output can push it megabytes behind the write head.
const ROLLOUT_WINDOWS: [u64; 2] = [1 << 20, 16 << 20];

/// What a hook run knows about where it is: the LPM_* identity of the pane the
/// agent runs in, and the pid that ran the hook (the agent, or a shell under it),
/// which the app uses to tell a tab's own agent from one it launched.
pub struct HookEnv {
    pub socket: Option<PathBuf>,
    pub project: String,
    pub pane: String,
    pub config_dir: Option<String>,
    pub home: Option<PathBuf>,
    pub reporter_pid: Option<u32>,
}

impl HookEnv {
    fn from_process() -> Self {
        let var = |name: &str| std::env::var(name).unwrap_or_default();
        HookEnv {
            socket: std::env::var_os("LPM_SOCKET_PATH")
                .filter(|v| !v.is_empty())
                .map(PathBuf::from),
            project: var("LPM_PROJECT_NAME"),
            pane: var("LPM_PANE_ID"),
            config_dir: std::env::var("CLAUDE_CONFIG_DIR").ok(),
            home: dirs::home_dir(),
            reporter_pid: parent_pid(),
        }
    }
}

/// Entry point for `lpm hook <agent> <event> [ignored...]`. Trailing arguments
/// are accepted and ignored: installs carry the `# lpm-hook` marker there.
pub fn run(args: &[String]) {
    let (Some(agent), Some(event)) = (args.first(), args.get(1)) else {
        return;
    };
    let payload = read_payload();
    let env = HookEnv::from_process();
    let mut lines = frames(agent, event, &payload, &env);
    lines.retain(|line| !line.contains(['\n', '\r']));
    if lines.is_empty() {
        return;
    }
    let socket = if is_statusline(agent, event) {
        env.socket.clone().filter(|path| is_socket(path))
    } else {
        status_socket(env.socket.as_deref(), env.home.as_deref())
    };
    if let Some(socket) = socket {
        deliver(&socket, &lines);
    }
}

/// The agent writes the payload to our stdin and fails its write if we exit
/// without draining it, so it is always read in full — unless stdin is a
/// terminal (someone running the hook by hand), which would block.
fn read_payload() -> Vec<u8> {
    let mut stdin = std::io::stdin();
    let mut payload = Vec::new();
    if !stdin.is_terminal() {
        let _ = stdin.read_to_end(&mut payload);
    }
    payload
}

fn is_statusline(agent: &str, event: &str) -> bool {
    agent == "claude" && event == "statusline"
}

/// The socket lines one hook run sends, in order; empty when it has nothing
/// to report (unknown event, a sub-agent's frame, no pane identity).
pub fn frames(agent: &str, event: &str, payload: &[u8], env: &HookEnv) -> Vec<String> {
    if is_statusline(agent, event) {
        return vec![limits_frame(payload, env)];
    }
    if env.project.is_empty() || env.pane.is_empty() {
        return Vec::new();
    }
    let payload = serde_json::from_slice::<Value>(payload).unwrap_or(Value::Null);
    match agent {
        "claude" => claude_frames(event, &payload, env),
        "codex" => codex_frames(event, &payload, env),
        _ => Vec::new(),
    }
}

fn claude_frames(event: &str, payload: &Value, env: &HookEnv) -> Vec<String> {
    let sid = str_field(payload, "session_id");
    // Keyed by Claude's own session id so one session's frames share a key even
    // if the pane id shifts, with the pane as the fallback key.
    let key = format!("claude_code_{}", sid.unwrap_or(&env.pane));
    match event {
        "SessionStart" => sid
            .map(|sid| resume_frame("claude", sid, env))
            .into_iter()
            .collect(),
        "UserPromptSubmit" | "PreToolUse" | "PostToolUse" => {
            vec![status_frame(&key, CLAUDE_RUNNING, env)]
        }
        "Notification" => vec![status_frame(&key, WAITING, env)],
        "Stop" => vec![status_frame(&key, claude_stop_status(payload), env)],
        "StopFailure" => vec![status_frame(&key, ERROR, env)],
        "SessionEnd" => vec![format!(
            "clear_status {} {}{}",
            quote_arg(&env.project),
            token(&key),
            reporter(env)
        )],
        _ => Vec::new(),
    }
}

/// `Stop` fires at every turn boundary, including a turn that handed off to
/// background work the harness will wake the session for; that is a pause, so it
/// re-asserts Running. Only a turn with nothing in flight but settled task types
/// is Done. A payload without `background_tasks` (an older Claude), an empty
/// list, or one whose entries aren't objects reports Done, as the sh hook does.
fn claude_stop_status(payload: &Value) -> &'static str {
    let Some(tasks) = payload.get("background_tasks").and_then(Value::as_array) else {
        return DONE;
    };
    if !tasks.first().is_some_and(Value::is_object) {
        return DONE;
    }
    let settled = tasks.iter().all(|task| {
        task.get("type")
            .and_then(Value::as_str)
            .is_some_and(|kind| SETTLED_TASK_TYPES.contains(&kind))
    });
    if settled {
        DONE
    } else {
        CLAUDE_RUNNING
    }
}

fn codex_frames(event: &str, payload: &Value, env: &HookEnv) -> Vec<String> {
    let key = format!("codex_{}", env.pane);
    // Codex runs the tab's hooks inside thread-spawned sub-agents too; their
    // payloads carry `agent_id` and their turns end in SubagentStop, so only the
    // root thread may speak for the tab's status.
    let root = payload.get("agent_id").is_none();
    let status = |value: &str| root.then(|| status_frame(&key, value, env));
    match event {
        "SessionStart" => status(CODEX_RUNNING)
            .into_iter()
            .chain(str_field(payload, "session_id").map(|sid| resume_frame("codex", sid, env)))
            .collect(),
        "UserPromptSubmit" | "PostToolUse" => status(CODEX_RUNNING).into_iter().collect(),
        "PreToolUse" => {
            let value = if str_field(payload, "tool_name") == Some("request_user_input") {
                WAITING
            } else {
                CODEX_RUNNING
            };
            status(value).into_iter().collect()
        }
        "PermissionRequest" => {
            let auto = str_field(payload, "transcript_path")
                .is_some_and(|path| routes_to_auto_review(Path::new(path)));
            if auto {
                Vec::new()
            } else {
                vec![status_frame(&key, WAITING, env)]
            }
        }
        "Stop" => status(DONE).into_iter().collect(),
        _ => Vec::new(),
    }
}

/// Whether Codex sends this session's approvals to its automatic reviewer, which
/// never prompts the user, read from the rollout's last `turn_context`. Any read
/// failure answers no, so the request still shows as Waiting.
fn routes_to_auto_review(rollout: &Path) -> bool {
    let Ok(mut file) = File::open(rollout) else {
        return false;
    };
    let Ok(len) = file.metadata().map(|meta| meta.len()) else {
        return false;
    };
    for window in ROLLOUT_WINDOWS.into_iter().chain([u64::MAX]) {
        let start = len.saturating_sub(window);
        if file.seek(SeekFrom::Start(start)).is_err() {
            return false;
        }
        if let Some(line) = last_line_with(&mut file, br#""type":"turn_context""#) {
            let has = |needle: &[u8]| contains(&line, needle);
            return (has(br#""approval_policy":"on-request""#)
                || has(br#""approval_policy":{"granular""#))
                && has(br#""approvals_reviewer":"auto_review""#);
        }
        if start == 0 {
            break;
        }
    }
    false
}

fn last_line_with(file: &mut File, needle: &[u8]) -> Option<Vec<u8>> {
    let mut last = None;
    for line in BufReader::new(file).split(b'\n') {
        let line = line.ok()?;
        if contains(&line, needle) {
            last = Some(line);
        }
    }
    last
}

fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    haystack
        .windows(needle.len())
        .any(|window| window == needle)
}

fn limits_frame(payload: &[u8], env: &HookEnv) -> String {
    let end = payload
        .iter()
        .rposition(|&b| b != b'\n')
        .map_or(0, |i| i + 1);
    format!(
        "agent_limits {} --payload-b64={}",
        token(&limits_account(env.config_dir.as_deref())),
        base64(&payload[..end])
    )
}

/// The account a statusline reading is filed under: the last path component of
/// a CLAUDE_CONFIG_DIR inside lpm's `claude-accounts`, else `default`. Either
/// separator counts, so a Windows `…\claude-accounts\work` names `work` too.
pub fn limits_account(config_dir: Option<&str>) -> String {
    config_dir
        .map(|dir| dir.replace('\\', "/"))
        .filter(|dir| dir.contains("/claude-accounts/"))
        .and_then(|dir| dir.rsplit('/').next().map(str::to_string))
        .filter(|id| !id.is_empty())
        .unwrap_or_else(|| "default".to_string())
}

fn status_frame(key: &str, value: &str, env: &HookEnv) -> String {
    format!(
        "set_status {} {} {value} --pane={}{}",
        quote_arg(&env.project),
        token(key),
        token(&env.pane),
        reporter(env)
    )
}

fn resume_frame(provider: &str, sid: &str, env: &HookEnv) -> String {
    format!(
        "set_resume {} {} {} --provider={provider}{}",
        quote_arg(&env.project),
        token(&env.pane),
        token(sid),
        reporter(env)
    )
}

fn reporter(env: &HookEnv) -> String {
    env.reporter_pid
        .map(|pid| format!(" --reporter-pid={pid}"))
        .unwrap_or_default()
}

/// An identifier as one socket-command token: bare when it is plainly a token,
/// quoted otherwise so the app's shell_split still reads it whole.
fn token(s: &str) -> String {
    let plain = !s.is_empty()
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || "-_.:".contains(c));
    if plain {
        s.to_string()
    } else {
        quote_arg(s)
    }
}

fn str_field<'a>(payload: &'a Value, name: &str) -> Option<&'a str> {
    payload
        .get(name)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
}

pub fn base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = (u32::from(chunk[0]) << 16)
            | (u32::from(*chunk.get(1).unwrap_or(&0)) << 8)
            | u32::from(*chunk.get(2).unwrap_or(&0));
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(TABLE[(n >> (18 - 6 * i)) as usize & 63] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

#[cfg(test)]
#[path = "hook_tests.rs"]
mod tests;
