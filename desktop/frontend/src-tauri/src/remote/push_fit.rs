//! Keeps an alert's sealed payload inside one push. APNs and FCM each take 4 KB,
//! and the relay sends the plaintext sealed (28 bytes more) in base64 (a third
//! more) beside ~110 bytes of its own, so a plaintext past ~2,960 bytes is
//! refused. A finished turn's `answer` is the field that runs that long: it's cut
//! to the room the rest leaves, keeping its start and its closing paragraph.
use serde_json::{Map, Value};

const PLAINTEXT_BYTES: usize = 2700;

/// Less of an answer than this says no more than its summary does.
const MIN_ANSWER_BYTES: usize = 160;

const GAP: &str = "\n\n…";
const FENCE_CLOSE: &str = "\n```";

pub(super) fn fit(payload: &mut Value) {
    fit_within(payload, PLAINTEXT_BYTES);
}

fn fit_within(payload: &mut Value, budget: usize) {
    if payload.to_string().len() <= budget {
        return;
    }
    let Some(fields) = payload.as_object_mut() else {
        return;
    };
    if let Some(Value::String(answer)) = fields.remove("answer") {
        let room = budget.saturating_sub(size(fields) + r#","answer":"""#.len());
        if let Some(cut) = shorten(&answer, room).filter(|c| escaped_len(c) >= MIN_ANSWER_BYTES) {
            fields.insert("answer".into(), Value::String(cut));
            return;
        }
    }
    if size(fields) > budget {
        fields.remove("files");
    }
}

fn size(fields: &Map<String, Value>) -> usize {
    Value::Object(fields.clone()).to_string().len()
}

/// `answer` in at most `room` bytes of JSON: whole when it fits, else its start
/// cut at a line or a word, an ellipsis, and its closing paragraph when that's
/// short enough to keep.
fn shorten(answer: &str, room: usize) -> Option<String> {
    if escaped_len(answer) <= room {
        return Some(answer.to_string());
    }
    let closing = answer
        .rsplit("\n\n")
        .next()
        .map(str::trim)
        .filter(|p| {
            !p.is_empty()
                && !p.starts_with("```")
                && !p.starts_with('|')
                && escaped_len(p) <= room / 3
        })
        .map(|p| format!("\n\n{p}"))
        .unwrap_or_default();
    let reserved = escaped_len(GAP) + escaped_len(&closing) + escaped_len(FENCE_CLOSE);
    let head = head_within(answer, room.checked_sub(reserved)?)?;
    Some(format!("{head}{GAP}{closing}"))
}

/// The start of `text` in at most `room` bytes of JSON, cut at a line break or
/// a word in its second half, with a code block it leaves open closed.
fn head_within(text: &str, room: usize) -> Option<String> {
    let mut used = 0;
    let end = text
        .char_indices()
        .find_map(|(i, c)| {
            used += escaped_char_len(c);
            (used > room).then_some(i)
        })
        .unwrap_or(text.len());
    let cut = &text[..end];
    let at = cut
        .rfind('\n')
        .or_else(|| cut.rfind(' '))
        .filter(|&i| i > end / 2)
        .unwrap_or(end);
    let head = cut[..at].trim_end();
    if head.is_empty() {
        return None;
    }
    let fences = head
        .lines()
        .filter(|line| line.trim_start().starts_with("```"))
        .count();
    Some(if fences % 2 == 1 {
        format!("{head}{FENCE_CLOSE}")
    } else {
        head.to_string()
    })
}

/// How many bytes `text` takes inside a JSON string, as serde_json writes it.
fn escaped_len(text: &str) -> usize {
    text.chars().map(escaped_char_len).sum()
}

fn escaped_char_len(c: char) -> usize {
    match c {
        '"' | '\\' | '\n' | '\r' | '\t' | '\u{8}' | '\u{c}' => 2,
        c if (c as u32) < 0x20 => 6,
        c => c.len_utf8(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn payload(answer: &str) -> Value {
        json!({
            "project": "storefront",
            "status": "Done",
            "summary": "Want me to update the cart badge?",
            "files": [{ "path": "lib/payments.ts", "added": 40, "removed": 3 }],
            "answer": answer,
        })
    }

    #[test]
    fn escaped_len_matches_serde() {
        let text = "Done — \"quoted\" \\ tab\there\nnew line\r\u{1}é 🚀";
        assert_eq!(escaped_len(text), json!(text).to_string().len() - 2);
    }

    #[test]
    fn a_payload_that_fits_is_left_alone() {
        let mut v = payload("Done. All 23 tests pass.");
        let before = v.clone();
        fit(&mut v);
        assert_eq!(v, before);
    }

    #[test]
    fn a_long_answer_keeps_its_start_and_its_question() {
        let body = "Changed the checkout into two steps.\n\n".to_string()
            + &"- updated another file with more detail\n".repeat(200)
            + "\nAll 23 tests pass. Want me to update the cart badge?";
        let mut v = payload(&body);
        fit(&mut v);
        assert!(v.to_string().len() <= PLAINTEXT_BYTES);
        let answer = v["answer"].as_str().unwrap();
        assert!(answer.starts_with("Changed the checkout into two steps."));
        assert!(answer.ends_with("\n\n…\n\nAll 23 tests pass. Want me to update the cart badge?"));
        assert!(
            answer.contains("- updated another file with more detail\n\n…"),
            "cut at a line"
        );
        assert!(v.get("files").is_some());
    }

    #[test]
    fn a_cut_inside_code_closes_the_block() {
        let body = "Here's the fix:\n\n```rust\n".to_string() + &"let x = 1;\n".repeat(400);
        let mut v = payload(&body);
        fit(&mut v);
        let answer = v["answer"].as_str().unwrap();
        assert!(answer.ends_with("let x = 1;\n```\n\n…"), "{answer:?}");
        assert!(v.to_string().len() <= PLAINTEXT_BYTES);
    }

    #[test]
    fn non_ascii_counts_in_bytes() {
        let mut v = payload(&"готово ".repeat(600));
        fit(&mut v);
        assert!(v.to_string().len() <= PLAINTEXT_BYTES);
        assert!(v["answer"].as_str().unwrap().ends_with("готово\n\n…"));
    }

    #[test]
    fn no_room_drops_the_answer_then_the_files() {
        let mut v = payload(&"word ".repeat(1000));
        fit_within(&mut v, 300);
        assert!(v.get("answer").is_none());
        assert!(v.get("files").is_some());

        let mut v = payload(&"word ".repeat(1000));
        fit_within(&mut v, 120);
        assert!(v.get("answer").is_none() && v.get("files").is_none());
        assert_eq!(v["summary"], "Want me to update the cart badge?");
    }
}
