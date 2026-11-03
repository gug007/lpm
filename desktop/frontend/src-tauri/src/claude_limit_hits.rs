//! Hard stops a Claude session runs into: its account's 5-hour or weekly limit,
//! a weekly limit on one model, or the account being put on hold. Claude Code's
//! StopFailure hook already reports a failed turn as an Error status keyed by
//! the session id; why it failed is in the error line Claude Code writes to the
//! session's transcript. A limit keeps new sessions off that account until it
//! resets; a hold pauses switching everywhere, because moving on to another
//! account to get around a hold is exactly what Anthropic's rules forbid. The
//! tab that stopped shows why (claude_limit_stops.rs).
use crate::agent_last_answer::{collect_tail, complete_lines};
use crate::claude_pool_pick::Win;
use crate::claude_pool_store::{self as store, Block};
use serde_json::Value;
use std::path::Path;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

const TAIL_BYTES: u64 = 64 * 1024;
/// The transcript is written asynchronously, so the error line can land a
/// moment after the hook fires.
const READ_DELAYS_MS: [u64; 3] = [300, 1200, 4000];

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Stop {
    Limit {
        window: Win,
        until: i64,
    },
    Hold,
    /// A weekly limit on one model: the account still works with the others.
    Model {
        name: String,
        until: i64,
    },
}

/// What a session's transcript says about its failed turn.
#[derive(Debug, PartialEq)]
enum Read {
    /// A stop, on the account that holds the transcript.
    Stop(String, Stop),
    /// An error that isn't a stop (a server throttle, a usage-credits prompt).
    Other,
    /// The error line isn't written yet.
    NotYet,
    /// Not a transcript this machine can read (a remote project).
    Never,
}

/// Why one failed turn stopped, worked out once: the hook's own thread and the
/// notifications about that turn all ask, the first to ask reads the
/// transcript, and the others wait for its answer.
struct Verdict {
    project: String,
    sid: String,
    pane: String,
    once: OnceLock<()>,
}

impl Verdict {
    fn settle(&self) {
        self.once.get_or_init(|| {
            for delay in READ_DELAYS_MS {
                std::thread::sleep(Duration::from_millis(delay));
                match read_stop(&self.project, &self.sid) {
                    Read::Stop(account, stop) => {
                        record(&account, &stop);
                        crate::claude_limit_stops::add(
                            &self.project,
                            &self.pane,
                            &self.sid,
                            &account,
                            stop,
                        );
                        return;
                    }
                    Read::Other | Read::Never => return,
                    Read::NotYet => {}
                }
            }
        });
    }
}

static VERDICTS: Mutex<Vec<Arc<Verdict>>> = Mutex::new(Vec::new());

fn verdicts() -> std::sync::MutexGuard<'static, Vec<Arc<Verdict>>> {
    VERDICTS.lock().unwrap_or_else(|e| e.into_inner())
}

/// Called for every Error status. Only a Claude session key leads anywhere,
/// and only while switching is on: with it off nothing is recorded, so turning
/// it on later never starts from an old event. `pane_id` is the tab the stop
/// shows on, empty when the report isn't the tab's own agent.
pub fn on_error_status(project: &str, key: &str, pane_id: &str) {
    let Some(sid) = key.strip_prefix(crate::agentkind::AgentKind::Claude.key_prefix()) else {
        return;
    };
    if !crate::socketsrv::valid_session_id(sid) || !crate::claude_pool::active(&store::load()) {
        return;
    }
    let verdict = Arc::new(Verdict {
        project: project.to_string(),
        sid: sid.to_string(),
        pane: pane_id.to_string(),
        once: OnceLock::new(),
    });
    {
        let mut all = verdicts();
        all.retain(|v| v.sid != sid);
        all.push(verdict.clone());
    }
    std::thread::spawn(move || {
        verdict.settle();
        verdicts().retain(|v| !Arc::ptr_eq(v, &verdict));
    });
}

/// Wait until the turn `sid` just failed is known to have stopped or not.
/// Blocks a few seconds at most, so keep it off any thread someone waits on.
pub(crate) fn await_verdict(sid: &str) {
    let pending = verdicts().iter().find(|v| v.sid == sid).cloned();
    if let Some(verdict) = pending {
        verdict.settle();
    }
}

fn read_stop(project: &str, sid: &str) -> Read {
    let Ok(info) = crate::config::spawn_info(project) else {
        return Read::Never;
    };
    if info.is_remote {
        return Read::Never;
    }
    let Some((account, path)) = crate::claude_dirs::find_transcript(&info.root, sid) else {
        return Read::NotYet;
    };
    match last_error(&path) {
        Some(line) => classify(&line).map_or(Read::Other, |stop| Read::Stop(account.id, stop)),
        None => Read::NotYet,
    }
}

/// The transcript's newest reply, when it is an API error.
fn last_error(transcript: &Path) -> Option<Value> {
    collect_tail(transcript, TAIL_BYTES, 1, newest_reply)
        .ok()?
        .into_iter()
        .next()
        .filter(|line| line.get("isApiErrorMessage").and_then(Value::as_bool) == Some(true))
}

/// Whether the conversation in `transcript` ended its last turn at its
/// account's 5-hour or weekly limit.
pub(crate) fn stopped_at_limit(transcript: &Path) -> bool {
    matches!(
        last_error(transcript).and_then(|line| classify(&line)),
        Some(Stop::Limit { .. })
    )
}

/// The newest assistant line: a stop counts only if it is the latest thing the
/// session said, not an old error further up.
fn newest_reply(window: &str, _want: usize) -> Vec<Value> {
    complete_lines(window)
        .rev()
        .filter(|l| l.contains("\"type\":\"assistant\""))
        .find_map(|l| serde_json::from_str::<Value>(l).ok())
        .into_iter()
        .collect()
}

/// The stop an API error line reports, if any.
fn classify(line: &Value) -> Option<Stop> {
    let error = line.get("error").and_then(Value::as_str).unwrap_or("");
    let api = line.get("apiError").and_then(Value::as_str).unwrap_or("");
    if error == "account_on_hold" || api.contains("on_hold") {
        return Some(Stop::Hold);
    }
    // Newer Claude Code names the error "usage_limit_reached"; earlier
    // versions write only `error: rate_limit` with a rejected quota block.
    // Any other apiError (a server throttle, a usage-credits prompt) is not a
    // spent account.
    if !api.is_empty() && api != "usage_limit_reached" {
        return None;
    }
    if api.is_empty() && error != "rate_limit" {
        return None;
    }
    let info = line
        .pointer("/apiErrorParams/rate_limit_info")
        .or_else(|| line.get("quotaLimits"))?;
    if info
        .get("status")
        .and_then(Value::as_str)
        .is_some_and(|s| s != "rejected")
    {
        return None;
    }
    let until = info.get("resetsAt").and_then(Value::as_i64).unwrap_or(0);
    match info.get("rateLimitType").and_then(Value::as_str)? {
        "five_hour" => Some(Stop::Limit {
            window: Win::FiveHour,
            until,
        }),
        "seven_day" => Some(Stop::Limit {
            window: Win::Weekly,
            until,
        }),
        // Per-model weekly limits leave the account usable with another model,
        // so they don't move sessions to another account.
        other => model_name(other).map(|name| Stop::Model { name, until }),
    }
}

fn model_name(limit: &str) -> Option<String> {
    let name = match limit.strip_prefix("seven_day_")? {
        "opus" => "Opus",
        "sonnet" => "Sonnet",
        "haiku" => "Haiku",
        "fable" => "Fable",
        _ => return None,
    };
    Some(name.to_string())
}

fn record(account: &str, stop: &Stop) {
    let account = account.to_string();
    let result = store::update(|f| match stop {
        Stop::Limit { until, .. } if *until > 0 => {
            f.blocked.insert(
                account.clone(),
                Block {
                    kind: "limit".into(),
                    until: *until,
                },
            );
        }
        Stop::Limit { .. } | Stop::Model { .. } => {}
        Stop::Hold => {
            f.blocked.insert(
                account.clone(),
                Block {
                    kind: "hold".into(),
                    until: 0,
                },
            );
            f.held = Some(account.clone());
        }
    });
    if matches!(result, Ok((_, true))) {
        crate::claude_pool::refresh();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_weekly_limit_stops_the_account_until_it_resets() {
        let line = json!({
            "type": "assistant", "isApiErrorMessage": true, "error": "rate_limit",
            "apiError": "usage_limit_reached",
            "apiErrorParams": {"rate_limit_info": {"status": "rejected", "resetsAt": 1791507600, "rateLimitType": "seven_day"}},
        });
        assert_eq!(
            classify(&line),
            Some(Stop::Limit {
                window: Win::Weekly,
                until: 1791507600
            })
        );
    }

    #[test]
    fn falls_back_to_the_quota_block() {
        let line = json!({
            "isApiErrorMessage": true, "error": "rate_limit", "apiError": "usage_limit_reached",
            "quotaLimits": {"resetsAt": 5, "rateLimitType": "five_hour"},
        });
        assert_eq!(
            classify(&line),
            Some(Stop::Limit {
                window: Win::FiveHour,
                until: 5
            })
        );
    }

    #[test]
    fn a_model_limit_names_the_model_and_leaves_the_account() {
        let opus = json!({
            "isApiErrorMessage": true, "error": "rate_limit", "apiError": "usage_limit_reached",
            "apiErrorParams": {"rate_limit_info": {"resetsAt": 5, "rateLimitType": "seven_day_opus"}},
        });
        assert_eq!(
            classify(&opus),
            Some(Stop::Model {
                name: "Opus".into(),
                until: 5
            })
        );
        let other = json!({
            "isApiErrorMessage": true, "error": "rate_limit", "apiError": "usage_limit_reached",
            "apiErrorParams": {"rate_limit_info": {"resetsAt": 5, "rateLimitType": "seven_day_oauth_apps"}},
        });
        assert_eq!(classify(&other), None);
    }

    #[test]
    fn server_throttling_is_an_error_but_not_a_stop() {
        let busy =
            json!({"isApiErrorMessage": true, "error": "rate_limit", "apiError": "rate_limited"});
        assert_eq!(classify(&busy), None);
        assert_eq!(classify(&json!({"type": "assistant"})), None);
    }

    #[test]
    fn reads_the_older_shape_without_an_api_error_name() {
        let line = json!({
            "type": "assistant", "isApiErrorMessage": true, "error": "rate_limit", "apiErrorStatus": 429,
            "quotaLimits": {"status": "rejected", "resetsAt": 1791507600, "rateLimitType": "five_hour"},
        });
        assert_eq!(
            classify(&line),
            Some(Stop::Limit {
                window: Win::FiveHour,
                until: 1791507600
            })
        );
        let warned = json!({
            "isApiErrorMessage": true, "error": "rate_limit",
            "quotaLimits": {"status": "allowed_warning", "resetsAt": 5, "rateLimitType": "five_hour"},
        });
        assert_eq!(classify(&warned), None);
    }

    #[test]
    fn a_transcript_that_ended_at_a_limit_says_so() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("s.jsonl");
        let user = r#"{"type":"user","message":"hi"}"#;
        let weekly = r#"{"type":"assistant","isApiErrorMessage":true,"error":"rate_limit","apiError":"usage_limit_reached","apiErrorParams":{"rate_limit_info":{"status":"rejected","resetsAt":5,"rateLimitType":"seven_day"}}}"#;
        let opus = weekly.replace("\"seven_day\"", "\"seven_day_opus\"");
        std::fs::write(&path, format!("{user}\n{weekly}\n")).unwrap();
        assert!(stopped_at_limit(&path));
        std::fs::write(&path, format!("{user}\n{opus}\n")).unwrap();
        assert!(!stopped_at_limit(&path));
        std::fs::write(
            &path,
            format!("{weekly}\n{user}\n{{\"type\":\"assistant\"}}\n"),
        )
        .unwrap();
        assert!(!stopped_at_limit(&path));
    }

    #[test]
    fn a_hold_is_recognised() {
        let line = json!({"isApiErrorMessage": true, "error": "account_on_hold"});
        assert_eq!(classify(&line), Some(Stop::Hold));
    }

    #[test]
    fn only_the_newest_reply_counts() {
        let window = concat!(
            r#"{"type":"assistant","isApiErrorMessage":true,"error":"account_on_hold"}"#,
            "\n",
            r#"{"type":"user","message":"hi"}"#,
            "\n",
            r#"{"type":"assistant","message":{"content":[]}}"#,
            "\n"
        );
        let newest = newest_reply(window, 1);
        assert_eq!(newest.len(), 1);
        assert_eq!(classify(&newest[0]), None);
    }
}
