//! Hard stops a Claude session runs into: its account's 5-hour or weekly limit,
//! or the account being put on hold. Claude Code's StopFailure hook already
//! reports a failed turn as an Error status keyed by the session id; why it
//! failed is in the error line Claude Code writes to the session's transcript.
//! A limit keeps new sessions off that account until it resets; a hold pauses
//! switching everywhere, because moving on to another account to get around a
//! hold is exactly what Anthropic's rules forbid.
use crate::agent_last_answer::{collect_tail, complete_lines};
use crate::claude_pool_store::{self as store, Block};
use serde_json::Value;
use std::time::Duration;

const TAIL_BYTES: u64 = 64 * 1024;
/// The transcript is written asynchronously, so the error line can land a
/// moment after the hook fires.
const READ_DELAYS_MS: [u64; 3] = [300, 1200, 4000];

#[derive(Debug, PartialEq)]
enum Stop {
    Limit { until: i64 },
    Hold,
}

/// Called for every Error status. Only a Claude session key leads anywhere,
/// and only while switching is on: with it off nothing is recorded, so turning
/// it on later never starts from an old event.
pub fn on_error_status(project: &str, key: &str) {
    let Some(sid) = key.strip_prefix("claude_code_") else {
        return;
    };
    if !crate::socketsrv::valid_session_id(sid) || !crate::claude_pool::active(&store::load()) {
        return;
    }
    let (project, sid) = (project.to_string(), sid.to_string());
    std::thread::spawn(move || {
        for delay in READ_DELAYS_MS {
            std::thread::sleep(Duration::from_millis(delay));
            if let Some((account, stop)) = read_stop(&project, &sid) {
                record(&account, stop);
                return;
            }
        }
    });
}

fn read_stop(project: &str, sid: &str) -> Option<(String, Stop)> {
    let info = crate::config::spawn_info(project).ok()?;
    if info.is_remote {
        return None;
    }
    let (account, path) = crate::claude_dirs::find_transcript(&info.root, sid)?;
    let last = collect_tail(&path, TAIL_BYTES, 1, newest_reply)
        .ok()?
        .into_iter()
        .next()?;
    classify(&last).map(|stop| (account.id, stop))
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

fn classify(line: &Value) -> Option<Stop> {
    if line.get("isApiErrorMessage").and_then(Value::as_bool) != Some(true) {
        return None;
    }
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
    // Per-model weekly limits (Opus, Sonnet, Fable) leave the account usable
    // with another model, so they don't move sessions to another account.
    match info.get("rateLimitType").and_then(Value::as_str)? {
        "five_hour" | "seven_day" => Some(Stop::Limit {
            until: info.get("resetsAt").and_then(Value::as_i64).unwrap_or(0),
        }),
        _ => None,
    }
}

fn record(account: &str, stop: Stop) {
    let account = account.to_string();
    let result = store::update(|f| match stop {
        Stop::Limit { until } if until > 0 => {
            f.blocked.insert(
                account.clone(),
                Block {
                    kind: "limit".into(),
                    until,
                },
            );
        }
        Stop::Limit { .. } => {}
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
        assert_eq!(classify(&line), Some(Stop::Limit { until: 1791507600 }));
    }

    #[test]
    fn falls_back_to_the_quota_block() {
        let line = json!({
            "isApiErrorMessage": true, "error": "rate_limit", "apiError": "usage_limit_reached",
            "quotaLimits": {"resetsAt": 5, "rateLimitType": "five_hour"},
        });
        assert_eq!(classify(&line), Some(Stop::Limit { until: 5 }));
    }

    #[test]
    fn model_limits_and_server_throttling_are_not_account_stops() {
        let opus = json!({
            "isApiErrorMessage": true, "error": "rate_limit", "apiError": "usage_limit_reached",
            "apiErrorParams": {"rate_limit_info": {"resetsAt": 5, "rateLimitType": "seven_day_opus"}},
        });
        assert_eq!(classify(&opus), None);
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
        assert_eq!(classify(&line), Some(Stop::Limit { until: 1791507600 }));
        let warned = json!({
            "isApiErrorMessage": true, "error": "rate_limit",
            "quotaLimits": {"status": "allowed_warning", "resetsAt": 5, "rateLimitType": "five_hour"},
        });
        assert_eq!(classify(&warned), None);
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
