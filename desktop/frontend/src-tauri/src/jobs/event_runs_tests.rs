use super::*;
use crate::jobs::events::resolve;
use crate::jobs::ScheduleDef;

fn sched(yaml: &str) -> ScheduleDef {
    serde_norway::from_str(yaml).unwrap()
}

fn happening(kind: EventKind, project: &str) -> Happening {
    Happening::new(kind, project)
}

#[test]
fn a_job_hears_its_own_project_unless_it_names_others() {
    let ci = resolve(&sched("on: ciFailed\nbranches: [main]")).unwrap();
    let mut h = happening(EventKind::CiFailed, "web");
    h.branch = "main".into();
    assert!(matches(&ci, "web", &h));
    assert!(!matches(&ci, "api", &h));
    assert!(matches(&ci, "", &h));
    h.branch = "feature".into();
    assert!(!matches(&ci, "web", &h));

    let agents = resolve(&sched("on: agentFinished\nfrom: [docs]")).unwrap();
    let h = happening(EventKind::AgentFinished, "docs");
    assert!(matches(&agents, "web", &h));
    assert!(!matches(&agents, "web", &happening(EventKind::AgentFinished, "web")));
    assert!(!matches(&agents, "web", &happening(EventKind::CiFailed, "docs")));
}

#[test]
fn a_commit_starts_a_job_once_and_a_folder_without_git_counts_days() {
    let mut h = happening(EventKind::ServiceCrashed, "web");
    assert_eq!(mark(AtMost::Commit, &h, "2026-11-23"), "day:2026-11-23");
    h.commit = "abc123".into();
    assert_eq!(mark(AtMost::Commit, &h, "2026-11-23"), "commit:abc123");
    assert_eq!(mark(AtMost::Day, &h, "2026-11-23"), "day:2026-11-23");
}

#[test]
fn the_agent_is_told_why_it_was_started() {
    let mut h = happening(EventKind::CiFailed, "web");
    h.summary = "CI failed on main in web".into();
    h.branch = "main".into();
    h.commit = "7e1f279d02bf2269".into();
    h.url = "https://github.com/o/r/commit/7e1f279".into();
    h.detail = "Fix the failing Linux host check.".into();
    let prompt = with_note("Make CI pass.", &env(&h));
    assert_eq!(
        prompt,
        "This run started because CI failed on main in web.\nBranch main, commit 7e1f279.\nhttps://github.com/o/r/commit/7e1f279\n\nFix the failing Linux host check.\n\nMake CI pass."
    );
    assert_eq!(with_note("Make CI pass.", &[]), "Make CI pass.");
}

#[test]
fn a_crash_points_at_the_services_output() {
    let mut h = happening(EventKind::ServiceCrashed, "web");
    h.summary = "the api service in web exited with code 1".into();
    h.service = "api".into();
    h.exit_code = Some(1);
    let env = env(&h);
    assert!(env.contains(&("LPM_EVENT_EXIT_CODE".into(), "1".into())));
    assert!(with_note("Fix it.", &env).contains("lpm logs api -p web"));
}

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
