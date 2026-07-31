//! Bringing a Linux host online from the Mac, over SSH.
//!
//! The manual path is: download a tarball on the server, run the installer, run
//! `lpm pair`, copy the invite, paste it here. Every step is somewhere the user
//! can mistype something, and the last one asks them to move a secret by hand.
//! Since they already have SSH to the machine — that is how it got set up — lpm
//! can just do all of it: install if needed, ask the host for an invite, and
//! consume that invite itself over a forward.
//!
//! What the user provides is `user@host`. Nothing about the server changes that
//! they'd have to undo: the peer server stays bound to loopback, and the only way
//! in remains SSH.

use serde_json::Value;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use crate::peertunnel::{push_target_args, ssh_common_args, SshTarget, Tunnel};

/// Where a host fetches its own copy. The repo is public, so the server pulls the
/// release directly rather than the Mac shipping 16MB up an SSH channel.
const RELEASE_URL: &str =
    "https://github.com/gug007/lpm/releases/latest/download/lpm-host-linux-amd64.tar.gz";

/// Generous, because it covers the whole remote install: curl, tar, an apt run
/// that fetches a GTK/WebKit runtime on a cold machine, and the installer's own
/// wait for the app to answer. Killing this only kills the local ssh — apt keeps
/// going on the host — so an over-tight deadline leaves a half-configured box
/// behind and reports a timeout that wasn't one.
const REMOTE_TIMEOUT: Duration = Duration::from_secs(900);
const TUNNEL_WAIT: Duration = Duration::from_secs(30);

/// Things lpm shells out to on a host, rather than lpm's own dependencies. The
/// installer apt-gets these plus iproute2, which is not checked here because the
/// app falls back to lsof without it.
///
/// Only tmux is fatal — the app will not render a project at all without it — so
/// it is the only one that blocks pairing. git missing is a host that works and
/// has no diffs, which is not worth refusing to connect to.
const REQUIRED_TOOLS: [&str; 2] = ["tmux", "git"];
const FATAL_TOOL: &str = "tmux";

/// The probe answers in sentinel lines rather than bare names: `ssh_capture`
/// takes whatever the login shell wrote to stdout, and an rc file or motd that
/// prints the word "git" would otherwise be read back as a missing program.
const MISSING_MARK: &str = "LPM_MISSING:";

fn ssh_base_args(target: &SshTarget) -> Vec<String> {
    let mut args = ssh_common_args();
    push_target_args(&mut args, target);
    args
}

/// Run a command on the host and return its stdout. stderr is folded into the
/// error because ssh's own failures (auth refused, unknown host) arrive there and
/// are the ones worth showing a user verbatim.
pub fn ssh_capture(target: &SshTarget, command: &str) -> Result<String, String> {
    let mut args = ssh_base_args(target);
    args.push(command.to_string());
    let out = Command::new("ssh")
        .args(&args)
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("could not run ssh: {e}"))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if err.is_empty() {
            format!("`{command}` failed on the host")
        } else {
            err
        });
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Can we reach this machine at all? Separated from everything else so the first
/// failure a user sees is "I can't SSH there", not a confusing later step.
pub fn probe(target: &SshTarget) -> Result<(), String> {
    ssh_capture(target, "true").map(|_| ())
}

pub fn is_installed(target: &SshTarget) -> bool {
    ssh_capture(target, "command -v lpm >/dev/null 2>&1 && echo yes")
        .map(|s| s.trim() == "yes")
        .unwrap_or(false)
}

/// Run something on the host as root, escalating only when the login isn't
/// already root — `ubuntu@`, `debian@` and friends are the normal way a cloud VM
/// is handed over.
///
/// `sudo -n` for the same reason ssh runs with `BatchMode=yes`: stdin is closed
/// here, so a sudo that decided to ask for a password would hang until the
/// timeout with the prompt going nowhere. Non-interactive turns that into an
/// immediate, readable failure.
///
/// `-H` is not decoration. The host service runs as root, and everything lpm
/// keeps — including the control socket the CLI talks to — lives under that
/// account's `~/.lpm`, in a directory only root can even traverse. Without `-H`,
/// sudo can leave `$HOME` pointing at the login user, and a command that runs
/// perfectly as root then looks in the wrong home and reports that the app isn't
/// running.
fn as_root(command: &str) -> String {
    format!("if [ \"$(id -u)\" = 0 ]; then {command}; else sudo -n -H {command}; fi")
}

/// Fetch, unpack, install. The installer needs root.
fn install_script() -> String {
    format!(
        "set -e; tmp=$(mktemp -d); cd \"$tmp\"; \
         curl -fsSL {RELEASE_URL} -o lpm-host.tar.gz; \
         tar xzf lpm-host.tar.gz; cd lpm-host; {}",
        as_root("./install.sh")
    )
}

/// Tools the host needs before it can do anything, whether or not lpm itself is
/// installed. Services are tmux panes and the app refuses to render at all
/// without tmux on PATH, so a host missing it pairs successfully and then starts
/// nothing — with the Mac reporting its *own* tmux, which makes the UI look
/// healthy. Hosts installed before these joined the installer's dependency list
/// are in exactly that state, so check rather than assume.
fn tools_probe() -> String {
    REQUIRED_TOOLS
        .iter()
        .map(|t| format!("command -v {t} >/dev/null 2>&1 || printf '{MISSING_MARK}{t}\\n'"))
        .collect::<Vec<_>>()
        .join("; ")
}

/// Reading the probe's answer back. A probe that fails outright says nothing is
/// missing: this runs on the way to pairing, and a check that can't complete is
/// not a reason to refuse a host.
fn missing_tools(target: &SshTarget) -> Vec<String> {
    ssh_capture(target, &tools_probe())
        .map(|out| parse_missing(&out))
        .unwrap_or_default()
}

fn parse_missing(out: &str) -> Vec<String> {
    out.lines()
        .filter_map(|line| line.trim().strip_prefix(MISSING_MARK))
        .filter(|name| REQUIRED_TOOLS.contains(name))
        .map(str::to_string)
        .collect()
}

/// Only tmux stops a host from working at all. Refusing to pair over anything
/// else would lock out machines that are running fine today.
fn blocks_pairing(missing: &[String]) -> bool {
    missing.iter().any(|tool| tool == FATAL_TOOL)
}

fn missing_tools_error(missing: &[String]) -> String {
    format!(
        "the host is missing {} — install with: sudo apt-get install -y {}",
        missing.join(" and "),
        missing.join(" ")
    )
}

/// Fetch the published tarball on the host and run its installer. Deliberately
/// the same installer a person would run by hand — one install path, so this
/// can't drift into its own half-supported variant.
pub fn install(target: &SshTarget) -> Result<(), String> {
    let mut args = ssh_base_args(target);
    let script = install_script();
    args.push(script);
    let mut child = Command::new("ssh")
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("could not run ssh: {e}"))?;
    let deadline = Instant::now() + REMOTE_TIMEOUT;
    loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(status) if status.success() => return Ok(()),
            Some(_) => {
                let out = child.wait_with_output().map_err(|e| e.to_string())?;
                let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
                return Err(if err.is_empty() {
                    "the installer failed on the host".into()
                } else {
                    err
                });
            }
            None => {}
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            return Err("the installer timed out on the host".into());
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}

/// The invite a host mints for us: `lpm pair --json` is the same call a person
/// would make on the box, so there is one pairing path, not two.
#[derive(Debug)]
pub struct RemoteInvite {
    pub code: String,
    pub port: u16,
    pub fp: Option<String>,
}

/// Ask the host for an invite, as whoever can actually reach the running app.
///
/// The service normally runs as root, so a `ubuntu@` login cannot see its
/// control socket — root's `~/.lpm` isn't traversable — and gets back "lpm app is
/// not running" from a host that is running perfectly. Escalating unconditionally
/// would be wrong the other way, though: the unit can be pointed at another
/// account with a `User=` drop-in, and then root is the empty home.
///
/// So probe first with a command that has no side effects, and escalate only if
/// the login user can't reach the app. `lpm pair` mints a fresh code every time
/// it runs, so it has to run exactly once — which is why this isn't a `||`.
///
/// A root login never escalates, even when the probe fails: it is already the
/// account that would be escalated to, so `sudo` could only turn an accurate
/// "the app is not running" into a sudo error about a different problem.
fn invite_script() -> String {
    "if lpm connections >/dev/null 2>&1 || [ \"$(id -u)\" = 0 ]; then lpm pair --json; \
     else sudo -n -H lpm pair --json; fi"
        .to_string()
}

pub fn request_invite(target: &SshTarget) -> Result<RemoteInvite, String> {
    let raw = ssh_capture(target, &invite_script())?;
    parse_invite(&raw)
}

/// Split out from the SSH call so the parsing — including a host too old to know
/// `--json`, which answers with human text — is testable without a server.
pub fn parse_invite(raw: &str) -> Result<RemoteInvite, String> {
    let v: Value = serde_json::from_str(raw.trim()).map_err(|_| {
        "the host did not answer with an invite — it may be running an older lpm".to_string()
    })?;
    let code = v
        .get("code")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    if code.is_empty() {
        return Err("the host's invite had no pairing code".into());
    }
    let port = v.get("port").and_then(Value::as_u64).unwrap_or(0) as u16;
    if port == 0 {
        return Err("the host's invite had no port".into());
    }
    let fp = v
        .get("fp")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    Ok(RemoteInvite { code, port, fp })
}

/// Open a forward to the host's peer port and hold it open for the caller. The
/// pairing handshake needs a live endpoint before there is a peer entry to hang a
/// supervised tunnel off, so this one is short-lived and explicit.
pub fn open_pairing_tunnel(target: &SshTarget, remote_port: u16) -> Result<(Tunnel, u16), String> {
    let tunnel = Tunnel::new(target.clone(), remote_port);
    tunnel.start();
    match tunnel.wait_until_up(TUNNEL_WAIT, "could not forward the host's port over SSH") {
        Ok(port) => Ok((tunnel, port)),
        Err(e) => {
            tunnel.stop();
            Err(e)
        }
    }
}

/// The whole flow: reach the machine, make sure lpm is on it, ask it for an
/// invite, and consume that invite over a forward — then record the peer as
/// SSH-reached so its connection brings its own tunnel up from then on.
///
/// Pairing happens against `127.0.0.1:<forwarded>` because that is the only place
/// the host answers. The entry is rewritten afterwards to name the real machine:
/// what got stored otherwise would be a loopback address that means nothing on the
/// next launch, when the forward has a different local port.
pub fn add_host(
    hub: &crate::peerclient::PeerClientHub,
    target: &SshTarget,
    alias: &str,
    install_if_missing: bool,
) -> Result<Value, String> {
    if !target.is_set() {
        return Err("no host given".into());
    }
    probe(target)?;
    if !is_installed(target) {
        if !install_if_missing {
            return Err("lpm isn't installed on that machine yet".into());
        }
        install(target)?;
    }
    // Checked after the install rather than before it: a fresh install has just
    // apt-got these, so this only ever fires for a host that was set up earlier.
    // The probe reads the *login* user's PATH, which is not the one the app
    // resolves tools through, so it is the weaker evidence of the two — another
    // reason only the fatal one gets to stop us here.
    let missing = missing_tools(target);
    if blocks_pairing(&missing) {
        return Err(missing_tools_error(&missing));
    }
    let invite = request_invite(target)?;
    let (tunnel, local) = open_pairing_tunnel(target, invite.port)?;

    let paired = crate::peerclient::add_peer_blocking(
        hub,
        vec!["127.0.0.1".to_string()],
        local,
        invite.code.clone(),
        alias.to_string(),
        invite.fp.clone(),
    );
    // The short-lived pairing forward has done its job either way; the peer's own
    // supervised tunnel replaces it. Stopping it before returning keeps a failed
    // pairing from leaving an ssh process behind.
    tunnel.stop();
    let paired = paired?;

    let slug = paired
        .get("slug")
        .and_then(Value::as_str)
        .ok_or_else(|| "the host paired but did not say which slug it assigned".to_string())?
        .to_string();
    hub.set_peer_ssh(&slug, target, invite.port)?;
    Ok(paired)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn target() -> SshTarget {
        SshTarget {
            host: "example.test".into(),
            user: "root".into(),
            port: 0,
            key: String::new(),
        }
    }

    #[test]
    fn parses_a_host_invite() {
        let invite = parse_invite(r#"{"code":"AB12-CD34","port":8766,"fp":"deadbeef"}"#).unwrap();
        assert_eq!(invite.code, "AB12-CD34");
        assert_eq!(invite.port, 8766);
        assert_eq!(invite.fp.as_deref(), Some("deadbeef"));
    }

    // An unpinned host is legal (v1 invites): absent or empty must both mean "no
    // fingerprint", never Some("").
    #[test]
    fn an_absent_or_empty_fingerprint_is_none() {
        assert!(parse_invite(r#"{"code":"A","port":1}"#).unwrap().fp.is_none());
        assert!(parse_invite(r#"{"code":"A","port":1,"fp":""}"#)
            .unwrap()
            .fp
            .is_none());
    }

    // A host running an older lpm answers `lpm pair` with human text and doesn't
    // know --json. Say that, rather than failing on a JSON parse error.
    #[test]
    fn human_output_from_an_old_host_is_a_clear_error() {
        let err = parse_invite("lpm-pair:abc\n\nPaste that into Settings").unwrap_err();
        assert!(err.contains("older lpm"), "{err}");
    }

    #[test]
    fn an_invite_without_the_essentials_is_rejected() {
        assert!(parse_invite(r#"{"port":8766}"#).is_err());
        assert!(parse_invite(r#"{"code":"AB12-CD34"}"#).is_err());
    }

    // A cloud VM is normally handed over as a sudo-capable non-root account, so
    // an installer that only ran as root would fail for most people.
    #[test]
    fn the_installer_escalates_when_the_login_is_not_root() {
        let script = install_script();
        assert!(script.contains("id -u"), "{script}");
        assert!(script.contains("sudo -n -H ./install.sh"), "{script}");
    }

    // Bare `sudo` would prompt for a password into a closed stdin and hang until
    // the install timeout, with the prompt invisible.
    #[test]
    fn the_installer_never_waits_on_a_sudo_prompt() {
        let script = install_script();
        assert!(!script.contains("sudo ./install.sh"), "{script}");
    }

    // The host service runs as root and its socket lives in root's ~/.lpm, which
    // nobody else can even traverse — so asking a `ubuntu@` login for an invite
    // without escalating fails with "lpm app is not running" on a host that is
    // running perfectly. Escalating without -H fails the same way, one home over.
    #[test]
    fn the_invite_escalates_when_the_login_cannot_reach_the_app() {
        let script = invite_script();
        assert!(script.contains("sudo -n -H lpm pair --json"), "{script}");
        assert!(!script.contains("sudo -n lpm pair"), "{script}");
    }

    // `lpm pair` mints a new code on every run, so the probe has to be a separate
    // command in the condition: chaining the two pair calls with `||` would mint
    // one code, throw it away, and mint another.
    #[test]
    fn the_invite_is_minted_exactly_once() {
        let script = invite_script();
        assert_eq!(script.matches("lpm pair --json").count(), 2, "{script}");
        assert!(script.contains("if lpm connections"), "{script}");
        assert!(!script.contains("lpm pair --json ||"), "{script}");
    }

    // A root login is already the account sudo would switch to, so escalating
    // there can only replace an accurate "the app is not running" with a sudo
    // error about something else.
    #[test]
    fn a_root_login_never_escalates() {
        assert!(invite_script().contains("[ \"$(id -u)\" = 0 ]"));
    }

    // ssh_capture hands back whatever the login shell put on stdout, so an motd
    // or a chatty rc file mentioning one of these names must not be read back as
    // a missing program.
    #[test]
    fn only_sentinel_lines_count_as_missing() {
        let noisy = "Welcome to Ubuntu\ngit\n  LPM_MISSING:tmux  \nrun git pull\n";
        assert_eq!(parse_missing(noisy), vec!["tmux".to_string()]);
        assert!(parse_missing("LPM_MISSING:sudo").is_empty());
        assert!(parse_missing("tmux\ngit\n").is_empty());
    }

    // Only tmux stops a host from working at all. Refusing to pair over a missing
    // git would lock out hosts that are running fine today.
    #[test]
    fn only_a_missing_tmux_blocks_pairing() {
        let names = |tools: &[&str]| tools.iter().map(|t| t.to_string()).collect::<Vec<_>>();
        assert!(blocks_pairing(&names(&["tmux"])));
        assert!(blocks_pairing(&names(&["tmux", "git"])));
        assert!(!blocks_pairing(&names(&["git"])));
        assert!(!blocks_pairing(&[]));
    }

    // Each tool has to answer for itself, under the sentinel the reader expects.
    #[test]
    fn the_missing_tool_probe_names_each_tool() {
        let probe = tools_probe();
        for tool in REQUIRED_TOOLS {
            assert!(probe.contains(&format!("command -v {tool}")), "{probe}");
            assert!(probe.contains(&format!("{MISSING_MARK}{tool}")), "{probe}");
        }
    }

    #[test]
    fn the_missing_tool_error_is_actionable() {
        let err = missing_tools_error(&["tmux".to_string(), "git".to_string()]);
        assert!(err.contains("tmux and git"), "{err}");
        assert!(err.contains("apt-get install -y tmux git"), "{err}");
    }

    // BatchMode keeps a password prompt from hanging a background command with no
    // terminal; the project mux is avoided for the same reason as the forward.
    #[test]
    fn remote_commands_never_wait_for_a_prompt() {
        let args = ssh_base_args(&target());
        assert!(args.contains(&"BatchMode=yes".to_string()));
        assert!(args.contains(&"ControlPath=none".to_string()));
        assert_eq!(args.last().unwrap(), "root@example.test");
    }
}
