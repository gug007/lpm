// Whether the shell of a Windows terminal is back at its prompt. Unix asks the
// tty which job is in front of the shell; Windows has no such job, so a terminal
// is at its prompt when only shells run on its console. The process tree can't
// say: an npm-installed agent starts from a `#!/bin/sh` shim, and MSYS execs
// that by replacing the process, which leaves the agent no parent under the
// shell (panestop.rs).
//
// The rule is a plain function so it is tested everywhere; only the look at the
// processes is Windows-only.
use crate::panestop::console_runs_job;
use crate::procwin::{is_shell, Proc};

/// Shells a plain terminal can be set to, besides the ones `is_shell` knows.
const WINDOWS_SHELLS: [&str; 3] = ["pwsh", "powershell", "cmd"];

/// Runs a distro's shell, whose jobs Windows doesn't see.
const WSL: &str = "wsl";

fn runs_commands(name: &str) -> bool {
    is_shell(name) || WINDOWS_SHELLS.iter().any(|s| name.eq_ignore_ascii_case(s))
}

/// Whether nothing but shells runs on the console of the terminal whose shell is
/// `shell`; `host_of` names the host of a process's console. None when that
/// can't be told: the shell is gone, has no console, or is a WSL distro's.
pub fn at_prompt(
    table: &[Proc],
    shell: u32,
    host_of: impl Fn(u32) -> Option<u32>,
) -> Option<bool> {
    let own = table.iter().find(|p| p.pid == shell)?;
    if own.name.eq_ignore_ascii_case(WSL) {
        return None;
    }
    let host = host_of(shell)?;
    let idle = |p: &Proc| p.pid == shell || runs_commands(&p.name);
    Some(!console_runs_job(table, host, idle, host_of))
}

/// `at_prompt` from a look at every process now.
#[cfg(windows)]
pub fn at_prompt_now(shell: u32) -> Option<bool> {
    let table = crate::procwin::snapshot();
    at_prompt(&table, shell, crate::procwin::console_host)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    /// (pid, parent, name, console host) rows.
    fn told(rows: &[(u32, u32, &str, u32)], shell: u32) -> Option<bool> {
        let table: Vec<Proc> = rows
            .iter()
            .map(|&(pid, ppid, name, _)| Proc { pid, ppid, name: name.to_string() })
            .collect();
        let hosts: HashMap<u32, u32> = rows.iter().map(|r| (r.0, r.3)).filter(|r| r.1 > 0).collect();
        at_prompt(&table, shell, |pid| hosts.get(&pid).copied())
    }

    /// lpm starts Git's bin\bash.exe, which runs the real bash as its child.
    const GIT_BASH: [(u32, u32, &str, u32); 3] =
        [(10, 1, "bash", 30), (11, 10, "bash", 30), (30, 1, "OpenConsole", 0)];

    #[test]
    fn git_bash_with_nothing_running_is_at_its_prompt() {
        assert_eq!(told(&GIT_BASH, 10), Some(true));
    }

    #[test]
    fn a_program_under_the_shell_is_in_front_of_it() {
        let mut rows = GIT_BASH.to_vec();
        rows.extend([(12, 11, "bash", 30), (13, 12, "claude", 30)]);
        assert_eq!(told(&rows, 10), Some(false));
    }

    #[test]
    fn an_npm_installed_agent_counts_though_no_parent_of_it_is_left() {
        let mut rows = GIT_BASH.to_vec();
        rows.extend([(20, 99, "sh", 30), (21, 98, "node", 30)]);
        assert_eq!(told(&rows, 10), Some(false));
    }

    #[test]
    fn another_terminals_program_or_one_off_the_console_doesnt_count() {
        let mut rows = GIT_BASH.to_vec();
        rows.extend([(40, 1, "node", 31), (41, 11, "Code", 0)]);
        assert_eq!(told(&rows, 10), Some(true));
    }

    #[test]
    fn a_chosen_windows_shell_is_not_its_own_job() {
        for shell in ["pwsh", "powershell", "cmd"] {
            let idle = [(10, 1, shell, 30), (30, 1, "conhost", 0)];
            assert_eq!(told(&idle, 10), Some(true), "{shell}");
            let busy = [idle[0], idle[1], (12, 10, "node", 30)];
            assert_eq!(told(&busy, 10), Some(false), "{shell}");
        }
    }

    #[test]
    fn a_distro_a_gone_shell_and_one_without_a_console_cant_be_told() {
        assert_eq!(told(&[(10, 1, "wsl", 30)], 10), None);
        assert_eq!(told(&GIT_BASH, 99), None);
        assert_eq!(told(&[(10, 1, "bash", 0)], 10), None);
    }

    #[cfg(windows)]
    #[test]
    fn a_real_git_bash_is_at_its_prompt_only_between_commands() {
        use crate::sessionpane::Pane;
        use crate::sessionproto::PaneSpec;
        use std::time::{Duration, Instant};

        let until = |done: &dyn Fn() -> bool| {
            let deadline = Instant::now() + Duration::from_secs(60);
            while !done() && Instant::now() < deadline {
                std::thread::sleep(Duration::from_millis(200));
            }
            done()
        };
        let dir = tempfile::tempdir().unwrap();
        let shim = "#!/bin/sh\nexec ping -n 120 127.0.0.1\n";
        std::fs::write(dir.path().join("shim"), shim).unwrap();
        let spec = PaneSpec {
            service: "shim".into(),
            command: String::new(),
            dir: dir.path().to_string_lossy().into_owned(),
        };
        let pane = Pane::open("shellprompt".into(), &spec).unwrap();
        let shell = pane.pid as u32;
        assert!(until(&|| pane.capture(50).contains("$ ")), "no prompt: {}", pane.capture(50));
        assert!(until(&|| at_prompt_now(shell) == Some(true)), "idle");
        pane.send("./shim").unwrap();
        assert!(until(&|| pane.capture(50).contains("127.0.0.1")), "the shim didn't run");
        assert_eq!(at_prompt_now(shell), Some(false), "running");
        pane.type_ctrl_c().unwrap();
        assert!(until(&|| at_prompt_now(shell) == Some(true)), "stopped");
        pane.close();
    }
}
