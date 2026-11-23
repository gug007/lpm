use super::*;

fn entry(key: &str, value: &str, pane: &str, at: i64) -> StatusEntry {
    StatusEntry {
        key: key.into(),
        value: value.into(),
        pane_id: pane.into(),
        timestamp: at,
        ..Default::default()
    }
}

fn check(name: &str, state: &'static str, commit: Option<&str>) -> PrCheck {
    PrCheck {
        name: name.into(),
        workflow: "CI".into(),
        state,
        url: String::new(),
        commit: commit.map(str::to_string),
    }
}

fn view(state: Phase, round: u32) -> FixLoop {
    let mut v = FixLoop {
        project: "storefront".into(),
        agent: "Claude Code".into(),
        branch: "checkout".into(),
        round,
        max_rounds: MAX_ROUNDS,
        state,
        sha: "7c41e2a".into(),
        detail: String::new(),
        reason: None,
        progress: 0.0,
    };
    describe(&mut v);
    v
}

#[test]
fn every_round_asks_for_a_push_and_says_which_round_it_is() {
    let first = first_prompt("CI checks are failing on pull request #42:\n- test\n");
    assert!(first.starts_with(
        "CI checks are failing on pull request #42:\n- test\n\nWhen it's fixed, commit and push."
    ));
    assert!(first.ends_with("(round 1 of 3)."));
    assert!(round_prompt("x", 2).ends_with("(round 2 of 3)."));
}

#[test]
fn only_the_fix_tabs_own_agent_reports_count() {
    let entries = [
        entry("claude_code_t9", "Waiting", "t9", 50),
        entry("claude_code_t1", "Running", "t1", 100),
        entry("svc", "Waiting", "t1", 100),
    ];
    assert_eq!(read_agent(&entries, "t1", 0, Some(false)), Agent::Working);
    assert_eq!(read_agent(&entries, "t2", 0, Some(false)), Agent::Quiet);
}

#[test]
fn a_question_outranks_work_and_a_finish_counts_from_this_round_on() {
    let waiting = [entry("codex_t1", "Waiting", "t1", 10)];
    assert_eq!(read_agent(&waiting, "t1", 0, Some(false)), Agent::Waiting);
    let done = [entry("claude_code_t1", "Done", "t1", 500)];
    assert_eq!(read_agent(&done, "t1", 400, Some(false)), Agent::Done(500));
    assert_eq!(
        read_agent(&done, "t1", 600, Some(false)),
        Agent::Quiet,
        "the last round's finish isn't this one's"
    );
    assert_eq!(read_agent(&done, "t1", 0, Some(true)), Agent::Exited);
}

#[test]
fn waiting_for_the_push_ends_only_when_the_agent_cant_get_there() {
    let minute = Duration::from_secs(60);
    let now = 10 * 60 * 1000;
    assert_eq!(fix_verdict(Agent::Working, "Codex", minute, now), None);
    assert_eq!(fix_verdict(Agent::Quiet, "Codex", minute, now), None);
    assert_eq!(
        fix_verdict(Agent::Exited, "Codex", Duration::from_secs(30), now),
        None,
        "the agent is still starting"
    );
    assert_eq!(fix_verdict(Agent::Done(now - 60_000), "Codex", minute, now), None);
    assert_eq!(
        fix_verdict(Agent::Done(now - 4 * 60_000), "Codex", minute, now).as_deref(),
        Some("Codex finished without pushing a fix.")
    );
    assert_eq!(
        fix_verdict(Agent::Waiting, "Codex", minute, now).as_deref(),
        Some("Codex is asking you something.")
    );
    assert_eq!(
        fix_verdict(Agent::Gone, "Codex", minute, now).as_deref(),
        Some("The Codex tab was closed.")
    );
    assert_eq!(
        fix_verdict(Agent::Exited, "Codex", 2 * minute, now).as_deref(),
        Some("Codex quit before pushing a fix.")
    );
    assert!(fix_verdict(Agent::Working, "Codex", 91 * minute, now).is_some());
}

#[test]
fn a_push_stands_on_its_own_checks() {
    assert_eq!(read_checks(&[]), Checks::Nothing);
    assert_eq!(
        read_checks(&[check("test", "fail", Some("4b8e2f1"))]),
        Checks::Nothing
    );
    assert_eq!(
        read_checks(&[check("lint", "pass", None), check("test", "pending", None)]),
        Checks::Running
    );
    assert_eq!(
        read_checks(&[check("lint", "pass", None), check("test", "fail", None)]),
        Checks::Failed
    );
    assert_eq!(
        read_checks(&[check("lint", "pass", None), check("docs", "skipped", None)]),
        Checks::Passed
    );
}

#[test]
fn an_older_failure_that_didnt_run_again_isnt_a_pass() {
    assert_eq!(
        read_checks(&[
            check("lint", "pass", None),
            check("e2e", "fail", Some("4b8e2f1"))
        ]),
        Checks::Stale("e2e".into())
    );
}

#[test]
fn the_line_under_the_switch_says_where_the_round_stands() {
    let starting = view(Phase::Starting, 1);
    assert_eq!(starting.detail, "Opening the Claude Code tab…");
    assert_eq!(starting.progress, 0.0);
    let watching = view(Phase::Watching, 2);
    assert_eq!(
        watching.detail,
        "Claude Code pushed 7c41e2a · watching the new run"
    );
    assert!(watching.progress > 1.0 / 3.0 && watching.progress < 2.0 / 3.0);
    assert!(watching.running());
    assert_eq!(view(Phase::Fixing, 1).detail, "Claude Code is fixing 7c41e2a");
    let passed = view(Phase::Passed, 2);
    assert_eq!(passed.detail, "CI passed after 2 rounds");
    assert_eq!(passed.progress, 1.0);
    assert!(!passed.running());
    assert_eq!(view(Phase::Passed, 1).detail, "CI passed after one round");
}

#[test]
fn a_stopped_loop_says_why_and_the_alert_says_it_too() {
    let mut stopped = FixLoop {
        reason: Some("Claude Code is asking you something.".into()),
        ..view(Phase::Stopped, 2)
    };
    describe(&mut stopped);
    assert_eq!(stopped.detail, "Claude Code is asking you something.");
    let (_, body) = alert_text(&stopped);
    assert_eq!(
        body,
        "Stopped fixing CI: Claude Code is asking you something."
    );
    let (_, body) = alert_text(&view(Phase::Passed, 2));
    assert_eq!(body, "CI passed after 2 rounds · fixed by Claude Code");
}

#[test]
fn the_apps_read_the_loop_in_camel_case() {
    let json = serde_json::to_value(view(Phase::Watching, 2)).unwrap();
    assert_eq!(json["maxRounds"], 3);
    assert_eq!(json["state"], "watching");
    assert!(json.get("reason").is_none());
}
