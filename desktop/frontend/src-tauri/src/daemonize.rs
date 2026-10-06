// Detaching a child from the process that started it.
//
// The session daemon has to outlive the app the way the tmux server did, and
// the two Linux host deployments depend on precisely HOW: lpm.service runs with
// KillMode=process and hostctl.sh stops its own process GROUP, both written
// around a supervisor that daemonizes out of the group while staying in the
// unit's cgroup (which fork and setsid both preserve). So: fork, setsid in the
// child, fork again so the daemon is not a session leader and can never pick up
// a controlling terminal from the ptys it opens, and let the first child exit
// immediately so whoever spawned us has nothing to reap.
//
// Windows has no fork: the launcher spawns the daemon already detached
// (daemonlaunch.rs), and detach() only tidies up what the process inherited.
use std::fs::File;
#[cfg(unix)]
use std::os::unix::io::AsRawFd;

/// Detach the calling process. Returns in the grandchild only; the caller's
/// process and the intermediate both exit here. MUST run before any thread is
/// started — fork in a multithreaded process copies only the calling thread.
#[cfg(unix)]
pub fn detach() {
    unsafe {
        match libc::fork() {
            -1 => return, // fork refused: run attached rather than not at all
            0 => {}
            _ => libc::_exit(0),
        }
        libc::setsid();
        match libc::fork() {
            -1 => {}
            0 => {}
            _ => libc::_exit(0),
        }
        // A daemon holding the cwd it was launched from pins that filesystem.
        libc::chdir(c"/".as_ptr());
        libc::umask(0o077);
    }
    redirect_stdio();
}

/// The process was created detached, with its stdio on the daemon log. A cwd
/// Windows holds open can't be renamed or deleted, so move to the system
/// drive's root rather than pin a project directory.
///
/// A new process group starts with Ctrl+C ignored, and every pane shell would
/// inherit that: an interrupted dev server would never see its ^C. Restore
/// normal handling before any pane exists.
#[cfg(windows)]
pub fn detach() {
    let drive = std::env::var("SystemDrive").unwrap_or_default();
    let _ = std::env::set_current_dir(format!("{drive}\\"));
    unsafe {
        windows_sys::Win32::System::Console::SetConsoleCtrlHandler(None, 0);
    }
}

/// Point the three standard descriptors at /dev/null. They must stay OPEN, not
/// merely closed: a later open() would otherwise be handed fd 0/1/2, and a pty
/// master landing on stdout is a file descriptor two subsystems both believe
/// they own.
#[cfg(unix)]
fn redirect_stdio() {
    let Ok(null) = File::options().read(true).write(true).open("/dev/null") else {
        return;
    };
    let fd = null.as_raw_fd();
    unsafe {
        libc::dup2(fd, libc::STDIN_FILENO);
        libc::dup2(fd, libc::STDOUT_FILENO);
        libc::dup2(fd, libc::STDERR_FILENO);
    }
}

/// An advisory whole-file lock held for the process's lifetime. Two clients
/// that miss the daemon at the same instant both start one; the one that takes
/// this lock binds the socket and the other exits, so the race resolves without
/// either of them having to probe a socket that may not be bound yet.
pub struct Lock(#[allow(dead_code)] File);

pub fn acquire(path: &std::path::Path) -> Option<Lock> {
    let file = File::options()
        .create(true)
        .truncate(false)
        .write(true)
        .open(path)
        .ok()?;
    let taken = matches!(crate::fsperm::try_lock_exclusive(&file), Ok(true));
    taken.then_some(Lock(file))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_second_daemon_cannot_take_the_lock_the_first_holds() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sessions.lock");
        let first = acquire(&path).expect("first lock");
        assert!(acquire(&path).is_none());
        drop(first);
        // A child forked by a concurrent test may hold the descriptor until it
        // execs, so the release can trail the drop by a moment.
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
        while acquire(&path).is_none() {
            assert!(std::time::Instant::now() < deadline, "lock never released");
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
    }
}
