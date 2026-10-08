// This app's own connections to tailnet addresses, carried by the built-in node
// on a machine that has no Tailscale app to route them. The node's loopback dial
// service reads "<token> <host:port>\n", answers "OK\n" or "ERR <reason>\n", and
// from then on the socket is the connection.
use std::io::{ErrorKind, Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::time::Duration;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(2);
const REPLY_TIMEOUT: Duration = Duration::from_secs(25);
const MIN_REPLY_TIMEOUT: Duration = Duration::from_secs(8);
const MAX_REPLY: usize = 512;

/// A tailnet address: 100.64.0.0/10, or a MagicDNS name.
pub(crate) fn is_tailnet_host(host: &str) -> bool {
    if let Ok(ip) = host.parse::<Ipv4Addr>() {
        let o = ip.octets();
        return o[0] == 100 && (64..=127).contains(&o[1]);
    }
    host.trim_end_matches('.').ends_with(".ts.net")
}

/// Connect to `host:port` through the built-in node. `None` when the host isn't
/// on a tailnet or the node isn't connected, so the caller dials as it always
/// has — through the Tailscale app, when there is one.
pub(crate) fn dial(
    host: &str,
    port: u16,
    timeout: Option<Duration>,
) -> Option<Result<TcpStream, String>> {
    if !is_tailnet_host(host) {
        return None;
    }
    let (dial_port, token) = {
        let st = crate::tailnet::lock();
        if st.status.state != crate::tailnet::STATE_RUNNING {
            return None;
        }
        st.dial.clone()?
    };
    let wait = timeout.map_or(REPLY_TIMEOUT, |t| t.max(MIN_REPLY_TIMEOUT));
    Some(open(dial_port, &token, host, port, wait))
}

fn open(
    dial_port: u16,
    token: &str,
    host: &str,
    port: u16,
    wait: Duration,
) -> Result<TcpStream, String> {
    let service = SocketAddr::from(([127, 0, 0, 1], dial_port));
    let mut stream = TcpStream::connect_timeout(&service, CONNECT_TIMEOUT)
        .map_err(|e| format!("built-in Tailscale isn't answering: {e}"))?;
    let _ = stream.set_read_timeout(Some(wait));
    let target = if host.contains(':') {
        format!("[{host}]:{port}")
    } else {
        format!("{host}:{port}")
    };
    stream
        .write_all(format!("{token} {target}\n").as_bytes())
        .map_err(|e| format!("built-in Tailscale isn't answering: {e}"))?;
    let reply = read_line(&mut stream)?;
    if reply == "OK" {
        let _ = stream.set_read_timeout(None);
        return Ok(stream);
    }
    let reason = reply.strip_prefix("ERR ").unwrap_or(&reply);
    Err(format!(
        "couldn't reach {host} over built-in Tailscale: {reason}"
    ))
}

/// One reply line, read a byte at a time so nothing past the newline — the
/// start of the connection itself — is consumed.
fn read_line(stream: &mut TcpStream) -> Result<String, String> {
    let mut line = Vec::new();
    let mut byte = [0u8; 1];
    loop {
        match stream.read(&mut byte) {
            Ok(0) => return Err("built-in Tailscale closed the connection".into()),
            Ok(_) if byte[0] == b'\n' => break,
            Ok(_) => {
                line.push(byte[0]);
                if line.len() > MAX_REPLY {
                    return Err("built-in Tailscale sent an unreadable reply".into());
                }
            }
            Err(e) if matches!(e.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {
                return Err("timed out reaching it over built-in Tailscale".into());
            }
            Err(e) => return Err(format!("built-in Tailscale connection failed: {e}")),
        }
    }
    Ok(String::from_utf8_lossy(&line)
        .trim_end_matches('\r')
        .to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader};
    use std::net::TcpListener;

    #[test]
    fn only_tailnet_addresses_go_through_the_node() {
        assert!(is_tailnet_host("100.64.0.1"));
        assert!(is_tailnet_host("100.127.255.254"));
        assert!(is_tailnet_host("mac.tail1234.ts.net"));
        assert!(is_tailnet_host("mac.tail1234.ts.net."));
        assert!(!is_tailnet_host("100.63.0.1"));
        assert!(!is_tailnet_host("100.128.0.1"));
        assert!(!is_tailnet_host("192.168.1.10"));
        assert!(!is_tailnet_host("example.com"));
    }

    fn fake_service(reply: &'static str) -> (u16, std::thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let handle = std::thread::spawn(move || {
            let (conn, _) = listener.accept().unwrap();
            let mut reader = BufReader::new(conn.try_clone().unwrap());
            let mut request = String::new();
            reader.read_line(&mut request).unwrap();
            let mut conn = conn;
            conn.write_all(reply.as_bytes()).unwrap();
            if reply.starts_with("OK") {
                let mut buf = [0u8; 5];
                reader.read_exact(&mut buf).unwrap();
                conn.write_all(&buf).unwrap();
            }
            request
        });
        (port, handle)
    }

    #[test]
    fn a_granted_dial_hands_back_the_live_connection() {
        let (port, server) = fake_service("OK\n");
        let mut stream = open(port, "secret", "100.64.0.9", 8766, Duration::from_secs(5)).unwrap();
        stream.write_all(b"hello").unwrap();
        let mut echo = [0u8; 5];
        stream.read_exact(&mut echo).unwrap();
        assert_eq!(&echo, b"hello");
        assert_eq!(server.join().unwrap(), "secret 100.64.0.9:8766\n");
    }

    #[test]
    fn a_refused_dial_names_the_reason() {
        let (port, server) = fake_service("ERR no route to host\n");
        let err = open(port, "secret", "100.64.0.9", 8766, Duration::from_secs(5)).unwrap_err();
        assert_eq!(
            err,
            "couldn't reach 100.64.0.9 over built-in Tailscale: no route to host"
        );
        server.join().unwrap();
    }
}
