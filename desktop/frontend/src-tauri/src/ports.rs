// Port-conflict detection — port of internal/portcheck + desktop/portconflicts.go.
// LOCAL only (lsof-based); these feed the start-flow conflict dialog. The SSH
// port-forwarding + suggestion + poller commands stay safe stubs and are
// DEFERRED with remote-SSH (the Ports popover is gated on project.isRemote, so
// none of that renders for local projects yet).
use crate::config;
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
    #[serde(rename = "portConflict", skip_serializing_if = "String::is_empty")]
    pub port_conflict: String,
}

#[derive(Clone, Default)]
struct Holder {
    pid: i64,
    command: String,
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

// ---- lsof holder lookup -----------------------------------------------------

fn port_from_addr(addr: &str) -> Option<i64> {
    addr.rsplit_once(':').and_then(|(_, p)| p.parse::<i64>().ok())
}

fn parse_lsof(s: &str) -> HashMap<i64, Holder> {
    let mut result = HashMap::new();
    let mut current = Holder::default();
    for line in s.split('\n') {
        if line.len() < 2 {
            continue;
        }
        let (tag, rest) = (line.as_bytes()[0], &line[1..]);
        match tag {
            b'p' => {
                if let Ok(pid) = rest.parse::<i64>() {
                    current = Holder { pid, command: String::new() };
                }
            }
            b'c' => current.command = rest.to_string(),
            b'n' => {
                if let Some(port) = port_from_addr(rest) {
                    if current.pid > 0 {
                        result.entry(port).or_insert_with(|| current.clone());
                    }
                }
            }
            _ => {}
        }
    }
    result
}

fn lookup_holders(ports: &[i64]) -> HashMap<i64, Holder> {
    if ports.is_empty() {
        return HashMap::new();
    }
    let mut args: Vec<String> = vec!["-nP".into()];
    for p in ports {
        args.push(format!("-iTCP:{p}"));
    }
    args.push("-sTCP:LISTEN".into());
    args.push("-Fpcn".into());
    // lsof exits 1 when ANY -i filter has no match even if others matched —
    // ignore the status and parse whatever stdout we got.
    match Command::new("lsof").args(&args).output() {
        Ok(o) if !o.stdout.is_empty() => parse_lsof(&String::from_utf8_lossy(&o.stdout)),
        _ => HashMap::new(),
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

fn walk_to_project(pid: i64, pane_idx: &HashMap<i64, String>, parents: &HashMap<i64, i64>) -> String {
    if pid <= 1 || pane_idx.is_empty() {
        return String::new();
    }
    let mut cur = pid;
    for _ in 0..32 {
        if cur <= 1 {
            break;
        }
        if let Some(p) = pane_idx.get(&cur) {
            return p.clone();
        }
        match parents.get(&cur) {
            Some(&ppid) => cur = ppid,
            None => return String::new(),
        }
    }
    String::new()
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
        msg.push_str(&format!("\n  • {} ({}) — used by {}", c.port, c.service, c.description));
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
pub fn check_port_conflicts(name: String, profile: String) -> Result<Vec<PortConflictInfo>, String> {
    let info = config::spawn_info(&name)?;
    let all: Vec<String> = info.services.keys().cloned().collect();
    let svc_names = config::services_for_profile(&info.profiles, &all, &profile);
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

#[tauri::command(async)]
pub fn resolve_port_conflict(
    app: AppHandle,
    svc: State<'_, ServiceState>,
    c: PortConflictInfo,
) -> Result<(), String> {
    free_port(&app, &svc, c.port)
}

fn free_port(app: &AppHandle, svc: &State<'_, ServiceState>, port: i64) -> Result<(), String> {
    if port <= 0 {
        return Ok(());
    }
    let (holder, taken) = probe(port);
    if !taken {
        return Ok(());
    }
    let self_pid = std::process::id() as i64;
    if holder.pid == self_pid {
        return Err(format!("port {port} is held by lpm itself"));
    }
    let pane_idx = lpm_pane_index();
    let parents = process_parents();
    let project = walk_to_project(holder.pid, &pane_idx, &parents);
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
