use super::*;
use crate::config::SshSettings;
use crate::lpm_commands::{LocalFs, LpmCommand, LpmCommands, Scope, ScopeList};
use crate::lpm_commands_remote::RemoteFs;
use std::path::{Path, PathBuf};

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
        reach: Default::default(),
        kept_out_of_git: false,
        tracked: false,
        awaiting_commit: false,
        path: String::new(),
        runs: None,
        last_run_at: None,
    }
}

#[test]
fn the_project_command_wins_over_a_global_one() {
    let list = LpmCommands {
        global: ScopeList { commands: vec![command("ship", Scope::Global, "global")], ..Default::default() },
        project: Some(ScopeList { commands: vec![command("Ship", Scope::Project, "project")], ..Default::default() }),
        project_error: None,
        folds: Default::default(),
    };
    assert_eq!(find(&list, "ship").unwrap().body, "project");
    assert_eq!(find(&list, "SHIP").unwrap().body, "project");
    assert!(find(&list, "nope").is_none());
}

#[test]
fn a_run_is_a_whole_message_starting_with_a_slash() {
    assert_eq!(parse_run("/review"), Some(("review", "")));
    assert_eq!(parse_run("  /review LPM-1  now \n"), Some(("review", "LPM-1  now")));
    assert_eq!(parse_run("/review line one\nline two"), Some(("review", "line one\nline two")));
    assert_eq!(parse_run("please /review"), None);
    assert_eq!(parse_run("/ review"), None);
    assert_eq!(parse_run(""), None);
}

#[test]
fn a_missing_value_names_what_to_pass() {
    let mut c = command("review", Scope::Project, "Fix {{ticket}} for {{who}}");
    c.argument_hint = argument_hint(&c.body);
    let missing = vec!["ticket".to_string(), "who".to_string()];
    assert_eq!(
        missing_error(&c, &missing),
        "/review is missing {{ticket}}, {{who}}. Run it as /review <ticket> <who>."
    );
}

#[test]
fn a_missing_automatic_value_has_nothing_to_pass() {
    let c = command("ship", Scope::Project, "Ship {{branch}}");
    assert_eq!(missing_error(&c, &["branch".to_string()]), "/ship is missing {{branch}}.");
}

fn in_folder(mut c: LpmCommand, folder: &str) -> LpmCommand {
    c.folder = Some(folder.into());
    c
}

fn home_store() -> Box<LocalFs> {
    Box::new(LocalFs::new(
        PathBuf::from("/home/me/.agents/skills"),
        PathBuf::from("/home/me/.claude/skills"),
        PathBuf::from("/home/me/.lpm"),
    ))
}

fn local_stores() -> Stores {
    Stores {
        global: home_store(),
        project: Some(Box::new(LocalFs::new(
            PathBuf::from("/code/web/.agents/skills"),
            PathBuf::from("/code/web/.claude/skills"),
            PathBuf::from("/code/web/.lpm"),
        ))),
    }
}

fn local_place() -> ProjectPlace {
    ProjectPlace { name: "web".into(), root: "/code/web".into(), ssh: None }
}

fn ssh_place() -> ProjectPlace {
    ProjectPlace {
        name: "web".into(),
        root: "/srv/web/".into(),
        ssh: Some(SshSettings { host: "box".into(), ..Default::default() }),
    }
}

fn ssh_stores(place: &ProjectPlace) -> Stores {
    Stores {
        global: home_store(),
        project: Some(Box::new(RemoteFs::new(place.ssh.clone().unwrap(), &place.root))),
    }
}

fn joined(base: &str, folder: &str) -> Option<String> {
    Some(Path::new(base).join(folder).to_string_lossy().into_owned())
}

#[test]
fn dir_is_the_skill_s_own_folder() {
    let stores = local_stores();
    let place = local_place();
    let global = command("walkthrough", Scope::Global, "");
    assert_eq!(
        command_dir(Some(&place), &stores, &global),
        joined("/home/me/.agents/skills", "walkthrough"),
    );
    let own = in_folder(command("ship", Scope::Project, ""), "Release");
    assert_eq!(command_dir(Some(&place), &stores, &own), joined("/code/web/.agents/skills", "ship"));
}

#[test]
fn dir_works_with_no_project() {
    let stores = Stores { project: None, ..local_stores() };
    let c = command("walkthrough", Scope::Global, "");
    assert_eq!(command_dir(None, &stores, &c), joined("/home/me/.agents/skills", "walkthrough"));
}

#[test]
fn dir_in_an_ssh_project_is_a_path_on_its_host() {
    let place = ssh_place();
    let stores = ssh_stores(&place);
    let own = in_folder(command("ship", Scope::Project, ""), "Release");
    assert_eq!(
        command_dir(Some(&place), &stores, &own).as_deref(),
        Some("/srv/web/.agents/skills/ship"),
    );
}

#[test]
fn a_global_command_has_no_dir_on_an_ssh_host() {
    let place = ssh_place();
    let stores = ssh_stores(&place);
    let c = command("walkthrough", Scope::Global, "");
    assert_eq!(command_dir(Some(&place), &stores, &c), None);
    let out = fill("web", Some(&place), &stores, &LpmCommand { body: "Read {{dir}}/GUIDE.md".into(), ..c }, "");
    assert_eq!(out.text, "Read {{dir}}/GUIDE.md");
    assert_eq!(out.missing, ["dir"]);
}

#[test]
fn dir_fills_in_without_taking_an_argument() {
    let stores = Stores { project: None, ..local_stores() };
    let c = in_folder(command("kit", Scope::Global, "About {{what}}: read {{dir}}/GUIDE.md"), "kit");
    assert_eq!(argument_hint(&c.body), "<what>");
    let out = fill("", None, &stores, &c, "a short demo");
    let dir = stores.global.location("kit");
    assert_eq!(out.text, format!("About a short demo: read {dir}/GUIDE.md"));
    assert!(out.missing.is_empty());
}
