//! Why a check failed, for the phone's CI sheet: the step that failed and the
//! last lines it printed, read with `gh run view --log-failed`. Only GitHub
//! Actions keeps a log `gh` can read; any other check opens its own page.
use regex::Regex;
use serde_json::{json, Value};
use std::sync::mpsc::SyncSender;
use std::sync::OnceLock;

/// The phone may send `gitCheckLog`.
pub const FEATURE: &str = "gitCheckLog";
/// How much of a failed step's log the phone gets.
pub(crate) const TAIL: usize = 40;

pub(super) fn handle(out: &SyncSender<String>, v: &Value) {
    let out = out.clone();
    let v = v.clone();
    std::thread::spawn(move || {
        let project = v["project"].as_str().unwrap_or_default().to_string();
        let url = v["url"].as_str().unwrap_or_default().to_string();
        let result = crate::config::project_root(&project).and_then(|(root, _)| read(&root, &url));
        let mut reply = match result {
            Ok(log) => json!({
                "t": "gitCheckLog",
                "project": project,
                "ok": true,
                "step": log.step,
                "lines": log.lines,
                "more": log.more,
            }),
            Err(error) => {
                json!({ "t": "gitCheckLog", "project": project, "ok": false, "error": error })
            }
        };
        reply["url"] = json!(url);
        let _ = out.try_send(reply.to_string());
    });
}

#[derive(Debug, PartialEq)]
pub(crate) struct FailedLog {
    pub step: String,
    pub lines: Vec<String>,
    pub more: bool,
}

/// The run and, when the URL names one, the job: `…/actions/runs/7001/job/42`.
fn ids(url: &str) -> Option<(&str, Option<&str>)> {
    let run = crate::ci_prompt::run_id(url)?;
    let job = url
        .split("/job/")
        .nth(1)
        .map(|rest| {
            rest.split(|c: char| !c.is_ascii_digit())
                .next()
                .unwrap_or_default()
        })
        .filter(|id| !id.is_empty());
    Some((run, job))
}

fn read(root: &str, url: &str) -> Result<FailedLog, String> {
    if let Some(log) = crate::gitlab_ci::failed_log(root, url) {
        return log;
    }
    let (run, job) =
        ids(url).ok_or("This check's log isn't on GitHub Actions. Open it to see what failed.")?;
    let mut args = vec!["run", "view", run, "--log-failed"];
    if let Some(job) = job {
        args.extend(["--job", job]);
    }
    let text = crate::pull_request::gh_out(root, &args)?;
    parse(&text)
        .ok_or_else(|| "GitHub has no log for this check yet. It may still be running.".into())
}

/// Color codes and carriage returns, which a log line on the phone can't show.
pub(crate) fn noise() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\x1b\[[0-9;]*[A-Za-z]|\r").expect("ansi pattern compiles"))
}

fn timestamp() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z ?")
            .expect("timestamp pattern compiles")
    })
}

/// `gh` prints `job<TAB>step<TAB>time text` for every line of each failed step.
/// The last step is the one that failed; its last lines say why.
fn parse(text: &str) -> Option<FailedLog> {
    let mut step = String::new();
    let mut lines: Vec<String> = Vec::new();
    for raw in text.lines() {
        let mut cols = raw.splitn(3, '\t');
        let (Some(_job), Some(name), Some(rest)) = (cols.next(), cols.next(), cols.next()) else {
            continue;
        };
        if name != step {
            step = name.to_string();
            lines.clear();
        }
        let line = timestamp()
            .replace(&noise().replace_all(rest, ""), "")
            .into_owned();
        if line.starts_with("##[group]") || line.starts_with("##[endgroup]") {
            continue;
        }
        lines.push(match line.strip_prefix("##[error]") {
            Some(error) => format!("Error: {error}"),
            None => line,
        });
    }
    while lines.last().is_some_and(|l| l.trim().is_empty()) {
        lines.pop();
    }
    if step.is_empty() || lines.is_empty() {
        return None;
    }
    let more = lines.len() > TAIL;
    let lines = lines.split_off(lines.len().saturating_sub(TAIL));
    Some(FailedLog { step, lines, more })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_run_and_job_from_a_check_url() {
        assert_eq!(
            ids("https://github.com/o/r/actions/runs/7001/job/42?pr=3"),
            Some(("7001", Some("42")))
        );
        assert_eq!(
            ids("https://github.com/o/r/actions/runs/7001"),
            Some(("7001", None))
        );
        assert_eq!(ids("https://vercel.com/o/r"), None);
    }

    #[test]
    fn keeps_the_failed_steps_last_lines_without_times_colours_or_groups() {
        let log = concat!(
            "test\tSet up job\t2026-11-18T10:00:00.1234567Z Runner version 2\n",
            "test\tRun tests\t2026-11-18T10:00:01.0000000Z ##[group]Run npm test\n",
            "test\tRun tests\t2026-11-18T10:00:01.0000000Z ##[endgroup]\n",
            "test\tRun tests\t2026-11-18T10:00:02.0000000Z \x1b[31mFAIL\x1b[39m CheckoutForm.test.tsx\n",
            "test\tRun tests\t2026-11-18T10:00:03.0000000Z   Expected: 41.98\n",
            "test\tRun tests\t2026-11-18T10:00:04.0000000Z ##[error]Process completed with exit code 1.\n",
            "test\tRun tests\t2026-11-18T10:00:04.0000000Z \n",
        );
        assert_eq!(
            parse(log),
            Some(FailedLog {
                step: "Run tests".into(),
                lines: vec![
                    "FAIL CheckoutForm.test.tsx".into(),
                    "  Expected: 41.98".into(),
                    "Error: Process completed with exit code 1.".into(),
                ],
                more: false,
            })
        );
    }

    #[test]
    fn a_long_log_keeps_its_tail() {
        let log: String = (0..100)
            .map(|i| format!("job\tBuild\t2026-11-18T10:00:00Z line {i}\n"))
            .collect();
        let parsed = parse(&log).unwrap();
        assert!(parsed.more);
        assert_eq!(parsed.lines.len(), TAIL);
        assert_eq!(parsed.lines.last().unwrap(), "line 99");
    }

    #[test]
    fn nothing_readable_is_no_log() {
        assert_eq!(parse(""), None);
        assert_eq!(parse("no tabs here\n"), None);
    }
}
