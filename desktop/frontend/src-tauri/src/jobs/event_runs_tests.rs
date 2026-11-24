use super::*;

#[test]
fn only_a_failure_is_a_crash() {
    let pane = |ended: bool, code: Option<i32>| PaneInfo {
        id: "p".into(),
        service: "api".into(),
        ended,
        code,
        ..PaneInfo::default()
    };
    assert!(crashed(&pane(true, Some(1))));
    assert!(!crashed(&pane(true, Some(0))));
    assert!(!crashed(&pane(true, None)));
    assert!(!crashed(&pane(false, Some(1))));
}

#[test]
fn a_restart_is_another_run_of_the_same_pane() {
    let pane = |started: i64| PaneInfo {
        id: "%0".into(),
        started,
        ..PaneInfo::default()
    };
    assert_eq!(run_of(&pane(5)), run_of(&pane(5)));
    assert_ne!(run_of(&pane(5)), run_of(&pane(6)));
}

#[test]
fn a_pane_from_an_older_daemon_still_reads() {
    let pane: PaneInfo =
        serde_json::from_str(r#"{"id":"%0","service":"api","ended":true,"code":3}"#).unwrap();
    assert!(crashed(&pane));
    assert_eq!(run_of(&pane), ("%0".to_string(), 0));
}

#[test]
fn what_a_job_reacted_to_is_saved_and_an_older_state_still_reads() {
    let mut st = crate::jobs::JobState::default();
    assert!(!serde_json::to_string(&st).unwrap().contains("pastEvents"));
    st.past_events = vec!["commit:a".into(), "day:2026-11-24".into()];
    let back: crate::jobs::JobState = serde_json::from_str(&serde_json::to_string(&st).unwrap()).unwrap();
    assert_eq!(back.past_events, st.past_events);

    let old: crate::jobs::JobState =
        serde_json::from_str(r#"{"lastRunAt":7,"history":[],"lastEvent":"commit:a"}"#).unwrap();
    assert_eq!(old.last_run_at, Some(7));
    assert!(old.past_events.is_empty());
}
