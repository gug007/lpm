use super::State;

fn state(switch_on: bool, phones: bool, computers: bool) -> State {
    State {
        switch_on,
        phones,
        computers,
        ..State::default()
    }
}

#[test]
fn holds_for_phones_or_computers_while_the_switch_is_on() {
    assert!(state(true, true, false).wants());
    assert!(state(true, false, true).wants());
    assert!(state(true, true, true).wants());
    assert!(!state(true, false, false).wants());
    assert!(!state(false, true, true).wants());
}

#[test]
fn allow_control_alone_reports_awake_or_battery_rather_than_paused() {
    assert_eq!(state(true, false, true).report(|| true), "awake");
    assert_eq!(state(true, false, true).report(|| false), "battery");
    assert_eq!(state(true, true, false).report(|| true), "awake");
    assert_eq!(state(true, false, false).report(|| true), "paused");
    assert_eq!(state(false, true, true).report(|| true), "off");
}

#[test]
fn a_failed_hold_reports_failed_on_power() {
    let st = State {
        failed: true,
        ..state(true, false, true)
    };
    assert_eq!(st.report(|| true), "failed");
}

// set_for_computers tells open panes only when the second value is true.
#[test]
fn allow_control_starts_and_stops_the_hold_and_says_so() {
    let mut st = state(true, false, false);
    assert_eq!(st.apply(|s| s.computers = true), (true, true));
    assert!(st.want);
    assert_eq!(st.apply(|s| s.computers = true), (false, false));
    assert_eq!(st.apply(|s| s.computers = false), (true, true));
    assert!(!st.want);
    assert_eq!(st.report(|| true), "paused");
}

#[test]
fn allow_control_changes_nothing_while_phones_already_hold_it() {
    let mut st = state(true, true, false);
    st.apply(|_| {});
    assert_eq!(st.apply(|s| s.computers = true), (false, false));
    assert_eq!(st.apply(|s| s.computers = false), (false, false));
    assert!(st.want);
}

#[test]
fn allow_control_changes_nothing_while_the_switch_is_off() {
    let mut st = state(false, false, false);
    assert_eq!(st.apply(|s| s.computers = true), (false, false));
    assert!(!st.want);
    assert_eq!(st.report(|| true), "off");
}

#[test]
fn allow_control_off_and_on_again_retries_a_failed_hold() {
    let mut st = state(true, false, true);
    st.apply(|_| {});
    st.failed = true;
    st.cooldown = 3;
    let generation = st.generation;
    assert_eq!(st.apply(|s| s.computers = false), (true, true));
    assert!(!st.failed);
    assert_eq!(st.cooldown, 0);
    assert_eq!(st.apply(|s| s.computers = true), (true, true));
    assert_eq!(st.generation, generation + 2);
    assert_eq!(st.report(|| true), "awake");
}

fn power(on_power: bool, level: Option<u8>) -> super::Power {
    super::Power { on_power, level }
}

fn with_session(screen: bool, battery_floor: Option<u8>) -> State {
    State {
        session: Some(super::SessionHold {
            screen,
            battery_floor,
        }),
        ..State::default()
    }
}

#[test]
fn a_session_holds_without_the_switch_or_anything_reaching_it() {
    let st = with_session(false, None);
    assert!(st.wants());
    assert!(st.holds_now(power(true, None)));
    assert_eq!(
        st.report(|| true),
        "off",
        "the reachable switch reads as before"
    );
}

#[test]
fn a_session_on_battery_holds_down_to_its_floor() {
    let st = with_session(false, Some(20));
    assert!(st.holds_now(power(false, Some(21))));
    assert!(!st.holds_now(power(false, Some(20))));
    assert!(
        st.holds_now(power(false, None)),
        "an unreadable battery doesn't stop it"
    );
    assert_eq!(st.session_report(power(false, Some(50))), "awake");
    assert_eq!(st.session_report(power(false, Some(10))), "low");
}

#[test]
fn a_session_kept_to_power_lets_go_on_battery() {
    let st = with_session(false, None);
    assert!(!st.holds_now(power(false, Some(90))));
    assert_eq!(st.session_report(power(false, Some(90))), "battery");
    assert_eq!(st.session_report(power(true, None)), "awake");
}

#[test]
fn reachable_alone_still_holds_on_power_only() {
    let st = state(true, true, false);
    assert!(st.holds_now(power(true, None)));
    assert!(!st.holds_now(power(false, Some(90))));
    assert_eq!(st.session_report(power(true, None)), "idle");
}

#[test]
fn the_session_picks_the_flags() {
    assert_eq!(state(true, true, false).flags(), super::Flags::default());
    let st = with_session(true, Some(20));
    assert_eq!(
        st.flags(),
        super::Flags {
            screen: true,
            battery: true
        }
    );
}

#[test]
fn a_new_session_restarts_the_hold_but_the_same_one_does_not() {
    let mut st = State::default();
    let session = Some(super::SessionHold {
        screen: false,
        battery_floor: Some(20),
    });
    assert_eq!(st.apply(|s| s.session = session).0, true);
    assert_eq!(st.apply(|s| s.session = session).0, false);
    let screen_on = Some(super::SessionHold {
        screen: true,
        battery_floor: Some(20),
    });
    assert_eq!(st.apply(|s| s.session = screen_on).0, true);
    let lower_floor = Some(super::SessionHold {
        screen: true,
        battery_floor: Some(10),
    });
    assert_eq!(
        st.apply(|s| s.session = lower_floor).0,
        false,
        "the watch reads a new floor"
    );
    assert_eq!(st.apply(|s| s.session = None).0, true);
    assert!(!st.want);
}
