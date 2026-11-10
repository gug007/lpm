use super::*;
use serde_json::json;

fn ask(id: &str, blocking: bool) -> Ask {
    let mut a = Ask::new(
        10,
        askform::parse_request(&json!({ "questions": [{ "type": "confirm", "text": "Go?" }] }))
            .unwrap(),
        blocking,
    );
    a.id = id.to_string();
    a
}

fn run_with(asks: Vec<Ask>) -> ActiveRun {
    ActiveRun {
        pid: 1,
        started_at: 0,
        log_path: String::new(),
        agent: None,
        copy: None,
        question: None,
        resumed: None,
        follows: None,
        compacted: false,
        quiet: false,
        boot_at: None,
        proc_start: None,
        token: Some("t".into()),
        asks,
        answer_to: None,
        terminal_flags: String::new(),
    }
}

fn entry_with(at: u64, asks: Vec<Ask>) -> HistoryEntry {
    HistoryEntry {
        at,
        result: COMPLETED.into(),
        asks,
        ..HistoryEntry::default()
    }
}

#[test]
fn a_stopped_run_drops_its_question_and_a_finished_command_stops_waiting() {
    let mut asks = vec![ask("agent", false), ask("cmd", true)];
    settle(&mut asks, false, 50);
    assert!(asks[0].is_open(), "an agent's question outlives its run");
    assert_eq!(asks[1].status, UNANSWERED);

    let mut asks = vec![ask("agent", false)];
    settle(&mut asks, true, 50);
    assert_eq!(asks[0].status, DISMISSED);
}

#[test]
fn only_an_agents_question_holds_the_run_open_for_a_resume() {
    assert!(resumes(&[ask("a", false)]));
    let mut answered = ask("a", false);
    answered.answer(serde_json::Map::new(), 20, false);
    assert!(resumes(&[answered]));
    assert!(!resumes(&[ask("c", true)]));
    let mut dismissed = ask("a", false);
    dismissed.close(DISMISSED, 20);
    assert!(!resumes(&[dismissed]));
}

#[test]
fn the_open_question_is_found_on_the_live_run_first_then_the_newest_entry() {
    let mut st = JobState {
        history: vec![entry_with(100, vec![ask("old", false)])],
        ..JobState::default()
    };
    let (at, a) = open_with_at(&st).unwrap();
    assert_eq!((at, a.id.as_str()), (Some(100), "old"));

    st.active_run = Some(run_with(vec![ask("live", true)]));
    let (at, a) = open_with_at(&st).unwrap();
    assert_eq!((at, a.id.as_str()), (None, "live"));

    let v = waiting_json(&st, "web").remove(0);
    assert_eq!(v["project"], json!("web"));
    assert!(v.get("at").is_none());
}

#[test]
fn closed_questions_leave_nothing_waiting() {
    let mut a = ask("x", false);
    a.close(UNANSWERED, 30);
    let st = JobState {
        history: vec![entry_with(100, vec![a])],
        ..JobState::default()
    };
    assert!(open_in(&st).is_none());
}

#[test]
fn a_question_is_found_by_id_wherever_it_sits() {
    let mut st = JobState {
        history: vec![entry_with(100, vec![ask("old", false)])],
        active_run: Some(run_with(vec![ask("live", true)])),
        ..JobState::default()
    };
    assert_eq!(find_mut(&mut st, "old").map(|(at, _)| at), Some(Some(100)));
    assert_eq!(find_mut(&mut st, "live").map(|(at, _)| at), Some(None));
    assert!(find_mut(&mut st, "nope").is_none());
}

#[test]
fn a_waiting_command_gives_up_its_seat_and_gets_it_back() {
    let key = "seat-test/job";
    readopt(key, &[ask("c", true)]);
    assert!(is_blocked(key));
    settled(key, &ask("c", true));
    assert!(!is_blocked(key));
    readopt(key, &[ask("a", false)]);
    assert!(!is_blocked(key));
}

#[test]
fn socket_verbs_name_the_run_and_the_question() {
    let args = |line: &[&str]| line.iter().map(|s| s.to_string()).collect::<Vec<_>>();
    let (_, options) = parse_options(&args(&["--run=abc", "--ask-hex=7b7d"]));
    assert_eq!(run_token(&options).unwrap(), "abc");
    assert_eq!(json_option(&options, "ask").unwrap(), json!({}));
    let (_, options) = parse_options(&args(&["--run="]));
    assert!(run_token(&options).is_err());

    let (project, job, id, _) =
        job_question(&args(&["web", "nightly", "--ask=q1"]), "answer_job_question").unwrap();
    assert_eq!((project.as_str(), job.as_str(), id.as_str()), ("web", "nightly", "q1"));
    let (project, ..) = job_question(
        &args(&["nightly", "--ask=q1", "--no-project"]),
        "answer_job_question",
    )
    .unwrap();
    assert_eq!(project, "");
    assert!(job_question(&args(&["web", "nightly"]), "answer_job_question").is_err());
}
