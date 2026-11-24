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
