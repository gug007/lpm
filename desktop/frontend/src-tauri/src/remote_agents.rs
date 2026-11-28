// Phone-side agent tabs: what the New Tab sheet can start (`agentOptions`) and
// the past conversations it can pick back up (`agentSessions`).
//
// The agents and their models are the desktop's own lists, reported by the main
// window when it starts, so a model the desktop gains shows on the phone without
// a phone release. Sessions are the desktop's Resume session list: the agents'
// stores on disk, minus the rows hidden there, titled the way the desktop titles
// them. Opening the tab itself, new or resumed, is the main window's job and
// goes through the same relay as `runAction`.
use crate::agent_sessions::{list_agent_sessions, AgentSessionSummary};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::sync::mpsc::SyncSender;
use std::sync::{Mutex, OnceLock};

/// The phone may send `agentOptions`, and `newTerminal` with an agent.
pub const LAUNCH_FEATURE: &str = "agentLaunch";
/// The phone may send `agentSessions` and `resumeSession`.
pub const SESSIONS_FEATURE: &str = "agentSessions";
/// The phone may send `runAction` with a `prompt` for the agent the action opens.
pub const ACTION_PROMPT_FEATURE: &str = "actionPrompt";

/// The desktop picker's page size.
const DEFAULT_LIMIT: u64 = 40;
const MAIN_LOGIN: &str = "default";
const UNTITLED: &str = "Untitled session";

/// Live terminal id -> the past conversation its tab holds, for every agent
/// the list shows (`resumable` in the tab report). Claude's and Codex's are
/// also known from their live sessions; Gemini's, OpenCode's and Cursor's only
/// from the command the tab resumed them with.
fn resumable() -> &'static Mutex<HashMap<String, String>> {
    static TABS: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    TABS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Records what each tab the desktop just reported holds.
pub fn note_tabs(labels: &[Value]) {
    let mut tabs = resumable().lock().unwrap();
    for item in labels {
        let Some(id) = item.get("id").and_then(Value::as_str).filter(|s| !s.is_empty()) else {
            continue;
        };
        match item
            .get("resumable")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
        {
            Some(session) => tabs.insert(id.to_string(), session.to_string()),
            None => tabs.remove(id),
        };
    }
}

/// `open` (session id -> terminal id) plus what the project's live tabs
/// `ids` hold that their live sessions don't say.
pub fn with_resumed(mut open: HashMap<String, String>, ids: &[String]) -> HashMap<String, String> {
    let tabs = resumable().lock().unwrap();
    for id in ids {
        if let Some(session) = tabs.get(id) {
            open.entry(session.clone()).or_insert_with(|| id.clone());
        }
    }
    open
}

fn reported() -> &'static Mutex<Value> {
    static AGENTS: OnceLock<Mutex<Value>> = OnceLock::new();
    AGENTS.get_or_init(|| Mutex::new(json!([])))
}

/// The main window reports the agents a tab can start, with each one's models
/// and the levels each model takes.
#[tauri::command]
pub fn remote_set_agent_options(agents: Value) {
    if agents.is_array() {
        *reported().lock().unwrap() = agents;
    }
}

/// The reported agents as (id, label), in the desktop's order.
pub(crate) fn agent_labels() -> Vec<(String, String)> {
    reported()
        .lock()
        .unwrap()
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|a| {
            let id = a.get("id").and_then(Value::as_str).filter(|s| !s.is_empty())?;
            let label = a.get("label").and_then(Value::as_str).unwrap_or(id);
            Some((id.to_string(), label.to_string()))
        })
        .collect()
}

pub fn options_reply() -> Value {
    json!({ "t": "agentOptions", "agents": reported().lock().unwrap().clone() })
}

fn text(v: &Value, key: &str) -> String {
    v.get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default()
        .to_string()
}

/// The agent a `newTerminal` asks for, as the main window takes it; None for a
/// plain shell.
pub fn launch_request(v: &Value) -> Option<Value> {
    let agent = text(v, "agent");
    if agent.is_empty() {
        return None;
    }
    Some(json!({
        "agent": agent,
        "model": text(v, "model"),
        "effort": text(v, "effort"),
        "prompt": v.get("prompt").and_then(Value::as_str).unwrap_or_default(),
    }))
}

/// The conversation a `resumeSession` names; None when it names none.
pub fn resume_request(v: &Value) -> Option<Value> {
    let provider = text(v, "provider");
    let session_id = text(v, "sessionId");
    if provider.is_empty() || session_id.is_empty() {
        return None;
    }
    Some(json!({ "provider": provider, "sessionId": session_id, "title": text(v, "title") }))
}

/// Answer `agentSessions` through the out-queue: listing opens the newest
/// transcripts, which takes longer than a terminal's input may wait. `open` maps
/// each conversation live in one of the project's tabs to that tab.
pub fn sessions(out: &SyncSender<String>, v: &Value, open: HashMap<String, String>) {
    let project = text(v, "project");
    let search = text(v, "search");
    let limit = v
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(DEFAULT_LIMIT);
    // Replies run on threads and can land out of order, so each names the
    // query it answers.
    let asked = v.get("search").cloned().unwrap_or_else(|| json!(""));
    let out = out.clone();
    std::thread::spawn(move || {
        let mut reply = match list_agent_sessions(project.clone(), limit as usize, search) {
            Ok(page) => {
                let saved = saved_tabs(&project);
                let labels = crate::remote_claude::labels();
                let rows: Vec<Value> = page
                    .sessions
                    .iter()
                    .map(|s| SessionRow::new(s, &saved.history))
                    .filter(|row| !saved.hidden.contains(&row.key))
                    .map(|row| row.to_json(&open, &labels))
                    .collect();
                json!({ "ok": true, "sessions": rows, "hasMore": page.has_more })
            }
            Err(e) => json!({ "ok": false, "error": e }),
        };
        reply["t"] = json!("agentSessions");
        reply["project"] = json!(project);
        reply["search"] = asked;
        reply["limit"] = json!(limit);
        let _ = out.try_send(reply.to_string());
    });
}

/// What the desktop keeps about a project's tabs that the list depends on.
struct SavedTabs {
    /// Closed tabs, with any name the user gave them.
    history: Vec<Value>,
    /// Rows hidden from the desktop's list, by row key.
    hidden: Vec<String>,
}

fn saved_tabs(project: &str) -> SavedTabs {
    let all = crate::commands_real::load_terminals();
    let state = &all["projects"][project];
    SavedTabs {
        history: state["history"].as_array().cloned().unwrap_or_default(),
        hidden: state["hiddenSessions"]
            .as_array()
            .map(|keys| {
                keys.iter()
                    .filter_map(|k| k.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default(),
    }
}

/// One row as the desktop's picker shows it (mergeSessionRows): the name the
/// user gave its tab, else the agent's title, else the opening prompt, else the
/// closed tab's label. Closed tabs with no transcript behind them aren't listed,
/// since nothing names the conversation they'd resume.
struct SessionRow<'a> {
    key: String,
    session: &'a AgentSessionSummary,
    title: String,
    preview: String,
    updated_at: i64,
}

impl<'a> SessionRow<'a> {
    fn new(session: &'a AgentSessionSummary, history: &[Value]) -> Self {
        let entry = history.iter().find(|e| {
            e["resumeCmd"]
                .as_str()
                .is_some_and(|cmd| cmd.contains(&session.session_id))
        });
        let preview = clean_prompt(session.preview.as_deref());
        let title = row_title(session, entry, &preview);
        let updated_at = if session.updated_at > 0 {
            session.updated_at
        } else {
            entry.and_then(|e| e["closedAt"].as_i64()).unwrap_or(0)
        };
        Self {
            key: format!("{}:{}", session.provider, session.session_id),
            preview: if echoes_title(&title, &preview) {
                String::new()
            } else {
                preview
            },
            session,
            title,
            updated_at,
        }
    }

    fn to_json(&self, open: &HashMap<String, String>, labels: &HashMap<String, String>) -> Value {
        let mut row = Map::new();
        row.insert("key".into(), json!(self.key));
        row.insert("provider".into(), json!(self.session.provider));
        row.insert("sessionId".into(), json!(self.session.session_id));
        row.insert("title".into(), json!(self.title));
        row.insert("preview".into(), json!(self.preview));
        row.insert("updatedAt".into(), json!(self.updated_at));
        if let Some(branch) = self
            .session
            .git_branch
            .as_deref()
            .map(str::trim)
            .filter(|b| !b.is_empty())
        {
            row.insert("gitBranch".into(), json!(branch));
        }
        if let Some(account) = self.session.account.as_deref().filter(|a| *a != MAIN_LOGIN) {
            let label = labels
                .get(account)
                .map_or("Removed account", String::as_str);
            row.insert("account".into(), json!(label));
        }
        if let Some(tab) = open.get(&self.session.session_id) {
            row.insert("openIn".into(), json!(tab));
        }
        Value::Object(row)
    }
}

fn row_title(session: &AgentSessionSummary, entry: Option<&Value>, preview: &str) -> String {
    let manual = entry
        .filter(|e| e["sessionTitleSource"] == "manual")
        .and_then(|e| e["sessionTitle"].as_str())
        .filter(|t| !t.is_empty());
    if let Some(name) = manual {
        return name.to_string();
    }
    let named = clean_prompt(session.title.as_deref());
    if !named.is_empty() {
        return named;
    }
    if !preview.is_empty() {
        return preview.to_string();
    }
    entry
        .and_then(|e| {
            [&e["sessionTitle"], &e["label"]]
                .into_iter()
                .find_map(|v| v.as_str().filter(|s| !s.is_empty()))
        })
        .unwrap_or(UNTITLED)
        .to_string()
}

/// Pasting an image leaves `[Image #N]` in the transcript's opening prompt; it's
/// plumbing, not something a person wrote (sessionText.ts cleanPrompt).
fn clean_prompt(value: Option<&str>) -> String {
    let text = value.unwrap_or_default().trim();
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(at) = rest.find("[Image #") {
        let tail = &rest[at + "[Image #".len()..];
        let digits = tail.bytes().take_while(u8::is_ascii_digit).count();
        if digits > 0 && tail[digits..].starts_with(']') {
            out.push_str(&rest[..at]);
            out.push(' ');
            rest = &tail[digits + 1..];
        } else {
            out.push_str(&rest[..at + 1]);
            rest = &rest[at + 1..];
        }
    }
    out.push_str(rest);
    let stripped = out.split_whitespace().collect::<Vec<_>>().join(" ");
    if !stripped.is_empty() {
        stripped
    } else if !text.is_empty() {
        "Image prompt".into()
    } else {
        String::new()
    }
}

fn normalize(value: &str) -> String {
    value
        .to_lowercase()
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|w| !w.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

/// Whether the opening prompt would only restate the title (sessionText.ts
/// echoesTitle): the same words, or one cut short of the other.
fn echoes_title(title: &str, preview: &str) -> bool {
    let (a, b) = (normalize(title), normalize(preview));
    if a.is_empty() || b.is_empty() || a == b {
        return true;
    }
    let (short, long) = if a.len() < b.len() { (a, b) } else { (b, a) };
    long.starts_with(&short) && short.len() as f64 >= long.len() as f64 * 0.7
}

#[cfg(test)]
#[path = "remote_agents_tests.rs"]
mod tests;
