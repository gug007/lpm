//! Query the running desktop app's unix-socket status server (socketsrv.rs).
//! Protocol: connect to `~/.lpm/lpm.sock`, write one `list_status <project>\n`
//! line, read one line back — a JSON array of status entries. Any failure
//! (socket absent, app not running, timeout, error reply) degrades to None so
//! the CLI still renders everything else.

use serde::Deserialize;
use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixStream;
use std::path::Path;
use std::time::Duration;

/// A per-pane agent status row, matching `status.rs`'s `StatusEntry` JSON.
#[derive(Deserialize, Clone)]
pub struct StatusEntry {
    pub key: String,
    pub value: String,
    #[serde(default)]
    pub icon: String,
    #[serde(default)]
    pub color: String,
    #[serde(default)]
    pub priority: i64,
    #[serde(default)]
    pub timestamp: i64,
    #[serde(rename = "agentPID", default)]
    pub agent_pid: i64,
    #[serde(rename = "paneID", default)]
    pub pane_id: String,
}

/// Timeout for a control round-trip. Longer than `ping`/`list_status`'s 2s
/// fast-fail because a verb like `start_project` waits for tmux to spawn panes
/// before the app replies.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

/// Quote a token for a socket command line: single-quote it and drop embedded
/// single quotes, so a value with spaces stays one shell-split token (mirrors
/// how the hooks and `list_status` quote their arguments).
pub fn quote_arg(s: &str) -> String {
    format!("'{}'", s.replace('\'', ""))
}

/// Send one command line and return its single-line reply (trailing newline
/// trimmed). `Err` only on transport failure (socket absent, timeout); an
/// `ERROR: ...` reply from the app is still `Ok` — the caller interprets it.
pub fn request(socket_path: &Path, line: &str) -> Result<String, String> {
    let mut stream = UnixStream::connect(socket_path).map_err(|e| e.to_string())?;
    let _ = stream.set_read_timeout(Some(REQUEST_TIMEOUT));
    let _ = stream.set_write_timeout(Some(REQUEST_TIMEOUT));
    writeln!(stream, "{line}").map_err(|e| e.to_string())?;
    stream.flush().map_err(|e| e.to_string())?;
    let mut reader = BufReader::new(stream);
    let mut reply = String::new();
    reader.read_line(&mut reply).map_err(|e| e.to_string())?;
    Ok(reply.trim_end().to_string())
}

/// Whether the app's status server is reachable: send `ping`, expect a `PONG`
/// line. Distinguishes "app not running" from "app running, no statuses" — a
/// distinction `list_status`'s `None` cannot make on its own.
pub fn ping(socket_path: &Path) -> bool {
    let Ok(mut stream) = UnixStream::connect(socket_path) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
    if writeln!(stream, "ping").is_err() || stream.flush().is_err() {
        return false;
    }
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    if reader.read_line(&mut line).is_err() {
        return false;
    }
    line.trim() == "PONG"
}

/// Query `list_status <project>`. `Ok(None)` when the app isn't reachable (no
/// live status), `Ok(Some(_))` on a parsed reply, `Err` only on a malformed but
/// present reply (still non-fatal to callers, who may treat it as None).
pub fn list_status(socket_path: &Path, project: &str) -> Option<Vec<StatusEntry>> {
    let mut stream = UnixStream::connect(socket_path).ok()?;
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
    // The command line is shell-split by the server; single-quote the project so
    // a name with spaces stays one token (mirrors how hooks quote it).
    writeln!(stream, "list_status {}", quote_arg(project)).ok()?;
    stream.flush().ok()?;
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    reader.read_line(&mut line).ok()?;
    let line = line.trim();
    if line.is_empty() || line.starts_with("ERROR") {
        return None;
    }
    serde_json::from_str::<Vec<StatusEntry>>(line).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::net::UnixListener;

    #[test]
    fn quote_strips_embedded_single_quotes() {
        assert_eq!(quote_arg("ab"), "'ab'");
        assert_eq!(quote_arg("a'b"), "'ab'");
        assert_eq!(quote_arg("my proj"), "'my proj'");
    }

    #[test]
    fn request_round_trips_a_line() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("t.sock");
        let listener = UnixListener::bind(&path).unwrap();
        let server = std::thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut got = String::new();
            reader.read_line(&mut got).unwrap();
            let mut w = stream;
            writeln!(w, "OK").unwrap();
            got.trim_end().to_string()
        });
        let reply = request(&path, "start_project 'x'").unwrap();
        assert_eq!(reply, "OK");
        assert_eq!(server.join().unwrap(), "start_project 'x'");
    }
}
