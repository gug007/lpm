use super::*;
use crate::agent_conversation::ToolCall;
use serde_json::json;

fn parse(records: &[Value]) -> Vec<Item> {
    let mut parser = ClaudeParser::default();
    for record in records {
        parser.feed(&record.to_string());
    }
    parser.items().to_vec()
}

fn said(uuid: &str, parent: Option<&str>, text: &str) -> Value {
    json!({
        "type": "user", "uuid": uuid, "parentUuid": parent, "origin": {"kind": "human"},
        "message": {"role": "user", "content": text},
    })
}

fn untold(text: &str) -> Value {
    json!({"type": "user", "uuid": "u", "message": {"role": "user", "content": text}})
}

fn answer(uuid: &str, parent: &str, block: Value) -> Value {
    json!({
        "type": "assistant", "uuid": uuid, "parentUuid": parent,
        "message": {"id": "m", "model": "claude", "content": [block]},
    })
}

fn text(text: &str) -> Value {
    json!({"type": "text", "text": text})
}

fn call(id: &str, name: &str, input: Value) -> Value {
    json!({"type": "tool_use", "id": id, "name": name, "input": input})
}

fn result(id: &str, content: &str, detail: Value) -> Value {
    json!({
        "type": "user", "uuid": format!("r-{id}"), "toolUseResult": detail,
        "message": {"content": [{"type": "tool_result", "tool_use_id": id, "content": content}]},
    })
}

/// What an entry reads as, for the assertions about which entries there are.
fn shown(items: &[Item]) -> Vec<String> {
    items
        .iter()
        .map(|item| match &item.body {
            Body::Prompt { text, images: 0 } => format!("> {text}"),
            Body::Prompt { text, images } => format!("> {text} [{images}]"),
            Body::Text { text } => text.clone(),
            Body::Tool(call) => format!("* {} {}", call.verb, call.subject),
            Body::Notice { text } => format!("- {text}"),
        })
        .collect()
}

fn only_call(items: &[Item]) -> &ToolCall {
    match &items[0].body {
        Body::Tool(call) => call,
        other => panic!("not a call: {other:?}"),
    }
}

#[test]
fn a_turn_reads_as_prompt_work_and_answer() {
    let items = parse(&[
        said("u1", None, "Fix the badge"),
        answer("a1", "u1", json!({"type": "thinking", "thinking": "hm"})),
        answer("a2", "a1", text("I'll look first.")),
        answer(
            "a3",
            "a2",
            call("t1", "Read", json!({"file_path": "/p/app/page.tsx"})),
        ),
        result(
            "t1",
            "…",
            json!({"type": "text", "file": {"numLines": 148}}),
        ),
        answer("a4", "a3", text("Done.")),
    ]);
    assert_eq!(
        shown(&items),
        [
            "> Fix the badge",
            "I'll look first.",
            "* Read page.tsx",
            "Done."
        ]
    );
    assert_eq!(items[2].id, "t1");
}

#[test]
fn a_call_is_running_until_its_result() {
    let started = answer("a", "u", call("t", "Bash", json!({"command": "npm test"})));
    let items = parse(std::slice::from_ref(&started));
    assert_eq!(only_call(&items).verb, "Running");
    assert_eq!(only_call(&items).state, ToolState::Running);

    let items = parse(&[started, result("t", "ok", json!({"stdout": "ok"}))]);
    assert_eq!(only_call(&items).verb, "Ran");
    assert_eq!(only_call(&items).state, ToolState::Done);
}

#[test]
fn a_call_the_turn_ended_without_is_stopped() {
    let items = parse(&[
        answer("a", "u", call("t", "Bash", json!({"command": "sleep 9"}))),
        untold("[Request interrupted by user]"),
    ]);
    assert_eq!(only_call(&items).state, ToolState::Failed);
    assert_eq!(shown(&items), ["* Ran sleep 9", "- Interrupted"]);
}

#[test]
fn only_what_a_person_said_is_a_prompt() {
    let items = parse(&[
        untold("<task-notification>done</task-notification>"),
        untold("<teammate-message>hi</teammate-message>"),
        untold("<system-reminder>be brief</system-reminder>"),
        untold("<local-command-stdout>Set model</local-command-stdout>"),
        untold("Caveat: the messages below"),
        untold("a real one"),
        json!({"type": "user", "uuid": "m", "isMeta": true, "message": {"content": "skill body"}}),
        json!({"type": "user", "uuid": "n", "origin": {"kind": "peer"}, "message": {"content": "from an agent"}}),
        json!({"type": "user", "uuid": "c", "isCompactSummary": true, "message": {"content": "summary"}}),
        json!({"type": "user", "uuid": "s", "isSidechain": true, "message": {"content": "subagent"}}),
    ]);
    assert_eq!(shown(&items), ["> a real one"]);
}

#[test]
fn a_command_reads_as_it_was_typed() {
    let items = parse(&[
        untold("<command-message>review</command-message>\n<command-name>/review</command-name>\n<command-args>the diff</command-args>"),
        untold("<command-name>/clear</command-name>\n<command-message>clear</command-message>"),
        untold("<bash-input>git status</bash-input>"),
        untold("Look:\n<pasted_content id=\"12\">\nTypeError\n</pasted_content id=\"12\">\nand fix it"),
    ]);
    assert_eq!(
        shown(&items),
        [
            "> /review the diff",
            "> /clear",
            "> ! git status",
            "> Look:\nTypeError\nand fix it"
        ]
    );
}

#[test]
fn a_prompt_of_blocks_keeps_its_words_and_counts_its_images() {
    let items = parse(&[json!({
        "type": "user", "uuid": "u", "origin": {"kind": "human"},
        "message": {"content": [
            {"type": "text", "text": "[Image #1] What's wrong here? [Image #x]"},
            {"type": "image", "source": {}},
            {"type": "text", "text": "<system-reminder>x</system-reminder>"},
        ]},
    })]);
    assert_eq!(shown(&items), ["> What's wrong here? [Image #x] [1]"]);
}

#[test]
fn a_prompt_typed_mid_turn_lands_in_it() {
    let queued = |origin: &str, mode: &str| {
        json!({
            "type": "attachment", "uuid": "q",
            "attachment": {"type": "queued_command", "commandMode": mode, "prompt": "also the docs", "origin": {"kind": origin}},
        })
    };
    let running = answer("a", "u", call("t", "Bash", json!({"command": "npm test"})));
    let items = parse(&[
        running,
        queued("task-notification", "task-notification"),
        queued("peer", "prompt"),
        queued("human", "prompt"),
    ]);
    assert_eq!(shown(&items), ["* Running npm test", "> also the docs"]);
}

#[test]
fn going_back_to_a_prompt_takes_away_what_followed_it() {
    let records = [
        said("u1", None, "one"),
        answer("a1", "u1", text("first")),
        said("u2", Some("a1"), "two"),
        answer("a2", "u2", text("second")),
        answer("a3", "a2", call("t2", "Bash", json!({"command": "ls"}))),
        said("u3", Some("a1"), "two, but better"),
    ];
    assert_eq!(
        shown(&parse(&records)),
        ["> one", "first", "> two, but better"]
    );
}

#[test]
fn a_prompt_can_follow_a_record_that_shows_nothing() {
    let records = [
        said("u1", None, "one"),
        json!({"type": "system", "subtype": "turn_duration", "uuid": "s1", "parentUuid": "u1"}),
        said("u2", Some("s1"), "two"),
        answer("a2", "u2", text("second")),
        said("u3", Some("s1"), "three"),
    ];
    assert_eq!(shown(&parse(&records)), ["> one", "> three"]);
}

#[test]
fn an_unknown_parent_takes_nothing_away() {
    let records = [
        said("u2", Some("gone"), "two"),
        said("u3", Some("a2"), "three"),
    ];
    assert_eq!(shown(&parse(&records)), ["> two", "> three"]);
}

#[test]
fn what_the_cli_says_in_the_agents_voice_is_a_notice_or_nothing() {
    let synthetic = |uuid: &str, text: &str, error: bool| {
        json!({
            "type": "assistant", "uuid": uuid, "isApiErrorMessage": error,
            "message": {"model": "<synthetic>", "content": [{"type": "text", "text": text}]},
        })
    };
    let items = parse(&[
        synthetic("a", "No response requested.", false),
        synthetic("b", "API Error: overloaded\nmore", true),
        json!({"type": "system", "subtype": "compact_boundary", "uuid": "s"}),
        json!({"type": "system", "subtype": "turn_duration", "uuid": "d"}),
    ]);
    assert_eq!(
        shown(&items),
        ["- API Error: overloaded", "- Conversation compacted"]
    );
}

#[test]
fn a_huge_prompt_is_cut() {
    let items = parse(&[untold(&"x".repeat(PROMPT_CHARS + 10))]);
    match &items[0].body {
        Body::Prompt { text, .. } => assert_eq!(text.chars().count(), PROMPT_CHARS + 1),
        other => panic!("{other:?}"),
    }
}
