// Phone-side lpm skills: the `lpmCommands`, `lpmCommandSave`,
// `lpmCommandDelete`, `lpmCommandFolder` and `lpmCommandExpand` verbs behind
// lpm Link's Skills screen and its composer's `/` menu, and the lpm rows of
// its `slash` reply, and `lpmCommandUsed`, which counts the menu's other
// commands. They go through the dispatcher the desktop uses, so a
// phone edit writes the files exactly as a desktop edit would. An SSH
// project's list is a round trip to its host, so every one answers through the
// out-queue from a worker thread.
use crate::aigen::AgentCommand;
use crate::lpm_commands::{effective, list_stores, stores_for, LpmCommands};
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

/// The phone may send `lpmCommandUsed`.
pub const COMMAND_USED_FEATURE: &str = "lpmCommandUsed";

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

/// A phone sent a `/` command that isn't an lpm skill. Nothing waits on the
/// count, so it gets no reply.
pub fn command_used(app: &AppHandle, v: &Value) {
    let app = app.clone();
    let v = v.clone();
    std::thread::spawn(move || {
        let project = v.get("project").and_then(Value::as_str).unwrap_or_default().to_string();
        let counted = Request::parse("used", &v).and_then(|request| dispatch(&app, &project, request));
        if let Err(e) = counted {
            eprintln!("lpm: couldn't count a / command: {e}");
        }
    });
}

fn put_runs(row: &mut Value, recent: Option<u32>, last: Option<u64>) {
    if let (Some(recent), Some(last)) = (recent, last) {
        row["recentRuns"] = json!(recent);
        row["lastRunAt"] = json!(last);
    }
}

/// An agent row with what lpm knows of it: its runs, and for a skill made
/// elsewhere the folder it was filed in.
fn agent_row(c: AgentCommand, lists: Option<&LpmCommands>) -> Option<Value> {
    let others = lists.and_then(|l| match c.source.as_str() {
        "project" => l.project.as_ref(),
        "user" => Some(&l.global),
        _ => None,
    });
    let folder = others.and_then(|l| l.others.iter().find(|o| o.name == c.name)).and_then(|o| o.folder.clone());
    let runs = lists.and_then(|l| l.agent_runs.get(&c.name.to_lowercase()));
    let mut row = serde_json::to_value(c).ok()?;
    if folder.is_some() {
        row["folder"] = json!(folder);
    }
    put_runs(&mut row, runs.map(|r| r.recent_runs), runs.map(|r| r.last_run_at));
    Some(row)
}

/// A terminal's `/` menu rows: the user's lpm skills (this project's, then
/// global), shaped like the agent's own with `source: "lpm"`, then the agent's
/// commands that none of them hides, each with its recent runs. The phone puts
/// them in order, as the desktop's menu does.
pub fn slash_rows(project: &str, agent: Vec<AgentCommand>) -> Vec<Value> {
    let mut lists = stores_for(project).and_then(|stores| list_stores(&stores));
    if let Ok(lists) = lists.as_mut() {
        crate::lpm_commands_usage::annotate(project, lists);
    }
    let mut rows: Vec<Value> = Vec::new();
    let mut taken = std::collections::HashSet::new();
    for c in lists.iter().flat_map(effective) {
        taken.insert(c.name.to_lowercase());
        let mut row = json!({
            "name": c.name,
            "description": c.description,
            "argumentHint": c.argument_hint,
            "source": "lpm",
            "folder": c.folder,
            "scope": c.scope,
        });
        put_runs(&mut row, c.recent_runs, c.last_run_at);
        rows.push(row);
    }
    rows.extend(
        agent
            .into_iter()
            .filter(|c| !taken.contains(&c.name.to_lowercase()))
            .filter_map(|c| agent_row(c, lists.as_ref().ok())),
    );
    rows
}

#[cfg(test)]
#[path = "remote_lpm_commands_tests.rs"]
mod tests;
