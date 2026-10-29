// What a banner about an agent says. The title is where it happened — the
// project and the tab, since a project can run several agents — and the body
// what happened and how long the turn took, with the start of a finished Claude
// session's answer under it.
use crate::agent_last_answer::newest_answer;
use crate::agentkind::AgentKind;
use crate::notifychannels::NotificationEvent;
use crate::sound::StatusSound;
use crate::status::{StatusEntry, STATUS_DONE};
use std::time::Duration;

const ANSWER_CHARS: usize = 140;

/// Claude writes its transcript asynchronously, so the answer that ended a turn
/// can land a moment after the hook that reported the finish.
const TRANSCRIPT_SETTLE: Duration = Duration::from_millis(300);

pub struct Banner {
    pub title: String,
    pub body: String,
}

impl Banner {
    /// The banner for a transition worth interrupting for; Running is a
    /// progress detail, never one.
    pub fn of(news: &StatusSound) -> Option<Self> {
        let event = NotificationEvent::of_status(&news.value)?;
        let mut body = what_happened(event, news.elapsed_ms.and_then(took))?;
        if let Some(answer) = news.answer.as_deref().filter(|a| !a.is_empty()) {
            body.push('\n');
            body.push_str(answer);
        }
        Some(Self {
            title: title(&news.project, &news.terminal),
            body,
        })
    }
}

fn title(project: &str, terminal: &str) -> String {
    match (project, terminal) {
        ("", "") => "lpm".to_string(),
        (place, "") | ("", place) => place.to_string(),
        (project, terminal) => format!("{project} · {terminal}"),
    }
}

fn what_happened(event: NotificationEvent, took: Option<String>) -> Option<String> {
    Some(match (event, took) {
        (NotificationEvent::AgentWaiting, _) => "Needs your approval.".to_string(),
        (NotificationEvent::AgentDone, Some(took)) => format!("Finished in {took}."),
        (NotificationEvent::AgentDone, None) => "Finished.".to_string(),
        (NotificationEvent::AgentError, Some(took)) => {
            format!("Stopped with an error after {took}.")
        }
        (NotificationEvent::AgentError, None) => "Stopped with an error.".to_string(),
        _ => return None,
    })
}

/// "45s", "4m 12s", "1h 5m". Under a second says nothing worth reading.
fn took(ms: u64) -> Option<String> {
    let secs = ms / 1000;
    let (h, m, s) = (secs / 3600, secs / 60 % 60, secs % 60);
    Some(match (h, m, s) {
        (0, 0, 0) => return None,
        (0, 0, s) => format!("{s}s"),
        (0, m, 0) => format!("{m}m"),
        (0, m, s) => format!("{m}m {s}s"),
        (h, 0, _) => format!("{h}h"),
        (h, m, _) => format!("{h}h {m}m"),
    })
}

/// The Claude session a finish reports on, named by its key.
fn finished_claude_session(entry: &StatusEntry) -> Option<&str> {
    if entry.value != STATUS_DONE {
        return None;
    }
    entry.key.strip_prefix(AgentKind::Claude.key_prefix())
}

/// Whether the banner for this transition may quote the session's answer.
pub fn reads_answer(entry: &StatusEntry) -> bool {
    finished_claude_session(entry).is_some()
}

/// The first line of the answer a finished Claude session ended its turn with.
/// It waits for the transcript and reads it, so keep it off any thread someone
/// is waiting on. An answer from before this turn is not this turn's news.
pub fn last_answer(project: &str, entry: &StatusEntry) -> Option<String> {
    finished_claude_session(entry)?;
    first_line(&turn_answer(project, &entry.key, entry.turn_start)?)
}

/// The answer the Claude session behind `key` ended its turn with, once the
/// transcript has settled. Blocks like `last_answer`.
pub fn turn_answer(project: &str, key: &str, turn_start: i64) -> Option<String> {
    let session = key.strip_prefix(AgentKind::Claude.key_prefix())?;
    std::thread::sleep(TRANSCRIPT_SETTLE);
    let answer = newest_answer(project, AgentKind::Claude.id(), session).ok()??;
    let this_turn = turn_start <= 0 || answer.at.is_some_and(|at| at >= turn_start);
    this_turn.then_some(answer.text)
}

fn first_line(text: &str) -> Option<String> {
    crate::label_probes::first_line_within(text, ANSWER_CHARS)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::status::{STATUS_ERROR, STATUS_WAITING};

    fn news(value: &str, project: &str, terminal: &str, elapsed_ms: Option<u64>) -> StatusSound {
        StatusSound {
            value: value.into(),
            project: project.into(),
            terminal: terminal.into(),
            elapsed_ms,
            answer: None,
        }
    }

    fn banner(news: &StatusSound) -> (String, String) {
        let banner = Banner::of(news).expect("a banner");
        (banner.title, banner.body)
    }

    #[test]
    fn only_interrupting_statuses_get_a_banner() {
        assert!(Banner::of(&news("Running", "web", "", None)).is_none());
        assert!(Banner::of(&news("", "web", "", None)).is_none());
    }

    #[test]
    fn the_title_says_where() {
        assert_eq!(title("myapp", "refactor auth"), "myapp · refactor auth");
        assert_eq!(title("myapp", ""), "myapp");
        assert_eq!(title("", "refactor auth"), "refactor auth");
        assert_eq!(title("", ""), "lpm");
    }

    #[test]
    fn the_body_says_what_happened_and_how_long_it_took() {
        assert_eq!(
            banner(&news(
                STATUS_WAITING,
                "myapp",
                "refactor auth",
                Some(90_000)
            )),
            (
                "myapp · refactor auth".into(),
                "Needs your approval.".into()
            )
        );
        assert_eq!(
            banner(&news(STATUS_DONE, "myapp", "", Some(252_400))).1,
            "Finished in 4m 12s."
        );
        assert_eq!(
            banner(&news(STATUS_ERROR, "myapp", "", Some(123_000))).1,
            "Stopped with an error after 2m 3s."
        );
    }

    #[test]
    fn an_unknown_duration_is_left_out() {
        assert_eq!(
            banner(&news(STATUS_DONE, "", "", None)),
            ("lpm".into(), "Finished.".into())
        );
        assert_eq!(banner(&news(STATUS_DONE, "", "", Some(400))).1, "Finished.");
        assert_eq!(
            banner(&news(STATUS_ERROR, "", "", None)).1,
            "Stopped with an error."
        );
    }

    #[test]
    fn durations_read_at_a_glance() {
        assert_eq!(took(45_000).as_deref(), Some("45s"));
        assert_eq!(took(240_000).as_deref(), Some("4m"));
        assert_eq!(took(3_900_000).as_deref(), Some("1h 5m"));
        assert_eq!(took(7_230_000).as_deref(), Some("2h"));
        assert_eq!(took(999), None);
    }

    #[test]
    fn a_finish_quotes_its_answer_on_a_line_of_its_own() {
        let mut done = news(STATUS_DONE, "myapp", "tests", Some(61_000));
        done.answer = Some("All 42 tests pass.".into());
        assert_eq!(banner(&done).1, "Finished in 1m 1s.\nAll 42 tests pass.");
        done.answer = Some(String::new());
        assert_eq!(banner(&done).1, "Finished in 1m 1s.");
    }

    #[test]
    fn the_quote_is_the_first_line_clipped() {
        assert_eq!(
            first_line("\n  Fixed the login race.  \n\nDetails follow.").as_deref(),
            Some("Fixed the login race.")
        );
        let long = "é".repeat(ANSWER_CHARS + 10);
        let clipped = first_line(&long).unwrap();
        assert_eq!(clipped.chars().count(), ANSWER_CHARS);
        assert!(clipped.ends_with('…'));
        assert_eq!(
            first_line(&"a".repeat(ANSWER_CHARS)).unwrap().len(),
            ANSWER_CHARS
        );
        assert_eq!(first_line(" \n\t"), None);
    }

    #[test]
    fn only_a_finished_claude_session_is_quoted() {
        let entry = |key: &str, value: &str| StatusEntry {
            key: key.into(),
            value: value.into(),
            ..StatusEntry::default()
        };
        assert!(reads_answer(&entry("claude_code_9a15513b", STATUS_DONE)));
        assert!(!reads_answer(&entry("claude_code_9a15513b", STATUS_ERROR)));
        assert!(!reads_answer(&entry("codex_p-1", STATUS_DONE)));
        assert!(!reads_answer(&entry("build", STATUS_DONE)));
    }
}
