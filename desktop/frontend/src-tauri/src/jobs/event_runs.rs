// Automations started by something lpm sees happen instead of by the clock: CI
// failing on a push from this computer (ci_watch.rs), a service's command
// ending in failure (read from the session daemon on the scheduler's tick), and
// an agent finishing its turn (socketsrv.rs). A run is told what happened in
// its environment and, when it hands an agent a prompt, at the top of it.
use super::events::{AtMost, EventKind, EventSpec};
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

// ---- what happened ----------------------------------------------------------

#[derive(Clone, Debug)]
pub(super) struct Happening {
    kind: EventKind,
    project: String,
    branch: String,
    commit: String,
    service: String,
    exit_code: Option<i32>,
    agent: String,
    summary: String,
    detail: String,
    url: String,
}

impl Happening {
    fn new(kind: EventKind, project: &str) -> Self {
        Happening {
            kind,
            project: project.to_string(),
            branch: String::new(),
            commit: String::new(),
            service: String::new(),
            exit_code: None,
            agent: String::new(),
            summary: String::new(),
            detail: String::new(),
            url: String::new(),
        }
    }

    /// The branch and commit a project's checkout is on now, for events that
    /// don't carry their own.
    fn at_checkout(mut self) -> Self {
        if let Ok((root, false)) = config::project_root(&self.project) {
            if !root.is_empty() {
                self.branch = crate::label_git::read_branch(&root).unwrap_or_default();
                self.commit = crate::gitworkstate::head_sha(&root).unwrap_or_default();
            }
        }
        self
    }
}

fn matches(spec: &EventSpec, job_project: &str, h: &Happening) -> bool {
    if spec.kind != h.kind {
        return false;
    }
    let place = if !spec.from.is_empty() {
        spec.from.contains(&h.project)
    } else {
        job_project.is_empty() || job_project == h.project
    };
    place
        && (spec.branches.is_empty() || spec.branches.contains(&h.branch))
        && (spec.services.is_empty() || spec.services.contains(&h.service))
}

/// What a job last reacted to, so the same commit (or day) starts it once. A
/// folder without Git has no commit to go by, so each day counts as one.
fn mark(at_most: AtMost, h: &Happening, today: &str) -> String {
    match at_most {
        AtMost::Commit if !h.commit.is_empty() => format!("commit:{}", h.commit),
        _ => format!("day:{today}"),
    }
}

fn today() -> String {
    chrono::Local::now().date_naive().to_string()
}

pub(super) fn env(h: &Happening) -> Vec<(String, String)> {
    let mut env = vec![
        ("LPM_EVENT".to_string(), h.kind.name().to_string()),
        ("LPM_EVENT_PROJECT".to_string(), h.project.clone()),
        ("LPM_EVENT_SUMMARY".to_string(), h.summary.clone()),
    ];
    let code = h.exit_code.map(|c| c.to_string()).unwrap_or_default();
    for (key, value) in [
        ("LPM_EVENT_BRANCH", &h.branch),
        ("LPM_EVENT_COMMIT", &h.commit),
        ("LPM_EVENT_SERVICE", &h.service),
        ("LPM_EVENT_EXIT_CODE", &code),
        ("LPM_EVENT_AGENT", &h.agent),
        ("LPM_EVENT_URL", &h.url),
        ("LPM_EVENT_DETAIL", &h.detail),
    ] {
        if !value.is_empty() {
            env.push((key.to_string(), value.clone()));
        }
    }
    env
}

/// What an agent is told first about why it was started, read back from the
/// run's environment.
fn prompt_note(env: &[(String, String)]) -> Option<String> {
    let get = |key: &str| {
        env.iter()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.as_str())
            .unwrap_or("")
    };
    let summary = get("LPM_EVENT_SUMMARY");
    if summary.is_empty() {
        return None;
    }
    let mut lines = vec![format!("This run started because {summary}.")];
    let commit = get("LPM_EVENT_COMMIT");
    if !commit.is_empty() {
        let short: String = commit.chars().take(7).collect();
        let branch = get("LPM_EVENT_BRANCH");
        lines.push(if branch.is_empty() {
            format!("Commit {short}.")
        } else {
            format!("Branch {branch}, commit {short}.")
        });
    }
    let url = get("LPM_EVENT_URL");
    if !url.is_empty() {
        lines.push(url.to_string());
    }
    let service = get("LPM_EVENT_SERVICE");
    if !service.is_empty() {
        lines.push(format!(
            "Its recent output: lpm logs {service} -p {}",
            get("LPM_EVENT_PROJECT")
        ));
    }
    let detail = get("LPM_EVENT_DETAIL");
    if !detail.is_empty() {
        lines.push(String::new());
        lines.push(detail.to_string());
    }
    Some(lines.join("\n"))
}

pub(super) fn with_note(prompt: &str, env: &[(String, String)]) -> String {
    match prompt_note(env) {
        Some(note) => format!("{note}\n\n{prompt}"),
        None => prompt.to_string(),
    }
}

// ---- which events anything listens for ---------------------------------------

/// The events some job reacts to, as of the scheduler's last tick. Nothing is
/// read or resolved for an event no job wants.
fn wanted() -> &'static Mutex<HashSet<EventKind>> {
    static WANTED: OnceLock<Mutex<HashSet<EventKind>>> = OnceLock::new();
    WANTED.get_or_init(Default::default)
}

fn is_wanted(kind: EventKind) -> bool {
    wanted().lock().unwrap().contains(&kind)
}

pub(super) fn set_wanted(kinds: HashSet<EventKind>) {
    *wanted().lock().unwrap() = kinds;
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

fn deliver(app: &AppHandle, h: Happening) {
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

fn offer(app: &AppHandle, project: &str, job: JobResolved, h: &Happening, today: &str) {
    let Schedule::Event(spec) = &job.schedule else {
        return;
    };
    let key = state_key(project, &job.id);
    if !load_job_state(&key).job_on(&job) || !runs_here(&job) {
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
    if !fresh || !super::event_rounds::allows(app, project, &job, spec, &h.project, &h.branch) {
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
