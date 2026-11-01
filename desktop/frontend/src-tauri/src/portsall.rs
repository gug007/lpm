//! The Ports view: every TCP port this machine listens on, with the lpm
//! project and service whose process tree holds it, plus each connected paired
//! computer's ports when asked. A port nothing of lpm's holds comes back with
//! an empty project ("outside lpm").
use crate::peerclient::PeerClientHub;
use crate::ports::{process_parents, sessions_of, walk_to_owner};
use crate::portsprobe::listening_ports;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::time::Duration;
use tauri::{AppHandle, Manager};

pub(crate) const LIST_CMD: &str = "list_listening_ports";
pub(crate) const KILL_CMD: &str = "kill_port_holder";
const LOCAL: &str = "local";
const PEER_WAIT: Duration = Duration::from_secs(6);
/// lpm's own binaries. Another copy of lpm (a dev build beside the installed
/// app) is no project's, but it isn't a stray server to kill either.
const LPM_PROCESSES: [&str; 2] = ["lpm-desktop", "lpm-tailnet"];

fn is_lpm_process(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    let stem = lower.strip_suffix(".exe").unwrap_or(&lower);
    LPM_PROCESSES.contains(&stem)
}

#[derive(Serialize, Deserialize, Clone, Default, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct ListeningPort {
    pub port: i64,
    pub pid: i64,
    pub process: String,
    /// The owning project's file name; empty when no lpm pane holds the port.
    pub project: String,
    pub project_label: String,
    /// The project this one is a copy of, when it is one.
    pub parent: String,
    /// The service whose pane holds the port; empty for a terminal tab's process.
    pub service: String,
    /// The terminal tab's title when the port belongs to no service.
    pub terminal: String,
    /// Held by lpm itself (its phone server, a peer tunnel), which only quitting frees.
    pub own: bool,
    /// When the holding process started, in Unix seconds; 0 when unknown.
    pub started_at: i64,
    pub machine: String,
    pub machine_name: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PortsMachine {
    id: String,
    name: String,
    platform: String,
    local: bool,
    connected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct PortsOverview {
    ports: Vec<ListeningPort>,
    machines: Vec<PortsMachine>,
}

#[derive(Clone)]
enum Owner {
    Lpm,
    Pane {
        project: String,
        service: String,
        title: String,
    },
}

/// Every lpm pane's shell pid with what it runs, and lpm's own pid, so a
/// listener's ancestry names who started it.
fn owners() -> HashMap<i64, Owner> {
    let sessions = sessions_of(
        crate::config::project_names()
            .into_iter()
            .chain([crate::config::RESERVED_PROJECT_NAME.to_string()]),
    );
    let mut owners: HashMap<i64, Owner> = crate::sessions::all_panes()
        .into_iter()
        .filter_map(|pane| {
            let project = sessions.get(&pane.session)?.clone();
            let owner = Owner::Pane {
                project,
                service: pane.service,
                title: pane.title,
            };
            Some((pane.pid, owner))
        })
        .collect();
    owners.insert(i64::from(std::process::id()), Owner::Lpm);
    owners
}

struct ProjectFacts {
    label: String,
    parent: String,
}

fn project_facts(name: &str) -> ProjectFacts {
    ProjectFacts {
        label: crate::config::project_display_name(name),
        parent: crate::config::peek_parent(name).unwrap_or_default(),
    }
}

/// One row per (port, pid): a server bound on both IPv4 and IPv6 is listed once.
fn attribute(
    mut pairs: Vec<(i64, i64)>,
    owner_of: impl Fn(i64) -> Option<Owner>,
    names: &HashMap<i32, String>,
    started: impl Fn(i64) -> i64,
    mut facts: impl FnMut(&str) -> ProjectFacts,
) -> Vec<ListeningPort> {
    pairs.sort_unstable_by_key(|&(pid, port)| (port, pid));
    pairs.dedup();
    let mut known: HashMap<String, (String, String)> = HashMap::new();
    pairs
        .into_iter()
        .map(|(pid, port)| {
            let mut row = ListeningPort {
                port,
                pid,
                process: names.get(&(pid as i32)).cloned().unwrap_or_default(),
                started_at: started(pid),
                ..Default::default()
            };
            match owner_of(pid) {
                Some(Owner::Lpm) => row.own = true,
                Some(Owner::Pane {
                    project,
                    service,
                    title,
                }) => {
                    let (label, parent) = known
                        .entry(project.clone())
                        .or_insert_with(|| {
                            let f = facts(&project);
                            (f.label, f.parent)
                        })
                        .clone();
                    row.project = project;
                    row.project_label = label;
                    row.parent = parent;
                    if service.is_empty() {
                        row.terminal = title;
                    }
                    row.service = service;
                }
                None => row.own = is_lpm_process(&row.process),
            }
            row
        })
        .collect()
}

/// This machine's listening ports, attributed, under `machine_name`.
pub(crate) fn local_ports(machine_name: &str) -> Vec<ListeningPort> {
    let pairs = listening_ports();
    if pairs.is_empty() {
        return Vec::new();
    }
    let owners = owners();
    let parents = process_parents();
    let mut pids: Vec<i32> = pairs.iter().map(|&(pid, _)| pid as i32).collect();
    pids.sort_unstable();
    pids.dedup();
    let names = crate::procinfo::commands(&pids);
    let mut rows = attribute(
        pairs,
        |pid| walk_to_owner(pid, &owners, &parents),
        &names,
        |pid| started_unix(pid).unwrap_or(0),
        project_facts,
    );
    for row in &mut rows {
        row.machine = LOCAL.into();
        row.machine_name = machine_name.to_string();
    }
    rows
}

/// When `pid` started, in Unix seconds.
fn started_unix(pid: i64) -> Option<i64> {
    let start = crate::osproc::start_of(u32::try_from(pid).ok()?)?;
    #[cfg(target_os = "macos")]
    return Some((start / 1_000_000) as i64);
    #[cfg(target_os = "linux")]
    return linux_start(start);
    #[cfg(windows)]
    return Some(unix_from_filetime(start));
}

/// /proc/<pid>/stat counts a start in clock ticks since boot.
/// Boot time and tick rate never change, so they're read once.
#[cfg(target_os = "linux")]
fn linux_start(ticks: u64) -> Option<i64> {
    static BOOT: std::sync::OnceLock<Option<(i64, u64)>> = std::sync::OnceLock::new();
    let (boot, hz) = (*BOOT.get_or_init(|| {
        let stat = std::fs::read_to_string("/proc/stat").ok()?;
        let boot: i64 = stat
            .lines()
            .find_map(|line| line.strip_prefix("btime "))?
            .trim()
            .parse()
            .ok()?;
        let hz = unsafe { libc::sysconf(libc::_SC_CLK_TCK) };
        (hz > 0).then_some((boot, hz as u64))
    }))?;
    Some(boot + (ticks / hz) as i64)
}

/// A FILETIME counts 100 ns intervals since 1601-01-01.
#[cfg(any(windows, test))]
fn unix_from_filetime(ft: u64) -> i64 {
    (ft / 10_000_000) as i64 - 11_644_473_600
}

/// A paired computer's rows, renamed so the bridge routes Stop, Open and Copy
/// back to that machine the way it does for its projects in the sidebar.
fn as_peer_rows(slug: &str, name: &str, rows: Vec<ListeningPort>) -> Vec<ListeningPort> {
    let mark = |raw: &str| {
        if raw.is_empty() {
            String::new()
        } else {
            format!("peer-{slug}-{raw}")
        }
    };
    rows.into_iter()
        .map(|row| ListeningPort {
            project: mark(&row.project),
            parent: mark(&row.parent),
            machine: slug.to_string(),
            machine_name: name.to_string(),
            ..row
        })
        .collect()
}

fn read_peer(hub: &PeerClientHub, slug: &str) -> Result<Vec<ListeningPort>, String> {
    let value = hub.invoke_within(slug, LIST_CMD, json!({}), PEER_WAIT)?;
    serde_json::from_value(value).map_err(|e| format!("unreadable ports: {e}"))
}

/// This machine's ports and, with `computers`, every connected paired one's.
/// A computer that can't answer (offline, or an lpm too old to list ports)
/// keeps its row in `machines` with the reason, and the rest still show.
pub(crate) fn overview(hub: Option<&PeerClientHub>, computers: bool) -> PortsOverview {
    let (hub, peers) = match (computers, hub) {
        (true, Some(hub)) => (Some(hub), hub.phone_machines()),
        _ => (None, Vec::new()),
    };
    let machine_name = crate::sys::machine_name();
    let (mut ports, answers) = std::thread::scope(|scope| {
        let mut reading = Vec::new();
        if let Some(hub) = hub {
            for peer in peers.iter().filter(|peer| peer.connected) {
                let slug = peer.entry.slug.clone();
                reading.push(scope.spawn(move || {
                    let answer = read_peer(hub, &slug);
                    (slug, answer)
                }));
            }
        }
        let local = local_ports(&machine_name);
        let answers: HashMap<String, Result<Vec<ListeningPort>, String>> = reading
            .into_iter()
            .filter_map(|handle| handle.join().ok())
            .collect();
        (local, answers)
    });

    let mut machines = vec![PortsMachine {
        id: LOCAL.into(),
        name: machine_name,
        platform: std::env::consts::OS.into(),
        local: true,
        connected: true,
        error: None,
    }];
    for peer in &peers {
        let slug = &peer.entry.slug;
        let name = crate::remote_machines::display_name(&peer.entry);
        let error = match answers.get(slug) {
            Some(Ok(rows)) => {
                ports.extend(as_peer_rows(slug, &name, rows.clone()));
                None
            }
            Some(Err(e)) => Some(e.clone()),
            None => None,
        };
        machines.push(PortsMachine {
            id: slug.clone(),
            name,
            platform: peer.entry.platform.clone(),
            local: false,
            connected: peer.connected,
            error,
        });
    }
    ports.sort_by(|a, b| a.port.cmp(&b.port).then_with(|| a.machine.cmp(&b.machine)));
    PortsOverview { ports, machines }
}

/// End the process holding `port` on this machine, after making sure it still
/// does: the view can be minutes old, and a pid may since name something else.
pub(crate) fn kill_local(pid: i64, port: i64) -> Result<(), String> {
    if pid <= 1 {
        return Err(format!("no process to stop on port {port}"));
    }
    if !listening_ports().contains(&(pid, port)) {
        return Err(format!("port {port} is no longer held by PID {pid}"));
    }
    let owners = owners();
    let parents = process_parents();
    let name = crate::procinfo::commands(&[pid as i32]).remove(&(pid as i32)).unwrap_or_default();
    if is_lpm_process(&name) || matches!(walk_to_owner(pid, &owners, &parents), Some(Owner::Lpm)) {
        return Err(format!("port {port} is held by lpm itself"));
    }
    crate::osproc::terminate(pid as u32);
    Ok(())
}

/// A paired computer asking this one, over the peer link, for its ports or to
/// end a holder.
pub(crate) fn serve_host(kill: bool, args: &Value) -> Result<Value, String> {
    if kill {
        let num = |k: &str| args.get(k).and_then(Value::as_i64).unwrap_or(0);
        return kill_local(num("pid"), num("port")).map(|()| Value::Null);
    }
    serde_json::to_value(local_ports(&crate::sys::machine_name())).map_err(|e| e.to_string())
}

/// `lpm ports [--computers]` over the control socket.
pub(crate) fn cmd_list_ports(args: &[String], app: &AppHandle) -> String {
    let computers = args.iter().any(|a| a == "--computers");
    let hub = app.try_state::<PeerClientHub>().map(|s| s.inner().clone());
    match serde_json::to_string(&overview(hub.as_ref(), computers)) {
        Ok(json) => json,
        Err(e) => format!("ERROR: {e}"),
    }
}

#[tauri::command(async)]
pub fn list_ports_overview(app: AppHandle, computers: bool) -> PortsOverview {
    let hub = app.try_state::<PeerClientHub>().map(|s| s.inner().clone());
    overview(hub.as_ref(), computers)
}

#[tauri::command(async)]
pub fn kill_port_holder(app: AppHandle, machine: String, pid: i64, port: i64) -> Result<(), String> {
    if machine.is_empty() || machine == LOCAL {
        return kill_local(pid, port);
    }
    let hub = app
        .try_state::<PeerClientHub>()
        .ok_or("That computer isn't connected")?;
    hub.invoke_within(&machine, KILL_CMD, json!({ "pid": pid, "port": port }), PEER_WAIT)
        .map(|_| ())
}

#[cfg(test)]
#[path = "portsall_tests.rs"]
mod tests;
