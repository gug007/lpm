// Keeps Linux hosts on the release this app runs.
//
// A host never updates itself (updates.rs refuses there), so once this app moves
// to a new release every host it manages is left a version behind until someone
// opens Settings → Connections and presses Update. Here that happens on its own:
// when a host reachable over SSH reports an older lpm than this app, the same
// installer the row's Update button runs is run for it.
//
// Updating restarts lpm on the host, which ends every terminal there. So a host
// whose agents are mid-turn is left alone and asked again later; services and
// scheduled jobs outlive the restart and don't hold it back.
use crate::peer::PeerEntry;
use crate::peerclient::PeerClientHub;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender};
use std::sync::{LazyLock, Mutex, OnceLock};
use std::time::{Duration, Instant};

/// How soon to look again at a host whose agents were working.
const BUSY_RECHECK: Duration = Duration::from_secs(120);
/// A failed install is retried, but not soon: the usual causes (the release's
/// Linux build still uploading, the box unreachable) don't clear in seconds,
/// and every attempt is an SSH login plus a download.
const FAILURE_BACKOFF: Duration = Duration::from_secs(30 * 60);
/// After this many failures for one release the row's error stands until
/// someone runs the update by hand.
const MAX_FAILURES: u32 = 3;
const STATUS_TIMEOUT: Duration = Duration::from_secs(15);
const SETTING: &str = "autoUpdateHosts";

#[derive(Default)]
struct Track {
    updating: bool,
    error: String,
    failures: u32,
    retry_at: Option<Instant>,
    /// The app version an update already succeeded for. One run per release:
    /// a host the installer can't bring up to it would otherwise restart on
    /// every reconnect.
    done_for: String,
}

static TRACKS: LazyLock<Mutex<HashMap<String, Track>>> = LazyLock::new(Mutex::default);
static WAKE: OnceLock<Sender<()>> = OnceLock::new();

pub fn start(hub: PeerClientHub) {
    if crate::sys::headless() || release(&crate::updates::current_version()).is_none() {
        return;
    }
    let (tx, rx) = channel();
    if WAKE.set(tx).is_err() {
        return;
    }
    std::thread::spawn(move || run(hub, rx));
}

/// Look at every host again: one just connected (its version is fresh), an
/// update finished, or the setting may have changed.
pub fn nudge() {
    if let Some(tx) = WAKE.get() {
        let _ = tx.send(());
    }
}

/// What a host's row shows about updates this module is running or ran.
pub(crate) fn row_state(slug: &str) -> (bool, String) {
    TRACKS
        .lock()
        .unwrap()
        .get(slug)
        .map(|t| (t.updating, t.error.clone()))
        .unwrap_or_default()
}

/// Run an install or removal on a host, refusing while another is in flight
/// there — two installers racing over the same /opt/lpm would leave neither
/// result standing. A manual run that works also clears what an automatic one
/// left behind.
pub(crate) fn exclusive(
    hub: &PeerClientHub,
    slug: &str,
    work: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    claim(slug).ok_or("lpm is already updating on this host — try again when it finishes")?;
    crate::peerclient::emit_state_changed(hub);
    let result = work();
    finish(slug, |t| {
        if result.is_ok() {
            *t = Track {
                done_for: crate::updates::current_version(),
                ..Track::default()
            };
        }
    });
    crate::peerclient::emit_state_changed(hub);
    result
}

fn claim(slug: &str) -> Option<()> {
    let mut tracks = TRACKS.lock().unwrap();
    let track = tracks.entry(slug.to_string()).or_default();
    if track.updating {
        return None;
    }
    track.updating = true;
    Some(())
}

fn finish(slug: &str, apply: impl FnOnce(&mut Track)) {
    let mut tracks = TRACKS.lock().unwrap();
    let track = tracks.entry(slug.to_string()).or_default();
    track.updating = false;
    apply(track);
}

fn run(hub: PeerClientHub, rx: Receiver<()>) {
    let mut recheck: Option<Duration> = None;
    loop {
        let woke = match recheck {
            Some(after) => match rx.recv_timeout(after) {
                Ok(()) | Err(RecvTimeoutError::Timeout) => true,
                Err(RecvTimeoutError::Disconnected) => false,
            },
            None => rx.recv().is_ok(),
        };
        if !woke {
            return;
        }
        while rx.try_recv().is_ok() {}
        recheck = sweep(&hub);
    }
}

/// Start an update on every host that is behind and idle. Returns how soon to
/// look again when a host was left waiting, or None to sleep until nudged.
fn sweep(hub: &PeerClientHub) -> Option<Duration> {
    if !enabled() {
        return None;
    }
    let app_version = crate::updates::current_version();
    let app = release(&app_version)?;
    let now = Instant::now();
    let mut recheck: Option<Duration> = None;
    let mut wait = |d: Duration| recheck = Some(recheck.map_or(d, |r| r.min(d)));
    for machine in hub.phone_machines() {
        let entry = machine.entry;
        if !machine.connected || !eligible(&entry) {
            continue;
        }
        if release(&entry.version).is_none_or(|host| host >= app) {
            forget(&entry.slug);
            continue;
        }
        let step = next_step(TRACKS.lock().unwrap().get(&entry.slug), &app_version, now);
        match step {
            Step::Skip => {}
            Step::WaitFor(d) => wait(d),
            Step::Try if agents_working(hub, &entry.slug) => wait(BUSY_RECHECK),
            Step::Try => spawn_update(hub, entry, app_version.clone()),
        }
    }
    recheck
}

/// Drop what an up-to-date host's row says about past updates — unless one is
/// running there right now, as a Reinstall on a current host is.
fn forget(slug: &str) {
    let mut tracks = TRACKS.lock().unwrap();
    if tracks.get(slug).is_some_and(|t| !t.updating) {
        tracks.remove(slug);
    }
}

fn spawn_update(hub: &PeerClientHub, entry: PeerEntry, app_version: String) {
    if claim(&entry.slug).is_none() {
        return;
    }
    crate::peerclient::emit_state_changed(hub);
    let hub = hub.clone();
    std::thread::spawn(move || {
        let result = crate::peerssh::update(&entry.ssh);
        finish(&entry.slug, |t| {
            record(t, result, &app_version, Instant::now())
        });
        crate::peerclient::emit_state_changed(&hub);
        nudge();
    });
}

fn record(track: &mut Track, result: Result<(), String>, app_version: &str, now: Instant) {
    match result {
        Ok(()) => {
            *track = Track {
                done_for: app_version.to_string(),
                ..Track::default()
            };
        }
        Err(err) => {
            track.failures += 1;
            track.error = err;
            track.retry_at = Some(now + FAILURE_BACKOFF);
        }
    }
}

#[derive(Debug, PartialEq)]
enum Step {
    Skip,
    WaitFor(Duration),
    Try,
}

fn next_step(track: Option<&Track>, app_version: &str, now: Instant) -> Step {
    let Some(track) = track else {
        return Step::Try;
    };
    if track.updating || track.done_for == app_version || track.failures >= MAX_FAILURES {
        return Step::Skip;
    }
    match track.retry_at {
        Some(at) if at > now => Step::WaitFor(at - now),
        _ => Step::Try,
    }
}

fn enabled() -> bool {
    crate::config::load_settings()
        .get(SETTING)
        .and_then(Value::as_bool)
        .unwrap_or(true)
}

/// A Linux host this app installed and can reach again. A Linux desktop got its
/// lpm from a package, and a peer we only dial gives us no way to run anything.
fn eligible(entry: &PeerEntry) -> bool {
    entry.platform == "linux"
        && crate::peerclient::manages_host_install(entry)
        && entry.ssh.is_set()
}

/// Whether an agent on the host is mid-turn. A host that doesn't answer counts
/// as busy: restarting it on a guess is the one outcome that can't be undone.
fn agents_working(hub: &PeerClientHub, slug: &str) -> bool {
    match hub.invoke_within(slug, "list_projects", json!({}), STATUS_TIMEOUT) {
        Ok(projects) => any_agent_working(&projects),
        Err(_) => true,
    }
}

fn any_agent_working(projects: &Value) -> bool {
    let Some(projects) = projects.as_array() else {
        return true;
    };
    projects
        .iter()
        .filter_map(|p| p.get("statusEntries").and_then(Value::as_array))
        .flatten()
        .filter_map(|e| e.get("value").and_then(Value::as_str))
        .any(|v| v == crate::status::STATUS_RUNNING || v == crate::status::STATUS_WAITING)
}

/// A release version as three numbers, or None for a dev build or anything a
/// release wouldn't report — never guess an order there and restart a server
/// over it.
fn release(version: &str) -> Option<[u64; 3]> {
    let v = version.trim();
    let mut parts = v.strip_prefix('v').unwrap_or(v).splitn(3, '.');
    let mut out = [0u64; 3];
    for slot in &mut out {
        let digits = parts.next()?.split(|c: char| !c.is_ascii_digit()).next()?;
        *slot = digits.parse().ok()?;
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn release_versions_parse_and_dev_builds_do_not() {
        assert_eq!(release("0.6.11"), Some([0, 6, 11]));
        assert_eq!(release("v1.2.3"), Some([1, 2, 3]));
        assert_eq!(release("1.2.3-beta"), Some([1, 2, 3]));
        assert_eq!(release("dev"), None);
        assert_eq!(release(""), None);
        assert_eq!(release("1.2"), None);
        assert!(release("0.6.9") < release("0.6.10"));
    }

    #[test]
    fn only_running_or_waiting_agents_hold_an_update() {
        let host = |values: &[&str]| {
            let entries: Vec<Value> = values.iter().map(|v| json!({ "value": v })).collect();
            json!([{ "name": "api", "statusEntries": [] }, { "name": "web", "statusEntries": entries }])
        };
        assert!(!any_agent_working(&host(&[])));
        assert!(!any_agent_working(&host(&["Done", "Error"])));
        assert!(any_agent_working(&host(&["Done", "Running"])));
        assert!(any_agent_working(&host(&["Waiting"])));
        assert!(any_agent_working(&json!({ "error": "unexpected" })));
    }

    #[test]
    fn only_ssh_managed_linux_hosts_are_eligible() {
        let mut entry = PeerEntry {
            platform: "linux".into(),
            ..PeerEntry::default()
        };
        assert!(!eligible(&entry));
        entry.ssh.host = "box.example".into();
        assert!(eligible(&entry));
        entry.headless = Some(false);
        assert!(!eligible(&entry));
        entry.headless = None;
        entry.platform = "macos".into();
        assert!(!eligible(&entry));
    }

    #[test]
    fn a_failure_backs_off_then_gives_up_for_that_release() {
        let now = Instant::now();
        let mut track = Track::default();
        assert_eq!(next_step(None, "1.0.0", now), Step::Try);

        record(&mut track, Err("offline".into()), "1.0.0", now);
        assert_eq!(track.error, "offline");
        assert_eq!(
            next_step(Some(&track), "1.0.0", now),
            Step::WaitFor(FAILURE_BACKOFF)
        );
        assert_eq!(
            next_step(Some(&track), "1.0.0", now + FAILURE_BACKOFF),
            Step::Try
        );

        record(&mut track, Err("offline".into()), "1.0.0", now);
        record(&mut track, Err("offline".into()), "1.0.0", now);
        assert_eq!(
            next_step(Some(&track), "1.0.0", now + FAILURE_BACKOFF),
            Step::Skip
        );
    }

    #[test]
    fn a_success_runs_once_per_release_and_clears_the_error() {
        let now = Instant::now();
        let mut track = Track::default();
        record(&mut track, Err("offline".into()), "1.0.0", now);
        record(&mut track, Ok(()), "1.0.0", now);
        assert!(track.error.is_empty());
        assert_eq!(next_step(Some(&track), "1.0.0", now), Step::Skip);
        assert_eq!(next_step(Some(&track), "1.1.0", now), Step::Try);
    }

    #[test]
    fn one_run_at_a_time_per_host() {
        let slug = "test-exclusive";
        assert!(claim(slug).is_some());
        assert!(claim(slug).is_none());
        assert_eq!(
            next_step(TRACKS.lock().unwrap().get(slug), "1.0.0", Instant::now()),
            Step::Skip
        );
        forget(slug);
        assert!(claim(slug).is_none());
        finish(slug, |_| {});
        assert!(claim(slug).is_some());
        finish(slug, |_| {});
        forget(slug);
        assert!(TRACKS.lock().unwrap().get(slug).is_none());
    }
}
