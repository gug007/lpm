//! Every paired computer's week added to this one's, and the reads kept.
use super::{local_recap, merge, RecapPeriod, WeeklyRecap, KEEP_FOR, RECAP_CMD};
use crate::peerclient::{PeerClientHub, PhoneMachine};
use crate::remote_machines::display_name;
use serde_json::json;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

/// A read, and the paired computers that were offline for it.
pub(super) struct Read {
    at: Instant,
    pub(super) recap: WeeklyRecap,
    offline: Vec<String>,
}

impl Read {
    /// A computer that was offline for this read is online now.
    pub(super) fn stale(&self, peers: &[PhoneMachine]) -> bool {
        peers
            .iter()
            .any(|peer| peer.connected && self.offline.contains(&peer.entry.slug))
    }
}

type Kept = Mutex<HashMap<(RecapPeriod, String), Read>>;

fn kept() -> &'static Kept {
    static KEPT: OnceLock<Kept> = OnceLock::new();
    KEPT.get_or_init(Default::default)
}

/// This computer's read and the connected computers' `reads`, by slug, as one;
/// every paired computer left out is named in `missing`.
pub(super) fn add_up(
    local: WeeklyRecap,
    peers: &[PhoneMachine],
    mut reads: HashMap<String, Result<WeeklyRecap, String>>,
) -> Read {
    let (period, days) = (local.period, local.days.len());
    let mut parts = vec![local];
    let (mut missing, mut offline) = (Vec::new(), Vec::new());
    for peer in peers {
        // A computer too old to know months answers with a week.
        match reads.remove(&peer.entry.slug) {
            Some(Ok(part)) if part.period == period && part.days.len() == days => parts.push(part),
            Some(_) => missing.push(display_name(&peer.entry)),
            None => {
                missing.push(display_name(&peer.entry));
                offline.push(peer.entry.slug.clone());
            }
        }
    }
    let mut recap = merge(parts);
    recap.missing = missing;
    recap.commits.clear();
    Read {
        at: Instant::now(),
        recap,
        offline,
    }
}

fn read_week(hub: Option<&PeerClientHub>, week: &str, period: RecapPeriod) -> Result<Read, String> {
    let peers = hub.map(PeerClientHub::phone_machines).unwrap_or_default();
    let (local, reads) = std::thread::scope(|scope| {
        let reads: Vec<_> = peers
            .iter()
            .filter(|peer| peer.connected)
            .map(|peer| {
                let slug = peer.entry.slug.clone();
                scope.spawn(move || {
                    let read = hub
                        .ok_or_else(|| "not connected".to_string())
                        .and_then(|hub| {
                            let args = json!({ "week": week, "period": period });
                            hub.invoke_blocking(&slug, RECAP_CMD, args)
                        })
                        .and_then(|value| {
                            serde_json::from_value::<WeeklyRecap>(value).map_err(|e| e.to_string())
                        });
                    (slug, read)
                })
            })
            .collect();
        let local = local_recap(week, period);
        let reads: HashMap<_, _> = reads.into_iter().filter_map(|h| h.join().ok()).collect();
        (local, reads)
    });
    Ok(add_up(local?, &peers, reads))
}

/// The week or month starting `week` (YYYY-MM-DD) on this computer and every
/// connected one. A read is kept for ten minutes, unless `fresh` or a computer
/// that was offline for it has connected since.
pub(crate) fn kept_week(
    hub: Option<&PeerClientHub>,
    week: &str,
    period: RecapPeriod,
    fresh: bool,
) -> Result<WeeklyRecap, String> {
    let key = (period, week.to_string());
    if !fresh {
        let peers = hub.map(PeerClientHub::phone_machines).unwrap_or_default();
        let mut kept = kept().lock().unwrap();
        kept.retain(|_, read| read.at.elapsed() < KEEP_FOR);
        if let Some(read) = kept.get(&key).filter(|read| !read.stale(&peers)) {
            return Ok(read.recap.clone());
        }
    }
    let read = read_week(hub, week, period)?;
    let recap = read.recap.clone();
    kept().lock().unwrap().insert(key, read);
    Ok(recap)
}
