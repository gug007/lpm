// A person's yes before an agent spends money on an image or a clip. The agent's
// `lpm generate` waits here while lpm shows the prompt, the model and the cost;
// a missing key is asked for in the same card, so nobody has to leave the tab.
use serde::Serialize;
use std::sync::mpsc::{sync_channel, SyncSender};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use super::models::Provider;

pub(crate) const REQUEST_EVENT: &str = "generate-request";
const WAIT: Duration = Duration::from_secs(5 * 60);

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Request {
    pub id: String,
    /// "image" or "speech".
    pub kind: &'static str,
    /// The agent asking ("Claude"), when lpm could tell.
    pub agent: String,
    pub project: String,
    pub prompt: String,
    pub model: String,
    pub provider: &'static str,
    /// Short facts for the card's chips: "16:9", "Marin voice".
    pub details: Vec<String>,
    pub cost: String,
    /// Where the file will be saved, as the project sees it.
    pub out: String,
    /// The key to ask for first ("gemini" or "openai"), when none is saved.
    pub needs_key: Option<&'static str>,
    pub key_label: &'static str,
    /// Whether "Allow in <project>" may be offered.
    pub project_grant: bool,
    pub over_limit: bool,
    /// "Today: 2 images, 7¢ of your $2 limit".
    pub today: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Decision {
    Deny,
    Once,
    Project,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Answer {
    pub decision: Decision,
    /// The prompt as the person left it, when they changed it.
    pub prompt: Option<String>,
}

struct Pending {
    req: Request,
    provider: Provider,
    answer: SyncSender<Answer>,
}

fn pending() -> &'static Mutex<Vec<Pending>> {
    static PENDING: OnceLock<Mutex<Vec<Pending>>> = OnceLock::new();
    PENDING.get_or_init(|| Mutex::new(Vec::new()))
}

/// Wait for the answer to `req`, whose model `provider` runs.
pub(crate) fn ask(app: &AppHandle, req: Request, provider: Provider) -> Result<Answer, String> {
    let (tx, rx) = sync_channel(1);
    let id = req.id.clone();
    pending().lock().unwrap().push(Pending {
        req: req.clone(),
        provider,
        answer: tx,
    });
    let _ = app.emit(REQUEST_EVENT, &req);
    if !crate::statusnotify::window_attended(app) {
        let (title, body) = notice(&req);
        crate::statusnotify::notify(app, &title, &body);
    }
    rx.recv_timeout(WAIT).map_err(|_| {
        pending().lock().unwrap().retain(|p| p.req.id != id);
        let _ = app.emit(REQUEST_EVENT, ());
        "nobody answered in lpm within 5 minutes, so nothing was made".to_string()
    })
}

fn notice(req: &Request) -> (String, String) {
    let who = if req.agent.is_empty() {
        "An agent"
    } else {
        &req.agent
    };
    let what = if req.kind == "speech" {
        "make audio"
    } else {
        "make an image"
    };
    let mut prompt: String = req.prompt.chars().take(80).collect();
    if req.prompt.chars().count() > 80 {
        prompt.push('…');
    }
    let place = if req.project.is_empty() {
        String::new()
    } else {
        format!("{}: ", req.project)
    };
    (
        format!("{who} wants to {what}"),
        format!("{place}{prompt}. Open lpm to allow or deny it."),
    )
}

/// The requests waiting for an answer, oldest first.
#[tauri::command]
pub fn generate_requests() -> Vec<Request> {
    pending()
        .lock()
        .unwrap()
        .iter()
        .map(|p| p.req.clone())
        .collect()
}

/// Answer request `id` with "deny", "once" or "project". `prompt` is the prompt
/// as edited on the card; `key` is the key typed into it, saved before the
/// answer goes back.
#[tauri::command(async)]
pub fn generate_answer(
    app: AppHandle,
    id: String,
    decision: String,
    prompt: Option<String>,
    key: Option<String>,
) -> Result<(), String> {
    let decision = match decision.as_str() {
        "once" => Decision::Once,
        "project" => Decision::Project,
        _ => Decision::Deny,
    };
    if decision != Decision::Deny {
        if let Some(key) = key.as_deref().map(str::trim).filter(|k| !k.is_empty()) {
            let provider = provider_of(&id).ok_or("that request is gone")?;
            crate::secrets::set(provider.secret(), key)?;
        }
    }
    let prompt = prompt
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty());
    take_answer(&id, Answer { decision, prompt })?;
    let _ = app.emit(REQUEST_EVENT, ());
    Ok(())
}

fn provider_of(id: &str) -> Option<Provider> {
    pending()
        .lock()
        .unwrap()
        .iter()
        .find(|p| p.req.id == id)
        .map(|p| p.provider)
}

/// Hands `answer` to the waiting side and takes the request off the list in the
/// same step, so the list read on this answer's event no longer holds it.
fn take_answer(id: &str, mut answer: Answer) -> Result<(), String> {
    let mut list = pending().lock().unwrap();
    let Some(i) = list.iter().position(|p| p.req.id == id) else {
        return Err("that request is gone".into());
    };
    let p = list.remove(i);
    if answer.decision == Decision::Project && !p.req.project_grant {
        answer.decision = Decision::Once;
    }
    if answer.prompt.as_deref() == Some(p.req.prompt.as_str()) {
        answer.prompt = None;
    }
    let _ = p.answer.try_send(answer);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(id: &str, project_grant: bool) -> Request {
        Request {
            id: id.into(),
            kind: "image",
            agent: "Claude".into(),
            project: "web".into(),
            prompt: "a fox".into(),
            model: "Nano Banana 2.1".into(),
            provider: "Google",
            details: vec!["1:1".into()],
            cost: "about 3¢".into(),
            out: "generated/a-fox.png".into(),
            needs_key: None,
            key_label: "Google Gemini",
            project_grant,
            over_limit: false,
            today: String::new(),
        }
    }

    fn push(req: Request) -> std::sync::mpsc::Receiver<Answer> {
        let (tx, rx) = sync_channel(1);
        pending().lock().unwrap().push(Pending {
            req,
            provider: Provider::Google,
            answer: tx,
        });
        rx
    }

    #[test]
    fn an_answer_leaves_the_list_and_reaches_the_waiting_side() {
        let rx = push(request("gen-1", true));
        let edited = Answer {
            decision: Decision::Project,
            prompt: Some("a red fox".into()),
        };
        take_answer("gen-1", edited.clone()).unwrap();
        assert!(generate_requests().iter().all(|r| r.id != "gen-1"));
        assert_eq!(rx.try_recv().unwrap(), edited);
        assert!(take_answer("gen-1", edited).is_err(), "answered twice");
    }

    #[test]
    fn a_project_yes_without_a_project_counts_once_and_an_unchanged_prompt_is_none() {
        let rx = push(request("gen-2", false));
        take_answer(
            "gen-2",
            Answer {
                decision: Decision::Project,
                prompt: Some("a fox".into()),
            },
        )
        .unwrap();
        assert_eq!(
            rx.try_recv().unwrap(),
            Answer {
                decision: Decision::Once,
                prompt: None
            }
        );
    }

    #[test]
    fn the_notice_names_the_agent_and_the_project() {
        let (title, body) = notice(&request("gen-3", true));
        assert_eq!(title, "Claude wants to make an image");
        assert_eq!(body, "web: a fox. Open lpm to allow or deny it.");
    }
}
