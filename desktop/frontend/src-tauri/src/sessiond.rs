// The session daemon — lpm's own replacement for the tmux server.
//
// One process, outside the app's process group, holding every project's service
// panes. It exists because the behaviour it replaces is not "run a command": it
// is "run a command somewhere that survives the app". Quitting lpm has always
// left your dev servers up, and relaunching it has always found them again —
// tmux provided that by being a separate daemon, and so does this.
//
// It is deliberately ignorant of lpm: no projects, no profiles, no ssh, no
// config. A session is a name, a pane is a shell in a directory with a label,
// and everything that decides WHICH shell line to type stays in the app
// (sessions.rs). That keeps this process small enough to be obviously correct
// and lets it keep running across an app upgrade that changed the rules.
use crate::daemonize;
use crate::sessionpane::Pane;
use crate::sessionproto::{read_line, write_line, PaneInfo, PaneSpec, Request, Response};
use std::collections::HashMap;
use std::io::{BufReader, BufWriter};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

/// The daemon's socket. A sibling of the status socket rather than the same
/// file: the app deletes `lpm.sock` when it exits, and this one has to outlive
/// exactly that event.
pub fn socket_path() -> PathBuf {
    // Tests get their own socket in the temp dir, never in ~/.lpm: they must not
    // reach the daemon carrying the developer's real projects, and they must not
    // leave anything behind in a directory the app reads.
    #[cfg(test)]
    {
        std::env::temp_dir().join(format!("lpm-test-sessions-{}.sock", std::process::id()))
    }
    #[cfg(not(test))]
    {
        let name = if cfg!(debug_assertions) {
            "lpm-dev-sessions.sock"
        } else {
            "lpm-sessions.sock"
        };
        crate::config::lpm_dir().join(name)
    }
}

fn lock_path() -> PathBuf {
    socket_path().with_extension("lock")
}

/// The argument that turns this binary into the daemon instead of the app.
/// Re-execing ourselves rather than shipping a second binary means the daemon
/// and the app can never disagree about the protocol, and there is nothing
/// extra to install, sign or find on PATH.
pub const DAEMON_ARG: &str = "--session-daemon";

#[derive(Default)]
struct Registry {
    sessions: HashMap<String, Vec<std::sync::Arc<Pane>>>,
    next_pane: u64,
}

fn registry() -> &'static Mutex<Registry> {
    static REGISTRY: OnceLock<Mutex<Registry>> = OnceLock::new();
    REGISTRY.get_or_init(Mutex::default)
}

impl Registry {
    fn next_id(&mut self) -> String {
        let id = self.next_pane;
        self.next_pane += 1;
        format!("%{id}")
    }

    fn find(&self, pane_id: &str) -> Option<std::sync::Arc<Pane>> {
        self.sessions
            .values()
            .flatten()
            .find(|p| p.id == pane_id)
            .cloned()
    }

    /// Detach a session and hand back its panes, so the caller can snapshot the
    /// process trees and tear them down without holding the registry lock.
    fn take(&mut self, session: &str) -> Vec<std::sync::Arc<Pane>> {
        self.sessions.remove(session).unwrap_or_default()
    }

    /// Forget a pane, and the session with it once it holds none — the way a
    /// window closes with its last pane.
    fn drop_pane(&mut self, pane_id: &str) {
        self.sessions.retain(|_, panes| {
            panes.retain(|p| p.id != pane_id);
            !panes.is_empty()
        });
    }
}

/// Close panes and reap their whole process trees. Killing only the pane shell
/// would orphan the dev server it launched — the shell can't forward a signal
/// it never receives — so every pid under it is snapshotted first.
fn teardown(panes: &[std::sync::Arc<Pane>], wait: bool) {
    // One process-table scan for every pane, not one per pane: `trees` takes all
    // the roots at once, and a project stop would otherwise fork `ps` per service.
    let roots: Vec<i32> = panes.iter().map(|p| p.pid).collect();
    let victims = crate::proctree::trees(&roots);
    for pane in panes {
        pane.close();
    }
    if wait {
        crate::proctree::kill_pids(&victims);
    } else {
        crate::proctree::kill_pids_async(victims);
    }
}

/// Open one pane per spec, appending to `session`. Any failure rolls the whole
/// batch back, so a half-built session is never left behind.
fn open_panes(session: &str, specs: &[PaneSpec]) -> Result<(), String> {
    let mut opened: Vec<std::sync::Arc<Pane>> = Vec::new();
    for spec in specs {
        let id = registry().lock().unwrap().next_id();
        match Pane::open(id, spec, |pane_id| {
            registry().lock().unwrap().drop_pane(&pane_id);
        }) {
            Ok(pane) => {
                registry()
                    .lock()
                    .unwrap()
                    .sessions
                    .entry(session.to_string())
                    .or_default()
                    .push(pane.clone());
                opened.push(pane);
            }
            Err(error) => {
                let mut reg = registry().lock().unwrap();
                for pane in &opened {
                    reg.drop_pane(&pane.id);
                }
                drop(reg);
                teardown(&opened, false);
                return Err(error);
            }
        }
    }
    Ok(())
}

fn pane_infos(session: &str, detail: bool) -> Vec<PaneInfo> {
    let panes = registry()
        .lock()
        .unwrap()
        .sessions
        .get(session)
        .cloned()
        .unwrap_or_default();
    if !detail {
        return panes
            .iter()
            .map(|pane| PaneInfo {
                id: pane.id.clone(),
                session: session.to_string(),
                service: pane.service.clone(),
                pid: pane.pid as i64,
                ..Default::default()
            })
            .collect();
    }
    // The foreground-process lookups fork, which is why they are opt-in: only
    // `lpm project` renders them, and the log poller asks for pane ids twice a
    // second. Each pane's foreground pid is read ONCE and carried through —
    // reading it again after the lookups would sometimes name a process the
    // lookups never saw, leaving the pane with an empty command and path.
    let foreground: Vec<i32> = panes.iter().map(|p| p.foreground_pid()).collect();
    let commands = crate::procinfo::commands(&foreground);
    let cwds = crate::procinfo::cwds(&foreground);
    panes
        .iter()
        .zip(foreground)
        .map(|(pane, fg)| PaneInfo {
            id: pane.id.clone(),
            session: session.to_string(),
            service: pane.service.clone(),
            pid: pane.pid as i64,
            command: commands.get(&fg).cloned().unwrap_or_default(),
            path: cwds.get(&fg).cloned().unwrap_or_default(),
            title: pane.title(),
        })
        .collect()
}

/// Look a pane up and let go of the registry immediately. Written as its own
/// function on purpose: a `match registry().lock()...find(..)` keeps the guard
/// alive for the whole match, which would hold the daemon's one global lock
/// across a pty write or a screen capture.
fn with_pane(pane_id: &str, act: impl FnOnce(&Pane) -> Response) -> Response {
    match registry().lock().unwrap().find(pane_id) {
        Some(pane) => act(&pane),
        None => Response::error(format!("no pane {pane_id}")),
    }
}

/// An op that either worked or did not, as a reply.
fn done(result: Result<(), String>) -> Response {
    match result {
        Ok(()) => Response::ok(),
        Err(error) => Response::error(error),
    }
}

fn handle(request: Request) -> Response {
    match request {
        Request::Sessions => {
            let names = registry().lock().unwrap().sessions.keys().cloned().collect();
            Response {
                sessions: Some(names),
                ..Response::ok()
            }
        }
        Request::Panes { session, detail } => Response {
            panes: Some(pane_infos(&session, detail)),
            ..Response::ok()
        },
        Request::AllPanes => {
            let sessions: Vec<String> = registry().lock().unwrap().sessions.keys().cloned().collect();
            let panes = sessions
                .iter()
                .flat_map(|s| pane_infos(s, false))
                .collect();
            Response {
                panes: Some(panes),
                ..Response::ok()
            }
        }
        Request::Capture { pane, history } => with_pane(&pane, |p| Response {
            text: Some(p.capture(history)),
            ..Response::ok()
        }),
        Request::Start { session, panes } => {
            if panes.is_empty() {
                return Response::error("no services to start");
            }
            // Reap synchronously: handing replacement services a port the old
            // ones are still dying on is the failure this ordering prevents.
            let old = registry().lock().unwrap().take(&session);
            teardown(&old, true);
            done(open_panes(&session, &panes))
        }
        Request::Split { session, panes } => {
            if !registry().lock().unwrap().sessions.contains_key(&session) {
                return Response::error(format!("no session {session}"));
            }
            done(open_panes(&session, &panes))
        }
        Request::Send { pane, text } => with_pane(&pane, |p| done(p.send(&text))),
        Request::Interrupt { pane } => with_pane(&pane, |p| done(p.interrupt())),
        Request::KillPane { pane } => {
            let mut reg = registry().lock().unwrap();
            let Some(found) = reg.find(&pane) else {
                return Response::error(format!("no pane {pane}"));
            };
            reg.drop_pane(&pane);
            drop(reg);
            teardown(&[found], false);
            Response::ok()
        }
        Request::Shutdown => {
            // One teardown for everything: it batches the process-table scan and
            // the grace period, which per-session would be paid N times over.
            let all: Vec<std::sync::Arc<Pane>> = registry()
                .lock()
                .unwrap()
                .sessions
                .drain()
                .flat_map(|(_, panes)| panes)
                .collect();
            teardown(&all, true);
            // Reply before leaving, so the caller learns it worked rather than
            // reading the exit as a broken connection.
            std::thread::spawn(|| {
                std::thread::sleep(Duration::from_millis(100));
                let _ = std::fs::remove_file(socket_path());
                std::process::exit(0);
            });
            Response::ok()
        }
        Request::KillSession { session, wait } => {
            let panes = registry().lock().unwrap().take(&session);
            if panes.is_empty() {
                return Response::error(format!("no session {session}"));
            }
            teardown(&panes, wait);
            Response::ok()
        }
    }
}

/// Requests currently being handled. The janitor retires an idle daemon, and
/// "no sessions" is true for the whole window between a client connecting and
/// its first pane existing — so idleness alone would let the daemon exit out
/// from under the very request that was about to give it work.
static IN_FLIGHT: AtomicUsize = AtomicUsize::new(0);

struct Busy;

impl Busy {
    fn new() -> Self {
        IN_FLIGHT.fetch_add(1, Ordering::SeqCst);
        Busy
    }
}

impl Drop for Busy {
    fn drop(&mut self) {
        IN_FLIGHT.fetch_sub(1, Ordering::SeqCst);
    }
}

fn serve(stream: UnixStream) {
    let Ok(write_half) = stream.try_clone() else {
        return;
    };
    let mut reader = BufReader::new(stream);
    let mut writer = BufWriter::new(write_half);
    while let Some(request) = read_line::<_, Request>(&mut reader) {
        // Held across the reply too: the write is part of serving the request.
        let _busy = Busy::new();
        if write_line(&mut writer, &handle(request)).is_err() {
            return;
        }
    }
}

/// Retire the daemon once it has held no sessions for a while. The tmux server
/// exited with its last session and nothing here should be longer-lived than
/// the work it carries; the grace period keeps a stop immediately followed by a
/// start from having to pay for a fresh process.
fn start_janitor() {
    const IDLE_TICKS: u32 = 5;
    std::thread::spawn(|| {
        let mut idle = 0;
        loop {
            std::thread::sleep(Duration::from_secs(2));
            let quiet = registry().lock().unwrap().sessions.is_empty()
                && IN_FLIGHT.load(Ordering::SeqCst) == 0;
            if quiet {
                idle += 1;
            } else {
                idle = 0;
            }
            if idle >= IDLE_TICKS {
                let _ = std::fs::remove_file(socket_path());
                std::process::exit(0);
            }
        }
    });
}

/// The daemon entry point, reached from main.rs before any of the app starts.
/// Never returns.
pub fn run() -> ! {
    daemonize::detach();
    let path = socket_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    // Whoever holds the lock owns the socket. Two clients racing to start a
    // daemon both get here; the loser exits rather than unlinking a socket the
    // winner has already bound.
    let Some(_lock) = daemonize::acquire(&lock_path()) else {
        std::process::exit(0);
    };
    let _ = std::fs::remove_file(&path); // a stale socket from an unclean exit
    let Ok(listener) = UnixListener::bind(&path) else {
        std::process::exit(1);
    };
    let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    start_janitor();
    for stream in listener.incoming().flatten() {
        std::thread::spawn(move || serve(stream));
    }
    std::process::exit(0);
}

/// Serve the daemon inside the test process, on a socket named for this pid.
/// Tests get the real thing — real ptys, real shells, real teardown — without
/// ever reaching the daemon carrying the developer's actual projects, and
/// without the janitor retiring the server between two tests.
#[cfg(test)]
pub fn serve_in_process() {
    use std::sync::Once;
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let path = socket_path();
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::remove_file(&path);
        let listener = UnixListener::bind(&path).expect("bind test session socket");
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                std::thread::spawn(move || serve(stream));
            }
        });
    });
}
