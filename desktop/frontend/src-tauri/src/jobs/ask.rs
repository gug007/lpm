// A run asking the user something, and going on once they answer.
//
// `lpm ask` names its run by the LPM_RUN_ID the run was started with. An agent
// run asks and ends its turn: nothing waits, the question outlives the app,
// and the answer goes back to the agent as the next message of that run's
// conversation, through the same path as a reply. A command can't be picked up
// halfway, so a command run's `lpm ask` waits for the answer instead — while it
// waits, the run's clock stops and it gives up its seat among the automations
// running at once.
//
// One question at a time per job: it lives on the run while the run is alive
// and moves onto the run's history entry when it ends. Questions asked under a
// key are the exception, with rules of their own (keyed.rs).
use super::askform::{self, Ask, ANSWERED, DISMISSED, UNANSWERED};
use super::*;
use crate::jobsocket::failure;
use crate::socketsrv::{job_result, parse_options};
use std::sync::Condvar;
use std::time::Instant;

/// What an agent hears back once its question is out.
const AGENT_ASKED: &str = "Your question is with the user. End your turn now: say in one line that you're waiting for their answer, and don't carry on or guess it. Their answer comes back to you as your next message.";
/// How long one `job_ask_wait` holds before answering "still open" — under the
/// CLI's 15 s request timeout, so the wait never reads as a dead app.
const WAIT_SLICE: Duration = Duration::from_secs(10);

fn blocked() -> &'static Mutex<HashSet<String>> {
    static SET: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    SET.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Whether the job's live run is held up waiting on an answer.
pub(super) fn is_blocked(key: &str) -> bool {
    blocked().lock().unwrap().contains(key)
}

/// Bumped whenever a question closes, waking every waiting command.
fn signal() -> &'static (Mutex<u64>, Condvar) {
    static SIGNAL: OnceLock<(Mutex<u64>, Condvar)> = OnceLock::new();
    SIGNAL.get_or_init(|| (Mutex::new(0), Condvar::new()))
}

fn settled(key: &str, ask: &Ask) {
    if ask.blocking {
        blocked().lock().unwrap().remove(key);
    }
    let (generation, cv) = signal();
    *generation.lock().unwrap() += 1;
    cv.notify_all();
}

/// A relaunched app picking a run back up: a question it was waiting on still
/// holds it.
pub(super) fn readopt(key: &str, asks: &[Ask]) {
    if asks.iter().any(|a| a.is_open() && a.blocking) {
        blocked().lock().unwrap().insert(key.to_string());
    }
}

/// Whether the run is to be resumed with an answer rather than counted done.
pub(super) fn resumes(asks: &[Ask]) -> bool {
    asks.iter()
        .any(|a| !a.blocking && (a.is_open() || a.status == ANSWERED))
}

/// What a run's questions become when the run ends: a command that ended
/// without its answer won't hear it now, and a stopped run's question is
/// dropped. An agent's open question stays open — answering it resumes the run.
pub(super) fn settle(asks: &mut [Ask], canceled: bool, at: u64) {
    for a in asks.iter_mut().filter(|a| a.is_open()) {
        if canceled {
            a.close(DISMISSED, at);
        } else if a.blocking {
            a.close(UNANSWERED, at);
        }
    }
}

/// Every question the job holds, with the entry that asked it — None for the
/// run still going, and for a keyed question, which belongs to no run.
fn asks(st: &JobState) -> impl Iterator<Item = (Option<u64>, &Ask)> {
    let live = st.active_run.iter().flat_map(|r| r.asks.iter().map(|a| (None, a)));
    let asked = st
        .history
        .iter()
        .flat_map(|h| h.asks.iter().map(move |a| (Some(h.at), a)));
    live.chain(asked).chain(st.keyed.iter().map(|a| (None, a)))
}

fn asks_mut(st: &mut JobState) -> impl Iterator<Item = (Option<u64>, &mut Ask)> {
    let JobState {
        active_run,
        history,
        keyed,
        ..
    } = st;
    let live = active_run
        .iter_mut()
        .flat_map(|r| r.asks.iter_mut().map(|a| (None, a)));
    let asked = history.iter_mut().flat_map(|h| {
        let at = h.at;
        h.asks.iter_mut().map(move |a| (Some(at), a))
    });
    live.chain(asked).chain(keyed.iter_mut().map(|a| (None, a)))
}

/// The job's open question, and the entry that asked it. A keyed question
/// never holds the job up, so it isn't this one.
fn open_with_at(st: &JobState) -> Option<(Option<u64>, &Ask)> {
    asks(st).find(|(_, a)| a.is_open() && a.key.is_none())
}

pub(super) fn open_in(st: &JobState) -> Option<&Ask> {
    open_with_at(st).map(|(_, a)| a)
}

/// The open question as the views get it, with the project it's waiting in and
/// the run it belongs to.
fn ask_json(at: Option<u64>, ask: &Ask, project: &str) -> Value {
    let mut v = json!(ask);
    v["project"] = json!(project);
    if let Some(at) = at {
        v["at"] = json!(at);
    }
    v
}

/// Every question the job waits on: the one holding it up first, then the
/// keyed ones oldest first.
pub(super) fn waiting_json(st: &JobState, project: &str) -> Vec<Value> {
    open_with_at(st)
        .into_iter()
        .chain(keyed::waiting(st).map(|a| (None, a)))
        .map(|(at, a)| ask_json(at, a, project))
        .collect()
}

fn find_mut<'a>(st: &'a mut JobState, id: &str) -> Option<(Option<u64>, &'a mut Ask)> {
    asks_mut(st).find(|(_, a)| a.id == id)
}

/// The job whose live run holds `token`.
pub(super) fn by_token<'a>(f: &'a mut JobsStateFile, token: &str) -> Option<(&'a String, &'a mut JobState)> {
    f.jobs
        .iter_mut()
        .find(|(_, st)| st.active_run.as_ref().and_then(|r| r.token.as_deref()) == Some(token))
}

fn not_open(ask: &Ask) -> String {
    match ask.status.as_str() {
        ANSWERED => "This question was already answered.".into(),
        DISMISSED => "This question was skipped.".into(),
        _ => "This question isn't waiting for an answer anymore.".into(),
    }
}

const GONE: &str = "That question isn't waiting for an answer anymore.";

/// The question `id` of `project`/`job_id` as it stands now, wherever it sits.
pub(crate) fn current(project: &str, job_id: &str, id: &str) -> Option<Ask> {
    let f = {
        let _g = state_lock().lock().unwrap();
        load_state_file()
    };
    let st = f.jobs.get(&state_key(project, job_id))?;
    let found = asks(st).map(|(_, a)| a).find(|a| a.id == id).cloned();
    found
}

/// Put a question to the user on behalf of the run holding `token`.
fn open(app: &AppHandle, token: &str, request: &Value) -> Result<Value, String> {
    let request = askform::parse_request(request)?;
    let now = now_secs();
    let (key, ask) = try_with_state(|f| {
        let (key, st) = by_token(f, token)
            .ok_or("This run has ended, so it can't ask anything now.")?;
        if open_in(st).is_some() {
            return Err(
                "This automation is already waiting for an answer to an earlier question."
                    .to_string(),
            );
        }
        let run = st.active_run.as_mut().expect("matched on its token");
        let ask = Ask::new(now, request, run.agent.is_none());
        run.asks.push(ask.clone());
        Ok((key.clone(), ask))
    })?;
    let (project, job_id) = split_key(&key);
    if ask.blocking {
        blocked().lock().unwrap().insert(key.clone());
        announce_asked(app, project, job_id, &ask);
    } else {
        // The agent is still ending its turn; the run announces the question
        // when it does.
        refresh_rows(app, &key);
    }
    let mut reply = json!({ "ok": true, "id": ask.id, "blocking": ask.blocking });
    if !ask.blocking {
        reply["message"] = json!(AGENT_ASKED);
    }
    Ok(reply)
}

/// Tell the views, and wherever the job sends its results, that `ask` waits.
pub(super) fn announce_asked(app: &AppHandle, project: &str, job_id: &str, ask: &Ask) {
    emit_status_detail(
        app,
        project,
        job_id,
        ASKED,
        &None,
        Some(ask.summary()),
        SendOut::Asked(Some(&ask.outline()), ask),
    );
}

/// The question `id` asked by the run holding `token`, as it stands now.
fn find_by_token(token: &str, id: &str) -> Option<Ask> {
    let mut f = {
        let _g = state_lock().lock().unwrap();
        load_state_file()
    };
    let (_, st) = by_token(&mut f, token)?;
    st.active_run.as_ref()?.asks.iter().find(|a| a.id == id).cloned()
}

/// Hold until the question closes or `max` passes, then say how it stands.
/// Every close goes through `settled`, so a wait that ends without the
/// generation moving needs no second look at the state.
fn wait_for(token: &str, id: &str, max: Duration) -> Value {
    let deadline = Instant::now() + max;
    let (generation, cv) = signal();
    let still_open = || json!({ "ok": true, "status": askform::OPEN });
    loop {
        let seen = *generation.lock().unwrap();
        let Some(ask) = find_by_token(token, id) else {
            return json!({ "ok": true, "status": UNANSWERED });
        };
        if !ask.is_open() {
            return json!({ "ok": true, "status": ask.status, "ask": ask });
        }
        let left = deadline.saturating_duration_since(Instant::now());
        if left.is_zero() {
            return still_open();
        }
        let guard = generation.lock().unwrap();
        let timed_out = cv
            .wait_timeout_while(guard, left, |g| *g == seen)
            .unwrap()
            .1
            .timed_out();
        if timed_out {
            return still_open();
        }
    }
}

/// Resume an agent's conversation with the answer to its question.
fn resume(app: &AppHandle, key: &str, at: u64, ask: &Ask) -> Result<(), String> {
    let (project, job_id) = split_key(key);
    start_followup(
        app,
        project,
        job_id,
        at,
        Followup {
            message: ask.answer_text(),
            answer_to: Some(ask.id.clone()),
            ..Followup::default()
        },
    )
}

/// Resume with the answer; one that can't resume the run goes back up to be
/// answered again.
fn resume_or_reopen(app: &AppHandle, key: &str, at: u64, ask: &Ask) -> Result<(), String> {
    resume(app, key, at, ask).inspect_err(|_| {
        let _ = with_state(|f| {
            if let Some((_, a)) = f.jobs.get_mut(key).and_then(|st| find_mut(st, &ask.id)) {
                a.status = askform::OPEN.to_string();
                a.answers.clear();
                a.reply = None;
                a.answered_at = None;
                a.auto = false;
            }
        });
        refresh_rows(app, key);
    })
}

/// After a run's entry is written: an answer that came in while the agent was
/// still ending its turn resumes it now.
pub(super) fn after_reap(app: &AppHandle, key: &str, at: u64, asks: &[Ask]) {
    blocked().lock().unwrap().remove(key);
    if let Some(answered) = asks
        .iter()
        .find(|a| !a.blocking && a.status == ANSWERED)
    {
        let _ = resume_or_reopen(app, key, at, answered);
    }
}

/// A plain reply in a thread waiting on a question answers it in the user's
/// own words.
pub(super) fn answer_in_words(key: &str, thread: &[u64], message: &str) {
    let now = now_secs();
    let answered = with_state(|f| {
        let Some(st) = f.jobs.get_mut(key) else {
            return Vec::new();
        };
        asks_mut(st)
            .filter(|(at, a)| at.is_some_and(|at| thread.contains(&at)) && a.is_open() && !a.blocking)
            .map(|(_, a)| {
                a.answer_in_words(message, now);
                a.clone()
            })
            .collect::<Vec<_>>()
    })
    .unwrap_or_default();
    for a in &answered {
        settled(key, a);
    }
}

/// Questions past their time: answered with the asker's defaults when they
/// cover it, otherwise closed unanswered. An expired answer that can't resume
/// its run isn't reopened — it would only expire again.
pub(super) fn expire_due(app: &AppHandle) {
    let now = now_secs();
    let due = |a: &Ask| a.is_open() && a.expires_at.is_some_and(|e| e <= now);
    let any = {
        let _g = state_lock().lock().unwrap();
        load_state_file()
            .jobs
            .values()
            .any(|st| asks(st).any(|(_, a)| due(a)))
    };
    if !any {
        return;
    }
    let expired = with_state(|f| {
        let mut out: Vec<(String, Option<u64>, Ask)> = Vec::new();
        for (key, st) in f.jobs.iter_mut() {
            for (at, a) in asks_mut(st).filter(|(_, a)| due(a)) {
                a.expire(now);
                out.push((key.clone(), at, a.clone()));
            }
        }
        out
    })
    .unwrap_or_default();
    for (key, at, ask) in expired {
        settled(&key, &ask);
        if ask.key.is_some() {
            if ask.status == ANSWERED {
                keyed::answered(app, &key, ask);
            } else {
                refresh_rows(app, &key);
            }
            continue;
        }
        match at {
            Some(at) if !ask.blocking && ask.status == ANSWERED => {
                if resume(app, &key, at, &ask).is_err() {
                    refresh_rows(app, &key);
                }
            }
            _ => refresh_rows(app, &key),
        }
    }
}

/// Close the job's open question `id` with `close`; the first to close it wins.
fn settle_open(
    key: &str,
    id: &str,
    close: impl FnOnce(&mut Ask) -> Result<(), String>,
) -> Result<(Option<u64>, Ask), String> {
    let (at, ask) = try_with_state(|f| {
        let (at, ask) = f
            .jobs
            .get_mut(key)
            .and_then(|st| find_mut(st, id))
            .ok_or(GONE)?;
        if !ask.is_open() {
            return Err(not_open(ask));
        }
        close(ask)?;
        Ok((at, ask.clone()))
    })?;
    settled(key, &ask);
    Ok((at, ask))
}

/// Answer the job's open question `ask_id`. `answers` maps each question's id
/// to its answer: true/false for yes/no, a list of picked labels, or text. The
/// first answer wins, from whichever device it comes.
#[tauri::command(async)]
pub fn answer_job_question(
    app: AppHandle,
    project: String,
    job_id: String,
    ask_id: String,
    answers: Value,
) -> Result<(), String> {
    let key = state_key(&project, &job_id);
    let (at, ask) = settle_open(&key, &ask_id, |ask| {
        let answers = askform::normalize_answers(&ask.questions, &answers)?;
        ask.answer(answers, now_secs(), false);
        Ok(())
    })?;
    if ask.key.is_some() {
        keyed::answered(&app, &key, ask);
        return Ok(());
    }
    match at {
        Some(at) if !ask.blocking => resume_or_reopen(&app, &key, at, &ask),
        _ => {
            emit_status(&app, &project, &job_id, RUNNING, &None);
            Ok(())
        }
    }
}

/// Drop the job's open question without answering it: an agent run is left
/// where it stopped, and a waiting command hears that no answer is coming.
#[tauri::command(async)]
pub fn dismiss_job_question(
    app: AppHandle,
    project: String,
    job_id: String,
    ask_id: String,
) -> Result<(), String> {
    let key = state_key(&project, &job_id);
    settle_open(&key, &ask_id, |ask| {
        ask.close(DISMISSED, now_secs());
        Ok(())
    })?;
    refresh_rows(&app, &key);
    Ok(())
}

// ---- socket verbs -------------------------------------------------------------
//
//   job_ask --run=<LPM_RUN_ID> --ask-hex=<JSON>        → {ok, id, blocking, message?}
//   job_ask_keyed --run=<LPM_RUN_ID> --key=<key> --ask-hex=<JSON>
//                                                      → {ok, id, key, replaced?, message}
//   job_ask_wait --run=<LPM_RUN_ID> --id=<ask id>      → {ok, status, ask?}
//   answer_job_question <project> <id> --ask=<ask id> --answers-hex=<JSON> [--no-project]
//   dismiss_job_question <project> <id> --ask=<ask id> [--no-project]

fn run_token(options: &HashMap<String, String>) -> Result<String, String> {
    options
        .get("run")
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .ok_or_else(|| "lpm ask only works inside an automation run.".to_string())
}

fn json_option(options: &HashMap<String, String>, name: &str) -> Result<Value, String> {
    let raw = options
        .get(name)
        .ok_or_else(|| format!("missing --{name}-hex"))?;
    serde_json::from_str(raw).map_err(|e| format!("--{name} isn't valid JSON: {e}"))
}

pub(crate) fn cmd_job_ask(args: &[String], app: &AppHandle) -> String {
    let (_, options) = parse_options(args);
    let result = run_token(&options).and_then(|token| {
        let request = json_option(&options, "ask")?;
        open(app, &token, &request)
    });
    match result {
        Ok(reply) => reply.to_string(),
        Err(e) => failure(e),
    }
}

/// `job_ask` under a key. A verb of its own, so an app too old to know keys
/// refuses it rather than opening a question the job would stop for.
pub(crate) fn cmd_job_ask_keyed(args: &[String], app: &AppHandle) -> String {
    let (_, options) = parse_options(args);
    let result = run_token(&options).and_then(|token| {
        let key = keyed::parse_key(options.get("key").map_or("", String::as_str))?;
        let request = askform::parse_request(&json_option(&options, "ask")?)?;
        keyed::open(app, &token, key, request)
    });
    match result {
        Ok(reply) => reply.to_string(),
        Err(e) => failure(e),
    }
}

pub(crate) fn cmd_job_ask_wait(args: &[String]) -> String {
    let (_, options) = parse_options(args);
    let token = match run_token(&options) {
        Ok(t) => t,
        Err(e) => return failure(e),
    };
    let Some(id) = options.get("id").filter(|id| !id.is_empty()) else {
        return failure("usage: job_ask_wait --run=<run> --id=<question>");
    };
    wait_for(&token, id, WAIT_SLICE).to_string()
}

fn job_question(
    args: &[String],
    verb: &str,
) -> Result<(String, String, String, HashMap<String, String>), String> {
    let (positional, options) = parse_options(args);
    let job = crate::jobsocket::job_ref(&positional, &options)
        .ok_or_else(|| format!("usage: {verb} <project> <job_id> --ask=<question>"))?;
    let ask_id = options
        .get("ask")
        .filter(|a| !a.is_empty())
        .cloned()
        .ok_or_else(|| format!("usage: {verb} <project> <job_id> --ask=<question>"))?;
    Ok((job.project.to_string(), job.id.to_string(), ask_id, options))
}

pub(crate) fn cmd_answer_job_question(args: &[String], app: &AppHandle) -> String {
    job_result(
        job_question(args, "answer_job_question").and_then(|(project, job_id, ask_id, options)| {
            let answers = json_option(&options, "answers")?;
            answer_job_question(app.clone(), project, job_id, ask_id, answers)
        }),
    )
}

pub(crate) fn cmd_dismiss_job_question(args: &[String], app: &AppHandle) -> String {
    job_result(
        job_question(args, "dismiss_job_question").and_then(|(project, job_id, ask_id, _)| {
            dismiss_job_question(app.clone(), project, job_id, ask_id)
        }),
    )
}

#[cfg(test)]
#[path = "ask_tests.rs"]
mod tests;
