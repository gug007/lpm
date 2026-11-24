use super::*;
use serde_json::{json, Value};
use std::io::Write;
use tempfile::TempDir;

fn prompt(id: &str, text: &str) -> Value {
    json!({
        "type": "user", "uuid": id, "origin": {"kind": "human"},
        "message": {"role": "user", "content": text},
    })
}

fn lines(records: &[Value]) -> String {
    records.iter().map(|record| format!("{record}\n")).collect()
}

fn claude(path: &Path) -> Transcript {
    Transcript {
        provider: AgentProvider::Claude,
        path: path.to_path_buf(),
    }
}

fn ids(reader: &Reader) -> Vec<&str> {
    reader.items().iter().map(|item| item.id.as_str()).collect()
}

#[test]
fn a_reader_parses_only_what_was_appended() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("s.jsonl");
    std::fs::write(&path, lines(&[prompt("a", "one")])).unwrap();
    let mut reader = Reader::open(claude(&path), 10).unwrap();
    assert_eq!(ids(&reader), ["a"]);
    assert_eq!(reader.poll(), Polled::Same);

    let mut file = std::fs::OpenOptions::new()
        .append(true)
        .open(&path)
        .unwrap();
    file.write_all(lines(&[prompt("b", "two")]).as_bytes())
        .unwrap();
    assert_eq!(reader.poll(), Polled::Grown);
    assert_eq!(ids(&reader), ["a", "b"]);
}

fn answered(id: &str, parent: &str, text: &str) -> Value {
    json!({
        "type": "assistant", "uuid": id, "parentUuid": parent,
        "message": {"id": "m", "model": "claude", "content": [{"type": "text", "text": text}]},
    })
}

/// Two prompts with a long turn after them, then one that goes back to the first.
fn gone_back(path: &Path) -> String {
    let mut first = prompt("a", "one");
    first["parentUuid"] = Value::Null;
    let filler = "x".repeat(1000);
    let mut next = prompt("p", "abandoned");
    next["parentUuid"] = json!("a");
    let mut records = vec![first, next];
    let mut parent = "p".to_string();
    for n in 0..700 {
        let id = format!("f{n}");
        records.push(answered(&id, &parent, &filler));
        parent = id;
    }
    let whole = lines(&records);
    std::fs::write(path, &whole).unwrap();
    let mut back = prompt("b", "two");
    back["parentUuid"] = json!("a");
    lines(&[back])
}

#[test]
fn a_prompt_that_goes_back_past_the_window_takes_reading_it_all() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("s.jsonl");
    let back = gone_back(&path);
    let mut running = Reader::open(claude(&path), 5).unwrap();
    assert!(running.partial());
    let mut file = std::fs::OpenOptions::new()
        .append(true)
        .open(&path)
        .unwrap();
    file.write_all(back.as_bytes()).unwrap();
    assert_eq!(running.poll(), Polled::Gone);

    let reader = Reader::open(claude(&path), 5).unwrap();
    assert_eq!(ids(&reader), ["a", "b"]);
    assert!(!reader.partial());
}

#[test]
fn a_record_still_being_written_waits_for_its_end() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("s.jsonl");
    let whole = lines(&[prompt("a", "one"), prompt("b", "two")]);
    let cut = whole.len() - 12;
    std::fs::write(&path, &whole[..cut]).unwrap();
    let mut reader = Reader::open(claude(&path), 10).unwrap();
    assert_eq!(ids(&reader), ["a"]);

    let mut file = std::fs::OpenOptions::new()
        .append(true)
        .open(&path)
        .unwrap();
    file.write_all(whole[cut..].as_bytes()).unwrap();
    assert_eq!(reader.poll(), Polled::Grown);
    assert_eq!(ids(&reader), ["a", "b"]);
}

#[test]
fn a_shorter_or_missing_file_is_another_one() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("s.jsonl");
    std::fs::write(&path, lines(&[prompt("a", "one"), prompt("b", "two")])).unwrap();
    let mut reader = Reader::open(claude(&path), 10).unwrap();
    std::fs::write(&path, lines(&[prompt("c", "x")])).unwrap();
    assert_eq!(reader.poll(), Polled::Gone);
    std::fs::remove_file(&path).unwrap();
    assert_eq!(reader.poll(), Polled::Gone);
}

#[test]
fn the_window_widens_until_it_holds_enough() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("s.jsonl");
    let filler = json!({"type": "attachment", "uuid": "x", "pad": "p".repeat(700 << 10)});
    let mut records = vec![
        prompt("a", "one"),
        filler.clone(),
        prompt("b", "two"),
        filler,
    ];
    records.push(prompt("c", "three"));
    std::fs::write(&path, lines(&records)).unwrap();

    let tail = Reader::open(claude(&path), 1).unwrap();
    assert_eq!(ids(&tail), ["c"]);
    assert!(tail.partial());
    let all = Reader::open(claude(&path), 3).unwrap();
    assert_eq!(ids(&all), ["a", "b", "c"]);
    assert!(!all.partial());
    assert_eq!(
        ids(&Reader::open_whole(claude(&path)).unwrap()),
        ["a", "b", "c"]
    );
}

#[test]
fn an_entry_goes_out_as_one_flat_object() {
    let mut call = ToolCall::file(What::Edit, "Edited", "/p/components/Form.tsx");
    (call.added, call.removed) = (Some(42), Some(18));
    let item = Item {
        id: "t".into(),
        body: Body::Tool(call),
    };
    assert_eq!(
        serde_json::to_value(item).unwrap(),
        json!({
            "id": "t", "kind": "tool", "what": "edit", "verb": "Edited",
            "subject": "Form.tsx", "code": true, "path": "/p/components/Form.tsx",
            "added": 42, "removed": 18, "state": "done",
        })
    );
    let item = Item {
        id: "p".into(),
        body: Body::Prompt {
            text: "hi".into(),
            images: 0,
        },
    };
    assert_eq!(
        serde_json::to_value(item).unwrap(),
        json!({"id": "p", "kind": "prompt", "text": "hi"})
    );
}

#[test]
fn long_text_is_cut_on_a_character() {
    assert_eq!(capped("héllo", 2), "hé…");
    assert_eq!(capped("héllo", 5), "héllo");
    assert_eq!(base_name("/a/b/c.rs"), "c.rs");
    assert_eq!(base_name("C:\\a\\b.rs"), "b.rs");
    assert_eq!(base_name("plain"), "plain");
}
