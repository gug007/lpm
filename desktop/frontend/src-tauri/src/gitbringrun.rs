// The transfer itself: ask the other Mac to pack its working state, stream the
// pack in, install it, and check it out wherever the user chose. Runs on its own
// thread — every step reports through `bring-changes-progress`, and the outcome
// lands in one `bring-changes-done`.
use crate::gitbring::{check_cancelled, landing_name, local_root, Done, Progress, Request};
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

fn progress(app: &AppHandle, id: &str, phase: &str, received: u64, total: u64) {
    let _ = app.emit(
        "bring-changes-progress",
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
    let head = string_of(prepared, "head");
    if head.is_empty() {
        return Err("the other Mac did not report a commit to bring".into());
    }
    let snapshot = prepared
        .get("snapshot")
        .and_then(Value::as_str)
        .map(str::to_string);
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
    let (project, root) = land(app, req, id, project_root)?;
    progress(app, id, "applying", 0, 0);
    ga::apply_state(&root, &branch, &target_sha, &head, snapshot.is_some())?;
    let _ = app.emit("projects-changed", ());
    Ok(Done {
        id: id.to_string(),
        ok: true,
        project: Some(project),
        branch: Some(branch),
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

/// Resolve where the changes land, creating the copy first when the user asked
/// for a new one. A new copy is cloned after the objects are indexed into the
/// project, so its `.git` arrives already holding them and costs no extra bytes.
/// A standalone copy has its own object store and has to pull the ref across; a
/// worktree copy already shares one.
fn land(
    app: &AppHandle,
    req: &Request,
    id: &str,
    project_root: &str,
) -> Result<(String, String), String> {
    if let Some(name) = landing_name(&req.mode, &req.project, req.target.as_deref())? {
        let root = local_root(&name)?;
        // Re-checked here and not only when the run started: packing and streaming
        // can take minutes, and landing on top of work the user began meanwhile
        // would fold it into the brought state.
        if ga::is_dirty(&root) {
            return Err(format!(
                "{name} has uncommitted changes now — commit or discard them, then bring the changes again"
            ));
        }
        if root != project_root && !crate::config::peek_worktree(&name) {
            ga::fetch_bring_ref(&root, project_root, &req.source_slug)?;
        }
        return Ok((name, root));
    }
    progress(app, id, "duplicating", 0, 0);
    let plan = crate::projects_crud::prepare_duplicate(&req.project)?;
    crate::projects_crud::run_duplicate(app, &plan, req.label.as_deref(), true, false, false)?;
    Ok((
        plan.new_name.clone(),
        plan.new_root.to_string_lossy().to_string(),
    ))
}

fn string_of(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}
