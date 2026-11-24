//! Claude Code's transcript as conversation entries. One record holds one
//! content block, a tool's result is a user record of its own, and what the
//! person typed while the agent worked is an attachment.
//!
//! A transcript is a tree: going back to an earlier prompt and asking again
//! leaves the abandoned exchange in the file, so a prompt whose parent comes
//! before another prompt takes everything after that parent away.
use crate::agent_conversation::{
    capped, flag, str_of, Body, Item, ToolState, PROMPT_CHARS, TEXT_CHARS,
};
use crate::agent_conversation_tools as tools;
use crate::agent_last_answer::{is_injected, SYNTHETIC_MODEL};
use crate::claude_turn::INTERRUPTED;
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;

#[derive(Default)]
pub(crate) struct ClaudeParser {
    items: Vec<Item>,
    /// Tool calls by their id, for the result that names it.
    calls: HashMap<String, usize>,
    /// Each record's number, and how many entries there were once it was read.
    records: HashMap<String, Mark>,
    read: usize,
    /// The numbers of the records a person's prompts are in.
    prompts: Vec<usize>,
    /// A prompt went back to before what was read, so what it took away isn't known.
    lost: bool,
}

#[derive(Deserialize)]
struct Identified {
    uuid: Option<String>,
}

#[derive(Clone, Copy)]
struct Mark {
    record: usize,
    items: usize,
}

impl ClaudeParser {
    pub(crate) fn items(&self) -> &[Item] {
        &self.items
    }

    pub(crate) fn lost(&self) -> bool {
        self.lost
    }

    pub(crate) fn feed(&mut self, line: &str) {
        if !matters(line) {
            self.note_record(line);
            return;
        }
        let Ok(record) = serde_json::from_str::<Value>(line) else {
            return;
        };
        if flag(&record, "isSidechain") {
            return;
        }
        self.read += 1;
        match str_of(&record, "type") {
            "user" => self.user(&record),
            "assistant" => self.assistant(&record),
            "attachment" => self.attachment(&record),
            "system" if str_of(&record, "subtype") == "compact_boundary" => {
                self.notice(&record, "Conversation compacted");
            }
            _ => {}
        }
        if let Some(uuid) = record.get("uuid").and_then(Value::as_str) {
            self.mark(uuid.to_string());
        }
    }

    /// A record that shows nothing can still be what the next prompt follows.
    fn note_record(&mut self, line: &str) {
        if !line.contains("\"type\":\"system\"") && !line.contains("\"type\":\"attachment\"") {
            return;
        }
        if let Ok(Identified { uuid: Some(uuid) }) = serde_json::from_str(line) {
            self.read += 1;
            self.mark(uuid);
        }
    }

    fn mark(&mut self, uuid: String) {
        let mark = Mark {
            record: self.read,
            items: self.items.len(),
        };
        self.records.insert(uuid, mark);
    }

    fn user(&mut self, record: &Value) {
        let content = record.get("message").and_then(|m| m.get("content"));
        if let Some(results) = tool_results(content) {
            for result in results {
                self.settle(result, record.get("toolUseResult"));
            }
            return;
        }
        if flag(record, "isMeta") || flag(record, "isCompactSummary") || !from_person(record) {
            return;
        }
        let Some(said) = content.and_then(prompt) else {
            return;
        };
        if said.text.starts_with(INTERRUPTED) {
            self.stop_running();
            self.notice(record, "Interrupted");
            return;
        }
        self.drop_abandoned(record);
        self.stop_running();
        self.prompts.push(self.read);
        self.push_prompt(record, said);
    }

    /// A prompt typed while the agent worked, delivered into its turn. It's an
    /// attachment, and the turn it landed in goes on.
    fn attachment(&mut self, record: &Value) {
        let Some(attachment) = record.get("attachment") else {
            return;
        };
        if str_of(attachment, "type") != "queued_command"
            || str_of(attachment, "commandMode") != "prompt"
            || flag(attachment, "isMeta")
            || !from_person(attachment)
        {
            return;
        }
        if let Some(said) = attachment.get("prompt").and_then(prompt) {
            self.push_prompt(record, said);
        }
    }

    fn assistant(&mut self, record: &Value) {
        let Some(message) = record.get("message") else {
            return;
        };
        let blocks = message.get("content").and_then(Value::as_array);
        let blocks = blocks.map(Vec::as_slice).unwrap_or_default();
        // A notice the CLI wrote in the agent's voice. Only an API error is worth
        // reading; "No response requested." is plumbing.
        if str_of(message, "model") == SYNTHETIC_MODEL {
            if flag(record, "isApiErrorMessage") {
                let text = blocks.iter().find_map(|b| b.get("text")?.as_str());
                self.notice(record, text.unwrap_or("The request failed"));
            }
            return;
        }
        let uuid = str_of(record, "uuid");
        for (n, block) in blocks.iter().enumerate() {
            match str_of(block, "type") {
                "text" => {
                    let text = str_of(block, "text").trim();
                    if !text.is_empty() {
                        let id = if n == 0 {
                            uuid.to_string()
                        } else {
                            format!("{uuid}:{n}")
                        };
                        let text = capped(text, TEXT_CHARS);
                        self.push(id, Body::Text { text });
                    }
                }
                "tool_use" => {
                    let id = str_of(block, "id").to_string();
                    let input = block.get("input").unwrap_or(&Value::Null);
                    let Some(mut call) = tools::started(str_of(block, "name"), input) else {
                        continue;
                    };
                    call.state = ToolState::Running;
                    self.calls.insert(id.clone(), self.items.len());
                    self.push(id, Body::Tool(call));
                }
                _ => {}
            }
        }
    }

    /// A call's result: how it ended, and what it changed.
    fn settle(&mut self, result: &Value, detail: Option<&Value>) {
        let Some(at) = self.calls.get(str_of(result, "tool_use_id")) else {
            return;
        };
        if let Some(Item {
            body: Body::Tool(call),
            ..
        }) = self.items.get_mut(*at)
        {
            tools::finished(call, result, detail);
        }
    }

    /// A call the turn ended without never gets a result.
    fn stop_running(&mut self) {
        for item in self.items.iter_mut().rev() {
            match &mut item.body {
                Body::Prompt { .. } => return,
                Body::Tool(call) if call.state == ToolState::Running => {
                    tools::stopped(call);
                }
                _ => {}
            }
        }
    }

    fn drop_abandoned(&mut self, record: &Value) {
        let Some(parent) = record.get("parentUuid").and_then(Value::as_str) else {
            return;
        };
        let Some(mark) = self.records.get(parent).copied() else {
            self.lost |= !self.records.is_empty();
            return;
        };
        if !self.prompts.iter().any(|prompt| *prompt > mark.record) {
            return;
        }
        self.items.truncate(mark.items);
        self.calls.retain(|_, at| *at < mark.items);
        self.prompts.retain(|prompt| *prompt <= mark.record);
        self.records.retain(|_, at| at.record <= mark.record);
    }

    fn push_prompt(&mut self, record: &Value, said: Said) {
        let id = str_of(record, "uuid").to_string();
        let body = Body::Prompt {
            text: capped(&said.text, PROMPT_CHARS),
            images: said.images,
        };
        self.push(id, body);
    }

    fn notice(&mut self, record: &Value, text: &str) {
        let id = str_of(record, "uuid").to_string();
        let text = capped(text.lines().next().unwrap_or_default().trim(), 300);
        self.push(id, Body::Notice { text });
    }

    fn push(&mut self, id: String, body: Body) {
        self.items.push(Item { id, body });
    }
}

/// Most of a transcript is bookkeeping, and some of it runs to megabytes, so a
/// line is only parsed when it holds a kind of record that counts.
fn matters(line: &str) -> bool {
    line.contains("\"type\":\"assistant\"")
        || line.contains("\"type\":\"user\"")
        || line.contains("\"queued_command\"")
        || line.contains("\"compact_boundary\"")
}

struct Said {
    text: String,
    images: usize,
}

/// Agents and background tasks speak in user records too. An older CLI says
/// nothing of where a prompt came from; the text tells those apart.
fn from_person(record: &Value) -> bool {
    match record.get("origin").and_then(|origin| origin.get("kind")) {
        Some(kind) => kind == "human",
        None => true,
    }
}

fn prompt(content: &Value) -> Option<Said> {
    let (texts, images) = match content {
        Value::String(text) => (vec![text.as_str()], 0),
        Value::Array(blocks) => (
            blocks
                .iter()
                .filter_map(|b| b.get("text")?.as_str())
                .collect(),
            blocks
                .iter()
                .filter(|b| str_of(b, "type") == "image")
                .count(),
        ),
        _ => return None,
    };
    let mut text = texts
        .into_iter()
        .filter_map(typed)
        .collect::<Vec<_>>()
        .join("\n\n");
    if images > 0 {
        text = without_image_marks(&text);
    }
    (!text.is_empty() || images > 0).then_some(Said { text, images })
}

/// Without the "[Image #1]" the CLI types where an image was pasted: the images
/// are counted beside the words.
fn without_image_marks(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(at) = rest.find("[Image #") {
        let number = &rest[at + "[Image #".len()..];
        let digits = number.bytes().take_while(u8::is_ascii_digit).count();
        out.push_str(&rest[..at]);
        match number[digits..].strip_prefix(']') {
            Some(after) if digits > 0 => rest = after,
            _ => {
                out.push_str("[Image #");
                rest = number;
            }
        }
    }
    out.push_str(rest);
    out.trim().to_string()
}

/// What a person typed, as they typed it: a slash command without the tags the
/// CLI wraps it in, and nothing for what the CLI wrote itself.
fn typed(text: &str) -> Option<String> {
    let text = text.trim();
    if let Some(name) = tagged(text, "command-name") {
        let args = tagged(text, "command-args").unwrap_or_default();
        return Some(
            format!("{} {}", name.trim(), args.trim())
                .trim()
                .to_string(),
        );
    }
    if let Some(command) = tagged(text, "bash-input") {
        return Some(format!("! {}", command.trim()));
    }
    // Past what `is_injected` already knows.
    const ALSO_WRITTEN_BY_THE_CLI: [&str; 6] = [
        "<task-notification",
        "<teammate-message",
        "<agent-message",
        "<bash-stdout",
        "<bash-stderr",
        "[Image: ",
    ];
    let also = |start: &&str| text.starts_with(start);
    if is_injected(text) || ALSO_WRITTEN_BY_THE_CLI.iter().any(also) {
        return None;
    }
    let text = without_tags(text, "pasted_content");
    let text = text.trim();
    (!text.is_empty()).then(|| text.to_string())
}

fn tagged<'a>(text: &'a str, tag: &str) -> Option<&'a str> {
    let open = format!("<{tag}>");
    let start = text.find(&open)? + open.len();
    let end = text[start..].find(&format!("</{tag}>"))? + start;
    Some(&text[start..end])
}

/// Without the `<tag …>` and `</tag …>` markers, keeping what's between them.
fn without_tags(text: &str, tag: &str) -> String {
    let (open, close) = (format!("<{tag}"), format!("</{tag}"));
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(at) = [rest.find(&open), rest.find(&close)]
        .into_iter()
        .flatten()
        .min()
    {
        let Some(end) = rest[at..].find('>') else {
            break;
        };
        out.push_str(&rest[..at]);
        rest = rest[at + end + 1..].trim_start_matches('\n');
    }
    out.push_str(rest);
    out
}

/// The results a user record carries, when that is what it is.
pub(crate) fn tool_results(content: Option<&Value>) -> Option<Vec<&Value>> {
    let results: Vec<&Value> = content?
        .as_array()?
        .iter()
        .filter(|block| str_of(block, "type") == "tool_result")
        .collect();
    (!results.is_empty()).then_some(results)
}

#[cfg(test)]
#[path = "agent_conversation_claude_tests.rs"]
mod tests;
