use super::*;
use crate::lpm_commands::{LpmCommand, LpmCommands, Scope, ScopeList};

fn auto(var: &str) -> Option<String> {
    match var {
        "branch" => Some("feat/x".into()),
        "project" => Some("Web".into()),
        _ => None,
    }
}

fn run(body: &str, args: &str) -> Expanded {
    expand_body(body, args, &mut auto)
}

#[test]
fn fills_variables_in_order_with_the_last_taking_the_rest() {
    let out = run("Fix {{ticket}} for {{who}} on {{branch}}.", "LPM-1 the whole team");
    assert_eq!(out.text, "Fix LPM-1 for the whole team on feat/x.");
    assert!(out.missing.is_empty());
}

#[test]
fn a_repeated_variable_takes_the_same_value() {
    let out = run("{{a}} and {{ a }} again", "x");
    assert_eq!(out.text, "x and x again");
}

#[test]
fn unfilled_variables_stay_and_are_reported() {
    let out = run("Fix {{ticket}} in {{project}}.", "");
    assert_eq!(out.text, "Fix {{ticket}} in Web.");
    assert_eq!(out.missing, ["ticket"]);
}

#[test]
fn arguments_takes_everything() {
    let out = run("Review $ARGUMENTS carefully.", "  PR 12  ");
    assert_eq!(out.text, "Review PR 12 carefully.");
}

#[test]
fn arguments_with_nowhere_to_go_are_appended() {
    assert_eq!(run("Write tests.", "for auth").text, "Write tests.\n\nfor auth");
    assert_eq!(run("Write tests.", "").text, "Write tests.");
}

#[test]
fn braces_that_are_not_variables_are_left_alone() {
    let out = run("Use {{ two words }} and {{}} and {{open", "x");
    assert_eq!(out.text, "Use {{ two words }} and {{}} and {{open\n\nx");
}

#[test]
fn an_auto_variable_that_cannot_be_known_is_missing() {
    let out = expand_body("On {{branch}}", "", &mut |_| None);
    assert_eq!(out.text, "On {{branch}}");
    assert_eq!(out.missing, ["branch"]);
}

#[test]
fn hints_name_what_a_run_asks_for() {
    assert_eq!(argument_hint("Fix {{ticket}} on {{branch}} for {{who}}"), "<ticket> <who>");
    assert_eq!(argument_hint("Review $ARGUMENTS"), "<arguments>");
    assert_eq!(argument_hint("Plain"), "");
}

fn command(name: &str, scope: Scope, body: &str) -> LpmCommand {
    LpmCommand {
        name: name.into(),
        folder: None,
        description: String::new(),
        body: body.into(),
        scope,
        argument_hint: String::new(),
    }
}

#[test]
fn the_project_command_wins_over_a_global_one() {
    let list = LpmCommands {
        global: ScopeList { folders: vec![], commands: vec![command("ship", Scope::Global, "global")] },
        project: Some(ScopeList { folders: vec![], commands: vec![command("Ship", Scope::Project, "project")] }),
        project_error: None,
    };
    assert_eq!(find(&list, "ship").unwrap().body, "project");
    assert_eq!(find(&list, "SHIP").unwrap().body, "project");
    assert!(find(&list, "nope").is_none());
}
