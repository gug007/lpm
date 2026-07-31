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

use crate::peertunnel::{SshTarget, Tunnel};

/// Where a host fetches its own copy. The repo is public, so the server pulls the
/// release directly rather than the Mac shipping 16MB up an SSH channel.
const RELEASE_URL: &str =
    "https://github.com/gug007/lpm/releases/latest/download/lpm-host-linux-amd64.tar.gz";

const REMOTE_TIMEOUT: Duration = Duration::from_secs(300);
const TUNNEL_WAIT: Duration = Duration::from_secs(30);

fn ssh_base_args(target: &SshTarget) -> Vec<String> {
    let mut args = vec![
        "-o".into(),
        "BatchMode=yes".into(),
        "-o".into(),
        "ConnectTimeout=10".into(),
        "-o".into(),
        "ControlMaster=no".into(),
        "-o".into(),
        "ControlPath=none".into(),
    ];
    if target.port > 0 && target.port != 22 {
        args.push("-p".into());
        args.push(target.port.to_string());
    }
    let key = target.key.trim();
    if !key.is_empty() {
        args.push("-i".into());
        args.push(crate::config::expand_home(key));
    }
    args.push(target.destination());
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

/// Fetch the published tarball on the host and run its installer. Deliberately
/// the same installer a person would run by hand — one install path, so this
/// can't drift into its own half-supported variant.
pub fn install(target: &SshTarget) -> Result<(), String> {
    let script = format!(
        "set -e; tmp=$(mktemp -d); cd \"$tmp\"; \
         curl -fsSL {RELEASE_URL} -o lpm-host.tar.gz; \
         tar xzf lpm-host.tar.gz; cd lpm-host; ./install.sh"
    );
    let mut args = ssh_base_args(target);
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

pub fn request_invite(target: &SshTarget) -> Result<RemoteInvite, String> {
    let raw = ssh_capture(target, "lpm pair --json")?;
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
    let deadline = Instant::now() + TUNNEL_WAIT;
    loop {
        if let Some(port) = tunnel.local_port() {
            return Ok((tunnel, port));
        }
        if Instant::now() >= deadline {
            let err = tunnel.last_error();
            tunnel.stop();
            return Err(if err.is_empty() {
                "could not forward the host's port over SSH".into()
            } else {
                err
            });
        }
        std::thread::sleep(Duration::from_millis(100));
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
