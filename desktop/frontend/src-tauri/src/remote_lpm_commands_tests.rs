use super::*;
use crate::lpm_commands::{AgentRuns, OtherSkill, ScopeList};

fn command(name: &str, source: &str) -> AgentCommand {
    AgentCommand {
        name: name.into(),
        description: String::new(),
        argument_hint: String::new(),
        source: source.into(),
    }
}

fn other(name: &str, folder: Option<&str>) -> OtherSkill {
    OtherSkill {
        name: name.into(),
        description: String::new(),
        preview: String::new(),
        agents: Vec::new(),
        path: String::new(),
        folder: folder.map(str::to_string),
        at_root: false,
    }
}

fn lists() -> LpmCommands {
    LpmCommands {
        global: ScopeList {
            others: vec![other("docs", Some("Global folder"))],
            ..Default::default()
        },
        project: Some(ScopeList {
            others: vec![other("docs", Some("Web"))],
            ..Default::default()
        }),
        project_error: None,
        folds: Default::default(),
        agent_runs: [(
            "compact".to_string(),
            AgentRuns {
                recent_runs: 3,
                last_run_at: 40,
            },
        )]
        .into(),
    }
}

#[test]
fn an_agent_row_carries_its_recent_runs() {
    let row = agent_row(command("Compact", "builtin"), Some(&lists())).unwrap();
    assert_eq!(
        (row["recentRuns"].as_u64(), row["lastRunAt"].as_u64()),
        (Some(3), Some(40))
    );
}

#[test]
fn a_row_never_run_has_no_run_fields() {
    let row = agent_row(command("clear", "builtin"), Some(&lists())).unwrap();
    assert!(row.get("recentRuns").is_none() && row.get("lastRunAt").is_none());
}

#[test]
fn a_filed_skill_keeps_the_folder_of_its_own_list() {
    let project = agent_row(command("docs", "project"), Some(&lists())).unwrap();
    assert_eq!(project["folder"], "Web");
    let user = agent_row(command("docs", "user"), Some(&lists())).unwrap();
    assert_eq!(user["folder"], "Global folder");
}

#[test]
fn a_built_in_never_takes_a_skills_folder() {
    let row = agent_row(command("docs", "builtin"), Some(&lists())).unwrap();
    assert!(row.get("folder").is_none());
}

#[test]
fn a_row_still_lists_when_the_lists_could_not_be_read() {
    let row = agent_row(command("compact", "builtin"), None).unwrap();
    assert_eq!(row["name"], "compact");
    assert!(row.get("recentRuns").is_none());
}
