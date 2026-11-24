//! Codex's rollout as conversation entries. Codex writes each thing that
//! happened as one typed `item_completed` record once it's over, with the raw
//! model traffic beside it; only a rollout from before those records is read
//! from the traffic itself.
use crate::agent_conversation::{
    capped, list, str_of, Body, Item, ToolCall, ToolState, What, PROMPT_CHARS, TEXT_CHARS,
};
use crate::agent_conversation_tools::{files, lines, one_line, short_command};
use serde_json::Value;

#[derive(Default)]
pub(crate) struct CodexParser {
    items: Vec<Item>,
    /// From the model traffic, until the first typed record shows this rollout
    /// has them.
    untyped: Vec<Item>,
    typed: bool,
    /// Turns were taken away from before what was read.
    lost: bool,
}

impl CodexParser {
    pub(crate) fn items(&self) -> &[Item] {
        if self.typed {
            &self.items
        } else {
            &self.untyped
        }
    }

    pub(crate) fn lost(&self) -> bool {
        self.lost
    }

    pub(crate) fn feed(&mut self, line: &str) {
        if !matters(line, self.typed) {
            return;
        }
        let Ok(record) = serde_json::from_str::<Value>(line) else {
            return;
        };
        let Some(payload) = record.get("payload") else {
            return;
        };
        match str_of(payload, "type") {
            "item_completed" => self.completed(payload),
            "turn_aborted" => {
                let id = format!("{}:aborted", str_of(payload, "turn_id"));
                self.push(id, notice("Interrupted"));
            }
            "thread_rolled_back" => {
                let turns = payload.get("num_turns").and_then(Value::as_u64);
                self.drop_turns(turns.unwrap_or(0) as usize);
            }
            "message" => self.message(&record, payload),
            _ => {}
        }
    }

    fn completed(&mut self, payload: &Value) {
        let Some(item) = payload.get("item") else {
            return;
        };
        // What the window's traffic held before this is the same conversation.
        if !self.typed {
            self.typed = true;
            self.untyped.clear();
        }
        let id = item_id(payload, item);
        match str_of(item, "type") {
            "UserMessage" => {
                let text = texts(item).join("\n\n");
                let images = list(item, "content")
                    .filter(|block| str_of(block, "type").contains("image"))
                    .count();
                if !text.is_empty() || images > 0 {
                    let text = capped(&text, PROMPT_CHARS);
                    self.push(id, Body::Prompt { text, images });
                }
            }
            "AgentMessage" => self.said(id, &texts(item).join("\n\n")),
            "Plan" => self.said(id, str_of(item, "text")),
            "CommandExecution" => self.push(id, Body::Tool(command_run(item))),
            "FileChange" => {
                for (n, call) in file_changes(item).into_iter().enumerate() {
                    self.push(format!("{id}#{n}"), Body::Tool(call));
                }
            }
            "McpToolCall" => {
                let mut call = ToolCall::new(What::Other, "Used", str_of(item, "tool")).code();
                call.note = str_of(item, "server").replace('_', " ");
                call.state = state(item);
                self.push(id, Body::Tool(call));
            }
            "Extension" if str_of(item, "kind") == "web.search" => {
                if let Some(call) = web_search(item) {
                    self.push(id, Body::Tool(call));
                }
            }
            "ImageView" => {
                let call = ToolCall::file(What::Read, "Viewed", str_of(item, "path"));
                self.push(id, Body::Tool(call));
            }
            "SubAgentActivity" if str_of(item, "kind") == "started" => {
                let agent = str_of(item, "agent_path")
                    .rsplit('/')
                    .next()
                    .unwrap_or_default();
                let call = ToolCall::new(What::Other, "Started agent", agent);
                self.push(id, Body::Tool(call));
            }
            "ContextCompaction" => self.push(id, notice("Conversation compacted")),
            _ => {}
        }
    }

    fn message(&mut self, record: &Value, payload: &Value) {
        if self.typed {
            return;
        }
        let text = texts(payload).join("\n\n");
        let id = self.untyped_id(str_of(record, "timestamp"));
        let body = match str_of(payload, "role") {
            "user" if !injected(&text) => Body::Prompt {
                text: capped(&text, PROMPT_CHARS),
                images: 0,
            },
            "assistant" if !text.trim().is_empty() => Body::Text {
                text: capped(text.trim(), TEXT_CHARS),
            },
            _ => return,
        };
        self.untyped.push(Item { id, body });
    }

    /// The same wherever the reading started: several can share a time.
    fn untyped_id(&self, timestamp: &str) -> String {
        let same = |item: &&Item| item.id.rsplit_once(':').map(|(at, _)| at) == Some(timestamp);
        let n = self.untyped.iter().rev().take_while(same).count();
        format!("{timestamp}:{n}")
    }

    fn said(&mut self, id: String, text: &str) {
        let text = text.trim();
        if !text.is_empty() {
            let text = capped(text, TEXT_CHARS);
            self.push(id, Body::Text { text });
        }
    }

    /// Going back takes the last turns away, each from its prompt on.
    fn drop_turns(&mut self, turns: usize) {
        for _ in 0..turns {
            let prompt = |item: &Item| matches!(item.body, Body::Prompt { .. });
            let Some(at) = self.items.iter().rposition(prompt) else {
                self.lost = true;
                return;
            };
            self.items.truncate(at);
        }
    }

    fn push(&mut self, id: String, body: Body) {
        self.items.push(Item { id, body });
    }
}

fn matters(line: &str, typed: bool) -> bool {
    line.contains("\"item_completed\"")
        || line.contains("\"turn_aborted\"")
        || line.contains("\"thread_rolled_back\"")
        || (!typed && line.contains("\"type\":\"message\""))
}

/// An item is numbered within its turn.
pub(crate) fn item_id(payload: &Value, item: &Value) -> String {
    format!("{}:{}", str_of(payload, "turn_id"), str_of(item, "id"))
}

fn notice(text: &str) -> Body {
    Body::Notice { text: text.into() }
}

fn texts(value: &Value) -> Vec<String> {
    list(value, "content")
        .filter_map(|block| block.get("text")?.as_str())
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
        .collect()
}

/// Codex opens a session with its instructions and surroundings in user messages.
fn injected(text: &str) -> bool {
    let text = text.trim_start();
    text.is_empty() || text.starts_with('<') || text.starts_with("# AGENTS.md instructions")
}

fn state(item: &Value) -> ToolState {
    match str_of(item, "status") {
        "failed" | "declined" => ToolState::Failed,
        "in_progress" | "inProgress" => ToolState::Running,
        _ => ToolState::Done,
    }
}

fn command_run(item: &Value) -> ToolCall {
    let parsed: Vec<&Value> = list(item, "parsed_cmd").collect();
    let every = |kind: &str| !parsed.is_empty() && parsed.iter().all(|p| str_of(p, "type") == kind);
    let mut call = if every("read") {
        let paths: Vec<&str> = parsed.iter().map(|p| str_of(p, "path")).collect();
        let mut call = ToolCall::new(What::Read, "Read", files(&paths)).code();
        if let [one] = paths[..] {
            call.path = absolute(one, str_of(item, "cwd"));
        }
        call
    } else if every("search") {
        ToolCall::new(
            What::Search,
            "Searched",
            one_line(str_of(parsed[0], "query")),
        )
        .code()
    } else if every("list_files") {
        match one_line(str_of(parsed[0], "path")) {
            path if path.is_empty() => ToolCall::new(What::Search, "Listed", "files"),
            path => ToolCall::new(What::Search, "Listed", path).code(),
        }
    } else {
        ToolCall::new(What::Run, "Ran", short_command(&script(item))).code()
    };
    call.state = state(item);
    if let Some(code) = item.get("exit_code").and_then(Value::as_i64) {
        if code != 0 && call.state == ToolState::Failed {
            call.note = format!("exit {code}");
        }
    } else if str_of(item, "status") == "declined" {
        call.note = "denied".into();
    }
    call
}

/// What the shell was given to run.
pub(crate) fn script(item: &Value) -> String {
    let words: Vec<&str> = list(item, "command").filter_map(Value::as_str).collect();
    match words[..] {
        [_, flag, script] if flag.starts_with('-') || flag.starts_with('/') => script.to_string(),
        _ => words.join(" "),
    }
}

/// Codex names a file as its command did, from the folder it ran in.
fn absolute(path: &str, cwd: &str) -> String {
    let rooted = path.starts_with(['/', '\\', '~']) || path.as_bytes().get(1) == Some(&b':');
    if rooted || cwd.is_empty() {
        return path.to_string();
    }
    format!("{}/{path}", cwd.trim_end_matches(['/', '\\']))
}

/// Each file of a change, in the order of their paths.
fn file_changes(item: &Value) -> Vec<ToolCall> {
    let Some(changes) = item.get("changes").and_then(Value::as_object) else {
        return Vec::new();
    };
    changes
        .iter()
        .map(|(path, change)| {
            let mut call = ToolCall::file(What::Edit, "Edited", path);
            match str_of(change, "type") {
                "add" => {
                    call.verb = "Created".into();
                    call.note = lines(str_of(change, "content").lines().count());
                }
                "delete" => call.verb = "Deleted".into(),
                _ => {
                    let (added, removed) = diff_counts(str_of(change, "unified_diff"));
                    (call.added, call.removed) = (Some(added), Some(removed));
                }
            }
            call.state = state(item);
            call
        })
        .collect()
}

fn diff_counts(diff: &str) -> (usize, usize) {
    let counted = |sign: char, header: &str| {
        diff.lines()
            .filter(|line| line.starts_with(sign) && !line.starts_with(header))
            .count()
    };
    (counted('+', "+++ "), counted('-', "--- "))
}

fn web_search(item: &Value) -> Option<ToolCall> {
    let action = item.get("action").unwrap_or(&Value::Null);
    let url = str_of(action, "url");
    if !url.is_empty() {
        return Some(ToolCall::new(What::Other, "Fetched", one_line(url)).code());
    }
    let query = str_of(item, "query");
    (!query.is_empty()).then(|| ToolCall::new(What::Search, "Searched the web", one_line(query)))
}

#[cfg(test)]
#[path = "agent_conversation_codex_tests.rs"]
mod tests;
