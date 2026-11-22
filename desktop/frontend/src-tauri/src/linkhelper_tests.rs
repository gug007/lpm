use super::*;
use sha2::{Digest, Sha256};
use std::net::TcpListener;
use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

fn device(id: &str, token: &str) -> Device {
    Device {
        id: id.into(),
        token_hash: hex::encode(Sha256::digest(token.as_bytes())),
        ..Device::default()
    }
}

fn auth(id: &str, token: &str) -> Value {
    json!({ "t": "auth", "deviceId": id, "token": token })
}

#[test]
fn only_a_paired_device_gets_in() {
    let devices = [device("phone", "secret")];
    assert!(authorized(&auth("phone", "secret"), &devices));
    assert!(!authorized(&auth("phone", "wrong"), &devices));
    assert!(!authorized(&auth("other", "secret"), &devices));
    assert!(!authorized(&auth("", ""), &devices));
    assert!(!authorized(
        &json!({ "t": "pair", "code": "AB12" }),
        &devices
    ));
}

#[test]
fn the_helper_sits_clear_of_the_app_peer_and_dev_ports() {
    assert_eq!(launcher_port(8765), 8775);
    assert_eq!(launcher_port(65530), 65535);
}

#[test]
fn finds_the_app_bundle_an_executable_sits_in() {
    assert_eq!(
        bundle_of(Path::new("/Applications/lpm.app/Contents/MacOS/lpm")),
        Some(Path::new("/Applications/lpm.app"))
    );
    assert_eq!(bundle_of(Path::new("/repo/target/debug/lpm-desktop")), None);
}

const CLIENT_GIVES_UP: Duration = Duration::from_secs(30);

/// Runs one session on a local socket and returns what the phone heard.
fn exchange(frames: &[Value], up_after: usize, opens: Arc<AtomicBool>) -> Vec<Value> {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let server = std::thread::spawn(move || {
        let (tcp, _) = listener.accept().unwrap();
        let ws = tungstenite::accept(tcp).unwrap();
        let checks = AtomicUsize::new(0);
        let up = || checks.fetch_add(1, Ordering::SeqCst) >= up_after;
        let open = || {
            opens.store(true, Ordering::SeqCst);
            Ok(())
        };
        let ready = json!({ "t": "ready", "features": [LAUNCH_FEATURE] });
        let _ = session(ws, &[device("phone", "secret")], ready, up, open);
    });
    let tcp = TcpStream::connect(addr).unwrap();
    tcp.set_read_timeout(Some(CLIENT_GIVES_UP)).unwrap();
    let (mut client, _) = tungstenite::client(format!("ws://{addr}/"), tcp).unwrap();
    for frame in frames {
        client.send(Message::text(frame.to_string())).unwrap();
    }
    let mut heard = Vec::new();
    while let Ok(msg) = client.read() {
        if let Message::Text(text) = msg {
            heard.push(serde_json::from_str(&text).unwrap());
        }
    }
    // Hanging up ends a server still waiting to read, so a stuck session fails
    // its test instead of holding LAUNCHING for every test after it.
    drop(client);
    server.join().unwrap();
    heard
}

#[test]
fn a_closed_lpm_is_opened_and_reported_ready() {
    let opened = Arc::new(AtomicBool::new(false));
    let heard = exchange(
        &[
            auth("phone", "secret"),
            json!({ "t": "presence" }),
            json!({ "t": "launchLpm" }),
        ],
        2,
        opened.clone(),
    );
    assert_eq!(heard[0]["t"], "ready");
    assert_eq!(
        heard[1],
        json!({ "t": "launchLpm", "ok": true, "already": false })
    );
    assert!(opened.load(Ordering::SeqCst));
}

#[test]
fn a_running_lpm_is_left_alone() {
    let opened = Arc::new(AtomicBool::new(false));
    let heard = exchange(
        &[auth("phone", "secret"), json!({ "t": "launchLpm" })],
        0,
        opened.clone(),
    );
    assert_eq!(
        heard[1],
        json!({ "t": "launchLpm", "ok": true, "already": true })
    );
    assert!(!opened.load(Ordering::SeqCst));
}

#[test]
fn a_stranger_is_refused_and_nothing_opens() {
    let opened = Arc::new(AtomicBool::new(false));
    let heard = exchange(
        &[auth("phone", "guess"), json!({ "t": "launchLpm" })],
        0,
        opened.clone(),
    );
    assert_eq!(
        heard,
        vec![json!({ "t": "error", "error": "unauthorized" })]
    );
    assert!(!opened.load(Ordering::SeqCst));
}
