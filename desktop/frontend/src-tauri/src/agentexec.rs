// `lpm exec --on`: an agent runs a command on a computer this one connects to.
//
// That computer decides whether this one's agents may run anything there and
// holds every command to it (peer/agentexec.rs). This side decides who asks,
// as for a copy (agentcp.rs): the calling process must run inside the lpm tab
// it claims, and a person allows the command in lpm first — once, or for the
// rest of that tab's life. What the command prints comes back as it prints it,
// and when `lpm exec` goes away the command there is stopped.
use crate::agentapprove::{self, Caller, Decision, Kind, Request, What};
use crate::peerclient::{take_computer, Computer, PeerClientHub};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::Write;
use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Manager};

/// Advertised in `ready`: this host runs the agentExec frames (peer/agentexec.rs).
pub(crate) const FEATURE: &str = "agentExec";

/// How often `lpm exec` hears from the app while the command is quiet, which is
/// also how soon a gone `lpm exec` is noticed.
const TICK: Duration = Duration::from_secs(2);
/// Past this a command is given up on and stopped.
const LONGEST: Duration = Duration::from_secs(24 * 60 * 60);

/// What `lpm exec` sends: the computer (and folder) as typed, the command line,
/// and the tab it says it runs in.
#[derive(Default, Deserialize)]
#[serde(default)]
struct Ask {
    on: String,
    command: String,
    pane: String,
    project: String,
}

enum Event {
    Out(&'static str, Vec<u8>),
    Done(Result<Value, String>),
}

fn running() -> &'static Mutex<HashMap<String, Sender<Event>>> {
    static RUNNING: OnceLock<Mutex<HashMap<String, Sender<Event>>>> = OnceLock::new();
    RUNNING.get_or_init(|| Mutex::new(HashMap::new()))
}

/// An `agentExecOut` frame from the computer running the command, handed to the
/// `lpm exec` waiting on it.
pub(crate) fn route_output(v: &Value) {
    let id = v["id"].as_str().unwrap_or_default();
    let Ok(bytes) = B64.decode(v["d"].as_str().unwrap_or_default()) else {
        return;
    };
    let stream = if v["s"].as_str() == Some("e") {
        "err"
    } else {
        "out"
    };
    if let Some(tx) = running().lock().unwrap().get(id) {
        let _ = tx.send(Event::Out(stream, bytes));
    }
}

/// `NAME[:PATH]`: the computer, and the folder there the command starts in
/// (its home folder when none is named).
fn split_on(on: &str) -> (&str, &str) {
    match on.split_once(':') {
        Some((name, path)) => (name.trim(), path.trim()),
        None => (on.trim(), ""),
    }
}

fn target(on: &str, computers: Vec<Computer>) -> Result<(Computer, String), String> {
    let (name, path) = split_on(on);
    if name.is_empty() {
        return Err("say which computer to run it on: --on NAME".into());
    }
    let mut computers = computers;
    let computer = take_computer(name, &mut computers)?;
    if !computer.connected {
        return Err(format!("{} isn't connected right now", computer.name));
    }
    if !computer.runs {
        return Err(format!(
            "{} needs a newer lpm for agents to run commands there",
            computer.name
        ));
    }
    if !computer.policy.run {
        return Err(format!(
            "agents here can't run commands on {} yet. In lpm, open Settings → Connections → {} \
             and turn on letting this computer's agents run commands there",
            computer.name, computer.name
        ));
    }
    let cwd = if path.is_empty() { "~" } else { path }.to_string();
    Ok((computer, cwd))
}

/// A person's yes, unless the tab was already allowed to run commands there.
fn approve(
    app: &AppHandle,
    w: &mut impl Write,
    computer: &Computer,
    ask: &Ask,
    cwd: &str,
    who: &Caller,
) -> Result<(), String> {
    if who.granted(Kind::Run, &computer.slug) {
        return Ok(());
    }
    let run = What::Run {
        command: ask.command.clone(),
        cwd: format!("{}:{cwd}", computer.name),
    };
    let req = Request::new(who, &ask.project, &computer.name, run, true);
    let _ = writeln!(w, "PROGRESS waiting");
    let decision = agentapprove::ask(app, req)?;
    if decision == Decision::Deny {
        return Err("the command was denied in lpm".into());
    }
    who.keep(decision, Kind::Run, &computer.slug);
    Ok(())
}

/// Run the command there, passing on what it prints: `PROGRESS out|err <hex>`.
/// Ends the command there when `lpm exec` stops listening.
fn run_there(
    app: &AppHandle,
    w: &mut impl Write,
    slug: &str,
    command: &str,
    cwd: &str,
) -> Result<Value, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = channel();
    running().lock().unwrap().insert(id.clone(), tx.clone());
    let frame = json!({ "t": "agentExec", "id": id, "command": command, "cwd": cwd });
    let (app2, slug2) = (app.clone(), slug.to_string());
    std::thread::spawn(move || {
        let hub = app2.state::<PeerClientHub>();
        let _ = tx.send(Event::Done(hub.peer_request(&slug2, LONGEST, frame)));
    });
    let result = loop {
        let sent = match rx.recv_timeout(TICK) {
            Ok(Event::Out(stream, bytes)) => {
                writeln!(w, "PROGRESS {stream} {}", hex::encode(&bytes))
            }
            Ok(Event::Done(result)) => break result,
            Err(RecvTimeoutError::Timeout) => writeln!(w, "PROGRESS tick"),
            Err(RecvTimeoutError::Disconnected) => break Err("the command was lost".into()),
        };
        if sent.and_then(|_| w.flush()).is_err() {
            let stop = json!({ "t": "agentExecKill", "id": id }).to_string();
            let _ = app.state::<PeerClientHub>().send_waiting(slug, stop);
            break Err("lpm exec stopped, so the command was stopped too".into());
        }
    };
    running().lock().unwrap().remove(&id);
    result
}

/// `agent_exec --request-hex=<JSON>`: `PROGRESS waiting` while lpm asks, then
/// `PROGRESS out|err <hex>` as the command prints and `PROGRESS tick` while it
/// is quiet, then one JSON line with its exit code.
pub fn cmd_agent_exec(
    args: &[String],
    app: &AppHandle,
    peer: Option<u32>,
    w: &mut impl Write,
) -> std::io::Result<()> {
    let reply = run(args, app, peer, w).unwrap_or_else(|e| json!({ "ok": false, "error": e }));
    writeln!(w, "{reply}")
}

fn run(
    args: &[String],
    app: &AppHandle,
    peer: Option<u32>,
    w: &mut impl Write,
) -> Result<Value, String> {
    let (_, options) = crate::socketsrv::parse_options(args);
    let ask: Ask = options
        .get("request")
        .and_then(|r| serde_json::from_str(r).ok())
        .ok_or("usage: agent_exec --request-hex=<JSON>")?;
    if ask.command.trim().is_empty() {
        return Err("say what to run after --".into());
    }
    let computers = crate::peerclient::computers(app.state::<PeerClientHub>().inner());
    let (computer, cwd) = target(&ask.on, computers)?;
    let who = agentapprove::caller(app, peer, &ask.pane);
    approve(app, w, &computer, &ask, &cwd, &who)?;
    let result = run_there(app, w, &computer.slug, &ask.command, &cwd);
    let (code, error) = match &result {
        Ok(v) => (v["code"].as_i64(), None),
        Err(e) => (None, Some(e.clone())),
    };
    crate::agentfiles::log(json!({
        "side": "asked", "op": "run", "machine": computer.name, "command": ask.command,
        "cwd": cwd, "code": code, "agent": who.agent, "project": ask.project, "error": error,
    }));
    let done = result?;
    Ok(json!({
        "ok": true, "machine": computer.name, "cwd": done["cwd"], "code": done["code"],
        "signal": done["signal"],
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agentfiles::Policy;

    fn computer(name: &str, runs: bool, run: bool) -> Computer {
        Computer {
            slug: format!("{name}-slug"),
            name: name.into(),
            connected: true,
            supported: true,
            runs,
            policy: Policy {
                run,
                ..Default::default()
            },
        }
    }

    #[test]
    fn the_folder_rides_after_the_computers_name() {
        assert_eq!(split_on("mini"), ("mini", ""));
        assert_eq!(split_on("mini:~/Projects/app"), ("mini", "~/Projects/app"));
        assert_eq!(split_on("pc:C:\\Users\\me"), ("pc", "C:\\Users\\me"));
    }

    #[test]
    fn a_command_starts_in_the_home_folder_unless_one_is_named() {
        let (c, cwd) = target("studio", vec![computer("Studio", true, true)]).unwrap();
        assert_eq!((c.name.as_str(), cwd.as_str()), ("Studio", "~"));
        let (_, cwd) = target("stu:/srv/app", vec![computer("Studio", true, true)]).unwrap();
        assert_eq!(cwd, "/srv/app");
    }

    #[test]
    fn a_computer_that_allows_no_commands_says_where_to_allow_them() {
        let err = target("studio", vec![computer("Studio", true, false)]).unwrap_err();
        assert!(err.contains("Settings → Connections → Studio"), "{err}");
        let err = target("studio", vec![computer("Studio", false, true)]).unwrap_err();
        assert!(err.contains("newer lpm"), "{err}");
        assert!(target("nas", vec![computer("Studio", true, true)]).is_err());
        assert!(target(":~/x", vec![computer("Studio", true, true)]).is_err());
    }

    #[test]
    fn output_reaches_the_waiting_command_only() {
        let (tx, rx) = channel();
        running().lock().unwrap().insert("x1".into(), tx);
        route_output(&json!({ "id": "x1", "s": "e", "d": B64.encode(b"boom\n") }));
        route_output(&json!({ "id": "other", "s": "o", "d": B64.encode(b"no") }));
        running().lock().unwrap().remove("x1");
        match rx.try_recv() {
            Ok(Event::Out(stream, bytes)) => {
                assert_eq!((stream, bytes), ("err", b"boom\n".to_vec()))
            }
            _ => panic!("expected the output"),
        }
        assert!(rx.try_recv().is_err());
    }
}
