// What a pane is currently doing: the foreground process's name and working
// directory. tmux answered this from `#{pane_current_command}` and
// `#{pane_current_path}`, which `lpm project` renders per pane.
//
// Both lookups are batched over every pid at once — a session's panes are
// queried together, and one process-table scan is much cheaper than one per
// pane. Linux reads /proc directly; macOS has no /proc, so it goes through the
// tools tmux itself shells out to. Windows names processes from a Toolhelp
// snapshot, but another process's cwd lives in its PEB and is not read, so a
// pane's cwd is simply unknown there.
use std::collections::HashMap;

/// pid -> command name (the basename, as tmux reported it).
pub fn commands(pids: &[i32]) -> HashMap<i32, String> {
    let mut out = HashMap::new();
    if pids.is_empty() {
        return out;
    }
    #[cfg(target_os = "linux")]
    for &pid in pids {
        if let Ok(comm) = std::fs::read_to_string(format!("/proc/{pid}/comm")) {
            let comm = comm.trim();
            let name = node_script(pid, comm).unwrap_or_else(|| comm.to_string());
            out.insert(pid, name);
        }
    }
    #[cfg(all(unix, not(target_os = "linux")))]
    {
        let list = join(pids);
        if let Ok(o) = crate::osproc::command("ps")
            .args(["-o", "pid=,comm=", "-p", &list])
            .output()
        {
            for line in String::from_utf8_lossy(&o.stdout).lines() {
                let line = line.trim();
                let Some((pid, comm)) = line.split_once(char::is_whitespace) else {
                    continue;
                };
                if let Ok(pid) = pid.trim().parse::<i32>() {
                    out.insert(pid, basename(comm.trim()));
                }
            }
        }
    }
    #[cfg(windows)]
    for proc in crate::procwin::snapshot() {
        if pids.contains(&(proc.pid as i32)) {
            out.insert(proc.pid as i32, proc.name);
        }
    }
    out
}

/// pid -> current working directory. Empty for a pid whose cwd can't be read,
/// which is normal for a process that exited between the two calls.
pub fn cwds(pids: &[i32]) -> HashMap<i32, String> {
    #[cfg_attr(windows, allow(unused_mut))]
    let mut out = HashMap::new();
    if pids.is_empty() {
        return out;
    }
    #[cfg(target_os = "linux")]
    for &pid in pids {
        if let Ok(path) = std::fs::read_link(format!("/proc/{pid}/cwd")) {
            out.insert(pid, path.to_string_lossy().into_owned());
        }
    }
    #[cfg(all(unix, not(target_os = "linux")))]
    {
        // -F emits one field per line, tagged by its first character: `p` opens
        // a new process's block, `n` is the path. -a intersects the filters so
        // only the cwd descriptor is reported.
        let list = join(pids);
        let Ok(o) = crate::osproc::command("lsof")
            .args(["-a", "-d", "cwd", "-Fpn", "-p", &list])
            .output()
        else {
            return out;
        };
        let mut current: Option<i32> = None;
        for line in String::from_utf8_lossy(&o.stdout).lines() {
            match line.as_bytes().first() {
                Some(b'p') => current = line[1..].trim().parse().ok(),
                Some(b'n') => {
                    if let Some(pid) = current {
                        out.insert(pid, line[1..].to_string());
                    }
                }
                _ => {}
            }
        }
    }
    out
}

/// A CLI installed from npm (Codex, Gemini and others) is a
/// `#!/usr/bin/env node` script, so its process is named `node`; the script it
/// was started as names the program.
#[cfg(target_os = "linux")]
fn node_script(pid: i32, comm: &str) -> Option<String> {
    if !matches!(comm, "node" | "nodejs") {
        return None;
    }
    let cmdline = std::fs::read(format!("/proc/{pid}/cmdline")).ok()?;
    shebang_command(&cmdline, |path| std::path::Path::new(path).is_file())
}

/// The command a shebang launch ran, from the interpreter's NUL-separated
/// argv: the shell execs a command found on PATH by its absolute path, which
/// the kernel hands the interpreter as its first non-option argument. A
/// `node server.js` or `node -e …` started by hand stays node.
#[cfg(any(target_os = "linux", test))]
fn shebang_command(cmdline: &[u8], is_file: impl Fn(&str) -> bool) -> Option<String> {
    let script = cmdline
        .split(|b| *b == 0)
        .skip(1)
        .find(|arg| !arg.is_empty() && !arg.starts_with(b"-"))?;
    let script = std::str::from_utf8(script).ok()?;
    let name = script.strip_prefix('/')?.rsplit('/').next()?;
    (!name.is_empty() && !name.contains('.') && is_file(script)).then(|| name.to_string())
}

#[cfg(all(unix, not(target_os = "linux")))]
fn join(pids: &[i32]) -> String {
    pids.iter()
        .map(i32::to_string)
        .collect::<Vec<_>>()
        .join(",")
}

#[cfg(all(unix, not(target_os = "linux")))]
fn basename(path: &str) -> String {
    path.rsplit('/').next().unwrap_or(path).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn any_file(_: &str) -> bool {
        true
    }

    #[test]
    fn an_npm_cli_is_named_by_its_script() {
        assert_eq!(
            shebang_command(b"node\0/usr/local/bin/codex\0exec\0", any_file),
            Some("codex".into())
        );
        assert_eq!(
            shebang_command(
                b"node\0--no-warnings\0/home/dev/.nvm/versions/node/v22/bin/gemini\0",
                any_file
            ),
            Some("gemini".into())
        );
    }

    #[test]
    fn plain_node_stays_node() {
        assert_eq!(shebang_command(b"node\0", any_file), None);
        assert_eq!(shebang_command(b"node\0server.js\0", any_file), None);
        assert_eq!(
            shebang_command(b"node\0/srv/app/server.js\0", any_file),
            None
        );
        assert_eq!(
            shebang_command(b"node\0-e\0setInterval(f)\0", any_file),
            None
        );
        assert_eq!(
            shebang_command(b"node\0/usr/local/bin/codex\0", |_| false),
            None
        );
    }
}
