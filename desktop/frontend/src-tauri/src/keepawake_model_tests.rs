use super::{parse_mode, Mode, PrefsPatch, Saved, Session, MAX_MINUTES};
use crate::keepawake::SessionHold;

const MIN: i64 = 60_000;

fn agents_mode() -> Session {
    let mut s = Session::default();
    s.set_mode(Mode::Agents);
    s
}

#[test]
fn off_never_holds() {
    let mut s = Session::default();
    s.set_agents(3, 0);
    assert!(!s.active(0));
    assert_eq!(s.hold(0), None);
}

#[test]
fn agents_hold_while_working_and_for_the_tail_after() {
    let mut s = agents_mode();
    assert!(!s.active(0), "waits for the first agent");
    s.set_agents(2, 0);
    assert!(s.active(MIN));
    assert_eq!(s.ends_at(), None);
    s.set_agents(1, 2 * MIN);
    assert_eq!(s.ends_at(), None, "one still working");
    s.set_agents(0, 3 * MIN);
    assert_eq!(s.ends_at(), Some(8 * MIN));
    assert!(s.active(8 * MIN - 1));
    assert!(!s.active(8 * MIN));
    s.expire(8 * MIN);
    assert_eq!(s.ends_at(), None);
    assert_eq!(s.saved.mode, Mode::Agents, "stands by for the next agent");
}

#[test]
fn an_agent_starting_in_the_tail_cancels_it() {
    let mut s = agents_mode();
    s.set_agents(1, 0);
    s.set_agents(0, MIN);
    s.set_agents(1, 3 * MIN);
    assert_eq!(s.ends_at(), None);
    assert!(s.active(100 * MIN));
    s.set_agents(0, 10 * MIN);
    assert_eq!(s.ends_at(), Some(15 * MIN));
}

#[test]
fn changing_the_tail_moves_a_running_countdown() {
    let mut s = agents_mode();
    s.set_agents(1, 0);
    s.set_agents(0, MIN);
    s.set_prefs(&PrefsPatch {
        tail_minutes: Some(10),
        ..PrefsPatch::default()
    });
    assert_eq!(s.ends_at(), Some(11 * MIN));
}

#[test]
fn no_tail_lets_go_as_the_last_agent_finishes() {
    let mut s = agents_mode();
    s.set_prefs(&PrefsPatch {
        tail_minutes: Some(0),
        ..PrefsPatch::default()
    });
    s.set_agents(1, 0);
    s.set_agents(0, MIN);
    assert!(!s.active(MIN));
}

#[test]
fn agents_finishing_in_another_mode_start_no_countdown() {
    let mut s = Session::default();
    s.set_mode(Mode::Always);
    s.set_agents(1, 0);
    s.set_agents(0, MIN);
    s.set_mode(Mode::Agents);
    assert!(!s.active(MIN));
}

#[test]
fn a_set_time_ends_by_itself() {
    let mut s = Session::default();
    s.set_mode(parse_mode("timed", Some(90), 0).unwrap());
    assert!(s.active(89 * MIN));
    assert_eq!(s.ends_at(), Some(90 * MIN));
    s.expire(90 * MIN);
    assert_eq!(s.saved.mode, Mode::Off);
    assert!(!s.active(90 * MIN));
}

#[test]
fn until_turned_off_holds_with_no_end() {
    let mut s = Session::default();
    s.set_mode(Mode::Always);
    assert!(s.active(i64::MAX / 2));
    assert_eq!(s.ends_at(), None);
}

#[test]
fn a_saved_timer_that_ran_out_while_closed_comes_back_off() {
    let mut s = Session {
        saved: Saved {
            mode: Mode::Until { at: 10 * MIN },
            ..Saved::default()
        },
        ..Session::default()
    };
    s.expire(5 * MIN);
    assert_eq!(s.saved.mode, Mode::Until { at: 10 * MIN });
    s.expire(10 * MIN);
    assert_eq!(s.saved.mode, Mode::Off);
}

#[test]
fn the_hold_carries_the_screen_and_battery_choices() {
    let mut s = Session::default();
    s.set_mode(Mode::Always);
    assert_eq!(
        s.hold(0),
        Some(SessionHold {
            screen: true,
            battery_floor: Some(20),
        }),
        "the screen stays on unless turned off"
    );
    s.set_prefs(&PrefsPatch {
        screen: Some(false),
        battery: Some(false),
        ..PrefsPatch::default()
    });
    assert_eq!(
        s.hold(0),
        Some(SessionHold {
            screen: false,
            battery_floor: None,
        })
    );
}

#[test]
fn prefs_are_kept_in_range() {
    let mut s = Session::default();
    s.set_prefs(&PrefsPatch {
        tail_minutes: Some(10_000),
        floor: Some(100),
        ..PrefsPatch::default()
    });
    assert_eq!(s.saved.prefs.tail_minutes, 120);
    assert_eq!(s.saved.prefs.floor, 95);
}

#[test]
fn parse_mode_names_every_mode_and_bounds_the_time() {
    assert_eq!(parse_mode("off", None, 0), Ok(Mode::Off));
    assert_eq!(parse_mode("agents", None, 0), Ok(Mode::Agents));
    assert_eq!(parse_mode("always", None, 0), Ok(Mode::Always));
    assert_eq!(parse_mode("timed", Some(1), 0), Ok(Mode::Until { at: MIN }));
    assert!(parse_mode("timed", None, 0).is_err());
    assert!(parse_mode("timed", Some(0), 0).is_err());
    assert!(parse_mode("timed", Some(MAX_MINUTES + 1), 0).is_err());
    assert!(parse_mode("forever", None, 0).is_err());
}

#[test]
fn the_wire_reports_the_countdown_from_now() {
    let mut s = agents_mode();
    s.set_agents(1, 0);
    s.set_agents(0, MIN);
    let wire = s.wire(2 * MIN, "awake");
    assert_eq!(wire["mode"], "agents");
    assert_eq!(wire["active"], true);
    assert_eq!(wire["endsIn"], 4 * MIN);
    assert_eq!(wire["agents"], 0);
    assert_eq!(wire["tailMinutes"], 5);
    let mut timed = Session::default();
    timed.set_mode(Mode::Until { at: MIN });
    assert_eq!(timed.wire(2 * MIN, "awake")["endsIn"], 0);
}

#[test]
fn saved_settings_read_back_with_defaults_for_missing_fields() {
    let saved: Saved = serde_json::from_str(r#"{"mode":{"kind":"agents"}}"#).unwrap();
    assert_eq!(saved.mode, Mode::Agents);
    assert_eq!(saved.prefs.tail_minutes, 5);
    assert!(saved.prefs.screen);
    assert!(saved.prefs.battery);
    let back: Saved = serde_json::from_str(
        &serde_json::to_string(&Saved {
            mode: Mode::Until { at: 42 },
            ..Saved::default()
        })
        .unwrap(),
    )
    .unwrap();
    assert_eq!(back.mode, Mode::Until { at: 42 });
}

#[test]
fn extending_a_set_time_adds_to_its_end() {
    let mut s = Session::default();
    s.set_mode(parse_mode("timed", Some(30), 0).unwrap());
    s.extend(60, 25 * MIN).unwrap();
    assert_eq!(s.ends_at(), Some(90 * MIN));
    s.extend(60, 200 * MIN).unwrap();
    assert_eq!(
        s.ends_at(),
        Some(260 * MIN),
        "one already over counts from now"
    );
    s.extend(MAX_MINUTES, 200 * MIN).unwrap();
    assert_eq!(
        s.ends_at(),
        Some(200 * MIN + MAX_MINUTES as i64 * MIN),
        "capped"
    );
}

#[test]
fn extending_the_countdown_keeps_waiting_for_agents() {
    let mut s = agents_mode();
    s.set_agents(1, 0);
    s.set_agents(0, MIN);
    s.extend(60, 4 * MIN).unwrap();
    assert_eq!(s.ends_at(), Some(66 * MIN));
    assert_eq!(s.saved.mode, Mode::Agents);
    s.set_agents(1, 10 * MIN);
    s.set_agents(0, 20 * MIN);
    assert_eq!(
        s.ends_at(),
        Some(25 * MIN),
        "the next countdown is the usual length"
    );
}

#[test]
fn only_a_countdown_can_be_extended() {
    let mut working = agents_mode();
    working.set_agents(1, 0);
    let mut always = Session::default();
    always.set_mode(Mode::Always);
    for mut s in [Session::default(), working, always] {
        let before = s.saved;
        assert!(s.extend(60, MIN).is_err());
        assert_eq!(s.saved, before);
    }
}
