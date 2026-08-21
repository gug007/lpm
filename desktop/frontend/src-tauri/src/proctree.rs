// Process-tree termination (macOS). Both stop paths — terminal close (pty.rs)
// and tmux service kill (tmux.rs) — used to signal a single pid. A killed shell
// can't forward the signal to a dev server it launched, so node/next-server
// grandchildren reparent to launchd and keep burning CPU. We instead reap the
// whole tree: signal the leader's process group (portable-pty and tmux both
// setsid the pane shell, so the group leader == the shell pid) plus a ps-ppid
// descendant walk as a backstop for grandchildren that started their own group.
use std::collections::{HashMap, HashSet};
use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};

const POLL_MS: u64 = 50;
const TERM_TIMEOUT_MS: u64 = 3000;

/// pid -> its direct children for every process on the machine, from one `ps`
/// scan. Empty when ps is unavailable — callers then reap only the roots.
fn children_map() -> HashMap<i32, Vec<i32>> {
    let mut children: HashMap<i32, Vec<i32>> = HashMap::new();
    if let Ok(o) = Command::new("ps").args(["-e", "-o", "pid=,ppid="]).output() {
        for line in String::from_utf8_lossy(&o.stdout).lines() {
            let mut f = line.split_whitespace();
            if let (Some(pid), Some(ppid)) = (f.next(), f.next()) {
                if let (Ok(pid), Ok(ppid)) = (pid.parse::<i32>(), ppid.parse::<i32>()) {
                    children.entry(ppid).or_default().push(pid);
                }
            }
        }
    }
    children
}

/// Every process in the subtrees rooted at `roots` (roots included), from a
/// single process-table snapshot. Capture this BEFORE killing the roots — once
/// they die their children reparent to launchd and drop out of the walk.
pub(crate) fn trees(roots: &[i32]) -> Vec<i32> {
    let mut stack: Vec<i32> = roots.iter().copied().filter(|&p| p > 1).collect();
    if stack.is_empty() {
        return Vec::new();
    }
    let children = children_map();
    let mut seen: HashSet<i32> = HashSet::new();
    let mut out = Vec::new();
    while let Some(pid) = stack.pop() {
        if pid <= 1 || !seen.insert(pid) {
            continue;
        }
        out.push(pid);
        if let Some(kids) = children.get(&pid) {
            stack.extend(kids);
        }
    }
    out
}

fn signal_all(pids: &[i32], sig: i32) {
    for &pid in pids {
        // pid <= 1 would make -pid target our own group (0) or broadcast (-1) —
        // never let that happen.
        if pid <= 1 {
            continue;
        }
        unsafe {
            libc::kill(-pid, sig); // process group led by pid (setsid leaders)
            libc::kill(pid, sig); // and the process itself, if it leads no group
        }
    }
}

/// SIGTERM the pids (and their groups), poll until they exit, and SIGKILL only
/// the survivors. A fixed short grace forced TERM->KILL onto stateful services
/// (postgres/mysql/redis) in ~200ms — a crash + recovery on every project stop.
/// Polling instead means well-behaved processes are confirmed dead in <100ms
/// and only TERM-ignoring trees wait out the full timeout. Blocking — callers
/// that must not stall use the *_async entry points.
pub(crate) fn kill_pids(pids: &[i32]) {
    let mut survivors: Vec<i32> = pids.iter().copied().filter(|&p| p > 1).collect();
    if survivors.is_empty() {
        return;
    }
    signal_all(&survivors, libc::SIGTERM);
    let deadline = Instant::now() + Duration::from_millis(TERM_TIMEOUT_MS);
    loop {
        // kill(pid, 0) probes liveness without signalling; a zombie reads dead
        // as soon as its parent reaps it (pty flush thread / tmux / launchd).
        survivors.retain(|&p| unsafe { libc::kill(p, 0) == 0 });
        if survivors.is_empty() {
            return;
        }
        if Instant::now() >= deadline {
            break;
        }
        thread::sleep(Duration::from_millis(POLL_MS));
    }
    signal_all(&survivors, libc::SIGKILL);
}

/// Reap an already-snapshotted set of pids on a background thread. Callers that
/// must snapshot before an external teardown (tmux kill-session reparents the
/// children synchronously) capture `trees(..)` first, then hand it here.
pub(crate) fn kill_pids_async(pids: Vec<i32>) {
    if pids.is_empty() {
        return;
    }
    thread::spawn(move || kill_pids(&pids));
}

/// Snapshot `pid`'s tree and reap it, all on a background thread. For callers
/// that own the only kill of `pid` (a pty child nothing else touches), so the
/// snapshot is race-free without blocking the caller.
pub(crate) fn kill_tree_async(pid: i32) {
    if pid <= 1 {
        return;
    }
    thread::spawn(move || kill_pids(&trees(&[pid])));
}
