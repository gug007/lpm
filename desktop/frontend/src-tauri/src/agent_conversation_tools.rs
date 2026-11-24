//! How Claude Code's tool calls read as lines: "Reading page.tsx" while one runs,
//! "Read page.tsx" once it's done, with what it changed.
use crate::agent_conversation::{base_name, capped, flag, list, str_of, ToolCall, ToolState, What};
use crate::agent_sessions::content_text;
use serde_json::Value;

/// The longest command a line shows in place of what the agent said it's for.
const SHORT_COMMAND: usize = 48;
const SUBJECT_CHARS: usize = 120;
const DENIED: &str = "The user doesn't want to proceed";

/// The call as it starts. `None` for plumbing nobody reads a conversation for.
pub(crate) fn started(name: &str, input: &Value) -> Option<ToolCall> {
    let field = |key: &str| str_of(input, key);
    Some(match name {
        "ToolSearch" | "ListMcpResourcesTool" => return None,
        "Bash" | "PowerShell" => command(field("command"), field("description")),
        "Read" => ToolCall::file(What::Read, "Reading", field("file_path")).then("Read"),
        "Edit" | "MultiEdit" => {
            ToolCall::file(What::Edit, "Editing", field("file_path")).then("Edited")
        }
        "NotebookEdit" => {
            ToolCall::file(What::Edit, "Editing", field("notebook_path")).then("Edited")
        }
        "Write" => ToolCall::file(What::Edit, "Writing", field("file_path")).then("Wrote"),
        "Grep" | "Glob" => {
            let pattern = one_line(field("pattern"));
            ToolCall::new(What::Search, "Searching", pattern)
                .code()
                .then("Searched")
        }
        "WebSearch" => ToolCall::new(What::Search, "Searching the web", one_line(field("query")))
            .then("Searched the web"),
        "WebFetch" => {
            let url = one_line(field("url"));
            ToolCall::new(What::Other, "Fetching", url)
                .code()
                .then("Fetched")
        }
        "Agent" | "Task" => {
            let task = one_line(field("description"));
            ToolCall::new(What::Other, "Running agent", task).then("Ran agent")
        }
        "Skill" => {
            let skill = field("skill").trim_start_matches('/');
            let call = ToolCall::new(What::Other, "Using skill", format!("/{skill}"));
            call.code().then("Used skill")
        }
        "AskUserQuestion" => {
            ToolCall::new(What::Other, "Asking", first_question(input)).then("Asked")
        }
        "EnterPlanMode" => ToolCall::new(What::Other, "Planning", "").then("Started planning"),
        "ExitPlanMode" => {
            ToolCall::new(What::Other, "Proposing a plan", "").then("Proposed a plan")
        }
        "TodoWrite" | "TaskCreate" | "TaskUpdate" => {
            let call = ToolCall::new(What::Other, "Updating the to-do list", "");
            call.then("Updated the to-do list")
        }
        "SendMessage" => {
            ToolCall::new(What::Other, "Messaging", one_line(field("to"))).then("Messaged")
        }
        "TaskStop" | "KillShell" | "KillBash" => {
            let call = ToolCall::new(What::Other, "Stopping a background task", "");
            call.then("Stopped a background task")
        }
        "TaskOutput" | "BashOutput" | "Monitor" => {
            let call = ToolCall::new(What::Other, "Checking a background task", "");
            call.then("Checked a background task")
        }
        _ => other(name),
    })
}

/// The call once its result is in.
pub(crate) fn finished(call: &mut ToolCall, result: &Value, detail: Option<&Value>) {
    if flag(result, "is_error") {
        call.over(ToolState::Failed);
        call.note = failure(&result_text(result));
        return;
    }
    call.over(ToolState::Done);
    let Some(detail) = detail else {
        return;
    };
    if let Some(patch) = detail.get("structuredPatch").and_then(Value::as_array) {
        if patch.is_empty() && str_of(detail, "type") == "create" {
            call.verb = "Created".into();
            call.note = lines(str_of(detail, "content").lines().count());
        } else {
            let (added, removed) = counts(patch);
            call.verb = "Edited".into();
            (call.added, call.removed) = (Some(added), Some(removed));
        }
    } else if flag(detail, "isAsync") {
        call.verb = "Started agent".into();
    } else if detail.get("backgroundTaskId").is_some() {
        call.note = "in the background".into();
    } else if let Some(answers) = detail.get("answers").and_then(Value::as_object) {
        call.note = answers
            .values()
            .filter_map(Value::as_str)
            .collect::<Vec<_>>()
            .join(", ");
    }
}

/// The call of a turn that ended without its result.
pub(crate) fn stopped(call: &mut ToolCall) {
    call.over(ToolState::Failed);
    call.note = "stopped".into();
}

/// A command as a line. Agents run long ones, and say in a few words what each
/// is for, which is what reads on a phone; a short command speaks for itself.
fn command(command: &str, description: &str) -> ToolCall {
    let short = short_command(command);
    let fits = short.chars().count() <= SHORT_COMMAND && !command.trim().contains('\n');
    if fits || description.trim().is_empty() {
        return ToolCall::new(What::Run, "Running", short)
            .code()
            .then("Ran");
    }
    ToolCall::new(What::Run, "Running", one_line(description)).then("Ran")
}

/// Without the `cd` agents open their commands with, and on one line.
pub(crate) fn short_command(command: &str) -> String {
    let mut rest = command.trim();
    while let Some(after) = rest.strip_prefix("cd ") {
        let Some(at) = after.find("&&").or_else(|| after.find([';', '\n'])) else {
            break;
        };
        if after[..at].contains('\n') {
            break;
        }
        rest = after[at..].trim_start_matches(['&', ';', '\n', ' ']);
    }
    one_line(rest)
}

fn other(name: &str) -> ToolCall {
    let Some((server, tool)) = name
        .strip_prefix("mcp__")
        .and_then(|rest| rest.split_once("__"))
    else {
        return ToolCall::new(What::Other, "Using", name)
            .code()
            .then("Used");
    };
    let mut call = ToolCall::new(What::Other, "Using", tool)
        .code()
        .then("Used");
    call.note = server.replace('_', " ");
    call
}

fn first_question(input: &Value) -> String {
    let question = list(input, "questions").next();
    one_line(question.map_or("", |question| str_of(question, "question")))
}

fn counts(patch: &[Value]) -> (usize, usize) {
    let lines = patch
        .iter()
        .flat_map(|hunk| list(hunk, "lines"))
        .filter_map(Value::as_str);
    let (mut added, mut removed) = (0, 0);
    for line in lines {
        match line.as_bytes().first() {
            Some(b'+') => added += 1,
            Some(b'-') => removed += 1,
            _ => {}
        }
    }
    (added, removed)
}

fn failure(text: &str) -> String {
    if text.starts_with(DENIED) {
        return "denied".into();
    }
    match text
        .strip_prefix("Exit code ")
        .and_then(|rest| rest.lines().next())
    {
        Some(code) => format!("exit {}", code.trim()),
        None => "failed".into(),
    }
}

pub(crate) fn result_text(result: &Value) -> String {
    let content = result.get("content");
    content
        .and_then(|content| content_text(content, "\n"))
        .unwrap_or_default()
}

pub(crate) fn lines(count: usize) -> String {
    if count == 1 {
        "1 line".into()
    } else {
        format!("{count} lines")
    }
}

/// The first line that says something, cut to what a line can hold.
pub(crate) fn one_line(text: &str) -> String {
    let line = text.lines().map(str::trim).find(|line| !line.is_empty());
    capped(line.unwrap_or_default(), SUBJECT_CHARS)
}

/// The file a path names, or how many there are.
pub(crate) fn files(paths: &[&str]) -> String {
    match paths {
        [one] => base_name(one).to_string(),
        many => format!("{} files", many.len()),
    }
}

#[cfg(test)]
#[path = "agent_conversation_tools_tests.rs"]
mod tests;
