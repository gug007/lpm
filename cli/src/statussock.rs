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

/// Quote a token for a socket command line so the server's shell_split returns
/// it verbatim: wrap in single quotes and emit an embedded single quote as
/// `'"'"'` (close the span, carry the quote in a double-quoted span, reopen) —
/// adjacent quoted spans merge back into one token. Newlines are the one thing
/// the line-framed protocol cannot carry: free text travels as `--<name>-hex`
/// (see [`text_opt`]) and identifier-ish args go through [`checked_arg`].
pub fn quote_arg(s: &str) -> String {
    format!("'{}'", s.replace('\'', r#"'"'"'"#))
}

/// Quote an identifier-ish argument, refusing values the protocol cannot carry:
/// an embedded newline would end the command line early and the remainder would
/// execute as its own socket verb, so fail loudly instead of sending a corrupt
/// line. `what` names the argument in the error.
pub fn checked_arg(what: &str, s: &str) -> Result<String, String> {
    if s.contains('\n') || s.contains('\r') {
        return Err(format!("{what} must not contain newlines"));
    }
    Ok(quote_arg(s))
}

/// Hex-encode UTF-8 text for a `--<name>-hex` option — the transport for free
/// text that must survive shell_split byte-for-byte (same encoding as the
/// `--message-hex` / `--payload-hex` precedents).
pub fn hex_encode(text: &str) -> String {
    text.as_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// One-line-safe plain rendering of free text for apps that predate the
/// `--<name>-hex` transport: newlines flatten to spaces, quotes survive via
/// [`quote_arg`]. Current apps ignore this copy in favor of the exact hex twin.
pub fn legacy_text(s: &str) -> String {
    quote_arg(&s.replace(['\n', '\r'], " "))
}

/// Render a free-text option as ` --<name>=<legacy> --<name>-hex=<hex>`: the
/// plain copy keeps older apps working (lossy only across newlines), the hex
/// copy is byte-exact and wins on current apps.
pub fn text_opt(name: &str, value: &str) -> String {
    format!(
        " --{name}={} --{name}-hex={}",
        legacy_text(value),
        hex_encode(value)
    )
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

/// Read timeout for a streaming request. Generous: a duplicate that reinstalls
/// dependencies on each copy can run for minutes before the final line.
const STREAM_TIMEOUT: Duration = Duration::from_secs(600);

/// Like [`request`], but for the streaming `duplicate_project` verb: `on_line`
/// is invoked with the payload of each `PROGRESS <done> <total> <name>` line
/// (the text after `PROGRESS `), and the first non-PROGRESS line (the final
/// JSON) is returned.
pub fn request_lines(
    socket_path: &Path,
    line: &str,
    mut on_line: impl FnMut(&str),
) -> Result<String, String> {
    let mut stream = UnixStream::connect(socket_path).map_err(|e| e.to_string())?;
    let _ = stream.set_read_timeout(Some(STREAM_TIMEOUT));
    let _ = stream.set_write_timeout(Some(STREAM_TIMEOUT));
    writeln!(stream, "{line}").map_err(|e| e.to_string())?;
    stream.flush().map_err(|e| e.to_string())?;
    let reader = BufReader::new(stream);
    for l in reader.lines() {
        let l = l.map_err(|e| e.to_string())?;
        if let Some(rest) = l.strip_prefix("PROGRESS ") {
            on_line(rest);
            continue;
        }
        return Ok(l);
    }
    Err("connection closed before a final reply".to_string())
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

    /// Mirrors the desktop server's `shell_split` (socketsrv.rs) so quoting
    /// round-trips are verified against the real grammar: quotes toggle state,
    /// adjacent quoted spans merge into one token, no escapes.
    fn shell_split(s: &str) -> Vec<String> {
        let mut parts = Vec::new();
        let mut current = String::new();
        let (mut in_single, mut in_double) = (false, false);
        for r in s.chars() {
            if r == '\'' && !in_double {
                in_single = !in_single;
            } else if r == '"' && !in_single {
                in_double = !in_double;
            } else if r == ' ' && !in_single && !in_double {
                if !current.is_empty() {
                    parts.push(std::mem::take(&mut current));
                }
            } else {
                current.push(r);
            }
        }
        if !current.is_empty() {
            parts.push(current);
        }
        parts
    }

    /// Mirrors the server's `hex_decode` for `--<name>-hex` round-trip tests.
    fn hex_decode(value: &str) -> Option<String> {
        if value.len() % 2 != 0 {
            return None;
        }
        let bytes: Option<Vec<_>> = value
            .as_bytes()
            .chunks_exact(2)
            .map(|pair| {
                std::str::from_utf8(pair)
                    .ok()
                    .and_then(|pair| u8::from_str_radix(pair, 16).ok())
            })
            .collect();
        String::from_utf8(bytes?).ok()
    }

    #[test]
    fn quote_arg_survives_shell_split() {
        for s in [
            "ab",
            "my proj",
            "a'b",
            r#"he said "hi""#,
            r#"it's "fine" now"#,
            "find . -name '*.tmp' -delete",
        ] {
            assert_eq!(shell_split(&format!("verb {}", quote_arg(s))), ["verb", s]);
        }
    }

    #[test]
    fn checked_arg_rejects_newlines_and_names_the_argument() {
        let err = checked_arg("project name", "a\nstop_project x").unwrap_err();
        assert!(err.contains("project name"));
        assert!(checked_arg("pane id", "a\rb").is_err());
        assert_eq!(checked_arg("project name", "my proj").unwrap(), "'my proj'");
    }

    #[test]
    fn text_opt_round_trips_quotes_and_newlines_via_hex() {
        let prompt = "fix 'this' and \"that\"\nsecond line\nstop_project x";
        let line = format!("run_task {}{}", quote_arg("proj"), text_opt("prompt", prompt));
        // One physical line: nothing for the server to mis-dispatch.
        assert!(!line.contains('\n'));
        let parts = shell_split(&line);
        let hex = parts
            .iter()
            .find_map(|p| p.strip_prefix("--prompt-hex="))
            .unwrap();
        assert_eq!(hex_decode(hex).unwrap(), prompt);
        // The legacy plain twin is one flattened token for pre-hex apps.
        let plain = parts.iter().find_map(|p| p.strip_prefix("--prompt=")).unwrap();
        assert_eq!(plain, "fix 'this' and \"that\" second line stop_project x");
    }

    #[test]
    fn hex_encode_matches_the_message_hex_precedent() {
        assert_eq!(hex_encode("don't"), "646f6e2774");
        assert_eq!(hex_decode(&hex_encode("")).as_deref(), Some(""));
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

    #[test]
    fn request_lines_streams_progress_then_returns_final() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("t.sock");
        let listener = UnixListener::bind(&path).unwrap();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut got = String::new();
            reader.read_line(&mut got).unwrap();
            writeln!(stream, "PROGRESS 1 2 copyA").unwrap();
            writeln!(stream, "PROGRESS 2 2 copyB").unwrap();
            writeln!(stream, r#"{{"ok":true,"names":["copyA","copyB"]}}"#).unwrap();
        });
        let mut progress: Vec<String> = Vec::new();
        let final_line = request_lines(&path, "duplicate_project 'x' --count=2", |p| {
            progress.push(p.to_string())
        })
        .unwrap();
        assert_eq!(progress, ["1 2 copyA", "2 2 copyB"]);
        assert!(final_line.contains("\"ok\":true"));
        server.join().unwrap();
    }
}
