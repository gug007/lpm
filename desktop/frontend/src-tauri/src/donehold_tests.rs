use super::*;

fn observed(age: i64) -> Observed {
    Observed {
        age,
        ..Default::default()
    }
}

// cc-race: a background shell exited while the final message streamed, and
// Claude took its notification as a new turn 40 ms after the Stop. The Done
// announced in between was the first of two "finished" for one piece of work.
#[test]
fn a_next_turn_that_was_already_due_takes_the_finish_over() {
    assert_eq!(verdict(&observed(40)), Verdict::Hold);
    let next_turn = Observed {
        rev_moved: true,
        ..observed(40)
    };
    assert_eq!(verdict(&next_turn), Verdict::Drop);
    assert_eq!(verdict(&observed(GRACE_MS)), Verdict::Publish);
}

// multi-t1: the lead stopped with two teammates mid-task; each later report from
// them rang "finished" again until the last one was really done.
#[test]
fn a_finish_waits_for_the_sub_agents_still_working() {
    let working = Observed {
        children: true,
        ..observed(60_000)
    };
    assert_eq!(verdict(&working), Verdict::Hold);
    let asking = Observed {
        asking: true,
        ..observed(60_000)
    };
    assert_eq!(verdict(&asking), Verdict::Hold);
}

// bg-b3: "I'll reply with its output when it finishes" was announced as
// finished, 40 s before Claude woke up and did.
#[test]
fn a_finish_waits_for_the_background_shell_the_turn_started() {
    let waiting = Observed {
        why: Why {
            waits: true,
            ..Default::default()
        },
        ..observed(10 * 60_000)
    };
    assert_eq!(verdict(&waiting), Verdict::Hold);
    let woke = Observed {
        rev_moved: true,
        ..waiting
    };
    assert_eq!(
        verdict(&woke),
        Verdict::Drop,
        "the wake-up turn reports the finish"
    );
}

// "this is not done but this agent display done why?": a watcher the turn
// waited on was still running 15 minutes in, and the finish went out anyway.
// Paused stays paused for as long as the shell runs; the user is told once.
#[test]
fn no_clock_turns_a_pause_into_a_finish() {
    let why = Why {
        waits: true,
        ..Default::default()
    };
    let hours_in = Observed {
        why,
        ..observed(5 * 60 * 60_000)
    };
    assert_eq!(verdict(&hours_in), Verdict::Hold);
    assert!(hours_in.paused());
    assert!(hours_in.notice_due());
    assert!(!Observed { why, ..observed(NOTICE_MS - 1) }.notice_due());
    let sub_agents = Observed {
        children: true,
        why,
        ..observed(NOTICE_MS)
    };
    assert!(!sub_agents.notice_due(), "work going on is no pause");
}

#[test]
fn a_queued_prompts_finish_waits_for_the_pane_to_go_quiet() {
    let drawing = Observed {
        drawing: true,
        why: Why {
            drawing: true,
            ..Default::default()
        },
        ..observed(5_000)
    };
    assert_eq!(verdict(&drawing), Verdict::Hold);
    let idle_footer = Observed {
        capped_drawing: true,
        ..drawing
    };
    assert_eq!(
        verdict(&Observed {
            age: DRAW_CAP_MS,
            ..idle_footer
        }),
        Verdict::Publish
    );
    let codex = Observed {
        drawing: true,
        why: Why {
            drawing: true,
            ..Default::default()
        },
        ..observed(DRAW_CAP_MS * 5)
    };
    assert_eq!(
        verdict(&codex),
        Verdict::Hold,
        "a Codex /goal turn has no cap"
    );
}

// A crashed session's held finish must not, half an hour later, retire the
// session that has taken over its tab.
#[test]
fn a_finish_another_session_took_the_tab_from_is_dropped() {
    let taken = Observed {
        taken_over: true,
        ..observed(GRACE_MS)
    };
    assert_eq!(verdict(&taken), Verdict::Drop);
}

#[test]
fn a_finish_whose_turn_vanished_is_dropped() {
    let gone = Observed {
        gone: true,
        ..observed(GRACE_MS)
    };
    assert_eq!(verdict(&gone), Verdict::Drop);
}

// multi-t1: the lead took the last teammate's report up in a turn with no hook
// of its own; "finished" went out 0.7 s before that turn's Stop.
#[test]
fn a_finish_waits_for_the_lead_to_take_up_the_last_report() {
    let handed_back = Observed {
        children_quiet: Some(200),
        ..observed(60_000)
    };
    assert_eq!(verdict(&handed_back), Verdict::Hold);
    let drawing = Observed {
        children_quiet: Some(5_000),
        drawing: true,
        ..observed(60_000)
    };
    assert_eq!(verdict(&drawing), Verdict::Hold);
    let settled = Observed {
        children_quiet: Some(5_000),
        ..observed(60_000)
    };
    assert_eq!(verdict(&settled), Verdict::Publish);
}

#[test]
fn only_work_after_the_stop_redates_the_finish() {
    assert!(!observed(GRACE_MS - 1).work_goes_on());
    let waits = Observed {
        why: Why {
            waits: true,
            ..Default::default()
        },
        ..observed(60_000)
    };
    assert!(!waits.work_goes_on(), "a shell it was never woken by");
    assert!(Observed {
        children: true,
        ..observed(0)
    }
    .work_goes_on());
}

// A finish held for a background shell alone leaves the session idle at its
// prompt: the tab shows that instead of work going on.
#[test]
fn a_hold_for_a_shell_alone_is_a_pause() {
    let why = Why {
        waits: true,
        ..Default::default()
    };
    assert!(Observed { why, ..observed(60_000) }.paused());
    assert!(!Observed { why, ..observed(40) }.paused());
    assert!(Observed { why, ..observed(NOTICE_MS * 4) }.paused());
    let sub_agents = Observed {
        children: true,
        why,
        ..observed(60_000)
    };
    assert!(!sub_agents.paused());
    assert!(!observed(60_000).paused());
}

#[test]
fn a_paused_turn_is_listed_with_its_shells() {
    let (project, agent) = ("dh-paused", "claude_code_s1");
    let bg = r#"[{"id":"b1","type":"shell","status":"running","description":"Run the test suite","command":"npm test"}]"#;
    crate::bgtasks::stopped_beside(project, agent, bg);
    let key = id(project, agent);
    let held = Pending {
        token: 7,
        rev: 0,
        since: 1_000,
        why: Why {
            waits: true,
            ..Default::default()
        },
        done: StatusEntry::default(),
        was_running: true,
        extended: false,
        paused: false,
    };
    pending().lock().unwrap().insert(key.clone(), held);
    let store = StatusStore::default();
    store.set(
        project,
        StatusEntry {
            key: agent.into(),
            value: STATUS_RUNNING.into(),
            ..Default::default()
        },
    );
    assert_eq!(store.list(project)[0].paused_at, 0);

    assert!(mark_paused(&key, 7, true));
    assert!(!mark_paused(&key, 7, true), "only a change is news");
    let listed = store.list(project).remove(0);
    assert_eq!(listed.paused_at, 1_000);
    assert_eq!(listed.shells, ["Run the test suite"]);
    assert_eq!(listed.value, STATUS_RUNNING);

    assert!(!mark_paused(&key, 8, false), "another hold's flag");
    assert_eq!(
        crate::bgtasks::take_unnoticed(project, agent),
        Some(vec!["Run the test suite".to_string()])
    );
    assert_eq!(
        crate::bgtasks::take_unnoticed(project, agent),
        None,
        "one notice per pause, and none for a later one beside the same shell"
    );
    pending().lock().unwrap().remove(&key);
    assert_eq!(store.list(project)[0].paused_at, 0);
}
