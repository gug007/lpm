// Git subsystem — port of desktop/git.go + desktop/watcher.go. All commands are
// synchronous `git`/`gh` subprocess wrappers; the watcher uses the `notify`
// crate. Struct JSON field names must match what the frontend deserializes.
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::RecvTimeoutError;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

// ---- helpers ----------------------------------------------------------------

/// Build a git/gh invocation, routed to the project's SSH host when `cwd`
/// resolves to a remote project, else run as a local subprocess. Remote commands
/// carry the cwd + env inside the ssh script (see sshexec); local commands set
/// them on the child directly. Every downstream helper funnels through here, so a
/// remote project's whole git surface follows without per-command changes.
fn tool_command(cwd: &str, program: &str, args: &[&str], envs: &[(&str, &str)]) -> Command {
    match crate::sshexec::remote_project_for_path(cwd) {
        Some(ssh) => crate::sshexec::remote_command(&ssh, cwd, program, args, envs),
        None => {
            let mut cmd = Command::new(program);
            cmd.args(args).current_dir(cwd);
            for (k, v) in envs {
                cmd.env(k, v);
            }
            cmd
        }
    }
}

fn git_command(cwd: &str, args: &[&str], envs: &[(&str, &str)]) -> Command {
    tool_command(cwd, "git", args, envs)
}

/// Run git in `cwd`, trimmed stdout on success; trimmed stderr (or status) on error.
fn git_out(cwd: &str, args: &[&str]) -> Result<String, String> {
    git_out_env(cwd, args, &[])
}

/// Like `git_out`, with extra environment variables set on the git process.
fn git_out_env(cwd: &str, args: &[&str], envs: &[(&str, &str)]) -> Result<String, String> {
    let out = git_command(cwd, args, envs)
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        if !stderr.is_empty() {
            return Err(stderr);
        }
        return Err(format!("git exited with status {}", out.status));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Raw stdout (NOT trimmed, exit code ignored). For porcelain -z (leading
/// spaces matter) and `diff --no-index` (exits 1 on differences).
fn git_raw(cwd: &str, args: &[&str]) -> String {
    git_command(cwd, args, &[])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
        .unwrap_or_default()
}

/// Raw stdout bytes of a successful command, empty otherwise. Bytes (not lossy
/// UTF-8) so binary content is detectable before it is decoded for display.
fn git_bytes(cwd: &str, args: &[&str]) -> Vec<u8> {
    git_command(cwd, args, &[])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| o.stdout)
        .unwrap_or_default()
}

fn branch_exists(cwd: &str, ref_: &str) -> bool {
    git_out(cwd, &["show-ref", "--verify", "--quiet", ref_]).is_ok()
}

/// Resolve a branch name to a usable ref: local head as-is, else origin/<name>,
/// else first other remote/<name>, else unchanged.
fn resolve_branch_ref(cwd: &str, name: &str) -> String {
    if branch_exists(cwd, &format!("refs/heads/{name}")) {
        return name.to_string();
    }
    let heads = format!("refs/heads/{name}");
    let remotes = format!("refs/remotes/*/{name}");
    let out = git_out(
        cwd,
        &["for-each-ref", "--format=%(refname)", &heads, &remotes],
    )
    .unwrap_or_default();
    let origin = format!("refs/remotes/origin/{name}");
    let mut first_remote = String::new();
    for line in out.lines() {
        let l = line.trim();
        if l == origin {
            return format!("origin/{name}");
        }
        if first_remote.is_empty() {
            if let Some(rest) = l.strip_prefix("refs/remotes/") {
                first_remote = rest.to_string();
            }
        }
    }
    if !first_remote.is_empty() {
        return first_remote;
    }
    name.to_string()
}

/// Resolve and validate a base branch for the `_ref` (base...HEAD) commands.
fn resolve_base(cwd: &str, base: &str) -> Result<String, String> {
    if base.is_empty() {
        return Err("base branch required".into());
    }
    Ok(resolve_branch_ref(cwd, base))
}

/// Shared prefix for read-only porcelain status queries. --no-optional-locks
/// keeps these frequently-polled reads from contending on the index lock.
const STATUS_PORCELAIN: &[&str] = &["--no-optional-locks", "status", "--porcelain=v1", "-z"];

/// Map a porcelain/diff status code byte to its display status.
fn status_label(code: u8) -> &'static str {
    match code {
        b'A' => "added",
        b'D' => "deleted",
        b'R' | b'C' => "renamed",
        _ => "modified",
    }
}

fn parse_ahead_behind(tail: &str) -> (i64, i64) {
    let (mut ahead, mut behind) = (0i64, 0i64);
    if let (Some(s), Some(e)) = (tail.find('['), tail.find(']')) {
        for part in tail[s + 1..e].split(',') {
            let p = part.trim();
            if let Some(n) = p.strip_prefix("ahead ") {
                ahead = n.trim().parse().unwrap_or(0);
            } else if let Some(n) = p.strip_prefix("behind ") {
                behind = n.trim().parse().unwrap_or(0);
            }
        }
    }
    (ahead, behind)
}

fn pull_args(strategy: &str) -> Vec<&'static str> {
    match strategy {
        "rebase" => vec!["pull", "--rebase"],
        "ff" => vec!["pull"],
        _ => vec!["pull", "--ff-only"],
    }
}

// ---- structs (JSON field names must match the frontend) ---------------------

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub branch: String,
    pub detached: bool,
    pub uncommitted: i64,
    pub is_git_repo: bool,
    pub has_upstream: bool,
    pub ahead: i64,
    pub behind: i64,
}

#[derive(Serialize)]
pub struct ChangedFile {
    pub path: String,
    pub status: String,
    pub staged: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub committer_date: i64,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub remote: String,
}

#[derive(Serialize)]
pub struct BranchCommit {
    pub hash: String,
    pub subject: String,
    pub author: String,
    pub date: String, // relative (%ar)
}

// ---- status / changed files / diff ------------------------------------------

fn parse_status_header(header: &str, st: &mut GitStatus, cwd: &str) {
    if header == "HEAD (no branch)" {
        st.detached = true;
        st.branch = git_out(cwd, &["rev-parse", "--short", "HEAD"]).unwrap_or_default();
        return;
    }
    if let Some(rest) = header.strip_prefix("No commits yet on ") {
        st.branch = rest.to_string();
        return;
    }
    if let Some(i) = header.find("...") {
        st.branch = header[..i].to_string();
        st.has_upstream = true;
        let (a, b) = parse_ahead_behind(&header[i + 3..]);
        st.ahead = a;
        st.behind = b;
        return;
    }
    st.branch = match header.find(' ') {
        Some(i) => header[..i].to_string(),
        None => header.to_string(),
    };
}

#[tauri::command(async)]
pub fn git_status(cwd: String) -> GitStatus {
    // Note: default (collapsed) untracked counting — a wholly-untracked dir
    // counts as one entry here; the file list (git_changed_files) expands it.
    let out = match git_out(&cwd, &[STATUS_PORCELAIN, &["--branch"]].concat()) {
        Ok(o) => o,
        Err(_) => return GitStatus::default(),
    };
    let mut st = GitStatus {
        is_git_repo: true,
        ..Default::default()
    };
    let entries: Vec<&str> = out.split('\u{0}').collect();
    let mut start = 0;
    if let Some(first) = entries.first() {
        if let Some(header) = first.strip_prefix("## ") {
            parse_status_header(header, &mut st, &cwd);
            start = 1;
        }
    }
    let (mut staged, mut unstaged, mut untracked) = (0i64, 0i64, 0i64);
    let mut i = start;
    while i < entries.len() {
        let entry = entries[i];
        if entry.len() < 2 {
            i += 1;
            continue;
        }
        let b = entry.as_bytes();
        let (x, y) = (b[0], b[1]);
        if matches!(x, b'R' | b'C') || matches!(y, b'R' | b'C') {
            i += 1; // skip the from-path chunk
        }
        if x == b'?' && y == b'?' {
            untracked += 1;
        } else {
            if x != b' ' {
                staged += 1;
            }
            if y != b' ' {
                unstaged += 1;
            }
        }
        i += 1;
    }
    st.uncommitted = if staged > unstaged {
        staged + untracked
    } else {
        unstaged + untracked
    };
    st
}

#[tauri::command(async)]
pub fn git_changed_files(cwd: String) -> Vec<ChangedFile> {
    // --untracked-files=all lists each untracked file individually; without it
    // git collapses a wholly-untracked directory into one `dir/` entry, which
    // renders as a blank (no filename) row.
    let raw = git_raw(
        &cwd,
        &[STATUS_PORCELAIN, &["--untracked-files=all"]].concat(),
    );
    let entries: Vec<&str> = raw.split('\u{0}').collect();
    let mut files = Vec::new();
    let mut i = 0;
    while i < entries.len() {
        let entry = entries[i];
        if entry.len() < 4 {
            i += 1;
            continue;
        }
        let b = entry.as_bytes();
        let (x, y) = (b[0], b[1]);
        // Trailing slash can survive for an untracked nested repo even with
        // --untracked-files=all; trim it so the path never renders blank.
        let path = entry[3..].trim_end_matches('/').to_string();
        let consumes_two = matches!(x, b'R' | b'C') || matches!(y, b'R' | b'C');
        if x == b'?' && y == b'?' {
            files.push(ChangedFile {
                path,
                status: "untracked".into(),
                staged: false,
            });
        } else {
            let mut status = "modified";
            let mut staged = false;
            if x != b' ' && x != b'?' {
                staged = true;
                status = status_label(x);
            } else if y == b'D' {
                status = "deleted";
            }
            files.push(ChangedFile {
                path,
                status: status.into(),
                staged,
            });
        }
        if consumes_two {
            i += 1;
        }
        i += 1;
    }
    files
}

/// Parse a single `git status --porcelain -z --branch --untracked-files=all`
/// output into both the status header (branch/ahead-behind) and the expanded
/// changed-file list, reusing the same parsing rules as `git_status` +
/// `git_changed_files`. Pure so it is unit-testable without a real repo. `cwd`
/// is only consulted for the detached/no-commits header cases.
fn parse_status_and_files(raw: &str, cwd: &str) -> (GitStatus, Vec<ChangedFile>) {
    let mut st = GitStatus {
        is_git_repo: true,
        ..Default::default()
    };
    let entries: Vec<&str> = raw.split('\u{0}').collect();
    let mut start = 0;
    if let Some(first) = entries.first() {
        if let Some(header) = first.strip_prefix("## ") {
            parse_status_header(header, &mut st, cwd);
            start = 1;
        }
    }
    let (mut staged, mut unstaged, mut untracked) = (0i64, 0i64, 0i64);
    let mut files = Vec::new();
    let mut i = start;
    while i < entries.len() {
        let entry = entries[i];
        if entry.len() < 4 {
            i += 1;
            continue;
        }
        let b = entry.as_bytes();
        let (x, y) = (b[0], b[1]);
        let consumes_two = matches!(x, b'R' | b'C') || matches!(y, b'R' | b'C');
        // Trailing slash can survive for an untracked nested repo even with
        // --untracked-files=all; trim it so the path never renders blank.
        let path = entry[3..].trim_end_matches('/').to_string();
        if x == b'?' && y == b'?' {
            untracked += 1;
            files.push(ChangedFile {
                path,
                status: "untracked".into(),
                staged: false,
            });
        } else {
            if x != b' ' {
                staged += 1;
            }
            if y != b' ' {
                unstaged += 1;
            }
            let mut status = "modified";
            let mut staged_f = false;
            if x != b' ' && x != b'?' {
                staged_f = true;
                status = status_label(x);
            } else if y == b'D' {
                status = "deleted";
            }
            files.push(ChangedFile {
                path,
                status: status.into(),
                staged: staged_f,
            });
        }
        if consumes_two {
            i += 1; // skip the from-path chunk of a rename/copy
        }
        i += 1;
    }
    st.uncommitted = if staged > unstaged {
        staged + untracked
    } else {
        unstaged + untracked
    };
    (st, files)
}

/// Status header + expanded changed-file list from ONE porcelain scan, for
/// callers that need both without paying for two `git status` invocations (the
/// phone's review snapshot). Note the counting difference from `git_status`:
/// `--untracked-files=all` counts every untracked file, so a wholly-untracked
/// directory inflates `uncommitted` here — acceptable where the expanded file
/// list is shown anyway. `git_status`/`git_changed_files` keep their behavior.
pub fn git_status_and_files(cwd: &str) -> (GitStatus, Vec<ChangedFile>) {
    let out = git_command(
        cwd,
        &[STATUS_PORCELAIN, &["--branch", "--untracked-files=all"]].concat(),
        &[],
    )
    .output();
    let raw = match out {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).into_owned(),
        _ => return (GitStatus::default(), Vec::new()),
    };
    parse_status_and_files(&raw, cwd)
}

#[tauri::command(async)]
pub fn git_diff(cwd: String, files: Vec<String>) -> Result<String, String> {
    if files.is_empty() {
        return Err("no files".into());
    }
    let mut dargs: Vec<&str> = vec!["diff", "HEAD", "--"];
    dargs.extend(files.iter().map(String::as_str));
    let tracked = git_out(&cwd, &dargs).unwrap_or_default();

    let mut largs: Vec<&str> = vec!["ls-files", "--"];
    largs.extend(files.iter().map(String::as_str));
    let ls = git_out(&cwd, &largs).unwrap_or_default();
    let tracked_set: HashSet<&str> = ls
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect();

    let mut out = String::new();
    out.push_str(&tracked);
    if !tracked.is_empty() {
        out.push('\n');
    }
    for f in &files {
        if !tracked_set.contains(f.as_str()) {
            let d = git_raw(&cwd, &["diff", "--no-index", "--", "/dev/null", f]);
            if !d.is_empty() {
                out.push_str(&d);
                out.push('\n');
            }
        }
    }
    Ok(out)
}

/// One file's raw diff in a batch reply. `diff` is the unified diff text (empty
/// for a file with no changes); binary detection + size capping are applied by
/// the caller, exactly as the single-file path does. `error` is reserved for a
/// per-file failure that shouldn't sink the whole batch (unused today — a file
/// that can't be diffed degrades to an empty `diff`, mirroring `git_diff`).
pub struct BatchDiff {
    pub path: String,
    pub diff: String,
    pub error: Option<String>,
}

/// Tokenize a `diff --git …` header tail into whitespace-separated tokens,
/// keeping a C-quoted token (`"…"`, with `\"`/`\\` escapes) intact even when it
/// contains spaces. Quote/space/backslash are ASCII, and non-ASCII bytes only
/// appear octal-escaped inside quotes (core.quotePath) or raw inside an
/// unquoted token, so byte scanning never splits a multibyte char.
fn header_tokens(s: &str) -> Vec<&str> {
    let bytes = s.as_bytes();
    let mut toks = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        while i < bytes.len() && bytes[i] == b' ' {
            i += 1;
        }
        if i >= bytes.len() {
            break;
        }
        let start = i;
        if bytes[i] == b'"' {
            i += 1;
            while i < bytes.len() {
                match bytes[i] {
                    b'\\' => i += 2,
                    b'"' => {
                        i += 1;
                        break;
                    }
                    _ => i += 1,
                }
            }
        } else {
            while i < bytes.len() && bytes[i] != b' ' {
                i += 1;
            }
        }
        toks.push(&s[start..i.min(s.len())]);
    }
    toks
}

/// Decode git's C-style quoted path (`"caf\303\251.txt"`) to its literal form.
/// Handles `\n \t \r \" \\` and 3-digit octal byte escapes; reassembled bytes
/// are lossily decoded so a UTF-8 path round-trips.
fn c_unquote(tok: &str) -> String {
    let inner = tok
        .strip_prefix('"')
        .and_then(|s| s.strip_suffix('"'))
        .unwrap_or(tok);
    let bytes = inner.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'\\' && i + 1 < bytes.len() {
            match bytes[i + 1] {
                b'n' => {
                    out.push(b'\n');
                    i += 2;
                }
                b't' => {
                    out.push(b'\t');
                    i += 2;
                }
                b'r' => {
                    out.push(b'\r');
                    i += 2;
                }
                b'"' => {
                    out.push(b'"');
                    i += 2;
                }
                b'\\' => {
                    out.push(b'\\');
                    i += 2;
                }
                b'0'..=b'7' => {
                    let mut val: u32 = 0;
                    let mut j = i + 1;
                    let mut n = 0;
                    while j < bytes.len() && n < 3 && (b'0'..=b'7').contains(&bytes[j]) {
                        val = val * 8 + u32::from(bytes[j] - b'0');
                        j += 1;
                        n += 1;
                    }
                    out.push(val as u8);
                    i = j;
                }
                _ => {
                    out.push(bytes[i]);
                    i += 1;
                }
            }
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Extract the current-side (`b/`) path from a `diff --git a/… b/…` header,
/// unquoting git's C-style form. Returns None when the header is the ambiguous
/// unquoted-path-with-spaces form (more than two tokens), so the caller can fall
/// back to a per-file diff for that path.
fn diff_git_b_path(line: &str) -> Option<String> {
    let rest = line.trim_end().strip_prefix("diff --git ")?;
    let toks = header_tokens(rest);
    if toks.len() != 2 {
        return None;
    }
    let b = toks[1];
    let b = if b.starts_with('"') {
        c_unquote(b)
    } else {
        b.to_string()
    };
    b.strip_prefix("b/").map(str::to_string)
}

/// Split a multi-file `git diff` into (b-path, chunk) pairs, one per `diff
/// --git` header. A chunk whose header path can't be resolved is paired with an
/// empty path so the caller can fall back to a per-file diff for it.
fn split_diff_by_file(diff: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let mut path: Option<String> = None;
    let mut chunk = String::new();
    for line in diff.split_inclusive('\n') {
        if line.starts_with("diff --git ") {
            if let Some(p) = path.take() {
                out.push((p, std::mem::take(&mut chunk)));
            } else {
                chunk.clear(); // drop any preamble before the first header
            }
            path = Some(diff_git_b_path(line).unwrap_or_default());
        }
        chunk.push_str(line);
    }
    if let Some(p) = path.take() {
        out.push((p, chunk));
    }
    out
}

/// Batch form of `git_diff`: one entry per requested path (order preserved),
/// from a single `git diff HEAD -- <tracked paths>` split per file, plus a
/// `git diff --no-index` for each untracked path. A tracked path whose header
/// couldn't be matched (or that had no changes) falls back to a per-file
/// `git diff HEAD --`, so every requested path yields an entry.
pub fn git_diffs(cwd: &str, paths: &[String]) -> Vec<BatchDiff> {
    if paths.is_empty() {
        return Vec::new();
    }
    let mut largs: Vec<&str> = vec!["ls-files", "--"];
    largs.extend(paths.iter().map(String::as_str));
    let ls = git_out(cwd, &largs).unwrap_or_default();
    let tracked: HashSet<&str> = ls
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect();

    let tracked_paths: Vec<&str> = paths
        .iter()
        .map(String::as_str)
        .filter(|p| tracked.contains(p))
        .collect();
    let mut matched: HashMap<String, String> = HashMap::new();
    if !tracked_paths.is_empty() {
        let mut dargs: Vec<&str> = vec!["diff", "HEAD", "--"];
        dargs.extend(&tracked_paths);
        let batch = git_out(cwd, &dargs).unwrap_or_default();
        for (p, chunk) in split_diff_by_file(&batch) {
            if !p.is_empty() {
                matched.insert(p, chunk);
            }
        }
    }

    paths
        .iter()
        .map(|p| {
            let diff = if tracked.contains(p.as_str()) {
                match matched.remove(p) {
                    Some(d) => d,
                    // Ambiguous header or no changes: cheap per-file fallback.
                    None => git_out(cwd, &["diff", "HEAD", "--", p]).unwrap_or_default(),
                }
            } else {
                git_raw(cwd, &["diff", "--no-index", "--", "/dev/null", p])
            };
            BatchDiff {
                path: p.clone(),
                diff,
                error: None,
            }
        })
        .collect()
}

#[tauri::command(async)]
pub fn git_diff_branch(cwd: String, base: String) -> Result<String, String> {
    let base = resolve_base(&cwd, &base)?;
    git_out(&cwd, &["diff", &format!("{base}...HEAD")])
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    original: String,
    modified: String,
    binary: bool,
    too_large: bool,
}

// Either side beyond this ships two full strings over IPC and makes Monaco diff
// them; past it we render a placeholder instead (like the binary case).
const MAX_DIFF_SIDE_BYTES: usize = 4 * 1024 * 1024;

fn is_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(8000).any(|&b| b == 0)
}

/// Path a renamed file had at HEAD, so the original side resolves to the right
/// blob. porcelain v1 -z emits a rename as `R.. <dest>` then a `<src>` chunk.
fn rename_source(cwd: &str, new_path: &str) -> Option<String> {
    let raw = git_raw(cwd, &[STATUS_PORCELAIN, &["--", new_path]].concat());
    let entries: Vec<&str> = raw.split('\u{0}').filter(|e| !e.is_empty()).collect();
    for (i, e) in entries.iter().enumerate() {
        let b = e.as_bytes();
        if b.len() >= 2 && (matches!(b[0], b'R' | b'C') || matches!(b[1], b'R' | b'C')) {
            return entries.get(i + 1).map(|s| s.to_string());
        }
    }
    None
}

/// HEAD vs working-tree content of one file, for a side-by-side (Monaco) view.
/// `original` is empty for an added file, `modified` empty for a deleted one.
#[tauri::command(async)]
pub fn git_file_diff(
    cwd: String,
    path: String,
    status: Option<String>,
) -> Result<FileDiff, String> {
    let work = std::path::Path::new(&cwd).join(&path);
    let mod_bytes = std::fs::read(&work).unwrap_or_default();

    let mut orig_bytes = git_bytes(&cwd, &["show", &format!("HEAD:{path}")]);
    // The rename probe is a full `git status` scan; only a renamed file needs it.
    // A missing status (legacy caller) keeps the old always-probe behavior.
    let probe = matches!(status.as_deref(), Some("renamed") | None);
    if probe && orig_bytes.is_empty() && work.exists() {
        if let Some(src) = rename_source(&cwd, &path) {
            orig_bytes = git_bytes(&cwd, &["show", &format!("HEAD:{src}")]);
        }
    }

    Ok(file_diff_from_blobs(orig_bytes, mod_bytes))
}

/// Parse `git diff --name-status -z` output into changed files. A rename/copy
/// emits `<code>\0<old>\0<new>\0`; the new path is the one shown.
fn parse_name_status_z(raw: &str, staged: bool) -> Vec<ChangedFile> {
    let parts: Vec<&str> = raw.split('\u{0}').filter(|e| !e.is_empty()).collect();
    let mut files = Vec::new();
    let mut i = 0;
    while i < parts.len() {
        let code = parts[i].as_bytes().first().copied().unwrap_or(b'M');
        let is_rename = matches!(code, b'R' | b'C');
        let path_idx = if is_rename { i + 2 } else { i + 1 };
        let Some(path) = parts.get(path_idx) else {
            break;
        };
        files.push(ChangedFile {
            path: (*path).to_string(),
            status: status_label(code).into(),
            staged,
        });
        i = path_idx + 1;
    }
    files
}

fn file_diff_from_blobs(orig: Vec<u8>, modi: Vec<u8>) -> FileDiff {
    if is_binary(&orig) || is_binary(&modi) {
        return FileDiff {
            original: String::new(),
            modified: String::new(),
            binary: true,
            too_large: false,
        };
    }
    if orig.len() > MAX_DIFF_SIDE_BYTES || modi.len() > MAX_DIFF_SIDE_BYTES {
        return FileDiff {
            original: String::new(),
            modified: String::new(),
            binary: false,
            too_large: true,
        };
    }
    FileDiff {
        original: String::from_utf8_lossy(&orig).into_owned(),
        modified: String::from_utf8_lossy(&modi).into_owned(),
        binary: false,
        too_large: false,
    }
}

/// Files changed on this branch versus `base` (the `base...HEAD` range), for a
/// read-only branch review.
#[tauri::command(async)]
pub fn git_changed_files_ref(cwd: String, base: String) -> Result<Vec<ChangedFile>, String> {
    let base = resolve_base(&cwd, &base)?;
    let raw = git_raw(
        &cwd,
        &[
            "diff",
            "--name-status",
            "-z",
            "-M",
            &format!("{base}...HEAD"),
        ],
    );
    Ok(parse_name_status_z(&raw, false))
}

/// Files staged in the index (`git diff --cached`), for a read-only staged review.
#[tauri::command(async)]
pub fn git_changed_files_staged(cwd: String) -> Vec<ChangedFile> {
    let raw = git_raw(&cwd, &["diff", "--cached", "--name-status", "-z", "-M"]);
    parse_name_status_z(&raw, true)
}

/// `base:path` vs `HEAD:path` blobs, for a read-only branch review of one file.
#[tauri::command(async)]
pub fn git_file_diff_ref(cwd: String, path: String, base: String) -> Result<FileDiff, String> {
    let base = resolve_base(&cwd, &base)?;
    let orig = git_bytes(&cwd, &["show", &format!("{base}:{path}")]);
    let modi = git_bytes(&cwd, &["show", &format!("HEAD:{path}")]);
    Ok(file_diff_from_blobs(orig, modi))
}

/// `HEAD:path` vs index (`:path`) blobs, for a read-only staged review of one file.
#[tauri::command(async)]
pub fn git_file_diff_staged(cwd: String, path: String) -> Result<FileDiff, String> {
    let orig = git_bytes(&cwd, &["show", &format!("HEAD:{path}")]);
    let modi = git_bytes(&cwd, &["show", &format!(":{path}")]);
    Ok(file_diff_from_blobs(orig, modi))
}

/// One file's blob specs for a batch diff. `status` mirrors the changed-file
/// status so a renamed file's original side can fall back to its old path.
#[derive(Deserialize)]
pub struct FileDiffRequest {
    pub path: String,
    pub status: Option<String>,
}

/// The `<size>` from a `cat-file --batch` header (`<oid> <type> <size>`); None on
/// a miss line (`<spec> missing`) or anything else that doesn't end in a count.
fn cat_file_size(header: &str) -> Option<usize> {
    header.trim_end().rsplit(' ').next()?.parse().ok()
}

/// `cat-file --batch` is newline-delimited, so a spec must be a single line. A
/// tracked path may legally contain `\n`/`\r`; such a spec is treated as a miss
/// rather than written, which would split into two lines and desync the stream.
fn cat_file_spec_ok(spec: &str) -> bool {
    !spec.contains('\n') && !spec.contains('\r')
}

/// Fetch one blob from a running `cat-file --batch`: write its spec, read the
/// header, then exactly `size` bytes plus the trailing newline. Missing/unreadable
/// specs yield empty bytes (matching `git_bytes`). Write-one-read-one keeps the
/// single pipe from deadlocking on a large blob.
fn cat_file_blob(
    stdin: &mut std::process::ChildStdin,
    stdout: &mut std::io::BufReader<std::process::ChildStdout>,
    spec: &str,
) -> Vec<u8> {
    use std::io::{BufRead, Read, Write};
    if !cat_file_spec_ok(spec) {
        return Vec::new();
    }
    if writeln!(stdin, "{spec}")
        .and_then(|_| stdin.flush())
        .is_err()
    {
        return Vec::new();
    }
    let mut header = String::new();
    if stdout.read_line(&mut header).is_err() {
        return Vec::new();
    }
    let Some(size) = cat_file_size(&header) else {
        return Vec::new();
    };
    let mut buf = vec![0u8; size];
    if stdout.read_exact(&mut buf).is_err() {
        return Vec::new();
    }
    let _ = stdout.read_exact(&mut [0u8; 1]); // trailing newline
    buf
}

/// Batch of `git_file_diff` for the all-files review: one `cat-file --batch`
/// process fetches every original-side blob (and index-side for staged) instead
/// of spawning `git show` per file. `source` is the ReviewMode; `base` (resolved
/// once) is only used for `"base"`.
#[tauri::command(async)]
pub fn git_file_diffs(
    cwd: String,
    files: Vec<FileDiffRequest>,
    source: String,
    base: String,
) -> Result<HashMap<String, FileDiff>, String> {
    let mut out = HashMap::new();
    if files.is_empty() {
        return Ok(out);
    }
    let resolved_base = if source == "base" {
        Some(resolve_base(&cwd, &base)?)
    } else {
        None
    };

    let mut child = git_command(&cwd, &["cat-file", "--batch"], &[])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    let mut stdin = child.stdin.take().ok_or("cat-file stdin unavailable")?;
    let mut stdout =
        std::io::BufReader::new(child.stdout.take().ok_or("cat-file stdout unavailable")?);

    for f in &files {
        let path = &f.path;
        let (orig, modi) = match source.as_str() {
            "staged" => (
                cat_file_blob(&mut stdin, &mut stdout, &format!("HEAD:{path}")),
                cat_file_blob(&mut stdin, &mut stdout, &format!(":{path}")),
            ),
            "base" => {
                let base_ref = resolved_base.as_deref().unwrap_or_default();
                (
                    cat_file_blob(&mut stdin, &mut stdout, &format!("{base_ref}:{path}")),
                    cat_file_blob(&mut stdin, &mut stdout, &format!("HEAD:{path}")),
                )
            }
            _ => {
                let work = std::path::Path::new(&cwd).join(path);
                let modi = std::fs::read(&work).unwrap_or_default();
                let mut orig = cat_file_blob(&mut stdin, &mut stdout, &format!("HEAD:{path}"));
                // A rename's original lives under its old path; probe only when the
                // new path has no HEAD blob but a working file exists (renames are
                // rare, so the extra status scan here is fine).
                if f.status.as_deref() == Some("renamed") && orig.is_empty() && work.exists() {
                    if let Some(src) = rename_source(&cwd, path) {
                        orig = cat_file_blob(&mut stdin, &mut stdout, &format!("HEAD:{src}"));
                    }
                }
                (orig, modi)
            }
        };
        out.insert(path.clone(), file_diff_from_blobs(orig, modi));
    }

    drop(stdin); // EOF so cat-file exits before we reap it
    let _ = child.wait();
    Ok(out)
}

#[tauri::command(async)]
pub fn git_discard_files(cwd: String, files: Vec<String>) -> Result<(), String> {
    if files.is_empty() {
        return Ok(());
    }
    let mut largs: Vec<&str> = vec!["ls-files", "--"];
    largs.extend(files.iter().map(String::as_str));
    let ls = git_out(&cwd, &largs).unwrap_or_default();
    let tracked_set: HashSet<&str> = ls
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect();

    let tracked: Vec<&str> = files
        .iter()
        .map(String::as_str)
        .filter(|f| tracked_set.contains(f))
        .collect();
    let untracked: Vec<&str> = files
        .iter()
        .map(String::as_str)
        .filter(|f| !tracked_set.contains(f))
        .collect();

    if !tracked.is_empty() {
        let mut a: Vec<&str> = vec!["checkout", "HEAD", "--"];
        a.extend(&tracked);
        git_out(&cwd, &a).map_err(|e| format!("checkout: {e}"))?;
    }
    if !untracked.is_empty() {
        let mut a: Vec<&str> = vec!["clean", "-fd", "--"];
        a.extend(&untracked);
        git_out(&cwd, &a).map_err(|e| format!("clean: {e}"))?;
    }
    Ok(())
}

#[tauri::command(async)]
pub fn git_discard_all(cwd: String) -> Result<(), String> {
    git_out(&cwd, &["reset", "--hard", "HEAD"]).map_err(|e| format!("reset: {e}"))?;
    git_out(&cwd, &["clean", "-fd"]).map_err(|e| format!("clean: {e}"))?;
    Ok(())
}

// ---- branches ---------------------------------------------------------------

fn for_each_ref_branches(cwd: &str, pattern: &str, count: i64) -> Vec<(String, i64)> {
    let cnt = if count > 0 {
        format!("--count={count}")
    } else {
        String::new()
    };
    let mut args: Vec<&str> = vec![
        "for-each-ref",
        "--sort=-committerdate",
        pattern,
        "--format=%(refname:short)%00%(committerdate:unix)",
    ];
    if !cnt.is_empty() {
        args.push(&cnt);
    }
    let out = git_out(cwd, &args).unwrap_or_default();
    out.lines()
        .filter_map(|l| {
            let l = l.trim();
            if l.is_empty() {
                return None;
            }
            let mut parts = l.splitn(2, '\u{0}');
            let name = parts.next()?.to_string();
            let date = parts
                .next()
                .and_then(|d| d.trim().parse::<i64>().ok())
                .unwrap_or(0);
            Some((name, date))
        })
        .collect()
}

fn load_all_branches(cwd: &str, local_limit: i64, remote_limit: i64) -> Vec<Branch> {
    let locals = for_each_ref_branches(cwd, "refs/heads", local_limit);
    let local_names: HashSet<String> = locals.iter().map(|(n, _)| n.clone()).collect();
    let mut out: Vec<Branch> = locals
        .iter()
        .map(|(n, d)| Branch {
            name: n.clone(),
            committer_date: *d,
            remote: String::new(),
        })
        .collect();

    let remotes = for_each_ref_branches(cwd, "refs/remotes", remote_limit);
    let mut by_name: HashMap<String, (String, i64)> = HashMap::new();
    for (full, date) in remotes {
        let Some((remote, name)) = full.split_once('/') else {
            continue;
        };
        if name.is_empty() || name == "HEAD" || local_names.contains(name) {
            continue;
        }
        match by_name.get(name) {
            Some((existing_remote, _)) if existing_remote == "origin" || remote != "origin" => {}
            _ => {
                by_name.insert(name.to_string(), (remote.to_string(), date));
            }
        }
    }
    for (name, (remote, date)) in by_name {
        out.push(Branch {
            name,
            committer_date: date,
            remote,
        });
    }
    out.sort_by(|a, b| b.committer_date.cmp(&a.committer_date));
    out
}

#[tauri::command(async)]
pub fn list_branches(cwd: String) -> Result<Vec<Branch>, String> {
    let mut all = load_all_branches(&cwd, 100, 200);
    all.truncate(100);
    Ok(all)
}

#[tauri::command(async)]
pub fn search_branches(cwd: String, query: String) -> Result<Vec<Branch>, String> {
    let q = query.trim();
    if q.is_empty() {
        return list_branches(cwd);
    }
    let ql = q.to_lowercase();
    let mut matched: Vec<Branch> = load_all_branches(&cwd, 0, 0)
        .into_iter()
        .filter(|b| b.name.to_lowercase().contains(&ql))
        .collect();
    matched.truncate(200);
    Ok(matched)
}

#[tauri::command(async)]
pub fn checkout_branch(cwd: String, branch: String, remote: String) -> Result<(), String> {
    if branch.is_empty() {
        return Err("branch name required".into());
    }
    if !remote.is_empty() && !branch_exists(&cwd, &format!("refs/heads/{branch}")) {
        let tracking = format!("{remote}/{branch}");
        git_out(&cwd, &["checkout", "-b", &branch, "--track", &tracking]).map(|_| ())
    } else {
        git_out(&cwd, &["checkout", &branch]).map(|_| ())
    }
}

#[tauri::command(async)]
pub fn create_branch(cwd: String, name: String) -> Result<(), String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("branch name required".into());
    }
    if branch_exists(&cwd, &format!("refs/heads/{name}")) {
        return Err(format!("branch {name:?} already exists"));
    }
    match git_out(&cwd, &["branch", &name]) {
        Ok(_) => checkout_branch(cwd, name, String::new()),
        Err(first) => match git_out(&cwd, &["switch", "-c", &name]) {
            Ok(_) => Ok(()),
            Err(_) => Err(first),
        },
    }
}

#[tauri::command(async)]
pub fn delete_branch(cwd: String, name: String) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("branch name required".into());
    }
    git_out(&cwd, &["branch", "-D", name]).map(|_| ())
}

/// Drop a stale remote-tracking ref (`refs/remotes/<remote>/<name>`) without
/// touching the remote itself. For clearing branches deleted upstream that a
/// plain fetch left behind; a later `fetch --prune` would remove the same ref.
#[tauri::command(async)]
pub fn delete_remote_tracking_ref(cwd: String, remote: String, name: String) -> Result<(), String> {
    let (remote, name) = (remote.trim(), name.trim());
    if remote.is_empty() || name.is_empty() {
        return Err("remote and branch name required".into());
    }
    git_out(&cwd, &["branch", "-dr", &format!("{remote}/{name}")]).map(|_| ())
}

#[tauri::command(async)]
pub fn rename_branch(cwd: String, old_name: String, new_name: String) -> Result<(), String> {
    let (old_name, new_name) = (old_name.trim(), new_name.trim());
    if old_name.is_empty() || new_name.is_empty() {
        return Err("branch names required".into());
    }
    if old_name == new_name {
        return Ok(());
    }
    if branch_exists(&cwd, &format!("refs/heads/{new_name}")) {
        return Err(format!("branch {new_name:?} already exists"));
    }
    git_out(&cwd, &["branch", "-m", old_name, new_name]).map(|_| ())
}

fn compute_default_branch(cwd: &str) -> String {
    if let Ok(out) = git_out(cwd, &["symbolic-ref", "refs/remotes/origin/HEAD"]) {
        if let Some(seg) = out.rsplit('/').next() {
            if !seg.is_empty() {
                return seg.to_string();
            }
        }
    }
    if branch_exists(cwd, "refs/heads/main") {
        return "main".to_string();
    }
    if branch_exists(cwd, "refs/heads/master") {
        return "master".to_string();
    }
    "main".to_string()
}

const DEFAULT_BRANCH_TTL: Duration = Duration::from_secs(60);
static DEFAULT_BRANCH_CACHE: OnceLock<Mutex<HashMap<String, (Instant, String)>>> = OnceLock::new();

/// The repo's default branch, cached per `cwd` with a short TTL so the review
/// snapshot (and every other caller) doesn't spawn 1–3 `git` processes on each
/// poll. The TTL self-corrects if the remote HEAD or local main/master changes.
#[tauri::command(async)]
pub fn git_default_branch(cwd: String) -> String {
    let cache = DEFAULT_BRANCH_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(map) = cache.lock() {
        if let Some((at, val)) = map.get(&cwd) {
            if at.elapsed() < DEFAULT_BRANCH_TTL {
                return val.clone();
            }
        }
    }
    let val = compute_default_branch(&cwd);
    if let Ok(mut map) = cache.lock() {
        map.insert(cwd, (Instant::now(), val.clone()));
    }
    val
}

#[tauri::command(async)]
pub fn git_log_branch(cwd: String, base: String) -> Result<Vec<BranchCommit>, String> {
    let base = resolve_base(&cwd, &base)?;
    let out = git_out(
        &cwd,
        &[
            "log",
            "--format=%h%x00%s%x00%an%x00%ar",
            &format!("{base}..HEAD"),
        ],
    )?;
    if out.is_empty() {
        return Ok(vec![]);
    }
    Ok(out
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.splitn(4, '\u{0}').collect();
            if parts.len() < 4 {
                return None;
            }
            Some(BranchCommit {
                hash: parts[0].to_string(),
                subject: parts[1].to_string(),
                author: parts[2].to_string(),
                date: parts[3].to_string(),
            })
        })
        .collect())
}

#[tauri::command(async)]
pub fn git_commit_count(cwd: String, from: String, to: String) -> i64 {
    if from.is_empty() || to.is_empty() {
        return 0;
    }
    git_out(&cwd, &["rev-list", "--count", &format!("{from}..{to}")])
        .ok()
        .and_then(|s| s.trim().parse::<i64>().ok())
        .unwrap_or(0)
}

// ---- commit / push / merge / pull -------------------------------------------

#[tauri::command(async)]
pub fn git_commit(cwd: String, message: String, files: Vec<String>) -> Result<(), String> {
    let message = message.trim();
    if message.is_empty() {
        return Err("commit message required".into());
    }
    if files.is_empty() {
        return Err("no files selected".into());
    }
    let _ = git_out(&cwd, &["reset", "HEAD"]); // clear stage; ignore (initial commit)
    let mut a: Vec<&str> = vec!["add", "--"];
    a.extend(files.iter().map(String::as_str));
    git_out(&cwd, &a).map_err(|e| format!("staging files: {e}"))?;
    git_out(&cwd, &["commit", "-m", message]).map(|_| ())
}

#[tauri::command(async)]
pub fn git_push(cwd: String, flags: Vec<String>) -> Result<(), String> {
    let mut args: Vec<String> = vec!["push".into()];
    args.extend(flags);
    args.extend(["-u", "origin", "HEAD"].iter().map(|s| s.to_string()));
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    git_out(&cwd, &refs).map(|_| ())
}

#[tauri::command(async)]
pub fn git_fetch_all(cwd: String, flags: Vec<String>) -> Result<(), String> {
    let mut args: Vec<String> = vec!["fetch".into()];
    args.extend(flags);
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    git_out(&cwd, &refs).map(|_| ())
}

/// Background remote-ref cleanup for the branch picker: `git fetch --all
/// --prune`, forced non-interactive so an auth-required, unknown-host, or
/// unreachable remote fails fast instead of blocking on a credential/host
/// prompt (which would otherwise wedge the caller's in-flight guard).
#[tauri::command(async)]
pub fn git_prune_remotes(cwd: String) -> Result<(), String> {
    git_out_env(
        &cwd,
        &["fetch", "--all", "--prune"],
        &[
            ("GIT_TERMINAL_PROMPT", "0"),
            (
                "GIT_SSH_COMMAND",
                "ssh -o BatchMode=yes -o ConnectTimeout=10",
            ),
        ],
    )
    .map(|_| ())
}

#[tauri::command(async)]
pub fn git_merge(cwd: String, branch: String) -> Result<(), String> {
    let branch = branch.trim();
    if branch.is_empty() {
        return Err("branch name required".into());
    }
    git_out(&cwd, &["merge", "--no-edit", branch]).map(|_| ())
}

#[tauri::command(async)]
pub fn git_merge_conflicts(cwd: String) -> Vec<String> {
    git_out(&cwd, &["diff", "--name-only", "--diff-filter=U"])
        .map(|o| {
            o.lines()
                .map(str::trim)
                .filter(|l| !l.is_empty())
                .map(String::from)
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command(async)]
pub fn git_abort_merge(cwd: String) -> Result<(), String> {
    git_out(&cwd, &["merge", "--abort"]).map(|_| ())
}

#[tauri::command(async)]
pub fn pull_branch(cwd: String, strategy: String, flags: Vec<String>) -> Result<(), String> {
    let mut args: Vec<String> = pull_args(&strategy).into_iter().map(String::from).collect();
    args.extend(flags);
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    git_out(&cwd, &refs).map(|_| ())
}

// ---- gh / PR ----------------------------------------------------------------

static GHCLI_PRESENT: OnceLock<bool> = OnceLock::new();

/// Whether the `gh` CLI is on PATH, cached for the process lifetime — it gates
/// the "Open PR" affordance and is polled on every review snapshot, but a CLI
/// install/removal mid-session is not worth re-probing on the hot path.
#[tauri::command(async)]
pub fn check_ghcli() -> bool {
    *GHCLI_PRESENT.get_or_init(|| crate::sys::which("gh"))
}

#[tauri::command(async)]
pub fn create_pull_request(
    cwd: String,
    title: String,
    body: String,
    base: String,
) -> Result<String, String> {
    if title.trim().is_empty() {
        return Err("title required".into());
    }
    let branch = git_out(&cwd, &["rev-parse", "--abbrev-ref", "HEAD"])
        .map_err(|e| format!("failed to get current branch: {e}"))?;
    git_out(&cwd, &["push", "-u", "origin", &branch]).map_err(|e| format!("push failed: {e}"))?;

    let mut args: Vec<&str> = vec!["pr", "create", "--title", &title, "--body", &body];
    if !base.is_empty() {
        args.push("--base");
        args.push(&base);
    }
    let out = tool_command(&cwd, "gh", &args, &[])
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("gh exited with status {}", out.status)
        } else {
            stderr
        });
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

// ---- file watcher (port of watcher.go) --------------------------------------

pub(crate) const DEBOUNCE: Duration = Duration::from_millis(400);

// Beyond this many distinct files in one quiet window, drop the per-path list and
// tell consumers to refetch everything — tracking each path stops paying off.
const CHANGE_CAP: usize = 100;

// One coalesced filesystem change: a specific working-tree file, or a `.git`
// metadata change (commit/checkout/…) where any file's HEAD-side blob may differ.
enum Change {
    File(String),
    Unknown,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitChangedPayload {
    path: String,
    // Repo-relative paths that changed this window, or null for "unknown /
    // everything" so consumers do a full refresh.
    files: Option<Vec<String>>,
}

// .git entries worth a refresh (commit/checkout/merge/rebase markers).
const GIT_FILE_ALLOW: &[&str] = &[
    "HEAD",
    "index",
    "packed-refs",
    "ORIG_HEAD",
    "MERGE_HEAD",
    "CHERRY_PICK_HEAD",
    "REBASE_HEAD",
    "REVERT_HEAD",
    "BISECT_HEAD",
];

/// Whether a filesystem event path is irrelevant to a git working-tree refresh
/// (inside .git except the tracked refs/markers, or an ignored build dir). Shared
/// with remote.rs's per-connection working-tree watcher.
pub(crate) fn should_ignore(root: &str, full: &str) -> bool {
    let rel = match full.strip_prefix(root) {
        Some(r) => r.trim_start_matches('/'),
        None => return true,
    };
    if rel.is_empty() || rel == "." {
        return true;
    }
    let segs: Vec<&str> = rel.split('/').collect();
    if segs[0] == ".git" {
        if segs.len() == 2 {
            return !GIT_FILE_ALLOW.contains(&segs[1]);
        }
        if segs.len() >= 3 && segs[1] == "refs" && (segs[2] == "heads" || segs[2] == "remotes") {
            return false; // local branch commits + remote-tracking ref changes (e.g. prune)
        }
        return true;
    }
    segs.iter()
        .any(|s| crate::config::IGNORED_WATCH_DIRS.contains(s))
}

struct ActiveWatch {
    path: String,
    stop: Arc<AtomicBool>,
    // None for a remote project: a poll thread (gated by `stop`) stands in for the
    // notify watcher, which can't observe a filesystem on the SSH host.
    _watcher: Option<notify::RecommendedWatcher>,
}

pub struct WatchState {
    inner: Mutex<Option<ActiveWatch>>,
}

impl Default for WatchState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }
}

#[tauri::command(async)]
pub fn start_watching_project(
    app: AppHandle,
    state: State<'_, WatchState>,
    path: String,
) -> Result<(), String> {
    use notify::{RecursiveMode, Watcher};

    // A remote project's `path` is a directory on the SSH host: it can't be
    // canonicalized or notify-watched locally, so keep it verbatim and poll.
    let remote = crate::sshexec::remote_project_for_path(&path);
    // FSEvents delivers absolute (canonical) paths; canonicalize so strip_prefix
    // matches. Local only — a remote path has no local form to resolve.
    let path = if path.is_empty() || remote.is_some() {
        path
    } else {
        std::fs::canonicalize(&path)
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or(path)
    };

    let mut guard = state.inner.lock().unwrap();
    if let Some(active) = guard.as_ref() {
        if active.path == path {
            return Ok(()); // already watching this path
        }
    }
    if let Some(old) = guard.take() {
        old.stop.store(true, Ordering::SeqCst);
    }
    if path.is_empty() {
        return Ok(()); // empty path => just stop
    }

    if let Some(ssh) = remote {
        let stop = Arc::new(AtomicBool::new(false));
        spawn_remote_poll(app, ssh, path.clone(), stop.clone());
        *guard = Some(ActiveWatch {
            path,
            stop,
            _watcher: None,
        });
        return Ok(());
    }

    let stop = Arc::new(AtomicBool::new(false));
    let (tx, rx) = std::sync::mpsc::channel::<Change>();
    let root = path.clone();

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(ev) = res {
            for p in &ev.paths {
                let full = p.to_string_lossy();
                if should_ignore(&root, &full) {
                    continue;
                }
                let rel = full
                    .strip_prefix(&root)
                    .map(|r| r.trim_start_matches('/'))
                    .unwrap_or("");
                if rel.is_empty() {
                    continue;
                }
                // An allow-listed .git entry (HEAD/index/refs/…) means a commit or
                // checkout: any file's HEAD-side blob may have moved, so refetch all.
                let change = if rel.split('/').next() == Some(".git") {
                    Change::Unknown
                } else {
                    Change::File(rel.to_string())
                };
                let _ = tx.send(change);
            }
        }
    })
    .map_err(|e| e.to_string())?;
    watcher
        .watch(std::path::Path::new(&path), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    let emit_path = path.clone();
    let emit_stop = stop.clone();
    std::thread::spawn(move || loop {
        let first = match rx.recv() {
            Ok(c) => c,
            Err(_) => return, // watcher dropped
        };
        if emit_stop.load(Ordering::SeqCst) {
            return;
        }
        // coalesce a burst into one emit after 400ms of quiet, accumulating the
        // set of changed paths so consumers can reconcile only what moved
        let mut files: HashSet<String> = HashSet::new();
        let mut unknown = matches!(first, Change::Unknown);
        if let Change::File(p) = first {
            files.insert(p);
        }
        loop {
            match rx.recv_timeout(DEBOUNCE) {
                Ok(Change::Unknown) => unknown = true,
                Ok(Change::File(p)) => {
                    files.insert(p);
                }
                Err(RecvTimeoutError::Timeout) => break,
                Err(RecvTimeoutError::Disconnected) => return,
            }
        }
        if emit_stop.load(Ordering::SeqCst) {
            return;
        }
        if files.len() > CHANGE_CAP {
            unknown = true;
        }
        let payload = GitChangedPayload {
            path: emit_path.clone(),
            files: if unknown {
                None
            } else {
                Some(files.into_iter().collect())
            },
        };
        let _ = app.emit("git-changed", &payload);
    });

    *guard = Some(ActiveWatch {
        path,
        stop,
        _watcher: Some(watcher),
    });
    Ok(())
}

// Poll interval for the remote git watcher; total sleep is checked against the
// stop flag in short slices so stop/replace stays responsive.
const REMOTE_POLL: Duration = Duration::from_secs(5);

/// A remote repo's HEAD + working-tree state, as an opaque snapshot string. None
/// when the host is unreachable (skip the tick rather than emit a false change).
fn remote_git_snapshot(ssh: &crate::config::SshSettings, dir: &str) -> Option<String> {
    let status = crate::sshexec::remote_command(ssh, dir, "git", STATUS_PORCELAIN, &[])
        .output()
        .ok()
        .filter(|o| o.status.success())?;
    let head = crate::sshexec::remote_command(ssh, dir, "git", &["rev-parse", "HEAD"], &[])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| o.stdout)
        .unwrap_or_default();
    let mut snap = head;
    snap.push(0);
    snap.extend_from_slice(&status.stdout);
    Some(String::from_utf8_lossy(&snap).into_owned())
}

/// Stand-in for the notify watcher on a remote project: poll the SSH host every
/// REMOTE_POLL and emit the same `git-changed` (files: None => "refetch all")
/// whenever the snapshot moves. The first successful snapshot only seeds the
/// baseline, so watching doesn't fire a spurious change on start.
fn spawn_remote_poll(
    app: AppHandle,
    ssh: crate::config::SshSettings,
    path: String,
    stop: Arc<AtomicBool>,
) {
    std::thread::spawn(move || {
        let mut prev: Option<String> = None;
        loop {
            if stop.load(Ordering::SeqCst) {
                return;
            }
            if let Some(snap) = remote_git_snapshot(&ssh, &path) {
                match &prev {
                    Some(p) if *p == snap => {}
                    Some(_) => {
                        let _ = app.emit(
                            "git-changed",
                            &GitChangedPayload {
                                path: path.clone(),
                                files: None,
                            },
                        );
                        prev = Some(snap);
                    }
                    None => prev = Some(snap),
                }
            }
            let mut waited = Duration::ZERO;
            while waited < REMOTE_POLL {
                if stop.load(Ordering::SeqCst) {
                    return;
                }
                std::thread::sleep(Duration::from_millis(200));
                waited += Duration::from_millis(200);
            }
        }
    });
}

#[tauri::command(async)]
pub fn stop_watching_project(state: State<'_, WatchState>) -> Result<(), String> {
    if let Some(old) = state.inner.lock().unwrap().take() {
        old.stop.store(true, Ordering::SeqCst);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{cat_file_size, cat_file_spec_ok, parse_status_and_files, split_diff_by_file};

    #[test]
    fn split_diff_by_file_keys_by_current_path() {
        // A normal path, a git-quoted unicode path (café.txt octal-escaped), and
        // a rename whose b/ side is the new path the phone keys by.
        let diff = concat!(
            "diff --git a/normal.txt b/normal.txt\n",
            "index abc..def 100644\n",
            "--- a/normal.txt\n",
            "+++ b/normal.txt\n",
            "@@ -1 +1 @@\n",
            "-old\n",
            "+new\n",
            "diff --git \"a/caf\\303\\251.txt\" \"b/caf\\303\\251.txt\"\n",
            "index 111..222 100644\n",
            "--- \"a/caf\\303\\251.txt\"\n",
            "+++ \"b/caf\\303\\251.txt\"\n",
            "@@ -1 +1 @@\n",
            "-a\n",
            "+b\n",
            "diff --git a/old_name.txt b/new_name.txt\n",
            "similarity index 90%\n",
            "rename from old_name.txt\n",
            "rename to new_name.txt\n",
        );
        let parts = split_diff_by_file(diff);
        let paths: Vec<&str> = parts.iter().map(|(p, _)| p.as_str()).collect();
        assert_eq!(paths, vec!["normal.txt", "café.txt", "new_name.txt"]);
        // Each chunk starts at its own header and carries its body.
        assert!(parts[0].1.starts_with("diff --git a/normal.txt"));
        assert!(parts[0].1.contains("+new\n"));
        assert!(parts[2].1.contains("rename to new_name.txt\n"));
    }

    #[test]
    fn split_diff_by_file_unquoted_space_falls_back() {
        // git does not quote a plain space, so this header is ambiguous — it must
        // yield an empty key so the caller re-diffs the file individually.
        let diff = "diff --git a/with space.txt b/with space.txt\n@@ -1 +1 @@\n-x\n+y\n";
        let parts = split_diff_by_file(diff);
        assert_eq!(parts.len(), 1);
        assert_eq!(parts[0].0, "");
    }

    #[test]
    fn parse_status_and_files_reads_header_and_files() {
        let raw = "## main...origin/main [ahead 2, behind 1]\0 M mod.txt\0A  add.txt\0R  new name.txt\0old.txt\0?? untracked.txt\0";
        let (st, files) = parse_status_and_files(raw, ".");
        assert!(st.is_git_repo);
        assert_eq!(st.branch, "main");
        assert!(st.has_upstream);
        assert_eq!(st.ahead, 2);
        assert_eq!(st.behind, 1);
        // staged (add + rename) = 2 > unstaged (mod) = 1, plus 1 untracked.
        assert_eq!(st.uncommitted, 3);

        let rows: Vec<(&str, &str, bool)> = files
            .iter()
            .map(|f| (f.path.as_str(), f.status.as_str(), f.staged))
            .collect();
        assert_eq!(
            rows,
            vec![
                ("mod.txt", "modified", false),
                ("add.txt", "added", true),
                ("new name.txt", "renamed", true),
                ("untracked.txt", "untracked", false),
            ]
        );
    }

    #[test]
    fn cat_file_size_parses_hit_and_miss() {
        assert_eq!(cat_file_size("3f1a9c blob 42\n"), Some(42));
        assert_eq!(cat_file_size("3f1a9c blob 0\n"), Some(0));
        assert_eq!(cat_file_size("HEAD:missing.txt missing\n"), None);
        assert_eq!(cat_file_size("HEAD:foo bar.txt missing"), None);
        assert_eq!(cat_file_size(""), None);
    }

    #[test]
    fn cat_file_spec_ok_rejects_embedded_newlines() {
        assert!(cat_file_spec_ok("HEAD:src/main.rs"));
        assert!(cat_file_spec_ok("HEAD:file with spaces.txt"));
        assert!(!cat_file_spec_ok("HEAD:weird\nname.txt"));
        assert!(!cat_file_spec_ok("HEAD:weird\rname.txt"));
    }

}
