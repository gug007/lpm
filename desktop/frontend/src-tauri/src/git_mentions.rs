//! Git history the terminal input's "@" menu offers: the latest commits on the
//! checkout, and one commit's message, file list and patch to put in a prompt.
use crate::git::{git_out, parse_commits, BranchCommit, COMMIT_LOG_FORMAT};

const MAX_RECENT: usize = 50;

#[tauri::command(async)]
pub fn git_recent_commits(cwd: String, limit: usize) -> Vec<BranchCommit> {
    let n = limit.clamp(1, MAX_RECENT).to_string();
    git_out(&cwd, &["log", "-n", &n, COMMIT_LOG_FORMAT])
        .map(|out| parse_commits(&out))
        .unwrap_or_default()
}

#[tauri::command(async)]
pub fn git_show_commit(cwd: String, hash: String) -> Result<String, String> {
    if !is_commit_hash(&hash) {
        return Err(format!("{hash} is not a commit"));
    }
    git_out(
        &cwd,
        &[
            "show",
            "--stat",
            "--patch",
            "--date=short",
            "--format=commit %H%nAuthor: %an%nDate: %ad%n%n%B",
            &hash,
        ],
    )
}

// A hex object name only, so the argument can never be read as an option.
fn is_commit_hash(s: &str) -> bool {
    (4..=40).contains(&s.len()) && s.bytes().all(|b| b.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::{is_commit_hash, parse_commits};

    #[test]
    fn parses_log_lines_and_skips_malformed_ones() {
        let out = "a1f3c9e\u{0}Add CSV export\u{0}Dev\u{0}2 hours ago\nbroken line\nb2\u{0}Fix: a/b\u{0}Ann\u{0}3 days ago";
        let commits = parse_commits(out);
        assert_eq!(commits.len(), 2);
        assert_eq!(commits[0].hash, "a1f3c9e");
        assert_eq!(commits[0].subject, "Add CSV export");
        assert_eq!(commits[1].subject, "Fix: a/b");
        assert_eq!(commits[1].date, "3 days ago");
    }

    #[test]
    fn empty_log_has_no_commits() {
        assert!(parse_commits("").is_empty());
    }

    #[test]
    fn accepts_only_hex_object_names() {
        assert!(is_commit_hash("a1f3c9e"));
        assert!(is_commit_hash("0123456789abcdef0123456789abcdef01234567"));
        assert!(!is_commit_hash("--output=/tmp/x"));
        assert!(!is_commit_hash("HEAD"));
        assert!(!is_commit_hash("abc"));
        assert!(!is_commit_hash(""));
    }
}
