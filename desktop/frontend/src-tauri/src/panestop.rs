// Graceful service-pane teardown on Windows. Unix ends a pane with SIGTERM to
// its process groups and SIGKILL only for what outlives a grace period
// (proctree::kill_pids). Windows has no signal to send from outside, so a pane
// is stopped the way someone at it would stop it: ^C typed into its
// pseudoconsole, which conhost delivers as CTRL_C_EVENT to every process on
// that console, then ^C once more halfway through the same grace period for a
// job still there (a batch file asking "Terminate batch job (Y/N)?", a tool
// that wants it twice). Only what is left after that gets the tree kill.
//
// The decisions are plain functions so they are tested everywhere; only the
// pane and process-table calls are Windows-only.
use crate::procwin::{is_console_host, is_shell, subtree, Proc};
use std::time::{Duration, Instant};

/// Whether the pane whose shell is `shell` still runs a job: anything under
/// it other than shells (its own, or MSYS's stubs waiting on an exec'd
/// program) and console hosts. The shell itself survives a ^C at its prompt,
/// so the job is what a stop waits on.
pub fn runs_job(table: &[Proc], shell: u32, born: impl Fn(u32) -> Option<u64>) -> bool {
    subtree(table, &[shell], born)
        .into_iter()
        .filter(|&pid| pid != shell)
        .filter_map(|pid| table.iter().find(|p| p.pid == pid))
        .any(|p| !is_shell(&p.name) && !is_console_host(&p.name))
}

/// Whether anything but shells and console hosts runs on the console whose host
/// is `host`. MSYS execs one of its own programs by replacing the forked
/// process, so the Windows parent of a script's `sleep` no longer exists and
/// `runs_job`'s walk from the shell never reaches it; its console still says
/// which pane it runs in.
pub fn console_runs_job(table: &[Proc], host: u32, host_of: impl Fn(u32) -> Option<u32>) -> bool {
    table
        .iter()
        .filter(|p| !is_shell(&p.name) && !is_console_host(&p.name))
        .any(|p| host_of(p.pid) == Some(host))
}

/// Interrupt every busy target, poll until none is busy, interrupt the ones
/// still busy once more halfway through `grace`, and give up when it is over.
/// Returns the targets still busy at that point.
pub fn interrupt_until_idle<T>(
    targets: Vec<T>,
    grace: Duration,
    poll: Duration,
    mut interrupt: impl FnMut(&T),
    mut busy: impl FnMut(&[T]) -> Vec<bool>,
) -> Vec<T> {
    let mut left = still_busy(targets, &mut busy);
    if left.is_empty() {
        return left;
    }
    left.iter().for_each(&mut interrupt);
    let start = Instant::now();
    let mut repeated = false;
    loop {
        std::thread::sleep(poll);
        left = still_busy(left, &mut busy);
        let elapsed = start.elapsed();
        if left.is_empty() || elapsed >= grace {
            return left;
        }
        if !repeated && elapsed >= grace / 2 {
            left.iter().for_each(&mut interrupt);
            repeated = true;
        }
    }
}

fn still_busy<T>(targets: Vec<T>, busy: &mut impl FnMut(&[T]) -> Vec<bool>) -> Vec<T> {
    let flags = busy(&targets);
    targets
        .into_iter()
        .zip(flags)
        .filter_map(|(target, busy)| busy.then_some(target))
        .collect()
}

/// ^C every pane that is running a job and wait, up to the grace period Unix
/// gives SIGTERM, for those jobs to end. Blocking: the daemon calls it from a
/// request thread or its own teardown thread, never the app's UI thread.
#[cfg(windows)]
pub fn interrupt_and_wait(panes: &[std::sync::Arc<crate::sessionpane::Pane>]) {
    let targets: Vec<&crate::sessionpane::Pane> = panes
        .iter()
        .map(|pane| pane.as_ref())
        .filter(|pane| pane.pid > 0)
        .collect();
    interrupt_until_idle(
        targets,
        Duration::from_millis(crate::proctree::TERM_TIMEOUT_MS),
        Duration::from_millis(crate::proctree::POLL_MS),
        |pane| {
            let _ = pane.type_ctrl_c();
        },
        |panes| {
            let table = crate::procwin::snapshot();
            let hosts: std::collections::HashMap<u32, u32> = table
                .iter()
                .filter(|p| !is_shell(&p.name) && !is_console_host(&p.name))
                .filter_map(|p| Some((p.pid, crate::procwin::console_host(p.pid)?)))
                .collect();
            panes
                .iter()
                .map(|pane| {
                    let shell = pane.pid as u32;
                    runs_job(&table, shell, crate::procwin::created)
                        || crate::procwin::console_host(shell).is_some_and(|host| {
                            console_runs_job(&table, host, |pid| hosts.get(&pid).copied())
                        })
                })
                .collect()
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
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

    /// Git Bash's launcher starts the real bash; at its prompt nothing else
    /// runs, so there is nothing to wait for.
    #[test]
    fn a_pane_at_its_prompt_runs_no_job() {
        let t = table(&[(10, 1, "bash"), (11, 10, "bash"), (12, 1, "OpenConsole")]);
        assert!(!runs_job(&t, 10, times(&[(10, 1), (11, 2)])));
    }

    #[test]
    fn a_native_program_under_the_msys_stub_is_the_job() {
        let t = table(&[
            (10, 1, "bash"),
            (11, 10, "bash"),
            (12, 11, "bash"),
            (13, 12, "node"),
        ]);
        assert!(runs_job(&t, 10, times(&[(10, 1), (11, 2), (12, 3), (13, 4)])));
    }

    #[test]
    fn console_hosts_and_shells_alone_are_not_a_job() {
        let t = table(&[(10, 1, "bash"), (11, 10, "bash"), (12, 11, "conhost")]);
        assert!(!runs_job(&t, 10, times(&[])));
    }

    /// A pid recycled onto the pane's shell must not make a stranger look
    /// like its job: a process older than the shell is not its child.
    #[test]
    fn an_orphan_older_than_the_shell_is_not_its_job() {
        let t = table(&[(10, 1, "bash"), (30, 10, "postgres")]);
        assert!(!runs_job(&t, 10, times(&[(10, 50), (30, 20)])));
        assert!(runs_job(&t, 10, times(&[(10, 50), (30, 60)])));
    }

    /// A script's `sleep` whose Windows parent (MSYS's fork, gone after the
    /// exec) is not in the table still runs on the pane's console.
    #[test]
    fn a_job_orphaned_by_an_msys_exec_runs_on_the_panes_console() {
        let rows = [
            (10, 1, "bash"),
            (11, 10, "bash"),
            (20, 99, "bash"),
            (21, 98, "sleep"),
            (30, 1, "OpenConsole"),
            (40, 97, "node"),
        ];
        let hosts: HashMap<u32, u32> =
            [(10, 30), (11, 30), (20, 30), (21, 30), (30, 30), (40, 31)].into_iter().collect();
        let host_of = |pid| hosts.get(&pid).copied();
        let busy = table(&rows);
        assert!(!runs_job(&busy, 10, times(&[])));
        assert!(console_runs_job(&busy, 30, host_of));
        let idle = table(&[rows[0], rows[1], rows[2], rows[4], rows[5]]);
        assert!(!console_runs_job(&idle, 30, host_of));
    }

    #[test]
    fn a_shell_that_is_not_a_known_shell_never_counts_as_its_own_job() {
        let t = table(&[(10, 1, "pwsh")]);
        assert!(!runs_job(&t, 10, times(&[])));
    }

    struct Fake {
        /// ^C presses each target needs before its job ends; None ignores them.
        needs: HashMap<u32, Option<u32>>,
        pressed: RefCell<HashMap<u32, u32>>,
    }

    impl Fake {
        fn new(needs: &[(u32, Option<u32>)]) -> Self {
            Fake {
                needs: needs.iter().copied().collect(),
                pressed: RefCell::new(HashMap::new()),
            }
        }

        fn run(&self, grace: Duration) -> Vec<u32> {
            let mut ids: Vec<u32> = self.needs.keys().copied().collect();
            ids.sort();
            interrupt_until_idle(
                ids,
                grace,
                Duration::from_millis(2),
                |id| *self.pressed.borrow_mut().entry(*id).or_default() += 1,
                |ids| ids.iter().map(|id| self.busy(*id)).collect(),
            )
        }

        fn busy(&self, id: u32) -> bool {
            let pressed = self.pressed.borrow().get(&id).copied().unwrap_or(0);
            match self.needs[&id] {
                Some(needed) => pressed < needed,
                None => true,
            }
        }

        fn presses(&self, id: u32) -> u32 {
            self.pressed.borrow().get(&id).copied().unwrap_or(0)
        }
    }

    #[test]
    fn idle_panes_are_never_interrupted() {
        let fake = Fake::new(&[(1, Some(0)), (2, Some(0))]);
        let started = Instant::now();
        assert!(fake.run(Duration::from_secs(5)).is_empty());
        assert!(started.elapsed() < Duration::from_secs(1));
        assert_eq!(fake.presses(1), 0);
        assert_eq!(fake.presses(2), 0);
    }

    #[test]
    fn a_job_that_stops_on_the_first_ctrl_c_gets_one_and_no_wait() {
        let fake = Fake::new(&[(1, Some(1)), (2, Some(0))]);
        let started = Instant::now();
        assert!(fake.run(Duration::from_secs(5)).is_empty());
        assert!(started.elapsed() < Duration::from_secs(1));
        assert_eq!(fake.presses(1), 1);
        assert_eq!(fake.presses(2), 0);
    }

    #[test]
    fn a_job_still_there_halfway_gets_a_second_ctrl_c() {
        let fake = Fake::new(&[(1, Some(2))]);
        let grace = Duration::from_millis(200);
        let started = Instant::now();
        assert!(fake.run(grace).is_empty());
        let took = started.elapsed();
        assert!(took >= grace / 2 && took < grace * 5, "took {took:?}");
        assert_eq!(fake.presses(1), 2);
    }

    #[test]
    fn a_job_that_ignores_ctrl_c_is_left_for_the_kill_after_the_grace_period() {
        let fake = Fake::new(&[(1, None), (2, Some(1))]);
        let grace = Duration::from_millis(100);
        let started = Instant::now();
        assert_eq!(fake.run(grace), [1]);
        assert!(started.elapsed() >= grace);
        assert_eq!(fake.presses(1), 2);
        assert_eq!(fake.presses(2), 1);
    }
}
