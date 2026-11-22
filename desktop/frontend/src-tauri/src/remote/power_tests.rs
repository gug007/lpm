use super::*;

fn busy(agents: &[&str], automations: &[&str]) -> Busy {
    Busy {
        agents: agents.iter().map(|s| s.to_string()).collect(),
        automations: automations.iter().map(|s| s.to_string()).collect(),
    }
}

#[test]
fn sleeps_only_after_everything_stays_quiet() {
    let mut armed = Armed::new(&busy(&["p1"], &[]));
    assert!(!armed.observe(&busy(&["p1"], &[]), 0));
    assert!(!armed.observe(&busy(&[], &[]), 1_000));
    assert!(!armed.observe(&busy(&[], &[]), 1_000 + QUIET_MS - 1));
    assert!(armed.observe(&busy(&[], &[]), 1_000 + QUIET_MS));
}

#[test]
fn work_that_starts_again_restarts_the_wait() {
    let mut armed = Armed::new(&busy(&["p1"], &[]));
    assert!(!armed.observe(&busy(&[], &[]), 0));
    assert!(!armed.observe(&busy(&[], &["job"]), QUIET_MS - 1));
    assert!(!armed.observe(&busy(&[], &[]), QUIET_MS));
    assert!(!armed.observe(&busy(&[], &[]), 2 * QUIET_MS - 1));
    assert!(armed.observe(&busy(&[], &[]), 2 * QUIET_MS));
}

#[test]
fn counts_everything_seen_working_once() {
    let mut armed = Armed::new(&busy(&["p1", "p2"], &[]));
    armed.observe(&busy(&["p2", "p3"], &["nightly"]), 0);
    armed.observe(&busy(&["p3"], &["nightly"]), 1);
    assert_eq!(armed.seen, busy(&["p1", "p2", "p3"], &["nightly"]));
}

#[test]
fn the_push_says_what_finished() {
    assert_eq!(finished_text(&busy(&["a"], &[])), "1 agent finished.");
    assert_eq!(
        finished_text(&busy(&["a", "b", "c"], &[])),
        "3 agents finished."
    );
    assert_eq!(
        finished_text(&busy(&[], &["j", "k"])),
        "2 automations finished."
    );
    assert_eq!(
        finished_text(&busy(&["a"], &["j", "k"])),
        "1 agent and 2 automations finished."
    );
}

#[test]
fn the_state_counts_what_works_now() {
    let state = wire(true, false, true, &busy(&["a", "b"], &["j"]));
    assert_eq!(
        state,
        json!({ "lock": true, "sleep": false, "armed": true, "agents": 2, "automations": 1 })
    );
}
