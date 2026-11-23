// Which computer runs an automation that names the computers it may run on.
//
// `machines: [A, B]` lists them by hostId, best first: A runs it whenever A is
// on, B only while A is off. A trailing `any` lets every other computer that
// has it take a turn after them, lowest hostId first. Without the field every
// computer that has the job runs it, as before.
//
// Config sync hands each computer the same definition, so each decides for
// itself when a run comes due: it leaves the run to one ahead of it that is on,
// gives one that has just dropped off a few minutes to come back, and before
// running asks the others whether one of them already did. The first computer
// keeps the history, pulling in the runs the others made while it was away.
use super::*;

/// The question one computer asks another about a job: answered in Rust by the
/// host (peer.rs fast path), so a host whose page is busy or missing still can.
pub(crate) const RUNS_CMD: &str = "host_job_runs";

const ANY: &str = "any";
/// How long a computer waits, per one ahead of it, for one that has dropped off
/// to come back before running in its place.
const STAND_IN_GRACE: u64 = 5 * 60;
/// A run first noticed this long after it came due was missed — the computer
/// was asleep or lpm was closed — and another may have run it meanwhile.
const LATE_AFTER: u64 = 3 * 60;
/// How long a missed run waits for the other computers to come back into
/// reach, so it can ask them whether one of them ran it.
const CATCH_UP_GRACE: u64 = 5 * 60;
/// How often the first computer pulls in the runs the others made for it.
const PULL_EVERY: u64 = 10 * 60;
/// How far back a pull looks.
const PULL_WINDOW: u64 = 2 * 24 * 60 * 60;
const ASK_TIMEOUT: Duration = Duration::from_secs(5);

/// `machines: any`, or `machines: [<hostId>, …, any]`.
#[derive(Deserialize, Clone)]
#[serde(untagged)]
pub(super) enum MachinesValue {
    One(String),
    Many(Vec<String>),
}

#[derive(Clone, Debug, Default, PartialEq)]
pub(super) struct Machines {
    /// hostIds, best first.
    pub(super) list: Vec<String>,
    /// Any other computer that has the job may run it after the listed ones.
    pub(super) any: bool,
}

pub(super) fn parse(value: Option<&MachinesValue>) -> Option<Machines> {
    let raw = match value? {
        MachinesValue::One(id) => vec![id.clone()],
        MachinesValue::Many(ids) => ids.clone(),
    };
    let mut m = Machines::default();
    for id in raw.iter().map(|id| id.trim()).filter(|id| !id.is_empty()) {
        if id.eq_ignore_ascii_case(ANY) {
            m.any = true;
        } else if !m.list.iter().any(|x| x == id) {
            m.list.push(id.to_string());
        }
    }
    (m.any || !m.list.is_empty()).then_some(m)
}

/// The computers that come before `me` for this job, best first, among the
/// `known` others; None when `me` isn't one that may run it.
pub(super) fn ahead_of(m: &Machines, me: &str, known: &[String]) -> Option<Vec<String>> {
    if let Some(i) = m.list.iter().position(|id| id == me) {
        return Some(m.list[..i].to_vec());
    }
    if !m.any {
        return None;
    }
    let mut rest: Vec<String> = known
        .iter()
        .filter(|id| id.as_str() < me && !m.list.contains(id))
        .cloned()
        .collect();
    rest.sort();
    rest.dedup();
    Some(m.list.iter().cloned().chain(rest).collect())
}

/// Every other computer that could have run the job: the listed ones and, with
/// `any`, every one this computer knows.
pub(super) fn others(m: &Machines, me: &str, known: &[String]) -> Vec<String> {
    let mut out: Vec<String> = m.list.iter().filter(|id| *id != me).cloned().collect();
    if m.any {
        for id in known {
            if id != me && !out.contains(id) {
                out.push(id.clone());
            }
        }
    }
    out
}

/// What a computer ahead of this one is doing about a run.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) enum Ahead {
    /// It's on and runs the job, or has it turned off: not this one's to run.
    Takes,
    /// It's on, but doesn't have the job (its config hasn't synced) or may not
    /// run it.
    Passes,
    /// Out of reach, for this many seconds.
    Away(u64),
}

#[derive(Debug, PartialEq)]
pub(super) enum Turn {
    Run,
    Wait,
    Defer,
}

/// Whether this computer takes a due run now. One ahead that is on takes it;
/// one that is away counts as off once it has been for STAND_IN_GRACE per place
/// ahead of this one, so a blip in the connection doesn't hand the run to a
/// second computer and the ones further back take their turns one after
/// another.
pub(super) fn turn(ahead: &[Ahead]) -> Turn {
    if ahead.contains(&Ahead::Takes) {
        return Turn::Defer;
    }
    let patience = STAND_IN_GRACE * ahead.len() as u64;
    if ahead.iter().any(|a| matches!(a, Ahead::Away(secs) if *secs < patience)) {
        return Turn::Wait;
    }
    Turn::Run
}

/// A run this computer missed waits for the others that might have run it to
/// come back into reach, but only so long.
pub(super) fn catch_up_waits(late: bool, others_away: bool, since_noticed: u64) -> bool {
    late && others_away && since_noticed < CATCH_UP_GRACE
}

/// What a run outcome means for whether the job ran: skips and holds don't.
fn ran(result: &str) -> bool {
    !matches!(
        result,
        SKIPPED_OVERLAP
            | SKIPPED_PENDING_COPY
            | PENDING_WINDOW
            | SKIPPED_CAPACITY
            | SKIPPED_CI_ROUNDS
    )
}

/// Whether `entry` is a run of the occurrence that came due at `fire` (a reply
/// someone sent later isn't).
pub(super) fn covers(entry: &HistoryEntry, fire: u64) -> bool {
    entry.question.is_none() && entry.at >= fire && ran(&entry.result)
}

/// Fold runs another computer made into `st`, oldest first, each once.
/// Returns whether any was new.
pub(super) fn merge_runs(st: &mut JobState, name: &str, runs: &[HistoryEntry]) -> bool {
    let mut added = false;
    for run in runs {
        if st
            .history
            .iter()
            .any(|h| h.at == run.at && h.ran_on.as_deref() == Some(name))
        {
            continue;
        }
        let mut entry = run.clone();
        entry.ran_on = Some(name.to_string());
        // Its copy is a project on the other computer.
        entry.copy = None;
        if entry.question.is_none() {
            st.last_run_at = Some(st.last_run_at.map_or(entry.at, |l| l.max(entry.at)));
        }
        let at = entry.at;
        let pos = st.history.partition_point(|h| h.at <= at);
        st.history.insert(pos, entry);
        added = true;
    }
    let overflow = st.history.len().saturating_sub(HISTORY_CAP);
    if overflow > 0 {
        st.history.drain(0..overflow);
    }
    added
}

// ---- this computer and the others -------------------------------------------

/// Names for the computers a job lists, from this one's point of view.
pub(super) struct Names {
    pub(super) me: String,
    by_id: HashMap<String, String>,
}

impl Names {
    pub(super) fn load() -> Self {
        let cfg = crate::peer::load_config();
        let mut by_id: HashMap<String, String> = HashMap::new();
        for d in &cfg.host.devices {
            if !d.host_id.is_empty() && !d.name.trim().is_empty() {
                by_id.insert(d.host_id.clone(), d.name.clone());
            }
        }
        for p in &cfg.peers {
            let name = if p.alias.trim().is_empty() { &p.host } else { &p.alias };
            if !p.host_id.is_empty() && !name.trim().is_empty() {
                by_id.insert(p.host_id.clone(), name.clone());
            }
        }
        by_id.insert(cfg.host.host_id.clone(), crate::peer::machine_name());
        Names {
            me: cfg.host.host_id,
            by_id,
        }
    }

    fn name(&self, id: &str) -> String {
        self.by_id.get(id).cloned().unwrap_or_default()
    }

    fn entry(&self, id: &str) -> Value {
        json!({ "id": id, "name": self.name(id), "here": id == self.me })
    }

    /// This computer and every one paired with it, either way round — what
    /// an editor offers to run a job on.
    pub(super) fn known(&self) -> Vec<Value> {
        let mut ids: Vec<&String> = self.by_id.keys().filter(|id| **id != self.me).collect();
        ids.sort_by_key(|id| self.name(id).to_lowercase());
        std::iter::once(self.entry(&self.me))
            .chain(ids.into_iter().map(|id| self.entry(id)))
            .collect()
    }

    /// The list fields of a job that names its computers: which, with their
    /// names, and which computer this row comes from, so a list that gathers
    /// several computers' rows can keep the one that runs the job.
    pub(super) fn add_row_fields(&self, row: &mut Value, job: &JobResolved) {
        let Some(m) = &job.machines else { return };
        row["machines"] = Value::Array(m.list.iter().map(|id| self.entry(id)).collect());
        row["anyMachine"] = json!(m.any);
        row["machineId"] = json!(self.me);
    }
}

/// What the editors offer to run a job on.
pub(crate) fn known_machines() -> Vec<Value> {
    Names::load().known()
}

impl Names {
    /// The hostId a `machines` entry means: `any` as is, `this` for this
    /// computer, a computer's name, or a hostId.
    fn resolve(&self, entry: &str) -> String {
        let entry = entry.trim();
        if entry.eq_ignore_ascii_case(ANY) {
            return ANY.to_string();
        }
        if entry.eq_ignore_ascii_case("this") {
            return self.me.clone();
        }
        self.by_id
            .iter()
            .find(|(_, name)| name.eq_ignore_ascii_case(entry))
            .map(|(id, _)| id.clone())
            .unwrap_or_else(|| entry.to_string())
    }

    /// A job body about to be saved by a phone, the CLI or another computer:
    /// its `machines` given by name become hostIds, an empty list means every
    /// computer that has it, and a body that leaves the field out keeps what the
    /// job had — a new job runs where it was made.
    pub(super) fn settle_body(
        &self,
        body: &mut serde_norway::Value,
        existing: Option<&serde_norway::Value>,
    ) {
        let Some(map) = body.as_mapping_mut() else { return };
        let key = serde_norway::Value::from("machines");
        match map.get(&key).cloned() {
            Some(given) => {
                let entries: Vec<String> = match given {
                    serde_norway::Value::String(s) => vec![s],
                    serde_norway::Value::Sequence(seq) => seq
                        .iter()
                        .filter_map(|v| v.as_str().map(str::to_string))
                        .collect(),
                    _ => Vec::new(),
                };
                let mut ids: Vec<String> = Vec::new();
                for id in entries.iter().map(|e| self.resolve(e)).filter(|e| !e.is_empty()) {
                    if !ids.contains(&id) {
                        ids.push(id);
                    }
                }
                // `any` reads as "and then any other", so it goes last.
                if let Some(i) = ids.iter().position(|id| id == ANY) {
                    let any = ids.remove(i);
                    ids.push(any);
                }
                if ids.is_empty() {
                    map.shift_remove(&key);
                } else {
                    map.insert(key, ids.into_iter().map(serde_norway::Value::from).collect());
                }
            }
            None => match existing {
                Some(old) => {
                    if let Some(kept) = old.get("machines") {
                        map.insert(key, kept.clone());
                    }
                }
                None if !self.me.is_empty() => {
                    map.insert(key, vec![serde_norway::Value::from(self.me.clone())].into());
                }
                None => {}
            },
        }
    }
}

struct Peer {
    id: String,
    name: String,
    /// How to ask it something: only a computer this one connects to can be.
    slug: Option<String>,
    up: bool,
}

/// The computers paired with this one either way round, each once.
fn peers(app: &AppHandle) -> Vec<Peer> {
    let mut out: Vec<Peer> = Vec::new();
    if let Some(hub) = app.try_state::<crate::peerclient::PeerClientHub>() {
        for (id, slug, name, up) in hub.paired_hosts() {
            out.push(Peer {
                id,
                name,
                slug: Some(slug),
                up,
            });
        }
    }
    for (id, name, up) in crate::peer::paired_devices(app) {
        match out.iter_mut().find(|p| p.id == id) {
            Some(p) => p.up |= up,
            None => out.push(Peer {
                id,
                name,
                slug: None,
                up,
            }),
        }
    }
    out
}

/// What a computer says about one of its jobs.
#[derive(Serialize, Deserialize, Default)]
pub(super) struct Answer {
    #[serde(default)]
    has: bool,
    /// Its copy lets it run the job.
    #[serde(default)]
    eligible: bool,
    #[serde(default)]
    enabled: bool,
    #[serde(default)]
    running: bool,
    /// Its own runs since the asked-for time.
    #[serde(default)]
    runs: Vec<HistoryEntry>,
}

fn ask(app: &AppHandle, slug: &str, key: &str, since: u64) -> Option<Answer> {
    let hub = app.try_state::<crate::peerclient::PeerClientHub>()?;
    let value = hub
        .invoke_within(slug, RUNS_CMD, json!({ "key": key, "since": since }), ASK_TIMEOUT)
        .ok()?;
    serde_json::from_value(value).ok()
}

/// The answer to another computer's RUNS_CMD about the job at `key`.
pub(crate) fn answer(args: &Value) -> Result<Value, String> {
    let key = args.get("key").and_then(Value::as_str).unwrap_or_default();
    let since = args.get("since").and_then(Value::as_u64).unwrap_or(0);
    let (project, id) = split_key(key);
    let st = load_job_state(key);
    let running = running_since(key).is_some() || st.active_run.is_some();
    let job = find_job(project, id);
    let me = crate::peer::local_host_id();
    let mut runs: Vec<HistoryEntry> = st
        .history
        .iter()
        .filter(|e| e.at > since && e.ran_on.is_none() && ran(&e.result))
        .cloned()
        .collect();
    // A live run's start marker isn't a run yet.
    if running && runs.last().is_some_and(|e| e.result == FOUND_WORK && e.output.is_none()) {
        runs.pop();
    }
    let answer = Answer {
        has: job.is_some(),
        eligible: job.as_ref().is_some_and(|j| match &j.machines {
            None => true,
            Some(m) => m.any || m.list.contains(&me),
        }),
        enabled: job.as_ref().is_some_and(|j| st.job_on(j)),
        running,
        runs,
    };
    serde_json::to_value(answer).map_err(|e| e.to_string())
}

// ---- the scheduler's side ---------------------------------------------------

#[derive(Debug, PartialEq)]
pub(super) enum Plan {
    Run,
    /// Not yet: ask again next tick.
    Hold,
    /// Another computer has this run.
    Skip,
}

/// When this process first saw each job's current run due, by state key.
fn noticed() -> &'static Mutex<HashMap<String, (u64, u64)>> {
    static MAP: OnceLock<Mutex<HashMap<String, (u64, u64)>>> = OnceLock::new();
    MAP.get_or_init(|| Mutex::new(HashMap::new()))
}

fn note(key: &str, fire: u64, now: u64) -> u64 {
    let mut map = noticed().lock().unwrap();
    let seen = map.entry(key.to_string()).or_insert((fire, now));
    if seen.0 != fire {
        *seen = (fire, now);
    }
    seen.1
}

fn forget(key: &str) {
    noticed().lock().unwrap().remove(key);
}

/// Mark the run that came due as dealt with, without a history entry.
fn pass(key: &str, now: u64) {
    forget(key);
    let _ = with_state(|f| {
        let st = f.jobs.entry(key.to_string()).or_default();
        st.last_run_at = Some(st.last_run_at.map_or(now, |l| l.max(now)));
    });
}

fn take_in(app: &AppHandle, key: &str, name: &str, runs: &[HistoryEntry]) {
    if runs.is_empty() {
        return;
    }
    let added = with_state(|f| merge_runs(f.jobs.entry(key.to_string()).or_default(), name, runs))
        .unwrap_or(false);
    if added {
        // Project "" keeps it from reading as a run that just ended.
        let _ = app.emit("job-status", json!({ "project": "", "jobId": split_key(key).1 }));
    }
}

/// Another computer as this one sees it when a run comes due.
pub(super) struct Other {
    pub(super) id: String,
    pub(super) up: bool,
    /// How long it has been out of reach; 0 while it's up.
    pub(super) away: u64,
}

/// What to do about a due run, and the runs the others made of it to fold into
/// this computer's history, by computer.
pub(super) struct Decision {
    pub(super) plan: Plan,
    pub(super) take: Vec<(String, Vec<HistoryEntry>)>,
}

impl Decision {
    fn just(plan: Plan) -> Self {
        Decision {
            plan,
            take: Vec::new(),
        }
    }
}

/// `id`'s answer about the job, asked at most once per decision.
fn asked<'a>(
    answers: &'a mut HashMap<String, Option<Answer>>,
    ask: &mut impl FnMut(&str) -> Option<Answer>,
    id: &str,
) -> Option<&'a Answer> {
    answers
        .entry(id.to_string())
        .or_insert_with(|| ask(id))
        .as_ref()
}

/// Whether this computer runs the job's run that came due at `fire`, given the
/// other computers it knows and a way to ask one about the job (None when it
/// can't be asked). `seen` is when this computer first saw the run due.
pub(super) fn decide(
    m: &Machines,
    me: &str,
    known: &[Other],
    mut ask: impl FnMut(&str) -> Option<Answer>,
    fire: u64,
    now: u64,
    seen: u64,
) -> Decision {
    let ids: Vec<String> = known.iter().map(|o| o.id.clone()).collect();
    let Some(ahead) = ahead_of(m, me, &ids) else {
        return Decision::just(Plan::Skip);
    };
    let up = |id: &str| known.iter().any(|o| o.id == id && o.up);
    let mut answers: HashMap<String, Option<Answer>> = HashMap::new();

    let mut states: Vec<Ahead> = Vec::new();
    for id in &ahead {
        let state = if !up(id) {
            // One this computer isn't paired with can never be seen, so it
            // can't hold the run up.
            Ahead::Away(known.iter().find(|o| &o.id == id).map_or(u64::MAX, |o| o.away))
        } else {
            match asked(&mut answers, &mut ask, id) {
                Some(a) if a.has && (a.eligible || !a.enabled) => Ahead::Takes,
                Some(_) => Ahead::Passes,
                // On, but it can't be asked — an older lpm, which runs every
                // job it has.
                None => Ahead::Takes,
            }
        };
        states.push(state);
    }
    match turn(&states) {
        Turn::Defer => return Decision::just(Plan::Skip),
        Turn::Wait => return Decision::just(Plan::Hold),
        Turn::Run => {}
    }

    let keeper = ahead.is_empty();
    let mut take: Vec<(String, Vec<HistoryEntry>)> = Vec::new();
    let mut covered = false;
    let mut away = false;
    for id in others(m, me, &ids) {
        if !ids.contains(&id) {
            continue;
        }
        if !up(&id) {
            away = true;
            continue;
        }
        let Some(a) = asked(&mut answers, &mut ask, &id) else {
            continue;
        };
        covered |= a.running || a.runs.iter().any(|r| covers(r, fire));
        if keeper && !a.runs.is_empty() {
            take.push((id.clone(), a.runs.clone()));
        }
    }
    let late = seen.saturating_sub(fire) > LATE_AFTER;
    let plan = if covered {
        Plan::Skip
    } else if catch_up_waits(late, away, now.saturating_sub(seen)) {
        Plan::Hold
    } else {
        Plan::Run
    };
    Decision { plan, take }
}

/// Whether this computer runs the job's run that came due at `fire`.
pub(super) fn plan(app: &AppHandle, key: &str, job: &JobResolved, now: u64, fire: u64) -> Plan {
    let Some(m) = &job.machines else {
        return Plan::Run;
    };
    let me = crate::peer::local_host_id();
    if me.is_empty() {
        return Plan::Run;
    }
    let peers = peers(app);
    let known = observe(&peers, now);
    let since = load_job_state(key).last_run_at.unwrap_or(0);
    // From the first tick that saw it due, so the wait for one ahead doesn't
    // make the run look missed.
    let seen = note(key, fire, now);
    let ask_peer = |id: &str| {
        let p = peers.iter().find(|p| p.id == id)?;
        ask(app, p.slug.as_deref()?, key, since)
    };
    let decision = decide(m, &me, &known, ask_peer, fire, now, seen);
    for (id, runs) in &decision.take {
        if let Some(p) = peers.iter().find(|p| &p.id == id) {
            take_in(app, key, &p.name, runs);
        }
    }
    match decision.plan {
        Plan::Skip => pass(key, now),
        Plan::Run => forget(key),
        Plan::Hold => {}
    }
    decision.plan
}

/// Since when each computer has been out of reach, as this one has seen it.
fn away_since() -> &'static Mutex<HashMap<String, u64>> {
    static MAP: OnceLock<Mutex<HashMap<String, u64>>> = OnceLock::new();
    MAP.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Note which computers are in reach now, and how long the rest have been out.
fn observe(peers: &[Peer], now: u64) -> Vec<Other> {
    let mut since = away_since().lock().unwrap();
    peers
        .iter()
        .map(|p| {
            let away = if p.up {
                since.remove(&p.id);
                0
            } else {
                now.saturating_sub(*since.entry(p.id.clone()).or_insert(now))
            };
            Other {
                id: p.id.clone(),
                up: p.up,
                away,
            }
        })
        .collect()
}

fn pulled() -> &'static Mutex<HashMap<String, u64>> {
    static MAP: OnceLock<Mutex<HashMap<String, u64>>> = OnceLock::new();
    MAP.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Pull in, now and then, the runs the other computers made of the jobs this
/// one keeps the history of — a run that was still going when this one asked,
/// or one made while the two couldn't reach each other.
pub(super) fn pull(app: &AppHandle, jobs: Vec<(String, Machines)>) {
    static BUSY: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    let me = crate::peer::local_host_id();
    if me.is_empty() || jobs.is_empty() {
        return;
    }
    let now = now_secs();
    // Every tick, so a computer's time away counts from when it went, not from
    // when a run next came due.
    observe(&peers(app), now);
    let due: Vec<(String, Machines)> = {
        let last = pulled().lock().unwrap();
        jobs.into_iter()
            .filter(|(key, _)| last.get(key).map_or(true, |at| now.saturating_sub(*at) >= PULL_EVERY))
            .collect()
    };
    if due.is_empty() || BUSY.swap(true, std::sync::atomic::Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let peers = peers(&app);
        let known: Vec<String> = peers.iter().map(|p| p.id.clone()).collect();
        for (key, m) in due {
            if ahead_of(&m, &me, &known).is_some_and(|a| a.is_empty()) {
                for id in others(&m, &me, &known) {
                    let Some(p) = peers.iter().find(|p| p.id == id && p.up) else {
                        continue;
                    };
                    let Some(slug) = p.slug.as_deref() else {
                        continue;
                    };
                    if let Some(a) = ask(&app, slug, &key, now.saturating_sub(PULL_WINDOW)) {
                        take_in(&app, &key, &p.name, &a.runs);
                    }
                }
            }
            pulled().lock().unwrap().insert(key, now);
        }
        BUSY.store(false, std::sync::atomic::Ordering::SeqCst);
    });
}

/// Turn a job that names its computers on or off where all of them read it:
/// in its config. A job that doesn't is left to the per-computer switch.
pub(super) fn write_switch(project: &str, job_id: &str, enabled: bool) -> Result<(), String> {
    let source = if project.is_empty() {
        resolve_standalone_jobs()
            .into_iter()
            .find(|(id, _)| id == job_id)
            .and_then(|(_, r)| r.ok())
            .filter(|j| j.machines.is_some())
            .map(|_| SOURCE_GLOBAL)
    } else {
        resolve_jobs(project)
            .into_iter()
            .find(|(id, _, _)| id == job_id)
            .and_then(|(_, source, r)| r.ok().filter(|j| j.machines.is_some()).map(|_| source))
    };
    let Some(source) = source else {
        return Ok(());
    };
    let path = job_config_path(source, project)?;
    let mut doc = read_yaml_doc_strict(&path)?;
    let Some(body) = doc
        .get_mut("jobs")
        .and_then(|jobs| jobs.get_mut(job_id))
        .and_then(serde_norway::Value::as_mapping_mut)
    else {
        return Ok(());
    };
    if enabled {
        body.shift_remove("enabled");
    } else {
        body.insert("enabled".into(), false.into());
    }
    write_yaml_doc(&path, &doc)
}

#[cfg(test)]
#[path = "machines_tests.rs"]
mod tests;
