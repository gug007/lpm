// Phone-side lpm skills: the `lpmCommands`, `lpmCommandSave`,
// `lpmCommandDelete`, `lpmCommandFolder` and `lpmCommandExpand` verbs behind
// lpm Link's Skills screen and its composer's `/` menu, and the lpm rows of
// its `slash` reply. They go through the dispatcher the desktop uses, so a
// phone edit writes the files exactly as a desktop edit would. An SSH
// project's list is a round trip to its host, so every one answers through the
// out-queue from a worker thread.
use crate::lpm_commands::{effective, stores_for, list_stores};
use crate::lpm_commands_cmds::{dispatch, Reply, Request};
use serde_json::{json, Value};
use std::sync::mpsc::SyncSender;
use tauri::AppHandle;

/// The phone may send the `lpmCommand*` verbs, and the `slash` reply carries
/// lpm skills.
pub const FEATURE: &str = "lpmCommands";

/// The phone may send `lpmCommandOtherFolder` and `lpmCommandConvert`.
pub const OTHER_SKILLS_FEATURE: &str = "lpmOtherSkills";

/// The phone may name a folder inside another, as `Parent/Child`.
pub const NESTED_FOLDERS_FEATURE: &str = "lpmNestedFolders";

fn kind(verb: &str, v: &Value) -> &'static str {
    match verb {
        "lpmCommands" => "list",
        "lpmCommandSave" => "save",
        "lpmCommandDelete" => "delete",
        "lpmCommandExpand" => "expand",
        "lpmCommandOtherFolder" => "moveOther",
        "lpmCommandConvert" => "convert",
        _ => match v.get("op").and_then(Value::as_str) {
            Some("create") => "createFolder",
            Some("rename") => "renameFolder",
            Some("delete") => "deleteFolder",
            _ => "",
        },
    }
}

pub fn handle(app: &AppHandle, out: &SyncSender<String>, t: &str, v: &Value) {
    let app = app.clone();
    let out = out.clone();
    let verb = t.to_string();
    let v = v.clone();
    std::thread::spawn(move || {
        let project = v.get("project").and_then(Value::as_str).unwrap_or_default().to_string();
        let answer = Request::parse(kind(&verb, &v), &v)
            .and_then(|request| dispatch(&app, &project, request))
            .and_then(|reply| match reply {
                Reply::Expanded(_) => reply.to_value(),
                _ => reply.to_value().map(|lists| json!({ "lists": lists })),
            });
        let mut reply = match answer {
            Ok(mut value) => {
                value["ok"] = json!(true);
                value
            }
            Err(e) => json!({ "ok": false, "error": e }),
        };
        reply["t"] = json!(verb);
        reply["project"] = json!(project);
        if let Some(req_id) = v.get("reqId").filter(|r| !r.is_null()) {
            reply["reqId"] = req_id.clone();
        }
        let _ = out.try_send(reply.to_string());
    });
}

/// A terminal's `/` menu rows: the user's lpm skills first (this project's,
/// then global), shaped like the agent's own with `source: "lpm"`, then the
/// agent's commands that none of them hides.
pub fn slash_rows(project: &str, agent: Vec<crate::aigen::AgentCommand>) -> Vec<Value> {
    let lists = stores_for(project).and_then(|stores| list_stores(&stores));
    let mut rows: Vec<Value> = Vec::new();
    let mut taken = std::collections::HashSet::new();
    for c in lists.iter().flat_map(effective) {
        taken.insert(c.name.to_lowercase());
        rows.push(json!({
            "name": c.name,
            "description": c.description,
            "argumentHint": c.argument_hint,
            "source": "lpm",
            "folder": c.folder,
            "scope": c.scope,
        }));
    }
    rows.extend(
        agent
            .into_iter()
            .filter(|c| !taken.contains(&c.name.to_lowercase()))
            .filter_map(|c| serde_json::to_value(c).ok()),
    );
    rows
}
