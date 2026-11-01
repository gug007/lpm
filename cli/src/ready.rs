//! A service's `ready` check: the config shape (the app's readyspec.rs accepts
//! the same YAML) and the probe `lpm wait` runs.
//!
//! `ready: port` waits for the service's own `port`, `ready: 4001` for that
//! port, `ready: http://…` for a 2xx answer, and the mapping form adds
//! `log: <text>` (a line of the service's output contains it) and `timeout`.

use serde::Deserialize;
use serde_norway::{Mapping, Value as Yaml};
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

pub const DEFAULT_TIMEOUT_SECS: u64 = 30;
pub const MAX_TIMEOUT_SECS: u64 = 3600;

#[derive(Deserialize, Clone, Debug, PartialEq)]
#[serde(untagged)]
pub enum ReadySpec {
    Port(i64),
    Text(String),
    Full(Mapping),
    // Anything else still loads the project; it resolves to an error instead.
    Invalid(serde::de::IgnoredAny),
}

#[derive(Clone, Debug, PartialEq)]
pub enum Probe {
    Port(u16),
    Url(String),
    Log(String),
}

#[derive(Clone, Debug, PartialEq)]
pub struct ReadyCheck {
    pub probe: Probe,
    pub timeout: Duration,
}

const SHAPE: &str =
    "expected port, a port number, an http(s) URL, or a mapping with one of port, url or log";
const KEYS: [&str; 4] = ["port", "url", "log", "timeout"];

fn port_probe(port: i64) -> Result<Probe, String> {
    u16::try_from(port)
        .ok()
        .filter(|p| *p > 0)
        .map(Probe::Port)
        .ok_or_else(|| "port must be from 1 to 65535".to_string())
}

fn own_port(service_port: i64) -> Result<Probe, String> {
    if service_port <= 0 {
        return Err("checking the service's port needs the service to set `port`".into());
    }
    port_probe(service_port)
}

fn is_url(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    ["http://", "https://"]
        .iter()
        .any(|scheme| lower.starts_with(scheme) && lower.len() > scheme.len())
}

fn url_probe(url: &str) -> Result<Probe, String> {
    let url = url.trim();
    if is_url(url) {
        Ok(Probe::Url(url.to_string()))
    } else {
        Err("url must start with http:// or https://".into())
    }
}

impl ReadySpec {
    pub fn resolve(&self, service_port: i64) -> Result<ReadyCheck, String> {
        let probe = match self {
            ReadySpec::Port(port) => port_probe(*port)?,
            ReadySpec::Text(text) if text.trim() == "port" => own_port(service_port)?,
            ReadySpec::Text(text) if is_url(text.trim()) => url_probe(text)?,
            ReadySpec::Text(_) | ReadySpec::Invalid(_) => return Err(SHAPE.into()),
            ReadySpec::Full(map) => return resolve_map(map, service_port),
        };
        Ok(ReadyCheck {
            probe,
            timeout: Duration::from_secs(DEFAULT_TIMEOUT_SECS),
        })
    }
}

fn resolve_map(map: &Mapping, service_port: i64) -> Result<ReadyCheck, String> {
    if let Some(key) = map
        .keys()
        .find(|k| !k.as_str().is_some_and(|k| KEYS.contains(&k)))
    {
        let key = key
            .as_str()
            .map(|k| format!("{k:?}"))
            .unwrap_or_else(|| "(not a string)".into());
        return Err(format!(
            "unknown key {key}; expected port, url, log or timeout"
        ));
    }
    let set = ["port", "url", "log"]
        .iter()
        .filter(|k| map.contains_key(**k))
        .count();
    if set != 1 {
        return Err("set exactly one of port, url or log".into());
    }
    let probe = if let Some(port) = map.get("port") {
        match port {
            Yaml::Bool(true) => own_port(service_port)?,
            Yaml::Number(n) => port_probe(n.as_i64().unwrap_or(0))?,
            _ => return Err("port must be true or a port number".into()),
        }
    } else if let Some(url) = map.get("url") {
        url_probe(url.as_str().ok_or("url must be a string")?)?
    } else {
        let text = map
            .get("log")
            .and_then(Yaml::as_str)
            .ok_or("log must be a string")?;
        if text.trim().is_empty() {
            return Err("log must not be empty".into());
        }
        Probe::Log(text.to_string())
    };
    let secs = match map.get("timeout") {
        None => DEFAULT_TIMEOUT_SECS,
        Some(t) => t
            .as_i64()
            .filter(|t| (1..=MAX_TIMEOUT_SECS as i64).contains(t))
            .map(|t| t as u64)
            .ok_or_else(|| format!("timeout must be from 1 to {MAX_TIMEOUT_SECS} seconds"))?,
    };
    Ok(ReadyCheck {
        probe,
        timeout: Duration::from_secs(secs),
    })
}

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

fn output_has(output: &str, text: &str, cmd: &str) -> bool {
    let cmd = cmd.trim();
    output
        .lines()
        .filter(|line| cmd.is_empty() || !line.contains(cmd))
        .any(|line| line.contains(text))
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
    write!(
        stream,
        "GET {} HTTP/1.1\r\nHost: {host}:{}\r\nUser-Agent: lpm\r\nAccept: */*\r\nConnection: close\r\n\r\n",
        target.path, target.port
    )
    .ok()?;
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

    fn parse(yaml: &str) -> ReadySpec {
        serde_norway::from_str(yaml).unwrap()
    }

    #[test]
    fn same_shapes_as_the_app() {
        assert_eq!(
            parse("port").resolve(4000).unwrap().probe,
            Probe::Port(4000)
        );
        assert_eq!(parse("4001").resolve(0).unwrap().probe, Probe::Port(4001));
        assert_eq!(
            parse("http://localhost:3000/up").resolve(0).unwrap().probe,
            Probe::Url("http://localhost:3000/up".into())
        );
        let log = parse("log: ready in\ntimeout: 60").resolve(0).unwrap();
        assert_eq!(log.probe, Probe::Log("ready in".into()));
        assert_eq!(log.timeout, Duration::from_secs(60));
        for bad in [
            "soon",
            "[1]",
            "{}",
            "prot: 1",
            "port: false",
            "url: x",
            "log: up\ntimeout: 0",
        ] {
            assert!(parse(bad).resolve(3000).is_err(), "{bad}");
        }
        assert!(parse("port").resolve(0).is_err());
    }

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
                let mut buf = [0u8; 512];
                let _ = conn.read(&mut buf);
                let _ = write!(conn, "HTTP/1.1 {code}\r\nContent-Length: 0\r\n\r\n");
            }
        });
        let url = format!("http://127.0.0.1:{port}/health");
        assert!(url_answers(&url));
        assert!(!url_answers(&url));
        server.join().unwrap();
    }

    #[test]
    fn the_typed_command_never_counts_as_its_log_line() {
        assert!(!output_has(
            "$ echo up && serve\n",
            "up",
            "echo up && serve"
        ));
        assert!(output_has(
            "$ echo up && serve\nup\n",
            "up",
            "echo up && serve"
        ));
    }
}
