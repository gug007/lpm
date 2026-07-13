// Routing seam for git/file subprocesses on remote (SSH) projects. The frontend
// keeps passing a project's `root` as the `cwd` argument, unaware it is remote;
// this module maps that cwd back to its SSH host and builds the equivalent
// `ssh <exec_args> <script>` command. Unlike terminal spawns (config's
// ssh_command_argv) these are tty-less (config::ssh_exec_args) so binary blobs
// and porcelain `-z` output survive unmangled.
use crate::config::{self, SshSettings};
use std::collections::HashMap;
use std::process::Command;
use std::sync::{Mutex, OnceLock};

/// The SSH project (if any) whose frontend-visible root equals `path`. A match
/// means the git/file command must run on that host. Empty path never matches.
pub fn remote_project_for_path(path: &str) -> Option<SshSettings> {
    match_remote_root(path, &config::remote_project_roots())
}

fn match_remote_root(path: &str, roots: &[(String, SshSettings)]) -> Option<SshSettings> {
    if path.is_empty() {
        return None;
    }
    roots
        .iter()
        .find(|(root, _)| root == path)
        .map(|(_, ssh)| ssh.clone())
}

/// Build `ssh <exec_args> "cd <dir> && export … && exec <program> <args…>"`,
/// every path/arg/value shell-quoted. `dir` follows the same `~`-expands-on-the-
/// remote-side rule as terminal spawns. The program name is resolved to an
/// absolute path on first use per host (remote git/gh may be off the non-login
/// PATH) and cached.
pub fn remote_command(
    ssh: &SshSettings,
    dir: &str,
    program: &str,
    args: &[&str],
    envs: &[(&str, &str)],
) -> Command {
    let resolved = resolve_program(ssh, program);
    let script = build_remote_exec(dir, &resolved, args, envs);
    let mut cmd = Command::new("ssh");
    cmd.args(config::ssh_exec_args(ssh));
    cmd.arg(script);
    cmd
}

fn build_remote_exec(dir: &str, program: &str, args: &[&str], envs: &[(&str, &str)]) -> String {
    let mut parts: Vec<String> = Vec::new();
    let dir = dir.trim();
    if !dir.is_empty() {
        parts.push(format!("cd {}", config::quote_remote_path(dir)));
    }
    for (k, v) in envs {
        parts.push(format!("export {k}={}", config::shell_quote(v)));
    }
    let mut exec = format!("exec {}", config::shell_quote(program));
    for a in args {
        exec.push(' ');
        exec.push_str(&config::shell_quote(a));
    }
    parts.push(exec);
    parts.join(" && ")
}

fn host_key(ssh: &SshSettings) -> String {
    format!("{}@{}:{}", ssh.user, ssh.host, ssh.port)
}

fn program_cache() -> &'static Mutex<HashMap<(String, String), String>> {
    static CACHE: OnceLock<Mutex<HashMap<(String, String), String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn resolve_program(ssh: &SshSettings, program: &str) -> String {
    let key = (host_key(ssh), program.to_string());
    if let Some(found) = program_cache().lock().unwrap().get(&key) {
        return found.clone();
    }
    let resolved = lookup_program(ssh, program).unwrap_or_else(|| program.to_string());
    program_cache().lock().unwrap().insert(key, resolved.clone());
    resolved
}

/// Resolve `program` against the remote login PATH via `bash -lc 'command -v …'`.
/// None when the host is unreachable or the program is not found; the caller then
/// falls back to the bare name.
fn lookup_program(ssh: &SshSettings, program: &str) -> Option<String> {
    let inner = format!("command -v {}", config::shell_quote(program));
    let out = Command::new("ssh")
        .args(config::ssh_exec_args(ssh))
        .arg(format!("bash -lc {}", config::shell_quote(&inner)))
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&out.stdout)
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    (!path.is_empty()).then_some(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ssh(dir: &str) -> SshSettings {
        SshSettings {
            host: "host".into(),
            user: "dev".into(),
            port: 0,
            key: String::new(),
            dir: dir.into(),
        }
    }

    #[test]
    fn build_exec_quotes_dir_program_and_args() {
        let script = build_remote_exec("/srv/app", "/usr/bin/git", &["status", "--porcelain=v1"], &[]);
        assert_eq!(
            script,
            "cd '/srv/app' && exec '/usr/bin/git' 'status' '--porcelain=v1'"
        );
    }

    #[test]
    fn build_exec_expands_tilde_dir_on_remote() {
        let script = build_remote_exec("~/code/app", "git", &["fetch"], &[]);
        assert_eq!(script, "cd \"$HOME\"'/code/app' && exec 'git' 'fetch'");
    }

    #[test]
    fn build_exec_quotes_spaces_and_embedded_single_quotes() {
        // A commit message with a space and an apostrophe must survive intact.
        let script = build_remote_exec(
            "/w s",
            "git",
            &["commit", "-m", "fix: don't crash on 'weird' input"],
            &[],
        );
        assert_eq!(
            script,
            "cd '/w s' && exec 'git' 'commit' '-m' 'fix: don'\\''t crash on '\\''weird'\\'' input'"
        );
    }

    #[test]
    fn build_exec_handles_multiline_commit_message() {
        let script = build_remote_exec("/r", "git", &["commit", "-m", "line one\nline two"], &[]);
        assert_eq!(
            script,
            "cd '/r' && exec 'git' 'commit' '-m' 'line one\nline two'"
        );
    }

    #[test]
    fn build_exec_exports_envs_before_exec() {
        let script = build_remote_exec("/r", "git", &["status"], &[("GIT_TERMINAL_PROMPT", "0")]);
        assert_eq!(
            script,
            "cd '/r' && export GIT_TERMINAL_PROMPT='0' && exec 'git' 'status'"
        );
    }

    #[test]
    fn build_exec_omits_cd_when_dir_empty() {
        let script = build_remote_exec("   ", "git", &["status"], &[]);
        assert_eq!(script, "exec 'git' 'status'");
    }

    #[test]
    fn resolver_matches_remote_root_only() {
        let roots = vec![("/srv/app".to_string(), ssh("/srv/app"))];
        assert!(match_remote_root("/srv/app", &roots).is_some());
        assert!(match_remote_root("/some/local/path", &roots).is_none());
        assert!(match_remote_root("", &roots).is_none());
    }

    #[test]
    fn resolver_first_match_wins_on_collision() {
        let roots = vec![
            ("/dup".to_string(), ssh("/dup")),
            ("/dup".to_string(), {
                let mut s = ssh("/dup");
                s.host = "second".into();
                s
            }),
        ];
        assert_eq!(match_remote_root("/dup", &roots).unwrap().host, "host");
    }
}
