//! `lpm close`: closes a terminal tab for a script or an agent. The window that
//! owns the tabs decides and does it, as it does for ×; what it can't see of a
//! terminal — an agent's status, a program in front of the shell — goes with the
//! request. Also the tabs `lpm run` opened, whose agents take a moment to start.
use crate::pty::PtyState;
use crate::status::{StatusStore, STATUS_WAITING};
use crate::sys::MACHINE;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const EVENT: &str = "close-tab-request";
/// How long an agent `lpm run` launched has to say it started.
const STARTING_FOR: Duration = Duration::from_secs(60);
/// How long a new tab's shell can take before its command is typed into it.
const LAUNCHING_FOR: Duration = Duration::from_secs(4);

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct Ask {
    /// A tab's id or its name; empty for the tab the command runs in.
    tab: String,
    project: String,
    /// `project` was asked for, rather than where the command ran.
    named: bool,
    /// The tab the command runs in, if any.
    pane: String,
    force: bool,
    when_done: bool,
}

pub fn cmd_close_tab(args: &[String], store: &StatusStore, app: &AppHandle) -> String {
    let (_, options) = crate::socketsrv::parse_options(args);
    let Some(ask) = options
        .get("request")
        .and_then(|r| serde_json::from_str::<Ask>(r).ok())
    else {
        return "ERROR: usage: close_tab --request-hex=<JSON>".into();
    };
    if app.get_webview_window("main").is_none() {
        return format!("ERROR: open the lpm app on your {MACHINE} to close tabs");
    }
    let ptys = app.state::<PtyState>();
    let own = store.current_pane(&ask.pane);
    let Some((project, tab)) = target(
        &ask,
        &own,
        |id| store.current_pane(id),
        |id| crate::pty::project_of(&ptys, id),
    ) else {
        return json!({ "ok": false, "result": "noProject" }).to_string();
    };
    let request = json!({
        "project": project,
        "tab": tab,
        "own": own,
        "force": ask.force,
        "whenDone": ask.when_done,
        "facts": facts(&project, store, &ptys),
    });
    match crate::tab_requests::ask(app, EVENT, request) {
        Some(mut answer) if answer.is_object() => {
            answer["project"] = json!(project);
            answer.to_string()
        }
        _ => "ERROR: lpm's window didn't answer; the tab may still be open".into(),
    }
}

/// The project to look in and the id or name to look for. A live tab's id says
/// where it is, so it needs no project unless one was asked for.
fn target(
    ask: &Ask,
    own: &str,
    current: impl Fn(&str) -> String,
    home: impl Fn(&str) -> Option<String>,
) -> Option<(String, String)> {
    let wanted = ask.tab.trim();
    let id = if wanted.is_empty() {
        own.to_string()
    } else {
        current(wanted)
    };
    match home(&id) {
        Some(project) if !ask.named || project == ask.project => Some((project, id)),
        _ if ask.project.is_empty() || (wanted.is_empty() && id.is_empty()) => None,
        _ => Some((
            ask.project.clone(),
            if wanted.is_empty() { id } else { wanted.to_string() },
        )),
    }
}

/// What the window can't see of a live terminal (request.ts's TabFacts).
#[derive(Serialize)]
struct Facts {
    #[serde(skip_serializing_if = "Option::is_none")]
    agent: Option<&'static str>,
    starting: bool,
    launching: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    busy: Option<bool>,
    reported: bool,
}

/// By terminal, for each of the project's.
fn facts(project: &str, store: &StatusStore, ptys: &PtyState) -> BTreeMap<String, Facts> {
    let reported: BTreeSet<String> = store
        .list(project)
        .into_iter()
        .chain(store.seen_list(project))
        .filter(|e| crate::status::is_agent_key(&e.key))
        .map(|e| e.pane_id)
        .collect();
    crate::updatebusy::front_jobs(ptys, Some(project))
        .into_iter()
        .map(|job| {
            let live = store.live_agent_entries_on(project, &job.pane);
            let asking = live.iter().any(|e| e.value == STATUS_WAITING);
            let facts = Facts {
                agent: (!live.is_empty()).then_some(if asking { "waiting" } else { "working" }),
                starting: live.is_empty() && starting(&job.pane),
                launching: launching(&job.pane),
                busy: job.busy,
                reported: reported.contains(&job.pane),
            };
            (job.pane, facts)
        })
        .collect()
}

struct Opened {
    id: String,
    at: Instant,
    /// It launched an agent that starts a turn by itself.
    starts_turn: bool,
}

static OPENED: Mutex<Vec<Opened>> = Mutex::new(Vec::new());

/// `lpm run` opened this tab.
pub fn opened(id: &str, starts_turn: bool) {
    let mut tabs = OPENED.lock().unwrap();
    tabs.retain(|t| t.at.elapsed() < STARTING_FOR);
    tabs.push(Opened {
        id: id.to_string(),
        at: Instant::now(),
        starts_turn,
    });
}

/// The agent in this tab has reported.
pub fn agent_reported(id: &str) {
    OPENED.lock().unwrap().retain(|t| t.id != id);
}

fn starting(id: &str) -> bool {
    was_opened(id, STARTING_FOR, |t| t.starts_turn)
}

fn launching(id: &str) -> bool {
    was_opened(id, LAUNCHING_FOR, |_| true)
}

fn was_opened(id: &str, within: Duration, pick: impl Fn(&Opened) -> bool) -> bool {
    OPENED
        .lock()
        .unwrap()
        .iter()
        .any(|t| t.id == id && t.at.elapsed() < within && pick(t))
}

/// Says on this computer whether a composer its window doesn't hold — a detached
/// window's, or another computer's — has text waiting to be sent to a terminal.
#[tauri::command]
pub fn terminal_unsent_text(app: AppHandle, id: String, from: String, unsent: bool) {
    let _ = app.emit(
        "terminal-unsent-text",
        json!({ "id": id, "from": from, "unsent": unsent }),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ask(tab: &str, project: &str, named: bool) -> Ask {
        Ask {
            tab: tab.into(),
            project: project.into(),
            named,
            ..Default::default()
        }
    }

    fn find(ask: &Ask, own: &str) -> Option<(String, String)> {
        target(
            ask,
            own,
            |id| if id == "api-1" { "api-9".into() } else { id.into() },
            |id| match id {
                "api-9" => Some("api".into()),
                "web-2" => Some("web".into()),
                _ => None,
            },
        )
    }

    fn at(project: &str, tab: &str) -> Option<(String, String)> {
        Some((project.into(), tab.into()))
    }

    #[test]
    fn a_live_tabs_id_says_which_project_it_is_in() {
        assert_eq!(find(&ask("web-2", "api", false), ""), at("web", "web-2"));
        assert_eq!(find(&ask(" web-2 ", "", false), ""), at("web", "web-2"));
    }

    #[test]
    fn an_id_from_before_the_tab_restarted_still_finds_it() {
        assert_eq!(find(&ask("api-1", "web", false), ""), at("api", "api-9"));
    }

    #[test]
    fn a_project_asked_for_is_the_only_one_searched() {
        assert_eq!(find(&ask("web-2", "api", true), ""), at("api", "web-2"));
        assert_eq!(find(&ask("web-2", "web", true), ""), at("web", "web-2"));
    }

    #[test]
    fn a_name_is_looked_for_in_the_project_the_command_runs_in() {
        assert_eq!(find(&ask("Docs", "api", false), ""), at("api", "Docs"));
        assert_eq!(find(&ask("Docs", "", false), ""), None);
    }

    #[test]
    fn no_name_means_the_tab_the_command_runs_in() {
        assert_eq!(find(&ask("", "api", false), "web-2"), at("web", "web-2"));
        assert_eq!(find(&ask("", "api", false), ""), None);
    }

    #[test]
    fn a_launched_agent_is_starting_until_it_reports() {
        opened("tc-1", true);
        opened("tc-2", true);
        assert!(starting("tc-1"));
        agent_reported("tc-1");
        assert!(!starting("tc-1"));
        assert!(starting("tc-2"));
        assert!(!starting("tc-3"));
    }

    #[test]
    fn a_tab_with_no_turn_coming_is_only_launching() {
        opened("tc-4", false);
        assert!(!starting("tc-4"));
        assert!(launching("tc-4"));
        assert!(!launching("tc-5"));
    }
}
