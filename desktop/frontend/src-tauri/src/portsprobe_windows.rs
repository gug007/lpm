// Windows port holders: the TCP listener tables from GetExtendedTcpTable (the
// data `netstat -ano` prints, without its localized state column or a console
// spawn per poll) plus process names from a Toolhelp snapshot.
//
// The table parsers read the raw buffer by offset, so they compile and run on
// every platform and the layout stays covered by the macOS test run.

#[cfg(windows)]
use crate::portsprobe::Holder;
#[cfg(windows)]
use std::collections::HashMap;

const MIB_TCP_STATE_LISTEN: u32 = 2;
const HEADER: usize = 4;
/// MIB_TCPROW_OWNER_PID: state, local addr, local port, remote addr, remote port, pid.
const ROW4: usize = 24;
/// MIB_TCP6ROW_OWNER_PID: local addr[16], scope, local port, remote addr[16],
/// scope, remote port, state, pid.
const ROW6: usize = 56;

fn u32_at(buf: &[u8], at: usize) -> u32 {
    u32::from_le_bytes([buf[at], buf[at + 1], buf[at + 2], buf[at + 3]])
}

/// dwLocalPort keeps the port in network byte order in its first two bytes.
fn port_at(buf: &[u8], at: usize) -> u16 {
    u16::from_be_bytes([buf[at], buf[at + 1]])
}

/// (pid, port) of every LISTEN row; the offsets are within a row of `row` bytes.
fn parse_rows(
    buf: &[u8],
    row: usize,
    state_off: usize,
    port_off: usize,
    pid_off: usize,
) -> Vec<(u32, u16)> {
    if buf.len() < HEADER {
        return Vec::new();
    }
    let count = u32_at(buf, 0) as usize;
    let fits = (buf.len() - HEADER) / row;
    (0..count.min(fits))
        .map(|i| HEADER + i * row)
        .filter(|&at| u32_at(buf, at + state_off) == MIB_TCP_STATE_LISTEN)
        .map(|at| (u32_at(buf, at + pid_off), port_at(buf, at + port_off)))
        .collect()
}

pub(crate) fn parse_tcp4_table(buf: &[u8]) -> Vec<(u32, u16)> {
    parse_rows(buf, ROW4, 0, 8, 20)
}

pub(crate) fn parse_tcp6_table(buf: &[u8]) -> Vec<(u32, u16)> {
    parse_rows(buf, ROW6, 48, 20, 52)
}

/// "node.exe" → "node", so a holder reads the way lsof names it on a Mac.
pub(crate) fn display_name(exe: &str) -> String {
    let cut = exe.len().saturating_sub(4);
    match exe.get(cut..) {
        Some(ext) if cut > 0 && ext.eq_ignore_ascii_case(".exe") => exe[..cut].to_string(),
        _ => exe.to_string(),
    }
}

#[cfg(windows)]
const _: () = {
    use windows_sys::Win32::NetworkManagement::IpHelper::{
        MIB_TCP6ROW_OWNER_PID, MIB_TCPROW_OWNER_PID,
    };
    assert!(std::mem::size_of::<MIB_TCPROW_OWNER_PID>() == ROW4);
    assert!(std::mem::size_of::<MIB_TCP6ROW_OWNER_PID>() == ROW6);
};

/// The raw listener table for one address family, or None when the call fails.
#[cfg(windows)]
fn listener_table(family: u16) -> Option<Vec<u8>> {
    use windows_sys::Win32::Foundation::{ERROR_INSUFFICIENT_BUFFER, NO_ERROR};
    use windows_sys::Win32::NetworkManagement::IpHelper::{
        GetExtendedTcpTable, TCP_TABLE_OWNER_PID_LISTENER,
    };
    let mut size = 0u32;
    // The table can grow between the size probe and the read; retry a few times.
    for _ in 0..4 {
        let mut words = vec![0u32; (size as usize).div_ceil(4).max(1)];
        let mut cap = (words.len() * 4) as u32;
        let rc = unsafe {
            GetExtendedTcpTable(
                words.as_mut_ptr().cast(),
                &mut cap,
                0,
                family as u32,
                TCP_TABLE_OWNER_PID_LISTENER,
                0,
            )
        };
        if rc == NO_ERROR {
            let bytes =
                unsafe { std::slice::from_raw_parts(words.as_ptr().cast::<u8>(), cap as usize) };
            return Some(bytes.to_vec());
        }
        if rc != ERROR_INSUFFICIENT_BUFFER {
            return None;
        }
        size = cap;
    }
    None
}

/// Every (pid, port) in TCP LISTEN on IPv4 and IPv6. A process listening on
/// both families (or several ports) appears once per socket.
#[cfg(windows)]
pub fn listening_ports() -> Vec<(i64, i64)> {
    use windows_sys::Win32::Networking::WinSock::{AF_INET, AF_INET6};
    let mut out: Vec<(i64, i64)> = Vec::new();
    if let Some(buf) = listener_table(AF_INET) {
        out.extend(
            parse_tcp4_table(&buf)
                .into_iter()
                .map(|(pid, port)| (pid as i64, port as i64)),
        );
    }
    if let Some(buf) = listener_table(AF_INET6) {
        out.extend(
            parse_tcp6_table(&buf)
                .into_iter()
                .map(|(pid, port)| (pid as i64, port as i64)),
        );
    }
    out
}

/// Executable name per pid, from one Toolhelp snapshot.
#[cfg(windows)]
fn process_names() -> HashMap<u32, String> {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    let mut out = HashMap::new();
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snap == INVALID_HANDLE_VALUE {
            return out;
        }
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        if Process32FirstW(snap, &mut entry) != 0 {
            loop {
                let len = entry
                    .szExeFile
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(entry.szExeFile.len());
                let exe = String::from_utf16_lossy(&entry.szExeFile[..len]);
                out.insert(entry.th32ProcessID, display_name(&exe));
                if Process32NextW(snap, &mut entry) == 0 {
                    break;
                }
            }
        }
        CloseHandle(snap);
    }
    out
}

/// Holders for the given ports. The first listener per port wins, like lsof.
#[cfg(windows)]
pub fn lookup_holders(ports: &[i64]) -> HashMap<i64, Holder> {
    let listeners: Vec<(i64, i64)> = listening_ports()
        .into_iter()
        .filter(|(pid, port)| *pid > 0 && ports.contains(port))
        .collect();
    if listeners.is_empty() {
        return HashMap::new();
    }
    let names = process_names();
    let mut out = HashMap::new();
    for (pid, port) in listeners {
        out.entry(port).or_insert_with(|| Holder {
            pid,
            command: names.get(&(pid as u32)).cloned().unwrap_or_default(),
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const ESTABLISHED: u32 = 5;

    fn port_field(port: u16) -> [u8; 4] {
        let [hi, lo] = port.to_be_bytes();
        [hi, lo, 0, 0]
    }

    fn table(rows: &[Vec<u8>]) -> Vec<u8> {
        let mut buf = (rows.len() as u32).to_le_bytes().to_vec();
        for r in rows {
            buf.extend_from_slice(r);
        }
        buf
    }

    fn row4(state: u32, local: [u8; 4], port: u16, remote_port: u16, pid: u32) -> Vec<u8> {
        let mut r = Vec::new();
        r.extend_from_slice(&state.to_le_bytes());
        r.extend_from_slice(&local);
        r.extend_from_slice(&port_field(port));
        r.extend_from_slice(&[0; 4]);
        r.extend_from_slice(&port_field(remote_port));
        r.extend_from_slice(&pid.to_le_bytes());
        assert_eq!(r.len(), ROW4);
        r
    }

    fn row6(state: u32, local: [u8; 16], port: u16, pid: u32) -> Vec<u8> {
        let mut r = Vec::new();
        r.extend_from_slice(&local);
        r.extend_from_slice(&0u32.to_le_bytes());
        r.extend_from_slice(&port_field(port));
        r.extend_from_slice(&[0; 16]);
        r.extend_from_slice(&0u32.to_le_bytes());
        r.extend_from_slice(&port_field(0));
        r.extend_from_slice(&state.to_le_bytes());
        r.extend_from_slice(&pid.to_le_bytes());
        assert_eq!(r.len(), ROW6);
        r
    }

    // The same sockets `netstat -ano -p TCP` shows as:
    //   TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1032
    //   TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       9876
    //   TCP    127.0.0.1:5432         0.0.0.0:0              LISTENING       4410
    //   TCP    192.168.1.20:52144     140.82.112.21:443      ESTABLISHED     9876
    #[test]
    fn parses_ipv4_listeners_only() {
        let buf = table(&[
            row4(MIB_TCP_STATE_LISTEN, [0, 0, 0, 0], 135, 0, 1032),
            row4(MIB_TCP_STATE_LISTEN, [0, 0, 0, 0], 3000, 0, 9876),
            row4(MIB_TCP_STATE_LISTEN, [127, 0, 0, 1], 5432, 0, 4410),
            row4(ESTABLISHED, [192, 168, 1, 20], 52144, 443, 9876),
        ]);
        assert_eq!(
            parse_tcp4_table(&buf),
            vec![(1032, 135), (9876, 3000), (4410, 5432)]
        );
    }

    //   TCP    [::]:135               [::]:0                 LISTENING       1032
    //   TCP    [::]:8080              [::]:0                 LISTENING       9876
    //   TCP    [::1]:5432             [::]:0                 LISTENING       4410
    #[test]
    fn parses_ipv6_listeners() {
        let mut loopback = [0u8; 16];
        loopback[15] = 1;
        let buf = table(&[
            row6(MIB_TCP_STATE_LISTEN, [0; 16], 135, 1032),
            row6(MIB_TCP_STATE_LISTEN, [0; 16], 8080, 9876),
            row6(MIB_TCP_STATE_LISTEN, loopback, 5432, 4410),
            row6(ESTABLISHED, loopback, 50000, 9876),
        ]);
        assert_eq!(
            parse_tcp6_table(&buf),
            vec![(1032, 135), (9876, 8080), (4410, 5432)]
        );
    }

    #[test]
    fn high_ports_keep_both_bytes() {
        let buf = table(&[row4(MIB_TCP_STATE_LISTEN, [0; 4], 65535, 0, 7)]);
        assert_eq!(parse_tcp4_table(&buf), vec![(7, 65535)]);
    }

    // A count larger than the buffer holds must not read past its end.
    #[test]
    fn truncated_table_stops_at_the_last_whole_row() {
        let mut buf = table(&[row4(MIB_TCP_STATE_LISTEN, [0; 4], 3000, 0, 1)]);
        buf[0] = 5;
        assert_eq!(parse_tcp4_table(&buf), vec![(1, 3000)]);
        assert!(parse_tcp4_table(&[1, 0]).is_empty());
        assert!(parse_tcp6_table(&table(&[])).is_empty());
    }

    #[test]
    fn display_name_drops_the_exe_suffix() {
        assert_eq!(display_name("node.exe"), "node");
        assert_eq!(display_name("Postgres.EXE"), "Postgres");
        assert_eq!(display_name("System"), "System");
        assert_eq!(display_name(".exe"), ".exe");
        assert_eq!(display_name("日本"), "日本");
    }
}
