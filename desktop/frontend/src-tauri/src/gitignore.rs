// Which entries of a folder git ignores, asked of git itself so every
// .gitignore, info/exclude and core.excludesFile rule counts. A tracked file
// is never ignored whatever the patterns say, which is how VS Code greys its
// explorer too. Outside a repo, or without a git to run, nothing is ignored.
use crate::config::SshSettings;
use crate::sshexec::remote_output;
use std::collections::HashSet;
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

/// Names per remote command: a folder with thousands of entries goes over in
/// several round trips rather than one command line the host may refuse.
const REMOTE_CHUNK: usize = 500;

/// The names among `names` that git ignores inside `dir`. Runs one
/// `check-ignore` fed over stdin, so the folder's size never reaches the
/// command line; exit 1 (nothing ignored) and 128 (not a repo) both read as
/// an empty stdout.
pub fn ignored_names(dir: &Path, names: &[&str]) -> HashSet<String> {
    if names.is_empty() {
        return HashSet::new();
    }
    let Ok(mut child) = Command::new("git")
        .args(["check-ignore", "-z", "--stdin"])
        .current_dir(dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    else {
        return HashSet::new();
    };
    let input = nul_joined(names);
    let writer = child.stdin.take().map(|mut stdin| {
        std::thread::spawn(move || {
            let _ = stdin.write_all(&input);
        })
    });
    let out = child.wait_with_output();
    if let Some(writer) = writer {
        let _ = writer.join();
    }
    out.map(|o| parse_nul_list(&o.stdout)).unwrap_or_default()
}

/// The same question of an SSH host, the names carried as arguments. A host
/// reports nothing ignored as a failure (exit 1), which reads as none.
pub fn remote_ignored_names(ssh: &SshSettings, dir: &str, names: &[&str]) -> HashSet<String> {
    let mut out = HashSet::new();
    for chunk in names.chunks(REMOTE_CHUNK) {
        let mut args = vec!["check-ignore", "-z", "--"];
        args.extend_from_slice(chunk);
        if let Ok(stdout) = remote_output(ssh, dir, "git", &args) {
            out.extend(parse_nul_list(&stdout));
        }
    }
    out
}

fn nul_joined(names: &[&str]) -> Vec<u8> {
    let mut out = Vec::with_capacity(names.iter().map(|n| n.len() + 1).sum());
    for name in names {
        out.extend_from_slice(name.as_bytes());
        out.push(0);
    }
    out
}

fn parse_nul_list(bytes: &[u8]) -> HashSet<String> {
    bytes
        .split(|b| *b == 0)
        .filter(|part| !part.is_empty())
        .map(|part| String::from_utf8_lossy(part).into_owned())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn git(dir: &Path, args: &[&str]) {
        let status = Command::new("git")
            .args(args)
            .current_dir(dir)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .unwrap();
        assert!(status.success(), "git {args:?}");
    }

    #[test]
    fn asks_git_which_names_its_rules_ignore() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        git(root, &["init", "-q"]);
        std::fs::write(root.join(".gitignore"), "node_modules/\n*.log\nkept.log\n").unwrap();
        std::fs::create_dir(root.join("node_modules")).unwrap();
        std::fs::write(root.join("node_modules/react"), "").unwrap();
        std::fs::write(root.join("debug.log"), "").unwrap();
        std::fs::write(root.join("kept.log"), "").unwrap();
        std::fs::write(root.join("main.rs"), "").unwrap();
        git(root, &["add", "-f", "kept.log"]);
        let ignored = ignored_names(
            root,
            &[
                "node_modules",
                "debug.log",
                "kept.log",
                "main.rs",
                ".gitignore",
            ],
        );
        let mut got: Vec<&str> = ignored.iter().map(String::as_str).collect();
        got.sort();
        assert_eq!(got, vec!["debug.log", "node_modules"]);
        assert_eq!(
            ignored_names(&root.join("node_modules"), &["react"]),
            HashSet::from(["react".to_string()])
        );
    }

    #[test]
    fn outside_a_repo_nothing_is_ignored() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.log"), "").unwrap();
        assert!(ignored_names(dir.path(), &["a.log"]).is_empty());
        assert!(ignored_names(dir.path(), &[]).is_empty());
    }

    #[test]
    fn nul_lists_round_trip() {
        assert_eq!(nul_joined(&["a", "b c"]), b"a\0b c\0");
        let parsed = parse_nul_list(b"a\0b c\0\0");
        assert_eq!(parsed, HashSet::from(["a".to_string(), "b c".to_string()]));
        assert!(parse_nul_list(b"").is_empty());
    }
}
