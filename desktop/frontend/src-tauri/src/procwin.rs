// Windows answers to the process questions Unix answers with `ps`, `lsof`,
// process groups and the tty's foreground group. One Toolhelp snapshot names
// every process and its parent; creation times tell a real child from a
// stranger, because Windows never reparents an orphan and recycles pids
// quickly, so a dead parent's pid can come back on an unrelated process.
//
// The tree logic is plain functions over a table so it is tested everywhere;
// only the system calls are Windows-only.
#![cfg_attr(not(windows), allow(dead_code))]

use std::collections::HashSet;

/// Bounds a walk whose parent links form a cycle (a ppid recycled onto a
/// process's own descendant, when a creation time was unreadable).
const MAX_DEPTH: usize = 64;

/// What the frontend's send-later readiness treats as "at a prompt"
/// (sendLater/readiness.ts SHELLS). A shell between the pane's shell and the
/// job is MSYS's fork/exec stub, so the walk looks through it.
const SHELLS: [&str; 10] = [
    "zsh", "bash", "sh", "fish", "dash", "ksh", "tcsh", "csh", "nu", "login",
];

pub struct Proc {
    pub pid: u32,
    pub ppid: u32,
    /// Executable name without `.exe`, the way `ps -o comm` names a process.
    pub name: String,
}

/// `node.exe` -> `node`. Case-insensitive on the extension, like Windows.
pub fn exe_stem(name: &str) -> String {
    let n = name.len();
    if n > 4 && name.is_char_boundary(n - 4) && name[n - 4..].eq_ignore_ascii_case(".exe") {
        name[..n - 4].to_string()
    } else {
        name.to_string()
    }
}

pub(crate) fn is_shell(name: &str) -> bool {
    SHELLS.contains(&name.to_ascii_lowercase().as_str())
}

pub(crate) fn is_console_host(name: &str) -> bool {
    name.eq_ignore_ascii_case("conhost") || name.eq_ignore_ascii_case("OpenConsole")
}

/// Whether `child` can really be `parent`'s child: a process can't predate
/// its parent. Unknown times (an elevated process we may not query) pass.
fn born_after(parent: Option<u64>, child: Option<u64>) -> bool {
    match (parent, child) {
        (Some(p), Some(c)) => c >= p,
        _ => true,
    }
}

/// Direct children of `parent`, each with its creation time.
fn children<'a>(
    table: &'a [Proc],
    parent: u32,
    parent_born: Option<u64>,
    born: &impl Fn(u32) -> Option<u64>,
) -> Vec<(&'a Proc, Option<u64>)> {
    table
        .iter()
        .filter(|p| p.ppid == parent && p.pid != parent)
        .map(|p| (p, born(p.pid)))
        .filter(|(_, b)| born_after(parent_born, *b))
        .collect()
}

/// Every process in the subtrees rooted at `roots` (roots first, each parent
/// before its children), the Windows `proctree::trees`.
pub fn subtree(table: &[Proc], roots: &[u32], born: impl Fn(u32) -> Option<u64>) -> Vec<u32> {
    let mut stack: Vec<(u32, Option<u64>)> = roots
        .iter()
        .copied()
        .filter(|&p| p > 4)
        .map(|p| (p, born(p)))
        .collect();
    stack.reverse();
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    while let Some((pid, pid_born)) = stack.pop() {
        if !seen.insert(pid) {
            continue;
        }
        out.push(pid);
        for (child, child_born) in children(table, pid, pid_born, &born).into_iter().rev() {
            stack.push((child.pid, child_born));
        }
    }
    out
}

/// Whether `pid` is one of `roots` or provably descends from one. Stricter than
/// `subtree`, for deciding whom to trust: every link needs both creation times,
/// so a process we may not query (another account's) is a stranger, and so is
/// an orphan whose dead parent's pid went to a root.
pub fn proven_descendant(
    table: &[Proc],
    pid: u32,
    roots: &[u32],
    born: impl Fn(u32) -> Option<u64>,
) -> bool {
    if roots.contains(&pid) {
        return true;
    }
    let Some(mut current_born) = born(pid) else {
        return false;
    };
    let mut current = pid;
    for _ in 0..MAX_DEPTH {
        let Some(parent) = table.iter().find(|p| p.pid == current).map(|p| p.ppid) else {
            return false;
        };
        if parent <= 4 || parent == current {
            return false;
        }
        let Some(parent_born) = born(parent) else {
            return false;
        };
        if current_born < parent_born {
            return false;
        }
        if roots.contains(&parent) {
            return true;
        }
        (current, current_born) = (parent, parent_born);
    }
    false
}

/// The job running in the foreground of the pty whose shell is `shell` — what
/// the tty's foreground process group names on Unix. Windows has no such
/// thing, so follow the newest child down from the shell, through shells (a
/// nested shell, or MSYS's stub that waits on an exec'd program), to the
/// first process that is not one. At a prompt that is the shell itself.
pub fn foreground(table: &[Proc], shell: u32, born: impl Fn(u32) -> Option<u64>) -> u32 {
    let mut current = (shell, born(shell));
    let mut seen = HashSet::from([shell]);
    for _ in 0..MAX_DEPTH {
        let newest = children(table, current.0, current.1, &born)
            .into_iter()
            .filter(|(p, _)| !is_console_host(&p.name) && !seen.contains(&p.pid))
            .max_by_key(|(p, b)| (b.unwrap_or(0), p.pid));
        let Some((proc, proc_born)) = newest else {
            break;
        };
        if !is_shell(&proc.name) {
            return proc.pid;
        }
        seen.insert(proc.pid);
        current = (proc.pid, proc_born);
    }
    current.0
}

#[cfg(windows)]
pub use sys::*;

#[cfg(windows)]
mod sys {
    use super::{exe_stem, Proc};
    use std::process::Command;
    use std::sync::OnceLock;
    use windows_sys::Win32::Foundation::{CloseHandle, FILETIME, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, Thread32First, Thread32Next,
        PROCESSENTRY32W, TH32CS_SNAPPROCESS, TH32CS_SNAPTHREAD, THREADENTRY32,
    };
    use windows_sys::Win32::System::Threading::{
        GetProcessTimes, OpenProcess, OpenThread, ResumeThread, SuspendThread,
        PROCESS_QUERY_LIMITED_INFORMATION, THREAD_SUSPEND_RESUME,
    };

    const DETACHED_PROCESS: u32 = 0x0000_0008;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;

    /// Every process: pid, parent pid and executable name.
    pub fn snapshot() -> Vec<Proc> {
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
                    let len = entry
                        .szExeFile
                        .iter()
                        .position(|&c| c == 0)
                        .unwrap_or(entry.szExeFile.len());
                    out.push(Proc {
                        pid: entry.th32ProcessID,
                        ppid: entry.th32ParentProcessID,
                        name: exe_stem(&String::from_utf16_lossy(&entry.szExeFile[..len])),
                    });
                    if Process32NextW(snap, &mut entry) == 0 {
                        break;
                    }
                }
            }
            CloseHandle(snap);
        }
        out
    }

    /// When `pid` was created, in FILETIME units: with the pid, the identity
    /// of a process. None when no process has that pid (or it belongs to an
    /// account we may not query).
    pub fn created(pid: u32) -> Option<u64> {
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if handle.is_null() {
                return None;
            }
            let mut created: FILETIME = std::mem::zeroed();
            let mut exited: FILETIME = std::mem::zeroed();
            let mut kernel: FILETIME = std::mem::zeroed();
            let mut user: FILETIME = std::mem::zeroed();
            let ok = GetProcessTimes(handle, &mut created, &mut exited, &mut kernel, &mut user);
            CloseHandle(handle);
            (ok != 0)
                .then(|| ((created.dwHighDateTime as u64) << 32) | created.dwLowDateTime as u64)
        }
    }

    /// The pid of the console host (conhost, or a pseudoconsole's OpenConsole)
    /// whose console `pid` is attached to. None for a process with no console
    /// or one we may not query.
    pub fn console_host(pid: u32) -> Option<u32> {
        use windows_sys::Wdk::System::Threading::{NtQueryInformationProcess, PROCESSINFOCLASS};
        const PROCESS_CONSOLE_HOST_PROCESS: PROCESSINFOCLASS = 49;
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if handle.is_null() {
                return None;
            }
            let mut host: usize = 0;
            let status = NtQueryInformationProcess(
                handle,
                PROCESS_CONSOLE_HOST_PROCESS,
                (&mut host as *mut usize).cast(),
                std::mem::size_of::<usize>() as u32,
                std::ptr::null_mut(),
            );
            CloseHandle(handle);
            let host = (host & !3) as u32;
            (status >= 0 && host != 0).then_some(host)
        }
    }

    /// Run `exited` on its own thread once `pid` is gone. Call it while a handle
    /// to the process is held (a child just spawned), so the pid can't be
    /// recycled before the wait starts. False when the process can't be opened.
    pub fn on_exit(pid: u32, exited: impl FnOnce() + Send + 'static) -> bool {
        use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
        use windows_sys::Win32::System::Threading::{
            WaitForSingleObject, INFINITE, PROCESS_SYNCHRONIZE,
        };
        let raw = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, 0, pid) };
        if raw.is_null() {
            return false;
        }
        let handle = unsafe { OwnedHandle::from_raw_handle(raw) };
        std::thread::spawn(move || {
            unsafe { WaitForSingleObject(handle.as_raw_handle(), INFINITE) };
            drop(handle);
            exited();
        });
        true
    }

    /// Freeze (`true`) or thaw every thread of `pid`, the SIGSTOP/SIGCONT pair.
    pub fn suspend(pid: u32, freeze: bool) -> std::io::Result<()> {
        let mut touched = 0;
        unsafe {
            let snap = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
            if snap == INVALID_HANDLE_VALUE {
                return Err(std::io::Error::last_os_error());
            }
            let mut entry: THREADENTRY32 = std::mem::zeroed();
            entry.dwSize = std::mem::size_of::<THREADENTRY32>() as u32;
            if Thread32First(snap, &mut entry) != 0 {
                loop {
                    if entry.th32OwnerProcessID == pid {
                        let thread = OpenThread(THREAD_SUSPEND_RESUME, 0, entry.th32ThreadID);
                        if !thread.is_null() {
                            let previous = if freeze {
                                SuspendThread(thread)
                            } else {
                                ResumeThread(thread)
                            };
                            if previous != u32::MAX {
                                touched += 1;
                            }
                            CloseHandle(thread);
                        }
                    }
                    if Thread32Next(snap, &mut entry) == 0 {
                        break;
                    }
                }
            }
            CloseHandle(snap);
        }
        if touched == 0 {
            return Err(std::io::Error::other(format!(
                "no threads of process {pid}"
            )));
        }
        Ok(())
    }

    /// `osproc::detach`, minus CREATE_BREAKAWAY_FROM_JOB when this process sits
    /// in a job that forbids breaking away: CreateProcess refuses the flag with
    /// ERROR_ACCESS_DENIED there (e.g. under `cargo run`/`tauri dev`), so the
    /// child would never start.
    pub fn detach(cmd: &mut Command) -> &mut Command {
        crate::osproc::detach(cmd);
        if !breakaway_allowed() {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
        }
        cmd
    }

    fn breakaway_allowed() -> bool {
        use windows_sys::Win32::System::JobObjects::{
            IsProcessInJob, JobObjectExtendedLimitInformation, QueryInformationJobObject,
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_BREAKAWAY_OK,
        };
        use windows_sys::Win32::System::Threading::GetCurrentProcess;
        static ALLOWED: OnceLock<bool> = OnceLock::new();
        *ALLOWED.get_or_init(|| unsafe {
            let mut in_job = 0;
            if IsProcessInJob(GetCurrentProcess(), std::ptr::null_mut(), &mut in_job) == 0
                || in_job == 0
            {
                return true;
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            let ok = QueryInformationJobObject(
                std::ptr::null_mut(),
                JobObjectExtendedLimitInformation,
                &mut info as *mut _ as *mut core::ffi::c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                std::ptr::null_mut(),
            );
            ok != 0 && info.BasicLimitInformation.LimitFlags & JOB_OBJECT_LIMIT_BREAKAWAY_OK != 0
        })
    }

    /// The foreground job of the pty whose shell is `shell` (see
    /// `super::foreground`), from a fresh snapshot.
    pub fn foreground_pid(shell: u32) -> u32 {
        super::foreground(&snapshot(), shell, created)
    }

    /// `super::subtree` over a fresh snapshot.
    pub fn trees(roots: &[u32]) -> Vec<u32> {
        super::subtree(&snapshot(), roots, created)
    }

    /// `super::proven_descendant` over a fresh snapshot.
    pub fn is_proven_descendant(pid: u32, roots: &[u32]) -> bool {
        super::proven_descendant(&snapshot(), pid, roots, created)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn table(rows: &[(u32, u32, &str)]) -> Vec<Proc> {
        rows.iter()
            .map(|&(pid, ppid, name)| Proc {
                pid,
                ppid,
                name: name.to_string(),
            })
            .collect()
    }

    fn times(rows: &[(u32, u64)]) -> impl Fn(u32) -> Option<u64> {
        let map: HashMap<u32, u64> = rows.iter().copied().collect();
        move |pid| map.get(&pid).copied()
    }

    #[test]
    fn exe_stem_drops_only_the_exe_extension() {
        assert_eq!(exe_stem("node.exe"), "node");
        assert_eq!(exe_stem("Claude.EXE"), "Claude");
        assert_eq!(exe_stem("bash"), "bash");
        assert_eq!(exe_stem(".exe"), ".exe");
        assert_eq!(exe_stem("tool.cmd"), "tool.cmd");
    }

    /// A Git Bash pty: the launcher bash.exe starts the real bash. At its
    /// prompt nothing else runs, so the foreground is a shell.
    #[test]
    fn a_shell_at_its_prompt_is_its_own_foreground() {
        let t = table(&[(10, 1, "bash"), (11, 10, "bash")]);
        let born = times(&[(10, 1), (11, 2)]);
        assert_eq!(foreground(&t, 10, &born), 11);
        assert_eq!(foreground(&t, 99, &born), 99);
    }

    /// MSYS runs a native program from a forked bash that waits on it, so the
    /// agent sits under a second bash; its own helpers are not the job.
    #[test]
    fn the_job_is_the_first_non_shell_under_the_shells() {
        let t = table(&[
            (10, 1, "bash"),
            (11, 10, "bash"),
            (12, 11, "bash"),
            (13, 12, "claude"),
            (14, 13, "rg"),
            (15, 1, "conhost"),
        ]);
        let born = times(&[(10, 1), (11, 2), (12, 3), (13, 4), (14, 5)]);
        assert_eq!(foreground(&t, 10, &born), 13);
    }

    #[test]
    fn the_newest_child_wins_over_a_background_job() {
        let t = table(&[(10, 1, "bash"), (20, 10, "node"), (21, 10, "python")]);
        let born = times(&[(10, 1), (20, 9), (21, 5)]);
        assert_eq!(foreground(&t, 10, &born), 20);
    }

    #[test]
    fn console_hosts_are_never_the_job() {
        let t = table(&[
            (10, 1, "bash"),
            (20, 10, "conhost"),
            (21, 10, "OpenConsole"),
        ]);
        let born = times(&[(10, 1), (20, 2), (21, 3)]);
        assert_eq!(foreground(&t, 10, &born), 10);
    }

    /// Windows never reparents: an orphan keeps naming its dead parent's pid,
    /// and that pid may since have gone to our shell. It predates the shell,
    /// so it is nobody we started.
    #[test]
    fn an_orphan_older_than_a_recycled_pid_is_not_its_child() {
        let t = table(&[(10, 1, "bash"), (30, 10, "postgres"), (31, 10, "node")]);
        let born = times(&[(10, 50), (30, 20), (31, 60)]);
        assert_eq!(foreground(&t, 10, &born), 31);
        assert_eq!(subtree(&t, &[10], &born), [10, 31]);
    }

    #[test]
    fn subtree_lists_parents_before_children_and_skips_system_pids() {
        let t = table(&[
            (10, 1, "bash"),
            (11, 10, "node"),
            (12, 11, "node"),
            (13, 10, "sleep"),
            (40, 1, "other"),
        ]);
        let born = times(&[]);
        assert_eq!(subtree(&t, &[10], &born), [10, 11, 12, 13]);
        assert_eq!(subtree(&t, &[0, 4], &born), Vec::<u32>::new());
        assert_eq!(subtree(&t, &[10, 11], &born), [10, 11, 12, 13]);
    }

    /// The status relay's gate: a wrapper `ssh` may hand the connection to a
    /// child, but an orphan named after a recycled pid, or a process whose age
    /// can't be read, never gets in.
    #[test]
    fn only_a_provable_descendant_is_vouched_for() {
        let t = table(&[
            (10, 1, "ssh"),
            (11, 10, "ssh"),
            (12, 11, "ssh"),
            (30, 10, "evil"),
            (31, 10, "other-account"),
            (40, 1, "stranger"),
        ]);
        let born = times(&[(10, 50), (11, 60), (12, 70), (30, 20), (40, 1)]);
        assert!(proven_descendant(&t, 10, &[10], &born));
        assert!(proven_descendant(&t, 11, &[10], &born));
        assert!(proven_descendant(&t, 12, &[10], &born));
        assert!(!proven_descendant(&t, 30, &[10], &born));
        assert!(!proven_descendant(&t, 31, &[10], &born));
        assert!(!proven_descendant(&t, 40, &[10], &born));
        assert!(!proven_descendant(&t, 99, &[10], &born));
        assert!(!proven_descendant(&t, 11, &[], &born));
    }

    #[test]
    fn a_proof_through_a_parent_cycle_terminates() {
        let t = table(&[(20, 21, "a"), (21, 20, "b")]);
        let born = times(&[(20, 5), (21, 5)]);
        assert!(!proven_descendant(&t, 20, &[99], &born));
    }

    #[test]
    fn a_parent_cycle_terminates() {
        let t = table(&[(20, 21, "bash"), (21, 20, "bash")]);
        let born = times(&[]);
        assert_eq!(foreground(&t, 20, &born), 21);
        assert_eq!(subtree(&t, &[20], &born), [20, 21]);
    }
}
