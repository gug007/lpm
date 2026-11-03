//! `lpm exec --on NAME[:PATH] [--json] -- COMMAND…` — run a command on a
//! computer this one connects to. That computer decides whether this one's
//! agents may run commands there, and lpm asks the person here before it runs.
//! What it prints comes back as it prints it, and `lpm exec` exits with its
//! exit code; stopping `lpm exec` stops the command there.

use crate::config::Ctx;
use crate::control;
use crate::error::RunError;
use crate::statussock;
use crate::util::print_json;
use serde_json::{json, Value};
use std::io::Write;

/// `words` as one shell line for the other computer: a single word is that
/// line as written (it may hold `&&` or a pipe); several are each kept whole.
fn command_line(words: &[String]) -> Result<String, RunError> {
    let line = match words {
        [] => String::new(),
        [one] => one.clone(),
        many => many
            .iter()
            .map(|w| shell_word(w))
            .collect::<Vec<_>>()
            .join(" "),
    };
    if line.trim().is_empty() {
        return Err(RunError::Internal(
            "say what to run after --, e.g. lpm exec --on mini -- npm test".into(),
        ));
    }
    if line.contains('\0') {
        return Err(RunError::Internal(
            "the command can't hold a NUL byte".into(),
        ));
    }
    Ok(line)
}

fn shell_word(word: &str) -> String {
    let plain = !word.is_empty()
        && word
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "_@%+=:,./-".contains(c));
    if plain {
        word.to_string()
    } else {
        statussock::quote_arg(word)
    }
}

fn unhex(text: &str) -> Vec<u8> {
    let nibble = |c: u8| (c as char).to_digit(16).unwrap_or(0) as u8;
    text.as_bytes()
        .chunks_exact(2)
        .map(|pair| nibble(pair[0]) << 4 | nibble(pair[1]))
        .collect()
}

/// What the command prints, written out as it comes, or kept for `--json`.
struct Output {
    json: bool,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
}

impl Output {
    fn line(&mut self, payload: &str) {
        let (kind, rest) = payload.split_once(' ').unwrap_or((payload, ""));
        match kind {
            "waiting" if !self.json => {
                eprintln!("Waiting for you to allow the command in lpm…");
            }
            "out" if self.json => self.stdout.extend(unhex(rest)),
            "err" if self.json => self.stderr.extend(unhex(rest)),
            "out" => {
                let mut out = std::io::stdout().lock();
                let _ = out.write_all(&unhex(rest)).and_then(|_| out.flush());
            }
            "err" => {
                let _ = std::io::stderr().lock().write_all(&unhex(rest));
            }
            _ => {}
        }
    }
}

/// The exit code `lpm exec` passes on: the command's own, or 128 + the signal
/// that ended it, as a shell reports it.
fn exit_code(v: &Value) -> i32 {
    if let Some(code) = v.get("code").and_then(Value::as_i64) {
        return code as i32;
    }
    match v.get("signal").and_then(Value::as_i64) {
        Some(signal) => 128 + signal as i32,
        None => 1,
    }
}

pub fn run(ctx: &Ctx, on: &str, words: &[String], as_json: bool) -> Result<(), RunError> {
    let request = json!({ "on": on, "command": command_line(words)? });
    let mut output = Output {
        json: as_json,
        stdout: Vec::new(),
        stderr: Vec::new(),
    };
    let value = control::agent_request(ctx, "agent_exec", request, |p| output.line(p))?;
    control::agent_ok(&value, "the command failed to run")?;
    let code = exit_code(&value);
    if as_json {
        let text = |b: &[u8]| String::from_utf8_lossy(b).into_owned();
        print_json(&json!({
            "ok": true,
            "machine": value["machine"],
            "cwd": value["cwd"],
            "code": code,
            "stdout": text(&output.stdout),
            "stderr": text(&output.stderr),
        }));
    }
    let _ = std::io::stdout().flush();
    std::process::exit(code);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn words(list: &[&str]) -> Vec<String> {
        list.iter().map(|w| w.to_string()).collect()
    }

    #[test]
    fn one_word_is_the_line_as_written() {
        assert_eq!(
            command_line(&words(&["cd app && npm test | tail -5"])).unwrap(),
            "cd app && npm test | tail -5"
        );
    }

    #[test]
    fn several_words_each_stay_whole() {
        assert_eq!(
            command_line(&words(&["git", "commit", "-m", "fix the bug"])).unwrap(),
            "git commit -m 'fix the bug'"
        );
        assert_eq!(
            command_line(&words(&["ls", "-la", "~/Projects", "it's"])).unwrap(),
            "ls -la '~/Projects' 'it'\"'\"'s'"
        );
        assert_eq!(command_line(&words(&["echo", ""])).unwrap(), "echo ''");
    }

    #[test]
    fn nothing_to_run_is_an_error() {
        assert!(command_line(&[]).is_err());
        assert!(command_line(&words(&["  "])).is_err());
    }

    #[test]
    fn the_exit_code_is_the_commands_own() {
        assert_eq!(exit_code(&json!({ "code": 3 })), 3);
        assert_eq!(exit_code(&json!({ "code": 0 })), 0);
        assert_eq!(exit_code(&json!({ "code": null, "signal": 15 })), 143);
        assert_eq!(exit_code(&json!({})), 1);
    }

    #[test]
    fn printed_bytes_come_back_from_hex() {
        assert_eq!(unhex("610aff"), b"a\n\xff");
        assert_eq!(unhex(""), b"");
    }

    #[test]
    fn json_keeps_what_was_printed() {
        let mut out = Output {
            json: true,
            stdout: Vec::new(),
            stderr: Vec::new(),
        };
        out.line("waiting");
        out.line("out 68690a");
        out.line("err 6e6f");
        out.line("tick");
        assert_eq!(out.stdout, b"hi\n");
        assert_eq!(out.stderr, b"no");
    }
}
