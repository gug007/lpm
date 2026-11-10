// Questions filed under a key: one open question per key rather than one per
// automation, so a job can wait on several people at once (a Telegram chat
// each, say). Nothing waits on them. The run that asked carries on, scheduled
// runs keep coming, and the answer runs the automation's `onAnswer` command
// with the key and the answer in its environment. Asking again under a key
// replaces its open question: whatever it asked about has moved on, and the
// old one must never be answered.
use super::askform::{Ask, Request, REPLACED};
use super::*;

const MAX_KEY_CHARS: usize = 120;
/// How long a closed keyed question stays, so Telegram can still say how it
/// ended. An answered one moves onto the entry its `onAnswer` run leaves.
const KEEP_CLOSED_SECS: u64 = 24 * 60 * 60;
const ON_ANSWER_TIMEOUT: Duration = Duration::from_secs(10 * 60);

/// What an agent hears once its keyed question is out. A script hears
/// nothing: what it prints is its run's report.
const KEYED_ASKED: &str = "Your question is with the user. Nothing waits for the answer: it goes to this automation's onAnswer command, so carry on.";

pub(crate) fn parse_key(raw: &str) -> Result<String, String> {
    let key = raw.trim();
    if key.is_empty() {
        Err("The key is empty.".into())
    } else if key.chars().count() > MAX_KEY_CHARS || key.chars().any(char::is_control) {
        Err(format!(
            "A key is one line of up to {MAX_KEY_CHARS} characters."
        ))
    } else {
        Ok(key.to_string())
    }
}

fn no_on_answer(job_id: &str) -> String {
    format!(
        "This automation has no onAnswer command, so the answer to a keyed question would go nowhere. Add one first: lpm automations edit {job_id} --on-answer '<command>'."
    )
}

/// File `ask` in `st`, closing the open question under its key. Returns the
/// one it replaced, which stays as the key's only closed question.
fn file(st: &mut JobState, ask: Ask, now: u64) -> Option<Ask> {
    st.keyed.retain(|a| {
        a.is_open()
            || (a.key != ask.key
                && a.answered_at
                    .is_some_and(|t| now.saturating_sub(t) < KEEP_CLOSED_SECS))
    });
    let replaced = st.keyed.iter_mut().find(|a| a.key == ask.key).map(|a| {
        a.close(REPLACED, now);
        a.clone()
    });
    st.keyed.push(ask);
    replaced
}

/// Put a question filed under `key` to the user on behalf of the run holding
/// `token`.
pub(super) fn open(
    app: &AppHandle,
    token: &str,
    key: String,
    request: Request,
) -> Result<Value, String> {
    let gone = "This run has ended, so it can't ask anything now.";
    let state_key = {
        let _g = state_lock().lock().unwrap();
        let mut f = load_state_file();
        ask::by_token(&mut f, token).map(|(k, _)| k.clone())
    }
    .ok_or(gone)?;
    let (project, job_id) = split_key(&state_key);
    if find_job(project, job_id).is_none_or(|j| j.on_answer.is_empty()) {
        return Err(no_on_answer(job_id));
    }
    let now = now_secs();
    let (ask, replaced, agent) = try_with_state(|f| {
        let (_, st) = ask::by_token(f, token).ok_or(gone)?;
        let agent = st.active_run.as_ref().is_some_and(|r| r.agent.is_some());
        let mut ask = Ask::new(now, request, false);
        ask.key = Some(key);
        let replaced = file(st, ask.clone(), now);
        Ok((ask, replaced, agent))
    })?;
    ask::announce_asked(app, project, job_id, &ask);
    let mut reply = json!({ "ok": true, "id": ask.id, "key": ask.key, "blocking": false });
    if agent {
        reply["message"] = json!(KEYED_ASKED);
    }
    if let Some(old) = replaced {
        reply["replaced"] = json!(old.id);
    }
    Ok(reply)
}

/// The job's open keyed questions, oldest first.
pub(super) fn waiting(st: &JobState) -> impl Iterator<Item = &Ask> {
    st.keyed.iter().filter(|a| a.is_open())
}

/// The answer the way `lpm ask` prints it to a script: yes or no, the picks a
/// line each, or the text; several questions as JSON.
pub(crate) fn answer_value(ask: &Ask) -> String {
    match ask.questions.as_slice() {
        [q] => match ask.answers.get(&q.id) {
            Some(Value::Bool(yes)) => if *yes { "yes" } else { "no" }.to_string(),
            Some(Value::Array(picks)) => picks
                .iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>()
                .join("\n"),
            Some(Value::String(text)) => text.clone(),
            _ => String::new(),
        },
        _ => Value::Object(ask.answers.clone()).to_string(),
    }
}

fn answer_env(ask: &Ask) -> Vec<(String, String)> {
    [
        ("LPM_ASK_KEY", ask.key.clone().unwrap_or_default()),
        ("LPM_ASK_ID", ask.id.clone()),
        ("LPM_ANSWER", answer_value(ask)),
        (
            "LPM_ANSWERS",
            Value::Object(ask.answers.clone()).to_string(),
        ),
    ]
    .into_iter()
    .map(|(k, v)| (k.to_string(), v))
    .collect()
}

fn run_on_answer(project: &str, job_id: &str, ask: &Ask) -> Result<CheckOutcome, String> {
    let job = find_job(project, job_id)
        .ok_or("This automation no longer exists, so the answer went nowhere.")?;
    if job.on_answer.is_empty() {
        return Err(
            "This automation has no onAnswer command any more, so the answer went nowhere.".into(),
        );
    }
    let root = dispatch_root(project).ok_or("This project has no local folder to run in.")?;
    let last_run_at = load_job_state(&state_key(project, job_id)).last_run_at;
    let mut env = run_env(
        project,
        job_id,
        &root,
        Trigger::Answer,
        None,
        last_run_at,
        None,
    );
    env.extend(answer_env(ask));
    let claude = crate::claude_pool::job_spawn_env(project, None, job.claude_account()).env;
    run_check(
        &root,
        &job.on_answer,
        ON_ANSWER_TIMEOUT,
        None,
        &env,
        &claude,
    )
    .map_err(|e| {
        if e == "check timed out" {
            "The onAnswer command ran too long and was stopped.".to_string()
        } else {
            format!("The onAnswer command couldn't run: {e}.")
        }
    })
}

/// Hand an answered keyed question to the job's `onAnswer` command, off the
/// caller's thread. The question moves onto the entry the command leaves.
pub(super) fn answered(app: &AppHandle, key: &str, ask: Ask) {
    let (app, key) = (app.clone(), key.to_string());
    std::thread::spawn(move || {
        let (project, job_id) = split_key(&key);
        let started = now_secs();
        let (result, output) = match run_on_answer(project, job_id, &ask) {
            Ok(ran) if ran.work => (COMPLETED, ran.output),
            Ok(ran) => (
                ERROR,
                ran.output
                    .or_else(|| Some("The onAnswer command failed.".to_string())),
            ),
            Err(e) => (ERROR, Some(e)),
        };
        let at = now_secs();
        let entry = HistoryEntry {
            at,
            result: result.to_string(),
            output: output.clone(),
            duration_secs: Some(at.saturating_sub(started)),
            asks: vec![ask.clone()],
            ..HistoryEntry::default()
        };
        let _ = with_state(|f| {
            let st = f.jobs.entry(key.clone()).or_default();
            st.keyed.retain(|a| a.id != ask.id);
            push_entry(st, entry);
        });
        if result == ERROR {
            let detail = format!("The answer to \"{}\" didn't go through.", ask.summary());
            emit_status_detail(
                &app,
                project,
                job_id,
                ERROR,
                &None,
                Some(detail),
                SendOut::Report(output.as_deref()),
            );
        } else {
            refresh_rows(&app, &key);
        }
    });
}

#[cfg(test)]
#[path = "keyed_tests.rs"]
mod tests;
