// Git subsystem — port of desktop/git.go + desktop/watcher.go. All commands are
// synchronous `git`/`gh` subprocess wrappers; the watcher uses the `notify`
// crate. Struct JSON field names must match what the frontend deserializes.
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::RecvTimeoutError;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

// ---- helpers ----------------------------------------------------------------

/// Run git in `cwd`, trimmed stdout on success; trimmed stderr (or status) on error.
fn git_out(cwd: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new("git")
        .args(args)
        .current_dir(cwd)
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
    Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
        .unwrap_or_default()
}

/// Raw stdout bytes of a successful command, empty otherwise. Bytes (not lossy
/// UTF-8) so binary content is detectable before it is decoded for display.
fn git_bytes(cwd: &str, args: &[&str]) -> Vec<u8> {
    Command::new("git")
        .args(args)
        .current_dir(cwd)
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
    let out = git_out(cwd, &["for-each-ref", "--format=%(refname)", &heads, &remotes])
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
        "merge" => vec!["pull", "--no-rebase"],
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
    let out = match git_out(&cwd, &["status", "--branch", "--porcelain=v1", "-z"]) {
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
    let raw = git_raw(&cwd, &["status", "--porcelain=v1", "-z"]);
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
        let path = entry[3..].to_string();
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
                status = match x {
                    b'A' => "added",
                    b'D' => "deleted",
                    b'R' | b'C' => "renamed",
                    _ => "modified",
                };
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
    let tracked_set: HashSet<&str> =
        ls.lines().map(str::trim).filter(|l| !l.is_empty()).collect();

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

#[tauri::command(async)]
pub fn git_diff_branch(cwd: String, base: String) -> Result<String, String> {
    if base.is_empty() {
        return Err("base branch required".into());
    }
    let base = resolve_branch_ref(&cwd, &base);
    git_out(&cwd, &["diff", &format!("{base}...HEAD")])
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    original: String,
    modified: String,
    binary: bool,
}

fn is_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(8000).any(|&b| b == 0)
}

/// Path a renamed file had at HEAD, so the original side resolves to the right
/// blob. porcelain v1 -z emits a rename as `R.. <dest>` then a `<src>` chunk.
fn rename_source(cwd: &str, new_path: &str) -> Option<String> {
    let raw = git_raw(cwd, &["status", "--porcelain=v1", "-z", "--", new_path]);
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
pub fn git_file_diff(cwd: String, path: String) -> Result<FileDiff, String> {
    let work = std::path::Path::new(&cwd).join(&path);
    let mod_bytes = std::fs::read(&work).unwrap_or_default();

    let mut orig_bytes = git_bytes(&cwd, &["show", &format!("HEAD:{path}")]);
    if orig_bytes.is_empty() && work.exists() {
        if let Some(src) = rename_source(&cwd, &path) {
            orig_bytes = git_bytes(&cwd, &["show", &format!("HEAD:{src}")]);
        }
    }

    if is_binary(&orig_bytes) || is_binary(&mod_bytes) {
        return Ok(FileDiff {
            original: String::new(),
            modified: String::new(),
            binary: true,
        });
    }
    Ok(FileDiff {
        original: String::from_utf8_lossy(&orig_bytes).into_owned(),
        modified: String::from_utf8_lossy(&mod_bytes).into_owned(),
        binary: false,
    })
}

#[tauri::command(async)]
pub fn git_discard_files(cwd: String, files: Vec<String>) -> Result<(), String> {
    if files.is_empty() {
        return Ok(());
    }
    let mut largs: Vec<&str> = vec!["ls-files", "--"];
    largs.extend(files.iter().map(String::as_str));
    let ls = git_out(&cwd, &largs).unwrap_or_default();
    let tracked_set: HashSet<&str> =
        ls.lines().map(str::trim).filter(|l| !l.is_empty()).collect();

    let tracked: Vec<&str> = files.iter().map(String::as_str).filter(|f| tracked_set.contains(f)).collect();
    let untracked: Vec<&str> = files.iter().map(String::as_str).filter(|f| !tracked_set.contains(f)).collect();

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

#[tauri::command(async)]
pub fn git_default_branch(cwd: String) -> String {
    if let Ok(out) = git_out(&cwd, &["symbolic-ref", "refs/remotes/origin/HEAD"]) {
        if let Some(seg) = out.rsplit('/').next() {
            if !seg.is_empty() {
                return seg.to_string();
            }
        }
    }
    if branch_exists(&cwd, "refs/heads/main") {
        return "main".to_string();
    }
    if branch_exists(&cwd, "refs/heads/master") {
        return "master".to_string();
    }
    "main".to_string()
}

#[tauri::command(async)]
pub fn git_log_branch(cwd: String, base: String) -> Result<Vec<BranchCommit>, String> {
    if base.is_empty() {
        return Err("base branch required".into());
    }
    let base = resolve_branch_ref(&cwd, &base);
    let out = git_out(
        &cwd,
        &["log", "--format=%h%x00%s%x00%an%x00%ar", &format!("{base}..HEAD")],
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
pub fn git_push(cwd: String) -> Result<(), String> {
    git_out(&cwd, &["push", "-u", "origin", "HEAD"]).map(|_| ())
}

#[tauri::command(async)]
pub fn git_fetch_all(cwd: String) -> Result<(), String> {
    git_out(&cwd, &["fetch", "--all", "--prune"]).map(|_| ())
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
pub fn pull_branch(cwd: String, strategy: String) -> Result<(), String> {
    git_out(&cwd, &pull_args(&strategy)).map(|_| ())
}

#[tauri::command(async)]
pub fn sync_branch(cwd: String) -> Result<(), String> {
    let strat = crate::config::load_settings()
        .get("gitPullStrategy")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    pull_branch(cwd.clone(), strat)?;
    git_out(&cwd, &["push"]).map(|_| ())
}

// ---- gh / PR ----------------------------------------------------------------

#[tauri::command(async)]
pub fn check_ghcli() -> bool {
    crate::sys::which("gh")
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
    let out = Command::new("gh")
        .args(&args)
        .current_dir(&cwd)
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

const DEBOUNCE: Duration = Duration::from_millis(400);

// .git entries worth a refresh (commit/checkout/merge/rebase markers).
const GIT_FILE_ALLOW: &[&str] = &[
    "HEAD", "index", "packed-refs", "ORIG_HEAD", "MERGE_HEAD", "CHERRY_PICK_HEAD",
    "REBASE_HEAD", "REVERT_HEAD", "BISECT_HEAD",
];
fn should_ignore(root: &str, full: &str) -> bool {
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
        if segs.len() >= 3 && segs[1] == "refs" && segs[2] == "heads" {
            return false; // local branch commits
        }
        return true;
    }
    segs.iter().any(|s| crate::config::IGNORED_WATCH_DIRS.contains(s))
}

struct ActiveWatch {
    path: String,
    stop: Arc<AtomicBool>,
    _watcher: notify::RecommendedWatcher,
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

    // FSEvents delivers absolute (canonical) paths; canonicalize so strip_prefix matches.
    let path = if path.is_empty() {
        String::new()
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

    let stop = Arc::new(AtomicBool::new(false));
    let (tx, rx) = std::sync::mpsc::channel::<()>();
    let root = path.clone();

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(ev) = res {
            for p in &ev.paths {
                let full = p.to_string_lossy();
                if !should_ignore(&root, &full) {
                    let _ = tx.send(());
                    break;
                }
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
        if rx.recv().is_err() {
            return; // watcher dropped
        }
        if emit_stop.load(Ordering::SeqCst) {
            return;
        }
        // coalesce a burst into one emit after 400ms of quiet
        loop {
            match rx.recv_timeout(DEBOUNCE) {
                Ok(_) => continue,
                Err(RecvTimeoutError::Timeout) => break,
                Err(RecvTimeoutError::Disconnected) => return,
            }
        }
        if emit_stop.load(Ordering::SeqCst) {
            return;
        }
        let _ = app.emit("git-changed", &emit_path);
    });

    *guard = Some(ActiveWatch {
        path,
        stop,
        _watcher: watcher,
    });
    Ok(())
}

#[tauri::command(async)]
pub fn stop_watching_project(state: State<'_, WatchState>) -> Result<(), String> {
    if let Some(old) = state.inner.lock().unwrap().take() {
        old.stop.store(true, Ordering::SeqCst);
    }
    Ok(())
}
