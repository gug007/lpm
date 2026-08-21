// Port-conflict detection — port of internal/portcheck + desktop/portconflicts.go.
// LOCAL only (holder lookup lives in portsprobe.rs); these feed the start-flow
// conflict dialog. The SSH
// port-forwarding + suggestion + poller commands stay safe stubs and are
// DEFERRED with remote-SSH (the Ports popover is gated on project.isRemote, so
// none of that renders for local projects yet).
use crate::config;
use crate::portsprobe::{listening_ports, lookup_holders, Holder};
use crate::services::ServiceState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::TcpListener;
use std::process::Command;
use std::time::{Duration, Instant};
use tauri::{AppHandle, State};

#[derive(Serialize, Deserialize, Clone)]
pub struct PortConflictInfo {
    pub service: String,
    pub port: i64,
    pub pid: i64, // 0 when unidentifiable
    pub process: String,
    #[serde(rename = "lpmProject")]
    pub lpm_project: String,
    pub description: String,
    /// The owning entry's portConflict policy ("" | "ask" | "free" | "fail"),
    /// so the frontend can resolve each conflict per its own policy.
    #[serde(
        rename = "portConflict",
        default,
        skip_serializing_if = "String::is_empty"
    )]
    pub port_conflict: String,
}

/// Ports a running service's process tree is currently listening on, keyed by
/// service name. `ports` is empty while a service hasn't bound anything yet.
#[derive(Serialize, Clone)]
pub struct ServicePorts {
    pub service: String,
    pub ports: Vec<i64>,
}

fn holder_phrase(h: &Holder, lpm_project: &str) -> String {
    if !lpm_project.is_empty() {
        format!("lpm project {lpm_project:?}")
    } else if h.pid > 0 && !h.command.is_empty() {
        format!("{} (PID {})", h.command, h.pid)
    } else if h.pid > 0 {
        format!("PID {}", h.pid)
    } else {
        "an unknown local process".into()
    }
}

pub(crate) fn can_bind(port: i64) -> bool {
    TcpListener::bind(("127.0.0.1", port as u16)).is_ok()
}

/// (holder, taken). Falls back to a bind probe for holders lsof can't name.
fn probe(port: i64) -> (Holder, bool) {
    if let Some(h) = lookup_holders(&[port]).remove(&port) {
        return (h, true);
    }
    if !can_bind(port) {
        return (Holder::default(), true);
    }
    (Holder::default(), false)
}

// ---- classify a holder pid -> lpm project (via tmux pane ancestry) ----------

fn lpm_pane_index() -> HashMap<i64, String> {
    let mut idx = HashMap::new();
    let out = Command::new("tmux")
        .args(["list-panes", "-a", "-F", "#{pane_pid} #{session_name}"])
        .output();
    let Ok(o) = out else { return idx };
    if !o.status.success() {
        return idx;
    }
    let mut session_to_project = HashMap::new();
    for name in config::project_names() {
        if let Ok(info) = config::spawn_info(&name) {
            session_to_project.insert(info.session, name);
        }
    }
    for line in String::from_utf8_lossy(&o.stdout).trim().split('\n') {
        let mut f = line.split_whitespace();
        if let (Some(pid), Some(sess)) = (f.next(), f.next()) {
            if let (Ok(pid), Some(proj)) = (pid.parse::<i64>(), session_to_project.get(sess)) {
                idx.insert(pid, proj.clone());
            }
        }
    }
    idx
}

fn process_parents() -> HashMap<i64, i64> {
    let mut parents = HashMap::new();
    if let Ok(o) = Command::new("ps").args(["-e", "-o", "pid=,ppid="]).output() {
        for line in String::from_utf8_lossy(&o.stdout).split('\n') {
            let f: Vec<&str> = line.split_whitespace().collect();
            if f.len() == 2 {
                if let (Ok(pid), Ok(ppid)) = (f[0].parse(), f[1].parse()) {
                    parents.insert(pid, ppid);
                }
            }
        }
    }
    parents
}

/// Walk a holder pid up its ancestry until it lands on a known pane pid, and
/// return that pane's mapped value (a project name or a service name, depending
/// on the index passed). Bounded to 32 hops to stay cheap and loop-proof.
fn walk_to_owner<T: Clone>(
    pid: i64,
    pane_map: &HashMap<i64, T>,
    parents: &HashMap<i64, i64>,
) -> Option<T> {
    if pane_map.is_empty() {
        return None;
    }
    let mut cur = pid;
    for _ in 0..32 {
        if cur <= 1 {
            return None;
        }
        if let Some(v) = pane_map.get(&cur) {
            return Some(v.clone());
        }
        cur = *parents.get(&cur)?;
    }
    None
}

fn walk_to_project(
    pid: i64,
    pane_idx: &HashMap<i64, String>,
    parents: &HashMap<i64, i64>,
) -> String {
    walk_to_owner(pid, pane_idx, parents).unwrap_or_default()
}

fn to_info(service: &str, port: i64, h: &Holder, project: &str, policy: &str) -> PortConflictInfo {
    PortConflictInfo {
        service: service.into(),
        port,
        pid: h.pid,
        process: h.command.clone(),
        lpm_project: project.into(),
        description: holder_phrase(h, project),
        port_conflict: policy.into(),
    }
}

fn check_services(info: &config::SpawnInfo, service_names: &[String]) -> Vec<PortConflictInfo> {
    if info.is_remote {
        return vec![]; // remote ports are checked on the remote host (deferred)
    }
    let mut wants: Vec<(String, i64)> = vec![];
    let mut ports: Vec<i64> = vec![];
    for n in service_names {
        if let Some(svc) = info.services.get(n) {
            if svc.port > 0 {
                wants.push((n.clone(), svc.port));
                ports.push(svc.port);
            }
        }
    }
    if wants.is_empty() {
        return vec![];
    }
    let holders = lookup_holders(&ports);
    let mut pane_idx = HashMap::new();
    let mut parents = HashMap::new();
    let mut indexed = false;
    let mut out = vec![];
    for (service, port) in wants {
        let (holder, taken) = match holders.get(&port) {
            Some(h) => (h.clone(), true),
            None => (Holder::default(), !can_bind(port)),
        };
        if !taken {
            continue;
        }
        if !indexed {
            pane_idx = lpm_pane_index();
            parents = process_parents();
            indexed = true;
        }
        let project = walk_to_project(holder.pid, &pane_idx, &parents);
        if project == info.file_name {
            continue; // our own running service — not a conflict
        }
        let policy = info
            .services
            .get(&service)
            .map(|s| s.port_conflict.clone())
            .unwrap_or_default();
        out.push(to_info(&service, port, &holder, &project, &policy));
    }
    out
}

fn check_action_port(action: &str, ports: &[i64], policy: &str) -> Vec<PortConflictInfo> {
    let ports: Vec<i64> = ports.iter().copied().filter(|p| *p > 0).collect();
    if ports.is_empty() {
        return vec![];
    }
    let holders = lookup_holders(&ports);
    let mut pane_idx = HashMap::new();
    let mut parents = HashMap::new();
    let mut indexed = false;
    let mut out = vec![];
    for port in ports {
        let (holder, taken) = match holders.get(&port) {
            Some(h) => (h.clone(), true),
            None => (Holder::default(), !can_bind(port)),
        };
        if !taken {
            continue;
        }
        if !indexed {
            pane_idx = lpm_pane_index();
            parents = process_parents();
            indexed = true;
        }
        let project = walk_to_project(holder.pid, &pane_idx, &parents);
        out.push(to_info(action, port, &holder, &project, policy));
    }
    out
}

/// portcheck.FormatActionPort: Ok(()) when free, else a human-readable error
/// (one bullet per conflict) used as the RunAction/RunActionBackground pre-check.
pub fn format_action_port(action: &str, ports: &[i64]) -> Result<(), String> {
    let conflicts = check_action_port(action, ports, "");
    if conflicts.is_empty() {
        return Ok(());
    }
    let mut msg = String::from("port conflict");
    if conflicts.len() > 1 {
        msg.push('s');
    }
    for c in &conflicts {
        msg.push_str(&format!(
            "\n  • {} ({}) — used by {}",
            c.port, c.service, c.description
        ));
        if !c.lpm_project.is_empty() {
            msg.push_str(&format!(" (stop the '{}' project in lpm)", c.lpm_project));
        } else if c.pid > 0 {
            msg.push_str(&format!(" (run: kill {})", c.pid));
        }
    }
    Err(msg)
}

// ---- commands ---------------------------------------------------------------

#[tauri::command(async)]
pub fn check_port_conflicts(
    name: String,
    profile: String,
) -> Result<Vec<PortConflictInfo>, String> {
    let info = config::spawn_info(&name)?;
    let all: Vec<String> = info.services.keys().cloned().collect();
    let svc_names = config::services_for_profile(&info.profiles, &all, &profile);
    let svc_names = config::expand_service_deps(&info.services, &svc_names).unwrap_or(svc_names);
    Ok(check_services(&info, &svc_names))
}

#[tauri::command(async)]
pub fn check_port_conflicts_for_services(
    name: String,
    services: Vec<String>,
) -> Result<Vec<PortConflictInfo>, String> {
    let info = config::spawn_info(&name)?;
    Ok(check_services(&info, &services))
}

#[tauri::command(async)]
pub fn check_action_port_conflict(
    project_name: String,
    action_name: String,
) -> Result<Vec<PortConflictInfo>, String> {
    let (ports, policy) = config::action_ports_and_conflict(&project_name, &action_name)
        .ok_or_else(|| format!("action {action_name:?} not found in project {project_name:?}"))?;
    Ok(check_action_port(&action_name, &ports, &policy))
}

/// Live ports each running service is listening on, in running-service order.
/// Local-only: remote services listen on the remote host where this lsof can't
/// see them, so remote projects report no ports. Attribution walks each
/// listening pid up to the tmux pane that owns it (pane N == service N).
#[tauri::command(async)]
pub fn detect_service_ports(
    state: State<'_, ServiceState>,
    name: String,
) -> Result<Vec<ServicePorts>, String> {
    let info = config::spawn_info(&name)?;
    let running = config::resolve_running_services(&info, &state.get_for_project(&name, &info));

    // Remote ports listen on the remote host where this lsof can't reach, so
    // those services just fall through with no detected ports.
    let mut by_service: HashMap<String, Vec<i64>> = HashMap::new();
    if !info.is_remote && !running.is_empty() {
        let pane_pids = crate::tmux::list_pane_pids(&info.session);
        let pane_map: HashMap<i64, String> = running
            .iter()
            .enumerate()
            .filter_map(|(i, svc)| pane_pids.get(i).map(|&pid| (pid, svc.clone())))
            .collect();
        let parents = process_parents();
        for (pid, port) in listening_ports() {
            if let Some(svc) = walk_to_owner(pid, &pane_map, &parents) {
                by_service.entry(svc).or_default().push(port);
            }
        }
    }

    Ok(running
        .into_iter()
        .map(|service| {
            let mut ports = by_service.remove(&service).unwrap_or_default();
            ports.sort_unstable();
            ports.dedup();
            ServicePorts { service, ports }
        })
        .collect())
}

#[tauri::command(async)]
pub fn resolve_port_conflict(
    app: AppHandle,
    svc: State<'_, ServiceState>,
    c: PortConflictInfo,
) -> Result<(), String> {
    free_port(&app, &svc, &c)
}

/// The approval dialog can sit open indefinitely, so by the time the user
/// confirms, the port may be held by something other than what they approved.
/// None when the current holder is still the approved one; otherwise the error
/// to surface instead of killing an innocent process.
fn approved_holder_mismatch(
    c: &PortConflictInfo,
    holder: &Holder,
    project: &str,
) -> Option<String> {
    // A project-attributed approval consents to stopping that PROJECT, so a
    // churned pid inside the same project (a respawned dev server) still
    // matches; pid equality is required only for bare-process approvals.
    let same_project = !c.lpm_project.is_empty() && project == c.lpm_project;
    if same_project || (holder.pid == c.pid && c.lpm_project.is_empty()) {
        return None;
    }
    Some(format!(
        "port {} is now held by {}, not the process you approved — retry",
        c.port,
        holder_phrase(holder, project)
    ))
}

fn free_port(
    app: &AppHandle,
    svc: &State<'_, ServiceState>,
    c: &PortConflictInfo,
) -> Result<(), String> {
    let port = c.port;
    if port <= 0 {
        return Ok(());
    }
    let (holder, taken) = probe(port);
    if !taken {
        return Ok(()); // the approved holder released the port on its own
    }
    let self_pid = std::process::id() as i64;
    if holder.pid == self_pid {
        return Err(format!("port {port} is held by lpm itself"));
    }
    let pane_idx = lpm_pane_index();
    let parents = process_parents();
    let project = walk_to_project(holder.pid, &pane_idx, &parents);
    if let Some(err) = approved_holder_mismatch(c, &holder, &project) {
        return Err(err);
    }
    // Tearing down a whole project to free a port is only right for a different,
    // separately-running project. When the holder belongs to the project that
    // also hosts this running lpm process (self-hosted dev, where `npm run tauri
    // dev` is itself a service), killing the session would take lpm down with
    // it — so kill just the port holder instead.
    let hosts_self =
        !project.is_empty() && walk_to_project(self_pid, &pane_idx, &parents) == project;
    if !project.is_empty() && !hosts_self {
        crate::services::stop_project_internal(app, svc, &project)?;
    } else if holder.pid > 0 {
        kill_term(holder.pid)?;
    } else {
        return Err(format!("port {port} is held by an unidentifiable process"));
    }
    wait_bindable(port, Duration::from_secs(5))
}

fn kill_term(pid: i64) -> Result<(), String> {
    let status = Command::new("kill")
        .args(["-TERM", &pid.to_string()])
        .status()
        .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err(format!("failed to signal PID {pid}"));
    }
    Ok(())
}

fn wait_bindable(port: i64, timeout: Duration) -> Result<(), String> {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if can_bind(port) {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    Err(format!("port {port} is still in use"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn holder(pid: i64, command: &str) -> Holder {
        Holder {
            pid,
            command: command.into(),
        }
    }

    fn approved(pid: i64, command: &str, project: &str) -> PortConflictInfo {
        to_info("web", 3000, &holder(pid, command), project, "")
    }

    #[test]
    fn same_pid_still_matches() {
        let c = approved(1234, "node", "");
        assert!(approved_holder_mismatch(&c, &holder(1234, "node"), "").is_none());
    }

    #[test]
    fn same_pid_and_project_still_matches() {
        let c = approved(1234, "node", "foo");
        assert!(approved_holder_mismatch(&c, &holder(1234, "node"), "foo").is_none());
    }

    #[test]
    fn different_pid_is_a_mismatch() {
        let c = approved(1234, "node", "");
        let err = approved_holder_mismatch(&c, &holder(5678, "postgres"), "").unwrap();
        assert!(err.contains("postgres (PID 5678)"), "{err}");
        assert!(err.contains("port 3000"), "{err}");
    }

    #[test]
    fn churned_pid_in_the_approved_project_still_matches() {
        let c = approved(1234, "node", "foo");
        assert!(approved_holder_mismatch(&c, &holder(5678, "node"), "foo").is_none());
    }

    #[test]
    fn same_pid_different_project_is_a_mismatch() {
        let c = approved(1234, "node", "foo");
        let err = approved_holder_mismatch(&c, &holder(1234, "node"), "bar").unwrap();
        assert!(err.contains("lpm project \"bar\""), "{err}");
    }

    #[test]
    fn now_unidentifiable_holder_is_a_mismatch() {
        let c = approved(1234, "node", "");
        let err = approved_holder_mismatch(&c, &Holder::default(), "").unwrap();
        assert!(err.contains("an unknown local process"), "{err}");
    }
}
