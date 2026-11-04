// This Mac's side of what its agents may copy, or run, on the machines it connects to:
// each machine's answer, kept from its `ready` and its later word, and the
// setting changed from here. The machine itself holds and enforces the setting
// (peer/agentfiles.rs); a paired Mac may already run anything there, so
// changing it from here widens nothing. Only this app's own screens reach it,
// never the `lpm` socket an agent talks to.
use super::{PeerClientHub, PeerConn};
use crate::agentfiles::{self, Access, Policy, Scope};
use serde_json::{json, Value};
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

const POLICY_TIMEOUT: Duration = Duration::from_secs(15);
const UNSUPPORTED: &str = "that computer needs a newer lpm for agents to copy files";

/// A machine this one connects to, as an agent's copy names it.
#[derive(Debug)]
pub(crate) struct Computer {
    pub slug: String,
    pub name: String,
    pub connected: bool,
    pub supported: bool,
    /// Its lpm runs this one's agents' commands (`lpm exec --on`).
    pub runs: bool,
    pub policy: Policy,
    /// Its home folder as it writes paths (`ready`'s `hostHome`); empty when unknown.
    pub home: String,
}

pub(crate) fn computers(hub: &PeerClientHub) -> Vec<Computer> {
    let peers = hub.inner.config.lock().unwrap().peers.clone();
    let conns = hub.inner.conns.lock().unwrap();
    peers
        .into_iter()
        .filter(|p| p.enabled && !hub.is_joined(&p.slug))
        .map(|p| {
            let conn = conns.get(&p.slug);
            let live = conn.filter(|c| c.connected.load(Ordering::Relaxed));
            Computer {
                name: crate::remote_machines::display_name(&p),
                slug: p.slug,
                connected: live.is_some(),
                supported: live.is_some_and(|c| c.supports_agent_files.load(Ordering::Relaxed)),
                runs: live.is_some_and(|c| c.supports_agent_exec.load(Ordering::Relaxed)),
                policy: conn.map_or_else(Policy::default, |c| *c.agent_policy.lock().unwrap()),
                home: conn
                    .map(|c| c.host_home.lock().unwrap().clone())
                    .unwrap_or_default(),
            }
        })
        .collect()
}

fn normalized(name: &str) -> String {
    name.chars()
        .filter(char::is_ascii_alphanumeric)
        .collect::<String>()
        .to_ascii_lowercase()
}

/// The computer `query` names: its whole name or slug, or a part of its name
/// only it has. Punctuation and case don't count, so a name with a curly
/// apostrophe can be typed.
fn find_computer(query: &str, computers: &[Computer]) -> Result<Option<usize>, String> {
    let want = normalized(query);
    if want.is_empty() {
        return Ok(None);
    }
    if let Some(i) = computers
        .iter()
        .position(|c| normalized(&c.name) == want || c.slug == query)
    {
        return Ok(Some(i));
    }
    let hits: Vec<usize> = computers
        .iter()
        .enumerate()
        .filter(|(_, c)| want.len() >= 3 && normalized(&c.name).contains(&want))
        .map(|(i, _)| i)
        .collect();
    match hits.as_slice() {
        [one] => Ok(Some(*one)),
        [] => Ok(None),
        _ => Err(format!(
            "\"{query}\" matches more than one computer; use more of its name"
        )),
    }
}

/// Take the computer `name` names out of `computers`.
pub(crate) fn take_computer(name: &str, computers: &mut Vec<Computer>) -> Result<Computer, String> {
    match find_computer(name, computers)? {
        Some(i) => Ok(computers.swap_remove(i)),
        None => Err(format!(
            "no computer called \"{name}\" is connected to this one. `lpm connections` lists them"
        )),
    }
}

/// Whether `prefix`, the part of `NAME:PATH` before the colon, names a
/// computer: one letter is a Windows drive, and a `/` or `\` makes it a path here.
pub(crate) fn names_computer(prefix: &str) -> bool {
    let drive = prefix.len() == 1 && prefix.chars().all(|c| c.is_ascii_alphabetic());
    !drive && !prefix.contains(['/', '\\'])
}

/// What an agent here names `c` by in `NAME:PATH` so `lpm exec --on` and
/// `lpm cp` reach it and no other: its name, or its slug when another of `all`
/// reads the same or the name can't stand before `:PATH`.
pub(crate) fn reach_name<'a>(c: &'a Computer, all: &[Computer]) -> &'a str {
    let name = c.name.trim();
    let mine = normalized(name);
    let shared = all
        .iter()
        .any(|o| o.slug != c.slug && (normalized(&o.name) == mine || o.slug == name));
    if mine.is_empty() || shared || name.contains(':') || !names_computer(name) {
        &c.slug
    } else {
        name
    }
}

pub(super) fn note_policy(conn: &Arc<PeerConn>, app: Option<&AppHandle>, policy: &Value) {
    *conn.agent_policy.lock().unwrap() = serde_json::from_value(policy.clone()).unwrap_or_default();
    if let Some(app) = app {
        let _ = app.emit("peer-state-changed", ());
    }
}

/// Ask machine `slug` to change what this Mac's agents may do there: copy
/// `files` inside `scope`, run commands. What is left out stays as it is.
#[tauri::command(async)]
pub fn peer_agent_files_set(
    app: AppHandle,
    hub: State<'_, PeerClientHub>,
    slug: String,
    files: Option<Access>,
    scope: Option<Scope>,
    run: Option<bool>,
) -> Result<Value, String> {
    hub.require_feature(
        &slug,
        |c| c.supports_agent_files.load(Ordering::Relaxed),
        UNSUPPORTED,
    )?;
    if run.is_some() {
        hub.require_feature(
            &slug,
            |c| c.supports_agent_exec.load(Ordering::Relaxed),
            "that computer needs a newer lpm for agents to run commands",
        )?;
    }
    let policy = agentfiles::changes(files, scope, run);
    let frame = json!({ "t": "agentPolicySet", "policy": policy });
    let reply = hub.peer_request(&slug, POLICY_TIMEOUT, frame)?;
    if let Some(conn) = hub.inner.conns.lock().unwrap().get(&slug).cloned() {
        note_policy(&conn, Some(&app), &reply);
    }
    Ok(reply)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn computer(slug: &str, name: &str) -> Computer {
        Computer {
            slug: slug.into(),
            name: name.into(),
            connected: true,
            supported: true,
            runs: true,
            policy: Default::default(),
            home: String::new(),
        }
    }

    #[test]
    fn a_computer_is_found_by_any_part_of_its_name_only_it_has() {
        let list = vec![
            computer("a1", "Gurgen’s MacBook Pro 2021"),
            computer("b2", "build-server"),
        ];
        assert_eq!(
            find_computer("gurgens macbook pro 2021", &list),
            Ok(Some(0))
        );
        assert_eq!(find_computer("2021", &list), Ok(Some(0)));
        assert_eq!(find_computer("b2", &list), Ok(Some(1)));
        assert_eq!(find_computer("server", &list), Ok(Some(1)));
        assert_eq!(find_computer("nas", &list), Ok(None));
        let twins = vec![computer("a", "mac mini 1"), computer("b", "mac mini 2")];
        assert!(find_computer("mini", &twins).is_err());
    }

    #[test]
    fn a_computer_is_reached_by_a_name_only_it_has() {
        let all = vec![
            computer("a1", "MacBook Pro"),
            computer("b2", "macbook-pro"),
            computer("c3", "Mac mini"),
            computer("d4", "box:2"),
            computer("e5", "E"),
            computer("f6", "build/box"),
            computer("g7", "日本"),
        ];
        let reach: Vec<&str> = all.iter().map(|c| reach_name(c, &all)).collect();
        assert_eq!(reach, ["a1", "b2", "Mac mini", "d4", "e5", "f6", "g7"]);
        for (i, name) in reach.iter().enumerate() {
            assert_eq!(find_computer(name, &all), Ok(Some(i)), "{name}");
        }
    }

    #[test]
    fn taking_a_computer_names_what_is_missing() {
        let mut list = vec![computer("a1", "mini")];
        let err = take_computer("studio", &mut list).unwrap_err();
        assert!(err.contains("no computer called \"studio\""), "{err}");
        assert_eq!(take_computer("min", &mut list).unwrap().slug, "a1");
        assert!(list.is_empty());
    }
}
