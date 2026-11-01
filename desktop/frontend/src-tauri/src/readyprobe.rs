// One look at whether a service's ready check passes, made where the service
// runs: on this machine for a local project, on the host over ssh for a remote
// one. A log line is read from the service's pane either way, since a remote
// service's output comes back through its local ssh pane.
use crate::config::SshSettings;
use crate::readyspec::{output_has, Probe};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, TcpStream};
use std::process::Command;
use std::sync::OnceLock;
use std::time::Duration;

const CONNECT_TIMEOUT: Duration = Duration::from_millis(300);
const HTTP_TIMEOUT: Duration = Duration::from_secs(2);
const REMOTE_TIMEOUT: Duration = Duration::from_secs(5);
const LOG_HISTORY: i64 = 3000;

pub fn passes(probe: &Probe, ssh: Option<&SshSettings>, pane: Option<&str>, cmd: &str) -> bool {
    match (probe, ssh) {
        (Probe::Log(text), _) => pane.is_some_and(|pane| log_has(pane, text, cmd)),
        (Probe::Port(port), None) => port_accepts(*port),
        (Probe::Url(url), None) => url_answers(url),
        (Probe::Port(port), Some(ssh)) => {
            remote_passes(|s| remote_bash(ssh, s), &remote_port_script(*port))
        }
        (Probe::Url(url), Some(ssh)) => remote_passes(
            |s| crate::sshexec::remote_login_script(ssh, s),
            &remote_url_script(url),
        ),
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

fn log_has(pane: &str, text: &str, cmd: &str) -> bool {
    crate::sessions::capture_pane(pane, LOG_HISTORY)
        .map(|output| output_has(&output, text, cmd))
        .unwrap_or(false)
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

/// A port check needs bash's /dev/tcp but nothing from the login profile,
/// which a check repeated every second shouldn't load each time.
fn remote_bash(ssh: &SshSettings, script: &str) -> Command {
    let mut cmd = crate::osproc::command("ssh");
    cmd.args(crate::config::ssh_exec_args(ssh));
    cmd.arg(format!(
        "exec bash -c {}",
        crate::config::shell_quote(script)
    ));
    cmd
}

fn remote_passes(on_host: impl FnOnce(&str) -> Command, script: &str) -> bool {
    const PASSED: &str = "lpm-ready";
    let cmd = on_host(&format!("{{ {script}; }} && echo {PASSED}"));
    crate::statusfwd::run_with_timeout(cmd, REMOTE_TIMEOUT)
        .is_some_and(|out| String::from_utf8_lossy(&out).contains(PASSED))
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
    fn a_log_check_without_a_pane_waits() {
        assert!(!passes(&Probe::Log("ready".into()), None, None, ""));
    }
}
