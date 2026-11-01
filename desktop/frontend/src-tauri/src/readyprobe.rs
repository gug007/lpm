// One look at whether a service's ready check passes, made where the service
// runs: on this machine for a local project, on the host over ssh for a remote
// one. A log line is read from the service's pane either way, since a remote
// service's output comes back through its local ssh pane.
use crate::config::SshSettings;
use crate::readyspec::Probe;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, TcpStream};
use std::process::Command;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

const CONNECT_TIMEOUT: Duration = Duration::from_millis(300);
const HTTP_TIMEOUT: Duration = Duration::from_secs(2);
const REMOTE_TIMEOUT: Duration = Duration::from_secs(5);
const LOG_HISTORY: i64 = 3000;

pub fn passes(probe: &Probe, ssh: Option<&SshSettings>, pane: Option<&str>, cmd: &str) -> bool {
    match (probe, ssh) {
        (Probe::Log(text), _) => pane.is_some_and(|pane| log_has(pane, text, cmd)),
        (Probe::Port(port), None) => port_accepts(*port),
        (Probe::Url(url), None) => url_answers(url),
        (Probe::Port(port), Some(ssh)) => remote_passes(ssh, &remote_port_script(*port)),
        (Probe::Url(url), Some(ssh)) => remote_passes(ssh, &remote_url_script(url)),
    }
}

fn port_accepts(port: u16) -> bool {
    [
        IpAddr::V4(Ipv4Addr::LOCALHOST),
        IpAddr::V6(Ipv6Addr::LOCALHOST),
    ]
    .into_iter()
    .any(|ip| TcpStream::connect_timeout(&SocketAddr::new(ip, port), CONNECT_TIMEOUT).is_ok())
}

fn http_client() -> Option<&'static reqwest::blocking::Client> {
    static CLIENT: OnceLock<Option<reqwest::blocking::Client>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            // A dev server's certificate is usually self-signed, and all this
            // asks is whether it answers.
            reqwest::blocking::Client::builder()
                .timeout(HTTP_TIMEOUT)
                .no_proxy()
                .danger_accept_invalid_certs(true)
                .user_agent("lpm")
                .build()
                .ok()
        })
        .as_ref()
}

fn url_answers(url: &str) -> bool {
    http_client()
        .and_then(|client| client.get(url).send().ok())
        .is_some_and(|response| response.status().is_success())
}

/// Whether a line of the pane's output contains `text`. The line lpm typed to
/// start the service is skipped, since a command that mentions its own ready
/// text would otherwise pass before it has printed anything.
fn log_has(pane: &str, text: &str, cmd: &str) -> bool {
    crate::sessions::capture_pane(pane, LOG_HISTORY)
        .map(|output| output_has(&output, text, cmd))
        .unwrap_or(false)
}

pub(crate) fn output_has(output: &str, text: &str, cmd: &str) -> bool {
    let cmd = cmd.trim();
    output
        .lines()
        .filter(|line| cmd.is_empty() || !line.contains(cmd))
        .any(|line| line.contains(text))
}

fn remote_port_script(port: u16) -> String {
    format!("(exec 3<>/dev/tcp/127.0.0.1/{port}) 2>/dev/null || (exec 3<>/dev/tcp/::1/{port}) 2>/dev/null")
}

fn remote_url_script(url: &str) -> String {
    format!(
        "curl -fsSLk -o /dev/null --max-time 3 {}",
        crate::config::shell_quote(url)
    )
}

fn remote_passes(ssh: &SshSettings, script: &str) -> bool {
    succeeds_within(
        crate::sshexec::remote_login_script(ssh, script),
        REMOTE_TIMEOUT,
    )
}

fn succeeds_within(mut cmd: Command, limit: Duration) -> bool {
    cmd.stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    let Ok(mut child) = cmd.spawn() else {
        return false;
    };
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return status.success(),
            Ok(None) if start.elapsed() < limit => std::thread::sleep(Duration::from_millis(50)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return false;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    #[test]
    fn a_listening_port_accepts() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        assert!(passes(&Probe::Port(port), None, None, ""));
        drop(listener);
        assert!(!passes(&Probe::Port(port), None, None, ""));
    }

    #[test]
    fn the_typed_command_never_counts_as_its_log_line() {
        let output = "$ cd /app && echo listening && npm run dev\nlistening\n";
        assert!(output_has(
            output,
            "listening",
            "echo listening && npm run dev"
        ));
        let typed_only = "$ cd /app && echo listening && npm run dev\n";
        assert!(!output_has(
            typed_only,
            "listening",
            "echo listening && npm run dev"
        ));
    }

    #[test]
    fn a_log_check_without_a_pane_waits() {
        assert!(!passes(&Probe::Log("ready".into()), None, None, ""));
    }
}
