//! Running a long command on a host — the install, the removal — and reading
//! back why it failed.
//!
//! Both pipes are read while it runs: an install is chatty, and a pipe nobody
//! reads fills up and stalls the far end until the deadline. What the user sees
//! is the end of stderr minus needrestart's report, which apt prints on every
//! upgrade and which used to push the installer's own reason out of sight.

use std::collections::VecDeque;
use std::io::{Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

const TAIL_LINES: usize = 400;
/// A line past this is cut, so output that never ends a line can't grow the tail.
const MAX_LINE: usize = 4096;
const SHOWN_LINES: usize = 30;
const POLL: Duration = Duration::from_millis(250);
/// The pipe normally closes the moment the command exits. This only matters when
/// something it left behind (an ssh ProxyCommand, say) still holds it open.
const PIPE_GRACE: Duration = Duration::from_secs(2);

/// needrestart's report headings, matched whole. Its items follow indented.
const REPORT_HEADINGS: &[&str] = &[
    "Scanning processes...",
    "Scanning candidates...",
    "Scanning linux images...",
    "Running kernel seems to be up-to-date.",
    "Restarting services...",
    "Service restarts being deferred:",
    "No containers need to be restarted.",
    "No user sessions are running outdated binaries.",
    "User sessions running outdated binaries:",
    "No VM guests are running outdated hypervisor (qemu) binaries on this host.",
];

/// The last lines a pipe carried, read on a thread of their own.
struct Tail {
    lines: Arc<Mutex<VecDeque<String>>>,
    reader: JoinHandle<()>,
}

impl Tail {
    fn drain(pipe: impl Read + Send + 'static) -> Self {
        let lines = Arc::new(Mutex::new(VecDeque::new()));
        let sink = lines.clone();
        let reader = std::thread::spawn(move || read_lines(pipe, &sink));
        Tail { lines, reader }
    }

    fn collect(self, grace: Duration) -> Vec<String> {
        let deadline = Instant::now() + grace;
        while !self.reader.is_finished() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(10));
        }
        let lines = self.lines.lock().unwrap();
        lines.iter().cloned().collect()
    }
}

fn read_lines(mut pipe: impl Read, lines: &Mutex<VecDeque<String>>) {
    let mut buf = [0u8; 8192];
    let mut line: Vec<u8> = Vec::new();
    loop {
        let n = match pipe.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => n,
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(_) => break,
        };
        for &byte in &buf[..n] {
            if byte == b'\n' {
                push_line(lines, &line);
                line.clear();
            } else if line.len() < MAX_LINE {
                line.push(byte);
            }
        }
    }
    if !line.is_empty() {
        push_line(lines, &line);
    }
}

fn push_line(lines: &Mutex<VecDeque<String>>, line: &[u8]) {
    let mut lines = lines.lock().unwrap();
    if lines.len() == TAIL_LINES {
        lines.pop_front();
    }
    lines.push_back(String::from_utf8_lossy(line).trim_end().to_string());
}

fn discard(mut pipe: impl Read + Send + 'static) {
    std::thread::spawn(move || {
        let _ = std::io::copy(&mut pipe, &mut std::io::sink());
    });
}

/// Run `command` under a deadline, optionally feeding it a script on stdin.
/// Errors are the host's own words where it gave any (see `failure_message`).
pub(crate) fn run(
    mut command: Command,
    stdin_script: Option<&str>,
    timeout: Duration,
    on_failure: &str,
    on_timeout: &str,
) -> Result<(), String> {
    let program = command.get_program().to_string_lossy().into_owned();
    let mut child = command
        .stdin(if stdin_script.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("could not run {program}: {e}"))?;
    if let Some(stdout) = child.stdout.take() {
        discard(stdout);
    }
    let stderr = child.stderr.take().map(Tail::drain);
    // A write that fails usually means the far end already quit, and its stderr
    // says why far better than a broken pipe does — so wait for that first.
    let sent = match stdin_script {
        Some(script) => send_script(&mut child, script),
        None => Ok(()),
    };
    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(status) => break status,
            None if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(on_timeout.to_string());
            }
            None => std::thread::sleep(POLL),
        }
    };
    if status.success() {
        return sent;
    }
    let lines = stderr.map(|t| t.collect(PIPE_GRACE)).unwrap_or_default();
    Err(failure_message(
        &lines,
        sent.as_ref().err().map_or(on_failure, String::as_str),
    ))
}

/// Dropped as soon as it is written, which closes the pipe — the remote `sh -s`
/// reads to EOF, so a stdin left open would hang until the deadline.
fn send_script(child: &mut Child, script: &str) -> Result<(), String> {
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "could not write to ssh".to_string())?;
    stdin
        .write_all(script.as_bytes())
        .map_err(|e| format!("could not send the script to the host: {e}"))
}

/// The last lines of `stderr` that aren't needrestart's report, or — if that is
/// all there was — its last lines anyway, so a failure still shows something.
fn failure_message(stderr: &[String], fallback: &str) -> String {
    let mut shown = without_report(stderr);
    if shown.is_empty() {
        shown = stderr
            .iter()
            .map(|l| l.trim_end())
            .filter(|l| !l.trim().is_empty())
            .collect();
    }
    if shown.is_empty() {
        return fallback.to_string();
    }
    shown[shown.len().saturating_sub(SHOWN_LINES)..].join("\n")
}

/// Drops blank lines and needrestart's report. An indented line goes only when
/// it sits under one of the report's headings AND reads like one of its items:
/// the installer indents its own hints too, and those are what the user needs.
fn without_report(lines: &[String]) -> Vec<&str> {
    let mut kept = Vec::new();
    let mut in_report = false;
    for line in lines {
        let line = line.trim_end();
        if line.trim().is_empty() {
            continue;
        }
        if line.starts_with(char::is_whitespace) {
            if in_report && is_report_item(line.trim_start()) {
                continue;
            }
        } else {
            in_report = REPORT_HEADINGS.contains(&line);
            if in_report {
                continue;
            }
        }
        kept.push(line);
    }
    kept
}

fn is_report_item(item: &str) -> bool {
    item.starts_with("systemctl restart ")
        || item.starts_with("/etc/needrestart/")
        || item.contains(" @ session #")
        || item.contains(" @ user manager service:")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lines(text: &str) -> Vec<String> {
        text.lines().map(str::to_string).collect()
    }

    // What an update of a host that runs lpm as another account handed back:
    // apt's hook restarting services on the way, then the installer's reason.
    const UPDATE_STDERR: &str = "Running kernel seems to be up-to-date.

Restarting services...
 systemctl restart lpm-xvfb.service

Service restarts being deferred:
 /etc/needrestart/restart.d/dbus.service
 systemctl restart getty@tty1.service
 systemctl restart systemd-logind.service
 systemctl restart unattended-upgrades.service

No containers need to be restarted.

User sessions running outdated binaries:
 ubuntu @ session #3: sshd[1021]
 ubuntu @ user manager service: systemd[980]

No VM guests are running outdated hypervisor (qemu) binaries on this host.
lpm was installed but never started. Check:
  systemctl status lpm-xvfb lpm-wm lpm
  journalctl -u lpm -n 50
";

    #[test]
    fn the_installers_reason_is_what_the_user_sees() {
        let msg = failure_message(&lines(UPDATE_STDERR), "the installer failed on the host");
        assert!(
            msg.starts_with("lpm was installed but never started. Check:"),
            "{msg}"
        );
        assert!(
            msg.contains("  systemctl status lpm-xvfb lpm-wm lpm"),
            "{msg}"
        );
        assert!(msg.contains("  journalctl -u lpm -n 50"), "{msg}");
        for noise in [
            "Running kernel",
            "Restarting services",
            "systemctl restart",
            "needrestart",
            "deferred",
            "containers",
            "@ session",
            "user manager",
            "VM guests",
        ] {
            assert!(!msg.contains(noise), "{noise:?} survived: {msg}");
        }
    }

    // apt's and dpkg's own errors are the evidence when a dependency install
    // fails — including dpkg's indented continuation line.
    #[test]
    fn a_real_apt_error_survives() {
        let stderr = lines(
            "E: Sub-process /usr/bin/dpkg returned an error code (1)
dpkg: error processing package libwebkit2gtk-4.1-0 (--configure):
 installed libwebkit2gtk-4.1-0 package post-installation script subprocess returned error exit status 1
Restarting services...
 systemctl restart lpm-xvfb.service
apt could not install the runtime dependencies.",
        );
        let msg = failure_message(&stderr, "fallback");
        assert!(
            msg.contains("E: Sub-process /usr/bin/dpkg returned an error code (1)"),
            "{msg}"
        );
        assert!(
            msg.contains(" installed libwebkit2gtk-4.1-0 package"),
            "{msg}"
        );
        assert!(msg.ends_with("apt could not install the runtime dependencies."));
        assert!(!msg.contains("systemctl restart"), "{msg}");
    }

    // Only the report's own items go: the same words under anything else are
    // someone telling the user what to run.
    #[test]
    fn indented_lines_outside_the_report_are_kept() {
        let stderr = lines(
            "lpm could not be started. Try:
  systemctl restart lpm.service
Restarting services...
 something needrestart has never printed",
        );
        let msg = failure_message(&stderr, "fallback");
        assert!(msg.contains("  systemctl restart lpm.service"), "{msg}");
        assert!(
            msg.contains("something needrestart has never printed"),
            "{msg}"
        );
    }

    #[test]
    fn only_the_last_lines_are_shown() {
        let stderr: Vec<String> = (0..50).map(|i| format!("line {i}")).collect();
        let msg = failure_message(&stderr, "fallback");
        assert_eq!(msg.lines().count(), SHOWN_LINES);
        assert!(msg.starts_with("line 20"), "{msg}");
        assert!(msg.ends_with("line 49"), "{msg}");
    }

    #[test]
    fn a_failure_that_said_nothing_else_still_says_something() {
        let noise = lines("Restarting services...\n systemctl restart lpm-xvfb.service\n\n");
        assert_eq!(
            failure_message(&noise, "fallback"),
            "Restarting services...\n systemctl restart lpm-xvfb.service"
        );
        assert_eq!(failure_message(&lines("\n  \n"), "fallback"), "fallback");
        assert_eq!(failure_message(&[], "fallback"), "fallback");
    }

    #[test]
    fn the_tail_is_bounded() {
        let text: String = (0..5000).map(|i| format!("line {i}\r\n")).collect();
        let got = Tail::drain(std::io::Cursor::new(text.into_bytes())).collect(PIPE_GRACE);
        assert_eq!(got.len(), TAIL_LINES);
        assert_eq!(got.last().map(String::as_str), Some("line 4999"));

        let endless = vec![b'x'; MAX_LINE * 4];
        let got = Tail::drain(std::io::Cursor::new(endless)).collect(PIPE_GRACE);
        assert_eq!(got, vec!["x".repeat(MAX_LINE)]);
    }

    fn sh(script: &str) -> Command {
        let mut cmd = Command::new("sh");
        cmd.arg("-c").arg(script);
        cmd
    }

    // Far more stderr than a pipe holds, then the reason. Read only after exit,
    // the command blocks on its first full pipe and this ends in the timeout.
    #[test]
    fn a_chatty_command_cannot_stall_on_a_full_pipe() {
        let script = "i=0; while [ $i -lt 20000 ]; do echo \"noise $i\" >&2; echo \"out $i\"; \
                      i=$((i+1)); done; echo 'the real reason' >&2; exit 4";
        let err = run(
            sh(script),
            None,
            Duration::from_secs(60),
            "failed",
            "timed out",
        )
        .unwrap_err();
        assert!(err.ends_with("the real reason"), "{err}");
        assert!(run(
            sh("exit 0"),
            None,
            Duration::from_secs(10),
            "failed",
            "timed out"
        )
        .is_ok());
    }

    #[test]
    fn the_script_arrives_on_stdin_and_the_deadline_still_holds() {
        let err = run(
            sh("sh -s"),
            Some("echo from-the-script >&2; exit 2"),
            Duration::from_secs(10),
            "failed",
            "timed out",
        )
        .unwrap_err();
        assert_eq!(err, "from-the-script");
        assert_eq!(
            run(
                sh("sleep 5"),
                None,
                Duration::from_millis(300),
                "failed",
                "timed out"
            ),
            Err("timed out".to_string())
        );
        assert_eq!(
            run(
                sh("exit 1"),
                None,
                Duration::from_secs(10),
                "failed",
                "timed out"
            ),
            Err("failed".to_string())
        );
    }
}
