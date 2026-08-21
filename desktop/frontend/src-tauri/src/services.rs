// Service lifecycle — port of desktop/projects.go's start/stop/toggle commands.
// Services run as panes of lpm's session daemon (see sessions.rs). Run-state
// (active profile + which services) is tracked per project FILE name, but the
// daemon is the source of truth: it outlives the app, so the recorded state is
// rebuilt from the panes' service labels on every read. Remote projects run each pane
// through ssh (see config::ssh_command_line). Deferred to Phase 4b: port
// pollers/forwards and the unix-socket status server.
use crate::{config, sessions};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

#[derive(Clone, Default)]
pub struct RunState {
    /// Active profile ("" when services were chosen explicitly).
    pub profile: String,
    /// Explicit service list; non-empty overrides profile resolution.
    pub services: Vec<String>,
}

#[derive(Default)]
pub struct ServiceState {
    // keyed by project FILE name (not the session name)
    pub running: Mutex<HashMap<String, RunState>>,
    ops: Mutex<HashMap<String, Arc<Mutex<()>>>>,
}

impl ServiceState {
    /// Per-project lifecycle lock. Start/stop/toggle are reachable concurrently
    /// from the Tauri command pool, socket threads, and the mobile WS thread;
    /// every public entry point holds this for its whole read-decide-act span
    /// so overlapping operations on one project cannot interleave (concurrent
    /// starts kill each other's half-built session, concurrent toggles
    /// double-spawn panes). The internal `do_*` helpers assume the caller
    /// already holds it — std Mutex is not reentrant.
    fn op_lock(&self, name: &str) -> Arc<Mutex<()>> {
        self.ops
            .lock()
            .unwrap()
            .entry(name.to_string())
            .or_default()
            .clone()
    }
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
        if let Some(state) = run_state_from_session(&info.session, info.services.keys()) {
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
fn tuples_for(info: &config::SpawnInfo, names: &[String]) -> Vec<sessions::ServiceTuple> {
    names
        .iter()
        .map(|n| {
            let s = info.services.get(n).cloned().unwrap_or_default();
            (n.clone(), s.cmd, s.cwd, s.env)
        })
        .collect()
}

pub fn run_state_from_session<'a>(
    session: &str,
    configured_services: impl Iterator<Item = &'a String>,
) -> Option<RunState> {
    let configured: HashSet<&str> = configured_services.map(String::as_str).collect();
    let panes = sessions::list_service_panes(session)?;
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

/// How a service resolved to a pane. `Gone` means the pane is verifiably
/// absent (the service stopped behind our back — reconcile the run state);
/// `Unidentifiable` means resolution had to refuse: the panes carry no service
/// labels and the live pane count doesn't match the recorded running list, so
/// the ordinal would point at the wrong pane (e.g. the user's own shell).
/// Recording the service as stopped in that case would be a silent lie — the
/// pane may well still be running — so callers surface an error instead.
#[derive(Debug, PartialEq)]
enum PaneLookup {
    Found(String),
    Gone,
    Unidentifiable,
}

fn service_pane_id(
    session: &str,
    service: &str,
    pane_index: usize,
    running_len: usize,
) -> PaneLookup {
    // One round trip answers both halves: the labels when every pane carries
    // one, and the creation-order fallback when they don't.
    let panes = sessions::panes_of(session);
    // Labelled resolution needs a non-empty list where EVERY pane carries a
    // label — the same condition list_service_panes used to encode as `None`.
    let labelled = !panes.is_empty() && panes.iter().all(|pane| !pane.service.is_empty());
    if labelled {
        return match panes.into_iter().find(|pane| pane.service == service) {
            Some(pane) => PaneLookup::Found(pane.id),
            None => PaneLookup::Gone,
        };
    }
    if panes.len() != running_len {
        return PaneLookup::Unidentifiable;
    }
    match panes.into_iter().nth(pane_index) {
        Some(pane) => PaneLookup::Found(pane.id),
        None => PaneLookup::Gone,
    }
}

fn unidentifiable_pane_error(service: &str) -> String {
    format!(
        "can't tell which pane is running {service:?} — the session has panes lpm didn't start; stop the whole project instead"
    )
}

/// Turn a service off and return the services still running. A service with no
/// live pane is already stopped, so this reconciles the run state instead of
/// failing; a pane that can't be identified is an error, never a guess.
fn stop_running_service(
    session: &str,
    running: Vec<String>,
    service: &str,
) -> Result<Vec<String>, String> {
    if let Some(idx) = running.iter().position(|s| s == service) {
        match service_pane_id(session, service, idx, running.len()) {
            PaneLookup::Found(pane_id) => sessions::kill_pane(&pane_id)?,
            PaneLookup::Gone => {}
            PaneLookup::Unidentifiable => return Err(unidentifiable_pane_error(service)),
        }
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
    if let Err(e) = sessions::start_project_services(
        &info.session,
        &info.root,
        &tuples_for(&info, &services),
        ssh_of(&info),
    ) {
        // The failed start already tore down any pre-existing session, so
        // keeping the old run state would show a dead project as running.
        state.clear(name);
        let _ = app.emit("projects-changed", ());
        return Err(e);
    }
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

/// Tear down a project's session, reaping its process trees before returning so
/// a follow-up start's port-conflict check cannot race the dying processes. A
/// session that is already gone is the desired end state, not a failure — only a
/// daemon that still reports the session alive after a failed kill is a real
/// error.
fn kill_project_session(session: &str) -> Result<(), String> {
    if !sessions::session_exists(session) {
        return Ok(());
    }
    match sessions::kill_session_wait(session) {
        Ok(()) => Ok(()),
        Err(_) if !sessions::session_exists(session) => Ok(()),
        Err(_) => Err(format!(
            "could not stop {session:?} — the session daemon did not respond"
        )),
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
    let op = state.op_lock(name);
    let _op = op.lock().unwrap();
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
    let op = state.op_lock(&name);
    let _op = op.lock().unwrap();
    let info = config::spawn_info(&name)?;
    let all: Vec<String> = info.services.keys().cloned().collect();
    let services = config::services_for_profile(&info.profiles, &all, &profile);
    if services.is_empty() {
        return Err(format!("no services to start for profile {profile:?}"));
    }
    let services = config::expand_service_deps(&info.services, &services)?;
    if let Err(e) = sessions::start_project_services(
        &info.session,
        &info.root,
        &tuples_for(&info, &services),
        ssh_of(&info),
    ) {
        // The failed start already tore down any pre-existing session, so
        // keeping the old run state would show a dead project as running.
        state.clear(&name);
        let _ = app.emit("projects-changed", ());
        return Err(e);
    }
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
    let op = state.op_lock(&name);
    let _op = op.lock().unwrap();
    do_start_with_services(&app, &state, &name, services)
}

#[tauri::command(async)]
pub fn stop_project(
    app: AppHandle,
    state: State<'_, ServiceState>,
    name: String,
) -> Result<(), String> {
    let op = state.op_lock(&name);
    let _op = op.lock().unwrap();
    do_stop_project(&app, &state, &name)
}

#[tauri::command(async)]
pub fn stop_all(app: AppHandle, state: State<'_, ServiceState>) -> Result<(), String> {
    // Uninstall-time sweep. The in-memory map is empty after a relaunch, so the
    // kill list is every configured project whose session is live —
    // and uninstall must not return before those sessions' processes are dead.
    // Best-effort per project: one failure must not abort the sweep.
    let live = sessions::running_sessions();
    let mut failures: Vec<String> = Vec::new();
    for name in config::project_names() {
        let op = state.op_lock(&name);
        let _op = op.lock().unwrap();
        if let Ok(info) = config::spawn_info(&name) {
            if live.contains(&info.session) {
                if let Err(e) = sessions::kill_session_wait(&info.session) {
                    failures.push(format!("{name}: {e}"));
                }
            }
        }
        state.clear(&name);
    }
    // Recorded names whose config is gone still need their state dropped.
    state.running.lock().unwrap().clear();
    // And so does a session whose project file was deleted: the loop above can
    // only reach configured projects, but the daemon still holds that session.
    // This is also what the Linux uninstall's --stop-sessions does, so both
    // platforms end in the same place.
    let _ = sessions::shutdown_daemon();
    crate::portforward::stop_all_forwards(&app);
    if failures.is_empty() {
        Ok(())
    } else {
        Err(failures.join("; "))
    }
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
    let op = state.op_lock(name);
    let _op = op.lock().unwrap();
    do_set_service_running(app, state, name, service_name, on)
}

fn do_set_service_running(
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

    if !sessions::session_exists(&info.session) {
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
        sessions::split_session_services(
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
    let op = state.op_lock(&name);
    let _op = op.lock().unwrap();
    let info = config::spawn_info(&name)?;
    let currently_on = sessions::session_exists(&info.session)
        && config::resolve_running_services(&info, &state.get_for_project(&name, &info))
            .iter()
            .any(|s| s == &service_name);
    do_set_service_running(&app, &state, &name, &service_name, !currently_on)
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
    let pane_id = match service_pane_id(&info.session, svc_name, idx, running.len()) {
        PaneLookup::Found(id) => id,
        PaneLookup::Gone => return Err(format!("service {svc_name:?} is not running")),
        PaneLookup::Unidentifiable => return Err(unidentifiable_pane_error(svc_name)),
    };
    // build_command lives in sessions; reuse split's command form via a fresh send.
    sessions::restart_service_pane(
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
    let op = state.op_lock(&project_name);
    let _op = op.lock().unwrap();
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
    let op = state.op_lock(project_name);
    let _op = op.lock().unwrap();
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
    let op = state.op_lock(&project_name);
    let _op = op.lock().unwrap();
    let info = config::spawn_info(&project_name)?;
    let idx = usize::try_from(pane_index).map_err(|_| "invalid pane index".to_string())?;
    let running =
        config::resolve_running_services(&info, &state.get_for_project(&project_name, &info));
    let Some(service) = running.get(idx).cloned() else {
        return Ok(()); // nothing recorded at that slot — already stopped
    };
    match service_pane_id(&info.session, &service, idx, running.len()) {
        PaneLookup::Found(pane_id) => sessions::stop_service_pane(&pane_id),
        PaneLookup::Gone => {
            // No live pane: the service already stopped behind our back, so drop
            // it from the run state instead of failing the stop.
            state.set(
                &project_name,
                RunState {
                    profile: String::new(),
                    services: running.into_iter().filter(|s| s != &service).collect(),
                },
            );
            let _ = app.emit("projects-changed", ());
            Ok(())
        }
        PaneLookup::Unidentifiable => Err(unidentifiable_pane_error(&service)),
    }
}

#[cfg(test)]
mod stop_reconcile_tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct SessionGuard(String);

    impl SessionGuard {
        fn new() -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            Self(format!("lpm-test-{}-{nonce}", std::process::id()))
        }
    }

    impl Drop for SessionGuard {
        fn drop(&mut self) {
            let _ = sessions::kill_session(&self.0);
        }
    }

    fn service(name: &str) -> sessions::ServiceTuple {
        (
            name.to_string(),
            "sleep 30".to_string(),
            String::new(),
            std::collections::BTreeMap::new(),
        )
    }

    /// A pane with no service label. lpm labels every pane it opens, so this
    /// stands in for a session that isn't ours to reason about — the case the
    /// `Unidentifiable` guard exists for.
    fn unlabelled() -> sessions::ServiceTuple {
        service("")
    }

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn stopping_a_service_kills_its_labelled_pane() {
        let session = SessionGuard::new();
        sessions::start_project_services(&session.0, ".", &[service("db"), service("web")], None)
            .unwrap();

        let next = stop_running_service(&session.0, names(&["db", "web"]), "web").unwrap();

        assert_eq!(next, ["db"]);
        let live: Vec<String> = sessions::list_service_panes(&session.0)
            .unwrap()
            .into_iter()
            .map(|pane| pane.service)
            .collect();
        assert_eq!(live, ["db"]);
    }

    #[test]
    fn stopping_a_service_whose_pane_is_gone_reconciles_instead_of_failing() {
        let session = SessionGuard::new();
        sessions::start_project_services(&session.0, ".", &[service("db"), service("web")], None)
            .unwrap();
        let web = match service_pane_id(&session.0, "web", 1, 2) {
            PaneLookup::Found(id) => id,
            other => panic!("expected a live pane, got {other:?}"),
        };
        sessions::kill_pane(&web).unwrap();

        assert_eq!(service_pane_id(&session.0, "web", 1, 2), PaneLookup::Gone);
        let next = stop_running_service(&session.0, names(&["db", "web"]), "web").unwrap();
        assert_eq!(next, ["db"]);
    }

    #[test]
    fn unlabelled_panes_with_a_count_mismatch_refuse_instead_of_guessing() {
        let session = SessionGuard::new();
        // A session whose panes carry no service label: list_service_panes
        // yields None, so resolution falls back to the pane ordinal.
        sessions::start_project_services(&session.0, ".", &[unlabelled()], None).unwrap();
        assert_eq!(sessions::list_service_panes(&session.0), None);
        assert_eq!(sessions::list_pane_ids(&session.0).len(), 1);

        // Run state says two services, but the session only has one pane: the
        // survivor could be either service, so guessing would record a live
        // service as stopped. Refuse with an error instead.
        assert_eq!(
            service_pane_id(&session.0, "web", 1, 2),
            PaneLookup::Unidentifiable
        );
        assert!(stop_running_service(&session.0, names(&["db", "web"]), "web").is_err());
        assert_eq!(sessions::list_pane_ids(&session.0).len(), 1);

        // With matching counts the ordinal fallback still resolves.
        assert!(matches!(
            service_pane_id(&session.0, "db", 0, 1),
            PaneLookup::Found(_)
        ));
    }

    #[test]
    fn an_extra_unlabelled_pane_never_takes_the_kill_meant_for_a_service() {
        let session = SessionGuard::new();
        // An unlabelled pane sits before the target, which voids labelled
        // resolution for the whole session.
        sessions::start_project_services(&session.0, ".", &[unlabelled(), service("web")], None)
            .unwrap();
        assert_eq!(sessions::list_service_panes(&session.0), None);

        // The recorded run state knows only "web": indexing it into live pane
        // order would hit the shell pane, so resolution must refuse — with an
        // error, not a silent run-state drop that would show "web" as stopped
        // while its pane keeps running.
        assert_eq!(
            service_pane_id(&session.0, "web", 0, 1),
            PaneLookup::Unidentifiable
        );
        assert!(stop_running_service(&session.0, names(&["web"]), "web").is_err());
        assert_eq!(sessions::list_pane_ids(&session.0).len(), 2);
    }

    #[test]
    fn stopping_a_project_kills_its_session() {
        let session = SessionGuard::new();
        sessions::start_project_services(&session.0, ".", &[service("db")], None).unwrap();

        assert_eq!(kill_project_session(&session.0), Ok(()));
        assert!(!sessions::session_exists(&session.0));
    }

    #[test]
    fn stopping_a_project_whose_session_is_already_gone_succeeds() {
        let session = SessionGuard::new();
        sessions::start_project_services(&session.0, ".", &[service("db")], None).unwrap();
        // Something outside lpm tore the session down.
        let _ = sessions::kill_session(&session.0);
        assert!(!sessions::session_exists(&session.0));

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
        sessions::start_project_services(&session.0, ".", &[service("db")], None).unwrap();
        let state = ServiceState::default();
        state.set(
            "demo",
            RunState {
                profile: String::new(),
                services: names(&["db"]),
            },
        );
        let _ = sessions::kill_session(&session.0);
        assert!(!sessions::session_exists(&session.0));

        // The ordering do_stop_project relies on: state is cleared regardless of
        // what the daemon reports, and a dead session is not an error.
        state.clear("demo");
        assert_eq!(kill_project_session(&session.0), Ok(()));
        assert!(state.get_known("demo").is_none());
        assert!(state.snapshot().is_empty());
    }
}
