// What a pane is currently doing: the foreground process's name and working
// directory. tmux answered this from `#{pane_current_command}` and
// `#{pane_current_path}`, which `lpm project` renders per pane.
//
// Both lookups are batched over every pid at once — a session's panes are
// queried together, and one process-table scan is much cheaper than one per
// pane. Linux reads /proc directly; macOS has no /proc, so it goes through the
// tools tmux itself shells out to.
use std::collections::HashMap;
#[cfg(not(target_os = "linux"))]
use std::process::Command;

/// pid -> command name (the basename, as tmux reported it).
pub fn commands(pids: &[i32]) -> HashMap<i32, String> {
    let mut out = HashMap::new();
    if pids.is_empty() {
        return out;
    }
    #[cfg(target_os = "linux")]
    for &pid in pids {
        if let Ok(comm) = std::fs::read_to_string(format!("/proc/{pid}/comm")) {
            out.insert(pid, comm.trim().to_string());
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        let list = join(pids);
        if let Ok(o) = Command::new("ps").args(["-o", "pid=,comm=", "-p", &list]).output() {
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
    out
}

/// pid -> current working directory. Empty for a pid whose cwd can't be read,
/// which is normal for a process that exited between the two calls.
pub fn cwds(pids: &[i32]) -> HashMap<i32, String> {
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
    #[cfg(not(target_os = "linux"))]
    {
        // -F emits one field per line, tagged by its first character: `p` opens
        // a new process's block, `n` is the path. -a intersects the filters so
        // only the cwd descriptor is reported.
        let list = join(pids);
        let Ok(o) = Command::new("lsof")
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

#[cfg(not(target_os = "linux"))]
fn join(pids: &[i32]) -> String {
    pids.iter()
        .map(i32::to_string)
        .collect::<Vec<_>>()
        .join(",")
}

#[cfg(not(target_os = "linux"))]
fn basename(path: &str) -> String {
    path.rsplit('/').next().unwrap_or(path).to_string()
}
