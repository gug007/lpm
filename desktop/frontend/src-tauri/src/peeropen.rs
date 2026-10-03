//! "Open in <app>" for a file or project on a paired machine. The app always
//! starts on this Mac, where the person is: on a Linux host there is no Cursor
//! to start, and on another Mac it would open on a screen nobody is looking at.
//!
//! A VS Code-family editor opens the host's own file over Remote-SSH when this
//! Mac reaches the host over SSH, so what is saved lands there. Every other
//! case gets a read-only copy (peercopy.rs): a PDF opens in Preview, and an
//! editor can't save changes into a copy that would quietly drop them.

use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::mediapeer::split_peer_path;
use crate::openin::{open_file_with, InstalledApp};
use crate::peerclient::PeerClientHub;
use crate::peercopy::copy_to_mac;
use crate::peertunnel::SshTarget;
use crate::remotessh;

const ALLOWED: &str = "LPM_ALLOWED";
/// Past this the host is treated as out of reach: a file falls back to its copy
/// rather than leave the click hanging.
const PROBE_LIMIT: Duration = Duration::from_secs(6);

#[derive(Serialize)]
pub struct PeerOpened {
    /// The app was given a read-only copy, not the host's file.
    copy: bool,
    /// The machine the file lives on, as this Mac names it.
    host: String,
}

struct Peer<'a> {
    slug: &'a str,
    host_path: &'a str,
    name: String,
    ssh: SshTarget,
}

impl Peer<'_> {
    fn authority(&self) -> String {
        let ssh = &self.ssh;
        remotessh::authority(&ssh.host, &ssh.user, ssh.port, &ssh.key)
    }
}

fn peer<'a>(hub: &PeerClientHub, marked: &'a str) -> Result<Peer<'a>, String> {
    let (slug, host_path) = split_peer_path(marked)
        .ok_or_else(|| format!("not a path on a paired machine: {marked}"))?;
    let entry = hub
        .peer_entry(slug)
        .ok_or_else(|| "that machine is no longer paired".to_string())?;
    Ok(Peer {
        slug,
        host_path,
        name: crate::remote_machines::display_name(&entry),
        ssh: entry.ssh,
    })
}

/// `app` None means the file's default app. `edit` says the file is one to edit
/// rather than look at (not a picture, video or PDF): only then is a Remote-SSH
/// window worth its connection.
pub(crate) fn open_file(
    app_handle: &AppHandle,
    hub: &PeerClientHub,
    marked: &str,
    app: Option<&InstalledApp>,
    line: i64,
    col: i64,
    edit: bool,
) -> Result<PeerOpened, String> {
    let peer = peer(hub, marked)?;
    if let Some(app) = app.filter(|a| edit && a.remote_capable) {
        if remote_ssh_reach(&peer, false).is_ok() {
            remotessh::open_file(app, &peer.authority(), peer.host_path, line, col)?;
            return Ok(PeerOpened {
                copy: false,
                host: peer.name,
            });
        }
    }
    let name = std::path::Path::new(peer.host_path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let local = copy_to_mac(hub, peer.slug, peer.host_path, &peer.name, |sent, total| {
        let _ = app_handle.emit(
            "peer-download-progress",
            serde_json::json!({ "token": marked, "name": name, "sent": sent, "total": total }),
        );
    })?;
    let local = local.to_string_lossy();
    match app {
        Some(app) => open_file_with(app.id, &app.path, &local, line, col)?,
        None => crate::files::open_default(&local)?,
    }
    Ok(PeerOpened {
        copy: true,
        host: peer.name,
    })
}

/// A project on a paired machine, in a VS Code-family editor over Remote-SSH:
/// a folder can't be copied over the way a single file is.
pub(crate) fn open_folder(
    hub: &PeerClientHub,
    app: &InstalledApp,
    marked: &str,
) -> Result<(), String> {
    let peer = peer(hub, marked)?;
    if !app.remote_capable {
        return Err(format!(
            "{} can't open a project on {}",
            app.label, peer.name
        ));
    }
    remote_ssh_reach(&peer, true)?;
    remotessh::open_folder(app, &peer.authority(), peer.host_path)
}

/// Whether Remote-SSH can open the host path, and why not. It works as the SSH
/// login, which need not be the account the host's lpm runs as, so the login
/// itself is asked whether it can open the path. A `~/` path is the lpm
/// account's home, maybe not the login's.
fn remote_ssh_reach(peer: &Peer, folder: bool) -> Result<(), String> {
    let ssh = &peer.ssh;
    if !ssh.is_set() {
        return Err(format!("{} isn't reached over SSH", peer.name));
    }
    if !peer.host_path.starts_with('/') {
        return Err(format!("{} isn't an absolute path", peer.host_path));
    }
    if !remotessh::can_name(&ssh.host, &ssh.user) {
        return Err(format!("Remote-SSH can't connect to {}", ssh.destination()));
    }
    let p = crate::config::shell_quote(peer.host_path);
    let probe = if folder {
        format!("test -d {p} && test -r {p} && test -x {p} && echo {ALLOWED}")
    } else {
        format!("test -f {p} && test -r {p} && test -w {p} && echo {ALLOWED}")
    };
    let cmd = crate::peerssh::ssh_command(ssh, &probe);
    match crate::statusfwd::run_with_timeout(cmd, PROBE_LIMIT) {
        Some(out)
            if String::from_utf8_lossy(&out)
                .lines()
                .any(|l| l.trim() == ALLOWED) =>
        {
            Ok(())
        }
        Some(_) => Err(format!(
            "{} can't open {}",
            ssh.destination(),
            peer.host_path
        )),
        None => Err(format!("{} took too long to answer", ssh.destination())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn target(user: &str, host: &str) -> SshTarget {
        SshTarget {
            host: host.into(),
            user: user.into(),
            port: 0,
            key: String::new(),
        }
    }

    #[test]
    fn only_an_absolute_path_on_an_ssh_host_can_go_to_remote_ssh() {
        let peer = |host_path, ssh| Peer {
            slug: "abcd1234",
            host_path,
            name: "box".into(),
            ssh,
        };
        assert_eq!(
            remote_ssh_reach(&peer("/srv/a.ts", SshTarget::default()), false),
            Err("box isn't reached over SSH".into())
        );
        assert_eq!(
            remote_ssh_reach(&peer("~/a.ts", target("root", "box")), false),
            Err("~/a.ts isn't an absolute path".into())
        );
        assert_eq!(
            remote_ssh_reach(&peer("/srv/a.ts", target("dev", "fe80::1%en0")), false),
            Err("Remote-SSH can't connect to dev@fe80::1%en0".into())
        );
    }
}
