use super::*;

fn sched(yaml: &str) -> ScheduleDef {
    serde_norway::from_str(yaml).unwrap()
}

#[test]
fn an_event_resolves_with_its_filters_and_a_commit_by_default() {
    let spec = resolve(&sched("on: ciFailed\nbranches: [main, main, ' release ']")).unwrap();
    assert_eq!(spec.kind, EventKind::CiFailed);
    assert_eq!(spec.branches, vec!["main", "release"]);
    assert_eq!(spec.at_most, AtMost::Commit);
    let spec = resolve(&sched("on: serviceCrashed\nservices: api\natMost: day")).unwrap();
    assert_eq!(spec.services, vec!["api"]);
    assert_eq!(spec.at_most, AtMost::Day);
}

#[test]
fn an_unknown_event_or_limit_is_named_back() {
    assert!(resolve(&sched("on: prMerged")).unwrap_err().contains("\"prMerged\""));
    assert!(resolve(&sched("on: ciFailed\natMost: hour")).unwrap_err().contains("\"hour\""));
}

#[test]
fn an_event_takes_no_clock() {
    for extra in ["at: '09:00'", "every: 6h", "cron: '0 9 * * *'", "manual: true", "days: [mon]"] {
        let err = resolve(&sched(&format!("on: ciFailed\n{extra}"))).unwrap_err();
        assert!(err.contains("drop at, every"), "{extra}: {err}");
    }
}

#[test]
fn a_filter_belongs_to_its_own_event() {
    assert_eq!(
        resolve(&sched("on: agentFinished\nbranches: [main]")).unwrap_err(),
        "Branches go with ciFailed, prReviewed and prOpened."
    );
    let into = resolve(&sched("on: prReviewed\nbranches: [main]")).unwrap();
    assert_eq!((into.kind, into.branches), (EventKind::PrReviewed, vec!["main".to_string()]));
    assert!(resolve(&sched("on: prOpened\nservices: [api]")).is_err());
    assert_eq!(
        resolve(&sched("on: ciFailed\nservices: [api]")).unwrap_err(),
        "Services go with serviceCrashed."
    );
    assert_eq!(
        resolve(&sched("on: serviceCrashed\nfrom: [docs]")).unwrap_err(),
        "from goes with agentFinished."
    );
}

#[test]
fn an_agents_finish_cant_start_an_action() {
    let agent = Schedule::Event(resolve(&sched("on: agentFinished")).unwrap());
    let ci = Schedule::Event(resolve(&sched("on: ciFailed")).unwrap());
    let action = RunTarget::Action { name: "claude".into(), prompt: String::new() };
    assert!(check_run(&agent, &action).is_err());
    assert!(check_run(&agent, &RunTarget::Cmd("make".into())).is_ok());
    assert!(check_run(&ci, &action).is_ok());
}

#[test]
fn the_row_says_what_starts_the_job() {
    let spec = resolve(&sched("on: ciFailed\nbranches: main")).unwrap();
    assert_eq!(
        schedule_json(&spec),
        json!({ "mode": "event", "on": "ciFailed", "atMost": "commit", "branches": ["main"] })
    );
}
