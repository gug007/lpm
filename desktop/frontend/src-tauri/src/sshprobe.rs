// Detect gateway-style SSH endpoints where the exec channel and the interactive
// pty land in different user/home namespaces. statusfwd binds the status socket
// under the EXEC channel's `$HOME`, while the terminal expands LPM_SOCKET_PATH in
// its PTY login shell; if the two `$HOME`s differ (e.g. dev@gateway vs
// root@container on a dstack "wormhole"), the terminal's socket path doesn't
// exist and notifications die silently. Nothing bridges the namespaces — the only
// remedy is to detect the split over a pty channel and warn the user.
use crate::config::{self, SshSettings};
use std::process::Command;
use std::time::Duration;

const PROBE_TIMEOUT: Duration = Duration::from_secs(12);

// Split so the joined marker `@@lpm-home:` never appears verbatim in the probe
// script — a forced pty echoes the command line back, and a contiguous marker in
// that echo would be mistaken for real output.
const MARKER_HEAD: &str = "@@lpm-";
const MARKER_MID: &str = "home:";
const MARKER_TAIL: &str = "@@";

/// `printf`s `$HOME` wrapped in the marker pair. The adjacent string literals
/// (`"@@lpm-""home:…"`) keep the joined marker out of the script text while the
/// remote shell concatenates them back into the real format at runtime.
fn probe_script() -> String {
    let printf = format!("printf \"{MARKER_HEAD}\"\"{MARKER_MID}%s{MARKER_TAIL}\" \"$HOME\"");
    format!("bash -lc {}", config::shell_quote(&printf))
}

/// argv for `ssh` (no leading program) that runs `probe_script` over a FORCED pty.
/// Two `-t` total (one prepended here, one already inside `ssh_args`) make sshd
/// allocate a pty even though `run_with_timeout` nulls stdin, so the probe lands
/// in the same namespace as an interactive terminal spawn. The script is the final
/// element, after `ssh_args`' trailing `user@host`.
pub fn pty_probe_argv(ssh: &SshSettings) -> Vec<String> {
    let mut argv = vec!["-t".to_string()];
    argv.extend(config::ssh_args(ssh));
    argv.push(probe_script());
    argv
}

/// First `/`-prefixed payload found between the marker pair. Scans every
/// occurrence so command echo or an unsubstituted `%s` template (neither starts
/// with `/`) is skipped in favor of the real absolute home. None when no marker
/// pair yields an absolute path.
pub fn parse_pty_home(output: &[u8]) -> Option<String> {
    let text = String::from_utf8_lossy(output).replace('\r', "");
    let start = format!("{MARKER_HEAD}{MARKER_MID}");
    let mut rest = text.as_str();
    while let Some(i) = rest.find(&start) {
        let after = &rest[i + start.len()..];
        let Some(j) = after.find(MARKER_TAIL) else {
            break;
        };
        let payload = &after[..j];
        if payload.starts_with('/') {
            return Some(payload.to_string());
        }
        rest = &after[j + MARKER_TAIL.len()..];
    }
    None
}

/// Resolve the remote `$HOME` as seen from a pty session, or None on failure/timeout.
pub fn probe_pty_home(ssh: &SshSettings) -> Option<String> {
    let mut cmd = Command::new("ssh");
    cmd.args(pty_probe_argv(ssh));
    let out = crate::statusfwd::run_with_timeout(cmd, PROBE_TIMEOUT)?;
    parse_pty_home(&out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ssh() -> SshSettings {
        SshSettings {
            host: "host".into(),
            user: "dev".into(),
            port: 0,
            key: String::new(),
            dir: String::new(),
        }
    }

    fn joined_marker() -> String {
        format!("{MARKER_HEAD}{MARKER_MID}")
    }

    #[test]
    fn probe_argv_forces_pty_and_ends_with_script() {
        let argv = pty_probe_argv(&ssh());
        let dest = argv
            .iter()
            .position(|a| a == "dev@host")
            .expect("destination missing");
        let tees = argv[..dest].iter().filter(|a| a.as_str() == "-t").count();
        assert_eq!(tees, 2, "need two -t before destination: {argv:?}");
        assert!(dest < argv.len() - 1, "destination must precede the script");
        let script = argv.last().unwrap();
        assert!(script.starts_with("bash -lc "), "script should be last: {script}");
    }

    #[test]
    fn probe_script_hides_the_joined_marker() {
        let script = probe_script();
        assert!(
            !script.contains(&joined_marker()),
            "joined marker leaked into script text: {script}"
        );
        // The pieces are still present, just not contiguous.
        assert!(script.contains(MARKER_HEAD) && script.contains(MARKER_MID));
    }

    #[test]
    fn parse_extracts_home_from_clean_output() {
        let out = format!("{}/home/dev{}", joined_marker(), MARKER_TAIL);
        assert_eq!(parse_pty_home(out.as_bytes()).as_deref(), Some("/home/dev"));
    }

    #[test]
    fn parse_strips_cr_and_ignores_surrounding_noise() {
        let out = format!("motd\r\nnoise{}/root{}tail\r\n", joined_marker(), MARKER_TAIL);
        assert_eq!(parse_pty_home(out.as_bytes()).as_deref(), Some("/root"));
    }

    #[test]
    fn parse_skips_echoed_template_and_picks_real_path() {
        let out = format!(
            "{marker}%s{tail}\n{marker}/home/dev{tail}\n",
            marker = joined_marker(),
            tail = MARKER_TAIL
        );
        assert_eq!(parse_pty_home(out.as_bytes()).as_deref(), Some("/home/dev"));
    }

    #[test]
    fn parse_none_without_marker_or_absolute_payload() {
        assert_eq!(parse_pty_home(b"nothing here at all"), None);
        let relative = format!("{}notabspath{}", joined_marker(), MARKER_TAIL);
        assert_eq!(parse_pty_home(relative.as_bytes()), None);
    }
}
