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
use std::time::Duration;

const GRACE_MS: u64 = 200;

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

/// SIGTERM the pids (and their groups), give them a brief grace period to exit
/// cleanly, then SIGKILL the survivors. Blocking — reached only via the *_async
/// entry points, which run it off the caller's thread.
fn kill_pids(pids: Vec<i32>) {
    if pids.is_empty() {
        return;
    }
    signal_all(&pids, libc::SIGTERM);
    thread::sleep(Duration::from_millis(GRACE_MS));
    signal_all(&pids, libc::SIGKILL);
}

/// Reap an already-snapshotted set of pids on a background thread. Callers that
/// must snapshot before an external teardown (tmux kill-session reparents the
/// children synchronously) capture `trees(..)` first, then hand it here.
pub(crate) fn kill_pids_async(pids: Vec<i32>) {
    if pids.is_empty() {
        return;
    }
    thread::spawn(move || kill_pids(pids));
}

/// Snapshot `pid`'s tree and reap it, all on a background thread. For callers
/// that own the only kill of `pid` (a pty child nothing else touches), so the
/// snapshot is race-free without blocking the caller.
pub(crate) fn kill_tree_async(pid: i32) {
    if pid <= 1 {
        return;
    }
    thread::spawn(move || kill_pids(trees(&[pid])));
}
