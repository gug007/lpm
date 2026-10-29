//! Working through a merge that stopped on conflicts: the files it left, how
//! many conflict blocks each still holds, taking one side of a file, and
//! committing the merge once nothing is left.
use crate::git::{git_command, git_out};
use crate::gitconflict::{name_files, unmerged_files};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConflictFile {
    pub path: String,
    /// `<<<<<<<` lines left in the working copy.
    pub conflicts: u32,
    /// 1-based line of the first of them, 0 when none is left.
    pub first_line: u32,
    /// Staged with no markers left.
    pub resolved: bool,
}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct MergeState {
    /// A merge (or a merging pull) is in progress: MERGE_HEAD exists.
    pub merging: bool,
    /// What is being merged in, as git named it in MERGE_MSG.
    pub source: String,
    pub files: Vec<ConflictFile>,
}

const OPEN_MARKER: &str = "^<{7}( |$)";

fn spec(path: &str) -> String {
    format!(":(top,literal){path}")
}

fn merging(cwd: &str) -> bool {
    git_out(cwd, &["rev-parse", "-q", "--verify", "MERGE_HEAD"]).is_ok()
}

#[tauri::command(async)]
pub fn git_merge_state(cwd: String) -> MergeState {
    let merging = merging(&cwd);
    let msg = if merging {
        merge_msg(&cwd)
    } else {
        String::new()
    };
    let unmerged = unmerged_files(&cwd);
    let mut paths = conflicts_in_msg(&msg);
    for f in &unmerged {
        if !paths.contains(f) {
            paths.push(f.clone());
        }
    }
    let mut markers = marker_lines(&cwd, &paths);
    let files = paths
        .into_iter()
        .map(|path| {
            let lines = markers.remove(&path).unwrap_or_default();
            ConflictFile {
                conflicts: lines.len() as u32,
                first_line: lines.first().copied().unwrap_or(0),
                resolved: lines.is_empty() && !unmerged.contains(&path),
                path,
            }
        })
        .collect();
    let source = match source_in_msg(&msg) {
        Some(name) => name,
        None if merging => {
            git_out(&cwd, &["rev-parse", "--short", "MERGE_HEAD"]).unwrap_or_default()
        }
        None => String::new(),
    };
    MergeState {
        merging,
        source,
        files,
    }
}

/// Resolve `path` with one side's version: checked out and staged, or removed
/// when that side deleted it.
#[tauri::command(async)]
pub fn git_take_conflict_side(cwd: String, path: String, side: String) -> Result<(), String> {
    let (flag, stage) = match side.as_str() {
        "ours" => ("--ours", "2"),
        "theirs" => ("--theirs", "3"),
        _ => return Err(format!("unknown side {side:?}")),
    };
    let spec = spec(&path);
    let stages = git_out(&cwd, &["ls-files", "-u", "--", &spec])?;
    if stages.is_empty() {
        return Err(format!("{path} has no conflict to resolve"));
    }
    if stages
        .lines()
        .any(|l| l.split_whitespace().nth(2) == Some(stage))
    {
        git_out(&cwd, &["checkout", flag, "--", &spec])?;
        git_out(&cwd, &["add", "--", &spec]).map(|_| ())
    } else {
        git_out(&cwd, &["rm", "-q", "--", &spec]).map(|_| ())
    }
}

/// Stage a file whose conflicts were resolved by hand.
#[tauri::command(async)]
pub fn git_mark_conflict_resolved(cwd: String, path: String) -> Result<(), String> {
    if marker_lines(&cwd, std::slice::from_ref(&path)).contains_key(&path) {
        return Err(format!(
            "{path} still has conflict markers (<<<<<<< … >>>>>>>). Resolve them first."
        ));
    }
    git_out(&cwd, &["add", "-A", "--", &spec(&path)]).map(|_| ())
}

/// Commit the merge with git's own message, once every file is resolved.
#[tauri::command(async)]
pub fn git_continue_merge(cwd: String) -> Result<(), String> {
    let state = git_merge_state(cwd.clone());
    if !state.merging {
        return Err("No merge is in progress.".into());
    }
    let left: Vec<String> = state
        .files
        .into_iter()
        .filter(|f| !f.resolved)
        .map(|f| f.path)
        .collect();
    if !left.is_empty() {
        return Err(format!(
            "{} still {} conflicts. Resolve {} before continuing the merge.",
            name_files(&left),
            if left.len() == 1 { "has" } else { "have" },
            if left.len() == 1 { "it" } else { "them" },
        ));
    }
    git_out(&cwd, &["commit", "--no-edit", "--cleanup=strip"])
        .map(|_| crate::gitmoved::announce(&cwd))
}

fn merge_msg(cwd: &str) -> String {
    let Ok(rel) = git_out(cwd, &["rev-parse", "--git-path", "MERGE_MSG"]) else {
        return String::new();
    };
    match crate::sshexec::remote_project_for_path(cwd) {
        Some(ssh) => crate::sshexec::remote_output(&ssh, cwd, "cat", &[&rel])
            .map(|b| String::from_utf8_lossy(&b).into_owned())
            .unwrap_or_default(),
        None => std::fs::read_to_string(Path::new(cwd).join(rel)).unwrap_or_default(),
    }
}

/// The files under MERGE_MSG's `Conflicts:` heading, which git keeps listing
/// after each one is staged. Newer git comments the section out.
pub(crate) fn conflicts_in_msg(msg: &str) -> Vec<String> {
    let uncomment = |l: &str| -> String {
        let mut chars = l.chars();
        match chars.next() {
            Some(c) if c != '\t' && !c.is_alphanumeric() => chars.as_str().to_string(),
            _ => l.to_string(),
        }
    };
    let mut lines = msg
        .lines()
        .skip_while(|l| uncomment(l).trim() != "Conflicts:");
    if lines.next().is_none() {
        return Vec::new();
    }
    lines
        .map(uncomment)
        .map_while(|l| l.strip_prefix('\t').map(String::from))
        .filter(|l| !l.is_empty())
        .collect()
}

/// The branch named on MERGE_MSG's first line: `Merge branch 'feature'`,
/// `Merge remote-tracking branch 'origin/x'`.
pub(crate) fn source_in_msg(msg: &str) -> Option<String> {
    let first = msg.lines().next()?;
    let start = first.find('\'')? + 1;
    let len = first[start..].find('\'')?;
    let name = &first[start..start + len];
    (!name.is_empty()).then(|| name.to_string())
}

/// The line of every `<<<<<<<` marker in each of `paths` (repo-root relative).
fn marker_lines(cwd: &str, paths: &[String]) -> HashMap<String, Vec<u32>> {
    if paths.is_empty() {
        return HashMap::new();
    }
    let specs: Vec<String> = paths.iter().map(|p| spec(p)).collect();
    let mut args = vec![
        "grep",
        "-n",
        "-z",
        "-I",
        "--full-name",
        "-E",
        "-e",
        OPEN_MARKER,
        "--",
    ];
    args.extend(specs.iter().map(String::as_str));
    let out = match git_command(cwd, &args, &[]).output() {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).into_owned(),
        _ => return HashMap::new(),
    };
    parse_marker_lines(&out)
}

/// `grep -n -z` output: `path\0line\0text\n` for each match.
pub(crate) fn parse_marker_lines(out: &str) -> HashMap<String, Vec<u32>> {
    let mut found: HashMap<String, Vec<u32>> = HashMap::new();
    let mut rest = out;
    while let Some((path, after)) = rest.split_once('\0') {
        let Some((n, text)) = after.split_once('\0') else {
            break;
        };
        rest = text.split_once('\n').map_or("", |(_, next)| next);
        if let Ok(n) = n.parse::<u32>() {
            found.entry(path.to_string()).or_default().push(n);
        }
    }
    for lines in found.values_mut() {
        lines.sort_unstable();
    }
    found
}

#[cfg(test)]
#[path = "gitresolve_tests.rs"]
mod tests;
