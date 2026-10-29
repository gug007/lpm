//! Answering an agent from a phone notification: allowing or denying the
//! permission prompt it waits on, or replying to the turn it finished. The
//! notification names the status report it was sent for, and the Mac types into
//! the terminal only while that report still stands — a late tap must never land
//! in whatever the agent shows by then.
use super::RemoteHub;
use crate::agentkind::AgentKind;
use crate::status::{is_live, now_millis, StatusEntry, StatusStore, STATUS_DONE, STATUS_WAITING};
use serde_json::{json, Value};
use std::sync::mpsc::SyncSender;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

/// The phone may send `answerAgent`.
pub(super) const FEATURE: &str = "answerAgent";

const ALLOW: &str = "allow";
const DENY: &str = "deny";
const REPLY: &str = "reply";

/// Anything longer belongs in the app's composer.
const MAX_REPLY_CHARS: usize = 4000;

/// Enter landing while an agent redraws a pasted line is swallowed
/// (components/terminal/submitGate.ts), so it waits for the screen to go quiet,
/// and goes again once if nothing at all redrew after it.
const QUIET: Duration = Duration::from_millis(150);
const QUIET_CEILING: Duration = Duration::from_millis(1500);
const ENTER_VERIFY: Duration = Duration::from_millis(500);

struct Request {
    project: String,
    terminal: String,
    key: String,
    ts: i64,
    action: String,
    text: String,
}

/// The answers a notification about `entry` may offer. Allow and Deny are Enter
/// and Esc on the dialog, which is what Claude Code's and Codex's permission
/// prompts take; a question form, an MCP dialog and other agents' prompts need
/// the app. Any agent that finished its turn takes a reply.
pub(super) fn actions(entry: &StatusEntry) -> Vec<&'static str> {
    match entry.value.as_str() {
        STATUS_WAITING if permission_prompt(entry) => vec![ALLOW, DENY],
        STATUS_DONE if AgentKind::of_key(&entry.key).is_some() => vec![REPLY],
        _ => Vec::new(),
    }
}

fn permission_prompt(entry: &StatusEntry) -> bool {
    !entry.form
        && !entry.held
        && matches!(
            AgentKind::of_key(&entry.key),
            Some(AgentKind::Claude | AgentKind::Codex)
        )
}

/// Answer off the read loop: a reply waits on the agent's screen before Enter.
pub(super) fn handle(hub: &RemoteHub, app: &AppHandle, out: &SyncSender<String>, v: &Value) {
    let field = |k: &str| {
        v.get(k)
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string()
    };
    let request = Request {
        project: field("project"),
        terminal: field("terminalId"),
        key: field("key"),
        ts: v.get("ts").and_then(Value::as_i64).unwrap_or(0),
        action: field("action"),
        text: field("text"),
    };
    let req_id = v.get("reqId").cloned().unwrap_or(Value::Null);
    let (hub, app, out) = (hub.clone(), app.clone(), out.clone());
    std::thread::spawn(move || {
        let mut reply = match answer(&hub, &app, &request) {
            Ok(()) => json!({ "ok": true }),
            Err(e) => json!({ "ok": false, "error": e }),
        };
        reply["t"] = json!("answerAgent");
        if !req_id.is_null() {
            reply["reqId"] = req_id;
        }
        let _ = out.try_send(reply.to_string());
    });
}

fn answer(hub: &RemoteHub, app: &AppHandle, r: &Request) -> Result<(), String> {
    if r.project.is_empty() || r.terminal.is_empty() {
        return Err("This notification doesn't name a terminal.".into());
    }
    let entries = app.state::<Arc<StatusStore>>().list(&r.project);
    match r.action.as_str() {
        ALLOW | DENY => {
            prompt_still_open(&entries, r)?;
            let key = if r.action == ALLOW { "\r" } else { "\x1b" };
            crate::pty::remote_write(app, &r.terminal, key).map_err(|_| gone())
        }
        REPLY => {
            let text = reply_text(&r.text)?;
            ready_for_reply(&entries, &r.terminal)?;
            let session = crate::pty::session(&app.state::<crate::pty::PtyState>(), &r.terminal)
                .ok_or_else(gone)?;
            agent_still_there(session.shell_at_prompt(), &entries, r)?;
            type_reply(hub, app, &r.terminal, &text)?;
            remember(hub, app, r, text);
            Ok(())
        }
        _ => Err("This answer isn't one lpm knows.".into()),
    }
}

fn gone() -> String {
    "The terminal is closed.".into()
}

fn prompt_still_open(entries: &[StatusEntry], r: &Request) -> Result<(), String> {
    let open = entries.iter().any(|e| {
        e.key == r.key
            && e.pane_id == r.terminal
            && e.value == STATUS_WAITING
            && e.timestamp == r.ts
            && permission_prompt(e)
    });
    if open {
        Ok(())
    } else {
        Err("This prompt was already answered.".into())
    }
}

fn reply_text(text: &str) -> Result<String, String> {
    let text = text.trim();
    if text.is_empty() {
        return Err("Type a reply first.".into());
    }
    if text.chars().count() > MAX_REPLY_CHARS {
        return Err("That's too long for a reply here. Open the tab to send it.".into());
    }
    Ok(text.to_string())
}

/// A reply goes only to an agent sitting at its prompt: typed into a dialog it
/// would pick an option, and one that took up new work has moved on from what
/// the notification said.
fn ready_for_reply(entries: &[StatusEntry], terminal: &str) -> Result<(), String> {
    let on_pane = || entries.iter().filter(|e| e.pane_id == terminal);
    if on_pane().any(|e| e.value == STATUS_WAITING) {
        return Err("The agent is waiting on a prompt. Open the tab to answer it.".into());
    }
    if on_pane().any(|e| is_live(&e.value)) {
        return Err("The agent is working again. Open the tab to reply.".into());
    }
    Ok(())
}

/// Once the agent quits, its tab is a plain shell that would run the reply as a
/// command. Where the shell can't be watched (Windows, an SSH tab), the finish
/// the notification reported must still stand, as the notification itself does.
fn agent_still_there(
    shell_at_prompt: Option<bool>,
    entries: &[StatusEntry],
    r: &Request,
) -> Result<(), String> {
    let reported = || {
        entries.iter().any(|e| {
            e.key == r.key
                && e.pane_id == r.terminal
                && e.value == STATUS_DONE
                && e.timestamp == r.ts
        })
    };
    match shell_at_prompt {
        Some(true) => Err("The agent has exited. Open the tab to reply.".into()),
        Some(false) => Ok(()),
        None if reported() => Ok(()),
        None => Err("This notification is out of date. Open the tab to reply.".into()),
    }
}

fn type_reply(hub: &RemoteHub, app: &AppHandle, terminal: &str, text: &str) -> Result<(), String> {
    let write = |data: &str| crate::pty::remote_write(app, terminal, data).map_err(|_| gone());
    if !hub.bracketed_paste(terminal) {
        let line = text.split_whitespace().collect::<Vec<_>>().join(" ");
        return write(&format!("{line}\r"));
    }
    let body = text
        .replace('\x1b', "␛")
        .replace("\r\n", "\r")
        .replace('\n', "\r");
    write(&format!("\x1b[200~{body}\x1b[201~"))?;
    let session = crate::pty::session(&app.state::<crate::pty::PtyState>(), terminal);
    if let Some(s) = &session {
        wait_quiet(|| s.last_output());
    }
    let enter_at = now_millis();
    write("\r")?;
    if let Some(s) = &session {
        std::thread::sleep(ENTER_VERIFY);
        if s.last_output() < enter_at {
            write("\r")?;
        }
    }
    Ok(())
}

fn wait_quiet(last_output: impl Fn() -> i64) {
    let start = Instant::now();
    std::thread::sleep(QUIET);
    while start.elapsed() < QUIET_CEILING {
        if now_millis() - last_output() >= QUIET.as_millis() as i64 {
            return;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}

/// A reply joins the shared prompt history, as one sent from the composer does.
fn remember(hub: &RemoteHub, app: &AppHandle, r: &Request, text: String) {
    let label = hub
        .inner
        .labels
        .lock()
        .unwrap()
        .get(&r.terminal)
        .cloned()
        .unwrap_or_default();
    let input = crate::message_history::AddInput {
        text,
        project_name: r.project.clone(),
        terminal_id: r.terminal.clone(),
        terminal_label: label,
        images: Default::default(),
    };
    let _ = crate::message_history::message_history_add(
        app.state::<crate::message_history::MessageHistoryState>(),
        input,
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(key: &str, value: &str) -> StatusEntry {
        StatusEntry {
            key: key.into(),
            value: value.into(),
            pane_id: "term-1".into(),
            timestamp: 100,
            ..Default::default()
        }
    }

    fn request(action: &str) -> Request {
        Request {
            project: "web".into(),
            terminal: "term-1".into(),
            key: "claude_code_s1".into(),
            ts: 100,
            action: action.into(),
            text: String::new(),
        }
    }

    #[test]
    fn a_plain_permission_prompt_offers_allow_and_deny() {
        assert_eq!(
            actions(&entry("claude_code_s1", STATUS_WAITING)),
            vec![ALLOW, DENY]
        );
        assert_eq!(
            actions(&entry("codex_s1", STATUS_WAITING)),
            vec![ALLOW, DENY]
        );
    }

    #[test]
    fn forms_dialogs_and_other_agents_need_the_app() {
        let mut form = entry("claude_code_s1", STATUS_WAITING);
        form.form = true;
        let mut held = entry("claude_code_s1", STATUS_WAITING);
        held.held = true;
        assert!(actions(&form).is_empty());
        assert!(actions(&held).is_empty());
        assert!(actions(&entry("gemini_s1", STATUS_WAITING)).is_empty());
    }

    #[test]
    fn a_finished_agent_takes_a_reply_and_an_error_takes_nothing() {
        assert_eq!(actions(&entry("claude_code_s1", STATUS_DONE)), vec![REPLY]);
        assert!(actions(&entry("claude_code_s1", crate::status::STATUS_ERROR)).is_empty());
        assert!(actions(&entry("lpm_job", STATUS_DONE)).is_empty());
    }

    #[test]
    fn allow_needs_the_same_report_still_open() {
        let open = [entry("claude_code_s1", STATUS_WAITING)];
        assert!(prompt_still_open(&open, &request(ALLOW)).is_ok());

        let mut later = entry("claude_code_s1", STATUS_WAITING);
        later.timestamp = 200;
        assert!(prompt_still_open(&[later], &request(ALLOW)).is_err());
        assert!(prompt_still_open(&[entry("claude_code_s1", "Running")], &request(ALLOW)).is_err());
        assert!(prompt_still_open(&[], &request(DENY)).is_err());
    }

    #[test]
    fn a_reply_waits_for_an_idle_agent() {
        assert!(ready_for_reply(&[entry("claude_code_s1", STATUS_DONE)], "term-1").is_ok());
        assert!(ready_for_reply(&[], "term-1").is_ok());
        assert!(ready_for_reply(&[entry("claude_code_s1", STATUS_WAITING)], "term-1").is_err());
        assert!(ready_for_reply(&[entry("claude_code_s1", "Running")], "term-1").is_err());
        assert!(ready_for_reply(&[entry("claude_code_s1", "Running")], "term-2").is_ok());
    }

    #[test]
    fn a_reply_needs_the_agent_still_in_the_tab() {
        let done = [entry("claude_code_s1", STATUS_DONE)];
        let reply = request(REPLY);
        assert!(agent_still_there(Some(false), &[], &reply).is_ok());
        assert!(agent_still_there(Some(true), &done, &reply).is_err());

        assert!(agent_still_there(None, &done, &reply).is_ok());
        assert!(agent_still_there(None, &[], &reply).is_err());
        let mut later = entry("claude_code_s1", STATUS_DONE);
        later.timestamp = 200;
        assert!(agent_still_there(None, &[later], &reply).is_err());
        let mut other_tab = entry("claude_code_s1", STATUS_DONE);
        other_tab.pane_id = "term-2".into();
        assert!(agent_still_there(None, &[other_tab], &reply).is_err());
    }

    #[test]
    fn reply_text_is_trimmed_and_bounded() {
        assert_eq!(reply_text("  ship it \n").unwrap(), "ship it");
        assert!(reply_text("   ").is_err());
        assert!(reply_text(&"x".repeat(MAX_REPLY_CHARS + 1)).is_err());
    }
}
