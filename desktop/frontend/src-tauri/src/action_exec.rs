//! How an action's label and popup commands run: in the action's folder with
//! its env, through the login shell, on an SSH project's host when there is
//! one, held to a time limit and a size limit.
use crate::config::{self, SshSettings};
use std::collections::BTreeMap;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

const TIMEOUT: Duration = Duration::from_secs(15);
const STDERR_MAX: usize = 4096;
const STDERR_WAIT: Duration = Duration::from_millis(500);
const REASON_MAX: usize = 200;
/// Printed just before a local command: whatever comes ahead of it on stdout is
/// the login shell's own, such as the codes iTerm2's shell integration prints.
const OUTPUT_START: &str = "<<lpm-output>>";

/// The folder an action's command runs in and the env it runs with.
pub(crate) fn action_place(
    project: &str,
    root: &str,
    remote: bool,
    cwd: &str,
    env: &BTreeMap<String, String>,
) -> (String, BTreeMap<String, String>) {
    let dir = if remote {
        config::join_remote_dir(root, cwd)
    } else {
        config::resolve_cwd(root, cwd)
    };
    let mut env = env.clone();
    env.insert("LPM_PROJECT_NAME".into(), project.to_string());
    (dir, env)
}

/// An action's command as its labels and popups run it: in `dir` through the
/// login shell, on an SSH project's host when there is one.
pub(crate) fn command(ssh: Option<&SshSettings>, dir: &str, script: &str) -> Command {
    match ssh {
        Some(ssh) => {
            let line = if dir.trim().is_empty() {
                script.to_string()
            } else {
                format!("cd {} && {script}", config::quote_remote_path(dir.trim()))
            };
            crate::sshexec::remote_login_script(ssh, &line)
        }
        None => local_command(dir, script),
    }
}

/// The user's interactive login shell, as background actions use, so a command
/// finds the same PATH and version managers the action itself does.
fn local_command(dir: &str, script: &str) -> Command {
    let script = format!("printf '%s' '{OUTPUT_START}' && {script}");
    #[cfg_attr(windows, allow(unused_mut))]
    let mut cmd = crate::shellpath::login_line(Path::new(dir), &script);
    #[cfg(unix)]
    crate::osproc::detach(&mut cmd);
    cmd
}

/// What `cmd` printed to stdout, held to `TIMEOUT` and `max` bytes. A failure
/// quotes stderr when the caller piped it.
pub(crate) fn capture(mut cmd: Command, max: usize) -> Result<Vec<u8>, String> {
    cmd.stdin(Stdio::null()).stdout(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| format!("couldn't start: {e}"))?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let (out_tx, out_rx) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = out_tx.send(stdout.map(|s| read_capped(s, max)).unwrap_or_default());
    });
    let (err_tx, err_rx) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = err_tx.send(stderr.map(|s| read_capped(s, STDERR_MAX).0).unwrap_or_default());
    });
    let stop = |child: &mut std::process::Child| {
        crate::proctree::kill_tree_async(child.id() as i32);
        let _ = child.wait();
    };
    let Ok((out, cut)) = out_rx.recv_timeout(TIMEOUT) else {
        stop(&mut child);
        return Err(format!("took longer than {}s", TIMEOUT.as_secs()));
    };
    if cut {
        stop(&mut child);
        return Err(format!("printed more than {}", size_words(max)));
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    if !status.success() {
        let err = err_rx.recv_timeout(STDERR_WAIT).unwrap_or_default();
        let code = status
            .code()
            .map(|c| format!("exited with {c}"))
            .unwrap_or_else(|| "was stopped".into());
        return Err(match last_line(&err) {
            Some(reason) => format!("{code}: {reason}"),
            None => code,
        });
    }
    Ok(after_start(out))
}

/// `out` from where the command itself began printing.
fn after_start(mut out: Vec<u8>) -> Vec<u8> {
    let mark = OUTPUT_START.as_bytes();
    if let Some(at) = out.windows(mark.len()).position(|bytes| bytes == mark) {
        out.drain(..at + mark.len());
    }
    out
}

/// Up to `max` bytes, and whether there was more.
fn read_capped(source: impl Read, max: usize) -> (Vec<u8>, bool) {
    let mut buf = Vec::new();
    let read = source.take(max as u64 + 1).read_to_end(&mut buf);
    if read.is_err() {
        return (buf, false);
    }
    let cut = buf.len() > max;
    buf.truncate(max);
    (buf, cut)
}

/// The command's last error line. The interactive login shell's own lines are
/// passed over: its job-control notices, and the "logout" bash prints after an
/// `exit`. Wrapping the command in a subshell would avoid that one, but `( )` is
/// a syntax error in fish.
fn last_line(text: &[u8]) -> Option<String> {
    String::from_utf8_lossy(text)
        .lines()
        .rev()
        .filter(|line| *line != "logout" && !crate::shellpath::is_job_control_notice(line))
        .find_map(|line| first_line_within(line, REASON_MAX))
}

pub(crate) fn size_words(bytes: usize) -> String {
    if bytes >= 1024 * 1024 {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    } else {
        format!("{} KB", bytes.div_ceil(1024))
    }
}

/// The first line with text, without terminal escapes (colors, links, the
/// marks iTerm2's shell integration prints at startup) or control characters,
/// cut to `max` characters with "…" when longer.
pub(crate) fn first_line_within(out: &str, max: usize) -> Option<String> {
    let line = out
        .lines()
        .map(|l| strip_ansi(l).trim().to_string())
        .find(|l| !l.is_empty())?;
    if line.chars().count() <= max {
        return Some(line);
    }
    let cut: String = line.chars().take(max - 1).collect();
    Some(format!("{}…", cut.trim_end()))
}

fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '\u{1b}' {
            if !c.is_control() {
                out.push(c);
            }
            continue;
        }
        match chars.next() {
            Some('[') => {
                for c in chars.by_ref() {
                    if ('@'..='~').contains(&c) {
                        break;
                    }
                }
            }
            Some(']' | 'P' | 'X' | '^' | '_') => {
                while let Some(c) = chars.next() {
                    if c == '\u{7}' {
                        break;
                    }
                    if c == '\u{1b}' {
                        chars.next_if_eq(&'\\');
                        break;
                    }
                }
            }
            _ => {}
        }
    }
    out
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn output_starts_where_the_command_began_printing() {
        let noisy = format!("\u{1b}]1337;RemoteHost=me@mac\u{7}Restored session\n{OUTPUT_START}{{\"a\": 1}}\n");
        assert_eq!(after_start(noisy.into_bytes()), b"{\"a\": 1}\n");
        assert_eq!(after_start(b"no mark\n".to_vec()), b"no mark\n");
    }

    #[test]
    fn output_that_prints_the_mark_itself_keeps_it() {
        let twice = format!("{OUTPUT_START}a{OUTPUT_START}");
        assert_eq!(after_start(twice.into_bytes()), format!("a{OUTPUT_START}").into_bytes());
    }

    #[test]
    fn the_reason_is_never_what_the_shell_says_for_itself() {
        let noisy = "bash: cannot set terminal process group (-1): Inappropriate ioctl for device\n\
                     bash: no job control in this shell\n\
                     first\n\
                     no token\n\
                     logout\n";
        assert_eq!(last_line(noisy.as_bytes()).as_deref(), Some("no token"));
        let silent = "bash: no job control in this shell\nlogout\n";
        assert_eq!(last_line(silent.as_bytes()), None);
    }

    #[test]
    fn a_remote_command_runs_in_the_hosts_folder_and_a_local_one_in_the_projects() {
        let env = BTreeMap::from([("A".to_string(), "1".to_string())]);
        let (dir, env) = action_place("p", "/root", false, "sub", &env);
        assert_eq!(dir, "/root/sub");
        assert_eq!(env.get("LPM_PROJECT_NAME").map(String::as_str), Some("p"));
        assert_eq!(env.get("A").map(String::as_str), Some("1"));
    }
}
