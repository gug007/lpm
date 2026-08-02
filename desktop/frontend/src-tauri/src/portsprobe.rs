// Which local process holds which TCP port. The question is the same on every
// platform; the tool that answers it is not — `lsof` on macOS, `ss` (iproute2)
// on Linux, where lsof is frequently absent on minimal server and container
// images. ports.rs consumes only the two functions at the bottom.
//
// Both parsers are compiled and tested everywhere, so the Linux `ss` format stays
// covered by the macOS test run; only the command dispatch is platform-gated.
//
// SPAWN COST: these run on the service-ports poll path, so availability is probed
// once per process (OnceLock) rather than shelling out to `command -v` per call.

use std::collections::HashMap;
use std::process::Command;
#[cfg(not(target_os = "macos"))]
use std::sync::OnceLock;

#[derive(Clone, Default)]
pub struct Holder {
    pub pid: i64,
    pub command: String,
}

/// Trailing `:port` of a listen address. Handles `0.0.0.0:3000`, `[::]:8080`,
/// `*:3000` and `ss`'s interface-scoped `127.0.0.53%lo:53`.
fn port_from_addr(addr: &str) -> Option<i64> {
    addr.rsplit_once(':')
        .and_then(|(_, p)| p.parse::<i64>().ok())
}

// ---- lsof (macOS, and Linux hosts that have it) -----------------------------

pub(crate) fn parse_lsof(s: &str) -> HashMap<i64, Holder> {
    let mut result = HashMap::new();
    let mut current = Holder::default();
    for line in s.split('\n') {
        if line.len() < 2 {
            continue;
        }
        let (tag, rest) = (line.as_bytes()[0], &line[1..]);
        match tag {
            b'p' => {
                if let Ok(pid) = rest.parse::<i64>() {
                    current = Holder {
                        pid,
                        command: String::new(),
                    };
                }
            }
            b'c' => current.command = rest.to_string(),
            b'n' => {
                if let Some(port) = port_from_addr(rest) {
                    if current.pid > 0 {
                        result.entry(port).or_insert_with(|| current.clone());
                    }
                }
            }
            _ => {}
        }
    }
    result
}

/// All (pid, port) pairs currently in TCP LISTEN, regardless of which port —
/// one call we then attribute to panes by process ancestry. A process may
/// listen on several ports, so the same pid can appear more than once.
pub(crate) fn parse_lsof_listeners(s: &str) -> Vec<(i64, i64)> {
    let mut out = Vec::new();
    let mut pid = 0i64;
    for line in s.split('\n') {
        if line.len() < 2 {
            continue;
        }
        let (tag, rest) = (line.as_bytes()[0], &line[1..]);
        match tag {
            b'p' => pid = rest.parse().unwrap_or(0),
            b'n' => {
                if pid > 0 {
                    if let Some(port) = port_from_addr(rest) {
                        out.push((pid, port));
                    }
                }
            }
            _ => {}
        }
    }
    out
}

fn lsof_listeners() -> Vec<(i64, i64)> {
    match Command::new("lsof")
        .args(["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpn"])
        .output()
    {
        Ok(o) if !o.stdout.is_empty() => parse_lsof_listeners(&String::from_utf8_lossy(&o.stdout)),
        _ => Vec::new(),
    }
}

fn lsof_holders(ports: &[i64]) -> HashMap<i64, Holder> {
    let mut args: Vec<String> = vec!["-nP".into()];
    for p in ports {
        args.push(format!("-iTCP:{p}"));
    }
    args.push("-sTCP:LISTEN".into());
    args.push("-Fpcn".into());
    // lsof exits 1 when ANY -i filter has no match even if others matched —
    // ignore the status and parse whatever stdout we got.
    match Command::new("lsof").args(&args).output() {
        Ok(o) if !o.stdout.is_empty() => parse_lsof(&String::from_utf8_lossy(&o.stdout)),
        _ => HashMap::new(),
    }
}

// ---- ss (Linux) -------------------------------------------------------------

/// One `ss -lntpH` row: `LISTEN 0 511 0.0.0.0:3000 0.0.0.0:* users:(("node",pid=1,fd=23))`.
/// Local address is whitespace field 4. The process column is absent entirely
/// when iproute2 can't see the owner (another user's socket without root), which
/// is a holder we simply can't name — same outcome lsof gives in that case.
#[cfg(any(not(target_os = "macos"), test))]
fn parse_ss_row(line: &str) -> Option<(Holder, i64)> {
    let fields: Vec<&str> = line.split_whitespace().collect();
    if fields.len() < 4 || fields[0] != "LISTEN" {
        return None;
    }
    let port = port_from_addr(fields[3])?;

    // Parse the FIRST users:(("name",pid=N,...)) entry off the raw line rather
    // than a whitespace field — a process name may itself contain spaces.
    let holder = line
        .split_once("users:((\"")
        .and_then(|(_, rest)| rest.split_once('"'))
        .map(|(name, after)| {
            let pid = after
                .split_once("pid=")
                .and_then(|(_, p)| {
                    let end = p.find(|c: char| !c.is_ascii_digit()).unwrap_or(p.len());
                    p[..end].parse::<i64>().ok()
                })
                .unwrap_or(0);
            Holder {
                pid,
                command: name.to_string(),
            }
        })
        .unwrap_or_default();
    Some((holder, port))
}

#[cfg(any(not(target_os = "macos"), test))]
pub(crate) fn parse_ss(s: &str) -> HashMap<i64, Holder> {
    let mut result = HashMap::new();
    for line in s.split('\n') {
        if let Some((holder, port)) = parse_ss_row(line) {
            if holder.pid > 0 {
                result.entry(port).or_insert(holder);
            }
        }
    }
    result
}

#[cfg(any(not(target_os = "macos"), test))]
pub(crate) fn parse_ss_listeners(s: &str) -> Vec<(i64, i64)> {
    let mut out = Vec::new();
    for line in s.split('\n') {
        if let Some((holder, port)) = parse_ss_row(line) {
            if holder.pid > 0 {
                out.push((holder.pid, port));
            }
        }
    }
    out
}

/// `-H` (header-less) landed in iproute2 4.x; every distro lpm can host on has
/// it. Probed once because these run on a poll loop.
#[cfg(not(target_os = "macos"))]
fn have_ss() -> bool {
    static HAVE: OnceLock<bool> = OnceLock::new();
    *HAVE.get_or_init(|| {
        Command::new("ss")
            .arg("-V")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    })
}

#[cfg(not(target_os = "macos"))]
fn ss_output() -> Option<String> {
    let out = Command::new("ss").args(["-lntpH"]).output().ok()?;
    Some(String::from_utf8_lossy(&out.stdout).into_owned())
}

// ---- platform dispatch ------------------------------------------------------

pub fn listening_ports() -> Vec<(i64, i64)> {
    #[cfg(target_os = "macos")]
    {
        lsof_listeners()
    }
    #[cfg(not(target_os = "macos"))]
    {
        if have_ss() {
            return ss_output()
                .map(|o| parse_ss_listeners(&o))
                .unwrap_or_default();
        }
        lsof_listeners()
    }
}

/// Holders for the given ports. `ss` has no per-port filter worth the round trip,
/// so on Linux we list once and select — the port set is tiny.
pub fn lookup_holders(ports: &[i64]) -> HashMap<i64, Holder> {
    if ports.is_empty() {
        return HashMap::new();
    }
    #[cfg(target_os = "macos")]
    {
        lsof_holders(ports)
    }
    #[cfg(not(target_os = "macos"))]
    {
        if have_ss() {
            let Some(out) = ss_output() else {
                return HashMap::new();
            };
            let mut all = parse_ss(&out);
            return ports.iter().filter_map(|p| all.remove_entry(p)).collect();
        }
        lsof_holders(ports)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SS_SAMPLE: &str = concat!(
        "LISTEN 0      511            0.0.0.0:3000       0.0.0.0:*    users:((\"node\",pid=1234,fd=23))\n",
        "LISTEN 0      4096     127.0.0.53%lo:53         0.0.0.0:*    users:((\"systemd-resolve\",pid=700,fd=14))\n",
        "LISTEN 0      511               [::]:8080          [::]:*    users:((\"node\",pid=1234,fd=24))\n",
        "LISTEN 0      128            0.0.0.0:22         0.0.0.0:*\n",
    );

    #[test]
    fn parses_ss_holders() {
        let holders = parse_ss(SS_SAMPLE);
        assert_eq!(holders[&3000].pid, 1234);
        assert_eq!(holders[&3000].command, "node");
        assert_eq!(holders[&53].command, "systemd-resolve");
        // ipv6 [::]:8080 must resolve to 8080, not the bracketed address
        assert_eq!(holders[&8080].pid, 1234);
        // no users:(...) column — unnamed holder is dropped, not recorded as pid 0
        assert!(!holders.contains_key(&22));
    }

    #[test]
    fn parses_ss_listeners_with_repeated_pid() {
        let mut pairs = parse_ss_listeners(SS_SAMPLE);
        pairs.sort();
        assert_eq!(pairs, vec![(700, 53), (1234, 3000), (1234, 8080)]);
    }

    // A process name with a space would break naive whitespace-field parsing.
    #[test]
    fn parses_ss_process_name_with_space() {
        let line = "LISTEN 0 511 0.0.0.0:9999 0.0.0.0:* users:((\"my app\",pid=42,fd=3))";
        let holders = parse_ss(line);
        assert_eq!(holders[&9999].command, "my app");
        assert_eq!(holders[&9999].pid, 42);
    }

    // SO_REUSEPORT: several processes share one port; first entry wins, matching
    // the lsof path's or_insert semantics.
    #[test]
    fn ss_multiple_holders_keeps_first() {
        let line =
            "LISTEN 0 511 0.0.0.0:80 0.0.0.0:* users:((\"a\",pid=1,fd=3),(\"b\",pid=2,fd=4))";
        assert_eq!(parse_ss(line)[&80].pid, 1);
    }

    #[test]
    fn ignores_non_listen_and_header_rows() {
        let s = "State  Recv-Q Send-Q Local Address:Port\nESTAB 0 0 10.0.0.1:22 10.0.0.2:5000\n";
        assert!(parse_ss(s).is_empty());
        assert!(parse_ss_listeners(s).is_empty());
    }

    #[test]
    fn parses_lsof_fields() {
        let s = "p123\ncnode\nn*:3000\nn127.0.0.1:4000\np456\ncpostgres\nn*:5432\n";
        let holders = parse_lsof(s);
        assert_eq!(holders[&3000].command, "node");
        assert_eq!(holders[&5432].pid, 456);
        let mut pairs = parse_lsof_listeners(s);
        pairs.sort();
        assert_eq!(pairs, vec![(123, 3000), (123, 4000), (456, 5432)]);
    }
}
