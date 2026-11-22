use super::*;

const WEEKLY_ONLY: &str = r#"{"type":"system","subtype":"init"}
{"type":"assistant","message":{}}
{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","resetsAt":1795741200,"rateLimitType":"seven_day","unifiedWindows":{"seven_day":{"utilization":0.3,"resetsAt":1795741200,"status":"allowed"}}}}
{"type":"result","subtype":"success","is_error":false,"result":"."}"#;

const BOTH: &str = r#"{"type":"rate_limit_event","rate_limit_info":{"status":"allowed_warning","rateLimitType":"seven_day","utilization":0.84,"unifiedWindows":{"five_hour":{"utilization":0,"resetsAt":1795389000},"seven_day":{"utilization":0.84,"resetsAt":1795449600}}}}"#;

#[test]
fn a_weekly_only_plan_reads_its_weekly_window() {
    let (five, weekly) = windows_from_stream(WEEKLY_ONLY).unwrap();
    assert!(five.is_none());
    let weekly = weekly.unwrap();
    assert_eq!(weekly.used_percent, 30.0);
    assert_eq!(weekly.resets_at, 1_795_741_200);
}

#[test]
fn both_windows_come_from_the_unified_list() {
    let (five, weekly) = windows_from_stream(BOTH).unwrap();
    assert_eq!(five.unwrap().used_percent, 0.0);
    assert_eq!(weekly.unwrap().used_percent, 84.0);
}

#[test]
fn an_older_event_shape_still_reads_its_one_window() {
    let line = r#"{"type":"rate_limit_event","rate_limit_info":{"rateLimitType":"five_hour","utilization":1.2,"resetsAt":5}}"#;
    let (five, weekly) = windows_from_stream(line).unwrap();
    assert_eq!(five.unwrap().used_percent, 100.0, "clamped to the plan");
    assert!(weekly.is_none());
}

#[test]
fn a_run_without_an_event_reports_its_own_error() {
    let out = r#"{"type":"result","subtype":"success","is_error":true,"result":"Not logged in · Please run /login"}"#;
    assert!(windows_from_stream(out).is_none());
    assert_eq!(failure_of(out).as_deref(), Some("Claude couldn't answer: Not logged in · Please run /login"));
    assert!(failure_of(WEEKLY_ONLY).is_none());
}
