//! The phone's review extras: the commit sheet's look for secrets before a
//! commit, the branch's own changes since it left its base, and the discussion
//! on its pull request. Each runs git or gh, so it answers on a worker through
//! the out-queue.
use crate::pull_request_review::{NoteKind, PullRequestDiscussion};
use serde_json::{json, Value};
use std::sync::mpsc::SyncSender;

/// The phone may send `gitScanSecrets` before a commit.
pub const SECRETS_FEATURE: &str = "gitScanSecrets";
/// The phone may send `gitBranchFiles` and `gitBranchDiffs`.
pub const BRANCH_FEATURE: &str = "gitBranchDiff";
/// The phone may send `gitPrDiscussion`.
pub const DISCUSSION_FEATURE: &str = "gitPrDiscussion";

pub(super) fn handle(out: &SyncSender<String>, t: &str, v: &Value) {
    let out = out.clone();
    let verb = t.to_string();
    let v = v.clone();
    std::thread::spawn(move || {
        let project = v["project"].as_str().unwrap_or_default().to_string();
        let reply = match crate::config::project_root(&project) {
            Err(error) => super::git_result_reply(&verb, &project, Err(error)),
            Ok((root, _)) => match verb.as_str() {
                "gitScanSecrets" => scan_reply(&project, root, strings(&v["files"])),
                "gitBranchFiles" => branch_files_reply(&project, &root),
                "gitBranchDiffs" => branch_diffs_reply(&project, &root, &strings(&v["paths"])),
                _ => discussion_reply(&project, root),
            },
        };
        let _ = out.try_send(reply.to_string());
    });
}

fn strings(v: &Value) -> Vec<String> {
    v.as_array()
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

fn scan_reply(project: &str, root: String, files: Vec<String>) -> Value {
    match crate::gitsecrets::git_scan_secrets(root, files) {
        Ok(findings) => {
            json!({ "t": "gitScanSecrets", "project": project, "ok": true, "findings": findings })
        }
        Err(error) => super::git_result_reply("gitScanSecrets", project, Err(error)),
    }
}

fn branch_files_reply(project: &str, root: &str) -> Value {
    let Some(base) = crate::git_branch_base::git_branch_base(root.to_string()) else {
        return json!({ "t": "gitBranchFiles", "project": project, "ok": true, "base": "", "files": [] });
    };
    let files = match crate::git::git_changed_files_ref(root.to_string(), base.rev) {
        Ok(files) => files,
        Err(error) => return super::git_result_reply("gitBranchFiles", project, Err(error)),
    };
    json!({
        "t": "gitBranchFiles",
        "project": project,
        "ok": true,
        "base": base.name,
        "range": base.range,
        "commits": base.commits,
        "files": files,
    })
}

fn branch_diffs_reply(project: &str, root: &str, paths: &[String]) -> Value {
    let Some(base) = crate::git_branch_base::git_branch_base(root.to_string()) else {
        return super::git_result_reply(
            "gitBranchDiffs",
            project,
            Err("This branch has nothing to compare with.".into()),
        );
    };
    let range = format!("{}...HEAD", base.rev);
    let files: Vec<Value> = crate::git::git_diffs_range(root, &range, paths)
        .iter()
        .map(super::diff_entry)
        .collect();
    json!({ "t": "gitBranchDiffs", "project": project, "ok": true, "files": files })
}

fn discussion_reply(project: &str, root: String) -> Value {
    match crate::pull_request_review::pull_request_discussion(root) {
        Ok(Some(pr)) => json!({
            "t": "gitPrDiscussion",
            "project": project,
            "ok": true,
            "prompt": review_prompt(&pr),
            "discussion": pr,
        }),
        Ok(None) => {
            json!({ "t": "gitPrDiscussion", "project": project, "ok": true, "discussion": null })
        }
        Err(error) => super::git_result_reply("gitPrDiscussion", project, Err(error)),
    }
}

/// The review as the desktop's "@" menu writes it (formatPullRequestThread).
fn thread(pr: &PullRequestDiscussion) -> String {
    let mut out = vec![format!("#{} {}", pr.number, pr.title), pr.url.clone()];
    if !pr.body.is_empty() {
        out.extend([String::new(), pr.body.clone()]);
    }
    out.push(String::new());
    if pr.notes.is_empty() {
        out.push("No review comments yet.".into());
        return out.join("\n");
    }
    out.push("Discussion:".into());
    for n in &pr.notes {
        let verdict = match (&n.kind, n.state.as_str()) {
            (NoteKind::Review, "APPROVED") => " approved".to_string(),
            (NoteKind::Review, "CHANGES_REQUESTED") => " requested changes".to_string(),
            (NoteKind::Review, "COMMENTED") => " commented".to_string(),
            (NoteKind::Review, "DISMISSED") => " dismissed".to_string(),
            (NoteKind::Review, state) => format!(" {}", state.to_lowercase()),
            _ => String::new(),
        };
        let place = match (&n.kind, n.path.is_empty(), n.line) {
            (NoteKind::Line, false, Some(line)) => format!(" on {}:{line}", n.path),
            (NoteKind::Line, false, None) => format!(" on {}", n.path),
            _ => String::new(),
        };
        let head = format!("- {}{verdict}{place}", n.author);
        out.push(if n.body.is_empty() {
            head
        } else {
            format!("{head}: {}", n.body.replace('\n', "\n  "))
        });
    }
    out.join("\n")
}

/// What an agent is told when the phone sends it the review.
fn review_prompt(pr: &PullRequestDiscussion) -> String {
    let body = thread(pr);
    let longest = body.split(|c| c != '`').map(str::len).max().unwrap_or(0);
    let fence = "`".repeat(longest.max(2) + 1);
    format!(
        "Address the review on pull request #{} ({}).\n\nPull request #{}:\n{fence}\n{body}\n{fence}\n\n\
         Make the changes the reviewers asked for, run the tests, then commit and push.",
        pr.number, pr.url, pr.number
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pull_request_review::PullRequestNote;
    use std::process::Command;

    fn note(
        kind: NoteKind,
        author: &str,
        body: &str,
        state: &str,
        path: &str,
        line: Option<u64>,
    ) -> PullRequestNote {
        PullRequestNote {
            kind,
            author: author.into(),
            body: body.into(),
            state: state.into(),
            path: path.into(),
            line,
            created_at: String::new(),
        }
    }

    #[test]
    fn prompt_lists_every_note_in_a_fence_longer_than_any_inside() {
        let pr = PullRequestDiscussion {
            number: 42,
            title: "Two-step checkout".into(),
            url: "https://github.com/o/r/pull/42".into(),
            body: String::new(),
            notes: vec![
                note(NoteKind::Review, "sam", "", "CHANGES_REQUESTED", "", None),
                note(
                    NoteKind::Line,
                    "sam",
                    "Use ```ts``` here\nplease",
                    "",
                    "lib/pay.ts",
                    Some(18),
                ),
                note(
                    NoteKind::Comment,
                    "priya",
                    "Keep the old flow",
                    "",
                    "",
                    None,
                ),
            ],
        };
        let prompt = review_prompt(&pr);
        assert!(prompt.starts_with(
            "Address the review on pull request #42 (https://github.com/o/r/pull/42)."
        ));
        assert!(prompt.contains("\n````\n#42 Two-step checkout\n"));
        assert!(prompt.contains("- sam requested changes\n"));
        assert!(prompt.contains("- sam on lib/pay.ts:18: Use ```ts``` here\n  please\n"));
        assert!(prompt.contains("- priya: Keep the old flow\n````"));
    }

    fn git(dir: &std::path::Path, args: &[&str]) {
        let ok = Command::new("git")
            .args([
                "-c",
                "user.name=t",
                "-c",
                "user.email=t@t",
                "-c",
                "commit.gpgsign=false",
            ])
            .args(args)
            .current_dir(dir)
            .output()
            .expect("git runs")
            .status
            .success();
        assert!(ok, "git {args:?}");
    }

    #[test]
    fn branch_scope_lists_what_the_branch_changed_since_main() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        git(root, &["init", "-q", "-b", "main"]);
        std::fs::write(root.join("a.txt"), "one\n").unwrap();
        git(root, &["add", "."]);
        git(root, &["commit", "-q", "-m", "init"]);
        git(root, &["checkout", "-q", "-b", "feat"]);
        std::fs::write(root.join("a.txt"), "one\ntwo\n").unwrap();
        std::fs::write(root.join("b.txt"), "new\n").unwrap();
        git(root, &["add", "."]);
        git(root, &["commit", "-q", "-m", "work"]);
        std::fs::write(root.join("c.txt"), "uncommitted\n").unwrap();
        let path = root.to_string_lossy().into_owned();

        let reply = branch_files_reply("p", &path);
        assert_eq!(reply["base"], "main");
        assert_eq!(reply["range"], "since");
        assert_eq!(reply["commits"], 1);
        let files: Vec<(String, String)> = reply["files"]
            .as_array()
            .unwrap()
            .iter()
            .map(|f| {
                (
                    f["path"].as_str().unwrap().into(),
                    f["status"].as_str().unwrap().into(),
                )
            })
            .collect();
        assert_eq!(
            files,
            vec![
                ("a.txt".into(), "modified".into()),
                ("b.txt".into(), "added".into())
            ]
        );

        let diffs = branch_diffs_reply("p", &path, &["a.txt".into()]);
        let diff = diffs["files"][0]["diff"].as_str().unwrap();
        assert!(diff.contains("+two"), "{diff}");
    }

    #[test]
    fn the_default_branch_compares_with_nothing_when_it_has_no_upstream() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        git(root, &["init", "-q", "-b", "main"]);
        std::fs::write(root.join("a.txt"), "one\n").unwrap();
        git(root, &["add", "."]);
        git(root, &["commit", "-q", "-m", "init"]);
        let reply = branch_files_reply("p", &root.to_string_lossy());
        assert_eq!(reply["base"], "");
        assert_eq!(reply["files"], json!([]));
    }
}
