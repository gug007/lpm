// Runs a start's ready checks: dependents of a service with a `ready` check
// open idle and get their command once it passes (readyplan.rs decides when),
// and every service still waiting or starting is shown as such on its tab.
//
// The phases live here, in the app, keyed by project file and service. A start
// replaces what its services showed; a stop clears the project. A waiter whose
// services were taken over by a later start or cleared by a stop notices on its
// next tick and ends.
use crate::config::{ServiceFull, SpawnInfo};
use crate::readyplan::{Phase, Plan, ProbeResult};
use crate::services::ServiceState;
use crate::sessions;
use std::collections::{BTreeMap, HashMap};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const LOCAL_TICK: Duration = Duration::from_millis(250);
const REMOTE_TICK: Duration = Duration::from_secs(1);
const LATE_TICK: Duration = Duration::from_secs(3);

struct Entry {
    batch: u64,
    phase: Phase,
}

type Registry = HashMap<String, HashMap<String, Entry>>;

fn registry() -> &'static Mutex<Registry> {
    static REGISTRY: OnceLock<Mutex<Registry>> = OnceLock::new();
    REGISTRY.get_or_init(Default::default)
}

fn next_batch() -> u64 {
    static NEXT: AtomicU64 = AtomicU64::new(1);
    NEXT.fetch_add(1, Ordering::Relaxed)
}

/// What starting `batch` (dependency order) next to `running` has to hold
/// back, decided before its panes open. None when no ready check is involved,
/// which leaves the start as it always was.
pub fn gate(
    services: &BTreeMap<String, ServiceFull>,
    batch: &[String],
    running: &[String],
) -> Option<Plan> {
    let deps_of = |name: &str| {
        services
            .get(name)
            .map(|s| s.depends_on.clone())
            .unwrap_or_default()
    };
    let check_of = |name: &str| {
        let svc = services.get(name)?;
        svc.ready.as_ref()?.resolve(svc.port).ok()
    };
    Plan::new(batch, running, deps_of, check_of, Instant::now())
}

/// Record the plan's phases and watch it through. `fresh` is a whole-project
/// start, which also drops whatever an earlier start of it still showed.
pub fn begin(app: &AppHandle, info: SpawnInfo, plan: Plan, fresh: bool) {
    let batch = next_batch();
    {
        let mut all = registry().lock().unwrap();
        let project = all.entry(info.file_name.clone()).or_default();
        if fresh {
            project.clear();
        }
        for name in plan.names() {
            project.remove(&name);
        }
        for (name, phase) in plan.phases() {
            project.insert(name, Entry { batch, phase });
        }
    }
    let _ = app.emit("projects-changed", ());
    let app = app.clone();
    std::thread::spawn(move || watch(app, info, plan, batch));
}

/// Forget a project's phases (it stopped); its waiter ends on its next tick.
pub fn clear(project: &str) {
    registry().lock().unwrap().remove(project);
}

/// Take one service out of whatever start is holding it (it was restarted or
/// stopped by hand), so that start never types its line in later.
pub fn forget(project: &str, service: &str) {
    if let Some(services) = registry().lock().unwrap().get_mut(project) {
        services.remove(service);
    }
}

/// The phase each of a project's services shows, for its project info.
pub fn phases(project: &str) -> HashMap<String, Phase> {
    registry()
        .lock()
        .unwrap()
        .get(project)
        .map(|services| {
            services
                .iter()
                .map(|(name, entry)| (name.clone(), entry.phase.clone()))
                .collect()
        })
        .unwrap_or_default()
}

/// A running service's state for its project info. A service held back for
/// its dependencies has an idle pane, which the daemon reports as ended; it is
/// waiting, not stopped. One that has ended otherwise shows that alone.
pub fn annotate(info: &mut serde_json::Value, phase: Option<&Phase>, ended: Option<&Option<i32>>) {
    if let (Some(code), false) = (ended, matches!(phase, Some(Phase::Waiting(_)))) {
        info["exited"] = serde_json::json!(true);
        info["exitCode"] = serde_json::json!(code);
        return;
    }
    match phase {
        Some(Phase::Waiting(on)) => {
            info["readiness"] = "waiting".into();
            info["waitingFor"] = serde_json::json!(on);
        }
        Some(Phase::Starting) => info["readiness"] = "starting".into(),
        Some(Phase::NotReady(reason)) => {
            info["readiness"] = "notReady".into();
            info["readyError"] = reason.clone().into();
        }
        None => {}
    }
}

fn owns(project: &str, names: &[String], batch: u64) -> Vec<String> {
    let all = registry().lock().unwrap();
    let Some(services) = all.get(project) else {
        return Vec::new();
    };
    names
        .iter()
        .filter(|name| services.get(*name).is_some_and(|e| e.batch == batch))
        .cloned()
        .collect()
}

fn publish(project: &str, plan: &Plan, batch: u64) {
    let phases = plan.phases();
    let mut all = registry().lock().unwrap();
    let Some(services) = all.get_mut(project) else {
        return;
    };
    services.retain(|name, entry| entry.batch != batch || phases.contains_key(name));
    for (name, entry) in services.iter_mut() {
        if entry.batch == batch {
            if let Some(phase) = phases.get(name) {
                entry.phase = phase.clone();
            }
        }
    }
}

fn watch(app: AppHandle, info: SpawnInfo, mut plan: Plan, batch: u64) {
    let project = info.file_name.clone();
    let ssh = info.is_remote.then_some(&info.ssh);
    let tick = if ssh.is_some() {
        REMOTE_TICK
    } else {
        LOCAL_TICK
    };
    let names = plan.names();
    loop {
        std::thread::sleep(if plan.only_late() { LATE_TICK } else { tick });
        let mine = owns(&project, &names, batch);
        if mine.is_empty() {
            return;
        }
        // One listing per tick. A service's pane is known only while every
        // pane is labelled.
        let listed = sessions::panes_of(&info.session);
        let labelled = listed.iter().all(|pane| !pane.service.is_empty());
        let mut results = HashMap::new();
        for node in plan.probing() {
            let Some(check) = &node.check else { continue };
            let pane = listed
                .iter()
                .rfind(|p| labelled && p.service == node.name)
                .map(|p| p.id.as_str());
            let ended = listed.iter().any(|p| p.ended && p.service == node.name);
            let result = if pane.is_none() || ended {
                ProbeResult::Ended
            } else {
                let cmd = info
                    .services
                    .get(&node.name)
                    .map(|s| s.cmd.as_str())
                    .unwrap_or("");
                if crate::readyprobe::passes(&check.probe, ssh, pane, cmd) {
                    ProbeResult::Pass
                } else {
                    ProbeResult::Wait
                }
            };
            results.insert(node.name.clone(), result);
        }
        let step = plan.step(Instant::now(), &results);
        for name in &step.launch {
            if mine.contains(name) {
                launch(&app, &info, name, batch);
            }
        }
        publish(&project, &plan, batch);
        if step.changed {
            let _ = app.emit("projects-changed", ());
        }
        if step.done {
            return;
        }
    }
}

/// Type a held-back service's line into its pane, under the project's
/// lifecycle lock so it can't land in a pane a stop or restart is tearing down.
fn launch(app: &AppHandle, info: &SpawnInfo, name: &str, batch: u64) {
    let state = app.state::<ServiceState>();
    let op = state.op_lock(&info.file_name);
    let _op = op.lock().unwrap();
    if owns(&info.file_name, &[name.to_string()], batch).is_empty() {
        return;
    }
    let Some(svc) = info.services.get(name) else {
        return;
    };
    let ssh = info.is_remote.then_some(&info.ssh);
    if let Err(error) = sessions::run_service_line(
        &info.session,
        name,
        &info.root,
        &svc.cwd,
        &svc.env,
        &svc.cmd,
        ssh,
    ) {
        eprintln!("[ready] could not start {name}: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_waiting_service_is_not_shown_as_stopped() {
        let mut info = json!({ "name": "web" });
        annotate(
            &mut info,
            Some(&Phase::Waiting(vec!["api".into()])),
            Some(&None),
        );
        assert_eq!(
            info,
            json!({ "name": "web", "readiness": "waiting", "waitingFor": ["api"] })
        );
    }

    #[test]
    fn an_ended_service_shows_only_how_it_ended() {
        let mut info = json!({ "name": "api" });
        annotate(&mut info, Some(&Phase::Starting), Some(&Some(1)));
        assert_eq!(
            info,
            json!({ "name": "api", "exited": true, "exitCode": 1 })
        );
    }

    #[test]
    fn starting_and_not_ready_carry_their_detail() {
        let mut info = json!({});
        annotate(&mut info, Some(&Phase::Starting), None);
        assert_eq!(info["readiness"], "starting");
        let mut info = json!({});
        annotate(
            &mut info,
            Some(&Phase::NotReady("Not ready after 30s".into())),
            None,
        );
        assert_eq!(
            info,
            json!({ "readiness": "notReady", "readyError": "Not ready after 30s" })
        );
    }
}
