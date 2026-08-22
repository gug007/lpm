// Telling a pane's own agent apart from an agent that agent launched.
//
// A pane exports LPM_PANE_ID/LPM_PROJECT_NAME/LPM_SOCKET_PATH to its whole
// process tree, and the agent hooks live in the user's global settings — so a
// `claude` the agent shells out to (a test, a script, a nested run) fires the
// same hooks, under its own session id but the host tab's pane id. Keyed per
// session (hooks.rs), that lands in the status store as a SECOND agent on the
// tab: an extra sidebar row wearing the tab's name, an extra chime, and a
// "done" banner for an agent the user never started.
//
// The process tree is the discriminator. Each hook reports the pid it ran
// under; walking from there up to the pane's shell, the pane's own agent has
// exactly one agent process on the path — itself — and anything it launched has
// at least two. Counting them, rather than asking "is an agent an ancestor",
// keeps the answer right when a harness runs its hooks through a wrapper shell,
// which puts the reporter's own agent in its ancestry either way.
//
// Every uncertainty fails OPEN (report accepted): a pane whose shell is not on
// the path at all (tmux, whose panes hang off the server), a pid the table
// doesn't know (a process younger than the snapshot), a machine without `ps`.
// Dropping a real agent's status would leave a tab dark for the rest of a turn.
use std::collections::HashMap;
use std::process::Command;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

/// What an agent's process is called. The desktop app's `Claude` binary differs
/// in case and never sits inside a pane's tree, so an exact match is enough.
const AGENT_COMMS: [&str; 2] = ["claude", "codex"];

/// Bounds the walk against a `ps` snapshot whose pid->ppid edges form a cycle.
const MAX_DEPTH: usize = 64;

/// How long one process-table scan serves. `PreToolUse` fires on every tool
/// call, so this must not be a `ps` per report; ancestry is stable enough over
/// this window that a stale table only ever fails open.
const TABLE_TTL: Duration = Duration::from_millis(750);

struct Proc {
    ppid: i32,
    comm: String,
}

type Table = HashMap<i32, Proc>;
/// The last scan and when it was taken, or nothing before the first one.
type Cached = Mutex<Option<(Instant, Arc<Table>)>>;

/// The leading whitespace-delimited field of `s`, and what follows it. `ps`
/// right-aligns its numeric columns, so the fields are split by runs of spaces.
fn split_field(s: &str) -> Option<(&str, &str)> {
    let s = s.trim_start();
    let end = s.find(char::is_whitespace)?;
    Some((&s[..end], s[end..].trim_start()))
}

/// Parse `ps -e -o pid=,ppid=,comm=` output. `comm` is whatever remains on the
/// line: macOS prints the executable's full path, which can hold spaces.
fn parse_table(out: &str) -> Table {
    let mut table = Table::new();
    for line in out.lines() {
        let Some((pid, rest)) = split_field(line) else {
            continue;
        };
        let Some((ppid, comm)) = split_field(rest) else {
            continue;
        };
        if let (Ok(pid), Ok(ppid)) = (pid.parse(), ppid.parse()) {
            table.insert(
                pid,
                Proc {
                    ppid,
                    comm: comm.trim_end().to_string(),
                },
            );
        }
    }
    table
}

/// pid -> (ppid, comm) for every process on the machine. Empty when `ps` is
/// unavailable, which reads as "nothing known" and so accepts every report.
fn scan() -> Table {
    let Ok(out) = Command::new("ps")
        .args(["-e", "-o", "pid=,ppid=,comm="])
        .output()
    else {
        return Table::new();
    };
    parse_table(&String::from_utf8_lossy(&out.stdout))
}

/// The process table, scanned at most once per [`TABLE_TTL`] unless `fresh`
/// insists otherwise.
fn process_table(fresh: bool) -> Arc<Table> {
    static CACHE: OnceLock<Cached> = OnceLock::new();
    let cell = CACHE.get_or_init(|| Mutex::new(None));
    let mut held = cell.lock().unwrap();
    if !fresh {
        if let Some((at, table)) = held.as_ref() {
            if at.elapsed() < TABLE_TTL {
                return table.clone();
            }
        }
    }
    let table = Arc::new(scan());
    *held = Some((Instant::now(), table.clone()));
    table
}

fn is_agent(comm: &str) -> bool {
    let name = comm.rsplit('/').next().unwrap_or(comm);
    AGENT_COMMS.contains(&name)
}

/// Whether `reporter` sits under an agent that itself sits under `pane_shell`.
/// Split from [`is_nested_agent`] so the walk is testable against a fixed table.
fn nested_in_table(table: &Table, reporter: i32, pane_shell: i32) -> bool {
    if reporter <= 1 || pane_shell <= 1 {
        return false;
    }
    let mut pid = reporter;
    let mut agents = 0;
    for _ in 0..MAX_DEPTH {
        if pid == pane_shell {
            return agents >= 2;
        }
        let Some(proc) = table.get(&pid) else {
            return false;
        };
        if is_agent(&proc.comm) {
            agents += 1;
        }
        if proc.ppid <= 1 {
            return false;
        }
        pid = proc.ppid;
    }
    false
}

/// True when the process that reported is an agent another agent in the same
/// pane launched, and so speaks for no tab of its own.
pub fn is_nested_agent(reporter: i32, pane_shell: i32) -> bool {
    if reporter <= 1 || pane_shell <= 1 || reporter == pane_shell {
        return false;
    }
    let held = process_table(false);
    if held.contains_key(&reporter) {
        return nested_in_table(&held, reporter, pane_shell);
    }
    // A reporter the snapshot has never seen is younger than the snapshot — and
    // a just-started agent is exactly the case this exists for. Its FIRST report
    // is the one that matters most (SessionStart, which repoints the tab's
    // resume), and waving it through for want of a scan would miss it every
    // time: the scan that would have shown it was taken by the launching agent's
    // own report, moments earlier. Look again rather than assume.
    nested_in_table(&process_table(true), reporter, pane_shell)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn table(rows: &[(i32, i32, &str)]) -> Table {
        rows.iter()
            .map(|&(pid, ppid, comm)| {
                (
                    pid,
                    Proc {
                        ppid,
                        comm: comm.to_string(),
                    },
                )
            })
            .collect()
    }

    /// shell(10) -> claude(20): the tab's own agent, reporting as itself.
    #[test]
    fn pane_agent_is_not_nested() {
        let t = table(&[(10, 1, "-zsh"), (20, 10, "claude")]);
        assert!(!nested_in_table(&t, 20, 10));
    }

    /// The harness may run a hook through a wrapper shell, which puts the
    /// reporter's OWN agent in its ancestry — still one agent on the path.
    #[test]
    fn hook_wrapper_shell_is_not_nested() {
        let t = table(&[(10, 1, "-zsh"), (20, 10, "claude"), (30, 20, "sh")]);
        assert!(!nested_in_table(&t, 30, 10));
    }

    /// shell -> claude -> zsh -c -> claude: the reported bug.
    #[test]
    fn agent_launched_by_the_pane_agent_is_nested() {
        let t = table(&[
            (10, 1, "-zsh"),
            (20, 10, "claude"),
            (30, 20, "zsh"),
            (40, 30, "claude"),
        ]);
        assert!(nested_in_table(&t, 40, 10));
    }

    #[test]
    fn nested_agent_reporting_through_a_wrapper_is_nested() {
        let t = table(&[
            (10, 1, "-zsh"),
            (20, 10, "claude"),
            (30, 20, "zsh"),
            (40, 30, "claude"),
            (50, 40, "sh"),
        ]);
        assert!(nested_in_table(&t, 50, 10));
    }

    #[test]
    fn codex_counts_as_an_agent_and_mixes_with_claude() {
        let t = table(&[
            (10, 1, "-zsh"),
            (20, 10, "/opt/homebrew/bin/codex"),
            (30, 20, "claude"),
        ]);
        assert!(nested_in_table(&t, 30, 10));
    }

    /// A tmux pane hangs off the tmux server, not off the tab's shell: the walk
    /// never reaches the pane and must accept rather than blame.
    #[test]
    fn agent_outside_the_pane_tree_is_accepted() {
        let t = table(&[(10, 1, "-zsh"), (99, 1, "tmux"), (20, 99, "claude")]);
        assert!(!nested_in_table(&t, 20, 10));
    }

    #[test]
    fn unknown_reporter_is_accepted() {
        let t = table(&[(10, 1, "-zsh")]);
        assert!(!nested_in_table(&t, 4242, 10));
    }

    #[test]
    fn a_cycle_terminates_and_accepts() {
        let t = table(&[(20, 21, "claude"), (21, 20, "claude")]);
        assert!(!nested_in_table(&t, 20, 10));
    }

    #[test]
    fn reporter_is_the_pane_shell() {
        let t = table(&[(10, 1, "-zsh")]);
        assert!(!nested_in_table(&t, 10, 10));
    }

    #[test]
    fn agent_comm_matches_on_the_basename_only() {
        assert!(is_agent("claude"));
        assert!(is_agent("/Users/x/.local/bin/claude"));
        assert!(is_agent("codex"));
        // The desktop app, which is not a CLI agent.
        assert!(!is_agent("/Applications/Claude.app/Contents/MacOS/Claude"));
        assert!(!is_agent("claude-monitor"));
        assert!(!is_agent("node"));
    }

    /// `ps` right-aligns its numeric columns and prints paths with spaces in
    /// them verbatim, so neither may cost the row its command name.
    #[test]
    fn parses_right_aligned_columns_and_paths_with_spaces() {
        let t = parse_table(concat!(
            "24179     1 /Applications/Claude.app/Contents/MacOS/Claude\n",
            "  100    24 claude\n",
            "garbage line\n",
            " 4242\n",
        ));
        assert_eq!(t.len(), 2);
        assert_eq!(t[&24179].ppid, 1);
        assert_eq!(
            t[&24179].comm,
            "/Applications/Claude.app/Contents/MacOS/Claude"
        );
        assert_eq!(t[&100].ppid, 24);
        assert!(is_agent(&t[&100].comm));
    }

    /// The launching agent's own report primes the cache moments before the
    /// agent it launched exists, so the fresh look is the only thing between a
    /// nested SessionStart and the tab it would repoint.
    #[test]
    fn a_reporter_younger_than_the_snapshot_forces_a_fresh_look() {
        let stale = table(&[(10, 1, "-zsh"), (20, 10, "claude")]);
        assert!(
            !stale.contains_key(&40),
            "the nested agent is not in it yet"
        );
        let fresh = table(&[
            (10, 1, "-zsh"),
            (20, 10, "claude"),
            (30, 20, "zsh"),
            (40, 30, "claude"),
        ]);
        // Against the stale table the walk can only fail open; against the fresh
        // one it sees what is really there. `is_nested_agent` takes the second
        // look precisely because the first table cannot know this pid.
        assert!(!nested_in_table(&stale, 40, 10));
        assert!(nested_in_table(&fresh, 40, 10));
    }

    #[test]
    fn scan_reads_this_process_and_its_parent() {
        let table = scan();
        if table.is_empty() {
            return; // no `ps` on this machine
        }
        let me = std::process::id() as i32;
        let entry = table.get(&me).expect("our own pid is in the table");
        assert!(entry.ppid > 0, "our parent pid is known");
        assert!(!entry.comm.is_empty(), "our command name is known");
    }
}
