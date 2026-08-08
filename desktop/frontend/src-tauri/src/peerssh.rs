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
use std::io::Write;
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
/// Removal is stopping units and deleting files — seconds of work. The slack is
/// for a box that is thrashing, not for anything the script does.
const UNINSTALL_TIMEOUT: Duration = Duration::from_secs(120);
const TUNNEL_WAIT: Duration = Duration::from_secs(30);
/// How long the host gets to actually start listening after it mints an invite.
/// `lpm pair` returns as soon as the code exists; the listener binds a moment
/// later, on another thread, and a busy box can be slow about it.
const HOSTING_WAIT: Duration = Duration::from_secs(20);
/// Unhurried on purpose: every poll is a fresh ssh login, and a tight loop against
/// a host that is genuinely down reads as a login flood to anything watching.
const HOSTING_POLL: Duration = Duration::from_secs(2);

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

/// How the host pulls its own copy down. curl first because a server has it, wget
/// second because a container often has that instead — the images this runs on
/// are not all cloud VMs, and "curl: not found" from a machine that can perfectly
/// well download things reads as lpm being broken.
fn fetch_command() -> String {
    format!(
        "if command -v curl >/dev/null 2>&1; then curl -fsSL {RELEASE_URL} -o lpm-host.tar.gz; \
         elif command -v wget >/dev/null 2>&1; then wget -qO lpm-host.tar.gz {RELEASE_URL}; \
         else echo 'that machine has neither curl nor wget, so it cannot download lpm' >&2; exit 1; fi"
    )
}

/// Fetch, unpack, install. The installer needs root.
fn install_script() -> String {
    format!(
        "set -e; tmp=$(mktemp -d); cd \"$tmp\"; {}; \
         tar xzf lpm-host.tar.gz; cd lpm-host; {}",
        fetch_command(),
        as_root("./install.sh")
    )
}

/// A container is the host most likely to have no sudo on it: the login there is
/// normally root already, and images that hand you another account often ship
/// neither sudo nor a way for it to matter. The shell's own "not found" says
/// nothing about which machine, which account, or what to do about it.
fn explain_install_failure(err: String) -> String {
    let missing_sudo = err.contains("sudo: command not found")
        || err.contains("sudo: not found")
        || err.contains("sudo: exec: not found");
    if missing_sudo {
        return format!(
            "{err}\nlpm has to install as root on that machine, and the login there is not root \
             and has no sudo — connect as root instead, or install sudo there"
        );
    }
    err
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

/// Run a command on the host under a deadline, optionally feeding it a script on
/// stdin. Shared by the install and the removal: both are long, both report the
/// host's stderr verbatim, and both must not hang a UI thread's worker forever if
/// the far end stops answering mid-run.
fn ssh_run(
    target: &SshTarget,
    command: String,
    stdin_script: Option<&str>,
    timeout: Duration,
    on_failure: &str,
    on_timeout: &str,
) -> Result<(), String> {
    let mut args = ssh_base_args(target);
    args.push(command);
    let mut child = Command::new("ssh")
        .args(&args)
        .stdin(if stdin_script.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("could not run ssh: {e}"))?;
    if let Some(script) = stdin_script {
        // Dropped immediately after, which closes the pipe — the remote `sh -s`
        // reads to EOF, so a stdin left open would hang until the deadline.
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| "could not write to ssh".to_string())?;
        stdin
            .write_all(script.as_bytes())
            .map_err(|e| format!("could not send the script to the host: {e}"))?;
    }
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(status) if status.success() => return Ok(()),
            Some(_) => {
                let out = child.wait_with_output().map_err(|e| e.to_string())?;
                let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
                return Err(if err.is_empty() {
                    on_failure.to_string()
                } else {
                    err
                });
            }
            None => {}
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            return Err(on_timeout.to_string());
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}

/// Fetch the published tarball on the host and run its installer. Deliberately
/// the same installer a person would run by hand — one install path, so this
/// can't drift into its own half-supported variant.
pub fn install(target: &SshTarget) -> Result<(), String> {
    ssh_run(
        target,
        install_script(),
        None,
        REMOTE_TIMEOUT,
        "the installer failed on the host",
        "the installer timed out on the host",
    )
    .map_err(explain_install_failure)
}

/// The uninstaller, shipped in the tarball *and* embedded here so it can run on a
/// host whose installed copy predates it. The machine someone most wants to clean
/// up is the one running an old build, and "update it before you can remove it"
/// is not an answer. One authored script either way — this is a second delivery
/// route, not a second implementation.
const UNINSTALL_SCRIPT: &str = include_str!("../../../linux/uninstall.sh");

/// Piped to `sh -s` rather than invoking the installed copy: see above. The flags
/// go after `--` so the remote shell hands them to the script rather than reading
/// them as its own.
fn uninstall_command(purge_data: bool) -> String {
    as_root(if purge_data {
        "sh -s -- --purge"
    } else {
        "sh -s"
    })
}

/// Undo the install on the host, and optionally delete its `~/.lpm` as well.
pub fn uninstall(target: &SshTarget, purge_data: bool) -> Result<(), String> {
    ssh_run(
        target,
        uninstall_command(purge_data),
        Some(UNINSTALL_SCRIPT),
        UNINSTALL_TIMEOUT,
        "removing lpm failed on the host",
        "removing lpm timed out on the host",
    )
}

/// The invite a host mints for us: `lpm pair --json` is the same call a person
/// would make on the box, so there is one pairing path, not two.
#[derive(Debug)]
pub struct RemoteInvite {
    pub code: String,
    pub port: u16,
    pub fp: Option<String>,
}

/// Run an app command as whoever can actually reach the running app.
///
/// The service normally runs as root, so a `ubuntu@` login cannot see its
/// control socket — root's `~/.lpm` isn't traversable — and gets back "lpm app is
/// not running" from a host that is running perfectly. Escalating unconditionally
/// would be wrong the other way, though: the unit can be pointed at another
/// account with a `User=` drop-in, and then root is the empty home.
///
/// So probe first with a command that has no side effects, and escalate only if
/// the login user can't reach the app. The probe is a separate command rather than
/// a `||` fallback because `lpm pair` mints a fresh code every time it runs, and
/// chaining would mint one, throw it away, and mint another.
///
/// A root login never escalates, even when the probe fails: it is already the
/// account that would be escalated to, so `sudo` could only turn an accurate
/// "the app is not running" into a sudo error about a different problem.
fn app_script(command: &str) -> String {
    format!(
        "if lpm connections >/dev/null 2>&1 || [ \"$(id -u)\" = 0 ]; then {command}; \
         else sudo -n -H {command}; fi"
    )
}

fn invite_script() -> String {
    app_script("lpm pair --json")
}

pub fn request_invite(target: &SshTarget) -> Result<RemoteInvite, String> {
    let raw = ssh_capture(target, &invite_script())?;
    parse_invite(&raw)
}

/// What comes back when lpm is on the machine but its app isn't answering: the
/// CLI's own words, written for someone standing at that machine and reading
/// them on its own terminal. Arriving in a dialog on the Mac they name no
/// machine and no fix, and they read as if *this* app had stopped.
///
/// Only rewritten on positive evidence — anything else is passed through, so a
/// change to the CLI's wording costs the better message, never a wrong one.
/// (The phrase is `require_app` in cli/src/control.rs.)
fn explain_unreachable_app(target: &SshTarget, err: String) -> String {
    if !err.contains("app is not running") {
        return err;
    }
    format!(
        "lpm is installed on {} but its app isn't answering there, so it can't mint an invite. \
         Start it on that machine — `sudo systemctl restart lpm`, or `lpm-host restart` on a host \
         without systemd — then connect again.",
        target.destination()
    )
}

/// The answer out of whatever the login shell printed. A chatty `~/.bashrc` or an
/// motd lands on stdout ahead of the JSON, and taking the whole of stdout as the
/// reply turns a healthy host into "it may be running an older lpm".
fn json_line(raw: &str) -> Option<&str> {
    raw.lines()
        .map(str::trim)
        .rev()
        .find(|line| line.starts_with('{'))
}

/// Split out from the SSH call so the parsing — including a host too old to know
/// `--json`, which answers with human text — is testable without a server.
pub fn parse_invite(raw: &str) -> Result<RemoteInvite, String> {
    let v: Value = serde_json::from_str(json_line(raw).unwrap_or(raw.trim())).map_err(|_| {
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

/// What the host says about its own peer server — the same snapshot the
/// Connections pane renders, read back over SSH.
#[derive(Debug, PartialEq)]
struct Hosting {
    running: bool,
    port: u16,
}

fn parse_hosting(raw: &str) -> Option<Hosting> {
    let v: Value = serde_json::from_str(json_line(raw)?).ok()?;
    let host = v.get("host")?;
    Some(Hosting {
        running: host
            .get("running")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        port: host.get("port").and_then(Value::as_u64).unwrap_or(0) as u16,
    })
}

fn hosting(target: &SshTarget) -> Option<Hosting> {
    parse_hosting(&ssh_capture(target, &app_script("lpm connections --json")).ok()?)
}

/// What to tell someone whose host minted an invite but never came up on the port
/// it named. Deliberately points at the machine, not at the pairing: nothing about
/// the invite is wrong here.
fn hosting_error(last: Option<&Hosting>, port: u16) -> String {
    match last {
        Some(h) if h.running && h.port != port => format!(
            "the host is listening on port {} now, not the {port} its invite named — try again",
            h.port
        ),
        // The observed case: a leftover file server from an old session had been
        // sitting on 8766 for a week, so the app couldn't take the port and the
        // Mac's dial landed on a stranger. Name the possibility — it is not
        // something anyone thinks to check — and point at the log that says so.
        _ => format!(
            "lpm on the host isn't listening on port {port} — something else may already be \
             using it. The host's own log records why: ~/.lpm/logs/lpm.log"
        ),
    }
}

/// Wait until the host says its peer server is actually up before dialling it.
///
/// Two failures hide here, and both used to arrive as a pairing error about the
/// host's identity. The listener binds on its own thread after `lpm pair` has
/// already answered, so a dial can land in that gap; and a port that never comes
/// up at all — taken by something else, or an app that died after minting the
/// code — is indistinguishable from the gap over an SSH forward, because ssh
/// accepts on the local port either way.
///
/// A host we cannot ask is not a host we refuse: an older `lpm` may not know
/// `connections --json`, and it would pair perfectly well. Only a machine that
/// positively answers "not listening" stops us.
fn ensure_hosting(target: &SshTarget, port: u16) -> Result<(), String> {
    let deadline = Instant::now() + HOSTING_WAIT;
    loop {
        let state = hosting(target);
        match &state {
            None => return Ok(()),
            Some(h) if h.running && h.port == port => return Ok(()),
            _ => {}
        }
        if Instant::now() >= deadline {
            return Err(hosting_error(state.as_ref(), port));
        }
        std::thread::sleep(HOSTING_POLL);
    }
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
/// invite, wait for it to actually be listening, and consume that invite over a
/// forward — then record the peer as SSH-reached so its connection brings its own
/// tunnel up from then on.
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
    let invite = request_invite(target).map_err(|e| explain_unreachable_app(target, e))?;
    ensure_hosting(target, invite.port)?;
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
    use serde_json::json;

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
        assert!(parse_invite(r#"{"code":"A","port":1}"#)
            .unwrap()
            .fp
            .is_none());
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

    // A login shell that prints a banner (an motd, a chatty rc file) puts its
    // output on stdout ahead of the answer. Reading all of stdout as the reply
    // reported a healthy host as one running an older lpm.
    #[test]
    fn an_invite_survives_a_chatty_login_shell() {
        let noisy = "Welcome to Ubuntu 24.04\n\
                     Last login: Fri\n\
                     {\"code\":\"AB12-CD34\",\"port\":8766,\"fp\":\"deadbeef\"}\n";
        let invite = parse_invite(noisy).unwrap();
        assert_eq!(invite.code, "AB12-CD34");
        assert_eq!(invite.port, 8766);
    }

    fn state_json(running: bool, port: u16) -> String {
        json!({ "host": { "running": running, "port": port, "bindAddress": "127.0.0.1" } })
            .to_string()
    }

    #[test]
    fn reads_the_hosts_own_view_of_its_listener() {
        assert_eq!(
            parse_hosting(&state_json(true, 8766)),
            Some(Hosting {
                running: true,
                port: 8766
            })
        );
        assert_eq!(
            parse_hosting(&format!("motd line\n{}", state_json(false, 8766))),
            Some(Hosting {
                running: false,
                port: 8766
            })
        );
        // Not JSON, or JSON without a host: nothing we can conclude, which is not
        // the same as "not hosting" — the caller must not refuse to pair on it.
        assert!(parse_hosting("lpm app is not running").is_none());
        assert!(parse_hosting(r#"{"peers":[]}"#).is_none());
    }

    // The failure this exists for: the host minted an invite naming a port it never
    // came up on. Saying so beats the pairing error people used to get, which
    // blamed the machine's identity and sent them looking for a fresh invite.
    #[test]
    fn a_host_that_never_listens_is_named_as_the_problem() {
        let err = hosting_error(
            Some(&Hosting {
                running: false,
                port: 8766,
            }),
            8766,
        );
        assert!(err.contains("isn't listening on port 8766"), "{err}");
        assert!(
            err.contains("something else may already be using it"),
            "{err}"
        );
        assert!(!err.contains("identity"), "{err}");
        // Nothing came back at all — same conclusion, same advice.
        assert!(hosting_error(None, 8766).contains("isn't listening on port 8766"));
    }

    // A host that moved its port after minting the invite is a different problem
    // with a different fix: the forward would go to a dead port.
    #[test]
    fn a_moved_port_says_so() {
        let err = hosting_error(
            Some(&Hosting {
                running: true,
                port: 9000,
            }),
            8766,
        );
        assert!(err.contains("port 9000"), "{err}");
        assert!(err.contains("try again"), "{err}");
    }

    // The removal is fed to the host's shell on stdin, not run from the installed
    // copy: a host old enough to lack uninstall.sh is exactly the one someone
    // wants off their machine, and "update it first" is not an answer.
    #[test]
    fn the_removal_is_piped_to_the_hosts_shell() {
        for purge in [false, true] {
            let script = uninstall_command(purge);
            assert!(script.contains("sh -s"), "{script}");
            assert!(!script.contains("/opt/lpm/uninstall.sh"), "{script}");
            // Same escalation rule as everything else here: root logins never
            // sudo, everyone else does, non-interactively and with -H.
            assert!(script.contains("sudo -n -H sh -s"), "{script}");
            assert!(script.contains("[ \"$(id -u)\" = 0 ]"), "{script}");
        }
    }

    // Deleting the host's ~/.lpm is opt-in, and the flag is the only thing that
    // can turn it on — an off-by-default that leaks would delete a machine's
    // pairing identity and session memory on a plain uninstall.
    #[test]
    fn only_an_explicit_purge_deletes_the_hosts_data() {
        assert!(!uninstall_command(false).contains("--purge"));
        let purging = uninstall_command(true);
        // After `--`, so the remote shell passes it to the script instead of
        // trying to read it as its own option.
        assert!(purging.contains("sh -s -- --purge"), "{purging}");
    }

    // The script ships in the tarball and is embedded here from the same file, so
    // there is one authored uninstaller. These assert the shape the Rust side
    // depends on — if the script stops taking --purge, or starts deleting the
    // data unconditionally, the flag above becomes a lie.
    #[test]
    fn the_embedded_uninstaller_matches_what_we_call_it_with() {
        assert!(UNINSTALL_SCRIPT.contains("--purge"), "takes the flag");
        assert!(
            UNINSTALL_SCRIPT.contains("PURGE=0"),
            "defaults to keeping data"
        );
        assert_eq!(
            UNINSTALL_SCRIPT
                .matches("rm -rf \"$SERVICE_HOME/.lpm\"")
                .count(),
            1,
            "the data is deleted in exactly one place — inside the --purge branch"
        );
        assert!(
            UNINSTALL_SCRIPT.contains("if [ \"$PURGE\" = \"1\" ]"),
            "and that place is guarded by the flag"
        );
        assert!(
            UNINSTALL_SCRIPT.contains("rm -rf \"$PREFIX\""),
            "removes the install"
        );
    }

    // A host with no service manager — a container — runs the display, the
    // window manager and the app under hostctl.sh rather than three units, so
    // `systemctl stop` there is a no-op that leaves a webview and an X server
    // running on a machine with nothing left to find them by. The removal we
    // pipe in is the only thing that can end them.
    #[test]
    fn the_embedded_uninstaller_stops_a_container_host() {
        assert!(
            UNINSTALL_SCRIPT.contains("hostctl.sh\" stop"),
            "asks the supervisor to stop itself"
        );
        // And the repair case: /opt/lpm deleted by hand, so the script that
        // knows how to stop the supervisor is gone while the supervisor isn't.
        assert!(
            UNINSTALL_SCRIPT.contains("*hostctl*supervise*"),
            "can still find a supervisor whose script was deleted"
        );
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

    // Plenty of container images ship one of these two and not the other, and a
    // host that can download perfectly well must not be turned away because it
    // picked the other one.
    #[test]
    fn the_download_takes_curl_or_wget() {
        let script = install_script();
        assert!(script.contains("command -v curl"), "{script}");
        assert!(script.contains("command -v wget"), "{script}");
        assert!(script.contains("wget -qO lpm-host.tar.gz"), "{script}");
        // Both write the same file, which is what the next step unpacks.
        assert_eq!(script.matches("lpm-host.tar.gz").count(), 3, "{script}");
        // And a machine with neither says so itself, rather than failing on a
        // tar of a file that was never written.
        assert!(script.contains("neither curl nor wget"), "{script}");
    }

    // The failure a container hands back when its login isn't root: the shell's
    // own "not found", which names no machine, no account and no fix.
    #[test]
    fn a_host_without_sudo_is_explained() {
        let explained = explain_install_failure("sudo: command not found".into());
        assert!(explained.contains("connect as root instead"), "{explained}");
        // The host's own words are kept — they are the evidence.
        assert!(explained.contains("sudo: command not found"), "{explained}");
        // Anything else passes through untouched.
        assert_eq!(
            explain_install_failure("tar: unexpected EOF".into()),
            "tar: unexpected EOF"
        );
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

    // The CLI on the host talks about "lpm" without saying which machine, so on
    // the Mac its message reads as this app having stopped. Name the machine and
    // what to do about it.
    #[test]
    fn an_app_that_isnt_answering_names_the_machine() {
        let err = explain_unreachable_app(
            &target(),
            "lpm: lpm app is not running — start it to control projects".into(),
        );
        assert!(err.contains("root@example.test"), "{err}");
        assert!(err.contains("systemctl restart lpm"), "{err}");
        // A host with no service manager runs it under the supervisor instead.
        assert!(err.contains("lpm-host restart"), "{err}");
    }

    // Everything else is the host's own evidence and must survive intact —
    // rewriting on a guess would replace a real error with a wrong instruction.
    #[test]
    fn other_invite_failures_pass_through() {
        for raw in [
            "Permission denied (publickey).",
            "the host's invite had no pairing code",
        ] {
            assert_eq!(
                explain_unreachable_app(&target(), raw.to_string()),
                raw,
                "{raw}"
            );
        }
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
