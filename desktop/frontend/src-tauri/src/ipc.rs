// Local-socket types for every path-addressed socket lpm serves or dials (the
// status socket, the session daemon, the lesson socket, the CLI). Windows 10
// 1803+ speaks AF_UNIX too, so the protocols stay path-based on every platform;
// only the type behind the name changes.
#[cfg(unix)]
pub use std::os::unix::net::{UnixListener, UnixStream};
#[cfg(windows)]
pub use uds_windows::{UnixListener, UnixStream};

/// Longest socket path the platform's `sockaddr_un` holds (bytes, NUL excluded).
#[cfg_attr(target_os = "macos", allow(dead_code))]
pub const MAX_SOCKET_PATH: usize = if cfg!(target_os = "macos") {
    103
} else {
    107
};

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Write};

    #[test]
    fn round_trips_a_line_over_a_path_socket() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("t.sock");
        let listener = UnixListener::bind(&path).unwrap();
        let server = std::thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            let mut line = String::new();
            BufReader::new(&stream).read_line(&mut line).unwrap();
            (&stream).write_all(line.to_uppercase().as_bytes()).unwrap();
        });
        let mut client = UnixStream::connect(&path).unwrap();
        client.write_all(b"ping\n").unwrap();
        let mut reply = String::new();
        BufReader::new(&client).read_line(&mut reply).unwrap();
        server.join().unwrap();
        assert_eq!(reply, "PING\n");
    }
}
