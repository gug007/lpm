// A commit a git hook stopped (pre-commit, commit-msg, …), told apart from one
// that failed for any other reason. Git doesn't say which in its output, so the
// commit runs with trace2 events written to a file of their own: they name every
// hook git started and how it exited, without touching what the hook prints.
use crate::githook_text::{clean, summarize, tail};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};

/// Lines of hook output a plain error message keeps, for callers that show
/// the error as text (lpm Link, a split commit's toast).
const MESSAGE_LINES: usize = 40;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HookFailure {
    /// The hook's name, as git calls it: "pre-commit", "commit-msg".
    pub hook: String,
    /// What it found in a few words, when its output says: "eslint · 3 errors in src/a.ts".
    pub summary: Option<String>,
    /// What it printed, colours and spinner redraws taken out.
    pub output: String,
    /// The picked files the hook rewrote (a formatter), left unstaged by it.
    pub changed: Vec<String>,
}

impl HookFailure {
    fn headline(&self) -> String {
        format!("The {} hook stopped this commit", self.hook)
    }

    /// The failure as one error string: the headline and summary on the first
    /// line, the end of the output after a blank line.
    pub fn message(&self) -> String {
        let head = match &self.summary {
            Some(summary) => format!("{}: {summary}", self.headline()),
            None => self.headline(),
        };
        let output = tail(&self.output, MESSAGE_LINES);
        if output.is_empty() {
            head
        } else {
            format!("{head}\n\n{output}")
        }
    }
}

/// Why a commit didn't happen.
#[derive(Debug)]
pub(crate) enum Stopped {
    Hook(HookFailure),
    Other(String),
}

impl From<String> for Stopped {
    fn from(error: String) -> Self {
        Stopped::Other(error)
    }
}

impl Stopped {
    pub(crate) fn into_message(self) -> String {
        match self {
            Stopped::Hook(failure) => failure.message(),
            Stopped::Other(error) => error,
        }
    }
}

/// Where git writes the commit's trace2 events: a temp file on this machine, or
/// on the host for an SSH project, since git runs there.
struct Trace {
    cwd: String,
    path: String,
    remote: bool,
}

impl Trace {
    fn new(cwd: &str) -> Self {
        static SEQ: AtomicU64 = AtomicU64::new(0);
        let name = format!(
            "lpm-commit-{}-{}-{}.trace",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or_default(),
            SEQ.fetch_add(1, Ordering::Relaxed)
        );
        let remote = crate::sshexec::remote_project_for_path(cwd).is_some();
        let path = if remote {
            format!("/tmp/{name}")
        } else {
            std::env::temp_dir().join(name).to_string_lossy().into_owned()
        };
        Self {
            cwd: cwd.to_string(),
            path,
            remote,
        }
    }

    /// The events, read only when `read`, and the file removed either way.
    fn take(self, read: bool) -> String {
        if self.remote {
            let script = if read {
                "cat \"$1\" 2>/dev/null; rm -f \"$1\""
            } else {
                "rm -f \"$1\""
            };
            return crate::git::tool_out(&self.cwd, "sh", &["-c", script, "sh", &self.path], &[])
                .unwrap_or_default();
        }
        let events = if read {
            std::fs::read_to_string(&self.path).unwrap_or_default()
        } else {
            String::new()
        };
        let _ = std::fs::remove_file(&self.path);
        events
    }
}

/// Run `git <args>` (a commit) in `cwd`. `skip_hooks` adds `--no-verify`.
/// `files` are the paths picked for the commit, to tell which of them a hook
/// rewrote.
pub(crate) fn commit(
    cwd: &str,
    args: &[&str],
    skip_hooks: bool,
    files: &[String],
) -> Result<(), Stopped> {
    let mut args = args.to_vec();
    if skip_hooks {
        args.push("--no-verify");
    }
    let trace = Trace::new(cwd);
    let result = crate::git::git_out_env(cwd, &args, &[("GIT_TRACE2_EVENT", trace.path.as_str())]);
    let events = trace.take(result.is_err());
    let Err(raw) = result else {
        return Ok(());
    };
    match failed_hook(&events) {
        Some(hook) => Err(Stopped::Hook(failure(cwd, hook, &raw, files))),
        None => Err(Stopped::Other(raw)),
    }
}

fn failure(cwd: &str, hook: String, raw: &str, files: &[String]) -> HookFailure {
    let output = clean(raw);
    HookFailure {
        summary: summarize(&output, cwd),
        changed: rewritten(cwd, files),
        hook,
        output,
    }
}

/// The picked files whose working copy no longer matches what was staged for
/// the commit: a formatter hook's fixes, which it leaves for the next commit.
fn rewritten(cwd: &str, files: &[String]) -> Vec<String> {
    if files.is_empty() {
        return Vec::new();
    }
    let paths: Vec<&str> = files.iter().map(String::as_str).collect();
    let args = crate::git::path_args(&["diff", "--name-only", "-z"], &paths);
    crate::git::git_out(cwd, &args)
        .map(|out| {
            out.split('\0')
                .filter(|p| !p.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

/// The hook that exited with an error, from the commit's trace2 events. Only
/// the commit's own events count: a hook that runs git (lint-staged does)
/// starts processes that write to the same file under a sid of their own.
pub(crate) fn failed_hook(trace: &str) -> Option<String> {
    let mut root: Option<String> = None;
    let mut hooks: HashMap<i64, String> = HashMap::new();
    let mut failed = None;
    for line in trace.lines() {
        let Ok(event) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let Some(sid) = event.get("sid").and_then(Value::as_str) else {
            continue;
        };
        match &root {
            None => root = Some(sid.to_string()),
            Some(own) if own != sid => continue,
            Some(_) => {}
        }
        let Some(child) = event.get("child_id").and_then(Value::as_i64) else {
            continue;
        };
        match event.get("event").and_then(Value::as_str) {
            Some("child_start")
                if event.get("child_class").and_then(Value::as_str) == Some("hook") =>
            {
                hooks.insert(child, hook_name(&event));
            }
            Some("child_exit") => {
                let code = event.get("code").and_then(Value::as_i64).unwrap_or(0);
                if code != 0 {
                    if let Some(name) = hooks.get(&child) {
                        failed = Some(name.clone());
                    }
                }
            }
            _ => {}
        }
    }
    failed
}

/// `hook_name` when git gives it, else the name of the file it ran.
fn hook_name(event: &Value) -> String {
    if let Some(name) = event.get("hook_name").and_then(Value::as_str) {
        if !name.is_empty() {
            return name.to_string();
        }
    }
    event
        .get("argv")
        .and_then(Value::as_array)
        .and_then(|argv| argv.first())
        .and_then(Value::as_str)
        .and_then(|program| program.rsplit(['/', '\\']).next())
        .filter(|name| !name.is_empty())
        .unwrap_or("commit")
        .to_string()
}

/// Commit `files` with `message`, or amend the last commit (`amend` is its
/// hash): `null` once it's made, the hook's report when a hook stopped it, and
/// an error for anything else.
#[tauri::command(async)]
pub fn git_commit_checked(
    cwd: String,
    message: String,
    files: Vec<String>,
    amend: Option<String>,
    skip_hooks: bool,
) -> Result<Option<HookFailure>, String> {
    let done = match amend.filter(|hash| !hash.is_empty()) {
        Some(hash) => crate::gitundo::amend_files(&cwd, &message, &files, &hash, skip_hooks),
        None => crate::git::commit_files(&cwd, &message, &files, skip_hooks),
    };
    match done {
        Ok(()) => Ok(None),
        Err(Stopped::Hook(failure)) => Ok(Some(failure)),
        Err(Stopped::Other(error)) => Err(error),
    }
}

#[cfg(test)]
#[path = "githook_tests.rs"]
mod tests;
