// Phone-side session memory: the `memory`, `memorySession`, `memorySave` and
// `memoryDelete` verbs behind the mobile Memory screen.
//
// Thin shims over session_memory_files, so duplicates keep resolving to their
// original's folder and writes keep their compare-and-swap. Reading slurps
// every session file in the folder and a write hits the disk twice (baseline
// read + atomic replace), so all four answer through the out-queue instead of
// blocking the connection's read loop.
//
// Where this deliberately differs from the desktop pane: `read_memory_sessions`
// inlines every session's full text, which the pane can afford on a local IPC
// call and a phone on cellular cannot (each doc is capped at 1 MiB, and a busy
// project has plenty of them). So `memory` returns the list with a short preview
// and `memorySession` fetches one document in full when a row is opened.
use serde_json::{json, Value};
use std::sync::mpsc::SyncSender;

/// Enough to show the goal line and the top of the timeline under a list row.
/// Matches the desktop composer's own preview budget.
const PREVIEW_CHARS: usize = 1200;

pub fn handle(out: &SyncSender<String>, t: &str, v: &Value) {
    let field = |k: &str| {
        v.get(k)
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_default()
    };
    let verb = t.to_string();
    let project = field("project");
    let name = field("name");
    let content = field("content");
    // Absent `baseline` means "overwrite unconditionally" (the create path);
    // present means "only write if the file still reads exactly like this", so
    // an agent that appended while the phone had the session open is never
    // silently clobbered. An empty string is a real baseline (new file), which
    // is why this is Option and not the `field` helper's "".
    let baseline = v.get("baseline").and_then(Value::as_str).map(str::to_string);
    let req_id = v.get("reqId").cloned().unwrap_or(Value::Null);
    let out = out.clone();
    std::thread::spawn(move || {
        let mut reply = run(&verb, &project, &name, content, baseline);
        reply["t"] = json!(verb);
        reply["project"] = json!(project);
        if !name.is_empty() {
            reply["name"] = json!(name);
        }
        if !req_id.is_null() {
            reply["reqId"] = req_id;
        }
        let _ = out.try_send(reply.to_string());
    });
}

fn run(
    verb: &str,
    project: &str,
    name: &str,
    content: String,
    baseline: Option<String>,
) -> Value {
    match verb {
        // Flattened onto the reply rather than nested so `dir` rides along: a
        // duplicate reads its original's folder, and the phone derives the owner
        // from the last path segment exactly as the desktop pane does.
        "memory" => match read(project) {
            Ok(mut state) => {
                for session in &mut state.sessions {
                    session.content = preview(&session.content);
                }
                flatten(&state)
            }
            Err(e) => err(e),
        },
        // One document in full. Served off the same folder scan rather than a
        // bare path join so the duplicate resolution, the name guard and the
        // too-large placeholder all stay in one place.
        "memorySession" => match read(project) {
            Ok(state) => match state.sessions.into_iter().find(|s| s.name == name) {
                Some(session) => match serde_json::to_value(&session) {
                    Ok(mut value) => {
                        value["ok"] = json!(true);
                        value
                    }
                    Err(e) => err(e.to_string()),
                },
                None => err("This session was removed.".into()),
            },
            Err(e) => err(e),
        },
        "memorySave" => ok_or_err(crate::session_memory_files::write_memory_session(
            project.to_string(),
            name.to_string(),
            content,
            baseline,
        )),
        "memoryDelete" => ok_or_err(crate::session_memory_files::delete_memory_session(
            project.to_string(),
            name.to_string(),
        )),
        _ => err("unknown memory request".into()),
    }
}

fn read(project: &str) -> Result<crate::session_memory_files::MemoryState, String> {
    crate::session_memory_files::read_memory_sessions(project.to_string())
}

fn flatten(state: &crate::session_memory_files::MemoryState) -> Value {
    match serde_json::to_value(state) {
        Ok(mut value) => {
            value["ok"] = json!(true);
            value
        }
        Err(e) => err(e.to_string()),
    }
}

/// Cut on a char boundary — a session file is markdown the user typed, so the
/// budget lands mid-multibyte often enough to matter.
fn preview(content: &str) -> String {
    match content.char_indices().nth(PREVIEW_CHARS) {
        Some((end, _)) => content[..end].to_string(),
        None => content.to_string(),
    }
}

/// The lost-race signal stays the bare literal `"modified"` the desktop pane
/// already string-matches; the phone turns it into its own copy rather than
/// showing it, so this one error is deliberately not a sentence.
fn ok_or_err(result: Result<(), String>) -> Value {
    match result {
        Ok(()) => json!({ "ok": true }),
        Err(e) => err(e),
    }
}

fn err(e: String) -> Value {
    json!({ "ok": false, "error": e })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preview_keeps_a_short_document_whole() {
        let doc = "# Auth refactor\n\n## Goal\nShip it.\n";
        assert_eq!(preview(doc), doc);
    }

    #[test]
    fn preview_cuts_long_documents_to_the_budget() {
        let doc = "a".repeat(PREVIEW_CHARS * 2);
        assert_eq!(preview(&doc).len(), PREVIEW_CHARS);
    }

    /// The budget lands mid-character often enough to matter: session files are
    /// prose, and slicing a &str on a non-boundary panics.
    #[test]
    fn preview_cuts_on_a_char_boundary() {
        let doc = "é".repeat(PREVIEW_CHARS * 2);
        let cut = preview(&doc);
        assert_eq!(cut.chars().count(), PREVIEW_CHARS);
        assert_eq!(cut.len(), PREVIEW_CHARS * 2); // 2 bytes per char, intact
    }

    #[test]
    fn an_unknown_verb_answers_instead_of_going_quiet() {
        let reply = run("memoryNope", "web", "", String::new(), None);
        assert_eq!(reply["ok"], json!(false));
    }
}
