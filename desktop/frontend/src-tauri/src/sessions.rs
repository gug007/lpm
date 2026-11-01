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
use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::Path;
use std::time::{Duration, Instant};

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

/// The services of a session whose line has ended, with the status each ended
/// with (None for a stop, or a shell that gave none).
pub fn ended_services(session: &str) -> HashMap<String, Option<i32>> {
    panes_of(session)
        .into_iter()
        .filter(|pane| pane.ended && !pane.service.is_empty())
        .map(|pane| (pane.service, pane.code))
        .collect()
}

fn pane_ended(pane_id: &str) -> bool {
    all_panes().iter().any(|pane| pane.id == pane_id && pane.ended)
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
        // No daemon is the desired end state, not a failure — nor is one already
        // retiring, which hangs up instead of answering.
        Err(error) if error == client::NO_DAEMON || error == client::NO_REPLY => Ok(()),
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

#[cfg_attr(windows, allow(dead_code))]
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
    })?;
    #[cfg(windows)]
    settle_after_interrupt(pane_id);
    Ok(())
}

/// Windows stops a service by typing ^C, and when the console gets round to
/// it, it discards any input queued behind it — a start sent straight after
/// the stop would vanish. The pane redraws (the ^C echo, the next prompt) once
/// that has happened; a job that ignores ^C draws nothing, hence the bound.
#[cfg(windows)]
fn settle_after_interrupt(pane_id: &str) {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(1);
    while std::time::Instant::now() < deadline {
        if capture_pane(pane_id, 0).map_or(true, |screen| !screen.is_empty()) {
            return;
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
}

/// Type a command line into a pane's shell.
fn send_keys(target: &str, command: &str) -> Result<(), String> {
    client::query(&Request::Send {
        pane: target.to_string(),
        text: command.to_string(),
    })
    .map(|_| ())
}

/// How long a restart waits for the old run to give its pane back. A shell that
/// doesn't report its prompts (panehook.rs) waits it out in full.
const RESTART_WAIT: Duration = Duration::from_secs(3);

/// Run a service's command again in its pane. A run still going is stopped
/// first, and given until its shell is back at a prompt, so the new line
/// neither lands in the old process's input nor races it for its port.
///
/// On Windows the stop is a typed ^C, and one that lands while MSYS is still
/// starting the line's next program (the `sleep` after an `echo`) goes
/// unanswered. A run still going halfway through the wait gets a second ^C,
/// as panestop.rs gives one at teardown.
pub fn restart_service_pane(
    pane_id: &str,
    root: &str,
    cwd: &str,
    env: &BTreeMap<String, String>,
    cmd: &str,
    ssh: Option<&config::SshSettings>,
) -> Result<(), String> {
    if !pane_ended(pane_id) {
        let start = Instant::now();
        stop_service_pane(pane_id)?;
        let mut stop_again = cfg!(windows);
        while !pane_ended(pane_id) && start.elapsed() < RESTART_WAIT {
            if stop_again && start.elapsed() >= RESTART_WAIT / 2 {
                stop_again = false;
                stop_service_pane(pane_id)?;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
    }
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
            let cd = format!(
                "cd {}",
                config::shell_quote(&crate::shellpath::shell_path(Path::new(&cwd)))
            );
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

/// Pane specs for `services`. A `deferred` one opens on an idle shell; its line
/// is typed in later (`run_service_line`) once what it depends on is ready.
fn specs_for(
    root: &str,
    services: &[ServiceTuple],
    ssh: Option<&config::SshSettings>,
    deferred: &HashSet<String>,
) -> Vec<PaneSpec> {
    services
        .iter()
        .map(|(name, cmd, cwd, env)| PaneSpec {
            service: name.clone(),
            command: if deferred.contains(name) {
                String::new()
            } else {
                build_command(root, cwd, env, cmd, ssh)
            },
            dir: pane_spawn_dir(root, cwd, ssh),
        })
        .collect()
}

/// Type a service's line into its labelled pane: the start of a service whose
/// pane opened idle to wait for its dependencies.
pub fn run_service_line(
    session: &str,
    service: &str,
    root: &str,
    cwd: &str,
    env: &BTreeMap<String, String>,
    cmd: &str,
    ssh: Option<&config::SshSettings>,
) -> Result<(), String> {
    let pane = panes_of(session)
        .into_iter()
        .find(|pane| pane.service == service)
        .ok_or_else(|| format!("service {service:?} has no pane"))?;
    send_keys(&pane.id, &build_command(root, cwd, env, cmd, ssh))
}

#[cfg(test)]
pub fn start_project_services(
    session: &str,
    root: &str,
    services: &[ServiceTuple],
    ssh: Option<&config::SshSettings>,
) -> Result<(), String> {
    start_project_services_gated(session, root, services, ssh, &HashSet::new())
}

/// Create a session with one pane per service, replacing any session of the
/// same name. The daemon tears the old one down and reaps it before opening the
/// new panes, and rolls the whole batch back if any pane fails to open.
/// `deferred` panes open idle, their command sent once a ready check passes.
pub fn start_project_services_gated(
    session: &str,
    root: &str,
    services: &[ServiceTuple],
    ssh: Option<&config::SshSettings>,
    deferred: &HashSet<String>,
) -> Result<(), String> {
    if services.is_empty() {
        return Err("no services to start".into());
    }
    if ssh.is_some() {
        config::ensure_ssh_control_dir()?;
    }
    client::command(&Request::Start {
        session: session.to_string(),
        panes: specs_for(root, services, ssh, deferred),
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
    deferred: &HashSet<String>,
) -> Result<(), String> {
    if services.is_empty() {
        return Ok(());
    }
    if ssh.is_some() {
        config::ensure_ssh_control_dir()?;
    }
    client::command(&Request::Split {
        session: session.to_string(),
        panes: specs_for(root, services, ssh, deferred),
    })
    .map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

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

    #[cfg(unix)]
    #[test]
    fn a_local_service_line_cds_into_its_dir_verbatim() {
        let env = BTreeMap::from([("PORT".to_string(), "3000".to_string())]);
        assert_eq!(
            build_command("/srv/my app", "web", &env, "npm start", None),
            "cd '/srv/my app/web' && export PORT='3000' && npm start"
        );
    }

    #[cfg(windows)]
    #[test]
    fn a_local_service_line_cds_into_the_msys_spelling_of_its_dir() {
        assert_eq!(
            build_command(
                r"C:\work\my app",
                "web",
                &BTreeMap::new(),
                "npm start",
                None
            ),
            "cd '/c/work/my app/web' && npm start"
        );
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

    /// The line lpm types is echoed twice, by the terminal and again by the
    /// shell's prompt; neither belongs in the service's log.
    #[test]
    fn a_service_log_starts_at_its_own_output() {
        if !shell_reports_prompts() {
            return;
        }
        let session = SessionGuard::new("echo");
        start_project_services(
            &session.0,
            ".",
            &[service("web", "echo fir''st-line; sleep 30")],
            None,
        )
        .unwrap();
        let pane = list_pane_ids(&session.0).remove(0);
        eventually("the service's output", || {
            capture_pane(&pane, 100)
                .unwrap_or_default()
                .contains("first-line")
        });
        let log = capture_pane(&pane, 100).unwrap();
        assert_eq!(log.trim_start().lines().next(), Some("first-line"), "{log}");
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
    fn restarting_a_running_service_stops_it_first() {
        // Typed into a run that is still going, the line would sit in its input
        // until `sleep` ended, long after this test gives up.
        let session = SessionGuard::new("rerun");
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

        restart_service_pane(&pane, ".", "", &BTreeMap::new(), "echo sec''ond-run; sleep 30", None)
            .unwrap();
        eventually("the second run", || {
            capture_pane(&pane, 100)
                .unwrap_or_default()
                .contains("second-run")
        });
        assert!(!panes_of(&session.0)[0].ended);
    }

    /// zsh and bash report each finished line (panehook.rs); other shells
    /// leave a pane looking busy for as long as the shell lives.
    fn shell_reports_prompts() -> bool {
        matches!(
            crate::shellwrap::shell_name(&crate::sys::login_shell()),
            "zsh" | "bash"
        )
    }

    #[test]
    fn a_held_back_service_opens_idle_and_runs_when_told() {
        let session = SessionGuard::new("held");
        let deferred: HashSet<String> = ["web".to_string()].into_iter().collect();
        start_project_services_gated(
            &session.0,
            ".",
            &[
                service("db", "echo db-up; sleep 30"),
                service("web", "echo web-up; sleep 30"),
            ],
            None,
            &deferred,
        )
        .unwrap();
        let web_pane = || {
            panes_of(&session.0)
                .into_iter()
                .find(|p| p.service == "web")
                .unwrap()
        };
        let printed = |pane: &str, word: &str| {
            capture_pane(pane, 50).is_ok_and(|t| t.lines().any(|l| l.trim() == word))
        };
        eventually("db to run", || {
            printed(&panes_of(&session.0)[0].id, "db-up")
        });
        assert!(!capture_pane(&web_pane().id, 50).unwrap().contains("web-up"));
        run_service_line(
            &session.0,
            "web",
            ".",
            "",
            &BTreeMap::new(),
            "echo web-up; sleep 30",
            None,
        )
        .unwrap();
        eventually("web to run", || printed(&web_pane().id, "web-up"));
        assert!(
            run_service_line(&session.0, "ghost", ".", "", &BTreeMap::new(), "true", None).is_err()
        );
    }

    #[test]
    fn a_service_that_fails_is_reported_ended_with_its_status() {
        if !shell_reports_prompts() {
            return;
        }
        let session = SessionGuard::new("crash");
        start_project_services(&session.0, ".", &[service("web", "sh -c 'exit 7'")], None)
            .unwrap();
        eventually("the failure to be reported", || {
            panes_of(&session.0)
                .first()
                .is_some_and(|pane| pane.ended && pane.code == Some(7))
        });
        assert_eq!(ended_services(&session.0).get("web"), Some(&Some(7)));
        assert!(panes_of(&session.0)[0].pid > 0, "the shell is still there");
    }

    #[test]
    fn a_line_that_exits_its_shell_keeps_the_pane_until_it_runs_again() {
        let session = SessionGuard::new("exit");
        start_project_services(
            &session.0,
            ".",
            &[service("web", "echo la''st-words; exit 3")],
            None,
        )
        .unwrap();
        eventually("the shell's exit to be reported", || {
            panes_of(&session.0)
                .first()
                .is_some_and(|pane| pane.ended && pane.code == Some(3))
        });
        let gone = panes_of(&session.0).remove(0);
        assert_eq!(gone.pid, 0, "a gone shell's pid may name another process");
        assert!(capture_pane(&gone.id, 100).unwrap().contains("last-words"));

        restart_service_pane(&gone.id, ".", "", &BTreeMap::new(), "echo sec''ond-run; sleep 30", None)
            .unwrap();
        let panes = panes_of(&session.0);
        assert_eq!(panes.len(), 1);
        assert_ne!(panes[0].id, gone.id, "a new shell took its place");
        assert!(!panes[0].ended);
        eventually("the line to run in the new shell", || {
            capture_pane(&panes[0].id, 100)
                .unwrap_or_default()
                .contains("second-run")
        });
    }

    /// Windows stops a pane with ^C before the kill, so a script's INT trap
    /// runs — including a script whose job MSYS started by exec, which the
    /// Windows process tree loses track of.
    #[cfg(windows)]
    #[test]
    fn a_waited_kill_lets_a_script_trap_its_ctrl_c_first() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("svc.sh"),
            "trap 'echo interrupted > svc.marker; exit 0' INT\n: > svc.started\nwhile :; do sleep 300; done\n",
        )
        .unwrap();
        let session = SessionGuard::new("trap");
        let root = dir.path().to_string_lossy().into_owned();
        start_project_services(&session.0, &root, &[service("svc", "bash ./svc.sh")], None)
            .unwrap();
        eventually("the script to start", || dir.path().join("svc.started").exists());
        std::thread::sleep(Duration::from_secs(1));

        kill_session_wait(&session.0).unwrap();

        assert!(dir.path().join("svc.marker").exists(), "the INT trap never ran");
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
        assert!(
            !crate::osproc::is_alive(pids[0] as u32),
            "the pane shell is still alive after a waited kill"
        );
    }

    #[test]
    fn splitting_adds_panes_without_disturbing_the_existing_ones() {
        let session = SessionGuard::new("split");
        start_project_services(&session.0, ".", &[service("db", "sleep 30")], None).unwrap();
        split_session_services(
            &session.0,
            ".",
            &[service("web", "sleep 30")],
            None,
            &HashSet::new(),
        )
        .unwrap();

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
        assert!(
            split_session_services(&session.0, ".", &additions, None, &HashSet::new()).is_err()
        );

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
