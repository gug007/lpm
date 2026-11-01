//! A service's `ready` check: the config shape, parsed by the app's own
//! readyspec.rs so both accept the same YAML, and the probe `lpm wait` runs.

use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

// The service editor's `to_json` is the app's alone.
#[path = "../../desktop/frontend/src-tauri/src/readyspec.rs"]
#[allow(dead_code)]
mod spec;

use spec::output_has;
pub use spec::{Probe, ReadyCheck, ReadySpec};

/// Whether the check passes now. A log line is read from the service's pane
/// in `session`; the line lpm typed to start it never counts.
pub fn passes(probe: &Probe, session: &str, service: &str, cmd: &str) -> bool {
    match probe {
        Probe::Port(port) => crate::service::port_accepts(*port),
        Probe::Url(url) => url_answers(url),
        Probe::Log(text) => crate::sessions::list_panes_brief(session)
            .into_iter()
            .find(|pane| pane.service == service)
            .and_then(|pane| crate::sessions::capture_pane(&pane.id, 3000).ok())
            .is_some_and(|output| output_has(&output, text, cmd)),
    }
}

const CONNECT_TIMEOUT: Duration = Duration::from_millis(300);
const HTTP_TIMEOUT: Duration = Duration::from_secs(2);

/// https needs TLS, which the CLI leaves to curl; plain http is one request.
fn url_answers(url: &str) -> bool {
    if url.to_ascii_lowercase().starts_with("https://") {
        let mut cmd = std::process::Command::new("curl");
        cmd.args([
            "-fsSLk",
            "-o",
            if cfg!(windows) { "NUL" } else { "/dev/null" },
            "--max-time",
            "2",
            url,
        ])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
        return cmd.status().is_ok_and(|s| s.success());
    }
    http_status(url).is_some_and(|code| (200..300).contains(&code))
}

struct HttpTarget {
    host: String,
    port: u16,
    path: String,
}

fn http_target(url: &str) -> Option<HttpTarget> {
    let rest = url.get("http://".len()..)?;
    let (authority, path) = match rest.find('/') {
        Some(i) => (&rest[..i], &rest[i..]),
        None => (rest, "/"),
    };
    let authority = authority.rsplit('@').next()?;
    let (host, port) = if let Some(v6) = authority.strip_prefix('[') {
        let (host, after) = v6.split_once(']')?;
        let port = after.strip_prefix(':').map(str::parse).transpose().ok()?;
        (host.to_string(), port.unwrap_or(80))
    } else {
        match authority.rsplit_once(':') {
            Some((host, port)) => (host.to_string(), port.parse().ok()?),
            None => (authority.to_string(), 80),
        }
    };
    if host.is_empty() {
        return None;
    }
    Some(HttpTarget {
        host,
        port,
        path: path.to_string(),
    })
}

fn http_status(url: &str) -> Option<u16> {
    let target = http_target(url)?;
    let addr = (target.host.as_str(), target.port)
        .to_socket_addrs()
        .ok()?
        .next()?;
    let mut stream = TcpStream::connect_timeout(&addr, CONNECT_TIMEOUT).ok()?;
    stream.set_read_timeout(Some(HTTP_TIMEOUT)).ok()?;
    stream.set_write_timeout(Some(HTTP_TIMEOUT)).ok()?;
    let host = if target.host.contains(':') {
        format!("[{}]", target.host)
    } else {
        target.host.clone()
    };
    let request = format!(
        "GET {} HTTP/1.1\r\nHost: {host}:{}\r\nUser-Agent: lpm\r\nAccept: */*\r\nConnection: close\r\n\r\n",
        target.path, target.port
    );
    stream.write_all(request.as_bytes()).ok()?;
    let mut head = Vec::new();
    let mut chunk = [0u8; 128];
    while !head.windows(2).any(|w| w == b"\r\n") && head.len() < 512 {
        let n = stream.read(&mut chunk).ok()?;
        if n == 0 {
            break;
        }
        head.extend_from_slice(&chunk[..n]);
    }
    status_code(&String::from_utf8_lossy(&head))
}

fn status_code(first_line: &str) -> Option<u16> {
    let mut parts = first_line.split_whitespace();
    parts.next().filter(|v| v.starts_with("HTTP/"))?;
    parts.next()?.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{Ipv4Addr, TcpListener};

    #[test]
    fn http_targets_parse() {
        let t = http_target("http://localhost:3000/health?x=1").unwrap();
        assert_eq!(
            (t.host.as_str(), t.port, t.path.as_str()),
            ("localhost", 3000, "/health?x=1")
        );
        let t = http_target("http://[::1]:8080").unwrap();
        assert_eq!(
            (t.host.as_str(), t.port, t.path.as_str()),
            ("::1", 8080, "/")
        );
        assert_eq!(http_target("http://example.test").unwrap().port, 80);
        assert!(http_target("http://:80/").is_none());
        assert_eq!(status_code("HTTP/1.1 204 No Content\r\n"), Some(204));
        assert_eq!(status_code("garbage"), None);
    }

    #[test]
    fn a_local_http_server_answers() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            for code in ["200 OK", "503 Service Unavailable"] {
                let (mut conn, _) = listener.accept().unwrap();
                let mut request = Vec::new();
                let mut buf = [0u8; 512];
                while !request.ends_with(b"\r\n\r\n") {
                    match conn.read(&mut buf) {
                        Ok(0) | Err(_) => break,
                        Ok(n) => request.extend_from_slice(&buf[..n]),
                    }
                }
                let _ = conn
                    .write_all(format!("HTTP/1.1 {code}\r\nContent-Length: 0\r\n\r\n").as_bytes());
            }
        });
        let url = format!("http://127.0.0.1:{port}/health");
        assert!(url_answers(&url));
        assert!(!url_answers(&url));
        server.join().unwrap();
    }
}
