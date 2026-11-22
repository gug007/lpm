// Agent status from inside WSL. A WSL 2 distro can't reach a Windows socket, so
// for each distro lpm keeps one wsl.exe running whose small listener takes the
// hooks' messages on a socket in the distro's ~/.lpm/fwd and prints each one;
// lpm reads them here and takes them as an SSH host's forward delivers them,
// status verbs only (socketsrv::replay_remote).
#![cfg_attr(not(windows), allow(dead_code))]

/// The socket's path under the distro user's home. Named per build, as the SSH
/// forward's is, so a dev build and the installed app don't take each other's.
pub(crate) const SOCKET_REL: &str = if cfg!(debug_assertions) {
    ".lpm/fwd/lpm-wsl-dev.sock"
} else {
    ".lpm/fwd/lpm-wsl.sock"
};

/// Run by `sh` in the distro with the socket's path under $HOME as $1 and the
/// Python listener as $2: python3 where the distro has it (Ubuntu and Debian
/// do), OpenBSD netcat otherwise.
pub(crate) const LISTENER: &str = r#"sock="$HOME/$1"; mkdir -p "$(dirname "$sock")" && rm -f "$sock" || exit 1
if command -v python3 >/dev/null 2>&1; then exec python3 -u -c "$2" "$sock"; fi
exec nc -lkU "$sock""#;

/// One message per connection, as the hooks send them; each line printed for
/// lpm and the sender answered so it doesn't wait out its timeout.
pub(crate) const PY_LISTENER: &str = r#"import os, socket, sys
path = sys.argv[1]
srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
srv.bind(path)
os.chmod(path, 0o600)
srv.listen(16)
while True:
    conn, _ = srv.accept()
    try:
        conn.settimeout(2)
        data = b""
        while not data.endswith(b"\n"):
            chunk = conn.recv(65536)
            if not chunk:
                break
            data += chunk
        for line in data.decode("utf-8", "replace").splitlines():
            if line.strip():
                print(line, flush=True)
        conn.sendall(b"OK\n")
    except Exception:
        pass
    finally:
        conn.close()
"#;

/// What a terminal in the distro exports so the hooks there find the listener.
pub(crate) fn socket_export() -> String {
    format!("export LPM_SOCKET_PATH=\"$HOME/{SOCKET_REL}\"")
}

#[cfg(windows)]
fn live() -> &'static std::sync::Mutex<std::collections::HashSet<String>> {
    static LIVE: std::sync::OnceLock<std::sync::Mutex<std::collections::HashSet<String>>> =
        std::sync::OnceLock::new();
    LIVE.get_or_init(Default::default)
}

/// Start the distro's listener unless it is running. It ends with the app, and
/// the next terminal in the distro starts it again if it stopped (the distro
/// was shut down).
#[cfg(windows)]
pub(crate) fn ensure_bridge(app: &tauri::AppHandle, distro: &str) {
    use std::io::BufRead;
    use std::process::Stdio;
    if !live().lock().unwrap().insert(distro.to_string()) {
        return;
    }
    let child = crate::osproc::command(crate::wsl::exe())
        .args(["-d", distro, "--exec", "sh", "-c", LISTENER, "sh", SOCKET_REL, PY_LISTENER])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn();
    let mut child = match child {
        Ok(child) => child,
        Err(_) => {
            live().lock().unwrap().remove(distro);
            return;
        }
    };
    crate::sshjob::tie_to_app(&child);
    let app = app.clone();
    let distro = distro.to_string();
    std::thread::spawn(move || {
        if let Some(out) = child.stdout.take() {
            for line in std::io::BufReader::new(out).lines() {
                let Ok(line) = line else { break };
                crate::socketsrv::replay_remote(&app, &line);
            }
        }
        let _ = child.wait();
        live().lock().unwrap().remove(&distro);
    });
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::io::{BufRead, Read, Write};

    #[test]
    fn the_listener_prints_what_a_hook_sends_and_answers_it() {
        if std::process::Command::new("python3").arg("--version").output().is_err() {
            return;
        }
        let home = tempfile::tempdir().unwrap();
        let mut child = std::process::Command::new("sh")
            .args(["-c", LISTENER, "sh", SOCKET_REL, PY_LISTENER])
            .env("HOME", home.path())
            .stdout(std::process::Stdio::piped())
            .spawn()
            .unwrap();
        let sock = home.path().join(SOCKET_REL);
        let start = std::time::Instant::now();
        while !sock.exists() && start.elapsed() < std::time::Duration::from_secs(10) {
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        let mut conn = std::os::unix::net::UnixStream::connect(&sock).unwrap();
        conn.write_all(b"set_status 'app' claude_code_p1 Done --pane=p1\n").unwrap();
        let mut reply = String::new();
        conn.read_to_string(&mut reply).unwrap();
        assert_eq!(reply, "OK\n");
        let mut printed = String::new();
        std::io::BufReader::new(child.stdout.take().unwrap())
            .read_line(&mut printed)
            .unwrap();
        let _ = child.kill();
        let _ = child.wait();
        assert_eq!(printed, "set_status 'app' claude_code_p1 Done --pane=p1\n");
    }

    #[test]
    fn terminals_point_the_hooks_at_the_listener() {
        assert_eq!(socket_export(), format!("export LPM_SOCKET_PATH=\"$HOME/{SOCKET_REL}\""));
    }
}
