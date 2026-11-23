use super::*;

fn ids(list: &[&str]) -> Vec<String> {
    list.iter().map(|s| s.to_string()).collect()
}

fn listed(list: &[&str], any: bool) -> Machines {
    Machines {
        list: ids(list),
        any,
    }
}

fn names() -> Names {
    Names {
        me: "m".into(),
        by_id: [
            ("m".to_string(), "Studio".to_string()),
            ("p".to_string(), "MacBook Pro 2021".to_string()),
        ]
        .into_iter()
        .collect(),
    }
}

fn yaml(text: &str) -> serde_norway::Value {
    serde_norway::from_str(text).unwrap()
}

#[test]
fn the_field_reads_as_a_list_a_word_or_nothing() {
    assert_eq!(parse(None), None);
    assert_eq!(
        parse(Some(&MachinesValue::Many(ids(&["a", " b ", "a", "ANY"])))),
        Some(listed(&["a", "b"], true))
    );
    assert_eq!(parse(Some(&MachinesValue::One("any".into()))), Some(listed(&[], true)));
    assert_eq!(parse(Some(&MachinesValue::Many(ids(&["", " "])))), None);
}

#[test]
fn a_listed_computer_waits_only_for_the_ones_before_it() {
    let m = listed(&["a", "b", "c"], false);
    assert_eq!(ahead_of(&m, "a", &[]), Some(vec![]));
    assert_eq!(ahead_of(&m, "c", &[]), Some(ids(&["a", "b"])));
    assert_eq!(ahead_of(&m, "z", &ids(&["a"])), None);
}

#[test]
fn any_computer_goes_after_the_listed_ones_in_hostid_order() {
    let m = listed(&["m"], true);
    assert_eq!(ahead_of(&m, "q", &ids(&["m", "r", "p"])), Some(ids(&["m", "p"])));
    assert_eq!(ahead_of(&listed(&[], true), "b", &ids(&["c", "a"])), Some(ids(&["a"])));
    assert_eq!(others(&m, "q", &ids(&["m", "r"])), ids(&["m", "r"]));
    assert_eq!(others(&listed(&["a", "b"], false), "a", &ids(&["c"])), ids(&["b"]));
}

#[test]
fn a_computer_ahead_that_is_on_keeps_the_run() {
    assert_eq!(turn(&[]), Turn::Run);
    assert_eq!(turn(&[Ahead::Away(3600), Ahead::Takes]), Turn::Defer);
    assert_eq!(turn(&[Ahead::Passes]), Turn::Run);
}

#[test]
fn one_ahead_that_dropped_off_gets_a_few_minutes_per_place() {
    assert_eq!(turn(&[Ahead::Away(STAND_IN_GRACE - 1)]), Turn::Wait);
    assert_eq!(turn(&[Ahead::Away(STAND_IN_GRACE)]), Turn::Run);
    let both = [Ahead::Away(STAND_IN_GRACE), Ahead::Away(3600)];
    assert_eq!(turn(&both), Turn::Wait);
    assert_eq!(turn(&[Ahead::Away(2 * STAND_IN_GRACE), Ahead::Passes]), Turn::Run);
}

#[test]
fn only_a_missed_run_waits_for_the_others_to_come_back() {
    assert!(catch_up_waits(true, true, 0));
    assert!(!catch_up_waits(true, true, CATCH_UP_GRACE));
    assert!(!catch_up_waits(false, true, 0));
    assert!(!catch_up_waits(true, false, 0));
}

#[test]
fn a_run_covers_the_time_it_came_due_but_a_skip_or_a_reply_doesnt() {
    let run = |at, result: &str| HistoryEntry {
        at,
        result: result.into(),
        ..HistoryEntry::default()
    };
    assert!(covers(&run(100, COMPLETED), 100));
    assert!(!covers(&run(99, COMPLETED), 100));
    assert!(!covers(&run(100, SKIPPED_CAPACITY), 100));
    assert!(!covers(&run(100, SKIPPED_CI_ROUNDS), 100));
    let reply = HistoryEntry {
        question: Some("and?".into()),
        ..run(200, COMPLETED)
    };
    assert!(!covers(&reply, 100));
}

#[test]
fn runs_from_another_computer_land_in_order_once_and_move_the_anchor() {
    let mut st = JobState {
        last_run_at: Some(50),
        history: vec![HistoryEntry {
            at: 10,
            result: COMPLETED.into(),
            ..HistoryEntry::default()
        }],
        ..JobState::default()
    };
    let theirs = vec![
        HistoryEntry {
            at: 120,
            result: COMPLETED.into(),
            copy: Some("lpm-abc".into()),
            ..HistoryEntry::default()
        },
        HistoryEntry {
            at: 130,
            result: COMPLETED.into(),
            question: Some("why?".into()),
            ..HistoryEntry::default()
        },
    ];
    assert!(merge_runs(&mut st, "Mini", &theirs));
    assert!(!merge_runs(&mut st, "Mini", &theirs));
    let ats: Vec<u64> = st.history.iter().map(|h| h.at).collect();
    assert_eq!(ats, vec![10, 120, 130]);
    assert_eq!(st.history[1].ran_on.as_deref(), Some("Mini"));
    assert_eq!(st.history[1].copy, None);
    assert_eq!(st.last_run_at, Some(120));
}

#[test]
fn a_new_job_saved_without_machines_runs_where_it_was_made() {
    let mut body = yaml("label: Daily");
    names().settle_body(&mut body, None);
    assert_eq!(body["machines"], yaml("[m]"));
}

#[test]
fn a_save_that_leaves_machines_out_keeps_them_and_a_legacy_job_stays_legacy() {
    let old = yaml("label: Daily\nmachines: [p, any]");
    let mut body = yaml("label: Daily 2");
    names().settle_body(&mut body, Some(&old));
    assert_eq!(body["machines"], yaml("[p, any]"));

    let legacy = yaml("label: Daily");
    let mut body = yaml("label: Daily 2");
    names().settle_body(&mut body, Some(&legacy));
    assert!(body.get("machines").is_none());
}

#[test]
fn machines_given_by_name_become_hostids_and_an_empty_list_means_every_computer() {
    let mut body = yaml("machines: [any, macbook pro 2021, this, p]");
    names().settle_body(&mut body, None);
    assert_eq!(body["machines"], yaml("[p, m, any]"));

    let mut body = yaml("machines: []");
    names().settle_body(&mut body, Some(&yaml("machines: [m]")));
    assert!(body.get("machines").is_none());
}

fn up(id: &str) -> Other {
    Other {
        id: id.into(),
        up: true,
        away: 0,
    }
}

fn down(id: &str, away: u64) -> Other {
    Other {
        id: id.into(),
        up: false,
        away,
    }
}

fn has_it() -> Answer {
    Answer {
        has: true,
        eligible: true,
        enabled: true,
        ..Answer::default()
    }
}

fn ran_at(at: u64) -> Answer {
    Answer {
        runs: vec![HistoryEntry {
            at,
            result: COMPLETED.into(),
            ..HistoryEntry::default()
        }],
        ..has_it()
    }
}

/// Decide with `answers` standing for what each computer says; one missing
/// from it can't be asked.
fn decide_with(
    m: &Machines,
    me: &str,
    known: &[Other],
    answers: Vec<(&str, Answer)>,
    fire: u64,
    now: u64,
    seen: u64,
) -> Decision {
    let mut answers: HashMap<String, Answer> =
        answers.into_iter().map(|(id, a)| (id.to_string(), a)).collect();
    decide(m, me, known, |id| answers.remove(id), fire, now, seen)
}

const FIRE: u64 = 1_000_000;

#[test]
fn a_computer_not_listed_leaves_the_run_alone() {
    let d = decide_with(&listed(&["a"], false), "b", &[up("a")], vec![], FIRE, FIRE, FIRE);
    assert_eq!(d.plan, Plan::Skip);
}

#[test]
fn the_second_computer_leaves_the_run_to_the_first_while_it_is_on() {
    let m = listed(&["a", "b"], false);
    let d = decide_with(&m, "b", &[up("a")], vec![("a", has_it())], FIRE, FIRE, FIRE);
    assert_eq!(d.plan, Plan::Skip);
    // One that can't be asked is an older lpm, which runs it anyway.
    let d = decide_with(&m, "b", &[up("a")], vec![], FIRE, FIRE, FIRE);
    assert_eq!(d.plan, Plan::Skip);
    // Turned off there is turned off.
    let off = Answer {
        enabled: false,
        ..has_it()
    };
    let d = decide_with(&m, "b", &[up("a")], vec![("a", off)], FIRE, FIRE, FIRE);
    assert_eq!(d.plan, Plan::Skip);
}

#[test]
fn the_second_runs_it_when_the_first_lacks_the_job() {
    let m = listed(&["a", "b"], false);
    let lacks = Answer::default();
    let d = decide_with(&m, "b", &[up("a")], vec![("a", lacks)], FIRE, FIRE, FIRE);
    assert_eq!(d.plan, Plan::Run);
}

#[test]
fn the_second_takes_over_once_the_first_has_been_gone_five_minutes() {
    let m = listed(&["a", "b"], false);
    let gone = |away| decide_with(&m, "b", &[down("a", away)], vec![], FIRE, FIRE, FIRE);
    assert_eq!(gone(STAND_IN_GRACE - 60).plan, Plan::Hold);
    // Every run after that too, however often it comes due.
    assert_eq!(gone(STAND_IN_GRACE).plan, Plan::Run);
    assert_eq!(gone(STAND_IN_GRACE + 3600).plan, Plan::Run);
}

#[test]
fn a_listed_computer_this_one_isnt_paired_with_doesnt_hold_the_run_up() {
    let m = listed(&["x", "b"], false);
    let d = decide_with(&m, "b", &[], vec![], FIRE, FIRE, FIRE);
    assert_eq!(d.plan, Plan::Run);
}

#[test]
fn the_first_skips_a_missed_run_another_made_and_keeps_it() {
    let m = listed(&["a", "b"], false);
    let late = FIRE + 3600;
    let d = decide_with(&m, "a", &[up("b")], vec![("b", ran_at(FIRE + 300))], FIRE, late, late);
    assert_eq!(d.plan, Plan::Skip);
    assert_eq!(d.take.len(), 1);
    assert_eq!(d.take[0].0, "b");

    let running = Answer {
        running: true,
        ..has_it()
    };
    let d = decide_with(&m, "a", &[up("b")], vec![("b", running)], FIRE, late, late);
    assert_eq!(d.plan, Plan::Skip);
}

#[test]
fn the_first_runs_what_nobody_ran_and_still_keeps_older_runs() {
    let m = listed(&["a", "b"], false);
    let late = FIRE + 3600;
    let d = decide_with(&m, "a", &[up("b")], vec![("b", ran_at(FIRE - 60))], FIRE, late, late);
    assert_eq!(d.plan, Plan::Run);
    assert_eq!(d.take.len(), 1);
}

#[test]
fn a_missed_run_waits_a_little_for_the_others_to_come_back() {
    let m = listed(&["a", "b"], false);
    let woke = FIRE + 3600;
    let d = decide_with(&m, "a", &[down("b", 0)], vec![], FIRE, woke, woke);
    assert_eq!(d.plan, Plan::Hold);
    let d = decide_with(&m, "a", &[down("b", 0)], vec![], FIRE, woke + CATCH_UP_GRACE, woke);
    assert_eq!(d.plan, Plan::Run);
    // On time, the first doesn't wait for anyone.
    let d = decide_with(&m, "a", &[down("b", 0)], vec![], FIRE, FIRE + 30, FIRE);
    assert_eq!(d.plan, Plan::Run);
}

#[test]
fn only_the_first_computer_keeps_the_history() {
    let m = listed(&["a", "b", "c"], false);
    let d = decide_with(
        &m,
        "c",
        &[down("a", 2 * STAND_IN_GRACE), up("b")],
        vec![("b", Answer::default())],
        FIRE,
        FIRE,
        FIRE,
    );
    assert_eq!(d.plan, Plan::Run);
    assert!(d.take.is_empty());
}

#[test]
fn with_any_a_lower_hostid_that_is_on_and_has_it_goes_first() {
    let m = listed(&["a"], true);
    let d = decide_with(
        &m,
        "c",
        &[down("a", 3600), up("b")],
        vec![("b", has_it())],
        FIRE,
        FIRE,
        FIRE,
    );
    assert_eq!(d.plan, Plan::Skip);
    let d = decide_with(&m, "b", &[down("a", STAND_IN_GRACE), up("c")], vec![], FIRE, FIRE, FIRE);
    assert_eq!(d.plan, Plan::Run);
}

fn resolved(text: &str) -> JobResolved {
    let def: JobDef = serde_norway::from_str(text).unwrap();
    resolve_job("", "t", &def).unwrap()
}

#[test]
fn a_job_naming_its_computers_is_switched_in_its_config_and_an_older_pause_holds() {
    let on = resolved("schedule: { manual: true }\nrun: { cmd: x }\nmachines: [m]");
    let off = resolved("schedule: { manual: true }\nrun: { cmd: x }\nmachines: [m]\nenabled: false");
    let mut st = JobState {
        enabled_override: Some(true),
        ..JobState::default()
    };
    assert!(st.job_on(&on));
    assert!(!st.job_on(&off));
    st.enabled_override = Some(false);
    assert!(!st.job_on(&on));
}
