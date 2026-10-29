// `lpm ask`: an automation run putting a question to the user.
//
// The app tells this command which kind of run it is in. An agent run gets its
// question out and is told to end its turn — the answer comes back as the
// agent's next message, however long it takes. A command run can't be picked
// up halfway, so here it waits for the answer and prints it.
use crate::config::Ctx;
use crate::statussock::{hex_encode, quote_arg, request};
use clap::Args;
use serde_json::{json, Map, Value};
use std::io::Read;
use std::process::ExitCode;
use std::time::Duration;

const ANSWERED_NO: u8 = 1;
const USAGE: u8 = 2;
const NO_ANSWER: u8 = 3;
/// How long to wait before trying again while the app is away — the question
/// is saved with the run, so a relaunched app picks it back up.
const RETRY: Duration = Duration::from_secs(5);

#[derive(Args)]
#[command(after_help = "\
Kinds: --confirm (yes/no), --choice LABEL (repeat for each option), --text (the default).

Exit status: 0 answered (for --confirm, yes), 1 answered no (--confirm), \
2 usage or not inside an automation run, 3 no answer (dismissed, expired or the run stopped).

Inside an AI agent's run the question goes out and the command returns at once: \
end your turn, and the answer comes back as your next message. Inside a command \
run, lpm ask waits and prints the answer: yes/no for --confirm, one picked label \
per line for --choice, the text for --text, JSON for --form or --json.

Examples:
  lpm ask \"Deploy to staging?\" --confirm --yes-label Deploy --no-label \"Not now\"
  lpm ask \"Which region?\" --choice us-east --choice eu-west
  lpm ask \"Which checks should run?\" --choice lint --choice test --multiple
  lpm ask \"What should the release be called?\" --text --placeholder v2.4
  lpm ask \"Upgrade now?\" --confirm --default no --timeout 4h
  lpm ask --form '{\"questions\":[{\"type\":\"confirm\",\"text\":\"Ship?\"},{\"text\":\"Notes?\",\"optional\":true}]}'")]
pub struct AskArgs {
    /// The question, as the user will read it.
    question: Option<String>,
    /// A yes/no question.
    #[arg(long, conflicts_with_all = ["choice", "text"])]
    confirm: bool,
    /// An option to pick from; repeat for each one.
    #[arg(long = "choice", value_name = "LABEL")]
    choice: Vec<String>,
    /// A question answered in the user's own words.
    #[arg(long)]
    text: bool,
    /// Allow picking more than one option.
    #[arg(long, requires = "choice")]
    multiple: bool,
    /// Also take an answer that isn't one of the options.
    #[arg(long, requires = "choice")]
    other: bool,
    /// A larger box for a longer answer.
    #[arg(long)]
    multiline: bool,
    /// Hint shown in an empty answer box.
    #[arg(long, value_name = "TEXT")]
    placeholder: Option<String>,
    /// Label for the yes button.
    #[arg(long, value_name = "LABEL", requires = "confirm")]
    yes_label: Option<String>,
    /// Label for the no button.
    #[arg(long, value_name = "LABEL", requires = "confirm")]
    no_label: Option<String>,
    /// The answer used if nobody answers before --timeout.
    #[arg(long, value_name = "ANSWER")]
    default: Option<String>,
    /// The user may leave it unanswered.
    #[arg(long)]
    optional: bool,
    /// Stop waiting after this long, e.g. 30m, 4h, 2d (a minute to a year).
    #[arg(long, value_name = "DURATION")]
    timeout: Option<String>,
    /// Several questions at once, as JSON ({"questions":[...]}); `-` reads it from stdin.
    #[arg(long, value_name = "JSON", conflicts_with_all = ["question", "confirm", "choice", "text"])]
    form: Option<String>,
    /// Print the answers as JSON.
    #[arg(long)]
    json: bool,
}

fn fail(code: u8, message: &str) -> ExitCode {
    eprintln!("lpm: {message}");
    ExitCode::from(code)
}

pub fn run(ctx: &Ctx, args: AskArgs) -> ExitCode {
    let Some(token) = std::env::var("LPM_RUN_ID").ok().filter(|t| !t.is_empty()) else {
        return fail(USAGE, "lpm ask only works inside an automation run");
    };
    let request = match build_request(&args) {
        Ok(r) => r,
        Err(e) => return fail(USAGE, &e),
    };
    let socket = ctx.socket_path();
    let line = format!(
        "job_ask --run={} --ask-hex={}",
        quote_arg(&token),
        hex_encode(&request.to_string())
    );
    let opened = match request_json(&socket, &line) {
        Ok(v) => v,
        Err(e) => return fail(USAGE, &e),
    };
    if opened.get("ok").and_then(Value::as_bool) != Some(true) {
        return fail(
            USAGE,
            text_of(&opened, "error").unwrap_or("the app refused the question"),
        );
    }
    if opened.get("blocking").and_then(Value::as_bool) != Some(true) {
        println!("{}", text_of(&opened, "message").unwrap_or_default());
        return ExitCode::SUCCESS;
    }
    let id = text_of(&opened, "id").unwrap_or_default().to_string();
    let wait = format!(
        "job_ask_wait --run={} --id={}",
        quote_arg(&token),
        quote_arg(&id)
    );
    let ask = loop {
        match request_json(&socket, &wait) {
            Ok(v) if v.get("ok").and_then(Value::as_bool) != Some(true) => {
                return fail(
                    NO_ANSWER,
                    text_of(&v, "error").unwrap_or("the question was lost"),
                )
            }
            Ok(v) => match text_of(&v, "status") {
                Some("open") => continue,
                Some("answered") => break v.get("ask").cloned().unwrap_or(Value::Null),
                Some("dismissed") => return fail(NO_ANSWER, "the question was dismissed"),
                _ => return fail(NO_ANSWER, "the question went unanswered"),
            },
            Err(_) => std::thread::sleep(RETRY),
        }
    };
    let (text, code) = render_answer(&ask, args.json || args.form.is_some());
    println!("{text}");
    ExitCode::from(code)
}

fn request_json(socket: &std::path::Path, line: &str) -> Result<Value, String> {
    let reply = request(socket, line).map_err(|_| "the lpm app isn't running".to_string())?;
    if reply.trim() == "ERROR: unknown command" {
        return Err("the running lpm app doesn't support lpm ask — update it".into());
    }
    serde_json::from_str(&reply).map_err(|e| format!("could not read the app's reply: {e}"))
}

fn text_of<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Value::as_str)
}

pub(crate) fn build_request(args: &AskArgs) -> Result<Value, String> {
    let mut request = match &args.form {
        Some(form) => {
            let raw = if form == "-" {
                let mut buf = String::new();
                std::io::stdin()
                    .read_to_string(&mut buf)
                    .map_err(|e| format!("could not read the form from stdin: {e}"))?;
                buf
            } else {
                form.clone()
            };
            serde_json::from_str::<Value>(&raw)
                .map_err(|e| format!("--form isn't valid JSON: {e}"))?
        }
        None => json!({ "questions": [question(args)?] }),
    };
    if let Some(timeout) = &args.timeout {
        request["timeout"] = json!(parse_duration(timeout)?);
    }
    Ok(request)
}

fn question(args: &AskArgs) -> Result<Value, String> {
    let text = args
        .question
        .as_deref()
        .map(str::trim)
        .filter(|q| !q.is_empty())
        .ok_or("give the question to ask, e.g. lpm ask \"Deploy now?\" --confirm")?;
    let kind = if args.confirm {
        "confirm"
    } else if !args.choice.is_empty() {
        "choice"
    } else {
        "text"
    };
    let mut q = Map::new();
    q.insert("type".into(), json!(kind));
    q.insert("text".into(), json!(text));
    if !args.choice.is_empty() {
        q.insert("options".into(), json!(args.choice));
    }
    for (key, on) in [
        ("multiple", args.multiple),
        ("other", args.other),
        ("multiline", args.multiline),
        ("optional", args.optional),
    ] {
        if on {
            q.insert(key.into(), json!(true));
        }
    }
    for (key, value) in [
        ("placeholder", &args.placeholder),
        ("yes", &args.yes_label),
        ("no", &args.no_label),
        ("default", &args.default),
    ] {
        if let Some(v) = value {
            q.insert(key.into(), json!(v));
        }
    }
    Ok(Value::Object(q))
}

/// `30m`, `4h`, `2d`, `90s` or plain seconds.
pub(crate) fn parse_duration(s: &str) -> Result<u64, String> {
    let s = s.trim();
    let bad = || format!("can't read the timeout \"{s}\" — use e.g. 30m, 4h or 2d");
    let (digits, unit) = match s.char_indices().find(|(_, c)| !c.is_ascii_digit()) {
        Some((i, _)) => (&s[..i], &s[i..]),
        None => (s, "s"),
    };
    let n: u64 = digits.parse().map_err(|_| bad())?;
    let scale = match unit.trim() {
        "s" => 1,
        "m" => 60,
        "h" => 3600,
        "d" => 86_400,
        _ => return Err(bad()),
    };
    n.checked_mul(scale).ok_or_else(bad)
}

/// The answer as a script reads it, and the exit status that goes with it.
pub(crate) fn render_answer(ask: &Value, as_json: bool) -> (String, u8) {
    let answers = ask.get("answers").cloned().unwrap_or_else(|| json!({}));
    let questions = ask
        .get("questions")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if as_json || questions.len() != 1 {
        return (answers.to_string(), 0);
    }
    let id = questions[0]
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or_default();
    match answers.get(id) {
        Some(Value::Bool(yes)) => (
            if *yes { "yes" } else { "no" }.to_string(),
            if *yes { 0 } else { ANSWERED_NO },
        ),
        Some(Value::Array(picks)) => (
            picks
                .iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>()
                .join("\n"),
            0,
        ),
        Some(Value::String(text)) => (text.clone(), 0),
        _ => (
            ask.get("reply")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            0,
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::Parser;

    #[derive(Parser)]
    struct Wrap {
        #[command(flatten)]
        args: AskArgs,
    }

    fn parse(line: &[&str]) -> AskArgs {
        let mut argv = vec!["ask"];
        argv.extend_from_slice(line);
        Wrap::try_parse_from(argv).unwrap().args
    }

    #[test]
    fn builds_each_kind_from_flags() {
        let r = build_request(&parse(&[
            "Deploy?",
            "--confirm",
            "--yes-label",
            "Ship",
            "--default",
            "no",
        ]))
        .unwrap();
        assert_eq!(
            r,
            json!({ "questions": [{ "type": "confirm", "text": "Deploy?", "yes": "Ship", "default": "no" }] })
        );
        let r = build_request(&parse(&[
            "Region?",
            "--choice",
            "us",
            "--choice",
            "eu",
            "--multiple",
        ]))
        .unwrap();
        assert_eq!(r["questions"][0]["type"], json!("choice"));
        assert_eq!(r["questions"][0]["options"], json!(["us", "eu"]));
        assert_eq!(r["questions"][0]["multiple"], json!(true));
        let r = build_request(&parse(&["Name?", "--timeout", "4h"])).unwrap();
        assert_eq!(r["questions"][0]["type"], json!("text"));
        assert_eq!(r["timeout"], json!(4 * 3600));
    }

    #[test]
    fn refuses_mixed_kinds_and_a_missing_question() {
        let mixed = Wrap::try_parse_from(["ask", "Q?", "--confirm", "--choice", "a"]);
        assert!(mixed.is_err());
        assert!(build_request(&parse(&["--confirm"])).is_err());
        let form = build_request(&parse(&[
            "--form",
            "{\"questions\":[{\"text\":\"A\"}]}",
            "--timeout",
            "90",
        ]))
        .unwrap();
        assert_eq!(form["timeout"], json!(90));
    }

    #[test]
    fn reads_durations() {
        assert_eq!(parse_duration("30m").unwrap(), 1800);
        assert_eq!(parse_duration("2d").unwrap(), 172_800);
        assert_eq!(parse_duration("120").unwrap(), 120);
        assert!(parse_duration("soon").is_err());
        assert!(parse_duration("5w").is_err());
        assert!(parse_duration("307445734561825862m").is_err());
    }

    #[test]
    fn prints_the_answer_the_way_a_script_reads_it() {
        let ask = |answers: Value| json!({ "questions": [{ "id": "q1", "type": "confirm", "text": "Go?" }], "answers": answers });
        assert_eq!(
            render_answer(&ask(json!({ "q1": true })), false),
            ("yes".into(), 0)
        );
        assert_eq!(
            render_answer(&ask(json!({ "q1": false })), false),
            ("no".into(), 1)
        );
        assert_eq!(
            render_answer(&ask(json!({ "q1": false })), true),
            ("{\"q1\":false}".into(), 0)
        );
        let picks = json!({ "questions": [{ "id": "q1", "type": "choice" }], "answers": { "q1": ["a", "b"] } });
        assert_eq!(render_answer(&picks, false), ("a\nb".into(), 0));
        let words = json!({ "questions": [{ "id": "q1" }], "reply": "later" });
        assert_eq!(render_answer(&words, false), ("later".into(), 0));
    }
}
