// Commit history for the phone: the desktop's History view (git_history.rs)
// over the wire. `gitHistory` pages through the current branch's commits,
// `gitCommitFiles` lists what one commit changed and `gitCommitPatch` is one
// file's patch in it. Each runs on a worker: a log of a big repo takes a while.
use crate::git_history::{git_commit_file_patch, git_commit_files, git_history};
use serde_json::{json, Value};
use std::sync::mpsc::SyncSender;

/// The phone may send `gitHistory`, `gitCommitFiles` and `gitCommitPatch`.
pub const FEATURE: &str = "gitHistory";

/// The desktop's page size (HISTORY_PAGE).
const PAGE: usize = 100;

pub fn handle(out: &SyncSender<String>, t: &str, v: &Value) {
    let field = |k: &str| {
        v.get(k)
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string()
    };
    let (project, hash, path) = (field("project"), field("hash"), field("path"));
    let old_path = v
        .get("oldPath")
        .and_then(Value::as_str)
        .filter(|p| !p.is_empty())
        .map(str::to_string);
    let skip = v.get("skip").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = v
        .get("limit")
        .and_then(Value::as_u64)
        .map_or(PAGE, |n| n as usize);
    let t = t.to_string();
    let out = out.clone();
    std::thread::spawn(move || {
        let mut reply = match crate::config::project_root(&project) {
            Ok((cwd, _)) => match t.as_str() {
                "gitHistory" => match git_history(cwd, skip, limit) {
                    Ok(page) => json!({ "ok": true, "skip": skip,
                        "commits": page.commits, "hasMore": page.has_more }),
                    Err(e) => json!({ "ok": false, "skip": skip, "error": e }),
                },
                "gitCommitFiles" => match git_commit_files(cwd, hash.clone()) {
                    Ok(files) => json!({ "ok": true, "hash": hash, "files": files }),
                    Err(e) => json!({ "ok": false, "hash": hash, "error": e }),
                },
                _ => match git_commit_file_patch(cwd, hash.clone(), path.clone(), old_path) {
                    Ok(patch) => {
                        let (diff, truncated) = crate::remote::cap_git_diff(&patch);
                        json!({ "ok": true, "hash": hash, "path": path,
                            "diff": diff, "truncated": truncated })
                    }
                    Err(e) => json!({ "ok": false, "hash": hash, "path": path, "error": e }),
                },
            },
            Err(e) => json!({ "ok": false, "hash": hash, "path": path, "skip": skip, "error": e }),
        };
        reply["t"] = json!(t);
        reply["project"] = json!(project);
        let _ = out.try_send(reply.to_string());
    });
}
