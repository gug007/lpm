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
    }
}

fn lists() -> LpmCommands {
    LpmCommands {
        global: ScopeList { commands: vec![skill("ship", Scope::Global)], ..Default::default() },
        project: Some(ScopeList { commands: vec![skill("ship", Scope::Project), skill("fix", Scope::Project)], ..Default::default() }),
        project_error: None,
    }
}

#[test]
fn counts_runs_and_keeps_the_latest_time() {
    let mut log = RunLog::default();
    log.record("web", Scope::Project, "fix", 100);
    log.record("web", Scope::Project, "Fix", 300);
    log.record("web", Scope::Project, "fix", 200);
    assert_eq!(log.projects["web"]["fix"], Runs { count: 3, last: 300 });
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
    log.annotate("web", &mut l);
    let own = l.project.as_ref().unwrap();
    assert_eq!((own.commands[0].runs, own.commands[0].last_run_at), (Some(1), Some(10)));
    assert_eq!((own.commands[1].runs, own.commands[1].last_run_at), (None, None));
    assert_eq!((l.global.commands[0].runs, l.global.commands[0].last_run_at), (Some(2), Some(30)));

    let mut other = lists();
    log.annotate("api", &mut other);
    assert_eq!(other.project.unwrap().commands[0].runs, None);
}

#[test]
fn a_renamed_or_moved_skill_keeps_its_runs() {
    let mut log = RunLog::default();
    log.record("web", Scope::Project, "fix", 5);
    log.record("web", Scope::Global, "fix-ticket", 9);
    log.rename("web", (Scope::Project, "fix"), (Scope::Global, "fix-ticket"));
    assert_eq!(log.global["fix-ticket"], Runs { count: 2, last: 9 });
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
    assert_eq!(log.global["ship"], Runs { count: 4, last: 7 });
    assert!(log.projects.is_empty());
}
