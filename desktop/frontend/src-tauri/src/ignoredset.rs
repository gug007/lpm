// Sync in the Sync Ignored Files dialog: remember the ticked list for every
// computer chosen, bring them all in step now, settling files that differ by
// the user's word, and keep them so from then on.
use crate::gitbring::lock_landing;
use crate::ignoredkeep::{self, SyncList};
use crate::ignoredstep::{bring_all_in_step, Choice, Peer};
use crate::ignoredsync::{check_same_repo, here, machine_name, there, Target, BUSY};
use crate::peerclient::PeerClientHub;
use serde_json::{json, Value};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, State};

/// Keep `paths` in step with each of `targets`. `prefer` is `newest`, `here`,
/// or the slug of the computer whose version wins where they differ now.
/// Reports like a copy, through `ignored-sync-progress` and
/// `ignored-sync-done` with the caller's `id`.
#[allow(clippy::too_many_arguments)]
#[tauri::command(async)]
pub fn ignored_sync_set(
    app: AppHandle,
    hub: State<'_, PeerClientHub>,
    id: String,
    project: String,
    targets: Vec<Target>,
    paths: Vec<String>,
    prefer: String,
) -> Result<(), String> {
    if id.is_empty() || paths.is_empty() || targets.is_empty() {
        return Err("nothing was chosen".into());
    }
    let slugs: Vec<&str> = targets.iter().map(|t| t.slug.as_str()).collect();
    let choice = Choice::parse(&prefer, &slugs)?;
    for p in &paths {
        crate::ignoredpath::clean_rel(p)?;
    }
    let local = here(&project)?;
    for t in &targets {
        let remote = there(&hub, &t.slug, &t.remote_root)?;
        check_same_repo(&hub, &project, &t.slug, &local, &remote)?;
    }
    let lock = lock_landing(&project).ok_or(BUSY)?;
    for t in &targets {
        let list = SyncList {
            remote_root: crate::gitbring::unmark(&t.remote_root).to_string(),
            paths: paths.clone(),
            keep: true,
            ..Default::default()
        };
        ignoredkeep::put(&project, &t.slug, list)?;
    }
    let hub = hub.inner().clone();
    std::thread::spawn(move || {
        let _lock = lock;
        let done = sync_now(&app, &hub, &project, &targets, &choice, &id);
        crate::gitbring::forget_cancel(&id);
        let _ = app.emit("ignored-sync-done", done);
    });
    Ok(())
}

fn sync_now(
    app: &AppHandle,
    hub: &PeerClientHub,
    project: &str,
    targets: &[Target],
    choice: &Choice,
    id: &str,
) -> Value {
    let failed = |e: String| json!({ "id": id, "ok": false, "error": e });
    let local = match here(project) {
        Ok(side) => side,
        Err(e) => return failed(e),
    };
    let mut peers = Vec::new();
    for t in targets {
        match there(hub, &t.slug, &t.remote_root) {
            Ok(side) => peers.push(Peer {
                slug: t.slug.clone(),
                there: side,
            }),
            Err(e) => return failed(e),
        }
    }
    let names: HashMap<&str, String> = targets
        .iter()
        .map(|t| (t.slug.as_str(), machine_name(hub, &t.slug)))
        .collect();
    let roots: HashMap<&str, &str> = targets
        .iter()
        .map(|t| (t.slug.as_str(), t.remote_root.as_str()))
        .collect();
    let _ = app.emit(
        "ignored-sync-progress",
        json!({ "id": id, "phase": "comparing" }),
    );
    let stop = || crate::gitbring::check_cancelled(id);
    let mut progress = |slug: &str, sent, total, files| {
        let _ = app.emit(
            "ignored-sync-progress",
            json!({ "id": id, "phase": "copying", "machine": names.get(slug), "sent": sent, "total": total, "files": files }),
        );
    };
    let rounds = bring_all_in_step(project, &local, &peers, Some(choice), &stop, &mut progress);

    let (mut sent, mut received, mut bytes) = (0, 0, 0);
    let mut sent_to = Vec::new();
    let mut batches = Vec::new();
    let mut error = None;
    for (slug, res) in rounds {
        let name = &names[slug.as_str()];
        let step = match res {
            Ok(step) => step,
            Err(e) => {
                error.get_or_insert(format!("{name}: {e}"));
                continue;
            }
        };
        sent += step.sent;
        received += step.received;
        bytes += step.bytes;
        sent_to.push(json!({ "machine": name, "files": step.sent }));
        for (batch, to_peer) in step.batches {
            batches.push(if to_peer {
                json!({ "batch": batch, "slug": slug, "remoteRoot": roots[slug.as_str()] })
            } else {
                json!({ "batch": batch })
            });
        }
        if let Some(e) = step.error.filter(|e| !crate::gitbring::was_cancelled(e)) {
            error.get_or_insert(format!("{name}: {e}"));
        }
    }
    let cancelled = stop().is_err();
    json!({
        "id": id,
        "ok": error.is_none() && !cancelled,
        "error": error,
        "cancelled": cancelled,
        "sent": sent,
        "sentTo": sent_to,
        "received": received,
        "files": sent + received,
        "bytes": bytes,
        "batches": batches,
        "unchanged": sent + received == 0,
    })
}
