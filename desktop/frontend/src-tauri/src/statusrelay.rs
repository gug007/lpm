// Windows end of the remote status forward. Win32-OpenSSH can't deliver an
// `ssh -R` connection to a local AF_UNIX socket, so the forward targets a
// loopback TCP port instead and this relay pipes each connection into the
// restricted status socket. Unlike that socket's file, loopback is open to every
// account on the machine, so a connection is relayed only when `admit` vouches
// for it; statusfwd admits peers whose TCP endpoint belongs to one of its own
// `ssh -R` processes (`peer_owner_pid`).
use std::io;
use std::net::{Ipv4Addr, Shutdown, SocketAddrV4, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

pub type Admit = Arc<dyn Fn(&TcpStream) -> bool + Send + Sync>;

// The status socket drops a client idle for 30 s; past that a quiet peer is gone.
const IDLE_LIMIT: Duration = Duration::from_secs(60);

/// Listen on 127.0.0.1:<ephemeral> for the life of the process and relay every
/// admitted connection to the socket at `target`. Returns the port.
pub fn start(target: PathBuf, admit: Admit) -> io::Result<u16> {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))?;
    let port = listener.local_addr()?.port();
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            if !admit(&stream) {
                continue;
            }
            let target = target.clone();
            std::thread::spawn(move || {
                let _ = relay(stream, &target);
            });
        }
    });
    Ok(port)
}

/// Copy both ways until each side is done, passing a half-close through so the
/// status server sees the client's EOF and the client sees the server's.
fn relay(tcp: TcpStream, target: &Path) -> io::Result<()> {
    let sock = crate::ipc::UnixStream::connect(target)?;
    tcp.set_read_timeout(Some(IDLE_LIMIT))?;
    let tcp_in = tcp.try_clone()?;
    let sock_out = sock.try_clone()?;
    let upstream = std::thread::spawn(move || {
        let _ = io::copy(&mut &tcp_in, &mut &sock_out);
        let _ = sock_out.shutdown(Shutdown::Write);
    });
    let _ = io::copy(&mut &sock, &mut &tcp);
    let _ = tcp.shutdown(Shutdown::Write);
    let _ = upstream.join();
    Ok(())
}

/// A row of the IPv4 TCP table as `GetExtendedTcpTable` lays it out: address
/// bytes and the port's low 16 bits both in network order.
fn endpoint(addr: u32, port: u32) -> SocketAddrV4 {
    let port = port.to_ne_bytes();
    SocketAddrV4::new(
        Ipv4Addr::from(addr.to_ne_bytes()),
        u16::from_be_bytes([port[0], port[1]]),
    )
}

/// The process that owns the far end of an accepted loopback connection.
#[cfg(windows)]
pub fn peer_owner_pid(stream: &TcpStream) -> Option<u32> {
    use std::net::SocketAddr;
    let (SocketAddr::V4(peer), SocketAddr::V4(local)) =
        (stream.peer_addr().ok()?, stream.local_addr().ok()?)
    else {
        return None;
    };
    tcp_connections()?
        .into_iter()
        .find(|&(from, to, _)| from == peer && to == local)
        .map(|(_, _, pid)| pid)
}

/// (local, remote, owning pid) for every IPv4 TCP connection.
#[cfg(windows)]
fn tcp_connections() -> Option<Vec<(SocketAddrV4, SocketAddrV4, u32)>> {
    use windows_sys::Win32::Foundation::{ERROR_INSUFFICIENT_BUFFER, NO_ERROR};
    use windows_sys::Win32::NetworkManagement::IpHelper::{
        GetExtendedTcpTable, MIB_TCPROW_OWNER_PID, MIB_TCPTABLE_OWNER_PID,
        TCP_TABLE_OWNER_PID_CONNECTIONS,
    };
    use windows_sys::Win32::Networking::WinSock::AF_INET;

    let mut size = 0u32;
    let mut buf: Vec<u64> = Vec::new();
    for _ in 0..4 {
        let ptr = if buf.is_empty() {
            std::ptr::null_mut()
        } else {
            buf.as_mut_ptr().cast()
        };
        let rc = unsafe {
            GetExtendedTcpTable(
                ptr,
                &mut size,
                0,
                AF_INET as u32,
                TCP_TABLE_OWNER_PID_CONNECTIONS,
                0,
            )
        };
        if rc == NO_ERROR && !buf.is_empty() {
            let table = buf.as_ptr() as *const MIB_TCPTABLE_OWNER_PID;
            let rows = unsafe {
                std::slice::from_raw_parts(
                    std::ptr::addr_of!((*table).table) as *const MIB_TCPROW_OWNER_PID,
                    (*table).dwNumEntries as usize,
                )
            };
            return Some(
                rows.iter()
                    .map(|r| {
                        (
                            endpoint(r.dwLocalAddr, r.dwLocalPort),
                            endpoint(r.dwRemoteAddr, r.dwRemotePort),
                            r.dwOwningPid,
                        )
                    })
                    .collect(),
            );
        }
        if rc != ERROR_INSUFFICIENT_BUFFER && rc != NO_ERROR {
            return None;
        }
        buf = vec![0u64; (size as usize).div_ceil(8) + 1];
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Write};

    fn echo_server(dir: &Path) -> PathBuf {
        let path = dir.join("status.sock");
        let listener = crate::ipc::UnixListener::bind(&path).unwrap();
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                std::thread::spawn(move || {
                    let mut out = stream.try_clone().unwrap();
                    for line in BufReader::new(stream).lines() {
                        let Ok(line) = line else { break };
                        writeln!(out, "OK {line}").unwrap();
                    }
                });
            }
        });
        path
    }

    #[test]
    fn an_admitted_peer_reaches_the_status_socket_and_back() {
        let dir = tempfile::tempdir().unwrap();
        let port = start(echo_server(dir.path()), Arc::new(|_| true)).unwrap();
        let mut client = TcpStream::connect((Ipv4Addr::LOCALHOST, port)).unwrap();
        client.write_all(b"set_status a b\nping\n").unwrap();
        client.shutdown(Shutdown::Write).unwrap();
        let mut reply = String::new();
        io::Read::read_to_string(&mut client, &mut reply).unwrap();
        assert_eq!(reply, "OK set_status a b\nOK ping\n");
    }

    #[test]
    fn a_refused_peer_is_closed_without_a_reply() {
        let dir = tempfile::tempdir().unwrap();
        let port = start(echo_server(dir.path()), Arc::new(|_| false)).unwrap();
        let mut client = TcpStream::connect((Ipv4Addr::LOCALHOST, port)).unwrap();
        client
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        let _ = client.write_all(b"ping\n");
        let mut reply = String::new();
        let _ = io::Read::read_to_string(&mut client, &mut reply);
        assert!(reply.is_empty(), "{reply:?}");
    }

    #[test]
    fn tcp_table_fields_decode_from_network_order() {
        let addr = u32::from_ne_bytes([127, 0, 0, 1]);
        let port = u32::from_ne_bytes([0x1F, 0x90, 0, 0]);
        assert_eq!(
            endpoint(addr, port),
            SocketAddrV4::new(Ipv4Addr::LOCALHOST, 8080)
        );
    }
}
