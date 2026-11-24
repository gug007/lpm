use super::*;
use serde_json::json;

fn done_with(name: &str, input: Value, result: Value, detail: Value) -> ToolCall {
    let mut call = started(name, &input).unwrap();
    finished(&mut call, &result, Some(&detail));
    call
}

#[test]
fn a_short_command_speaks_for_itself() {
    let call = command("npm test", "Run the tests");
    assert_eq!((call.subject.as_str(), call.code), ("npm test", true));
    let call = command("cd /Users/me/Projects/app && npm test", "Run the tests");
    assert_eq!(call.subject, "npm test");
}

#[test]
fn a_long_command_is_what_it_is_for() {
    let long = "grep -rn \"createPaymentIntent\" --include='*.ts' . | sort | uniq -c | head -40";
    let call = command(long, "Find callers of createPaymentIntent");
    assert_eq!(call.subject, "Find callers of createPaymentIntent");
    assert!(!call.code);
    let call = command("cat <<'EOF'\nhi\nEOF", "Print a greeting");
    assert_eq!(call.subject, "Print a greeting");
    assert!(command(long, "").subject.starts_with("grep -rn"));
}

#[test]
fn the_cd_a_command_opens_with_goes() {
    assert_eq!(short_command("cd /a && cd b; make"), "make");
    assert_eq!(short_command("cd /a"), "cd /a");
    assert_eq!(short_command("cd /a\nmake"), "make");
    assert_eq!(short_command("cdk deploy"), "cdk deploy");
}

#[test]
fn an_edit_counts_its_lines() {
    let call = done_with(
        "Edit",
        json!({"file_path": "/p/Form.tsx"}),
        json!({"content": "ok"}),
        json!({"structuredPatch": [{"lines": [" a", "-b", "+c", "+d"]}, {"lines": ["+e"]}]}),
    );
    assert_eq!(call.verb, "Edited");
    assert_eq!((call.added, call.removed), (Some(3), Some(1)));
    assert_eq!(call.path, "/p/Form.tsx");
}

#[test]
fn a_new_file_is_created() {
    let call = done_with(
        "Write",
        json!({"file_path": "/p/pay.ts"}),
        json!({}),
        json!({"type": "create", "structuredPatch": [], "content": "a\nb\n"}),
    );
    assert_eq!(
        (call.verb.as_str(), call.note.as_str()),
        ("Created", "2 lines")
    );
    let call = done_with(
        "Write",
        json!({"file_path": "/p/pay.ts"}),
        json!({}),
        json!({"type": "update", "structuredPatch": [{"lines": ["+x"]}], "content": "x"}),
    );
    assert_eq!((call.verb.as_str(), call.added), ("Edited", Some(1)));
}

#[test]
fn a_failure_says_how() {
    let failed = |text: &str| {
        let mut call = started("Bash", &json!({"command": "npm test"})).unwrap();
        finished(&mut call, &json!({"is_error": true, "content": text}), None);
        (call.verb, call.note, call.state)
    };
    assert_eq!(
        failed("Exit code 1\nboom"),
        ("Ran".into(), "exit 1".into(), ToolState::Failed)
    );
    assert_eq!(
        failed("The user doesn't want to proceed with this").1,
        "denied"
    );
    assert_eq!(failed("<tool_use_error>x").1, "failed");
}

#[test]
fn an_answered_question_shows_its_answer() {
    let call = done_with(
        "AskUserQuestion",
        json!({"questions": [{"question": "Which one?", "options": []}]}),
        json!({}),
        json!({"answers": {"Which one?": "The first"}}),
    );
    assert_eq!(
        (call.verb.as_str(), call.subject.as_str()),
        ("Asked", "Which one?")
    );
    assert_eq!(call.note, "The first");
}

#[test]
fn other_tools_read_as_words() {
    let shown = |name: &str, input: Value| {
        let call = started(name, &input).unwrap();
        (call.verb, call.subject, call.note)
    };
    assert_eq!(
        shown("mcp__claude-in-chrome__navigate", json!({})),
        ("Using".into(), "navigate".into(), "claude-in-chrome".into())
    );
    assert_eq!(shown("Skill", json!({"skill": "review"})).1, "/review");
    assert_eq!(shown("Grep", json!({"pattern": "fn main"})).1, "fn main");
    assert_eq!(shown("SomethingNew", json!({})).1, "SomethingNew");
    assert!(started("ToolSearch", &json!({})).is_none());
}

#[test]
fn work_sent_to_the_background_says_so() {
    let call = done_with(
        "Bash",
        json!({"command": "npm run dev"}),
        json!({}),
        json!({"stdout": "", "backgroundTaskId": "b1"}),
    );
    assert_eq!(call.note, "in the background");
    let call = done_with(
        "Agent",
        json!({"description": "Review"}),
        json!({}),
        json!({"isAsync": true}),
    );
    assert_eq!(
        (call.verb.as_str(), call.subject.as_str()),
        ("Started agent", "Review")
    );
}
