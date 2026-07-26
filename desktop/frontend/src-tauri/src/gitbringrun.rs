// The transfer itself: ask the other Mac to pack its working state, stream the
// pack in, install it, and check it out into the local folder. Runs on its
// caller's thread and reports every step through `sync-progress`; the caller owns
// the outcome.
use crate::gitbring::{check_cancelled, local_root, Done, Progress, Request};
use crate::gitbringapply as ga;
use crate::peerclient::PeerClientHub;
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde_json::{json, Value};
use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const PREPARE_TIMEOUT: Duration = Duration::from_secs(180); // packing a large repo is slow
const CHUNK_TIMEOUT: Duration = Duration::from_secs(60);
const DONE_TIMEOUT: Duration = Duration::from_secs(15);

pub(crate) fn progress(app: &AppHandle, id: &str, phase: &str, received: u64, total: u64) {
    let _ = app.emit(
        "sync-progress",
        Progress {
            id,
            phase,
            received,
            total,
            message: None,
        },
    );
}

/// Drive one transfer end to end, returning the outcome the caller emits.
pub(crate) fn run(
    app: &AppHandle,
    hub: &PeerClientHub,
    req: &Request,
    id: &str,
    project_root: &str,
) -> Result<Done, String> {
    progress(app, id, "preparing", 0, 0);
    let prepared = hub.bring_request(
        &req.source_slug,
        PREPARE_TIMEOUT,
        json!({
            "t": "gitBringPrepare",
            "cwd": req.source_root,
            "have": ga::have_list(project_root),
        }),
    )?;
    let transfer_id = string_of(&prepared, "transferId");
    let outcome = receive_and_land(app, hub, req, id, project_root, &prepared);
    // The sender holds a temp pack until we say we are finished — release it even
    // when the transfer failed or the user cancelled.
    if !transfer_id.is_empty() {
        let _ = hub.bring_request(
            &req.source_slug,
            DONE_TIMEOUT,
            json!({ "t": "gitBringDone", "transferId": transfer_id }),
        );
    }
    outcome
}

fn receive_and_land(
    app: &AppHandle,
    hub: &PeerClientHub,
    req: &Request,
    id: &str,
    project_root: &str,
    prepared: &Value,
) -> Result<Done, String> {
    // These reach git as revision arguments, so they are validated as object ids
    // before use: a reply of "--force" would otherwise be a flag, not a commit.
    let head = string_of(prepared, "head");
    if !ga::is_object_id(&head) {
        return Err("the other Mac did not report a commit to bring".into());
    }
    let snapshot = match prepared.get("snapshot").and_then(Value::as_str) {
        Some(s) if ga::is_object_id(s) => Some(s.to_string()),
        Some(_) => return Err("the other Mac sent an unusable change id".into()),
        None => None,
    };
    let branch = ga::bring_branch(
        prepared.get("branch").and_then(Value::as_str),
        &hub.peer_alias(&req.source_slug),
    );
    let target_sha = snapshot.clone().unwrap_or_else(|| head.clone());
    let changed = prepared.get("changed").and_then(Value::as_u64).unwrap_or(0);

    check_cancelled(id)?;
    if !ga::has_object(project_root, &target_sha) {
        let pack = download(app, hub, req, id, prepared)?;
        progress(app, id, "indexing", 0, 0);
        let indexed = ga::index_pack(project_root, &pack);
        let _ = std::fs::remove_file(&pack);
        indexed?;
    }
    ga::update_bring_ref(project_root, &req.source_slug, &target_sha)?;

    check_cancelled(id)?;
    let (project, root) = land(req)?;
    progress(app, id, "applying", 0, 0);
    let landing = ga::Landing::new(&root, &branch, &target_sha, &head, snapshot.is_some());
    ga::apply_state(&match &req.follow {
        Some(follow) => landing.replacing(follow.previous_head.as_deref()),
        None => landing,
    })?;
    let _ = app.emit("projects-changed", ());
    Ok(Done {
        id: id.to_string(),
        ok: true,
        project: Some(project),
        branch: Some(branch),
        head: Some(head),
        changed: Some(changed),
        ..Default::default()
    })
}

fn download(
    app: &AppHandle,
    hub: &PeerClientHub,
    req: &Request,
    id: &str,
    prepared: &Value,
) -> Result<PathBuf, String> {
    let transfer_id = string_of(prepared, "transferId");
    let total = prepared.get("bytes").and_then(Value::as_u64).unwrap_or(0);
    let chunk = prepared
        .get("chunk")
        .and_then(Value::as_u64)
        .unwrap_or(ga::DEFAULT_CHUNK);
    let path = std::env::temp_dir().join(format!("lpm-bring-{id}.pack"));
    let mut file = std::fs::File::create(&path).map_err(|e| e.to_string())?;

    let mut received = 0u64;
    progress(app, id, "transferring", 0, total);
    while let Some((offset, len)) = ga::next_chunk(received, total, chunk) {
        if let Err(e) = check_cancelled(id) {
            let _ = std::fs::remove_file(&path);
            return Err(e);
        }
        let reply = hub
            .bring_request(
                &req.source_slug,
                CHUNK_TIMEOUT,
                json!({ "t": "gitBringChunk", "transferId": transfer_id, "offset": offset, "len": len }),
            )
            .and_then(|r| {
                B64.decode(string_of(&r, "b64"))
                    .map_err(|e| format!("damaged transfer: {e}"))
            });
        let bytes = match reply {
            Ok(b) => b,
            Err(e) => {
                let _ = std::fs::remove_file(&path);
                return Err(e);
            }
        };
        if bytes.is_empty() {
            let _ = std::fs::remove_file(&path);
            return Err("the other Mac stopped sending the changes".into());
        }
        if let Err(e) = file.write_all(&bytes) {
            let _ = std::fs::remove_file(&path);
            return Err(e.to_string());
        }
        received += bytes.len() as u64;
        progress(app, id, "transferring", received, total);
    }
    file.flush().map_err(|e| e.to_string())?;
    Ok(path)
}

/// The folder that receives the state, once it has been established that writing
/// there destroys nothing.
fn land(req: &Request) -> Result<(String, String), String> {
    let name = req.project.clone();
    let root = local_root(&name)?;
    ensure_writable(&root, req, &name)?;
    Ok((name, root))
}

/// Whether this run may write into the folder. Checked here rather than only when
/// the run started: packing and streaming can take minutes, and landing on top of
/// work begun meanwhile would fold it into the synced state.
///
/// A sync run is allowed to replace one thing — the state its own previous run
/// landed — which holds precisely while the folder's working state is still the
/// one anchored at the sync ref.
fn ensure_writable(root: &str, req: &Request, name: &str) -> Result<(), String> {
    let Some(follow) = &req.follow else {
        if ga::is_dirty(root) {
            return Err(format!("{name} has uncommitted changes"));
        }
        return Ok(());
    };
    // The user answered a pause with "discard mine", which is the one case where
    // overwriting their edits is what they asked for.
    if follow.discard_local
        || crate::gitworkstate::holds_only_state(root, &ga::bring_ref(&req.source_slug))
    {
        return Ok(());
    }
    Err(format!(
        "{name} has changes that didn't come from the other Mac — they were left untouched"
    ))
}

fn string_of(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}
