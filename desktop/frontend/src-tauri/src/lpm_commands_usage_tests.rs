use super::*;
use crate::lpm_commands::LpmCommand;

fn skill(name: &str, scope: Scope) -> LpmCommand {
    LpmCommand {
        name: name.into(),
        folder: None,
        description: String::new(),
        body: "Do it.".into(),
        scope,
        argument_hint: String::new(),
        reach: Default::default(),
        kept_out_of_git: false,
        tracked: false,
        awaiting_commit: false,
        path: String::new(),
        runs: None,
        last_run_at: None,
        recent_runs: None,
    }
}

fn lists() -> LpmCommands {
    LpmCommands {
        global: ScopeList { commands: vec![skill("ship", Scope::Global)], ..Default::default() },
        project: Some(ScopeList { commands: vec![skill("ship", Scope::Project), skill("fix", Scope::Project)], ..Default::default() }),
        project_error: None,
        folds: Default::default(),
        agent_runs: Default::default(),
    }
}

#[test]
fn counts_runs_and_keeps_the_latest_time() {
    let mut log = RunLog::default();
    log.record("web", Scope::Project, "fix", 100);
    log.record("web", Scope::Project, "Fix", 300);
    log.record("web", Scope::Project, "fix", 200);
    assert_eq!((log.projects["web"]["fix"].count, log.projects["web"]["fix"].last), (3, 300));
}

#[test]
fn a_project_skill_is_counted_per_project_and_a_global_one_once() {
    let mut log = RunLog::default();
    log.record("web", Scope::Project, "ship", 1);
    log.record("api", Scope::Global, "ship", 2);
    log.record("web", Scope::Global, "ship", 3);
    assert_eq!(log.global["ship"].count, 2);
    assert_eq!(log.projects["web"]["ship"].count, 1);
    assert!(!log.projects.contains_key("api"));
}

#[test]
fn lists_carry_the_runs_of_their_own_skills() {
    let mut log = RunLog::default();
    log.record("web", Scope::Project, "ship", 10);
    log.record("web", Scope::Global, "ship", 20);
    log.record("web", Scope::Global, "ship", 30);
    let mut l = lists();
    log.annotate("web", 100, &mut l);
    let own = l.project.as_ref().unwrap();
    assert_eq!((own.commands[0].runs, own.commands[0].last_run_at), (Some(1), Some(10)));
    assert_eq!((own.commands[1].runs, own.commands[1].last_run_at), (None, None));
    assert_eq!((l.global.commands[0].runs, l.global.commands[0].last_run_at), (Some(2), Some(30)));

    let mut other = lists();
    log.annotate("api", 100, &mut other);
    assert_eq!(other.project.unwrap().commands[0].runs, None);
}

#[test]
fn a_renamed_or_moved_skill_keeps_its_runs() {
    let mut log = RunLog::default();
    log.record("web", Scope::Project, "fix", 5);
    log.record("web", Scope::Global, "fix-ticket", 9);
    log.rename("web", (Scope::Project, "fix"), (Scope::Global, "fix-ticket"));
    assert_eq!((log.global["fix-ticket"].count, log.global["fix-ticket"].last), (2, 9));
    assert_eq!(log.global["fix-ticket"].recent.len(), 2);
    assert!(!log.projects.contains_key("web"));
}

#[test]
fn a_deleted_skill_forgets_its_runs() {
    let mut log = RunLog::default();
    log.record("web", Scope::Project, "fix", 5);
    log.record("web", Scope::Project, "ship", 6);
    log.forget("web", Scope::Project, "FIX");
    assert_eq!(log.projects["web"].keys().collect::<Vec<_>>(), ["ship"]);
    log.forget("web", Scope::Project, "ship");
    assert!(log.projects.is_empty());
}

#[test]
fn reads_an_older_or_partial_file() {
    let log: RunLog = serde_json::from_str(r#"{"global":{"ship":{"count":4,"last":7}}}"#).unwrap();
    assert_eq!((log.global["ship"].count, log.global["ship"].last), (4, 7));
    assert!(log.projects.is_empty());
}

const DAY: u64 = 24 * 60 * 60 * 1000;

#[test]
fn the_recent_count_only_looks_back_30_days() {
    let mut log = RunLog::default();
    log.record("web", Scope::Project, "fix", 0);
    log.record("web", Scope::Project, "fix", 20 * DAY);
    log.record("web", Scope::Project, "fix", 25 * DAY);
    let mut l = lists();
    log.annotate("web", 35 * DAY, &mut l);
    let fix = &l.project.as_ref().unwrap().commands[1];
    assert_eq!((fix.runs, fix.recent_runs), (Some(3), Some(2)));

    log.annotate("web", 60 * DAY, &mut l);
    let fix = &l.project.as_ref().unwrap().commands[1];
    assert_eq!((fix.runs, fix.recent_runs), (Some(3), None));
}

#[test]
fn a_new_run_drops_the_times_past_the_window() {
    let mut log = RunLog::default();
    log.record("web", Scope::Project, "fix", 0);
    log.record("web", Scope::Project, "fix", 31 * DAY);
    assert_eq!(log.projects["web"]["fix"].recent, vec![31 * DAY]);
}

#[test]
fn a_log_from_before_the_window_still_reads() {
    let log: RunLog = serde_json::from_str(r#"{"projects":{"web":{"fix":{"count":4,"last":9}}}}"#).unwrap();
    assert_eq!(log.projects["web"]["fix"], Runs { count: 4, last: 9, recent: Vec::new() });
    assert!(!serde_json::to_string(&log).unwrap().contains("recent"));
    assert!(!serde_json::to_string(&log).unwrap().contains("agent"));
}

#[test]
fn lists_carry_the_recent_runs_of_commands_that_are_not_skills() {
    let mut log = RunLog::default();
    log.record_agent("web", "Compact", 2 * DAY);
    log.record_agent("web", "compact", 3 * DAY);
    log.record_agent("web", "clear", 0);
    log.record_agent("api", "model", 3 * DAY);
    let mut l = lists();
    log.annotate("web", 31 * DAY, &mut l);
    assert_eq!(l.agent_runs.len(), 1);
    assert_eq!(l.agent_runs["compact"], AgentRuns { recent_runs: 2, last_run_at: 3 * DAY });
}
