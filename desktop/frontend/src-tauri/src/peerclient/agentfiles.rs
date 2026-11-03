// This Mac's side of what its agents may copy on the machines it connects to:
// each machine's answer, kept from its `ready` and its later word, and the
// setting changed from here. The machine itself holds and enforces the setting
// (peer/agentfiles.rs); a paired Mac may already run anything there, so
// changing it from here widens nothing. Only this app's own screens reach it,
// never the `lpm` socket an agent talks to.
use super::{PeerClientHub, PeerConn};
use crate::agentfiles::{Access, Policy, Scope};
use serde_json::{json, Value};
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

const POLICY_TIMEOUT: Duration = Duration::from_secs(15);
const UNSUPPORTED: &str = "that computer needs a newer lpm for agents to copy files";

/// A machine this one connects to, as an agent's copy names it.
pub(crate) struct Computer {
    pub slug: String,
    pub name: String,
    pub connected: bool,
    pub supported: bool,
    pub policy: Policy,
}

pub(crate) fn computers(hub: &PeerClientHub) -> Vec<Computer> {
    let peers = hub.inner.config.lock().unwrap().peers.clone();
    let conns = hub.inner.conns.lock().unwrap();
    peers
        .into_iter()
        .filter(|p| p.enabled && !hub.is_joined(&p.slug))
        .map(|p| {
            let conn = conns.get(&p.slug);
            let connected = conn.is_some_and(|c| c.connected.load(Ordering::Relaxed));
            let supported =
                connected && conn.is_some_and(|c| c.supports_agent_files.load(Ordering::Relaxed));
            Computer {
                name: crate::remote_machines::display_name(&p),
                slug: p.slug,
                connected,
                supported,
                policy: conn.map_or_else(Policy::default, |c| *c.agent_policy.lock().unwrap()),
            }
        })
        .collect()
}

pub(super) fn note_policy(conn: &Arc<PeerConn>, app: Option<&AppHandle>, policy: &Value) {
    *conn.agent_policy.lock().unwrap() = serde_json::from_value(policy.clone()).unwrap_or_default();
    if let Some(app) = app {
        let _ = app.emit("peer-state-changed", ());
    }
}

/// Ask machine `slug` to let this Mac's agents copy `files` inside `scope` there.
#[tauri::command(async)]
pub fn peer_agent_files_set(
    app: AppHandle,
    hub: State<'_, PeerClientHub>,
    slug: String,
    files: Access,
    scope: Scope,
) -> Result<Value, String> {
    hub.require_feature(
        &slug,
        |c| c.supports_agent_files.load(Ordering::Relaxed),
        UNSUPPORTED,
    )?;
    let policy = Policy {
        access: files,
        scope,
    };
    let frame = json!({ "t": "agentPolicySet", "policy": policy });
    let reply = hub.peer_request(&slug, POLICY_TIMEOUT, frame)?;
    if let Some(conn) = hub.inner.conns.lock().unwrap().get(&slug).cloned() {
        note_policy(&conn, Some(&app), &reply);
    }
    Ok(reply)
}
