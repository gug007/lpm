// Answers to automation questions from Telegram: a tap on the buttons lpm
// posted under a question, or a reply to that message. Only the link's owner
// (the user, see telegramlink.rs) can answer, only on a message lpm posted, as
// lpm posted it (its text and its buttons: anyone holding the bot's token
// could edit either), and through the same calls the phone uses. Once a
// question closes, wherever it was answered, its buttons give way to one that
// says how it ended.

use crate::sendto::Asking;
use crate::telegram::{api, client};
use crate::telegramask::{self, Outcome};
use crate::telegramasks::{self, Entry, Post};
use crate::telegramlink::Link;
use serde_json::{json, Value};
use std::time::Duration;
use tauri::AppHandle;

const ALERT_MAX_CHARS: usize = 190;

/// What an update was to this app.
#[derive(Debug, PartialEq)]
pub enum Seen {
    Handled,
    /// The user answering on lpm's message for a question this app never
    /// posted: another Mac's, which may still read it.
    Foreign,
    Other,
}

/// Right after telegram.rs sent a question's message.
pub fn posted(asking: &Asking, chat: i64, kind: &str, post: Post) {
    telegramasks::with(|r| match r.find_mut(&asking.ask.id, chat) {
        Some(entry) => {
            entry.posts.push(post);
            entry.closed_at = None;
        }
        None => r.entries.push(Entry {
            ask: asking.ask.id.clone(),
            project: asking.project.clone(),
            job: asking.job_id.clone(),
            chat,
            replies: kind != "channel",
            private: kind == "private",
            posted_at: telegramasks::now(),
            closed_at: None,
            posts: vec![post],
            prompts: Vec::new(),
            picked: Vec::new(),
        }),
    });
    crate::telegrampoll::posted();
}

pub fn handle(app: &AppHandle, token: &str, update: &Value) -> Seen {
    if let Some(tap) = update.get("callback_query") {
        return tapped(app, token, tap);
    }
    match update.get("message") {
        Some(message) => replied(app, token, message),
        None => Seen::Other,
    }
}

/// The rows of a keyboard as (text, data) pairs, for comparing what a tap came
/// from with what lpm posted. A tick is left out: a second tap can arrive
/// before lpm's edit adding the first one's tick.
fn buttons(keyboard: &Value) -> Vec<Vec<(String, String)>> {
    keyboard["inline_keyboard"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|row| {
            row.as_array()
                .into_iter()
                .flatten()
                .map(|b| {
                    let text = b["text"].as_str().unwrap_or_default();
                    let data = b["callback_data"].as_str().unwrap_or_default();
                    (text.trim_start_matches("✓ ").to_string(), data.to_string())
                })
                .collect()
        })
        .collect()
}

fn from_user(link: &Link, who: &Value, chat: i64) -> bool {
    who["id"].as_i64().is_some_and(|id| link.is_owner(id)) && link.chats.iter().any(|c| c.chat_id == chat)
}

/// Whether a tap may answer `entry`: from the user, in a chat still linked, on
/// the message as lpm posted it. Telegram leaves out a message too old to
/// show, so neither its text nor its buttons can be checked: refused.
fn trusted_tap(link: &Link, entry: &Entry, tap: &Value) -> Result<(), &'static str> {
    if !tap["from"]["id"].as_i64().is_some_and(|id| link.is_owner(id)) {
        return Err("Only the person lpm writes to can answer this.");
    }
    if !link.chats.iter().any(|c| c.chat_id == entry.chat) {
        return Err("This chat isn't linked to lpm any more.");
    }
    let message = &tap["message"];
    if message["date"].as_i64().unwrap_or(0) == 0 {
        return Err("This message is too old to answer here. Answer in lpm or lpm Link.");
    }
    let id = message["message_id"].as_i64();
    let Some(post) = entry.posts.iter().find(|p| Some(p.message) == id) else {
        return Err("lpm didn't post these buttons.");
    };
    let text_kept = post.text.is_empty() || message["text"].as_str() == Some(post.text.as_str());
    if !text_kept || buttons(&post.keyboard) != buttons(&message["reply_markup"]) {
        return Err("This message changed after lpm posted it. Answer in lpm or lpm Link.");
    }
    Ok(())
}

fn cut(text: &str) -> String {
    text.chars().take(ALERT_MAX_CHARS).collect()
}

fn notice(token: &str, tap_id: &str, text: &str, alert: bool) {
    let body = json!({ "callback_query_id": tap_id, "text": cut(text), "show_alert": alert });
    if let Ok(c) = client(Duration::from_secs(20)) {
        let _ = api(&c, token, "answerCallbackQuery", &body);
    }
}

fn say(token: &str, chat: i64, reply_to: i64, text: &str) {
    let body =
        json!({ "chat_id": chat, "text": text, "reply_parameters": { "message_id": reply_to } });
    if let Ok(c) = client(Duration::from_secs(20)) {
        let _ = api(&c, token, "sendMessage", &body);
    }
}

/// Sends what a tap or reply decided. Never inside telegramasks::with:
/// answering emits the job-status event whose listener takes that lock.
fn submit(app: &AppHandle, entry: &Entry, outcome: Outcome) -> Result<&'static str, String> {
    let ids = || (entry.project.clone(), entry.job.clone(), entry.ask.clone());
    match outcome {
        Outcome::Submit(answers) => {
            let (project, job, ask) = ids();
            crate::jobs::ask::answer_job_question(
                app.clone(),
                project,
                job,
                ask,
                Value::Object(answers),
            )
            .map(|_| "Sent")
        }
        Outcome::Dismiss => {
            let (project, job, ask) = ids();
            crate::jobs::ask::dismiss_job_question(app.clone(), project, job, ask)
                .map(|_| "Skipped")
        }
        Outcome::Refuse(why) => Err(why),
        _ => Ok(""),
    }
}

fn tapped(app: &AppHandle, token: &str, tap: &Value) -> Seen {
    let Some((ask_id, which)) = tap["data"].as_str().and_then(telegramask::decode) else {
        return Seen::Other;
    };
    let tap_id = tap["id"].as_str().unwrap_or_default();
    let (Some(chat), Some(message)) = (
        tap["message"]["chat"]["id"].as_i64(),
        tap["message"]["message_id"].as_i64(),
    ) else {
        return Seen::Other;
    };
    let link = Link::load();
    let Some(entry) = telegramasks::with(|r| r.find(&ask_id, chat, message).cloned()) else {
        if !telegramasks::with(|r| r.knows_ask(&ask_id)) && from_user(&link, &tap["from"], chat) {
            return Seen::Foreign;
        }
        notice(token, tap_id, "lpm didn't post these buttons.", true);
        return Seen::Handled;
    };
    if let Err(why) = trusted_tap(&link, &entry, tap) {
        notice(token, tap_id, why, true);
        return Seen::Handled;
    }
    let Some(ask) = crate::jobs::ask::current(&entry.project, &entry.job, &entry.ask) else {
        notice(token, tap_id, "This question isn't waiting any more.", false);
        reconcile(token, Some((&entry.project, &entry.job)));
        return Seen::Handled;
    };
    if !ask.is_open() {
        notice(token, tap_id, &telegramask::status_text(&ask, entry.private), false);
        reconcile(token, Some((&entry.project, &entry.job)));
        return Seen::Handled;
    }
    match telegramask::tap(&ask, &entry.picked, which) {
        Outcome::Draft(picked) => {
            let keyboard = telegramask::keyboard(&ask, &picked, entry.replies);
            let took: Vec<i64> = entry
                .posts
                .iter()
                .filter(|p| set_buttons(token, entry.chat, p.message, &keyboard) == Edit::Done)
                .map(|p| p.message)
                .collect();
            telegramasks::with(|r| {
                if let Some(e) = r.find_mut(&entry.ask, entry.chat) {
                    e.picked = picked;
                    for post in e.posts.iter_mut().filter(|p| took.contains(&p.message)) {
                        post.keyboard = keyboard.clone();
                    }
                }
            });
            notice(token, tap_id, "", false);
        }
        Outcome::Prompt => {
            prompt(token, &entry, &ask.questions[0].text);
            notice(token, tap_id, "", false);
        }
        Outcome::Ignore => notice(token, tap_id, &telegramask::status_text(&ask, entry.private), false),
        outcome => match submit(app, &entry, outcome) {
            Ok(done) => {
                notice(token, tap_id, done, false);
                reconcile(token, Some((&entry.project, &entry.job)));
            }
            Err(why) => notice(token, tap_id, &why, true),
        },
    }
    Seen::Handled
}

/// Asks for an answer in the user's own words; their reply to this message
/// is the answer.
fn prompt(token: &str, entry: &Entry, question: &str) {
    let body = json!({
        "chat_id": entry.chat,
        "text": format!("Your answer to: {question}"),
        "reply_markup": { "force_reply": true, "selective": !entry.private, "input_field_placeholder": "Your answer" },
    });
    let Ok(c) = client(Duration::from_secs(20)) else {
        return;
    };
    let Ok(sent) = api(&c, token, "sendMessage", &body) else {
        return;
    };
    let (Some(message), Some(text)) = (sent["message_id"].as_i64(), sent["text"].as_str()) else {
        return;
    };
    let post = Post {
        message,
        keyboard: Value::Null,
        text: text.to_string(),
    };
    telegramasks::with(|r| {
        if let Some(e) = r.find_mut(&entry.ask, entry.chat) {
            e.prompts.push(post);
        }
    });
}

fn replied(app: &AppHandle, token: &str, message: &Value) -> Seen {
    let to = &message["reply_to_message"];
    let (Some(chat), Some(reply_to), Some(id)) = (
        message["chat"]["id"].as_i64(),
        to["message_id"].as_i64(),
        message["message_id"].as_i64(),
    ) else {
        return Seen::Other;
    };
    let link = Link::load();
    let user = from_user(&link, &message["from"], chat);
    let Some(entry) = telegramasks::with(|r| r.entries.iter().find(|e| e.holds(chat, reply_to)).cloned()) else {
        let to_our_bot = to["from"]["is_bot"].as_bool() == Some(true)
            && link.bot.is_some()
            && to["from"]["username"].as_str() == link.bot.as_deref();
        return if user && to_our_bot { Seen::Foreign } else { Seen::Other };
    };
    if !user {
        return Seen::Handled;
    }
    let posted = entry.message(reply_to).map_or("", |p| p.text.as_str());
    if !posted.is_empty() && to["text"].as_str() != Some(posted) {
        say(token, chat, id, "That message changed after lpm posted it. Answer in lpm or lpm Link.");
        return Seen::Handled;
    }
    let ask = crate::jobs::ask::current(&entry.project, &entry.job, &entry.ask);
    let Some(ask) = ask.filter(|a| a.is_open()) else {
        say(token, chat, id, "That question isn't waiting any more.");
        return Seen::Handled;
    };
    let outcome = telegramask::reply(&ask, message["text"].as_str().unwrap_or_default());
    if outcome == Outcome::Ignore {
        return Seen::Handled;
    }
    match submit(app, &entry, outcome) {
        Ok(done) => {
            say(token, chat, id, &format!("✓ {done}"));
            reconcile(token, Some((&entry.project, &entry.job)));
        }
        Err(why) => say(token, chat, id, &why),
    }
    Seen::Handled
}

#[derive(PartialEq)]
enum Edit {
    Done,
    /// The message is gone (deleted, too old to edit, or the bot was removed
    /// from the chat).
    Gone,
    Failed,
}

fn set_buttons(token: &str, chat: i64, message: i64, keyboard: &Value) -> Edit {
    let body = json!({ "chat_id": chat, "message_id": message, "reply_markup": keyboard });
    let Ok(c) = client(Duration::from_secs(20)) else {
        return Edit::Failed;
    };
    match api(&c, token, "editMessageReplyMarkup", &body) {
        Ok(_) => Edit::Done,
        Err(e) if e.text.contains("not modified") => Edit::Done,
        Err(e) if e.code == Some(403) || e.text.contains("not found") || e.text.contains("can't be edited") => {
            Edit::Gone
        }
        Err(_) => Edit::Failed,
    }
}

/// Brings every posted question (or one job's) in line with lpm: a question
/// that closed loses its buttons for one saying how it ended, and one that
/// opened again (its run couldn't resume) gets them back.
pub fn reconcile(token: &str, only: Option<(&str, &str)>) {
    let entries: Vec<Entry> = telegramasks::with(|r| {
        r.entries
            .iter()
            .filter(|e| only.is_none_or(|(p, j)| e.project == p && e.job == j))
            .cloned()
            .collect()
    });
    for entry in entries {
        let ask = crate::jobs::ask::current(&entry.project, &entry.job, &entry.ask);
        let open = ask.as_ref().is_some_and(|a| a.is_open());
        let keyboard = match (&ask, open, entry.closed_at) {
            (Some(ask), true, Some(_)) => telegramask::keyboard(ask, &entry.picked, entry.replies),
            (Some(ask), false, None) => telegramask::status_keyboard(ask, entry.private),
            (None, _, None) => json!({ "inline_keyboard": [] }),
            _ => continue,
        };
        let last = entry.posts.len().saturating_sub(1);
        let mut kept: Vec<Post> = Vec::new();
        let mut failed = false;
        for (i, post) in entry.posts.iter().enumerate() {
            let keyboard = if i == last || open {
                keyboard.clone()
            } else {
                json!({ "inline_keyboard": [] })
            };
            match set_buttons(token, entry.chat, post.message, &keyboard) {
                Edit::Done => kept.push(Post {
                    keyboard,
                    ..post.clone()
                }),
                Edit::Gone => {}
                Edit::Failed => {
                    failed = true;
                    kept.push(post.clone());
                }
            }
        }
        telegramasks::with(|r| {
            if let Some(e) = r.find_mut(&entry.ask, entry.chat) {
                e.posts = kept;
                if !failed {
                    e.closed_at = (!open).then(telegramasks::now);
                }
            }
        });
    }
}

#[cfg(test)]
#[path = "telegramanswer_tests.rs"]
mod tests;
