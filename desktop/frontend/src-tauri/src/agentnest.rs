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
// A path that climbs to init without meeting the pane's shell belongs to no
// part of the tab at all, though it carries the tab's identity: an editor the
// tab opened (`code .`) runs its own agents, Claude's background daemon runs
// the sessions sent to it, a detached `nohup` run outlives its shell. Their
// reports speak for the tab no more than a nested agent's do.
//
// Every uncertainty fails OPEN (report accepted): a path through a terminal
// multiplexer (tmux's panes hang off its server, not off the tab's shell), a
// pid the table doesn't know (a process younger than the snapshot), a machine
// without `ps`. Dropping a real agent's status would leave a tab dark for the
// rest of a turn.
use std::collections::HashMap;
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
#[cfg(any(unix, test))]
fn split_field(s: &str) -> Option<(&str, &str)> {
    let s = s.trim_start();
    let end = s.find(char::is_whitespace)?;
    Some((&s[..end], s[end..].trim_start()))
}

/// Parse `ps -e -o pid=,ppid=,comm=` output. `comm` is whatever remains on the
/// line: macOS prints the executable's full path, which can hold spaces.
#[cfg(any(unix, test))]
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
#[cfg(unix)]
fn scan() -> Table {
    let Ok(out) = crate::osproc::command("ps")
        .args(["-e", "-o", "pid=,ppid=,comm="])
        .output()
    else {
        return Table::new();
    };
    parse_table(&String::from_utf8_lossy(&out.stdout))
}

/// The same table from a Toolhelp snapshot, names without `.exe`. A hook run
/// from Git Bash reports an MSYS pid, which this table doesn't know, and an
/// npm-installed agent runs as `node`; both fail open.
#[cfg(windows)]
fn scan() -> Table {
    crate::procwin::snapshot()
        .into_iter()
        .map(|p| {
            (
                p.pid as i32,
                Proc {
                    ppid: p.ppid as i32,
                    comm: p.name,
                },
            )
        })
        .collect()
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

/// What separates an agent from one it launched: agents run what they launch
/// through a shell (Claude's Bash tool, Codex's `zsh -lc`).
/// Servers whose panes run the tab's agents without descending from its shell.
const MULTIPLEXER_COMMS: [&str; 5] = ["tmux", "screen", "zellij", "abduco", "dtach"];

const SHELL_COMMS: [&str; 12] = [
    "sh", "bash", "zsh", "dash", "fish", "ksh", "tcsh", "csh", "nu", "pwsh", "powershell", "cmd",
];

fn basename(comm: &str) -> &str {
    comm.rsplit(['/', '\\']).next().unwrap_or(comm)
}

fn agent_name(comm: &str) -> Option<&str> {
    let name = basename(comm);
    AGENT_COMMS.contains(&name).then_some(name)
}

#[cfg(test)]
fn is_agent(comm: &str) -> bool {
    agent_name(comm).is_some()
}

/// A login shell's comm carries a leading dash (`-zsh`).
fn is_shell(comm: &str) -> bool {
    SHELL_COMMS.contains(&basename(comm).trim_start_matches('-'))
}

fn is_multiplexer(comm: &str) -> bool {
    let name = basename(comm).to_ascii_lowercase();
    MULTIPLEXER_COMMS.iter().any(|m| name.starts_with(m))
}

/// Whether `reporter` sits under an agent that itself sits under `pane_shell`,
/// or outside the pane's tree altogether. Split from [`is_nested_agent`] so the
/// walk is testable against a fixed table.
///
/// Counts agents, not agent-named processes: one agent can be several in a row
/// with no shell between them — a Volta shim that spawns the real binary rather
/// than exec'ing it, or Codex's background daemon under the `codex` that started
/// it — and those are the tab's own agent, not one it launched.
fn nested_in_table(table: &Table, reporter: i32, pane_shell: i32) -> bool {
    if reporter <= 1 || pane_shell <= 1 {
        return false;
    }
    let mut pid = reporter;
    let mut agents = 0;
    let mut inside: Option<&str> = None;
    let mut multiplexed = false;
    for _ in 0..MAX_DEPTH {
        let proc = table.get(&pid);
        if pid == pane_shell {
            // A pane whose root process is the agent itself (`exec claude`).
            let root = proc.and_then(|p| agent_name(&p.comm));
            let root_counts = root.is_some_and(|name| inside != Some(name));
            return agents + usize::from(root_counts) >= 2;
        }
        let Some(proc) = proc else {
            return false;
        };
        match agent_name(&proc.comm) {
            Some(name) if inside != Some(name) => {
                agents += 1;
                inside = Some(name);
            }
            Some(_) => {}
            None if is_shell(&proc.comm) => inside = None,
            None => multiplexed |= is_multiplexer(&proc.comm),
        }
        if proc.ppid <= 1 {
            return !multiplexed;
        }
        pid = proc.ppid;
    }
    false
}

/// True when the process that reported is an agent another agent in the same
/// pane launched, or one running outside the pane's process tree, and so speaks
/// for no tab of its own.
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

    /// Codex 0.160 hosts sessions in a background daemon its TUI starts, and the
    /// daemon runs the hooks: daemon -> TUI -> pane shell is still one agent.
    #[test]
    fn codex_daemon_under_its_own_tui_is_not_nested() {
        let t = table(&[
            (10, 1, "-zsh"),
            (20, 10, "codex"),
            (30, 20, "/u/.codex/packages/app-server-daemon/releases/0.160.0/bin/codex"),
        ]);
        assert!(!nested_in_table(&t, 30, 10));
    }

    /// Volta's shims spawn the real tool instead of exec'ing it, keeping argv0.
    #[test]
    fn a_shim_that_spawns_the_real_agent_is_one_agent() {
        let claude = table(&[(10, 1, "-zsh"), (20, 10, "claude"), (30, 20, "claude")]);
        assert!(!nested_in_table(&claude, 30, 10));
        let codex = table(&[
            (10, 1, "-zsh"),
            (20, 10, "codex"),
            (30, 20, "node"),
            (40, 30, "/v/vendor/aarch64-apple-darwin/codex/codex"),
        ]);
        assert!(!nested_in_table(&codex, 40, 10));
    }

    #[test]
    fn an_agent_launched_through_a_tool_shell_is_nested_even_with_the_same_name() {
        let t = table(&[
            (10, 1, "-zsh"),
            (20, 10, "codex"),
            (30, 20, "/bin/zsh"),
            (40, 30, "codex"),
        ]);
        assert!(nested_in_table(&t, 40, 10));
    }

    /// A tmux pane hangs off the tmux server, not off the tab's shell: the walk
    /// never reaches the pane and must accept rather than blame.
    #[test]
    fn agent_outside_the_pane_tree_is_accepted() {
        let t = table(&[(10, 1, "-zsh"), (99, 1, "tmux"), (20, 99, "claude")]);
        assert!(!nested_in_table(&t, 20, 10));
    }

    #[test]
    fn an_agent_launched_by_a_pane_that_is_the_agent_is_nested() {
        let t = table(&[(10, 1, "claude"), (20, 10, "zsh"), (30, 20, "codex")]);
        assert!(nested_in_table(&t, 30, 10));
        assert!(!nested_in_table(&t, 20, 10), "the root agent's own tool shell");
    }

    /// An editor the tab opened, Claude's background daemon, a detached run:
    /// each climbs to init without passing the tab's shell.
    #[test]
    fn agent_outside_the_tab_is_rejected() {
        let editor = table(&[
            (10, 1, "-zsh"),
            (100, 1, "/Applications/Cursor.app/Contents/MacOS/Cursor"),
            (150, 100, "Cursor Helper"),
            (200, 150, "/bin/zsh"),
            (300, 200, "claude"),
        ]);
        assert!(nested_in_table(&editor, 300, 10));
        let detached = table(&[(10, 1, "-zsh"), (300, 1, "claude")]);
        assert!(nested_in_table(&detached, 300, 10));
        let screen = table(&[(10, 1, "-zsh"), (99, 1, "SCREEN"), (20, 99, "zsh"), (30, 20, "codex")]);
        assert!(!nested_in_table(&screen, 30, 10));
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
