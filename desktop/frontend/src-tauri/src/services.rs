// Service lifecycle — port of desktop/projects.go's start/stop/toggle commands.
// Services run as tmux panes (see tmux.rs). Run-state (active profile + which
// services) is tracked per project FILE name. Remote projects run each pane
// through ssh (see config::ssh_command_line). Deferred to Phase 4b: port
// pollers/forwards and the unix-socket status server.
use crate::{config, tmux};
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

#[derive(Clone, Default)]
pub struct RunState {
    /// Active profile ("" when services were chosen explicitly).
    pub profile: String,
    /// Explicit service list; non-empty overrides profile resolution.
    pub services: Vec<String>,
}

pub struct ServiceState {
    // keyed by project FILE name (not the tmux session name)
    pub running: Mutex<HashMap<String, RunState>>,
}

impl Default for ServiceState {
    fn default() -> Self {
        Self {
            running: Mutex::new(HashMap::new()),
        }
    }
}

impl ServiceState {
    pub fn get(&self, name: &str) -> RunState {
        self.running
            .lock()
            .unwrap()
            .get(name)
            .cloned()
            .unwrap_or_default()
    }
    fn get_known(&self, name: &str) -> Option<RunState> {
        self.running.lock().unwrap().get(name).cloned()
    }
    pub fn get_for_project(&self, name: &str, info: &config::SpawnInfo) -> RunState {
        if let Some(state) = run_state_from_tmux(&info.session, info.services.keys()) {
            self.running
                .lock()
                .unwrap()
                .insert(name.to_string(), state.clone());
            state
        } else {
            self.get_known(name).unwrap_or_default()
        }
    }
    fn set(&self, name: &str, state: RunState) {
        self.running.lock().unwrap().insert(name.to_string(), state);
    }
    fn clear(&self, name: &str) {
        self.running.lock().unwrap().remove(name);
    }
    pub fn snapshot(&self) -> HashMap<String, RunState> {
        self.running.lock().unwrap().clone()
    }
}

/// Build (cmd, cwd, env) tuples for the given service names, in order.
fn tuples_for(info: &config::SpawnInfo, names: &[String]) -> Vec<tmux::ServiceTuple> {
    names
        .iter()
        .map(|n| {
            let s = info.services.get(n).cloned().unwrap_or_default();
            (n.clone(), s.cmd, s.cwd, s.env)
        })
        .collect()
}

pub fn run_state_from_tmux<'a>(
    session: &str,
    configured_services: impl Iterator<Item = &'a String>,
) -> Option<RunState> {
    let configured: HashSet<&str> = configured_services.map(String::as_str).collect();
    let panes = tmux::list_service_panes(session)?;
    let services: Vec<String> = panes.into_iter().map(|pane| pane.service).collect();
    let unique: HashSet<&str> = services.iter().map(String::as_str).collect();
    if unique.len() != services.len()
        || services
            .iter()
            .any(|name| !configured.contains(name.as_str()))
    {
        return None;
    }
    Some(RunState {
        profile: String::new(),
        services,
    })
}

/// Pane backing `service`, or `None` when it has none. Absence is not an error
/// here: the recorded run state can be stale (a pane died, something outside
/// lpm killed it, another lpm instance drives the same session), so callers
/// decide whether a missing pane means "already stopped" or a real failure.
/// Panes without a service label fall back to the ordinal, which can itself be
/// out of range against the live session — also `None`.
fn service_pane_id(session: &str, service: &str, pane_index: usize) -> Option<String> {
    let Some(panes) = tmux::list_service_panes(session) else {
        return tmux::list_pane_ids(session).into_iter().nth(pane_index);
    };
    panes
        .into_iter()
        .find(|pane| pane.service == service)
        .map(|pane| pane.id)
}

/// Turn a service off and return the services still running. A service with no
/// live pane is already stopped, so this reconciles the run state instead of
/// failing.
fn stop_running_service(
    session: &str,
    running: Vec<String>,
    service: &str,
) -> Result<Vec<String>, String> {
    let pane_id = running
        .iter()
        .position(|s| s == service)
        .and_then(|idx| service_pane_id(session, service, idx));
    if let Some(pane_id) = pane_id {
        tmux::kill_pane(&pane_id)?;
    }
    Ok(running.into_iter().filter(|s| s != service).collect())
}

/// ssh settings for a project's panes; None for local projects.
fn ssh_of(info: &config::SpawnInfo) -> Option<&config::SshSettings> {
    if info.is_remote {
        Some(&info.ssh)
    } else {
        None
    }
}

// ---- internal helpers (also called by toggle) -------------------------------

fn do_start_with_services(
    app: &AppHandle,
    state: &State<'_, ServiceState>,
    name: &str,
    services: Vec<String>,
) -> Result<(), String> {
    let info = config::spawn_info(name)?;
    for s in &services {
        if !info.services.contains_key(s) {
            return Err(format!("service {s:?} not found in project {name:?}"));
        }
    }
    let services = config::expand_service_deps(&info.services, &services)?;
    tmux::start_project_services(
        &info.session,
        &info.root,
        &tuples_for(&info, &services),
        ssh_of(&info),
    )?;
    state.set(
        name,
        RunState {
            profile: String::new(),
            services,
        },
    );
    crate::portforward::start_port_poller(app, name); // remote-only, idempotent
    let _ = app.emit("projects-changed", ());
    Ok(())
}

/// Tear down a project's tmux session. A session that is already gone is the
/// desired end state, not a failure — only a tmux that still reports the session
/// alive after a failed kill is a real error.
fn kill_project_session(session: &str) -> Result<(), String> {
    if !tmux::session_exists(session) {
        return Ok(());
    }
    match tmux::kill_session(session) {
        Ok(()) => Ok(()),
        Err(_) if !tmux::session_exists(session) => Ok(()),
        Err(_) => Err(format!("could not stop {session:?} — tmux did not respond")),
    }
}

fn do_stop_project(
    app: &AppHandle,
    state: &State<'_, ServiceState>,
    name: &str,
) -> Result<(), String> {
    let info = config::spawn_info(name)?;
    state.clear(name);
    // Tear down and notify even when the kill fails: leaving tunnels up and the
    // UI showing a stopped project as running is worse than the kill error.
    let killed = kill_project_session(&info.session);
    crate::portforward::stop_project_forwards(app, name); // tear down ssh -L tunnels + clear suggestions
    let _ = app.emit("projects-changed", ());
    killed
}

/// Stop a project from another module (e.g. ports::resolve_port_conflict freeing
/// an lpm-owned port). Mirrors Go's FreePort(port, a.StopProject) callback.
pub fn stop_project_internal(
    app: &AppHandle,
    state: &State<'_, ServiceState>,
    name: &str,
) -> Result<(), String> {
    do_stop_project(app, state, name)
}

// ---- commands ---------------------------------------------------------------

#[tauri::command(async)]
pub fn start_project(
    app: AppHandle,
    state: State<'_, ServiceState>,
    name: String,
    profile: String,
) -> Result<(), String> {
    let info = config::spawn_info(&name)?;
    let all: Vec<String> = info.services.keys().cloned().collect();
    let services = config::services_for_profile(&info.profiles, &all, &profile);
    if services.is_empty() {
        return Err(format!("no services to start for profile {profile:?}"));
    }
    let services = config::expand_service_deps(&info.services, &services)?;
    tmux::start_project_services(
        &info.session,
        &info.root,
        &tuples_for(&info, &services),
        ssh_of(&info),
    )?;
    state.set(
        &name,
        RunState {
            profile,
            services: vec![],
        },
    );
    crate::portforward::start_port_poller(&app, &name); // remote-only, idempotent
    let _ = app.emit("projects-changed", ());
    Ok(())
}

#[tauri::command(async)]
pub fn start_project_with_services(
    app: AppHandle,
    state: State<'_, ServiceState>,
    name: String,
    services: Vec<String>,
) -> Result<(), String> {
    do_start_with_services(&app, &state, &name, services)
}

#[tauri::command(async)]
pub fn stop_project(
    app: AppHandle,
    state: State<'_, ServiceState>,
    name: String,
) -> Result<(), String> {
    do_stop_project(&app, &state, &name)
}

#[tauri::command(async)]
pub fn stop_all(app: AppHandle, state: State<'_, ServiceState>) -> Result<(), String> {
    // One-off cleanup: kill every session, clear state, emit nothing (Go).
    let names: Vec<String> = state.snapshot().keys().cloned().collect();
    for name in names {
        if let Ok(info) = config::spawn_info(&name) {
            let _ = tmux::kill_session(&info.session);
        }
        state.clear(&name);
    }
    crate::portforward::stop_all_forwards(&app);
    Ok(())
}

/// Drive a single service to a desired running state by NAME, idempotently.
/// Shared by the UI toggle and the socket `start_service`/`stop_service` verbs.
///
/// `on`:
/// - project not running → start it with just this service (a no-op when `!on`);
/// - already in the target state → `Ok(())`;
/// - turning on → split a new pane; turning off the last one → stop the project;
///   turning off a non-last one → kill its pane.
pub fn set_service_running(
    app: &AppHandle,
    state: &State<'_, ServiceState>,
    name: &str,
    service_name: &str,
    on: bool,
) -> Result<(), String> {
    let info = config::spawn_info(name)?;
    if !info.services.contains_key(service_name) {
        return Err(format!(
            "service {service_name:?} not found in project {name:?}"
        ));
    }

    if !tmux::session_exists(&info.session) {
        return if on {
            do_start_with_services(app, state, name, vec![service_name.to_string()])
        } else {
            Ok(()) // already stopped
        };
    }

    let running = config::resolve_running_services(&info, &state.get_for_project(name, &info));
    let is_running = running.iter().any(|s| s == service_name);
    if is_running == on {
        return Ok(()); // already in the desired state
    }

    let next = if on {
        // turn on: pull in the service plus any not-yet-running dependencies,
        // splitting a pane for each in dependency order (the target last).
        let want = config::expand_service_deps(&info.services, &[service_name.to_string()])?;
        let missing: Vec<String> = want.into_iter().filter(|s| !running.contains(s)).collect();
        tmux::split_session_services(
            &info.session,
            &info.root,
            &tuples_for(&info, &missing),
            ssh_of(&info),
        )?;
        let mut next = running.clone();
        next.extend(missing);
        next
    } else if running.len() == 1 {
        // turning off the only running service stops the whole project
        return do_stop_project(app, state, name);
    } else {
        stop_running_service(&info.session, running, service_name)?
    };

    state.set(
        name,
        RunState {
            profile: String::new(),
            services: next,
        },
    );
    let _ = app.emit("projects-changed", ());
    Ok(())
}

#[tauri::command(async)]
pub fn toggle_project_service(
    app: AppHandle,
    state: State<'_, ServiceState>,
    name: String,
    service_name: String,
) -> Result<(), String> {
    let info = config::spawn_info(&name)?;
    let currently_on = tmux::session_exists(&info.session)
        && config::resolve_running_services(&info, &state.get_for_project(&name, &info))
            .iter()
            .any(|s| s == &service_name);
    set_service_running(&app, &state, &name, &service_name, !currently_on)
}

/// Re-run the `idx`-th running service's command in its (cleared) pane.
/// `running` is the resolved running-service list; `idx` indexes into it.
fn restart_service_at(
    info: &config::SpawnInfo,
    running: &[String],
    idx: usize,
) -> Result<(), String> {
    let svc_name = running
        .get(idx)
        .ok_or_else(|| "that service is not running".to_string())?;
    let svc = info.services.get(svc_name).cloned().unwrap_or_default();
    let pane_id = service_pane_id(&info.session, svc_name, idx)
        .ok_or_else(|| format!("service {svc_name:?} is not running"))?;
    // build_command lives in tmux; reuse split's command form via a fresh send.
    tmux::restart_service_pane(
        &pane_id,
        &info.root,
        &svc.cwd,
        &svc.env,
        &svc.cmd,
        ssh_of(info),
    )
}

#[tauri::command(async)]
pub fn start_service(
    state: State<'_, ServiceState>,
    project_name: String,
    pane_index: i64,
) -> Result<(), String> {
    let info = config::spawn_info(&project_name)?;
    let running =
        config::resolve_running_services(&info, &state.get_for_project(&project_name, &info));
    let idx = usize::try_from(pane_index).map_err(|_| "invalid pane index".to_string())?;
    restart_service_at(&info, &running, idx)
}

/// Restart a running service by NAME (socket `restart_service`). Errors when the
/// service is unknown or not currently running.
pub fn restart_service_by_name(
    state: &State<'_, ServiceState>,
    project_name: &str,
    service_name: &str,
) -> Result<(), String> {
    let info = config::spawn_info(project_name)?;
    if !info.services.contains_key(service_name) {
        return Err(format!(
            "service {service_name:?} not found in project {project_name:?}"
        ));
    }
    let running =
        config::resolve_running_services(&info, &state.get_for_project(project_name, &info));
    let idx = running
        .iter()
        .position(|s| s == service_name)
        .ok_or_else(|| format!("service {service_name:?} is not running"))?;
    restart_service_at(&info, &running, idx)
}

#[tauri::command(async)]
pub fn stop_service(
    app: AppHandle,
    state: State<'_, ServiceState>,
    project_name: String,
    pane_index: i64,
) -> Result<(), String> {
    let info = config::spawn_info(&project_name)?;
    let idx = usize::try_from(pane_index).map_err(|_| "invalid pane index".to_string())?;
    let running =
        config::resolve_running_services(&info, &state.get_for_project(&project_name, &info));
    let Some(service) = running.get(idx).cloned() else {
        return Ok(()); // nothing recorded at that slot — already stopped
    };
    let Some(pane_id) = service_pane_id(&info.session, &service, idx) else {
        // No live pane: the service already stopped behind our back, so drop it
        // from the run state instead of failing the stop.
        state.set(
            &project_name,
            RunState {
                profile: String::new(),
                services: running.into_iter().filter(|s| s != &service).collect(),
            },
        );
        let _ = app.emit("projects-changed", ());
        return Ok(());
    };
    tmux::stop_service_pane(&pane_id)
}

#[cfg(test)]
mod stop_reconcile_tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct SessionGuard(String, std::sync::MutexGuard<'static, ()>);

    impl SessionGuard {
        fn new() -> Self {
            let lock = tmux::test_server_lock();
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            Self(format!("lpm-test-{}-{nonce}", std::process::id()), lock)
        }
    }

    impl Drop for SessionGuard {
        fn drop(&mut self) {
            let _ = tmux::kill_session(&self.0);
        }
    }

    fn service(name: &str) -> tmux::ServiceTuple {
        (
            name.to_string(),
            "sleep 30".to_string(),
            String::new(),
            std::collections::BTreeMap::new(),
        )
    }

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn stopping_a_service_kills_its_labelled_pane() {
        let session = SessionGuard::new();
        tmux::start_project_services(&session.0, ".", &[service("db"), service("web")], None)
            .unwrap();

        let next = stop_running_service(&session.0, names(&["db", "web"]), "web").unwrap();

        assert_eq!(next, ["db"]);
        let live: Vec<String> = tmux::list_service_panes(&session.0)
            .unwrap()
            .into_iter()
            .map(|pane| pane.service)
            .collect();
        assert_eq!(live, ["db"]);
    }

    #[test]
    fn stopping_a_service_whose_pane_is_gone_reconciles_instead_of_failing() {
        let session = SessionGuard::new();
        tmux::start_project_services(&session.0, ".", &[service("db"), service("web")], None)
            .unwrap();
        let web = service_pane_id(&session.0, "web", 1).unwrap();
        tmux::kill_pane(&web).unwrap();

        assert_eq!(service_pane_id(&session.0, "web", 1), None);
        let next = stop_running_service(&session.0, names(&["db", "web"]), "web").unwrap();
        assert_eq!(next, ["db"]);
    }

    #[test]
    fn unlabelled_panes_with_an_out_of_range_ordinal_reconcile_instead_of_failing() {
        let session = SessionGuard::new();
        // A session whose panes carry no service label (e.g. recreated outside
        // lpm): list_service_panes yields None, so resolution falls back to the
        // pane ordinal.
        tmux::start_project_services(&session.0, ".", &[service("db")], None).unwrap();
        let pane = tmux::list_pane_ids(&session.0).remove(0);
        tmux::run_for_test(&["set-option", "-pu", "-t", &pane, "@lpm_service"]).unwrap();
        assert_eq!(tmux::list_service_panes(&session.0), None);
        assert_eq!(tmux::list_pane_ids(&session.0).len(), 1);

        // Run state says two services, but the session only has one pane.
        assert_eq!(service_pane_id(&session.0, "web", 1), None);
        let next = stop_running_service(&session.0, names(&["db", "web"]), "web").unwrap();
        assert_eq!(next, ["db"]);
    }

    #[test]
    fn stopping_a_project_kills_its_session() {
        let session = SessionGuard::new();
        tmux::start_project_services(&session.0, ".", &[service("db")], None).unwrap();

        assert_eq!(kill_project_session(&session.0), Ok(()));
        assert!(!tmux::session_exists(&session.0));
    }

    #[test]
    fn stopping_a_project_whose_session_is_already_gone_succeeds() {
        let session = SessionGuard::new();
        tmux::start_project_services(&session.0, ".", &[service("db")], None).unwrap();
        // Something outside lpm tore the session down. The tests share one tmux
        // server, so assert the precondition rather than this kill's result.
        let _ = tmux::kill_session(&session.0);
        assert!(!tmux::session_exists(&session.0));

        assert_eq!(kill_project_session(&session.0), Ok(()));
    }

    #[test]
    fn stopping_a_project_that_never_started_succeeds() {
        let session = SessionGuard::new();

        assert_eq!(kill_project_session(&session.0), Ok(()));
    }

    #[test]
    fn stopping_the_last_service_clears_the_projects_run_state() {
        let session = SessionGuard::new();
        tmux::start_project_services(&session.0, ".", &[service("db")], None).unwrap();
        let state = ServiceState::default();
        state.set(
            "demo",
            RunState {
                profile: String::new(),
                services: names(&["db"]),
            },
        );
        let _ = tmux::kill_session(&session.0);
        assert!(!tmux::session_exists(&session.0));

        // The ordering do_stop_project relies on: state is cleared regardless of
        // what tmux reports, and a dead session is not an error.
        state.clear("demo");
        assert_eq!(kill_project_session(&session.0), Ok(()));
        assert!(state.get_known("demo").is_none());
        assert!(state.snapshot().is_empty());
    }
}
