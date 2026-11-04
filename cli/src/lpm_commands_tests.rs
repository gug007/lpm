use super::*;
use crate::lpm_commands_lists::{Lists, ScopeList};
use crate::statussock::hex_decode;
use crate::statussock::net::UnixListener;
use clap::Parser;
use std::io::{BufRead, BufReader, Write};

fn saved(scope: Scope, folder: Option<&str>, name: &str) -> Saved {
    Saved {
        name: name.into(),
        folder: folder.map(str::to_string),
        description: format!("about {name}"),
        body: format!("prompt of {name}"),
        scope,
        argument_hint: String::new(),
        kept_out_of_git: false,
        keep_out_of_git: None,
    }
}

fn lists(project: Vec<Saved>, global: Vec<Saved>) -> Lists {
    Lists {
        global: ScopeList { commands: global },
        project: Some(ScopeList { commands: project }),
        project_error: None,
    }
}

#[derive(Parser)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

fn edit_args(line: &[&str]) -> EditArgs {
    let argv = ["lpm", "edit", "x"].iter().chain(line).copied();
    match Cli::try_parse_from(argv).unwrap().command {
        Command::Edit(args) => args,
        _ => unreachable!(),
    }
}

#[test]
fn a_name_matches_whatever_its_case() {
    let l = lists(vec![saved(Scope::Project, None, "Review")], vec![]);
    assert_eq!(
        find_in(&l, Scope::Project, "review").unwrap().name,
        "Review"
    );
}

#[test]
fn the_project_command_runs_before_the_global_one() {
    let l = lists(
        vec![saved(Scope::Project, None, "ship")],
        vec![
            saved(Scope::Global, None, "ship"),
            saved(Scope::Global, None, "deploy"),
        ],
    );
    assert_eq!(l.effective("SHIP").unwrap().scope, Scope::Project);
    assert_eq!(l.effective("deploy").unwrap().scope, Scope::Global);
    assert!(l.effective("nope").is_none());
}

#[test]
fn a_project_miss_points_at_the_global_list_when_it_has_the_name() {
    let l = lists(vec![], vec![saved(Scope::Global, None, "shared")]);
    let err = find_in(&l, Scope::Project, "shared").unwrap_err();
    assert_eq!(err.code(), 2);
    assert!(err.message().contains("pass --global"));
    let err = find_in(&l, Scope::Project, "nope").unwrap_err();
    assert!(err.message().contains("lpm skills list"));
}

#[test]
fn the_same_name_in_two_folders_is_never_guessed_between() {
    let l = lists(
        vec![
            saved(Scope::Project, Some("a"), "x"),
            saved(Scope::Project, None, "X"),
        ],
        vec![],
    );
    let err = find_in(&l, Scope::Project, "x").unwrap_err();
    assert_eq!(err.code(), 2);
    assert!(err.message().contains("a, No folder"), "{}", err.message());
}

#[test]
fn a_project_list_that_could_not_be_read_says_why() {
    let l = Lists {
        project: None,
        project_error: Some("host is down".into()),
        ..lists(vec![], vec![])
    };
    let err = find_in(&l, Scope::Project, "x").unwrap_err();
    assert_eq!((err.code(), err.message()), (1, "host is down"));
}

#[test]
fn outside_a_project_its_list_asks_for_one() {
    let l = Lists {
        project: None,
        ..lists(vec![], vec![])
    };
    assert!(find_in(&l, Scope::Project, "x")
        .unwrap_err()
        .message()
        .contains("--global"));
}

#[test]
fn an_edit_keeps_every_field_it_was_not_given() {
    let c = saved(Scope::Project, Some("bugs"), "x");
    let e = edited(&c, &edit_args(&["--description", "new"]), None);
    assert_eq!(
        json!(e),
        json!({
            "scope": "project",
            "folder": "bugs",
            "name": "x",
            "description": "new",
            "body": "prompt of x",
            "argumentHint": "",
        })
    );
    assert_eq!(
        reference(&c),
        json!({ "scope": "project", "folder": "bugs", "name": "x" })
    );
}

#[test]
fn an_edit_can_rename_move_and_clear() {
    let c = saved(Scope::Project, Some("bugs"), "x");
    let args = edit_args(&[
        "--rename",
        "/y",
        "--to",
        "global",
        "--folder",
        "",
        "--description",
        "",
    ]);
    let e = edited(&c, &args, Some("new prompt".into()));
    assert_eq!((e.scope, e.name.as_str()), (Scope::Global, "y"));
    assert_eq!(e.folder.as_deref(), Some(""));
    assert_eq!(e.description, "");
    assert_eq!(e.body, "new prompt");
}

#[test]
fn an_edit_needs_something_to_change() {
    assert!(changes_nothing(&edit_args(&[]), false));
    assert!(!changes_nothing(&edit_args(&[]), true));
    assert!(!changes_nothing(&edit_args(&["--folder", ""]), false));
}

#[test]
fn a_hidden_global_command_says_what_runs_instead() {
    let mut own = saved(Scope::Project, Some("bugs"), "ship");
    own.argument_hint = "<ticket>".into();
    let l = lists(vec![own], vec![saved(Scope::Global, None, "ship")]);
    let table = render_table(&rows(&l));
    let lines: Vec<&str> = table.lines().collect();
    assert_eq!(lines[0], "SKILL           LIST     FOLDER  DESCRIPTION");
    assert_eq!(lines[1], "/ship <ticket>  project  bugs    about ship");
    assert_eq!(
        lines[2],
        "/ship           global           about ship (this project's /ship runs instead)"
    );
}

#[test]
fn an_empty_description_leaves_no_trailing_spaces() {
    let mut c = saved(Scope::Global, None, "x");
    c.description.clear();
    let table = render_table(&rows(&lists(vec![], vec![c])));
    assert!(table.lines().all(|l| l == l.trim_end()));
}

#[test]
fn the_apps_list_reply_parses() {
    let l = parse_lists(&json!({
        "global": { "folders": [], "commands": [] },
        "project": { "folders": ["bugs"], "commands": [{
            "name": "x",
            "folder": "bugs",
            "description": "",
            "body": "b",
            "scope": "project",
            "argumentHint": "<a>",
        }]},
        "projectError": null,
    }))
    .unwrap();
    assert_eq!(
        l.of(Scope::Project).unwrap().commands[0].argument_hint,
        "<a>"
    );
}

/// A socket that answers the `ping` every verb starts with, then `reply` to the
/// one request it records.
fn server(reply: &'static str) -> (tempfile::TempDir, Ctx, std::thread::JoinHandle<String>) {
    let dir = tempfile::tempdir().unwrap();
    let ctx = Ctx {
        lpm_dir: dir.path().to_path_buf(),
        socket_override: None,
    };
    let listener = UnixListener::bind(ctx.socket_path()).unwrap();
    let handle = std::thread::spawn(move || loop {
        let (mut stream, _) = listener.accept().unwrap();
        let mut line = String::new();
        BufReader::new(stream.try_clone().unwrap())
            .read_line(&mut line)
            .unwrap();
        if line.trim() == "ping" {
            writeln!(stream, "PONG").unwrap();
            continue;
        }
        writeln!(stream, "{reply}").unwrap();
        return line.trim().to_string();
    });
    (dir, ctx, handle)
}

fn decoded(line: &str) -> Value {
    let hex = line.rsplit_once("--payload-hex=").unwrap().1;
    serde_json::from_str(&hex_decode(hex).unwrap()).unwrap()
}

#[test]
fn a_request_names_the_verb_and_carries_the_project_and_any_text() {
    let (_d, ctx, h) = server("{}");
    request(
        &ctx,
        "save",
        "my project",
        json!({ "body": "two\nlines 'quoted' {{x}}" }),
    )
    .unwrap();
    let line = h.join().unwrap();
    assert!(
        line.starts_with("lpm_commands save --payload-hex="),
        "{line}"
    );
    assert_eq!(
        decoded(&line),
        json!({ "body": "two\nlines 'quoted' {{x}}", "project": "my project" })
    );
}

#[test]
fn a_request_with_no_fields_still_names_its_project() {
    let (_d, ctx, h) = server("{}");
    request(&ctx, "list", "", Value::Null).unwrap();
    assert_eq!(decoded(&h.join().unwrap()), json!({ "project": "" }));
}

#[test]
fn an_app_error_is_a_failure_with_its_text() {
    let (_d, ctx, h) = server("ERROR: /x already exists in No folder.");
    let err = request(&ctx, "save", "", Value::Null).unwrap_err();
    assert_eq!(
        (err.code(), err.message()),
        (1, "/x already exists in No folder.")
    );
    h.join().unwrap();
}

#[test]
fn git_flags_say_what_to_do_and_alone_count_as_a_change() {
    let out = edit_args(&["--keep-out-of-git"]);
    assert_eq!(git_choice(&out), Some(true));
    assert!(!changes_nothing(&out, false));
    let back = edit_args(&["--in-git"]);
    assert_eq!(git_choice(&back), Some(false));
    assert!(!changes_nothing(&back, false));
    assert_eq!(git_choice(&edit_args(&[])), None);
    assert!(changes_nothing(&edit_args(&[]), false));
}

#[test]
fn git_flags_refuse_each_other_and_the_global_list() {
    let refused = |words: &[&str]| {
        let argv = ["lpm", "edit", "x"].iter().chain(words).copied();
        Cli::try_parse_from(argv).is_err()
    };
    assert!(refused(&["--keep-out-of-git", "--in-git"]));
    assert!(refused(&["--keep-out-of-git", "--global"]));
    assert!(refused(&["--in-git", "--global"]));
}

#[test]
fn a_save_sends_the_switch_only_when_asked() {
    let plain = saved(Scope::Project, None, "mine");
    assert!(serde_json::to_value(&plain).unwrap().get("keepOutOfGit").is_none());
    let asked = Saved { keep_out_of_git: Some(true), ..plain };
    assert_eq!(serde_json::to_value(&asked).unwrap()["keepOutOfGit"], true);
}

#[test]
fn an_app_that_skipped_the_switch_is_an_error_not_a_success() {
    let reply = json!({
        "global": { "commands": [] },
        "project": { "commands": [{
            "name": "mine", "folder": null, "description": "", "body": "x",
            "scope": "project", "argumentHint": ""
        }] },
        "projectError": null,
    });
    let asked = Saved { keep_out_of_git: Some(true), ..saved(Scope::Project, None, "mine") };
    assert!(confirm_git(&reply, &asked).is_err());
    assert!(confirm_git(&reply, &saved(Scope::Project, None, "mine")).is_ok());
}
