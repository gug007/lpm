//! The commit dialog's look for credentials in what it is about to commit:
//! the selected files' added lines against HEAD, untracked files included.
use crate::secretscan::{scan_diff, SecretFinding};

#[tauri::command(async)]
pub fn git_scan_secrets(cwd: String, files: Vec<String>) -> Result<Vec<SecretFinding>, String> {
    if files.is_empty() {
        return Ok(Vec::new());
    }
    let diff = crate::git::git_diff(cwd, files)?;
    Ok(scan_diff(&diff))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    fn git(dir: &std::path::Path, args: &[&str]) {
        let ok = Command::new("git")
            .args(["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"])
            .args(args)
            .current_dir(dir)
            .output()
            .expect("git runs")
            .status
            .success();
        assert!(ok, "git {args:?}");
    }

    #[test]
    fn scans_changed_and_untracked_files_only_where_lines_were_added() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let key = format!("ghp_{}", "a1B2".repeat(9));
        git(root, &["init", "-q"]);
        std::fs::write(root.join("old.ts"), format!("const old = \"{key}\";\n")).unwrap();
        git(root, &["add", "."]);
        git(root, &["commit", "-q", "-m", "init"]);
        std::fs::write(root.join("old.ts"), format!("const old = \"{key}\";\nconst x = 1;\n")).unwrap();
        std::fs::write(root.join("new.ts"), format!("\nexport const k = \"{key}\";\n")).unwrap();
        std::fs::write(root.join(".env"), "A=1\n").unwrap();

        let cwd = root.to_string_lossy().to_string();
        let files = vec!["old.ts".to_string(), "new.ts".to_string(), ".env".to_string()];
        let mut found = git_scan_secrets(cwd, files).unwrap();
        found.sort_by(|a, b| a.path.cmp(&b.path));
        let summary: Vec<(&str, u32, &str)> =
            found.iter().map(|f| (f.path.as_str(), f.line, f.rule.as_str())).collect();
        assert_eq!(summary, vec![(".env", 0, "Environment file"), ("new.ts", 2, "GitHub token")]);
        assert!(found.iter().all(|f| !f.masked.contains(&key[4..30])));
    }
}
