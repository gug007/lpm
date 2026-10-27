// Commands behind "Sync Ignored Files" and the Files tab's Send / Get: list
// what each computer holds, copy a choice of files one way, undo a copy, and
// remember a project's list (ignoredkeep.rs keeps it in step from then on;
// ignoredset.rs brings several computers in step at once).
//
// Every command names the local project and, separately, each other computer
// and its folder there, so none of them is routed to another computer whole.
use crate::gitbring::lock_landing;
use crate::ignoredkeep::{self, SyncList};
use crate::ignoredrun::{changed, copy, on_all, on_both, Remote, Side};
use crate::peerclient::{PeerClientHub, IGNORED_SYNC_UNSUPPORTED, PEER_NOT_CONNECTED};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tauri::{AppHandle, Emitter, Manager, State};

/// The biggest file the .env comparison reads from each side.
const TEXT_MAX: u64 = 256 * 1024;
pub(crate) const BUSY: &str = "another sync of this project is still running";

/// Another computer that holds the project, and the project's folder there.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Target {
    pub slug: String,
    pub remote_root: String,
}

pub(crate) fn machine_name(hub: &PeerClientHub, slug: &str) -> String {
    hub.peer_entry(slug)
        .map(|e| crate::remote_machines::display_name(&e))
        .unwrap_or_else(|| "The other computer".into())
}

pub(crate) fn there<'a>(
    hub: &'a PeerClientHub,
    slug: &str,
    remote_root: &str,
) -> Result<Side<'a>, String> {
    hub.require_ignored_sync(slug)
        .map_err(|e| match e.as_str() {
            PEER_NOT_CONNECTED => format!("{} isn't connected", machine_name(hub, slug)),
            IGNORED_SYNC_UNSUPPORTED => {
                format!(
                    "{} needs a newer lpm to sync files",
                    machine_name(hub, slug)
                )
            }
            _ => e,
        })?;
    Ok(Side::There(Remote {
        hub,
        slug: slug.to_string(),
        cwd: crate::gitbring::unmark(remote_root).to_string(),
    }))
}

pub(crate) fn here(project: &str) -> Result<Side<'static>, String> {
    Ok(Side::Here(crate::gitbring::local_root(project)?.into()))
}

fn listing_or_error(res: Result<crate::ignoredscan::Listing, String>) -> Value {
    match res {
        Ok(listing) => serde_json::to_value(listing).unwrap_or_default(),
        Err(e) => json!({ "error": e }),
    }
}

/// What each computer holds: the project's ignored entries (`dir` empty) or the
/// children of one folder, here and on each of `targets` by its slug.
#[tauri::command(async)]
pub fn ignored_sync_list(
    hub: State<'_, PeerClientHub>,
    project: String,
    targets: Vec<Target>,
    dir: String,
) -> Result<Value, String> {
    let mut sides = vec![here(&project)?];
    let mut slugs = Vec::new();
    let mut listings = Map::new();
    for t in &targets {
        match there(&hub, &t.slug, &t.remote_root) {
            Ok(side) => {
                sides.push(side);
                slugs.push(t.slug.clone());
            }
            Err(e) => {
                listings.insert(t.slug.clone(), json!({ "error": e }));
            }
        }
    }
    let mut found = on_all(&sides, |side| side.list(&dir)).into_iter();
    let local = found
        .next()
        .unwrap_or_else(|| Err("reading this Mac failed".into()));
    let origin = |r: &Result<crate::ignoredscan::Listing, String>| {
        r.as_ref().ok().and_then(|l| l.origin.clone())
    };
    let ours = origin(&local);
    let mut same_repo = Map::new();
    for (slug, res) in slugs.into_iter().zip(found) {
        let same = crate::ignoredpath::same_repo(ours.as_deref(), origin(&res).as_deref());
        same_repo.insert(slug.clone(), json!(same));
        listings.insert(slug, listing_or_error(res));
    }
    Ok(json!({ "here": listing_or_error(local), "there": listings, "sameRepo": same_repo }))
}

/// Copy `paths` one way — `push` sends them to the other computer, `pull`
/// brings them here — reporting through `ignored-sync-progress` and finishing
/// with `ignored-sync-done`, both carrying the caller's `id`.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn ignored_sync_start(
    app: AppHandle,
    hub: State<'_, PeerClientHub>,
    id: String,
    project: String,
    slug: String,
    remote_root: String,
    direction: String,
    paths: Vec<String>,
) -> Result<(), String> {
    let push = match direction.as_str() {
        "push" => true,
        "pull" => false,
        _ => return Err(format!("unknown direction {direction}")),
    };
    if id.is_empty() || paths.is_empty() {
        return Err("nothing was chosen".into());
    }
    here(&project)?;
    there(&hub, &slug, &remote_root)?;
    let lock = lock_landing(&project).ok_or(BUSY)?;
    let hub = hub.inner().clone();
    std::thread::spawn(move || {
        let _lock = lock;
        let done = run(&app, &hub, &project, &slug, &remote_root, push, &paths, &id);
        crate::gitbring::forget_cancel(&id);
        let _ = app.emit("ignored-sync-done", done);
    });
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn run(
    app: &AppHandle,
    hub: &PeerClientHub,
    project: &str,
    slug: &str,
    remote_root: &str,
    push: bool,
    paths: &[String],
    id: &str,
) -> Value {
    let failed = |e: String| json!({ "id": id, "ok": false, "error": e });
    let (local, remote) = match (here(project), there(hub, slug, remote_root)) {
        (Ok(l), Ok(r)) => (l, r),
        (Err(e), _) | (_, Err(e)) => return failed(e),
    };
    let (src, dst) = if push {
        (&local, &remote)
    } else {
        (&remote, &local)
    };
    let _ = app.emit(
        "ignored-sync-progress",
        json!({ "id": id, "phase": "comparing" }),
    );
    let files = match on_both(src, dst, |side| side.manifest(paths)) {
        (Ok(s), Ok(d)) => changed(&s, &d),
        (Err(e), _) | (_, Err(e)) => return failed(e),
    };
    let stop = || crate::gitbring::check_cancelled(id);
    let out = copy(src, dst, &files, &stop, |sent, total, done| {
        let _ = app.emit(
            "ignored-sync-progress",
            json!({ "id": id, "phase": "copying", "sent": sent, "total": total, "files": done, "totalFiles": files.len() }),
        );
    });
    let cancelled = out
        .error
        .as_deref()
        .is_some_and(crate::gitbring::was_cancelled);
    json!({
        "id": id,
        "ok": out.error.is_none(),
        "error": out.error.filter(|_| !cancelled),
        "cancelled": cancelled,
        "batch": out.batch,
        "files": out.files,
        "bytes": out.bytes,
        "added": out.added,
        "replaced": out.replaced,
        "unchanged": files.is_empty(),
    })
}

#[tauri::command]
pub fn ignored_sync_cancel(id: String) {
    crate::gitbring::cancel(&id);
}

/// What one sync or copy landed in one place: on this Mac, or on the computer
/// `slug` in its folder `remote_root`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UndoBatch {
    batch: String,
    slug: Option<String>,
    remote_root: Option<String>,
}

/// Put back what a sync changed, on whichever computer each part landed.
/// Keeping those files in step pauses — with that computer, or for what landed
/// here, with every computer — or the next round would copy over what was just
/// put back.
#[tauri::command(async)]
pub fn ignored_sync_undo(
    hub: State<'_, PeerClientHub>,
    project: String,
    batches: Vec<UndoBatch>,
) -> Result<Value, String> {
    let _lock = lock_landing(&project).ok_or(BUSY)?;
    let mut restored = 0;
    let mut paused = false;
    let mut here_paths = Vec::new();
    for b in &batches {
        match (&b.slug, &b.remote_root) {
            (Some(slug), Some(root)) => {
                let paths = there(&hub, slug, root)?.undo(&b.batch)?;
                restored += paths.len();
                paused |= ignoredkeep::pause_after_undo(&project, slug, &paths);
            }
            _ => {
                let paths = here(&project)?.undo(&b.batch)?;
                restored += paths.len();
                here_paths.extend(paths);
            }
        }
    }
    if !here_paths.is_empty() {
        for slug in ignoredkeep::slugs(&project) {
            paused |= ignoredkeep::pause_after_undo(&project, &slug, &here_paths);
        }
    }
    Ok(json!({ "restored": restored, "paused": paused }))
}

fn small_text(side: &Side, path: &str) -> Option<String> {
    let rec = side
        .manifest(&[path.to_string()])
        .ok()?
        .into_iter()
        .find(|f| f.path == path)?;
    if rec.link.is_some() || rec.size > TEXT_MAX {
        return None;
    }
    let bytes = side.read_whole(path, rec.size).ok()?;
    String::from_utf8(bytes).ok()
}

/// A small text file as each computer holds it, for comparing .env files:
/// this Mac's, and each of `targets`' by its slug.
#[tauri::command(async)]
pub fn ignored_sync_read(
    hub: State<'_, PeerClientHub>,
    project: String,
    targets: Vec<Target>,
    path: String,
) -> Result<Value, String> {
    let mut sides = vec![here(&project)?];
    let mut slugs = Vec::new();
    for t in &targets {
        if let Ok(side) = there(&hub, &t.slug, &t.remote_root) {
            sides.push(side);
            slugs.push(t.slug.clone());
        }
    }
    let mut texts = on_all(&sides, |side| Ok(small_text(side, &path)))
        .into_iter()
        .map(|r| r.ok().flatten());
    let local = texts.next().flatten();
    let others: Map<String, Value> = slugs
        .into_iter()
        .zip(texts)
        .map(|(s, t)| (s, json!(t)))
        .collect();
    Ok(json!({ "here": local, "there": others }))
}

/// What the dialog starts from: the list, without what keeping it in step
/// records per file.
#[derive(Serialize)]
pub struct SavedList {
    paths: Vec<String>,
    keep: bool,
    conflicts: Vec<String>,
}

#[tauri::command]
pub fn ignored_sync_saved(project: String, slug: String) -> Option<SavedList> {
    ignoredkeep::get(&project, &slug).map(|l| SavedList {
        paths: l.paths,
        keep: l.keep,
        conflicts: l.conflicts,
    })
}

/// Remember `paths` for this project and that computer, and keep them in step
/// from now on when `keep`. Refused when the two folders hold different
/// repositories: a shared name is all that paired them.
#[tauri::command(async)]
pub fn ignored_sync_save(
    app: AppHandle,
    hub: State<'_, PeerClientHub>,
    project: String,
    slug: String,
    remote_root: String,
    paths: Vec<String>,
    keep: bool,
) -> Result<(), String> {
    for p in &paths {
        crate::ignoredpath::clean_rel(p)?;
    }
    let (local, remote) = (here(&project)?, there(&hub, &slug, &remote_root)?);
    check_same_repo(&hub, &project, &slug, &local, &remote)?;
    let list = SyncList {
        remote_root: crate::gitbring::unmark(&remote_root).to_string(),
        paths,
        keep,
        ..Default::default()
    };
    ignoredkeep::put(&project, &slug, list)?;
    if keep {
        app.state::<ignoredkeep::Engine>().nudge();
    }
    Ok(())
}

/// A shared name is all that paired the two folders, so they sync only when
/// they hold the same repository.
pub(crate) fn check_same_repo(
    hub: &PeerClientHub,
    project: &str,
    slug: &str,
    local: &Side,
    remote: &Side,
) -> Result<(), String> {
    let (a, b) = on_both(local, remote, |side| side.origin());
    if crate::ignoredpath::same_repo(a?.as_deref(), b?.as_deref()) {
        return Ok(());
    }
    Err(format!(
        "{project} on {} is a different repository",
        machine_name(hub, slug)
    ))
}

#[tauri::command]
pub fn ignored_sync_forget(project: String, slug: String) -> Result<(), String> {
    ignoredkeep::forget(&project, &slug)
}
