// How an automation's question looks in Telegram, and what a tap or a reply on
// it means. Only questions asked one at a time get buttons; a form of several
// stays text, answered in lpm or lpm Link. Pure: telegramanswer.rs sends.
//
// Callback data names the question and the button, never a label: a tap is
// read against the question as lpm holds it, so forged data can only pick
// what the question offers.

use crate::jobs::askform::{self, Ask, Question, ANSWERED, CHOICE, CONFIRM, DISMISSED, REPLACED};
use serde_json::{json, Map, Value};

const PREFIX: &str = "lpm1";
const STATUS_MAX_CHARS: usize = 60;

#[derive(Debug, PartialEq, Clone, Copy)]
pub enum Tap {
    Yes,
    No,
    Pick(usize),
    Write,
    Send,
    Skip,
    Status,
}

#[derive(Debug, PartialEq)]
pub enum Outcome {
    Submit(Map<String, Value>),
    Draft(Vec<usize>),
    Prompt,
    Dismiss,
    Refuse(String),
    Ignore,
}

pub fn supported(ask: &Ask) -> bool {
    ask.questions.len() == 1
}

fn question(ask: &Ask) -> &Question {
    &ask.questions[0]
}

pub fn encode(ask_id: &str, tap: Tap) -> String {
    let code = match tap {
        Tap::Yes => "y".to_string(),
        Tap::No => "n".to_string(),
        Tap::Pick(i) => format!("p{i}"),
        Tap::Write => "w".to_string(),
        Tap::Send => "s".to_string(),
        Tap::Skip => "d".to_string(),
        Tap::Status => "x".to_string(),
    };
    format!("{PREFIX}:{ask_id}:{code}")
}

/// The question and the button in callback data lpm wrote, or None for
/// anything else.
pub fn decode(data: &str) -> Option<(String, Tap)> {
    let mut parts = data.split(':');
    if parts.next()? != PREFIX {
        return None;
    }
    let ask = parts.next()?;
    let code = parts.next()?;
    if parts.next().is_some() || ask.is_empty() || !ask.bytes().all(|b| b.is_ascii_alphanumeric()) {
        return None;
    }
    let tap = match code {
        "y" => Tap::Yes,
        "n" => Tap::No,
        "w" => Tap::Write,
        "s" => Tap::Send,
        "d" => Tap::Skip,
        "x" => Tap::Status,
        _ => Tap::Pick(code.strip_prefix('p')?.parse().ok()?),
    };
    Some((ask.to_string(), tap))
}

fn button(text: impl Into<String>, ask_id: &str, tap: Tap) -> Value {
    json!({ "text": text.into(), "callback_data": encode(ask_id, tap) })
}

/// The buttons under the question. `picked` are the options ticked so far on
/// a question that takes several; `replies` is false in a channel, where
/// nobody can write an answer.
pub fn keyboard(ask: &Ask, picked: &[usize], replies: bool) -> Value {
    let q = question(ask);
    let id = ask.id.as_str();
    let mut rows: Vec<Value> = Vec::new();
    match q.kind.as_str() {
        CONFIRM => rows.push(json!([
            button(askform::yes_label(q), id, Tap::Yes),
            button(askform::no_label(q), id, Tap::No)
        ])),
        CHOICE => {
            for (i, option) in q.options.iter().enumerate() {
                let mark = if q.multiple && picked.contains(&i) {
                    "✓ "
                } else {
                    ""
                };
                rows.push(json!([button(
                    format!("{mark}{}", option.label),
                    id,
                    Tap::Pick(i)
                )]));
            }
            if q.other && replies {
                rows.push(json!([button("Something else…", id, Tap::Write)]));
            }
            if q.multiple {
                rows.push(json!([button("Send answer", id, Tap::Send)]));
            }
        }
        _ if replies => rows.push(json!([button("Write an answer…", id, Tap::Write)])),
        _ => {}
    }
    rows.push(json!([button("Skip question", id, Tap::Skip)]));
    json!({ "inline_keyboard": rows })
}

/// What replaces the buttons once the question is closed, worded as lpm
/// words it. `reveal` says what was answered, which only a private chat may
/// show: in a group or channel it would show someone's own words to everyone.
pub fn status_keyboard(ask: &Ask, reveal: bool) -> Value {
    json!({ "inline_keyboard": [[button(status_text(ask, reveal), &ask.id, Tap::Status)]] })
}

pub fn status_text(ask: &Ask, reveal: bool) -> String {
    let answer = || {
        ask.questions
            .iter()
            .filter_map(|q| {
                ask.answers
                    .get(&q.id)
                    .map(|a| askform::display_answer(q, a))
            })
            .collect::<Vec<_>>()
            .join("; ")
    };
    let text = match ask.status.as_str() {
        ANSWERED if ask.auto && reveal => {
            format!("No answer in time — the default was used: {}", answer())
        }
        ANSWERED if ask.auto => "No answer in time — the default was used".to_string(),
        ANSWERED if ask.reply.is_some() => "Answered in a reply".to_string(),
        ANSWERED if reveal => format!("Answered: {}", answer()),
        ANSWERED => "Answered".to_string(),
        DISMISSED => "Skipped".to_string(),
        REPLACED => "Replaced by a newer question".to_string(),
        _ if ask.is_open() => "Waiting for your answer".to_string(),
        _ => "No answer".to_string(),
    };
    if text.chars().count() > STATUS_MAX_CHARS {
        format!(
            "{}…",
            text.chars().take(STATUS_MAX_CHARS - 1).collect::<String>()
        )
    } else {
        text
    }
}

fn submit(q: &Question, v: Value) -> Outcome {
    match askform::normalize_one(q, &v) {
        Ok(Some(a)) => Outcome::Submit(Map::from_iter([(q.id.clone(), a)])),
        Ok(None) => Outcome::Ignore,
        Err(e) => Outcome::Refuse(e),
    }
}

/// What a tap on one of the question's buttons does.
pub fn tap(ask: &Ask, picked: &[usize], tap: Tap) -> Outcome {
    let q = question(ask);
    match (q.kind.as_str(), tap) {
        (_, Tap::Skip) => Outcome::Dismiss,
        (_, Tap::Status) => Outcome::Ignore,
        (CONFIRM, Tap::Yes) => submit(q, json!(true)),
        (CONFIRM, Tap::No) => submit(q, json!(false)),
        (CHOICE, Tap::Pick(i)) if i < q.options.len() => {
            if !q.multiple {
                return submit(q, json!([q.options[i].label]));
            }
            let mut next: Vec<usize> = picked.iter().copied().filter(|&p| p != i).collect();
            if next.len() == picked.len() {
                next.push(i);
                next.sort_unstable();
            }
            Outcome::Draft(next)
        }
        (CHOICE, Tap::Send) if q.multiple => {
            let labels: Vec<&str> = picked
                .iter()
                .filter_map(|&i| q.options.get(i).map(|o| o.label.as_str()))
                .collect();
            if labels.is_empty() {
                Outcome::Refuse("Pick at least one option first.".into())
            } else {
                submit(q, json!(labels))
            }
        }
        (CHOICE, Tap::Write) if q.other => Outcome::Prompt,
        (kind, Tap::Write) if kind != CHOICE && kind != CONFIRM => Outcome::Prompt,
        _ => Outcome::Refuse("That button isn't part of this question any more.".into()),
    }
}

/// What a reply to the question's message (or to the prompt for your own
/// words) answers: yes or no, an option's label, or the text itself where the
/// question takes text.
pub fn reply(ask: &Ask, text: &str) -> Outcome {
    let text = text.trim();
    if text.is_empty() || text.starts_with('/') {
        return Outcome::Ignore;
    }
    submit(question(ask), json!(text))
}

#[cfg(test)]
#[path = "telegramask_tests.rs"]
mod tests;
