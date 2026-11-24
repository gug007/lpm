use super::*;
use serde_json::json;

fn item(id: &str, mut item: Value) -> Value {
    item["id"] = json!(id);
    json!({
        "timestamp": "2026-11-23T10:00:00Z", "type": "event_msg",
        "payload": {"type": "item_completed", "turn_id": "turn", "item": item},
    })
}

fn asked(id: &str, text: &str) -> Value {
    item(
        id,
        json!({"type": "UserMessage", "content": [{"type": "text", "text": text}]}),
    )
}

fn said(id: &str, text: &str) -> Value {
    item(
        id,
        json!({"type": "AgentMessage", "phase": "final_answer", "content": [{"type": "Text", "text": text}]}),
    )
}

fn event(payload: Value) -> Value {
    json!({"type": "event_msg", "payload": payload})
}

fn parse(records: &[Value]) -> Vec<Item> {
    let mut parser = CodexParser::default();
    for record in records {
        parser.feed(&record.to_string());
    }
    parser.items().to_vec()
}

fn call(record: Value) -> ToolCall {
    match parse(&[record]).remove(0).body {
        Body::Tool(call) => call,
        other => panic!("not a call: {other:?}"),
    }
}

fn run(parsed: Value, command: &str, status: &str, exit: i64) -> ToolCall {
    call(item(
        "c",
        json!({
            "type": "CommandExecution", "command": ["/bin/zsh", "-lc", command], "cwd": "/p",
            "parsed_cmd": parsed, "status": status, "exit_code": exit,
        }),
    ))
}

#[test]
fn a_turn_reads_as_prompt_work_and_answer() {
    let items = parse(&[
        asked("1", "Fix it"),
        said("2", "Looking."),
        said("3", "Done."),
    ]);
    let shown: Vec<_> = items
        .iter()
        .map(|item| match &item.body {
            Body::Prompt { text, .. } => format!("> {text}"),
            Body::Text { text } => text.clone(),
            other => format!("{other:?}"),
        })
        .collect();
    assert_eq!(shown, ["> Fix it", "Looking.", "Done."]);
    assert_eq!(items[0].id, "turn:1");
}

#[test]
fn a_command_is_told_by_what_codex_made_of_it() {
    let read = run(
        json!([{"type": "read", "path": "src/main.rs", "name": "main.rs"}]),
        "cat src/main.rs",
        "completed",
        0,
    );
    assert_eq!((read.what, read.subject.as_str()), (What::Read, "main.rs"));
    assert_eq!(read.path, "/p/src/main.rs");
    let search = run(
        json!([{"type": "search", "query": "todo", "path": null}]),
        "rg todo",
        "completed",
        0,
    );
    assert_eq!(
        (search.what, search.verb.as_str(), search.subject.as_str()),
        (What::Search, "Searched", "todo")
    );
    let ran = run(
        json!([{"type": "unknown", "cmd": "npm test"}]),
        "cd /p && npm test",
        "failed",
        1,
    );
    assert_eq!(
        (ran.verb.as_str(), ran.subject.as_str(), ran.note.as_str()),
        ("Ran", "npm test", "exit 1")
    );
    assert_eq!(ran.state, ToolState::Failed);
}

#[test]
fn each_changed_file_is_its_own_entry() {
    let items = parse(&[item(
        "f",
        json!({
            "type": "FileChange", "status": "completed",
            "changes": {
                "/p/a.ts": {"type": "update", "unified_diff": "--- a\n+++ b\n@@ -1 +1,2 @@\n-x\n+y\n+z\n"},
                "/p/b.ts": {"type": "add", "content": "1\n2\n3\n"},
                "/p/c.ts": {"type": "delete", "content": "1\n"},
            },
        }),
    )]);
    let calls: Vec<_> = items
        .iter()
        .map(|item| match &item.body {
            Body::Tool(call) => (
                item.id.as_str(),
                call.verb.as_str(),
                call.subject.as_str(),
                call.added,
                call.removed,
            ),
            other => panic!("{other:?}"),
        })
        .collect();
    assert_eq!(
        calls,
        [
            ("turn:f#0", "Edited", "a.ts", Some(2), Some(1)),
            ("turn:f#1", "Created", "b.ts", None, None),
            ("turn:f#2", "Deleted", "c.ts", None, None),
        ]
    );
}

#[test]
fn other_items_read_as_lines() {
    let tool = call(item(
        "m",
        json!({"type": "McpToolCall", "server": "linear", "tool": "get_issue", "status": "completed"}),
    ));
    assert_eq!(
        (
            tool.verb.as_str(),
            tool.subject.as_str(),
            tool.note.as_str()
        ),
        ("Used", "get_issue", "linear")
    );
    let search = call(item(
        "w",
        json!({"type": "Extension", "kind": "web.search", "query": "tauri 2", "action": {"type": "search"}}),
    ));
    assert_eq!(
        (search.verb.as_str(), search.subject.as_str()),
        ("Searched the web", "tauri 2")
    );
    let page = call(item(
        "w",
        json!({"type": "Extension", "kind": "web.search", "query": "", "action": {"type": "open_page", "url": "https://a.b"}}),
    ));
    assert_eq!(
        (page.verb.as_str(), page.subject.as_str()),
        ("Fetched", "https://a.b")
    );
}

#[test]
fn going_back_takes_whole_turns_away() {
    let items = parse(&[
        asked("1", "one"),
        said("2", "first"),
        asked("3", "two"),
        said("4", "second"),
        event(json!({"type": "thread_rolled_back", "num_turns": 1})),
    ]);
    assert_eq!(items.len(), 2);
}

#[test]
fn an_interrupted_turn_says_so() {
    let items = parse(&[
        asked("1", "one"),
        event(json!({"type": "turn_aborted", "turn_id": "turn"})),
    ]);
    assert_eq!(
        items[1].body,
        Body::Notice {
            text: "Interrupted".into()
        }
    );
    assert_eq!(items[1].id, "turn:aborted");
}

fn message(role: &str, kind: &str, text: &str) -> Value {
    json!({
        "timestamp": "2026-01-01T00:00:00Z", "type": "response_item",
        "payload": {"type": "message", "role": role, "content": [{"type": kind, "text": text}]},
    })
}

#[test]
fn an_older_rollout_is_read_from_its_messages() {
    let old = [
        message("user", "input_text", "# AGENTS.md instructions for /p"),
        message("user", "input_text", "<environment_context>"),
        message("user", "input_text", "Fix it"),
        message("developer", "input_text", "rules"),
        message("assistant", "output_text", "Done."),
    ];
    assert_eq!(parse(&old).len(), 2);
    let both = [old.as_slice(), &[asked("1", "Fix it")]].concat();
    assert_eq!(parse(&both).len(), 1);
}

#[test]
fn an_older_rollouts_ids_do_not_depend_on_where_the_reading_started() {
    let records = [
        message("user", "input_text", "one"),
        message("assistant", "output_text", "two"),
        message("user", "input_text", "three"),
    ];
    let ids = |records: &[Value]| -> Vec<String> {
        parse(records).into_iter().map(|item| item.id).collect()
    };
    let mut later = records[2].clone();
    later["timestamp"] = json!("2026-11-24T00:00:01Z");
    let whole = ids(&[records[0].clone(), records[1].clone(), later.clone()]);
    assert_eq!(ids(&[later])[0], whole[2]);
    assert_ne!(whole[0], whole[1]);
}
