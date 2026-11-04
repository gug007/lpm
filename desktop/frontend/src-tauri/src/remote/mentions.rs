//! The phone's `mentions` reply: what its composer's "@" menu offers for a
//! project. The project's files and folders (relative paths the agent
//! resolves), with git working-tree changes flagged, and, for a project of this
//! Mac, the other computers its agents can reach (agentmentions.rs). The phone
//! fetches once and filters locally. Asking the other computers can take a
//! second or two, so the caller builds this off the connection's read loop.
use crate::config;
use crate::peerclient::PeerClientHub;
use serde_json::{json, Value};
use std::collections::HashSet;
use tauri::{AppHandle, Manager};

pub(super) fn frame(app: &AppHandle, project: &str) -> Value {
    let root = config::project_root(project).ok();
    let local = matches!(root, Some((_, false)));
    let cwd = root.map(|(r, _)| r).unwrap_or_default();
    let hub = app.try_state::<PeerClientHub>().filter(|_| local);
    std::thread::scope(|s| {
        let computers =
            hub.map(|hub| s.spawn(move || crate::agentmentions::mention_computers(hub.inner())));
        let mut reply = json!({ "t": "mentions", "project": project, "entries": entries(cwd) });
        if let Some(computers) = computers.and_then(|ask| ask.join().ok()) {
            reply["computers"] = json!(computers);
        }
        reply
    })
}

fn entries(cwd: String) -> Vec<Value> {
    if cwd.is_empty() {
        return Vec::new();
    }
    let changed: HashSet<String> = crate::git::git_changed_files(cwd.clone())
        .into_iter()
        .map(|c| c.path)
        .collect();
    let files = crate::files::list_dir_files(cwd).unwrap_or_default();
    let mut seen = HashSet::new();
    let mut entries: Vec<Value> = Vec::new();
    for f in &files {
        seen.insert(f.path.clone());
        let ch = changed.contains(&f.path);
        entries.push(json!({ "path": f.path, "dir": f.is_dir, "changed": ch }));
    }
    // Changed files the walk skipped (e.g. inside an ignored dir) still count.
    for p in &changed {
        if !seen.contains(p) {
            entries.push(json!({ "path": p, "dir": false, "changed": true }));
        }
    }
    entries
}
