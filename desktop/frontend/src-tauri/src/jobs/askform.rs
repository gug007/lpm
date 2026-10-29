// What an automation run asks the user, and the answers that let it go on.
//
// A question is yes/no (`confirm`), a pick from a list (`choice`) or something
// to write (`text`). Kinds and statuses stay strings rather than enums: a state
// file or a phone from a newer build may carry one this build doesn't know, and
// that must still load — an unreadable state file loads as empty and would take
// every job's history with it — and still be answerable as text.
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

pub(crate) const CONFIRM: &str = "confirm";
pub(crate) const CHOICE: &str = "choice";
pub(crate) const TEXT: &str = "text";

pub(crate) const OPEN: &str = "open";
pub(crate) const ANSWERED: &str = "answered";
pub(crate) const DISMISSED: &str = "dismissed";
pub(crate) const UNANSWERED: &str = "unanswered";

const MAX_QUESTIONS: usize = 4;
const MAX_OPTIONS: usize = 12;
const MAX_QUESTION_CHARS: usize = 1_000;
const MAX_LABEL_CHARS: usize = 120;
const MAX_ID_CHARS: usize = 40;
const MAX_ANSWER_CHARS: usize = 8_000;
const MIN_TIMEOUT_SECS: u64 = 60;
const MAX_TIMEOUT_SECS: u64 = 365 * 86_400;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub(crate) struct Choice {
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub(crate) struct Question {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub yes: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub no: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub options: Vec<Choice>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub multiple: bool,
    /// The list also takes an answer in the user's own words.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub other: bool,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub multiline: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub placeholder: Option<String>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub optional: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default: Option<Value>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub(crate) struct Ask {
    pub id: String,
    #[serde(rename = "askedAt")]
    pub asked_at: u64,
    pub questions: Vec<Question>,
    /// A command run waits on the answer; an agent run ends its turn and is
    /// resumed with it.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub blocking: bool,
    #[serde(rename = "expiresAt", default, skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<u64>,
    #[serde(default = "open_status")]
    pub status: String,
    #[serde(default, skip_serializing_if = "Map::is_empty")]
    pub answers: Map<String, Value>,
    /// What the user wrote instead, when they answered with a plain reply.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reply: Option<String>,
    #[serde(rename = "answeredAt", default, skip_serializing_if = "Option::is_none")]
    pub answered_at: Option<u64>,
    /// Nobody answered in time, and the asker's defaults stood in.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub auto: bool,
}

fn open_status() -> String {
    OPEN.to_string()
}

impl Ask {
    pub fn new(asked_at: u64, request: Request, blocking: bool) -> Ask {
        let id = uuid::Uuid::new_v4().simple().to_string()[..12].to_string();
        Ask {
            id,
            asked_at,
            expires_at: request.timeout_secs.map(|t| asked_at + t),
            questions: request.questions,
            blocking,
            status: open_status(),
            answers: Map::new(),
            reply: None,
            answered_at: None,
            auto: false,
        }
    }

    pub fn is_open(&self) -> bool {
        self.status == OPEN
    }

    pub fn answer(&mut self, answers: Map<String, Value>, at: u64, auto: bool) {
        self.status = ANSWERED.to_string();
        self.answers = answers;
        self.answered_at = Some(at);
        self.auto = auto;
    }

    pub fn answer_in_words(&mut self, reply: &str, at: u64) {
        self.status = ANSWERED.to_string();
        self.reply = Some(reply.to_string());
        self.answered_at = Some(at);
    }

    pub fn close(&mut self, status: &str, at: u64) {
        self.status = status.to_string();
        self.answered_at = Some(at);
    }

    /// How long a run has been held up waiting on this question, up to `now`.
    pub fn waited_secs(&self, now: u64) -> u64 {
        if !self.blocking {
            return 0;
        }
        self.answered_at
            .unwrap_or(now)
            .saturating_sub(self.asked_at)
    }

    /// What expiry turns this question into: the defaults when every question
    /// that needs an answer has one, otherwise no answer at all.
    pub fn expire(&mut self, now: u64) {
        match default_answers(&self.questions) {
            Some(answers) => self.answer(answers, now, true),
            None => self.close(UNANSWERED, now),
        }
    }

    /// The first question, and how many more come with it — what a
    /// notification has room for.
    pub fn summary(&self) -> String {
        let first = self
            .questions
            .first()
            .map(|q| q.text.clone())
            .unwrap_or_default();
        match self.questions.len() {
            0 | 1 => first,
            n => format!("{first} (+{} more)", n - 1),
        }
    }

    /// Every question with the choices it offers, for destinations that can
    /// only show text.
    pub fn outline(&self) -> String {
        self.questions
            .iter()
            .map(|q| {
                let picks: Vec<String> = match q.kind.as_str() {
                    CONFIRM => vec![yes_label(q), no_label(q)],
                    CHOICE => q.options.iter().map(|o| o.label.clone()).collect(),
                    _ => Vec::new(),
                };
                if picks.is_empty() {
                    q.text.clone()
                } else {
                    format!("{} ({})", q.text, picks.join(" / "))
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    /// The message an agent is resumed with.
    pub fn answer_text(&self) -> String {
        if let Some(reply) = &self.reply {
            return reply.clone();
        }
        let head = if self.auto {
            "Nobody answered in time, so your defaults were used:"
        } else {
            "The user answered your question:"
        };
        let lines: Vec<String> = self
            .questions
            .iter()
            .map(|q| {
                let answer = self
                    .answers
                    .get(&q.id)
                    .map(|a| display_answer(q, a))
                    .unwrap_or_else(|| "(no answer)".to_string());
                format!("- {} → {answer}", q.text)
            })
            .collect();
        format!("{head}\n{}", lines.join("\n"))
    }
}

/// What `lpm ask` sends: the questions and how long the asker will wait.
#[derive(Debug, PartialEq)]
pub(crate) struct Request {
    pub questions: Vec<Question>,
    pub timeout_secs: Option<u64>,
}

pub(crate) fn parse_request(v: &Value) -> Result<Request, String> {
    let list = v
        .get("questions")
        .and_then(Value::as_array)
        .ok_or("Give at least one question.")?;
    if list.is_empty() || list.len() > MAX_QUESTIONS {
        return Err(format!(
            "Ask between one and {MAX_QUESTIONS} questions at a time."
        ));
    }
    let mut questions: Vec<Question> = Vec::with_capacity(list.len());
    for (i, raw) in list.iter().enumerate() {
        let q = parse_question(raw, i)?;
        if questions.iter().any(|other| other.id == q.id) {
            return Err(format!("Two questions share the id \"{}\".", q.id));
        }
        questions.push(q);
    }
    let timeout_secs = match v.get("timeout") {
        None | Some(Value::Null) => None,
        Some(t) => {
            let secs = t
                .as_u64()
                .ok_or("The timeout is a number of seconds.")?;
            if secs < MIN_TIMEOUT_SECS {
                return Err("Wait at least a minute for an answer.".into());
            }
            if secs > MAX_TIMEOUT_SECS {
                return Err("Wait at most a year for an answer.".into());
            }
            Some(secs)
        }
    };
    Ok(Request {
        questions,
        timeout_secs,
    })
}

fn text_field(raw: &Value, key: &str, max: usize) -> Result<Option<String>, String> {
    match raw.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) => {
            let s = s.trim();
            if s.is_empty() {
                Ok(None)
            } else if s.chars().count() > max {
                Err(format!("\"{key}\" is too long — keep it under {max} characters."))
            } else {
                Ok(Some(s.to_string()))
            }
        }
        Some(_) => Err(format!("\"{key}\" must be text.")),
    }
}

fn flag(raw: &Value, key: &str) -> bool {
    raw.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn parse_choice(raw: &Value) -> Result<Choice, String> {
    let (label, description) = match raw {
        Value::String(s) => (s.trim().to_string(), None),
        Value::Object(_) => (
            text_field(raw, "label", MAX_LABEL_CHARS)?.unwrap_or_default(),
            text_field(raw, "description", MAX_QUESTION_CHARS)?,
        ),
        _ => return Err("Each option is text, or an object with a label.".into()),
    };
    if label.is_empty() {
        return Err("Every option needs a label.".into());
    }
    if label.chars().count() > MAX_LABEL_CHARS {
        return Err(format!(
            "The option \"{label}\" is too long — keep labels under {MAX_LABEL_CHARS} characters."
        ));
    }
    Ok(Choice { label, description })
}

fn parse_question(raw: &Value, index: usize) -> Result<Question, String> {
    let text = text_field(raw, "text", MAX_QUESTION_CHARS)?
        .ok_or("Every question needs its text.")?;
    let options = match raw.get("options") {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(items)) => items.iter().map(parse_choice).collect::<Result<_, _>>()?,
        Some(_) => return Err("\"options\" is a list.".into()),
    };
    let kind = match raw.get("type").and_then(Value::as_str) {
        Some(k) => k.trim().to_lowercase(),
        None if !options.is_empty() => CHOICE.to_string(),
        None => TEXT.to_string(),
    };
    let id = match text_field(raw, "id", MAX_ID_CHARS)? {
        Some(id) => id,
        None => format!("q{}", index + 1),
    };
    let mut q = Question {
        id,
        kind,
        text,
        yes: text_field(raw, "yes", MAX_LABEL_CHARS)?,
        no: text_field(raw, "no", MAX_LABEL_CHARS)?,
        options,
        multiple: flag(raw, "multiple"),
        other: flag(raw, "other"),
        multiline: flag(raw, "multiline"),
        placeholder: text_field(raw, "placeholder", MAX_LABEL_CHARS)?,
        optional: flag(raw, "optional"),
        default: None,
    };
    match q.kind.as_str() {
        CONFIRM | TEXT if !q.options.is_empty() => {
            return Err(format!(
                "Only a choice question has options — \"{}\" is a {} question.",
                q.text, q.kind
            ))
        }
        CHOICE => {
            let needed = if q.other { 1 } else { 2 };
            if q.options.len() < needed || q.options.len() > MAX_OPTIONS {
                return Err(format!(
                    "A choice question offers between {needed} and {MAX_OPTIONS} options."
                ));
            }
            for (i, o) in q.options.iter().enumerate() {
                if q.options[..i]
                    .iter()
                    .any(|p| p.label.eq_ignore_ascii_case(&o.label))
                {
                    return Err(format!("The option \"{}\" is listed twice.", o.label));
                }
            }
        }
        CONFIRM | TEXT => {}
        other => {
            return Err(format!(
                "\"{other}\" isn't a kind of question lpm knows — use confirm, choice or text."
            ))
        }
    }
    if let Some(d) = raw.get("default").filter(|d| !d.is_null()) {
        q.default = Some(
            normalize_one(&q, d)
                .map_err(|e| format!("The default for \"{}\" doesn't fit: {e}", q.text))?
                .ok_or_else(|| format!("The default for \"{}\" is empty.", q.text))?,
        );
    }
    Ok(q)
}

pub(crate) fn yes_label(q: &Question) -> String {
    q.yes.clone().unwrap_or_else(|| "Yes".to_string())
}

pub(crate) fn no_label(q: &Question) -> String {
    q.no.clone().unwrap_or_else(|| "No".to_string())
}

fn cap(s: &str) -> Result<String, String> {
    if s.chars().count() > MAX_ANSWER_CHARS {
        Err(format!(
            "That answer is too long — keep it under {MAX_ANSWER_CHARS} characters."
        ))
    } else {
        Ok(s.to_string())
    }
}

/// One question's answer in its stored shape — true/false, a list of labels,
/// or text — or None when nothing was given.
pub(crate) fn normalize_one(q: &Question, v: &Value) -> Result<Option<Value>, String> {
    match q.kind.as_str() {
        CONFIRM => match v {
            Value::Null => Ok(None),
            Value::Bool(b) => Ok(Some(Value::Bool(*b))),
            Value::String(s) => {
                let s = s.trim();
                if s.is_empty() {
                    return Ok(None);
                }
                let lower = s.to_lowercase();
                if matches!(lower.as_str(), "yes" | "y" | "true")
                    || s.eq_ignore_ascii_case(&yes_label(q))
                {
                    Ok(Some(Value::Bool(true)))
                } else if matches!(lower.as_str(), "no" | "n" | "false")
                    || s.eq_ignore_ascii_case(&no_label(q))
                {
                    Ok(Some(Value::Bool(false)))
                } else {
                    Err(format!("Answer \"{}\" with yes or no.", q.text))
                }
            }
            _ => Err(format!("Answer \"{}\" with yes or no.", q.text)),
        },
        CHOICE => {
            let picked: Vec<&str> = match v {
                Value::Null => Vec::new(),
                Value::String(s) => vec![s.as_str()],
                Value::Array(items) => items
                    .iter()
                    .map(|i| i.as_str().ok_or("Each pick is text."))
                    .collect::<Result<_, _>>()?,
                _ => return Err(format!("Pick from the options for \"{}\".", q.text)),
            };
            let mut out: Vec<String> = Vec::new();
            for pick in picked.iter().map(|p| p.trim()).filter(|p| !p.is_empty()) {
                let label = match q
                    .options
                    .iter()
                    .find(|o| o.label.eq_ignore_ascii_case(pick))
                {
                    Some(o) => o.label.clone(),
                    None if q.other => cap(pick)?,
                    None => return Err(format!("\"{pick}\" isn't one of the options.")),
                };
                if !out.contains(&label) {
                    out.push(label);
                }
            }
            if out.is_empty() {
                return Ok(None);
            }
            if out.len() > 1 && !q.multiple {
                return Err(format!("Pick one option for \"{}\".", q.text));
            }
            Ok(Some(Value::Array(out.into_iter().map(Value::String).collect())))
        }
        _ => {
            let s = match v {
                Value::Null => return Ok(None),
                Value::String(s) => s.trim().to_string(),
                Value::Number(n) => n.to_string(),
                Value::Bool(b) => b.to_string(),
                _ => return Err(format!("Answer \"{}\" with text.", q.text)),
            };
            if s.is_empty() {
                Ok(None)
            } else {
                Ok(Some(Value::String(cap(&s)?)))
            }
        }
    }
}

/// Check a whole set of answers, keyed by question id, against the questions.
pub(crate) fn normalize_answers(
    questions: &[Question],
    answers: &Value,
) -> Result<Map<String, Value>, String> {
    let Some(given) = answers.as_object() else {
        return Err("Answers are keyed by question.".into());
    };
    let mut out = Map::new();
    for q in questions {
        match normalize_one(q, given.get(&q.id).unwrap_or(&Value::Null))? {
            Some(a) => {
                out.insert(q.id.clone(), a);
            }
            None if q.optional => {}
            None => return Err(format!("Answer \"{}\" first.", q.text)),
        }
    }
    Ok(out)
}

/// The asker's defaults as a complete answer, when they cover every question
/// that needs one.
pub(crate) fn default_answers(questions: &[Question]) -> Option<Map<String, Value>> {
    let mut out = Map::new();
    for q in questions {
        match &q.default {
            Some(d) => {
                out.insert(q.id.clone(), d.clone());
            }
            None if q.optional => {}
            None => return None,
        }
    }
    Some(out)
}

/// An answer the way a person would read it: a button's label, the picks, or
/// the text itself.
pub(crate) fn display_answer(q: &Question, a: &Value) -> String {
    match (q.kind.as_str(), a) {
        (CONFIRM, Value::Bool(true)) => yes_label(q),
        (CONFIRM, Value::Bool(false)) => no_label(q),
        (_, Value::Array(items)) => items
            .iter()
            .filter_map(Value::as_str)
            .collect::<Vec<_>>()
            .join(", "),
        (_, Value::String(s)) => s.clone(),
        (_, other) => other.to_string(),
    }
}

#[cfg(test)]
#[path = "askform_tests.rs"]
mod tests;
