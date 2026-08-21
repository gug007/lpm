// Talking to the session daemon, and starting one when there isn't a daemon yet.
//
// The split that matters here is between READING and DOING. No daemon means no
// sessions, which is a perfectly good answer to "what is running" — the same
// answer `tmux list-sessions` gave with no server up — so a read must never
// start a process to discover that nothing is running. A command that has to
// open panes is the only thing allowed to bring the daemon up.
use crate::sessionproto::{read_line, write_line, Request, Response};
use std::io::{BufReader, BufWriter};
use std::os::unix::net::UnixStream;
#[cfg(not(test))]
use std::time::Instant;
use std::time::Duration;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(2);
/// Long enough for a pane batch to spawn (each is a shell start), short enough
/// that a wedged daemon surfaces as an error instead of a frozen UI.
const REPLY_TIMEOUT: Duration = Duration::from_secs(30);
#[cfg(not(test))]
const STARTUP_WAIT: Duration = Duration::from_secs(5);

/// A connection that closed without answering — the daemon is gone, rather than
/// the request having failed.
const NO_REPLY: &str = "session daemon: no reply";

/// Nothing was listening. Callers that treat an absent daemon as a valid answer
/// compare against this rather than sniffing the error text.
pub const NO_DAEMON: &str = "no session daemon";

fn connect() -> Option<UnixStream> {
    let stream = UnixStream::connect(crate::sessiond::socket_path()).ok()?;
    let _ = stream.set_read_timeout(Some(REPLY_TIMEOUT));
    let _ = stream.set_write_timeout(Some(CONNECT_TIMEOUT));
    Some(stream)
}

fn exchange(stream: UnixStream, request: &Request) -> Result<Response, String> {
    let read_half = stream
        .try_clone()
        .map_err(|e| format!("session daemon: {e}"))?;
    let mut writer = BufWriter::new(stream);
    let mut reader = BufReader::new(read_half);
    write_line(&mut writer, request).map_err(|e| format!("session daemon: {e}"))?;
    read_line::<_, Response>(&mut reader)
        .ok_or_else(|| NO_REPLY.to_string())?
        .into_result()
}

/// Ask a running daemon. `Err` when there is none — callers that treat absence
/// as "nothing is running" swallow it, exactly as they swallowed a missing tmux.
pub fn query(request: &Request) -> Result<Response, String> {
    let stream = connect().ok_or_else(|| NO_DAEMON.to_string())?;
    exchange(stream, request)
}

/// Ask, starting the daemon first if it isn't up.
pub fn command(request: &Request) -> Result<Response, String> {
    if let Some(stream) = connect() {
        match exchange(stream, request) {
            // A daemon that retires between our connect and our request leaves
            // the connection closed with nothing on it. That is not a failed
            // command, it is a daemon that went away — start one and ask again.
            Err(error) if error == NO_REPLY => {}
            result => return result,
        }
    }
    exchange(start_daemon()?, request)
}

/// Launch the daemon and wait for its socket. The daemon is this same binary
/// re-exec'd with `--session-daemon`; it forks itself into its own session
/// immediately, so the child we spawn here exits at once and leaves nothing to
/// reap.
#[cfg(not(test))]
fn start_daemon() -> Result<UnixStream, String> {
    let exe = std::env::current_exe().map_err(|e| format!("session daemon: {e}"))?;
    let mut child = std::process::Command::new(exe)
        .arg(crate::sessiond::DAEMON_ARG)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("could not start the session daemon: {e}"))?;
    let _ = child.wait(); // the launcher half; the daemon has already forked away

    let deadline = Instant::now() + STARTUP_WAIT;
    loop {
        if let Some(stream) = connect() {
            return Ok(stream);
        }
        if Instant::now() >= deadline {
            return Err("the session daemon did not start".into());
        }
        std::thread::sleep(Duration::from_millis(25));
    }
}

/// Tests serve the daemon on a thread in their own process, so they get the
/// real thing without re-execing a binary or reaching the daemon that carries
/// the developer's actual projects.
#[cfg(test)]
fn start_daemon() -> Result<UnixStream, String> {
    crate::sessiond::serve_in_process();
    connect().ok_or_else(|| "the test session server did not start".to_string())
}
