//! Links into the app: `lpm://open?project=<name>[&tab=<key>]` shows a project,
//! or one of its tabs; `lpm://new?project=<name>[&agent=<cli>][&prompt=<text>]`
//! fills the project's new-tab box. Any page can open an `lpm://` link, so none
//! of them starts or sends anything: the person presses Return for that.
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Url};

/// Tells the main window a link is waiting (take_open_link).
pub const EVENT: &str = "open-link";

const MAX_NAME: usize = 256;
const MAX_PROMPT: usize = 10_000;

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenLink {
    /// "open" or "new".
    pub kind: String,
    pub project: String,
    /// The tab's persisted key: its live id changes with every launch.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tab: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
}

// Held until the window takes it: a link that launched lpm arrives before the
// page is listening.
static PENDING: Mutex<Option<OpenLink>> = Mutex::new(None);

pub fn receive(app: &AppHandle, urls: &[Url]) {
    let Some(link) = urls.iter().find_map(parse) else {
        return;
    };
    *PENDING.lock().unwrap() = Some(link);
    crate::lifecycle::show_main(app);
    let _ = app.emit(EVENT, ());
}

fn parse(url: &Url) -> Option<OpenLink> {
    if url.scheme() != "lpm" {
        return None;
    }
    let kind = match url.host_str()? {
        "open" => "open",
        "new" => "new",
        _ => return None,
    };
    let value = |key: &str| {
        url.query_pairs()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.into_owned())
    };
    let project = value("project").filter(|p| !p.trim().is_empty() && p.len() <= MAX_NAME)?;
    let short = |v: Option<String>| v.filter(|s| !s.is_empty() && s.len() <= MAX_NAME);
    let (tab, agent, prompt) = if kind == "open" {
        (short(value("tab")), None, None)
    } else {
        let agent = short(value("agent")).filter(|a| {
            a.bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        });
        let prompt = value("prompt").filter(|p| !p.is_empty());
        if prompt.as_ref().is_some_and(|p| p.chars().count() > MAX_PROMPT) {
            return None;
        }
        (None, agent, prompt)
    };
    Some(OpenLink {
        kind: kind.into(),
        project,
        tab,
        agent,
        prompt,
    })
}

/// The waiting link, once.
#[tauri::command]
pub fn take_open_link() -> Option<OpenLink> {
    PENDING.lock().unwrap().take()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn link(s: &str) -> Option<OpenLink> {
        parse(&Url::parse(s).unwrap())
    }

    #[test]
    fn an_open_link_names_a_project_and_maybe_a_tab() {
        let l = link("lpm://open?project=saas-app&tab=t-12").unwrap();
        assert_eq!(l.kind, "open");
        assert_eq!(l.project, "saas-app");
        assert_eq!(l.tab.as_deref(), Some("t-12"));
        assert_eq!(link("lpm://open?project=My%20App").unwrap().project, "My App");
        assert_eq!(link("lpm://open/?project=a").unwrap().tab, None);
    }

    #[test]
    fn a_new_link_carries_an_agent_and_a_prompt_but_never_a_tab() {
        let l = link("lpm://new?project=a&agent=claude&prompt=Fix%20%23431%0Anow&tab=x").unwrap();
        assert_eq!(l.kind, "new");
        assert_eq!(l.agent.as_deref(), Some("claude"));
        assert_eq!(l.prompt.as_deref(), Some("Fix #431\nnow"));
        assert_eq!(l.tab, None);
    }

    #[test]
    fn junk_is_refused() {
        assert_eq!(link("lpm://open"), None);
        assert_eq!(link("lpm://open?project="), None);
        assert_eq!(link("lpm://join?i=abc"), None);
        assert_eq!(link("https://open?project=a"), None);
        assert_eq!(link("lpm://new?project=a&agent=rm%20-rf").unwrap().agent, None);
        let long = "x".repeat(MAX_PROMPT + 1);
        assert_eq!(link(&format!("lpm://new?project=a&prompt={long}")), None);
    }
}
