//! How `lpm hook` reaches the app: which socket it reports to, the delivery
//! itself, and the pid it reports as.

use std::io::{Read, Write};
use std::net::Shutdown;
use std::path::{Path, PathBuf};
use std::time::Duration;

#[cfg(unix)]
use std::os::unix::net::UnixStream;
#[cfg(windows)]
use uds_windows::UnixStream;

const IO_TIMEOUT: Duration = Duration::from_secs(1);

/// The configured socket (LPM_SOCKET_PATH) when it is live, else a forwarded
/// remote status socket, else the local app's `~/.lpm/lpm.sock` — the order the
/// sh hooks recover in.
pub fn status_socket(configured: Option<&Path>, home: Option<&Path>) -> Option<PathBuf> {
    if let Some(socket) = configured.filter(|path| is_socket(path)) {
        return Some(socket.to_path_buf());
    }
    let lpm = home?.join(".lpm");
    let mut forwarded: Vec<PathBuf> = std::fs::read_dir(lpm.join("fwd"))
        .into_iter()
        .flatten()
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("status-") && name.ends_with(".sock"))
        })
        .collect();
    forwarded.sort();
    forwarded
        .into_iter()
        .chain([lpm.join("lpm.sock")])
        .find(|path| is_socket(path))
}

#[cfg(unix)]
pub fn is_socket(path: &Path) -> bool {
    use std::os::unix::fs::FileTypeExt;
    std::fs::metadata(path).is_ok_and(|meta| meta.file_type().is_socket())
}

/// An AF_UNIX socket file is a reparse point that `metadata` cannot follow, so
/// its presence is the test.
#[cfg(windows)]
pub fn is_socket(path: &Path) -> bool {
    std::fs::symlink_metadata(path).is_ok()
}

/// Send every line on one connection, then wait (bounded) for the replies so
/// the frames land in order before the agent fires its next hook.
pub fn deliver(socket: &Path, lines: &[String]) {
    let Ok(mut stream) = UnixStream::connect(socket) else {
        return;
    };
    let _ = stream.set_write_timeout(Some(IO_TIMEOUT));
    let _ = stream.set_read_timeout(Some(IO_TIMEOUT));
    let mut message = lines.join("\n");
    message.push('\n');
    if stream.write_all(message.as_bytes()).is_err() {
        return;
    }
    let _ = stream.shutdown(Shutdown::Write);
    let _ = stream.read_to_end(&mut Vec::new());
}

#[cfg(unix)]
pub fn parent_pid() -> Option<u32> {
    Some(std::os::unix::process::parent_id())
}

#[cfg(windows)]
pub fn parent_pid() -> Option<u32> {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    let me = std::process::id();
    let mut parent = None;
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snap == INVALID_HANDLE_VALUE {
            return None;
        }
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut more = Process32FirstW(snap, &mut entry) != 0;
        while more {
            if entry.th32ProcessID == me {
                parent = Some(entry.th32ParentProcessID);
                break;
            }
            more = Process32NextW(snap, &mut entry) != 0;
        }
        CloseHandle(snap);
    }
    parent
}
