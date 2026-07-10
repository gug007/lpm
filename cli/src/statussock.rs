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

/// Query `list_status <project>`. `Ok(None)` when the app isn't reachable (no
/// live status), `Ok(Some(_))` on a parsed reply, `Err` only on a malformed but
/// present reply (still non-fatal to callers, who may treat it as None).
pub fn list_status(socket_path: &Path, project: &str) -> Option<Vec<StatusEntry>> {
    let mut stream = UnixStream::connect(socket_path).ok()?;
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
    // The command line is shell-split by the server; single-quote the project so
    // a name with spaces stays one token (mirrors how hooks quote it).
    writeln!(stream, "list_status '{}'", project.replace('\'', "")).ok()?;
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
