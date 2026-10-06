// Talking to the session daemon, and starting one when there isn't a daemon yet.
//
// The split that matters here is between READING and DOING. No daemon means no
// sessions, which is a perfectly good answer to "what is running" — the same
// answer `tmux list-sessions` gave with no server up — so a read must never
// start a process to discover that nothing is running. A command that has to
// open panes is the only thing allowed to bring the daemon up.
use crate::ipc::UnixStream;
use crate::sessionproto::{read_line, write_line, Request, Response};
use std::io::{BufReader, BufWriter};
#[cfg(not(test))]
use std::time::Instant;
use std::time::Duration;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(2);
/// Long enough for a pane batch to spawn (each is a shell start), short enough
/// that a wedged daemon surfaces as an error instead of a frozen UI.
const REPLY_TIMEOUT: Duration = Duration::from_secs(30);
#[cfg(all(not(test), unix))]
const STARTUP_WAIT: Duration = Duration::from_secs(5);
/// A first start on Windows may copy the executable and have it scanned by the
/// antivirus before it runs.
#[cfg(all(not(test), windows))]
const STARTUP_WAIT: Duration = Duration::from_secs(15);

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
/// re-exec'd with `--session-daemon`; on Unix it forks itself into its own
/// session immediately, so the child we spawn here exits at once and leaves
/// nothing to reap. Windows spawns it detached instead (daemonlaunch.rs).
#[cfg(not(test))]
fn start_daemon() -> Result<UnixStream, String> {
    #[cfg(not(target_os = "macos"))]
    check_socket_length(&crate::sessiond::socket_path())?;
    let exe = crate::daemonlaunch::program()?;
    #[cfg(unix)]
    {
        let mut launcher = std::process::Command::new(exe);
        #[cfg(target_os = "linux")]
        if let Some(key) = crate::webengine::app_only_env() {
            launcher.env_remove(key);
        }
        let mut child = launcher
            .arg(crate::sessiond::DAEMON_ARG)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| format!("could not start the session daemon: {e}"))?;
        let _ = child.wait(); // the launcher half; the daemon has already forked away
    }
    #[cfg(windows)]
    crate::daemonlaunch::spawn(&exe)?;

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

/// A daemon whose socket path is too long fails to bind; say so up front rather
/// than after the startup wait.
#[cfg(not(target_os = "macos"))]
fn check_socket_length(socket: &std::path::Path) -> Result<(), String> {
    let len = socket.as_os_str().len();
    if len > crate::ipc::MAX_SOCKET_PATH {
        return Err(format!(
            "the session daemon can't start: its socket path {} is {len} bytes, over the {} this system allows",
            socket.display(),
            crate::ipc::MAX_SOCKET_PATH
        ));
    }
    Ok(())
}

/// Tests serve the daemon on a thread in their own process, so they get the
/// real thing without re-execing a binary or reaching the daemon that carries
/// the developer's actual projects.
#[cfg(test)]
fn start_daemon() -> Result<UnixStream, String> {
    crate::sessiond::serve_in_process();
    connect().ok_or_else(|| "the test session server did not start".to_string())
}

#[cfg(all(test, not(target_os = "macos")))]
mod tests {
    use super::check_socket_length;
    use crate::ipc::MAX_SOCKET_PATH;
    use std::path::Path;

    #[test]
    fn a_socket_path_too_long_to_bind_is_refused_up_front() {
        let fits = format!("/{}", "a".repeat(MAX_SOCKET_PATH - 1));
        assert_eq!(check_socket_length(Path::new(&fits)), Ok(()));
        let over = format!("{fits}a");
        let err = check_socket_length(Path::new(&over)).unwrap_err();
        assert!(err.contains(&format!("{} bytes", MAX_SOCKET_PATH + 1)), "{err}");
    }
}
