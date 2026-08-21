// Service sessions — the layer services.rs and its callers talk to, and the
// direct replacement for the old tmux.rs. Same shape as before: a project is
// one session, a service is one pane, and the Nth pane is the Nth service.
//
// What changed is who holds them. Panes live in lpm's own session daemon
// (sessiond.rs) instead of a tmux server, so this file is the translation
// between lpm's vocabulary (projects, services, ssh, profiles) and the daemon's
// (sessions, panes, shell lines). Everything that decides WHAT to run stays
// here; the daemon only runs it.
use crate::config;
use crate::sessionclient as client;
use crate::sessionproto::{PaneInfo, PaneSpec, Request};
use std::collections::{BTreeMap, HashSet};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ServicePane {
    pub id: String,
    pub service: String,
}

/// A service to launch: (name, cmd, cwd, env). Order is the resolved running
/// order, and it is the order panes are created in.
pub type ServiceTuple = (String, String, String, BTreeMap<String, String>);

/// Live session names. No daemon means nothing is running — the same non-error
/// that "no tmux server" used to be.
pub fn running_sessions() -> HashSet<String> {
    client::query(&Request::Sessions)
        .ok()
        .and_then(|r| r.sessions)
        .map(|names| names.into_iter().collect())
        .unwrap_or_default()
}

pub fn session_exists(name: &str) -> bool {
    !panes_of(name).is_empty()
}

/// Panes of one session, in creation order. The app never needs the pane's
/// foreground command or cwd — only `lpm project` renders those — so this never
/// asks for them and the daemon never runs the lookups.
pub(crate) fn panes_of(session: &str) -> Vec<PaneInfo> {
    client::query(&Request::Panes {
        session: session.to_string(),
        detail: false,
    })
    .ok()
    .and_then(|r| r.panes)
    .unwrap_or_default()
}

/// Pane ids for a session in creation order. Empty when the session is gone.
pub fn list_pane_ids(session: &str) -> Vec<String> {
    panes_of(session).into_iter().map(|p| p.id).collect()
}

/// Panes with their service labels, or `None` when the labelling is unusable —
/// an unlabelled pane means the ordinal is the only identity left, and the
/// caller has to decide whether that is safe. Every pane lpm opens is labelled,
/// so this is a guard against a session that isn't ours to reason about.
pub fn list_service_panes(session: &str) -> Option<Vec<ServicePane>> {
    let panes = panes_of(session);
    if panes.is_empty() || panes.iter().any(|p| p.service.is_empty()) {
        return None;
    }
    Some(
        panes
            .into_iter()
            .map(|p| ServicePane {
                id: p.id,
                service: p.service,
            })
            .collect(),
    )
}

/// Every pane the daemon holds, with the session it belongs to. The port
/// classifier walks a listening pid up its ancestry until it lands on one of
/// these pane pids.
pub fn all_panes() -> Vec<PaneInfo> {
    client::query(&Request::AllPanes)
        .ok()
        .and_then(|r| r.panes)
        .unwrap_or_default()
}

/// Stop every session and retire the daemon. Uninstall only: quitting the app
/// deliberately leaves services running, and this is the one path that is
/// supposed to end them.
pub fn shutdown_daemon() -> Result<(), String> {
    match client::query(&Request::Shutdown) {
        Ok(_) => Ok(()),
        // No daemon is the desired end state, not a failure.
        Err(error) if error == client::NO_DAEMON => Ok(()),
        Err(error) => Err(error),
    }
}

/// A pane's rendered scrollback: `lines` of history plus the current screen,
/// with wrapped rows re-joined. Trimmed at both ends, which is what callers
/// have always received.
pub fn capture_pane(pane_id: &str, lines: i64) -> Result<String, String> {
    let history = usize::try_from(lines).unwrap_or(0);
    let text = client::query(&Request::Capture {
        pane: pane_id.to_string(),
        history,
    })?
    .text
    .unwrap_or_default();
    Ok(text.trim().to_string())
}

pub fn kill_session(name: &str) -> Result<(), String> {
    client::query(&Request::KillSession {
        session: name.to_string(),
        wait: false,
    })
    .map(|_| ())
}

/// Like `kill_session`, but reaps the pane process trees before returning so a
/// stop/restart cannot race the teardown onto a still-bound port.
pub fn kill_session_wait(name: &str) -> Result<(), String> {
    client::query(&Request::KillSession {
        session: name.to_string(),
        wait: true,
    })
    .map(|_| ())
}

pub fn kill_pane(pane_id: &str) -> Result<(), String> {
    client::query(&Request::KillPane {
        pane: pane_id.to_string(),
    })
    .map(|_| ())
}

/// Interrupt the service and clear the pane, leaving the shell open so the
/// service can be started again in place.
pub fn stop_service_pane(pane_id: &str) -> Result<(), String> {
    client::query(&Request::Interrupt {
        pane: pane_id.to_string(),
    })
    .map(|_| ())
}

/// Type a command line into a pane's shell.
fn send_keys(target: &str, command: &str) -> Result<(), String> {
    client::query(&Request::Send {
        pane: target.to_string(),
        text: command.to_string(),
    })
    .map(|_| ())
}

/// Re-run a service's command in an existing (stopped) pane.
pub fn restart_service_pane(
    pane_id: &str,
    root: &str,
    cwd: &str,
    env: &BTreeMap<String, String>,
    cmd: &str,
    ssh: Option<&config::SshSettings>,
) -> Result<(), String> {
    send_keys(pane_id, &build_command(root, cwd, env, cmd, ssh))
}

/// Local: `cd <cwd> && export K=V && … && cmd`. Remote: the whole
/// `ssh … bash -ilc '…'` line, one ssh per pane. The pane's shell parses it,
/// which is why it is a line of text and not an argv.
fn build_command(
    root: &str,
    cwd_raw: &str,
    env: &BTreeMap<String, String>,
    cmd: &str,
    ssh: Option<&config::SshSettings>,
) -> String {
    match ssh {
        Some(ssh) => config::ssh_command_line(ssh, cwd_raw, env, cmd),
        None => {
            // build_local_script owns the export quoting and joining (and drops
            // an empty cmd, which open-coding this left as a trailing `&&`).
            let cwd = config::resolve_cwd(root, cwd_raw);
            let body = config::build_local_script(env, cmd);
            let cd = format!("cd {}", config::shell_quote(&cwd));
            if body.is_empty() {
                cd
            } else {
                format!("{cd} && {body}")
            }
        }
    }
}

fn pane_spawn_dir(root: &str, cwd_raw: &str, ssh: Option<&config::SshSettings>) -> String {
    if ssh.is_some() {
        config::remote_local_spawn_dir(root) // local cwd for the ssh client
    } else {
        config::resolve_cwd(root, cwd_raw)
    }
}

fn specs_for(
    root: &str,
    services: &[ServiceTuple],
    ssh: Option<&config::SshSettings>,
) -> Vec<PaneSpec> {
    services
        .iter()
        .map(|(name, cmd, cwd, env)| PaneSpec {
            service: name.clone(),
            command: build_command(root, cwd, env, cmd, ssh),
            dir: pane_spawn_dir(root, cwd, ssh),
        })
        .collect()
}

/// Create a session with one pane per service, replacing any session of the
/// same name. The daemon tears the old one down and reaps it before opening the
/// new panes, and rolls the whole batch back if any pane fails to open.
pub fn start_project_services(
    session: &str,
    root: &str,
    services: &[ServiceTuple],
    ssh: Option<&config::SshSettings>,
) -> Result<(), String> {
    if services.is_empty() {
        return Err("no services to start".into());
    }
    if ssh.is_some() {
        config::ensure_ssh_control_dir()?;
    }
    client::command(&Request::Start {
        session: session.to_string(),
        panes: specs_for(root, services, ssh),
    })
    .map(|_| ())
}

/// Add panes to a running session. A failure part-way rolls back only the panes
/// this call opened, leaving the session's existing ones untouched.
pub fn split_session_services(
    session: &str,
    root: &str,
    services: &[ServiceTuple],
    ssh: Option<&config::SshSettings>,
) -> Result<(), String> {
    if services.is_empty() {
        return Ok(());
    }
    if ssh.is_some() {
        config::ensure_ssh_control_dir()?;
    }
    client::command(&Request::Split {
        session: session.to_string(),
        panes: specs_for(root, services, ssh),
    })
    .map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

    /// A session name no other test can collide with, torn down on drop. Tests
    /// share one in-process session server (sessiond::serve_in_process), so
    /// isolation is by name rather than by lock.
    struct SessionGuard(String);

    impl SessionGuard {
        fn new(tag: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            Self(format!("lpm-test-{tag}-{}-{nonce}", std::process::id()))
        }
    }

    impl Drop for SessionGuard {
        fn drop(&mut self) {
            let _ = kill_session(&self.0);
        }
    }

    fn service(name: &str, cmd: &str) -> ServiceTuple {
        (
            name.to_string(),
            cmd.to_string(),
            String::new(),
            BTreeMap::new(),
        )
    }

    /// Poll until `check` passes. Panes run real shells, so output arrives on
    /// the shell's schedule, not ours.
    fn eventually(what: &str, mut check: impl FnMut() -> bool) {
        let deadline = Instant::now() + Duration::from_secs(15);
        while Instant::now() < deadline {
            if check() {
                return;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        panic!("timed out waiting for {what}");
    }

    #[test]
    fn starting_a_project_opens_one_labelled_pane_per_service() {
        let session = SessionGuard::new("labels");
        start_project_services(
            &session.0,
            ".",
            &[service("db", "sleep 30"), service("web", "sleep 30")],
            None,
        )
        .unwrap();

        let names: Vec<String> = list_service_panes(&session.0)
            .unwrap()
            .into_iter()
            .map(|pane| pane.service)
            .collect();
        assert_eq!(names, ["db", "web"]);
        assert!(running_sessions().contains(&session.0));
    }

    #[test]
    fn a_session_name_never_matches_by_prefix() {
        // tmux resolved `-t name` by prefix, so a target for a session that had
        // gone silently hit a duplicate named "{name}-x1y2z3" — which is a
        // shape lpm produces on purpose. Names are exact here; pin that.
        let session = SessionGuard::new("exact");
        let longer = SessionGuard(format!("{}-longer", session.0));
        start_project_services(&longer.0, ".", &[service("db", "sleep 30")], None).unwrap();

        assert!(session_exists(&longer.0));
        assert!(!session_exists(&session.0));
        assert!(list_pane_ids(&session.0).is_empty());
        assert!(kill_session(&session.0).is_err());
        assert!(session_exists(&longer.0));
    }

    #[test]
    fn eight_services_all_get_a_pane() {
        // tmux ran out of room tiling the 6th pane into one window. Panes are
        // independent ptys now, so the only limit is the machine's.
        let session = SessionGuard::new("eight");
        let services: Vec<ServiceTuple> = (0..8)
            .map(|i| service(&format!("svc{i}"), "sleep 30"))
            .collect();
        start_project_services(&session.0, ".", &services, None).unwrap();
        assert_eq!(list_pane_ids(&session.0).len(), 8);
    }

    /// A pane echoes back the command line typed into it, so a marker written
    /// plainly in the command would match the echo rather than the run. The
    /// empty-quote split (`serv''ice`) is erased by the shell before `echo`
    /// sees it, so only real output contains the whole marker.
    #[test]
    fn a_started_service_runs_and_its_output_is_captured() {
        let session = SessionGuard::new("capture");
        start_project_services(
            &session.0,
            ".",
            &[service("web", "echo lpm-serv''ice-marker; sleep 30")],
            None,
        )
        .unwrap();
        let pane = list_pane_ids(&session.0).remove(0);
        eventually("the service's output to reach the pane", || {
            capture_pane(&pane, 100)
                .unwrap_or_default()
                .contains("lpm-service-marker")
        });
    }

    #[test]
    fn stopping_a_service_clears_its_pane_and_leaves_the_shell_for_a_restart() {
        // The stop/restart contract: the pane is a shell that outlives the
        // service, so the same pane can run it again.
        let session = SessionGuard::new("restart");
        start_project_services(
            &session.0,
            ".",
            &[service("web", "echo fir''st-run; sleep 30")],
            None,
        )
        .unwrap();
        let pane = list_pane_ids(&session.0).remove(0);
        eventually("the first run", || {
            capture_pane(&pane, 100)
                .unwrap_or_default()
                .contains("first-run")
        });

        stop_service_pane(&pane).unwrap();
        eventually("the pane to clear", || {
            !capture_pane(&pane, 100)
                .unwrap_or_default()
                .contains("first-run")
        });

        restart_service_pane(&pane, ".", "", &BTreeMap::new(), "echo sec''ond-run", None).unwrap();
        eventually("the restarted service", || {
            capture_pane(&pane, 100)
                .unwrap_or_default()
                .contains("second-run")
        });
        assert_eq!(list_pane_ids(&session.0).len(), 1, "the pane is still there");
    }

    #[test]
    fn killing_a_session_waits_for_its_processes_to_die() {
        let session = SessionGuard::new("killwait");
        start_project_services(&session.0, ".", &[service("db", "sleep 300")], None).unwrap();
        let pids = crate::sessions::all_panes()
            .into_iter()
            .filter(|p| p.session == session.0)
            .map(|p| p.pid as i32)
            .collect::<Vec<_>>();
        assert_eq!(pids.len(), 1);

        kill_session_wait(&session.0).unwrap();

        assert!(!session_exists(&session.0));
        // kill_session_wait must not return while the pane's shell is still
        // alive — a start that follows it would otherwise race a port the old
        // process has not released.
        assert_ne!(
            unsafe { libc::kill(pids[0], 0) },
            0,
            "the pane shell is still alive after a waited kill"
        );
    }

    #[test]
    fn splitting_adds_panes_without_disturbing_the_existing_ones() {
        let session = SessionGuard::new("split");
        start_project_services(&session.0, ".", &[service("db", "sleep 30")], None).unwrap();
        split_session_services(&session.0, ".", &[service("web", "sleep 30")], None).unwrap();

        let names: Vec<String> = list_service_panes(&session.0)
            .unwrap()
            .into_iter()
            .map(|pane| pane.service)
            .collect();
        assert_eq!(names, ["db", "web"]);
    }

    #[test]
    fn a_failed_multi_service_start_leaves_no_session_behind() {
        let session = SessionGuard::new("startfail");
        let services = vec![
            service("db", "sleep 30"),
            service("web", &"x".repeat(4 * 1024 * 1024)),
        ];
        assert!(start_project_services(&session.0, ".", &services, None).is_err());
        assert!(!running_sessions().contains(&session.0));
        // The rolled-back panes must be gone as processes too, not just as
        // registry entries — a pane that failed to launch still opened a pty and
        // started a shell.
        eventually("the rolled-back pane's shell to exit", || {
            !all_panes().iter().any(|p| p.session == session.0)
        });
    }

    #[test]
    fn a_failed_split_keeps_the_panes_that_were_already_there() {
        let session = SessionGuard::new("splitfail");
        start_project_services(&session.0, ".", &[service("db", "sleep 30")], None).unwrap();
        let additions = vec![
            service("cache", "sleep 30"),
            service("web", &"x".repeat(4 * 1024 * 1024)),
        ];
        assert!(split_session_services(&session.0, ".", &additions, None).is_err());

        let names: Vec<String> = list_service_panes(&session.0)
            .unwrap()
            .into_iter()
            .map(|pane| pane.service)
            .collect();
        assert_eq!(names, ["db"]);
    }

    #[test]
    fn killing_one_pane_leaves_the_rest_of_the_session() {
        let session = SessionGuard::new("killpane");
        start_project_services(
            &session.0,
            ".",
            &[service("db", "sleep 30"), service("web", "sleep 30")],
            None,
        )
        .unwrap();
        let panes = list_service_panes(&session.0).unwrap();
        let web = panes.iter().find(|p| p.service == "web").unwrap();

        kill_pane(&web.id).unwrap();

        eventually("the killed pane to leave the session", || {
            list_pane_ids(&session.0).len() == 1
        });
        assert_eq!(
            list_service_panes(&session.0).unwrap()[0].service,
            "db"
        );
    }
}
