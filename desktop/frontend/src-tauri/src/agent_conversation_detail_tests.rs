use super::*;
use serde_json::json;
use tempfile::TempDir;

fn written(provider: AgentProvider, records: &[Value]) -> (TempDir, Transcript) {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("s.jsonl");
    let text: String = records.iter().map(|record| format!("{record}\n")).collect();
    std::fs::write(&path, text).unwrap();
    (dir, Transcript { provider, path })
}

fn claude_call(name: &str, input: Value, result: Value, detail: Value) -> Vec<Part> {
    let mut result = result;
    result["type"] = json!("tool_result");
    result["tool_use_id"] = json!("t1");
    let (_dir, transcript) = written(
        AgentProvider::Claude,
        &[
            json!({"type": "assistant", "message": {"content": [{"type": "tool_use", "id": "t1", "name": name, "input": input}]}}),
            json!({"type": "user", "toolUseResult": detail, "message": {"content": [result]}}),
        ],
    );
    read(&transcript, "t1").unwrap().unwrap()
}

fn brief(parts: &[Part]) -> Vec<(&str, Style, &str)> {
    parts
        .iter()
        .map(|part| (part.label.as_str(), part.style, part.text.as_str()))
        .collect()
}

#[test]
fn a_command_shows_itself_and_its_output() {
    let parts = claude_call(
        "Bash",
        json!({"command": "npm test"}),
        json!({"content": "ignored"}),
        json!({"stdout": "23 passed\n", "stderr": "warn\n"}),
    );
    assert_eq!(
        brief(&parts),
        [
            ("Command", Style::Code, "npm test"),
            ("Output", Style::Code, "23 passed\nwarn")
        ]
    );
}

#[test]
fn an_edit_shows_its_diff() {
    let parts = claude_call(
        "Edit",
        json!({"file_path": "/p/a.ts"}),
        json!({"content": "ok"}),
        json!({"structuredPatch": [{"oldStart": 4, "oldLines": 1, "newStart": 4, "newLines": 2, "lines": ["-a", "+b", "+c"]}]}),
    );
    assert_eq!(
        brief(&parts),
        [
            ("File", Style::Code, "/p/a.ts"),
            ("", Style::Diff, "@@ -4,1 +4,2 @@\n-a\n+b\n+c")
        ]
    );
}

#[test]
fn a_read_shows_only_its_file() {
    let parts = claude_call(
        "Read",
        json!({"file_path": "/p/a.ts"}),
        json!({"content": "all of it"}),
        json!({"file": {}}),
    );
    assert_eq!(brief(&parts), [("File", Style::Code, "/p/a.ts")]);
}

#[test]
fn an_error_is_labelled() {
    let parts = claude_call(
        "Bash",
        json!({"command": "x"}),
        json!({"content": "Exit code 127", "is_error": true}),
        json!("Error"),
    );
    assert_eq!(parts[1].label, "Error");
}

#[test]
fn long_output_keeps_its_end() {
    let long = format!("{}END", "x".repeat(PART_CHARS * 2));
    let parts = claude_call(
        "Bash",
        json!({"command": "x"}),
        json!({"content": long}),
        Value::Null,
    );
    assert!(parts[1].text.starts_with('…'));
    assert!(parts[1].text.ends_with("END"));
}

#[test]
fn a_call_still_running_has_its_input_alone() {
    let (_dir, transcript) = written(
        AgentProvider::Claude,
        &[
            json!({"message": {"content": [{"type": "tool_use", "id": "t1", "name": "Bash", "input": {"command": "sleep 9"}}]}}),
        ],
    );
    assert_eq!(read(&transcript, "t1").unwrap().unwrap().len(), 1);
    assert_eq!(read(&transcript, "other").unwrap(), None);
}

#[test]
fn a_codex_change_shows_the_file_its_line_is_about() {
    let (_dir, transcript) = written(
        AgentProvider::Codex,
        &[
            json!({"payload": {"type": "item_completed", "turn_id": "turn", "item": {
                "type": "FileChange", "id": "f",
                "changes": {"/p/a.ts": {"type": "update", "unified_diff": "@@ -1 +1 @@\n-x\n+y"}, "/p/b.ts": {"type": "add", "content": "new"}},
            }}}),
        ],
    );
    let second = read(&transcript, "turn:f#1").unwrap().unwrap();
    assert_eq!(
        brief(&second),
        [
            ("File", Style::Code, "/p/b.ts"),
            ("Contents", Style::Code, "new")
        ]
    );
    let first = read(&transcript, "turn:f#0").unwrap().unwrap();
    assert_eq!(first[1].style, Style::Diff);
}
