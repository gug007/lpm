//! Reaching a peer whose port isn't reachable.
//!
//! A Linux host on a rented server has no business listening on a public
//! interface, and often can't be reached on a private one either. But its owner
//! already reaches it over SSH — that is how the machine was set up in the first
//! place. So lpm forwards the peer port over SSH: the host stays bound to
//! loopback, and the client dials `127.0.0.1:<local>` on this machine.
//!
//! What this buys over telling people to run `ssh -L` themselves is lifetime.
//! A hand-run tunnel dies with the terminal that started it, comes back only when
//! someone notices, and when it drops the peer simply reads as "offline" — the
//! one failure that looks identical to the host being down while having a
//! completely different fix. Here the tunnel is supervised and its state is
//! reported separately, so "the tunnel is down" can be said out loud.

use std::io::ErrorKind;
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4, TcpListener, TcpStream};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

/// Where a peer's SSH forward goes. Deliberately not `config::SshSettings`: that
/// carries a project `dir` and is deserialize-only, and a peer's reachability has
/// nothing to do with where a project lives on disk.
#[derive(Serialize, Deserialize, Clone, Default, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct SshTarget {
    pub host: String,
    pub user: String,
    pub port: u16,   // 0 => 22
    pub key: String, // identity file; empty = let ssh decide
}

impl SshTarget {
    pub fn is_set(&self) -> bool {
        !self.host.trim().is_empty()
    }

    /// `user@host`, or bare host when no user is given (ssh then uses its own
    /// config / the local username, same as typing it by hand).
    pub fn destination(&self) -> String {
        let host = self.host.trim();
        let user = self.user.trim();
        if user.is_empty() {
            host.to_string()
        } else {
            format!("{user}@{host}")
        }
    }
}

/// What the UI needs to tell a dead tunnel from a dead host.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum TunnelState {
    Down,
    Connecting,
    Up,
}

impl TunnelState {
    pub fn as_str(self) -> &'static str {
        match self {
            TunnelState::Down => "down",
            TunnelState::Connecting => "connecting",
            TunnelState::Up => "up",
        }
    }
}

const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const READY_POLL: Duration = Duration::from_millis(100);
/// Backoff between respawns. Deliberately short at the bottom: the common cause
/// is a laptop that slept or changed network, where the host is fine and the user
/// is waiting.
const BACKOFF_MIN: Duration = Duration::from_secs(2);
const BACKOFF_MAX: Duration = Duration::from_secs(30);

/// Stamped onto every forward we spawn so a later run can recognise its own
/// leftovers in `ps`. `SetEnv` is inert here — `-N` runs no remote command, and a
/// server that doesn't accept the variable simply ignores it — which is the point:
/// it changes nothing about the connection and exists only to be greppable.
const TUNNEL_MARKER: &str = "LPM_PEER_TUNNEL=1";

/// The options every lpm-run ssh shares. `BatchMode` so a host that wants a
/// password fails immediately instead of hanging forever on a prompt nobody can
/// see, and the connection is deliberately NOT shared with the project
/// ControlMaster: a long-lived forward should not die because some unrelated
/// project's mux was reaped, and vice versa.
pub fn ssh_common_args() -> Vec<String> {
    vec![
        "-o".into(),
        "BatchMode=yes".into(),
        "-o".into(),
        "ConnectTimeout=10".into(),
        "-o".into(),
        "ControlMaster=no".into(),
        "-o".into(),
        "ControlPath=none".into(),
    ]
}

/// The tail every ssh command line ends with: which port, which key, which
/// machine. Destination goes last, so this is always the final thing appended.
pub fn push_target_args(args: &mut Vec<String>, target: &SshTarget) {
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
}

/// The ssh invocation for a forward. No `-t` (there is no terminal and no command
/// to run). `ExitOnForwardFailure` is the one that matters most: without it ssh
/// happily connects while the forward is dead, and the tunnel reads as up while
/// nothing can traverse it.
pub fn ssh_forward_args(target: &SshTarget, local_port: u16, remote_port: u16) -> Vec<String> {
    let mut args = vec!["-N".into()];
    args.extend(ssh_common_args());
    args.extend([
        "-o".into(),
        format!("SetEnv={TUNNEL_MARKER}"),
        "-o".into(),
        "ExitOnForwardFailure=yes".into(),
        "-o".into(),
        "ServerAliveInterval=15".into(),
        "-o".into(),
        "ServerAliveCountMax=3".into(),
        "-L".into(),
        format!("127.0.0.1:{local_port}:127.0.0.1:{remote_port}"),
    ]);
    push_target_args(&mut args, target);
    args
}

/// Pick our own abandoned forwards out of a `ps` listing.
///
/// Two conditions, and both are load-bearing. The marker, because someone's
/// hand-run `ssh -L` to the same server is not ours to kill — matching on host or
/// port would take it out. And PPID 1, because a forward with a living parent
/// belongs to an lpm that is still using it, quite possibly a second instance.
///
/// Split from the killing so the filter can be tested against a listing without
/// spawning anything.
fn orphan_pids(ps_output: &str) -> Vec<i32> {
    ps_output
        .lines()
        .filter_map(|line| {
            let (pid, rest) = line.trim_start().split_once(char::is_whitespace)?;
            let (ppid, command) = rest.trim_start().split_once(char::is_whitespace)?;
            if ppid != "1" || !command.contains(TUNNEL_MARKER) {
                return None;
            }
            pid.parse::<i32>().ok()
        })
        .collect()
}

/// Kill forwards left behind by a previous run.
///
/// `stop()` and `Drop` handle a graceful exit, but nothing in this process
/// survives SIGKILL — a force-quit, a crash, or (constantly, in development) the
/// rebuild that restarts the app. The ssh child is re-parented to init and holds
/// its local port and its session on the server until the machine reboots, so
/// they accumulate one per SSH-reached peer per launch.
pub fn reap_orphaned_forwards() {
    let Ok(out) = Command::new("ps")
        .args(["-axo", "pid=,ppid=,command="])
        .stdin(Stdio::null())
        .output()
    else {
        return;
    };
    for pid in orphan_pids(&String::from_utf8_lossy(&out.stdout)) {
        // SIGTERM, not SIGKILL: ssh tears its forward down on it, and a stuck one
        // is re-reaped on the next launch anyway.
        unsafe { libc::kill(pid, libc::SIGTERM) };
    }
}

/// A free local port, claimed by binding and immediately releasing it. Racy in
/// principle; in practice ssh takes it milliseconds later, and a lost race shows
/// up as a forward failure that the supervisor retries with a new port.
fn free_local_port() -> Result<u16, String> {
    let listener = TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0))
        .map_err(|e| format!("could not reserve a local port: {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    drop(listener);
    Ok(port)
}

/// Whether something is accepting on the forwarded port yet. ssh binds the local
/// side before the remote end is proven, so this only says the forward exists —
/// the peer handshake is what proves it goes somewhere useful.
fn port_accepts(port: u16) -> bool {
    let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    match TcpStream::connect_timeout(&addr, Duration::from_millis(500)) {
        Ok(_) => true,
        Err(e) => !matches!(e.kind(), ErrorKind::ConnectionRefused),
    }
}

struct Inner {
    target: SshTarget,
    remote_port: u16,
    local_port: AtomicU16,
    state: Mutex<TunnelState>,
    last_error: Mutex<String>,
    enabled: AtomicBool,
    child: Mutex<Option<Child>>,
}

/// A supervised SSH forward to one peer.
#[derive(Clone)]
pub struct Tunnel {
    inner: Arc<Inner>,
}

impl Tunnel {
    pub fn new(target: SshTarget, remote_port: u16) -> Self {
        Tunnel {
            inner: Arc::new(Inner {
                target,
                remote_port,
                local_port: AtomicU16::new(0),
                state: Mutex::new(TunnelState::Down),
                last_error: Mutex::new(String::new()),
                enabled: AtomicBool::new(false),
                child: Mutex::new(None),
            }),
        }
    }

    pub fn state(&self) -> TunnelState {
        *self.inner.state.lock().unwrap()
    }

    pub fn last_error(&self) -> String {
        self.inner.last_error.lock().unwrap().clone()
    }

    /// The local endpoint to dial, or None while there is no live forward.
    pub fn local_port(&self) -> Option<u16> {
        match self.inner.local_port.load(Ordering::SeqCst) {
            0 => None,
            p if self.state() == TunnelState::Up => Some(p),
            _ => None,
        }
    }

    /// Start supervising. Idempotent: a second call while running is a no-op.
    pub fn start(&self) {
        if self.inner.enabled.swap(true, Ordering::SeqCst) {
            return;
        }
        let inner = self.inner.clone();
        std::thread::spawn(move || supervise(inner));
    }

    /// Whether this tunnel still describes the config it was built from. A peer
    /// whose SSH target or port was edited needs a new forward, not the old one.
    pub fn matches(&self, target: &SshTarget, remote_port: u16) -> bool {
        self.inner.target == *target && self.inner.remote_port == remote_port
    }

    /// Block until there's a port to dial, or give up. The supervisor may have
    /// only just started, so callers wait rather than failing instantly — a peer
    /// reported offline while its tunnel is two seconds from ready is wrong in
    /// the most confusing way. On timeout the supervisor's own error wins over
    /// `fallback`: "host key verification failed" beats "it didn't come up".
    pub fn wait_until_up(&self, timeout: Duration, fallback: &str) -> Result<u16, String> {
        let deadline = Instant::now() + timeout;
        loop {
            if let Some(port) = self.local_port() {
                return Ok(port);
            }
            if Instant::now() >= deadline {
                let err = self.last_error();
                return Err(if err.is_empty() {
                    fallback.to_string()
                } else {
                    err
                });
            }
            std::thread::sleep(READY_POLL);
        }
    }

    /// Stop supervising and tear down the forward.
    pub fn stop(&self) {
        self.inner.enabled.store(false, Ordering::SeqCst);
        kill_child(&self.inner);
        *self.inner.state.lock().unwrap() = TunnelState::Down;
        self.inner.local_port.store(0, Ordering::SeqCst);
    }
}

/// The ssh child is a process, so nothing reclaims it just because the last
/// handle went away. `stop()` is the intended path; this catches a Tunnel that
/// is simply dropped — replaced by a reconfigured one, say — so the forward can't
/// outlive the thing that was supervising it.
impl Drop for Inner {
    fn drop(&mut self) {
        self.enabled.store(false, Ordering::SeqCst);
        kill_child(self);
    }
}

fn kill_child(inner: &Inner) {
    if let Some(mut child) = inner.child.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

fn supervise(inner: Arc<Inner>) {
    let mut backoff = BACKOFF_MIN;
    while inner.enabled.load(Ordering::SeqCst) {
        *inner.state.lock().unwrap() = TunnelState::Connecting;
        match spawn_forward(&inner) {
            Ok(()) => {
                backoff = BACKOFF_MIN;
                // Block until ssh exits: a clean exit and a dropped link look the
                // same from here, and both mean the forward is gone.
                wait_for_exit(&inner);
                if inner.enabled.load(Ordering::SeqCst) {
                    set_down(&inner, "the connection to the host dropped");
                }
            }
            Err(e) => {
                set_down(&inner, &e);
                backoff = (backoff * 2).min(BACKOFF_MAX);
            }
        }
        if !inner.enabled.load(Ordering::SeqCst) {
            break;
        }
        std::thread::sleep(backoff);
    }
    *inner.state.lock().unwrap() = TunnelState::Down;
}

fn set_down(inner: &Inner, err: &str) {
    *inner.state.lock().unwrap() = TunnelState::Down;
    inner.local_port.store(0, Ordering::SeqCst);
    *inner.last_error.lock().unwrap() = err.to_string();
}

fn spawn_forward(inner: &Inner) -> Result<(), String> {
    let local = free_local_port()?;
    let args = ssh_forward_args(&inner.target, local, inner.remote_port);
    let child = Command::new("ssh")
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("could not run ssh: {e}"))?;
    *inner.child.lock().unwrap() = Some(child);

    let deadline = Instant::now() + CONNECT_TIMEOUT;
    while Instant::now() < deadline {
        if !inner.enabled.load(Ordering::SeqCst) {
            kill_child(inner);
            return Err("stopped".into());
        }
        // ssh exiting during setup is the informative case: BatchMode refused,
        // host unknown, forward rejected. Report that rather than a timeout.
        if let Some(status) = child_exited(inner) {
            return Err(match status {
                Some(code) => format!("ssh exited with code {code}"),
                None => "ssh exited".to_string(),
            });
        }
        if port_accepts(local) {
            inner.local_port.store(local, Ordering::SeqCst);
            *inner.state.lock().unwrap() = TunnelState::Up;
            inner.last_error.lock().unwrap().clear();
            return Ok(());
        }
        std::thread::sleep(READY_POLL);
    }
    kill_child(inner);
    Err("the SSH forward did not come up".into())
}

/// `Some(exit code)` once ssh is gone, `None` while it's still running.
fn child_exited(inner: &Inner) -> Option<Option<i32>> {
    let mut guard = inner.child.lock().unwrap();
    let child = guard.as_mut()?;
    match child.try_wait() {
        Ok(Some(status)) => Some(Some(status.code().unwrap_or(-1))),
        Ok(None) => None,
        Err(_) => Some(None),
    }
}

fn wait_for_exit(inner: &Inner) {
    loop {
        if !inner.enabled.load(Ordering::SeqCst) {
            kill_child(inner);
            return;
        }
        if child_exited(inner).is_some() {
            return;
        }
        std::thread::sleep(READY_POLL);
    }
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
    fn destination_omits_an_empty_user() {
        let mut t = target();
        assert_eq!(t.destination(), "root@example.test");
        t.user = String::new();
        assert_eq!(t.destination(), "example.test");
    }

    // ExitOnForwardFailure is the one that stops a tunnel from reading as up while
    // nothing can traverse it; BatchMode stops it hanging on a password prompt no
    // one can see.
    #[test]
    fn forward_args_refuse_to_hang_or_lie() {
        let args = ssh_forward_args(&target(), 18766, 8766);
        assert!(args.contains(&"-N".to_string()));
        assert!(args.contains(&"BatchMode=yes".to_string()));
        assert!(args.contains(&"ExitOnForwardFailure=yes".to_string()));
        assert!(args.contains(&"127.0.0.1:18766:127.0.0.1:8766".to_string()));
        assert_eq!(args.last().unwrap(), "root@example.test");
    }

    // Sharing the project mux would couple a long-lived forward's lifetime to
    // whatever else happens to be sshing to that host.
    #[test]
    fn forward_does_not_share_the_project_control_master() {
        let args = ssh_forward_args(&target(), 1, 2);
        assert!(args.contains(&"ControlMaster=no".to_string()));
        assert!(args.contains(&"ControlPath=none".to_string()));
    }

    #[test]
    fn port_and_key_are_passed_only_when_set() {
        let plain = ssh_forward_args(&target(), 1, 2);
        assert!(!plain.contains(&"-p".to_string()));
        assert!(!plain.contains(&"-i".to_string()));

        let mut t = target();
        t.port = 2222;
        t.key = "/tmp/id_test".into();
        let args = ssh_forward_args(&t, 1, 2);
        assert!(args.windows(2).any(|w| w[0] == "-p" && w[1] == "2222"));
        assert!(args
            .windows(2)
            .any(|w| w[0] == "-i" && w[1] == "/tmp/id_test"));
    }

    // Port 22 is ssh's own default; passing it adds noise to every command line.
    #[test]
    fn the_default_ssh_port_is_left_implicit() {
        let mut t = target();
        t.port = 22;
        assert!(!ssh_forward_args(&t, 1, 2).contains(&"-p".to_string()));
    }

    // The marker is what separates our leftovers from a forward someone set up by
    // hand; without it on the command line the reaper has nothing safe to match.
    #[test]
    fn a_forward_is_stamped_so_it_can_be_reaped_later() {
        let args = ssh_forward_args(&target(), 1, 2);
        assert!(args.iter().any(|a| a.contains(TUNNEL_MARKER)), "{args:?}");
    }

    #[test]
    fn reaps_only_re_parented_forwards_of_ours() {
        let listing = concat!(
            "  501     1 ssh -N -o SetEnv=LPM_PEER_TUNNEL=1 -L 127.0.0.1:1:127.0.0.1:8766 root@h\n",
            "  502  9999 ssh -N -o SetEnv=LPM_PEER_TUNNEL=1 -L 127.0.0.1:2:127.0.0.1:8766 root@h\n",
            "  503     1 ssh -N -L 127.0.0.1:3:127.0.0.1:8766 root@h\n",
        );
        // 502 still has a parent — a running lpm is using it.
        // 503 is someone's own forward to the very same host and port.
        assert_eq!(orphan_pids(listing), vec![501]);
    }

    #[test]
    fn a_garbled_listing_kills_nothing() {
        assert!(orphan_pids("").is_empty());
        assert!(orphan_pids("nonsense\n1\n").is_empty());
        assert!(orphan_pids("notapid 1 ssh -N -o SetEnv=LPM_PEER_TUNNEL=1").is_empty());
    }

    #[test]
    fn a_reserved_port_is_actually_free() {
        let port = free_local_port().expect("a port");
        assert!(port > 0);
        assert!(TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, port)).is_ok());
    }

    // No forward, nothing to dial: the caller must not fall back to some stale
    // port and connect to whatever happens to be listening there now.
    // stop() must be safe to call on a tunnel that never started, since teardown
    // paths run over whatever happens to be configured.
    #[test]
    fn stopping_an_unstarted_tunnel_is_harmless() {
        let tunnel = Tunnel::new(target(), 8766);
        tunnel.stop();
        assert_eq!(tunnel.state().as_str(), "down");
        assert!(tunnel.local_port().is_none());
    }

    #[test]
    fn there_is_no_local_port_until_the_tunnel_is_up() {
        let tunnel = Tunnel::new(target(), 8766);
        assert_eq!(tunnel.state().as_str(), "down");
        assert!(tunnel.local_port().is_none());
    }
}
