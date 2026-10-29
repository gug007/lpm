// Which processes belong to an automation run. A run's agent has a shell and
// the user's account, so the local socket checks who is calling before the
// verbs a run must never use on itself: answering or dismissing a question,
// replying in its thread (which answers in words), pairing a phone or a
// computer, and starting a task in the app's terminals (`lpm run`, or a
// duplicate that runs one), whose processes would sit outside the run and so
// could answer for it. The app's own UI, phones and Telegram answer in-process
// and never meet this check.
//
// A run's first process leads its own session (osproc::detach). The run's
// processes are known by that session, by their parent chain, and by sweeps
// that note every descendant while the chain is intact, so one that left the
// session (Claude Code starts each tool command in a new one) or outlived its
// parents is still known. Every process is named by its pid and start time,
// so a pid handed to someone else later never counts. Marks stay for a day
// after the run ends, in memory: an app restart forgets them. Not covered: a
// process that detaches between two sweeps, and work handed to something
// outside the run (launchd, cron, another terminal).
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

type ProcId = (u32, u64);
type Table = HashMap<u32, (u32, u64)>;

const SWEEP_EVERY: Duration = Duration::from_secs(1);
const KEEP_AFTER_END: Duration = Duration::from_secs(24 * 60 * 60);
const MAX_DEPTH: usize = 64;

const REFUSAL: &str = "An automation run can't answer, dismiss or reply to automation questions, or pair a device. Answer in lpm, lpm Link or Telegram.";
const TASK_REFUSAL: &str = "An automation run can't start tasks in lpm's terminals (lpm run, or lpm duplicate or lpm worktree with --run or --command): they would run outside the automation.";

struct Mark {
    id: u64,
    leader: ProcId,
    seen: HashSet<ProcId>,
    swept: Option<Instant>,
    ended: Option<Instant>,
    /// The newest start among all processes when the run ended. A session
    /// whose leader is gone is the run's only for a caller that started
    /// before then: a pid reused later can lead a stranger's session.
    horizon: Option<u64>,
}

static MARKS: Mutex<Vec<Mark>> = Mutex::new(Vec::new());
static NEXT: AtomicU64 = AtomicU64::new(1);

/// Socket verbs a run is refused.
pub fn refused(verb: &str) -> bool {
    matches!(
        verb,
        "answer_job_question"
            | "dismiss_job_question"
            | "send_job_followup"
            | "remote_pair"
            | "peer_pair"
            | "run_task"
    )
}

/// The reply to a refused verb, in the shape its CLI reads as an error: the
/// pairing verbs and run_task report failures as `ERROR:` lines, the job and
/// duplicate verbs as JSON.
pub fn refusal(verb: &str) -> String {
    let text = match verb {
        "run_task" | "duplicate_project" | "duplicate_worktree" => TASK_REFUSAL,
        _ => REFUSAL,
    };
    if verb.ends_with("_pair") || verb == "run_task" {
        format!("ERROR: {text}")
    } else {
        serde_json::json!({ "ok": false, "error": text }).to_string()
    }
}

fn table() -> Table {
    crate::osproc::process_starts()
        .into_iter()
        .map(|(pid, ppid, start)| (pid, (ppid, start)))
        .collect()
}

fn prune(marks: &mut Vec<Mark>) {
    marks.retain(|m| m.ended.is_none_or(|t| t.elapsed() < KEEP_AFTER_END));
}

/// One run being watched while its first process lives. Dropping it ends the
/// run, and its mark is kept for a day.
pub struct Watch(u64);

pub fn watch(pid: u32) -> Watch {
    let id = NEXT.fetch_add(1, Ordering::Relaxed);
    let start = crate::osproc::start_of(pid).unwrap_or(0);
    let mut marks = MARKS.lock().unwrap();
    prune(&mut marks);
    marks.push(Mark {
        id,
        leader: (pid, start),
        seen: HashSet::new(),
        swept: None,
        ended: None,
        horizon: None,
    });
    Watch(id)
}

impl Watch {
    /// Note the run's live descendants. Meant for a poll loop: it looks at
    /// most once a second.
    pub fn sweep(&self) {
        let due = MARKS
            .lock()
            .unwrap()
            .iter()
            .any(|m| m.id == self.0 && m.swept.is_none_or(|t| t.elapsed() >= SWEEP_EVERY));
        if due {
            self.record(false);
        }
    }

    fn record(&self, ending: bool) {
        let t = table();
        let mut marks = MARKS.lock().unwrap();
        if let Some(m) = marks.iter_mut().find(|m| m.id == self.0) {
            note_descendants(m, &t);
            m.swept = Some(Instant::now());
            if ending {
                m.ended = Some(Instant::now());
                m.horizon = Some(t.values().map(|&(_, start)| start).max().unwrap_or(0));
            }
        }
    }
}

impl Drop for Watch {
    fn drop(&mut self) {
        self.record(true);
    }
}

/// Adds the live descendants of the run's live processes to `seen`, and drops
/// the ones that are gone: a (pid, start) that ended never connects again.
/// Only a process still holding its recorded pid and start is followed, so
/// the children of whoever got a pid later never join.
fn note_descendants(m: &mut Mark, t: &Table) {
    let live = |&(pid, start): &ProcId| t.get(&pid).is_some_and(|&(_, now)| now == start);
    m.seen.retain(live);
    let mut children: HashMap<u32, Vec<ProcId>> = HashMap::new();
    for (&pid, &(ppid, start)) in t {
        children.entry(ppid).or_default().push((pid, start));
    }
    let mut frontier: Vec<ProcId> = std::iter::once(m.leader)
        .filter(live)
        .chain(m.seen.iter().copied())
        .collect();
    while let Some((parent, parent_start)) = frontier.pop() {
        for &(pid, start) in children.get(&parent).into_iter().flatten() {
            if start >= parent_start && m.seen.insert((pid, start)) {
                frontier.push((pid, start));
            }
        }
    }
}

/// Whether the process that connected (`peer`) belongs to a run, live or
/// ended within the day. A caller the kernel didn't name counts as a run on
/// Unix; Windows builds before AF_UNIX peer ids can't name one, so it doesn't
/// there.
pub fn from_run(peer: Option<u32>) -> bool {
    let Some(pid) = peer else {
        return cfg!(unix);
    };
    if MARKS.lock().unwrap().is_empty() {
        return false;
    }
    let t = table();
    let session = crate::osproc::session_of(pid);
    let mut marks = MARKS.lock().unwrap();
    prune(&mut marks);
    belongs(pid, &t, &marks, session, crate::osproc::is_alive)
}

fn belongs(
    pid: u32,
    t: &Table,
    marks: &[Mark],
    session: Option<u32>,
    alive: impl Fn(u32) -> bool,
) -> bool {
    let Some(&(_, mut start)) = t.get(&pid) else {
        return true;
    };
    if let Some(sid) = session {
        for m in marks.iter().filter(|m| m.leader.0 == sid) {
            let ours = match t.get(&sid) {
                Some(&(_, leader_start)) => leader_start == m.leader.1,
                // Alive but not ours to read (a terminal's root-owned login):
                // someone else's session.
                None if alive(sid) => false,
                None => m.horizon.is_none_or(|h| start <= h),
            };
            if ours {
                return true;
            }
        }
    }
    let mut current = pid;
    for _ in 0..MAX_DEPTH {
        if marks
            .iter()
            .any(|m| m.leader == (current, start) || m.seen.contains(&(current, start)))
        {
            return true;
        }
        let Some(&(parent, _)) = t.get(&current) else {
            break;
        };
        if parent <= 1 || parent == current {
            break;
        }
        let Some(&(_, parent_start)) = t.get(&parent) else {
            break;
        };
        if parent_start > start {
            break;
        }
        (current, start) = (parent, parent_start);
    }
    false
}

#[cfg(test)]
#[path = "runguard_tests.rs"]
mod tests;
