//! The dialog an agent waits on, for a phone's project list: read off the
//! terminal's screen the way the desktop sidebar reads it (SidebarAgentAsk.tsx),
//! and answered by typing the option's number — only while the same report is
//! still waiting and the screen still shows the dialog the phone was shown.
use super::RemoteHub;
use crate::agent_dialog::{self, AgentDialog};
use crate::status::{StatusEntry, StatusStore, STATUS_WAITING};
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::{AppHandle, Manager};

/// The phone may send `agentDialog`, and `answerAgent` with `action: "pick"`.
pub(super) const FEATURE: &str = "agentDialog";

/// The report waiting on `terminal`, if any.
fn waiting(app: &AppHandle, project: &str, terminal: &str) -> Option<StatusEntry> {
    app.state::<Arc<StatusStore>>()
        .list(project)
        .into_iter()
        .find(|e| e.pane_id == terminal && e.value == STATUS_WAITING)
}

/// The dialog `terminal` shows now: its recent output replayed onto a screen of
/// its size, the bottom of which holds the dialog.
fn on_screen(hub: &RemoteHub, app: &AppHandle, terminal: &str) -> Option<AgentDialog> {
    let (cols, rows) = crate::pty::remote_dims(&app.state::<crate::pty::PtyState>(), terminal)?;
    let (output, _) = hub.ring_seed(terminal);
    agent_dialog::parse(
        &agent_dialog::screen_rows(&output, cols, rows),
        cols as usize,
    )
}

fn dialog_json(dialog: &AgentDialog) -> Value {
    let mut out = json!(dialog);
    out["id"] = json!(agent_dialog::fingerprint(dialog));
    out
}

/// `agentDialog`: the report waiting on a terminal and the dialog it shows, or
/// `dialog: null` when it waits on nothing the screen shows as a choice.
pub(super) fn reply(hub: &RemoteHub, app: &AppHandle, v: &Value) -> Value {
    let field = |k: &str| v.get(k).and_then(Value::as_str).unwrap_or_default();
    let (project, terminal) = (field("project"), field("terminalId"));
    let mut out =
        json!({ "t": "agentDialog", "project": project, "terminalId": terminal, "dialog": null });
    if let Some(entry) = waiting(app, project, terminal) {
        out["key"] = json!(entry.key);
        out["ts"] = json!(entry.timestamp);
        if let Some(dialog) = on_screen(hub, app, terminal) {
            out["dialog"] = dialog_json(&dialog);
        }
    }
    if let Some(req_id) = v.get("reqId") {
        out["reqId"] = req_id.clone();
    }
    out
}

/// Whether `terminal` still shows the dialog a phone was shown (`shown`, its
/// id), with `option` among its choices.
pub(super) fn still_shown(
    hub: &RemoteHub,
    app: &AppHandle,
    terminal: &str,
    shown: &str,
    option: &str,
) -> Result<(), String> {
    let dialog = on_screen(hub, app, terminal)
        .ok_or("The question isn't on the screen any more. Open the tab to answer it.")?;
    check(&dialog, shown, option)
}

fn check(dialog: &AgentDialog, shown: &str, option: &str) -> Result<(), String> {
    if agent_dialog::fingerprint(dialog) != shown {
        return Err("The question changed. Check it again before answering.".into());
    }
    if !dialog.options.iter().any(|o| o.key == option) {
        return Err("That choice isn't one the question offers.".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dialog() -> AgentDialog {
        agent_dialog::parse(&["Do you want to proceed?", " ❯ 1. Yes", "   2. No"], 60).unwrap()
    }

    #[test]
    fn a_pick_needs_the_dialog_the_phone_was_shown() {
        let shown = agent_dialog::fingerprint(&dialog());
        assert!(check(&dialog(), &shown, "2").is_ok());
        assert!(check(&dialog(), "0123456789abcdef", "2").is_err());
    }

    #[test]
    fn a_pick_must_be_one_of_the_options() {
        let shown = agent_dialog::fingerprint(&dialog());
        assert!(check(&dialog(), &shown, "3").is_err());
        assert!(check(&dialog(), &shown, "\r").is_err());
    }
}
