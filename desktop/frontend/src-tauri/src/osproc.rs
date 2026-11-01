// Process primitives with one meaning on every platform. Unix gets the signal it
// always got; Windows has no signals or process groups, so "terminate" and
// "kill" both end the process, and a group is the process tree under its leader.
use std::process::Command;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
#[cfg(windows)]
const DETACHED_PROCESS: u32 = 0x0000_0008;
#[cfg(windows)]
const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
#[cfg(windows)]
const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x0100_0000;

/// Ask a process to exit (SIGTERM). Windows has no polite request for an
/// arbitrary process, so it is ended outright.
pub fn terminate(pid: u32) {
    #[cfg(unix)]
    unsafe {
        libc::kill(pid as libc::pid_t, libc::SIGTERM);
    }
    #[cfg(windows)]
    end_process(pid);
}

/// End a process now (SIGKILL / TerminateProcess).
pub fn kill(pid: u32) {
    #[cfg(unix)]
    unsafe {
        libc::kill(pid as libc::pid_t, libc::SIGKILL);
    }
    #[cfg(windows)]
    end_process(pid);
}

/// Signal a whole process group led by `pgid`. On Windows the "group" is the
/// process tree rooted at that pid.
#[cfg_attr(windows, allow(dead_code))]
pub fn kill_group(pgid: u32, force: bool) {
    #[cfg(unix)]
    unsafe {
        let sig = if force { libc::SIGKILL } else { libc::SIGTERM };
        libc::killpg(pgid as libc::pid_t, sig);
    }
    #[cfg(windows)]
    {
        let _ = force;
        kill_tree(pgid);
    }
}

/// True while `pid` names a live process (`kill(pid, 0)` semantics: a process
/// we may not signal still counts as alive).
pub fn is_alive(pid: u32) -> bool {
    #[cfg(unix)]
    {
        let rc = unsafe { libc::kill(pid as libc::pid_t, 0) };
        rc == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
    }
    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::{CloseHandle, STILL_ACTIVE};
        use windows_sys::Win32::System::Threading::{
            GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
        };
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if handle.is_null() {
                return false;
            }
            let mut code = 0u32;
            let ok = GetExitCodeProcess(handle, &mut code) != 0;
            CloseHandle(handle);
            ok && code == STILL_ACTIVE as u32
        }
    }
}

/// Start the child outside this process's session/job, so it outlives the app
/// and a signal aimed at the app's group never reaches it (Unix `setsid`).
pub fn detach(cmd: &mut Command) -> &mut Command {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        unsafe {
            cmd.pre_exec(|| {
                libc::setsid();
                Ok(())
            });
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(
            DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_BREAKAWAY_FROM_JOB,
        );
    }
    cmd
}

/// Keep a console child from flashing a terminal window on Windows. No-op
/// elsewhere. Every background `Command` the app spawns should pass through it.
pub fn no_window(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// `Command::new` with `no_window` applied.
pub fn command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut cmd = Command::new(program);
    no_window(&mut cmd);
    cmd
}

#[cfg(windows)]
fn end_process(pid: u32) {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE};
    unsafe {
        let handle = OpenProcess(PROCESS_TERMINATE, 0, pid);
        if !handle.is_null() {
            TerminateProcess(handle, 1);
            CloseHandle(handle);
        }
    }
}

/// Every descendant of `root` (children first) plus `root` itself, ended
/// leaves-first so a parent can't respawn a child we just killed.
#[cfg(windows)]
pub fn kill_tree(root: u32) {
    for pid in descendants(root).into_iter().rev() {
        end_process(pid);
    }
    end_process(root);
}

/// Descendants of `root` in breadth-first order, from one Toolhelp snapshot.
#[cfg(windows)]
pub fn descendants(root: u32) -> Vec<u32> {
    let table = process_table();
    let mut out = Vec::new();
    let mut frontier = vec![root];
    while let Some(parent) = frontier.pop() {
        for &(pid, ppid) in &table {
            if ppid == parent && pid != root && !out.contains(&pid) {
                out.push(pid);
                frontier.push(pid);
            }
        }
    }
    out
}

/// (pid, parent pid) for every process, from a Toolhelp snapshot.
#[cfg(windows)]
pub fn process_table() -> Vec<(u32, u32)> {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    let mut out = Vec::new();
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snap == INVALID_HANDLE_VALUE {
            return out;
        }
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        if Process32FirstW(snap, &mut entry) != 0 {
            loop {
                out.push((entry.th32ProcessID, entry.th32ParentProcessID));
                if Process32NextW(snap, &mut entry) == 0 {
                    break;
                }
            }
        }
        CloseHandle(snap);
    }
    out
}

/// Every process as (pid, parent pid, start time). With the pid, the start
/// time names one process, not a later one that reused the pid. Its unit is
/// the platform's own, so starts are only compared with each other.
#[cfg(target_os = "macos")]
pub fn process_starts() -> Vec<(u32, u32, u64)> {
    let mut pids = vec![0 as libc::pid_t; 16_384];
    let bytes = (pids.len() * std::mem::size_of::<libc::pid_t>()) as libc::c_int;
    let n = unsafe { libc::proc_listallpids(pids.as_mut_ptr() as *mut libc::c_void, bytes) };
    pids.truncate(n.max(0) as usize);
    pids.into_iter()
        .filter(|&pid| pid > 0)
        .filter_map(|pid| parent_and_start(pid as u32).map(|(ppid, start)| (pid as u32, ppid, start)))
        .collect()
}

#[cfg(target_os = "linux")]
pub fn process_starts() -> Vec<(u32, u32, u64)> {
    let Ok(dir) = std::fs::read_dir("/proc") else {
        return Vec::new();
    };
    dir.flatten()
        .filter_map(|entry| {
            let pid: u32 = entry.file_name().to_str()?.parse().ok()?;
            parent_and_start(pid).map(|(ppid, start)| (pid, ppid, start))
        })
        .collect()
}

#[cfg(windows)]
pub fn process_starts() -> Vec<(u32, u32, u64)> {
    process_table()
        .into_iter()
        .map(|(pid, ppid)| (pid, ppid, crate::procwin::created(pid).unwrap_or(0)))
        .collect()
}

/// When `pid` started, in process_starts' unit; None when no process has it
/// (or it is another user's we may not read).
pub fn start_of(pid: u32) -> Option<u64> {
    #[cfg(unix)]
    return parent_and_start(pid).map(|(_, start)| start);
    #[cfg(windows)]
    return crate::procwin::created(pid);
}

/// When `pid` started, in Unix seconds.
pub fn started_unix(pid: i64) -> Option<i64> {
    let start = start_of(u32::try_from(pid).ok()?)?;
    #[cfg(target_os = "macos")]
    return Some((start / 1_000_000) as i64);
    #[cfg(target_os = "linux")]
    return linux_start(start);
    #[cfg(windows)]
    return Some(unix_from_filetime(start));
}

/// /proc/<pid>/stat counts a start in clock ticks since boot.
/// Boot time and tick rate never change, so they're read once.
#[cfg(target_os = "linux")]
fn linux_start(ticks: u64) -> Option<i64> {
    static BOOT: std::sync::OnceLock<Option<(i64, u64)>> = std::sync::OnceLock::new();
    let (boot, hz) = (*BOOT.get_or_init(|| {
        let stat = std::fs::read_to_string("/proc/stat").ok()?;
        let boot: i64 = stat
            .lines()
            .find_map(|line| line.strip_prefix("btime "))?
            .trim()
            .parse()
            .ok()?;
        let hz = unsafe { libc::sysconf(libc::_SC_CLK_TCK) };
        (hz > 0).then_some((boot, hz as u64))
    }))?;
    Some(boot + (ticks / hz) as i64)
}

/// A FILETIME counts 100 ns intervals since 1601-01-01.
#[cfg(any(windows, test))]
fn unix_from_filetime(ft: u64) -> i64 {
    (ft / 10_000_000) as i64 - 11_644_473_600
}

#[cfg(target_os = "macos")]
fn parent_and_start(pid: u32) -> Option<(u32, u64)> {
    let mut info: libc::proc_bsdinfo = unsafe { std::mem::zeroed() };
    let size = std::mem::size_of::<libc::proc_bsdinfo>() as libc::c_int;
    let got = unsafe {
        libc::proc_pidinfo(
            pid as libc::c_int,
            libc::PROC_PIDTBSDINFO,
            0,
            &mut info as *mut _ as *mut libc::c_void,
            size,
        )
    };
    (got == size).then(|| {
        (
            info.pbi_ppid,
            info.pbi_start_tvsec * 1_000_000 + info.pbi_start_tvusec,
        )
    })
}

#[cfg(target_os = "linux")]
fn parent_and_start(pid: u32) -> Option<(u32, u64)> {
    let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    // The command name can hold spaces and parentheses; the fields after its
    // closing parenthesis can't.
    let fields: Vec<&str> = stat[stat.rfind(')')? + 2..].split_whitespace().collect();
    Some((fields.get(1)?.parse().ok()?, fields.get(19)?.parse().ok()?))
}

/// The session `pid` is in: its session leader's pid, which outlives the
/// leader. Windows has no such sessions.
pub fn session_of(pid: u32) -> Option<u32> {
    #[cfg(unix)]
    {
        let sid = unsafe { libc::getsid(pid as libc::pid_t) };
        (sid > 0).then_some(sid as u32)
    }
    #[cfg(windows)]
    {
        let _ = pid;
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_filetime_converts_to_unix_seconds() {
        assert_eq!(unix_from_filetime(116_444_736_000_000_000), 0);
        assert_eq!(
            unix_from_filetime(116_444_736_000_000_000 + 10_000_000 * 60),
            60
        );
    }

    #[test]
    fn a_process_has_one_start_time() {
        let me = std::process::id();
        let start = start_of(me).expect("this process");
        assert_eq!(process_starts().iter().find(|p| p.0 == me).map(|p| p.2), Some(start));
        assert_eq!(start_of(u32::MAX - 7), None);
    }

    #[test]
    fn the_table_holds_this_process_and_its_parent() {
        let table = process_starts();
        let me = table
            .iter()
            .find(|p| p.0 == std::process::id())
            .expect("this process");
        assert!(me.1 > 0);
        assert!(table.iter().any(|p| p.0 == me.1));
    }

    #[test]
    fn this_process_is_alive() {
        assert!(is_alive(std::process::id()));
    }

    #[test]
    fn a_killed_child_stops_being_alive() {
        #[cfg(unix)]
        let mut child = Command::new("sleep").arg("30").spawn().unwrap();
        #[cfg(windows)]
        let mut child = command("ping").args(["-n", "30", "127.0.0.1"]).spawn().unwrap();
        let pid = child.id();
        assert!(is_alive(pid));
        kill(pid);
        child.wait().unwrap();
        assert!(!is_alive(pid));
    }
}
