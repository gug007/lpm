//! Claude usage limits traded between connected computers. A login's limits
//! belong to the account, not the computer, but each computer only hears from
//! the sessions it runs, so the one nobody is working at keeps showing what it
//! saw last. Both ends of a peer link send each other their readings and fold
//! in what they get, through the same rules that settle two local sessions.
//!
//! Account ids are each computer's own, so a reading travels under the Claude
//! identity it was signed in as and lands on every login here signed in as the
//! same. One frame, `limits`, in both directions: the client sends one on
//! connecting and on every change after; the host answers the first with its
//! own and from then on sends that client its changes.
use crate::agent_limits::{AgentLimitsStore, LimitWindow, ProviderLimits};
use crate::claude_dirs::MAIN_LOGIN;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::mpsc::SyncSender;
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Listener, Manager};

/// This computer trades usage limits over a peer link.
pub const LIMITS_FEATURE: &str = "agentLimits";

const CLAUDE_KEY: &str = "claude:";

#[derive(Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct SharedWindow {
    used_percent: f64,
    resets_at: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    observed_at: Option<i64>,
}

#[derive(Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct SharedReading {
    identity: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    five_hour: Option<SharedWindow>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    weekly: Option<SharedWindow>,
    #[serde(default)]
    updated_at: i64,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    no_limits: bool,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    no_five_hour: bool,
}

/// Every login here that knows which Claude account it is, as (id, identity):
/// the registered accounts and the main login.
pub(crate) fn local_identities() -> Vec<(String, String)> {
    crate::config::registered_claude_account_ids()
        .into_iter()
        .chain(std::iter::once(MAIN_LOGIN.to_string()))
        .filter_map(|id| {
            let identity = crate::claude_pool_members::ident_of(&id).identity?;
            Some((id, identity))
        })
        .collect()
}

fn shared_window(w: LimitWindow) -> SharedWindow {
    SharedWindow {
        used_percent: w.used_percent,
        resets_at: w.resets_at,
        observed_at: w.observed_at,
    }
}

/// A window from another computer, unless it has already reset. Its clock can
/// run ahead of this one; an observation can't be later than now here, or it
/// would outrank this computer's own next one.
fn local_window(w: SharedWindow, now: i64) -> Option<LimitWindow> {
    (w.resets_at == 0 || w.resets_at > now).then(|| LimitWindow {
        used_percent: w.used_percent,
        resets_at: w.resets_at,
        observed_at: w.observed_at.map(|at| at.min(now)),
    })
}

/// This computer's Claude readings under their accounts' identities. A login
/// with no known identity stays here: nothing on the other side could match it.
fn outgoing(
    entries: HashMap<String, ProviderLimits>,
    local: &[(String, String)],
) -> Vec<SharedReading> {
    entries
        .into_iter()
        .filter_map(|(key, l)| {
            let id = key.strip_prefix(CLAUDE_KEY)?;
            let (_, identity) = local.iter().find(|(local_id, _)| local_id == id)?;
            Some(SharedReading {
                identity: identity.clone(),
                label: l.label,
                five_hour: l.five_hour.map(shared_window),
                weekly: l.weekly.map(shared_window),
                updated_at: l.updated_at,
                no_limits: l.no_limits,
                no_five_hour: l.no_five_hour,
            })
        })
        .collect()
}

/// Another computer's readings as store entries here, one for each login
/// signed in as the same account.
fn incoming(
    readings: Vec<SharedReading>,
    local: &[(String, String)],
    now: i64,
) -> Vec<(String, ProviderLimits)> {
    let mut out = Vec::new();
    for r in readings {
        let five_hour = r.five_hour.and_then(|w| local_window(w, now));
        let weekly = r.weekly.and_then(|w| local_window(w, now));
        if five_hour.is_none() && weekly.is_none() && !r.no_limits {
            continue;
        }
        for (id, _) in local.iter().filter(|(_, identity)| *identity == r.identity) {
            out.push((
                format!("{CLAUDE_KEY}{id}"),
                ProviderLimits {
                    provider: "claude".into(),
                    account_id: Some(id.clone()),
                    label: r.label.clone(),
                    five_hour: five_hour.clone(),
                    weekly: weekly.clone(),
                    updated_at: r.updated_at,
                    no_limits: r.no_limits,
                    no_five_hour: r.no_five_hour,
                    identity: Some(r.identity.clone()),
                },
            ));
        }
    }
    out
}

fn frame_of(readings: Vec<SharedReading>) -> String {
    json!({ "t": "limits", "claude": readings }).to_string()
}

/// This computer's readings, as the `limits` frame either end sends.
pub fn frame(app: &AppHandle) -> String {
    let store = app.state::<Arc<AgentLimitsStore>>();
    frame_of(outgoing(store.snapshot(), &local_identities()))
}

fn fold(app: &AppHandle, v: &Value) {
    let Some(readings) = v
        .get("claude")
        .cloned()
        .and_then(|c| serde_json::from_value::<Vec<SharedReading>>(c).ok())
        .filter(|r| !r.is_empty())
    else {
        return;
    };
    let readings = incoming(
        readings,
        &local_identities(),
        crate::agent_limits::now_secs(),
    );
    if !readings.is_empty() {
        crate::agent_limits::fold_shared(app, readings);
    }
}

/// The clients of this host that trade limits, by connection.
fn clients() -> &'static Mutex<HashMap<u64, SyncSender<String>>> {
    static CLIENTS: OnceLock<Mutex<HashMap<u64, SyncSender<String>>>> = OnceLock::new();
    CLIENTS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// A client's `limits`. The first one is also how it asks for this host's, so
/// it is answered with them and sent each change from then on.
pub fn from_client(app: &AppHandle, conn_id: u64, out: &SyncSender<String>, v: &Value) {
    fold(app, v);
    let first = clients()
        .lock()
        .unwrap()
        .insert(conn_id, out.clone())
        .is_none();
    if first {
        let _ = out.try_send(frame(app));
    }
}

/// A host's `limits`: its answer to ours, or a change there.
pub fn from_host(app: &AppHandle, v: &Value) {
    fold(app, v);
}

pub fn drop_conn(conn_id: u64) {
    clients().lock().unwrap().remove(&conn_id);
}

/// Send every change on, both to this host's clients and to the hosts this
/// computer is a client of. A change that came from one of them goes back to
/// it too, where it changes nothing and stops.
pub fn start(app: &AppHandle) {
    let handle = app.clone();
    app.listen(crate::agent_limits::CHANGED_EVENT, move |_| {
        let hub = handle.try_state::<crate::peerclient::PeerClientHub>();
        let has_clients = !clients().lock().unwrap().is_empty();
        if !has_clients && !hub.as_ref().is_some_and(|h| h.trades_limits()) {
            return;
        }
        let frame = frame(&handle);
        for out in clients().lock().unwrap().values() {
            let _ = out.try_send(frame.clone());
        }
        if let Some(hub) = hub {
            hub.send_limits(&frame);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn window(used_percent: f64, resets_at: i64, observed_at: Option<i64>) -> LimitWindow {
        LimitWindow {
            used_percent,
            resets_at,
            observed_at,
        }
    }

    fn local() -> Vec<(String, String)> {
        vec![
            ("default".into(), "acct-a:org".into()),
            ("work".into(), "acct-b:org".into()),
        ]
    }

    #[test]
    fn readings_travel_under_the_account_identity() {
        let mut entries = HashMap::new();
        entries.insert(
            "claude:work".to_string(),
            ProviderLimits {
                provider: "claude".into(),
                account_id: Some("work".into()),
                weekly: Some(window(62.0, 9_000, Some(50))),
                updated_at: 7,
                ..Default::default()
            },
        );
        entries.insert(
            "claude:gone".to_string(),
            ProviderLimits {
                provider: "claude".into(),
                weekly: Some(window(5.0, 9_000, None)),
                ..Default::default()
            },
        );
        entries.insert(
            "codex".to_string(),
            ProviderLimits {
                provider: "codex".into(),
                weekly: Some(window(5.0, 9_000, None)),
                ..Default::default()
            },
        );
        let out = outgoing(entries, &local());
        assert_eq!(
            out.len(),
            1,
            "only logins with a known identity, and no Codex"
        );
        assert_eq!(out[0].identity, "acct-b:org");
        assert_eq!(
            out[0].weekly,
            Some(SharedWindow {
                used_percent: 62.0,
                resets_at: 9_000,
                observed_at: Some(50),
            })
        );
        let frame: Value = serde_json::from_str(&frame_of(out)).unwrap();
        assert_eq!(frame["t"], "limits");
        assert_eq!(frame["claude"][0]["weekly"]["observedAt"], 50);
    }

    #[test]
    fn a_reading_lands_on_every_login_signed_in_as_that_account() {
        let reading = || SharedReading {
            identity: "acct-b:org".into(),
            label: Some("Opus".into()),
            five_hour: Some(SharedWindow {
                used_percent: 10.0,
                resets_at: 50,
                observed_at: None,
            }),
            weekly: Some(SharedWindow {
                used_percent: 62.0,
                resets_at: 9_000,
                observed_at: Some(500),
            }),
            updated_at: 7,
            no_limits: false,
            no_five_hour: false,
        };
        let mut here = local();
        here.push(("work-2".into(), "acct-b:org".into()));
        let got = incoming(vec![reading()], &here, 100);
        let keys: Vec<&str> = got.iter().map(|(k, _)| k.as_str()).collect();
        assert_eq!(keys, ["claude:work", "claude:work-2"]);
        let (_, l) = &got[0];
        assert_eq!(l.account_id.as_deref(), Some("work"));
        assert!(
            l.five_hour.is_none(),
            "the five-hour window already reset here"
        );
        let weekly = l.weekly.as_ref().unwrap();
        assert_eq!(weekly.used_percent, 62.0);
        assert_eq!(weekly.observed_at, Some(100), "not later than now here");

        let mut stranger = reading();
        stranger.identity = "someone-else:org".into();
        assert!(incoming(vec![stranger], &here, 100).is_empty());
    }

    #[test]
    fn a_reading_with_nothing_left_in_it_is_dropped() {
        let reading = SharedReading {
            identity: "acct-a:org".into(),
            label: None,
            five_hour: Some(SharedWindow {
                used_percent: 10.0,
                resets_at: 50,
                observed_at: None,
            }),
            weekly: None,
            updated_at: 0,
            no_limits: false,
            no_five_hour: false,
        };
        assert!(incoming(vec![reading], &local(), 100).is_empty());
    }

    #[test]
    fn a_plan_without_a_five_hour_window_says_so_across_the_link() {
        let mut entries = HashMap::new();
        entries.insert(
            "claude:work".to_string(),
            ProviderLimits {
                provider: "claude".into(),
                account_id: Some("work".into()),
                weekly: Some(window(62.0, 9_000, Some(50))),
                no_five_hour: true,
                ..Default::default()
            },
        );
        let out = outgoing(entries, &local());
        let frame: Value = serde_json::from_str(&frame_of(out)).unwrap();
        assert_eq!(frame["claude"][0]["noFiveHour"], true);

        let readings: Vec<SharedReading> = serde_json::from_value(frame["claude"].clone()).unwrap();
        let got = incoming(readings, &local(), 100);
        assert!(got[0].1.no_five_hour);
    }
}
