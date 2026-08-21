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
use std::fs::File;
use std::os::unix::io::AsRawFd;

/// Detach the calling process. Returns in the grandchild only; the caller's
/// process and the intermediate both exit here. MUST run before any thread is
/// started — fork in a multithreaded process copies only the calling thread.
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

/// Point the three standard descriptors at /dev/null. They must stay OPEN, not
/// merely closed: a later open() would otherwise be handed fd 0/1/2, and a pty
/// master landing on stdout is a file descriptor two subsystems both believe
/// they own.
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
    let taken = unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } == 0;
    taken.then_some(Lock(file))
}
