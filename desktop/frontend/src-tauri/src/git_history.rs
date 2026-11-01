//! The current branch's commits for the History view: each commit with what
//! it says and who wrote it, whether it has reached a remote yet, the files it
//! changed, and one file's patch.
use std::collections::HashSet;

use serde::Serialize;

use crate::git::{git_out, name_status_entries_z, status_label};
use crate::git_mentions::is_commit_hash;

const MAX_PAGE: usize = 1000;
// How far back unpushed commits are looked for: a branch further ahead of
// every remote than this marks only its newest commits.
const MAX_UNPUSHED: &str = "1000";

const FIELD: char = '\u{0}';
const RECORD: char = '\u{1e}';
const TRAILER_SEP: char = '\u{1f}';
const LOG_FORMAT: &str =
    "--format=%H%x00%h%x00%s%x00%an%x00%ae%x00%at%x00%P%x00%D%x00%(trailers:key=Co-authored-by,valueonly,separator=%x1f)%x00%b%x1e";
const FIELDS: usize = 10;

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HistoryCommit {
    pub hash: String,
    pub short: String,
    pub subject: String,
    pub body: String,
    pub author: String,
    pub email: String,
    pub time: i64,
    pub parents: usize,
    pub parent_hashes: Vec<String>,
    // Branches and tags pointing at the commit: "main", "origin/main", "v1.2".
    pub refs: Vec<String>,
    pub co_authors: Vec<String>,
    // On no remote branch yet. False everywhere when there is no remote.
    pub unpushed: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHistory {
    pub commits: Vec<HistoryCommit>,
    pub has_more: bool,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CommitFile {
    pub path: String,
    pub old_path: Option<String>,
    pub status: String,
    // None for a binary file, which has no lines to count.
    pub added: Option<u64>,
    pub removed: Option<u64>,
}

// `%D`: "HEAD -> main, origin/main, origin/HEAD, tag: v1.2". The bare and
// remote HEADs only repeat a branch already in the list.
fn parse_refs(raw: &str) -> Vec<String> {
    raw.split(", ")
        .map(|r| r.trim())
        .map(|r| r.strip_prefix("HEAD -> ").unwrap_or(r))
        .map(|r| r.strip_prefix("tag: ").unwrap_or(r))
        .filter(|r| !r.is_empty() && *r != "HEAD" && !r.ends_with("/HEAD"))
        .map(str::to_string)
        .collect()
}

fn parse_log(raw: &str, unpushed: &HashSet<String>) -> Vec<HistoryCommit> {
    raw.split(RECORD)
        .filter_map(|record| {
            let record = record.trim_start_matches('\n');
            let f: Vec<&str> = record.splitn(FIELDS, FIELD).collect();
            if f.len() < FIELDS || f[0].is_empty() {
                return None;
            }
            let parent_hashes: Vec<String> = f[6].split_whitespace().map(str::to_string).collect();
            Some(HistoryCommit {
                hash: f[0].to_string(),
                short: f[1].to_string(),
                subject: f[2].to_string(),
                author: f[3].to_string(),
                email: f[4].to_string(),
                time: f[5].parse().unwrap_or(0),
                parents: parent_hashes.len(),
                parent_hashes,
                refs: parse_refs(f[7]),
                co_authors: f[8]
                    .split(TRAILER_SEP)
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(str::to_string)
                    .collect(),
                body: f[9].trim().to_string(),
                unpushed: unpushed.contains(f[0]),
            })
        })
        .collect()
}

#[tauri::command(async)]
pub fn git_history(cwd: String, skip: usize, limit: usize) -> Result<GitHistory, String> {
    if git_out(&cwd, &["rev-parse", "--verify", "-q", "HEAD"]).is_err() {
        git_out(&cwd, &["rev-parse", "--git-dir"])?;
        return Ok(GitHistory {
            commits: Vec::new(),
            has_more: false,
        });
    }
    let limit = limit.clamp(1, MAX_PAGE);
    let count = (limit + 1).to_string();
    let skip = skip.to_string();
    // Children before parents, which the History graph's lanes are drawn from.
    let raw = git_out(
        &cwd,
        &[
            "log",
            "--date-order",
            "-n",
            &count,
            "--skip",
            &skip,
            LOG_FORMAT,
            "HEAD",
        ],
    )?;
    let has_remote = git_out(&cwd, &["remote"]).is_ok_and(|r| !r.is_empty());
    let unpushed: HashSet<String> = if has_remote {
        git_out(
            &cwd,
            &[
                "rev-list",
                "--max-count",
                MAX_UNPUSHED,
                "HEAD",
                "--not",
                "--remotes",
            ],
        )
        .unwrap_or_default()
        .lines()
        .map(str::to_string)
        .collect()
    } else {
        HashSet::new()
    };
    let mut commits = parse_log(&raw, &unpushed);
    let has_more = commits.len() > limit;
    commits.truncate(limit);
    Ok(GitHistory { commits, has_more })
}

// A commit against its first parent, so a merge shows what it brought in. A
// root commit has none and is shown whole.
fn diff_tree(cwd: &str, hash: &str, format: &[&str], paths: &[&str]) -> Result<String, String> {
    if !is_commit_hash(hash) {
        return Err(format!("{hash} is not a commit"));
    }
    let mut args = vec![
        "diff-tree",
        "-r",
        "-M",
        "--no-commit-id",
        "--root",
        "-m",
        "--first-parent",
    ];
    args.extend(format);
    args.push(hash);
    if !paths.is_empty() {
        args.push("--");
        args.extend(paths);
    }
    git_out(cwd, &args)
}

// `--numstat -z` rows: "added\tremoved\tpath\0", or for a rename
// "added\tremoved\t\0old\0new\0". Binary files count "-".
fn parse_numstat(raw: &str) -> Vec<(Option<u64>, Option<u64>)> {
    let parts: Vec<&str> = raw.split(FIELD).collect();
    let mut out = Vec::new();
    let mut i = 0;
    while i < parts.len() {
        let mut cols = parts[i].splitn(3, '\t');
        let (Some(a), Some(r), Some(path)) = (cols.next(), cols.next(), cols.next()) else {
            i += 1;
            continue;
        };
        out.push((a.parse().ok(), r.parse().ok()));
        i += if path.is_empty() { 3 } else { 1 };
    }
    out
}

#[tauri::command(async)]
pub fn git_commit_files(cwd: String, hash: String) -> Result<Vec<CommitFile>, String> {
    let names = diff_tree(&cwd, &hash, &["--name-status", "-z"], &[])?;
    let lines = parse_numstat(&diff_tree(&cwd, &hash, &["--numstat", "-z"], &[])?);
    Ok(name_status_entries_z(&names)
        .into_iter()
        .enumerate()
        .map(|(i, (code, old_path, path))| {
            let (added, removed) = lines.get(i).copied().unwrap_or((None, None));
            CommitFile {
                path: path.to_string(),
                old_path: old_path.map(str::to_string),
                status: status_label(code).to_string(),
                added,
                removed,
            }
        })
        .collect())
}

#[tauri::command(async)]
pub fn git_commit_file_patch(
    cwd: String,
    hash: String,
    path: String,
    old_path: Option<String>,
) -> Result<String, String> {
    let paths: Vec<&str> = old_path.as_deref().into_iter().chain([path.as_str()]).collect();
    diff_tree(&cwd, &hash, &["-p"], &paths)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(hash: &str, subject: &str, parents: &str, trailers: &str, body: &str) -> String {
        record_with_refs(hash, subject, parents, "", trailers, body)
    }

    fn record_with_refs(
        hash: &str,
        subject: &str,
        parents: &str,
        refs: &str,
        trailers: &str,
        body: &str,
    ) -> String {
        format!(
            "{hash}\u{0}{}\u{0}{subject}\u{0}Ann\u{0}ann@example.com\u{0}1761900000\u{0}{parents}\u{0}{refs}\u{0}{trailers}\u{0}{body}\u{1e}\n",
            &hash[..7]
        )
    }

    #[test]
    fn parses_commits_and_marks_what_no_remote_has() {
        let raw = [
            record(
                "aaaaaaa1111",
                "Add billing",
                "bbbbbbb2222",
                "Claude Opus 5.5 <noreply@anthropic.com>",
                "Why it changed\n",
            ),
            record("bbbbbbb2222", "Merge pull request #142", "ccc ddd", "", ""),
        ]
        .concat();
        let unpushed: HashSet<String> = ["aaaaaaa1111".to_string()].into();
        let commits = parse_log(&raw, &unpushed);
        assert_eq!(commits.len(), 2);
        assert_eq!(commits[0].short, "aaaaaaa");
        assert_eq!(commits[0].body, "Why it changed");
        assert_eq!(
            commits[0].co_authors,
            vec!["Claude Opus 5.5 <noreply@anthropic.com>"]
        );
        assert!(commits[0].unpushed);
        assert_eq!(commits[1].parents, 2);
        assert_eq!(commits[1].parent_hashes, vec!["ccc", "ddd"]);
        assert!(!commits[1].unpushed);
    }

    #[test]
    fn lists_branches_and_tags_without_the_heads() {
        let raw = record_with_refs(
            "aaaaaaa1111",
            "Ship",
            "bbbbbbb2222",
            "HEAD -> main, origin/main, origin/HEAD, tag: v1.2",
            "",
            "",
        );
        let commits = parse_log(&raw, &HashSet::new());
        assert_eq!(commits[0].refs, vec!["main", "origin/main", "v1.2"]);
        assert_eq!(commits[0].parent_hashes, vec!["bbbbbbb2222"]);
        assert_eq!(parse_refs("HEAD"), Vec::<String>::new());
    }

    #[test]
    fn counts_a_root_commit_without_parents() {
        let raw = record("aaaaaaa1111", "Init", "", "", "");
        let commits = parse_log(&raw, &HashSet::new());
        assert_eq!(commits[0].parents, 0);
        assert!(!commits[0].unpushed);
    }

    #[test]
    fn pairs_statuses_with_line_counts_through_renames() {
        let names = "M\0src/app.ts\0R087\0old.rs\0new.rs\0A\0logo.png\0";
        let counts = "3\t1\tsrc/app.ts\u{0}2\t2\t\0old.rs\0new.rs\0-\t-\tlogo.png\0";
        assert_eq!(
            name_status_entries_z(names),
            vec![
                (b'M', None, "src/app.ts"),
                (b'R', Some("old.rs"), "new.rs"),
                (b'A', None, "logo.png"),
            ]
        );
        assert_eq!(
            parse_numstat(counts),
            vec![(Some(3), Some(1)), (Some(2), Some(2)), (None, None)]
        );
    }
}
