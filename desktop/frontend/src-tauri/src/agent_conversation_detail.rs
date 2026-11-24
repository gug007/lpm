//! What one tool call was given and what came back, read when its line is opened:
//! the list itself carries only the line.
use crate::agent_conversation::{capped, flag, list, str_of, Transcript};
use crate::agent_conversation_claude::tool_results;
use crate::agent_conversation_codex::{item_id, script};
use crate::agent_conversation_tools::result_text;
use crate::agent_session_titles::AgentProvider;
use serde::Serialize;
use serde_json::Value;
use std::fs::File;
use std::io::{self, BufRead, BufReader};

/// What a phone has room to read. Output keeps its end, where a command says how
/// it went.
const PART_CHARS: usize = 6_000;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub(crate) struct Part {
    #[serde(skip_serializing_if = "String::is_empty")]
    pub(crate) label: String,
    pub(crate) style: Style,
    pub(crate) text: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Style {
    Code,
    Diff,
    Markdown,
}

/// The parts of the call `id` names; empty when there is nothing more to show
/// than its line. `None` when the conversation no longer has it.
pub(crate) fn read(transcript: &Transcript, id: &str) -> io::Result<Option<Vec<Part>>> {
    match transcript.provider {
        AgentProvider::Claude => claude(transcript, id),
        AgentProvider::Codex => codex(transcript, id),
    }
}

fn claude(transcript: &Transcript, id: &str) -> io::Result<Option<Vec<Part>>> {
    let mut call: Option<(String, Vec<Part>)> = None;
    each_line_with(transcript, id, |line| {
        let Ok(record) = serde_json::from_str::<Value>(line) else {
            return true;
        };
        let content = record.get("message").and_then(|m| m.get("content"));
        if let Some((name, input)) = tool_use(content, id) {
            call = Some((
                name.to_string(),
                claude_input(name, input).into_iter().collect(),
            ));
            return true;
        }
        let result = tool_results(content)
            .into_iter()
            .flatten()
            .find(|result| str_of(result, "tool_use_id") == id);
        let (Some(result), Some((name, parts))) = (result, &mut call) else {
            return true;
        };
        claude_result(parts, name, result, record.get("toolUseResult"));
        false
    })?;
    Ok(call.map(|(_, parts)| parts))
}

fn tool_use<'a>(content: Option<&'a Value>, id: &str) -> Option<(&'a str, &'a Value)> {
    let block = content?
        .as_array()?
        .iter()
        .find(|block| str_of(block, "type") == "tool_use" && str_of(block, "id") == id)?;
    Some((
        str_of(block, "name"),
        block.get("input").unwrap_or(&Value::Null),
    ))
}

fn claude_input(name: &str, input: &Value) -> Option<Part> {
    let field = |key: &str| str_of(input, key);
    match name {
        "Bash" | "PowerShell" => part("Command", Style::Code, field("command")),
        "Read" | "Edit" | "MultiEdit" | "Write" => part("File", Style::Code, field("file_path")),
        "NotebookEdit" => part("File", Style::Code, field("notebook_path")),
        "Grep" | "Glob" => part("Pattern", Style::Code, field("pattern")),
        "WebSearch" => part("Search", Style::Markdown, field("query")),
        "WebFetch" => part("Page", Style::Code, field("url")),
        "Agent" | "Task" => part("Task", Style::Markdown, field("prompt")),
        "SendMessage" => part("Message", Style::Markdown, field("message")),
        "ExitPlanMode" => part("", Style::Markdown, field("plan")),
        "AskUserQuestion" => part("", Style::Markdown, &questions(input)),
        "TodoWrite" => part("", Style::Markdown, &todos(input)),
        "Skill" => part("Arguments", Style::Markdown, field("args")),
        _ => match input.as_object() {
            Some(fields) if !fields.is_empty() => part("Input", Style::Code, &pretty(input)),
            _ => None,
        },
    }
}

fn claude_result(parts: &mut Vec<Part>, name: &str, result: &Value, detail: Option<&Value>) {
    let failed = flag(result, "is_error");
    if let Some(patch) = detail.and_then(|d| d.get("structuredPatch")?.as_array()) {
        let diff = patch_text(patch);
        if diff.is_empty() {
            let content = detail.map(|d| str_of(d, "content")).unwrap_or_default();
            parts.extend(part("Contents", Style::Code, content));
        } else {
            parts.extend(part("", Style::Diff, &diff));
        }
        return;
    }
    if let Some(answers) = detail.and_then(|d| d.get("answers")?.as_object()) {
        let text = answers
            .iter()
            .map(|(question, answer)| format!("**{question}**\n{}", answer.as_str().unwrap_or("")))
            .collect::<Vec<_>>()
            .join("\n\n");
        *parts = part("", Style::Markdown, &text).into_iter().collect();
        return;
    }
    // What a file holds is a tap away in the file itself.
    if name == "Read" && !failed {
        return;
    }
    let text = match detail {
        Some(detail) if detail.get("stdout").is_some() => {
            [str_of(detail, "stdout"), str_of(detail, "stderr")]
                .iter()
                .map(|text| text.trim_end())
                .filter(|text| !text.is_empty())
                .collect::<Vec<_>>()
                .join("\n")
        }
        _ => result_text(result),
    };
    let label = if failed { "Error" } else { "Output" };
    let style = match name {
        "Agent" | "Task" | "WebFetch" | "WebSearch" if !failed => Style::Markdown,
        _ => Style::Code,
    };
    parts.extend(ending_part(label, style, &text));
}

fn questions(input: &Value) -> String {
    list(input, "questions")
        .map(|question| {
            let options = list(question, "options")
                .map(|option| format!("- {}", str_of(option, "label")))
                .collect::<Vec<_>>()
                .join("\n");
            format!("**{}**\n{options}", str_of(question, "question"))
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn todos(input: &Value) -> String {
    list(input, "todos")
        .map(|todo| match str_of(todo, "status") {
            "completed" => format!("- ✓ {}", str_of(todo, "content")),
            _ => format!("- {}", str_of(todo, "content")),
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn patch_text(patch: &[Value]) -> String {
    patch
        .iter()
        .map(|hunk| {
            let number = |key: &str| hunk.get(key).and_then(Value::as_u64).unwrap_or(0);
            let lines = list(hunk, "lines")
                .filter_map(Value::as_str)
                .collect::<Vec<_>>()
                .join("\n");
            format!(
                "@@ -{},{} +{},{} @@\n{lines}",
                number("oldStart"),
                number("oldLines"),
                number("newStart"),
                number("newLines"),
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// An item of several files gets an entry per file, told apart after a `#`.
fn codex(transcript: &Transcript, id: &str) -> io::Result<Option<Vec<Part>>> {
    let (whole, nth) = match id.rsplit_once('#') {
        Some((whole, nth)) => (whole, nth.parse::<usize>().unwrap_or(0)),
        None => (id, 0),
    };
    let own = whole.rsplit_once(':').map_or(whole, |(_, own)| own);
    let mut found = None;
    each_line_with(transcript, own, |line| {
        if !line.contains("\"item_completed\"") {
            return true;
        }
        let Ok(record) = serde_json::from_str::<Value>(line) else {
            return true;
        };
        let Some((payload, item)) = record
            .get("payload")
            .and_then(|payload| Some((payload, payload.get("item")?)))
        else {
            return true;
        };
        if item_id(payload, item) != whole {
            return true;
        }
        found = Some(codex_parts(item, nth));
        false
    })?;
    Ok(found)
}

fn codex_parts(item: &Value, nth: usize) -> Vec<Part> {
    let mut parts = Vec::new();
    match str_of(item, "type") {
        "CommandExecution" => {
            parts.extend(part("Command", Style::Code, &script(item)));
            let output = ["aggregated_output", "formatted_output", "stdout"]
                .iter()
                .map(|key| str_of(item, key))
                .find(|text| !text.is_empty());
            parts.extend(ending_part(
                "Output",
                Style::Code,
                output.unwrap_or_default(),
            ));
        }
        "FileChange" => {
            let change = item.get("changes").and_then(Value::as_object);
            if let Some((path, change)) = change.and_then(|changes| changes.iter().nth(nth)) {
                parts.extend(part("File", Style::Code, path));
                parts.extend(part("", Style::Diff, str_of(change, "unified_diff")));
                parts.extend(part("Contents", Style::Code, str_of(change, "content")));
            }
        }
        "McpToolCall" => {
            if let Some(arguments) = item.get("arguments").filter(|a| !a.is_null()) {
                parts.extend(part("Input", Style::Code, &pretty(arguments)));
            }
            let result = item.get("result").unwrap_or(&Value::Null);
            let text = match result_text(result) {
                text if !text.is_empty() => text,
                _ => str_of(item, "error").to_string(),
            };
            parts.extend(ending_part("Output", Style::Code, &text));
        }
        "ImageView" => parts.extend(part("File", Style::Code, str_of(item, "path"))),
        "Extension" => parts.extend(part("Search", Style::Markdown, str_of(item, "query"))),
        _ => {}
    }
    parts
}

fn part(label: &str, style: Style, text: &str) -> Option<Part> {
    let text = text.trim_end();
    (!text.trim().is_empty()).then(|| Part {
        label: label.to_string(),
        style,
        text: capped(text, PART_CHARS),
    })
}

fn ending_part(label: &str, style: Style, text: &str) -> Option<Part> {
    let text = text.trim_end();
    let over = text.chars().count().saturating_sub(PART_CHARS);
    let mut part = part(label, style, text)?;
    if let Some((at, _)) = text.char_indices().nth(over).filter(|_| over > 0) {
        part.text = format!("…{}", &text[at..]);
    }
    Some(part)
}

fn pretty(value: &Value) -> String {
    serde_json::to_string_pretty(value).unwrap_or_default()
}

/// The transcript's lines that hold `needle`, until `visit` says to stop. They run
/// to megabytes, so the rest are passed over unparsed.
fn each_line_with(
    transcript: &Transcript,
    needle: &str,
    mut visit: impl FnMut(&str) -> bool,
) -> io::Result<()> {
    let mut reader = BufReader::with_capacity(256 << 10, File::open(&transcript.path)?);
    let mut line = Vec::new();
    loop {
        line.clear();
        if reader.read_until(b'\n', &mut line)? == 0 {
            return Ok(());
        }
        let text = String::from_utf8_lossy(&line);
        if text.contains(needle) && !visit(&text) {
            return Ok(());
        }
    }
}

#[cfg(test)]
#[path = "agent_conversation_detail_tests.rs"]
mod tests;
