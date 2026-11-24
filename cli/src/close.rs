//! `lpm close [tab] [--when-done | --force]` — close a terminal tab through the
//! running app, which decides as it does for the tab's own ×. The app says what
//! it did or why it didn't; this puts that into words and an exit code.

use crate::config::{self, Ctx};
use crate::control;
use crate::error::{resolve_status_target, RunError};
use crate::statussock::hex_encode;
use crate::util::print_json;
use serde::Deserialize;
use serde_json::{json, Value};

pub struct Args<'a> {
    pub tab: Option<&'a str>,
    pub project: Option<&'a str>,
    pub force: bool,
    pub when_done: bool,
    pub json: bool,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct Reply {
    ok: bool,
    result: String,
    reason: String,
    detail: String,
    name: String,
    project: String,
    tabs: Vec<Tab>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct Tab {
    tab: String,
    name: String,
}

pub fn run(ctx: &Ctx, args: &Args) -> Result<(), RunError> {
    let wanted = args.tab.map(str::trim).unwrap_or_default();
    if wanted.is_empty() && !args.when_done {
        return Err(RunError::NotFound(
            "name the tab to close: its id, as `lpm run` and `lpm status` print it, or its name in the tab strip. \
`lpm close --when-done` closes the tab it's run from once your turn ends"
                .into(),
        ));
    }
    control::require_app(ctx)?;
    // A tab's id says which project it is in, so it can be closed from anywhere.
    let project = match resolve_status_target(ctx, args.project) {
        Err(e) if args.project.is_some() => return Err(e),
        found => found.unwrap_or_default(),
    };
    let request = json!({
        "tab": wanted,
        "project": project,
        "named": args.project.is_some(),
        "pane": std::env::var("LPM_PANE_ID").unwrap_or_default(),
        "force": args.force,
        "whenDone": args.when_done,
    });
    let line = format!(
        "close_tab --request-hex={}",
        hex_encode(&request.to_string())
    );
    let reply = control::parse_json(&control::send_within(ctx, &line, control::SSH_REPLY)?)?;
    let said: Reply = serde_json::from_value(reply.clone()).unwrap_or_default();
    if said.ok {
        if args.json {
            print_json(&reply);
        } else {
            println!("{}", done_text(&said, wanted.is_empty()));
        }
        return Ok(());
    }
    let error = refusal(&said, wanted, args);
    if args.json {
        print_json(&with_error(reply, error.message()));
    }
    Err(error)
}

fn with_error(mut reply: Value, error: &str) -> Value {
    if reply.is_object() {
        reply["error"] = json!(error);
    }
    reply
}

fn done_text(said: &Reply, own: bool) -> String {
    match said.result.as_str() {
        "whenDone" if own => "this tab closes when your turn ends".into(),
        "whenDone" => format!("{:?} closes when its agent is done", said.name),
        "firstTurn" => format!("{:?} closes after its agent's first turn", said.name),
        _ => format!("closed {:?}", said.name),
    }
}

/// Why nothing closed. A tab that can't be told is a usage error (exit 2), as
/// for every command that takes a name; a tab the app won't close is exit 1.
fn refusal(said: &Reply, wanted: &str, args: &Args) -> RunError {
    let place = config::status_group_label(&said.project);
    match said.result.as_str() {
        "refused" => RunError::Internal(format!("not closed: {}", why(said, args))),
        "noProject" => RunError::NotFound(if wanted.is_empty() {
            "`lpm close --when-done` without a tab closes the one it's run from, and this isn't an lpm tab".into()
        } else {
            format!("no open tab has the id {wanted:?}; to find one by name, pass -p <project>")
        }),
        "notOpen" => RunError::NotFound(format!(
            "no tab matches {wanted:?}: {place} hasn't been opened since lpm started"
        )),
        "ambiguous" => RunError::NotFound(format!(
            "{wanted:?} is ambiguous — close one by its id:\n{}",
            listed(&said.tabs)
        )),
        _ => RunError::NotFound(if said.tabs.is_empty() {
            format!("no tab matches {wanted:?}: {place} has no open terminal tabs")
        } else {
            format!(
                "no tab matches {wanted:?}\nopen in {place}:\n{}",
                listed(&said.tabs)
            )
        }),
    }
}

fn listed(tabs: &[Tab]) -> String {
    tabs.iter()
        .map(|t| format!("  {}  {}", t.tab, t.name))
        .collect::<Vec<_>>()
        .join("\n")
}

fn why(said: &Reply, args: &Args) -> String {
    let later = "--when-done closes it once that's over, --force closes it now";
    let anyway = "--force closes it anyway";
    match said.reason.as_str() {
        "working" => format!("its agent is still working ({later})"),
        "waiting" => format!("its agent is waiting for an answer ({later})"),
        "starting" => format!("its agent is just starting ({later})"),
        "command" => {
            let running = match said.detail.as_str() {
                "" => "a command",
                name => name,
            };
            let then = if args.when_done {
                ", and there's no agent to wait for".to_string()
            } else {
                format!(" ({anyway})")
            };
            format!("{running} is still running in it{then}")
        }
        "unsent" => format!("a message typed in it hasn't been sent ({anyway})"),
        "scheduled" => format!("a message is scheduled to be sent to it ({anyway})"),
        "pinned" => "it's pinned".into(),
        "own" => "it's the tab you're in (--when-done closes it once your turn ends)".into(),
        "ownIdle" => "lpm sees no agent working in this tab, so it can't tell when you're done".into(),
        other => format!("the app refused ({other})"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn said(reply: Value) -> Reply {
        serde_json::from_value(reply).unwrap()
    }

    fn args(when_done: bool) -> Args<'static> {
        Args {
            tab: Some("Docs"),
            project: None,
            force: false,
            when_done,
            json: false,
        }
    }

    fn refused(reason: &str, detail: &str, when_done: bool) -> RunError {
        let reply = json!({ "ok": false, "result": "refused", "reason": reason, "detail": detail,
            "tab": "api-1", "name": "Docs", "project": "api" });
        refusal(&said(reply), "Docs", &args(when_done))
    }

    #[test]
    fn says_what_it_did() {
        let closed = said(json!({ "ok": true, "result": "closed", "tab": "api-1", "name": "Docs" }));
        assert_eq!(done_text(&closed, false), "closed \"Docs\"");
        let later = said(json!({ "ok": true, "result": "whenDone", "name": "Docs" }));
        assert_eq!(done_text(&later, false), "\"Docs\" closes when its agent is done");
        assert_eq!(done_text(&later, true), "this tab closes when your turn ends");
        let first = said(json!({ "ok": true, "result": "firstTurn", "name": "Docs" }));
        assert_eq!(done_text(&first, false), "\"Docs\" closes after its agent's first turn");
    }

    #[test]
    fn a_refusal_is_exit_1_and_says_why() {
        let e = refused("working", "", false);
        assert_eq!(e.code(), 1);
        assert!(e.message().starts_with("not closed: its agent is still working"));
        assert!(e.message().contains("--when-done"));
        assert!(refused("command", "go run ./cmd/api", false)
            .message()
            .contains("go run ./cmd/api is still running"));
        assert!(refused("command", "npm test", true).message().contains("no agent to wait for"));
        assert!(refused("command", "", false).message().contains("a command is still running"));
        assert!(refused("own", "", false).message().contains("the tab you're in"));
        assert!(!refused("pinned", "", false).message().contains("--force"));
        assert!(refused("somethingNew", "", false).message().contains("somethingNew"));
    }

    #[test]
    fn a_tab_that_cannot_be_told_is_exit_2_and_lists_the_open_ones() {
        let open = json!([{ "tab": "api-1", "name": "Docs" }, { "tab": "api-2", "name": "docs" }]);
        let none = said(json!({ "ok": false, "result": "notFound", "project": "api", "tabs": open }));
        let e = refusal(&none, "Lint", &args(false));
        assert_eq!(e.code(), 2);
        assert_eq!(e.message(), "no tab matches \"Lint\"\nopen in api:\n  api-1  Docs\n  api-2  docs");
        let many = said(json!({ "ok": false, "result": "ambiguous", "project": "api", "tabs": open }));
        let e = refusal(&many, "DOCS", &args(false));
        assert_eq!(e.code(), 2);
        assert!(e.message().starts_with("\"DOCS\" is ambiguous"));
        assert!(e.message().contains("api-2  docs"));
    }

    #[test]
    fn names_the_global_terminals_as_the_app_does() {
        let none = said(json!({ "ok": false, "result": "notFound", "project": "__global__" }));
        assert_eq!(
            refusal(&none, "Docs", &args(false)).message(),
            "no tab matches \"Docs\": Terminals has no open terminal tabs"
        );
    }

    #[test]
    fn a_project_not_opened_yet_and_no_project_at_all_are_exit_2() {
        let shut = said(json!({ "ok": false, "result": "notOpen", "project": "api" }));
        let e = refusal(&shut, "Docs", &args(false));
        assert_eq!((e.code(), e.message().contains("hasn't been opened")), (2, true));
        let nowhere = said(json!({ "ok": false, "result": "noProject" }));
        assert!(refusal(&nowhere, "Docs", &args(false)).message().contains("-p <project>"));
        assert!(refusal(&nowhere, "", &args(true)).message().contains("isn't an lpm tab"));
    }

    #[test]
    fn a_bare_close_asks_which_tab() {
        let dir = tempfile::tempdir().unwrap();
        let ctx = Ctx { lpm_dir: dir.path().to_path_buf(), socket_override: None };
        let bare = Args { tab: None, ..args(false) };
        let e = run(&ctx, &bare).unwrap_err();
        assert_eq!(e.code(), 2);
        assert!(e.message().contains("name the tab to close"));
    }
}
