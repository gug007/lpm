use std::io::Write;
use std::process::{Command, Stdio};

fn run_hook(
    args: &[&str],
    payload: &str,
    socket: Option<&std::path::Path>,
) -> std::process::Output {
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_lpm"));
    cmd.arg("hook")
        .args(args)
        .env("LPM_PROJECT_NAME", "proj")
        .env("LPM_PANE_ID", "pane-1")
        .env("HOME", std::env::temp_dir().join("lpm-hook-exec-no-home"))
        .env(
            "USERPROFILE",
            std::env::temp_dir().join("lpm-hook-exec-no-home"),
        )
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    match socket {
        Some(path) => cmd.env("LPM_SOCKET_PATH", path),
        None => cmd.env_remove("LPM_SOCKET_PATH"),
    };
    let mut child = cmd.spawn().unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(payload.as_bytes())
        .unwrap();
    child.wait_with_output().unwrap()
}

#[test]
fn a_hook_always_exits_zero_and_prints_nothing() {
    for args in [
        &["claude", "PreToolUse", "# lpm-hook"][..],
        &["claude", "Stop", "--unknown-flag", "extra"][..],
        &["codex", "NoSuchEvent"][..],
        &[][..],
    ] {
        let out = run_hook(args, r#"{"session_id":"s1"}"#, None);
        assert!(out.status.success(), "{args:?}: {:?}", out.status);
        assert!(out.stdout.is_empty(), "{args:?}: {:?}", out.stdout);
    }
}

#[cfg(unix)]
#[test]
fn an_installed_hook_delivers_its_frame() {
    use std::io::{BufRead, BufReader};
    use std::os::unix::net::UnixListener;
    let dir = tempfile::tempdir().unwrap();
    let sock = dir.path().join("s.sock");
    let listener = UnixListener::bind(&sock).unwrap();
    let server = std::thread::spawn(move || {
        let (stream, _) = listener.accept().unwrap();
        let mut line = String::new();
        BufReader::new(&stream).read_line(&mut line).unwrap();
        writeln!(&stream, "OK").unwrap();
        line
    });
    let payload = format!(
        r#"{{"session_id":"s1","tool_output":"{}"}}"#,
        "o".repeat(1 << 20)
    );
    let out = run_hook(
        &["claude", "PostToolUse", "# lpm-hook"],
        &payload,
        Some(&sock),
    );
    assert!(out.status.success());
    let line = server.join().unwrap();
    assert!(
        line.starts_with("set_status 'proj' claude_code_s1 Running --icon=bolt --color=#4C8DFF --pane=pane-1 --reporter-pid="),
        "{line}"
    );
}
