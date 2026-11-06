// Stepping in on a live run. A headless Claude run takes no input, so stepping
// in ends it and carries its conversation on in a terminal tab, in the folder
// it was working in.
use super::*;
use std::io::Read;
use std::time::Instant;

const STOP_WAIT: Duration = Duration::from_secs(5);
const STOP_POLL: Duration = Duration::from_millis(50);

/// Only Claude's conversation can be picked up, and only a project has tabs to
/// pick it up in.
pub(super) fn can_take_over(project: &str, run: &ActiveRun) -> bool {
    run.agent.as_deref() == Some(CLAUDE) && !project.is_empty()
}

/// The conversation a Claude run's log names. Unlike the session on a finished
/// run's result, this is there from the run's first lines. Only a plain token
/// goes into the command, which is typed into a terminal and read back as the
/// tab's identity.
fn session_in_log(raw: &str) -> Option<String> {
    raw.lines().find_map(|line| {
        let event = serde_json::from_str::<Value>(line.trim()).ok()?;
        event_session(&event).filter(|id| crate::socketsrv::valid_session_id(id))
    })
}

fn read_log_head(path: &str) -> String {
    let mut bytes = Vec::new();
    if let Ok(file) = std::fs::File::open(path) {
        let _ = file.take(LIVE_READ_BYTES).read_to_end(&mut bytes);
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

/// The tab that carries a run on. It may start on another Claude account than
/// the run did, so it brings the conversation along the way a fork does.
fn resume_task(project: &str, session: &str, flags: &str, label: &str, emoji: &str) -> Value {
    let command = format!("{CLAUDE} --resume {session}{flags}");
    let mut task = json!({
        "kind": "fork",
        "command": command,
        "label": label,
        "startCmd": CLAUDE,
        "resumeCmd": command,
        "claudeSession": { "sourceProject": project, "sessionId": session },
    });
    if !emoji.is_empty() {
        task["emoji"] = json!(emoji);
    }
    task
}

/// Ends the job's live run and returns the project to open a tab in and the
/// task that starts it. Refuses before stopping anything, so a run that can't
/// be carried on keeps going.
pub(crate) fn take_over(project: &str, job_id: &str) -> Result<Value, String> {
    let key = state_key(project, job_id);
    let run = load_job_state(&key)
        .active_run
        .filter(|_| running_since(&key).is_some())
        .ok_or("This run has already finished.")?;
    if !can_take_over(project, &run) {
        return Err("Only a Claude run in a project can carry on in a terminal.".into());
    }
    let session = session_in_log(&read_log_head(&run.log_path))
        .ok_or("This run is still starting. Try again in a moment.")?;

    request_cancel(&key);
    let deadline = Instant::now() + STOP_WAIT;
    while active_runs().lock().unwrap().contains_key(&key) && Instant::now() < deadline {
        std::thread::sleep(STOP_POLL);
    }
    let job = find_job(project, job_id);
    let target = run.copy.unwrap_or_else(|| project.to_string());
    let task = resume_task(
        &target,
        &session,
        &run.terminal_flags,
        &label_of(job.as_ref(), job_id),
        job.as_ref().map_or("", |j| j.emoji.as_str()),
    );
    Ok(json!({ "project": target, "task": task }))
}

/// `take_over` for a caller with no window of its own to open the tab in.
pub(crate) fn take_over_in_app(app: &AppHandle, project: &str, job_id: &str) -> Result<(), String> {
    if app.get_webview_window("main").is_none() {
        return Err("Open lpm on this computer to carry the run on in a terminal.".into());
    }
    let mut tab = take_over(project, job_id)?;
    tab["select"] = json!(true);
    let _ = app.emit("remote-run-task", tab);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_session_past_lines_that_are_not_events() {
        let log = "some hook said hello\n\n{\"type\":\"system\",\"subtype\":\"init\",\"session_id\":\"abc-1\"}\n{\"type\":\"assistant\",\"session_id\":\"later\"}\n";
        assert_eq!(session_in_log(log).as_deref(), Some("abc-1"));
        assert_eq!(session_in_log("no events yet\n"), None);
        assert_eq!(session_in_log("{\"type\":\"system\"}\n"), None);
    }

    #[test]
    fn a_session_that_is_not_a_plain_token_never_reaches_the_command() {
        let log = "{\"session_id\":\"x; rm -rf ~\"}\n{\"session_id\":\"abc-1\"}\n";
        assert_eq!(session_in_log(log).as_deref(), Some("abc-1"));
    }

    #[test]
    fn the_tab_restores_the_same_conversation_the_way_the_run_had_it() {
        let flags = claude_terminal_flags("opus", "high", true);
        let task = resume_task("app-x1", "abc-1", &flags, "Sentry triage", "");
        assert_eq!(task["kind"], "fork");
        assert_eq!(
            task["resumeCmd"],
            "claude --resume abc-1 --model 'opus' --effort 'high' --dangerously-skip-permissions"
        );
        assert_eq!(task["command"], task["resumeCmd"]);
        assert_eq!(task["startCmd"], "claude");
        assert_eq!(
            task["claudeSession"],
            json!({ "sourceProject": "app-x1", "sessionId": "abc-1" })
        );
        assert!(task.get("emoji").is_none());
    }

    #[test]
    fn a_run_that_could_not_approve_tools_stays_that_way_in_the_terminal() {
        let flags = claude_terminal_flags("", "", false);
        let task = resume_task("app", "abc-1", &flags, "x", "🩺");
        assert_eq!(task["command"], "claude --resume abc-1");
        assert_eq!(task["emoji"], "🩺");
    }
}
