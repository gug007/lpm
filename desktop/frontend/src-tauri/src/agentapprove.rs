// A person's yes before an agent copies files to or runs a command on another
// computer (agentcp.rs, agentexec.rs). The agent waits here while lpm shows
// what it would do; "for this tab" is remembered against the tab's shell, so it
// ends with the tab and is never handed to a process outside it, and a copy's
// yes never lets the tab run commands.
use serde::Serialize;
use std::collections::HashMap;
use std::sync::mpsc::{sync_channel, SyncSender};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

pub(crate) const REQUEST_EVENT: &str = "agent-files-request";
const WAIT: Duration = Duration::from_secs(5 * 60);

/// Which yes a tab holds: a copy's never covers commands.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub(crate) enum Kind {
    Copy,
    Run,
}

/// What a request would do on the other computer.
#[derive(Serialize, Clone)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub(crate) enum What {
    Copy {
        /// Copying from the other computer to this one.
        pulling: bool,
        from: String,
        to: String,
        files: u64,
        bytes: u64,
        /// Files among them that always need a yes, as the other computer names them.
        sensitive: Vec<String>,
        replaces: bool,
    },
    /// A command, and the folder there it starts in (`Studio:~/app`).
    Run { command: String, cwd: String },
}

impl What {
    /// The notice shown when nobody is looking at lpm.
    fn notice(&self, machine: &str) -> (&'static str, String) {
        match self {
            What::Copy { pulling, files, .. } => {
                let way = if *pulling { "from" } else { "to" };
                (
                    "An agent wants to copy files",
                    format!(
                        "{} {way} {machine}. Open lpm to allow or deny it.",
                        count(*files)
                    ),
                )
            }
            What::Run { command, .. } => (
                "An agent wants to run a command",
                format!("On {machine}: {command}. Open lpm to allow or deny it."),
            ),
        }
    }

    /// (what it is, what didn't happen) for a sentence about it.
    fn words(&self) -> (&'static str, &'static str) {
        match self {
            What::Copy { .. } => ("the copy", "nothing was copied"),
            What::Run { .. } => ("the command", "nothing ran"),
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Request {
    pub id: String,
    pub machine: String,
    #[serde(flatten)]
    pub what: What,
    /// Who asks: the agent and project of the tab, when lpm could tell.
    pub agent: String,
    pub project: String,
    /// Whether "for this tab" may be offered: the tab is known and nothing in
    /// the request always asks.
    pub tab_grant: bool,
}

impl Request {
    /// `what` on `machine`, asked by `who` from `project`; "for this tab" is
    /// offered when lpm knows the tab and `grantable`.
    pub(crate) fn new(
        who: &Caller,
        project: &str,
        machine: &str,
        what: What,
        grantable: bool,
    ) -> Self {
        let known = who.tab.is_some();
        Request {
            id: uuid::Uuid::new_v4().to_string(),
            machine: machine.to_string(),
            what,
            agent: who.agent.clone(),
            project: if known {
                project.to_string()
            } else {
                String::new()
            },
            tab_grant: known && grantable,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Decision {
    Deny,
    Once,
    Tab,
}

struct Pending {
    req: Request,
    answer: SyncSender<Decision>,
}

fn pending() -> &'static Mutex<Vec<Pending>> {
    static PENDING: OnceLock<Mutex<Vec<Pending>>> = OnceLock::new();
    PENDING.get_or_init(|| Mutex::new(Vec::new()))
}

type GrantKey = (String, String, Kind);

/// (tab, machine, kind) → the tab's shell when it was allowed.
fn grants() -> &'static Mutex<HashMap<GrantKey, i32>> {
    static GRANTS: OnceLock<Mutex<HashMap<GrantKey, i32>>> = OnceLock::new();
    GRANTS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub(crate) fn granted(kind: Kind, pane: &str, slug: &str, shell: i32) -> bool {
    grants()
        .lock()
        .unwrap()
        .get(&(pane.to_string(), slug.to_string(), kind))
        == Some(&shell)
}

pub(crate) fn grant(kind: Kind, pane: &str, slug: &str, shell: i32) {
    grants()
        .lock()
        .unwrap()
        .insert((pane.to_string(), slug.to_string(), kind), shell);
}

/// Who asks, when lpm can tell: the tab the caller runs in, its shell, and the
/// agent above it.
pub(crate) struct Caller {
    pub tab: Option<(String, i32)>,
    pub agent: String,
}

impl Caller {
    pub(crate) fn granted(&self, kind: Kind, slug: &str) -> bool {
        self.tab
            .as_ref()
            .is_some_and(|(pane, shell)| granted(kind, pane, slug, *shell))
    }

    /// Note `decision` for the rest of the tab's life when it was "for this tab".
    pub(crate) fn keep(&self, decision: Decision, kind: Kind, slug: &str) {
        if let (Decision::Tab, Some((pane, shell))) = (decision, &self.tab) {
            grant(kind, pane, slug, *shell);
        }
    }
}

/// The caller of a socket request whose process is `peer`, if it runs inside
/// the lpm tab `pane` it claims.
pub(crate) fn caller(app: &AppHandle, peer: Option<u32>, pane: &str) -> Caller {
    let unknown = Caller {
        tab: None,
        agent: String::new(),
    };
    let (Some(pid), false) = (peer, pane.is_empty()) else {
        return unknown;
    };
    let state = app.state::<crate::pty::PtyState>();
    let Some(shell) = crate::pty::local_session_pid(&state, pane) else {
        return unknown;
    };
    match crate::agentnest::pane_caller(pid as i32, shell) {
        Some(agent) => Caller {
            tab: Some((pane.to_string(), shell)),
            agent: agent.map(|a| capitalized(&a)).unwrap_or_default(),
        },
        None => unknown,
    }
}

fn capitalized(s: &str) -> String {
    let mut chars = s.chars();
    chars
        .next()
        .map(|c| c.to_uppercase().collect::<String>() + chars.as_str())
        .unwrap_or_default()
}

/// Wait for the answer to `req`.
pub(crate) fn ask(app: &AppHandle, req: Request) -> Result<Decision, String> {
    if crate::sys::headless() {
        return Err(format!(
            "nobody is at this computer to allow {}. Run it on a computer with lpm open",
            req.what.words().0
        ));
    }
    let (tx, rx) = sync_channel(1);
    let id = req.id.clone();
    pending().lock().unwrap().push(Pending {
        req: req.clone(),
        answer: tx,
    });
    let _ = app.emit(REQUEST_EVENT, &req);
    if !crate::statusnotify::window_attended(app) {
        let (title, body) = req.what.notice(&req.machine);
        crate::statusnotify::notify(app, title, &body);
    }
    let answer = rx.recv_timeout(WAIT);
    pending().lock().unwrap().retain(|p| p.req.id != id);
    let _ = app.emit(REQUEST_EVENT, ());
    answer.map_err(|_| {
        format!(
            "nobody answered in lpm within 5 minutes, so {}",
            req.what.words().1
        )
    })
}

pub(crate) fn count(files: u64) -> String {
    if files == 1 {
        "1 file".into()
    } else {
        format!("{files} files")
    }
}

/// The copies waiting for an answer, oldest first.
#[tauri::command]
pub fn peer_agent_requests() -> Vec<Request> {
    pending()
        .lock()
        .unwrap()
        .iter()
        .map(|p| p.req.clone())
        .collect()
}

/// Answer request `id`: "deny", "once" or "tab".
#[tauri::command]
pub fn peer_agent_answer(app: AppHandle, id: String, decision: String) -> Result<(), String> {
    let decision = match decision.as_str() {
        "once" => Decision::Once,
        "tab" => Decision::Tab,
        _ => Decision::Deny,
    };
    let list = pending().lock().unwrap();
    let Some(p) = list.iter().find(|p| p.req.id == id) else {
        return Err("that request is gone".into());
    };
    let decision = if decision == Decision::Tab && !p.req.tab_grant {
        Decision::Once
    } else {
        decision
    };
    let _ = p.answer.try_send(decision);
    drop(list);
    let _ = app.emit(REQUEST_EVENT, ());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_tab_grant_holds_only_for_the_same_shell() {
        grant(Kind::Copy, "tab-1", "mac-a", 100);
        assert!(granted(Kind::Copy, "tab-1", "mac-a", 100));
        assert!(
            !granted(Kind::Copy, "tab-1", "mac-a", 101),
            "the tab was reopened"
        );
        assert!(
            !granted(Kind::Copy, "tab-1", "mac-b", 100),
            "another computer"
        );
        assert!(!granted(Kind::Copy, "tab-2", "mac-a", 100), "another tab");
    }

    #[test]
    fn a_tab_allowed_to_copy_still_asks_before_it_runs_a_command() {
        grant(Kind::Copy, "tab-3", "mac-a", 7);
        assert!(!granted(Kind::Run, "tab-3", "mac-a", 7));
        grant(Kind::Run, "tab-3", "mac-a", 7);
        assert!(granted(Kind::Run, "tab-3", "mac-a", 7));
    }

    #[test]
    fn a_request_says_its_kind_beside_its_own_fields() {
        let who = Caller {
            tab: Some(("tab-9".into(), 9)),
            agent: "Claude".into(),
        };
        let run = What::Run {
            command: "ls".into(),
            cwd: "Studio:~".into(),
        };
        let v = serde_json::to_value(Request::new(&who, "app", "Studio", run, true)).unwrap();
        assert_eq!(v["kind"], "run");
        assert_eq!(v["command"], "ls");
        assert_eq!(v["tabGrant"], true);
        assert!(v.get("files").is_none());
        let outside = Caller {
            tab: None,
            agent: String::new(),
        };
        let copy = What::Copy {
            pulling: true,
            from: "a".into(),
            to: "b".into(),
            files: 1,
            bytes: 2,
            sensitive: Vec::new(),
            replaces: false,
        };
        let v = serde_json::to_value(Request::new(&outside, "app", "Studio", copy, true)).unwrap();
        assert_eq!(
            (v["kind"].as_str(), v["project"].as_str()),
            (Some("copy"), Some(""))
        );
        assert_eq!(v["tabGrant"], false);
    }

    #[test]
    fn the_notice_names_the_command_and_where_it_runs() {
        let run = What::Run {
            command: "npm test".into(),
            cwd: "Studio:~".into(),
        };
        let (title, body) = run.notice("Studio");
        assert_eq!(title, "An agent wants to run a command");
        assert_eq!(body, "On Studio: npm test. Open lpm to allow or deny it.");
    }
}
