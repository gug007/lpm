// Automations started by something lpm sees happen instead of by the clock: CI
// failing on a push from this computer (ci_watch.rs), a service's command
// ending in failure (read from the session daemon on the scheduler's tick), an
// agent finishing its turn (socketsrv.rs), and a pull request being opened or
// reviewed (pr_watch.rs). A run is told what happened in its environment and,
// when it hands an agent a prompt, at the top of it.
use super::event_happening::{mark, matches, Happening};
use super::event_pulls::{self, PullRequestsWanted};
use super::events::EventKind;
use super::{
    active_runs, config, inflight, load_job_state, machines, max_concurrent,
    record_capacity_skip, resolve_jobs, resolve_standalone_jobs, spawn_pipeline, state_key,
    under_way, with_state, JobResolved, Schedule, Trigger,
};
use crate::sessionproto::PaneInfo;
use crate::status::StatusEntry;
use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};
use tauri::AppHandle;

pub(super) fn today() -> String {
    chrono::Local::now().date_naive().to_string()
}

// ---- which events anything listens for ---------------------------------------

/// The events some job reacts to, as of the scheduler's last tick. Nothing is
/// read or resolved for an event no job wants.
#[derive(Default)]
pub(super) struct Wanted {
    kinds: HashSet<EventKind>,
    pulls: PullRequestsWanted,
}

impl Wanted {
    pub(super) fn add(&mut self, project: &str, job: &JobResolved) {
        let Some(kind) = super::events::kind_of(&job.schedule) else {
            return;
        };
        self.kinds.insert(kind);
        if !kind.is_pull_request()
            || !load_job_state(&state_key(project, &job.id)).job_on(job)
            || !runs_here(job)
        {
            return;
        }
        self.pulls.reviews |= kind == EventKind::PrReviewed;
        self.pulls.opened |= kind == EventKind::PrOpened;
        if project.is_empty() {
            self.pulls.anywhere = true;
        } else {
            self.pulls.projects.insert(project.to_string());
        }
    }
}

fn wanted() -> &'static Mutex<Wanted> {
    static WANTED: OnceLock<Mutex<Wanted>> = OnceLock::new();
    WANTED.get_or_init(Default::default)
}

pub(super) fn is_wanted(kind: EventKind) -> bool {
    wanted().lock().unwrap().kinds.contains(&kind)
}

pub(super) fn set_wanted(new: Wanted) {
    *wanted().lock().unwrap() = new;
}

pub(crate) fn pull_requests_wanted() -> Option<PullRequestsWanted> {
    let pulls = wanted().lock().unwrap().pulls.clone();
    (pulls.reviews || pulls.opened).then_some(pulls)
}

// ---- the sources --------------------------------------------------------------

pub(crate) fn ci_failed(
    app: &AppHandle,
    project: &str,
    branch: &str,
    commit: &str,
    detail: Option<&str>,
    url: &str,
) {
    if !is_wanted(EventKind::CiFailed) {
        return;
    }
    let mut h = Happening::new(EventKind::CiFailed, project);
    h.branch = branch.to_string();
    h.commit = commit.to_string();
    h.summary = format!(
        "CI failed on {branch} in {}",
        config::project_display_name(project)
    );
    h.detail = detail.unwrap_or_default().to_string();
    h.url = url.to_string();
    deliver(app, h);
}

pub(crate) fn agent_finished(app: &AppHandle, project: &str, entry: &StatusEntry) {
    if !is_wanted(EventKind::AgentFinished) {
        return;
    }
    let (app, project, entry) = (app.clone(), project.to_string(), entry.clone());
    std::thread::spawn(move || {
        let agent = crate::remote::terminal_label(&app, &entry.pane_id)
            .filter(|label| !label.trim().is_empty())
            .or_else(|| crate::agentkind::AgentKind::of_key(&entry.key).map(|k| k.id().to_string()))
            .unwrap_or_else(|| "An agent".to_string());
        let mut h = Happening::new(EventKind::AgentFinished, &project).at_checkout();
        h.summary = format!(
            "{agent} finished in {}",
            config::project_display_name(&project)
        );
        h.detail = crate::statusbanner::last_answer(&project, &entry).unwrap_or_default();
        h.agent = agent;
        offer_all(&app, &h);
    });
}

fn seen_crashes() -> &'static Mutex<Option<HashSet<String>>> {
    static SEEN: OnceLock<Mutex<Option<HashSet<String>>>> = OnceLock::new();
    SEEN.get_or_init(Default::default)
}

/// The same rule a service tab calls a crash by (serviceExit.ts).
fn crashed(pane: &PaneInfo) -> bool {
    pane.ended && !pane.service.is_empty() && pane.code.is_some_and(|c| c != 0)
}

/// Services whose command ended in failure since the last look. The first
/// look only takes stock, so a crash from before lpm was watching says nothing.
pub(super) fn scan_services(app: &AppHandle) {
    if !is_wanted(EventKind::ServiceCrashed) {
        *seen_crashes().lock().unwrap() = None;
        return;
    }
    let crashes: Vec<PaneInfo> = crate::sessions::all_panes()
        .into_iter()
        .filter(crashed)
        .collect();
    let now: HashSet<String> = crashes.iter().map(|p| p.id.clone()).collect();
    let Some(before) = seen_crashes().lock().unwrap().replace(now) else {
        return;
    };
    let fresh: Vec<&PaneInfo> = crashes.iter().filter(|p| !before.contains(&p.id)).collect();
    if fresh.is_empty() {
        return;
    }
    let by_session: HashMap<String, String> = config::project_names()
        .into_iter()
        .filter_map(|name| config::session_name(&name).ok().map(|s| (s, name)))
        .collect();
    for pane in fresh {
        let Some(project) = by_session.get(&pane.session) else {
            continue;
        };
        let mut h = Happening::new(EventKind::ServiceCrashed, project).at_checkout();
        h.service = pane.service.clone();
        h.exit_code = pane.code;
        h.summary = format!(
            "the {} service in {} exited with code {}",
            pane.service,
            config::project_display_name(project),
            pane.code.unwrap_or_default()
        );
        deliver(app, h);
    }
}

pub(super) fn deliver(app: &AppHandle, h: Happening) {
    let app = app.clone();
    std::thread::spawn(move || offer_all(&app, &h));
}

// ---- starting the jobs ----------------------------------------------------------

/// Each job's event, held from the moment it's offered until its run reads it.
fn pending() -> &'static Mutex<HashMap<String, Happening>> {
    static PENDING: OnceLock<Mutex<HashMap<String, Happening>>> = OnceLock::new();
    PENDING.get_or_init(Default::default)
}

/// Jobs an event started while other automations had every seat, oldest first.
fn queued() -> &'static Mutex<Vec<(String, String)>> {
    static QUEUED: OnceLock<Mutex<Vec<(String, String)>>> = OnceLock::new();
    QUEUED.get_or_init(Default::default)
}

pub(super) fn busy(key: &str) -> bool {
    inflight().lock().unwrap().contains_key(key)
        || active_runs().lock().unwrap().contains_key(key)
        || pending().lock().unwrap().contains_key(key)
}

pub(super) fn take(key: &str) -> Option<Happening> {
    pending().lock().unwrap().remove(key)
}

fn listeners(h: &Happening) -> Vec<(String, JobResolved)> {
    let archived = crate::project_archive::hidden_names();
    let projects = match h.kind {
        EventKind::AgentFinished => config::project_names(),
        _ => vec![h.project.clone()],
    };
    let mut out = Vec::new();
    for project in projects.into_iter().filter(|p| !archived.contains(p)) {
        for (_, _, res) in resolve_jobs(&project) {
            if let Ok(job) = res {
                if matches!(&job.schedule, Schedule::Event(spec) if matches(spec, &project, h)) {
                    out.push((project.clone(), job));
                }
            }
        }
    }
    for (_, res) in resolve_standalone_jobs() {
        if let Ok(job) = res {
            if matches!(&job.schedule, Schedule::Event(spec) if matches(spec, "", h)) {
                out.push((String::new(), job));
            }
        }
    }
    out
}

/// A job that names its computers reacts only on one of them.
fn runs_here(job: &JobResolved) -> bool {
    match &job.machines {
        None => true,
        Some(m) => machines::ahead_of(m, &machines::Names::load().me, &[]).is_some(),
    }
}

fn offer_all(app: &AppHandle, h: &Happening) {
    let today = today();
    for (project, job) in listeners(h) {
        offer(app, &project, job, h, &today);
    }
}

pub(super) fn offer(app: &AppHandle, project: &str, job: JobResolved, h: &Happening, today: &str) {
    let Schedule::Event(spec) = &job.schedule else {
        return;
    };
    let key = state_key(project, &job.id);
    if !load_job_state(&key).job_on(&job) || !runs_here(&job) {
        return;
    }
    if h.kind.is_pull_request() && !machines::first_on(app, &key, &job) {
        return;
    }
    // One at a time: two pull requests of the same look would each find the job free.
    static OFFERING: Mutex<()> = Mutex::new(());
    let _offering = OFFERING.lock().unwrap_or_else(|broken| broken.into_inner());
    if h.kind.is_pull_request() && busy(&key) {
        event_pulls::wait(project, &job.id, h);
        return;
    }
    if h.by_me_at.is_some_and(|at| load_job_state(&key).ran_at(at)) {
        return;
    }
    if inflight().lock().unwrap().contains_key(&key) || active_runs().lock().unwrap().contains_key(&key) {
        return;
    }
    let mark = mark(spec.at_most, h, today);
    let fresh = with_state(|f| {
        let st = f.jobs.entry(key.clone()).or_default();
        if st.last_event.as_deref() == Some(mark.as_str()) {
            return false;
        }
        st.last_event = Some(mark.clone());
        true
    })
    .unwrap_or(false);
    let subject = match h.pull {
        Some(number) => super::event_rounds::Subject::Pull {
            number,
            url: &h.url,
            bots_only: h.bots_only,
        },
        None => super::event_rounds::Subject::Branch(&h.branch),
    };
    if !fresh || !super::event_rounds::allows(app, project, &job, spec, &h.project, subject) {
        return;
    }
    pending().lock().unwrap().insert(key.clone(), h.clone());
    if under_way() >= max_concurrent() {
        record_capacity_skip(app, project, &job);
        let mut queue = queued().lock().unwrap();
        if !queue.iter().any(|(p, id)| p == project && *id == job.id) {
            queue.push((project.to_string(), job.id.clone()));
        }
        return;
    }
    spawn_pipeline(app, project, job, Trigger::Event);
}

/// Starts the queued jobs there is room for now, oldest first.
pub(super) fn drain(app: &AppHandle) {
    event_pulls::offer_held(app);
    let waiting: Vec<(String, String)> = queued().lock().unwrap().drain(..).collect();
    let mut still = Vec::new();
    for (project, id) in waiting {
        let key = state_key(&project, &id);
        if !pending().lock().unwrap().contains_key(&key) {
            continue;
        }
        if under_way() >= max_concurrent() {
            still.push((project, id));
            continue;
        }
        match super::find_job(&project, &id) {
            Some(job) => spawn_pipeline(app, &project, job, Trigger::Event),
            None => {
                take(&key);
            }
        }
    }
    let mut queue = queued().lock().unwrap();
    still.extend(queue.drain(..));
    *queue = still;
}

#[cfg(test)]
#[path = "event_runs_tests.rs"]
mod tests;
