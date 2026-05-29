// Service lifecycle — port of desktop/projects.go's start/stop/toggle commands.
// Services run as tmux panes (see tmux.rs). Run-state (active profile + which
// services) is tracked per project FILE name. Remote projects run each pane
// through ssh (see config::ssh_command_line). Deferred to Phase 4b: port
// pollers/forwards and the unix-socket status server.
use crate::{config, tmux};
use std::collections::HashMap;
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
        self.running.lock().unwrap().get(name).cloned().unwrap_or_default()
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
            (s.cmd, s.cwd, s.env)
        })
        .collect()
}

fn resolve_pane_id(session: &str, pane_index: usize) -> Result<String, String> {
    tmux::list_pane_ids(session)
        .into_iter()
        .nth(pane_index)
        .ok_or_else(|| format!("pane index {pane_index} out of range"))
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
    tmux::start_project_services(&info.session, &info.root, &tuples_for(&info, &services), ssh_of(&info))?;
    state.set(name, RunState { profile: String::new(), services });
    let _ = app.emit("projects-changed", ());
    Ok(())
}

fn do_stop_project(
    app: &AppHandle,
    state: &State<'_, ServiceState>,
    name: &str,
) -> Result<(), String> {
    let info = config::spawn_info(name)?;
    state.clear(name);
    tmux::kill_session(&info.session)?;
    crate::portforward::stop_project_forwards(app, name); // tear down ssh -L tunnels + clear suggestions
    let _ = app.emit("projects-changed", ());
    Ok(())
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
    tmux::start_project_services(&info.session, &info.root, &tuples_for(&info, &services), ssh_of(&info))?;
    state.set(&name, RunState { profile, services: vec![] });
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
pub fn stop_project(app: AppHandle, state: State<'_, ServiceState>, name: String) -> Result<(), String> {
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

#[tauri::command(async)]
pub fn toggle_project_service(
    app: AppHandle,
    state: State<'_, ServiceState>,
    name: String,
    service_name: String,
) -> Result<(), String> {
    let info = config::spawn_info(&name)?;
    if !tmux::session_exists(&info.session) {
        return do_start_with_services(&app, &state, &name, vec![service_name]);
    }
    let running = config::resolve_running_services(&info, &state.get(&name));

    let next = if !running.contains(&service_name) {
        // turn on: split a new pane at the end
        let svc = info.services.get(&service_name).cloned().unwrap_or_default();
        tmux::split_session_pane(&info.session, &info.root, &svc.cmd, &svc.cwd, &svc.env, ssh_of(&info))?;
        let mut next = running.clone();
        next.push(service_name);
        next
    } else if running.len() == 1 {
        // turning off the only running service stops the whole project
        return do_stop_project(&app, &state, &name);
    } else {
        // turn off a non-last service: kill its pane (by ordinal)
        let idx = running.iter().position(|s| s == &service_name).unwrap();
        let pane_id = resolve_pane_id(&info.session, idx)?;
        tmux::kill_pane(&pane_id)?;
        running.into_iter().filter(|s| s != &service_name).collect()
    };

    state.set(&name, RunState { profile: String::new(), services: next });
    let _ = app.emit("projects-changed", ());
    Ok(())
}

#[tauri::command(async)]
pub fn start_service(
    state: State<'_, ServiceState>,
    project_name: String,
    pane_index: i64,
) -> Result<(), String> {
    let info = config::spawn_info(&project_name)?;
    let running = config::resolve_running_services(&info, &state.get(&project_name));
    let idx = usize::try_from(pane_index).map_err(|_| "invalid pane index".to_string())?;
    let svc_name = running.get(idx).ok_or_else(|| format!("pane index {idx} out of range"))?;
    let svc = info.services.get(svc_name).cloned().unwrap_or_default();
    let pane_id = resolve_pane_id(&info.session, idx)?;
    // Re-run the service command in its (cleared) pane. build_command lives in
    // tmux; reuse split's command form via a fresh send.
    tmux::restart_service_pane(&pane_id, &info.root, &svc.cwd, &svc.env, &svc.cmd, ssh_of(&info))
}

#[tauri::command(async)]
pub fn stop_service(
    state: State<'_, ServiceState>,
    project_name: String,
    pane_index: i64,
) -> Result<(), String> {
    let info = config::spawn_info(&project_name)?;
    let _ = state; // run-state not needed; pane index addresses the pane directly
    let idx = usize::try_from(pane_index).map_err(|_| "invalid pane index".to_string())?;
    let pane_id = resolve_pane_id(&info.session, idx)?;
    tmux::stop_service_pane(&pane_id)
}
